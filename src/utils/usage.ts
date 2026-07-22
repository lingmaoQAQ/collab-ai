// Token 用量追踪（不依赖 Model 类型，接收 cost 对象）

export interface ModelCost { input: number; output: number; }

export interface UsageStats { inputTokens: number; outputTokens: number; cost: number; requestCount: number; }

export function estimateTokens(text: string): number {
  let cjk = 0, other = 0;
  for (const ch of text) { if (/[一-鿿]/.test(ch)) cjk++; else other++; }
  return Math.ceil(cjk * 0.5 + other * 0.25);
}

export class UsageTracker {
  stats: UsageStats = { inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 };

  record(cost: ModelCost, inputTokens: number, outputTokens: number): void {
    this.stats.inputTokens += inputTokens;
    this.stats.outputTokens += outputTokens;
    this.stats.cost += (inputTokens / 1_000_000) * cost.input + (outputTokens / 1_000_000) * cost.output;
    this.stats.requestCount++;
  }
  reset(): void { this.stats = { inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 }; }
  summary(): string {
    const s = this.stats;
    return `${s.requestCount}req | in:${s.inputTokens}tok out:${s.outputTokens}tok | $${s.cost.toFixed(4)}`;
  }
}
