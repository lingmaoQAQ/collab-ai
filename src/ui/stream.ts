// StreamAssembler — 参考 OpenClaw TuiStreamAssembler
// 增量渲染流式文本，避免终端闪烁

import { sanitize } from "./format.js";
import { aiPrefix } from "./theme.js";

export interface StreamState {
  content: string;
  lastRenderedLen: number;
  thinking: string;
  finished: boolean;
  totalChunks: number;
}

/** 创建一个新的流式状态 */
export function createStreamState(): StreamState {
  return {
    content: "",
    lastRenderedLen: 0,
    thinking: "",
    finished: false,
    totalChunks: 0,
  };
}

/** 摄入一个增量块，返回需要渲染的新文本（仅增量部分） */
export function ingestDelta(state: StreamState, delta: string): string | null {
  if (state.finished) return null;

  const cleaned = sanitize(delta);
  if (!cleaned) return null;

  state.content += cleaned;
  state.totalChunks++;

  // 只返回增量部分
  const newPart = state.content.slice(state.lastRenderedLen);
  if (newPart) {
    state.lastRenderedLen = state.content.length;
    return newPart;
  }
  return null;
}

/** 完成流式渲染，返回完整文本 */
export function finalize(state: StreamState): string {
  state.finished = true;
  return state.content;
}

/** 流式渲染器：边接收增量边无闪烁打印 */
export function createStreamRenderer() {
  const state = createStreamState();
  let firstChunk = true;

  return {
    /** 渲染一个增量块 */
    write(delta: string): void {
      const part = ingestDelta(state, delta);
      if (part) {
        if (firstChunk) {
          process.stdout.write(aiPrefix());
          firstChunk = false;
        }
        process.stdout.write(part);
      }
    },

    /** 完成渲染，返回完整文本 */
    done(): string {
      const text = finalize(state);
      if (!firstChunk && text) {
        process.stdout.write("\n");
      }
      return text;
    },

    /** 获取当前累计文本 */
    getText(): string {
      return state.content;
    },

    /** 是否有输出 */
    hasOutput(): boolean {
      return state.totalChunks > 0;
    },
  };
}
