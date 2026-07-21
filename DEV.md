# CollabAI 开发指南 v1.3

## 项目数据

| 指标 | 数据 |
|------|------|
| 模块 | 15 个 |
| 源文件 | 57 个 |
| 代码行数 | ~5800 行 TypeScript |
| CLI 命令 | 38 个 |
| 内置工具 | 10 个 |
| 测试套件 | 5 套 (35 项) |
| Git 提交 | 48 次 |

## 架构全景

```
cli/chat.ts (2850行, 38命令)
  ├── llm/          types → registry → runtime → providers/
  │                    Anthropic / OpenAI / DeepSeek (openai-completions)
  ├── config/       types → load (env + JSON)
  ├── sessions/     database (SQLite 7表) → types → store → manager
  ├── memory/       types → store (room级共享, 关键词评分搜索)
  ├── identity/     types → manager (UserManager + RoomManager)
  ├── events/       types → store (项目活动日志)
  ├── context/      types → engine (assemble, ContextEngine)
  │                 compact (LLM摘要压缩)
  ├── mediator/     types → engine (whatsNew, enhanceContext, analyzeTurn)
  ├── tools/        types → registry → loop (runToolLoop)
  │                 builtin/ (bash, file(含edit/batch), search)
  ├── ui/           theme → format → stream → banner → status
  ├── gateway/      types → server + client (WS重连+缓冲)
  ├── org/          types → loader (YAML拓扑 → 树操作)
  └── plugins/      types → loader (目录扫描, 自动注册)
```

## 依赖层级

```
cli ← gateway + tools + ui + context + mediator
       ↓         ↓      ↓       ↓         ↓
     sessions  memory  format  identity  events
                  ↓               ↓
              database ←── all ──→ database
```

## 数据库 Schema (7表)

```
rooms ── room_members(多对多) ── users
  │ 1:N user_sessions              │ author_id
  │     └ 1:N session_messages      ↓
  │                          project_memories (UNIQUE room_id,key)
  └── project_events (room_id, user_id, event_type)
```

## 快速开始

```bash
npm install && cp .env.example .env
npm run build
npm run chat -- --new-room "test" --user "name"
npm test  # 35项全部通过
```

## 关键文件

| 文件 | 行数 | 职责 |
|------|------|------|
| cli/commands/chat.ts | ~1300 | 38个命令 + 主循环 |
| gateway/server.ts | ~340 | HTTP+WS Gateway + AI协调 |
| context/engine.ts | ~220 | 上下文动态组装 |
| mediator/engine.ts | ~180 | 跨用户感知 + 冲突检测 |
| tools/builtin/file.ts | ~280 | 文件读写/编辑/批量编辑 |
| sessions/store.ts | ~140 | SQLite会话CRUD |
| llm/providers/openai-completions.ts | ~120 | DeepSeek/Ollama适配 |
