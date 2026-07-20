// Anthropic Messages API 适配器 — 基于 @anthropic-ai/sdk

import Anthropic from "@anthropic-ai/sdk";
import type {
  StreamEvent,
  StreamOptions,
  CompleteOptions,
  Tool,
  ToolUse,
} from "../types.js";
import type { ApiProvider } from "../registry.js";

function toAnthropicTools(tools?: Tool[]): Anthropic.Tool[] {
  if (!tools?.length) return [];
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));
}

function toAnthropicSystem(
  system?: string,
): string | Anthropic.TextBlockParam[] {
  if (!system) return [];
  return system;
}

export function createAnthropicProvider(apiKey?: string): ApiProvider {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Set env var or pass apiKey to createAnthropicProvider()",
    );
  }

  const client = new Anthropic({ apiKey: key });

  async function* stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
    const messages = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: typeof m.content === "string"
          ? m.content
          : m.content as Anthropic.ContentBlock[],
      }));

    const systemMsg = opts.system || opts.messages.find((m) =>
      m.role === "system"
    )?.content;
    const systemStr = typeof systemMsg === "string" ? systemMsg : undefined;

    const response = client.messages.stream({
      model: opts.model.id,
      max_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature,
      system: toAnthropicSystem(systemStr),
      messages,
      tools: toAnthropicTools(opts.tools),
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of response) {
      switch (event.type) {
        case "message_start":
          inputTokens = event.message.usage.input_tokens;
          outputTokens = event.message.usage.output_tokens;
          break;

        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          }
          break;

        case "content_block_start":
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_use",
              tool: {
                id: event.content_block.id,
                name: event.content_block.name,
                input: {}, // 初始为空，后续累积
              },
            };
          }
          break;

        case "message_delta":
          outputTokens += event.usage.output_tokens;
          break;
      }
    }

    yield { type: "usage", usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
    yield { type: "done" };
  }

  async function* streamSimple(
    opts: Omit<StreamOptions, "tools">,
  ): AsyncIterable<StreamEvent> {
    yield* stream({ ...opts, tools: undefined });
  }

  async function complete(opts: CompleteOptions) {
    const messages = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: typeof m.content === "string"
          ? m.content
          : m.content as Anthropic.ContentBlock[],
      }));

    const systemMsg = opts.system || opts.messages.find((m) =>
      m.role === "system"
    )?.content;
    const systemStr = typeof systemMsg === "string" ? systemMsg : undefined;

    const response = await client.messages.create({
      model: opts.model.id,
      max_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature,
      system: toAnthropicSystem(systemStr),
      messages,
      tools: toAnthropicTools(opts.tools),
    });

    let text = "";
    const toolUses: ToolUse[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      toolUses,
    };
  }

  return {
    api: "anthropic-messages",
    stream,
    streamSimple,
    complete,
  };
}
