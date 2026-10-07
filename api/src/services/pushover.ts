import {
  describeEndpoint,
  notificationText,
  sendNotification,
} from "../helpers/notify-http";
import { logs } from "../processing/utils/logs";
import { ProcessingItemType } from "../types";

export async function hookPushOver(item: ProcessingItemType) {
  if (process.env.PUSH_OVER_URL) {
    console.log("--------------------");
    console.log(`🔔 PUSH OVER WEBHOOK`);
    console.log("--------------------");

    try {
      const url = process.env.PUSH_OVER_URL;
      const { title, message } = notificationText(item);
      const body = JSON.stringify({
        text: [title, message].join("\r\n"),
      });

      console.log(`🕖 [PUSHOVER WEBHOOK] URL: ${describeEndpoint(url)}`);

      await sendNotification(url, {
        headers: { "Content-Type": "application/json" },
        body,
      });

      logs(item.id, `✅ [PUSHOVER WEBHOOK] Success output`);
    } catch (e: unknown) {
      logs(item.id, `❌ [PUSHOVER WEBHOOK] Error:\r\n${(e as Error).message}`);
    }
  }
}
