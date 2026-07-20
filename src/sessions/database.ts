// SQLite 数据库初始化和管理

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let _db: Database.Database | null = null;

/** 获取数据库实例（单例），自动创建目录和表 */
export function getDatabase(): Database.Database {
  if (_db) return _db;

  const stateDir = process.env.COLLABAI_STATE_DIR ||
    path.join(process.env.HOME || process.env.USERPROFILE || ".", ".collab-ai");

  fs.mkdirSync(stateDir, { recursive: true });

  const dbPath = path.join(stateDir, "collab-ai.sqlite");
  _db = new Database(dbPath);

  // 启用 WAL 模式，提升并发性能
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initTables(_db);

  return _db;
}

function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
  `);
}

/** 关闭数据库连接（用于进程退出时清理） */
export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
