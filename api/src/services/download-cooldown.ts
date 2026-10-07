/**
 * Download cooldown
 *
 * Waits between downloads to stay under Tidal's rate limits when a lot of
 * songs are queued: DOWNLOAD_COOLDOWN_SECONDS of waiting for every
 * DOWNLOAD_COOLDOWN_TRACKS songs downloaded (e.g. 30 seconds every 30 songs).
 *
 * tiddl downloads a whole album or playlist in a single process, so the wait is
 * applied between items, once an item has finished: its songs are counted and
 * the wait is proportional (an item of 90 songs earns 3 waits). Over time the
 * rate is exactly the configured one.
 */

export type CooldownConfig = {
  everyTracks: number;
  waitMs: number;
};

type Env = Record<string, string | undefined>;

/**
 * Returns null (feature off) unless both variables are set to positive numbers.
 */
export function getCooldownConfig(
  env: Env = process.env,
): CooldownConfig | null {
  const everyTracks = parseInt(env.DOWNLOAD_COOLDOWN_TRACKS ?? "", 10);
  const seconds = parseFloat(env.DOWNLOAD_COOLDOWN_SECONDS ?? "");

  if (!(everyTracks > 0) || !(seconds > 0)) return null;

  return { everyTracks, waitMs: Math.round(seconds * 1000) };
}

/**
 * A warning when the variables are set but the feature cannot work, else null.
 */
export function getCooldownConfigWarning(
  env: Env = process.env,
): string | null {
  const tracks = env.DOWNLOAD_COOLDOWN_TRACKS;
  const seconds = env.DOWNLOAD_COOLDOWN_SECONDS;

  if (!tracks && !seconds) return null;
  if (getCooldownConfig(env)) return null;

  return `DOWNLOAD_COOLDOWN_TRACKS ("${tracks ?? ""}") and DOWNLOAD_COOLDOWN_SECONDS ("${seconds ?? ""}") must both be set to positive numbers: the download cooldown is disabled.`;
}

/**
 * Adds the songs of a finished item to the ones still owed to the next wait.
 * Returns how long to wait now, and the songs carried over to the next item.
 */
export function computeCooldown(
  pendingTracks: number,
  downloadedTracks: number,
  config: CooldownConfig,
): { waitMs: number; pendingTracks: number } {
  const total = Math.max(0, pendingTracks) + Math.max(0, downloadedTracks);
  const rounds = Math.floor(total / config.everyTracks);

  return {
    waitMs: rounds * config.waitMs,
    pendingTracks: total - rounds * config.everyTracks,
  };
}
