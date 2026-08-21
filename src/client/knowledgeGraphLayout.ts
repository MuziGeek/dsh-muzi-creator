import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../muziTypes.ts";

export interface KnowledgeGraphView {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

const CATEGORY_PRIORITY: Record<KnowledgeGraphNode["category"], number> = {
  topics: 0,
  synthesis: 1,
  comparisons: 2,
  queries: 3,
  entities: 4,
  sources: 5,
};

function adjacencyOf(edges: readonly KnowledgeGraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    const source = adjacency.get(edge.sourceId) ?? new Set<string>();
    const target = adjacency.get(edge.targetId) ?? new Set<string>();
    source.add(edge.targetId);
    target.add(edge.sourceId);
    adjacency.set(edge.sourceId, source);
    adjacency.set(edge.targetId, target);
  }
  return adjacency;
}

/** Selects the progressive topic-centered subset displayed by the star map. */
export function selectKnowledgeGraph(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  expandedTopicId: string | null,
): KnowledgeGraphView {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topics = nodes.filter((node) => node.category === "topics")
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  if (topics.length === 0) return { nodes: [], edges: [] };
  const adjacency = adjacencyOf(edges);
  const topicIds = new Set(topics.map((topic) => topic.id));
  const bridgeCount = (nodeId: string): number => [...(adjacency.get(nodeId) ?? [])]
    .filter((neighborId) => topicIds.has(neighborId)).length;
  const compare = (left: KnowledgeGraphNode, right: KnowledgeGraphNode): number =>
    bridgeCount(right.id) - bridgeCount(left.id)
    || right.degree - left.degree
    || CATEGORY_PRIORITY[left.category] - CATEGORY_PRIORITY[right.category]
    || left.title.localeCompare(right.title, "zh-CN");
  const visible = new Set(topicIds);
  for (const topic of topics) {
    const neighbors = [...(adjacency.get(topic.id) ?? [])]
      .map((id) => nodeById.get(id))
      .filter((node): node is KnowledgeGraphNode => node !== undefined && node.category !== "topics")
      .sort(compare);
    const limit = topic.id === expandedTopicId ? neighbors.length : 12;
    for (const neighbor of neighbors.slice(0, limit)) visible.add(neighbor.id);
  }
  return {
    nodes: nodes.filter((node) => visible.has(node.id)),
    edges: edges.filter((edge) => visible.has(edge.sourceId) && visible.has(edge.targetId)),
  };
}
