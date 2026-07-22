// 统一输出层 — 解决 readline 提示符与异步消息打架的问题

import { dim, muted, error, info, bold, aiPrefix } from "./theme.js";

/** 安全输出到终端：先清当前行，输出消息，然后readline会自动重绘提示符 */
function outputLine(text: string): void {
  // 清除当前行（如果有就清），输出，换行
  process.stdout.write(`\r\x1b[K${text}\n`);
}

/** Gateway 模式的消息处理 */
export function gatewayOutput(msg: { type: string; [key: string]: any }): void {
  switch (msg.type) {
    case "ai_response":
      outputLine(`${aiPrefix()}${msg.text}`);
      break;
    case "broadcast":
      outputLine(`${bold(msg.from)}: ${msg.text}`);
      break;
    case "activity":
      outputLine(muted("  " + msg.text));
      break;
    case "joined":
      outputLine(muted("  > " + msg.user + " 上线了 (" + (msg.workspace || "") + ")"));
      break;
    case "left":
      outputLine(muted("  < " + msg.user + " 下线了"));
      break;
    case "error":
      outputLine(error("  Gateway: " + msg.message));
      break;
    case "task_notify":
      outputLine(info(`  [任务] ${msg.from}: ${msg.taskType}`));
      outputLine(dim(`    ${JSON.stringify(msg.payload).slice(0, 120)}`));
      break;
    case "welcome":
      outputLine(info(`  已加入房间: ${msg.room?.name || "?"}`));
      if (msg.members?.length) {
        outputLine(muted(`  在线成员: ${msg.members.map((m: any) => m.name).join(", ")}`));
      }
      break;
    case "memory_update":
      outputLine(muted(`  记忆已更新: ${msg.key}`));
      break;
    case "recall_result":
      if (msg.results) outputLine(msg.results);
      break;
    case "connected":
      // 连接成功，不额外输出
      break;
    case "disconnected":
      outputLine(muted("  连接已断开"));
      break;
    default:
      // 未知类型，静默忽略
      break;
  }
}
