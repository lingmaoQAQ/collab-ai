// 命令执行工具（沙箱模式 — 仅工作目录内）
import { execSync } from "node:child_process";
import { registerTool } from "../registry.js";

registerTool(
  {
    name: "run_command",
    description: "在项目目录中执行命令。支持 Windows/Linux。输出限制 8000 字符。危险命令（rm -rf /等）会被拒绝。",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的命令" },
        cwd: { type: "string", description: "工作目录，默认为当前项目目录" },
      },
      required: ["command"],
    },
  },
  async (args) => {
    const cmd = args.command;
    const cwd = args.cwd || process.cwd();

    // 安全检查
    const dangerous = [
      /rm\s+-rf\s+\//, /sudo\s+rm/, />\s*\/dev\/sda/,
      /:\(\)\s*\{/, /mkfs\./, /dd\s+if=/,
    ];
    for (const pattern of dangerous) {
      if (pattern.test(cmd)) {
        return { callId: "", content: `危险命令被拒绝: ${cmd}`, isError: true };
      }
    }

    try {
      const output = execSync(cmd, {
        cwd,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        encoding: "utf-8",
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
        windowsHide: true,
      });
      const trimmed = output.slice(-8000); // 限制输出
      return { callId: "", content: trimmed || "(命令执行成功，无输出)" };
    } catch (err: any) {
      const stderr = err.stderr?.toString() || "";
      const stdout = err.stdout?.toString() || "";
      return {
        callId: "",
        content: `命令失败 (exit ${err.status}):\n${stdout}${stderr}`.slice(-4000),
        isError: true,
      };
    }
  },
);
