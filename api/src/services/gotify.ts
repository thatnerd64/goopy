import {
  describeEndpoint,
  notificationText,
  sendNotification,
} from "../helpers/notify-http";
import { logs } from "../processing/utils/logs";
import { ProcessingItemType } from "../types";

export async function gotifyPush(item: ProcessingItemType) {
  if (process.env.GOTIFY_URL && process.env.GOTIFY_TOKEN) {
    console.log("--------------------");
    console.log(`🔔 GOTIFY            `);
    console.log("--------------------");

    try {
      const baseUrl = process.env.GOTIFY_URL.replace(/\/$/, "");
      const url = `${baseUrl}/message?token=${encodeURIComponent(process.env.GOTIFY_TOKEN)}`;
      const { title, message } = notificationText(item);

      const form = new FormData();
      form.append("title", title);
      form.append("message", message);
      form.append("priority", "5");

      console.log(`🕖 [GOTIFY] URL: ${describeEndpoint(baseUrl)}`);

      await sendNotification(url, { body: form });
      logs(item.id, `✅ [GOTIFY] Notification success`);
    } catch (e: unknown) {
      logs(item.id, `❌ [GOTIFY] Notification error: ${(e as Error).message}`);
    }
  }
}
