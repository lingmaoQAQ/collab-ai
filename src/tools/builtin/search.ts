// 代码搜索工具
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { registerTool } from "../registry.js";

function walkDir(dir: string, pattern: RegExp, maxResults = 20): string[] {
  const results: string[] = [];
  const root = process.cwd();

  function walk(current: string) {
    if (results.length >= maxResults) return;
    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (entry.startsWith(".") || entry === "node_modules" || entry === "dist") continue;

        const full = resolve(current, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            walk(full);
          } else if (stat.isFile() && stat.size < 500 * 1024) {
            try {
              const content = readFileSync(full, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (results.length >= maxResults) break;
                if (pattern.test(lines[i])) {
                  const rel = relative(root, full);
                  results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
                }
              }
            } catch { /* 跳过无法读取的文件 */ }
          }
        } catch { /* 跳过 */ }
      }
    } catch { /* 跳过 */ }
  }

  walk(dir);
  return results;
}

registerTool(
  {
    name: "search_code",
    description: "在项目代码中搜索正则表达式。自动跳过 node_modules、dist、.git。",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "正则表达式搜索模式" },
        path: { type: "string", description: "搜索路径（默认为项目根目录）" },
      },
      required: ["pattern"],
    },
  },
  async (args) => {
    const searchPath = resolve(process.cwd(), args.path || ".");
    if (!existsSync(searchPath)) {
      return { callId: "", content: `路径不存在: ${args.path}`, isError: true };
    }

    try {
      const regex = new RegExp(args.pattern, "i");
      const results = walkDir(searchPath, regex, 20);
      if (!results.length) {
        return { callId: "", content: `未找到匹配 "${args.pattern}" 的结果` };
      }
      return { callId: "", content: results.join("\n") };
    } catch (err) {
      return { callId: "", content: `无效的正则表达式: ${args.pattern}`, isError: true };
    }
  },
);
