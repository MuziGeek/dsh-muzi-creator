import { useMemo, useState } from "react";
import { IconRefreshOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";

import type { KnowledgeCategory, KnowledgeGraphNode, KnowledgePreviewResult } from "../muziTypes.ts";
import { setSelectedContentId } from "./contentSelection.ts";
import { layoutKnowledgeGraph, selectKnowledgeGraph } from "./knowledgeGraphLayout.ts";
import "./KnowledgePreview.css";

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  topics: "主题",
  entities: "实体",
  sources: "来源",
  synthesis: "综合",
  comparisons: "比较",
  queries: "问题",
};

export function KnowledgePreview({ result, onRefresh }: { result: KnowledgePreviewResult; onRefresh: () => Promise<void> }) {
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const view = useMemo(
    () => selectKnowledgeGraph(result.nodes, result.edges, expandedTopicId),
    [result, expandedTopicId],
  );
  const positions = useMemo(() => layoutKnowledgeGraph(view), [view]);
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
  const stats = [
    ["正式知识", result.stats.formal.toString()],
    ["主题", result.stats.topics.toString()],
    ["实体", result.stats.entities.toString()],
    ["来源", result.stats.sources.toString()],
    ["专题分析", result.stats.analyses.toString()],
    ["待消化素材", result.stats.pendingMarkdown.toString()],
  ] as const;

  const activate = (node: KnowledgeGraphNode): void => {
    setSelectedId(node.id);
    if (node.category === "topics") setExpandedTopicId((current) => current === node.id ? null : node.id);
  };

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefresh();
      setSelectedId(null);
      setExpandedTopicId(null);
      setZoom(1);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="knowledgePreview">
      <section className="knowledgeMetrics" aria-label="知识库统计">
        {stats.map(([label, value]) => (
          <div key={label}><strong>{value}</strong><span>{label}</span>{label === "待消化素材" && <small>原始文件 {result.stats.rawFiles}</small>}</div>
        ))}
      </section>
      <section className="knowledgeGraphSection">
        <div className="knowledgeGraphHeading">
          <div><h3>知识星图</h3><p>仅展示正式 Wiki 中可唯一解析的显式链接</p></div>
          <div className="knowledgeGraphControls" aria-label="星图控制">
            <button type="button" aria-label="缩小" onClick={() => { setZoom((value) => Math.max(.65, value - .15)); }}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="放大" onClick={() => { setZoom((value) => Math.min(1.7, value + .15)); }}>＋</button>
            <button type="button" aria-label="适应视图" onClick={() => { setZoom(1); }}>适应</button>
            <button type="button" aria-label="刷新星图" disabled={refreshing} onClick={() => { void refresh(); }}><IconRefreshOutline16 size={15} /></button>
          </div>
        </div>
        <div className="knowledgeGraphLegend" aria-label="星图图例">
          {(["topics", "entities", "sources", "synthesis", "comparisons", "queries"] as KnowledgeCategory[]).map((category) => (
            <span key={category}><i className={category} />{CATEGORY_LABELS[category]}</span>
          ))}
        </div>
        {result.truncated && <div className="knowledgeGraphNotice">星图已按连接度精简，统计仍来自完整快照。</div>}
        {result.status.status !== "ready" ? (
          <div className="knowledgeGraphEmpty">{result.status.message ?? "知识库当前不可用"}</div>
        ) : result.stats.topics === 0 ? (
          <div className="knowledgeGraphEmpty">暂无主题知识，因此不绘制实体星图。</div>
        ) : (
          <div className="knowledgeGraphCanvas">
            <svg viewBox="0 0 1000 600" role="img" aria-label="主题中心知识星图">
              <g transform={`translate(500 300) scale(${zoom}) translate(-500 -300)`}>
                {view.edges.map((edge) => {
                  const source = positions.get(edge.sourceId);
                  const target = positions.get(edge.targetId);
                  if (source === undefined || target === undefined) return null;
                  const highlighted = selectedId === null || (adjacent.has(edge.sourceId) && adjacent.has(edge.targetId));
                  return <line key={edge.id} className={highlighted ? "graphEdge highlighted" : "graphEdge muted"} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
                })}
                {view.nodes.map((node) => {
                  const point = positions.get(node.id);
                  if (point === undefined) return null;
                  const topic = node.category === "topics";
                  const muted = selectedId !== null && !adjacent.has(node.id);
                  return (
                    <g
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${CATEGORY_LABELS[node.category]}：${node.title}，${node.degree} 条关联`}
                      className={`graphNode ${node.category}${muted ? " muted" : ""}${selectedId === node.id ? " selected" : ""}`}
                      transform={`translate(${point.x} ${point.y})`}
                      onClick={() => { activate(node); }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        activate(node);
                      }}
                    >
                      <title>{node.title}</title>
                      <circle r={topic ? 29 : 12} />
                      <text y={topic ? 45 : 27} textAnchor="middle">{node.title.length > (topic ? 16 : 10) ? `${node.title.slice(0, topic ? 15 : 9)}…` : node.title}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}
        {selected !== null && (
          <div className="knowledgeNodeDetail">
            <div><strong>{selected.title}</strong><span>{CATEGORY_LABELS[selected.category]} · {selected.degree} 条关联</span></div>
            {selected.category === "topics" && <small>{expandedTopicId === selected.id ? "已展开全部直接关联，再次点击主题可收起。" : "点击主题可展开全部直接关联。"}</small>}
            <button type="button" onClick={() => { setSelectedContentId(`knowledge:${selected.locator}`); }}>打开知识</button>
          </div>
        )}
      </section>
    </div>
  );
}
