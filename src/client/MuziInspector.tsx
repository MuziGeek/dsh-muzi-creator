import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
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
  MuziVideoPlatform,
  AcceptanceCapability,
  VideoAcceptanceSessionResult,
  VideoPublishMode,
  VideoPublishStatusResult,
  PendingKnowledgeFile,
} from "../muziTypes.ts";
import {
  capabilityEnabled,
  type VideoPublishAccountCapabilities,
  type VideoPublishCapabilitiesResult,
} from "../videoCapabilities.ts";
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
import {
  IslandButton,
  IslandInput,
  IslandSelect,
  IslandSwitch,
  IslandTabs,
  type IslandTabItem,
} from "./ui/IslandControls.tsx";
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
  { key: "wechat", label: "视频号", icon: "wechat" },
  { key: "xiaohongshu", label: "小红书", icon: "xhs" },
  { key: "blog", label: "博客", icon: "article" },
];
const VIDEO_TARGETS = TARGETS.filter((item): item is { key: MuziVideoPlatform; label: string; icon: PlatformId } => item.key !== "blog");
const VIDEO_MODE_LABELS: Record<VideoPublishMode, string> = {
  prepare_only: "仅准备",
  publish_now: "立即发布",
  schedule: "定时发布",
};
const VIDEO_CAPABILITY_LABELS: Record<AcceptanceCapability, string> = {
  prepare_only: "仅准备",
  publish_now: "立即发布",
  schedule: "定时发布",
  metrics: "播放数据同步",
};
const VIDEO_STATE_LABELS: Record<string, string> = {
  NEW: "未开始",
  PREPARING: "准备中",
  READY_DRAFT: "草稿已备",
  READY_TO_PUBLISH: "待立即发布",
  READY_TO_SCHEDULE: "待定时提交",
  PUBLISHED_CONFIRMED: "发布已确认",
  SCHEDULE_CONFIRMED: "排程已确认",
  COMMIT_UNKNOWN: "提交结果未知",
  BLOCKED: "已阻塞",
};

function metricText(value: number | null, delta: number | null): string {
  if (value === null) return "—";
  return delta === null || delta === 0 ? String(value) : `${value} (${delta > 0 ? "+" : ""}${delta})`;
}

interface PublishIntentDraft {
  enabled: boolean;
  accountProfile: string;
  mode: VideoPublishMode;
  scheduledAt: string;
}

function defaultPublishIntents(): Record<MuziVideoPlatform, PublishIntentDraft> {
  return Object.fromEntries(VIDEO_TARGETS.map((item) => [item.key, {
    enabled: true,
    accountProfile: "",
    mode: "prepare_only",
    scheduledAt: "",
  }])) as Record<MuziVideoPlatform, PublishIntentDraft>;
}

function accountFor(
  snapshot: VideoPublishCapabilitiesResult | null,
  platform: MuziVideoPlatform,
  accountProfile: string,
): VideoPublishAccountCapabilities | undefined {
  return snapshot?.accounts.find((item) => item.platform === platform && item.accountProfile === accountProfile);
}

function capabilityReason(account: VideoPublishAccountCapabilities | undefined, capability: AcceptanceCapability): string {
  return account?.capabilities[capability].reason ?? "账号未登记或能力尚未验收";
}

