// 记忆类型定义 v0.3.0 — room 级别隔离

export type MemoryCategory = "decision" | "knowledge" | "style" | "general";

export interface MemoryEntry {
  id?: number;
  roomId: string;
  key: string;
  value: string;
  category: MemoryCategory;
  authorId?: string;
  createdAt?: string;
  updatedAt?: string;
}
