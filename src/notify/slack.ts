// Slack Webhook 通知

import type { Notification } from "./index.js";

export async function slackNotify(webhookUrl: string, msg: Notification): Promise<boolean> {
  try {
    const color = msg.level === "error" ? "#ff0000" : msg.level === "warning" ? "#ffaa00" : "#36a64f";
    const body = {
      attachments: [{
        color,
        title: msg.title,
        text: msg.text,
        fields: msg.fields,
        footer: "CollabAI Gateway",
        ts: Math.floor(Date.now() / 1000),
      }],
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
