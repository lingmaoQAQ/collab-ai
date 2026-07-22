// AI 工具调用循环 — Claude Code 风格
// AI 自主决定何时使用工具，执行后收到结果继续回答

import { getToolDefs, executeTool } from "./registry.js";
import type { ToolDef, ToolCall, ToolResult } from "./types.js";
import type { LlmRuntime, Model, StreamEvent } from "../llm/index.js";

export interface ToolLoopOptions {
  runtime: LlmRuntime;
  model: Model;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxToolRounds?: number;
  maxTokens?: number;
  temperature?: number;
  onText?: (text: string) => void;
  onToolUse?: (tool: ToolCall) => void;
  /** 远程工具执行（Gateway 模式）。不传则本地执行。 */
  remoteExecute?: (tool: ToolCall) => Promise<ToolResult>;
  /** 工具执行前确认。返回 false 则跳过该工具 */
  confirmTool?: (tool: ToolCall) => Promise<boolean>;
}

export interface ToolLoopResult {
  finalText: string;           // 最终文本回复
  toolCalls: ToolCall[];       // 所有工具调用
  rounds: number;              // 执行的轮次
}

/** 将内部ToolDef转换为LLM需要的工具格式 */
function toLlmTools(): Array<{
  name: string;
  description: string;
  input_schema: ToolDef["parameters"];
}> {
  return getToolDefs().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** 运行工具调用循环 */
export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    runtime, model, system, messages,
    maxToolRounds = 10,
    maxTokens = 4096, temperature = 0.7,
    onText, onToolUse,
  } = opts;

  const allTools = toLlmTools();
  const allToolCalls: ToolCall[] = [];
  let rounds = 0;
  let finalText = "";

  // 构建完整消息列表（含system和对话历史）
  const fullMessages: Array<{ role: string; content: string | unknown }> =
    [...messages.map((m) => ({ role: m.role, content: m.content }))];

  while (rounds < maxToolRounds) {
    rounds++;

    // 收集本轮响应
    let currentText = "";
    const currentToolCalls: ToolCall[] = [];

    // 流式调用（带工具定义）
    try {
      for await (const event of runtime.stream({
        model,
        system,
        messages: fullMessages as Array<{ role: "user" | "assistant" | "system"; content: string }>,
        tools: allTools.length > 0 ? allTools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as any,
        })) : undefined,
        maxTokens,
        temperature,
      })) {
        if (event.type === "text_delta") {
          currentText += event.text;
          if (onText) onText(event.text);
        } else if (event.type === "tool_use") {
          currentToolCalls.push({
            id: event.tool.id,
            name: event.tool.name,
            arguments: event.tool.input as Record<string, string>,
          });
          if (onToolUse) onToolUse({
            id: event.tool.id,
            name: event.tool.name,
            arguments: event.tool.input as Record<string, string>,
          });
        }
      }
    } catch (err) {
      // 如果模型不支持工具，回退到纯文本
      if (currentText) {
        finalText = currentText;
        break;
      }
      throw err;
    }

    // 没有工具调用 → 对话正常结束
    if (currentToolCalls.length === 0) {
      finalText = currentText;
      break;
    }

    // 有工具调用 → 执行并反馈
    allToolCalls.push(...currentToolCalls);

    // 将AI消息（含工具调用）加入历史
    const aiMsg: { role: "assistant"; content: string; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> } = {
      role: "assistant",
      content: currentText || "正在使用工具...",
    };

    // 添加 tool_calls（OpenAI格式）
    if (currentToolCalls.length > 0) {
      aiMsg.tool_calls = currentToolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }
    fullMessages.push(aiMsg as any);

    // 执行每个工具并添加结果
    for (const tc of currentToolCalls) {
      // 编辑类工具确认
      if (opts.confirmTool) {
        const ok = await opts.confirmTool(tc);
        if (!ok) {
          fullMessages.push({
            role: "tool",
            content: "用户取消了此操作",
            tool_call_id: tc.id,
          } as any);
          continue;
        }
      }
      const result = opts.remoteExecute
        ? await opts.remoteExecute(tc)
        : await executeTool(tc);

      // 工具结果消息（OpenAI格式）
      fullMessages.push({
        role: "tool",
        content: result.content.slice(0, 8000),
        tool_call_id: result.callId || tc.id,
      } as any);
    }
  }

  // 如果只用了工具但没回文字，再问一次要文字总结
  if (!finalText && allToolCalls.length > 0 && rounds < maxToolRounds + 1) {
    try {
      for await (const event of runtime.stream({
        model,
        system,
        messages: fullMessages as any,
        maxTokens: Math.floor((maxTokens || 200) * 0.5),
        temperature,
      })) {
        if (event.type === "text_delta") finalText += event.text;
      }
    } catch {
      finalText = "(工具已执行)";
    }
  }

  return { finalText, toolCalls: allToolCalls, rounds };
}
