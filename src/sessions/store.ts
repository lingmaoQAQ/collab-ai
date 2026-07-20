// 会话持久化操作 v0.3.0 — room + user 隔离

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./database.js";
import type { UserSession, SessionMessage, SessionSummary } from "./types.js";

export class SessionStore {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  // ---- 会话 CRUD ----

  create(
    roomId: string,
    userId: string,
    title: string,
    modelId: string,
    systemPrompt?: string,
  ): UserSession {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO user_sessions (id, room_id, user_id, model_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, roomId, userId, modelId, title, now, now);

    if (systemPrompt) {
      this.addMessage({ sessionId: id, role: "system", content: systemPrompt });
    }

    return this.get(id)!;
  }

  get(id: string): UserSession | null {
    return this.db.prepare(`
      SELECT id, room_id AS roomId, user_id AS userId, model_id AS modelId,
             title, created_at AS createdAt, updated_at AS updatedAt,
             message_count AS messageCount, summary
      FROM user_sessions WHERE id = ?
    `).get(id) as UserSession | null;
  }

  /** 列出指定用户在指定房间的会话 */
  listByUser(roomId: string, userId: string, limit = 20): SessionSummary[] {
    return this.db.prepare(`
      SELECT s.id AS sessionId, s.title, s.message_count AS messageCount,
             s.updated_at AS updatedAt,
             (SELECT content FROM session_messages
              WHERE session_id = s.id AND role = 'user'
              ORDER BY id DESC LIMIT 1) AS preview
      FROM user_sessions s
      WHERE s.room_id = ? AND s.user_id = ?
      ORDER BY s.updated_at DESC
      LIMIT ?
    `).all(roomId, userId, limit) as SessionSummary[];
  }

  getLatestForUser(roomId: string, userId: string): UserSession | null {
    return this.db.prepare(`
      SELECT id, room_id AS roomId, user_id AS userId, model_id AS modelId,
             title, created_at AS createdAt, updated_at AS updatedAt,
             message_count AS messageCount, summary
      FROM user_sessions
      WHERE room_id = ? AND user_id = ?
      ORDER BY updated_at DESC LIMIT 1
    `).get(roomId, userId) as UserSession | null;
  }

  updateTitle(id: string, title: string): void {
    this.db.prepare(
      "UPDATE user_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(title, id);
  }

  updateSummary(id: string, summary: string): void {
    this.db.prepare(
      "UPDATE user_sessions SET summary = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(summary, id);
  }

  touch(id: string): void {
    this.db.prepare(
      "UPDATE user_sessions SET updated_at = datetime('now') WHERE id = ?",
    ).run(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM session_messages WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM user_sessions WHERE id = ?").run(id);
  }

  // ---- 消息操作 ----

  addMessage(msg: SessionMessage): void {
    this.db.prepare(
      "INSERT INTO session_messages (session_id, role, content) VALUES (?, ?, ?)",
    ).run(msg.sessionId, msg.role, msg.content);

    this.db.prepare(
      `UPDATE user_sessions
       SET message_count = message_count + 1, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(msg.sessionId);
  }

  getMessages(sessionId: string, limit = 100): SessionMessage[] {
    return this.db.prepare(`
      SELECT id, session_id AS sessionId, role, content, created_at AS createdAt
      FROM session_messages WHERE session_id = ?
      ORDER BY id ASC LIMIT ?
    `).all(sessionId, limit) as SessionMessage[];
  }

  getRecentMessages(sessionId: string, count = 50): SessionMessage[] {
    return this.db.prepare(`
      SELECT id, session_id AS sessionId, role, content, created_at AS createdAt
      FROM session_messages WHERE session_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(sessionId, count).reverse() as SessionMessage[];
  }

  deleteMessages(sessionId: string): void {
    this.db.prepare("DELETE FROM session_messages WHERE session_id = ?").run(
      sessionId,
    );
    this.db.prepare(
      `UPDATE user_sessions
       SET message_count = 0, updated_at = datetime('now') WHERE id = ?`,
    ).run(sessionId);
  }
}
