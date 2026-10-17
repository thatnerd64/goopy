import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { getOrCreateApiKey } from "../services/api-key";
import {
  is_oidc_configured,
  JWT_ALGORITHM,
  passwordFingerprint,
} from "../services/auth";

import { safeEqual } from "./safe-compare";

/**
 * Routes usable with a JWT or with the API key (*arr apps, scripts):
 * queue, history, sync, settings, playback, Lidarr/SABnzbd.
 */
export function ensureAccessIsGranted(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  checkAccess(req, res, next, true);
}

/**
 * Admin routes that need a logged-in user (JWT): they can read or replace the
 * API key, rewrite the tiddl config, re-link the Tidal account or call the
 * Tidal API with the account token. A leaked API key (it is often sent in the
 * query string and lands in proxy logs) must not unlock them.
 */
export function ensureAdminAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  checkAccess(req, res, next, false);
}

function checkAccess(
  req: Request,
  res: Response,
  next: NextFunction,
  allowApiKey: boolean,
) {
  const jwtSecret = process.env?.JWT_SECRET;
  const authHeader = req?.headers?.["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const envPassword = process.env?.ADMIN_PASSWORD;
  const enableOidc = is_oidc_configured();

  // Check for API key (used by *arr apps: Lidarr, Radarr, Sonarr, etc.)
  // They can send it via X-Api-Key header OR apikey query parameter
  const xApiKey = req.headers["x-api-key"] as string;
  const queryApiKey = req.query?.apikey as string;
  const providedApiKey = xApiKey || queryApiKey;

  // No auth configured
  if (!envPassword && !enableOidc) return next();

  if (!jwtSecret) {
    res
      .status(403)
      .json({ error: true, message: "JWT secret key is missing." });
    return;
  }

  // If API key is provided (*arr apps), validate it
  if (providedApiKey && !token) {
    if (!allowApiKey) {
      res.status(403).json({
        error: true,
        message: "The API key is not accepted on this endpoint",
      });
      return;
    }
    if (safeEqual(providedApiKey, getOrCreateApiKey())) {
      return next();
    }
    res.status(403).json({ error: true, message: "Invalid API key" });
    return;
  }

  if (!token) {
    res.status(403).json({ error: true, message: "Token required" });
    return;
  }

  jwt.verify(
    token,
    jwtSecret,
    { algorithms: [JWT_ALGORITHM] },
    (err, decoded) => {
      if (err) {
        res.status(403).json({ error: true, message: "JWT decode failed" });
        return;
      }

      if (!isTokenValid(decoded as jwt.JwtPayload, jwtSecret)) {
        res.status(403).json({ error: true, message: "Invalid token" });
        return;
      }

      return next();
    },
  );
}

/**
 * A token is valid when it was issued by an auth method that is still
 * enabled: a password token must carry the fingerprint of the current
 * ADMIN_PASSWORD, an OIDC token needs OIDC to still be configured. When both
 * methods are configured, either kind of token is accepted.
 */
export function isTokenValid(
  payload: jwt.JwtPayload,
  jwtSecret: string,
): boolean {
  const envPassword = process.env?.ADMIN_PASSWORD;

  if (
    envPassword &&
    typeof payload.tidarrPwd === "string" &&
    safeEqual(payload.tidarrPwd, passwordFingerprint(envPassword, jwtSecret))
  ) {
    return true;
  }

  return (
    is_oidc_configured() &&
    typeof payload.oidcSub === "string" &&
    payload.oidcSub.length > 0
  );
}
