// CollabAI 多用户协作完整演示
// 场景：Alice（群论专家）和 Bob（渲染专家）协作开发 mathematics 可视化项目
import "dotenv/config";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const demoDir = path.join(process.env.TEMP || "/tmp", "collabai-demo-" + Date.now());
fs.mkdirSync(demoDir, { recursive: true });
const db = new Database(path.join(demoDir, "demo.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 初始化表（生产代码的简化版）
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
import { MemoryStore } from "../src/memory/store.js";
import { EventStore } from "../src/events/store.js";
import { ContextEngine } from "../src/context/engine.js";
import { Mediator } from "../src/mediator/engine.js";
import {
  getDefaultRegistry, createLlmRuntime,
  createOpenAIChatProvider, BUILTIN_MODELS,
} from "../src/llm/index.js";

// ---- 初始化 ----
const registry = getDefaultRegistry();
registry.register(createOpenAIChatProvider({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com/v1",
  api: "openai-chat",
}));
const runtime = createLlmRuntime(registry);
const model = BUILTIN_MODELS.find((m) => m.id === "deepseek-chat")!;

const userMgr = new UserManager(db);
const roomMgr = new RoomManager(db);
const engine = new ContextEngine(db);
const mediator = new Mediator(db);

const SYSTEM = "你是 CollabAI 项目中的 AI 技术协作者。用中文简洁回答，不超过3句话。";

// ---- 角色 ----
const alice = userMgr.create("Alice");
const bob = userMgr.create("Bob");
const room = roomMgr.create("mathematics", "群论可视化项目 — 使用 SymPy + NetworkX + Matplotlib", alice.id);
roomMgr.addMember(room.id, bob.id, "developer");

const mem = new MemoryStore(room.id, db);
const events = new EventStore(db);
events.record(room.id, alice.id, "room_created", { name: "mathematics" });
events.record(room.id, bob.id, "member_joined", {});

async function chat(user: { id: string; name: string }, userMessage: string) {
  const store = new SessionStore(db);
  let session = store.getLatestForUser(room.id, user.id);
  if (!session) {
    session = store.create(room.id, user.id, "新对话", model.id, SYSTEM);
  }

  // 获取历史消息
  const histMsgs = store.getRecentMessages(session.id, 30);
  const messages = histMsgs.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));
  if (!messages.some((m) => m.role === "system")) {
    messages.unshift({ role: "system", content: SYSTEM });
  }

  // 保存用户消息
  store.addMessage({ sessionId: session.id, role: "user", content: userMessage });
  messages.push({ role: "user", content: userMessage });

  // Context Engine 组装
  const assembled = engine.assemble({
    roomId: room.id, userId: user.id,
    sessionId: session.id,
    systemPrompt: SYSTEM, messages,
    maxTokens: Math.floor(model.contextWindow * 0.4),
  });

  // Mediator 增强
  let crossUserText = "";
  try {
    const enhanced = await mediator.enhanceContext(
      { roomId: room.id, userId: user.id, projectContext: assembled.systemPromptAddition || "" },
      runtime, model,
    );
    crossUserText = enhanced.addition;
  } catch { /* ignore */ }

  const finalSystem = [assembled.systemPromptAddition, crossUserText]
    .filter(Boolean).join("\n\n") + "\n\n---\n\n" + SYSTEM;

  // LLM 调用
  let response = "";
  try {
    const stream = runtime.stream({
      model,
      system: finalSystem,
      messages: assembled.messages,
      maxTokens: 150,
    });
    for await (const event of stream) {
      if (event.type === "text_delta") response += event.text;
    }
  } catch (err) {
    response = `[Error: ${err instanceof Error ? err.message : err}]`;
  }

  store.addMessage({ sessionId: session.id, role: "assistant", content: response });
  messages.push({ role: "assistant", content: response });

  // 风格学习
  mediator.analyzeTurn(
    { roomId: room.id, userId: user.id, userMessage, aiResponse: response },
    runtime, model,
  ).catch(() => {});

  // 更新标题
  if (messages.filter((m) => m.role !== "system").length <= 2) {
    store.updateTitle(session.id, userMessage.slice(0, 20));
  }

  return response;
}

