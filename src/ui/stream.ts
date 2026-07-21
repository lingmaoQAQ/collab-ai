// StreamAssembler — 流式渲染 + 加载动画

import { sanitize } from "./format.js";
import { aiPrefix } from "./theme.js";

export interface StreamState {
  content: string;
  lastRenderedLen: number;
  thinking: string;
  finished: boolean;
  totalChunks: number;
}

export function createStreamState(): StreamState {
  return { content: "", lastRenderedLen: 0, thinking: "", finished: false, totalChunks: 0 };
}

export function ingestDelta(state: StreamState, delta: string): string | null {
  if (state.finished) return null;
  const cleaned = sanitize(delta);
  if (!cleaned) return null;
  state.content += cleaned;
  state.totalChunks++;
  const newPart = state.content.slice(state.lastRenderedLen);
  if (newPart) { state.lastRenderedLen = state.content.length; return newPart; }
  return null;
}

export function finalize(state: StreamState): string {
  state.finished = true;
  return state.content;
}

/** 流式渲染器：无闪烁打印 + 加载动画 */
export function createStreamRenderer() {
  const state = createStreamState();
  let firstChunk = true;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;

  return {
    write(delta: string): void {
      const part = ingestDelta(state, delta);
      if (part) {
        // 清除加载动画
        if (spinnerTimer) { clearInterval(spinnerTimer); spinnerTimer = null; }
        if (firstChunk) { process.stdout.write(aiPrefix()); firstChunk = false; }
        process.stdout.write(part);
      }
    },

    /** 显示加载动画，第一次 write 后自动清除 */
    loading(): void {
      if (spinnerTimer) return;
      let i = 0;
      const frames = ["◐", "◓", "◑", "◒"];
      spinnerTimer = setInterval(() => {
        if (state.totalChunks > 0) { clearInterval(spinnerTimer!); spinnerTimer = null; return; }
        process.stderr.write("\r  " + frames[i % 4] + " 思考中...\r");
        i++;
      }, 200);
    },

    done(): string {
      if (spinnerTimer) { clearInterval(spinnerTimer); spinnerTimer = null; }
      const text = finalize(state);
      if (!firstChunk && text) process.stdout.write("\n");
      return text;
    },

    getText(): string { return state.content; },
    hasOutput(): boolean { return state.totalChunks > 0; },
  };
}
