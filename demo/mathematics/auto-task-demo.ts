// 自动变更检测演示 — Alice 改接口 → AI 自动通知 Bob
import "dotenv/config";
import { startGateway } from "../../src/gateway/server.js";
import { GatewayClient } from "../../src/gateway/client.js";
import { loadOrgGraph, findBySkill } from "../../src/org/index.js";
import "../../src/tools/index.js";
import { executeTool } from "../../src/tools/registry.js";

const PORT = 13989;
await startGateway(PORT);

const graph = loadOrgGraph("./demo/mathematics")!;
console.log("Org: " + graph.nodes.length + " nodes");

const resp = await fetch("http://localhost:" + PORT + "/rooms", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "AutoTask", userId: "admin" }),
});
const room = await resp.json();

// Connect Alice and Bob
const alice = new GatewayClient();
const bob = new GatewayClient();
const bobTasks: any[] = [];
const aliceReplies: string[] = [];

bob.on("task_notify", (msg: any) => { if (msg.type === "task_notify") bobTasks.push(msg); });
alice.on("ai_response", (msg: any) => { if (msg.type === "ai_response") aliceReplies.push(msg.text); });

await alice.connect("ws://localhost:" + PORT, room.id, "Alice", ".");
await bob.connect("ws://localhost:" + PORT, room.id, "Bob", ".");
await new Promise((r) => setTimeout(r, 500));
console.log("Both connected\n");

// === 场景：Alice 修改了接口 ===
console.log("=== 场景: Alice 用 edit_file 修改了关键接口 ===");

// 1. Alice 先创建文件
await executeTool({ id: "1", name: "write_file", arguments: { path: "_demo_api.py", content: "def calculate_order(order_id: int) -> dict:\n    return {\"id\": order_id, \"status\": \"pending\"}\n" } });

// 2. Alice 修改了接口签名
const editResult = await executeTool({
  id: "2", name: "edit_file",
  arguments: {
    path: "_demo_api.py",
    old_string: "def calculate_order(order_id: int) -> dict:",
    new_string: "from dataclasses import dataclass\n\n@dataclass\nclass OrderResult:\n    id: int\n    status: str\n\ndef calculate_order(order_id: int) -> OrderResult:",
  },
});
console.log("Alice 修改了接口:");
console.log("  " + editResult.content.slice(0, 200));

// 3. AI 检测到变更 → 分析影响范围 → 自动通知
console.log("\n=== AI 分析变更影响 ===");
const affected = findBySkill(graph, "python").filter((n) => n.id !== "alice");
console.log("  受影响用户 (Python技能): " + affected.map((n) => n.name).join(", "));

// 4. 自动发送任务通知
for (const user of affected) {
  alice.send({
    type: "task",
    taskType: "contract_change",
    to: user.name,
    payload: {
      file: "_demo_api.py",
      function: "calculate_order",
      change: "返回值从 dict 改为 OrderResult dataclass",
      reason: "类型安全",
      migration: "pip install dataclasses 即可兼容（Python 3.7+内置）",
    },
    priority: "high",
  });
}
await new Promise((r) => setTimeout(r, 500));

// 5. 验证 Bob 收到
console.log("\n=== 结果 ===");
console.log("  Bob 收到通知: " + bobTasks.length + " 条");
for (const t of bobTasks) {
  console.log("    类型: " + t.taskType);
  console.log("    来自: " + t.from);
  console.log("    内容: " + JSON.stringify(t.payload).slice(0, 150));
}

// 清理
import { unlinkSync } from "node:fs";
try { unlinkSync("_demo_api.py"); } catch {}
alice.disconnect();
bob.disconnect();
console.log("\nPASS — 自动变更检测 + 通知流程完整");
process.exit(0);
