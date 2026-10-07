import { Router } from "express";
import { pipeline } from "stream";
import { promisify } from "util";

import { ensureAccessIsGranted } from "../helpers/auth";
import { get_tiddl_config } from "../helpers/get_tiddl_config";
import { signUrl, verifySignature } from "../helpers/signature";
import { getPlaybackInfo } from "../services/playback";

const streamPipeline = promisify(pipeline);
const router = Router();

// Tidal track ids are numeric; the id ends up in a Tidal API URL
const TRACK_ID = /^\d{1,20}$/;
const SIGNED_URL_TTL_SECONDS = 300;
const MAX_SIGNED_URL_TTL_SECONDS = 3600;

// Endpoint firm URL. Needs a valid login: the <audio> element cannot send
// an Authorization header, so it plays the signed URL returned here instead.
router.get("/stream/sign/:id", ensureAccessIsGranted, (req, res) => {
  const id = String(req.params.id ?? "");
  if (!TRACK_ID.test(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }

  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const sig = signUrl(id, expires);

  const url = `/api/stream/play/${id}?exp=${expires}&sig=${sig}`;

  res.json({ url });
});

// Endpoint play
router.get("/stream/play/:id", async (req, res) => {
  const id = String(req.params.id ?? "");
  const { exp, sig } = req.query as { exp?: unknown; sig?: unknown };

  if (!TRACK_ID.test(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }

  if (typeof exp !== "string" || typeof sig !== "string") {
    return res.status(403).json({ error: "Missing signature" });
  }

  // Strict integer: parseInt("abc") is NaN and NaN passes any "expired" comparison
  if (!/^\d{1,12}$/.test(exp)) {
    return res.status(403).json({ error: "Invalid signature" });
  }
  const expires = Number(exp);
  const now = Math.floor(Date.now() / 1000);

  if (now > expires) {
    return res.status(403).json({ error: "URL expired" });
  }

  if (
    expires - now > MAX_SIGNED_URL_TTL_SECONDS ||
    !verifySignature(id, expires, sig)
  ) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  try {
    const tiddlConfig = req.app.locals.tiddlConfig || get_tiddl_config().config;
    const token = tiddlConfig?.auth?.token;
    const country = tiddlConfig?.auth?.country_code || "EN";

    if (!token) {
      return res.status(400).json({ error: "No proxy token available" });
    }

    const qualities = ["LOSSLESS", "HIGH", "LOW"];
    let chosenUrl: string | null = null;

    for (const q of qualities) {
      const urls = await getPlaybackInfo(id, q, token, country);
      if (urls && urls.length > 0) {
        chosenUrl = urls[0];
        break;
      }
    }

    if (!chosenUrl) {
      return res.status(502).json({ error: "No playable quality available" });
    }

    const range = req.headers["range"];
    const upstream = await fetch(chosenUrl, {
      headers: range ? { Range: range as string } : {},
    });

    if (!upstream.ok || !upstream.body) {
      return res
        .status(upstream.status)
        .json({ error: "Upstream fetch failed" });
    }

    res.status(upstream.status);
    const hopHeaders = [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
      "cache-control",
      "expires",
      "last-modified",
      "etag",
    ];
    hopHeaders.forEach((h) => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    await streamPipeline(upstream.body, res);
  } catch (err) {
    // Ignore premature close errors (client stopped playback)
    const error = err as Error & { code?: string };
    if (error.code === "ERR_STREAM_PREMATURE_CLOSE") {
      // Client disconnected, this is normal when user stops playback
      return;
    }

    console.error("Error in /api/stream/play:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.end();
    }
  }
});

export default router;
