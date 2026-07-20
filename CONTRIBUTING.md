# 欢迎你来

## 这个项目是什么

简单说：**让 AI 不只是帮你写代码，而是帮整个团队一起写代码。**

现在的 AI 编程助手（Cursor、Claude Code、Copilot）都很强，但它们假设你是一个人在战斗。真实项目里，三五个人同时改一个仓库才是常态。人一多，沟通就麻烦——谁改了什么、接口变了别人知不知道、这个奇怪的设计是谁什么时候加的——这些问题 AI 目前一个都帮不上。

CollabAI 想做这个中间层：一个 AI 技术协作者，知道项目中每个人在做什么，有冲突时提醒，有新成员时帮他快速了解项目。

## 坦诚说

我是一个个人开发者，这个项目目前是我在业余时间做的。

v1.0 跑通了基本流程——多用户会话隔离、项目记忆共享、Gateway 网络模式、AI 上下文组装——但离"好用"还有距离。代码里肯定有不少需要改进的地方，很多功能也只是搭了骨架。

**如果你愿意搭把手，任何形式的参与都非常欢迎。** 不需要你写几千行代码，哪怕只是：

- 试用一下，告诉我哪里不好用、哪里设计不合理
- 看懂一个模块，帮我补充注释或文档
- 改一个你觉得不舒服的变量名
- 提一个你觉得应该做的功能方向
- 转发给可能有兴趣的朋友

一个人走得快，一群人走得远。这个想法我觉得是有价值的，但我一个人的能力确实有限。

## 技术栈

TypeScript + Node.js + SQLite + WebSocket。终端原生的 AI 协作工具。

支持 Anthropic Claude、OpenAI GPT、DeepSeek、Ollama 等模型。

## 怎么跑起来

```bash
git clone https://github.com/lingmaoQAQ/collab-ai.git
cd collab-ai
npm install
cp .env.example .env   # 填入 API Key
npm run build

# 本地单机体验
npm run chat -- --new-room "test" --user "你的名字"

# Gateway 模式（多人多机）
npm run gateway -- --port 3000 --token mytoken           # 一台机器做服务器
npm run chat -- --connect ws://IP:3000 --token mytoken \
  --room <id> --user Alice -w ~/myproject               # 其他人接入
```

## 可以做点什么

这些都是我一个人忙不过来但确实需要的：

| 方向 | 大概要做什么 |
|------|-------------|
| 🐛 修 Bug | 看看 Issues，挑个顺眼的 |
| 🔐 权限完善 | 数据模型有 role 字段了，但还没在 API 层执行 |
| 🧠 智能检索 | 记忆多了以后用向量搜索替代 SQLite LIKE |
| 🔌 插件机制 | `registerTool` 已经有了，缺一个从文件加载插件的系统 |
| 📢 多通道通知 | Slack / 钉钉 消息推送，有人改了记忆就通知 |
| 🎨 Web 面板 | 可视化项目状态，不擅长终端的人也能用 |
| 📖 文档翻译 | 中英文文档互相翻译 |
| 💬 讨论 | 在 Issue 里聊聊你觉得这个方向对不对 |

## 联系我

- QQ：3457985028
- 邮箱：3457985028@qq.com

不用客气，随时聊。不管是技术问题、功能想法、还是单纯想吐槽，都欢迎。
