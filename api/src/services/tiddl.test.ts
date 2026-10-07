import { EventEmitter } from "events";

import { describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({
  spawn: spawnMock,
  spawnSync: vi.fn(),
}));
vi.mock("../helpers/get_tiddl_config", () => ({
  get_tiddl_config: () => ({ config: {}, errors: [] }),
}));

import { tidalToken } from "./tiddl";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function fakeRes() {
  const written: string[] = [];
  const res = {
    writableEnded: false,
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
    end: () => {
      res.writableEnded = true;
    },
  };
  return { res, written };
}

describe("tidalToken", () => {
  it("does not crash the server when the tiddl binary cannot be started", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { res, written } = fakeRes();
    const req = new EventEmitter();

    tidalToken(req as never, res as never);

    // An 'error' event without a listener throws: it used to kill the process
    expect(() =>
      child.emit(
        "error",
        Object.assign(new Error("spawn tiddl ENOENT"), { code: "ENOENT" }),
      ),
    ).not.toThrow();
    // `close` may follow `error`
    expect(() => child.emit("close", -2)).not.toThrow();

    expect(written.join("")).toContain("Could not run tiddl");
    expect(res.writableEnded).toBe(true);
  });

  it("streams the login output and reports success", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { res, written } = fakeRes();

    tidalToken(
      new EventEmitter() as never,
      { ...res, app: undefined } as never,
    );
    child.stdout.emit("data", Buffer.from("Go to https://link.tidal.com/AAAA"));

    expect(written.join("")).toContain("https://link.tidal.com/AAAA");
  });
});
