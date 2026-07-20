// 状态栏 — 在 stderr 上显示无痕更新的状态行

import { _dim, dim, muted, info } from "./theme.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface StatusLine {
  model: string;
  session: string;
  tokens: string;
  elapsed: number; // ms
  busy: boolean;
}

let spinnerIdx = 0;
let statusTimer: ReturnType<typeof setInterval> | null = null;

/** 启动状态栏（在 stderr 上定时刷新） */
export function startStatusBar(getStatus: () => StatusLine): void {
  stopStatusBar();
  statusTimer = setInterval(() => {
    render(getStatus());
  }, 150);
}

/** 停止状态栏 */
export function stopStatusBar(): void {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  // 清除最后一行
  process.stderr.write("\r\x1b[K");
}

function render(s: StatusLine): void {
  const spinner = s.busy ? SPINNER_FRAMES[spinnerIdx % SPINNER_FRAMES.length] : " ";
  spinnerIdx++;

  const elapsed = formatElapsed(s.elapsed);

  const parts: string[] = [];
  parts.push(spinner);
  if (s.busy) {
    parts.push(info("thinking..."));
  }
  parts.push(muted(s.model));
  parts.push(muted(s.session));
  if (s.tokens) parts.push(muted(s.tokens));
  parts.push(dim(elapsed));

  const line = parts.join("  ");
  const width = process.stderr.columns || 80;
  process.stderr.write("\r" + line.padEnd(width > line.length ? width : line.length, " ") + "\r");
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}
