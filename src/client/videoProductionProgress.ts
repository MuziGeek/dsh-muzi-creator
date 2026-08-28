import type { ContentDetail, MediaJob, WorkflowStage } from "../types.ts";

/** The ordered stages shown by the Muzi video-production inspector. */
export const VIDEO_PRODUCTION_STAGES = [
  {
    id: "preparing",
    title: "制作准备",
    description: "确认视频稿并进入录制流程。",
  },
  {
    id: "recording",
    title: "录制",
    description: "完成录制，并准备进入剪辑。",
  },
  {
    id: "editing",
    title: "剪辑与导出",
    description: "完成剪辑，让导出视频稳定落盘。",
  },
  {
    id: "finishing",
    title: "字幕与封面",
    description: "字幕与封面可以并行准备。",
  },
  {
    id: "ready",
    title: "成片就绪",
    description: "视频、字幕材料和封面已经齐全。",
  },
] as const;

export type VideoProductionStageId = (typeof VIDEO_PRODUCTION_STAGES)[number]["id"];
export type VideoProductionStageStatus = "complete" | "current" | "upcoming" | "error";
export type VideoProductionCheckStatus = "ready" | "pending" | "running" | "error" | "optional";

export interface VideoProductionCheck {
  id: string;
  label: string;
  status: VideoProductionCheckStatus;
  detail: string;
  warning?: string;
}

export interface VideoProductionStage {
  id: VideoProductionStageId;
  title: string;
  description: string;
  status: VideoProductionStageStatus;
  checks: VideoProductionCheck[];
}

export interface VideoProductionProgress {
  currentStage: VideoProductionStageId;
  currentTitle: string;
  nextAction: string;
  complete: boolean;
  stages: VideoProductionStage[];
}

function hasVideo(detail: ContentDetail): boolean {
  return detail.videoRaw !== undefined || detail.videoSubtitled !== undefined;
}

function hasSubtitle(detail: ContentDetail): boolean {
  return detail.subtitles.srt !== undefined
    || detail.subtitles.ass !== undefined
    || detail.subtitles.transcript !== undefined
    || detail.videoSubtitled !== undefined;
}

function hasCover(detail: ContentDetail): boolean {
  return detail.covers["3x4"] !== undefined
    || detail.covers["4x3"] !== undefined
    || detail.covers["16x9"] !== undefined;
}

function jobCheck(
  id: string,
  label: string,
  ready: boolean,
  readyDetail: string,
  pendingDetail: string,
  job: MediaJob,
): VideoProductionCheck {
  if (ready) {
    return job.error === undefined
      ? { id, label, status: "ready", detail: readyDetail }
      : { id, label, status: "ready", detail: readyDetail, warning: job.error };
  }
  if (job.status === "error") {
    return {
      id,
      label,
      status: "error",
      detail: job.error ?? `${label}任务失败`,
    };
  }
  if (job.status === "running") {
    return { id, label, status: "running", detail: `${label}处理中` };
  }
  return { id, label, status: "pending", detail: pendingDetail };
}

function optionalCheck(
  id: string,
  label: string,
  ready: boolean,
  readyDetail: string,
  pendingDetail: string,
  job: MediaJob,
): VideoProductionCheck {
  if (ready) {
    return job.error === undefined
      ? { id, label, status: "ready", detail: readyDetail }
      : { id, label, status: "ready", detail: readyDetail, warning: job.error };
  }
  if (job.status === "error") {
    return {
      id,
      label,
      status: "error",
      detail: job.error ?? `${label}任务失败`,
    };
  }
  if (job.status === "running") {
    return { id, label, status: "running", detail: `${label}处理中` };
  }
  return { id, label, status: "optional", detail: pendingDetail };
}

function stageIndexOf(detail: ContentDetail, subtitleReady: boolean, coverReady: boolean): number {
  if (!hasVideo(detail)) {
    if (detail.workflow === "idle") return 0;
    if (detail.workflow === "record") return 1;
    return 2;
  }
  if (!subtitleReady || !coverReady) return 3;
  return 4;
}

function workflowHasStarted(workflow: WorkflowStage): boolean {
  return workflow !== "idle";
}

