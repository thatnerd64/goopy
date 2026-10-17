import { mkdir, open, readFile, rename, unlink } from "fs/promises";
import type { IAdapter } from "node-json-db";
import path from "path";

/**
 * Crash-safe file adapter for node-json-db.
 *
 * node-json-db's own FileAdapter truncates the file and then writes it, so a
 * process killed mid-write leaves a truncated JSON file that makes the next
 * start fail. This adapter:
 * - writes to a temp file, fsyncs it, then renames it over the target
 *   (rename is atomic on POSIX filesystems)
 * - serializes writes so an older snapshot can never land after a newer one
 * - moves an unreadable file aside (`<name>.corrupt-<timestamp>`) and starts
 *   empty instead of throwing on every start
 */
export class AtomicFileAdapter implements IAdapter<string> {
  readonly filename: string;
  private writeChain: Promise<void> = Promise.resolve();
  private tmpCounter = 0;

  constructor(filename: string) {
    this.filename = filename;
  }

  async readAsync(): Promise<string | null> {
    let content: string;
    try {
      content = await readFile(this.filename, { encoding: "utf-8" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }

    if (content.trim() === "") return null;

    try {
      JSON.parse(content);
      return content;
    } catch (error) {
      const corruptPath = `${this.filename}.corrupt-${Date.now()}`;
      console.error(
        `❌ [DB] ${this.filename} is corrupt (${error instanceof Error ? error.message : error}). ` +
          `Moved to ${corruptPath}, starting with an empty file.`,
      );
      try {
        await rename(this.filename, corruptPath);
      } catch (renameError) {
        console.error(
          `❌ [DB] Could not move corrupt file aside: ${renameError}`,
        );
      }
      return null;
    }
  }

  writeAsync(data: string): Promise<void> {
    const write = this.writeChain.then(() => this.writeAtomically(data));
    // Keep the chain alive after a failed write; the caller still gets the error
    this.writeChain = write.catch(() => undefined);
    return write;
  }

  /** Resolves once every write requested so far has landed (or failed). */
  whenIdle(): Promise<void> {
    return this.writeChain;
  }

  private async writeAtomically(data: string): Promise<void> {
    const dir = path.dirname(this.filename);
    const tmpPath = `${this.filename}.tmp-${process.pid}-${this.tmpCounter++}`;

    await mkdir(dir, { recursive: true });

    const fd = await open(tmpPath, "w");
    try {
      await fd.writeFile(data, { encoding: "utf-8" });
      await fd.sync();
    } catch (error) {
      await fd.close();
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
    await fd.close();

    try {
      await rename(tmpPath, this.filename);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }

    // Persist the rename itself (best effort: not supported everywhere)
    try {
      const dirFd = await open(dir, "r");
      try {
        await dirFd.sync();
      } finally {
        await dirFd.close();
      }
    } catch {
      // ignore
    }
  }
}
