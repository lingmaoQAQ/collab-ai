// Org Graph 加载器 — 解析 .collab-ai/org-graph.yml

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { OrgGraph } from "./types.js";

export function loadOrgGraph(workspace?: string): OrgGraph | null {
  const dir = workspace || process.cwd();
  const paths = [
    resolve(dir, ".collab-ai", "org-graph.yml"),
    resolve(dir, ".collab-ai", "org-graph.yaml"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8");
        return yamlLoad(raw) as OrgGraph;
      } catch {
        // 解析失败返回 null
      }
    }
  }

  return null;
}

/** 从 Org Graph 生成给 AI 的上下文描述 */
export function describeOrg(graph: OrgGraph, currentNodeId?: string): string {
  const lines: string[] = [];

  for (const node of graph.nodes) {
    const marker = node.id === currentNodeId ? " *" : "  ";
    const typeLabel = { root: "根", group: "组", leaf: "成员" }[node.type];
    let line = `${marker}[${typeLabel}] ${node.name} (${node.id})`;
    if (node.skills?.length) line += ` 技能: ${node.skills.join(", ")}`;
    if (node.parent) line += ` 上级: ${node.parent}`;
    lines.push(line);
  }

  return lines.join("\n");
}
