import { useEffect, useState } from "react";

import type { KnowledgePageSummary, KnowledgeStatus } from "../../muziTypes.ts";
import type { MuziViewFace } from "../face.ts";
import { setSelectedContentId } from "../contentSelection.ts";
import "./MuziPanels.css";

function knowledgeSelection(locator: string): string {
  return `knowledge:${locator}`;
}
export function KnowledgePanel({ face }: { face: MuziViewFace }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [items, setItems] = useState<KnowledgePageSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setError(null);
    try {
      const result = await face.searchKnowledge(query);
      setStatus(result.status);
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "知识库读取失败");
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 180);
    return () => { window.clearTimeout(timer); };
  }, [query]);

  return (
    <div className="muziPanel">
      <div className="muziPanelToolbar">
        <input aria-label="搜索知识" value={query} placeholder="搜索正式 Wiki" onChange={(event) => { setQuery(event.target.value); }} />
        <button type="button" aria-label="刷新知识" onClick={() => { void load(); }}>↻</button>
      </div>
      {status !== null && (
        <div className="knowledgeBaseline">
          <strong>{status.formalPageCount} 篇正式知识</strong>
          <span>{status.rawMarkdownCount} 份待消化 Markdown · {status.rawFileCount} 个原始文件</span>
          {status.formalPageCount === 0 && <em>原始素材不会进入搜索，请先在会话中使用 llm-wiki 消化。</em>}
        </div>
      )}
      <div className="muziPanelList">
        {error !== null && <div className="muziEmpty error">{error}</div>}
        {error === null && status?.status === "unavailable" && <div className="muziEmpty error">{status.message ?? "知识库不可用"}</div>}
        {error === null && status?.formalPageCount === 0 && <div className="muziEmpty">当前没有正式 Wiki 页面。</div>}
        {items.map((item) => (
          <button type="button" key={item.id} className="muziListRow" onClick={() => { setSelectedContentId(knowledgeSelection(item.locator)); }}>
            <span className="muziListIcon knowledge">知</span>
            <span className="muziListBody">
              <span className="muziListTitle">{item.title}</span>
              <span className="muziListMeta">{item.category}</span>
              <span className="muziListSummary">{item.excerpt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
