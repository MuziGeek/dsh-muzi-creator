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
import type { BurnStatus, WorkflowStage } from "../types.ts";
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
const WORKFLOW_LABELS: Record<WorkflowStage, string> = {
  idle: "未开始",
  record: "录制中",
  cut: "剪辑中",
  finish: "制作完成",
  publish: "待发布",
  live: "已上线",
};
const JOB_STATUS_LABELS: Record<BurnStatus, string> = {
  idle: "未开始",
  running: "处理中",
  done: "已完成",
  error: "处理失败",
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
  if (["ready", "published", "done", "finish", "live"].includes(status)) return "app-green";
  if (["research", "mother_draft", "adaptation", "draft", "platform_draft", "record", "cut", "running"].includes(status)) return "app-teal";
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
            {tab === "production" && <ProductionView folderName={project.folderName} oilFace={oilFace} />}
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

function ProductionView({ folderName, oilFace }: { folderName: string; oilFace: CreatorViewFace }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<CreatorViewFace["getContent"]>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void oilFace.getContent(folderName).then(setDetail, (cause: unknown) => { setError(cause instanceof Error ? cause.message : "视频制作信息不可用"); });
  }, [folderName]);
  if (error !== null) return <Card type="dashed" className="detailStateCard error" role="alert"><strong>视频制作信息不可用</strong><p>{error}</p></Card>;
  if (detail === null) return <Card type="dashed" className="detailStateCard"><strong>正在读取视频制作信息</strong><p>正在同步本地制作目录的状态。</p></Card>;
  const steps: Array<{
    key: string;
    title: string;
    description: string;
    statuses: Array<{ status: string; label: string }>;
    error?: string;
  }> = [
    {
      key: "raw",
      title: "素材准备",
      description: "录制或导入的原始视频素材",
      statuses: [{ status: detail.videoRaw === undefined ? "idle" : "ready", label: detail.videoRaw === undefined ? "原始视频不可用" : "原始视频已存在" }],
    },
    {
      key: "subtitle",
      title: "字幕处理",
      description: "字幕任务与字幕成片状态",
      statuses: [
        { status: detail.subtitleJob.status, label: `任务${JOB_STATUS_LABELS[detail.subtitleJob.status]}` },
        { status: detail.videoSubtitled === undefined ? "idle" : "ready", label: detail.videoSubtitled === undefined ? "成片不可用" : "成片已存在" },
      ],
      ...(detail.subtitleJob.error === undefined ? {} : { error: detail.subtitleJob.error }),
    },
    {
      key: "cover",
      title: "封面生成",
      description: "视频封面生成任务",
      statuses: [{ status: detail.coverJob.status, label: JOB_STATUS_LABELS[detail.coverJob.status] }],
      ...(detail.coverJob.error === undefined ? {} : { error: detail.coverJob.error }),
    },
    {
      key: "studio",
      title: "录屏工程",
      description: "本地录屏项目绑定状态",
      statuses: [{ status: detail.studioPath === undefined ? "idle" : "ready", label: detail.studioPath === undefined ? "未绑定" : "已绑定" }],
    },
  ];
  return (
    <div className="productionView">
      <Card className="productionSummary" color="default" pattern="default">
        <div>
          <h2>本地视频制作</h2>
          <p>制作状态只读同步自视频目录，不在此页面修改文件。</p>
        </div>
        <div className="productionStage">
          <span>当前阶段</span>
          <StatusBadge status={detail.workflow} label={WORKFLOW_LABELS[detail.workflow]} />
        </div>
      </Card>
      <section className="productionSection" aria-labelledby="production-steps-title">
        <div className="detailSectionHeading">
          <div>
            <h3 id="production-steps-title">制作链路</h3>
            <p>依次核对素材、字幕、封面和录屏工程。</p>
          </div>
        </div>
        <Card className="productionTimeline" color="default">
          <ol>
            {steps.map((step, index) => (
              <li key={step.key}>
                <span className="productionStepIndex" aria-hidden="true">{index + 1}</span>
                <div className="productionStepBody">
                  <div className="productionStepHeading">
                    <div><strong>{step.title}</strong><p>{step.description}</p></div>
                    <div className="productionStepStatus">{step.statuses.map((status) => <StatusBadge key={status.label} status={status.status} label={status.label} />)}</div>
                  </div>
                  {step.error !== undefined && <p className="productionStepError">{step.error}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
