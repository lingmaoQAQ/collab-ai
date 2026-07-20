// 项目共享记忆存储 v0.3.0 — room 级别隔离

import type Database from "better-sqlite3";
import { getDatabase } from "../sessions/database.js";
import type { MemoryEntry, MemoryCategory } from "./types.js";

export class MemoryStore {
  private db: Database.Database;
  private roomId: string;

  constructor(roomId: string, db?: Database.Database) {
    this.db = db || getDatabase();
    this.roomId = roomId;
  }

  set(entry: Omit<MemoryEntry, "id" | "roomId" | "createdAt" | "updatedAt">): void {
    this.db.prepare(`
      INSERT INTO project_memories (room_id, key, value, category, author_id, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(room_id, key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        author_id = excluded.author_id,
        updated_at = datetime('now')
    `).run(
      this.roomId, entry.key, entry.value, entry.category,
      entry.authorId || null,
    );
  }

  get(key: string): MemoryEntry | null {
    return this.db.prepare(`
      SELECT id, room_id AS roomId, key, value, category,
             author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt
      FROM project_memories WHERE room_id = ? AND key = ?
    `).get(this.roomId, key) as MemoryEntry | null;
  }

  list(category?: MemoryCategory, limit = 50): MemoryEntry[] {
    const sql = category
      ? `SELECT id, room_id AS roomId, key, value, category,
                author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt
         FROM project_memories WHERE room_id = ? AND category = ?
         ORDER BY updated_at DESC LIMIT ?`
      : `SELECT id, room_id AS roomId, key, value, category,
                author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt
         FROM project_memories WHERE room_id = ?
         ORDER BY updated_at DESC LIMIT ?`;
    const params = category ? [this.roomId, category, limit] : [this.roomId, limit];
    return this.db.prepare(sql).all(...params) as MemoryEntry[];
  }

  /** 智能搜索：分词匹配 + 关键词权重排序 */
  search(query: string, limit = 10): MemoryEntry[] {
    // 提取关键词
    const keywords = query
      .split(/[\s,，。、；：！？]+/)
      .filter((k) => k.length > 0);

    if (keywords.length <= 1) {
      // 单关键词：用 LIKE
      return this.db.prepare(`
        SELECT id, room_id AS roomId, key, value, category,
               author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt
        FROM project_memories
        WHERE room_id = ? AND (key LIKE ? OR value LIKE ?)
        ORDER BY updated_at DESC LIMIT ?
      `).all(this.roomId, `%${query}%`, `%${query}%`, limit) as MemoryEntry[];
    }

    // 多关键词：构建动态评分查询
    // 注意：SQL中?的顺序是 scoring(先) → room_id → WHERE → LIMIT
    const likeClauses = keywords.map(() => `(key LIKE ? OR value LIKE ?)`).join(" OR ");
    const scoringParts = keywords.map(() => `(CASE WHEN key LIKE ? THEN 3 WHEN value LIKE ? THEN 1 ELSE 0 END)`).join(" + ");

    const params: (string | number)[] = [];
    // 1. 先填 scoring 参数（SELECT 中先出现）
    for (const kw of keywords) params.push(`%${kw}%`, `%${kw}%`);
    // 2. room_id
    params.push(this.roomId);
    // 3. WHERE 参数
    for (const kw of keywords) params.push(`%${kw}%`, `%${kw}%`);
    // 4. LIMIT
    params.push(limit);

    return this.db.prepare(`
      SELECT id, room_id AS roomId, key, value, category,
             author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt,
             (${scoringParts}) AS score
      FROM project_memories
      WHERE room_id = ? AND (${likeClauses})
      ORDER BY score DESC, updated_at DESC LIMIT ?
    `).all(...params) as MemoryEntry[];
  }

  delete(key: string): void {
    this.db.prepare(
      "DELETE FROM project_memories WHERE room_id = ? AND key = ?",
    ).run(this.roomId, key);
  }
}
