// 命令执行工具（自动检测 Shell）
import { execSync } from "node:child_process";
import { registerTool } from "../registry.js";

/** 检测当前 Shell 类型 */
export function detectShell(): string {
  if (process.platform !== "win32") return process.env.SHELL || "/bin/bash";
  // Windows: 检测 PowerShell vs CMD
  if (process.env.PSModulePath || process.env.PSVersionTable) return "powershell.exe";
  return process.env.COMSPEC || "cmd.exe";
}

export function shellName(): string {
  const s = detectShell();
  if (s.includes("powershell")) return "PowerShell";
  if (s.includes("pwsh")) return "PowerShell";
  if (s.includes("bash")) return "Bash";
  if (s.includes("cmd")) return "CMD";
  return s;
}

registerTool(
  {
    name: "run_command",
    description: `在当前Shell(${shellName()})中执行命令。输出限制8KB。失败时返回stderr和exit code，AI可以根据错误自动修复重试。`,
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

    if (cmd.length > 5000) return { callId: "", content: "命令过长 (max 5000字符)", isError: true };
    const dangerous = [/rm\s+-rf\s+\//, /sudo\s+rm/, />\s*\/dev\/sda/, /:\(\)\s*\{/, /mkfs\./, /dd\s+if=/, /curl.+\|\s*(ba)?sh/, /wget.+-O-\s*\|\s*(ba)?sh/, /chmod\s+777/, /fork\s*bomb/i];
    for (const pattern of dangerous) {
      if (pattern.test(cmd)) return { callId: "", content: `危险命令被拒绝: ${cmd}`, isError: true };
    }

    try {
      const output = execSync(cmd, {
        cwd, timeout: 30000, maxBuffer: 1024 * 1024, encoding: "utf-8",
        shell: detectShell(), windowsHide: true,
      });
      return { callId: "", content: output.slice(-8000) || "(执行成功，无输出)" };
    } catch (err: any) {
      return {
        callId: "",
        content: `[exit ${err.status}] ${(err.stderr?.toString() || err.message).slice(0, 3000)}`,
        isError: true,
      };
    }
  },
);
