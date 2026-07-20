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

/** 获取父节点 */
export function getParent(graph: OrgGraph, nodeId: string): OrgNode | undefined {
  const node = findNode(graph, nodeId);
  if (!node?.parent) return undefined;
  return findNode(graph, node.parent);
}

/** 获取从根到该节点的路径 */
export function getAncestors(graph: OrgGraph, nodeId: string): OrgNode[] {
  const result: OrgNode[] = [];
  let current = findNode(graph, nodeId);
  while (current?.parent) {
    current = findNode(graph, current.parent);
    if (current) result.unshift(current);
    else break;
  }
  return result;
}

/** 获取同级节点 */
export function getSiblings(graph: OrgGraph, nodeId: string): OrgNode[] {
  const node = findNode(graph, nodeId);
  if (!node?.parent) return [];
  return graph.nodes.filter((n) => n.parent === node.parent && n.id !== nodeId);
}

/** 获取某组的所有成员（递归） */
export function getGroupMembers(graph: OrgGraph, groupId: string): OrgNode[] {
  const result: OrgNode[] = [];
  const direct = findChildren(graph, groupId);
  for (const child of direct) {
    result.push(child);
    if (child.type === "group") {
      result.push(...getGroupMembers(graph, child.id));
    }
  }
  return result;
}

/** 找节点所属的组 */
export function findGroup(graph: OrgGraph, nodeId: string): OrgNode | undefined {
  const node = findNode(graph, nodeId);
  if (!node?.parent) return undefined;
  return findNode(graph, node.parent);
}
