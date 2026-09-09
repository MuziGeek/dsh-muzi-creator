import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  MarkdownText,
  type MarkdownFileMentions,
} from "@deepseek-ai/dsh-client-ui-primitives";

import type {
  KnowledgePage,
  KnowledgePreviewResult,
  MuziDocumentKey,
  MuziDocumentStatus,
  MuziProjectDetail,
  MuziPublishTarget,
  MuziVideoPlatform,
  AcceptanceCapability,
  VideoAcceptanceSessionResult,
  VideoPublishMode,
  VideoPublishState,
  VideoPublishStatusResult,
  PendingKnowledgeFile,
} from "../muziTypes.ts";
import {
  capabilityEnabled,
  type VideoPublishAccountCapabilities,
  type VideoPublishCapabilitiesResult,
} from "../videoCapabilities.ts";
import { ProductionProjectControls } from "./ProductionProjectControls.tsx";
import { zh, type CreatorKey } from "./locales.ts";
import type { ContentDetail } from "../types.ts";
import type { CreatorViewFace, MuziViewFace } from "./face.ts";
import {
  formatKnowledgeDate,
  knowledgeDisplayMarkdown,
  knowledgeLinkedMarkdown,
  resolveKnowledgeWikiMention,
} from "./knowledgeDisplay.ts";
import { KnowledgePreview } from "./KnowledgePreview.tsx";
import { ContentOverview } from "./ContentOverview.tsx";
import { PlatformMark, type PlatformId } from "./PlatformMark.tsx";
import {
  videoProductionProgress,
  type VideoProductionCheck,
  type VideoProductionCheckStatus,
  type VideoProductionProgress,
  type VideoProductionStageStatus,
} from "./videoProductionProgress.ts";
import {
  setSelectedContentId,
  useLibraryEpoch,
  useSelectedContentId,
} from "./contentSelection.ts";
import {
  IslandButton,
  IslandCard,
  IslandInput,
  IslandSelect,
  IslandSwitch,
  IslandTag,
  IslandTabs,
  type IslandTabItem,
  type IslandTagProps,
} from "./ui/IslandControls.tsx";
import { VideoAccountManager } from "./VideoAccountManager.tsx";
import { PublishFlowPanel } from "./PublishFlowPanel.tsx";
import type { PublishFlowFace } from "../publishFlowSchemas.ts";
import { useVideoAccountEpoch } from "./videoAccountState.ts";
import type { VideoAccount } from "../videoAccountSchemas.ts";
import "./MuziInspector.css";

const DOCUMENTS: Array<{ key: MuziDocumentKey; label: string }> = [
  { key: "mother", label: "母内容" },
  { key: "video", label: "视频稿" },
  { key: "wechat", label: "公众号" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "blog", label: "博客" },
];
type TagColor = NonNullable<IslandTagProps["color"]>;
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
const VIDEO_STATE_KEYS: Record<VideoPublishState, CreatorKey> = {
  NEW: "overview.task.new", PREPARING: "overview.task.preparing",
  READY_DRAFT: "overview.task.readyDraft", READY_TO_PUBLISH: "overview.task.readyPublish",
  READY_TO_SCHEDULE: "overview.task.readySchedule", PUBLISHED_CONFIRMED: "overview.task.published",
  SCHEDULE_CONFIRMED: "overview.task.scheduled", COMMIT_UNKNOWN: "overview.task.unknown", BLOCKED: "overview.task.blocked",
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
const DOCUMENT_STATUS_LABELS: Record<MuziDocumentStatus, string> = {
  not_started: "未开始",
  draft: "草稿",
  review: "审阅中",
  ready: "已就绪",
};
const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  entities: "实体",
  topics: "主题",
  sources: "来源",
  comparisons: "比较",
  synthesis: "综合",
  queries: "问题",
};

function missingSelectionMessage(message: string): boolean {
  return message === "creator project not found"
    || message === "knowledge page is unavailable or outside the formal Wiki categories"
    || message === "待消化文件已处理、已移动或不存在，请刷新列表";
}
type Tab = "overview" | MuziDocumentKey | "evidence" | "production";
const DETAIL_TABS: Tab[] = ["overview", ...DOCUMENTS.map((item) => item.key), "evidence", "production"];

