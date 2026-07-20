import "dotenv/config";
import "../src/tools/index.js";
import { executeTool, toolCount } from "../src/tools/registry.js";
import { writeFileSync, unlinkSync } from "node:fs";

let ok = 0, fail = 0;
function check(name: string, cond: boolean, d = "") {
  console.log((cond ? "  PASS" : "  FAIL") + " " + name + (d ? " " + d : ""));
  cond ? ok++ : fail++;
}

// 1. edit_file tool
writeFileSync("_etest.txt", "line1\nline2 old\nline3\nline4");
const r1 = await executeTool({ id: "e1", name: "edit_file", arguments: { path: "_etest.txt", old_string: "line2 old", new_string: "line2 NEW" } });
check("edit_file 精确替换", !r1.isError && r1.content.includes("已编辑"));
check("edit_file 唯一性检测", (await executeTool({ id: "e2", name: "edit_file", arguments: { path: "_etest.txt", old_string: "line", new_string: "x" } })).isError);
unlinkSync("_etest.txt");

// 2. Tool count (should have edit_file now)
check("工具数 4+", toolCount() >= 4, "共" + toolCount() + "个");

// 3. edit_file with new file creation (should fail nicely)
const r4 = await executeTool({ id: "e4", name: "edit_file", arguments: { path: "_none.txt", old_string: "x", new_string: "y" } });
check("edit_file 不存在文件", r4.isError);

console.log("\nTier2: " + ok + "/" + (ok + fail) + " 通过");
process.exit(fail > 0 ? 1 : 0);
