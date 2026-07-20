// Chat 命令 — 带会话管理的交互式对话

import { Command } from "commander";
import * as readline from "node:readline";
import { loadConfig } from "../../config/index.js";
import {
  getDefaultRegistry,
  createLlmRuntime,
  createAnthropicProvider,
  createOpenAIProvider,
  createOpenAIChatProvider,
  BUILTIN_MODELS,
} from "../../llm/index.js";
import type { Model, StreamEvent, ToolUse } from "../../llm/types.js";
import type { LlmRuntime } from "../../llm/runtime.js";
import { SessionManager, generateTitle, generateSummary } from "../../sessions/manager.js";
import { MemoryStore } from "../../memory/store.js";
import type { MemoryEntry } from "../../memory/types.js";
import { closeDatabase } from "../../sessions/database.js";

// ---- 工具函数 ----

function findModel(modelId: string) {
  const model = BUILTIN_MODELS.find((m) => m.id === modelId);
  if (!model) {
    throw new Error(
      `Unknown model "${modelId}". Available: ${BUILTIN_MODELS.map((m) => m.id).join(", ")}`,
    );
  }
  return model;
}

function initProviders() {
  const registry = getDefaultRegistry();
  if (process.env.ANTHROPIC_API_KEY) {
    registry.register(createAnthropicProvider());
  }
  if (process.env.OPENAI_API_KEY) {
    registry.register(createOpenAIProvider());
  }
  const chatApiKey = process.env.OPENAI_CHAT_API_KEY ||
    process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const chatBaseUrl = process.env.OPENAI_CHAT_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL;
  if (chatApiKey || chatBaseUrl) {
    registry.register(createOpenAIChatProvider({
      apiKey: chatApiKey || "ollama",
      baseURL: chatBaseUrl,
      api: "openai-chat",
    }));
  }
  if (registry.list().length === 0) {
    throw new Error(
      "No API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY.",
    );
  }
  return registry;
}

async function collectStream(
  stream: AsyncIterable<StreamEvent>,
  onText?: (text: string) => void,
): Promise<{ text: string; toolUses: ToolUse[] }> {
  let text = "";
  const toolUses: ToolUse[] = [];
  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
        text += event.text;
        if (onText) onText(event.text);
        break;
      case "tool_use":
        toolUses.push(event.tool);
        break;
      case "error":
        throw new Error(event.error);
      case "usage":
      case "done":
        break;
    }
  }
  return { text, toolUses };
}

// ---- Slash 命令处理器 ----

function showHelp() {
  console.log(`
  /new           创建新会话
  /load <id>     加载指定会话
  /load          加载最近会话
  /list          列出最近会话
  /save          保存当前会话并生成摘要
  /clear         清除当前对话历史
  /summary       查看会话摘要
  /model <id>    切换模型
  /help          显示帮助
  /quit, /exit   退出
`);
}

function sessionInfo(sm: SessionManager): string {
  const s = sm.getCurrent();
  if (!s) return "无活跃会话";
  const date = new Date(s.updatedAt).toLocaleString("zh-CN");
  return `[${s.title}] ${s.messageCount} 条消息 | ${date}`;
}

// ---- 主命令 ----

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("启动交互式 AI 对话（支持会话管理）")
    .option("-m, --model <id>", "指定模型 ID")
    .option("-s, --system <text>", "系统提示词")
    .option("--new", "强制创建新会话（不恢复上次）")
    .action(async (options) => {
      const config = loadConfig();
      const modelId = options.model || config.model;
      const model = findModel(modelId);

      const registry = initProviders();
      const runtime = createLlmRuntime(registry);
      const sm = new SessionManager();
      const memory = new MemoryStore();
      const systemPrompt = options.system || config.systemPrompt;

      // 恢复上次会话 或 创建新会话
      if (!options.new) {
        const latest = sm.getLatestSession();
        if (latest) {
          const ctx = sm.loadSession(latest.id);
          if (ctx) {
            console.log(`CollabAI v0.2.0 | Model: ${model.name}`);
            console.log(`已恢复: ${sessionInfo(sm)}\n`);
          }
        }
      }

      if (!sm.getCurrent()) {
        sm.startSession("新对话", modelId, systemPrompt);
        console.log(`CollabAI v0.2.0 | Model: ${model.name}`);
        console.log(`新会话已创建\n`);
      }

      // 从 DB 或初始 prompt 构建内存消息列表
      const dbMessages = sm.getMessages();
      const messages = dbMessages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      // 如果 DB 没有系统消息，从 config 注入
      if (!messages.some((m) => m.role === "system") && systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
        sm.saveMessage("system", systemPrompt);
      }

      let titleGenerated = dbMessages.length > 1; // 已有历史就不重新生成标题

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "\n> ",
      });

      rl.prompt();

      for await (const line of rl) {
        const input = line.trim();
        if (!input) { rl.prompt(); continue; }

        // ---- 斜杠命令 ----
        if (input.startsWith("/")) {
          const parts = input.split(/\s+/);
          const cmd = parts[0];
          const arg = parts.slice(1).join(" ");

          try {
            await handleCommand(cmd, arg, {
              sm, runtime, model, memory,
              messages, systemPrompt, rl, config,
            });
          } catch (err) {
            console.log(`Error: ${err instanceof Error ? err.message : err}`);
          }

          if (cmd === "/quit" || cmd === "/exit") return;
          rl.prompt();
          continue;
        }

        // ---- 普通消息 ----
        sm.saveMessage("user", input);
        messages.push({ role: "user" as const, content: input });

        // 第一条用户消息后自动生成标题
        if (!titleGenerated) {
          try {
            const title = await generateTitle(runtime, model, input);
            sm.updateTitle(title);
            titleGenerated = true;
          } catch { /* 忽略标题生成失败 */ }
        }

        try {
          const stream = runtime.stream({
            model,
            messages,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
          });

          process.stdout.write("\nAI: ");
          const { text } = await collectStream(stream, (t) => {
            process.stdout.write(t);
          });
          process.stdout.write("\n");

          messages.push({ role: "assistant" as const, content: text });
          sm.saveMessage("assistant", text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`\nError: ${msg}`);
          messages.pop();
        }

        rl.prompt();
      }

      // 退出时清理
      closeDatabase();
    });
}

