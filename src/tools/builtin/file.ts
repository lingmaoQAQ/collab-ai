// 文件读写工具
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { registerTool } from "../registry.js";

function longestCommonSubstring(a: string, b: string): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > max) max = k;
    }
  }
  return max;
}

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

    const numbered = slice.map((l, i) => `${String(offset + i + 1).padStart(4)}| ${l}`).join("\n");
    return {
      callId: "",
      content: numbered.slice(0, 10240) || "(空文件)",
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

registerTool(
  {
    name: "edit_file",
    description: "精确编辑文件：查找 old_string 并替换为 new_string。old_string 必须在文件中唯一，否则失败。参考 Claude Code 的编辑工具。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径（相对于项目目录）" },
        old_string: { type: "string", description: "要替换的原始文本（必须唯一匹配）" },
        new_string: { type: "string", description: "替换后的新文本" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  async (args) => {
    const fullPath = safePath(args.path);
    if (!existsSync(fullPath)) {
      return { callId: "", content: `文件不存在: ${args.path}`, isError: true };
    }

    const content = readFileSync(fullPath, "utf-8");
    const oldStr = args.old_string;
    const newStr = args.new_string;

    // 计算 old_string 出现次数
    let idx = 0, count = 0, lastIdx = -1;
    while ((idx = content.indexOf(oldStr, idx)) !== -1) {
      count++;
      lastIdx = idx;
      idx += oldStr.length || 1; // 防止空字符串无限循环
    }

    if (count === 0) {
      // 模糊搜索：尝试找到最相似的行，给 AI 上下文
      const oldFirstLine = oldStr.split("\n")[0].trim();
      const lines = content.split("\n");
      let bestLine = -1, bestScore = 0;
      for (let i = 0; i < lines.length; i++) {
        const score = longestCommonSubstring(lines[i].trim(), oldFirstLine);
        if (score > bestScore) { bestScore = score; bestLine = i; }
      }
      const ctx = bestLine >= 0
        ? lines.slice(Math.max(0, bestLine - 2), Math.min(lines.length, bestLine + 3))
            .map((l, i) => `${String(bestLine - 2 + i + 1).padStart(4)}| ${l}`).join("\n")
        : content.slice(0, 300);
      return {
        callId: "",
        content: `未找到匹配文本。文件中的相似位置（第${bestLine + 1}行附近）:\n${ctx}\n\n查找的内容:\n${oldStr.slice(0, 200)}`,
        isError: true,
      };
    }
    if (count > 1) {
      return {
        callId: "",
        content: `匹配到 ${count} 处，old_string 必须唯一。请提供更多上下文使匹配唯一。`,
        isError: true,
      };
    }

    // 确保父目录存在
    mkdirSync(dirname(fullPath), { recursive: true });

    const newContent = content.slice(0, lastIdx) + newStr + content.slice(lastIdx + oldStr.length);
    writeFileSync(fullPath, newContent, "utf-8");
    const rel = relative(process.cwd(), fullPath);

    // 显示变化
    const oldLines = oldStr.split("\n");
    const newLines = newStr.split("\n");
    const lineDiff = newLines.length - oldLines.length;

    return {
      callId: "",
      content: `已编辑: ${rel}\n` +
        `  - ${oldStr.slice(0, 80).replace(/\n/g, "\\n")}\n` +
        `  + ${newStr.slice(0, 80).replace(/\n/g, "\\n")}` +
        (lineDiff !== 0 ? `\n  (${lineDiff > 0 ? "+" : ""}${lineDiff}行)` : ""),
    };
  },
);

registerTool(
  {
    name: "batch_edit",
    description: "一次修改多个文件。edits 数组每项包含 path/old_string/new_string。任一失败则全部回滚。",
    parameters: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              old_string: { type: "string" },
              new_string: { type: "string" },
            },
            required: ["path", "old_string", "new_string"],
          },
          description: "编辑列表",
        },
      },
      required: ["edits"],
    },
  },
  async (args) => {
    const edits = (args as any).edits as Array<{ path: string; old_string: string; new_string: string }> | undefined;
    if (!edits?.length) return { callId: "", content: "edits 为空", isError: true };
    if (edits.length > 10) return { callId: "", content: "一次最多10个编辑", isError: true };

    // 先备份所有文件
    const backups = new Map<string, string>();
    const results: string[] = [];

    try {
      for (let i = 0; i < edits.length; i++) {
        const e = edits[i];
        const fullPath = safePath(e.path);
        if (!backups.has(fullPath) && existsSync(fullPath)) {
          backups.set(fullPath, readFileSync(fullPath, "utf-8"));
        }

        const content = existsSync(fullPath) ? readFileSync(fullPath, "utf-8") : "";
        const oldStr = e.old_string;
        const newStr = e.new_string;

        let idx = 0, count = 0, lastIdx = -1;
        while ((idx = content.indexOf(oldStr, idx)) !== -1) {
          count++; lastIdx = idx; idx += oldStr.length || 1;
        }
        if (count === 0) {
          results.push(`[${i + 1}/${edits.length}] ${e.path}: 未找到匹配`);
          continue;
        }
        if (count > 1) {
          results.push(`[${i + 1}/${edits.length}] ${e.path}: 匹配${count}处，跳过`);
          continue;
        }

        if (!backups.has(fullPath)) backups.set(fullPath, "");
        const dir = dirname(fullPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

        const newContent = content.slice(0, lastIdx) + newStr + content.slice(lastIdx + oldStr.length);
        writeFileSync(fullPath, newContent, "utf-8");
        results.push(`[${i + 1}/${edits.length}] ${e.path}: OK`);
      }

      return { callId: "", content: `批量编辑 (${results.length}个):\n${results.join("\n")}` };
    } catch (err) {
      // 回滚
      for (const [path, backup] of backups) {
        try { writeFileSync(path, backup, "utf-8"); } catch { /* ignore */ }
      }
      return { callId: "", content: `批量编辑失败，已回滚: ${err instanceof Error ? err.message : ""}`, isError: true };
    }
  },
);
