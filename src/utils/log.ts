// 轻量日志 — 生产环境结构化，开发环境友好

const DEBUG = process.env.COLLABAI_DEBUG === "1";

export const log = {
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : String(err || "");
    console.error(`[ERROR] ${msg}${detail ? " — " + detail : ""}`);
    if (DEBUG && err instanceof Error) console.error(err.stack);
  },
  warn(msg: string): void {
    console.warn(`[WARN] ${msg}`);
  },
  info(msg: string): void {
    if (DEBUG) console.log(`[INFO] ${msg}`);
  },
  debug(msg: string): void {
    if (DEBUG) console.log(`[DEBUG] ${msg}`);
  },
};

/** 安全执行：捕获异常，打印日志，返回默认值 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  label: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log.error(label, err);
    return fallback;
  }
}

/** 安全执行同步版本 */
export function safe<T>(fn: () => T, fallback: T, label: string): T {
  try {
    return fn();
  } catch (err) {
    log.error(label, err);
    return fallback;
  }
}
