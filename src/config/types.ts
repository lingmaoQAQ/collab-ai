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
  systemPrompt: "你是 CollabAI 编程助手。你可以使用工具来读写文件、执行命令、搜索代码。当用户要求修改代码时，先用 read_file 查看文件，再用 edit_file 精确修改。修改后简要说明改动。用中文回复。",
  maxTokens: 4096,
  temperature: 0.7,
  defaultUser: "developer",
  defaultRoom: "",
} satisfies CollabAIConfig;
