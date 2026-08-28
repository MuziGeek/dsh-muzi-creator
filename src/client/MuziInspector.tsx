import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Button as AnimalButton,
  Card,
  Icon,
  Tag,
  type TagColor,
} from "animal-island-ui";
import {
  IconCloseOutline16,
  MarkdownText,
  type MarkdownFileMentions,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import type {
  KnowledgePage,
  KnowledgePreviewResult,
  MuziDocumentKey,
  MuziDocumentStatus,
  MuziProjectDetail,
  MuziProjectStage,
  MuziPublicationStatus,
  MuziPublishTarget,
  PendingKnowledgeFile,
} from "../muziTypes.ts";
import type { ContentDetail } from "../types.ts";
import type { CreatorViewFace, MuziViewFace } from "./face.ts";
import {
  formatKnowledgeDate,
  knowledgeDisplayMarkdown,
  knowledgeLinkedMarkdown,
  resolveKnowledgeWikiMention,
} from "./knowledgeDisplay.ts";
import { KnowledgePreview } from "./KnowledgePreview.tsx";
import { MuziProjectCover } from "./MuziProjectCover.tsx";
import { PlatformMark, type PlatformId } from "./PlatformMark.tsx";
import {
  videoProductionProgress,
  type VideoProductionCheck,
  type VideoProductionCheckStatus,
  type VideoProductionProgress,
  type VideoProductionStageStatus,
} from "./videoProductionProgress.ts";
import {
  applyConversationInset,
  clearConversationInset,
  getInspectorWidth,
  setInspectorWidth,
  setSelectedContentId,
  useLibraryEpoch,
  useSelectedContentId,
  useSidebarChromeWidth,
} from "./contentSelection.ts";
import {
  clampInspectorPreference,
  INSPECTOR_MIN,
  resolveInspectorLayout,
} from "./inspectorLayout.ts";
import "./MuziInspector.css";

const DOCUMENTS: Array<{ key: MuziDocumentKey; label: string }> = [
  { key: "mother", label: "母内容" },
  { key: "video", label: "视频稿" },
  { key: "wechat", label: "公众号" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "blog", label: "博客" },
];
const TARGETS: Array<{ key: MuziPublishTarget; label: string; icon: PlatformId }> = [
  { key: "bilibili", label: "B站", icon: "bilibili" },
  { key: "douyin", label: "抖音", icon: "douyin" },
  { key: "wechat", label: "公众号", icon: "article" },
  { key: "xiaohongshu", label: "小红书", icon: "xhs" },
  { key: "blog", label: "博客", icon: "wechat" },
];
const STAGE_LABELS: Record<MuziProjectStage, string> = {
  idea: "灵感",
  research: "研究中",
  mother_draft: "母内容草稿",
  adaptation: "渠道改编",
  review: "审阅中",
  ready: "已就绪",
  archived: "已归档",
};
const DOCUMENT_STATUS_LABELS: Record<MuziDocumentStatus, string> = {
  not_started: "未开始",
  draft: "草稿",
  review: "审阅中",
  ready: "已就绪",
};
const PUBLICATION_STATUS_LABELS: Record<MuziPublicationStatus, string> = {
  unpublished: "未发布",
  platform_draft: "平台草稿",
  published: "已发布",
};
const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  entities: "实体",
  topics: "主题",
  sources: "来源",
  comparisons: "比较",
  synthesis: "综合",
  queries: "问题",
};
type Tab = "overview" | MuziDocumentKey | "evidence" | "production";
const DETAIL_TABS: Tab[] = ["overview", ...DOCUMENTS.map((item) => item.key), "evidence", "production"];

function statusColor(status: string): TagColor {
  if (status === "error") return "app-red";
  if (status === "review") return "app-yellow";
  if (["ready", "complete", "published", "done", "finish", "live"].includes(status)) return "app-green";
  if (["research", "mother_draft", "adaptation", "draft", "platform_draft", "record", "cut", "running", "current"].includes(status)) return "app-teal";
  return "default";
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Tag className="muziStatusBadge" size="small" variant="soft" color={statusColor(status)}>{label}</Tag>;
}

function projectCounts(project: MuziProjectDetail): { ready: number; published: number } {
  return {
    ready: Object.values(project.documents).filter((item) => item.status === "ready").length,
    published: Object.values(project.publications).filter((item) => item.status === "published").length,
  };
}

