import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../muziTypes.ts";

export interface KnowledgeGraphView {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface KnowledgeGraphPoint {
  x: number;
  y: number;
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

function hashSeed(value: string): number {
  let seed = 0;
  for (const char of value) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return seed;
}

/** Places topics on stable anchors and their satellites on deterministic rings. */
export function layoutKnowledgeGraph(view: KnowledgeGraphView): Map<string, KnowledgeGraphPoint> {
  const positions = new Map<string, KnowledgeGraphPoint>();
  const topics = view.nodes.filter((node) => node.category === "topics")
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  if (topics.length === 0) return positions;
  const columns = Math.min(3, topics.length);
  const rows = Math.ceil(topics.length / columns);
  topics.forEach((topic, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(topic.id, {
      x: 180 + (columns === 1 ? 320 : column * (640 / (columns - 1))),
      y: rows === 1 ? 300 : 170 + row * (260 / Math.max(1, rows - 1)),
    });
  });

  const adjacency = adjacencyOf(view.edges);
  const satellites = view.nodes.filter((node) => node.category !== "topics");
  const grouped = new Map<string, KnowledgeGraphNode[]>();
  for (const satellite of satellites) {
    const connectedTopics = [...(adjacency.get(satellite.id) ?? [])]
      .map((id) => topics.find((topic) => topic.id === id))
      .filter((topic): topic is KnowledgeGraphNode => topic !== undefined);
    if (connectedTopics.length > 1) {
      const anchors = connectedTopics.map((topic) => positions.get(topic.id)!);
      const seed = hashSeed(satellite.id);
      positions.set(satellite.id, {
        x: anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length + (seed % 31) - 15,
        y: anchors.reduce((sum, point) => sum + point.y, 0) / anchors.length + ((seed >>> 5) % 31) - 15,
      });
      continue;
    }
    const owner = connectedTopics[0]?.id ?? topics[hashSeed(satellite.id) % topics.length]!.id;
    grouped.set(owner, [...(grouped.get(owner) ?? []), satellite]);
  }
  for (const [topicId, group] of grouped) {
    const center = positions.get(topicId)!;
    group.sort((left, right) => right.degree - left.degree || left.title.localeCompare(right.title, "zh-CN"));
    group.forEach((node, index) => {
      const ring = Math.floor(index / 10);
      const slot = index % 10;
      const count = Math.min(10, group.length - ring * 10);
      const angle = (Math.PI * 2 * slot) / count - Math.PI / 2;
      const radius = 96 + ring * 48;
      positions.set(node.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    });
  }
  return positions;
}
