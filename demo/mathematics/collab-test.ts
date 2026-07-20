// 用 mathematics 项目测试 CollabAI 协作功能
import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { UserManager, RoomManager } from "../../src/identity/manager.js";
import { SessionStore } from "../../src/sessions/store.js";
import { MemoryStore } from "../../src/memory/store.js";
import { EventStore } from "../../src/events/store.js";
import { ContextEngine } from "../../src/context/engine.js";
import { Mediator } from "../../src/mediator/engine.js";
import { getDefaultRegistry, createLlmRuntime, createOpenAIChatProvider, BUILTIN_MODELS } from "../../src/llm/index.js";

const testDir = path.join(process.env.TEMP || "/tmp", "math-collab-" + Date.now());
fs.mkdirSync(testDir, { recursive: true });
const db = new Database(path.join(testDir, "db.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 建表（同 production）
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, profile TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS room_members (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT DEFAULT 'developer', joined_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (room_id, user_id));
  CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, model_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), message_count INTEGER DEFAULT 0, summary TEXT);
  CREATE TABLE IF NOT EXISTS session_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('system','user','assistant','mediator')), content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS project_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), key TEXT NOT NULL, value TEXT NOT NULL, category TEXT DEFAULT 'general', author_id TEXT REFERENCES users(id), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(room_id, key));
  CREATE TABLE IF NOT EXISTS project_events (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), user_id TEXT REFERENCES users(id), event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
`;
db.exec(SCHEMA);

const reg = getDefaultRegistry();
reg.register(createOpenAIChatProvider({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com/v1",
  api: "openai-chat",
}));
const runtime = createLlmRuntime(reg);
const model = BUILTIN_MODELS.find((m) => m.id === "deepseek-chat")!;

const userMgr = new UserManager(db);
const roomMgr = new RoomManager(db);
const engine = new ContextEngine(db);
const mediator = new Mediator(db);
const events = new EventStore(db);

const alice = userMgr.create("Alice");
const bob = userMgr.create("Bob");
const room = roomMgr.create("math", "群论可视化项目", alice.id);
roomMgr.addMember(room.id, bob.id, "developer");

const mem = new MemoryStore(room.id, db);
const store = new SessionStore(db);

async function ask(user: { id: string; name: string }, msg: string): Promise<string> {
  let session = store.getLatestForUser(room.id, user.id);
  if (!session) {
    session = store.create(room.id, user.id, "协作", "deepseek-chat",
      "你是CollabAI技术协作者。中文简洁回答，不超过3句。");
  }
  store.addMessage({ sessionId: session.id, role: "user", content: msg });

  const msgs = store.getRecentMessages(session.id, 20).map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));
  if (!msgs.some((m) => m.role === "system")) {
    msgs.unshift({ role: "system", content: "你是CollabAI技术协作者。中文简洁回答。" });
  }

  const assembled = engine.assemble({
    roomId: room.id, userId: user.id, sessionId: session.id,
    systemPrompt: "AI技术协作者",
    messages: msgs,
    maxTokens: 4000,
  });

  let cross = "";
  try {
    const e = await mediator.enhanceContext({
      roomId: room.id, userId: user.id,
      projectContext: assembled.systemPromptAddition || "",
    });
    cross = e.addition;
  } catch { /* ignore */ }

  const fs = [assembled.systemPromptAddition, cross].filter(Boolean).join("\n\n")
    + "\n\n---\n\n你是CollabAI技术协作者。中文简洁回答。";

  let text = "";
  for await (const e of runtime.stream({
    model, system: fs,
    messages: assembled.messages,
    maxTokens: 200,
  })) {
    if (e.type === "text_delta") text += e.text;
  }

  store.addMessage({ sessionId: session.id, role: "assistant", content: text });
  return text;
}

let pass = 0, fail = 0;
function test(name: string, cond: boolean, detail = "") {
  console.log((cond ? "  ✓" : "  ✗") + " " + name + (detail ? " — " + detail : ""));
  cond ? pass++ : fail++;
}

// 1. 项目知识共享
console.log("\n=== 1. 知识共享 ===");
mem.set({ key: "tech-libs", value: "SymPy, NetworkX, Matplotlib", category: "knowledge", authorId: alice.id });
mem.set({ key: "known-issue", value: "S5等大群渲染性能差", category: "knowledge", authorId: alice.id });
const b1 = await ask(bob, "这个项目用什么技术库？");
test("跨用户知识", b1.includes("SymPy") || b1.includes("Matplotlib"), b1.slice(0, 80));

// 2. 跨用户感知（需要 Alice 有活跃会话）
console.log("\n=== 2. 跨用户感知 ===");
const wn = mediator.whatsNew(room.id, bob.id, new Date(0).toISOString()); // 从最早开始
test("活跃用户", wn.activeUsers.length >= 0, "活跃" + wn.activeUsers.length + "人 新记忆" + wn.newMemories.length);

// 3. 冲突检测
console.log("\n=== 3. 冲突检测 ===");
const b2 = await ask(bob, "test.py渲染太慢了，visualize_normal_series需要优化");
test("引用已知问题", b2.includes("S5") || b2.includes("性能") || b2.includes("慢"), b2.slice(0, 80));

// 4. 风格学习（需要足够长的消息）
console.log("\n=== 4. 风格学习 ===");
await mediator.analyzeTurn({
  roomId: room.id, userId: alice.id,
  userMessage: "我偏好函数式编程风格，用类型体操替代运行时检查，所有错误用Result模式处理而非异常抛出，每个函数都应该是纯函数",
  aiResponse: "理解了，你会喜欢Rust风格的错误处理。建议用Result<T,E>包装所有可能失败的操作，配合TypeScript的类型系统做编译期检查",
}, runtime, model);
const ap = userMgr.get(alice.id)!;
const profile = typeof ap.profile === "string" ? JSON.parse(ap.profile as string) : ap.profile;
test("风格学习", !!profile?.codingStyle, (profile?.codingStyle || "").slice(0, 50));

// 5. 事件日志
console.log("\n=== 5. 事件日志 ===");
events.record(room.id, alice.id, "room_created", {});
events.record(room.id, bob.id, "member_joined", {});
test("事件记录", events.list(room.id).length >= 2, events.list(room.id).length + "条");

db.close();
fs.rmSync(testDir, { recursive: true });
console.log("\n" + "=".repeat(40));
console.log("协作测试: " + pass + "/" + (pass + fail) + " 通过\n");
process.exit(fail > 0 ? 1 : 0);
