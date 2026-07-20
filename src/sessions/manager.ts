// SessionManager v0.3.0 — room + user 感知的会话管理

import { SessionStore } from "./store.js";
import type { UserSession, SessionMessage, SessionSummary } from "./types.js";
import type { LlmRuntime, Model } from "../llm/index.js";

export interface SessionContext {
  session: UserSession;
  messages: SessionMessage[];
}

export class SessionManager {
  private store: SessionStore;
  private roomId: string;
  private userId: string;
  private currentSession: UserSession | null = null;

  constructor(roomId: string, userId: string, store?: SessionStore) {
    this.store = store || new SessionStore();
    this.roomId = roomId;
    this.userId = userId;
  }

  get room(): string { return this.roomId; }
  get user(): string { return this.userId; }

  /** 创建新会话 */
  startSession(title: string, modelId: string, systemPrompt?: string): UserSession {
    this.currentSession = this.store.create(
      this.roomId, this.userId, title, modelId, systemPrompt,
    );
    return this.currentSession;
  }

  /** 加载已有会话（权限检查：只能加载自己的） */
  loadSession(id: string): SessionContext | null {
    const session = this.store.get(id);
    if (!session) return null;
    if (session.userId !== this.userId) return null; // 隔离检查

    this.currentSession = session;
    const messages = this.store.getRecentMessages(id, 50);
    return { session, messages };
  }

  getCurrent(): UserSession | null {
    return this.currentSession;
  }

  /** 列出当前用户在当前房间的会话 */
  listSessions(limit?: number): SessionSummary[] {
    return this.store.listByUser(this.roomId, this.userId, limit);
  }

  /** 获取当前用户的最近会话 */
  getLatestSession(): UserSession | null {
    return this.store.getLatestForUser(this.roomId, this.userId);
  }

  saveMessage(role: SessionMessage["role"], content: string): void {
    if (!this.currentSession) return;
    this.store.addMessage({
      sessionId: this.currentSession.id,
      role,
      content,
    });
  }

  getMessages(limit?: number): SessionMessage[] {
    if (!this.currentSession) return [];
    return this.store.getRecentMessages(this.currentSession.id, limit ?? 50);
  }

  deleteSession(id?: string): void {
    const targetId = id || this.currentSession?.id;
    if (!targetId) return;
    // 权限检查
    const session = this.store.get(targetId);
    if (session && session.userId !== this.userId) return;

    this.store.delete(targetId);
    if (this.currentSession?.id === targetId) {
      this.currentSession = null;
    }
  }

  clearMessages(): void {
    if (!this.currentSession) return;
    this.store.deleteMessages(this.currentSession.id);
  }

  updateSummary(summary: string): void {
    if (!this.currentSession) return;
    this.store.updateSummary(this.currentSession.id, summary);
  }

  updateTitle(title: string): void {
    if (!this.currentSession) return;
    this.store.updateTitle(this.currentSession.id, title);
  }

  touch(id?: string): void {
    const targetId = id || this.currentSession?.id;
    if (!targetId) return;
    this.store.touch(targetId);
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
    messages: [{
      role: "user",
      content: `根据以下内容生成一个简短的会话标题（不超过15个字，不要引号，直接返回标题）：\n\n${firstMessage}`,
    }],
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
  messages: SessionMessage[],
): Promise<string> {
  const context = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content.slice(0, 300)}`)
    .join("\n\n");

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
  return summary.trim();
}
