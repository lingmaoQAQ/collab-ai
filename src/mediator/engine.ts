// AI Mediator — 跨用户感知 + 冲突检测 + 风格学习

import type Database from "better-sqlite3";
import { getDatabase } from "../sessions/database.js";
import { UserManager } from "../identity/manager.js";
import { SessionStore } from "../sessions/store.js";
import { EventStore } from "../events/store.js";
import type { LlmRuntime, Model } from "../llm/index.js";
import type {
  WhatsNewResult, EnhanceResult, EnhanceParams, AnalyzeParams,
} from "./types.js";
import { extractKeywords, keywordOverlap } from "./types.js";

export class Mediator {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /** 用户恢复会话时：显示自上次以来的变化 */
  whatsNew(roomId: string, userId: string, since?: string): WhatsNewResult {
    const eventStore = new EventStore(this.db);
    const userMgr = new UserManager(this.db);
    const sessionStore = new SessionStore(this.db);

    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const events = eventStore.list(roomId, 30);
    const newEvents = events
      .filter((e) => e.createdAt && e.createdAt > sinceDate && e.userId !== userId)
      .slice(0, 10)
      .map((e) => ({
        eventType: e.eventType,
        userName: e.userName || "未知",
        detail: describeEvent(e),
      }));

    // 其他用户的活跃会话
    const allMembers = userMgr.list();
    const activeUsers: WhatsNewResult["activeUsers"] = [];
    for (const member of allMembers) {
      if (member.id === userId) continue;
      const latest = sessionStore.getLatestForUser(roomId, member.id);
      if (latest && new Date(latest.updatedAt) > new Date(sinceDate)) {
        activeUsers.push({
          userId: member.id,
          userName: member.name,
          currentTopic: latest.title,
        });
      }
    }

    // 新增记忆
    const memories = this.db.prepare(`
      SELECT key FROM project_memories
      WHERE room_id = ? AND updated_at > ? AND author_id != ?
      ORDER BY updated_at DESC LIMIT 5
    `).all(roomId, sinceDate, userId) as Array<{ key: string }>;
    const newMemories = memories.map((m) => m.key);

    return { since: sinceDate, newEvents, activeUsers, newMemories };
  }

  /** 增强上下文：添加跨用户感知 */
  async enhanceContext(
    params: EnhanceParams,
    runtime?: LlmRuntime,
    model?: Model,
  ): Promise<EnhanceResult> {
    const { roomId, userId } = params;
    const userMgr = new UserManager(this.db);
    const sessionStore = new SessionStore(this.db);

    const currentUser = userMgr.get(userId);
    const allMembers = userMgr.list();
    const otherMembers = allMembers.filter((m) => m.id !== userId);

    // 1. 其他成员动态
    const othersActivity: string[] = [];
    for (const member of otherMembers) {
      const latest = sessionStore.getLatestForUser(roomId, member.id);
      if (latest) {
        const timeAgo = formatTimeAgo(latest.updatedAt);
        othersActivity.push(
          `- **${member.name}** 最近在 [${latest.title}]（${timeAgo}）`,
        );
      }
    }

    // 2. 冲突检测：比较当前用户和其他用户的关键词
    const conflictHints: string[] = [];
    const currentSession = sessionStore.getLatestForUser(roomId, userId);
    if (currentSession) {
      const myMsgs = sessionStore.getRecentMessages(currentSession.id, 20);
      const myContent = myMsgs.map((m) => m.content).join(" ");
      const myKeywords = extractKeywords(myContent);

      for (const member of otherMembers) {
        const theirSession = sessionStore.getLatestForUser(roomId, member.id);
        if (!theirSession || theirSession.id === currentSession.id) continue;

        const theirMsgs = sessionStore.getRecentMessages(theirSession.id, 20);
        const theirContent = theirMsgs.map((m) => m.content).join(" ");
        const theirKeywords = extractKeywords(theirContent);

        const overlap = keywordOverlap(myKeywords, theirKeywords);
        if (overlap > 0.3) {
          const shared = myKeywords.filter((k) => theirKeywords.includes(k));
          conflictHints.push(
            `⚠️ 你和 **${member.name}** 最近都在讨论相关话题（${shared.slice(0, 3).join("、")}），建议同步以避免冲突。`,
          );
        }
      }
    }

    // 3. 用户风格指引
    let styleGuidance = "";
    if (currentUser?.profile) {
      const p = typeof currentUser.profile === "string"
        ? JSON.parse(currentUser.profile as string)
        : currentUser.profile;
      if (p.codingStyle) {
        styleGuidance = `\n## 你的编码风格偏好\n${p.codingStyle}`;
      }
    }

    // 4. 组装
    let addition = "";
    if (othersActivity.length) {
      addition += "## 团队成员动态\n" + othersActivity.join("\n") + "\n\n";
    }
    if (conflictHints.length) {
      addition += "## ⚠️ 协作提醒\n" + conflictHints.join("\n") + "\n\n";
    }
    if (addition) {
      addition += "请作为项目团队的一员，了解上述上下文后协作回答。";
    }

    return { addition, conflictHints, styleGuidance };
  }

  /** 对话后分析：学习用户风格 */
  async analyzeTurn(
    params: AnalyzeParams,
    runtime?: LlmRuntime,
    model?: Model,
  ): Promise<void> {
    const { userId, userMessage, aiResponse } = params;
    if (!runtime || !model) return; // 需要 LLM 来分析

    const userMgr = new UserManager(this.db);
    const user = userMgr.get(userId);
    if (!user) return;

    // 对话太短不分析（至少要有一轮有实质内容的对话）
    const combined = userMessage + aiResponse;
    if (combined.length < 50) return;

    try {
      const stream = runtime.streamSimple({
        model,
        messages: [{
          role: "user",
          content: `分析以下对话中开发者的编码偏好。提取3-5个关键特征，用简洁标签描述。
不要包含代码示例，只输出特征标签。格式：特征1, 特征2, 特征3

开发者消息: ${userMessage.slice(0, 500)}
AI回复: ${aiResponse.slice(0, 300)}`,
        }],
        maxTokens: 80,
        temperature: 0.3,
      });

      let analysis = "";
      for await (const event of stream) {
        if (event.type === "text_delta") analysis += event.text;
      }

      if (analysis.trim()) {
        const existing = typeof user.profile === "object" ? user.profile : {};
        userMgr.updateProfile(userId, {
          codingStyle: analysis.trim(),
          preferences: { ...(existing.preferences || {}), lastAnalyzed: new Date().toISOString() },
        });
      }
    } catch {
      // 风格学习失败不影响主流程
    }
  }
}

// ---- 辅助 ----

function describeEvent(
  e: { eventType: string; payload: Record<string, unknown> },
): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.eventType) {
    case "room_created": return `创建了项目`;
    case "member_joined": return `加入了项目`;
    case "session_started": return `开始了新会话`;
    case "memory_added": return `记录了记忆: ${p.key || ""}`;
    case "summary_generated": return `生成了会话摘要`;
    case "message_sent": return `发送了消息`;
    default: return e.eventType;
  }
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}
