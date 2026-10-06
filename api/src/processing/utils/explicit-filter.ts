import { ProcessingItemType } from "../../types";

/**
 * Tidal publishes the clean ("edited") and explicit editions of an album as two
 * separate album IDs that share the same artist and title. tiddl's default path
 * template ("{album.artist}/{album.date:%Y} - {album.title}/...") maps both to
 * the same folder, so downloading both interleaves clean and explicit tracks.
 *
 * This module picks ONE edition per album according to EXPLICIT_PREFERENCE:
 *  - "explicit" (default): prefer the explicit edition, fall back to clean
 *  - "clean": prefer the clean edition, fall back to explicit
 *  - "both": keep every edition (use `{album.explicit}` in tiddl templates to
 *    keep the editions in separate folders)
 */
export type ExplicitPreference = "explicit" | "clean" | "both";

export const DEFAULT_EXPLICIT_PREFERENCE: ExplicitPreference = "explicit";

const VALID_PREFERENCES: readonly ExplicitPreference[] = [
  "explicit",
  "clean",
  "both",
];

export function getExplicitPreference(
  raw: string | undefined = process.env.EXPLICIT_PREFERENCE,
): ExplicitPreference {
  // Docker env files often keep the quotes: EXPLICIT_PREFERENCE="clean"
  const value = raw
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();

  if (!value) return DEFAULT_EXPLICIT_PREFERENCE;

  if ((VALID_PREFERENCES as readonly string[]).includes(value)) {
    return value as ExplicitPreference;
  }

  console.warn(
    `⚠️ [EXPLICIT] Invalid EXPLICIT_PREFERENCE "${raw}" (expected: ${VALID_PREFERENCES.join(", ")}). Using "${DEFAULT_EXPLICIT_PREFERENCE}".`,
  );
  return DEFAULT_EXPLICIT_PREFERENCE;
}

// "(Explicit)", "[Clean Version]", "(Edited)", "(Censored Edition)" ...
// Only edition markers are removed: "Deluxe" or "Remastered" are different
// releases and must stay part of the title.
const EDITION_MARKER =
  /[([]\s*(?:explicit|clean|edited|censored)(?:\s+(?:version|edition))?\s*[)\]]/gi;

/**
 * Normalized artist + title key shared by all editions of the same album.
 */
export function editionKey(artist: string, title: string): string {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(EDITION_MARKER, " ")
      .replace(/\s+/g, " ")
      .trim();

  return `${normalize(artist)}\u0000${normalize(title)}`;
}

export type EditionCandidate = {
  id: string | number;
  title: string;
  artist?: string;
  /** `undefined` means "unknown" and is treated as a clean edition. */
  explicit?: boolean;
};

export type EditionSelection<T> = {
  selected: T[];
  /** Candidates dropped because another edition of the same album was kept. */
  skipped: T[];
};

/**
 * Keeps one edition per album (first-seen order preserved).
 * Duplicate IDs are always collapsed, whatever the preference.
 */
export function selectEditions<T extends EditionCandidate>(
  candidates: T[],
  preference: ExplicitPreference = getExplicitPreference(),
): EditionSelection<T> {
  const seenIds = new Set<string>();
  const unique = candidates.filter((candidate) => {
    const id = String(candidate.id);
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  if (preference === "both") {
    return { selected: unique, skipped: [] };
  }

  const wantExplicit = preference === "explicit";
  const groups = new Map<string, T[]>();
  for (const candidate of unique) {
    const key = editionKey(candidate.artist ?? "", candidate.title);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }

  const selected: T[] = [];
  const skipped: T[] = [];
  for (const group of groups.values()) {
    const preferred =
      group.find((candidate) => !!candidate.explicit === wantExplicit) ??
      group[0];
    selected.push(preferred);
    skipped.push(...group.filter((candidate) => candidate !== preferred));
  }

  return { selected, skipped };
}

/**
 * Drops candidates whose album is already in the queue under another ID
 * (e.g. the other edition was queued manually): queueing it as well would
 * download both editions into the same folder.
 */
export function excludeQueuedEditions<T extends EditionCandidate>(
  candidates: T[],
  queue: ProcessingItemType[],
  preference: ExplicitPreference = getExplicitPreference(),
): EditionSelection<T> {
  if (preference === "both") {
    return { selected: candidates, skipped: [] };
  }

  const queuedKeys = new Map<string, Set<string>>();
  for (const queued of queue) {
    if (queued.type !== "album") continue;
    const key = editionKey(queued.artist ?? "", queued.title ?? "");
    const ids = queuedKeys.get(key) ?? new Set<string>();
    ids.add(String(queued.id));
    queuedKeys.set(key, ids);
  }

  const selected: T[] = [];
  const skipped: T[] = [];
  for (const candidate of candidates) {
    const ids = queuedKeys.get(
      editionKey(candidate.artist ?? "", candidate.title),
    );
    const isOtherEdition = !!ids && !ids.has(String(candidate.id));
    (isOtherEdition ? skipped : selected).push(candidate);
  }

  return { selected, skipped };
}

/**
 * One call for bulk queueing: pick one edition per album, then drop the ones
 * whose sibling edition is already queued.
 */
export function resolveEditions<T extends EditionCandidate>(
  candidates: T[],
  queue: ProcessingItemType[],
  preference: ExplicitPreference = getExplicitPreference(),
): EditionSelection<T> {
  const picked = selectEditions(candidates, preference);
  const afterQueue = excludeQueuedEditions(picked.selected, queue, preference);

  return {
    selected: afterQueue.selected,
    skipped: [...picked.skipped, ...afterQueue.skipped],
  };
}

export function describeSkipped(
  skipped: EditionCandidate[],
  preference: ExplicitPreference,
): string {
  return `🎚️ [EXPLICIT] Preference "${preference}": skipped ${skipped.length} duplicate edition(s)`;
}
