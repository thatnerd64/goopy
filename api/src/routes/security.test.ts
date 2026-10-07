import { AddressInfo } from "net";

import express from "express";
import jwt from "jsonwebtoken";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { tmp } = await vi.hoisted(async () => {
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  return { tmp: fs.mkdtempSync(path.join(os.tmpdir(), "tidarr-sec-")) };
});

vi.mock("../../constants", () => ({
  CONFIG_PATH: tmp,
  PROCESSING_PATH: `${tmp}/.processing`,
  NZB_DOWNLOAD_PATH: `${tmp}/nzb`,
  TIDAL_API_URL: "https://api.tidal.com",
}));
vi.mock("../services/api-key", () => ({
  getOrCreateApiKey: () => "the-api-key",
}));
vi.mock("../services/playback", () => ({
  getPlaybackInfo: vi.fn(async () => ["https://audio.example.com/track.flac"]),
}));
vi.mock("../helpers/get_tiddl_config", () => ({
  get_tiddl_config: () => ({
    config: { auth: { token: "tidal-token", country_code: "US" } },
    errors: [],
  }),
}));

import { setAppInstance } from "../helpers/app-instance";
import { ensureAccessIsGranted } from "../helpers/auth";
import {
  buildCorsMiddleware,
  parseTrustProxy,
  securityHeaders,
} from "../helpers/http-security";
import { signUrl } from "../helpers/signature";
import { passwordFingerprint } from "../services/auth";

import authRouter from "./auth";
import playbackRouter from "./playback";
import tomlRouter from "./tiddl-toml";

const PASSWORD = "correct horse battery staple";
const SECRET = "test-jwt-secret";

let server: ReturnType<typeof express.application.listen>;
let base: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const app = express();
  setAppInstance(app);
  app.set("trust proxy", true); // let tests choose the client IP with X-Forwarded-For
  app.use(securityHeaders);
  app.use(express.json());
  app.use("/api", authRouter);
  app.use("/api", playbackRouter);
  app.use("/api", tomlRouter);
  app.get("/protected", ensureAccessIsGranted, (_req, res) => {
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

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.JWT_SECRET = SECRET;
  delete process.env.OIDC_ISSUER;
  vi.stubGlobal("fetch", (url: unknown, init?: RequestInit) =>
    String(url).startsWith(base)
      ? realFetch(url as string, init)
      : Promise.resolve(
          new Response("audio-bytes", {
            status: 200,
            headers: { "content-type": "audio/flac" },
          }),
        ),
  );
});

const login = (password: string, ip = "10.0.0.1") =>
  realFetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ password }),
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  realFetch(`${base}${path}`, { headers });

