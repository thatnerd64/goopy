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
vi.mock("../processing/utils/logs", () => ({ logs: vi.fn() }));

import { tidalDL, tidalToken } from "./tiddl";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
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

describe("tidalDL", () => {
  function fakeApp(item: Record<string, unknown>) {
    const updateItem = vi.fn();
    const app = {
      locals: {
        tiddlConfig: {},
        processingStack: {
          actions: {
            getItem: () => item,
            getItemOutput: () => "",
            updateItem,
          },
        },
      },
    };
    return { app, updateItem };
  }

  it("reports the end once when tiddl cannot be started", () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    // A network error flag left over from a previous attempt
    const item = {
      id: "123",
      type: "album",
      url: "album/123",
      status: "download",
      networkError: true,
    };
    const { app, updateItem } = fakeApp(item);
    const onFinish = vi.fn();

    tidalDL("123", app as never, onFinish);
    child.emit("error", new Error("spawn tiddl ENOENT"));
    child.emit("close", -2);

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(item.status).toBe("error");
    // Not retried as a network error
    expect(item.networkError).toBe(false);
  });

  it("lets the queue manager take the slot before announcing the end", () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const item = {
      id: "123",
      type: "album",
      url: "album/123",
      status: "download",
    };
    const { app, updateItem } = fakeApp(item);
    const order: string[] = [];
    updateItem.mockImplementation(() => order.push("updateItem"));

    tidalDL("123", app as never, () => order.push("onFinish"));
    child.emit("close", 1);

    expect(order).toEqual(["onFinish", "updateItem"]);
  });
});
