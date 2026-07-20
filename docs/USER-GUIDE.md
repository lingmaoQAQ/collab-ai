# CollabAI 使用文档

## 是什么

CollabAI 是一个 **AI 多用户协作框架**。不是单人 AI 助手，而是一个能理解项目全局、协调多个开发者的 AI 技术协作者。

**一句话：** 你在终端里跟 AI 聊天，AI 知道项目中其他人在做什么、项目有哪些决策和规范，帮你保持团队一致。

---

## 安装

```bash
# 要求：Node.js >= 22
git clone <仓库地址> collab-ai
cd collab-ai
npm install
npm run build
```

### 配置 API Key

```bash
cp .env.example .env
```

编辑 `.env`，填入任一 API Key：

```ini
# 推荐：DeepSeek（国内直接用）
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
COLLABAI_MODEL=deepseek-chat

# 或者：Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
COLLABAI_MODEL=claude-sonnet-4-6

# 或者：OpenAI
OPENAI_API_KEY=sk-xxx
COLLABAI_MODEL=gpt-4o
```

---

## 两种使用模式

### 模式一：本地单机（完整功能）

直接启动，所有数据和 AI 都在本地：

```bash
# 创建项目
npm run chat -- --new-room "我的项目" --user "你的名字"

# 加入已有项目
npm run chat -- --room <项目ID> --user "你的名字"

# 恢复上次会话（不指定任何参数）
npm run chat
```

### 模式二：Gateway 网络（多人多机）

一个中心 Gateway 服务器 + 多个人带自己的工作区接入。适合团队使用。

```bash
# 1. 在某台机器上启动 Gateway（公司内网服务器）
npm run gateway -- --port 3000

# 2. 每个人从自己的机器接入
npm run chat -- --connect ws://192.168.1.100:3000 --room <项目ID> --user Alice -w ~/projects/mywork
npm run chat -- --connect ws://192.168.1.100:3000 --room <项目ID> --user Bob   -w D:\code\mywork
```

---

## 命令参考

### 会话管理

| 命令 | 说明 |
|------|------|
| `/new <标题>` | 创建新会话 |
| `/load <id>` | 加载指定会话 |
| `/list` | 列出我的会话 |
| `/save` | 保存当前会话并生成 AI 摘要 |
| `/clear` | 清除当前对话 |
| `/compact` | 压缩上下文（LLM摘要老消息，节省token） |
| `/export [文件名]` | 导出为 Markdown 文件 |
| `/usage` | 查看 Token 用量和成本 |

### 上下文管理

| 命令 | 说明 |
|------|------|
| `/context` | 查看三级上下文（会话 / 用户 / 项目） |
| `/context project` | 查看项目全局记忆 |
| `/context user` | 查看自己的风格偏好 |

### 工具命令

| 命令 | 说明 |
|------|------|
| `/tools` | 列出所有可用工具 |
| `/run <命令>` | 执行 Shell 命令（危险操作自动拦截） |
| `/cat <文件>` | 读取文件内容 |
| `/ls [路径]` | 列出目录 |
| `/search <正则>` | 在代码中正则搜索 |
| `/workspace [路径]` | 查看或切换工作目录 |

> AI 编辑文件时使用 `edit_file`（精确替换）和 `write_file`（覆盖写入+diff预览）。

### 任务追踪

| 命令 | 说明 |
|------|------|
| `/todo list` | 查看任务列表 |
| `/todo add <任务>` | 添加任务 |
| `/todo done <编号>` | 标记完成 |
| `/todo clear` | 清空任务 |

### 会话恢复

CollabAI 在每次对话后自动保存断点。异常退出后重新启动，自动恢复到最后的会话状态。

### 协作命令

| 命令 | 说明 |
|------|------|
| `/rooms` | 列出所有项目空间 |
| `/members` | 查看当前房间成员 |
| `/invite <用户名>` | 邀请用户加入房间 |
| `/events` | 查看最近项目活动 |
| `/remember <key> <value>` | 记录一条共享记忆 |
| `/recall <关键词>` | 搜索共享记忆 |
| `/memories` | 查看所有项目记忆 |

### 其他

| 命令 | 说明 |
|------|------|
| `/model <id>` | 切换 AI 模型 |
| `/help` | 显示帮助 |
| `/quit` | 退出 |

---

## 典型工作流

### 场景一：新项目启动

```bash
npm run chat -- --new-room "电商后台" --user "小王"
```

