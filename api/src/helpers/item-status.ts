import { ProcessingItemType } from "../types";

// Statuses of an item that is waiting for or going through download/post-processing
const IN_FLIGHT_STATUSES: ProcessingItemType["status"][] = [
  "queue_download",
  "download",
  "queue_processing",
  "processing",
];

/**
 * True when re-adding the item would interrupt work in progress: replacing it
 * kills its download or deletes files waiting for post-processing.
 */
export function isInFlight(item?: Pick<ProcessingItemType, "status">) {
  return !!item && IN_FLIGHT_STATUSES.includes(item.status);
}
