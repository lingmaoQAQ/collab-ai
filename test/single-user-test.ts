// 单人模式全链路测试
import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { UserManager, RoomManager } from "../src/identity/manager.js";
import { SessionStore } from "../src/sessions/store.js";
import { MemoryStore } from "../src/memory/store.js";
import { EventStore } from "../src/events/store.js";
import { ContextEngine } from "../src/context/engine.js";
import { getDefaultRegistry, createLlmRuntime, createOpenAIChatProvider, BUILTIN_MODELS } from "../src/llm/index.js";
import "../src/tools/index.js";
import { executeTool } from "../src/tools/registry.js";
import { runToolLoop } from "../src/tools/loop.js";
import { writeFileSync, unlinkSync } from "node:fs";

const testDir = path.join(process.env.TEMP || "/tmp", "single-test-" + Date.now());
fs.mkdirSync(testDir, { recursive: true });
const db = new Database(path.join(testDir, "db.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log((cond ? "  PASS" : "  FAIL") + " " + name + (detail ? " | " + detail : ""));
  cond ? pass++ : fail++;
}

// Init
const reg = getDefaultRegistry();
reg.register(createOpenAIChatProvider({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: "https://api.deepseek.com/v1", api: "openai-chat" }));
const rt = createLlmRuntime(reg);
const model = BUILTIN_MODELS.find((x) => x.id === "deepseek-chat")!;

const userMgr = new UserManager(db);
const roomMgr = new RoomManager(db);
const store = new SessionStore(db);
const engine = new ContextEngine(db);

const alice = userMgr.create("Alice");
const room = roomMgr.create("SingleTest", "", alice.id);
const mem = new MemoryStore(room.id, db);
const events = new EventStore(db);

console.log("\n单人模式全链路测试\n");

// === 1. Session CRUD ===
console.log("--- 1. 会话管理 ---");
const session = store.create(room.id, alice.id, "测试会话", "deepseek-chat", "你是AI助手");
check("创建会话", !!session, session.id.slice(0, 8));
store.addMessage({ sessionId: session.id, role: "user", content: "你好" });
store.addMessage({ sessionId: session.id, role: "assistant", content: "你好！有什么可以帮你？" });
const msgs = store.getRecentMessages(session.id);
check("保存消息", msgs.length === 3, msgs.length + "条");  // system + user + assistant
check("消息恢复", msgs[1].role === "user" && msgs[1].content === "你好");
const latest = store.getLatestForUser(room.id, alice.id);
check("获取最新会话", latest?.id === session.id);

// === 2. Memory CRUD ===
console.log("\n--- 2. 记忆管理 ---");
mem.set({ key: "test-key", value: "test-value", category: "knowledge", authorId: alice.id });
const got = mem.get("test-key");
check("写入记忆", got?.value === "test-value");
const list = mem.list();
check("列出记忆", list.length === 1);
const search = mem.search("test");
check("搜索记忆", search.length >= 1);
mem.delete("test-key");
check("删除记忆", mem.get("test-key") === null);

// === 3. Context Engine ===
console.log("\n--- 3. 上下文组装 ---");
mem.set({ key: "arch", value: "三层架构", category: "decision", authorId: alice.id });
const assembled = engine.assemble({
  roomId: room.id, userId: alice.id, sessionId: session.id,
  systemPrompt: "测试", messages: [{ role: "user", content: "你好" }],
  maxTokens: 4000,
});
check("项目上下文注入", !!(assembled.systemPromptAddition), assembled.systemPromptAddition?.slice(0, 50));
check("消息保留", assembled.messages.length >= 1);
check("Token估算", assembled.estimatedTokens > 0);

// === 4. Event Log ===
console.log("\n--- 4. 事件日志 ---");
events.record(room.id, alice.id, "session_started", {});
events.record(room.id, alice.id, "memory_added", { key: "test" });
const evts = events.list(room.id);
check("事件记录", evts.length >= 2, evts.length + "条");
check("事件类型", evts[0].eventType === "memory_added" || evts[1].eventType === "memory_added");

// === 5. AI Chat ===
console.log("\n--- 5. AI 对话 ---");
const stream = rt.streamSimple({ model, messages: [{ role: "user", content: "回复 OK" }], maxTokens: 10 });
let text = "";
for await (const e of stream) { if (e.type === "text_delta") text += e.text; }
check("AI 对话", text.length > 0);

// === 6. Tool Execute (read_file) ===
console.log("\n--- 6. 工具执行 ---");
writeFileSync("_su_test.py", "def hello():\n    return 'world'\n");
const r1 = await executeTool({ id: "t1", name: "read_file", arguments: { path: "_su_test.py" } });
check("读取文件", !r1.isError && r1.content.includes("def hello"));
check("文件行号", r1.content.includes("|") || r1.content.includes("1"));

// === 7. Tool Execute (edit_file) ===
console.log("\n--- 7. 精确编辑 ---");
const r2 = await executeTool({ id: "t2", name: "edit_file", arguments: { path: "_su_test.py", old_string: "return 'world'", new_string: "return 'hello world'" } });
check("编辑文件", !r2.isError && r2.content.includes("已编辑"));
const newContent = fs.readFileSync("_su_test.py", "utf-8");
check("编辑生效", newContent.includes("hello world"));

// === 8. Tool Execute (write_file with diff) ===
console.log("\n--- 8. 写入文件 ---");
const r3 = await executeTool({ id: "t3", name: "write_file", arguments: { path: "_su_test.py", content: "def hello():\n    return 'hi'\n" } });
check("写入+diff", r3.content.includes("Diff") || r3.content.includes("行"));
unlinkSync("_su_test.py");

// === 9. AI Tool Loop (read + edit) ===
console.log("\n--- 9. AI 工具循环 ---");
writeFileSync("_su_loop.py", "x = 1\n");
const loopResult = await runToolLoop({
  runtime: rt, model,
  system: "你可以用 read_file/edit_file。用户要求修改代码时，先读再编辑。用中文回复。",
  messages: [{ role: "user", content: "把 _su_loop.py 里的 x = 1 改成 x = 2" }],
  maxToolRounds: 5, maxTokens: 200,
});
const finalContent = fs.readFileSync("_su_loop.py", "utf-8");
check("AI 工具循环", loopResult.toolCalls.length >= 1, loopResult.toolCalls.length + "次工具调用");
check("循环编辑生效", finalContent.includes("x = 2"), finalContent.trim());
unlinkSync("_su_loop.py");

// Cleanup
db.close();
fs.rmSync(testDir, { recursive: true });

console.log("\n" + "=".repeat(40));
console.log("单人模式: " + pass + "/" + (pass + fail) + " 通过\n");
if (fail > 0) process.exit(1);
