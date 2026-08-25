import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconRefreshOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import SpriteText from "three-spritetext";

import type { KnowledgeCategory, KnowledgePreviewResult } from "../muziTypes.ts";
import { setSelectedContentId } from "./contentSelection.ts";
import {
  createKnowledgeGraphVisualData,
  graphEndpointId,
  pinKnowledgeGraphNode,
  resolveKnowledgeGraphMotion,
  type KnowledgeGraphVisualLink,
  type KnowledgeGraphVisualLinkData,
  type KnowledgeGraphVisualNode,
  type KnowledgeGraphVisualNodeData,
} from "./knowledgeGraph3d.ts";
import { selectKnowledgeGraph } from "./knowledgeGraphLayout.ts";
import "./KnowledgePreview.css";

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  topics: "主题",
  entities: "实体",
  sources: "来源",
  synthesis: "综合",
  comparisons: "比较",
  queries: "问题",
};

const FALLBACK_CATEGORY_COLORS: Record<KnowledgeCategory, string> = {
  topics: "#81967d",
  entities: "#c49a78",
  sources: "#9c9a91",
  synthesis: "#a58aab",
  comparisons: "#b48772",
  queries: "#7f9ca2",
};

interface GraphPalette {
  background: string;
  label: string;
  labelBackground: string;
  mutedNode: string;
  link: string;
  linkMuted: string;
  categories: Record<KnowledgeCategory, string>;
}

const FALLBACK_PALETTE: GraphPalette = {
  background: "#fbfaf7",
  label: "#403b35",
  labelBackground: "#fbfaf7",
  mutedNode: "#d8d3ca",
  link: "#aca99f",
  linkMuted: "#e1ddd5",
  categories: FALLBACK_CATEGORY_COLORS,
};

interface GraphSize {
  width: number;
  height: number;
}

interface TrackballControls {
  minDistance: number;
  maxDistance: number;
  staticMoving: boolean;
  dynamicDampingFactor: number;
  update?: () => void;
}

function useGraphSize(containerRef: React.RefObject<HTMLDivElement>): GraphSize {
  const [size, setSize] = useState<GraphSize>({ width: 0, height: 430 });
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    const update = (width: number, height: number): void => {
      setSize({ width: Math.max(1, Math.round(width)), height: Math.max(360, Math.round(height)) });
    };
    update(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [containerRef]);
  return size;
}

function useGraphPalette(containerRef: React.RefObject<HTMLDivElement>): GraphPalette {
  const [palette, setPalette] = useState(FALLBACK_PALETTE);
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    const style = window.getComputedStyle(element);
    const value = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
    setPalette({
      background: style.backgroundColor || FALLBACK_PALETTE.background,
      label: style.color || FALLBACK_PALETTE.label,
      labelBackground: style.backgroundColor || FALLBACK_PALETTE.labelBackground,
      mutedNode: value("--muzi-surface-muted", FALLBACK_PALETTE.mutedNode),
      link: value("--muzi-graph-link", FALLBACK_PALETTE.link),
      linkMuted: value("--muzi-graph-link-muted", FALLBACK_PALETTE.linkMuted),
      categories: {
        topics: value("--muzi-graph-topic", FALLBACK_CATEGORY_COLORS.topics),
        entities: value("--muzi-graph-entity", FALLBACK_CATEGORY_COLORS.entities),
        sources: value("--muzi-graph-source", FALLBACK_CATEGORY_COLORS.sources),
        synthesis: value("--muzi-graph-synthesis", FALLBACK_CATEGORY_COLORS.synthesis),
        comparisons: value("--muzi-graph-comparison", FALLBACK_CATEGORY_COLORS.comparisons),
        queries: value("--muzi-graph-query", FALLBACK_CATEGORY_COLORS.queries),
      },
    });
  }, [containerRef]);
  return palette;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => { setReduced(query.matches); };
    update();
    query.addEventListener("change", update);
    return () => { query.removeEventListener("change", update); };
  }, []);
  return reduced;
}

