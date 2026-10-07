import { Request, Response, Router } from "express";

import { FailureLimiter } from "../helpers/rate-limit";
import { validateRequestBody } from "../helpers/validation";
import { get_auth_type, is_auth_active, proceed_auth } from "../services/auth";
import { AuthResponse, IsAuthActiveResponse } from "../types";

const router = Router();

// 10 wrong passwords per 15 minutes and per IP (set TRUST_PROXY behind a reverse proxy)
const loginLimiter = new FailureLimiter(10, 15 * 60 * 1000);
setInterval(() => loginLimiter.prune(), 15 * 60 * 1000).unref();

/**
 * POST /api/auth
 * Authenticate with password and get JWT token
 */
router.post(
  "/auth",
  validateRequestBody(["password"]),
  async (req: Request, res: Response<AuthResponse>) => {
    const client = req.ip ?? "unknown";

    const retryAfter = loginLimiter.retryAfterSeconds(client);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: true,
        message: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      });
      return;
    }

    const granted = await proceed_auth(req.body.password, res);
    if (granted) loginLimiter.reset(client);
    else loginLimiter.recordFailure(client);
  },
);

/**
 * GET /api/is-auth-active
 * Check if authentication is enabled and get auth type
 */
router.get(
  "/is-auth-active",
  (_req: Request, res: Response<IsAuthActiveResponse>) => {
    res.status(200).json({
      isAuthActive: is_auth_active(),
      authType: get_auth_type(),
    });
  },
);

export default router;