function statusColor(status: string): TagColor {
  if (status === "error") return "app-red";
  if (status === "review") return "app-yellow";
  if (["ready", "complete", "published", "done", "finish", "live"].includes(status)) return "app-green";
  if (["research", "mother_draft", "adaptation", "draft", "platform_draft", "record", "cut", "running", "current"].includes(status)) return "app-teal";
  return "brown";
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return <IslandTag className="muziStatusBadge" size="small" variant="soft" color={statusColor(status)}>{label}</IslandTag>;
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

export interface MuziInspectorProps {
  t?: (key: CreatorKey) => string;
  muziFace: MuziViewFace;
  mzFace: CreatorViewFace;
  startPendingProcessing: (file: PendingKnowledgeFile) => Promise<void>;
  startKnowledgeDiscussion: (page: KnowledgePage) => Promise<void>;
}

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
              <IslandTag size="small" color="brown">{file.extension.toUpperCase()}</IslandTag>
              <IslandTag size="small" color="app-orange">{PENDING_STATE_LABELS[file.state]}</IslandTag>
              <time dateTime={file.updatedAt}>更新于 {formatKnowledgeDate(file.updatedAt)}</time>
            </div>
          <h1 id="muzi-workbench-detail-title" tabIndex={-1}>{file.title}</h1>
          <p>{file.relativePath} · {(file.size / 1024).toFixed(file.size < 1024 ? 1 : 0)} KB · 指纹 <code>{file.sha256.slice(0, 12)}…</code></p>
        </div>
        <IslandButton type="primary" size="middle" className="knowledgeDiscuss" icon={<WorkbenchIcon name="content" />} onClick={onProcess}>处理文件</IslandButton>
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
              <IslandTag size="small" color="app-teal">{category}</IslandTag>
              <time dateTime={page.updatedAt}>更新于 {formatKnowledgeDate(page.updatedAt)}</time>
            </div>
          <h1 id="muzi-workbench-detail-title" tabIndex={-1}>{page.title}</h1>
          <p>内容指纹 <code>{page.sha256.slice(0, 12)}…</code></p>
        </div>
        <IslandButton type="default" size="middle" className="knowledgeDiscuss" icon={<WorkbenchIcon name="sessions" />} onClick={onDiscuss}>
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
  t = (key) => zh[key],
  muziFace,
  mzFace,
  startPendingProcessing,
  startKnowledgeDiscussion,
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
  const [publishManagementOpen, setPublishManagementOpen] = useState(false);
  const [acceptanceOpen, setAcceptanceOpen] = useState(false);
  const accountEpoch = useVideoAccountEpoch();
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [accountAddRequest, setAccountAddRequest] = useState<{ platform: MuziVideoPlatform; sequence: number } | null>(null);
  const accountManagerRef = useRef<HTMLDivElement>(null);
  const [focusPlatform, setFocusPlatform] = useState<MuziVideoPlatform | null>(null);
  const publishManagementRef = useRef<HTMLElement>(null);
  const publishFlow = (muziFace as MuziViewFace & { publishFlow?: PublishFlowFace }).publishFlow;

  useEffect(() => {
    setPublishManagementOpen(false);
    setAcceptanceOpen(false);
    setAccountManagerOpen(false);
    setAccountAddRequest(null);
    setFocusPlatform(null);
  }, [selectedId]);

  useEffect(() => {
    if (!publishManagementOpen || focusPlatform === null) return;
    const row = publishManagementRef.current?.querySelector<HTMLElement>(`[data-publish-platform="${focusPlatform}"]`);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
    setFocusPlatform(null);
  }, [publishManagementOpen, focusPlatform]);

  const managePublish = (platform?: MuziVideoPlatform): void => {
    if (platform === undefined) setPublishManagementOpen((value) => !value);
    else {
      setPublishManagementOpen(true);
      setFocusPlatform(platform);
    }
  };

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
    void load.catch((cause: unknown) => {
      if (cancelled) return;
      const message = cause instanceof Error ? cause.message : "读取失败";
      if (missingSelectionMessage(message)) {
        setSelectedContentId(null);
        return;
      }
      setError(message);
    });
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
      const preferred = value.accounts.find((account) => account.platform === acceptancePlatform && account.accountProfile === acceptanceAccountProfile && account.enabled)
        ?? value.accounts.find((account) => account.platform === acceptancePlatform && account.enabled)
        ?? value.accounts.find((account) => account.enabled);
      if (preferred !== undefined) {
        setAcceptancePlatform(preferred.platform);
        setAcceptanceAccountProfile(preferred.accountProfile);
      }
    }, (cause: unknown) => {
      if (!cancelled) setVideoCapabilities({ schema: "muzi.video-publisher.capabilities/1", generatedAt: new Date().toISOString(), accounts: [], unavailableReason: cause instanceof Error ? cause.message : "发布能力不可用" });
    });
    return () => { cancelled = true; };
  }, [muziFace, project?.id, accountEpoch]);

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
    void mzFace.getContent(folderName).then((value) => {
      if (!cancelled) setProductionDetail(value);
    }, (cause: unknown) => {
      if (!cancelled) setProductionError(cause instanceof Error ? cause.message : "视频制作信息不可用");
    });
    return () => { cancelled = true; };
  }, [epoch, mzFace, project?.folderName]);

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

  const openAccountManager = (platform?: MuziVideoPlatform): void => {
    setAccountManagerOpen(true);
    if (platform !== undefined) setAccountAddRequest(current => ({ platform, sequence: (current?.sequence ?? 0) + 1 }));
    requestAnimationFrame(() => { accountManagerRef.current?.scrollIntoView({ block: "nearest" }); if (platform === undefined) accountManagerRef.current?.querySelector<HTMLButtonElement>("[data-add-account]")?.focus(); });
  };
  const verifyAccount = (account: VideoAccount, capability: AcceptanceCapability): void => {
    if (acceptanceSession !== null || publishBusy !== null) return;
    setAcceptancePlatform(account.platform);
    setAcceptanceAccountProfile(account.accountProfile);
    setAcceptanceCapability(capability);
    setAcceptanceBlocker(null);
    setAcceptanceOpen(true);
    requestAnimationFrame(() => { const section = document.getElementById("muzi-publish-acceptance"); section?.scrollIntoView({ block: "nearest" }); section?.querySelector<HTMLButtonElement>("button")?.focus(); });
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
      await mzFace.openPath(evidencePath);
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
  return (
    <article data-plugin="dsh-muzi-creator" data-surface="muzi-inspector">
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
              label: <span className="muziIconLabel">
                {key === "wechat" || key === "xiaohongshu"
                  ? <PlatformMark id={key === "wechat" ? "wechat" : "xhs"} size={20} />
                  : <WorkbenchIcon name={key === "evidence" ? "sources" : key === "production" || key === "video" ? "video" : "content"} />}
                {key === "overview" ? "概览" : key === "evidence" ? "证据" : key === "production" ? "视频制作" : DOCUMENTS.find((item) => item.key === key)?.label}
              </span>,
              children: key === tab ? <div className="muziInspectorBody">
            {tab === "overview" && (
              <div className="muziOverview">
                <ContentOverview project={project} production={productionDetail} productionError={productionError}
                  publication={videoPublish} loadCover={muziFace.getProjectCover} t={t}
                  onOpenDocument={setTab} onOpenProduction={openProduction}
                  onManagePublish={managePublish} managementOpen={publishManagementOpen} />
                <section id="muzi-publish-management" ref={publishManagementRef} className="muziStatusSection videoPublishSection" hidden={!publishManagementOpen} aria-label={t("overview.management.title")}>
                  {publishFlow !== undefined && muziFace.accountManagement !== undefined && <PublishFlowPanel project={project} api={publishFlow} accounts={muziFace.accountManagement} t={t} onChanged={() => { void muziFace.getProject(project.id).then(setProject, () => undefined); }} />}
                  {publishFlow === undefined && <p role="status">发布流程正在加载。</p>}
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
                    icon={<WorkbenchIcon name="knowledge" />}
                    onClick={() => { void openInObsidian(tab as MuziDocumentKey); }}
                  >
                    在 Obsidian 中定位
                  </IslandButton>
                </div>
                <IslandCard className="muziDocumentBody" type={project.content[tab as MuziDocumentKey].trim() === "" ? "dashed" : "default"} color="default">
                  {project.content[tab as MuziDocumentKey].trim() === ""
                    ? <div className="muziInspectorEmpty">暂无{DOCUMENTS.find((item) => item.key === tab)?.label ?? "内容"}。可在主题讨论会话中明确要求 Agent 生成，或在 Obsidian 中编辑。</div>
                    : <MarkdownText text={project.content[tab as MuziDocumentKey]} />}
                </IslandCard>
              </div>
            )}
            {tab === "evidence" && <EvidenceView project={project} />}
            {tab === "production" && <ProductionView detail={productionDetail} error={productionError} face={mzFace} onChange={setProductionDetail} t={t} />}
              </div> : null,
            }))}
          />
        </>
      )}
      {notice !== null && <div className="muziNotice" role="status" aria-live="polite"><span>{notice}</span><IslandButton type="text" size="small" aria-label="关闭提示" onClick={() => { setNotice(null); }}>关闭</IslandButton></div>}
    </article>
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
    <IslandCard className="evidenceDocument" color="default" pattern="default" aria-labelledby={id}>
      <header className="evidenceDocumentHeader">
        <div>
          <h3 id={id}>{title}</h3>
          <p>{description}</p>
        </div>
        <IslandTag size="small" color="default">只读</IslandTag>
      </header>
      {markdown.trim() === ""
        ? <p className="evidenceDocumentEmpty">{emptyText}</p>
        : <div className="evidenceMarkdown"><MarkdownText text={markdown} /></div>}
    </IslandCard>
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
        <IslandTag size="small" color="app-teal">{project.atlasReferences.length} 条引用</IslandTag>
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
          ? <IslandCard type="dashed" className="detailStateCard"><strong>尚未引用正式知识</strong><p>从主题知识发起讨论并生成内容后，引用会显示在这里。</p></IslandCard>
          : (
            <IslandCard className="evidenceReferenceLedger" color="default">
              <ul>
                {project.atlasReferences.map((ref) => (
                  <li key={ref.locator}>
                    <div className="evidenceReferenceTitle">
                      <strong>{ref.title}</strong>
                      <IslandTag size="small" color="default">正式知识</IslandTag>
                    </div>
                    <code>{ref.locator}</code>
                    <small>内容指纹 {ref.sha256.slice(0, 12)}… · 引用于 {formatProjectDate(ref.attachedAt)}</small>
                  </li>
                ))}
              </ul>
            </IslandCard>
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

function ProductionView({ detail, error, face, onChange, t = (key) => zh[key] }: { detail: ContentDetail | null; error: string | null; face: CreatorViewFace; onChange: (next: ContentDetail) => void; t?: (key: CreatorKey) => string }) {
  if (error !== null) return <IslandCard type="dashed" className="detailStateCard error" role="alert"><strong>视频制作信息不可用</strong><p>{error}</p></IslandCard>;
  if (detail === null) return <IslandCard type="dashed" className="detailStateCard"><strong>正在读取视频制作信息</strong><p>正在同步本地制作目录的状态。</p></IslandCard>;
  const progress = videoProductionProgress(detail);
  return (
    <div className="productionView">
      <IslandCard className="productionSummary" color="default" pattern="default">
        <div>
          <h2>本地视频制作</h2>
          <p>{t("production.summary")}</p>
        </div>
        <div className="productionStage">
          <span>当前阶段</span>
          <StatusBadge status={productionStageStatus(progress)} label={progress.complete ? "已就绪" : progress.currentTitle} />
          <small>下一步：{progress.nextAction}</small>
        </div>
      </IslandCard>
      <ProductionProjectControls key={detail.id} detail={detail} face={face} onChange={onChange} t={t} />
      <section className="productionSection" aria-labelledby="production-steps-title">
        <div className="detailSectionHeading">
          <div>
            <h3 id="production-steps-title">阶段进度</h3>
            <p>录制工程、导出、字幕与封面按真实产物同步。</p>
          </div>
        </div>
        <IslandCard className="productionTimeline" color="default">
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
        </IslandCard>
      </section>
    </div>
  );
}
