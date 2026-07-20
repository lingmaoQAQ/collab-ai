// OpenAI Chat Completions API 适配器 — 兼容 DeepSeek / Ollama 等接口

import OpenAI from "openai";
import type { StreamEvent, StreamOptions, CompleteOptions } from "../types.js";
import type { ApiProvider } from "../registry.js";

export interface OpenAIChatProviderOptions {
  apiKey: string;
  /** 自定义 baseURL，如 https://api.deepseek.com/v1 */
  baseURL?: string;
  /** 注册到注册表的 api 标识 */
  api?: string;
}

export function createOpenAIChatProvider(
  options: OpenAIChatProviderOptions,
): ApiProvider {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL || undefined,
  });

  function buildMessages(opts: StreamOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    const systemMsg = opts.system ||
      opts.messages.find((m) => m.role === "system")?.content;
    if (systemMsg) {
      messages.push({
        role: "system",
        content: typeof systemMsg === "string" ? systemMsg : "",
      });
    }

    for (const msg of opts.messages) {
      if (msg.role === "system") continue; // 已经处理过了
      messages.push({
        role: msg.role as "user" | "assistant",
        content: typeof msg.content === "string" ? msg.content : "",
      });
    }

    return messages;
  }

  async function* stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
    const stream = client.chat.completions.stream({
      model: opts.model.id,
      messages: buildMessages(opts),
      max_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: "text_delta", text: delta.content };
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    // 获取最终 usage
    const completion = await stream.finalChatCompletion();
    if (completion.usage) {
      inputTokens = completion.usage.prompt_tokens;
      outputTokens = completion.usage.completion_tokens;
    }

    yield { type: "usage", usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
    yield { type: "done" };
  }

  async function* streamSimple(
    opts: Omit<StreamOptions, "tools">,
  ): AsyncIterable<StreamEvent> {
    yield* stream(opts);
  }

  async function complete(opts: CompleteOptions) {
    const response = await client.chat.completions.create({
      model: opts.model.id,
      messages: buildMessages(opts),
      max_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature,
    });

    return {
      text: response.choices[0]?.message?.content ?? "",
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      toolUses: [],
    };
  }

  return {
    api: options.api || "openai-chat",
    stream,
    streamSimple,
    complete,
  };
}
