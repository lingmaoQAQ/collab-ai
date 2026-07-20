// 会话和消息类型定义

export interface Session {
  id: string;
  title: string;
  modelId: string;
  createdAt: string;    // ISO 8601
  updatedAt: string;
  messageCount: number;
  summary: string | null;  // 对话摘要（LLM 生成）
}

export interface Message {
  id?: number;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  preview: string;  // 最后一条用户消息的截断
}
