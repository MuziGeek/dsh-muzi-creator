import type { GraphData, LinkObject, NodeObject } from "react-force-graph-3d";

import type { KnowledgeGraphNode } from "../muziTypes.ts";
import type { KnowledgeGraphView } from "./knowledgeGraphLayout.ts";

export interface KnowledgeGraphVisualNodeData extends KnowledgeGraphNode {
  val: number;
}

export interface KnowledgeGraphVisualLinkData {
  id: string;
  sourceId: string;
  targetId: string;
}

export type KnowledgeGraphVisualNode = NodeObject<KnowledgeGraphVisualNodeData>;
export type KnowledgeGraphVisualLink = LinkObject<KnowledgeGraphVisualNodeData, KnowledgeGraphVisualLinkData>;
export type KnowledgeGraphVisualData = GraphData<KnowledgeGraphVisualNodeData, KnowledgeGraphVisualLinkData>;

export interface KnowledgeGraphMotionConfig {
  warmupTicks: number;
  cooldownTicks: number;
  cooldownTime: number;
  cameraTransitionMs: number;
}

/** Resolves a bounded simulation budget and a motion-reduced static alternative. */
export function resolveKnowledgeGraphMotion(reduced: boolean): KnowledgeGraphMotionConfig {
  return reduced
    ? { warmupTicks: 80, cooldownTicks: 0, cooldownTime: 0, cameraTransitionMs: 0 }
    : { warmupTicks: 18, cooldownTicks: 120, cooldownTime: 3_000, cameraTransitionMs: 420 };
}

/** Copies the read-only preview DTO into the mutable records required by the force engine. */
export function createKnowledgeGraphVisualData(view: KnowledgeGraphView): KnowledgeGraphVisualData {
  return {
    nodes: view.nodes.map((node) => ({
      ...node,
      val: node.category === "topics" ? 12 : Math.min(5, 2.25 + node.degree * .12),
    })),
    links: view.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
    })),
  };
}

/** Returns the stable id from an endpoint before or after the force engine resolves it. */
export function graphEndpointId(endpoint: KnowledgeGraphVisualLink["source"]): string | null {
  if (typeof endpoint === "string" || typeof endpoint === "number") return String(endpoint);
  if (endpoint !== undefined && endpoint.id !== undefined) return String(endpoint.id);
  return null;
}

/** Pins a dragged node for the lifetime of the current preview. */
export function pinKnowledgeGraphNode(node: KnowledgeGraphVisualNode): void {
  if (node.x === undefined || node.y === undefined || node.z === undefined) return;
  node.fx = node.x;
  node.fy = node.y;
  node.fz = node.z;
}
