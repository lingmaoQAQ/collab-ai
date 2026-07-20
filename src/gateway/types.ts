// Gateway 协议类型 — JSON-based, extensible
import type { WebSocket } from "ws";

// Node → Gateway
export type NodeMessage =
  | { type: "hello"; roomId: string; user: string; workspace: string }
  | { type: "chat"; text: string }
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
  | { type: "tool_call"; callId: string; tool: string; args: Record<string, string> }
  | { type: "error"; message: string };

export interface GatewayNode {
  ws: WebSocket;
  user: string;
  roomId: string;
  workspace: string;
  connectedAt: string;
}
