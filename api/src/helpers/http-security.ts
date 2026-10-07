import cors from "cors";
import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * CORS is off by default: the web interface is served by this same server, so
 * browsers never need it. Allowing every origin would let any website you visit
 * call the API of a Tidarr running without a password.
 *
 * CORS_ORIGIN="*"                           any origin
 * CORS_ORIGIN="https://a.example,https://b" an allow-list
 */
export function buildCorsMiddleware(
  raw: string | undefined = process.env.CORS_ORIGIN,
): RequestHandler | null {
  const value = raw?.trim().replace(/^["']|["']$/g, "");
  if (!value) return null;
  if (value === "*") return cors({ origin: "*" });

  const origins = value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return cors({ origin: origins });
}

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
}

export function noStore(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}

/**
 * TRUST_PROXY tells Express how to find the real client IP behind a reverse
 * proxy (used by the login rate limiter). Accepts "true", a hop count
 * ("1"), or any Express value ("loopback", "10.0.0.0/8", ...).
 */
export function parseTrustProxy(
  raw: string | undefined = process.env.TRUST_PROXY,
): boolean | number | string | undefined {
  const value = raw?.trim().replace(/^["']|["']$/g, "");
  if (!value || value === "false") return undefined;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
