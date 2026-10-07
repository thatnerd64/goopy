import crypto from "crypto";

// Used when JWT_SECRET is not set (no authentication configured): signed
// stream URLs only live a few minutes, so a per-process secret is enough.
let fallbackSecret: Buffer | undefined;

/**
 * The secret is read on every call: this module is imported before dotenv
 * loads the .env file, so reading it at import time would miss JWT_SECRET.
 * A dedicated key is derived so the JWT secret is never used as-is here.
 */
function getSecret(): Buffer {
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    return crypto
      .createHmac("sha256", jwtSecret)
      .update("tidarr-stream-url-v1")
      .digest();
  }
  fallbackSecret ??= crypto.randomBytes(32);
  return fallbackSecret;
}

/**
 * Generates an HMAC signature for a streaming resource.
 * @param id Identifier of the resource (track, etc.)
 * @param expires Expiration timestamp in seconds
 * @returns Hex-encoded signature
 */
export function signUrl(id: string, expires: number): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${id}:${expires}`)
    .digest("hex");
}

/**
 * Constant-time check of a signature produced by `signUrl`.
 */
export function verifySignature(
  id: string,
  expires: number,
  signature: unknown,
): boolean {
  if (typeof signature !== "string") return false;
  const expected = Buffer.from(signUrl(id, expires), "hex");
  const received = Buffer.from(signature, "hex");
  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
}
