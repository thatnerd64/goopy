import {
  getCooldownConfig,
  getCooldownConfigWarning,
} from "../services/download-cooldown";

export function checkConfig() {
  if (process.env.DOWNLOAD_BATCH_CRON) {
    console.error(
      "❌ [CONFIG] DOWNLOAD_BATCH_CRON is no longer supported. Please use DOWNLOAD_BATCH_DELAY (delay in minutes) instead.",
    );
    process.exit(1);
  }

  const cooldownWarning = getCooldownConfigWarning();
  if (cooldownWarning) {
    console.warn(`⚠️ [CONFIG] ${cooldownWarning}`);
  }

  const cooldown = getCooldownConfig();
  if (cooldown) {
    console.log(
      `⏳ [COOLDOWN] Waiting ${cooldown.waitMs / 1000}s every ${cooldown.everyTracks} downloaded song(s).`,
    );
  }
}
