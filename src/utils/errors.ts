// CollabAI 错误体系

export enum ErrorCode {
  // 认证
  AUTH_FAILED = "AUTH_FAILED",
  TOKEN_INVALID = "TOKEN_INVALID",

  // 网络
  NETWORK_TIMEOUT = "NETWORK_TIMEOUT",
  GATEWAY_UNREACHABLE = "GATEWAY_UNREACHABLE",
  WS_DISCONNECTED = "WS_DISCONNECTED",

  // 数据
  DB_ERROR = "DB_ERROR",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  ROOM_NOT_FOUND = "ROOM_NOT_FOUND",
  USER_NOT_FOUND = "USER_NOT_FOUND",

  // AI
  LLM_TIMEOUT = "LLM_TIMEOUT",
  LLM_AUTH = "LLM_AUTH",
  LLM_RATE_LIMIT = "LLM_RATE_LIMIT",

  // 工具
  TOOL_SAFETY_BLOCKED = "TOOL_SAFETY_BLOCKED",
  TOOL_EXEC_FAILED = "TOOL_EXEC_FAILED",

  // 一般
  CONFIG_MISSING = "CONFIG_MISSING",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INTERNAL = "INTERNAL",
}

export class CollabError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public cause?: Error,
    public recoverable = false,
  ) {
    super(message);
    this.name = "CollabError";
  }

  toJSON() {
    return { code: this.code, message: this.message, recoverable: this.recoverable };
  }

  static auth(message: string) { return new CollabError(ErrorCode.AUTH_FAILED, message, undefined, false); }
  static network(message: string, recoverable = true) { return new CollabError(ErrorCode.NETWORK_TIMEOUT, message, undefined, recoverable); }
  static llm(message: string, recoverable = true) { return new CollabError(ErrorCode.LLM_TIMEOUT, message, undefined, recoverable); }
  static tool(message: string) { return new CollabError(ErrorCode.TOOL_EXEC_FAILED, message, undefined, false); }
  static notFound(entity: string) {
    const code = entity === "session" ? ErrorCode.SESSION_NOT_FOUND
      : entity === "room" ? ErrorCode.ROOM_NOT_FOUND : ErrorCode.USER_NOT_FOUND;
    return new CollabError(code, `${entity} not found`, undefined, false);
  }
}
