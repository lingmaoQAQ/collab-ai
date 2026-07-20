// Tools 模块导出
export * from "./types.js";
export { registerTool, getToolDefs, executeTool, toolCount } from "./registry.js";

// 注册内置工具（副作用导入）
import "./builtin/bash.js";
import "./builtin/file.js";
import "./builtin/search.js";
