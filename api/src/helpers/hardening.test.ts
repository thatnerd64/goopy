import fs from "fs";
import { AddressInfo } from "net";
import os from "os";
import path from "path";

import express from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { safePlaylistTitle } from "../processing/utils/favorite-tracks-to-playlist";
import { frontendUrlFromRedirectUri } from "../routes/oidc";
import { withoutCredentials } from "../services/config";
import { isOidcUserAllowed } from "../services/oidc";
import { TiddlConfig } from "../types";

import { toPublicTiddlConfig } from "./get_tiddl_config";
import { rejectCrossSiteRequests, requireJsonBody } from "./http-security";
import { ensureJwtSecret } from "./jwt-secret";
import { toQueueItem } from "./validation";

describe("settings response", () => {
  it("never sends the Tidal tokens to the browser", () => {
    const config = {
      download: { track_quality: "max" },
      auth: {
        token: "access-token",
        refresh_token: "refresh-token",
        expires: 1,
        expires_at: 2,
        user_id: "42",
        country_code: "FR",
      },
    } as unknown as TiddlConfig;

    const pub = toPublicTiddlConfig(config);
    expect(JSON.stringify(pub)).not.toContain("access-token");
    expect(JSON.stringify(pub)).not.toContain("refresh-token");
    expect(pub?.auth).toEqual({
      user_id: "42",
      country_code: "FR",
      expires_at: 2,
    });
    expect(pub?.download).toEqual({ track_quality: "max" });
  });

  it("hides credentials embedded in URLs", () => {
    expect(withoutCredentials(undefined)).toBe("");
    expect(withoutCredentials("http://plex:32400")).toBe("http://plex:32400");
    expect(withoutCredentials("https://user:pass@apprise.lan/notify")).toBe(
      "https://****:****@apprise.lan/notify",
    );
    expect(withoutCredentials("not a url")).toBe("not a url");
  });
});

describe("OIDC allow-list", () => {
  afterEach(() => {
    delete process.env.OIDC_ALLOWED_EMAILS;
    delete process.env.OIDC_ALLOWED_SUBS;
    delete process.env.OIDC_ALLOWED_GROUPS;
  });

  it("allows everyone when no list is set", () => {
    expect(isOidcUserAllowed({ sub: "anyone" })).toBe(true);
  });

  it("matches subs, verified emails (case-insensitive) and groups", () => {
    process.env.OIDC_ALLOWED_EMAILS = "Me@Example.com, other@example.com";
    process.env.OIDC_ALLOWED_SUBS = "sub-1";
    process.env.OIDC_ALLOWED_GROUPS = "tidarr-admins";

    expect(isOidcUserAllowed({ sub: "sub-1" })).toBe(true);
    expect(isOidcUserAllowed({ sub: "x", email: "me@example.com" })).toBe(true);
    expect(
      isOidcUserAllowed({
        sub: "x",
        email: "me@example.com",
        email_verified: false,
      }),
    ).toBe(false);
    expect(
      isOidcUserAllowed({ sub: "x", groups: ["users", "tidarr-admins"] }),
    ).toBe(true);
    expect(isOidcUserAllowed({ sub: "x", email: "stranger@example.com" })).toBe(
      false,
    );
    expect(isOidcUserAllowed({ sub: "x", groups: "tidarr-admins" })).toBe(
      false,
    );
  });

  it("sends the browser back to the public URL, keeping https and sub-path", () => {
    expect(
      frontendUrlFromRedirectUri(
        "https://tidarr.example.com/api/auth/oidc/callback",
      ),
    ).toBe("https://tidarr.example.com/");
    expect(
      frontendUrlFromRedirectUri(
        "https://example.com/tidarr/api/auth/oidc/callback",
      ),
    ).toBe("https://example.com/tidarr/");
  });
});

