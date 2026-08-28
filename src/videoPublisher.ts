import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

import { pickPublishPackage } from "./artifacts.ts";
import { cacheIsFresh, loadCollectCache, saveCollectCache } from "./collectCache.ts";
import { collectScriptPath, runCollectPublish } from "./collectEgo.ts";
import type { CollectedPlatform, CollectResult, CollectTarget } from "./collectPublish.ts";
import { filterCollected } from "./collectPublish.ts";
import type { Config } from "./config.ts";
import { expandHomePath, skillDirCandidates } from "./config.ts";
import {
  appendMetricSnapshots,
  latestMetricRows,
  matchMetricPost,
  metricSnapshot,
  readMetricSnapshots,
  type MetricPost,
} from "./muziMetrics.ts";
import type { MuziCreatorService } from "./muziService.ts";
import type {
  MuziPublicationState,
  MuziPublishTarget,
  MuziVideoPlatform,
  PlatformPublishIntent,
  VideoMetricPlatformResult,
  CreatorMetricSnapshot,
  VideoMetricsSyncRequest,
  VideoMetricsSyncResult,
  VideoPublishCommitRequest,
  VideoPublishPlatformResult,
  VideoPublishPrepareRequest,
  VideoPublishStatusRequest,
  VideoPublishStatusResult,
  VideoPublishTaskResult,
} from "./muziTypes.ts";

const VIDEO_PLATFORMS: readonly MuziVideoPlatform[] = ["xiaohongshu", "douyin", "bilibili", "wechat"];
const TO_SKILL_PLATFORM: Record<MuziVideoPlatform, string> = {
  xiaohongshu: "xiaohongshu",
  douyin: "douyin",
  bilibili: "bilibili",
  wechat: "wechat_channels",
};
const FROM_SKILL_PLATFORM: Record<string, MuziVideoPlatform | undefined> = {
  xiaohongshu: "xiaohongshu",
  douyin: "douyin",
  bilibili: "bilibili",
  wechat_channels: "wechat",
  wechat: "wechat",
};

interface TaskIndex {
  schemaVersion: 1;
  projects: Record<string, { taskId: string; updatedAt: string }>;
}

interface SkillTaskPlatform {
  platform?: unknown;
  accountProfile?: unknown;
  mode?: unknown;
  scheduledAt?: unknown;
  status?: unknown;
  ready?: unknown;
  commitEnabled?: unknown;
  commitBlocker?: unknown;
  approvalSummary?: unknown;
  authorizationDigest?: unknown;
  authorizationExpiresAt?: unknown;
  commitAttemptedAt?: unknown;
  confirmedAt?: unknown;
  remoteId?: unknown;
  url?: unknown;
}

interface SkillTaskResult {
  ok?: unknown;
  taskId?: unknown;
  projectId?: unknown;
  revision?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  platforms?: Record<string, SkillTaskPlatform>;
}

function isChild(root: string, target: string): boolean {
  const value = relative(root, target);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && resolve(root, value) === resolve(target);
}

function taskIndexPath(dataDir: string): string {
  return join(dataDir, "video-publish-tasks.json");
}

async function loadTaskIndex(dataDir: string): Promise<TaskIndex> {
  try {
    const value = JSON.parse(await readFile(taskIndexPath(dataDir), "utf8")) as unknown;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const record = value as Partial<TaskIndex>;
      if (record.schemaVersion === 1 && typeof record.projects === "object" && record.projects !== null) return record as TaskIndex;
    }
  } catch {
    // Missing or malformed indexes do not affect task files kept by the publisher.
  }
  return { schemaVersion: 1, projects: {} };
}