const PRODUCTION_STAGE_STATUS_LABELS: Record<VideoProductionStageStatus, string> = {
  complete: "已完成",
  current: "进行中",
  upcoming: "待处理",
  error: "需要处理",
};
const PRODUCTION_CHECK_STATUS_LABELS: Record<VideoProductionCheckStatus, string> = {
  ready: "已就绪",
  pending: "待处理",
  running: "处理中",
  error: "异常",
  optional: "可选",
};

function formatProjectDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "时间不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => typeof window === "undefined" ? 1440 : window.innerWidth);
  useEffect(() => {
    const update = (): void => { setWidth(window.innerWidth); };
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("resize", update); };
  }, []);
  return width;
}

export type MuziInspectorProps = PropsRuntime<"shell.overlay"> & {
  muziFace: MuziViewFace;
  oilFace: CreatorViewFace;
  startPendingProcessing: (file: PendingKnowledgeFile) => Promise<void>;
  startKnowledgeDiscussion: (page: KnowledgePage) => Promise<void>;
  closeDetails: () => void;
};

function isKnowledgeSelection(value: string): boolean {
  return value.startsWith("knowledge:atlas://wiki/");
}

function isKnowledgePreviewSelection(value: string): boolean {
  return value === "knowledge-preview";
}

function isPendingKnowledgeSelection(value: string): boolean {
  return value.startsWith("knowledge-pending:pk_");
}

const PENDING_STATE_LABELS: Record<PendingKnowledgeFile["state"], string> = {
  new: "首次消化",
  changed: "内容已变化",
  source_missing: "来源页缺失",
};

function PendingKnowledgeDetail({ file, onProcess }: { file: PendingKnowledgeFile; onProcess: () => void }) {
  return (
    <>
      <header className="muziInspectorHeader pendingDetailHeader">
          <div className="knowledgeDetailHeading">
            <div className="knowledgeDetailMeta">
              <Tag size="small" color="brown">{file.extension.toUpperCase()}</Tag>
              <Tag size="small" color="app-orange">{PENDING_STATE_LABELS[file.state]}</Tag>
              <time dateTime={file.updatedAt}>更新于 {formatKnowledgeDate(file.updatedAt)}</time>
            </div>
          <h1>{file.title}</h1>
          <p>{file.relativePath} · {(file.size / 1024).toFixed(file.size < 1024 ? 1 : 0)} KB · 指纹 <code>{file.sha256.slice(0, 12)}…</code></p>
        </div>
        <AnimalButton type="primary" size="middle" className="knowledgeDiscuss" icon={<Icon name="icon-diy" size={18} />} onClick={onProcess}>处理文件</AnimalButton>
      </header>
      <div className="muziMarkdown pendingPreview">
        {file.previewKind === "binary"
          ? <div className="pendingBinary"><strong>PDF 文件</strong><p>此处不解析或执行文件内容。点击“处理”后，将在新会话中通过 llm-wiki Skill 消化原始文件。</p></div>
          : <div className="muziMarkdownBody"><MarkdownText text={file.text || "（文件为空）"} /></div>}
        {file.truncated && <p className="pendingTruncated">预览已截断，处理时仍引用完整原始文件。</p>}
      </div>
    </>
  );
}

function KnowledgeDetail({ page, onDiscuss }: { page: KnowledgePage; onDiscuss: () => void }) {
  const category = KNOWLEDGE_CATEGORY_LABELS[page.category] ?? "知识";
  const markdown = knowledgeLinkedMarkdown(knowledgeDisplayMarkdown(page.markdown, page.title), page.related);
  const wikiMentions = useMemo<MarkdownFileMentions>(() => ({
    resolve: (value) => {
      const related = resolveKnowledgeWikiMention(value, page.related);
      if (related === null) return undefined;
      return {
        open: () => { setSelectedContentId(`knowledge:${related.locator}`); },
        label: `打开 Wiki 页面：${related.title}`,
        title: `跳转到 Wiki：${related.title}`,
      };
    },
  }), [page.related]);
  return (
    <>
      <header className="muziInspectorHeader knowledgeDetailHeader">
          <div className="knowledgeDetailHeading">
            <div className="knowledgeDetailMeta">
              <Tag size="small" color="app-teal">{category}</Tag>
              <time dateTime={page.updatedAt}>更新于 {formatKnowledgeDate(page.updatedAt)}</time>
            </div>
          <h1>{page.title}</h1>
          <p>内容指纹 <code>{page.sha256.slice(0, 12)}…</code></p>
        </div>
        <AnimalButton type="default" size="middle" className="knowledgeDiscuss" icon={<Icon name="icon-chat" size={18} />} onClick={onDiscuss}>
          与智能助手讨论
        </AnimalButton>
      </header>
      <div className="muziMarkdown">
        <div className="muziMarkdownBody">
          <MarkdownText text={markdown} fileMentions={wikiMentions} />
        </div>
      </div>
    </>
  );
}

