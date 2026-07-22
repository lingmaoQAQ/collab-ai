// 钉钉 Webhook 通知

import type { Notification } from "./index.js";

export async function dingtalkNotify(webhookUrl: string, msg: Notification): Promise<boolean> {
  try {
    const body = {
      msgtype: "markdown",
      markdown: {
        title: msg.title,
        text: `## ${msg.title}\n\n${msg.text}\n\n${(msg.fields || []).map((f) => `- ${f.name}: ${f.value}`).join("\n")}`,
      },
    };
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
