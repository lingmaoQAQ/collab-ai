// 终端 ANSI 颜色方案 — Claude Code 风格
// 每个颜色导出既是 ANSI 前缀字符串，也是包装函数

const CSI = "\x1b[";
const S = (code: number) => `${CSI}${code}m`;

// ---- 基础样式（ANSI 前缀字符串，可用于拼接） ----
export const reset = S(0);
export const _bold = S(1);
export const _dim = S(2);

// ---- 前景色 ----
export const red = S(31);
export const green = S(32);
export const yellow = S(33);
export const blue = S(34);
export const magenta = S(35);
export const cyan = S(36);
export const gray = S(90);
export const brightRed = S(91);
export const brightGreen = S(92);
export const brightYellow = S(93);
export const brightBlue = S(94);
export const brightCyan = S(96);

// ---- 语义色前缀 ----
export const assistantPrefix = _dim + green;
export const mutedPrefix = _dim + gray;
export const modelPrefix = _bold + brightBlue;

// ---- 包装函数（Style text with ANSI + reset） ----
export function bold(text: string): string { return _bold + text + reset; }
export function dim(text: string): string { return _dim + text + reset; }
export function error(text: string): string { return brightRed + text + reset; }
export function info(text: string): string { return cyan + text + reset; }
export function highlight(text: string): string { return brightYellow + text + reset; }
export function muted(text: string): string { return mutedPrefix + text + reset; }
export function modelColor(text: string): string { return modelPrefix + text + reset; }
export function infoColor(text: string): string { return cyan + text + reset; }

// 前缀快捷输出
export function aiPrefix(): string { return _dim + green + "●" + reset + " "; }
export function userPrefix(): string { return _dim + ">" + reset + " "; }

// 终端宽度
export function termWidth(): number { return process.stdout.columns || 80; }