export function MuziInspector({
  muziFace,
  oilFace,
  startPendingProcessing,
  startKnowledgeDiscussion,
  closeDetails,
}: MuziInspectorProps) {
  const [selectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();
  const [project, setProject] = useState<MuziProjectDetail | null>(null);
  const [productionDetail, setProductionDetail] = useState<ContentDetail | null>(null);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [page, setPage] = useState<KnowledgePage | null>(null);
  const [pending, setPending] = useState<PendingKnowledgeFile | null>(null);
  const [knowledgePreview, setKnowledgePreview] = useState<KnowledgePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const [width, setWidth] = useState(getInspectorWidth);
  const viewportWidth = useViewportWidth();
  const sidebarWidth = useSidebarChromeWidth();
  const layout = resolveInspectorLayout(viewportWidth, sidebarWidth, width);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number; latestWidth: number } | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setExpanded(true); });
    return () => { window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    setError(null);
    setProject(null);
    setProductionDetail(null);
    setProductionError(null);
    setPage(null);
    setPending(null);
    setKnowledgePreview(null);
    setTab("overview");
    const load = isKnowledgePreviewSelection(selectedId)
      ? muziFace.getKnowledgePreview().then((value) => { if (!cancelled) setKnowledgePreview(value); })
      : isPendingKnowledgeSelection(selectedId)
        ? muziFace.getPendingKnowledgeFile(selectedId.slice("knowledge-pending:".length)).then((value) => { if (!cancelled) setPending(value); })
      : isKnowledgeSelection(selectedId)
        ? muziFace.getKnowledgePage(selectedId.slice("knowledge:".length)).then((value) => { if (!cancelled) setPage(value); })
        : muziFace.getProject(selectedId).then((value) => { if (!cancelled) setProject(value); });
    void load.catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "读取失败"); });
    return () => { cancelled = true; };
  }, [selectedId, epoch]);

  useEffect(() => {
    const folderName = project?.folderName;
    if (folderName === undefined) {
      setProductionDetail(null);
      setProductionError(null);
      return;
    }
    let cancelled = false;
    setProductionDetail(null);
    setProductionError(null);
    void oilFace.getContent(folderName).then((value) => {
      if (!cancelled) setProductionDetail(value);
    }, (cause: unknown) => {
      if (!cancelled) setProductionError(cause instanceof Error ? cause.message : "视频制作信息不可用");
    });
    return () => { cancelled = true; };
  }, [epoch, oilFace, project?.folderName]);

  useEffect(() => {
    applyConversationInset(expanded && layout.mode === "split" ? layout.width : 0, !dragging);
    return () => { clearConversationInset(); };
  }, [expanded, layout.mode, layout.width, dragging]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent): void => {
      if (drag.current === null) return;
      const next = Math.min(layout.maxWidth, Math.max(INSPECTOR_MIN, drag.current.width + event.clientX - drag.current.x));
      drag.current.latestWidth = next;
      setWidth(next);
      applyConversationInset(next, false);
    };
    const up = (): void => {
      if (drag.current !== null) setInspectorWidth(drag.current.latestWidth);
      setDragging(false);
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [dragging, layout.maxWidth]);

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (layout.mode !== "split") return;
    const step = event.shiftKey ? 64 : 16;
    const next = event.key === "Home"
      ? INSPECTOR_MIN
      : event.key === "End"
        ? layout.maxWidth
        : event.key === "ArrowLeft"
          ? layout.width - step
          : event.key === "ArrowRight"
            ? layout.width + step
            : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.min(layout.maxWidth, clampInspectorPreference(next));
    setWidth(clamped);
    setInspectorWidth(clamped);
  };

  const moveDetailTab = (event: KeyboardEvent<HTMLButtonElement>, current: Tab): void => {
    const currentIndex = DETAIL_TABS.indexOf(current);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? DETAIL_TABS.length - 1
        : event.key === "ArrowRight"
          ? (currentIndex + 1) % DETAIL_TABS.length
          : event.key === "ArrowLeft"
            ? (currentIndex - 1 + DETAIL_TABS.length) % DETAIL_TABS.length
            : -1;
    if (nextIndex < 0) return;
    const tabList = event.currentTarget.closest("[role=tablist]");
    const next = DETAIL_TABS[nextIndex];
    if (next === undefined) return;
    event.preventDefault();
    setTab(next);
    window.requestAnimationFrame(() => {
      tabList?.querySelector<HTMLButtonElement>(`[data-detail-tab="${next}"]`)?.focus();
    });
  };

  const openInObsidian = async (document: MuziDocumentKey): Promise<void> => {
    if (project === null) return;
    setNotice(null);
    try {
      await muziFace.openDocumentInObsidian(project.id, document);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "无法在 Obsidian 中定位文件");
    }
  };

  const refreshKnowledgePreview = async (): Promise<void> => {
    setKnowledgePreview(await muziFace.getKnowledgePreview());
  };

  const openProduction = (): void => { setTab("production"); };

  const shownWidth = expanded ? layout.width : 0;
  return (
    <div data-plugin="dsh-oil-creator" data-surface="muzi-inspector" className={`${expanded ? "open" : ""}${layout.mode === "full" ? " full" : ""}${dragging ? " dragging" : ""}`} style={{ width: shownWidth }}>
      <div className="muziInspectorTop">
        <div className="muziInspectorTitle">{knowledgePreview !== null ? "知识预览" : page !== null || pending !== null ? "知识详情" : project === null ? "Muzi Creator" : "内容详情"}</div>
        <button type="button" aria-label="关闭详情" onClick={closeDetails}><IconCloseOutline16 size={14} /></button>
      </div>
      {error !== null && <div className="muziInspectorEmpty error">{error}</div>}
      {error === null && page !== null && <KnowledgeDetail page={page} onDiscuss={() => {
        void startKnowledgeDiscussion(page).catch((cause: unknown) => {
          setNotice(cause instanceof Error ? cause.message : "无法创建讨论会话");
        });
      }} />}
      {error === null && pending !== null && <PendingKnowledgeDetail file={pending} onProcess={() => {
        void startPendingProcessing(pending).catch((cause: unknown) => {
          setNotice(cause instanceof Error ? cause.message : "无法创建处理会话");
        });
      }} />}
      {error === null && knowledgePreview !== null && <KnowledgePreview result={knowledgePreview} onRefresh={refreshKnowledgePreview} />}
      {error === null && project !== null && (
        <>
          <div className="muziTabs" role="tablist">
            {DETAIL_TABS.map((key) => (
              <button type="button" role="tab" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} data-detail-tab={key} className={tab === key ? "active" : ""} key={key} onClick={() => { setTab(key); }} onKeyDown={(event) => { moveDetailTab(event, key); }}>{key === "overview" ? "概览" : key === "evidence" ? "证据" : key === "production" ? "视频制作" : DOCUMENTS.find((item) => item.key === key)?.label}</button>
            ))}
          </div>
          <div className="muziInspectorBody">
            {tab === "overview" && (
              <div className="muziOverview">
                <Card className="muziProjectHero" color="default" pattern="default" aria-labelledby="muzi-project-title">
                  <MuziProjectCover id={project.id} title={project.title} revision={project.coverRevision} load={muziFace.getProjectCover} className="muziProjectHeroCover" />
                  <div className="muziProjectHeroBody">
                    <div className="muziProjectHeroHeading">
                      <h1 id="muzi-project-title">{project.title}</h1>
                      <StatusBadge status={project.stage} label={STAGE_LABELS[project.stage]} />
                    </div>
                    <p>最近更新于 {formatProjectDate(project.updatedAt)}</p>
                  </div>
                  <dl className="muziProjectFacts">
                    <div><dt>主稿</dt><dd>{project.primaryDocument === "mother" ? "母内容" : "视频稿"}</dd></div>
                    <div><dt>修订</dt><dd>第 {project.revision} 版</dd></div>
                    <div><dt>稿件就绪</dt><dd>{projectCounts(project).ready}/5</dd></div>
                    <div><dt>已发布</dt><dd>{projectCounts(project).published}/5</dd></div>
                  </dl>
                </Card>
                <ProductionOverviewCard
                  detail={productionDetail}
                  error={productionError}
                  onOpen={openProduction}
                />
                <section className="muziStatusSection">
                  <div className="sectionHeading">
                    <div><h3>稿件</h3><p>状态依据创作目录中的记录只读显示</p></div>
                  </div>
                  <div className="statusGrid">{DOCUMENTS.map((item) => {
                    const state = project.documents[item.key];
                    const openDocument = (): void => { setTab(item.key); };
                    return <Card key={item.key} color="default" pattern="default" hoverable role="button" tabIndex={0} aria-label={`${item.label}：${DOCUMENT_STATUS_LABELS[state.status]}`} onClick={openDocument} onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      openDocument();
                    }}>
                      <span className="statusRow"><strong>{item.label}</strong><StatusBadge status={state.status} label={DOCUMENT_STATUS_LABELS[state.status]} /></span>
                      <span className="statusNavigation">{state.stale ? <em>来源已更新，待重新加工</em> : <small>查看稿件</small>}</span>
                    </Card>;
                  })}</div>
                </section>
                <section className="muziStatusSection">
                  <div className="sectionHeading"><div><h3>发布渠道</h3><p>仅展示已记录的平台事实</p></div></div>
                  <div className="publicationList">{TARGETS.map((item) => {
                    const state = project.publications[item.key];
                    return <div className="publicationRow" key={item.key}>
                      <span className="publicationIdentity"><PlatformMark id={item.icon} size={16} /><span>{item.label}</span></span>
                      <div>
                        <StatusBadge status={state.status} label={PUBLICATION_STATUS_LABELS[state.status]} />
                        {state.source !== null && <small>{state.source === "manual" ? "人工记录" : "同步记录"}</small>}
                        {state.url !== null && <a href={state.url} target="_blank" rel="noreferrer">打开链接</a>}
                      </div>
                    </div>;
                  })}</div>
                </section>
              </div>
            )}
            {DOCUMENTS.some((item) => item.key === tab) && (
              <div className="muziDocumentReader">
                <div className="editorBar">
                  <div className="editorStatus">
                    <span>当前状态</span>
                    <StatusBadge
                      status={project.documents[tab as MuziDocumentKey].status}
                      label={DOCUMENT_STATUS_LABELS[project.documents[tab as MuziDocumentKey].status]}
                    />
                  </div>
                  {project.documents[tab as MuziDocumentKey].stale && <span className="stale">来源已更新，待重新加工</span>}
                  <AnimalButton
                    type="default"
                    size="middle"
                    className="obsidianLocate"
                    icon={<Icon name="icon-map" size={18} />}
                    onClick={() => { void openInObsidian(tab as MuziDocumentKey); }}
                  >
                    在 Obsidian 中定位
                  </AnimalButton>
                </div>
                <Card className="muziDocumentBody" type={project.content[tab as MuziDocumentKey].trim() === "" ? "dashed" : "default"} color="default">
                  {project.content[tab as MuziDocumentKey].trim() === ""
                    ? <div className="muziInspectorEmpty">暂无{DOCUMENTS.find((item) => item.key === tab)?.label ?? "内容"}。可在主题讨论会话中明确要求 Agent 生成，或在 Obsidian 中编辑。</div>
                    : <MarkdownText text={project.content[tab as MuziDocumentKey]} />}
                </Card>
              </div>
            )}
            {tab === "evidence" && <EvidenceView project={project} />}
            {tab === "production" && <ProductionView detail={productionDetail} error={productionError} />}
          </div>
        </>
      )}
      {notice !== null && <div className="muziNotice" role="status" aria-live="polite"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={() => { setNotice(null); }}><IconCloseOutline16 size={13} /></button></div>}
      {layout.mode === "split" && (
        <div
          className="muziResize"
          role="separator"
          tabIndex={0}
          aria-label="调整详情宽度"
          aria-orientation="vertical"
          aria-valuemin={INSPECTOR_MIN}
          aria-valuemax={Math.round(layout.maxWidth)}
          aria-valuenow={Math.round(layout.width)}
          onKeyDown={resizeWithKeyboard}
          onPointerDown={(event) => {
            event.preventDefault();
            drag.current = { x: event.clientX, width: layout.width, latestWidth: layout.width };
            setDragging(true);
          }}
        />
      )}
    </div>
  );
}

