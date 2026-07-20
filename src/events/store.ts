// 项目事件存储 — 活动日志和协作通知基础设施

import type Database from "better-sqlite3";
import { getDatabase } from "../sessions/database.js";
import type { ProjectEvent, EventType } from "./types.js";

export class EventStore {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  record(
    roomId: string,
    userId: string | undefined,
    eventType: EventType,
    payload: Record<string, unknown> = {},
  ): void {
    this.db.prepare(`
      INSERT INTO project_events (room_id, user_id, event_type, payload)
      VALUES (?, ?, ?, ?)
    `).run(roomId, userId || null, eventType, JSON.stringify(payload));
  }

  list(roomId: string, limit = 30): ProjectEvent[] {
    return this.db.prepare(`
      SELECT e.id, e.room_id AS roomId, e.user_id AS userId,
             u.name AS userName,
             e.event_type AS eventType, e.payload,
             e.created_at AS createdAt
      FROM project_events e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.room_id = ?
      ORDER BY e.created_at DESC LIMIT ?
    `).all(roomId, limit) as ProjectEvent[];
  }

  listByUser(roomId: string, userId: string, limit = 20): ProjectEvent[] {
    return this.db.prepare(`
      SELECT e.id, e.room_id AS roomId, e.user_id AS userId,
             u.name AS userName,
             e.event_type AS eventType, e.payload,
             e.created_at AS createdAt
      FROM project_events e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.room_id = ? AND e.user_id = ?
      ORDER BY e.created_at DESC LIMIT ?
    `).all(roomId, userId, limit) as ProjectEvent[];
  }

  /** 获取某个时间点之后的事件（用于轮询） */
  listSince(roomId: string, sinceEventId: number, limit = 30): ProjectEvent[] {
    return this.db.prepare(`
      SELECT e.id, e.room_id AS roomId, e.user_id AS userId,
             u.name AS userName,
             e.event_type AS eventType, e.payload,
             e.created_at AS createdAt
      FROM project_events e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.room_id = ? AND e.id > ?
      ORDER BY e.created_at DESC LIMIT ?
    `).all(roomId, sinceEventId, limit) as ProjectEvent[];
  }
}