describe("queued item from /api/save", () => {
  it("keeps only client-settable fields", () => {
    const item = toQueueItem(
      {
        id: "123",
        type: "album",
        status: "finished",
        url: "https://tidal.com/album/123",
        title: "Title",
        artist: "Artist",
        quality: "high",
        atmosFilter: "none",
        explicit: true,
        playlistId: "a-real-playlist-uuid",
        source: "lidarr",
        retryCount: 99,
      },
      "max",
    );
    expect(item).toEqual({
      id: "123",
      artist: "Artist",
      title: "Title",
      type: "album",
      status: "queue_download",
      quality: "high",
      atmosFilter: "none",
      explicit: true,
      source: "lidarr",
      url: "https://tidal.com/album/123",
      loading: true,
      error: false,
    });
  });

  it("drops an unknown source", () => {
    expect(
      toQueueItem({ id: "1", type: "track", source: "evil" }, "max"),
    ).not.toHaveProperty("source");
  });

  it("falls back to the server quality", () => {
    expect(toQueueItem({ id: "1", type: "track" }, "max").quality).toBe("max");
  });
});

describe("favorite tracks playlist title", () => {
  it("cannot escape the library folder", () => {
    expect(safePlaylistTitle("../../../../etc/x")).toBe("_.._.._.._etc_x");
    expect(safePlaylistTitle("..")).toBe("Favorite Tracks");
    expect(safePlaylistTitle("a\\b/c")).toBe("a_b_c");
    expect(safePlaylistTitle(undefined)).toBe("Favorite Tracks");
    expect(safePlaylistTitle("My Favorites")).toBe("My Favorites");
  });
});

describe("JWT secret", () => {
  const saved = process.env.JWT_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = saved;
  });

  it("keeps an explicit JWT_SECRET", () => {
    process.env.JWT_SECRET = "from-env";
    ensureJwtSecret(path.join(os.tmpdir(), "never-written"));
    expect(process.env.JWT_SECRET).toBe("from-env");
  });

  it("generates a strong secret once and reuses it after a restart", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tidarr-jwt-"));
    const file = path.join(dir, ".tidarr-jwt-secret");

    delete process.env.JWT_SECRET;
    ensureJwtSecret(file);
    const first = process.env.JWT_SECRET;
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    delete process.env.JWT_SECRET;
    ensureJwtSecret(file);
    expect(process.env.JWT_SECRET).toBe(first);
  });
});

describe("CSRF protection", () => {
  let server: ReturnType<typeof express.application.listen>;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(rejectCrossSiteRequests("https://allowed.example"));
    app.use(requireJsonBody);
    app.post("/write", (_req, res) => {
      res.json({ ok: true });
    });
    app.get("/read", (_req, res) => {
      res.json({ ok: true });
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  const post = (headers: Record<string, string>, body?: string) =>
    fetch(`${base}/write`, { method: "POST", headers, body });

  it("refuses cross-site writes from a browser", async () => {
    expect(
      (
        await post({
          "Sec-Fetch-Site": "cross-site",
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        })
      ).status,
    ).toBe(403);
    expect(
      (await post({ "Sec-Fetch-Site": "same-site", Origin: "http://lan:1" }))
        .status,
    ).toBe(403);
  });

  it("allows same-origin, server-to-server and CORS_ORIGIN requests", async () => {
    expect(
      (
        await post(
          {
            "Sec-Fetch-Site": "same-origin",
            "Content-Type": "application/json",
          },
          "{}",
        )
      ).status,
    ).toBe(200);
    expect((await post({})).status).toBe(200);
    expect(
      (
        await post({
          "Sec-Fetch-Site": "cross-site",
          Origin: "https://allowed.example",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${base}/read`, {
          headers: { "Sec-Fetch-Site": "cross-site" },
        })
      ).status,
    ).toBe(200);
  });

  it("refuses the body types an HTML form can send", async () => {
    for (const type of [
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "text/plain",
    ]) {
      expect((await post({ "Content-Type": type }, "a=b")).status).toBe(415);
    }
    // Body-less JSON POST (sent by the web interface) is fine
    expect(
      (await post({ "Content-Type": "application/json; charset=utf-8" }))
        .status,
    ).toBe(200);
  });
});
