const TIMEOUT_MS = 10_000;

/**
 * Sends a notification request. Replaces the former `exec("curl ...")` calls:
 * no shell, so titles/artist names from Tidal can never be interpreted as commands.
 * Throws on network errors, timeouts and non-2xx responses.
 */
export async function sendNotification(
  url: string,
  init: RequestInit = {},
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  return body;
}

/**
 * Origin only: notification URLs usually embed a token or a secret path,
 * they must not end up in the logs.
 */
export function describeEndpoint(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "(invalid URL)";
  }
}

export function notificationText(item: {
  type: string;
  title?: string;
  artist?: string;
}) {
  return {
    title: `New ${item.type} added`,
    message: `${item.title}${item.artist ? " - " : ""}${item.artist || ""} added to music library`,
  };
}
