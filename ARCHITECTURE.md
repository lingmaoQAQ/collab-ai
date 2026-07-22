# CollabAI v2 架构文档

## 项目定位

**单人 AI Coding 助手 → 多人 AI 协作框架**

分两步走：先用 OpenClaw 内核做出稳定的单人 AI 编程体验，再接入我们独有的多用户协作层。

## 文件树

```
collab-ai/
│
├── packages/                    # OpenClaw 内核 (MIT License)
│   ├── llm-core/               # LLM 类型定义 + 事件流
│   │   └── src/
│   │       ├── types.ts         # Model, Message, Context, StreamEvent 等核心类型
│   │       └── utils/
│   │           └── event-stream.ts  # AssistantMessageEventStream（流式事件）
│   │
│   ├── ai/                     # AI Provider 层
│   │   └── src/
│   │       ├── api-registry.ts  # Provider 注册表（createApiRegistry）
│   │       ├── stream.ts        # LlmRuntime 工厂
│   │       └── providers/
│   │           ├── anthropic.ts      # Anthropic Messages API 适配器
│   │           └── openai-completions.ts  # OpenAI Chat Completions 适配器
│   │
│   ├── agent-core/             # Agent 循环 + 工具执行
│   │   └── src/
│   │       ├── agent-loop.ts    # 核心：工具调用 + 流式响应的主循环
│   │       ├── agent.ts         # Agent 基类
│   │       ├── types.ts         # Agent 配置、事件、工具定义
│   │       └── validation.ts    # 工具参数验证
│   │
│   └── normalization-core/     # 数据规范化工具（字符串/数字/JSON）
│
├── src/                        # CollabAI 自有代码
│   ├── config/                 # 配置加载（env + JSON）
│   ├── identity/               # 用户和房间管理
│   │   ├── types.ts            # User, Room, RoomMember 类型
│   │   └── manager.ts          # UserManager, RoomManager
│   ├── sessions/               # 会话持久化
│   │   ├── database.ts         # SQLite 初始化（7张表）
│   │   ├── types.ts            # UserSession, SessionMessage 类型
│   │   ├── store.ts            # SessionStore (CRUD)
│   │   └── manager.ts          # SessionManager (高层API)
│   ├── memory/                 # 项目共享记忆
│   │   ├── types.ts            # MemoryEntry 类型
│   │   └── store.ts            # MemoryStore (CRUD + 智能搜索)
│   ├── events/                 # 项目活动日志
│   │   ├── types.ts            # ProjectEvent 类型
│   │   └── store.ts            # EventStore
│   ├── gateway/                # Gateway 网络层
│   │   ├── types.ts            # GatewayMessage, NodeMessage 协议
│   │   └── dashboard.html      # Web Dashboard
│   ├── ui/                     # 终端 UI 组件
│   │   ├── theme.ts            # ANSI 颜色方案
│   │   ├── format.ts           # 文本格式化
│   │   ├── stream.ts           # 流式渲染器
│   │   ├── banner.ts           # 启动画面
│   │   ├── status.ts           # 状态栏
│   │   └── output.ts           # 统一输出（Gateway 模式）
│   └── utils/                  # 工具函数
│       ├── log.ts              # 日志
│       ├── usage.ts            # Token 用量追踪
│       └── errors.ts           # CollabError 错误体系
│
├── cli.mjs                     # CLI 入口 (ESM) — 待重写
├── package.json
├── tsconfig.json
├── README.md                   # 项目说明（标注重构中）
├── DEV.md                      # 开发指南
├── ARCHITECTURE.md             # 本文件
├── TODO.md                     # 近期开发计划
└── docs/
    └── v2-architecture.md     # v2 架构设计文档
```

## 数据流

