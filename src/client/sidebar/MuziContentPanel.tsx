import { DeleteCardButton } from "../DeleteCardButton.tsx";
import { useEffect, useState } from "react";
import type { MuziViewFace } from "../face.ts";
import { MuziProjectCover } from "../MuziProjectCover.tsx";
import { bumpLibrary, getContentSelection, useLibraryEpoch, useSelectedContentId } from "../contentSelection.ts";
import { PanelSectionHeader } from "./PanelSectionHeader.tsx";
import {
  IslandCheckbox,
  IslandSelectableCard,
  IslandSkeleton,
  IslandState,
  IslandTag,
} from "../ui/IslandControls.tsx";
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { sidebarItemElementId } from "../workbench/sidebarLayoutBridge.ts";
import "./MuziPanels.css";

const DOC_LABELS = { mother: "母内容", video: "视频稿", wechat: "公众号", xiaohongshu: "小红书", blog: "博客" } as const;
const STAGE_LABELS = { idea: "灵感", research: "研究中", mother_draft: "母内容草稿", adaptation: "渠道改编", review: "审阅中", ready: "已就绪", archived: "已归档" } as const;

function statusCount(project: Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"][number]): { ready: number; published: number } {
  const ready = Object.values(project.documents).filter((item) => item.status === "ready").length;
  const published = Object.values(project.publications).filter((item) => item.status === "published").length;
  return { ready, published };
}

export function MuziContentPanel({ face, resource, t }: { t?: (key: string) => string; face: MuziViewFace; resource: ReadonlyResource<Awaited<ReturnType<MuziViewFace["listProjects"]>>> }) {
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();

  const load = async (force = false): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = query.trim() === "" && !includeArchived
        ? await resource.load(force)
        : await face.listProjects(query, includeArchived);
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "内容读取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(epoch > 0); }, 180);
    return () => { window.clearTimeout(timer); };
  }, [query, includeArchived, epoch]);

  return (
    <div className="muziPanel">
      <PanelSectionHeader
        label="创作项目"
        query={query}
        searchLabel="搜索内容"
        searchName="content-search"
        searchPlaceholder="搜索内容…"
        viewLabel="内容视图选项"
        onQueryChange={setQuery}
        onRefresh={() => { void load(true); }}
        viewContent={(
          <IslandCheckbox
            className="muziViewToggle"
            size="small"
            options={[{ label: "显示归档目录", value: "archived" }]}
            value={includeArchived ? ["archived"] : []}
            onChange={(values: Array<string | number>) => { setIncludeArchived(values.includes("archived")); }}
          />
        )}
      />
      <div className="muziPanelList">
        {loading && items.length === 0 && <div className="muziCardSkeletons" aria-label="正在读取内容">{[0, 1, 2].map((key) => <IslandSkeleton key={key} variant="rect" widthValue="100%" heightValue={88} />)}</div>}
        {error !== null && <IslandState kind="error" title="内容读取失败" message={error} />}
        {!loading && error === null && items.length === 0 && <IslandState kind="empty" title="还没有创作项目" message="可通过会话创建内容，创建后会显示在这里。" />}
        {items.map((item) => {
          const counts = statusCount(item);
          const selected = selectedId === item.id;
          const toggleSelection = (): void => { setSelectedId(item.id); };
          return (
            <div className="cardWithActions" key={item.id}>
            <IslandSelectableCard
              id={sidebarItemElementId("content", item.id)}
              className={selected ? "muziListRow muziContentRow selected" : "muziListRow muziContentRow"}
              selected={selected}
              onSelect={toggleSelection}
            >
              <MuziProjectCover id={item.id} title={item.title} revision={item.coverRevision} load={face.getProjectCover} className="muziContentCover" />
              <span className="muziListBody">
                <span className="muziListHeading">
                  <span className="muziListTitle">{item.title}</span>
                </span>
                <span className="muziListMeta">
                  <IslandTag className="muziCardTag" size="small" color={selected ? "app-teal" : "brown"} variant="soft">{STAGE_LABELS[item.stage]}</IslandTag>
                  <span className="muziCardMetaText">主稿 {DOC_LABELS[item.primaryDocument]}</span>
                </span>
                <span className="muziListSummary muziProgressSummary">
                  <span><strong>{counts.ready}</strong>/5 稿件</span>
                  <span><strong>{counts.published}</strong>/5 发布</span>
                </span>
              </span>
            </IslandSelectableCard>
            <DeleteCardButton title={item.title} t={t} onDelete={async () => {
              await face.deleteProject(item.id, item.revision);
              setItems((current) => current.filter((project) => project.id !== item.id));
              if (getContentSelection() === item.id) setSelectedId(null);
              await resource.refreshAfterMutation();
              bumpLibrary();
            }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
