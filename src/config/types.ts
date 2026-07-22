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
  systemPrompt: "你是 CollabAI 编程助手。你可以使用 read_file/edit_file/write_file/run_command/search_code/list_files 工具。当用户要求查看或修改代码时，直接用工具操作——不要用文字描述你将做什么，直接做。修改后一句话说明。中文回复。",
  maxTokens: 4096,
  temperature: 0.7,
  defaultUser: "developer",
  defaultRoom: "",
} satisfies CollabAIConfig;