```
用户输入
  │
  ▼
cli/commands/chat.ts        ← 待写
  │
  ├── Config 加载           ← src/config/ ✅
  ├── Session 恢复          ← src/sessions/ ✅
  ├── Context 组装          ← src/context/ 🔲 (待重建)
  │     ├── User profile    ← src/identity/ ✅
  │     ├── Room memories   ← src/memory/ ✅
  │     └── Recent events   ← src/events/ ✅
  │
  ▼
agent/                      ← 待写
  ├── OpenClaw agent-loop   ← packages/agent-core/ ✅
  ├── Provider 调用         ← packages/ai/ ✅
  │     ├── Anthropic       ← packages/ai/providers/anthropic.ts
  │     └── OpenAI/DeepSeek ← packages/ai/providers/openai-completions.ts
  └── Tool 执行             ← src/tools/ 🔲 (待重建)
        ├── read_file
        ├── write_file
        ├── edit_file
        ├── run_command
        └── search_code
  │
  ▼
Streaming 输出              ← packages/llm-core/utils/event-stream.ts ✅
  │
  ▼
Session 保存                ← src/sessions/ ✅
Usage 追踪                  ← src/utils/usage.ts ✅
```

## 依赖关系

```
cli (待写)
 ├── agent (待写)
 │    ├── packages/agent-core  ← OpenClaw
 │    └── packages/ai          ← OpenClaw
 ├── config        ✅
 ├── sessions      ✅
 ├── ui            ✅
 └── utils         ✅

identity ✅  ← 独立
memory   ✅  ← sessions (DB连接)
events   ✅  ← sessions (DB连接)
```

## 编译状态

| 组件 | 文件数 | 状态 |
|------|--------|------|
| packages/llm-core | ~6 | ✅ 零错误 |
| packages/ai | ~40 | ✅ 零错误（3个文件 @ts-nocheck） |
| packages/agent-core | ~15 | ✅ 零错误 |
| packages/normalization-core | ~15 | ✅ 零错误 |
| src/config | 3 | ✅ |
| src/identity | 3 | ✅ |
| src/sessions | 4 | ✅ |
| src/memory | 2 | ✅ |
| src/events | 3 | ✅ |
| src/gateway | 2 | ✅ |
| src/ui | 6 | ✅ |
| src/utils | 3 | ✅ |
| **总计** | **~100** | **✅ 零编译错误** |

## 两张开发表

### 表1: 单人 AI Coding（对标 Claude Code）

| # | 功能 | 状态 |
|---|------|------|
| 1 | LLM Provider (Anthropic) | ✅ OpenClaw |
| 2 | LLM Provider (OpenAI/DeepSeek) | ✅ OpenClaw |
| 3 | Agent Loop (工具调用) | ✅ OpenClaw |
| 4 | Event Stream (流式输出) | ✅ OpenClaw |
| 5 | CLI 入口 | 🔲 Step 2 |
| 6 | read_file | 🔲 Step 3 |
| 7 | write_file + diff | 🔲 Step 3 |
| 8 | edit_file | 🔲 Step 3 |
| 9 | run_command | 🔲 Step 3 |
| 10 | search_code | 🔲 Step 3 |
| 11 | 流式渲染 (TUI) | 🔲 Step 5 |
| 12 | 会话持久化 | ✅ |
| 13 | 会话恢复 | ✅ |
| 14 | /compact | 🔲 Step 5 |
| 15 | Token 追踪 | 🔲 Step 5 |

### 表2: 多人协作

| # | 功能 | 状态 |
|---|------|------|
| 1 | Room/User 隔离 | ✅ |
| 2 | 项目共享记忆 | ✅ |
| 3 | ContextEngine | 🔲 Step 4 |
| 4 | Mediator | 🔲 Step 4 |
| 5 | Org Graph | 🔲 Step 4 |
| 6 | Gateway Server | 🔲 Step 4 |
| 7 | 结构化任务 | 🔲 Step 4 |
| 8 | Dashboard | 🔲 Step 5 |
| 9 | 通知系统 | 🔲 Step 5 |
