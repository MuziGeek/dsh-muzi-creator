import { describe, expect, it } from "vitest";

import { layoutKnowledgeGraph, selectKnowledgeGraph } from "../src/client/knowledgeGraphLayout.ts";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../src/muziTypes.ts";

function node(id: string, category: KnowledgeGraphNode["category"], degree: number): KnowledgeGraphNode {
  return { id: `kw_${id.padEnd(24, "0")}`, locator: `atlas://wiki/${category}/${id}.md`, title: id, category, degree };
}

function edge(source: KnowledgeGraphNode, target: KnowledgeGraphNode): KnowledgeGraphEdge {
  return { id: `ke_${`${source.title}${target.title}`.padEnd(24, "0").slice(0, 24)}`, sourceId: source.id, targetId: target.id };
}

describe("knowledge star map projection", () => {
  it("shows at most twelve satellites per topic until that topic is expanded", () => {
    const topic = node("topic", "topics", 15);
    const satellites = Array.from({ length: 15 }, (_, index) => node(`entity${index.toString().padStart(2, "0")}`, "entities", 15 - index));
    const edges = satellites.map((satellite) => edge(topic, satellite));
    expect(selectKnowledgeGraph([topic, ...satellites], edges, null).nodes).toHaveLength(13);
    expect(selectKnowledgeGraph([topic, ...satellites], edges, topic.id).nodes).toHaveLength(16);
  });

  it("uses stable coordinates and leaves an entity-only graph empty", () => {
    const topic = node("topic", "topics", 1);
    const entity = node("entity", "entities", 1);
    const view = selectKnowledgeGraph([topic, entity], [edge(topic, entity)], null);
    expect([...layoutKnowledgeGraph(view)]).toEqual([...layoutKnowledgeGraph(view)]);
    expect(selectKnowledgeGraph([entity], [], null)).toEqual({ nodes: [], edges: [] });
  });
});
