// 配置类型定义 — 扁平化设计，参考 OpenClaw 的 config 但大幅简化

export interface CollabAIConfig {
  model?: string;
  provider?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** 默认用户名 */
  defaultUser?: string;
  /** 默认房间 ID */
  defaultRoom?: string;
}

/** 默认配置 */
export const DEFAULT_CONFIG = {
  model: "claude-sonnet-4-6",
  provider: "anthropic",
  systemPrompt: "You are a helpful AI assistant.",
  maxTokens: 4096,
  temperature: 0.7,
  defaultUser: "developer",
  defaultRoom: "",
} satisfies CollabAIConfig;
