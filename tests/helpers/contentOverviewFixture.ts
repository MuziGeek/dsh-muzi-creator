import type { MuziProjectDetail, VideoPublishPlatformResult, VideoPublishStatusResult } from "../../src/muziTypes.ts";
import { emptyBurn, emptyPublish } from "../../src/publishStatus.ts";
import type { ContentDetail } from "../../src/types.ts";

export function contentOverviewProject(patch: Partial<MuziProjectDetail> = {}): MuziProjectDetail {
  return {
    id: "content-overview",
    locator: "muzi://content-overview",
    title: "内容详情概览",
    folderName: "content-overview",
    revision: 3,
    stage: "adaptation",
    primaryDocument: "mother",
    updatedAt: "2026-09-07T08:20:00.000Z",
    coverRevision: null,
    documents: {
      mother: { status: "ready", sha256: null, derivedFrom: null, sourceSha256: null, stale: false },
      video: { status: "draft", sha256: null, derivedFrom: "mother", sourceSha256: null, stale: true },
      wechat: { status: "review", sha256: null, derivedFrom: "mother", sourceSha256: null, stale: false },
      xiaohongshu: { status: "not_started", sha256: null, derivedFrom: "mother", sourceSha256: null, stale: false },
      blog: { status: "ready", sha256: null, derivedFrom: "mother", sourceSha256: null, stale: false },
    },
    publications: {
      bilibili: { status: "unpublished", remoteId: null, url: null, scheduledAt: null, publishedAt: null, source: null },
      douyin: { status: "platform_draft", remoteId: null, url: null, scheduledAt: "2026-09-08T01:00:00.000Z", publishedAt: null, source: "publisher" },
      wechat: { status: "published", remoteId: "wechat-1", url: "https://example.com/wechat-1", scheduledAt: null, publishedAt: "2026-09-06T01:00:00.000Z", source: "sync" },
      xiaohongshu: { status: "unpublished", remoteId: null, url: null, scheduledAt: null, publishedAt: null, source: null },
      blog: { status: "published", remoteId: "blog-1", url: "https://example.com/blog-1", scheduledAt: null, publishedAt: "2026-09-05T01:00:00.000Z", source: "manual" },
    },
    referenceCount: 2,
    brief: "",
    evidence: "",
    review: "",
    content: { mother: "", video: "", wechat: "", xiaohongshu: "", blog: "" },
    atlasReferences: [],
    ...patch,
  };
}

export function contentOverviewProduction(patch: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: "content-overview",
    title: "内容详情概览",
    folderPath: "D:\\content-overview",
    recordedAt: 0,
    createdMs: 0,
    covers: {},
    subtitles: {},
    hasPublishPackage: false,
    hasArticle: false,
    waitingForExport: false,
    tags: [],
    pipeline: "raw",
    workflow: "cut",
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

export function contentOverviewTask(patch: Partial<VideoPublishPlatformResult> = {}): VideoPublishPlatformResult {
  return {
    platform: "xiaohongshu",
    accountProfile: "default",
    mode: "publish_now",
    scheduledAt: null,
    status: "READY_TO_PUBLISH",
    ready: true,
    commitEnabled: true,
    commitBlocker: null,
    approvalSummary: { platform: "xiaohongshu", accountProfile: "default", title: "内容详情概览", mode: "publish_now", scheduledAt: null },
    authorizationDigest: "digest",
    authorizationExpiresAt: "2026-09-08T01:00:00.000Z",
    commitAttemptedAt: null,
    confirmedAt: null,
    remoteId: null,
    url: null,
    ...patch,
  };
}

export function contentOverviewPublication(task: VideoPublishPlatformResult | null = null): VideoPublishStatusResult {
  return {
    id: "content-overview",
    task: task === null ? null : {
      ok: true,
      taskId: "publish-task",
      projectId: "content-overview",
      revision: 3,
      status: "ready",
      createdAt: "2026-09-07T01:00:00.000Z",
      updatedAt: "2026-09-07T01:00:00.000Z",
      platforms: { [task.platform]: task },
    },
    metrics: {},
  };
}
