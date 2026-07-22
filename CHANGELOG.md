# CollabAI Changelog

## v1.3.0 (2026-07-21)

### 新增

- **Web Dashboard** — Gateway 启动后浏览器访问，实时展示系统状态、在线成员、项目记忆、活动时间线。暗色 GitHub 风格主题，支持房间筛选和 WebSocket 实时更新。
- **可插拔通知系统** — 支持 Slack / 钉钉 / 自定义 Webhook。Gateway 检测到任务/变更时自动推送。不配置则零影响。
- **自动变更检测** — AI 编辑文件后自动检测变更，查 Org Graph 找出受影响用户，提示发送通知。
- **CollabError 错误体系** — 12 个错误码，统一错误格式。
- **Gateway 离线消息队列** — 用户离线时消息存入 SQLite，上线后自动回放。

### 改进

- Dashboard API (`/dashboard`) 支持按房间筛选
- Gateway 启动时显示通知状态
- 安全增强：命令长度限制、pipe-to-shell 拦截、chmod 777 拦截
- `.env.example` 新增通知配置项

### 修复

- DeepSeek API 未配置 baseURL 时自动检测默认地址
- Gateway 离线队列测试稳定

## v1.2.0 (2026-07-20)

### 新增

- **Smart Gateway** — AI 任务分析（路由前分析内容+项目记忆生成建议）、自动变更检测、子组聚合汇报
- **命令体验** — 别名（/q/h/c/s）、Tab 补全、加载动画、流式看门狗
- **实用工具** — /git、/history、batch_edit（多文件编辑+失败回滚）
- **会话管理** — /rename、/branch（会话分叉）、美化 /list
- **记忆管理** — /memories edit/delete
- **首次启动引导** — 未配 API Key 时显示友好设置步骤而非报错

## v1.1.0 (2026-07-20)

### 新增

- **节点协作协议** — 结构化任务消息（contract_change/dependency_alert/review_request）
- **Org Graph** — 树形组织拓扑（YAML 配置），支持技能搜索、组内/跨组路由
- **子组协调** — /group summary（AI 生成组内日报）、5 节点压力测试
- **Gateway 增强** — Token 认证、工具转发

## v1.0.0 (2026-07-20)

- LLM 多 Provider（Anthropic/OpenAI/DeepSeek）
- 多用户 Room/User 隔离 + SQLite 持久化
- Context Engine（动态上下文组装）+ Mediator（跨用户协调）
- Gateway 网络层（HTTP+WS）
- 工具系统（6 个内置工具）+ 终端 UI（Claude Code 风格）
- 35 项回归测试
