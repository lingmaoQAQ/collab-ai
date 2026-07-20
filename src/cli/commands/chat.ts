// Chat 命令 v0.5.1 — 多用户协作 + 终端 UI 升级

import { Command } from "commander";
import * as readline from "node:readline";
import { loadConfig } from "../../config/index.js";
import {
  getDefaultRegistry, createLlmRuntime,
  createAnthropicProvider, createOpenAIProvider, createOpenAIChatProvider,
  BUILTIN_MODELS,
} from "../../llm/index.js";
import type { Model } from "../../llm/types.js";
import type { LlmRuntime } from "../../llm/runtime.js";
import { getDatabase, closeDatabase } from "../../sessions/database.js";
import { SessionManager, generateTitle } from "../../sessions/manager.js";
import { ContextEngine } from "../../context/engine.js";
import { Mediator } from "../../mediator/engine.js";
import { UserManager, RoomManager } from "../../identity/manager.js";
import { MemoryStore } from "../../memory/store.js";
import { EventStore } from "../../events/store.js";
import type { User, Room } from "../../identity/types.js";
import type { SessionMessage } from "../../sessions/types.js";
import {
  showBanner, showWhatsNew, showSeparator,
  createStreamRenderer,
  dim, error, info, highlight, muted,
  aiPrefix, userPrefix,
  bold, modelColor,
} from "../../ui/index.js";

// ---- 工具函数 ----

