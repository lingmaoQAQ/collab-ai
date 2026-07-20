# AI Mediator 设计文档

## 定位

Mediator 是愿景文档中"AI 作为技术协作者"概念的核心实现层。

它不是另一个 AI Agent，而是一个**增强层**——它在 Context Engine 和 LLM 之间工作，让 AI 在回答用户时"知道"项目中其他人在做什么、做过什么、可能有什么冲突。

## 核心能力（v0.5.0 范围）

### 1. 跨用户感知（Cross-User Awareness）

用户 A 对话时，AI 能看到：

```
## 团队成员动态
- Bob 正在处理 [订单模块重构]（最近会话）
- Carol 今天记录了 2 条架构决策

## 可能相关的变更
- Bob 昨天修改了 PaymentStatus 枚举（你上周引用过）
```

### 2. 冲突提示（Conflict Hints）

当两个用户的最近工作涉及相同关键词/模块时：

```
⚠️ 注意：Bob 最近也在讨论「支付模块」的接口设计
建议与他同步后再做修改。
```

### 3. 用户风格学习（Style Profiling）

从对话中学习每个开发者的偏好：

```json
{
  "codingStyle": "偏好函数式、提前返回、类型优先",
  "preferredModules": ["order-service", "payment"],
  "commonPatterns": ["Result 模式", "依赖注入"],
  "learnedAt": "2026-07-20"
}
```

### 4. "自上次以来"摘要

用户恢复会话时显示：

```
自你上次活动以来（2小时前）：
- Bob 加入了项目
- 新增 1 条架构决策：数据库采用 WAL 模式
- Carol 在 order-service 中开始了新会话
```

## 架构设计

```
chat.ts
  │
  ├── Mediator.whatsNew()     ← 启动时：显示自上次以来的变化
  │
  ├── Mediator.enhanceContext() ← 对话前：添加跨用户感知
  │     ↓
  │   ContextEngine.assemble()  ← 基础项目上下文
  │     ↓
  │   + 跨用户动态
  │   + 冲突提示
  │   + 用户风格注入
  │     ↓
  │   最终 Prompt → LLM
  │
  └── Mediator.analyzeTurn()   ← 对话后：学习风格模式
```

## 接口设计

```typescript
class Mediator {
  constructor(db: Database.Database);

  // 用户恢复会话时：显示自上次以来的变化
  whatsNew(roomId: string, userId: string, since: string): Promise<WhatsNewResult>;

  // 增强项目上下文：添加跨用户感知
  enhanceContext(params: EnhanceParams): Promise<EnhanceResult>;

  // 对话后分析：学习用户风格、检测模式
  analyzeTurn(params: AnalyzeParams): Promise<void>;
}
```

## 数据来源

Mediator 不新建表，复用现有数据：

| 需求 | 数据来源 |
|------|---------|
| 其他用户在做什么 | `user_sessions`（最近的会话标题和摘要） |
| 项目最近变化 | `project_events`（自某时间以来的事件） |
| 可能冲突 | `session_messages` 关键词匹配 |
| 用户风格 | `users.profile` JSON 字段更新 |
| 全局决策 | `project_memories` |

## 实现规模

- `src/mediator/types.ts` — ~50 行
- `src/mediator/engine.ts` — ~200 行（核心逻辑）
- `src/mediator/index.ts` — ~10 行
- `src/cli/commands/chat.ts` — 修改 ~30 行
- `docs/mediator-design.md` — 本文件

## 设计决策

1. **不建新表** — 所有数据来自现有 schema，Mediator 只是"读取 + 分析"层
2. **风格学习用 LLM** — 在 `/save` 时异步调用小模型分析对话内容，提取风格特征
3. **冲突检测用关键词** — 不做复杂的语义分析，比较两个用户最近会话的关键词重叠度
4. **非侵入式** — Mediator 失败不影响主对话流程，所有异常静默降级
