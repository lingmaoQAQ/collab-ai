// Gateway 命令 — 启动中心服务器

import { Command } from "commander";
import "dotenv/config";
import { startGateway } from "../../gateway/index.js";

export function registerGatewayCommand(program: Command): void {
  program
    .command("gateway")
    .description("启动 CollabAI Gateway 服务器（中心节点）")
    .option("-p, --port <number>", "端口号", "3000")
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      startGateway(port);

      // 优雅退出
      process.on("SIGINT", () => {
        console.log("\nGateway 已关闭");
        process.exit(0);
      });
    });
}
