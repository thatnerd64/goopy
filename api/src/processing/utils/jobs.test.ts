import fs from "fs";
import path from "path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above the imports: build the paths in vi.hoisted
const { root, processing, nzb, appLocals } = await vi.hoisted(async () => {
  const nodeFs = await import("fs");
  const nodeOs = await import("os");
  const nodePath = await import("path");
  const root = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), "tidarr-jobs-"),
  );
  return {
    root,
    processing: nodePath.join(root, ".processing"),
    nzb: nodePath.join(root, "nzb_downloads"),
    appLocals: {} as Record<string, unknown>,
  };
});

vi.mock("../../../constants", () => ({
  PROCESSING_PATH: processing,
  NZB_DOWNLOAD_PATH: nzb,
}));
vi.mock("../../helpers/app-instance", () => ({
  getAppInstance: () => ({ locals: appLocals }),
}));
vi.mock("./logs", () => ({ logs: vi.fn() }));

import {
  cleanFolder,
  countDownloadedTracks,
  getFolderToScan,
  hasFileToMove,
  moveAndClean,
  replacePathInM3U,
} from "./jobs";

const item = (id: string, extra: object = {}) =>
  ({ id, type: "album", title: "t", artist: "a", ...extra }) as never;

function write(file: string, content = "x") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function setStack(items: Record<string, unknown>) {
  appLocals.processingStack = {
    actions: { getItem: (id: string) => items[id] },
  };
}

beforeEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(processing, { recursive: true });
  fs.mkdirSync(path.join(root, "music"), { recursive: true });
  appLocals.tiddlConfig = {
    download: { download_path: path.join(root, "music") },
  };
  setStack({});
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("cleanFolder", () => {
  it("removes only the item folder", async () => {
    write(path.join(processing, "111", "a.flac"));
    write(path.join(processing, "222", "b.flac"));
    setStack({ "111": item("111") });

    expect(await cleanFolder("111")).toBe("finished");
    expect(fs.existsSync(path.join(processing, "111"))).toBe(false);
    expect(fs.existsSync(path.join(processing, "222", "b.flac"))).toBe(true);
  });

  it("removes every item folder without id, but not hidden entries", async () => {
    write(path.join(processing, "111", "a.flac"));
    write(path.join(processing, "222", "b.flac"));
    write(path.join(processing, ".keep", "k"));

    expect(await cleanFolder()).toBe("finished");
    expect(fs.readdirSync(processing)).toEqual([".keep"]);
  });

  it("never executes shell syntax found in an id", async () => {
    const marker = path.join(root, "pwned");
    const evil = `x; touch ${marker}`;
    write(path.join(processing, "keep", "a.flac"));
    setStack({ [evil]: item(evil) });

    await cleanFolder(evil);
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.existsSync(path.join(processing, "keep", "a.flac"))).toBe(true);
  });

  it("refuses a path-traversal id", async () => {
    write(path.join(root, "music", "precious.flac"));
    setStack({ "../music": item("../music") });

    expect(await cleanFolder("../music")).toBe("error");
    expect(fs.existsSync(path.join(root, "music", "precious.flac"))).toBe(true);
  });
});

describe("hasFileToMove", () => {
  it("is false for a missing, empty or hidden-only folder", async () => {
    expect(await hasFileToMove(path.join(processing, "nope"))).toBe(false);
    fs.mkdirSync(path.join(processing, "empty"));
    expect(await hasFileToMove(path.join(processing, "empty"))).toBe(false);
    write(path.join(processing, "hidden", ".DS_Store"));
    expect(await hasFileToMove(path.join(processing, "hidden"))).toBe(false);
  });

  it("is true when there is something to move", async () => {
    write(path.join(processing, "full", "Artist", "a.flac"));
    expect(await hasFileToMove(path.join(processing, "full"))).toBe(true);
  });
});

