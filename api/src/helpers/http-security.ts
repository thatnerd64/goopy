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

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

function allowedCorsOrigins(raw: string | undefined): string[] | "*" {
  const value = raw?.trim().replace(/^["']|["']$/g, "");
  if (!value) return [];
  if (value === "*") return "*";
  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * CSRF protection: browsers flag every request with Sec-Fetch-Site. A page on
 * another site (or another port of the same host) must not be able to change
 * anything, even when Tidarr runs without a password: a plain HTML form can
 * POST to any URL without a CORS preflight. Servers (Lidarr, scripts) don't
 * send the header and are not affected. Origins listed in CORS_ORIGIN are
 * allowed.
 */
export function rejectCrossSiteRequests(
  raw: string | undefined = process.env.CORS_ORIGIN,
): RequestHandler {
  const allowed = allowedCorsOrigins(raw);
  return (req, res, next) => {
    if (SAFE_METHODS.includes(req.method)) return next();

    const site = req.headers["sec-fetch-site"];
    if (site !== "cross-site" && site !== "same-site") return next();

    const origin = req.headers.origin?.replace(/\/$/, "");
    if (allowed === "*" || (origin && allowed.includes(origin))) return next();

    res
      .status(403)
      .json({ error: true, message: "Cross-site request refused" });
  };
}

/**
 * The API reads JSON bodies only. Refusing the content types an HTML form can
 * send (urlencoded, multipart, text/plain) closes the other CSRF path, for
 * browsers that don't send Sec-Fetch-Site. Requests without a body (no
 * Content-Type) are fine.
 */
export function requireJsonBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const contentType = req.headers["content-type"];
  if (SAFE_METHODS.includes(req.method) || !contentType) return next();

  // Not req.is(): it returns null for an empty body, and the web interface
  // sends "application/json" on some body-less POSTs
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType === "application/json" || mediaType.endsWith("+json")) {
    return next();
  }

  res.status(415).json({
    error: true,
    message: "Content-Type must be application/json",
  });
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
