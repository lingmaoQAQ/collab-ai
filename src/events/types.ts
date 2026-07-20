// 项目活动事件类型

export type EventType =
  | "room_created"
  | "member_joined"
  | "member_left"
  | "session_started"
  | "message_sent"
  | "memory_added"
  | "memory_updated"
  | "summary_generated";

export interface ProjectEvent {
  id?: number;
  roomId: string;
  userId?: string;
  userName?: string; // JOIN 填充
  eventType: EventType;
  payload: Record<string, unknown>;
  createdAt?: string;
}
