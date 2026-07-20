// 组织拓扑类型

export type NodeType = "root" | "group" | "leaf";

export interface OrgNode {
  id: string;
  type: NodeType;
  name: string;
  parent?: string;
  skills?: string[];
  workspace?: string;
}

export interface OrgGraph {
  version: string;
  nodes: OrgNode[];
}

/** 根据 ID 查找节点 */
export function findNode(graph: OrgGraph, id: string): OrgNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** 查找某人的所有子节点 */
export function findChildren(graph: OrgGraph, parentId: string): OrgNode[] {
  return graph.nodes.filter((n) => n.parent === parentId);
}

/** 根据技能查找匹配的节点 */
export function findBySkill(graph: OrgGraph, skill: string): OrgNode[] {
  return graph.nodes.filter((n) => n.skills?.some((s) =>
    s.toLowerCase().includes(skill.toLowerCase()),
  ));
}
