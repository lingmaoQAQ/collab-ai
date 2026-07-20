// 会话类型定义 v0.3.0 — 多用户版本

export interface UserSession {
  id: string;
  roomId: string;
  userId: string;
  modelId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summary: string | null;
}

export interface SessionMessage {
  id?: number;
  sessionId: string;
  role: "system" | "user" | "assistant" | "mediator";
  content: string;
  createdAt?: string;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  preview: string;
}
