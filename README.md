# CollabAI — AI Multi-User Collaboration Framework

**Let AI be your team's technical coordinator, not just a personal assistant.**

[中文](#chinese) | [English](#english)

---

## English

Existing AI coding tools (Cursor, Claude Code, GitHub Copilot) are all **single-user AI assistants** — they solve "one person + AI" efficiency, not "multiple people + AI + project unity" collaboration.

CollabAI fills this gap: an AI technical coordinator that understands each developer's style, maintains global project awareness, and proactively coordinates when multiple people work together.

### Architecture

```
Gateway (Central AI Brain)  ←→  Node A (Alice's machine + workspace)
                            ←→  Node B (Bob's machine + workspace)
                            ←→  Node C (Carol's server)

    Tree Organization Topology (Org Graph)
    ├── Math & Algorithms Group
    │   ├── Alice (Group Theory)
    │   └── Carol (Graph Theory)
    └── Infrastructure Group
        ├── Bob (Performance)
        ├── Dave (Testing)
        └── Eve (Documentation)
```

### v1.1.0 Modules

| Module | Purpose |
|--------|---------|
| `llm/` | Multi-provider AI (Anthropic + OpenAI + DeepSeek), tool-use loop |
| `identity/` | User/Room identity, many-to-many membership |
| `sessions/` | Room+User isolated SQLite sessions, crash recovery |
| `memory/` | Room-level shared memory (decisions/knowledge/style) |
| `events/` | Project activity event log |
| `context/` | Context Engine: dynamic context assembly + conversation compaction |
| `mediator/` | AI Mediator: cross-user awareness, conflict detection, style learning |
| `tools/` | 6 built-in tools (bash/file/edit/search/list/diff) |
| `ui/` | Claude Code-style terminal UI (ANSI + streaming) |
| `gateway/` | HTTP+WS distributed network + AI coordinator mode + token auth |
| `org/` | Tree organization topology + subgroup-aware routing |
| `cli/` | 30+ slash commands |

### Quick Start

```bash
git clone https://github.com/lingmaoQAQ/collab-ai.git
cd collab-ai
npm install
cp .env.example .env   # Fill in your API key (DeepSeek/Anthropic/OpenAI)
npm run build

# Local single-user
npm run chat -- --new-room "my-project" --user "your-name"

# Gateway multi-machine
npm run gateway -- --port 3000 --token mysecret        # Server
npm run chat -- --connect ws://IP:3000 --token mysecret \
  --room <id> --user Alice -w ~/myproject              # Client
```

### Tests

```bash
npm test  # All 35 tests pass
```

### Roadmap

See [ROADMAP.md](ROADMAP.md). Key milestones:

| Version | Focus |
|---------|-------|
| v1.2 | AI deep integration (Gateway processes tasks, auto-change detection) |
| v1.3 | Plugin system + vector semantic search |
| v2.0 | Multi-channel notifications (Slack/DingTalk) + Web Dashboard + IDE plugins |

### License

### Web Dashboard

Gateway ships with a real-time dashboard at `http://localhost:3000` — system status, online members, memory map, activity timeline.

### License

MIT | [CONTRIBUTING.md](CONTRIBUTING.md) | [中文使用文档](docs/USER-GUIDE.md)

---

## 中文 {#chinese}

现有的 AI 编程工具（Cursor、Claude Code、GitHub Copilot）都是**单人 AI 助手**——它们解决"一个人 + AI"的效率问题，不是"多个人 + AI + 项目统一"的协作问题。

CollabAI 填补这个空白：一个能理解每个开发者风格、维护项目全局认知、在多人协作时主动协调冲突的 AI 技术协作者。

### 架构

```
Gateway（中心 AI 大脑）  ←→  Node A（Alice 的机器 + 工作区）
                        ←→  Node B（Bob 的机器 + 工作区）
                        ←→  Node C（Carol 的服务器）

    树形组织拓扑（Org Graph）
    ├── 后端组
    │   └── Alice (图算法)
    └── 前端组
        └── Bob (界面)
```

### v1.1.0 模块

| 模块 | 功能 |
|------|------|
| `llm/` | Anthropic + OpenAI + DeepSeek 多 Provider，工具调用循环 |
| `identity/` | User/Room 身份，多对多成员管理 |
| `sessions/` | Room+User 隔离的 SQLite 会话持久化，断点恢复 |
| `memory/` | Room 级共享记忆（决策/知识/风格） |
| `events/` | 项目活动事件日志 |
| `context/` | Context Engine：动态上下文组装 + 对话压缩 |
| `mediator/` | AI Mediator：跨用户感知、冲突检测、风格学习 |
| `tools/` | 6 个内置工具（bash/file/edit/search/list/diff） |
| `ui/` | Claude Code 风格终端 UI（ANSI + 流式渲染） |
| `gateway/` | HTTP+WS 分布式网络 + AI 协作者模式 + Token 认证 |
| `org/` | 树形组织拓扑 + 子组协调路由 |
| `cli/` | 30+ 斜杠命令 |

### 快速开始

```bash
git clone https://github.com/lingmaoQAQ/collab-ai.git
cd collab-ai
npm install
cp .env.example .env   # 填入 API Key（DeepSeek/Anthropic/OpenAI）
npm run build

# 本地单机
npm run chat -- --new-room "我的项目" --user "你的名字"

# Gateway 多机协作
npm run gateway -- --port 3000 --token mysecret        # 服务器
npm run chat -- --connect ws://IP:3000 --token mysecret \
  --room <id> --user Alice -w ~/myproject              # 客户端
```

### 测试

```bash
npm test  # 全部 35 项测试通过
```

### 开发路线

详见 [ROADMAP.md](ROADMAP.md)，关键节点：

| 版本 | 重点 |
|------|------|
| v1.2 | AI 深度集成（Gateway 处理 task、自动变更检测、组内聚合） |
| v1.3 | 插件系统 + 智能检索（向量搜索） |
| v2.0 | 多通道通知 + Web Dashboard + IDE 插件 |

### 协议

MIT | [CONTRIBUTING.md](CONTRIBUTING.md) | [使用文档](docs/USER-GUIDE.md)