function findModel(modelId: string) {
  const model = BUILTIN_MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model "${modelId}"`);
  return model;
}

function initProviders() {
  const registry = getDefaultRegistry();
  if (process.env.ANTHROPIC_API_KEY) registry.register(createAnthropicProvider());
  if (process.env.OPENAI_API_KEY) registry.register(createOpenAIProvider());
  const chatApiKey = process.env.OPENAI_CHAT_API_KEY ||
    process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const chatBaseUrl = process.env.OPENAI_CHAT_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL ||
    // 自动检测：DeepSeek key 但没有配 base URL 时，自动用 DeepSeek 地址
    (process.env.DEEPSEEK_API_KEY ? "https://api.deepseek.com/v1" : undefined);
  if (chatApiKey || chatBaseUrl) {
    registry.register(createOpenAIChatProvider({
      apiKey: chatApiKey || "ollama", baseURL: chatBaseUrl, api: "openai-chat",
    }));
  }
  if (registry.list().length === 0) {
    throw new Error("No API key found.");
  }
  return registry;
}

function sessionInfo(sm: SessionManager): string {
  const s = sm.getCurrent();
  if (!s) return "无活跃会话";
  return `[${s.title}] ${s.messageCount} 条消息`;
}

function showHelp() {
  console.log("");
  showSeparator("命令列表");
  const cmds = [
    ["/new <title>", "创建新会话"],
    ["/load <id>", "加载指定会话"],
    ["/list", "列出我的会话"],
    ["/save", "保存并生成摘要"],
    ["/clear", "清除当前对话"],
    ["/summary", "查看会话摘要"],
    ["/model <id>", "切换模型"],
    ["/rooms", "列出项目空间"],
    ["/members", "查看成员"],
    ["/invite <name>", "邀请用户"],
    ["/events", "查看最近活动"],
    ["/remember <k> <v>", "记录共享记忆"],
    ["/recall <query>", "搜索共享记忆"],
    ["/help", "显示帮助"],
    ["/quit", "退出"],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(dim("  ") + bold(cmd.padEnd(20)) + dim(desc));
  }
  console.log("");
}

// ---- 主命令 ----

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("启动交互式 AI 对话（多用户协作）")
    .option("-m, --model <id>", "模型 ID")
    .option("-s, --system <text>", "系统提示词")
    .option("-u, --user <name>", "用户身份")
    .option("-r, --room <id>", "项目空间 ID")
    .option("--new-room <name>", "创建新项目空间")
    .action(async (options) => {
      const config = loadConfig();
      const model = findModel(options.model || config.model);
      const registry = initProviders();
      const runtime = createLlmRuntime(registry);
      const db = getDatabase();
      const engine = new ContextEngine(db);
      const mediator = new Mediator(db);

      // ---- 身份和房间初始化 ----
      const userMgr = new UserManager(db);
      const roomMgr = new RoomManager(db);
      const events = new EventStore(db);

      // 用户身份
      const userName = options.user || config.defaultUser || "developer";
      const user = userMgr.getOrCreate(userName);

      // 房间
      let room: Room;
      if (options.newRoom) {
        room = roomMgr.create(options.newRoom, "", user.id);
        events.record(room.id, user.id, "room_created", { name: options.newRoom });
        console.log(`项目空间已创建: ${room.name} (${room.id.slice(0, 8)})`);
      } else if (options.room) {
        const r = roomMgr.get(options.room);
        if (!r) throw new Error(`Room "${options.room}" not found`);
        room = r;
      } else {
        // 自动选择：最近使用的房间
        const rooms = roomMgr.list(user.id);
        if (rooms.length > 0) {
          room = rooms[0];
        } else {
          room = roomMgr.create("默认项目", "CollabAI 默认工作空间", user.id);
          events.record(room.id, user.id, "room_created", { name: "默认项目" });
        }
      }

      // 确保用户在房间里
      if (!roomMgr.getUserRole(room.id, user.id)) {
        roomMgr.addMember(room.id, user.id, "developer");
        events.record(room.id, user.id, "member_joined", { via: "auto" });
      }

      // ---- 会话管理 ----
      const sm = new SessionManager(room.id, user.id);
      const memory = new MemoryStore(room.id);
      const systemPrompt = options.system || config.systemPrompt;

      // 自动恢复最近会话
      const latest = sm.getLatestSession();
      if (latest) {
        const ctx = sm.loadSession(latest.id);
        if (ctx) {
          showBanner("0.5.1", model.name, model.provider.name, room.name, user.name);
          console.log(dim("  ") + muted("已恢复: ") + sessionInfo(sm) + "\n");
        }
      }
      if (!sm.getCurrent()) {
        sm.startSession("新对话", model.id, systemPrompt);
        events.record(room.id, user.id, "session_started", {});
        showBanner("0.5.1", model.name, model.provider.name, room.name, user.name);
      }

      // 显示自上次以来的变化
      try {
        const wn = mediator.whatsNew(room.id, user.id);
        showWhatsNew(wn.activeUsers, wn.newMemories);
      } catch { /* 静默降级 */ }

      // 构建内存消息列表
      const dbMessages = sm.getMessages();
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> =
        dbMessages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        }));

      if (!messages.some((m) => m.role === "system") && systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
        sm.saveMessage("system", systemPrompt);
      }

      let titleGenerated = dbMessages.length > 1;

      // ---- 交互循环 ----
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `[${room.name.slice(0, 12)}] > `,
      });
      rl.prompt();

      for await (const line of rl) {
        const input = line.trim();
        if (!input) { rl.prompt(); continue; }

        if (input.startsWith("/")) {
          const parts = input.split(/\s+/);
          const cmd = parts[0];
          const arg = parts.slice(1).join(" ");

          try {
            await handleCommand(cmd, arg, {
              sm, runtime, model, memory, events,
              userMgr, roomMgr, user, room, engine,
              messages, systemPrompt, rl, config,
            });
          } catch (err) {
            console.log(`Error: ${err instanceof Error ? err.message : err}`);
          }
          if (cmd === "/quit" || cmd === "/exit") return;
          rl.prompt();
          continue;
        }

        // 普通消息
        sm.saveMessage("user", input);
        messages.push({ role: "user", content: input });

        if (!titleGenerated) {
          try {
            const title = await generateTitle(runtime, model, input);
            sm.updateTitle(title);
            titleGenerated = true;
          } catch { /* ignore */ }
        }

        try {
          // ContextEngine 组装：注入项目上下文
          const assembled = engine.assemble({
            roomId: room.id, userId: user.id,
            sessionId: sm.getCurrent()!.id,
            systemPrompt, messages,
            maxTokens: Math.floor(model.contextWindow * 0.5),
          });

          // Mediator 增强：注入跨用户感知
          let crossUserAddition = "";
          try {
            const enhanced = await mediator.enhanceContext({
              roomId: room.id, userId: user.id,
              projectContext: assembled.systemPromptAddition || "",
            }, runtime, model);
            if (enhanced.addition) crossUserAddition = enhanced.addition;
          } catch { /* 静默降级 */ }

          const ctxAdditions = [
            assembled.systemPromptAddition,
            crossUserAddition,
          ].filter(Boolean).join("\n\n");
          const finalSystem = ctxAdditions
            ? `${ctxAdditions}\n\n---\n\n${systemPrompt}`
            : systemPrompt;

          const stream = runtime.stream({
            model, system: finalSystem,
            messages: assembled.messages,
            maxTokens: config.maxTokens, temperature: config.temperature,
          });

          // 使用 StreamRenderer 实现无闪烁流式输出
          const renderer = createStreamRenderer();
          let text = "";
          for await (const event of stream) {
            if (event.type === "text_delta") {
              text += event.text;
              renderer.write(event.text);
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          }
          if (!renderer.hasOutput() && text) {
            process.stdout.write(aiPrefix() + text + "\n");
          }
          renderer.done();

          messages.push({ role: "assistant", content: text });
          sm.saveMessage("assistant", text);
          events.record(room.id, user.id, "message_sent", { sessionId: sm.getCurrent()?.id });

          // Mediator 分析：学习用户风格（异步，不阻塞）
          mediator.analyzeTurn(
            { roomId: room.id, userId: user.id, userMessage: input, aiResponse: text },
            runtime, model,
          ).catch(() => {});
        } catch (err) {
          console.error(error(`\n  Error: ${err instanceof Error ? err.message : err}`));
          messages.pop();
        }
        rl.prompt();
      }

      closeDatabase();
    });
}

// ---- 斜杠命令处理 ----

interface CmdCtx {
  sm: SessionManager;
  runtime: LlmRuntime;
  model: Model;
  memory: MemoryStore;
  events: EventStore;
  userMgr: UserManager;
  roomMgr: RoomManager;
  user: User;
  room: Room;
  engine: ContextEngine;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  systemPrompt: string;
  rl: readline.Interface;
  config: ReturnType<typeof loadConfig>;
}

async function handleCommand(cmd: string, arg: string, ctx: CmdCtx) {
  const { sm, runtime, model, memory, events, userMgr, roomMgr, user, room,
    engine, messages, systemPrompt, rl } = ctx;

  switch (cmd) {
    case "/quit": case "/exit":
      console.log("Goodbye!");
      closeDatabase();
      rl.close();
      process.exit(0);

    case "/help":
      showHelp();
      break;

    case "/new": {
      const title = arg || "新对话";
      sm.startSession(title, model.id, systemPrompt);
      messages.length = 0;
      if (systemPrompt) { messages.push({ role: "system", content: systemPrompt }); sm.saveMessage("system", systemPrompt); }
      events.record(room.id, user.id, "session_started", { title });
      console.log(`新会话: ${title}`);
      break;
    }

    case "/load": {
      if (arg) {
        const ctx_ = sm.loadSession(arg);
        if (!ctx_) { console.log("会话不存在或无权访问"); break; }
        messages.length = 0;
        messages.push(...ctx_.messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant", content: m.content,
        })));
        console.log(`已加载: ${sessionInfo(sm)}`);
      } else {
        const latest = sm.getLatestSession();
        if (!latest) { console.log("没有历史会话"); break; }
        const ctx_ = sm.loadSession(latest.id)!;
        messages.length = 0;
        messages.push(...ctx_.messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant", content: m.content,
        })));
        console.log(`已恢复: ${sessionInfo(sm)}`);
      }
      break;
    }

    case "/list": {
      const sessions = sm.listSessions(15);
      if (!sessions.length) { console.log("暂无历史会话"); break; }
      console.log("\n--- 我的会话 ---");
      for (const s of sessions) {
        const date = new Date(s.updatedAt).toLocaleString("zh-CN");
        const preview = (s.preview || "").slice(0, 40);
        const cur = sm.getCurrent()?.id === s.sessionId ? " *" : "  ";
        console.log(`${cur} ${s.sessionId.slice(0, 8)} | ${s.title} (${s.messageCount}条) | ${date}`);
        if (preview) console.log(`     ${preview}`);
      }
      console.log("");
      break;
    }

    case "/save": {
      const session = sm.getCurrent();
      if (!session) { console.log("无活跃会话"); break; }
      try {
        const msgs = sm.getMessages();
        if (msgs.length > 4) {
          const ctxMsgs = messages.map((m) => ({
            role: m.role, content: m.content,
          }));
          await engine.afterTurn(
            { roomId: room.id, userId: user.id, sessionId: session.id, messages: ctxMsgs },
            runtime, model,
            (summary) => {
              sm.updateSummary(summary);
              events.record(room.id, user.id, "summary_generated", { sessionId: session.id });
              console.log(`摘要: ${summary}`);
            },
          );
        }
      } catch { /* ignore */ }
      sm.touch(session.id);
      console.log(`已保存: ${sessionInfo(sm)}`);
      break;
    }

    case "/clear":
      sm.clearMessages();
      messages.length = 0;
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      console.log("对话已清除");
      break;

    case "/summary": {
      const s = sm.getCurrent();
      if (!s) { console.log("无活跃会话"); break; }
      console.log(`\n标题: ${s.title}`);
      console.log(`消息数: ${s.messageCount}`);
      if (s.summary) console.log(`摘要: ${s.summary}`);
      break;
    }

    case "/model": {
      const m = BUILTIN_MODELS.find((x) => x.id === arg);
      if (m) { Object.assign(ctx, { model: m }); console.log(`已切换: ${m.name}`); }
      else console.log(`可用: ${BUILTIN_MODELS.map((x) => x.id).join(", ")}`);
      break;
    }

    // ---- 多用户协作命令 ----

    case "/rooms": {
      const rooms = roomMgr.list(user.id);
      if (!rooms.length) { console.log("暂无项目空间"); break; }
      console.log("\n--- 项目空间 ---");
      for (const r of rooms) {
        const cur = room.id === r.id ? " *" : "  ";
        console.log(`${cur} ${r.id.slice(0, 8)} | ${r.name}`);
        if (r.description) console.log(`     ${r.description}`);
      }
      console.log("");
      break;
    }

    case "/members": {
      const members = roomMgr.getMembers(room.id);
      console.log(`\n--- ${room.name} 成员 ---`);
      for (const m of members) {
        console.log(`  ${m.userName || m.userId.slice(0, 8)} (${m.role})`);
      }
      console.log("");
      break;
    }

    case "/invite": {
      if (!arg) { console.log("用法: /invite <用户名>"); break; }
      const target = userMgr.findByName(arg) || userMgr.create(arg);
      roomMgr.addMember(room.id, target.id, "developer");
      events.record(room.id, user.id, "member_joined", {
        invitedUser: target.name, invitedById: user.id,
      });
      console.log(`${target.name} 已加入 ${room.name}`);
      break;
    }

    case "/events": {
      const evts = events.list(room.id, 20);
      if (!evts.length) { console.log("暂无活动"); break; }
      console.log(`\n--- ${room.name} 最近活动 ---`);
      for (const e of evts) {
        const ts = e.createdAt ? new Date(e.createdAt).toLocaleString("zh-CN") : "";
        const who = e.userName || e.userId?.slice(0, 8) || "系统";
        console.log(`  ${ts} | ${who} | ${e.eventType}`);
      }
      console.log("");
      break;
    }

    case "/remember": {
      const [key, ...vp] = arg.split(" ");
      if (!key || !vp.length) { console.log("用法: /remember <key> <value>"); break; }
      const value = vp.join(" ");
      memory.set({ key, value, category: "decision", authorId: user.id });
      events.record(room.id, user.id, "memory_added", { key });
      console.log(`已记录: ${key}`);
      break;
    }

    case "/recall": {
      if (!arg) { console.log("用法: /recall <关键词>"); break; }
      const results = memory.search(arg, 5);
      if (!results.length) { console.log(`未找到 "${arg}" 相关记忆`); break; }
      for (const r of results) {
        console.log(`  [${r.category}] ${r.key}: ${r.value}`);
      }
      break;
    }

    default:
      console.log(`未知命令: ${cmd} (输入 /help 查看帮助)`);
  }
}
