# Context Engine 设计文档

## 背景

v0.3.0 完成了多用户数据地基（Room/User/Session/Memory/Events）。现在的问题是：
**这些数据怎么变成 AI 能理解的上下文？**

当前 chat 命令直接把 session_messages 塞进 LLM，AI 只知道"这个用户说了什么"，不知道：
- 这个项目里发生过什么决策
- 其他人在做什么
- 项目的代码规范和约定
- 用户的编码风格偏好

Context Engine 的作用：**在 LLM 调用之前，动态组装上下文**，让 AI 拥有项目全局视角。

## 参考：OpenClaw Context Engine

OpenClaw 的 ContextEngine 接口有完整的生命周期：

```
bootstrap → ingest → assemble → compact → dispose
              ↑         ↑          ↑
          写入上下文   构建prompt  压缩/摘要
```

核心设计理念：
- **Session 是上下文边界** — 每一次 assemble 都知道服务于哪个 session
- **分层组装** — systemPromptAddition（引擎注入）+ messages（会话消息）
- **Token 预算管理** — 预检测溢出，自动触发 compact
- **引擎可替换** — 通过 registry + slot 系统，支持自定义引擎

但 OpenClaw 是单用户系统，缺少我们需要的"项目共享上下文"概念。

## CollabAI Context Engine 设计

### 核心概念

```
用户上下文 (UserContext)     项目上下文 (ProjectContext)
├── 当前会话消息              ├── 项目决策记录
├── 历史会话摘要              ├── 共享知识条目
├── 用户偏好/风格             ├── 项目代码规范
└── 最近用户活动              ├── 其他成员活动摘要
                              └── 相关记忆检索
         ↓                           ↓
              上下文组装 (Assembly)
         ↓                           ↓
    70% Token预算               30% Token预算
                     ↓
              最终 Prompt → LLM
```

### 架构

```
┌─────────────────────────────────────────────────┐
│              ContextEngine                       │
│                                                  │
│  assemble(roomId, userId, sessionId, opts)       │
│    → AssembleResult { messages, tokenCount }     │
│                                                  │
│  compact(roomId, userId, sessionId)              │
│    → CompactResult { compacted, summary }        │
│                                                  │
│  bootstrap / ingest / dispose (轻量版)            │
└─────────────────────────────────────────────────┘
          │                │                │
    UserContext     ProjectContext    BudgetManager
    Assembler       Assembler
```

### 核心接口

```typescript
interface ContextEngine {
  // 组装完整上下文
  assemble(params: AssembleParams): Promise<AssembleResult>;
  
  // 会话完成后处理（生成摘要等）
  afterTurn(params: AfterTurnParams): Promise<void>;
  
  // 压缩对话历史
  compact(params: CompactParams): Promise<CompactResult>;
  
  // 释放资源
  dispose(): void;
}

interface AssembleParams {
  roomId: string;
  userId: string;
  sessionId: string;
  systemPrompt: string;
  messages: ContextMessage[];      // 当前会话的原始消息
  maxTokens?: number;              // Token 预算上限
  userVsProjectRatio?: number;     // 用户/项目上下文比例，默认 0.7
}

interface AssembleResult {
  messages: ContextMessage[];      // 组装后的最终消息数组
  estimatedTokens: number;
  systemPromptAddition?: string;   // 注入到 system prompt 的额外内容
}

interface ContextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
```

### 组装逻辑

```
assemble() 执行流程:

1. 读取用户上下文
   ├── 用户 profile（偏好模型、编码风格）
   ├── 当前会话的最近 N 条消息（受 token 预算限制）
   └── 最近的会话摘要（如果有）

2. 读取项目上下文
   ├── 项目 memories（按 category 过滤：decision + knowledge 优先）
   ├── 最近项目 events（最近 10 条）
   └── 房间成员概况

3. 计算 Token 分配
   ├── 总预算 = maxTokens || model.contextWindow * 0.5
   ├── 用户上下文 = 总预算 * userVsProjectRatio
   └── 项目上下文 = 总预算 * (1 - userVsProjectRatio)

4. 组装
   ├── systemPromptAddition = 项目上下文注入文本
   └── messages = 用户上下文消息（裁剪到 token 预算内）

5. 返回 AssembleResult
```

### 项目上下文注入格式

```
## 项目背景
- 项目: {roomName}
- 团队成员: {members}
- 核心架构决策:
  {memories filtered by 'decision'}

## 项目知识
  {memories filtered by 'knowledge'}

## 最近活动
  {events formatted as timeline}

## 你的协作指引
- 你是 {userName} 的 AI 助手
- 请遵循项目的已有决策和规范
- 如果发现与其他成员的工作可能冲突，请提醒
```

### Token 预算策略

| 场景 | 用户上下文 | 项目上下文 | 说明 |
|------|-----------|-----------|------|
| 对话中 | 70% | 30% | 保留最多对话历史 |
| 新会话 | 50% | 50% | 首次需要更多项目背景 |
| 摘要模式 | 30% | 70% | 侧重全局视角 |

### compact 流程

当对话消息接近 token 限制时触发：

1. 保留最近 5 轮完整对话
2. 更早的消息用 LLM 生成摘要
3. 摘要存入 user_sessions.summary
4. 下次 assemble 时注入摘要替代旧消息

## 不在本阶段范围

- ❌ 可插拔引擎（registry/slot 系统）→ 硬编码一个引擎
- ❌ 引擎隔离（quarantine）→ 单引擎无需
- ❌ Subagent 上下文传递 → 还没有 subagent
- ❌ 语义向量检索增强上下文 → 后续加入 ChromaDB/LanceDB
- ❌ 自动 compact 触发 → 先手动 `/save` 触发
- ❌ Token 精确计算 → 先估算（1 token ≈ 3 字符中文 / 4 字符英文）

## 与现有模块的集成

```
chat.ts
  │
  ├── SessionManager (获取用户会话消息)
  ├── MemoryStore (获取项目记忆)
  ├── EventStore (获取项目事件)
  ├── UserManager (获取用户 profile)
  ├── RoomManager (获取成员信息)
  │
  └── ContextEngine.assemble()
        │
        ├── 组装 systemPromptAddition（项目上下文）
        ├── 裁剪 messages（用户上下文）
        └── 返回 AssembleResult → 传给 LLM
```

## 实现规模预估

- `src/context/types.ts` — ~60 行
- `src/context/engine.ts` — ~200 行（核心组装逻辑）
- `src/context/compact.ts` — ~80 行（摘要生成）
- `src/context/index.ts` — ~15 行
- `src/cli/commands/chat.ts` — 修改 ~30 行（集成 ContextEngine）
- `docs/context-engine-design.md` — 本文件

## 设计决策记录

1. **为什么不做可插拔引擎？** — 参考 OpenClaw 的 registry/quarantine 系统（1054行），但当前只需要一个引擎。等需要自定义上下文策略时再加 plugin 系统。

2. **为什么 Token 用估算而不是精确计算？** — 精确计算需要 tiktoken 库，增加依赖。估算精度在 80% 左右，足以做预算控制。

3. **为什么不加向量检索？** — 向量数据库（ChromaDB/LanceDB）会增加部署复杂度。先用 SQLite LIKE 做关键词搜索，等记忆条目超过 1000 条再引入向量检索。

4. **UserContext 和 ProjectContext 为什么不拆成两个独立类？** — 当前逻辑简单，拆两个类过度设计。等上下文来源超过 5 种时再拆分。
