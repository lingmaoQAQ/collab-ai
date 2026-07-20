# Welcome / 欢迎你来

[English](#english) | [中文](#chinese)

---

## English {#english}

### What This Is

**Let AI help your whole team write code together, not just you alone.**

Current AI coding tools (Cursor, Claude Code, Copilot) are strong — but they assume you work solo. In reality, 3-5 people modifying the same repo is the norm. The more people, the harder communication gets: who changed what? Does Bob know the interface changed? Who made that weird design decision three months ago? None of the current AI tools help with any of this.

CollabAI is a middleware layer: an AI technical coordinator that knows what everyone is working on, warns about conflicts, and helps newcomers understand the project quickly.

### Being Honest

I'm a solo developer. This project is built in my spare time.

v1.1 runs the core pipeline — multi-user session isolation, project memory sharing, Gateway network mode, AI context assembly, org graph routing, structured task messages — but there's still a long way to go. Code needs improvement, features are skeletons, and plenty of rough edges.

**If you're willing to help, any form of contribution is deeply welcome.** You don't need to write thousands of lines:

- Try it out. Tell me what's broken or poorly designed.
- Understand one module and help add comments or docs.
- Rename a variable that bugs you.
- Suggest a feature direction you think matters.
- Share it with someone who might find it interesting.

One person goes fast. A group goes far. I think the idea is valuable, but my capacity as a solo dev is limited.

### Tech Stack

TypeScript + Node.js + SQLite + WebSocket. Terminal-native AI collaboration tool.

Supports Anthropic Claude, OpenAI GPT, DeepSeek, Ollama, and OpenAI-compatible APIs.

### Quick Start

```bash
git clone https://github.com/lingmaoQAQ/collab-ai.git
cd collab-ai
npm install && cp .env.example .env && npm run build
npm run chat -- --new-room "test" --user "your-name"
```

### What You Can Help With

| Area | What To Do |
|------|-----------|
| Bug fixes | Check Issues, pick one |
| Permissions | Data model has roles — need API-level enforcement |
| Smart search | Replace SQLite LIKE with vector search for 1000+ memories |
| Plugins | `registerTool` exists — need file-based auto-loader |
| Notifications | Slack / DingTalk webhook integration |
| Web dashboard | Visual project status for non-terminal users |
| Docs translation | EN ↔ ZH mutual translation |
| Discussion | Open an Issue to chat about directions |

### Contact

- QQ: 3457985028
- Email: 3457985028@qq.com

---

## 中文 {#chinese}

### 这个项目是什么

简单说：**让 AI 不只是帮你写代码，而是帮整个团队一起写代码。**

现在的 AI 编程助手（Cursor、Claude Code、Copilot）都很强，但它们假设你是一个人在战斗。真实项目里，三五个人同时改一个仓库才是常态。人一多，沟通就麻烦——谁改了什么、接口变了别人知不知道、这个奇怪的设计是谁什么时候加的——这些问题 AI 目前一个都帮不上。

CollabAI 想做这个中间层：一个 AI 技术协作者，知道项目中每个人在做什么，有冲突时提醒，有新成员时帮他快速了解项目。

### 坦诚说

我是一个个人开发者，这个项目目前是我在业余时间做的。

v1.1 跑通了基本流程——多用户会话隔离、项目记忆共享、Gateway 网络模式、AI 上下文组装、组织拓扑路由、结构化任务消息——但离"好用"还有距离。代码里肯定有不少需要改进的地方，很多功能也只是搭了骨架。

**如果你愿意搭把手，任何形式的参与都非常欢迎。** 不需要你写几千行代码，哪怕只是：

- 试用一下，告诉我哪里不好用、哪里设计不合理
- 看懂一个模块，帮我补充注释或文档
- 改一个你觉得不舒服的变量名
- 提一个你觉得应该做的功能方向
- 转发给可能有兴趣的朋友

一个人走得快，一群人走得远。这个想法我觉得是有价值的，但我一个人的能力确实有限。

### 技术栈

TypeScript + Node.js + SQLite + WebSocket。终端原生的 AI 协作工具。

支持 Anthropic Claude、OpenAI GPT、DeepSeek、Ollama 等模型。

### 快速开始

```bash
git clone https://github.com/lingmaoQAQ/collab-ai.git
cd collab-ai
npm install && cp .env.example .env && npm run build
npm run chat -- --new-room "test" --user "你的名字"
```

### 可以做点什么

| 方向 | 大概要做什么 |
|------|-------------|
| 修 Bug | 看看 Issues，挑个顺眼的 |
| 权限完善 | 数据模型有 role 字段了，但还没在 API 层执行 |
| 智能检索 | 记忆多了以后用向量搜索替代 SQLite LIKE |
| 插件机制 | `registerTool` 已经有了，缺一个从文件加载插件的系统 |
| 多通道通知 | Slack / 钉钉 消息推送 |
| Web 面板 | 可视化项目状态，不擅长终端的人也能用 |
| 文档翻译 | 中英文文档互相翻译 |
| 讨论 | 在 Issue 里聊聊你觉得这个方向对不对 |

### 联系我

- QQ：3457985028
- 邮箱：3457985028@qq.com

不用客气，随时聊。不管是技术问题、功能想法、还是单纯想吐槽，都欢迎。
