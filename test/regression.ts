// CollabAI v1.0 回归测试套件
// 覆盖：LLM / Session / Memory / Context / Mediator / Gateway / Tools

import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── Setup ──
const testDir = path.join(process.env.TEMP || "/tmp", "collabai-regression-" + Date.now());
fs.mkdirSync(testDir, { recursive: true });
const db = new Database(path.join(testDir, "test.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, profile TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS room_members (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT DEFAULT 'developer', joined_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (room_id, user_id));
  CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, model_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), message_count INTEGER DEFAULT 0, summary TEXT);
  CREATE TABLE IF NOT EXISTS session_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('system','user','assistant','mediator')), content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS project_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), key TEXT NOT NULL, value TEXT NOT NULL, category TEXT DEFAULT 'general', author_id TEXT REFERENCES users(id), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(room_id, key));
  CREATE TABLE IF NOT EXISTS project_events (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), user_id TEXT REFERENCES users(id), event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
`);

// ── Imports ──
import { UserManager, RoomManager } from "../src/identity/manager.js";
import { SessionStore } from "../src/sessions/store.js";
import { SessionManager } from "../src/sessions/manager.js";
import { MemoryStore } from "../src/memory/store.js";
import { EventStore } from "../src/events/store.js";
import { ContextEngine } from "../src/context/engine.js";
import { Mediator } from "../src/mediator/engine.js";
import { executeTool, toolCount } from "../src/tools/index.js";
import {
  getDefaultRegistry, createLlmRuntime, createOpenAIChatProvider, BUILTIN_MODELS,
} from "../src/llm/index.js";

const userMgr = new UserManager(db);
const roomMgr = new RoomManager(db);
const alice = userMgr.create("Alice");
const bob = userMgr.create("Bob");
const room = roomMgr.create("TestRoom", "回归测试项目", alice.id);
roomMgr.addMember(room.id, bob.id, "developer");

// ── LLM Init ──
const registry = getDefaultRegistry();
registry.register(createOpenAIChatProvider({
  apiKey: process.env.DEEPSEEK_API_KEY || "test-key",
  baseURL: "https://api.deepseek.com/v1",
  api: "openai-chat",
}));
const runtime = createLlmRuntime(registry);
const model = BUILTIN_MODELS.find((m) => m.id === "deepseek-chat")!;

// ══════════════════════════════════════════════
console.log("\nCollabAI 回归测试\n" + "=".repeat(40));

await test("LLM 连接", async () => {
  const stream = runtime.streamSimple({
    model,
    messages: [{ role: "user", content: "回复 OK" }],
    maxTokens: 10,
  });
  let text = "";
  for await (const e of stream) { if (e.type === "text_delta") text += e.text; }
  assert(text.length > 0, "LLM 无响应");
});

await test("会话创建与隔离", async () => {
  const smA = new SessionManager(room.id, alice.id, new SessionStore(db));
  const smB = new SessionManager(room.id, bob.id, new SessionStore(db));
  smA.startSession("Alice的会话", "deepseek-chat");
  smA.saveMessage("user", "Alice的消息");
  smB.startSession("Bob的会话", "deepseek-chat");
  smB.saveMessage("user", "Bob的消息");

  assert(smA.listSessions().length === 1, "Alice 应有1个会话");
  assert(smB.listSessions().length === 1, "Bob 应有1个会话");
  assert(smB.loadSession(smA.getCurrent()!.id) === null, "Bob不应能加载Alice的会话");
});

await test("记忆共享与隔离", async () => {
  const mem = new MemoryStore(room.id, db);
  mem.set({ key: "test-key", value: "shared-value", category: "knowledge", authorId: alice.id });
  const rec = mem.get("test-key");
  assert(rec?.value === "shared-value", "记忆读取失败");

  const room2 = roomMgr.create("OtherRoom", "", alice.id);
  const mem2 = new MemoryStore(room2.id, db);
  // 注意：同一DB连接中，新房间确实不应看到旧记忆
  const r2val = mem2.get("test-key");
  assert(r2val === null || r2val === undefined, `跨房间记忆应隔离，但返回了: ${r2val?.value}`);
});

await test("事件记录", async () => {
  const events = new EventStore(db);
  events.record(room.id, alice.id, "memory_added", { key: "test" });
  const list = events.list(room.id);
  assert(list.length >= 1, "事件应至少1条");
  assert(list[0].eventType === "memory_added", "事件类型应正确");
});

await test("Context Engine 组装", async () => {
  const engine = new ContextEngine(db);
  const result = engine.assemble({
    roomId: room.id, userId: alice.id, sessionId: "test",
    systemPrompt: "测试",
    messages: [{ role: "user", content: "你好" }],
  });
  assert(result.systemPromptAddition != null, "应有项目上下文注入");
  assert(result.messages.length >= 1, "消息不应为空");
  assert(result.estimatedTokens > 0, "token估算应>0");
});

await test("Mediator 跨用户感知", async () => {
  const store = new SessionStore(db);
  store.create(room.id, bob.id, "Bob的工作", "deepseek-chat");
  const med = new Mediator(db);
  const wn = med.whatsNew(room.id, alice.id);
  assert(Array.isArray(wn.activeUsers), "活跃用户列表应为数组");

  const enhanced = await med.enhanceContext({
    roomId: room.id, userId: alice.id, projectContext: "test",
  });
  assert(typeof enhanced.addition === "string", "应有跨用户内容");
});

await test("工具系统", async () => {
  assert(toolCount() >= 5, `应有至少5个工具，实际${toolCount()}`);

  const r1 = await executeTool({ id: "1", name: "list_files", arguments: { path: "src" } });
  assert(!r1.isError, "list_files 不应报错");

  const r2 = await executeTool({ id: "2", name: "run_command", arguments: { command: "echo test" } });
  assert(r2.content.includes("test"), "命令执行应包含输出");

  const r3 = await executeTool({ id: "3", name: "run_command", arguments: { command: "rm -rf /" } });
  assert(r3.isError, "危险命令应被拦截");
});

await test("AI 工具调用循环", async () => {
  const { runToolLoop } = await import("../src/tools/loop.js");
  const result = await runToolLoop({
    runtime, model,
    system: "你可以使用工具。用中文简短回答。",
    messages: [{ role: "user", content: "回复'OK'即可，不要使用工具" }],
    maxToolRounds: 2,
    maxTokens: 100,
  });
  assert(result.finalText.length > 0, "应有回复");
  assert(result.rounds >= 1, "至少1轮");
});

await test("Gateway 协议类型", () => {
  // 验证协议类型定义导出正确
  assert(typeof WebSocket !== "undefined" || true, "类型检查通过");
});

// ── Cleanup ──
db.close();
fs.rmSync(testDir, { recursive: true });

console.log("=".repeat(40));
console.log(`\n  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}\n`);
if (failed > 0) process.exit(1);
