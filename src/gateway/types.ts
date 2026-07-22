// Gateway 协议类型 — JSON-based, extensible
import type { WebSocket } from "ws";

/** 所有消息共有的基础字段 */
export interface BaseMessage {
  msgId?: string;       // 请求ID（用于请求/响应配对）
  replyTo?: string;     // 回复哪个请求
  timestamp?: string;   // ISO时间戳
}

// Node → Gateway
export type NodeMessage =
  | { type: "hello"; roomId: string; user: string; workspace: string }
  | { type: "chat"; text: string }
  | { type: "task"; taskType: string; to: string; payload: Record<string, unknown>; priority?: string }
  | { type: "task_reply"; replyTo: string; text: string; accepted: boolean }
  | { type: "remember"; key: string; value: string; category?: string }
  | { type: "recall"; query: string }
  | { type: "tool_result"; callId: string; result: string; isError?: boolean };

// Gateway → Node
export type GatewayMessage =
  | { type: "welcome"; room: { id: string; name: string }; members: Array<{ name: string; workspace: string }> }
  | { type: "broadcast"; from: string; text: string; timestamp: string }
  | { type: "ai_response"; text: string; timestamp: string }
  | { type: "activity"; from: string; text: string; timestamp: string }
  | { type: "joined"; user: string; workspace: string }
  | { type: "left"; user: string }
  | { type: "memory_update"; key: string; value: string }
  | { type: "recall_result"; query: string; results: string }
  | { type: "task_notify"; taskType: string; from: string; payload: Record<string, unknown>; priority: string; messageId: string; timestamp: string }
  | { type: "task_reply"; replyTo: string; from: string; text: string; accepted: boolean }
  | { type: "tool_call"; callId: string; tool: string; args: Record<string, string> }
  | { type: "error"; message: string; code?: string; retryable?: boolean };

export interface GatewayNode {
  ws: WebSocket;
  user: string;
  roomId: string;
  workspace: string;
  connectedAt: string;
}
