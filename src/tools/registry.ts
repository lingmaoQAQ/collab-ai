// 工具注册表

import type { ToolDef, ToolCall, ToolHandler, ToolResult } from "./types.js";

interface ToolEntry {
  def: ToolDef;
  handler: ToolHandler;
}

const _tools = new Map<string, ToolEntry>();

export function registerTool(def: ToolDef, handler: ToolHandler): void {
  _tools.set(def.name, { def, handler });
}

export function getToolDefs(): ToolDef[] {
  return [..._tools.values()].map((t) => t.def);
}

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const entry = _tools.get(call.name);
  if (!entry) {
    return { callId: call.id, content: `Unknown tool: ${call.name}`, isError: true };
  }
  try {
    return await entry.handler(call.arguments);
  } catch (err) {
    return {
      callId: call.id,
      content: err instanceof Error ? err.message : String(err),
      isError: true,
    };
  }
}

export function toolCount(): number {
  return _tools.size;
}
