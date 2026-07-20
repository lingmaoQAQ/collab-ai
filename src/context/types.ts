// Context Engine 类型定义

export interface ContextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AssembleParams {
  roomId: string;
  userId: string;
  sessionId: string;
  systemPrompt: string;
  messages: ContextMessage[];       // 当前会话原始消息
  maxTokens?: number;               // Token 预算上限
  userVsProjectRatio?: number;      // 用户/项目上下文比例，默认 0.7
}

export interface AssembleResult {
  messages: ContextMessage[];       // 组装后消息（可能被裁剪/压缩）
  estimatedTokens: number;
  systemPromptAddition?: string;    // 注入到 system prompt 前面的项目上下文
}

export interface CompactParams {
  roomId: string;
  userId: string;
  sessionId: string;
  messages: ContextMessage[];
}

export interface CompactResult {
  compacted: boolean;
  summary?: string;
  keptMessageCount: number;
}

export interface AfterTurnParams {
  roomId: string;
  userId: string;
  sessionId: string;
  messages: ContextMessage[];
}
