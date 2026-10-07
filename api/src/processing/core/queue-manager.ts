import { Express } from "express";

import { NZB_DOWNLOAD_PATH, PROCESSING_PATH } from "../../../constants";
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

  /**
   * Prepares an item for post-processing
   */
  async preparePostProcessing(item: ProcessingItemType): Promise<void> {
    item["status"] = "processing";
    this.updateItemCallback(item);
  }

  /**
   * Processes the queue - starts download and post-processing if slots available.
   * When paused, only the download slot is blocked — post-processing continues.
   */
  async processQueue(): Promise<void> {
    const isDownloading =
      this.slotsBeingReleased > 0 ||
      this.data.some((item) => item.status === "download");
    const isPostProcessing = this.data.some(
      (item) => item.status === "processing",
    );

    if (!isDownloading && !this.isPaused && !this.isCoolingDown()) {
      const nextDownload = this.data.find(
        (item) => item.status === "queue_download",
      );

      if (nextDownload) {
        await this.prepareDownload(nextDownload);
        this.startDownload(nextDownload);
      }
    }

    if (!isPostProcessing) {
      const nextPostProcess = this.data.find(
        (item) => item.status === "queue_processing",
      );

      if (nextPostProcess) {
        await this.preparePostProcessing(nextPostProcess);
        this.startPostProcessing(nextPostProcess);
      }
    }
  }

  /**
   * Starts downloading an item
   */
  startDownload(item: ProcessingItemType): void {
    handleDownload(item, this.app, async (playlistId) => {
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
          postProcessLidarr(item, () => {
            this.onPostProcessingComplete(item);
          });

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
      } finally {
        release();
      }
    });
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
    postProcessTidarr(item, () => {
      this.onPostProcessingComplete(item);
    });
  }

  /**
   * Retries post-processing for an error item without re-downloading
   */
  async retryPostProcessing(item: ProcessingItemType): Promise<void> {
    item.status = "processing";
    item.error = false;
    this.updateItemCallback(item);

    this.startPostProcessing(item);
  }

  /**
   * Called when post-processing completes
   */
  private async onPostProcessingComplete(
    item: ProcessingItemType,
  ): Promise<void> {
    // Update item in queue file
    await this.updateItemInQueueFileCallback(item);

    // Update item status
    this.updateItemCallback(item);

    // Trigger next items in queue
    this.processQueue();
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
