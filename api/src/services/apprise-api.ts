import {
  describeEndpoint,
  notificationText,
  sendNotification,
} from "../helpers/notify-http";
import { logs } from "../processing/utils/logs";
import { ProcessingItemType } from "../types";

export async function appriseApiPush(item: ProcessingItemType) {
  if (!process.env.APPRISE_API_ENDPOINT) {
    return;
  }

  console.log("--------------------");
  console.log(`🔔 APPRISE API PUSH `);
  console.log("--------------------");

  try {
    const url = process.env.APPRISE_API_ENDPOINT;
    const { title, message } = notificationText(item);
    const body = JSON.stringify({
      body: message,
      title,
      tag: process.env.APPRISE_API_TAG || "all",
    });

    console.log(`🕖 [APPRISE] URL: ${describeEndpoint(url)}`);
    const response = await sendNotification(url, {
      headers: { "Content-Type": "application/json" },
      body,
    });

    logs(item.id, `✅ [APPRISE] API request success:\r\n${response}`);
  } catch (e: unknown) {
    logs(item.id, `❌ [APPRISE] API request error:\r\n${(e as Error).message}`);
  }
}
