import { ChildProcess } from "child_process";

// Default limit for one post-processing child process (beets, rsgain, custom scripts)
const DEFAULT_POST_PROCESSING_TIMEOUT_MINUTES = 60;

// Child process → id of the queue item it works for (if any)
const tracked = new Map<ChildProcess, string | undefined>();

export function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

/**
 * Timeout applied to each post-processing child process, from
 * POST_PROCESSING_TIMEOUT_MINUTES (default 60, 0 disables it).
 */
export function getPostProcessingTimeoutMs(): number {
  const raw = process.env.POST_PROCESSING_TIMEOUT_MINUTES;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_POST_PROCESSING_TIMEOUT_MINUTES * 60_000;
  }

  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) {
    console.warn(
      `⚠️ [TIDARR] Invalid POST_PROCESSING_TIMEOUT_MINUTES "${raw}", using ${DEFAULT_POST_PROCESSING_TIMEOUT_MINUTES}.`,
    );
    return DEFAULT_POST_PROCESSING_TIMEOUT_MINUTES * 60_000;
  }

  return minutes * 60_000;
}

/**
 * Sends SIGTERM, then SIGKILL if the process is still alive after `graceMs`.
 * Resolves once the process exited or SIGKILL was sent.
 */
export function terminate(child: ChildProcess, graceMs = 1000): Promise<void> {
  if (!isRunning(child)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (isRunning(child)) {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
      resolve();
    }, graceMs);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

/**
 * Registers a child process so it is killed on shutdown and, when
 * `timeoutMs` is set, killed once it runs longer than that.
 */
export function trackChildProcess(
  child: ChildProcess,
  options: { itemId?: string; timeoutMs?: number; onTimeout?: () => void } = {},
): ChildProcess {
  // killProcess() strips listeners (including ours): drop exited entries here
  for (const other of tracked.keys()) {
    if (!isRunning(other)) tracked.delete(other);
  }
  tracked.set(child, options.itemId);

  let timer: NodeJS.Timeout | null = null;
  if (options.timeoutMs && options.timeoutMs > 0) {
    timer = setTimeout(() => {
      if (!isRunning(child)) return;
      options.onTimeout?.();
      terminate(child, 5000);
    }, options.timeoutMs);
    timer.unref?.();
  }

  const untrack = () => {
    tracked.delete(child);
    if (timer) clearTimeout(timer);
  };
  child.once("exit", untrack);
  child.once("error", untrack);

  return child;
}

/** Kills the tracked child processes working for one queue item. */
export async function killChildProcessesForItem(itemId: string): Promise<void> {
  const running = [...tracked]
    .filter(([child, id]) => id === itemId && isRunning(child))
    .map(([child]) => child);
  await Promise.all(running.map((child) => terminate(child, 3000)));
}

/** Kills every tracked child process (graceful shutdown). */
export async function killAllChildProcesses(graceMs = 3000): Promise<number> {
  const running = [...tracked.keys()].filter(isRunning);
  tracked.clear();
  await Promise.all(running.map((child) => terminate(child, graceMs)));
  return running.length;
}
