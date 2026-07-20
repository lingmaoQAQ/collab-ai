// 记忆/知识条目类型

export interface MemoryEntry {
  id?: number;
  key: string;
  value: string;
  category: "decision" | "knowledge" | "style" | "general";
  sessionId?: string;
  createdAt?: string;
  updatedAt?: string;
}
