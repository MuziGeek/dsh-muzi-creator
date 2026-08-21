import { useEffect, useRef, useState } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
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
} from "../muziTypes.ts";
import type { BurnStatus, WorkflowStage } from "../types.ts";
import type { CreatorViewFace, MuziViewFace } from "./face.ts";
import { KnowledgePreview } from "./KnowledgePreview.tsx";
import {
  applyConversationInset,
  clearConversationInset,
  getInspectorWidth,
  setInspectorWidth,
  setSelectedContentId,
  setSidebarTab,
  useLibraryEpoch,
  useSelectedContentId,
} from "./contentSelection.ts";
import "./MuziInspector.css";

const DOCUMENTS: Array<{ key: MuziDocumentKey; label: string }> = [
  { key: "mother", label: "母内容" },
  { key: "video", label: "视频稿" },
  { key: "wechat", label: "公众号" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "blog", label: "博客" },
];
const TARGETS: Array<{ key: MuziPublishTarget; label: string }> = [
  { key: "bilibili", label: "B站" },
  { key: "douyin", label: "抖音" },
  { key: "wechat", label: "公众号" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "blog", label: "博客" },
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

type StatusTone = "neutral" | "working" | "warning" | "success" | "error";

function statusTone(status: string): StatusTone {
  if (status === "error") return "error";
  if (status === "review") return "warning";
  if (["ready", "published", "done", "finish", "live"].includes(status)) return "success";
  if (["research", "mother_draft", "adaptation", "draft", "platform_draft", "record", "cut", "running"].includes(status)) return "working";
  return "neutral";
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`muziStatusBadge ${statusTone(status)}`}>{label}</span>;
}

export type MuziInspectorProps = PropsRuntime<"shell.overlay"> & {
  muziFace: MuziViewFace;
  oilFace: CreatorViewFace;
  closeDetails: () => void;
};

function isKnowledgeSelection(value: string): boolean {
  return value.startsWith("knowledge:atlas://wiki/");
}

function isKnowledgePreviewSelection(value: string): boolean {
  return value === "knowledge-preview";
}

