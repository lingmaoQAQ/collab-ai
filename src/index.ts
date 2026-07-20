// CollabAI 主入口 — 库模式导出

// LLM 层
export {
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
  createOpenAIChatProvider,
  type OpenAIChatProviderOptions,
} from "./llm/index.js";

// Config
export {
  loadConfig,
  getApiKey,
  DEFAULT_CONFIG,
  type CollabAIConfig,
} from "./config/index.js";

// Identity
export { UserManager, RoomManager } from "./identity/index.js";
export type { User, UserProfile, Room, RoomMember, RoomRole } from "./identity/index.js";

// Sessions
export {
  SessionManager,
  generateTitle,
  generateSummary,
} from "./sessions/manager.js";
export { SessionStore } from "./sessions/store.js";
export { getDatabase, closeDatabase } from "./sessions/database.js";
export type { UserSession, SessionMessage, SessionSummary } from "./sessions/types.js";

// Memory
export { MemoryStore } from "./memory/store.js";
export type { MemoryEntry, MemoryCategory } from "./memory/types.js";

// Events
export { EventStore } from "./events/index.js";
export type { ProjectEvent, EventType } from "./events/index.js";

// CLI
export { createProgram, runCli } from "./cli/index.js";
