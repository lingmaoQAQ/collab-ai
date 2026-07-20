// Token 用量和成本追踪

import type { Model } from "../llm/types.js";

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cost: number;         // 美元
  requestCount: number;
}

/** 估算 token 数（中文 ~0.5 token/char，非 CJK ~0.25 token/char） */
export function estimateTokens(text: string): number {
  let cjk = 0, other = 0;
  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) cjk++; else other++;
  }
  return Math.ceil(cjk * 0.5 + other * 0.25);
}

/** 计算单次调用成本 */
export function calcCost(model: Model, inputTokens: number, outputTokens: number): number {
  if (!model.cost) return 0;
  return (inputTokens / 1_000_000) * model.cost.input +
         (outputTokens / 1_000_000) * model.cost.output;
}

/** 用量累加器 */
export class UsageTracker {
  stats: UsageStats = { inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 };

  record(model: Model, inputTokens: number, outputTokens: number): void {
    this.stats.inputTokens += inputTokens;
    this.stats.outputTokens += outputTokens;
    this.stats.cost += calcCost(model, inputTokens, outputTokens);
    this.stats.requestCount++;
  }

  reset(): void {
    this.stats = { inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 };
  }

  summary(): string {
    const s = this.stats;
    return `${s.requestCount}次请求 | ` +
      `输入: ${s.inputTokens}tok | 输出: ${s.outputTokens}tok | ` +
      `成本: $${s.cost.toFixed(4)}`;
  }
}
