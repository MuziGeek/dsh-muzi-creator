import { useEffect, useState } from "react";
import { IconFolderOpenOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";

import type { KnowledgePageSummary, KnowledgeStatus } from "../../muziTypes.ts";
import type { MuziViewFace } from "../face.ts";
import { setSelectedContentId } from "../contentSelection.ts";
import { PanelSectionHeader } from "./PanelSectionHeader.tsx";
import "./MuziPanels.css";

function knowledgeSelection(locator: string): string {
  return `knowledge:${locator}`;
}

const KNOWLEDGE_CATEGORIES = ["entities", "topics", "sources", "comparisons", "synthesis", "queries"] as const;

export function KnowledgePanel({ face, onAddDirectory }: { face: MuziViewFace; onAddDirectory: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [items, setItems] = useState<KnowledgePageSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setError(null);
    try {
      const result = await face.searchKnowledge(query, category === "" ? undefined : category);
      setStatus(result.status);
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "知识库读取失败");
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 180);
    return () => { window.clearTimeout(timer); };
  }, [query, category]);

  return (
    <div className="muziPanel">
      <PanelSectionHeader
        label="知识目录"
        query={query}
        searchLabel="搜索知识"
        searchPlaceholder="搜索正式 Wiki…"
        addLabel="通过会话新增知识目录"
        viewLabel="知识视图选项"
        onQueryChange={setQuery}
        onAdd={onAddDirectory}
        onRefresh={() => { void load(); }}
        viewContent={(
          <label className="muziViewSelect">
            <span>展示目录</span>
            <select value={category} onChange={(event) => { setCategory(event.target.value); }}>
              <option value="">全部目录</option>
              {KNOWLEDGE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
      />
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
            <span className="muziListIcon knowledge"><IconFolderOpenOutline16 size={18} /></span>
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
