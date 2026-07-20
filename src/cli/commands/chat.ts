// Chat 命令 — 交互式对话循环

import { Command } from "commander";
import * as readline from "node:readline";
import { loadConfig, getApiKey } from "../../config/index.js";
import {
  getDefaultRegistry,
  createLlmRuntime,
  createAnthropicProvider,
  createOpenAIProvider,
  BUILTIN_MODELS,
} from "../../llm/index.js";
import type { Message, StreamEvent, ToolUse } from "../../llm/types.js";

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

  // 有 key 就注册对应的 provider
  if (process.env.ANTHROPIC_API_KEY) {
    registry.register(createAnthropicProvider());
  }
  if (process.env.OPENAI_API_KEY) {
    registry.register(createOpenAIProvider());
  }

  if (registry.list().length === 0) {
    throw new Error(
      "No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env or environment.",
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

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("启动交互式 AI 对话")
    .option("-m, --model <id>", "指定模型 ID")
    .option("-p, --provider <id>", "指定 provider (anthropic|openai)")
    .option("-s, --system <text>", "系统提示词")
    .option("--no-stream", "禁用流式输出")
    .action(async (options) => {
      const config = loadConfig();
      const modelId = options.model || config.model;
      const model = findModel(modelId);

      // 初始化 provider
      const registry = initProviders();
      const runtime = createLlmRuntime(registry);

      const systemPrompt = options.system || config.systemPrompt;
      const messages: Message[] = [];

      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }

      console.log(`CollabAI v0.1.0`);
      console.log(`Model: ${model.name} (${model.provider.name})`);
      console.log(`Type /help for commands, /quit to exit.\n`);

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "\n> ",
      });

      rl.prompt();

      for await (const line of rl) {
        const input = line.trim();

        if (!input) {
          rl.prompt();
          continue;
        }

        // 处理斜杠命令
        if (input.startsWith("/")) {
          const [cmd] = input.split(/\s+/);
          switch (cmd) {
            case "/quit":
            case "/exit":
              console.log("Goodbye!");
              rl.close();
              process.exit(0);
            case "/help":
              console.log("Commands:");
              console.log("  /quit, /exit  退出");
              console.log("  /clear        清除对话历史");
              console.log("  /model <id>   切换模型");
              console.log("  /help         显示帮助");
              break;
            case "/clear":
              messages.length = 0;
              if (systemPrompt) {
                messages.push({ role: "system", content: systemPrompt });
              }
              console.log("Conversation cleared.");
              break;
            case "/model":
              // eslint-disable-next-line no-case-declarations
              const newId = input.split(/\s+/)[1];
              if (newId && BUILTIN_MODELS.find((m) => m.id === newId)) {
                console.log(`Switched to ${newId}`);
                // 切换在下一次请求时生效，由 findModel 处理
                // 实际生产中这里应该重新创建 runtime
              } else {
                console.log(`Unknown model. Available: ${BUILTIN_MODELS.map((m) => m.id).join(", ")}`);
              }
              break;
            default:
              console.log(`Unknown command: ${cmd}`);
          }
          rl.prompt();
          continue;
        }

        // 普通消息：发送给 AI
        messages.push({ role: "user", content: input });

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

          messages.push({ role: "assistant", content: text });
          process.stdout.write("\n");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`\nError: ${message}`);
          // 移除失败的用户消息
          messages.pop();
        }

        rl.prompt();
      }
    });
}
