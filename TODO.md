# CollabAI v2 近期开发计划

## 当前状态

✅ packages/ 编译通过（4 个 OpenClaw 内核包）
✅ src/ 数据层正常（identity/sessions/memory/events）
✅ 全项目零编译错误
🔲 无 CLI 入口
🔲 无 AI 对话能力

## Step 2: 搭建最小可用 CLI（单人 AI 对话）

| # | 任务 | 说明 |
|---|------|------|
| 2.1 | 写 `src/agent/index.ts` | 封装 OpenClaw agent-loop + 工具注册 |
| 2.2 | 写 `src/agent/tools.ts` | 注册内置工具（read_file, write_file, edit_file, search, bash） |
| 2.3 | 写 `src/cli/index.ts` | Commander 程序入口 |
| 2.4 | 写 `src/cli/commands/chat.ts` | 最小 chat 命令（对接 agent-loop） |
| 2.5 | 写 `cli.mjs` | ESM 入口点 |
| 2.6 | 测试 | `npm run chat` 能基本对话 |

## Step 3: 恢复工具调用

| # | 任务 | 说明 |
|---|------|------|
| 3.1 | 对接 OpenClaw tool execution | 使用 agent-loop 的工具执行流程 |
| 3.2 | 文件读写工具 | read_file, write_file, edit_file |
| 3.3 | 命令执行工具 | run_command（Shell 检测 + 审批） |
| 3.4 | 搜索工具 | search_code |
| 3.5 | 流式输出 | 使用 OpenClaw event-stream |

## Step 4: 恢复多用户协作层

| # | 任务 | 说明 |
|---|------|------|
| 4.1 | ContextEngine | 项目上下文注入（复用 memory + identity） |
| 4.2 | Mediator | 跨用户感知 + 冲突检测 |
| 4.3 | Gateway Server | 多用户 HTTP+WS 服务器 |
| 4.4 | Org Graph | 组织拓扑 |
| 4.5 | 结构化任务 | 任务消息路由 |

## Step 5: 体验打磨

| # | 任务 | 说明 |
|---|------|------|
| 5.1 | 终端 UI | 颜色、加载动画、流式渲染 |
| 5.2 | 会话管理 | /list /load /save /compact |
| 5.3 | Token 追踪 | /usage |
| 5.4 | Dashboard | Web 面板 |
| 5.5 | 通知系统 | Slack/钉钉 Webhook |

## 测试状态

| 层级 | 状态 | 说明 |
|------|------|------|
| packages/ 编译 | ✅ | 4 个包全部通过 |
| src/ 编译 | ✅ | 零错误 |
| 数据层 (identity/sessions/memory/events) | ✅ | 全部正常 |
| AI 对话 | 🔲 | 待实现 |
| 工具调用 | 🔲 | 待实现 |
| 多用户协作 | 🔲 | 待实现 |
