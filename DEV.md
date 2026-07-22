# CollabAI v2 开发指南

## 重构方向

基于 OpenClaw (MIT) 的 LLM 内核，构建单人 AI Coding 体验，然后接入多用户协作。

## 当前进度

- [x] Step 1: 复制 OpenClaw 内核（packages/ 编译通过）
- [ ] Step 2: 对接 agent-loop，跑通单人 AI 对话
- [ ] Step 3: 恢复多用户协作层
- [ ] Step 4: 两张表的逐项验证

## 文件结构

```
packages/          ← OpenClaw 内核 (MIT)，不修改源码
src/               ← CollabAI 代码
  agent/           ← wrapper for OpenClaw agent-loop
  collab/          ← multi-user collaboration (identity, sessions, memory, ...)
  gateway/         ← multi-user Gateway server
  cli/             ← CLI commands
  ui/              ← terminal UI
  config/          ← configuration
  utils/           ← utilities (logging, usage, errors)
```

## 快速开始（暂不可用）

```bash
npm install
npm run build  # 当前 src/ 编译有错误，待对接
```

## 两张开发表

见 `docs/v2-architecture.md`
