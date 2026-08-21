import { useEffect, useState } from "react";
import { IconFolderOpenOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";

import type {
  KnowledgePageSummary,
  KnowledgeStatus,
} from "../../muziTypes.ts";
import type { MuziViewFace } from "../face.ts";
import { setSelectedContentId } from "../contentSelection.ts";
import { PanelSectionHeader } from "./PanelSectionHeader.tsx";
import "./MuziPanels.css";

function knowledgeSelection(locator: string): string {
  return `knowledge:${locator}`;
}

function KnowledgeRow({ item }: { item: KnowledgePageSummary }) {
  return (
    <button type="button" className="muziListRow" onClick={() => { setSelectedContentId(knowledgeSelection(item.locator)); }}>
      <span className="muziListIcon knowledge"><IconFolderOpenOutline16 size={18} /></span>
      <span className="muziListBody">
        <span className="muziListTitle">{item.title}</span>
        <span className="muziListMeta">主题知识</span>
        <span className="muziListSummary">{item.excerpt}</span>
      </span>
    </button>
  );
}

export function KnowledgePanel({ face, onAddDirectory }: { face: MuziViewFace; onAddDirectory: () => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [items, setItems] = useState<KnowledgePageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setError(null);
      setLoading(true);
      const load = async (): Promise<void> => {
        if (trimmedQuery !== "") {
          const result = await face.searchKnowledge(trimmedQuery, "topics");
          if (cancelled) return;
          setStatus(result.status);
          setItems(result.items);
          return;
        }
        const result = await face.getKnowledgeHome();
        if (cancelled) return;
        setStatus(result.status);
        setItems(result.topics);
      };
      void load().catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "知识库读取失败");
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [face, trimmedQuery, refreshKey]);

  return (
    <div className="muziPanel">
      <PanelSectionHeader
        label="主题知识"
        query={query}
        searchLabel="搜索主题知识"
        searchPlaceholder="搜索主题…"
        addLabel="通过会话新增知识目录"
        previewLabel="预览知识库"
        onQueryChange={setQuery}
        onAdd={onAddDirectory}
        onPreview={() => { setSelectedContentId("knowledge-preview"); }}
        onRefresh={() => { setRefreshKey((key) => key + 1); }}
      />
      <div className="muziPanelList" aria-busy={loading}>
        {error !== null && <div className="muziEmpty error">{error}</div>}
        {error === null && status?.status === "unavailable" && <div className="muziEmpty error">{status.message ?? "知识库不可用"}</div>}
        {error === null && loading && status === null && <div className="muziEmpty">正在读取主题知识…</div>}
        {error === null && !loading && status !== null && items.length === 0 && (
          <div className="muziEmpty">{trimmedQuery === "" ? "暂无主题知识。" : `没有找到“${trimmedQuery}”相关主题。`}</div>
        )}
        {error === null && items.map((item) => <KnowledgeRow key={item.id} item={item} />)}
      </div>
    </div>
  );
}
