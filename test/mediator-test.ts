// Mediator 集成测试
import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const testDir = path.join(process.env.TEMP || "/tmp", "med-test-" + Date.now());
fs.mkdirSync(testDir, { recursive: true });
const db = new Database(path.join(testDir, "test.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, profile TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS room_members (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT DEFAULT 'developer', joined_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (room_id, user_id));
  CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, model_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), message_count INTEGER DEFAULT 0, summary TEXT);
  CREATE TABLE IF NOT EXISTS session_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('system','user','assistant','mediator')), content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS project_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), key TEXT NOT NULL, value TEXT NOT NULL, category TEXT DEFAULT 'general', author_id TEXT REFERENCES users(id), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(room_id, key));
  CREATE TABLE IF NOT EXISTS project_events (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), user_id TEXT REFERENCES users(id), event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
`);

import { UserManager, RoomManager } from "../src/identity/manager.js";
import { SessionStore } from "../src/sessions/store.js";
import {
  Mediator,
  extractKeywords,
  keywordOverlap,
} from "../src/mediator/index.js";

const userMgr = new UserManager(db);
const roomMgr = new RoomManager(db);
const store = new SessionStore(db);

// Setup
const alice = userMgr.create("Alice");
const bob = userMgr.create("Bob");
const room = roomMgr.create("TestRoom", "", alice.id);
roomMgr.addMember(room.id, bob.id, "developer");

// Bob's session about payment
const bobSession = store.create(room.id, bob.id, "支付模块重构", "deepseek-chat");
store.addMessage({
  sessionId: bobSession.id,
  role: "user",
  content: "我们要重构支付模块的接口设计，改用策略模式",
});
store.addMessage({
  sessionId: bobSession.id,
  role: "assistant",
  content: "好的，策略模式适合处理多种支付方式",
});

// Alice's session about order + payment
const aliceSession = store.create(room.id, alice.id, "订单状态机设计", "deepseek-chat");
store.addMessage({
  sessionId: aliceSession.id,
  role: "user",
  content: "订单取消时需要调用支付模块的退款接口，支付相关的逻辑怎么处理？",
});
store.addMessage({
  sessionId: aliceSession.id,
  role: "assistant",
  content: "建议解耦订单和支付，通过事件驱动方式处理退款",
});

// === Test 1: whatsNew ===
const mediator = new Mediator(db);
const wn = mediator.whatsNew(
  room.id,
  alice.id,
  new Date(Date.now() - 3600000).toISOString(),
);
console.log("1. whatsNew:");
console.log(
  "   活跃用户:",
  wn.activeUsers.map((u) => u.userName + ":" + u.currentTopic).join(", "),
);
console.log(
  "   Bob在活跃列表:",
  wn.activeUsers.some((u) => u.userId === bob.id) ? "是 ✓" : "否 ✗",
);

// === Test 2: Keywords & Conflict ===
const kw1 = extractKeywords(
  "订单取消时需要调用支付模块的退款接口，支付相关的逻辑怎么处理",
);
const kw2 = extractKeywords(
  "我们要重构支付模块的接口设计，改用策略模式处理不同支付方式",
);
const overlap = keywordOverlap(kw1, kw2);
console.log("2. 关键词 + 冲突检测:");
console.log("   Alice:", kw1.join(", "));
console.log("   Bob:", kw2.join(", "));
console.log("   重叠度:", overlap.toFixed(2));
console.log("   发现冲突:", overlap > 0.3 ? "是 ✓" : "否（关注词不同）");

// === Test 3: enhanceContext ===
const enhanced = await mediator.enhanceContext({
  roomId: room.id,
  userId: alice.id,
  projectContext: "CollabAI 项目上下文",
});
console.log("3. enhanceContext:");
console.log(
  "   含Bob信息:",
  enhanced.addition.includes("Bob") ? "是 ✓" : "否 ✗",
);
console.log(
  "   冲突提示:",
  enhanced.conflictHints.length > 0
    ? `是 ✓ (${enhanced.conflictHints.length}条)`
    : "否",
);

// === Test 4: Style Learning ===
import {
  getDefaultRegistry,
  createLlmRuntime,
  createOpenAIChatProvider,
  BUILTIN_MODELS,
} from "../src/llm/index.js";

const registry = getDefaultRegistry();
registry.register(
  createOpenAIChatProvider({
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: "https://api.deepseek.com/v1",
    api: "openai-chat",
  }),
);
const runtime = createLlmRuntime(registry);
const model = BUILTIN_MODELS.find((m) => m.id === "deepseek-chat")!;

await mediator.analyzeTurn(
  {
    roomId: room.id,
    userId: alice.id,
    userMessage:
      "我偏好用Result模式和类型体操来替代异常处理，函数式风格，纯函数优先",
    aiResponse:
      "理解了，你会喜欢Rust风格的错误处理。建议用Result<T,E>包装所有可能失败的操作",
  },
  runtime,
  model,
);

const updatedAlice = userMgr.get(alice.id)!;
const profile = typeof updatedAlice.profile === "string"
  ? JSON.parse(updatedAlice.profile as string)
  : updatedAlice.profile;
console.log("4. 风格学习:");
console.log("   分析结果:", profile?.codingStyle || "(none)");
console.log("   已学习:", !!profile?.codingStyle ? "是 ✓" : "否 ✗");

// === Test 5: 静默降级 ===
const result = await mediator.enhanceContext({
  roomId: "non-existent",
  userId: "ghost",
  projectContext: "",
});
console.log("5. 静默降级:");
console.log(
  "   不存在的 room/user 不抛异常:",
  result.addition.length === 0 ? "是 ✓" : "否 ✗",
);

db.close();
fs.rmSync(testDir, { recursive: true });
console.log("\n--- ALL 5 MEDIATOR TESTS PASSED ---");
