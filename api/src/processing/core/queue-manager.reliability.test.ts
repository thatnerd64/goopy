import fs from "fs";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { root, processing, appLocals, behaviour } = await vi.hoisted(
  async () => {
    const nodeFs = await import("fs");
    const nodeOs = await import("os");
    const nodePath = await import("path");
    const root = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), "tidarr-reliability-"),
    );
    return {
      root,
      processing: nodePath.join(root, ".processing"),
      appLocals: {} as Record<string, unknown>,
      behaviour: {
        // Download outcome by item id (default: writes one song and succeeds)
        download: {} as Record<string, "throw" | "ok">,
        // Post-processing runs, in start order
        postRuns: [] as {
          id: string;
          finish: (status?: string) => void;
          fail: (error: Error) => void;
          isCancelled: () => boolean;
        }[],
      },
    };
  },
);

vi.mock("../../../constants", () => ({
  PROCESSING_PATH: processing,
  NZB_DOWNLOAD_PATH: path.join(root, "nzb"),
}));
vi.mock("../../helpers/app-instance", () => ({
  getAppInstance: () => ({ locals: appLocals }),
}));
vi.mock("../utils/logs", () => ({ logs: vi.fn() }));
vi.mock("../download/download-handler", () => ({
  handleDownload: async (
    item: { id: string },
    _app: unknown,
    onComplete: () => void,
  ) => {
    await new Promise((r) => setTimeout(r, 2));
    if (behaviour.download[item.id] === "throw") {
      throw new Error("discography expansion failed");
    }
    const dir = path.join(processing, item.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "01.flac"), "x");
    setTimeout(onComplete, 2);
  },
}));
vi.mock("../post-processing/tidarr-post-processor", () => ({
  postProcessTidarr: (
    item: { id: string; status: string },
    done: () => void,
    isCancelled: () => boolean,
  ) =>
    new Promise<void>((resolve, reject) => {
      behaviour.postRuns.push({
        id: item.id,
        isCancelled,
        finish: (status = "finished") => {
          item.status = status;
          done();
          resolve();
        },
        fail: (error) => reject(error),
      });
    }),
}));
vi.mock("../post-processing/lidarr-post-processor", () => ({
  postProcessLidarr: vi.fn(),
}));

import { ProcessingItemType } from "../../types";

import { QueueManager } from "./queue-manager";

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
  appLocals.processingStack = {
    actions: { getItem: (id: string) => items.find((i) => i.id === id) },
  };
  const saved: ProcessingItemType[] = [];
  managers.push(() => manager);
  const manager = new QueueManager(
    items,
    {} as never,
    new Map(),
    () => {},
    async (item) => {
      saved.push({ ...item });
    },
    () => {},
  );
  return { manager, saved };
}

// Shut down after each test so leftover async work cannot start new runs
const managers: (() => QueueManager)[] = [];

async function waitFor(condition: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 2));
  }
}

beforeEach(() => {
  behaviour.download = {};
  behaviour.postRuns.length = 0;
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(processing, { recursive: true });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  managers.splice(0).forEach((getManager) => getManager().shutdown());
  // Let in-flight fake downloads end before the next test resets the state
  await new Promise((r) => setTimeout(r, 20));
  vi.restoreAllMocks();
});

describe("QueueManager reliability", () => {
  it("marks the item failed and frees the download slot when the download throws", async () => {
    behaviour.download.a = "throw";
    const items = [album("a"), album("b")];
    const { manager } = setup(items);

    manager.processQueue();

    // "b" was downloaded and reached post-processing
    await waitFor(() => behaviour.postRuns.some((run) => run.id === "b"));
    expect(items[0].status).toBe("error");
  });

  it("frees the post-processing slot when post-processing throws", async () => {
    const items = [album("a"), album("b")];
    const { manager } = setup(items);

    manager.processQueue();
    await waitFor(() => behaviour.postRuns.length === 1);
    behaviour.postRuns[0].fail(new Error("beets crashed"));

    await waitFor(() => behaviour.postRuns.length === 2);
    expect(items[0].status).toBe("error");
    expect(items[0].errorStage).toBe("post_processing");
    expect(behaviour.postRuns[1].id).toBe("b");
  });

  it("starts a single post-processing when processQueue runs concurrently", async () => {
    const items = [album("a"), album("b")];
    items.forEach((item) => (item.status = "queue_processing"));
    const { manager } = setup(items);

    await Promise.all([manager.processQueue(), manager.processQueue()]);

    expect(behaviour.postRuns.map((r) => r.id)).toEqual(["a"]);
  });

  it("keeps the slot of a removed item until its post-processing really ends", async () => {
    const items = [album("a"), album("b")];
    const { manager, saved } = setup(items);

    manager.processQueue();
    await waitFor(() => behaviour.postRuns.length === 1);
    await waitFor(() => items[1].status === "queue_processing");

    // The user removes "a" while it is post-processing...
    const run = behaviour.postRuns[0];
    items.splice(0, 1);
    await manager.cancelPostProcessing("a");
    expect(run.isCancelled()).toBe(true);

    // ...and re-adds it: it must wait for the old run to end
    const readded = album("a");
    items.push(readded);
    manager.processQueue();
    await new Promise((r) => setTimeout(r, 30));
    expect(behaviour.postRuns).toHaveLength(1);
    expect(readded.status).toBe("queue_download");

    const savedBefore = saved.length;
    run.finish("finished");

    // The old run's state is not saved over the re-added item
    await waitFor(() => behaviour.postRuns.length === 2);
    expect(saved.slice(savedBefore).some((i) => i.id === "a")).toBe(false);
    expect(behaviour.postRuns[1].id).toBe("b");
    await waitFor(() => readded.status !== "queue_download");
  });

  it("does not start anything after shutdown", async () => {
    const items = [album("a")];
    const { manager } = setup(items);

    manager.shutdown();
    await manager.processQueue();

    expect(items[0].status).toBe("queue_download");
  });
});
