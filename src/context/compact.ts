// 对话压缩 — 用 LLM 将老消息总结为摘要，保留最近消息
// 参考 Claude Code /compact 命令

import type { LlmRuntime, Model } from "../llm/index.js";

export interface CompactResult {
  summary: string;               // 老消息的摘要
  keptCount: number;             // 保留的最近消息数
  compactedCount: number;        // 被压缩的消息数
  oldTokens: number;             // 压缩前估算 token
  newTokens: number;             // 压缩后估算 token
}

/** 估算文本 token 数 */
function estTokens(text: string): number {
  let cjk = 0, other = 0;
  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) cjk++; else other++;
  }
  return Math.ceil(cjk * 0.5 + other * 0.25);
}

/** 压缩对话历史：老消息 → 摘要，保留最近 N 条 */
export async function compactConversation(
  runtime: LlmRuntime,
  model: Model,
  messages: Array<{ role: string; content: string }>,
  keepRecent = 8,  // 保留最近 8 条（4 轮对话）
): Promise<CompactResult> {
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length <= keepRecent + 4) {
    return {
      summary: "",
      keptCount: nonSystem.length,
      compactedCount: 0,
      oldTokens: estTokens(nonSystem.map((m) => m.content).join(" ")),
      newTokens: estTokens(nonSystem.map((m) => m.content).join(" ")),
    };
  }

  // 需要压缩的消息：最早的 N 条
  const toCompact = nonSystem.slice(0, nonSystem.length - keepRecent);
  const toKeep = nonSystem.slice(-keepRecent);

  // 已有的摘要作为上下文
  const existingSummary = messages.find((m) => m.role === "system" && m.content.startsWith("[对话摘要]"))?.content;

  // 用 LLM 总结
  const compactText = toCompact
    .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content.slice(0, 400)}`)
    .join("\n\n");

  const prompt = existingSummary
    ? `之前的对话摘要：${existingSummary}\n\n请将以下新对话内容合并到摘要中（中文，200字以内）：\n\n${compactText}`
    : `请用200字以内总结以下对话的关键内容、决策和结论（中文）：\n\n${compactText}`;

  let summary = "";
  try {
    const stream = runtime.streamSimple({
      model,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 300,
      temperature: 0.3,
    });
    for await (const event of stream) {
      if (event.type === "text_delta") summary += event.text;
    }
  } catch {
    // 压缩失败：简单截断
    summary = toCompact.map((m) => `${m.role}: ${m.content.slice(0, 60)}`).join(" | ").slice(0, 300);
  }

  return {
    summary: summary.trim() || "对话已压缩",
    keptCount: toKeep.length,
    compactedCount: toCompact.length,
    oldTokens: estTokens(nonSystem.map((m) => m.content).join(" ")),
    newTokens: estTokens(summary) + estTokens(toKeep.map((m) => m.content).join(" ")),
  };
}