function stageChecks(detail: ContentDetail, index: number, subtitleReady: boolean, coverReady: boolean): VideoProductionCheck[] {
  if (index === 0) {
    return [{
      id: "workflow",
      label: "制作入口",
      status: workflowHasStarted(detail.workflow) ? "ready" : "pending",
      detail: workflowHasStarted(detail.workflow) ? "已进入视频制作流程" : "尚未进入录制流程",
    }];
  }
  if (index === 1) {
    return [
      {
        id: "recording-workflow",
        label: "录制流程",
        status: workflowHasStarted(detail.workflow) ? "ready" : "pending",
        detail: workflowHasStarted(detail.workflow) ? "已进入录制或后续流程" : "等待进入录制",
      },
      detail.studioPath === undefined
        ? { id: "studio", label: "录屏工程", status: "optional", detail: "未绑定，可手动导入视频" }
        : { id: "studio", label: "录屏工程", status: "ready", detail: "已绑定本地工程" },
    ];
  }
  if (index === 2) {
    const exportCheck: VideoProductionCheck = hasVideo(detail)
      ? { id: "export", label: "导出视频", status: "ready", detail: "视频已稳定落盘" }
      : detail.exportTimedOut === true
        ? { id: "export", label: "导出视频", status: "error", detail: "等待导出超时，请检查导出任务" }
        : detail.waitingForExport
          ? { id: "export", label: "导出视频", status: "running", detail: "正在等待视频稳定落盘" }
          : { id: "export", label: "导出视频", status: "pending", detail: "等待剪辑完成并导出视频" };
    return [
      detail.studioPath === undefined
        ? { id: "studio", label: "录屏工程", status: "optional", detail: "未绑定，可使用目录中的视频素材" }
        : { id: "studio", label: "录屏工程", status: "ready", detail: "已绑定本地工程" },
      exportCheck,
    ];
  }
  if (index === 3) {
    return [
      jobCheck("subtitle", "字幕材料", subtitleReady, "字幕材料已存在", "待生成字幕材料", detail.subtitleJob),
      optionalCheck(
        "burn",
        "带字幕成片",
        detail.videoSubtitled !== undefined,
        "带字幕成片已存在",
        subtitleReady ? "字幕材料已存在，烧录成片可按需继续" : "确认字幕后再烧录成片",
        detail.burn,
      ),
      jobCheck("cover", "视频封面", coverReady, "至少一张封面已存在", "待生成视频封面", detail.coverJob),
    ];
  }
  return [
    { id: "video", label: "视频", status: hasVideo(detail) ? "ready" : "pending", detail: hasVideo(detail) ? "视频已存在" : "视频不可用" },
    { id: "subtitle", label: "字幕材料", status: subtitleReady ? "ready" : "pending", detail: subtitleReady ? "字幕材料已存在" : "字幕材料不可用" },
    { id: "cover", label: "视频封面", status: coverReady ? "ready" : "pending", detail: coverReady ? "封面已存在" : "封面不可用" },
  ];
}

function stageHasBlockingError(checks: readonly VideoProductionCheck[]): boolean {
  return checks.some((check) => check.status === "error" && check.id !== "burn");
}

function stageIndexForAction(detail: ContentDetail, subtitleReady: boolean, coverReady: boolean): number {
  return stageIndexOf(detail, subtitleReady, coverReady);
}

function nextActionOf(detail: ContentDetail, stageIndex: number, subtitleReady: boolean, coverReady: boolean): string {
  if (stageIndex === 0) return "确认视频稿，准备进入录制";
  if (stageIndex === 1) return "完成录制并进入剪辑";
  if (stageIndex === 2) {
    if (detail.exportTimedOut === true) return "检查导出任务并重新导出视频";
    if (detail.waitingForExport) return "等待导出视频稳定落盘";
    return "完成剪辑并导出视频";
  }
  if (stageIndex === 4) return "—";
  const subtitleBusy = !subtitleReady && detail.subtitleJob.status === "running";
  const coverBusy = !coverReady && detail.coverJob.status === "running";
  if (subtitleBusy || coverBusy) return "等待字幕与封面处理完成";
  if ((!subtitleReady && detail.subtitleJob.status === "error") || (!coverReady && detail.coverJob.status === "error")) {
    return "检查并重试失败的制作任务";
  }
  if (!subtitleReady && !coverReady) return "生成并确认字幕与封面";
  if (!subtitleReady) return "生成并确认字幕";
  return "生成并确认封面";
}

/**
 * Derive the read-only video-production progress shown by the Muzi inspector.
 *
 * @param detail Content facts scanned from the local production directory.
 * @returns Ordered stage and artifact status for the overview and detail views.
 */
export function videoProductionProgress(detail: ContentDetail): VideoProductionProgress {
  const subtitleReady = hasSubtitle(detail);
  const coverReady = hasCover(detail);
  const currentIndex = stageIndexForAction(detail, subtitleReady, coverReady);
  const complete = currentIndex === VIDEO_PRODUCTION_STAGES.length - 1;
  const stages = VIDEO_PRODUCTION_STAGES.map((stage, index): VideoProductionStage => {
    const checks = stageChecks(detail, index, subtitleReady, coverReady);
    const status: VideoProductionStageStatus = complete || index < currentIndex
      ? "complete"
      : index === currentIndex
        ? stageHasBlockingError(checks) ? "error" : "current"
        : "upcoming";
    return { ...stage, status, checks };
  });
  const currentStage = VIDEO_PRODUCTION_STAGES[currentIndex] ?? VIDEO_PRODUCTION_STAGES[0];
  return {
    currentStage: currentStage.id,
    currentTitle: currentStage.title,
    nextAction: nextActionOf(detail, currentIndex, subtitleReady, coverReady),
    complete,
    stages,
  };
}
