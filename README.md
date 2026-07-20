# CollabAI — AI 多用户协作框架

**让 AI 成为团队的技术协作者，而不只是个人助手。**

现有 AI 编程工具（Cursor、Claude Code、GitHub Copilot）都是"单人 AI 助手"模式——它们解决"一个人 + AI"的效率问题，不是"多个人 + AI + 项目统一"的协作问题。

CollabAI 的目标是填补这个空白：一个能理解每个开发者风格、维护项目全局认知、在多人协作时主动协调冲突的 AI 技术协作者。

## 核心理念

```
┌─────────────────────────────────────────────────────────┐
│              协作层 (Collaboration Layer)                │
│     AI 作为中介，理解各开发者风格，协调冲突               │
│     维护「项目统一认知」和「风格指南」                     │
├─────────────────────────────────────────────────────────┤
│  用户A上下文  │  用户B上下文  │  用户C上下文  │  用户N...  │
│  (Session A) │  (Session B) │  (Session C) │            │
│  对话历史    │  对话历史    │  对话历史    │            │
│  个人偏好    │  个人偏好    │  个人偏好    │            │
│  当前任务    │  当前任务    │  当前任务    │            │
├─────────────────────────────────────────────────────────┤
│             文件系统层 (Workspace Layer)                  │
│   工作区隔离 + 乐观并发 + AI 辅助语义合并                  │
└─────────────────────────────────────────────────────────┘
```

## 核心能力

| 能力 | 说明 |
|------|------|
| **单人上下文统一** | 长短期记忆分离，跨会话保持核心上下文不丢失 |
| **多用户上下文隔离** | 按 user_id 隔离的 Context Store，互不串扰 |
| **文件工作区隔离** | 每个用户独立工作副本，乐观并发控制 |
| **项目全局认知** | 独立于任何用户的「项目大脑」，维护架构决策和规范 |
| **AI 中介协调** | 检测冲突、同步变更、主动通知相关开发者 |
| **开发者风格学习** | 分析历史提交，学习每个开发者的编码风格和偏好 |
| **语义冲突检测** | 不仅检测文本冲突，还检测 AST 级别的语义冲突 |
| **AI 辅助合并** | 理解双方意图后生成兼容代码，而非简单标记冲突 |

## 技术栈（规划中）

- **Runtime**: Node.js / TypeScript
- **上下文存储**: SQLite + 向量数据库（ChromaDB / LanceDB）
- **文件隔离**: Git worktree
- **实时协作**: Yjs / Automerge (CRDT)
- **代码分析**: Tree-sitter AST 解析
- **通知通道**: Slack / 钉钉 / Webhook

## 灵感来源

本项目受 [OpenClaw](https://github.com/openclaw/openclaw) (MIT) 的架构启发：
- 网关/协议分层设计
- 插件化通道架构
- Agent 生命周期管理
- 会话和记忆系统

## 当前状态

**v0.6.0** — 11 个模块，43 个源文件，~4000 行 TypeScript。

| 模块 | 功能 |
|------|------|
| `llm/` | Anthropic + OpenAI + DeepSeek 多 Provider |
| `identity/` | User/Room 身份和多对多成员管理 |
| `sessions/` | Room+User 隔离的 SQLite 会话持久化 |
| `memory/` | Room 级共享记忆（决策/知识/风格/通用） |
| `events/` | 项目活动事件日志 |
| `context/` | Context Engine：用户上下文+项目上下文动态组装 |
| `mediator/` | AI Mediator：跨用户感知、冲突检测、风格学习 |
| `tools/` | 5 个内置工具 + AI 自主工具调用循环（runToolLoop） |
| `ui/` | Claude Code 风格终端 UI（ANSI + StreamAssembler） |
| `cli/` | 30+ 斜杠命令的交互式 chat |

## 快速开始

```bash
cp .env.example .env   # 填入 DeepSeek/Anthropic/OpenAI Key
npm install && npm run build

# 本地模式
npm run chat -- --new-room "我的项目" --user "Alice"

# Gateway 模式（多机协作）
npm run gateway -- --port 3000                        # 终端1: 服务器
npm run chat -- --connect ws://localhost:3000 --room <id> --user Bob -w ~/code  # 终端2
```

📖 完整使用文档：[docs/USER-GUIDE.md](docs/USER-GUIDE.md)

## 协议

MIT License — 详见 [LICENSE](LICENSE)
