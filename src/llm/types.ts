// LLM 核心类型定义 — 参考 OpenClaw llm-core 的模型/消息/事件抽象

// ---- 模型定义 ----
export interface ModelProvider {
  id: string;
  name: string;
}

export interface ModelCost {
  input: number;   // 每 1M token 美元价
  output: number;
}

export interface Model {
  id: string;
  name: string;
  api: string;           // "anthropic-messages" | "openai-responses" | ...
  provider: ModelProvider;
  contextWindow: number;
  maxTokens: number;
  cost?: ModelCost;
  reasoning: boolean;
  input: Array<"text" | "image">;
}

// ---- 消息类型 ----
export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export type ContentBlock = TextContent | ImageContent;

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
}

// ---- 工具定义 ----
export interface ToolParameter {
  type: string;
  description?: string;
  properties?: Record<string, ToolParameter>;
  required?: string[];
  items?: ToolParameter;
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// ---- Stream 事件 ----
export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; tool: ToolUse }
  | { type: "usage"; usage: Usage }
  | { type: "error"; error: string }
  | { type: "done" };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

// ---- API Provider 接口 ----
export interface StreamOptions {
  model: Model;
  messages: Message[];
  system?: string;
  tools?: Tool[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompleteOptions extends StreamOptions {
  // complete = stream 的全量版本
}

export type StreamFunction = (
  opts: StreamOptions,
) => AsyncIterable<StreamEvent>;

export type CompleteFunction = (
  opts: CompleteOptions,
) => Promise<{
  text: string;
  usage: Usage;
  toolUses: ToolUse[];
}>;

// ---- 内置模型目录 ----
export const BUILTIN_MODELS: Model[] = [
  // Anthropic
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    api: "anthropic-messages",
    provider: { id: "anthropic", name: "Anthropic" },
    contextWindow: 200_000,
    maxTokens: 8192,
    cost: { input: 3, output: 15 },
    reasoning: false,
    input: ["text", "image"],
  },
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    api: "anthropic-messages",
    provider: { id: "anthropic", name: "Anthropic" },
    contextWindow: 200_000,
    maxTokens: 8192,
    cost: { input: 15, output: 75 },
    reasoning: false,
    input: ["text", "image"],
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    api: "anthropic-messages",
    provider: { id: "anthropic", name: "Anthropic" },
    contextWindow: 200_000,
    maxTokens: 4096,
    cost: { input: 1, output: 5 },
    reasoning: false,
    input: ["text", "image"],
  },
  // OpenAI
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    api: "openai-responses",
    provider: { id: "openai", name: "OpenAI" },
    contextWindow: 128_000,
    maxTokens: 16384,
    cost: { input: 2.5, output: 10 },
    reasoning: false,
    input: ["text", "image"],
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    api: "openai-responses",
    provider: { id: "openai", name: "OpenAI" },
    contextWindow: 128_000,
    maxTokens: 16384,
    cost: { input: 2.5, output: 10 },
    reasoning: false,
    input: ["text", "image"],
  },
];
