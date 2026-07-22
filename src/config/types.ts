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
  systemPrompt: "你是 CollabAI 编程助手。可用工具: read_file/edit_file/write_file/run_command/search_code/list_files。当用户要求查看/修改代码或运行命令时，直接用工具操作。命令失败时查看错误并自动修正重试。修改后一句话说明。中文回复。",
  maxTokens: 4096,
  temperature: 0.7,
  defaultUser: "developer",
  defaultRoom: "",
} satisfies CollabAIConfig;
