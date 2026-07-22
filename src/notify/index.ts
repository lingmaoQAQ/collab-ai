// 可插拔通知系统 — Slack / 钉钉 / 自定义
// 通过环境变量配置，未配置则不启用

import { slackNotify } from "./slack.js";
import { dingtalkNotify } from "./dingtalk.js";

export interface Notification {
  title: string;
  text: string;
  level?: "info" | "warning" | "error";
  fields?: Array<{ name: string; value: string }>;
}

export interface Notifier {
  name: string;
  send(msg: Notification): Promise<boolean>;
}

/** 根据环境变量自动创建通知器列表 */
export function createNotifiers(): Notifier[] {
  const list: Notifier[] = [];

  // Slack
  if (process.env.SLACK_WEBHOOK_URL) {
    list.push({
      name: "slack",
      send: (msg) => slackNotify(process.env.SLACK_WEBHOOK_URL!, msg),
    });
  }

  // 钉钉
  if (process.env.DINGTALK_WEBHOOK_URL) {
    list.push({
      name: "dingtalk",
      send: (msg) => dingtalkNotify(process.env.DINGTALK_WEBHOOK_URL!, msg),
    });
  }

  // 自定义 webhook（通用）
  if (process.env.NOTIFY_WEBHOOK_URL) {
    list.push({
      name: "webhook",
      send: async (msg) => {
        try {
          await fetch(process.env.NOTIFY_WEBHOOK_URL!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg),
          });
          return true;
        } catch { return false; }
      },
    });
  }

  return list;
}

/** 便利方法：向所有已配置的通知器发送消息 */
export async function notifyAll(notifiers: Notifier[], msg: Notification): Promise<void> {
  for (const n of notifiers) {
    n.send(msg).catch(() => {});
  }
}

/** 格式化通知文本 */
export function formatTaskNotification(
  taskType: string, from: string, to: string,
  payload: Record<string, unknown>,
): Notification {
  const typeLabels: Record<string, string> = {
    contract_change: "接口变更",
    dependency_alert: "依赖更新",
    review_request: "代码审查",
    knowledge_share: "知识分享",
    coordination: "协调消息",
  };
  return {
    title: `[CollabAI] ${from} → ${to}: ${typeLabels[taskType] || taskType}`,
    text: JSON.stringify(payload, null, 2).slice(0, 500),
    level: taskType === "contract_change" ? "warning" : "info",
    fields: [
      { name: "类型", value: taskType },
      { name: "发送者", value: from },
      { name: "接收者", value: to },
    ],
  };
}
