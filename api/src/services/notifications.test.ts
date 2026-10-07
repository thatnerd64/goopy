import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProcessingItemType } from "../types";

vi.mock("../processing/utils/logs", () => ({ logs: vi.fn() }));

import { appriseApiPush } from "./apprise-api";
import { gotifyPush } from "./gotify";
import { ntfyPush } from "./ntfy";
import { hookPushOver } from "./pushover";

const HOSTILE = `$(touch /tmp/pwned) \`id\` "quoted" 'single' ; rm -rf / \\ é`;

const item = {
  id: "123",
  type: "album",
  title: HOSTILE,
  artist: HOSTILE,
} as ProcessingItemType;

const fetchMock = vi.fn();
const ENV_KEYS = [
  "NTFY_URL",
  "NTFY_TOPIC",
  "NTFY_TOKEN",
  "NTFY_PRIORITY",
  "GOTIFY_URL",
  "GOTIFY_TOKEN",
  "PUSH_OVER_URL",
  "APPRISE_API_ENDPOINT",
  "APPRISE_API_TAG",
] as const;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

const expectedMessage = `${HOSTILE} - ${HOSTILE} added to music library`;

describe("notifications", () => {
  it("ntfy sends the hostile text verbatim in the body", async () => {
    process.env.NTFY_URL = "https://ntfy.example.com/";
    process.env.NTFY_TOPIC = "my topic";
    process.env.NTFY_TOKEN = "tk_secret";
    process.env.NTFY_PRIORITY = "4";

    await ntfyPush(item);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ntfy.example.com/my%20topic");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(expectedMessage);
    expect(init.headers).toEqual({
      Title: "New album added",
      Priority: "4",
      Authorization: "Bearer tk_secret",
    });
  });

  it("ntfy ignores an invalid priority", async () => {
    process.env.NTFY_URL = "https://ntfy.example.com";
    process.env.NTFY_TOPIC = "t";
    process.env.NTFY_PRIORITY = '3" -H "X: injected';

    await ntfyPush(item);

    expect(fetchMock.mock.calls[0][1].headers.Priority).toBe("3");
  });

  it("gotify posts a multipart form", async () => {
    process.env.GOTIFY_URL = "https://gotify.example.com";
    process.env.GOTIFY_TOKEN = "a b&c";

    await gotifyPush(item);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gotify.example.com/message?token=a%20b%26c");
    const form = init.body as FormData;
    expect(form.get("title")).toBe("New album added");
    expect(form.get("message")).toBe(expectedMessage);
    expect(form.get("priority")).toBe("5");
  });

  it("pushover webhook posts JSON", async () => {
    process.env.PUSH_OVER_URL = "https://hooks.example.com/secret-path";

    await hookPushOver(item);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/secret-path");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      text: `New album added\r\n${expectedMessage}`,
    });
  });

  it("apprise posts JSON with the tag", async () => {
    process.env.APPRISE_API_ENDPOINT = "https://apprise.example.com/notify/k";
    process.env.APPRISE_API_TAG = "music";

    await appriseApiPush(item);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      body: expectedMessage,
      title: "New album added",
      tag: "music",
    });
  });

  it("does nothing when a service is not configured", async () => {
    await ntfyPush(item);
    await gotifyPush(item);
    await hookPushOver(item);
    await appriseApiPush(item);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not log tokens or secret URLs", async () => {
    const log = vi.spyOn(console, "log");
    process.env.GOTIFY_URL = "https://gotify.example.com";
    process.env.GOTIFY_TOKEN = "SUPERSECRETTOKEN";
    process.env.PUSH_OVER_URL = "https://hooks.example.com/SECRETPATH";
    process.env.APPRISE_API_ENDPOINT = "https://apprise.example.com/SECRETKEY";

    await gotifyPush(item);
    await hookPushOver(item);
    await appriseApiPush(item);

    const logged = log.mock.calls.flat().join("\n");
    expect(logged).not.toContain("SUPERSECRETTOKEN");
    expect(logged).not.toContain("SECRETPATH");
    expect(logged).not.toContain("SECRETKEY");
  });

  it("reports an HTTP error instead of swallowing it", async () => {
    const { logs } = await import("../processing/utils/logs");
    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));
    process.env.NTFY_URL = "https://ntfy.example.com";
    process.env.NTFY_TOPIC = "t";

    await ntfyPush(item);

    expect(logs).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("HTTP 401"),
    );
  });
});
