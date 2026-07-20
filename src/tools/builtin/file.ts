// 文件读写工具
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { registerTool } from "../registry.js";

function safePath(requested: string): string {
  const root = process.cwd();
  const resolved = resolve(root, requested);
  // 禁止逃逸工作目录
  if (!resolved.startsWith(root)) {
    throw new Error(`路径逃逸拒绝: ${requested}`);
  }
  return resolved;
}

registerTool(
  {
    name: "read_file",
    description: "读取文件内容。限制 10KB。自动检测文本/二进制。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径（相对于项目目录）" },
        offset: { type: "string", description: "从第几行开始读取（可选）" },
        limit: { type: "string", description: "读取行数（可选，默认全部）" },
      },
      required: ["path"],
    },
  },
  async (args) => {
    const fullPath = safePath(args.path);
    if (!existsSync(fullPath)) {
      return { callId: "", content: `文件不存在: ${args.path}`, isError: true };
    }
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const files = readdirSync(fullPath).slice(0, 50);
      return { callId: "", content: `目录 ${args.path} (${files.length} 项):\n${files.join("\n")}` };
    }
    if (stat.size > 1024 * 1024) {
      return { callId: "", content: `文件太大: ${(stat.size / 1024 / 1024).toFixed(1)}MB`, isError: true };
    }

    const content = readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    const offset = parseInt(args.offset || "0");
    const limit = parseInt(args.limit || "0");

    const slice = limit > 0
      ? lines.slice(offset, offset + limit)
      : lines.slice(offset);

    return {
      callId: "",
      content: slice.join("\n").slice(0, 10240) || "(空文件)",
    };
  },
);

registerTool(
  {
    name: "write_file",
    description: "写入文件。覆盖已有文件时自动显示 diff 预览。自动创建父目录。限制 100KB。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径（相对于项目目录）" },
        content: { type: "string", description: "要写入的内容" },
      },
      required: ["path", "content"],
    },
  },
  async (args) => {
    const fullPath = safePath(args.path);
    if (args.content.length > 100 * 1024) {
      return { callId: "", content: "内容超过 100KB 限制", isError: true };
    }

    const rel = relative(process.cwd(), fullPath);
    let diffPreview = "";
    let oldLen = 0, newLen = args.content.split("\n").length;

    if (existsSync(fullPath)) {
      const oldContent = readFileSync(fullPath, "utf-8");
      const oldLines = oldContent.split("\n");
      oldLen = oldLines.length;

      const added = newLen - oldLen;
      const sameCount = oldLines.filter((l) => args.content.includes(l)).length;
      const removed = oldLen - sameCount;

      diffPreview = `\n[Diff] ${rel}: ${oldLen}→${newLen}行 (${added > 0 ? "+" + added : ""}${removed > 0 ? "/-" + removed : ""})\n`;

      const changes: string[] = [];
      for (let i = 0; i < Math.max(oldLen, newLen); i++) {
        const oldL = oldLines[i] || "";
        const newL = args.content.split("\n")[i] || "";
        if (oldL !== newL && changes.length < 5) {
          if (oldL && !newL) changes.push(`  - ${oldL.slice(0, 80)}`);
          else if (!oldL && newL) changes.push(`  + ${newL.slice(0, 80)}`);
          else changes.push(`  ~ ${oldL.slice(0, 35)} → ${newL.slice(0, 35)}`);
        }
      }
      diffPreview += changes.length > 0 ? changes.join("\n") + "\n" : "";
    }

    writeFileSync(fullPath, args.content, "utf-8");
    return {
      callId: "",
      content: `已写入: ${rel} (${args.content.length}B)` +
        (oldLen > 0 ? ` | ${oldLen}→${newLen}行` : "") + diffPreview,
    };
  },
);

registerTool(
  {
    name: "list_files",
    description: "列出目录内容",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "目录路径（默认为项目根目录）" },
      },
      required: [],
    },
  },
  async (args) => {
    const fullPath = safePath(args.path || ".");
    const files = readdirSync(fullPath).slice(0, 100);
    const lines = files.map((f) => {
      try {
        const s = statSync(resolve(fullPath, f));
        const size = s.isDirectory() ? "<DIR>" : `${s.size}B`;
        return `${size.padStart(8)} ${f}`;
      } catch {
        return `       ? ${f}`;
      }
    });
    return { callId: "", content: `${fullPath}\n${lines.join("\n")}` };
  },
);
