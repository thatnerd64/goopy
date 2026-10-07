import fs from "fs";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { root, processing, appLocals, started } = await vi.hoisted(async () => {
  const nodeFs = await import("fs");
  const nodeOs = await import("os");
  const nodePath = await import("path");
  const root = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), "tidarr-cooldown-"),
  );
  return {
    root,
    processing: nodePath.join(root, ".processing"),
    appLocals: {} as Record<string, unknown>,
    // When each download started (ms), in order
    started: [] as { id: string; at: number }[],
  };
});

// How many songs each fake download writes, by item id
const songsByItem: Record<string, number> = {};

vi.mock("../../../constants", () => ({
  PROCESSING_PATH: processing,
  NZB_DOWNLOAD_PATH: path.join(root, "nzb"),
}));
vi.mock("../../helpers/app-instance", () => ({
  getAppInstance: () => ({ locals: appLocals }),
}));
vi.mock("../utils/logs", () => ({ logs: vi.fn() }));
vi.mock("../download/download-handler", () => ({
  // A downloader that "downloads" real song files, then completes
  handleDownload: async (
    item: { id: string },
    _app: unknown,
    onComplete: () => void,
  ) => {
    started.push({ id: item.id, at: Date.now() });
    const dir = path.join(processing, item.id, "Artist", "Album");
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < (songsByItem[item.id] ?? 0); i++) {
      fs.writeFileSync(
        path.join(dir, `${String(i).padStart(2, "0")}.flac`),
        "x",
      );
    }
    setTimeout(onComplete, 5);
  },
}));
vi.mock("../post-processing/tidarr-post-processor", () => ({
  postProcessTidarr: (item: { status: string }, done: () => void) => {
    item.status = "finished";
    setTimeout(done, 5);
  },
}));
vi.mock("../post-processing/lidarr-post-processor", () => ({
  postProcessLidarr: vi.fn(),
}));

import { ProcessingItemType } from "../../types";

import { QueueManager } from "./queue-manager";

const ENV_KEYS = [
  "DOWNLOAD_COOLDOWN_TRACKS",
  "DOWNLOAD_COOLDOWN_SECONDS",
  "DOWNLOAD_BATCH_SIZE",
] as const;

const album = (id: string): ProcessingItemType =>
  ({
    id,
    type: "album",
    title: `Album ${id}`,
    artist: "Artist",
    status: "queue_download",
    quality: "high",
    url: `album/${id}`,
    loading: false,
    error: false,
  }) as ProcessingItemType;

function setup(items: ProcessingItemType[]) {
  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  appLocals.tiddlConfig = {
    download: { download_path: path.join(root, "music") },
  };
  appLocals.processingStack = {
    actions: { getItem: (id: string) => itemsById[id] },
  };
  fs.mkdirSync(path.join(root, "music"), { recursive: true });

  const onSse = vi.fn();
  const manager = new QueueManager(
    items,
    {} as never,
    new Map(),
    () => {},
    async () => {},
    onSse,
  );
  return { manager, onSse };
}

const allFinished = (items: ProcessingItemType[]) =>
  items.every((i) => i.status === "finished");

async function waitFor(condition: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  started.length = 0;
  for (const key of Object.keys(songsByItem)) delete songsByItem[key];
  for (const key of ENV_KEYS) delete process.env[key];
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(processing, { recursive: true });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("QueueManager download cooldown", () => {
  it("waits after every N songs, then carries on", async () => {
    // 30 songs every 0.4s (the real setting is 30 songs / 30 s)
    process.env.DOWNLOAD_COOLDOWN_TRACKS = "30";
    process.env.DOWNLOAD_COOLDOWN_SECONDS = "0.4";
    Object.assign(songsByItem, { a: 15, b: 15, c: 15, d: 15 });
    const items = ["a", "b", "c", "d"].map(album);
    const { manager, onSse } = setup(items);

    await manager.processQueue();
    await waitFor(() => allFinished(items));

    const at = Object.fromEntries(started.map((s) => [s.id, s.at]));
    // a -> b: only 15 songs so far, no wait
    expect(at.b - at.a).toBeLessThan(300);
    // b brings the total to 30 songs: c waits for the cooldown
    expect(at.c - at.b).toBeGreaterThanOrEqual(380);
    // c -> d: 15 songs again, no wait
    expect(at.d - at.c).toBeLessThan(300);
    // c + d bring the total to 30 songs again: a new wait starts after d,
    // holding back whatever is queued next. It ends by itself, and the UI is
    // told when it does.
    await waitFor(() => manager.getCooldownUntil() === null);
    expect(onSse).toHaveBeenCalled();
  });

  it("exposes the end of the cooldown while it runs", async () => {
    process.env.DOWNLOAD_COOLDOWN_TRACKS = "10";
    process.env.DOWNLOAD_COOLDOWN_SECONDS = "0.5";
    Object.assign(songsByItem, { a: 10, b: 1 });
    const items = ["a", "b"].map(album);
    const { manager } = setup(items);

    await manager.processQueue();
    await waitFor(() => started.length === 1 && items[0].status !== "download");
    await waitFor(() => manager.getCooldownUntil() !== null);

    expect(manager.getCooldownUntil()! - Date.now()).toBeGreaterThan(0);
    expect(items[1].status).toBe("queue_download");

    await waitFor(() => allFinished(items));
    expect(manager.getCooldownUntil()).toBeNull();
  });

  it("charges a large item with one wait per N songs", async () => {
    process.env.DOWNLOAD_COOLDOWN_TRACKS = "10";
    process.env.DOWNLOAD_COOLDOWN_SECONDS = "0.2";
    Object.assign(songsByItem, { big: 35, next: 1 });
    const items = ["big", "next"].map(album);
    const { manager } = setup(items);

    await manager.processQueue();
    await waitFor(() => allFinished(items));

    const at = Object.fromEntries(started.map((s) => [s.id, s.at]));
    // 35 songs => 3 waits of 0.2s
    expect(at.next - at.big).toBeGreaterThanOrEqual(580);
  });

  it("does not count items that downloaded nothing (all skipped)", async () => {
    process.env.DOWNLOAD_COOLDOWN_TRACKS = "5";
    process.env.DOWNLOAD_COOLDOWN_SECONDS = "5";
    // Nothing written: tiddl skipped everything that already exists
    const items = ["a", "b", "c"].map(album);
    const { manager } = setup(items);

    await manager.processQueue();
    await waitFor(() => started.length === 3, 3000);

    expect(manager.getCooldownUntil()).toBeNull();
    const span = started[2].at - started[0].at;
    expect(span).toBeLessThan(1000);
  });

  it("does nothing when the cooldown is not configured", async () => {
    Object.assign(songsByItem, { a: 50, b: 50 });
    const items = ["a", "b"].map(album);
    const { manager } = setup(items);

    await manager.processQueue();
    await waitFor(() => allFinished(items));

    expect(started[1].at - started[0].at).toBeLessThan(300);
    expect(manager.getCooldownUntil()).toBeNull();
  });
});
