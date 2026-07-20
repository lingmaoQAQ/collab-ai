// 配置类型定义 — 扁平化设计，参考 OpenClaw 的 config 但大幅简化

export interface CollabAIConfig {
  /** 默认使用的模型 ID */
  model?: string;
  /** 默认 provider (anthropic | openai) */
  provider?: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
}

/** 默认配置 */
export const DEFAULT_CONFIG: Required<CollabAIConfig> = {
  model: "claude-sonnet-4-6",
  provider: "anthropic",
  systemPrompt: "You are a helpful AI assistant.",
  maxTokens: 4096,
  temperature: 0.7,
};
