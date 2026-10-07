import {
  describeEndpoint,
  notificationText,
  sendNotification,
} from "../helpers/notify-http";
import { logs } from "../processing/utils/logs";
import { ProcessingItemType } from "../types";

export async function ntfyPush(item: ProcessingItemType) {
  if (process.env.NTFY_URL && process.env.NTFY_TOPIC) {
    console.log("--------------------");
    console.log(`🔔 NTFY              `);
    console.log("--------------------");

    try {
      // ntfy use URL base + topic
      const url = `${process.env.NTFY_URL.replace(/\/$/, "")}/${encodeURIComponent(process.env.NTFY_TOPIC)}`;
      const { title, message } = notificationText(item);

      // priority setting by var (1-5), default = 3
      const priority = /^[1-5]$/.test(process.env.NTFY_PRIORITY || "")
        ? (process.env.NTFY_PRIORITY as string)
        : "3";

      const headers: Record<string, string> = {
        Title: title,
        Priority: priority,
      };
      if (process.env.NTFY_TOKEN) {
        headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
      }

      console.log(`🕖 [NTFY] URL: ${describeEndpoint(url)}`);

      const response = await sendNotification(url, { headers, body: message });
      logs(item.id, `✅ [NTFY] Notification success:\r\n${response}`);
    } catch (e: unknown) {
      logs(item.id, `❌ [NTFY] Notification error: ${(e as Error).message}`);
    }
  }
}
