// CollabAI 主入口 — 库模式导出

// LLM 层
export {
  // Types
  type Model,
  type ModelProvider,
  type Message,
  type Tool,
  type ToolUse,
  type ToolResult,
  type StreamEvent,
  type Usage,
  type StreamOptions,
  type CompleteOptions,
  type StreamFunction,
  type CompleteFunction,
  BUILTIN_MODELS,
} from "./llm/index.js";

// Registry
export {
  createApiRegistry,
  getDefaultRegistry,
  setDefaultRegistry,
  type ApiProvider,
  type ApiRegistry,
} from "./llm/index.js";

// Runtime
export { createLlmRuntime, type LlmRuntime } from "./llm/index.js";

// Providers
export {
  createAnthropicProvider,
  createOpenAIProvider,
} from "./llm/index.js";

// Config
export { loadConfig, getApiKey, DEFAULT_CONFIG, type CollabAIConfig } from "./config/index.js";

// Sessions
export {
  SessionManager,
  generateTitle,
  generateSummary,
} from "./sessions/manager.js";
export { SessionStore } from "./sessions/store.js";
export { getDatabase, closeDatabase } from "./sessions/database.js";
export type { Session, Message as SessionMessage, SessionSummary } from "./sessions/types.js";

// Memory
export { MemoryStore } from "./memory/store.js";
export type { MemoryEntry } from "./memory/types.js";

// CLI
export { createProgram, runCli } from "./cli/index.js";
