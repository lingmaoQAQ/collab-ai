// 多节点协作压力测试 — 5 个节点同时在线
import "dotenv/config";
import { startGateway } from "../../src/gateway/server.js";
import { GatewayClient } from "../../src/gateway/client.js";
import { loadOrgGraph, findBySkill, describeOrg } from "../../src/org/index.js";

const PORT = 13990;
await startGateway(PORT);

const graph = loadOrgGraph("./demo/mathematics")!;
console.log("组织拓扑: " + graph.nodes.length + " 个节点\n");

// 创建房间
const resp = await fetch("http://localhost:" + PORT + "/rooms", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "MultiNode", userId: "admin" }),
});
const room = await resp.json();

// 5 个节点同时连接
const nodes: Record<string, { client: GatewayClient; messages: any[]; tasks: any[]; notices: string[] }> = {};
for (const n of graph.nodes) {
  const client = new GatewayClient();
  const record: { messages: any[]; tasks: any[]; notices: string[] } = { messages: [], tasks: [], notices: [] };

  client.on("*", (msg: any) => {
    if (msg.type === "broadcast") record.messages.push(msg);
    if (msg.type === "task_notify") record.tasks.push(msg);
    if (msg.type === "activity") record.notices.push(msg.text);
  });

  await client.connect("ws://localhost:" + PORT, room.id, n.name, n.workspace || ".");
  nodes[n.id] = { client, ...record };
  console.log("  " + n.name + " 已连接 (技能: " + (n.skills || []).join(", ") + ")");
}
await new Promise((r) => setTimeout(r, 500));
console.log("\n全部 " + Object.keys(nodes).length + " 个节点在线\n");

// === 测试 1: 广播消息 ===
console.log("=== 1. 广播: Alice 发送全体通知 ===");
nodes.alice.client.chat("大家好，今天开始重构 visualize_normal_series 函数");
await new Promise((r) => setTimeout(r, 300));
const received = Object.entries(nodes).filter(([id, n]) => id !== "alice" && n.messages.length > 0);
console.log("  收到广播: " + received.length + "/4 人");
for (const [id] of received) console.log("    - " + id);

// === 测试 2: 单播任务（Alice → Bob）===
console.log("\n=== 2. 单播: Alice → Bob 接口变更 ===");
nodes.alice.client.send({
  type: "task",
  taskType: "contract_change",
  to: "Bob",
  payload: { file: "test.py", function: "visualize_normal_series", change: "返回类型从None改为dict", reason: "需要返回分析结果" },
  priority: "high",
});
await new Promise((r) => setTimeout(r, 300));
console.log("  Bob 收到: " + nodes.bob.tasks.length + " 条任务");
console.log("  Carol 收到: " + nodes.carol.tasks.length + " 条 (应为0)");

// === 测试 3: 单播任务（Carol → Dave 审查请求）===
console.log("\n=== 3. 单播: Carol → Dave 代码审查 ===");
nodes.carol.client.send({
  type: "task",
  taskType: "review_request",
  to: "Dave",
  payload: { files: ["test.py:45-60"], description: "新增了网络图构建逻辑" },
  priority: "normal",
});
await new Promise((r) => setTimeout(r, 300));
console.log("  Dave 收到: " + nodes.dave.tasks.length + " 条任务");
console.log("  Alice 收到: " + nodes.alice.tasks.length + " 条 (应为0)");

// === 测试 4: 单播任务（Dave → Eve 文档更新）===
console.log("\n=== 4. 单播: Dave → Eve 文档更新 ===");
nodes.dave.client.send({
  type: "task",
  taskType: "knowledge_share",
  to: "Eve",
  payload: { topic: "API变更说明", content: "visualize_normal_series 现在返回 dict 而非 None" },
  priority: "low",
});
await new Promise((r) => setTimeout(r, 300));
console.log("  Eve 收到: " + nodes.eve.tasks.length + " 条任务");

// === 测试 5: 广播任务（Alice → broadcast 所有人）===
console.log("\n=== 5. 广播任务: Alice → 所有人 依赖升级 ===");
nodes.alice.client.send({
  type: "task",
  taskType: "dependency_alert",
  to: "broadcast",
  payload: { package: "matplotlib", from: "3.7", to: "3.9", breaking: false },
  priority: "normal",
});
await new Promise((r) => setTimeout(r, 500));
let broadcastReceived = 0;
for (const [id, n] of Object.entries(nodes)) {
  if (id !== "alice" && n.tasks.length > 0) broadcastReceived++;
}
console.log("  收到广播任务: " + broadcastReceived + "/4 人");

// === 测试 6: 技能搜索 ===
console.log("\n=== 6. 技能搜索 ===");
console.log("  Python:    " + findBySkill(graph, "python").map((n) => n.name).join(", "));
console.log("  性能:      " + findBySkill(graph, "性能").map((n) => n.name).join(", "));
console.log("  测试:      " + findBySkill(graph, "测试").map((n) => n.name).join(", "));
console.log("  文档:      " + findBySkill(graph, "文档").map((n) => n.name).join(", "));
console.log("  图论:      " + findBySkill(graph, "图论").map((n) => n.name).join(", "));

// === 结果汇总 ===
console.log("\n" + "=".repeat(50));
let totalTasks = 0;
let totalMsgs = 0;
for (const [id, n] of Object.entries(nodes)) {
  totalTasks += n.tasks.length;
  totalMsgs += n.messages.length;
  console.log("  " + id.padEnd(8) + " 任务:" + n.tasks.length + " 消息:" + n.messages.length + " 通知:" + n.notices.length);
}
console.log("  总计: " + totalTasks + " 个任务, " + totalMsgs + " 条消息");
console.log("  测试: " + (totalTasks >= 6 ? "PASS" : "FAIL") + " (预期>=6个任务: 1单播+1审查+1文档+1广播=至少4个目标节点收到)");

// 清理
for (const [id, n] of Object.entries(nodes)) n.client.disconnect();
process.exit(0);
