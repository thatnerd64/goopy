import { Express, Response } from "express";
import { Server } from "http";

import { waitForPendingWrites } from "../services/db-json";
import { stopPlexMonitor } from "../services/plex-monitor";

import { killAllChildProcesses } from "./child-processes";

// Docker sends SIGKILL 10 seconds after SIGTERM by default: finish before
const FORCE_EXIT_AFTER_MS = 8000;

let shuttingDown = false;

// Graceful shutdown
export async function gracefulShutdown(
  signal: string,
  app: Express,
  server: Server,
) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[INFO] ${signal} received. Starting graceful shutdown...`);

  // Force shutdown if something below hangs
  setTimeout(() => {
    console.error("[ERROR] Forced shutdown after timeout");
    process.exit(1);
  }, FORCE_EXIT_AFTER_MS).unref();

  // Stop Plex monitor
  stopPlexMonitor();

  // Close all active SSE connections
  const listConnections = app.locals.activeListConnections || [];
  console.log(
    `[INFO] Closing ${listConnections.length} processing list SSE connections...`,
  );
  listConnections.forEach((conn: Response) => {
    try {
      conn.end();
    } catch (error) {
      console.error("[ERROR] Failed to close SSE connection:", error);
    }
  });

  // Close all active item output SSE connections
  const itemOutputConnections: Map<string, Response[]> =
    app.locals.activeItemOutputConnections || new Map();
  let totalItemConnections = 0;
  itemOutputConnections.forEach((connections) => {
    totalItemConnections += connections.length;
    connections.forEach((conn) => {
      try {
        conn.end();
      } catch (error) {
        console.error(
          "[ERROR] Failed to close item output SSE connection:",
          error,
        );
      }
    });
  });
  console.log(
    `[INFO] Closing ${totalItemConnections} item output SSE connections...`,
  );

  try {
    // Stop the queue and the running download (re-queued on next start)
    await app.locals.processingStack?.actions.shutdown();

    // tiddl, beets, rsgain, custom scripts
    const killed = await killAllChildProcesses();
    if (killed > 0) console.log(`[INFO] Stopped ${killed} child process(es)`);

    // Let queue/history/sync list writes in progress land on disk
    await waitForPendingWrites();
  } catch (error) {
    console.error("[ERROR] Error during graceful shutdown:", error);
  }

  // Close the server
  server.close(() => {
    console.log("[INFO] HTTP server closed");
    process.exit(0);
  });
  // Keep-alive connections would hold server.close() until the timeout
  server.closeAllConnections?.();
}
