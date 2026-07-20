import "dotenv/config";
import "../src/tools/index.js";
import { executeTool } from "../src/tools/registry.js";
import { getDefaultRegistry, createLlmRuntime, createOpenAIChatProvider, BUILTIN_MODELS } from "../src/llm/index.js";
import { compactConversation } from "../src/context/compact.js";
import { UsageTracker, estimateTokens } from "../src/utils/usage.js";
import { writeFileSync, unlinkSync } from "node:fs";

let ok = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(cond ? "  PASS" : "  FAIL", name, detail);
  cond ? ok++ : fail++;
}

// 1. Compact
const reg = getDefaultRegistry();
reg.register(createOpenAIChatProvider({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: "https://api.deepseek.com/v1", api: "openai-chat" }));
const rt = createLlmRuntime(reg);
const m = BUILTIN_MODELS.find((x) => x.id === "deepseek-chat")!;
const msgs = Array.from({ length: 14 }, (_, i) => ({
  role: (i % 2 ? "user" : "assistant") as "user" | "assistant",
  content: "消息" + i + ": 讨论数据库表结构设计",
}));
const cr = await compactConversation(rt, m, msgs, 4);
check("Compact", cr.compactedCount > 0, cr.compactedCount + "条压缩, 省" + Math.round((1 - cr.newTokens / cr.oldTokens) * 100) + "%");

// 2. Diff
writeFileSync("_test.txt", "aaa\nbbb\nccc");
const dr = await executeTool({ id: "d", name: "write_file", arguments: { path: "_test.txt", content: "aaa\nBBB\nccc\nddd" } });
check("Diff预览", dr.content.includes("Diff"), "");
unlinkSync("_test.txt");

// 3. Usage
const ut = new UsageTracker();
ut.record(m, 1000, 500);
check("Usage追踪", ut.stats.cost > 0, ut.summary());

// 4. Estimate
const et = estimateTokens("你好世界HelloWorld");
check("Token估算", et > 0, et + " tok");

console.log("\n新功能: " + ok + "/" + (ok + fail) + " 通过");
process.exit(fail > 0 ? 1 : 0);