function EvidenceDocument({
  id,
  title,
  description,
  markdown,
  emptyText,
}: {
  id: string;
  title: string;
  description: string;
  markdown: string;
  emptyText: string;
}) {
  return (
    <Card className="evidenceDocument" color="default" pattern="default" aria-labelledby={id}>
      <header className="evidenceDocumentHeader">
        <div>
          <h3 id={id}>{title}</h3>
          <p>{description}</p>
        </div>
        <Tag size="small" color="default">只读</Tag>
      </header>
      {markdown.trim() === ""
        ? <p className="evidenceDocumentEmpty">{emptyText}</p>
        : <div className="evidenceMarkdown"><MarkdownText text={markdown} /></div>}
    </Card>
  );
}

function EvidenceView({ project }: { project: MuziProjectDetail }) {
  const brief = knowledgeDisplayMarkdown(project.brief, `内容简报：${project.title}`);
  const evidence = knowledgeDisplayMarkdown(project.evidence, `证据与来源：${project.title}`);
  return (
    <div className="evidenceView">
      <header className="detailPageHeader">
        <div>
          <h2>证据</h2>
          <p>核对创作范围、事实依据与正式知识引用。</p>
        </div>
        <Tag size="small" color="app-teal">{project.atlasReferences.length} 条引用</Tag>
      </header>
      <div className="evidenceDocuments">
        <EvidenceDocument
          id="evidence-brief-title"
          title="内容简报"
          description="记录主题目标、受众与内容边界。"
          markdown={brief}
          emptyText="内容简报还没有补充具体说明。"
        />
        <EvidenceDocument
          id="evidence-sources-title"
          title="证据与来源"
          description="记录事实依据、来源边界与待核实信息。"
          markdown={evidence}
          emptyText="证据与来源还没有补充具体说明。"
        />
      </div>
      <section className="evidenceReferences" aria-labelledby="evidence-references-title">
        <div className="detailSectionHeading">
          <div>
            <h3 id="evidence-references-title">知识引用</h3>
            <p>创作项目绑定的正式 Atlas 页面与内容指纹。</p>
          </div>
        </div>
        {project.atlasReferences.length === 0
          ? <Card type="dashed" className="detailStateCard"><strong>尚未引用正式知识</strong><p>从主题知识发起讨论并生成内容后，引用会显示在这里。</p></Card>
          : (
            <Card className="evidenceReferenceLedger" color="default">
              <ul>
                {project.atlasReferences.map((ref) => (
                  <li key={ref.locator}>
                    <div className="evidenceReferenceTitle">
                      <strong>{ref.title}</strong>
                      <Tag size="small" color="default">正式知识</Tag>
                    </div>
                    <code>{ref.locator}</code>
                    <small>内容指纹 {ref.sha256.slice(0, 12)}… · 引用于 {formatProjectDate(ref.attachedAt)}</small>
                  </li>
                ))}
              </ul>
            </Card>
          )}
      </section>
    </div>
  );
}

