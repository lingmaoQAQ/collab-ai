# CollabAI 开发指南

## 支持平台

- **Linux** (主力开发/部署)
- **Windows** (开发/测试)

## 环境要求

| 依赖 | 最低版本 | Linux | Windows |
|------|---------|-------|---------|
| Node.js | >= 22 LTS | `nvm` / 包管理器 | 官网安装包 |
| pnpm | >= 9 | `npm i -g pnpm` | `npm i -g pnpm` |
| Git | >= 2.40 | 包管理器 | 官网安装包 |
| TypeScript | >= 5.5 | 项目依赖 | 项目依赖 |

## 快速开始

```bash
# 克隆项目（未来）
git clone <repo-url> collab-ai
cd collab-ai

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 测试
pnpm test
```

## 项目架构（规划）

```
collab-ai/
├── src/
│   ├── gateway/          # 网关层 — 多用户入口路由
│   ├── sessions/         # 会话层 — 用户上下文隔离
│   ├── context/          # 上下文引擎 — 长短期记忆管理
│   ├── agents/           # Agent 层 — AI Agent 生命周期
│   ├── workspace/        # 工作区层 — 文件隔离与合并
│   ├── project/          # 项目大脑 — 全局认知维护
│   ├── style/            # 风格引擎 — 开发者风格学习
│   ├── channels/         # 通道层 — Slack/钉钉/Webhook
│   ├── merge/            # 合并引擎 — 语义冲突检测与解决
│   └── plugin-sdk/       # 插件 SDK — 扩展接口
├── packages/             # 可复用包
├── docs/                 # 文档
├── test/                 # 测试
└── skills/               # AI 技能定义
```

## 核心模块依赖关系

```
channels → gateway → sessions → context → agents
                       ↓            ↓
                   workspace    project
                       ↓            ↓
                    merge ←──── style
```

## 技术选型原则

- **协议/API 层** 参考 OpenClaw 的 gateway-protocol 分层设计
- **存储** 默认 SQLite，参考 OpenClaw 的 Kysely 方案
- **实时协作** CRDT 方案（Yjs 或 Automerge）
- **代码分析** Tree-sitter，语言无关
- **插件系统** 参考 OpenClaw plugin-sdk 的契约式接口

## 平台差异处理

### Windows 注意事项
- 路径分隔符统一用 `/` 或 `path.join()`
- 避免 bash 脚本，用 Node.js 脚本或跨平台 npm scripts
- 文件监听用 `chokidar`（处理 Windows 的 fs.watch 问题）
- 换行符统一 LF，配置 `.gitattributes`

### Linux 注意事项
- systemd 服务文件用于生产部署
- 注意文件描述符限制（长连接场景）
- SQLite WAL 模式在 Linux 下性能更好

## 编码规范

- TypeScript strict mode
- 模块化优先 — 每个模块可独立测试
- 接口契约 — 模块间通过明确类型定义通信
- 错误处理 — 使用 Result 模式（参考 OpenClaw normalization-core）
- 异步优先 — I/O 密集场景用异步操作

## 测试策略

| 层级 | 工具 | 说明 |
|------|------|------|
| 单元测试 | Vitest | 每个模块独立测试 |
| 集成测试 | Vitest + SQLite 内存模式 | 模块间交互 |
| E2E | Playwright (未来) | 多用户场景模拟 |

## 参考项目源码

- `../openclaw-source/` — OpenClaw 源码（学习架构参考）
  - `src/gateway/` — 网关/协议设计
  - `src/agents/` — Agent 管理
  - `src/sessions/` — 会话管理
  - `src/context-engine/` — 上下文引擎
  - `src/memory/` — 记忆系统
  - `packages/gateway-protocol/` — 协议定义
  - `packages/ai/` — AI 核心抽象
