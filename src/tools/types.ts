// 工具系统类型定义 — 兼容 Anthropic/OpenAI Tool Use 格式

export interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

export interface ToolResult {
  callId: string;
  content: string;
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, string>) => Promise<ToolResult>;
