import { describe, expect, it } from "vitest";

import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import type { ContentDetail } from "../src/types.ts";
import { videoProductionProgress } from "../src/client/videoProductionProgress.ts";

function detail(patch: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: "2026-08-25_demo",
    folderPath: "/tmp/demo",
    title: "阶段进度测试",
    recordedAt: 0,
    createdMs: 0,
    covers: {},
    subtitles: {},
    hasPublishPackage: false,
    hasArticle: false,
    waitingForExport: false,
    tags: [],
    pipeline: "raw",
    workflow: "idle",
    publish: emptyPublish(),
    burn: emptyBurn(),
    subtitleJob: emptyBurn(),
    coverJob: emptyBurn(),
    publishCopy: "",
    topicNote: "",
    script: "",
    article: "",
    secrets: {
      subtitle: { kind: "subtitle", ref: "", configured: false, writable: false },
      cover: { kind: "cover", ref: "", configured: false, writable: false },
    },
    ...patch,
  };
}

describe("videoProductionProgress", () => {
  it("maps the workflow before a video exists to preparation, recording, or export", () => {
    expect(videoProductionProgress(detail()).currentStage).toBe("preparing");
    expect(videoProductionProgress(detail({ workflow: "record" })).currentStage).toBe("recording");
    expect(videoProductionProgress(detail({ workflow: "cut" })).currentStage).toBe("editing");
    expect(videoProductionProgress(detail({ workflow: "finish", waitingForExport: true })).currentStage).toBe("editing");
  });

  it("keeps the recording project optional while export is incomplete", () => {
    const progress = videoProductionProgress(detail({ workflow: "cut" }));
    expect(progress.stages[2]?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "studio", status: "optional" }),
      expect.objectContaining({ id: "export", status: "pending" }),
    ]));
  });

  it("treats subtitles and covers as parallel finishing work", () => {
    const progress = videoProductionProgress(detail({ workflow: "finish", videoRaw: "/tmp/demo.mp4" }));
    expect(progress.currentStage).toBe("finishing");
    expect(progress.nextAction).toBe("生成并确认字幕与封面");
    expect(progress.stages[3]?.checks.map((check) => check.id)).toEqual(["subtitle", "burn", "cover"]);
  });

  it("reports the missing side of partially complete finishing work", () => {
    const progress = videoProductionProgress(detail({
      workflow: "finish",
      videoRaw: "/tmp/demo.mp4",
      subtitles: { srt: "/tmp/demo.srt" },
    }));
    expect(progress.nextAction).toBe("生成并确认封面");
    expect(progress.stages[3]?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "subtitle", status: "ready" }),
      expect.objectContaining({ id: "cover", status: "pending" }),
    ]));
  });

  it("keeps a valid artifact complete when a later regeneration fails", () => {
    const progress = videoProductionProgress(detail({
      workflow: "publish",
      videoRaw: "/tmp/demo.mp4",
      videoSubtitled: "/tmp/demo_subtitled.mp4",
      subtitles: { srt: "/tmp/demo.srt" },
      covers: { "3x4": "/tmp/demo.png" },
      subtitleJob: { status: "error", error: "字幕重试失败" },
      coverJob: { status: "error", error: "封面重试失败" },
    }));
    expect(progress.complete).toBe(true);
    expect(progress.currentStage).toBe("ready");
    expect(progress.stages.every((stage) => stage.status === "complete")).toBe(true);
    expect(progress.stages[3]?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "subtitle", status: "ready", warning: "字幕重试失败" }),
      expect.objectContaining({ id: "cover", status: "ready", warning: "封面重试失败" }),
    ]));
  });

  it("marks timeout and failed finishing jobs without inventing completion", () => {
    const exportProgress = videoProductionProgress(detail({ workflow: "finish", exportTimedOut: true }));
    expect(exportProgress.stages[2]?.status).toBe("error");
    expect(exportProgress.nextAction).toBe("检查导出任务并重新导出视频");

    const finishingProgress = videoProductionProgress(detail({
      workflow: "finish",
      videoRaw: "/tmp/demo.mp4",
      subtitleJob: { status: "error", error: "字幕失败" },
    }));
    expect(finishingProgress.stages[3]?.status).toBe("error");
    expect(finishingProgress.nextAction).toBe("检查并重试失败的制作任务");
  });

  it("collapses publish and live into the completed production stage", () => {
    for (const workflow of ["publish", "live"] as const) {
      const progress = videoProductionProgress(detail({
        workflow,
        videoRaw: "/tmp/demo.mp4",
        videoSubtitled: "/tmp/demo_subtitled.mp4",
        covers: { "16x9": "/tmp/demo.png" },
      }));
      expect(progress.currentStage).toBe("ready");
      expect(progress.nextAction).toBe("—");
      expect(progress.complete).toBe(true);
    }
  });
});