```
小王 > 我们要做一个电商后台系统，帮我设计一下数据库表结构
AI  > 建议以下核心表：用户表、商品表、订单表...
小王 > /remember db-design "核心表：users, products, orders, payments"
小王 > /remember tech-stack "React + Node.js + PostgreSQL"
小王 > /save
```

### 场景二：新成员加入

```bash
npm run chat -- --room <项目ID> --user "小李"
```

AI 会显示："项目动态：小王正在处理电商后台。已有 2 条项目记忆：db-design, tech-stack"

```
小李 > 这个项目用的是什么技术栈？
AI  > 根据项目记忆，技术栈是 React + Node.js + PostgreSQL。
      小王之前记录了数据库设计方案...
```

### 场景三：冲突检测

```
小王 > 我要把订单表的状态字段改成字符串
小李 > 订单状态应该用枚举还是字符串？
AI  > ⚠️ 你和小王最近都在讨论订单状态的设计，建议先同步一下。
      小王在考虑改成字符串，与你当前的设计方向相关。
```

---

## Gateway 模式详解

### Gateway HTTP API

```bash
# 健康检查
curl http://localhost:3000/health
# → {"status":"ok","nodes":2}

# 查看所有房间
curl http://localhost:3000/rooms

# 创建房间
curl -X POST http://localhost:3000/rooms \
  -H "Content-Type: application/json" \
  -d '{"name":"新项目","userId":"admin"}'
```

### Gateway WebSocket 协议

连接：`ws://host:port/ws?room=<id>&user=<name>&workspace=<path>`

**客户端 → 服务端：**

```json
{ "type": "chat", "text": "你好" }
{ "type": "remember", "key": "arch", "value": "三层架构" }
{ "type": "recall", "query": "架构" }
```

**服务端 → 客户端：**

```json
{ "type": "broadcast", "from": "Alice", "text": "你好" }
{ "type": "joined", "user": "Bob", "workspace": "/home/bob/code" }
{ "type": "memory_update", "key": "arch", "value": "三层架构" }
```

协议是 JSON-based 的，可以很方便地用任何语言实现客户端接入。

---

## 配置文件

### 环境变量（.env）

```ini
# AI 接口
DEEPSEEK_API_KEY=sk-xxx          # DeepSeek
ANTHROPIC_API_KEY=sk-ant-xxx     # Anthropic Claude
OPENAI_API_KEY=sk-xxx            # OpenAI

# 接口地址
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
OPENAI_BASE_URL=https://api.openai.com/v1

# 默认设置
COLLABAI_MODEL=deepseek-chat
COLLABAI_SYSTEM_PROMPT=你是一个专业的AI编程助手

# 状态存储
COLLABAI_STATE_DIR=~/.collab-ai
```

### JSON 配置文件（collab-ai.json）

在项目根目录创建：

```json
{
  "model": "deepseek-chat",
  "provider": "deepseek",
  "systemPrompt": "你是一个专业的AI编程助手",
  "maxTokens": 4096,
  "temperature": 0.7,
  "defaultUser": "小王",
  "defaultRoom": "abc123"
}
```

优先级：命令行参数 > 文件配置 > 环境变量 > 默认值

---

## 数据结构

### 项目房间（Room）
项目空间，包含成员、会话、共享记忆。

### 用户（User）
开发者身份，自动创建（同名复用）。AI 会自动学习你的编码风格偏好。

### 会话（Session）
你的一次对话。跨会话自动恢复，长篇对话自动生成摘要。

### 共享记忆（Memory）
项目级别的知识和决策。房间内所有人都能看到。

分类：
- `decision` — 架构决策
- `knowledge` — 项目知识
- `style` — 代码规范
- `general` — 其他

---

## 常见问题

**Q: 两个用户能看到对方的对话吗？**
A: 不能。每个人的会话严格隔离，只有在同一个房间里才能看到共享记忆和项目活动。

**Q: AI 能读写我电脑上的文件吗？**
A: 可以，但有限制。`/run` 命令有安全拦截（危险操作会被拒绝），文件操作限制在工作目录内，无法访问上级目录外的文件。

**Q: Gateway 模式需要公网 IP 吗？**
A: 不需要。Gateway 只需要局域网可达。公司内网服务器启动 Gateway，团队成员通过内网 IP 连接即可。

**Q: 支持哪些 AI 模型？**
A: Anthropic Claude、OpenAI GPT、DeepSeek、以及任何 OpenAI Chat Completions 兼容接口（Ollama、vLLM 等）。

**Q: 数据存在哪里？**
A: 默认 `~/.collab-ai/collab-ai.sqlite`。可通过 `COLLABAI_STATE_DIR` 环境变量修改路径。
