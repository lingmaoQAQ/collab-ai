# CollabAI v2 — 重构中

**⚠️ 项目正在进行重大架构重构，当前版本不可用。**

## 重构目标

基于 OpenClaw (MIT) 的稳定内核，重建单人 AI Coding 体验，然后接入 CollabAI 独有的多用户协作层。

## 当前状态

| 组件 | 状态 |
|------|------|
| OpenClaw 内核 (packages/) | ✅ 编译通过 |
| 单人 AI 对话 | 🔲 待对接 |
| 多用户协作层 | 🔲 待接入 |
| Gateway + Dashboard | 🔲 待恢复 |

## 架构

```
packages/          ← OpenClaw 内核 (MIT)，不修改
  llm-core/       ← LLM 类型 + 流式事件
  ai/             ← API 注册表 + Providers
  agent-core/     ← Agent 循环 + 工具系统
  normalization-core/ ← 数据规范化工具

src/
  collab/          ← 多用户协作层（待启用）
  gateway/         ← 多用户 Gateway
  cli/             ← CLI 入口
  ui/              ← 终端 UI
```

预计 2026年7月 中旬恢复可用状态。
