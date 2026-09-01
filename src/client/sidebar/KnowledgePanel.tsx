import { useEffect, useState } from "react";
import { Card, Icon, Skeleton, Tag } from "animal-island-ui";

import type {
  KnowledgePageSummary,
  KnowledgeStatus,
} from "../../muziTypes.ts";
import type { MuziViewFace } from "../face.ts";
import { setSelectedContentId, useLibraryEpoch, useSelectedContentId } from "../contentSelection.ts";
import { PanelSectionHeader } from "./PanelSectionHeader.tsx";
import { IslandButton } from "../ui/IslandControls.tsx";
import "./MuziPanels.css";

function knowledgeSelection(locator: string): string {
  return `knowledge:${locator}`;
}

function knowledgeCardExcerpt(item: KnowledgePageSummary): string {
  const plain = item.excerpt
    .replace(/\r?\n+/g, " ")
    .replace(/[\*_`#>]/g, "")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain.startsWith(item.title)) return plain;
  return plain.slice(item.title.length).replace(/^[\s:：>-]+/, "").trim();
}

function KnowledgeRow({ item, selected }: { item: KnowledgePageSummary; selected: boolean }) {
  const openKnowledge = (): void => { setSelectedContentId(knowledgeSelection(item.locator)); };
  return (
    <IslandButton
      type="default"
      className={selected ? "muziListRow muziKnowledgeRow selected" : "muziListRow muziKnowledgeRow"}
      aria-pressed={selected}
      onClick={openKnowledge}
    >
      <span className="muziListIcon knowledge" aria-hidden="true"><Icon name="icon-critterpedia" size={20} /></span>
      <span className="muziListBody">
        <span className="muziListHeading">
          <span className="muziListTitle">{item.title}</span>
        </span>
        <span className="muziListMeta"><Tag className="muziCardTag" size="small" color={selected ? "app-teal" : "default"} variant={selected ? "solid" : "soft"}>主题知识</Tag></span>
        <span className="muziListSummary muziKnowledgeExcerpt">{knowledgeCardExcerpt(item) || "打开查看主题知识详情"}</span>
      </span>
    </IslandButton>
  );
}

export function KnowledgePanel({ face, onAddDirectory }: { face: MuziViewFace; onAddDirectory: () => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [items, setItems] = useState<KnowledgePageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();
  const trimmedQuery = query.trim();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setError(null);
      setLoading(true);
      const load = async (): Promise<void> => {
        const topicResult = trimmedQuery === ""
          ? await face.getKnowledgeHome().then((result) => ({ status: result.status, items: result.topics }))
          : await face.searchKnowledge(trimmedQuery, "topics");
        if (cancelled) return;
        setStatus(topicResult.status);
        setItems(topicResult.items);
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
  }, [face, trimmedQuery, refreshKey, epoch]);

  return (
    <div className="muziPanel">
      <PanelSectionHeader
        label="知识库"
        count={items.length}
        query={query}
        searchLabel="搜索知识"
        searchName="knowledge-search"
        searchPlaceholder="搜索主题知识…"
        addLabel="通过会话新增知识"
        previewLabel="预览知识库"
        onQueryChange={setQuery}
        onAdd={onAddDirectory}
        onPreview={() => { setSelectedContentId("knowledge-preview"); }}
        onRefresh={() => { setRefreshKey((key) => key + 1); }}
      />
      <div className="muziPanelList" aria-busy={loading}>
        {error !== null && <Card type="dashed" className="muziPanelState error" role="alert"><strong>知识库读取失败</strong><p>{error}</p></Card>}
        {error === null && status?.status === "unavailable" && <Card type="dashed" className="muziPanelState error" role="alert"><strong>知识库不可用</strong><p>{status.message ?? "请检查 Muzi Atlas 设置后重试。"}</p></Card>}
        {error === null && loading && status === null && <div className="muziCardSkeletons" aria-label="正在读取知识">{[0, 1, 2].map((key) => <Skeleton key={key} variant="rect" widthValue="100%" heightValue={104} />)}</div>}
        {error === null && status !== null && (
          <section className="muziKnowledgeSection" aria-labelledby="topic-knowledge-heading">
            <div className="muziBrowseHeading"><strong id="topic-knowledge-heading">主题知识</strong><Tag size="small" color="default">{items.length}</Tag></div>
            {!loading && items.length === 0
              ? <Card type="dashed" className="muziSectionEmpty">{trimmedQuery === "" ? "暂无主题知识。可通过会话使用 llm-wiki 新增。" : `没有找到“${trimmedQuery}”相关主题。`}</Card>
              : items.map((item) => <KnowledgeRow key={item.id} item={item} selected={selectedId === knowledgeSelection(item.locator)} />)}
          </section>
        )}
      </div>
    </div>
  );
}
