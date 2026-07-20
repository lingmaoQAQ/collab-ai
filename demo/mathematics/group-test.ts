// 子组协调测试 — 树形拓扑：组内路由 + 跨组路由
import "dotenv/config";
import { loadOrgGraph, findGroup, getGroupMembers, getSiblings, getParent } from "../../src/org/index.js";

const graph = loadOrgGraph("./demo/mathematics")!;
let pass = 0, fail = 0;
function t(name: string, cond: boolean, d = "") {
  console.log((cond ? "  ✓" : "  ✗") + " " + name + (d ? " — " + d : ""));
  cond ? pass++ : fail++;
}

// === 1. 树形结构 ===
console.log("\n=== 1. 树形拓扑 ===");
console.log("math-group");
for (const m of getGroupMembers(graph, "math-group")) {
  console.log("  ├── " + m.name + " (" + m.type + ")");
}
console.log("infra-group");
for (const m of getGroupMembers(graph, "infra-group")) {
  console.log("  ├── " + m.name + " (" + m.type + ")");
}
t("math-group 2成员", getGroupMembers(graph, "math-group").length === 2);
t("infra-group 3成员", getGroupMembers(graph, "infra-group").length === 3);

// === 2. 组归属 ===
console.log("\n=== 2. 组归属 ===");
t("Alice ∈ math-group", findGroup(graph, "alice")?.id === "math-group");
t("Bob ∈ infra-group", findGroup(graph, "bob")?.id === "infra-group");
t("Carol ∈ math-group", findGroup(graph, "carol")?.id === "math-group");
t("Dave ∈ infra-group", findGroup(graph, "dave")?.id === "infra-group");

// === 3. 同级检测 ===
console.log("\n=== 3. 同级检测 ===");
t("Alice同级=Carol", getSiblings(graph, "alice").some((s) => s.id === "carol"));
t("Bob同级=Dave,Eve", getSiblings(graph, "bob").length === 2);

// === 4. 跨组检测 ===
console.log("\n=== 4. 跨组检测 ===");
const aliceGroup = findGroup(graph, "alice")!;
const bobGroup = findGroup(graph, "bob")!;
t("Alice和Bob不同组", aliceGroup.id !== bobGroup.id);

// === 5. 组内路由 vs 跨组路由 ===
console.log("\n=== 5. 路由判断 ===");
const sameGroup = aliceGroup.id === findGroup(graph, "carol")?.id;
const crossGroup = aliceGroup.id !== findGroup(graph, "bob")?.id;
t("Alice→Carol 组内", sameGroup, aliceGroup.name + " 内");
t("Alice→Bob 跨组", crossGroup, aliceGroup.name + " → " + bobGroup.name);

// === 6. 父节点 ===
console.log("\n=== 6. 父节点 ===");
t("Alice父=math-group", getParent(graph, "alice")?.id === "math-group");
t("Bob父=infra-group", getParent(graph, "bob")?.id === "infra-group");

console.log("\n" + "=".repeat(40));
console.log("子组协调: " + pass + "/" + (pass + fail) + " 通过\n");
process.exit(fail > 0 ? 1 : 0);
