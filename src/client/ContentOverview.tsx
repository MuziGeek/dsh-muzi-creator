import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
import type {
  MuziDocumentKey,
  MuziDocumentStatus,
  MuziProjectDetail,
  MuziProjectStage,
  MuziPublicationState,
  MuziPublishTarget,
  MuziVideoPlatform,
  VideoPublishPlatformResult,
  VideoPublishState,
  VideoPublishStatusResult,
} from "../muziTypes.ts";
import type { ContentDetail } from "../types.ts";
import type { MuziViewFace } from "./face.ts";
import { MuziProjectCover } from "./MuziProjectCover.tsx";
import { PlatformMark, type PlatformId } from "./PlatformMark.tsx";
import { videoProductionProgress, type VideoProductionStageId } from "./videoProductionProgress.ts";
import { IslandButton, IslandTag, type IslandTagProps } from "./ui/IslandControls.tsx";
import { overviewZh, type OverviewCopyKey } from "./overviewCopy.ts";
import "./ContentOverview.css";

const DOCUMENTS: ReadonlyArray<{ key: MuziDocumentKey; label: OverviewCopyKey }> = [
  { key: "mother", label: "overview.document.mother" },
  { key: "video", label: "overview.document.video" },
  { key: "wechat", label: "overview.document.wechat" },
  { key: "xiaohongshu", label: "overview.document.xiaohongshu" },
  { key: "blog", label: "overview.document.blog" },
];

const PLATFORMS: ReadonlyArray<{ key: MuziPublishTarget; label: string; icon: PlatformId; blog?: true }> = [
  { key: "bilibili", label: "B站", icon: "bilibili" },
  { key: "douyin", label: "抖音", icon: "douyin" },
  { key: "wechat", label: "视频号", icon: "wechat" },
  { key: "xiaohongshu", label: "小红书", icon: "xhs" },
  { key: "blog", label: "overview.blog", icon: "article", blog: true },
];

const STAGE_KEYS: Record<MuziProjectStage, OverviewCopyKey> = {
  idea: "overview.stage.idea",
  research: "overview.stage.research",
  mother_draft: "overview.stage.mother_draft",
  adaptation: "overview.stage.adaptation",
  review: "overview.stage.review",
  ready: "overview.stage.ready",
  archived: "overview.stage.archived",
};

const DOCUMENT_STATUS_KEYS: Record<MuziDocumentStatus, OverviewCopyKey> = {
  not_started: "overview.document.not_started",
  draft: "overview.document.draft",
  review: "overview.document.review",
  ready: "overview.document.ready",
};

const TASK_KEYS: Partial<Record<VideoPublishState, OverviewCopyKey>> = {
  NEW: "overview.task.new",
  PREPARING: "overview.task.preparing",
  READY_DRAFT: "overview.task.readyDraft",
  READY_TO_PUBLISH: "overview.task.readyPublish",
  READY_TO_SCHEDULE: "overview.task.readySchedule",
  PUBLISHED_CONFIRMED: "overview.task.published",
  SCHEDULE_CONFIRMED: "overview.task.scheduled",
  BLOCKED: "overview.task.blocked",
  COMMIT_UNKNOWN: "overview.task.unknown",
};

const PRODUCTION_STAGE_KEYS: Record<VideoProductionStageId, OverviewCopyKey> = {
  preparing: "overview.productionStage.preparing",
  recording: "overview.productionStage.recording",
  editing: "overview.productionStage.editing",
  finishing: "overview.productionStage.finishing",
  ready: "overview.productionStage.ready",
};

const NEXT_ACTION_KEYS: Record<string, OverviewCopyKey> = {
  "确认视频稿，准备进入录制": "overview.next.preparing",
  "完成录制并进入剪辑": "overview.next.recording",
  "检查导出任务并重新导出视频": "overview.next.exportError",
  "等待导出视频稳定落盘": "overview.next.waitingExport",
  "完成剪辑并导出视频": "overview.next.editing",
  "—": "overview.next.complete",
  "等待字幕与封面处理完成": "overview.next.waitingFinish",
  "检查并重试失败的制作任务": "overview.next.finishError",
  "生成并确认字幕与封面": "overview.next.finishBoth",
  "生成并确认字幕": "overview.next.subtitle",
  "生成并确认封面": "overview.next.cover",
};