// ---- 命令处理（可单独抽出） ----

interface CommandContext {
  sm: SessionManager;
  runtime: LlmRuntime;
  model: Model;
  memory: MemoryStore;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  systemPrompt: string;
  rl: readline.Interface;
  config: ReturnType<typeof loadConfig>;
}

async function handleCommand(
  cmd: string,
  arg: string,
  ctx: CommandContext,
): Promise<void> {
  const { sm, runtime, model, memory, messages, systemPrompt, rl } = ctx;

  switch (cmd) {
    case "/quit":
    case "/exit":
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
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
        sm.saveMessage("system", systemPrompt);
      }
      console.log(`新会话: ${title}`);
      break;
    }

    case "/load": {
      if (arg) {
        const ctx_ = sm.loadSession(arg);
        if (!ctx_) { console.log(`会话 ${arg} 不存在`); break; }
        messages.length = 0;
        messages.push(...ctx_.messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        })));
        console.log(`已加载: ${sessionInfo(sm)}`);
      } else {
        const latest = sm.getLatestSession();
        if (!latest) { console.log("没有历史会话"); break; }
        const ctx_ = sm.loadSession(latest.id)!;
        messages.length = 0;
        messages.push(...ctx_.messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        })));
        console.log(`已恢复: ${sessionInfo(sm)}`);
      }
      break;
    }

    case "/list": {
      const sessions = sm.listSessions(15);
      if (!sessions.length) { console.log("暂无历史会话"); break; }
      console.log("\n--- 会话列表 ---");
      for (const s of sessions) {
        const date = new Date(s.updatedAt).toLocaleString("zh-CN");
        const preview = (s.preview || "").slice(0, 40);
        const current = sm.getCurrent()?.id === s.sessionId ? " *" : "  ";
        console.log(`${current} ${s.sessionId.slice(0, 8)} | ${s.title} (${s.messageCount}条) | ${date}`);
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
          const summary = await generateSummary(runtime, model, msgs);
          sm.updateSummary(summary);
          console.log(`摘要: ${summary}`);
        }
      } catch { /* 忽略 */ }
      sm.touch(session.id);
      console.log(`会话已保存: ${sessionInfo(sm)}`);
      break;
    }

    case "/clear":
      sm.clearMessages();
      messages.length = 0;
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      console.log("对话已清除");
      break;

    case "/summary": {
      const s = sm.getCurrent();
      if (!s) { console.log("无活跃会话"); break; }
      console.log(`\n标题: ${s.title}`);
      console.log(`消息数: ${s.messageCount}`);
      console.log(`创建: ${new Date(s.createdAt).toLocaleString("zh-CN")}`);
      console.log(`更新: ${new Date(s.updatedAt).toLocaleString("zh-CN")}`);
      if (s.summary) console.log(`摘要: ${s.summary}`);
      break;
    }

    case "/model": {
      const newModel = BUILTIN_MODELS.find((m) => m.id === arg);
      if (newModel) {
        Object.assign(ctx, { model: newModel });
        console.log(`已切换: ${newModel.name}`);
      } else {
        console.log(`可用: ${BUILTIN_MODELS.map((m) => m.id).join(", ")}`);
      }
      break;
    }

    case "/remember": {
      // /remember <key> <value> — 手动记录知识
      const [key, ...valueParts] = arg.split(" ");
      if (!key || !valueParts.length) {
        console.log("用法: /remember <key> <value>");
        break;
      }
      const value = valueParts.join(" ");
      const session = sm.getCurrent();
      memory.set({
        key,
        value,
        category: "decision",
        sessionId: session?.id,
      });
      console.log(`已记录: ${key}`);
      break;
    }

    case "/recall": {
      // /recall <query> — 搜索记忆
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