function KnowledgeDetail({ page, onDiscuss }: { page: KnowledgePage; onDiscuss: () => void }) {
  return (
    <>
      <div className="muziInspectorHeader">
        <div>
          <h2>{page.title}</h2>
          <p>{KNOWLEDGE_CATEGORY_LABELS[page.category] ?? "知识"} · 内容指纹 {page.sha256.slice(0, 12)}…</p>
        </div>
        <button type="button" className="primary" onClick={onDiscuss}>与智能助手讨论</button>
      </div>
      <div className="muziMarkdown">
        <MarkdownText text={page.markdown} />
        {page.related.length > 0 && (
          <section className="muziRelatedKnowledge">
            <div><h3>关联知识</h3><span>来自页面中的明确 Wiki 链接</span></div>
            <div className="muziRelatedList">
              {page.related.map((related) => (
                <button type="button" key={related.id} onClick={() => { setSelectedContentId(`knowledge:${related.locator}`); }}>
                  <strong>{related.title}</strong>
                  <span>{KNOWLEDGE_CATEGORY_LABELS[related.category] ?? "知识"}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export function MuziInspector({ muziFace, oilFace, closeDetails }: MuziInspectorProps) {
  const [selectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();
  const [project, setProject] = useState<MuziProjectDetail | null>(null);
  const [page, setPage] = useState<KnowledgePage | null>(null);
  const [knowledgePreview, setKnowledgePreview] = useState<KnowledgePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [width, setWidth] = useState(getInspectorWidth);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);

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
    setKnowledgePreview(null);
    setTab("overview");
    setDirty(false);
    const load = isKnowledgePreviewSelection(selectedId)
      ? muziFace.getKnowledgePreview().then((value) => { if (!cancelled) setKnowledgePreview(value); })
      : isKnowledgeSelection(selectedId)
        ? muziFace.getKnowledgePage(selectedId.slice("knowledge:".length)).then((value) => { if (!cancelled) setPage(value); })
        : muziFace.getProject(selectedId).then((value) => { if (!cancelled) setProject(value); });
    void load.catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "读取失败"); });
    return () => { cancelled = true; };
  }, [selectedId, epoch]);

  useEffect(() => {
    if (project === null || !DOCUMENTS.some((item) => item.key === tab)) return;
    setDraft(project.content[tab as MuziDocumentKey]);
    setDirty(false);
  }, [project?.revision, tab]);

  useEffect(() => {
    applyConversationInset(expanded ? width : 0, !dragging);
    return () => { clearConversationInset(); };
  }, [expanded, width, dragging]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent): void => {
      if (drag.current === null) return;
      const next = Math.min(800, Math.max(360, drag.current.width + drag.current.x - event.clientX));
      setWidth(next);
      applyConversationInset(next, false);
    };
    const up = (): void => {
      setDragging(false);
      drag.current = null;
      setInspectorWidth(width);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [dragging, width]);

  const save = async (): Promise<void> => {
    if (project === null || !DOCUMENTS.some((item) => item.key === tab)) return;
    const document = tab as MuziDocumentKey;
    setSaving(true);
    setNotice(null);
    try {
      const next = await muziFace.saveDocument({
        id: project.id,
        document,
        text: draft,
        status: draft.trim() === "" ? "not_started" : project.documents[document].status === "not_started" ? "draft" : project.documents[document].status,
        expectedRevision: project.revision,
        ...(project.documents[document].derivedFrom === null ? {} : { derivedFrom: project.documents[document].derivedFrom }),
        ...(project.documents[document].sourceSha256 === null ? {} : { sourceSha256: project.documents[document].sourceSha256 }),
      });
      setProject(next);
      setDirty(false);
      setNotice("已保存");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const discussKnowledge = async (): Promise<void> => {
    if (page === null) return;
    const text = `@知识页面 ${page.locator} sha256:${page.sha256}`;
    try { await navigator.clipboard.writeText(text); } catch { /* Clipboard can be denied; the locator remains visible. */ }
    setNotice("知识引用已复制，请在会话输入框粘贴并明确发送。内容不会自动进入模型。 ");
    setSidebarTab("sessions");
  };

  const refreshKnowledgePreview = async (): Promise<void> => {
    setKnowledgePreview(await muziFace.getKnowledgePreview());
  };

  const shownWidth = expanded ? width : 0;
  return (
    <div data-plugin="dsh-oil-creator" data-surface="muzi-inspector" className={expanded ? "open" : ""} style={{ width: shownWidth }}>
      <div className="muziInspectorTop">
        <div className="muziInspectorTitle">{knowledgePreview !== null ? "知识预览" : page?.title ?? project?.title ?? "Muzi Creator"}</div>
        <button type="button" aria-label="关闭详情" onClick={closeDetails}>×</button>
      </div>
      {error !== null && <div className="muziInspectorEmpty error">{error}</div>}
      {error === null && page !== null && <KnowledgeDetail page={page} onDiscuss={() => { void discussKnowledge(); }} />}
      {error === null && knowledgePreview !== null && <KnowledgePreview result={knowledgePreview} onRefresh={refreshKnowledgePreview} />}
      {error === null && project !== null && (
        <>
          <div className="muziTabs" role="tablist">
            {(["overview", ...DOCUMENTS.map((item) => item.key), "evidence", "production"] as Tab[]).map((key) => (
              <button type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} key={key} onClick={() => {
                if (dirty && !window.confirm("当前修改尚未保存，确定切换吗？")) return;
                setTab(key);
              }}>{key === "overview" ? "概览" : key === "evidence" ? "证据" : key === "production" ? "视频制作" : DOCUMENTS.find((item) => item.key === key)?.label}</button>
            ))}
          </div>
          <div className="muziInspectorBody">
            {tab === "overview" && (
              <div className="muziOverview">
                <div className="muziProjectSummary" aria-label="项目概况">
                  <div><span>当前阶段</span><StatusBadge status={project.stage} label={STAGE_LABELS[project.stage]} /></div>
                  <div><span>主稿</span><strong>{project.primaryDocument === "mother" ? "母内容" : "视频稿"}</strong></div>
                  <div><span>当前修订</span><strong>第 {project.revision} 版</strong></div>
                </div>
                <section className="muziStatusSection">
                  <div className="sectionHeading">
                    <div><h3>稿件状态</h3><p>状态依据创作目录中的记录只读显示</p></div>
                  </div>
                  <div className="statusGrid">{DOCUMENTS.map((item) => {
                    const state = project.documents[item.key];
                    return <button key={item.key} type="button" onClick={() => { setTab(item.key); }}>
                      <span className="statusRow"><strong>{item.label}</strong><StatusBadge status={state.status} label={DOCUMENT_STATUS_LABELS[state.status]} /></span>
                      {state.stale ? <em>来源已更新，待重新加工</em> : <small>打开查看内容</small>}
                    </button>;
                  })}</div>
                </section>
                <section className="muziStatusSection">
                  <div className="sectionHeading"><div><h3>发布状态</h3><p>仅展示已记录的平台事实</p></div></div>
                  <div className="publicationList">{TARGETS.map((item) => {
                    const state = project.publications[item.key];
                    return <div className="publicationRow" key={item.key}>
                      <span>{item.label}</span>
                      <div>
                        <StatusBadge status={state.status} label={PUBLICATION_STATUS_LABELS[state.status]} />
                        {state.source !== null && <small>{state.source === "manual" ? "人工记录" : "同步记录"}</small>}
                      </div>
                    </div>;
                  })}</div>
                </section>
              </div>
            )}
            {DOCUMENTS.some((item) => item.key === tab) && (
              <div className="muziEditor">
                <div className="editorBar">
                  <div className="editorStatus">
                    <span>当前状态</span>
                    <StatusBadge
                      status={project.documents[tab as MuziDocumentKey].status}
                      label={DOCUMENT_STATUS_LABELS[project.documents[tab as MuziDocumentKey].status]}
                    />
                  </div>
                  {project.documents[tab as MuziDocumentKey].stale && <span className="stale">来源已更新，待重新加工</span>}
                  <button type="button" className="primary" disabled={!dirty || saving} onClick={() => { void save(); }}>{saving ? "保存中…" : "保存"}</button>
                </div>
                <textarea value={draft} placeholder={`在这里编辑${DOCUMENTS.find((item) => item.key === tab)?.label ?? "内容"}`} onChange={(event) => { setDraft(event.target.value); setDirty(true); }} />
              </div>
            )}
            {tab === "evidence" && <div className="evidenceView"><MarkdownText text={`${project.brief}\n\n${project.evidence}`} /><h3>知识引用</h3>{project.atlasReferences.length === 0 ? <p>尚未引用正式知识页面。</p> : <ul>{project.atlasReferences.map((ref) => <li key={ref.locator}><strong>{ref.title}</strong><code>{ref.locator}</code><small>内容指纹 {ref.sha256.slice(0, 12)}…</small></li>)}</ul>}</div>}
            {tab === "production" && <ProductionView folderName={project.folderName} oilFace={oilFace} />}
          </div>
        </>
      )}
      {notice !== null && <div className="muziNotice">{notice}<button type="button" onClick={() => { setNotice(null); }}>×</button></div>}
      <div className="muziResize" onPointerDown={(event) => { event.preventDefault(); drag.current = { x: event.clientX, width }; setDragging(true); }} />
    </div>
  );
}

function ProductionView({ folderName, oilFace }: { folderName: string; oilFace: CreatorViewFace }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<CreatorViewFace["getContent"]>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void oilFace.getContent(folderName).then(setDetail, (cause: unknown) => { setError(cause instanceof Error ? cause.message : "视频制作信息不可用"); });
  }, [folderName]);
  if (error !== null) return <div className="muziInspectorEmpty">{error}</div>;
  if (detail === null) return <div className="muziInspectorEmpty">正在读取视频制作信息…</div>;
  return <div className="productionView"><h3>本地视频制作</h3><dl><dt>制作阶段</dt><dd>{WORKFLOW_LABELS[detail.workflow]}</dd><dt>原始视频</dt><dd>{detail.videoRaw === undefined ? "不可用" : "已存在"}</dd><dt>字幕成片</dt><dd>{detail.videoSubtitled === undefined ? "不可用" : "已存在"}</dd><dt>字幕任务</dt><dd>{JOB_STATUS_LABELS[detail.subtitleJob.status]}</dd><dt>封面任务</dt><dd>{JOB_STATUS_LABELS[detail.coverJob.status]}</dd><dt>录屏工程</dt><dd>{detail.studioPath === undefined ? "未绑定" : "已绑定"}</dd></dl></div>;
}
