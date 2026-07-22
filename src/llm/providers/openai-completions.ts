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
      const m = msg as any;
      if (m.role === "system") continue;
      const content = typeof m.content === "string" ? m.content : "";

      if (m.role === "tool") {
        messages.push({ role: "tool", content, tool_call_id: m.tool_call_id || "" });
      } else if (m.role === "assistant" && m.tool_calls) {
        messages.push({ role: "assistant", content: content || null, tool_calls: m.tool_calls } as any);
      } else {
        messages.push({ role: m.role as "user" | "assistant", content });
      }
    }

    return messages;
  }

  async function* stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
    // 将内部 Tool 格式转为 OpenAI Tool 格式
    const openaiTools = opts.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const stream = client.chat.completions.stream({
      model: opts.model.id,
      messages: buildMessages(opts),
      max_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature,
      tools: openaiTools?.length ? openaiTools : undefined,
      tool_choice: (openaiTools?.length ? "auto" : undefined) as any,
    });

    let inputTokens = 0;
    let outputTokens = 0;
    const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: "text_delta", text: delta.content };
      }
      // 工具调用增量
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: tc.id || "", name: tc.function?.name || "", args: "" });
          }
          const entry = toolCalls.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    // 发出完整的工具调用
    for (const [, tc] of toolCalls) {
      if (tc.name && tc.args) {
        try {
          yield {
            type: "tool_use",
            tool: { id: tc.id, name: tc.name, input: JSON.parse(tc.args) },
          };
        } catch {
          // 忽略解析失败
        }
      }
    }

    const completion = await stream.finalChatCompletion();
    if (completion.usage) {
      inputTokens = completion.usage.prompt_tokens;
      outputTokens = completion.usage.completion_tokens;
    }

    yield { type: "usage", usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
    yield { type: "done" };
  }

  async function* streamSimple(
    opts: StreamOptions,
  ): AsyncIterable<StreamEvent> {
    yield* stream(opts);
  }

  async function complete(opts: CompleteOptions) {
    const openaiTools = opts.tools?.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    const response = await client.chat.completions.create({
      model: opts.model.id,
      messages: buildMessages(opts),
      max_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature,
      tools: openaiTools?.length ? openaiTools : undefined,
    });

    // 提取工具调用
    const toolUses: Array<{ id: string; name: string; input: Record<string, string> }> = [];
    if (response.choices[0]?.message?.tool_calls) {
      for (const tc of response.choices[0].message.tool_calls) {
        try {
          const func = (tc as any).function;
          toolUses.push({ id: tc.id, name: func?.name || "", input: JSON.parse(func?.arguments || "{}") });
        } catch { /* skip */ }
      }
    }

    return {
      text: response.choices[0]?.message?.content ?? "",
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      toolUses,
    };
  }

  return {
    api: options.api || "openai-chat",
    stream,
    streamSimple,
    complete,
  };
}
