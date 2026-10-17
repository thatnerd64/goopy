import { spawn } from "child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  getPostProcessingTimeoutMs,
  isRunning,
  killAllChildProcesses,
  terminate,
  trackChildProcess,
} from "./child-processes";

// A process that ignores SIGTERM, like a stuck script
const stubborn = () => spawn("sh", ["-c", 'trap "" TERM; sleep 30']);

const exited = (child: ReturnType<typeof spawn>) =>
  new Promise<void>((resolve) => {
    if (!isRunning(child)) resolve();
    else child.once("exit", () => resolve());
  });

afterEach(async () => {
  await killAllChildProcesses(100);
  delete process.env.POST_PROCESSING_TIMEOUT_MINUTES;
});

describe("child processes", () => {
  it("sends SIGKILL when SIGTERM is ignored", async () => {
    const child = stubborn();
    // Let sh install its trap
    await new Promise((r) => setTimeout(r, 100));

    await terminate(child, 200);
    await exited(child);

    expect(child.signalCode).toBe("SIGKILL");
  });

  it("kills a tracked process that runs past its timeout", async () => {
    const child = spawn("sleep", ["30"]);
    let timedOut = false;
    trackChildProcess(child, {
      timeoutMs: 50,
      onTimeout: () => (timedOut = true),
    });

    await exited(child);

    expect(timedOut).toBe(true);
  });

  it("kills every tracked process on shutdown", async () => {
    const a = trackChildProcess(spawn("sleep", ["30"]));
    const b = trackChildProcess(spawn("sleep", ["30"]));

    expect(await killAllChildProcesses(200)).toBe(2);
    await Promise.all([exited(a), exited(b)]);
  });

  it("reads POST_PROCESSING_TIMEOUT_MINUTES", () => {
    expect(getPostProcessingTimeoutMs()).toBe(60 * 60_000);
    process.env.POST_PROCESSING_TIMEOUT_MINUTES = "5";
    expect(getPostProcessingTimeoutMs()).toBe(5 * 60_000);
    process.env.POST_PROCESSING_TIMEOUT_MINUTES = "0";
    expect(getPostProcessingTimeoutMs()).toBe(0);
  });
});
