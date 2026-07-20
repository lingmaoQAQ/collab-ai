// 会话持久化操作

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./database.js";
import type { Session, Message, SessionSummary } from "./types.js";

export class SessionStore {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  // ---- 会话操作 ----

  create(title: string, modelId: string, systemPrompt?: string): Session {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO sessions (id, title, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, title, modelId, now, now);

    // 如果有系统提示词，存为第一条消息
    if (systemPrompt) {
      this.addMessage({ sessionId: id, role: "system", content: systemPrompt });
    }

    return this.get(id)!;
  }

  get(id: string): Session | null {
    return this.db.prepare(`
      SELECT id, title, model_id AS modelId, created_at AS createdAt,
             updated_at AS updatedAt, message_count AS messageCount,
             summary
      FROM sessions WHERE id = ?
    `).get(id) as Session | null;
  }

  list(limit = 20): SessionSummary[] {
    const rows = this.db.prepare(`
      SELECT s.id AS sessionId, s.title, s.message_count AS messageCount,
             s.updated_at AS updatedAt,
             (SELECT content FROM messages WHERE session_id = s.id AND role = 'user'
              ORDER BY id DESC LIMIT 1) AS preview
      FROM sessions s
      ORDER BY s.updated_at DESC
      LIMIT ?
    `).all(limit) as SessionSummary[];
    return rows;
  }

  updateTitle(id: string, title: string): void {
    this.db.prepare(`
      UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?
    `).run(title, id);
  }

  updateSummary(id: string, summary: string): void {
    this.db.prepare(`
      UPDATE sessions SET summary = ?, updated_at = datetime('now') WHERE id = ?
    `).run(summary, id);
  }

  touch(id: string): void {
    this.db.prepare(`
      UPDATE sessions SET updated_at = datetime('now') WHERE id = ?
    `).run(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  // ---- 消息操作 ----

  addMessage(msg: Message): void {
    const result = this.db.prepare(`
      INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)
    `).run(msg.sessionId, msg.role, msg.content);

    // 更新计数器
    this.db.prepare(`
      UPDATE sessions SET message_count = message_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(msg.sessionId);
  }

  getMessages(sessionId: string, limit = 100): Message[] {
    return this.db.prepare(`
      SELECT id, session_id AS sessionId, role, content, created_at AS createdAt
      FROM messages WHERE session_id = ?
      ORDER BY id ASC
      LIMIT ?
    `).all(sessionId, limit) as Message[];
  }

  /** 获取最近的 N 条消息（用于构建 LLM 上下文） */
  getRecentMessages(sessionId: string, count = 20): Message[] {
    return this.db.prepare(`
      SELECT id, session_id AS sessionId, role, content, created_at AS createdAt
      FROM messages WHERE session_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(sessionId, count).reverse() as Message[];
  }

  getMessageCount(sessionId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE session_id = ?
    `).get(sessionId) as { count: number };
    return row.count;
  }

  deleteMessages(sessionId: string): void {
    this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    this.db.prepare(`
      UPDATE sessions SET message_count = 0, updated_at = datetime('now') WHERE id = ?
    `).run(sessionId);
  }
}
