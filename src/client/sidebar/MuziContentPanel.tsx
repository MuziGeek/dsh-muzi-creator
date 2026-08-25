import { useEffect, useState, type KeyboardEvent } from "react";
import { Card, Checkbox, Skeleton, Tag } from "animal-island-ui";
import type { MuziPrimaryDocument } from "../../muziTypes.ts";
import type { MuziViewFace } from "../face.ts";
import { MuziProjectCover } from "../MuziProjectCover.tsx";
import { bumpLibrary, useLibraryEpoch, useSelectedContentId } from "../contentSelection.ts";
import { CreateProjectDialog } from "./CreateProjectDialog.tsx";
import { PanelSectionHeader } from "./PanelSectionHeader.tsx";
import "./MuziPanels.css";

const DOC_LABELS = { mother: "母内容", video: "视频稿", wechat: "公众号", xiaohongshu: "小红书", blog: "博客" } as const;
const STAGE_LABELS = { idea: "灵感", research: "研究中", mother_draft: "母内容草稿", adaptation: "渠道改编", review: "审阅中", ready: "已就绪", archived: "已归档" } as const;

function statusCount(project: Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"][number]): { ready: number; published: number } {
  const ready = Object.values(project.documents).filter((item) => item.status === "ready").length;
  const published = Object.values(project.publications).filter((item) => item.status === "published").length;
  return { ready, published };
}

export function MuziContentPanel({ face }: { face: MuziViewFace }) {
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createDraft, setCreateDraft] = useState<{ title: string; primary: MuziPrimaryDocument } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await face.listProjects(query, includeArchived);
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "内容读取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 180);
    return () => { window.clearTimeout(timer); };
  }, [query, includeArchived, epoch]);

  const create = async (): Promise<void> => {
    if (createDraft === null || createDraft.title.trim() === "") return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await face.createProject(createDraft.title.trim(), createDraft.primary);
      bumpLibrary();
      setSelectedId(created.id);
      setCreateDraft(null);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "无法创建内容");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="muziPanel">
      <PanelSectionHeader
        label="创作项目"
        count={items.length}
        query={query}
        searchLabel="搜索内容"
        searchName="content-search"
        searchPlaceholder="搜索内容…"
        addLabel="新增内容目录"
        viewLabel="内容视图选项"
        onQueryChange={setQuery}
        onAdd={() => { setCreateError(null); setCreateDraft({ title: "", primary: "mother" }); }}
        onRefresh={() => { void load(); }}
        viewContent={(
          <Checkbox
            className="muziViewToggle"
            size="small"
            options={[{ label: "显示归档目录", value: "archived" }]}
            value={includeArchived ? ["archived"] : []}
            onChange={(values: Array<string | number>) => { setIncludeArchived(values.includes("archived")); }}
          />
        )}
      />
      <div className="muziPanelList">
        {loading && items.length === 0 && <div className="muziCardSkeletons" aria-label="正在读取内容">{[0, 1, 2].map((key) => <Skeleton key={key} variant="rect" widthValue="100%" heightValue={88} />)}</div>}
        {error !== null && <Card type="dashed" className="muziPanelState error" role="alert"><strong>内容读取失败</strong><p>{error}</p></Card>}
        {!loading && error === null && items.length === 0 && <Card type="dashed" className="muziPanelState"><strong>还没有创作项目</strong><p>使用右上角的新增按钮建立第一个内容目录。</p></Card>}
        {items.map((item) => {
          const counts = statusCount(item);
          const selected = selectedId === item.id;
          const toggleSelection = (): void => { setSelectedId(selected ? null : item.id); };
          return (
            <Card
              key={item.id}
              className={selected ? "muziListRow muziContentRow selected" : "muziListRow muziContentRow"}
              color="default"
              pattern={selected ? "app-teal" : "default"}
              hoverable
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={toggleSelection}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                toggleSelection();
              }}
            >
              <MuziProjectCover id={item.id} title={item.title} revision={item.coverRevision} load={face.getProjectCover} className="muziContentCover" />
              <span className="muziListBody">
                <span className="muziListHeading">
                  <span className="muziListTitle">{item.title}</span>
                </span>
                <span className="muziListMeta">
                  <Tag className="muziCardTag" size="small" color={selected ? "app-teal" : "default"} variant={selected ? "solid" : "soft"}>{STAGE_LABELS[item.stage]}</Tag>
                  <span className="muziCardMetaText">主稿 {DOC_LABELS[item.primaryDocument]}</span>
                </span>
                <span className="muziListSummary muziProgressSummary">
                  <span><strong>{counts.ready}</strong>/5 稿件</span>
                  <span><strong>{counts.published}</strong>/5 发布</span>
                </span>
              </span>
            </Card>
          );
        })}
      </div>
      {createDraft !== null && (
        <CreateProjectDialog
          title={createDraft.title}
          primary={createDraft.primary}
          submitting={creating}
          error={createError}
          onTitleChange={(title) => { setCreateDraft((draft) => draft === null ? null : { ...draft, title }); }}
          onPrimaryChange={(primary) => { setCreateDraft((draft) => draft === null ? null : { ...draft, primary }); }}
          onCancel={() => { if (!creating) setCreateDraft(null); }}
          onSubmit={() => { void create(); }}
        />
      )}
    </div>
  );
}