describe("moveAndClean", () => {
  it("copies the files to the library and cleans the item folder", async () => {
    write(path.join(processing, "111", "Artist", "Album", "01.flac"), "audio");
    setStack({ "111": item("111") });

    expect(await moveAndClean("111")).toEqual({ status: "finished" });
    expect(
      fs.readFileSync(
        path.join(root, "music", "Artist", "Album", "01.flac"),
        "utf-8",
      ),
    ).toBe("audio");
    expect(fs.existsSync(path.join(processing, "111"))).toBe(false);
  });

  it.each([
    'quo"te',
    "single'quote",
    "dollar $HOME",
    "back`tick`",
    "semi; colon",
    "$(touch PWNED)",
  ])("handles a library path containing %j", async (name) => {
    const library = path.join(root, name);
    fs.mkdirSync(library, { recursive: true });
    appLocals.tiddlConfig = { download: { download_path: library } };
    write(path.join(processing, "111", "Artist", "01.flac"), "audio");
    setStack({ "111": item("111") });

    expect(await moveAndClean("111")).toEqual({ status: "finished" });
    expect(fs.existsSync(path.join(library, "Artist", "01.flac"))).toBe(true);
    expect(fs.existsSync(path.join(root, "PWNED"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "PWNED"))).toBe(false);
  });

  it("keeps the files and reports an error when the copy fails", async () => {
    write(path.join(processing, "111", "Artist", "01.flac"), "audio");
    // The library is a regular file: cp cannot copy into it
    appLocals.tiddlConfig = {
      download: { download_path: path.join(root, "a-file") },
    };
    write(path.join(root, "a-file"), "not a dir");
    setStack({ "111": item("111") });

    expect((await moveAndClean("111")).status).toBe("error");
    expect(
      fs.existsSync(path.join(processing, "111", "Artist", "01.flac")),
    ).toBe(true);
  });

  it("skips hidden files like the shell glob did", async () => {
    write(path.join(processing, "111", "Artist", "01.flac"));
    write(path.join(processing, "111", ".hidden"), "h");
    setStack({ "111": item("111") });

    await moveAndClean("111");
    expect(fs.existsSync(path.join(root, "music", ".hidden"))).toBe(false);
  });
});

describe("getFolderToScan", () => {
  it("returns the folders that contain files, relative to the item", async () => {
    write(path.join(processing, "111", "A", "2020 - X", "01.flac"));
    write(path.join(processing, "111", "A", "2020 - X", "02.flac"));
    write(path.join(processing, "111", "B", "01.flac"));

    expect((await getFolderToScan("111")).sort()).toEqual([
      path.join("A", "2020 - X"),
      "B",
    ]);
  });

  it("returns nothing for a missing folder", async () => {
    expect(await getFolderToScan("999")).toEqual([]);
  });
});

describe("replacePathInM3U", () => {
  it("rewrites paths even when they contain regex metacharacters", async () => {
    const library = path.join(root, "mu(sic)+[x]");
    appLocals.tiddlConfig = { download: { download_path: library } };
    setStack({});
    const dir = path.join(processing, "111");
    write(
      path.join(dir, "m3u", "playlist", "list.m3u"),
      `${library}/A/01.flac\n${dir}/B/02.flac\n`,
    );

    await replacePathInM3U(item("111", { type: "playlist" }));

    expect(
      fs.readFileSync(path.join(dir, "m3u", "playlist", "list.m3u"), "utf-8"),
    ).toBe("./A/01.flac\n./B/02.flac\n");
  });
});

describe("countDownloadedTracks", () => {
  it("counts songs and videos, not covers, playlists or lyrics", async () => {
    const dir = path.join(processing, "111");
    for (const name of ["01.flac", "02.FLAC", "03.m4a", "04.mp3", "clip.mp4"]) {
      write(path.join(dir, "Artist", "Album", name));
    }
    for (const name of ["cover.jpg", "01.lrc", "list.m3u", "notes.txt"]) {
      write(path.join(dir, "Artist", "Album", name));
    }

    expect(await countDownloadedTracks(dir)).toBe(5);
  });

  it("counts files in every nested folder", async () => {
    const dir = path.join(processing, "111");
    write(path.join(dir, "A", "x", "01.flac"));
    write(path.join(dir, "B", "02.flac"));
    expect(await countDownloadedTracks(dir)).toBe(2);
  });

  it("is 0 for an empty or missing folder (skipped downloads)", async () => {
    fs.mkdirSync(path.join(processing, "empty"));
    expect(await countDownloadedTracks(path.join(processing, "empty"))).toBe(0);
    expect(await countDownloadedTracks(path.join(processing, "nope"))).toBe(0);
  });
});