type TagColor = NonNullable<IslandTagProps["color"]>;

function tagColor(status: string): TagColor {
  if (status === "BLOCKED" || status === "COMMIT_UNKNOWN") return "app-red";
  if (status === "READY_TO_PUBLISH" || status === "READY_TO_SCHEDULE" || status === "review") return "app-yellow";
  if (["ready", "published", "PUBLISHED_CONFIRMED", "SCHEDULE_CONFIRMED"].includes(status)) return "app-green";
  if (["draft", "platform_draft", "PREPARING", "READY_DRAFT"].includes(status)) return "app-teal";
  return "brown";
}

function formatDate(value: string, t: (key: OverviewCopyKey) => string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return t("overview.timeUnavailable");
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function nextActionLabel(value: string, t: (key: OverviewCopyKey) => string): string {
  const key = NEXT_ACTION_KEYS[value];
  return key === undefined ? value : t(key);
}

function publicationFact(state: MuziPublicationState, t: (key: OverviewCopyKey) => string): { label: string; color: TagColor; time: string | null } {
  if (state.status === "published") {
    return { label: t("overview.published"), color: "app-green", time: state.publishedAt };
  }
  if (state.status === "platform_draft" && state.scheduledAt !== null) {
    return { label: t("overview.scheduled"), color: "app-teal", time: state.scheduledAt };
  }
  if (state.status === "platform_draft") return { label: t("overview.platformDraft"), color: "app-teal", time: null };
  return { label: t("overview.unpublished"), color: "brown", time: null };
}

function taskMessage(task: VideoPublishPlatformResult, t: (key: OverviewCopyKey) => string): string {
  const key = TASK_KEYS[task.status];
  const state = key === undefined ? `${t("overview.task.other")} ${task.status}` : t(key);
  return task.commitBlocker === null ? state : `${state}：${task.commitBlocker.message}`;
}

function needsAttention(task: VideoPublishPlatformResult): boolean {
  return task.commitBlocker !== null
    || task.status === "READY_TO_PUBLISH"
    || task.status === "READY_TO_SCHEDULE"
    || task.status === "BLOCKED"
    || task.status === "COMMIT_UNKNOWN";
}

export interface ContentOverviewProps {
  project: MuziProjectDetail;
  production: ContentDetail | null;
  productionError: string | null;
  publication: VideoPublishStatusResult | null;
  loadCover: MuziViewFace["getProjectCover"];
  onOpenDocument: (key: MuziDocumentKey) => void;
  onOpenProduction: () => void;
  onManagePublish: (platform?: MuziVideoPlatform) => void;
  managementOpen?: boolean;
  t?: (key: OverviewCopyKey) => string;
}

/** Compact project details overview with durable content, production, and publication facts. */
export function ContentOverview({
  project,
  production,
  productionError,
  publication,
  loadCover,
  onOpenDocument,
  onOpenProduction,
  onManagePublish,
  managementOpen = false,
  t: translate,
}: ContentOverviewProps) {
  const t = translate ?? ((key: OverviewCopyKey) => overviewZh[key]);
  const progress = production === null ? null : videoProductionProgress(production);
  return (
    <div className="contentOverview">
      <header className="contentOverviewHeader">
        <MuziProjectCover id={project.id} title={project.title} revision={project.coverRevision} load={loadCover} className="contentOverviewCover" />
        <div className="contentOverviewTitle">
          <div className="contentOverviewTitleLine">
            <h1 id="muzi-workbench-detail-title" tabIndex={-1}>{project.title}</h1>
            <IslandTag size="small" variant="soft" color={tagColor(project.stage)}>{t(STAGE_KEYS[project.stage])}</IslandTag>
          </div>
          <p>{t("overview.updated")} <time dateTime={project.updatedAt}>{formatDate(project.updatedAt, t)}</time></p>
        </div>
      </header>

      <div className="contentOverviewColumns">
        <section className="contentOverviewSection contentOverviewProductionSection" aria-labelledby="content-overview-production-title">
          <div className="contentOverviewHeading">
            <h2 className="muziIconLabel" id="content-overview-production-title"><WorkbenchIcon name="video" />{t("overview.production")}</h2>
            <IslandButton type="default" size="small" onClick={onOpenProduction}>{t("overview.openProduction")}</IslandButton>
          </div>
          {productionError !== null
            ? <div className="contentOverviewState contentOverviewError" role="alert"><strong>{t("overview.productionError")}</strong><p>{productionError}</p></div>
            : progress === null
              ? <div className="contentOverviewState" aria-busy="true"><strong>{t("overview.productionLoading")}</strong></div>
              : <div className="contentOverviewProduction"><strong>{t(PRODUCTION_STAGE_KEYS[progress.currentStage])}</strong><p>{t("overview.nextAction")} {nextActionLabel(progress.nextAction, t)}</p></div>}
        </section>

        <section className="contentOverviewSection contentOverviewDocumentsSection" aria-labelledby="content-overview-documents-title">
          <div className="contentOverviewHeading"><h2 className="muziIconLabel" id="content-overview-documents-title"><WorkbenchIcon name="content" />{t("overview.documents")}</h2></div>
          <div className="contentOverviewDocuments">
            {DOCUMENTS.map((document) => {
              const state = project.documents[document.key];
              return <IslandButton
                key={document.key}
                type="text"
                size="small"
                className="contentOverviewDocument"
                aria-label={`${t(document.label)}：${t(DOCUMENT_STATUS_KEYS[state.status])}`}
                onClick={() => { onOpenDocument(document.key); }}
              >
                <span className="contentOverviewDocumentTitle">{t(document.label)}</span>
                <IslandTag size="small" variant="soft" color={tagColor(state.status)}>{t(DOCUMENT_STATUS_KEYS[state.status])}</IslandTag>
                {state.stale && <small>{t("overview.stale")}</small>}
              </IslandButton>;
            })}
          </div>
        </section>
        <section className="contentOverviewSection contentOverviewPublicationSection" aria-labelledby="content-overview-publication-title">
          <div className="contentOverviewHeading">
            <h2 className="muziIconLabel" id="content-overview-publication-title"><WorkbenchIcon name="publishing" />{t("overview.publication")}</h2>
            <IslandButton
              type="default"
              size="small"
              aria-controls="muzi-publish-management"
              aria-expanded={managementOpen}
              onClick={() => { onManagePublish(); }}
            >{t("overview.managePublication")}</IslandButton>
          </div>
          <div className="contentOverviewPublications">
          {PLATFORMS.map((platform) => {
            const fact = publicationFact(project.publications[platform.key], t);
            const task = platform.key === "blog" ? undefined : publication?.task?.platforms[platform.key];
            const platformName = platform.blog ? t("overview.blog") : platform.label;
            return <div className="contentOverviewPublication" key={platform.key}>
              <div className="contentOverviewPublicationFact">
                <span className="contentOverviewPlatform"><PlatformMark id={platform.icon} size={17} /><strong>{platformName}</strong></span>
                <IslandTag size="small" variant="soft" color={fact.color}>{fact.label}</IslandTag>
              </div>
              {(fact.time !== null || project.publications[platform.key].url !== null) && <div className="contentOverviewPublicationMeta">
                {fact.time !== null && <time dateTime={fact.time}>{formatDate(fact.time, t)}</time>}
                {project.publications[platform.key].url !== null && <a href={project.publications[platform.key].url!} target="_blank" rel="noreferrer"><WorkbenchIcon name="external-link" />{platform.blog ? t("overview.openArticle") : t("overview.openWork")}</a>}
              </div>}
              {task !== undefined && <div className={`contentOverviewTask ${needsAttention(task) ? "attention" : ""}`}>
                {needsAttention(task)
                  ? <IslandButton type="text" size="small" aria-label={`${platformName}：${taskMessage(task, t)}`} onClick={() => { onManagePublish(task.platform); }}>{taskMessage(task, t)}</IslandButton>
                  : <small>{taskMessage(task, t)}</small>}
              </div>}
            </div>;
          })}
          </div>
        </section>
      </div>
    </div>
  );
}
