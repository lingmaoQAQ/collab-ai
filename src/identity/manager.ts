// 用户和房间管理 — 带 SQLite 持久化

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { User, Room, RoomMember, RoomRole, UserProfile } from "./types.js";

export class UserManager {
  constructor(private db: Database.Database) {}

  create(name: string, email?: string): User {
    // 同名用户如果已存在则复用
    const existing = this.findByName(name);
    if (existing) return existing;

    const id = randomUUID();
    this.db.prepare(
      "INSERT INTO users (id, name, email) VALUES (?, ?, ?)",
    ).run(id, name, email || null);
    return this.get(id)!;
  }

  get(id: string): User | null {
    return this.db.prepare(
      "SELECT id, name, email, profile, created_at AS createdAt FROM users WHERE id = ?",
    ).get(id) as User | null;
  }

  findByName(name: string): User | null {
    return this.db.prepare(
      "SELECT id, name, email, profile, created_at AS createdAt FROM users WHERE name = ?",
    ).get(name) as User | null;
  }

  getOrCreate(name: string, email?: string): User {
    return this.create(name, email);
  }

  updateProfile(id: string, profile: Partial<UserProfile>): void {
    const user = this.get(id);
    if (!user) return;
    const merged = { ...(user.profile || {}), ...profile };
    this.db.prepare("UPDATE users SET profile = ? WHERE id = ?").run(
      JSON.stringify(merged),
      id,
    );
  }

  list(): User[] {
    return this.db.prepare(
      "SELECT id, name, email, profile, created_at AS createdAt FROM users ORDER BY name",
    ).all() as User[];
  }
}

export class RoomManager {
  constructor(private db: Database.Database) {}

  create(name: string, description = "", ownerId: string): Room {
    const id = randomUUID();
    this.db.prepare(
      "INSERT INTO rooms (id, name, description) VALUES (?, ?, ?)",
    ).run(id, name, description);
    // 创建者自动成为 owner
    this.addMember(id, ownerId, "owner");
    return this.get(id)!;
  }

  get(id: string): Room | null {
    return this.db.prepare(
      "SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt FROM rooms WHERE id = ?",
    ).get(id) as Room | null;
  }

  list(userId?: string): Room[] {
    if (userId) {
      return this.db.prepare(`
        SELECT r.id, r.name, r.description,
               r.created_at AS createdAt, r.updated_at AS updatedAt
        FROM rooms r
        JOIN room_members rm ON r.id = rm.room_id
        WHERE rm.user_id = ?
        ORDER BY r.updated_at DESC
      `).all(userId) as Room[];
    }
    return this.db.prepare(
      "SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt FROM rooms ORDER BY updated_at DESC",
    ).all() as Room[];
  }

  addMember(roomId: string, userId: string, role: RoomRole = "developer"): void {
    this.db.prepare(
      "INSERT OR IGNORE INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)",
    ).run(roomId, userId, role);
  }

  removeMember(roomId: string, userId: string): void {
    this.db.prepare(
      "DELETE FROM room_members WHERE room_id = ? AND user_id = ?",
    ).run(roomId, userId);
  }

  getMembers(roomId: string): RoomMember[] {
    return this.db.prepare(`
      SELECT rm.room_id AS roomId, rm.user_id AS userId,
             u.name AS userName, rm.role, rm.joined_at AS joinedAt
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at
    `).all(roomId) as RoomMember[];
  }

  getUserRole(roomId: string, userId: string): RoomRole | null {
    const row = this.db.prepare(
      "SELECT role FROM room_members WHERE room_id = ? AND user_id = ?",
    ).get(roomId, userId) as { role: RoomRole } | undefined;
    return row?.role || null;
  }

  updateRole(roomId: string, userId: string, role: RoomRole): void {
    this.db.prepare(
      "UPDATE room_members SET role = ? WHERE room_id = ? AND user_id = ?",
    ).run(role, roomId, userId);
  }
}