describe("login and tokens", () => {
  it("issues a token that does not contain the password", async () => {
    const res = await login(PASSWORD);
    expect(res.status).toBe(200);
    const { token } = await res.json();

    const payload = jwt.decode(token) as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toContain(PASSWORD);
    expect(payload.tidarrPasswd).toBeUndefined();
    expect(payload.tidarrPwd).toBe(passwordFingerprint(PASSWORD, SECRET));
    // Base64 of the whole token must not leak it either
    expect(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    ).not.toContain(PASSWORD);

    expect(
      (await get("/protected", { Authorization: `Bearer ${token}` })).status,
    ).toBe(200);
  });

  it("rejects a wrong password", async () => {
    expect((await login("nope", "10.0.0.2")).status).toBe(401);
  });

  it("rejects the legacy token that embedded the plaintext password", async () => {
    const legacy = jwt.sign({ tidarrPasswd: PASSWORD }, SECRET);
    const res = await get("/protected", { Authorization: `Bearer ${legacy}` });
    expect(res.status).toBe(403);
  });

  it("invalidates tokens when the password changes", async () => {
    const { token } = await (await login(PASSWORD, "10.0.0.3")).json();
    process.env.ADMIN_PASSWORD = "another password";
    expect(
      (await get("/protected", { Authorization: `Bearer ${token}` })).status,
    ).toBe(403);
  });

  it("rejects tokens signed with another secret or algorithm", async () => {
    const forged = jwt.sign(
      { tidarrPwd: passwordFingerprint(PASSWORD, "x") },
      "x",
    );
    expect(
      (await get("/protected", { Authorization: `Bearer ${forged}` })).status,
    ).toBe(403);

    const hs512 = jwt.sign(
      { tidarrPwd: passwordFingerprint(PASSWORD, SECRET) },
      SECRET,
      {
        algorithm: "HS512",
      },
    );
    expect(
      (await get("/protected", { Authorization: `Bearer ${hs512}` })).status,
    ).toBe(403);

    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ tidarrPwd: passwordFingerprint(PASSWORD, SECRET) }),
    ).toString("base64url")}.`;
    expect(
      (await get("/protected", { Authorization: `Bearer ${none}` })).status,
    ).toBe(403);
  });

  it("requires a token when a password is configured", async () => {
    expect((await get("/protected")).status).toBe(403);
  });

  it("accepts the API key and rejects a wrong one", async () => {
    expect(
      (await get("/protected", { "X-Api-Key": "the-api-key" })).status,
    ).toBe(200);
    expect((await get("/protected?apikey=the-api-key")).status).toBe(200);
    expect((await get("/protected", { "X-Api-Key": "wrong" })).status).toBe(
      403,
    );
  });

  it("lets everything through when no authentication is configured", async () => {
    delete process.env.ADMIN_PASSWORD;
    expect((await get("/protected")).status).toBe(200);
  });
});

describe("login rate limit", () => {
  it("blocks an IP after 10 failures, then only that IP", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 10; i++) {
      expect((await login("bad", ip)).status).toBe(401);
    }

    const blocked = await login(PASSWORD, ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    // Another client is unaffected
    expect((await login(PASSWORD, "10.9.9.10")).status).toBe(200);
  });
});

describe("stream signing", () => {
  const sign = (id: string, headers: Record<string, string> = {}) =>
    get(`/api/stream/sign/${id}`, headers);

  it("requires a login to get a signed URL", async () => {
    expect((await sign("123")).status).toBe(403);

    const { token } = await (await login(PASSWORD, "10.1.1.1")).json();
    const res = await sign("123", { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(
      /^\/api\/stream\/play\/123\?exp=\d+&sig=[0-9a-f]{64}$/,
    );
  });

  it("plays a freshly signed URL", async () => {
    const { token } = await (await login(PASSWORD, "10.1.1.2")).json();
    const { url } = await (
      await sign("123", { Authorization: `Bearer ${token}` })
    ).json();

    const res = await get(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("audio-bytes");
  });

  it("refuses a non-numeric track id (path injection into the Tidal URL)", async () => {
    const { token } = await (await login(PASSWORD, "10.1.1.3")).json();
    expect(
      (await sign("..%2F..%2Fusers", { Authorization: `Bearer ${token}` }))
        .status,
    ).toBe(400);
    expect(
      (await sign("12abc", { Authorization: `Bearer ${token}` })).status,
    ).toBe(400);
  });

  const exp = () => Math.floor(Date.now() / 1000) + 60;

  it("refuses a bad signature", async () => {
    expect(
      (await get(`/api/stream/play/123?exp=${exp()}&sig=${"0".repeat(64)}`))
        .status,
    ).toBe(403);
    expect((await get(`/api/stream/play/123?exp=${exp()}&sig=zz`)).status).toBe(
      403,
    );
  });

  it("refuses a signature made for another track", async () => {
    const e = exp();
    expect(
      (await get(`/api/stream/play/124?exp=${e}&sig=${signUrl("123", e)}`))
        .status,
    ).toBe(403);
  });

  it("refuses an expired URL", async () => {
    const e = Math.floor(Date.now() / 1000) - 10;
    const res = await get(
      `/api/stream/play/123?exp=${e}&sig=${signUrl("123", e)}`,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("URL expired");
  });

  it("refuses a non-numeric or far-future expiry (NaN used to skip the expiry check)", async () => {
    expect(
      (await get("/api/stream/play/123?exp=NaN&sig=" + "0".repeat(64))).status,
    ).toBe(403);
    expect(
      (await get("/api/stream/play/123?exp=abc&sig=" + "0".repeat(64))).status,
    ).toBe(403);

    const far = Math.floor(Date.now() / 1000) + 10 * 24 * 3600;
    expect(
      (await get(`/api/stream/play/123?exp=${far}&sig=${signUrl("123", far)}`))
        .status,
    ).toBe(403);
  });

  it("does not sign with a hardcoded secret", async () => {
    // The previous implementation signed with the literal "supersecret"
    const crypto = await import("crypto");
    const e = exp();
    const legacy = crypto
      .createHmac("sha256", "supersecret")
      .update(`123:${e}`)
      .digest("hex");
    delete process.env.JWT_SECRET;
    expect(
      (await get(`/api/stream/play/123?exp=${e}&sig=${legacy}`)).status,
    ).toBe(403);
  });

  it("reads JWT_SECRET at call time, not at import time", () => {
    process.env.JWT_SECRET = "a";
    const a = signUrl("1", 100);
    process.env.JWT_SECRET = "b";
    expect(signUrl("1", 100)).not.toBe(a);
  });
});

describe("tiddl config save", () => {
  const save = (toml: unknown) =>
    realFetch(`${base}/api/tiddl/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toml }),
    });

  const authed = async () => {
    delete process.env.ADMIN_PASSWORD;
  };

  beforeEach(authed);

  it("refuses invalid TOML instead of breaking the config", async () => {
    const fs = await import("fs");
    const res = await save("[download\ntrack_quality = ");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid TOML/);
    expect(fs.existsSync(`${tmp}/.tiddl/config.toml`)).toBe(false);
  });

  it("saves valid TOML and only answers once it is written", async () => {
    const fs = await import("fs");
    const content = '[download]\ntrack_quality = "max"\n';
    const res = await save(content);
    expect(res.status).toBe(200);
    expect(fs.readFileSync(`${tmp}/.tiddl/config.toml`, "utf-8")).toBe(content);
  });
});

describe("http security helpers", () => {
  it("adds security headers", async () => {
    const res = await get("/protected");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("disables CORS by default and parses the allow-list", () => {
    expect(buildCorsMiddleware(undefined)).toBeNull();
    expect(buildCorsMiddleware("")).toBeNull();
    expect(buildCorsMiddleware("*")).toBeTypeOf("function");
    expect(
      buildCorsMiddleware('"https://a.example, https://b.example/"'),
    ).toBeTypeOf("function");
  });

  it("parses TRUST_PROXY", () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy("false")).toBeUndefined();
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("loopback")).toBe("loopback");
  });
});
