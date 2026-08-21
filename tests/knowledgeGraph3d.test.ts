import { describe, expect, it } from "vitest";

import {
  createKnowledgeGraphVisualData,
  graphEndpointId,
  pinKnowledgeGraphNode,
  resolveKnowledgeGraphMotion,
} from "../src/client/knowledgeGraph3d.ts";
import type { KnowledgeGraphView } from "../src/client/knowledgeGraphLayout.ts";

const view: KnowledgeGraphView = {
  nodes: [
    { id: "kw_topic0000000000000000000", locator: "atlas://wiki/topics/topic.md", title: "主题", category: "topics", degree: 1 },
    { id: "kw_entity000000000000000000", locator: "atlas://wiki/entities/entity.md", title: "实体", category: "entities", degree: 1 },
  ],
  edges: [
    { id: "ke_edge00000000000000000000", sourceId: "kw_topic0000000000000000000", targetId: "kw_entity000000000000000000" },
  ],
};

describe("3D knowledge graph adapter", () => {
  it("copies the read-only preview before adding mutable force coordinates", () => {
    const before = JSON.stringify(view);
    const data = createKnowledgeGraphVisualData(view);
    data.nodes[0]!.x = 20;
    data.links[0]!.source = data.nodes[0]!;
    expect(JSON.stringify(view)).toBe(before);
    expect(data.nodes[0]!.val).toBe(12);
    expect(graphEndpointId(data.links[0]!.source)).toBe(view.nodes[0]!.id);
  });

  it("pins only nodes with complete 3D coordinates", () => {
    const [node] = createKnowledgeGraphVisualData(view).nodes;
    node!.x = 1;
    node!.y = 2;
    pinKnowledgeGraphNode(node!);
    expect(node).not.toHaveProperty("fx");
    node!.z = 3;
    pinKnowledgeGraphNode(node!);
    expect(node).toMatchObject({ fx: 1, fy: 2, fz: 3 });
  });

  it("uses a bounded motion budget and a static reduced-motion mode", () => {
    expect(resolveKnowledgeGraphMotion(false)).toEqual({ warmupTicks: 18, cooldownTicks: 120, cooldownTime: 3_000, cameraTransitionMs: 420 });
    expect(resolveKnowledgeGraphMotion(true)).toEqual({ warmupTicks: 80, cooldownTicks: 0, cooldownTime: 0, cameraTransitionMs: 0 });
  });
});
