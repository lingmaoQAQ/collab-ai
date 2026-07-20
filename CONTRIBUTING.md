# 加入 CollabAI

## 我们在做什么

现有的 AI 编程工具（Cursor、Claude Code、GitHub Copilot）都是**单人 AI 助手** —— 它们解决的是"一个人 + AI"的效率问题。

但在真正的软件工程中，**大型项目需要多人协作**。人越多，沟通成本越高，而现有的 AI 工具对此毫无帮助。

**CollabAI 要解决这个问题：做一个 AI 技术协作者。** 不是"AI 帮你写得更快"，而是"AI 帮整个团队写得更协调"。

它会：
- 知道项目中每个人在做什么
- 维护项目的全局认知（架构决策、技术规范、知识积累）
- 当两个开发者可能冲突时主动提醒
- 理解每个开发者的编码风格，帮新成员快速融入
- 像一个真正的技术负责人一样协调整个团队

## 技术架构

```
Gateway（中心 AI 大脑）  ←→  Node A（Alice 的机器 + 工作区）
                        ←→  Node B（Bob 的机器 + 工作区）
                        ←→  Node C（Carol 的服务器）
```

- **TypeScript + Node.js**，纯终端运行
- **SQLite** 存储，零配置
- **WebSocket** 网络层，JSON 协议
- 支持 Anthropic / OpenAI / DeepSeek / Ollama 等所有主流模型
- MIT 开源协议

## 当前进度

v1.0.0 刚刚完成。12 个模块，50+ 源文件，25 次提交。

已实现：LLM 多Provider、多用户会话隔离、项目共享记忆、Context Engine 上下文动态组装、AI Mediator 跨用户协调、工具系统（命令执行/文件读写/代码搜索）、Gateway 分布式网络层、终端 UI。

## 如何参与

不需要你是资深开发者。只要你：

- 对 AI + 协作工具有兴趣
- 会 TypeScript 或愿意学
- 想做一个真正有用的开源项目

就可以参与。你可以：

- **试用并反馈**：`npm install && npm run chat`，告诉我们哪里不好用
- **修 Bug**：看 Issues 列表，挑一个感兴趣的
- **加功能**：看 Roadmap，选一个你想做的方向
- **写文档**：补全使用教程、翻译、示例
- **讨论设计**：在 Issue 里聊架构想法

## 快速开始

```bash
git clone <repo-url>
cd collab-ai
npm install
cp .env.example .env  # 填入 API Key
npm run build
npm run chat -- --new-room "test" --user "你的名字"
```

## 开发路线

| 优先级 | 方向 | 说明 |
|--------|------|------|
| 高 | 权限体系 | admin/developer/viewer 角色权限执行 |
| 高 | 向量语义搜索 | 记忆条目超过 1000 条后的智能检索 |
| 中 | 插件系统 | 基于现有 `registerTool` 的插件加载机制 |
| 中 | 多通道通知 | Slack / 钉钉 / 企业微信 Webhook |
| 低 | Web Dashboard | 项目可视化面板 |
| 远 | VS Code 插件 | IDE 内直接使用 CollabAI |

## 联系方式

- QQ：3457985028
- 邮箱：3457985028@qq.com

欢迎随时联系，一起把这个项目做下去。
