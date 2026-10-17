import crypto from "crypto";
import fs from "fs";
import path from "path";

import { CONFIG_PATH } from "../../constants";

/**
 * Makes sure JWT_SECRET is set. When it is not provided through the
 * environment, a strong secret is generated once and kept in /shared, so
 * logins survive a restart (a per-start secret logged everybody out).
 */
export function ensureJwtSecret(
  secretFile: string = path.join(CONFIG_PATH, ".tidarr-jwt-secret"),
): void {
  if (process.env.JWT_SECRET) return;

  try {
    const stored = fs.readFileSync(secretFile, "utf-8").trim();
    if (stored.length >= 32) {
      process.env.JWT_SECRET = stored;
      return;
    }
  } catch {
    // Not created yet
  }

  const secret = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    console.log("🔑 [AUTH] Generated a new JWT secret");
  } catch (error) {
    console.warn(
      `⚠️ [AUTH] Could not save the JWT secret to ${secretFile}, sessions will not survive a restart:`,
      error instanceof Error ? error.message : error,
    );
  }
  process.env.JWT_SECRET = secret;
}
