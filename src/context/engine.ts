// Context Engine — 用户上下文 + 项目上下文动态组装

import type Database from "better-sqlite3";
import { getDatabase } from "../sessions/database.js";
import { UserManager, RoomManager } from "../identity/manager.js";
import { MemoryStore } from "../memory/store.js";
import { EventStore } from "../events/store.js";
import type { LlmRuntime, Model } from "../llm/index.js";
import type {
  AssembleParams, AssembleResult, ContextMessage,
  CompactParams, CompactResult, AfterTurnParams,
} from "./types.js";

/** 估算 token 数：中文 ~3 字符/token，英文 ~4 字符/token */
function estimateTokens(text: string): number {
  let chars = 0;
  let cjk = 0;
  for (const ch of text) {
    chars++;
    if (/[一-鿿㐀-䶿]/.test(ch)) cjk++;
  }
  // CJK 字符约占 0.5 token/char，非 CJK 约 0.25 token/char
  return Math.ceil(cjk * 0.5 + (chars - cjk) * 0.25);
}

function estimateMessagesTokens(msgs: ContextMessage[]): number {
  return msgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/** 按 token 预算裁剪消息列表（保留最近的） */
function trimMessages(messages: ContextMessage[], budget: number): ContextMessage[] {
  // 保留 system 消息
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  const sysTokens = estimateMessagesTokens(system);
  let available = budget - sysTokens;
  const result: ContextMessage[] = [];

  // 从最新往旧取，直到用完 budget
  for (let i = rest.length - 1; i >= 0 && available > 0; i--) {
    const t = estimateTokens(rest[i].content);
    if (t <= available) {
      result.unshift(rest[i]);
      available -= t;
    } else {
      break;
    }
  }

  return [...system, ...result];
}

/** 按 token 预算裁剪文本 */
function trimText(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;
  // 简单截断：从前面截掉（前面的信息更旧/更不重要）
  const lines = text.split("\n");
  let result = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = lines[i] + "\n" + result;
    if (estimateTokens(candidate) > budget) break;
    result = candidate;
  }
  return result.trim();
}

/** 格式化记忆列表为文本 */
function formatMemories(memories: Array<{ key: string; value: string; category: string }>): string {
  if (!memories.length) return "暂无项目记录。";
  const byCategory: Record<string, string[]> = {};
  for (const m of memories) {
    (byCategory[m.category] ??= []).push(`- ${m.key}: ${m.value}`);
  }
  const labels: Record<string, string> = {
    decision: "## 架构决策", knowledge: "## 项目知识",
    style: "## 代码规范", general: "## 其他记录",
  };
  return Object.entries(byCategory)
    .map(([cat, items]) => `${labels[cat] || "## " + cat}\n${items.join("\n")}`)
    .join("\n\n");
}

/** 格式化事件列表为文本 */
function formatEvents(
  events: Array<{ eventType: string; userName?: string; payload: Record<string, unknown>; createdAt?: string }>,
): string {
  if (!events.length) return "";
  const lines = events.map((e) => {
    const who = e.userName || "系统";
    const desc: Record<string, string> = {
      room_created: "创建了项目",
      member_joined: "加入了项目",
      session_started: "开始了新会话",
      message_sent: "发送了消息",
      memory_added: `记录了记忆: ${(e.payload as any)?.key || ""}`,
      summary_generated: "生成了会话摘要",
    };
    return `- ${who} ${desc[e.eventType] || e.eventType}`;
  });
  return "## 最近活动\n" + lines.join("\n");
}

export class ContextEngine {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /** 组装完整上下文 */
  assemble(params: AssembleParams): AssembleResult {
    const {
      roomId, userId, systemPrompt, messages,
      maxTokens = 8000,
      userVsProjectRatio = 0.7,
    } = params;

    const userMgr = new UserManager(this.db);
    const roomMgr = new RoomManager(this.db);
    const memoryStore = new MemoryStore(roomId, this.db);
    const eventStore = new EventStore(this.db);

    const user = userMgr.get(userId);
    const room = roomMgr.get(roomId);
    const members = roomMgr.getMembers(roomId);
    const memories = memoryStore.list(undefined, 30);
    const events = eventStore.list(roomId, 10);

    // 1. 构建项目上下文文本
    const projectSections: string[] = [];

    if (room) {
      projectSections.push(
        `你正在协助 **${user?.name || userId}** 在项目 **"${room.name}"** 中工作。`,
      );
      if (room.description) {
        projectSections.push(`项目描述: ${room.description}`);
      }
    }

    if (members.length > 1) {
      const memberList = members
        .map((m) => `- ${m.userName || m.userId} (${m.role})`)
        .join("\n");
      projectSections.push(`## 团队成员\n${memberList}`);
    }

    projectSections.push(formatMemories(memories));

    const eventText = formatEvents(events);
    if (eventText) projectSections.push(eventText);

    const projectContext = projectSections.join("\n\n");

    // 2. Token 预算分配
    const projectBudget = Math.floor(maxTokens * (1 - userVsProjectRatio));
    const userBudget = maxTokens - projectBudget;

    // 3. 裁剪
    const trimmedProject = trimText(projectContext, projectBudget);
    const trimmedMessages = trimMessages(messages, userBudget);

    // 4. 构建注入文本
    const systemPromptAddition = [
      "<!-- 项目上下文（由 ContextEngine 自动注入） -->",
      trimmedProject,
      "<!-- 项目上下文结束 -->",
    ].join("\n");

    return {
      messages: trimmedMessages,
      estimatedTokens: estimateTokens(trimmedProject) + estimateMessagesTokens(trimmedMessages),
      systemPromptAddition,
    };
  }

  /** 会话后处理：生成摘要 */
  async afterTurn(
    params: AfterTurnParams,
    runtime: LlmRuntime,
    model: Model,
    updateSummary: (summary: string) => void,
  ): Promise<void> {
    const { messages } = params;
    const nonSystem = messages.filter((m) => m.role !== "system");
    if (nonSystem.length < 4) return; // 太短不摘要

    const context = nonSystem
      .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content.slice(0, 300)}`)
      .join("\n\n");

    try {
      const stream = runtime.streamSimple({
        model,
        messages: [{
          role: "user",
          content: `请用3-5句话总结以下对话的关键内容和决策（中文）：\n\n${context}`,
        }],
        maxTokens: 200,
        temperature: 0.3,
      });

      let summary = "";
      for await (const event of stream) {
        if (event.type === "text_delta") summary += event.text;
      }

      if (summary.trim()) {
        updateSummary(summary.trim());
      }
    } catch {
      // 摘要失败不应该影响主流程
    }
  }

  /** 压缩对话历史 — 生成摘要，保留最近 N 条 */
  compact(params: CompactParams): CompactResult {
    const { messages } = params;
    const nonSystem = messages.filter((m) => m.role !== "system");

    if (nonSystem.length <= 10) {
      return { compacted: false, keptMessageCount: messages.length };
    }

    // 保留最近 6 条（3 轮对话），其余标注为可压缩
    const keepCount = 6;
    return {
      compacted: true,
      keptMessageCount: keepCount + messages.filter((m) => m.role === "system").length,
    };
  }
}
