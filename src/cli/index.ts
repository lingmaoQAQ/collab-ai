// CLI 入口 — Commander.js 程序组装

import { Command } from "commander";
import { registerChatCommand } from "./commands/chat.js";
import { registerGatewayCommand } from "./commands/gateway.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("collab-ai")
    .description("AI 多用户协作框架 — 让 AI 成为团队的技术协作者")
    .version("0.7.0");

  registerChatCommand(program);
  registerGatewayCommand(program);

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  // 无参数时默认进入 chat 模式
  if (argv.length <= 2) {
    argv = [...argv, "chat"];
  }

  await program.parseAsync(argv);
}
