// OpenAI Responses API 适配器 — 基于 openai SDK

import OpenAI from "openai";
import type { StreamEvent, StreamOptions, CompleteOptions } from "../types.js";
import type { ApiProvider } from "../registry.js";

export function createOpenAIProvider(apiKey?: string): ApiProvider {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Set env var or pass apiKey to createOpenAIProvider()",
    );
  }

  const client = new OpenAI({ apiKey: key });

  function buildMessages(opts: StreamOptions): OpenAI.Responses.ResponseCreateParams["input"] {
    const input: OpenAI.Responses.ResponseCreateParams["input"] = [];

    if (opts.system) {
      input.push({ role: "system", content: opts.system });
    }

    for (const msg of opts.messages) {
      if (msg.role === "system") {
        input.push({ role: "system", content: typeof msg.content === "string" ? msg.content : "" });
      } else {
        input.push({
          role: msg.role as "user" | "assistant",
          content: typeof msg.content === "string" ? msg.content : "",
        });
      }
    }

    return input;
  }

  async function* stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
    const stream = client.responses.stream({
      model: opts.model.id,
      input: buildMessages(opts),
      max_output_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature ?? undefined as unknown as number,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      switch (event.type) {
        case "response.completed":
          if (event.response?.usage) {
            inputTokens = event.response.usage.input_tokens;
            outputTokens = event.response.usage.output_tokens;
          }
          break;

        case "response.output_text.delta":
          yield { type: "text_delta", text: event.delta ?? "" };
          break;
      }
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
    const response = await client.responses.create({
      model: opts.model.id,
      input: buildMessages(opts),
      max_output_tokens: opts.maxTokens ?? opts.model.maxTokens,
      temperature: opts.temperature ?? undefined as unknown as number,
    });

    return {
      text: response.output_text,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      },
      toolUses: [],
    };
  }

  return {
    api: "openai-responses",
    stream,
    streamSimple,
    complete,
  };
}