/** Checks whether this browser can create the WebGL context required by the 3D renderer. */
export function supportsKnowledgeGraphWebGL(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined" || window.WebGLRenderingContext === undefined) return false;
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
  } catch (error) {
    void error;
    return false;
  }
}

function createTopicLabel(node: KnowledgeGraphVisualNode, palette: GraphPalette): SpriteText {
  const label = new SpriteText(node.category === "topics" ? node.title : "");
  label.visible = node.category === "topics";
  label.color = palette.label;
  label.backgroundColor = palette.labelBackground;
  label.padding = [2.2, 1.35];
  label.borderRadius = 3;
  label.textHeight = 5.4;
  label.fontWeight = "600";
  label.center.y = -0.8;
  return label;
}

function visibleEndpointIds(link: KnowledgeGraphVisualLink): readonly [string | null, string | null] {
  return [graphEndpointId(link.source), graphEndpointId(link.target)];
}

export function KnowledgePreview({ result, onRefresh }: { result: KnowledgePreviewResult; onRefresh: () => Promise<void> }) {
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);
  const [webGlSupported] = useState(supportsKnowledgeGraphWebGL);
  const graphRef = useRef<ForceGraphMethods<KnowledgeGraphVisualNodeData, KnowledgeGraphVisualLinkData>>();
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const fittedGraphRef = useRef<unknown>(null);
  const reducedMotion = useReducedMotion();
  const motion = resolveKnowledgeGraphMotion(reducedMotion);
  const size = useGraphSize(graphContainerRef);
  const palette = useGraphPalette(graphContainerRef);
  const view = useMemo(
    () => selectKnowledgeGraph(result.nodes, result.edges, expandedTopicId),
    [result, expandedTopicId],
  );
  const graphData = useMemo(() => createKnowledgeGraphVisualData(view), [view]);
  const nodeById = useMemo(() => new Map(view.nodes.map((node) => [node.id, node])), [view.nodes]);
  const adjacent = useMemo(() => {
    const ids = new Set<string>();
    if (selectedId === null) return ids;
    ids.add(selectedId);
    for (const edge of view.edges) {
      if (edge.sourceId === selectedId) ids.add(edge.targetId);
      if (edge.targetId === selectedId) ids.add(edge.sourceId);
    }
    return ids;
  }, [selectedId, view.edges]);
  const selected = selectedId === null ? null : nodeById.get(selectedId) ?? null;
  const breakdown = [
    ["主题", result.stats.topics.toString()],
    ["实体", result.stats.entities.toString()],
    ["来源", result.stats.sources.toString()],
    ["专题分析", result.stats.analyses.toString()],
  ] as const;

  useEffect(() => {
    fittedGraphRef.current = null;
  }, [graphData]);

  useEffect(() => {
    if (!webGlSupported || size.width === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const controls = graphRef.current?.controls() as TrackballControls | undefined;
      if (controls === undefined) return;
      controls.minDistance = 45;
      controls.maxDistance = 1_200;
      controls.staticMoving = reducedMotion;
      controls.dynamicDampingFactor = .15;
      controls.update?.();
    });
    return () => { window.cancelAnimationFrame(frame); };
  }, [reducedMotion, size.width, webGlSupported]);

  const focusNode = useCallback((node: KnowledgeGraphVisualNode): void => {
    if (node.x === undefined || node.y === undefined || node.z === undefined) return;
    const length = Math.hypot(node.x, node.y, node.z);
    const distance = 72;
    const camera = length < 1
      ? { x: node.x, y: node.y, z: node.z + distance }
      : { x: node.x * (1 + distance / length), y: node.y * (1 + distance / length), z: node.z * (1 + distance / length) };
    graphRef.current?.cameraPosition(camera, { x: node.x, y: node.y, z: node.z }, motion.cameraTransitionMs);
  }, [motion.cameraTransitionMs]);

  const activate = useCallback((node: KnowledgeGraphVisualNode): void => {
    setSelectedId(node.id === undefined ? null : String(node.id));
    if (node.category === "topics") {
      const id = String(node.id);
      setExpandedTopicId((current) => current === id ? null : id);
    }
    focusNode(node);
  }, [focusNode]);

  const fitGraph = useCallback((): void => {
    graphRef.current?.zoomToFit(reducedMotion ? 0 : 450, 42);
  }, [reducedMotion]);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefresh();
      setSelectedId(null);
      setExpandedTopicId(null);
      setGraphVersion((version) => version + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const moveKeyboardSelection = (offset: number): void => {
    if (graphData.nodes.length === 0) return;
    const current = graphData.nodes.findIndex((node) => String(node.id) === selectedId);
    const nextIndex = (current + offset + graphData.nodes.length) % graphData.nodes.length;
    const next = graphData.nodes[nextIndex];
    if (next === undefined) return;
    setSelectedId(String(next.id));
    focusNode(next);
  };

  return (
    <div className="knowledgePreview">
      <section className="knowledgeSummary" aria-labelledby="knowledge-summary-title">
        <header className="knowledgeSummaryHeader">
          <div>
            <h2 id="knowledge-summary-title">知识库概况</h2>
            <p>来自当前 Atlas 快照，整个预览保持只读</p>
          </div>
          <span className={`knowledgeHealth ${result.status.status}`}>
            <i aria-hidden="true" />
            {result.status.status === "ready" ? "数据就绪" : result.status.status === "incomplete" ? "数据不完整" : "当前不可用"}
          </span>
        </header>
        <div className="knowledgeSummaryBody">
          <div className="knowledgePrimaryMetric">
            <strong>{result.stats.formal}</strong>
            <span>正式知识</span>
            <small>可检索的结构化页面</small>
          </div>
          <div className="knowledgeSummaryDetails">
            <dl className="knowledgeBreakdown">
              {breakdown.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            <div className="knowledgeIngestMetric">
              <span>待消化素材</span>
              <strong>{result.stats.pendingMarkdown}</strong>
              <small>原始文件 {result.stats.rawFiles}</small>
            </div>
          </div>
        </div>
      </section>
      <section className={`knowledgeGraphSection${refreshing ? " refreshing" : ""}`} aria-busy={refreshing}>
        <div className="knowledgeGraphHeading">
          <div>
            <h3>知识星图</h3>
            <p>当前呈现 {view.nodes.length} 个节点 · {view.edges.length} 条关系</p>
          </div>
          <div className="knowledgeGraphControls" aria-label="星图控制">
            <button type="button" aria-label="适应视图" disabled={!webGlSupported} onClick={fitGraph}>适应视图</button>
            <button type="button" className="knowledgeRefresh" aria-label={refreshing ? "正在刷新星图" : "刷新星图"} disabled={refreshing} onClick={() => { void refresh(); }}><IconRefreshOutline16 size={15} /></button>
          </div>
        </div>
        <div className="knowledgeGraphGuide">
          <div className="knowledgeGraphLegend" aria-label="星图图例">
            {(["topics", "entities", "sources", "synthesis", "comparisons", "queries"] as KnowledgeCategory[]).map((category) => (
              <span key={category}><i className={category} />{CATEGORY_LABELS[category]}</span>
            ))}
          </div>
          <p>滚轮缩放 · 拖动画布旋转 · 拖动节点整理</p>
        </div>
        {result.truncated && <div className="knowledgeGraphNotice">星图已按连接度精简，统计仍来自完整快照。</div>}
        {result.status.status !== "ready" ? (
          <div className="knowledgeGraphEmpty">{result.status.message ?? "知识库当前不可用"}</div>
        ) : result.stats.topics === 0 ? (
          <div className="knowledgeGraphEmpty">暂无主题知识，因此不绘制实体星图。</div>
        ) : !webGlSupported ? (
          <div className="knowledgeGraphFallback">
            <p>当前浏览器无法创建 3D 星图所需的 WebGL 环境，你仍可以打开主题知识。</p>
            <div>{view.nodes.filter((node) => node.category === "topics").map((node) => <button key={node.id} type="button" onClick={() => { setSelectedContentId(`knowledge:${node.locator}`); }}>{node.title}</button>)}</div>
          </div>
        ) : (
          <div
            ref={graphContainerRef}
            className="knowledgeGraphCanvas"
            role="group"
            tabIndex={0}
            aria-label="3D 主题中心知识星图。使用方向键选择节点，回车展开主题。"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                moveKeyboardSelection(1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                moveKeyboardSelection(-1);
              } else if ((event.key === "Enter" || event.key === " ") && selectedId !== null) {
                event.preventDefault();
                const node = graphData.nodes.find((candidate) => String(candidate.id) === selectedId);
                if (node !== undefined) activate(node);
              }
            }}
          >
            {size.width > 0 && (
              <ForceGraph3D<KnowledgeGraphVisualNodeData, KnowledgeGraphVisualLinkData>
                key={graphVersion}
                ref={graphRef}
                graphData={graphData}
                width={size.width}
                height={size.height}
                backgroundColor={palette.background}
                controlType="trackball"
                showNavInfo={false}
                enableNavigationControls
                enablePointerInteraction
                enableNodeDrag
                nodeVal="val"
                nodeRelSize={3.1}
                nodeResolution={16}
                nodeOpacity={.92}
                nodeColor={(node) => selectedId === null || adjacent.has(String(node.id)) ? palette.categories[node.category] : palette.mutedNode}
                nodeLabel={(node) => `${CATEGORY_LABELS[node.category]}：${node.title}（${node.degree} 条关联）`}
                nodeThreeObject={(node) => createTopicLabel(node, palette)}
                nodeThreeObjectExtend
                linkColor={(link) => {
                  const [sourceId, targetId] = visibleEndpointIds(link);
                  return selectedId === null || (sourceId !== null && targetId !== null && adjacent.has(sourceId) && adjacent.has(targetId)) ? palette.link : palette.linkMuted;
                }}
                linkWidth={(link) => {
                  const [sourceId, targetId] = visibleEndpointIds(link);
                  return selectedId === null || (sourceId !== null && targetId !== null && adjacent.has(sourceId) && adjacent.has(targetId)) ? .7 : .18;
                }}
                linkOpacity={.4}
                warmupTicks={motion.warmupTicks}
                cooldownTicks={motion.cooldownTicks}
                cooldownTime={motion.cooldownTime}
                d3AlphaDecay={.035}
                d3VelocityDecay={.38}
                onNodeClick={activate}
                onNodeDragEnd={pinKnowledgeGraphNode}
                onBackgroundClick={() => { setSelectedId(null); }}
                onEngineStop={() => {
                  if (fittedGraphRef.current === graphData) return;
                  fittedGraphRef.current = graphData;
                  fitGraph();
                }}
              />
            )}
            {refreshing && <div className="knowledgeGraphLoading" role="status"><IconRefreshOutline16 size={16} /><span>正在刷新知识快照…</span></div>}
            <span className="knowledgeGraphAnnouncement" aria-live="polite">
              {selected === null ? "" : `${CATEGORY_LABELS[selected.category]}，${selected.title}，${selected.degree} 条关联`}
            </span>
            {selected !== null && (
              <div className="knowledgeNodeDetail">
                <div><strong>{selected.title}</strong><span>{CATEGORY_LABELS[selected.category]} · {selected.degree} 条关联</span></div>
                {selected.category === "topics" && <small>{expandedTopicId === selected.id ? "已展开全部直接关联，再次点击主题可收起。" : "点击主题可展开全部直接关联。"}</small>}
                <button type="button" onClick={() => { setSelectedContentId(`knowledge:${selected.locator}`); }}>打开知识</button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
