import path from "path";

// Tidal numeric ids, playlist UUIDs, mix ids, and the favorite_* type names:
// letters, digits, "_" and "-" only. No separators, dots, spaces or shell
// metacharacters, so an id can safely be used as a folder name.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isSafeId(id: unknown): id is string | number {
  if (typeof id === "number") return Number.isSafeInteger(id) && id >= 0;
  return typeof id === "string" && SAFE_ID.test(id);
}

export function assertSafeId(id: unknown, label = "id"): string {
  if (!isSafeId(id)) {
    throw new Error(
      `Invalid ${label}: only letters, digits, "-" and "_" are allowed`,
    );
  }
  return String(id);
}

/**
 * Resolves `child` under `base` and refuses anything that would escape it.
 */
export function resolveInside(base: string, child: string): string {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, child);
  if (
    resolved !== resolvedBase &&
    !resolved.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error(`Path escapes ${resolvedBase}`);
  }
  return resolved;
}
