# 节点协作协议设计

## 目标

从"自然语言聊天"升级到"结构化任务消息"——两个 AI 节点不只是互相看到对方在说什么，而是能发带类型的任务包、解析、处理、回复。

这是从"协作工具"到"协作协议"的关键一步。

## 三件事

### 1. 结构化消息协议

当前 Gateway 消息只有 `chat`（纯文本广播）。需要支持带类型的任务消息：

```typescript
// 新增消息类型
type TaskMessage = {
  type: "task";                    // 不是 chat，是 task
  taskType: "contract_change"      // 接口变更
          | "dependency_alert"     // 依赖冲突
          | "review_request"       // 审查请求
          | "knowledge_share"      // 知识分享
          | "coordination";        // 通用协调
  
  from: string;                    // 发送者
  to: string | "broadcast";       // 接收者（可以是特定用户或广播）
  
  payload: Record<string, unknown>; // 结构化数据
  priority: "low" | "normal" | "high";
  
  requiresAck: boolean;            // 是否需要确认
  replyTo?: string;               // 回复哪个消息
  
  timestamp: string;
  messageId: string;              // 唯一ID
};
```

### 2. Org Graph（组织拓扑）

YAML 文件描述团队结构，AI 据此路由消息：

```yaml
# .collab-ai/org-graph.yml
version: "0.1"
nodes:
  - id: alice
    type: leaf
    name: "Alice"
    skills: ["python", "群论", "sympy"]
    workspace: "./demo/mathematics"
    
  - id: bob
    type: leaf
    name: "Bob"
    skills: ["性能优化", "渲染", "matplotlib"]
    workspace: "./demo/mathematics"
```

CollabAI 启动时读取这个文件，AI 知道"谁擅长什么"、"消息发给谁"。

### 3. 自动变更通知

AI 检测到关键操作（改了接口、加了依赖、记录了重要决策）时，自动生成结构化消息通知相关方。

## 实现方案

### 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/org/types.ts` | 新建 | OrgNode, OrgGraph 类型 |
| `src/org/loader.ts` | 新建 | 从 YAML 加载 Org Graph |
| `src/org/index.ts` | 新建 | barrel |
| `src/gateway/types.ts` | 修改 | 加 TaskMessage / TaskReply |
| `src/gateway/server.ts` | 修改 | 处理 task 消息 + 路由 |
| `src/cli/commands/chat.ts` | 修改 | 读取 org graph，显示角色 |
| `demo/mathematics/.collab-ai/org-graph.yml` | 新建 | 示例配置 |

### 不会做的事（这次）

- ❌ YAML 解析库（手写简单解析器，20行）
- ❌ 消息持久化队列（先实时）
- ❌ 复杂的路由算法（先直接匹配）

### 验证场景

```
1. Alice 说 "我要改 api.py 的返回格式"
2. AI 检测到"接口变更" → 生成 task 消息
3. Gateway 根据 Org Graph 找到 Bob（依赖接口）
4. Bob 收到结构化通知："Alice 改了 api.py，你需要适配"
5. Bob 的 AI 自动提醒
```

## 与现有系统的关系

```
Gateway (已有)
  │
  ├── chat 消息路由 (已有)
  ├── AI 回复 (已有)
  ├── 共享记忆 (已有)
  │
  └── task 消息路由 (新增) ← 本次
        │
        └── Org Graph (新增) ← 本次
              │
              └── 自动通知 (新增) ← 本次
```