async function demo() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   CollabAI v0.5.0 — 多用户协作演示               ║");
  console.log("║   项目: mathematics (群论可视化)                  ║");
  console.log("║   成员: Alice(群论专家) + Bob(渲染专家)           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // === 第1步：Alice 记录项目知识 ===
  console.log("━━━ Alice 记录项目架构和决策 ━━━");
  mem.set({ key: "tech-stack", value: "Python + SymPy(群论计算) + NetworkX(图结构) + Matplotlib(渲染)", category: "knowledge", authorId: alice.id });
  mem.set({ key: "architecture", value: "三层结构：计算层(SymPy) → 图构建层(NetworkX) → 渲染层(Matplotlib)。每层独立可测", category: "decision", authorId: alice.id });
  mem.set({ key: "group-types", value: "支持的群类型：对称群Sn、交错群An、二面体群Dn。均使用SymPy内置构造器", category: "knowledge", authorId: alice.id });
  mem.set({ key: "rendering-issue", value: "当前D6和S5组的大群可视化性能差，图节点过多时Matplotlib渲染缓慢", category: "knowledge", authorId: alice.id });
  console.log("  ✓ 4条项目记忆已记录\n");

  // === 第2步：Alice 开始工作 ===
  console.log("━━━ Alice 的对话（群论方向）━━━");
  const a1 = await chat(alice,
    "我想在项目中加一个新的群类型：四元数群Q8。SymPy有现成的构造器吗？如果没有应该怎么实现？"
  );
  console.log(`  Alice: "我想在项目中加一个新的群类型：四元数群Q8..."`);
  console.log(`  AI: ${a1.slice(0, 150)}...\n`);

  // === 第3步：Bob 加入，Mediator 告诉他 Alice 在做什么 ===
  console.log("━━━ Bob 加入项目（Mediator 跨用户感知）━━━");
  const wn = mediator.whatsNew(room.id, bob.id);
  console.log(`  团队成员动态:`);
  for (const u of wn.activeUsers) {
    console.log(`    - ${u.userName} 正在处理 [${u.currentTopic}]`);
  }
  for (const k of wn.newMemories) {
    console.log(`    - 新知识: ${k}`);
  }
  console.log("");

  // === 第4步：Bob 问渲染问题，AI 应引用 Alice 记录的知识 ===
  console.log("━━━ Bob 的对话（渲染方向）━━━");
  const b1 = await chat(bob,
    "这个项目的渲染性能有什么已知问题？我应该从哪个层开始优化？"
  );
  console.log(`  Bob: "这个项目的渲染性能有什么已知问题？"`);
  console.log(`  AI: ${b1.slice(0, 200)}...\n`);

  // === 第5步：Alice 继续群论，AI 知道 Bob 也在工作 ===
  console.log("━━━ Alice 继续群论（AI 感知 Bob 也在活跃）━━━");
  const a2 = await chat(alice,
    "Q8群的导出列长度是多少？这对于可解性判断很重要"
  );
  console.log(`  Alice: "Q8群的导出列长度是多少？"`);
  console.log(`  AI: ${a2.slice(0, 200)}...\n`);

  // === 第6步：冲突检测 — 两人讨论同一个模块 ===
  console.log("━━━ 冲突检测测试：两人讨论渲染性能 ━━━");
  mem.set({ key: "perf-bottleneck", value: "Matplotlib的draw_networkx在节点数>100时性能急剧下降，需探索替代渲染方案", category: "decision", authorId: alice.id });
  const b2 = await chat(bob,
    "Matplotlib渲染大量群节点时有性能问题，我想调研用Plotly替代。但这样会改动渲染层的架构设计，会有影响吗？"
  );
  console.log(`  Bob: "Matplotlib渲染大量群节点时有性能问题..."`);
  console.log(`  AI: ${b2.slice(0, 200)}...\n`);

  // === 第7步：风格学习结果 ===
  console.log("━━━ 风格学习结果 ━━━");
  const aliceProfile = userMgr.get(alice.id)!;
  const bobProfile = userMgr.get(bob.id)!;
  const ap = typeof aliceProfile.profile === "string" ? JSON.parse(aliceProfile.profile as string) : aliceProfile.profile;
  const bp = typeof bobProfile.profile === "string" ? JSON.parse(bobProfile.profile as string) : bobProfile.profile;
  console.log(`  Alice 风格: ${(ap as any).codingStyle || "（学习中...）"}`);
  console.log(`  Bob 风格: ${(bp as any).codingStyle || "（学习中...）"}`);

  // === 第8步：项目记忆检索 ===
  console.log("\n━━━ 项目全局记忆 ━━━");
  const allMem = mem.list();
  for (const m of allMem) {
    console.log(`  [${m.category}] ${m.key}: ${m.value.slice(0, 60)}`);
  }

  // === 第9步：事件日志 ===
  console.log("\n━━━ 项目活动日志 ━━━");
  const evts = events.list(room.id, 10);
  for (const e of evts) {
    console.log(`  ${e.userName || "系统"} | ${e.eventType}`);
  }

  // 清理
  db.close();
  fs.rmSync(demoDir, { recursive: true });
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║   ✅ 多用户协作演示完成！                        ║");
  console.log("║   - 跨用户感知：Bob 看到 Alice 的工作            ║");
  console.log("║   - 项目记忆共享：两人共用同一套决策知识          ║");
  console.log("║   - 冲突检测：高性能渲染讨论触发关联提醒          ║");
  console.log("║   - 风格学习：自动分析编码偏好                    ║");
  console.log("╚══════════════════════════════════════════════════╝");
}

demo().catch(console.error);