function shanghaiRfc3339(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("请选择有效的中国标准时间");
  return `${value}:00+08:00`;
}
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
        <IslandButton type="primary" size="middle" className="knowledgeDiscuss" icon={<Icon name="icon-diy" size={18} />} onClick={onProcess}>处理文件</IslandButton>
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
        <IslandButton type="default" size="middle" className="knowledgeDiscuss" icon={<Icon name="icon-chat" size={18} />} onClick={onDiscuss}>
          与智能助手讨论
        </IslandButton>
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
  const [videoPublish, setVideoPublish] = useState<VideoPublishStatusResult | null>(null);
  const [videoCapabilities, setVideoCapabilities] = useState<VideoPublishCapabilitiesResult | null>(null);
  const [publishIntents, setPublishIntents] = useState<Record<MuziVideoPlatform, PublishIntentDraft>>(defaultPublishIntents);
  const [publishBusy, setPublishBusy] = useState<"prepare" | "commit" | "sync" | "acceptance" | null>(null);
  const [originalRightsConfirmed, setOriginalRightsConfirmed] = useState(false);
  const [acceptancePlatform, setAcceptancePlatform] = useState<MuziVideoPlatform>("xiaohongshu");
  const [acceptanceAccountProfile, setAcceptanceAccountProfile] = useState("");
  const [acceptanceCapability, setAcceptanceCapability] = useState<AcceptanceCapability>("prepare_only");
  const [acceptanceScheduledAt, setAcceptanceScheduledAt] = useState("");
  const [acceptanceSession, setAcceptanceSession] = useState<VideoAcceptanceSessionResult | null>(null);
  const [acceptanceMetricsCollectedSessionId, setAcceptanceMetricsCollectedSessionId] = useState<string | null>(null);
  const [acceptanceBlocker, setAcceptanceBlocker] = useState<string | null>(null);
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
    setVideoPublish(null);
    setVideoCapabilities(null);
    setPublishIntents(defaultPublishIntents());
    setPublishBusy(null);
    setOriginalRightsConfirmed(false);
    setAcceptanceSession(null);
    setAcceptanceMetricsCollectedSessionId(null);
    setAcceptanceBlocker(null);
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
    if (project === null) return;
    let cancelled = false;
    void muziFace.getVideoPublishStatus(project.id).then((value) => {
      if (!cancelled) setVideoPublish(value);
    }, (cause: unknown) => {
      if (!cancelled) setNotice(cause instanceof Error ? cause.message : "视频发布状态不可用");
    });
    return () => { cancelled = true; };
  }, [muziFace, project?.id]);

  useEffect(() => {
    if (project === null) return;
    let cancelled = false;
    void muziFace.getVideoPublishCapabilities().then((value) => {
      if (cancelled) return;
      setVideoCapabilities(value);
      setPublishIntents((current) => Object.fromEntries(VIDEO_TARGETS.map((item) => {
        const existing = accountFor(value, item.key, current[item.key].accountProfile);
        const selected = existing?.enabled === true
          ? existing.accountProfile
          : value.accounts.find((account) => account.platform === item.key && account.enabled)?.accountProfile ?? "";
        const selectedAccount = accountFor(value, item.key, selected);
        const prepareAvailable = capabilityEnabled(selectedAccount, "prepare_only");
        const previouslyBound = current[item.key].accountProfile !== "";
        return [item.key, {
          ...current[item.key],
          accountProfile: selected,
          enabled: prepareAvailable && (previouslyBound ? current[item.key].enabled : true),
        }];
      })) as Record<MuziVideoPlatform, PublishIntentDraft>);
      const preferred = value.accounts.find((account) => account.platform === acceptancePlatform && account.enabled)
        ?? value.accounts.find((account) => account.enabled);
      if (preferred !== undefined) {
        setAcceptancePlatform(preferred.platform);
        setAcceptanceAccountProfile(preferred.accountProfile);
      }
    }, (cause: unknown) => {
      if (!cancelled) setVideoCapabilities({ schema: "muzi.video-publisher.capabilities/1", generatedAt: new Date().toISOString(), accounts: [], unavailableReason: cause instanceof Error ? cause.message : "发布能力不可用" });
    });
    return () => { cancelled = true; };
  }, [muziFace, project?.id]);

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

  const updatePublishIntent = (platform: MuziVideoPlatform, patch: Partial<PublishIntentDraft>): void => {
    setPublishIntents((current) => ({ ...current, [platform]: { ...current[platform], ...patch } }));
  };

  const refreshVideoPublish = async (taskId?: string): Promise<void> => {
    if (project === null) return;
    const latestProject = await muziFace.getProject(project.id);
    setProject(latestProject);
    setVideoPublish(await muziFace.getVideoPublishStatus(project.id, taskId));
  };

  const refreshVideoCapabilities = async (): Promise<VideoPublishCapabilitiesResult> => {
    const next = await muziFace.getVideoPublishCapabilities();
    setVideoCapabilities(next);
    return next;
  };

  const selectPublishAccount = (platform: MuziVideoPlatform, accountProfile: string): void => {
    const account = accountFor(videoCapabilities, platform, accountProfile);
    const nextMode: VideoPublishMode = capabilityEnabled(account, "prepare_only")
      ? "prepare_only"
      : capabilityEnabled(account, "publish_now")
        ? "publish_now"
        : capabilityEnabled(account, "schedule")
          ? "schedule"
          : "prepare_only";
    updatePublishIntent(platform, { accountProfile, mode: nextMode });
  };

  const prepareVideoPublish = async (): Promise<void> => {
    if (project === null) return;
    const enabled = VIDEO_TARGETS.filter((item) => publishIntents[item.key].enabled);
    if (enabled.length === 0) { setNotice("请至少选择一个视频平台"); return; }
    try {
      const intents = enabled.map((item) => {
        const draft = publishIntents[item.key];
        const account = accountFor(videoCapabilities, item.key, draft.accountProfile);
        if (!capabilityEnabled(account, draft.mode)) {
          throw new Error(`${item.label} 无法准备：${capabilityReason(account, draft.mode)}`);
        }
        return {
          platform: item.key,
          accountProfile: draft.accountProfile,
          mode: draft.mode,
          ...(draft.mode === "schedule" ? { scheduledAt: shanghaiRfc3339(draft.scheduledAt) } : {}),
        };
      });
      const summary = intents.map((intent) => `${VIDEO_TARGETS.find((item) => item.key === intent.platform)?.label} · ${intent.accountProfile} · ${VIDEO_MODE_LABELS[intent.mode]}${intent.scheduledAt ? ` · ${intent.scheduledAt.replace("T", " ").replace(":00+08:00", " 中国标准时间")}` : ""}`).join("\n");
      if (!window.confirm(`将打开外部创作者后台并上传、填写以下页面；最终发布控件仍会锁定：\n\n${summary}\n\n是否继续？`)) return;
      setPublishBusy("prepare");
      const task = await muziFace.prepareVideoPublish({
        id: project.id,
        expectedRevision: project.revision,
        intents,
        confirmed: true,
        originalRightsConfirmed,
      });
      setVideoPublish({ id: project.id, task, metrics: videoPublish?.metrics ?? {} });
      setNotice(task.ok ? "页面准备完成；需要提交的平台仍需逐个平台确认" : "部分平台未准备完成，请查看阻塞原因");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "视频页面准备失败");
    } finally {
      setPublishBusy(null);
    }
  };

  const commitVideoPublish = async (platform: MuziVideoPlatform): Promise<void> => {
    if (project === null || videoPublish?.task === null || videoPublish?.task === undefined) return;
    const row = videoPublish.task.platforms[platform];
    if (row === undefined || row.authorizationDigest === null) return;
    const label = VIDEO_TARGETS.find((item) => item.key === platform)?.label ?? platform;
    const approval = row.approvalSummary;
    if (approval === null || approval === undefined) {
      setNotice(`${label} 缺少可复核的授权摘要，请重新准备。`);
      return;
    }
    const capability = row.mode === "schedule" ? "schedule" : "publish_now";
    const account = accountFor(videoCapabilities, platform, row.accountProfile);
    if (!capabilityEnabled(account, capability)) {
      setNotice(`${label} 无法提交：${capabilityReason(account, capability)}`);
      return;
    }
    const action = approval.mode === "schedule" ? "定时发布" : "立即发布";
    const time = approval.mode === "schedule" && approval.scheduledAt !== null
      ? `\n时间：${approval.scheduledAt.replace("T", " ").replace(":00+08:00", " 中国标准时间")}`
      : "";
    if (!window.confirm(`平台：${label}\n账号：${approval.accountProfile}\n内容：${approval.title}\n动作：${action}${time}\n\n此确认只允许一次最终操作，是否继续？`)) return;
    try {
      setPublishBusy("commit");
      const committed = await muziFace.commitVideoPublish({
        id: project.id,
        expectedRevision: project.revision,
        taskId: videoPublish.task.taskId,
        platform,
        authorizationDigest: row.authorizationDigest,
        confirmed: true,
      });
      await refreshVideoPublish(videoPublish.task.taskId);
      setNotice(committed.ok ? "平台最终操作已完成并取得结果证据" : "最终操作结果未知；不会自动重试");
    } catch (cause) {
      await muziFace.getVideoPublishStatus(project.id, videoPublish.task.taskId).then(setVideoPublish, () => undefined);
      setNotice(cause instanceof Error ? cause.message : "最终操作结果未知；不会自动重试");
    } finally {
      setPublishBusy(null);
    }
  };

  const syncVideoMetrics = async (): Promise<void> => {
    if (project === null) return;
    const platforms = metricTargets.map((item) => item.key);
    const accountProfiles = Object.fromEntries(metricTargets.map((item) => [item.key, publishIntents[item.key].accountProfile])) as Partial<Record<MuziVideoPlatform, string>>;
    const summary = metricTargets.map((item) => `${item.label} · ${accountProfiles[item.key]}`).join("\n");
    if (!window.confirm(`将使用以下隔离账号读取播放量、点赞和评论：\n\n${summary}\n\n90 秒内重复同步默认使用缓存。是否继续？`)) return;
    try {
      setPublishBusy("sync");
      const result = await muziFace.syncVideoMetrics({ id: project.id, expectedRevision: project.revision, platforms, accountProfiles, confirmed: true });
      await refreshVideoPublish(videoPublish?.task?.taskId);
      setNotice(result.cached ? "已读取 90 秒缓存数据" : "播放数据同步完成");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "播放数据同步失败");
    } finally {
      setPublishBusy(null);
    }
  };

  const beginVideoAcceptance = async (): Promise<void> => {
    if (project === null) return;
    const account = accountFor(videoCapabilities, acceptancePlatform, acceptanceAccountProfile);
    if (account === undefined || !account.enabled) { setAcceptanceBlocker("请选择已登记且已启用的账号"); return; }
    let scheduledAt: string | undefined;
    try {
      scheduledAt = acceptanceCapability === "schedule" ? shanghaiRfc3339(acceptanceScheduledAt) : undefined;
    } catch (cause) {
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "验收时间无效");
      return;
    }
    if (!window.confirm(`将打开 ${VIDEO_TARGETS.find((item) => item.key === acceptancePlatform)?.label ?? acceptancePlatform} 的隔离验收页面，核验账号“${account.displayName}”的 ${VIDEO_CAPABILITY_LABELS[acceptanceCapability]} 能力；不会上传或提交内容。是否继续？`)) return;
    try {
      setPublishBusy("acceptance");
      setAcceptanceBlocker(null);
      const session = await muziFace.beginVideoAcceptance({
        id: project.id,
        expectedRevision: project.revision,
        platform: acceptancePlatform,
        accountProfile: account.accountProfile,
        capability: acceptanceCapability,
        expectedAccountLabel: account.displayName,
        confirmed: true,
        ...(scheduledAt === undefined ? {} : { scheduledAt }),
      });
      setAcceptanceSession(session);
      setAcceptanceMetricsCollectedSessionId(null);
      setAcceptanceBlocker(null);
    } catch (cause) {
      setAcceptanceSession(null);
      setAcceptanceMetricsCollectedSessionId(null);
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "无法开始能力验收");
    } finally {
      setPublishBusy(null);
    }
  };

  const prepareVideoAcceptance = async (): Promise<void> => {
    if (project === null || acceptanceSession === null || acceptanceSession.capability === "metrics") return;
    if (Date.parse(acceptanceSession.expiresAt) <= Date.now()) {
      setAcceptanceBlocker("验收会话已过期，请重新开始");
      return;
    }
    if (!originalRightsConfirmed) {
      setAcceptanceBlocker("请先确认本次测试素材拥有所需原创或发布权利");
      return;
    }
    let scheduledAt: string | undefined;
    try {
      scheduledAt = acceptanceSession.capability === "schedule" ? shanghaiRfc3339(acceptanceScheduledAt) : undefined;
    } catch (cause) {
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "验收时间无效");
      return;
    }
    const label = VIDEO_TARGETS.find((item) => item.key === acceptanceSession.platform)?.label ?? acceptanceSession.platform;
    if (!window.confirm(`验收平台：${label}\n账号：${acceptanceSession.account.label}\n能力：${VIDEO_CAPABILITY_LABELS[acceptanceSession.capability]}\n\n将上传并填写测试内容，最终控件保持锁定；本步骤不会发布或提交排程。是否继续？`)) return;
    try {
      setPublishBusy("acceptance");
      setAcceptanceBlocker(null);
      const task = await muziFace.prepareVideoPublish({
        id: project.id,
        expectedRevision: project.revision,
        intents: [{
          platform: acceptanceSession.platform,
          accountProfile: acceptanceSession.accountProfile,
          mode: acceptanceSession.capability,
          ...(scheduledAt === undefined ? {} : { scheduledAt }),
        }],
        confirmed: true,
        originalRightsConfirmed: true,
        acceptanceSessionId: acceptanceSession.sessionId,
      });
      setVideoPublish({ id: project.id, task, metrics: videoPublish?.metrics ?? {} });
      const row = task.platforms[acceptanceSession.platform];
      if (row?.acceptanceSessionId !== acceptanceSession.sessionId || row.acceptanceEvidence == null) {
        setAcceptanceBlocker(row?.commitBlocker?.message ?? "准备完成，但没有取得与本会话绑定的结构化验收证据");
      } else {
        setNotice(acceptanceSession.capability === "prepare_only"
          ? "仅准备证据已取得；请核对页面和局部截图后完成验收"
          : "页面准备证据已取得；最终动作仍需单独确认");
      }
    } catch (cause) {
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "验收准备失败");
    } finally {
      setPublishBusy(null);
    }
  };

  const commitVideoAcceptance = async (): Promise<void> => {
    if (project === null || acceptanceSession === null || videoPublish?.task == null) return;
    const row = videoPublish.task.platforms[acceptanceSession.platform];
    const approval = row?.approvalSummary;
    if (row === undefined || approval === null || approval === undefined || row.authorizationDigest === null
      || row.acceptanceSessionId !== acceptanceSession.sessionId) {
      setAcceptanceBlocker("本验收会话没有可用的一次性最终授权，请重新执行验收准备");
      return;
    }
    const label = VIDEO_TARGETS.find((item) => item.key === acceptanceSession.platform)?.label ?? acceptanceSession.platform;
    const action = approval.mode === "schedule" ? "定时发布" : "立即发布";
    const time = approval.mode === "schedule" && approval.scheduledAt !== null
      ? `\n时间：${approval.scheduledAt.replace("T", " ").replace(":00+08:00", " 中国标准时间")}`
      : "";
    if (!window.confirm(`平台：${label}\n账号：${approval.accountProfile}\n内容：${approval.title}\n动作：${action}${time}\n\n这是能力验收中的真实最终操作，只允许执行一次。是否继续？`)) return;
    try {
      setPublishBusy("acceptance");
      setAcceptanceBlocker(null);
      const task = await muziFace.commitVideoPublish({
        id: project.id,
        expectedRevision: project.revision,
        taskId: videoPublish.task.taskId,
        platform: acceptanceSession.platform,
        authorizationDigest: row.authorizationDigest,
        confirmed: true,
        acceptanceSessionId: acceptanceSession.sessionId,
      });
      setVideoPublish({ id: project.id, task, metrics: videoPublish.metrics });
      const committed = task.platforms[acceptanceSession.platform];
      if (committed?.status === "COMMIT_UNKNOWN") {
        setAcceptanceBlocker("最终动作已经触发但结果不明；系统不会自动重试，请先在平台侧人工核对");
      } else {
        setNotice("最终动作取得可靠结果证据；请人工复核后完成验收");
      }
    } catch (cause) {
      await muziFace.getVideoPublishStatus(project.id, videoPublish.task.taskId).then(setVideoPublish, () => undefined);
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "最终操作结果未知；系统不会自动重试");
    } finally {
      setPublishBusy(null);
    }
  };

  const syncVideoAcceptanceMetrics = async (): Promise<void> => {
    if (project === null || acceptanceSession === null || acceptanceSession.capability !== "metrics") return;
    const label = VIDEO_TARGETS.find((item) => item.key === acceptanceSession.platform)?.label ?? acceptanceSession.platform;
    if (!window.confirm(`验收平台：${label}\n账号：${acceptanceSession.account.label}\n动作：读取播放量、点赞和评论\n\n本次强制读取实时页面，不使用 90 秒缓存，也不会发布或修改内容。是否继续？`)) return;
    try {
      setPublishBusy("acceptance");
      setAcceptanceBlocker(null);
      const result = await muziFace.syncVideoMetrics({
        id: project.id,
        expectedRevision: project.revision,
        platforms: [acceptanceSession.platform],
        force: true,
        confirmed: true,
        acceptanceSessionId: acceptanceSession.sessionId,
        acceptanceAccountProfile: acceptanceSession.accountProfile,
      });
      if (result.acceptanceSessionStatus !== "METRICS_COLLECTED") {
        throw new Error("同步结束但没有取得完整的会话绑定指标证据");
      }
      setAcceptanceMetricsCollectedSessionId(acceptanceSession.sessionId);
      await refreshVideoPublish(videoPublish?.task?.taskId);
      setNotice("播放数据验收证据已取得；请核对结果后完成验收");
    } catch (cause) {
      setAcceptanceMetricsCollectedSessionId(null);
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "播放数据验收失败");
    } finally {
      setPublishBusy(null);
    }
  };

  const openVideoAcceptanceEvidence = async (): Promise<void> => {
    const evidencePath = acceptanceTaskRow?.acceptanceEvidence?.path;
    if (evidencePath === undefined) return;
    try {
      await oilFace.openPath(evidencePath);
    } catch (cause) {
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "无法打开本地验收证据");
    }
  };

  const finalizeVideoAcceptance = async (): Promise<void> => {
    if (project === null || acceptanceSession === null) return;
    if (!sessionCanFinalize) {
      setAcceptanceBlocker("会话尚未取得该能力要求的完整结果证据，不能完成验收");
      return;
    }
    const taskId = acceptanceSession.capability === "metrics" ? undefined : videoPublish?.task?.taskId;
    if (acceptanceSession.capability !== "metrics" && taskId === undefined) {
      setAcceptanceBlocker("验收任务标识缺失，不能完成验收");
      return;
    }
    if (!window.confirm(`确认已复核 ${acceptanceSession.account.label} 的 ${VIDEO_CAPABILITY_LABELS[acceptanceSession.capability]} 结果及局部证据。完成后只启用该账号的这一项能力，不会创建发布授权。是否完成验收？`)) return;
    try {
      setPublishBusy("acceptance");
      setAcceptanceBlocker(null);
      await muziFace.finalizeVideoAcceptance({
        id: project.id,
        expectedRevision: project.revision,
        platform: acceptanceSession.platform,
        capability: acceptanceSession.capability,
        acceptanceSessionId: acceptanceSession.sessionId,
        ...(taskId === undefined ? {} : { taskId }),
        confirmed: true,
      });
      await refreshVideoCapabilities();
      await refreshVideoPublish(videoPublish?.task?.taskId);
      setNotice("能力验收已完成，账号能力已刷新");
      setAcceptanceSession(null);
      setAcceptanceMetricsCollectedSessionId(null);
    } catch (cause) {
      setAcceptanceBlocker(cause instanceof Error ? cause.message : "无法完成能力验收");
    } finally {
      setPublishBusy(null);
    }
  };

  const metricTargets = project === null ? [] : VIDEO_TARGETS.filter((item) => {
    const publication = project.publications[item.key];
    return publication.status === "published" || (publication.status === "platform_draft" && publication.scheduledAt !== null);
  });
  const metricCapabilityAvailable = metricTargets.length > 0 && metricTargets.every((item) => {
    const accountProfile = publishIntents[item.key].accountProfile;
    return accountProfile !== "" && capabilityEnabled(accountFor(videoCapabilities, item.key, accountProfile), "metrics");
  });
  const metricCapabilityBlocker = metricTargets.find((item) => {
    const accountProfile = publishIntents[item.key].accountProfile;
    return accountProfile === "" || !capabilityEnabled(accountFor(videoCapabilities, item.key, accountProfile), "metrics");
  });
  const metricCapabilityReason = videoCapabilities?.unavailableReason
    ?? (metricCapabilityBlocker === undefined
      ? null
      : capabilityReason(accountFor(videoCapabilities, metricCapabilityBlocker.key, publishIntents[metricCapabilityBlocker.key].accountProfile), "metrics"))
    ?? "需要已登记账号的播放数据同步能力验收";
  const selectedAcceptanceAccounts = videoCapabilities?.accounts.filter((account) => account.platform === acceptancePlatform) ?? [];
  const selectedAcceptanceAccount = accountFor(videoCapabilities, acceptancePlatform, acceptanceAccountProfile);
  const acceptanceTaskRow = acceptanceSession === null ? undefined : videoPublish?.task?.platforms[acceptanceSession.platform];
  const acceptanceTaskMatches = acceptanceSession !== null
    && acceptanceTaskRow?.accountProfile === acceptanceSession.accountProfile
    && acceptanceTaskRow.acceptanceSessionId === acceptanceSession.sessionId
    && acceptanceTaskRow.acceptanceEvidence != null;
  const acceptancePrepared = acceptanceTaskMatches && (
    (acceptanceSession?.capability === "prepare_only" && acceptanceTaskRow?.status === "READY_DRAFT" && acceptanceTaskRow.commitEnabled === false && acceptanceTaskRow.authorizationDigest === null)
    || (acceptanceSession?.capability === "publish_now" && acceptanceTaskRow?.status === "READY_TO_PUBLISH" && acceptanceTaskRow.commitEnabled === true && acceptanceTaskRow.authorizationDigest !== null)
    || (acceptanceSession?.capability === "schedule" && acceptanceTaskRow?.status === "READY_TO_SCHEDULE" && acceptanceTaskRow.commitEnabled === true && acceptanceTaskRow.authorizationDigest !== null)
  );
  const acceptanceCommitted = acceptanceTaskMatches && (
    (acceptanceSession?.capability === "publish_now" && acceptanceTaskRow?.status === "PUBLISHED_CONFIRMED" && acceptanceTaskRow.commitEnabled === false && acceptanceTaskRow.authorizationDigest === null)
    || (acceptanceSession?.capability === "schedule" && acceptanceTaskRow?.status === "SCHEDULE_CONFIRMED" && acceptanceTaskRow.commitEnabled === false && acceptanceTaskRow.authorizationDigest === null)
  );
  const acceptanceMetricsCollected = acceptanceSession !== null
    && acceptanceSession.capability === "metrics"
    && acceptanceMetricsCollectedSessionId === acceptanceSession.sessionId;
  const sessionCanFinalize = acceptanceSession !== null
    && Date.parse(acceptanceSession.expiresAt) > Date.now()
    && acceptanceSession.account.verified === true
    && acceptanceSession.account.evidenceSha256 !== ""
    && (acceptanceSession.capability === "prepare_only"
      ? acceptancePrepared
      : acceptanceSession.capability === "metrics"
        ? acceptanceMetricsCollected
        : acceptanceCommitted);
  const sessionNeedsPrepare = acceptanceSession !== null
    && acceptanceSession.capability !== "metrics"
    && !acceptancePrepared
    && !acceptanceCommitted;
  const sessionNeedsCommit = acceptanceSession !== null
    && (acceptanceSession.capability === "publish_now" || acceptanceSession.capability === "schedule")
    && acceptancePrepared
    && !acceptanceCommitted;
  const shownWidth = expanded ? layout.width : 0;
  return (
    <div data-plugin="dsh-muzi-creator" data-surface="muzi-inspector" className={`${expanded ? "open" : ""}${layout.mode === "full" ? " full" : ""}${dragging ? " dragging" : ""}`} style={{ width: shownWidth }}>
      <div className="muziInspectorTop">
        <div className="muziInspectorTitle">{knowledgePreview !== null ? "知识预览" : page !== null || pending !== null ? "知识详情" : project === null ? "Muzi Creator" : "内容详情"}</div>
        <IslandButton type="text" aria-label="关闭详情" onClick={closeDetails}><IconCloseOutline16 size={14} /></IslandButton>
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
          <IslandTabs
            className="muziTabs"
            aria-label="内容详情标签页"
            activeKey={tab}
            onChange={(key: string) => { setTab(key as Tab); }}
            leafAnimation={false}
            items={DETAIL_TABS.map((key): IslandTabItem => ({
              key,
              label: key === "overview" ? "概览" : key === "evidence" ? "证据" : key === "production" ? "视频制作" : DOCUMENTS.find((item) => item.key === key)?.label,
              children: key === tab ? <div className="muziInspectorBody">
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
                <section className="muziStatusSection videoPublishSection">
                  <div className="sectionHeading videoPublishHeading">
                    <div><h3>视频发布</h3><p>默认仅准备；最终发布与定时提交逐个平台确认，时间均为中国标准时间</p></div>
                    <div className="videoPublishActions">
                      <IslandButton type="default" size="small" loading={publishBusy === "sync"} title={metricCapabilityAvailable ? undefined : metricCapabilityReason} disabled={publishBusy !== null || !metricCapabilityAvailable} onClick={() => { void syncVideoMetrics(); }}>{publishBusy === "sync" ? "同步中…" : "同步播放数据"}</IslandButton>
                      <IslandButton type="primary" size="small" loading={publishBusy === "prepare"} disabled={publishBusy !== null || videoCapabilities?.unavailableReason !== null} onClick={() => { void prepareVideoPublish(); }}>{publishBusy === "prepare" ? "准备中…" : "准备所选平台"}</IslandButton>
                    </div>
                  </div>
                  <section className="videoAcceptance" aria-label="能力验收">
                    <div><strong>能力验收</strong><p>选择已登记账号和一项能力；服务端返回可复核证据后，才会显示完成验收。</p></div>
                    {videoCapabilities?.unavailableReason !== null && videoCapabilities?.unavailableReason !== undefined && <p className="videoPublishBlocker">{videoCapabilities.unavailableReason}</p>}
                    <div className="videoAcceptanceControls">
                      <label><span id="acceptance-platform-label">平台</span><IslandSelect aria-labelledby="acceptance-platform-label" value={acceptancePlatform} disabled={publishBusy !== null || videoCapabilities === null || acceptanceSession !== null} onChange={(value: string) => {
                        const platform = value as MuziVideoPlatform;
                        setAcceptancePlatform(platform);
                        setAcceptanceAccountProfile(videoCapabilities?.accounts.find((account) => account.platform === platform && account.enabled)?.accountProfile ?? "");
                        setAcceptanceSession(null);
                        setAcceptanceMetricsCollectedSessionId(null);
                        setAcceptanceBlocker(null);
                      }} options={VIDEO_TARGETS.map((item) => ({ key: item.key, label: item.label }))} /></label>
                      <label><span id="acceptance-account-label">已登记账号</span><IslandSelect aria-labelledby="acceptance-account-label" value={acceptanceAccountProfile} placeholder="暂无已登记账号" disabled={publishBusy !== null || selectedAcceptanceAccounts.length === 0 || acceptanceSession !== null} onChange={(value: string) => { const account = selectedAcceptanceAccounts.find((candidate) => candidate.accountProfile === value); if (account?.enabled !== true) { setAcceptanceBlocker("该账号已停用，不能开始能力验收"); return; } setAcceptanceAccountProfile(value); setAcceptanceSession(null); setAcceptanceMetricsCollectedSessionId(null); setAcceptanceBlocker(null); }} options={selectedAcceptanceAccounts.map((account) => ({ key: account.accountProfile, label: `${account.displayName}（${account.accountProfile}${account.enabled ? "" : "，已停用"}）` }))} /></label>
                      <label><span id="acceptance-capability-label">能力</span><IslandSelect aria-labelledby="acceptance-capability-label" value={acceptanceCapability} disabled={publishBusy !== null || selectedAcceptanceAccount === undefined || acceptanceSession !== null} onChange={(value: string) => { setAcceptanceCapability(value as AcceptanceCapability); setAcceptanceSession(null); setAcceptanceMetricsCollectedSessionId(null); setAcceptanceBlocker(null); }} options={Object.entries(VIDEO_CAPABILITY_LABELS).map(([capability, label]) => ({ key: capability, label: `${label}${capabilityEnabled(selectedAcceptanceAccount, capability as AcceptanceCapability) ? "（已验收）" : "（待验收）"}` }))} /></label>
                      {acceptanceCapability === "schedule" && <label><span>中国标准时间</span><IslandInput type="datetime-local" value={acceptanceScheduledAt} disabled={publishBusy !== null || acceptanceSession !== null} onChange={(event: ChangeEvent<HTMLInputElement>) => { setAcceptanceScheduledAt(event.currentTarget.value); setAcceptanceSession(null); setAcceptanceMetricsCollectedSessionId(null); }} /></label>}
                    </div>
                    <div className="videoAcceptanceStatus">
                      {acceptanceSession === null
                        ? <span>会话状态：未开始</span>
                        : <span>会话状态：账号已核验，等待取得能力证据；{new Date(acceptanceSession.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} 到期</span>}
                      {acceptanceSession === null && <IslandButton type="default" size="small" loading={publishBusy === "acceptance"} disabled={publishBusy !== null || selectedAcceptanceAccount?.enabled !== true} onClick={() => { void beginVideoAcceptance(); }}>{publishBusy === "acceptance" ? "处理中…" : "开始验收"}</IslandButton>}
                      {sessionNeedsPrepare && <IslandButton type="default" size="small" loading={publishBusy === "acceptance"} disabled={publishBusy !== null} onClick={() => { void prepareVideoAcceptance(); }}>{publishBusy === "acceptance" ? "处理中…" : "执行验收准备"}</IslandButton>}
                      {sessionNeedsCommit && <IslandButton type="primary" danger size="small" loading={publishBusy === "acceptance"} disabled={publishBusy !== null} onClick={() => { void commitVideoAcceptance(); }}>{publishBusy === "acceptance" ? "处理中…" : acceptanceSession?.capability === "schedule" ? "执行验收定时提交" : "执行验收立即发布"}</IslandButton>}
                      {acceptanceSession?.capability === "metrics" && !acceptanceMetricsCollected && <IslandButton type="default" size="small" loading={publishBusy === "acceptance"} disabled={publishBusy !== null} onClick={() => { void syncVideoAcceptanceMetrics(); }}>{publishBusy === "acceptance" ? "处理中…" : "执行验收同步"}</IslandButton>}
                      {acceptanceTaskMatches && <IslandButton type="default" size="small" disabled={publishBusy !== null} onClick={() => { void openVideoAcceptanceEvidence(); }}>查看本地证据</IslandButton>}
                      {sessionCanFinalize && <IslandButton type="primary" size="small" loading={publishBusy === "acceptance"} disabled={publishBusy !== null} onClick={() => { void finalizeVideoAcceptance(); }}>完成验收</IslandButton>}
                      {acceptanceSession !== null && <IslandButton type="default" size="small" disabled={publishBusy !== null} onClick={() => { setAcceptanceSession(null); setAcceptanceMetricsCollectedSessionId(null); setAcceptanceBlocker(null); }}>退出本地会话</IslandButton>}
                    </div>
                    {acceptanceBlocker !== null && <p className="videoPublishBlocker">阻塞原因：{acceptanceBlocker}</p>}
                  </section>
                  <label className="originalRightsCheck">
                    <IslandSwitch checked={originalRightsConfirmed} onChange={(checked: boolean) => { setOriginalRightsConfirmed(checked); }} aria-label="确认本次素材拥有所需原创或发布权利" />
                    <span>本次素材拥有所需原创或发布权利（仅用于本次准备，不保存发布授权）</span>
                  </label>
                  <div className="videoPublishList">{VIDEO_TARGETS.map((item) => {
                    const fact = project.publications[item.key];
                    const draft = publishIntents[item.key];
                    const account = accountFor(videoCapabilities, item.key, draft.accountProfile);
                    const prepareAvailable = capabilityEnabled(account, "prepare_only");
                    const modeAvailable = capabilityEnabled(account, draft.mode);
                    const task = videoPublish?.task?.platforms[item.key];
                    const metric = videoPublish?.metrics[item.key];
                    const commitReady = task?.commitEnabled === true && task.authorizationDigest !== null && task.approvalSummary !== null && (task.status === "READY_TO_PUBLISH" || task.status === "READY_TO_SCHEDULE");
                    return <div className="videoPublishRow" key={item.key}>
                      <div className="videoPublishPrimary">
                        <label className="videoPlatformToggle">
                          <IslandSwitch checked={draft.enabled} disabled={publishBusy !== null || !prepareAvailable} aria-label={`选择${item.label}平台`} onChange={(checked: boolean) => { updatePublishIntent(item.key, { enabled: checked }); }} />
                          <span className="publicationIdentity"><PlatformMark id={item.icon} size={17} /><strong>{item.label}</strong></span>
                        </label>
                        <div className="videoPublishControls">
                          <label><span id={`publish-account-${item.key}`}>账号</span><IslandSelect aria-labelledby={`publish-account-${item.key}`} value={draft.accountProfile} placeholder="暂无已登记账号" disabled={!draft.enabled || publishBusy !== null || videoCapabilities === null} onChange={(value: string) => { const nextAccount = videoCapabilities?.accounts.find((candidate) => candidate.platform === item.key && candidate.accountProfile === value); if (nextAccount?.enabled !== true) { setNotice(`${item.label}账号已停用，不能用于准备或提交`); return; } selectPublishAccount(item.key, value); }} options={(videoCapabilities?.accounts.filter((candidate) => candidate.platform === item.key) ?? []).map((candidate) => ({ key: candidate.accountProfile, label: `${candidate.displayName}（${candidate.accountProfile}${candidate.enabled ? "" : "，已停用"}）` }))} /></label>
                          <label><span id={`publish-mode-${item.key}`}>模式</span><IslandSelect aria-labelledby={`publish-mode-${item.key}`} value={draft.mode} disabled={!draft.enabled || publishBusy !== null} onChange={(value: string) => { const mode = value as VideoPublishMode; if (!capabilityEnabled(account, mode)) { setNotice(`${item.label}${VIDEO_MODE_LABELS[mode]}不可用：${capabilityReason(account, mode)}`); return; } updatePublishIntent(item.key, { mode }); }} options={(Object.entries(VIDEO_MODE_LABELS) as Array<[VideoPublishMode, string]>).map(([mode, label]) => ({ key: mode, label: capabilityEnabled(account, mode) ? label : `${label}（不可用）` }))} /></label>
                          {draft.mode === "schedule" && <label className="scheduleInput"><span>中国标准时间</span><IslandInput type="datetime-local" aria-label={`${item.label}定时时间`} value={draft.scheduledAt} disabled={!draft.enabled || publishBusy !== null} onChange={(event: ChangeEvent<HTMLInputElement>) => { updatePublishIntent(item.key, { scheduledAt: event.currentTarget.value }); }} /></label>}
                        </div>
                      </div>
                      <div className="videoPublishStatusLine">
                        <StatusBadge status={task?.status ?? fact.status} label={task === undefined ? PUBLICATION_STATUS_LABELS[fact.status] : (VIDEO_STATE_LABELS[task.status] ?? task.status)} />
                        {fact.source !== null && <small>{fact.source === "manual" ? "人工记录" : fact.source === "publisher" ? "发布器记录" : "同步记录"}</small>}
                        {fact.scheduledAt !== null && <small>排程 {formatProjectDate(fact.scheduledAt)}</small>}
                        {fact.url !== null && <a href={fact.url} target="_blank" rel="noreferrer">打开作品</a>}
                        {task !== undefined && task.mode !== "prepare_only" && <IslandButton type="primary" size="small" loading={publishBusy === "commit"} disabled={!commitReady || publishBusy !== null} onClick={() => { void commitVideoPublish(item.key); }}>{task.mode === "schedule" ? "确认定时提交" : "确认立即发布"}</IslandButton>}
                      </div>
                      {task?.commitBlocker !== null && task?.commitBlocker !== undefined && <p className="videoPublishBlocker">{task.commitBlocker.message}</p>}
                      {!modeAvailable && <p className="videoPublishBlocker">{VIDEO_CAPABILITY_LABELS[draft.mode]}不可用：{capabilityReason(account, draft.mode)}</p>}
                      {!capabilityEnabled(account, "metrics") && <p className="videoPublishBlocker">播放数据同步不可用：{capabilityReason(account, "metrics")}</p>}
                      {metric !== undefined && <dl className="videoMetricLine">
                        <div><dt>播放</dt><dd>{metricText(metric.views, metric.delta.views)}</dd></div>
                        <div><dt>点赞</dt><dd>{metricText(metric.likes, metric.delta.likes)}</dd></div>
                        <div><dt>评论</dt><dd>{metricText(metric.comments, metric.delta.comments)}</dd></div>
                        <div><dt>同步</dt><dd>{formatProjectDate(metric.observedAt)}</dd></div>
                      </dl>}
                    </div>;
                  })}</div>
                  <div className="publicationList blogPublicationFact">
                    {(() => {
                      const state = project.publications.blog;
                      return <div className="publicationRow">
                        <span className="publicationIdentity"><PlatformMark id="article" size={16} /><span>博客（不进入视频发布链路）</span></span>
                        <div><StatusBadge status={state.status} label={PUBLICATION_STATUS_LABELS[state.status]} />{state.url !== null && <a href={state.url} target="_blank" rel="noreferrer">打开链接</a>}</div>
                      </div>;
                    })()}
                  </div>
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
                  <IslandButton
                    type="default"
                    size="middle"
                    className="obsidianLocate"
                    icon={<Icon name="icon-map" size={18} />}
                    onClick={() => { void openInObsidian(tab as MuziDocumentKey); }}
                  >
                    在 Obsidian 中定位
                  </IslandButton>
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
              </div> : null,
            }))}
          />
        </>
      )}
      {notice !== null && <div className="muziNotice" role="status" aria-live="polite"><span>{notice}</span><IslandButton type="text" aria-label="关闭提示" onClick={() => { setNotice(null); }}><IconCloseOutline16 size={13} /></IslandButton></div>}
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
