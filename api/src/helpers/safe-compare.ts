import crypto from "crypto";

/**
 * Constant-time string comparison. Both values are hashed first so the
 * comparison time does not depend on their length either.
 */
export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const digest = (value: string) =>
    crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}
