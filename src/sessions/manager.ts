// SessionManager — 会话管理高层 API

import { SessionStore } from "./store.js";
import type { Session, Message, SessionSummary } from "./types.js";
import type { LlmRuntime, Model } from "../llm/index.js";

export interface SessionContext {
  session: Session;
  messages: Message[];
}

export class SessionManager {
  private store: SessionStore;
  private currentSession: Session | null = null;

  constructor(store?: SessionStore) {
    this.store = store || new SessionStore();
  }

  /** 创建新会话 */
  startSession(
    title: string,
    modelId: string,
    systemPrompt?: string,
  ): Session {
    this.currentSession = this.store.create(title, modelId, systemPrompt);
    return this.currentSession;
  }

  /** 加载已有会话 */
  loadSession(id: string): SessionContext | null {
    const session = this.store.get(id);
    if (!session) return null;

    this.currentSession = session;
    const messages = this.store.getRecentMessages(id, 50);
    return { session, messages };
  }

  /** 获取当前活跃会话 */
  getCurrent(): Session | null {
    return this.currentSession;
  }

  /** 列出所有会话 */
  listSessions(limit?: number): SessionSummary[] {
    return this.store.list(limit);
  }

  /** 保存消息到当前会话 */
  saveMessage(role: Message["role"], content: string): void {
    if (!this.currentSession) return;
    this.store.addMessage({
      sessionId: this.currentSession.id,
      role,
      content,
    });
  }

  /** 获取当前会话消息 */
  getMessages(limit?: number): Message[] {
    if (!this.currentSession) return [];
    return this.store.getRecentMessages(this.currentSession.id, limit ?? 50);
  }

  /** 删除当前会话 */
  deleteSession(id?: string): void {
    const targetId = id || this.currentSession?.id;
    if (!targetId) return;
    this.store.delete(targetId);
    if (this.currentSession?.id === targetId) {
      this.currentSession = null;
    }
  }

  /** 清除当前会话消息 */
  clearMessages(): void {
    if (!this.currentSession) return;
    this.store.deleteMessages(this.currentSession.id);
    // 重新添加系统提示词
    const messages = this.store.getMessages(this.currentSession.id);
    const sysMsg = messages.find((m) => m.role === "system");
    if (sysMsg) {
      this.store.addMessage({
        sessionId: this.currentSession.id,
        role: "system",
        content: sysMsg.content,
      });
    }
  }

  /** 更新摘要 */
  updateSummary(summary: string): void {
    if (!this.currentSession) return;
    this.store.updateSummary(this.currentSession.id, summary);
  }

  /** 更新时间戳 */
  touch(id?: string): void {
    const targetId = id || this.currentSession?.id;
    if (!targetId) return;
    this.store.touch(targetId);
  }

  /** 更新标题 */
  updateTitle(title: string): void {
    if (!this.currentSession) return;
    this.store.updateTitle(this.currentSession.id, title);
  }

  /** 更新最近一条会话 */
  getLatestSession(): Session | null {
    const rows = this.dbList();
    if (rows.length === 0) return null;
    return this.store.get(rows[0].sessionId);
  }

  private dbList(): SessionSummary[] {
    // 直接访问 store 的 list 方法
    return this.store.list(1);
  }
}

/** 用 LLM 生成会话标题 */
export async function generateTitle(
  runtime: LlmRuntime,
  model: Model,
  firstMessage: string,
): Promise<string> {
  const stream = runtime.streamSimple({
    model,
    messages: [
      {
        role: "user",
        content: `根据以下内容生成一个简短的会话标题（不超过15个字，不要引号，直接返回标题）：\n\n${firstMessage}`,
      },
    ],
    maxTokens: 30,
    temperature: 0.3,
  });

  let title = "";
  for await (const event of stream) {
    if (event.type === "text_delta") title += event.text;
  }

  return title.trim().replace(/^["']|["']$/g, "") || "未命名对话";
}

/** 用 LLM 生成对话摘要 */
export async function generateSummary(
  runtime: LlmRuntime,
  model: Model,
  messages: Message[],
): Promise<string> {
  const context = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content.slice(0, 300)}`)
    .join("\n\n");

  const stream = runtime.streamSimple({
    model,
    messages: [
      {
        role: "user",
        content: `请用3-5句话总结以下对话的关键内容和决策（中文）：\n\n${context}`,
      },
    ],
    maxTokens: 200,
    temperature: 0.3,
  });

  let summary = "";
  for await (const event of stream) {
    if (event.type === "text_delta") summary += event.text;
  }

  return summary.trim();
}
