// 文本清理和格式化 — 参考 OpenClaw sanitizeRenderableText

import { _dim, reset } from "./theme.js";

/** 清理流式文本：去除 ANSI、控制字符、二进制数据 */
export function sanitize(text: string): string {
  let cleaned = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  cleaned = cleaned.replace(/�/g, "");
  return cleaned;
}

/** 检测文本是否包含二进制数据 */
export function isBinary(text: string): boolean {
  const nonPrintable = text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g);
  return nonPrintable ? nonPrintable.length > text.length * 0.3 : false;
}

export function isCodeFence(line: string): boolean {
  return /^```/.test(line.trim());
}

/** 简单 Markdown 渲染 */
export function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (isCodeFence(line)) {
      inCodeBlock = !inCodeBlock;
      result.push(_dim + line + reset);
      continue;
    }
    if (inCodeBlock) {
      result.push(_dim + line + reset);
      continue;
    }
    const highlighted = line.replace(/`([^`]+)`/g, (_, c) => _dim + "`" + c + "`" + reset);
    const bolded = highlighted.replace(/\*\*([^*]+)\*\*/g, (_, t) => "\x1b[1m" + t + "\x1b[22m");
    result.push(bolded);
  }

  return result.join("\n");
}

/** 智能换行：尊重代码块，不切断词语 */
export function wrap(text: string, width: number): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (isCodeFence(line)) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    if (inCodeBlock || line.length <= width) {
      result.push(line);
      continue;
    }

    // 软换行
    let remaining = line;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(" ", width);
      if (breakAt <= 0) breakAt = width;
      result.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) result.push(remaining);
  }

  return result.join("\n");
}

/** 截断到指定长度，保留可读性 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
