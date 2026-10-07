import crypto from "crypto";

import { Response } from "express";
import jwt from "jsonwebtoken";

import { safeEqual } from "../helpers/safe-compare";

export const JWT_ALGORITHM = "HS256";

/**
 * Fingerprint of the admin password stored in the JWT instead of the password
 * itself (a JWT payload is only base64: anyone holding the token could read it).
 * It still invalidates every token when ADMIN_PASSWORD or JWT_SECRET changes.
 */
export function passwordFingerprint(
  password: string,
  jwtSecret: string,
): string {
  return crypto
    .createHmac("sha256", jwtSecret)
    .update(`tidarr-admin-password:${password}`)
    .digest("hex");
}

/**
 * Sends the response and returns whether the authentication succeeded.
 */
export async function proceed_auth(
  password: unknown,
  res: Response,
): Promise<boolean> {
  const envPassword = process.env?.ADMIN_PASSWORD;
  const jwtSecret = process.env?.JWT_SECRET;

  const isAllowed = !envPassword || safeEqual(password, envPassword);

  if (!jwtSecret) {
    res.status(401).json({
      error: true,
      message: "No JWT secret",
    });
    return false;
  }

  if (!isAllowed) {
    res.status(401).json({
      error: true,
      message: "Invalid credentials",
    });
    return false;
  }

  // Generate token
  const claims = envPassword
    ? { tidarrPwd: passwordFingerprint(envPassword, jwtSecret) }
    : {};
  const token = jwt.sign(claims, jwtSecret, {
    expiresIn: "12h",
    algorithm: JWT_ALGORITHM,
  });

  res.status(200).send({ accessGranted: true, token });
  return true;
}

export function is_oidc_configured() {
  return !!(
    process.env?.OIDC_ISSUER &&
    process.env?.OIDC_CLIENT_ID &&
    process.env?.OIDC_CLIENT_SECRET &&
    process.env?.OIDC_REDIRECT_URI
  );
}

export function is_auth_active() {
  return !!process.env?.ADMIN_PASSWORD || is_oidc_configured();
}

export function get_auth_type(): "password" | "oidc" | null {
  if (process.env?.ADMIN_PASSWORD) return "password";
  if (is_oidc_configured()) return "oidc";
  return null;
}
