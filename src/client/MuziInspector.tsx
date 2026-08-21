import { useEffect, useRef, useState } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import type {
  KnowledgePage,
  MuziDocumentKey,
  MuziDocumentStatus,
  MuziProjectDetail,
  MuziProjectStage,
  MuziPublicationStatus,
  MuziPublishTarget,
} from "../muziTypes.ts";
import type { CreatorViewFace, MuziViewFace } from "./face.ts";
import {
  applyConversationInset,
  clearConversationInset,
  getInspectorWidth,
  setInspectorWidth,
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
const STAGES: MuziProjectStage[] = ["idea", "research", "mother_draft", "adaptation", "review", "ready"];
const DOC_STATUSES: MuziDocumentStatus[] = ["not_started", "draft", "review", "ready"];
const PUB_STATUSES: MuziPublicationStatus[] = ["unpublished", "platform_draft", "published"];
type Tab = "overview" | MuziDocumentKey | "evidence" | "production";

export type MuziInspectorProps = PropsRuntime<"shell.overlay"> & {
  muziFace: MuziViewFace;
  oilFace: CreatorViewFace;
  closeDetails: () => void;
};

function isKnowledgeSelection(value: string): boolean {
  return value.startsWith("knowledge:atlas://wiki/");
}

function KnowledgeDetail({ page, onDiscuss }: { page: KnowledgePage; onDiscuss: () => void }) {
  return (
    <>
      <div className="muziInspectorHeader">
        <div>
          <h2>{page.title}</h2>
          <p>{page.category} · SHA-256 {page.sha256.slice(0, 12)}…</p>
        </div>
        <button type="button" className="primary" onClick={onDiscuss}>与 AI 讨论</button>
      </div>
      <div className="muziMarkdown"><MarkdownText text={page.markdown} /></div>
    </>
  );
}

export function MuziInspector({ muziFace, oilFace, closeDetails }: MuziInspectorProps) {
  const [selectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();
  const [project, setProject] = useState<MuziProjectDetail | null>(null);
  const [page, setPage] = useState<KnowledgePage | null>(null);
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
    setTab("overview");
    setDirty(false);
    const load = isKnowledgeSelection(selectedId)
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

  const shownWidth = expanded ? width : 0;
  return (
    <div data-plugin="dsh-oil-creator" data-surface="muzi-inspector" className={expanded ? "open" : ""} style={{ width: shownWidth }}>
      <div className="muziInspectorTop">
        <div className="muziInspectorTitle">{page?.title ?? project?.title ?? "Muzi Creator"}</div>
        <button type="button" aria-label="关闭详情" onClick={closeDetails}>×</button>
      </div>
      {error !== null && <div className="muziInspectorEmpty error">{error}</div>}
      {error === null && page !== null && <KnowledgeDetail page={page} onDiscuss={() => { void discussKnowledge(); }} />}
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
                <section>
                  <div className="sectionHeading"><h3>创作进度</h3><select value={project.stage} onChange={(event) => {
                    void muziFace.setProjectStatus(project.id, event.target.value as MuziProjectStage, project.revision).then(setProject, (cause: unknown) => { setNotice(cause instanceof Error ? cause.message : "更新失败"); });
                  }}>{STAGES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                  <div className="statusGrid">{DOCUMENTS.map((item) => {
                    const state = project.documents[item.key];
                    return <button key={item.key} type="button" onClick={() => { setTab(item.key); }}><strong>{item.label}</strong><span>{state.status}</span>{state.stale && <em>来源已更新，待重新加工</em>}</button>;
                  })}</div>
                </section>
                <section>
                  <h3>发布目标</h3>
                  <div className="publicationList">{TARGETS.map((item) => {
                    const state = project.publications[item.key];
                    return <label key={item.key}><span>{item.label}</span><select value={state.status} onChange={(event) => {
                      void muziFace.setPublication({ id: project.id, target: item.key, status: event.target.value as MuziPublicationStatus, expectedRevision: project.revision, source: "manual", ...(state.url === null ? {} : { url: state.url }), ...(state.publishedAt === null ? {} : { publishedAt: state.publishedAt }) }).then(setProject, (cause: unknown) => { setNotice(cause instanceof Error ? cause.message : "更新失败"); });
                    }}>{PUB_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>;
                  })}</div>
                </section>
              </div>
            )}
            {DOCUMENTS.some((item) => item.key === tab) && (
              <div className="muziEditor">
                <div className="editorBar">
                  <select value={project.documents[tab as MuziDocumentKey].status} onChange={(event) => {
                    const document = tab as MuziDocumentKey;
                    setProject({ ...project, documents: { ...project.documents, [document]: { ...project.documents[document], status: event.target.value as MuziDocumentStatus } } });
                    setDirty(true);
                  }}>{DOC_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                  {project.documents[tab as MuziDocumentKey].stale && <span className="stale">来源已更新，待重新加工</span>}
                  <button type="button" className="primary" disabled={!dirty || saving} onClick={() => { void save(); }}>{saving ? "保存中…" : "保存"}</button>
                </div>
                <textarea value={draft} placeholder={`在这里编辑${DOCUMENTS.find((item) => item.key === tab)?.label ?? "内容"}`} onChange={(event) => { setDraft(event.target.value); setDirty(true); }} />
              </div>
            )}
            {tab === "evidence" && <div className="evidenceView"><MarkdownText text={`${project.brief}\n\n${project.evidence}`} /><h3>Atlas 引用</h3>{project.atlasReferences.length === 0 ? <p>尚未引用正式 Wiki。</p> : <ul>{project.atlasReferences.map((ref) => <li key={ref.locator}><strong>{ref.title}</strong><code>{ref.locator}</code><small>{ref.sha256.slice(0, 12)}…</small></li>)}</ul>}</div>}
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
  return <div className="productionView"><h3>Oil 本地视频制作</h3><dl><dt>阶段</dt><dd>{detail.workflow}</dd><dt>原片</dt><dd>{detail.videoRaw === undefined ? "不可用" : "已存在"}</dd><dt>字幕成片</dt><dd>{detail.videoSubtitled === undefined ? "不可用" : "已存在"}</dd><dt>字幕</dt><dd>{detail.subtitleJob.status}</dd><dt>封面</dt><dd>{detail.coverJob.status}</dd><dt>Screen Studio</dt><dd>{detail.studioPath === undefined ? "未绑定" : "已绑定"}</dd></dl></div>;
}
