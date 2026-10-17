import { Express } from "express";

import { NZB_DOWNLOAD_PATH, PROCESSING_PATH } from "../../../constants";
import { killChildProcessesForItem } from "../../helpers/child-processes";
import { checkBatchPause, getBatchDelayMs } from "../../services/batch-queue";
import {
  computeCooldown,
  getCooldownConfig,
} from "../../services/download-cooldown";
import { ProcessingItemType, ProcessingItemWithPlaylist } from "../../types";
import { handleDownload } from "../download/download-handler";
import { postProcessLidarr } from "../post-processing/lidarr-post-processor";
import { postProcessTidarr } from "../post-processing/tidarr-post-processor";
import {
  cleanFolder,
  countDownloadedTracks,
  hasFileToMove,
} from "../utils/jobs";
import { logs } from "../utils/logs";

const MAX_RETRIES = 3;

type PostProcessingRun = {
  item: ProcessingItemType;
  // Set when the item is removed (or on shutdown): the run stops at the next step
  cancelled: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Runs `fn` right away and turns a throw or a rejection into a rejected promise
function run(fn: () => unknown): Promise<unknown> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Manages the parallel processing queue with 1 download slot and 1 post-processing slot
 */
export class QueueManager {
  private data: ProcessingItemType[];
  private app: Express;
  private isPaused: boolean;
  private outputs: Map<string, string[]>;
  private updateItemCallback: (item: ProcessingItemType) => void;
  private updateItemInQueueFileCallback: (
    item: ProcessingItemType,
  ) => Promise<void>;
  private onBatchResumeCallback: () => void;
  private batchCompletedCount: { value: number };
  private batchResumeTimer: NodeJS.Timeout | null = null;
  private batchResumeAt: number | null = null;
  // Songs downloaded since the last cooldown wait (see services/download-cooldown)
  private cooldownPendingTracks = 0;
  private cooldownUntil: number | null = null;
  private cooldownTimer: NodeJS.Timeout | null = null;
  // Downloads that just finished and are still being accounted for
  private slotsBeingReleased = 0;
  // Tidarr post-processing in progress. Holds the slot until the run really
  // ends, even when its item was removed meanwhile.
  private activePostProcessing: PostProcessingRun | null = null;
  private shuttingDown = false;

  constructor(
    data: ProcessingItemType[],
    app: Express,
    outputs: Map<string, string[]>,
    updateItemCallback: (item: ProcessingItemType) => void,
    updateItemInQueueFileCallback: (item: ProcessingItemType) => Promise<void>,
    onBatchResumeCallback: () => void,
  ) {
    this.data = data;
    this.app = app;
    this.isPaused = false;
    this.outputs = outputs;
    this.updateItemCallback = updateItemCallback;
    this.updateItemInQueueFileCallback = updateItemInQueueFileCallback;
    this.onBatchResumeCallback = onBatchResumeCallback;
    this.batchCompletedCount = { value: 0 };
  }

  /**
   * Prepares an item for download
   */
  async prepareDownload(item: ProcessingItemType): Promise<void> {
    item["status"] = "download";
    this.updateItemCallback(item);

    // Initialize empty output history
    this.outputs.set(String(item.id), []);

    // Don't clean folder on retry - tiddl skip_existing will resume
    if (!item.retryCount) {
      await cleanFolder(item.id);
    }
  }

  private isPostProcessing(): boolean {
    return (
      this.activePostProcessing !== null ||
      this.data.some((item) => item.status === "processing")
    );
  }

  /**
   * True while a removed item's post-processing is still winding down: an
   * item re-added with the same id must not download into that folder yet.
   */
  isFinishingCancelledRun(id: string): boolean {
    const run = this.activePostProcessing;
    return !!run && run.cancelled && run.item.id === id;
  }

  /**
   * Processes the queue - starts download and post-processing if slots available.
   * When paused, only the download slot is blocked — post-processing continues.
   */
  async processQueue(): Promise<void> {
    if (this.shuttingDown) return;

    try {
      const isDownloading =
        this.slotsBeingReleased > 0 ||
        this.data.some((item) => item.status === "download");

      if (!isDownloading && !this.isPaused && !this.isCoolingDown()) {
        const nextDownload = this.data.find(
          (item) =>
            item.status === "queue_download" &&
            !this.isFinishingCancelledRun(item.id),
        );

        if (nextDownload) {
          // Claims the slot synchronously (status "download") before awaiting
          await this.prepareDownload(nextDownload);
          this.startDownload(nextDownload);
        }
      }

      // Checked after the await above: another call may have started one meanwhile
      if (!this.isPostProcessing()) {
        const nextPostProcess = this.data.find(
          (item) => item.status === "queue_processing",
        );

        if (nextPostProcess) {
          this.startPostProcessing(nextPostProcess);
        }
      }
    } catch (error) {
      console.error("❌ [QUEUE] Error while processing the queue:", error);
    }
  }

  /**
   * Starts downloading an item
   */
  startDownload(item: ProcessingItemType): void {
    run(() =>
      handleDownload(item, this.app, (playlistId) =>
        this.onDownloadEnd(item, playlistId),
      ),
    ).catch((error) => {
      // e.g. discography expansion or mix preparation failed
      logs(item.id, `❌ [TIDARR] Download failed: ${errorMessage(error)}`);

      // Paused or removed meanwhile: nothing left to account for
      if (item.status !== "download" || !this.data.includes(item)) {
        this.processQueue();
        return;
      }

      item.status = "error";
      item.loading = false;
      item.networkError = false;
      this.updateItemCallback(item);
      this.onDownloadEnd(item);
    });
  }

  /**
   * Called once a download ended (successfully or not)
   */
  private async onDownloadEnd(
    item: ProcessingItemType,
    playlistId?: string,
  ): Promise<void> {
    // Keep the download slot taken until this item is fully accounted for:
    // the batch pause and the cooldown are decided after some awaits, and a
    // concurrent processQueue() must not start the next download meanwhile.
    this.slotsBeingReleased++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.slotsBeingReleased--;
      }
    };

    let lidarrPostProcessingStarted = false;

    try {
      // Download completed
      delete item.process;

      // If error, retry immediately up to MAX_RETRIES times
      if (item.status === "error") {
        item.errorStage = "download";

        if (this.shouldRetry(item)) {
          this.updateItemCallback(item);
          this.startDownload(item);
          return;
        }

        // Rescue partially downloaded files instead of wiping them
        const hadPartialFiles = await hasFileToMove(
          `${PROCESSING_PATH}/${item.id}`,
        );

        if (hadPartialFiles) {
          item.status = "queue_processing";
          await this.applyBatchPause(item, `${PROCESSING_PATH}/${item.id}`);

          this.updateItemCallback(item);
          await this.updateItemInQueueFileCallback(item);
          release();
          this.processQueue();
          return;
        }

        await cleanFolder(item.id);

        // Trigger next items in queue
        release();
        this.processQueue();
        return;
      }

      // Clear any stale errorStage from a previous failed attempt
      item.errorStage = undefined;

      // For LIDARR items, go straight to post-processing
      if (item.source === "lidarr") {
        item.status = "processing";
        this.updateItemCallback(item);
        await this.updateItemInQueueFileCallback(item);

        // Increment batch counter before notifying SSE so UI sees updated count
        await this.applyBatchPause(item, `${NZB_DOWNLOAD_PATH}/${item.id}`);

        // Start Lidarr post-processing immediately
        lidarrPostProcessingStarted = true;
        this.startLidarrPostProcessing(item);

        // Trigger download of next item
        release();
        this.processQueue();
        return;
      }

      // For TIDARR items, move to post-processing queue
      item.status = "queue_processing";

      // Store playlistId for cleanup after post-processing
      if (playlistId) {
        (item as ProcessingItemWithPlaylist).playlistId = playlistId;
      }

      // Increment batch counter before notifying SSE so UI sees updated count
      await this.applyBatchPause(item, `${PROCESSING_PATH}/${item.id}`);

      this.updateItemCallback(item);
      await this.updateItemInQueueFileCallback(item);

      release();
      this.processQueue();
    } catch (error) {
      // e.g. the queue file could not be written (disk full, permissions)
      console.error(
        `❌ [QUEUE] Failed to finish the download of ${item.id}:`,
        error,
      );
      logs(item.id, `❌ [TIDARR] ${errorMessage(error)}`);
      // A Lidarr item left "processing" without its post-processing would
      // block the post-processing slot forever
      const stuckLidarrItem =
        item.source === "lidarr" &&
        item.status === "processing" &&
        !lidarrPostProcessingStarted;
      if (item.status === "download" || stuckLidarrItem) {
        item.errorStage = stuckLidarrItem ? "post_processing" : "download";
        item.status = "error";
      }
      this.updateItemCallback(item);
      release();
      this.processQueue();
    } finally {
      release();
    }
  }

  /**
   * Increments the batch counter for a completed download (if it produced files)
   * and pauses the queue with an auto-resume timer once DOWNLOAD_BATCH_SIZE is reached.
   */
  private async applyBatchPause(
    item: ProcessingItemType,
    processingPath: string,
  ): Promise<void> {
    const hadFiles = await hasFileToMove(processingPath);
    if (hadFiles) {
      await this.applyCooldown(item, processingPath);
    }
    if (!hadFiles || !checkBatchPause(item.id, this.batchCompletedCount)) {
      return;
    }

    this.isPaused = true;
    const delayMs = getBatchDelayMs();
    if (delayMs) {
      this.batchResumeAt = Date.now() + delayMs;
      this.batchResumeTimer = setTimeout(() => {
        this.batchResumeTimer = null;
        this.batchResumeAt = null;
        this.resetBatchCount();
        this.setPaused(false);
        this.processQueue();
        this.onBatchResumeCallback();
      }, delayMs);
      console.log(
        `⏱️ [BATCH] Auto-resume scheduled in ${delayMs / 60000} min.`,
      );
    }
  }

  /**
   * Counts the songs a finished download produced and, once
   * DOWNLOAD_COOLDOWN_TRACKS songs are reached, holds back the next download
   * for DOWNLOAD_COOLDOWN_SECONDS (per DOWNLOAD_COOLDOWN_TRACKS songs).
   */
  private async applyCooldown(
    item: ProcessingItemType,
    processingPath: string,
  ): Promise<void> {
    const config = getCooldownConfig();
    if (!config) return;

    const downloaded = await countDownloadedTracks(processingPath);
    const sinceLastWait = this.cooldownPendingTracks + downloaded;
    const { waitMs, pendingTracks } = computeCooldown(
      this.cooldownPendingTracks,
      downloaded,
      config,
    );
    this.cooldownPendingTracks = pendingTracks;

    if (waitMs <= 0) return;

    this.startCooldown(waitMs);
    const seconds = Math.round(waitMs / 1000);
    logs(
      item.id,
      `⏳ [COOLDOWN] ${downloaded} song(s) downloaded (${sinceLastWait} since the last wait): waiting ${seconds}s before the next download.`,
    );
    console.log(
      `⏳ [COOLDOWN] Next download delayed by ${seconds}s (${sinceLastWait} song(s) since the last wait).`,
    );
  }

  private startCooldown(waitMs: number): void {
    const now = Date.now();
    // Waits add up if a second one is earned while one is already running
    this.cooldownUntil = Math.max(this.cooldownUntil ?? 0, now) + waitMs;

    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      this.cooldownUntil = null;
      this.processQueue();
      this.onBatchResumeCallback();
    }, this.cooldownUntil - now);
    // A pending cooldown must not keep the process alive on shutdown
    this.cooldownTimer.unref?.();
  }

  private isCoolingDown(): boolean {
    return this.cooldownUntil !== null && Date.now() < this.cooldownUntil;
  }

  /**
   * Starts post-processing an item
   */
  private startPostProcessing(item: ProcessingItemType): void {
    // Claim the slot synchronously so concurrent processQueue() calls see it
    item["status"] = "processing";
    const postProcessing: PostProcessingRun = { item, cancelled: false };
    this.activePostProcessing = postProcessing;
    this.updateItemCallback(item);

    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      this.onPostProcessingComplete(item, postProcessing);
    };

    run(() =>
      postProcessTidarr(
        item,
        complete,
        () => postProcessing.cancelled || this.shuttingDown,
      ),
    ).catch((error) => {
      this.markPostProcessingFailed(item, error);
      complete();
    });
  }

  private startLidarrPostProcessing(item: ProcessingItemType): void {
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      this.onPostProcessingComplete(item);
    };

    run(() => postProcessLidarr(item, complete)).catch((error) => {
      this.markPostProcessingFailed(item, error);
      complete();
    });
  }

  private markPostProcessingFailed(item: ProcessingItemType, error: unknown) {
    console.error(`❌ [QUEUE] Post-processing of ${item.id} failed:`, error);
    logs(item.id, `❌ [TIDARR] Post-processing failed: ${errorMessage(error)}`);
    item.status = "error";
    item.error = true;
    if (item.errorStage !== "download") {
      item.errorStage = "post_processing";
    }
  }

  /**
   * Retries post-processing for an error item without re-downloading
   */
  async retryPostProcessing(item: ProcessingItemType): Promise<void> {
    if (this.isPostProcessing()) {
      throw new Error(
        "Another item is already post-processing, please retry once it completes",
      );
    }

    item.error = false;
    this.startPostProcessing(item);
  }

  /**
   * Stops the post-processing of a removed item: its child processes are
   * killed and the run stops at the next step. The slot stays taken until
   * the run has really ended.
   */
  async cancelPostProcessing(id: string): Promise<void> {
    const run = this.activePostProcessing;
    if (!run || run.item.id !== id || run.cancelled) return;

    run.cancelled = true;
    await killChildProcessesForItem(id);
  }

  /**
   * Called when post-processing completes
   */
  private async onPostProcessingComplete(
    item: ProcessingItemType,
    run?: PostProcessingRun,
  ): Promise<void> {
    try {
      // A cancelled run's item was removed (or may have been re-added with
      // the same id): its state must not be written over the new one
      if (!run?.cancelled && !this.shuttingDown) {
        await this.updateItemInQueueFileCallback(item);
        this.updateItemCallback(item);
      }
    } catch (error) {
      console.error(
        `❌ [QUEUE] Failed to save the state of ${item.id}:`,
        error,
      );
      this.updateItemCallback(item);
    } finally {
      if (run && this.activePostProcessing === run) {
        this.activePostProcessing = null;
      }
      // Trigger next items in queue
      this.processQueue();
    }
  }

  /**
   * Stops starting new work and cancels the running post-processing
   * (graceful shutdown). Items left unfinished are queued again on restart.
   */
  shutdown(): void {
    this.shuttingDown = true;
    if (this.activePostProcessing) this.activePostProcessing.cancelled = true;
    if (this.batchResumeTimer) clearTimeout(this.batchResumeTimer);
    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
  }

  /**
   * Checks if item should be retried, updates item state if yes
   */
  private shouldRetry(item: ProcessingItemType): boolean {
    if (!item.networkError) {
      logs(
        item.id,
        "⛔ [RETRY] Non-retriable error (content/quality issue). Skipping retries.",
      );
      return false;
    }

    const retryCount = item.retryCount ?? 0;

    if (retryCount >= MAX_RETRIES) {
      logs(
        item.id,
        `❌ [RETRY] Max retries (${MAX_RETRIES}) reached. Download failed.`,
      );
      return false;
    }

    item.retryCount = retryCount + 1;
    item.status = "download";
    item.error = false;
    item.loading = false;

    logs(
      item.id,
      `🔄 [RETRY] Retrying download (attempt ${item.retryCount}/${MAX_RETRIES})...`,
    );

    return true;
  }

  /**
   * Pauses the queue
   */
  setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (!paused && this.batchResumeTimer) {
      clearTimeout(this.batchResumeTimer);
      this.batchResumeTimer = null;
      this.batchResumeAt = null;
    }
  }

  resetBatchCount(): void {
    this.batchCompletedCount.value = 0;
  }

  /**
   * Gets the pause state
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  getBatchCount(): number {
    return this.batchCompletedCount.value;
  }

  getBatchResumeAt(): number | null {
    return this.batchResumeAt;
  }

  /** Timestamp (ms) until which new downloads are held back, or null. */
  getCooldownUntil(): number | null {
    return this.isCoolingDown() ? this.cooldownUntil : null;
  }

  /**
   * Time left on the cooldown, for the interface. A duration rather than a
   * timestamp, so a browser clock that is off does not skew the countdown.
   */
  getCooldownRemainingMs(): number | null {
    const until = this.getCooldownUntil();
    return until === null ? null : Math.max(0, until - Date.now());
  }
}