async function saveTaskIndex(dataDir: string, index: TaskIndex): Promise<void> {
  const target = taskIndexPath(dataDir);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function rememberTask(dataDir: string, projectId: string, taskId: string): Promise<void> {
  const lockPath = `${taskIndexPath(dataDir)}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await mkdir(lockPath);
      try {
        const index = await loadTaskIndex(dataDir);
        index.projects[projectId] = { taskId, updatedAt: new Date().toISOString() };
        await saveTaskIndex(dataDir, index);
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
      return;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      const info = await stat(lockPath).catch(() => undefined);
      if (info !== undefined && Date.now() - info.mtimeMs > 60_000) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  throw new Error("video publish task index is busy");
}

function parseLastJson(output: string): unknown {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]!); } catch { continue; }
  }
  throw new Error(`video-publisher returned no JSON: ${output.slice(-1200)}`);
}

function publisherError(value: unknown, fallback: string): Error {
  if (typeof value === "object" && value !== null) {
    const error = (value as { error?: { code?: unknown; message?: unknown } }).error;
    if (error && typeof error.message === "string") {
      return Object.assign(new Error(error.message), { code: typeof error.code === "string" ? error.code : "VIDEO_PUBLISHER_ERROR" });
    }
  }
  return new Error(fallback);
}

async function runPublisher(skillDir: string, command: "prepare" | "commit" | "status", request: unknown, signal: AbortSignal): Promise<unknown> {
  const script = join(skillDir, "scripts", "v3", "publisher.mjs");
  const info = await stat(script).catch(() => undefined);
  if (info === undefined || !info.isFile()) throw new Error(`video-publisher Windows runtime is missing: ${script}`);
  return new Promise((resolvePromise, reject) => {
    if (signal.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
    const child = spawn(process.execPath, [script, command], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk: Buffer | string) => { stderr += String(chunk); });
    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify(request));
    const abort = (): void => { child.kill("SIGTERM"); };
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      signal.removeEventListener("abort", abort);
      try {
        const value = parseLastJson(`${stdout}\n${stderr}`);
        if (code !== 0 || (typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false && "error" in value)) {
          reject(publisherError(value, `video-publisher exited ${code}`));
          return;
        }
        resolvePromise(value);
      } catch (cause) {
        reject(cause);
      }
    });
  });
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function mapTask(raw: unknown): VideoPublishTaskResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("video-publisher task result is invalid");
  const source = raw as SkillTaskResult;
  if (typeof source.taskId !== "string" || typeof source.projectId !== "string" || typeof source.revision !== "number") throw new Error("video-publisher task identity is invalid");
  const platforms: Partial<Record<MuziVideoPlatform, VideoPublishPlatformResult>> = {};
  for (const [skillPlatform, value] of Object.entries(source.platforms ?? {})) {
    const platform = FROM_SKILL_PLATFORM[skillPlatform];
    if (platform === undefined) continue;
    const mode = value.mode === "publish_now" || value.mode === "schedule" ? value.mode : "prepare_only";
    const status = typeof value.status === "string" ? value.status as VideoPublishPlatformResult["status"] : "BLOCKED";
    const blocker = typeof value.commitBlocker === "object" && value.commitBlocker !== null
      ? value.commitBlocker as VideoPublishPlatformResult["commitBlocker"]
      : null;
    const rawApproval = typeof value.approvalSummary === "object" && value.approvalSummary !== null
      ? value.approvalSummary as Record<string, unknown>
      : null;
    const approvalPlatform = rawApproval === null ? undefined : FROM_SKILL_PLATFORM[String(rawApproval.platform ?? "")];
    const approvalMode: "publish_now" | "schedule" | null = rawApproval?.mode === "publish_now" || rawApproval?.mode === "schedule"
      ? rawApproval.mode
      : null;
    const approvalScheduledAt = rawApproval === null ? null : nullableString(rawApproval.scheduledAt);
    const approvalSummary = rawApproval !== null
      && approvalPlatform === platform
      && typeof rawApproval.accountProfile === "string"
      && typeof rawApproval.title === "string"
      && approvalMode !== null
      && ((approvalMode === "schedule" && approvalScheduledAt !== null) || (approvalMode === "publish_now" && approvalScheduledAt === null))
      ? {
          platform,
          accountProfile: rawApproval.accountProfile,
          title: rawApproval.title,
          mode: approvalMode,
          scheduledAt: approvalScheduledAt,
        }
      : null;
    platforms[platform] = {
      platform,
      accountProfile: typeof value.accountProfile === "string" ? value.accountProfile : "default",
      mode,
      scheduledAt: nullableString(value.scheduledAt),
      status,
      ready: value.ready === true,
      commitEnabled: value.commitEnabled === true,
      commitBlocker: blocker,
      approvalSummary,
      authorizationDigest: nullableString(value.authorizationDigest),
      authorizationExpiresAt: nullableString(value.authorizationExpiresAt),
      commitAttemptedAt: nullableString(value.commitAttemptedAt),
      confirmedAt: nullableString(value.confirmedAt),
      remoteId: nullableString(value.remoteId),
      url: nullableString(value.url),
    };
  }
  return {
    ok: source.ok === true,
    taskId: source.taskId,
    projectId: source.projectId,
    revision: source.revision,
    status: typeof source.status === "string" ? source.status : "UNKNOWN",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date(0).toISOString(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date(0).toISOString(),
    platforms,
  };
}

export function applyRevisionGate(task: VideoPublishTaskResult, currentRevision: number): VideoPublishTaskResult {
  if (task.revision === currentRevision) return task;
  for (const row of Object.values(task.platforms)) {
    if (row === undefined || row.commitAttemptedAt !== null || row.mode === "prepare_only") continue;
    row.commitEnabled = false;
    row.commitBlocker = {
      code: "REVISION_CONFLICT",
      message: `项目已从 revision ${task.revision} 更新到 ${currentRevision}；请重新准备并重新批准`,
    };
    row.authorizationDigest = null;
    row.authorizationExpiresAt = null;
  }
  return task;
}

function toSkillIntent(intent: PlatformPublishIntent): Record<string, unknown> {
  return {
    platform: TO_SKILL_PLATFORM[intent.platform],
    accountProfile: intent.accountProfile,
    mode: intent.mode,
    ...(intent.scheduledAt === undefined ? {} : { scheduledAt: intent.scheduledAt }),
  };
}

function accountsFromTask(task: VideoPublishTaskResult | null): Partial<Record<MuziVideoPlatform, string>> {
  const accounts: Partial<Record<MuziVideoPlatform, string>> = {};
  if (task === null) return accounts;
  for (const platform of VIDEO_PLATFORMS) {
    const row = task.platforms[platform];
    if (row !== undefined) accounts[platform] = row.accountProfile;
  }
  return accounts;
}

function metricsCacheKey(
  platforms: readonly MuziVideoPlatform[],
  targets: readonly CollectTarget[],
  accounts: Partial<Record<MuziVideoPlatform, string>>,
): string {
  const payload = platforms.map((platform) => {
    const target = targets.find((item) => item.platform === platform);
    return {
      platform,
      accountProfile: accounts[platform] ?? "default",
      title: target?.title ?? "",
      remoteIds: [...(target?.remoteIds ?? [])].sort(),
      urls: [...(target?.urls ?? [])].sort(),
    };
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function asMetricPosts(page: CollectedPlatform): MetricPost[] {
  return page.items.map((item) => ({
    title: item.title,
    ...(item.remoteId === undefined ? {} : { remoteId: item.remoteId }),
    ...(item.url === undefined ? {} : { url: item.url }),
    ...(item.views === undefined ? {} : { views: item.views }),
    ...(item.likes === undefined ? {} : { likes: item.likes }),
    ...(item.comments === undefined ? {} : { comments: item.comments }),
  }));
}

export class VideoPublisherService {
  readonly dataDir: string;
  readonly skillDir: string;
  readonly muzi: MuziCreatorService;

  constructor(config: Config, dataDir: string, muzi: MuziCreatorService) {
    this.dataDir = dataDir;
    this.muzi = muzi;
    const configured = config.videoPublisherSkillDir?.trim();
    const local = join(resolve(config.creatorRoot), ".agents", "skills", "video-publisher");
    const candidates = [
      configured ? expandHomePath(configured) : undefined,
      process.env.VIDEO_PUBLISHER_SKILL,
      local,
      ...skillDirCandidates("video-publisher", homedir()),
    ].filter((value): value is string => value !== undefined && value !== "");
    this.skillDir = candidates.find((candidate) => {
      try { return statSync(join(candidate, "SKILL.md")).isFile(); } catch { return false; }
    }) ?? local;
  }

  private async packagePath(id: string, requested?: string): Promise<{ root: string; packagePath: string; manifestPath: string }> {
    const root = await realpath(await this.muzi.projectRootPath(id));
    let packagePath: string;
    if (requested !== undefined && requested.trim() !== "") {
      packagePath = await realpath(resolve(requested));
      if (!isChild(root, packagePath)) throw new Error("publish package must stay inside the current Creator project");
    } else {
      const name = pickPublishPackage(await readdir(root));
      if (name === undefined) throw new Error("current Creator project has no publish-package.json");
      packagePath = join(root, name);
    }
    const info = await stat(packagePath);
    if (!info.isFile()) throw new Error("publish package is not a regular file");
    return { root, packagePath, manifestPath: join(root, "project.yml") };
  }

  async prepare(request: VideoPublishPrepareRequest, signal: AbortSignal): Promise<VideoPublishTaskResult> {
    signal.throwIfAborted();
    if (request.confirmed !== true) throw new Error("current-run approval is required before preparing external platform pages");
    const project = await this.muzi.getProject({ id: request.id });
    if (project.revision !== request.expectedRevision) throw new Error(`revision conflict: expected ${request.expectedRevision}, current ${project.revision}`);
    const paths = await this.packagePath(request.id, request.packagePath);
    const raw = await runPublisher(this.skillDir, "prepare", {
      projectId: request.id,
      revision: request.expectedRevision,
      packagePath: paths.packagePath,
      projectManifestPath: paths.manifestPath,
      intents: request.intents.map(toSkillIntent),
      confirmed: true,
      originalRightsConfirmed: request.originalRightsConfirmed === true,
    }, signal);
    const task = mapTask(raw);
    await rememberTask(this.dataDir, request.id, task.taskId);
    return task;
  }

  async commit(request: VideoPublishCommitRequest, signal: AbortSignal): Promise<VideoPublishTaskResult> {
    signal.throwIfAborted();
    if (request.confirmed !== true) throw new Error("current-run final submission approval is required");
    const before = await this.muzi.getProject({ id: request.id });
    if (before.revision !== request.expectedRevision) throw new Error(`revision conflict: expected ${request.expectedRevision}, current ${before.revision}`);
    const raw = await runPublisher(this.skillDir, "commit", {
      projectId: request.id,
      revision: request.expectedRevision,
      taskId: request.taskId,
      platform: TO_SKILL_PLATFORM[request.platform],
      authorizationDigest: request.authorizationDigest,
      confirmed: true,
    }, signal) as { task?: unknown };
    const task = mapTask(raw.task ?? raw);
    const row = task.platforms[request.platform];
    if (row === undefined) throw new Error("committed platform is missing from task result");
    if (row.status === "SCHEDULE_CONFIRMED") {
      await this.muzi.patchPublicationStates(request.id, request.expectedRevision, {
        [request.platform]: {
          status: "platform_draft",
          remoteId: row.remoteId,
          url: row.url,
          scheduledAt: row.scheduledAt,
          publishedAt: null,
          source: "publisher",
        },
      });
    } else if (row.status === "PUBLISHED_CONFIRMED") {
      await this.muzi.patchPublicationStates(request.id, request.expectedRevision, {
        [request.platform]: {
          status: "published",
          remoteId: row.remoteId,
          url: row.url,
          scheduledAt: null,
          publishedAt: row.confirmedAt,
          source: "publisher",
        },
      });
    }
    return task;
  }

  async status(request: VideoPublishStatusRequest, signal: AbortSignal): Promise<VideoPublishStatusResult> {
    signal.throwIfAborted();
    const project = await this.muzi.getProject({ id: request.id });
    const taskId = request.taskId ?? (await loadTaskIndex(this.dataDir)).projects[request.id]?.taskId;
    let task: VideoPublishTaskResult | null = null;
    if (taskId !== undefined) {
      try { task = mapTask(await runPublisher(this.skillDir, "status", { taskId }, signal)); } catch (cause) {
        if ((cause as { code?: unknown }).code !== "TASK_NOT_FOUND") throw cause;
      }
      if (task !== null && task.projectId !== request.id) throw new Error("video publish task belongs to another project");
      if (task !== null) applyRevisionGate(task, project.revision);
    }
    return { id: request.id, task, metrics: latestMetricRows(await readMetricSnapshots(this.dataDir), request.id) };
  }

  async syncMetrics(request: VideoMetricsSyncRequest, signal: AbortSignal): Promise<VideoMetricsSyncResult> {
    signal.throwIfAborted();
    if (request.confirmed !== true) throw new Error("current-run approval is required before reading external creator pages");
    const project = await this.muzi.getProject({ id: request.id });
    if (project.revision !== request.expectedRevision) throw new Error(`revision conflict: expected ${request.expectedRevision}, current ${project.revision}`);
    const requested = request.platforms?.length
      ? request.platforms
      : VIDEO_PLATFORMS.filter((platform) => {
        const row = project.publications[platform];
        return row.status === "published" || (row.status === "platform_draft" && row.scheduledAt !== null);
      });
    const platforms = [...new Set(requested)];
    const observedAt = new Date().toISOString();
    if (platforms.length === 0) return { id: request.id, revision: project.revision, cached: false, observedAt, platforms: [] };
    const currentStatus = await this.status({ id: request.id }, signal);
    const titleByPlatform = Object.fromEntries(platforms.map((platform) => [
      platform,
      currentStatus.task?.platforms[platform]?.approvalSummary?.title ?? project.title,
    ])) as Record<MuziVideoPlatform, string>;
    const targets: CollectTarget[] = platforms.map((platform) => {
      const publication = project.publications[platform];
      return {
        platform,
        title: titleByPlatform[platform],
        ...(publication.remoteId === null ? {} : { remoteIds: [publication.remoteId] }),
        ...(publication.url === null ? {} : { urls: [publication.url] }),
      };
    });
    const accounts = accountsFromTask(currentStatus.task);
    const contextKey = metricsCacheKey(platforms, targets, accounts);
    const cached = await loadCollectCache(this.dataDir);
    const cachedSlice = cached === undefined ? undefined : filterCollected(cached.result, platforms);
    const cacheComplete = cached?.contextKey === contextKey
      && cachedSlice !== undefined
      && platforms.every((platform) => cachedSlice.collected.some((page) => page.platform === platform));
    let result: CollectResult;
    let fromCache = false;
    if (request.force !== true && cached !== undefined && cacheIsFresh(cached.fetchedAt) && cacheComplete) {
      result = cachedSlice;
      fromCache = true;
    } else {
      result = await runCollectPublish(collectScriptPath(), signal, {
        platforms,
        targets,
        accounts,
      });
      await saveCollectCache(this.dataDir, result, { scope: "partial", contextKey });
    }
    const snapshotsBefore = await readMetricSnapshots(this.dataDir);
    const newSnapshots: CreatorMetricSnapshot[] = [];
    const platformResults: VideoMetricPlatformResult[] = [];
    const publicationUpdates: Partial<Record<MuziPublishTarget, MuziPublicationState>> = {};
    for (const platform of platforms) {
      const page = result.collected.find((item) => item.platform === platform);
      if (page === undefined) {
        platformResults.push({ platform, status: "ERROR", message: "collector returned no platform result", latest: null });
        continue;
      }
      if (page.loginRequired === true) {
        platformResults.push({ platform, status: "LOGIN_REQUIRED", message: "平台登录已失效或需要验证", latest: null });
        continue;
      }
      if (page.error !== undefined) {
        const incomplete = /pagination|分页|MAX_PAGES/i.test(page.error);
        platformResults.push({ platform, status: incomplete ? "PAGINATION_INCOMPLETE" : "ERROR", message: page.error, latest: null });
        continue;
      }
      const known = project.publications[platform];
      const matched = matchMetricPost({ remoteId: known.remoteId, url: known.url, title: titleByPlatform[platform] }, asMetricPosts(page));
      if (matched.status === "AMBIGUOUS") {
        platformResults.push({ platform, status: "AMBIGUOUS", message: `精确标题匹配到 ${matched.candidates.length} 个作品，未自动绑定`, latest: null });
        continue;
      }
      if (matched.status === "NOT_FOUND") {
        platformResults.push({ platform, status: "NOT_FOUND", message: "未找到远端作品", latest: null });
        continue;
      }
      const snapshot = metricSnapshot(request.id, platform, matched.post, observedAt);
      if (!fromCache) newSnapshots.push(snapshot);
      const latest = latestMetricRows([...snapshotsBefore, snapshot], request.id)[platform] ?? null;
      platformResults.push({ platform, status: fromCache ? "CACHED" : "SYNCED", message: null, latest });
      const nextRemoteId = matched.post.remoteId ?? known.remoteId;
      const nextUrl = matched.post.url ?? known.url;
      if (known.status !== "published" || nextRemoteId !== known.remoteId || nextUrl !== known.url) {
        publicationUpdates[platform] = {
          status: "published",
          remoteId: nextRemoteId,
          url: nextUrl,
          scheduledAt: known.scheduledAt,
          publishedAt: known.publishedAt,
          source: known.source === "publisher" ? "publisher" : "sync",
        };
      }
    }
    if (!fromCache) await appendMetricSnapshots(this.dataDir, newSnapshots);
    let revision = project.revision;
    if (Object.keys(publicationUpdates).length > 0) {
      revision = (await this.muzi.patchPublicationStates(request.id, project.revision, publicationUpdates)).revision;
    }
    return { id: request.id, revision, cached: fromCache, observedAt, platforms: platformResults };
  }
}