function productionStageStatus(progress: VideoProductionProgress): VideoProductionStageStatus {
  return progress.stages.find((stage) => stage.id === progress.currentStage)?.status ?? "current";
}

function ProductionProgressStrip({ progress }: { progress: VideoProductionProgress }) {
  return (
    <ol className="productionProgressStrip" aria-label="视频制作阶段进度">
      {progress.stages.map((stage) => {
        const selected = stage.id === progress.currentStage;
        return (
          <li
            className={`productionProgressItem ${stage.status}${selected ? " selected" : ""}`}
            key={stage.id}
            aria-current={selected ? "step" : undefined}
            aria-label={`${stage.title}：${PRODUCTION_STAGE_STATUS_LABELS[stage.status]}`}
          >
            <span className="productionProgressDot" aria-hidden="true" />
            <span className="productionProgressLabel">{stage.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ProductionOverviewCard({
  detail,
  error,
  onOpen,
}: {
  detail: ContentDetail | null;
  error: string | null;
  onOpen: () => void;
}) {
  return (
    <section className="muziStatusSection" aria-labelledby="production-overview-title">
      <div className="sectionHeading">
        <div><h3 id="production-overview-title">视频制作</h3><p>从录制准备到成片就绪的只读阶段进度</p></div>
      </div>
      {error !== null
        ? <Card type="dashed" className="productionOverviewState error" role="alert"><strong>视频制作信息不可用</strong><p>{error}</p></Card>
        : detail === null
          ? <Card type="dashed" className="productionOverviewState"><strong>正在读取视频制作信息</strong><p>正在同步本地制作目录的状态。</p></Card>
          : (() => {
            const progress = videoProductionProgress(detail);
            return (
              <Card
                className="productionOverviewCard"
                color="default"
                hoverable
                role="button"
                tabIndex={0}
                aria-label={`视频制作：${progress.currentTitle}，下一步：${progress.nextAction}`}
                onClick={onOpen}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onOpen();
                }}
              >
                <div className="productionOverviewHeading">
                  <div><strong>{progress.currentTitle}</strong><p>下一步：{progress.nextAction}</p></div>
                  <StatusBadge status={productionStageStatus(progress)} label={progress.complete ? "已就绪" : PRODUCTION_STAGE_STATUS_LABELS[productionStageStatus(progress)]} />
                </div>
                <ProductionProgressStrip progress={progress} />
                <span className="statusNavigation"><small>查看制作阶段详情</small><small aria-hidden="true">→</small></span>
              </Card>
            );
          })()}
    </section>
  );
}

function ProductionCheckRow({ check }: { check: VideoProductionCheck }) {
  return (
    <li className={`productionCheck ${check.status}`}>
      <div className="productionCheckHeading">
        <strong>{check.label}</strong>
        <StatusBadge status={check.status} label={PRODUCTION_CHECK_STATUS_LABELS[check.status]} />
      </div>
      <p>{check.detail}</p>
      {check.warning !== undefined && <small>最近任务：{check.warning}</small>}
    </li>
  );
}

function ProductionView({ detail, error }: { detail: ContentDetail | null; error: string | null }) {
  if (error !== null) return <Card type="dashed" className="detailStateCard error" role="alert"><strong>视频制作信息不可用</strong><p>{error}</p></Card>;
  if (detail === null) return <Card type="dashed" className="detailStateCard"><strong>正在读取视频制作信息</strong><p>正在同步本地制作目录的状态。</p></Card>;
  const progress = videoProductionProgress(detail);
  return (
    <div className="productionView">
      <Card className="productionSummary" color="default" pattern="default">
        <div>
          <h2>本地视频制作</h2>
          <p>制作状态只读同步自视频目录，不在此页面修改文件。</p>
        </div>
        <div className="productionStage">
          <span>当前阶段</span>
          <StatusBadge status={productionStageStatus(progress)} label={progress.complete ? "已就绪" : progress.currentTitle} />
          <small>下一步：{progress.nextAction}</small>
        </div>
      </Card>
      <section className="productionSection" aria-labelledby="production-steps-title">
        <div className="detailSectionHeading">
          <div>
            <h3 id="production-steps-title">阶段进度</h3>
            <p>录制工程、导出、字幕与封面按真实产物同步。</p>
          </div>
        </div>
        <Card className="productionTimeline" color="default">
          <ol>
            {progress.stages.map((stage, index) => (
              <li
                className={`productionTimelineItem ${stage.status}${stage.id === progress.currentStage ? " selected" : ""}`}
                key={stage.id}
                aria-current={stage.id === progress.currentStage ? "step" : undefined}
                aria-label={`${stage.title}：${PRODUCTION_STAGE_STATUS_LABELS[stage.status]}`}
              >
                <div className="productionStepMarker" aria-hidden="true"><span>{index + 1}</span></div>
                <div className="productionStepBody">
                  <div className="productionStepHeading">
                    <div><strong>{stage.title}</strong><p>{stage.description}</p></div>
                    <div className="productionStepStatus"><StatusBadge status={stage.status} label={PRODUCTION_STAGE_STATUS_LABELS[stage.status]} /></div>
                  </div>
                  <ul className="productionChecks">
                    {stage.checks.map((check) => <ProductionCheckRow check={check} key={check.id} />)}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
