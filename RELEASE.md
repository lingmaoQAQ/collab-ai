# CollabAI v1.3 — 发布公告

## AI 多用户协作框架

CollabAI 不是另一个"AI 帮你写代码"的工具，而是一个 **AI 技术协作者** —— 它知道团队中每个人在做什么，维护项目全局认知，在多人协作时主动协调冲突。

## 快速体验

```bash
git clone https://github.com/lingmaoQAQ/collab-ai.git
cd collab-ai && npm install
cp .env.example .env  # 填入 DeepSeek/Anthropic/OpenAI 任一 Key
npm run build && npm run chat -- --new-room "test" --user "你的名字"
```

## 核心能力

| 能力 | 说明 |
|------|------|
| 多用户协作 | Room/User 隔离，每个用户独立会话，AI 感知彼此活动 |
| 项目全局认知 | 共享记忆 + Context Engine，AI 知道项目的架构决策和技术规范 |
| 跨用户协调 | Mediator 检测冲突、学习风格、自动建议通知受影响用户 |
| Gateway 网络 | 分布式架构，一个中心节点 + 多个工作节点，像互联网一样接入 |
| 树形拓扑 | Org Graph 定义团队结构，子组协调、技能搜索、跨组路由 |
| 结构化任务 | 带类型的任务消息（接口变更/依赖更新/代码审查），精准投递 |
| Web Dashboard | 浏览器打开 `localhost:3000`，项目状态可视化 |
| 通知系统 | Slack / 钉钉 / 自定义 Webhook，任务/变更自动推送 |
| 终端原生 | Claude Code 风格 UI，加载动画、Tab 补全、38 个命令 |

## 技术架构

- TypeScript + Node.js + SQLite + WebSocket
- 15 个模块，58 个源文件，~6000 行代码
- 支持 Anthropic Claude、OpenAI GPT、DeepSeek、Ollama
- 35 项回归测试全部通过
- MIT 开源协议

## 下一步

- VS Code 插件
- 向量语义搜索
- 更多通知通道

项目是个人开发者业余时间做的，能力有限，欢迎任何形式的参与。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

*QQ: 3457985028 | 邮箱: 3457985028@qq.com*
