// 完整工作流测试 — 模拟真实用户操作
import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { UserManager, RoomManager } from "../src/identity/manager.js";
import { SessionStore } from "../src/sessions/store.js";
import { MemoryStore } from "../src/memory/store.js";
import { ContextEngine } from "../src/context/engine.js";
import { getDefaultRegistry, createLlmRuntime, createOpenAIChatProvider, BUILTIN_MODELS } from "../src/llm/index.js";
import "../src/tools/index.js";
import { executeTool } from "../src/tools/registry.js";
import { runToolLoop } from "../src/tools/loop.js";

const testDir = path.join(process.env.TEMP || "/tmp", "full-test-" + Date.now());
fs.mkdirSync(testDir, { recursive: true });
const db = new Database(":memory:");  // 内存数据库，避免WAL问题
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, profile TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE room_members (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT DEFAULT 'developer', joined_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (room_id, user_id));
  CREATE TABLE user_sessions (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, model_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), message_count INTEGER DEFAULT 0, summary TEXT);
  CREATE TABLE session_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('system','user','assistant','mediator')), content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE project_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), key TEXT NOT NULL, value TEXT NOT NULL, category TEXT DEFAULT 'general', author_id TEXT REFERENCES users(id), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(room_id, key));
  CREATE TABLE project_events (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id), user_id TEXT REFERENCES users(id), event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
`);

let pass = 0, fail = 0;
function t(name: string, cond: boolean, d = "") { console.log((cond ? "  PASS" : "  FAIL") + " " + name + (d ? " | " + d : "")); cond ? pass++ : fail++; }

// Init
const reg = getDefaultRegistry();
reg.register(createOpenAIChatProvider({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: "https://api.deepseek.com/v1", api: "openai-chat" }));
const rt = createLlmRuntime(reg);
const model = BUILTIN_MODELS.find((x) => x.id === "deepseek-chat")!;

const userMgr = new UserManager(db);
const roomMgr = new RoomManager(db);
const store = new SessionStore(db);
const engine = new ContextEngine(db);

const alice = userMgr.create("Dev");
const room = roomMgr.create("Test", "", alice.id);

// 创建工作文件
writeFile("sample.py", 'def greet(name):\n    return "Hello " + name\n\ndef add(a, b):\n    return a + b\n');
const mem = new MemoryStore(room.id, db);

console.log("\n═══════════════════════════════════");
console.log("  工作流测试");
console.log("═══════════════════════════════════\n");

// === 1. 基本对话 ===
console.log("1. 基本AI对话");
const s1 = await ask("回复 OK", 10);
t("AI回复非空", s1.text.length > 0);
t("无工具调用", s1.tools === 0);

// === 2. 读取文件 ===
console.log("\n2. AI读取文件");
const s2 = await ask("读取 sample.py 的内容", 30);
t("用了工具", s2.tools >= 1);
t("有文字回复", s2.text.length > 0, s2.text.slice(0, 50));

// === 3. 编辑文件 ===
console.log("\n3. AI编辑文件");
const s3 = await ask('把 sample.py 里的 "Hello" 改成 "Hi"', 30);
const content = readFile("sample.py");
t("文件已修改", content.includes("Hi"), content.trim());
t("有文字回复", s3.text.length > 0, s3.text.slice(0, 50));

// === 4. 搜索代码 ===
console.log("\n4. AI搜索代码");
writeFile("utils.py", 'def calculate_total(items):\n    return sum(items)\n\nPI = 3.14159\n');
const s4 = await ask("搜索一下项目中哪里用到了 PI 常量", 30);
t("有文字回复", s4.text.length > 0, s4.text.slice(0, 50));

// === 5. 写入新文件 ===
console.log("\n5. AI写新文件");
const s5 = await ask("创建一个 config.py 文件，包含 DEBUG = True 和 VERSION = '1.0'", 30);
t("文件被创建", fs.existsSync("config.py"));
if (fs.existsSync("config.py")) {
  const c = fs.readFileSync("config.py", "utf-8");
  t("文件有内容", c.length > 10, c.slice(0, 60));
}
t("有文字回复", s5.text.length > 0, s5.text.slice(0, 50));

// === 6. 多步操作 ===
console.log("\n6. AI多步操作（读+改+写）");
writeFile("math_utils.py", 'def double(x):\n    return x * 2\n\ndef triple(x):\n    return x * 3\n');
const s6 = await ask("看看 math_utils.py 有哪些函数，然后把 triple 改成 quadruple（四倍）", 30);
const c6 = readFile("math_utils.py");
t("多步成功", c6.includes("quadruple"), c6.trim());
t("有文字回复", s6.text.length > 0, s6.text.slice(0, 50));

// === 7. 错误处理：编辑不存在的文件 ===
console.log("\n7. 错误处理");
const s7 = await ask("编辑 nonexistent.py，把 x 改成 y", 20);
t("AI处理了错误", s7.text.length > 0 || s7.tools >= 1);

// === 8. 长对话压缩 ===
console.log("\n8. 长对话压缩");
const { compactConversation } = await import("../src/context/compact.js");
const longMsgs = Array.from({ length: 20 }, (_, i) => ({
  role: (i % 2 ? "user" : "assistant") as "user" | "assistant",
  content: `消息${i}: 讨论项目${i % 5}相关内容`,
}));
const cr = await compactConversation(rt, model, longMsgs, 4);
t("压缩成功", cr.compactedCount > 0);
t("有摘要", cr.summary.length > 0);

// Cleanup
for (const f of ["sample.py", "utils.py", "config.py", "math_utils.py"]) {
  try { fs.unlinkSync(f); } catch {}
}
db.close();

console.log("\n" + "═".repeat(40));
console.log("  " + pass + "/" + (pass + fail) + " 通过\n");
if (fail > 0) process.exit(1);

// ═══ helpers ═══
function writeFile(name: string, content: string) { fs.writeFileSync(name, content, "utf-8"); }
function readFile(name: string) { return fs.readFileSync(name, "utf-8"); }

async function ask(userMsg: string, maxTok: number) {
  let session = store.getLatestForUser(room.id, alice.id);
  if (!session) session = store.create(room.id, alice.id, "测试", "deepseek-chat", "你是编程助手。用户要求改代码时，先读文件再编辑。用中文回复。改完后说明改了什么。");
  store.addMessage({ sessionId: session.id, role: "user", content: userMsg });
  const msgs = store.getRecentMessages(session.id, 30).map((m) => ({ role: m.role as any, content: m.content }));

  const assembled = engine.assemble({ roomId: room.id, userId: alice.id, sessionId: session.id, systemPrompt: "你是编程助手。可以读写文件。用中文回复。", messages: msgs, maxTokens: 4000 });
  const result = await runToolLoop({
    runtime: rt, model,
    system: assembled.systemPromptAddition ? assembled.systemPromptAddition + "\n\n你是编程助手" : "你是编程助手",
    messages: assembled.messages.filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role, content: m.content })),
    maxToolRounds: 5, maxTokens: maxTok,
  });
  store.addMessage({ sessionId: session.id, role: "assistant", content: result.finalText || "(无)" });
  return { text: result.finalText, tools: result.toolCalls.length };
}
