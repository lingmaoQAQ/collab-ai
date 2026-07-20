// Chat 命令 v0.5.1 — 多用户协作 + 终端 UI 升级

import { Command } from "commander";
import * as readline from "node:readline";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
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
import { compactConversation } from "../../context/compact.js";
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
import { getToolDefs, executeTool, toolCount } from "../../tools/index.js";
import { runToolLoop } from "../../tools/loop.js";

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
    ["── 会话 ──", ""],
    ["/new <title>", "创建新会话"],
    ["/load <id>", "加载会话"],
    ["/list", "列出会话"],
    ["/save", "保存 & 生成摘要"],
    ["/clear", "清除对话"],
    ["/compact", "压缩上下文（节省token）"],
    ["── 上下文 ──", ""],
    ["/context", "查看三级上下文"],
    ["/context project", "项目上下文"],
    ["/context user", "用户风格/偏好"],
    ["── 工具 ──", ""],
    ["/tools", "列出可用工具"],
    ["/run <cmd>", "执行命令"],
    ["/cat <file>", "读取文件"],
    ["/ls [path]", "列出目录"],
    ["/search <regex>", "搜索代码"],
    ["── 协作 ──", ""],
    ["/rooms", "项目空间"],
    ["/members", "房间成员"],
    ["/invite <name>", "邀请用户"],
    ["/events", "最近活动"],
    ["/remember <k> <v>", "记录共享记忆"],
    ["/recall <query>", "搜索共享记忆"],
    ["── 其他 ──", ""],
    ["/model <id>", "切换模型"],
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
    .option("--connect <url>", "连接到 Gateway（如 ws://localhost:3000）")
    .option("--token <string>", "Gateway 访问令牌")
    .option("-w, --workspace <path>", "工作区路径（Gateway 模式）")
    .action(async (options) => {
      // ── Gateway 模式：连接远程服务器 ──
      if (options.connect) {
        const { GatewayClient } = await import("../../gateway/client.js");
        const client = new GatewayClient();
        const wsUrl = options.connect;
        const roomId = options.room || "default";
        const userName = options.user || "developer";
        const workspace = options.workspace || process.cwd();

        console.log(`\n  CollabAI Node v0.7.0`);
        console.log(`  连接: ${wsUrl}`);
        console.log(`  房间: ${roomId} | 用户: ${userName}`);
        console.log(`  工作区: ${workspace}\n`);

        try {
          await client.connect(wsUrl, roomId, userName, workspace, options.token || "");
        } catch (err) {
          console.log(error(`  连接失败: ${err instanceof Error ? err.message : err}`));
          console.log(muted("  提示: 请先启动 Gateway: npm run gateway -- --port 3000\n"));
          process.exit(1);
        }

        // 收到欢迎消息
        client.on("welcome", (msg) => {
          if (msg.type === "welcome") {
            console.log(info(`  已加入房间: ${msg.room.name}`));
            console.log(muted(`  在线成员: ${msg.members.map((m) => `${m.name}(${m.workspace})`).join(", ")}`));
            console.log("");
          }
        });

        // 收到 AI 回复
        client.on("ai_response", (msg) => {
          if (msg.type === "ai_response") {
            console.log(`${aiPrefix()}${msg.text}`);
          }
        });

        // 收到广播/通知
        client.on("broadcast", (msg) => {
          if (msg.type === "broadcast") console.log(`\n${bold(msg.from)}: ${msg.text}`);
        });
        client.on("activity", (msg) => {
          if (msg.type === "activity") console.log(muted(`\n  ${msg.text}`));
        });
        client.on("joined", (msg) => {
          if (msg.type === "joined") console.log(muted(`  → ${msg.user} 上线了 (${msg.workspace})`));
        });
        client.on("left", (msg) => {
          if (msg.type === "left") console.log(muted(`  ← ${msg.user} 下线了`));
        });
        client.on("error", (msg) => {
          if (msg.type === "error") console.log(error(`  Gateway: ${msg.message}`));
        });

        // 交互循环
        const rl = readline.createInterface({
          input: process.stdin, output: process.stdout,
          prompt: `[${userName}] > `,
        });
        rl.prompt();

        for await (const line of rl) {
          const input = line.trim();
          if (!input) { rl.prompt(); continue; }
          if (input === "/quit" || input === "/exit") {
            client.disconnect();
            rl.close();
            process.exit(0);
          }
          if (input === "/members") {
            // 不做什么，成员列表在 welcome 中已显示
          } else if (input.startsWith("/remember ")) {
            const [, key, ...vp] = input.split(" ");
            client.remember(key, vp.join(" "));
            console.log(muted(`  已同步记忆: ${key}`));
          } else if (input.startsWith("/recall ")) {
            const query = input.slice(8).trim();
            client.recall(query);
            client.on("recall_result", (msg) => {
              if (msg.type === "recall_result" && msg.query === query) {
                console.log(msg.results || "无结果");
              }
            });
          } else if (input === "/help") {
            console.log(dim("  /remember <k> <v>  记录共享记忆"));
            console.log(dim("  /recall <query>    搜索共享记忆"));
            console.log(dim("  /members           查看在线成员"));
            console.log(dim("  /quit              断开连接"));
          } else {
            client.chat(input);
          }
          rl.prompt();
        }
        return;
      }

      // ── 本地模式：完整功能 ──
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
          showBanner("1.0.0", model.name, model.provider.name, room.name, user.name);
          console.log(dim("  ") + muted("已恢复: ") + sessionInfo(sm) + "\n");
        }
      }
      if (!sm.getCurrent()) {
        sm.startSession("新对话", model.id, systemPrompt);
        events.record(room.id, user.id, "session_started", {});
        showBanner("1.0.0", model.name, model.provider.name, room.name, user.name);
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

      // 优雅退出
      const shutdown = () => {
        console.log(dim("\n  正在退出..."));
        closeDatabase();
        rl.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      rl.on("close", () => closeDatabase());

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

          // AI 工具调用循环（带 fallback 到纯文本）
          const renderer = createStreamRenderer();
          let text = "";
          let toolCount = 0;
          try {
            const result = await runToolLoop({
              runtime, model,
              system: finalSystem,
              messages: assembled.messages
                .filter((m) => m.role !== "system")
                .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
              maxToolRounds: 5,
              maxTokens: config.maxTokens, temperature: config.temperature,
              onText: (t) => renderer.write(t),
              onToolUse: (tc) => {
                toolCount++;
                console.log("\n" + muted("  ⚡ " + tc.name + " ") + dim(Object.values(tc.arguments).join(" ").slice(0, 60)));
              },
            });
            text = result.finalText;
            if (!renderer.hasOutput() && text) {
              process.stdout.write(aiPrefix() + text + "\n");
            }
            renderer.done();
            if (toolCount > 0) {
              console.log(dim(`  (${toolCount} 个工具调用)\n`));
            }
          } catch {
            // Fallback: 简单流式
            const stream = runtime.stream({
              model, system: finalSystem,
              messages: assembled.messages,
              maxTokens: config.maxTokens, temperature: config.temperature,
            });
            for await (const event of stream) {
              if (event.type === "text_delta") { text += event.text; renderer.write(event.text); }
              else if (event.type === "error") throw new Error(event.error);
            }
            if (!renderer.hasOutput() && text) {
              process.stdout.write(aiPrefix() + text + "\n");
            }
            renderer.done();
          }

          messages.push({ role: "assistant", content: text });
          sm.saveMessage("assistant", text);
          events.record(room.id, user.id, "message_sent", { sessionId: sm.getCurrent()?.id });

          // 长对话提醒压缩
          if (messages.filter((m) => m.role !== "system").length > 20) {
            console.log(muted(`  💡 对话较长，建议 /compact 压缩上下文以节省 token`));
          }

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

    case "/compact": {
      const nonSystem = messages.filter((m) => m.role !== "system");
      if (nonSystem.length < 10) {
        console.log(muted("  消息不足（需要至少10条），无需压缩"));
        break;
      }
      console.log(info(`  正在压缩 ${nonSystem.length} 条消息...`));
      try {
        const result = await compactConversation(runtime, model, messages);
        // 用摘要替换老消息
        messages.length = 0;
        messages.push({ role: "system", content: `[对话摘要] ${result.summary}` });
        // 保留最近消息
        const keepMsgs = sm.getMessages().slice(-result.keptCount);
        for (const m of keepMsgs) {
          messages.push({ role: m.role as "user" | "assistant", content: m.content });
        }
        // 清除DB旧消息，重新写入压缩后的
        sm.clearMessages();
        sm.saveMessage("system", `[对话摘要] ${result.summary}`);
        for (const m of keepMsgs) {
          sm.saveMessage(m.role as "user" | "assistant", m.content);
        }
        console.log(info(
          `  压缩完成: ${result.compactedCount} 条 → 摘要 | ` +
          `token: ${result.oldTokens} → ${result.newTokens} ` +
          `(节省 ${Math.round((1 - result.newTokens / result.oldTokens) * 100)}%)`,
        ));
        console.log(muted(`  摘要: ${result.summary.slice(0, 100)}...`));
      } catch (err) {
        console.log(error(`  压缩失败: ${err instanceof Error ? err.message : err}`));
      }
      break;
    }

    case "/clear":
      sm.clearMessages();
      messages.length = 0;
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      console.log(dim("  对话已清除"));
      break;
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

    // ---- 上下文管理 ----
    case "/context": {
      if (!arg || arg === "show") {
        const s = sm.getCurrent();
        const cUser = userMgr.get(user.id);
        const profile = typeof cUser?.profile === "string" ? JSON.parse(cUser.profile as string) : cUser?.profile || {};
        console.log("");
        showSeparator("会话上下文");
        console.log(dim("  会话: ") + (s?.title || "无"));
        console.log(dim("  消息: ") + (s?.messageCount || 0) + " 条");
        console.log(dim("  摘要: ") + (s?.summary || "(无)"));
        showSeparator("用户上下文");
        console.log(dim("  用户: ") + user.name);
        console.log(dim("  风格: ") + (profile?.codingStyle || "(学习中)"));
        showSeparator("项目上下文");
        console.log(dim("  房间: ") + room.name);
        console.log(dim("  记忆: ") + memory.list().length + " 条");
        console.log(dim("  成员: ") + roomMgr.getMembers(room.id).length + " 人");
        console.log("");
      } else if (arg === "project") {
        const mems = memory.list();
        console.log(info("\n  项目记忆 (" + mems.length + " 条):"));
        for (const m of mems) {
          console.log(dim(`  [${m.category}] `) + m.key + dim(": ") + m.value.slice(0, 80));
        }
        console.log("");
      } else if (arg === "user") {
        const cUser = userMgr.get(user.id);
        const p = typeof cUser?.profile === "string" ? JSON.parse(cUser.profile as string) : cUser?.profile || {};
        console.log(info("\n  用户设置:"));
        console.log(dim("  名称: ") + user.name);
        console.log(dim("  风格: ") + (p?.codingStyle || "未设置"));
        console.log(dim("  偏好: ") + JSON.stringify(p?.preferences || {}));
        console.log("");
      } else if (arg === "inject") {
        console.log(info("  上下文将在下一轮对话中自动注入"));
      } else {
        console.log(muted("  用法: /context [project|user|session|inject]"));
      }
      break;
    }

    // ---- 工具相关 ----
    case "/tools": {
      const defs = getToolDefs();
      console.log(info(`\n  可用工具 (${defs.length}):`));
      for (const t of defs) {
        console.log("  " + bold(t.name) + dim(" — ") + t.description.slice(0, 60));
      }
      console.log(muted("\n  提示: AI 会在需要时自动调用这些工具"));
      console.log("");
      break;
    }

    case "/run": {
      if (!arg) { console.log(error("  用法: /run <命令>")); break; }
      const result = await executeTool({ id: "cli", name: "run_command", arguments: { command: arg } });
      console.log(result.isError ? error(result.content) : result.content);
      break;
    }

    case "/cat": {
      if (!arg) { console.log(error("  用法: /cat <文件路径>")); break; }
      const result = await executeTool({ id: "cli", name: "read_file", arguments: { path: arg } });
      console.log(result.isError ? error(result.content) : result.content);
      break;
    }

    case "/ls": {
      const result = await executeTool({ id: "cli", name: "list_files", arguments: { path: arg || "." } });
      console.log(result.content);
      break;
    }

    case "/search": {
      if (!arg) { console.log(error("  用法: /search <正则>")); break; }
      const result = await executeTool({ id: "cli", name: "search_code", arguments: { pattern: arg } });
      console.log(result.isError ? error(result.content) : result.content);
      break;
    }

    // ---- 工作区管理 ----
    case "/workspace": {
      if (!arg) {
        console.log(info("\n  当前工作区: ") + process.cwd());
        const result = await executeTool({ id: "cli", name: "list_files", arguments: { path: "." } });
        console.log("\n" + result.content.split("\n").slice(1).join("\n"));
      } else {
        try {
          process.chdir(arg);
          console.log(info("  工作区已切换: ") + process.cwd());
        } catch {
          console.log(error("  无效路径: " + arg));
        }
      }
      console.log("");
      break;
    }

    // ---- 会话导出 ----
    case "/export": {
      const s = sm.getCurrent();
      if (!s) { console.log(muted("  无活跃会话")); break; }
      const msgs = sm.getMessages();
      const filename = arg || `session-${s.id.slice(0, 8)}.md`;
      const content = [
        `# ${s.title}`,
        `> 模型: ${s.modelId} | 消息: ${msgs.length} | ${new Date().toISOString()}`,
        "",
        ...msgs.map((m) => `**${m.role}**: ${m.content}\n`),
      ].join("\n");
      const filePath = resolve(process.cwd(), filename);
      writeFileSync(filePath, content, "utf-8");
      console.log(info(`  已导出: ${filename} (${content.length} 字节)`));
      break;
    }

    // ---- 记忆管理 ----
    case "/memories": {
      const mems = memory.list();
      if (!mems.length) { console.log(muted("  暂无项目记忆")); break; }
      console.log(info(`\n  项目记忆 (${mems.length}):`));
      for (const m of mems) {
        const author = m.authorId ? userMgr.get(m.authorId)?.name || m.authorId.slice(0, 6) : "未知";
        console.log(
          "  " + bold(`[${m.category}]`) + " " + m.key +
          dim(" — ") + m.value.slice(0, 60) +
          dim(" (" + author + ")"),
        );
      }
      console.log("");
      break;
    }

    default:
      console.log(error(`  未知命令: ${cmd} (输入 /help 查看帮助)`));
  }
}
