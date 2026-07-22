// SQLite 数据库初始化 — v0.3.0 多用户 Schema

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let _db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (_db) return _db;

  const stateDir = process.env.COLLABAI_STATE_DIR ||
    path.join(process.env.HOME || process.env.USERPROFILE || ".", ".collab-ai");
  fs.mkdirSync(stateDir, { recursive: true });

  const dbPath = path.join(stateDir, "collab-ai.sqlite");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initTables(_db);
  return _db;
}

function initTables(db: Database.Database): void {
  db.exec(`
    -- 项目空间
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 用户身份
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      profile TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 房间-用户映射
    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'developer'
        CHECK(role IN ('owner','admin','developer','viewer')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, user_id)
    );

    -- 用户会话
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT
    );

    -- 会话消息
    CREATE TABLE IF NOT EXISTS session_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('system','user','assistant','mediator')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 项目共享记忆
    CREATE TABLE IF NOT EXISTS project_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general'
        CHECK(category IN ('decision','knowledge','style','general')),
      author_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(room_id, key)
    );

    -- Gateway 离线消息队列
    CREATE TABLE IF NOT EXISTS offline_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      target_user TEXT NOT NULL,
      message_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_offline_target ON offline_messages(room_id, target_user, delivered);

    -- 项目活动事件
    CREATE TABLE IF NOT EXISTS project_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      event_type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_sessions_room_user ON user_sessions(room_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON user_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id, id);
    CREATE INDEX IF NOT EXISTS idx_memories_room ON project_memories(room_id, category);
    CREATE INDEX IF NOT EXISTS idx_events_room ON project_events(room_id, created_at DESC);
  `);
}

/** 强制 WAL 写回主文件（多进程共享必需） */
export function flushDatabase(): void {
  if (_db) _db.pragma("wal_checkpoint(RESTART)");
}

export function closeDatabase(): void {
  if (_db) {
    _db.pragma("wal_checkpoint(TRUNCATE)");
    _db.close();
    _db = null;
  }
}
