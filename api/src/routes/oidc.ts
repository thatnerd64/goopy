import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";

import { FailureLimiter } from "../helpers/rate-limit";
import { JWT_ALGORITHM } from "../services/auth";
import { isOidcUserAllowed, OidcClaims } from "../services/oidc";

const router = Router();

// Store OIDC state and code verifier temporarily (in production, use Redis or signed cookies)
const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_STATES = 1000;
const oidcStates = new Map<
  string,
  { state: string; codeVerifier: string; timestamp: number }
>();

// Each login fetches the provider discovery document and stores a state:
// 30 login attempts per 15 minutes and per IP
const oidcLoginLimiter = new FailureLimiter(30, 15 * 60 * 1000);

// Clean expired states every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of oidcStates.entries()) {
      if (now - value.timestamp > STATE_TTL_MS) {
        oidcStates.delete(key);
      }
    }
    oidcLoginLimiter.prune();
  },
  5 * 60 * 1000,
).unref();

function rememberState(state: string, codeVerifier: string) {
  // Maps keep insertion order: drop the oldest pending logins first
  while (oidcStates.size >= MAX_PENDING_STATES) {
    const oldest = oidcStates.keys().next().value;
    if (oldest === undefined) break;
    oidcStates.delete(oldest);
  }
  oidcStates.set(state, { state, codeVerifier, timestamp: Date.now() });
}

function takeState(state: string) {
  const stateData = oidcStates.get(state);
  oidcStates.delete(state);
  if (!stateData || Date.now() - stateData.timestamp > STATE_TTL_MS) {
    return undefined;
  }
  return stateData;
}

/**
 * Plain-http discovery is only allowed when the issuer itself is configured
 * with http:// (e.g. a provider on the local network).
 */
async function discover(issuerUrl: string, clientId: string, secret: string) {
  const oidc = await import("openid-client");
  const issuer = new URL(issuerUrl);
  const config = await oidc.discovery(
    issuer,
    clientId,
    secret,
    undefined,
    issuer.protocol === "http:"
      ? { execute: [oidc.allowInsecureRequests] }
      : undefined,
  );
  return { oidc, config };
}

/**
 * Where the browser lands after login. The OIDC_REDIRECT_URI is the public
 * callback URL registered with the provider, so its origin (and any sub-path
 * Tidarr is served under) is the public address of the web interface, with the
 * right scheme even behind an HTTPS reverse proxy.
 */
export function frontendUrlFromRedirectUri(redirectUri: string): string {
  if (process.env.ENVIRONMENT === "development")
    return "http://localhost:3000/";
  const url = new URL(redirectUri);
  const basePath = url.pathname.replace(/api\/auth\/oidc\/callback\/?$/, "");
  return `${url.origin}${basePath.endsWith("/") ? basePath : `${basePath}/`}`;
}

function errorDetails(error: unknown) {
  return process.env.NODE_ENV === "development"
    ? { details: error instanceof Error ? error.message : String(error) }
    : {};
}

/**
 * GET /api/auth/oidc/login
 * Redirect to OIDC provider for authentication
 */
router.get("/auth/oidc/login", async (req: Request, res: Response) => {
  const client = req.ip ?? "unknown";
  const retryAfter = oidcLoginLimiter.retryAfterSeconds(client);
  if (retryAfter > 0) {
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: true,
      message: "Too many login attempts. Try again later.",
    });
  }
  oidcLoginLimiter.recordFailure(client);

  try {
    const issuerUrl = process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_CLIENT_ID;
    const clientSecret = process.env.OIDC_CLIENT_SECRET;
    const redirectUri = process.env.OIDC_REDIRECT_URI;

    if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
      return res.status(500).json({
        error: true,
        message: "OIDC configuration is incomplete",
      });
    }

    const { oidc, config } = await discover(issuerUrl, clientId, clientSecret);

    // Generate state and PKCE code verifier for security
    const state = oidc.randomState();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    rememberState(state, codeVerifier);

    // Build authorization URL
    const authUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: process.env.OIDC_SCOPES || "openid profile email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    res.redirect(authUrl.href);
  } catch (error) {
    console.error("OIDC login error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to initiate OIDC login",
      ...errorDetails(error),
    });
  }
});

/**
 * GET /api/auth/oidc/callback
 * Handle OIDC callback and issue JWT token
 */
router.get("/auth/oidc/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).json({
        error: true,
        message: "Missing code or state parameter",
      });
    }

    // Validate state (CSRF protection)
    const stateData = takeState(state);
    if (!stateData) {
      return res.status(403).json({
        error: true,
        message: "Invalid state parameter",
      });
    }

    const issuerUrl = process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_CLIENT_ID;
    const clientSecret = process.env.OIDC_CLIENT_SECRET;
    const redirectUri = process.env.OIDC_REDIRECT_URI;
    const jwtSecret = process.env.JWT_SECRET;

    if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
      return res.status(500).json({
        error: true,
        message: "OIDC configuration is incomplete",
      });
    }

    if (!jwtSecret) {
      return res.status(500).json({
        error: true,
        message: "JWT secret is missing",
      });
    }

    const { oidc, config } = await discover(issuerUrl, clientId, clientSecret);

    // Exchange code for tokens (the query string is what the provider sent)
    const callbackUrl = new URL(redirectUri);
    callbackUrl.search = new URL(req.url, "http://localhost").search;

    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: stateData.codeVerifier,
      expectedState: state,
    });

    // Claims of the ID token, validated by openid-client
    const claims = tokens.claims() as OidcClaims | undefined;
    if (!claims?.sub) {
      return res.status(500).json({
        error: true,
        message: "No ID token received from provider",
      });
    }

    if (!isOidcUserAllowed(claims)) {
      console.warn(
        `⚠️ [OIDC] Login refused for "${claims.email ?? claims.sub}": not in OIDC_ALLOWED_EMAILS / OIDC_ALLOWED_SUBS / OIDC_ALLOWED_GROUPS`,
      );
      return res.status(403).json({
        error: true,
        message: "This account is not allowed to use Tidarr",
      });
    }

    // Generate Tidarr JWT
    const tidarrToken = jwt.sign(
      {
        oidcSub: claims.sub,
        email: claims.email,
        name: claims.name,
      },
      jwtSecret,
      { expiresIn: "12h", algorithm: JWT_ALGORITHM },
    );

    // The token goes in the fragment: browsers never send it to a server, so
    // it stays out of reverse-proxy access logs and Referer headers
    res.redirect(
      `${frontendUrlFromRedirectUri(redirectUri)}#token=${tidarrToken}`,
    );
  } catch (error) {
    console.error("OIDC callback error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to process OIDC callback",
    });
  }
});

export default router;
