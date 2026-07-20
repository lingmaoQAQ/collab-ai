# CollabAI — AI 多用户协作框架

**让 AI 成为团队的技术协作者，而不只是个人助手。**

现有 AI 编程工具（Cursor、Claude Code、GitHub Copilot）都是"单人 AI 助手"——它们解决"一个人 + AI"的效率问题，不是"多个人 + AI + 项目统一"的协作问题。

CollabAI 填补这个空白：一个能理解每个开发者风格、维护项目全局认知、在多人协作时主动协调冲突的 AI 技术协作者。

## 架构

```
Gateway（中心 AI 大脑）  ←→  Node A（Alice 的机器 + 工作区）
                        ←→  Node B（Bob 的机器 + 工作区）
                        ←→  Node C（Carol 的服务器）

    树形组织拓扑（Org Graph）
    ├── 数学与算法组
    │   ├── Alice (群论)
    │   └── Carol (图论)
    └── 基础设施组
        ├── Bob (性能)
        ├── Dave (测试)
        └── Eve (文档)
```

## 当前版本 v1.1.0

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

## 快速开始

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

## 测试

```bash
npm test  # 运行全部测试（当前 35/35 通过）
```

## 协议

MIT License | [CONTRIBUTING.md](CONTRIBUTING.md) | [USER-GUIDE.md](docs/USER-GUIDE.md)
