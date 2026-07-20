// 启动 Banner — Claude Code 风格的简洁启动画面

import { bold, dim, modelColor, infoColor, muted } from "./theme.js";

export function showBanner(
  version: string,
  modelName: string,
  providerName: string,
  roomName: string,
  userName: string,
): void {
  console.log("");
  console.log(
    "  " + bold("CollabAI") + dim(" v" + version),
    muted("—") + " AI 多用户协作框架",
  );
  console.log(
    "  " + bold("Model") + dim(":"),
    modelColor(modelName),
    muted("(" + providerName + ")"),
  );
  console.log(
    "  " + bold("Room") + dim(":"),
    infoColor(roomName),
    muted("|"),
    userName,
  );
  console.log("");
  console.log(dim("  输入 /help 查看命令，/quit 退出"));
  console.log("");
}

export function showSeparator(text?: string): void {
  if (text) {
    console.log(dim("  ── " + text + " ──"));
  } else {
    console.log(dim("  ─────────────────"));
  }
}

export function showWhatsNew(
  activeUsers: Array<{ userName: string; currentTopic: string }>,
  newMemories: string[],
): void {
  const hasNews = activeUsers.length > 0 || newMemories.length > 0;
  if (!hasNews) return;

  showSeparator("项目动态");
  for (const u of activeUsers) {
    console.log(
      dim("  ") + muted("●") + dim(` ${u.userName} 正在处理 [${u.currentTopic}]`),
    );
  }
  for (const k of newMemories) {
    console.log(dim("  ") + muted("+") + dim(` 新记录: ${k}`));
  }
  console.log("");
}
