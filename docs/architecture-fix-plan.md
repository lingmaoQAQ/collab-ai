# CollabAI 架构修复计划

## 根因分析

今天的 bug（短ID外键错误、输出错位、Gateway 消息处理失败、重复广播）都指向 3 个根因：

1. **Gateway chat handler 单体化** — 会话创建/AI调用/工具执行/变更检测/风格学习全挤在一个 switch case 里
2. **消息无 ID 关联** — 客户端发消息，Gateway 回复，但没有请求/响应对应关系
3. **输出层缺失** — 直接写 stdout，和 readline 提示符打架

## 修复策略（4 步，逐个做）

### Fix 1: 消息协议加 ID（30min）
- 所有 Gateway 消息加 `msgId` 字段（请求和响应配对）
- 错误消息加 `code` 字段（可重试/不可重试）
- 影响：仅 `types.ts` + `server.ts` 消息构造处

### Fix 2: 提取 Gateway chat handler 为独立模块（1h）
- `src/gateway/server.ts` 的 `case "chat"` → `src/gateway/chat-handler.ts`
- 清晰的函数签名：`handleChatMessage(ws, msg, ctx) => Promise<void>`
- 错误处理集中在一个地方

### Fix 3: 统一 ID 管理（30min）
- 删除短ID前缀匹配（这是 bug 源头）
- 改为：`POST /rooms` 时返回完整 UUID，Gateway 启动日志打印 ID
- 客户端始终用完整 UUID 通信

### Fix 4: 输出层标准化（30min）
- Gateway 客户端收到的所有消息通过 `receiveMessage()` 函数处理
- `receiveMessage` 负责：清当前行 → 输出消息 → 重新打印提示符
- 不再直接写 `process.stdout.write`

## 不在本计划范围
- 重写为帧协议（v2.0）
- 审批系统（v2.0）
- 结构化会话键（v2.0）
