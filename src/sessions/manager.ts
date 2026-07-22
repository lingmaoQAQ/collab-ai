// SessionManager — room + user 感知的会话管理

import { SessionStore } from "./store.js";
import type { UserSession, SessionMessage, SessionSummary } from "./types.js";

export interface SessionContext { session: UserSession; messages: SessionMessage[]; }

export class SessionManager {
  private store: SessionStore; private roomId: string; private userId: string;
  private currentSession: UserSession | null = null;

  constructor(roomId: string, userId: string, store?: SessionStore) {
    this.store = store || new SessionStore(); this.roomId = roomId; this.userId = userId;
  }

  get room(): string { return this.roomId; }
  get user(): string { return this.userId; }

  startSession(title: string, modelId: string, systemPrompt?: string): UserSession {
    this.currentSession = this.store.create(this.roomId, this.userId, title, modelId, systemPrompt);
    return this.currentSession;
  }
  loadSession(id: string): SessionContext | null {
    const session = this.store.get(id);
    if (!session || session.userId !== this.userId) return null;
    this.currentSession = session;
    return { session, messages: this.store.getRecentMessages(id, 50) };
  }
  getCurrent(): UserSession | null { return this.currentSession; }
  listSessions(limit?: number): SessionSummary[] { return this.store.listByUser(this.roomId, this.userId, limit); }
  getLatestSession(): UserSession | null { return this.store.getLatestForUser(this.roomId, this.userId); }
  saveMessage(role: SessionMessage["role"], content: string): void {
    if (!this.currentSession) return;
    this.store.addMessage({ sessionId: this.currentSession.id, role, content });
  }
  getMessages(limit?: number): SessionMessage[] {
    if (!this.currentSession) return [];
    return this.store.getRecentMessages(this.currentSession.id, limit ?? 50);
  }
  deleteSession(id?: string): void {
    const targetId = id || this.currentSession?.id;
    if (!targetId) return;
    const session = this.store.get(targetId);
    if (session && session.userId !== this.userId) return;
    this.store.delete(targetId);
    if (this.currentSession?.id === targetId) this.currentSession = null;
  }
  clearMessages(): void { if (this.currentSession) this.store.deleteMessages(this.currentSession.id); }
  updateSummary(summary: string): void { if (this.currentSession) this.store.updateSummary(this.currentSession.id, summary); }
  updateTitle(title: string): void { if (this.currentSession) this.store.updateTitle(this.currentSession.id, title); }
  touch(id?: string): void {
    const targetId = id || this.currentSession?.id;
    if (targetId) this.store.touch(targetId);
  }
}
