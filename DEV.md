# CollabAI 开发指南 v1.1

## 支持平台

- **Windows** (开发/测试)
- **Linux** (主力开发/部署)

## 环境要求

| 依赖 | 最低版本 | 安装方式 |
|------|---------|---------|
| Node.js | >= 22 LTS | `nvm` / 官网 |
| npm | >= 10 | 随 Node.js |
| TypeScript | >= 5.8 | 项目依赖 |

## 快速开始

```bash
git clone <repo-url> collab-ai
cd collab-ai
npm install
cp .env.example .env   # 编辑填入 API Key

npm run build           # 编译
npm run chat -- --new-room "项目名" --user "你的名字"   # 启动
```

## 项目架构

```
collab-ai/
├── cli.mjs                    # CLI 入口（ESM）
├── src/
│   ├── llm/                   # ✅ LLM 抽象层
│   │   ├── types.ts           #   Model, Message, Tool, StreamEvent
│   │   ├── registry.ts        #   API Provider 注册表
│   │   ├── runtime.ts         #   LlmRuntime 分发
│   │   └── providers/
│   │       ├── anthropic.ts   #   Anthropic Messages API (tool use)
│   │       ├── openai.ts      #   OpenAI Responses API
│   │       └── openai-completions.ts  # DeepSeek/Ollama 兼容
│   ├── config/                # ✅ 配置系统
│   ├── identity/              # ✅ 身份系统
│   │   ├── types.ts           #   User, Room, RoomRole
│   │   └── manager.ts         #   UserManager, RoomManager
│   ├── sessions/              # ✅ 会话层（room+user隔离）
│   │   ├── database.ts        #   SQLite schema（7张表）
│   │   ├── types.ts           #   UserSession, SessionMessage
│   │   ├── store.ts           #   SessionStore (CRUD)
│   │   └── manager.ts         #   SessionManager (高层API)
│   ├── memory/                # ✅ 项目共享记忆（room级）
│   ├── events/                # ✅ 项目活动事件日志
│   ├── context/               # ✅ Context Engine
│   │   └── engine.ts          #   assemble(用户+项目→prompt)
│   ├── mediator/              # ✅ AI Mediator
│   │   └── engine.ts          #   whatsNew, enhanceContext, analyzeTurn
│   ├── tools/                 # ✅ 工具系统
│   │   ├── registry.ts        #   工具注册表
│   │   ├── loop.ts            #   AI工具调用循环（runToolLoop）
│   │   └── builtin/
│   │       ├── bash.ts        #   run_command（安全沙箱）
│   │       ├── file.ts        #   read_file, write_file, list_files
│   │       └── search.ts      #   search_code（正则）
│   ├── ui/                    # ✅ 终端UI
│   │   ├── theme.ts           #   ANSI颜色方案（ClaudeCode风格）
│   │   ├── format.ts          #   文本清理/Markdown渲染
│   │   ├── stream.ts          #   StreamAssembler（无闪烁流式）
│   │   ├── status.ts          #   状态栏（stderr动画）
│   │   └── banner.ts          #   启动画面
│   ├── cli/                   # ✅ CLI（Commander）
│   │   └── commands/chat.ts   #   30+斜杠命令
│   ├── gateway/               # ✅ Gateway 网络层（HTTP+WS+AI）
│   ├── org/                    # ✅ 组织拓扑（树形 Org Graph）
│   ├── workspace/             # 🔲 工作区隔离层
│   └── channels/              # 🔲 通知通道(Slack/钉钉)
├── demo/mathematics/          # 演示项目 + 5个测试脚本
├── test/                      # 回归测试（3套）
├── docs/                      # 设计文档
│   ├── context-engine-design.md
│   └── mediator-design.md
└── test/                      # 集成测试
```

## 数据库 Schema（7张表）

```
rooms ──┐
        │ 1:N  room_members (多对多) ── users
        │                                 │ author_id
  user_sessions ── room_id, user_id        ↓
    │ 1:N                          project_memories
  session_messages
        │
  project_events ── room_id, user_id
```

## 核心模块依赖

```
cli/chat ← mediator → context ← sessions
         ← tools/loop
         ← ui (theme, stream, banner)
         ← llm (providers)
         ← identity (UserManager, RoomManager)
```

## 命令行参考（30+ 命令）

```
── 会话 ──
/new <title>      创建新会话
/load <id>        加载会话
/list             列出会话
/save             保存 & 生成摘要
/clear            清除对话
/export [file]    导出为 Markdown

── 上下文 ──
/context          查看三级上下文
/context project  项目记忆详情
/context user     用户风格/偏好

── 工具 ──
/tools            列出可用工具
/run <cmd>        执行命令
/cat <file>       读取文件
/ls [path]        列出目录
/search <regex>   搜索代码

── 协作 ──
/rooms            项目空间列表
/members          房间成员
/invite <name>    邀请用户
/events           最近活动
/remember <k> <v> 记录共享记忆
/recall <query>   搜索共享记忆
/memories         查看所有记忆

── 工作区 ──
/workspace [path] 查看/切换工作目录

── 其他 ──
/model <id>       切换模型
/help             显示帮助
/quit             退出
```

## 愿景对照

| 文档需求 | 状态 | 实现 |
|---------|------|------|
| 单人上下文统一 | ✅ | sessions 持久化 + 自动恢复 |
| 多用户不串上下文 | ✅ | identity Room/User 隔离 |
| 文件互不干扰 | 🔲 | 需要 workspace 层 |
| 项目统一认知 | ✅ | context + memory + mediator |
| AI 了解每人风格 | ✅ | mediator analyzeTurn |
| AI 作为中介协调 | 🟡 | mediator 跨用户感知 + 冲突提示 |
| 实时通知 | 🔲 | 需要 channels 层 |
| AI 自主工具调用 | ✅ | tools/loop (runToolLoop) |

## 参考项目

- `../openclaw-source/` — OpenClaw 源码（架构参考）
- Claude Code — UI 风格参考
- MiMo Code — 跨会话记忆参考
