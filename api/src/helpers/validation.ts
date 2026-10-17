import { NextFunction, Request, Response } from "express";

import { ContentType, ProcessingItemType, QualityType } from "../types";

import { isSafeId } from "./safe-id";

/**
 * Validation helper for request body fields
 */
export function validateRequestBody(
  requiredFields: string[],
  optionalFields: string[] = [],
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== "object") {
      res
        .status(400)
        .json({ error: "Request body must be a valid JSON object" });
      return;
    }

    // Check for required fields
    const missingFields = requiredFields.filter(
      (field) => !(field in req.body),
    );

    if (missingFields.length > 0) {
      res.status(400).json({
        error: `Missing required field(s): ${missingFields.join(", ")}`,
      });
      return;
    }

    // Check for unknown fields
    const allowedFields = [...requiredFields, ...optionalFields];
    const unknownFields = Object.keys(req.body).filter(
      (field) => !allowedFields.includes(field),
    );

    if (unknownFields.length > 0) {
      console.warn(
        `[WARN] Unknown fields in request: ${unknownFields.join(", ")}`,
      );
    }

    next();
  };
}

const VALID_QUALITIES: QualityType[] = ["low", "normal", "high", "max"];
const VALID_ATMOS_FILTERS = ["none", "only", "allow"];

const VALID_TYPES = [
  "album",
  "track",
  "video",
  "playlist",
  "mix",
  "artist",
  "artist_videos",
  "favorite_albums",
  "favorite_tracks",
  "favorite_playlists",
  "favorite_videos",
  "favorite_artists",
];

/**
 * The url is handed to the tiddl CLI as an argument: it must not be able to
 * pass for an option (leading "-") nor contain whitespace/control characters.
 */
export function isSafeUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    url.length <= 2048 &&
    !url.startsWith("-") &&
    // oxlint-disable-next-line no-control-regex
    !/[\s\u0000-\u001f\u007f]/.test(url)
  );
}

/**
 * Validate item object structure for downloads
 */
function validateItem(item: unknown): item is {
  id: string | number;
  url?: string;
  type: string;
  status: string;
} {
  if (!item || typeof item !== "object") {
    return false;
  }

  const obj = item as Record<string, unknown>;

  // id is required and ends up in file paths: letters, digits, "-" and "_" only
  if (!isSafeId(obj.id)) {
    return false;
  }

  // type and status are required
  if (typeof obj.type !== "string" || typeof obj.status !== "string") {
    return false;
  }

  // url is optional but must be a safe string if present
  if (obj.url !== undefined && !isSafeUrl(obj.url)) {
    return false;
  }

  // quality and atmosFilter are passed to tiddl: fixed values only
  if (
    obj.quality !== undefined &&
    obj.quality !== null &&
    obj.quality !== "" &&
    !VALID_QUALITIES.includes(obj.quality as QualityType)
  ) {
    return false;
  }
  if (
    obj.atmosFilter !== undefined &&
    obj.atmosFilter !== null &&
    obj.atmosFilter !== "" &&
    !VALID_ATMOS_FILTERS.includes(obj.atmosFilter as string)
  ) {
    return false;
  }

  return VALID_TYPES.includes(obj.type);
}

/**
 * Builds the queued item from the fields a client may set. Everything else
 * (playlistId, source, retryCount, errorStage, ...) is server state: a client
 * must not be able to inject it, e.g. a playlistId the server would later
 * DELETE on Tidal when the item is removed.
 */
export function toQueueItem(
  raw: Record<string, unknown>,
  defaultQuality: QualityType | undefined,
): ProcessingItemType {
  const text = (value: unknown) =>
    typeof value === "string" ? value.slice(0, 500) : "";

  return {
    id: String(raw.id),
    artist: text(raw.artist),
    title: text(raw.title),
    type: raw.type as ContentType,
    status: "queue_download",
    quality: (raw.quality as QualityType) || (defaultQuality as QualityType),
    ...(raw.atmosFilter ? { atmosFilter: raw.atmosFilter as string } : {}),
    ...(typeof raw.explicit === "boolean" ? { explicit: raw.explicit } : {}),
    ...(raw.source === "lidarr" || raw.source === "tidarr"
      ? { source: raw.source }
      : {}),
    url: typeof raw.url === "string" ? raw.url : "",
    loading: true,
    error: false,
  };
}

/**
 * Middleware to validate item in request body
 */
export function validateItemMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { item } = req.body;

  if (!validateItem(item)) {
    res.status(400).json({
      error:
        "Invalid item structure. Required: { id: string|number (letters, digits, - and _ only), type: string, status: string, url?: string, quality?: low|normal|high|max, atmosFilter?: none|only|allow }",
    });
    return;
  }

  next();
}

/**
 * Validate ID parameter (must be non-empty string or number)
 */
function validateId(id: unknown): boolean {
  if (typeof id === "string" && id.trim().length > 0) {
    return true;
  }
  if (typeof id === "number" && !isNaN(id)) {
    return true;
  }
  return false;
}

/**
 * Middleware to validate ID in request body
 */
export function validateIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { id } = req.body;

  if (!validateId(id)) {
    res.status(400).json({
      error:
        "Invalid or missing 'id' field. Must be a non-empty string or number.",
    });
    return;
  }

  next();
}

/**
 * Middleware to validate a sync list item (it is queued later on by the cron job)
 */
export function validateSyncItemMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { item } = req.body;
  const valid =
    !!item &&
    typeof item === "object" &&
    isSafeId(item.id) &&
    typeof item.title === "string" &&
    VALID_TYPES.includes(item.type) &&
    (item.url === undefined || isSafeUrl(item.url));

  if (!valid) {
    res.status(400).json({
      error:
        "Invalid sync item. Required: { id (letters, digits, - and _ only), title: string, type: string, url?: string }",
    });
    return;
  }

  next();
}
