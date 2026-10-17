import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { ConfigWithAdapter, JsonAdapter, JsonDB } from "node-json-db";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AtomicFileAdapter } from "./atomic-file-adapter";

function makeDb(filename: string) {
  return new JsonDB(
    new ConfigWithAdapter(
      new JsonAdapter(new AtomicFileAdapter(filename)),
      true,
      "/",
    ),
  );
}

describe("AtomicFileAdapter", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "goopy-db-"));
    file = path.join(dir, "queue.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes and reads back data", async () => {
    const db = makeDb(file);
    await db.push("/", [{ id: "1" }]);

    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual([{ id: "1" }]);
    expect(await makeDb(file).getData("/")).toEqual([{ id: "1" }]);
  });

  it("leaves no temp files behind", async () => {
    const db = makeDb(file);
    await Promise.all([db.push("/", [1]), db.push("/", [1, 2])]);

    expect(readdirSync(dir)).toEqual(["queue.json"]);
  });

  it("keeps the latest snapshot when writes overlap", async () => {
    const db = makeDb(file);
    const writes = [];
    for (let i = 0; i < 20; i++) writes.push(db.push("/", [i]));
    await Promise.all(writes);

    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual([19]);
  });

  it("moves a truncated file aside and starts empty instead of throwing", async () => {
    writeFileSync(file, '[{"id":"1"},{"id":');

    const db = makeDb(file);
    const data = await db.getData("/");

    expect(data).toEqual({});
    const files = readdirSync(dir);
    expect(files.some((f) => f.startsWith("queue.json.corrupt-"))).toBe(true);

    // The database is usable again afterwards
    await db.push("/", []);
    expect(await makeDb(file).getData("/")).toEqual([]);
  });

  it("treats an empty file as a new database", async () => {
    writeFileSync(file, "");
    expect(await makeDb(file).getData("/")).toEqual({});
  });
});
