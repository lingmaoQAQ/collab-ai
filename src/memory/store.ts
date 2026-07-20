// 跨会话记忆存储 — 项目关键决策和知识点

import type Database from "better-sqlite3";
import { getDatabase } from "../sessions/database.js";
import type { MemoryEntry } from "./types.js";

export class MemoryStore {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.initTable();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general'
          CHECK(category IN ('decision', 'knowledge', 'style', 'general')),
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  set(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): void {
    this.db.prepare(`
      INSERT INTO memories (key, value, category, session_id, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        updated_at = datetime('now')
    `).run(entry.key, entry.value, entry.category, entry.sessionId || null);
  }

  get(key: string): MemoryEntry | null {
    return this.db.prepare(`
      SELECT id, key, value, category, session_id AS sessionId,
             created_at AS createdAt, updated_at AS updatedAt
      FROM memories WHERE key = ?
    `).get(key) as MemoryEntry | null;
  }

  list(category?: string, limit = 50): MemoryEntry[] {
    const sql = category
      ? "SELECT * FROM memories WHERE category = ? ORDER BY updated_at DESC LIMIT ?"
      : "SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?";
    const params = category ? [category, limit] : [limit];
    return this.db.prepare(sql).all(...params) as MemoryEntry[];
  }

  search(query: string, limit = 10): MemoryEntry[] {
    return this.db.prepare(`
      SELECT id, key, value, category, session_id AS sessionId,
             created_at AS createdAt, updated_at AS updatedAt
      FROM memories
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit) as MemoryEntry[];
  }

  delete(key: string): void {
    this.db.prepare("DELETE FROM memories WHERE key = ?").run(key);
  }
}
