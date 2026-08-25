import { createHash, randomBytes } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import type { SubprocessOutcome } from "@deepseek-ai/dsh-subprocess";
import { parse as parseYaml } from "yaml";

import { resolveTrellisConfig, type Config, type TrellisConfig } from "./config.ts";
import {
  pathIsInside,
  resolveTrellisRoot,
  scanTrellisProject,
  trellisArchiveDestination,
  type ResolvedTrellisRoot,
  type TrellisProjectScan,
  type TrellisProjectSource,
} from "./trellisScan.ts";
import type {
  ArchiveTrellisTaskRequest,
  GetTrellisProjectRequest,
  PrepareTrellisTaskArchiveRequest,
  TrellisArchivePreview,
  TrellisArchiveResult,
  TrellisArchiveToken,
  TrellisGitChanges,
  TrellisProjectDetail,
  TrellisProjectId,
  TrellisProjectListResult,
  TrellisTask,
  TrellisTaskKey,
} from "./trellisTypes.ts";

interface ArchiveTokenRecord {
  projectId: TrellisProjectId;
  taskKey: TrellisTaskKey;
  digest: string;
  expiresAt: number;
}

interface ManagedCommandResult {
  outcome: SubprocessOutcome | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
}

interface ArchivePreflight {
  preview: TrellisArchivePreview;
  digest: string;
  root: ResolvedTrellisRoot;
}

interface WatchHandle {
  watcher: FSWatcher | null;
  poll: NodeJS.Timeout;
  close: () => void;
}

interface DiscoveredProject {
  source: TrellisProjectSource;
  scanned: TrellisProjectScan;
}

function missingCode(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function taskRef(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function sameTaskRef(task: TrellisTask, value: string): boolean {
  const ref = taskRef(value);
  return [task.directory, task.id, task.name].some((candidate) => taskRef(candidate) === ref);
}

function hashText(...values: string[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value).update("\0");
  return hash.digest("hex");
}

async function fileTextWithin(root: string, path: string, maxBytes: number, label: string): Promise<string> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink()) throw new Error(`${label} 不允许使用符号链接`);
  if (!entry.isFile()) throw new Error(`${label} 不是普通文件`);
  if (entry.size > maxBytes) throw new Error(`${label} 超过 ${String(maxBytes)} 字节限制`);
  const canonical = await realpath(path);
  if (!pathIsInside(root, canonical)) throw new Error(`${label} 逃逸项目根目录`);
  return readFile(canonical, "utf8");
}

function outputOf(read: { readFrom: (offset: number) => { text: string; lossy: boolean } } | undefined): string {
  if (read === undefined) return "";
  const result = read.readFrom(0);
  return result.lossy ? `[输出前部已超出保留上限]\n${result.text}` : result.text;
}

function projectIdForPath(path: string): TrellisProjectId {
  const canonical = process.platform === "win32" ? path.toLocaleLowerCase() : path;
  return `trellis_${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}` as TrellisProjectId;
}

/** Host-side project discovery, Trellis reader, watcher, and controlled archive coordinator. */
export class TrellisProjectService {
  private config: TrellisConfig;
  private revision = 0;
  private disposed = false;
  private readonly tokens = new Map<TrellisArchiveToken, ArchiveTokenRecord>();
  private readonly archiveLocks = new Set<TrellisProjectId>();
  private readonly watches = new Map<TrellisProjectId, WatchHandle>();
  private readonly debounceTimers = new Map<TrellisProjectId, NodeJS.Timeout>();

  constructor(
    private readonly ctx: Context,
    private readonly baseConfig: Config,
  ) {
    this.config = resolveTrellisConfig(baseConfig);
    ctx.effect(() => () => {
      this.dispose();
    }, "dsh-muzi-creator: Trellis project watches");
    void this.refreshWatches();
  }

  /** Effective projects root currently used for discovery. */
  get projectsRoot(): string {
    return this.config.trellisProjectsRoot;
  }

  /**
   * Apply a user-configured projects root override (overlay value). An empty
   * or undefined value falls back to the cordis Config default. No-op when the
   * effective root is unchanged.
   */
  applyProjectsRoot(configured: string | undefined): void {
    const next = resolveTrellisConfig({
      ...this.baseConfig,
      ...(configured === undefined ? {} : { trellisProjectsRoot: configured }),
    });
    if (next.trellisProjectsRoot === this.config.trellisProjectsRoot) return;
    this.config = next;
    this.bumpRevision();
    void this.refreshWatches();
  }

  /** Monotonic, process-local revision for discovered Trellis file changes. */
  get trellisRevision(): number {
    return this.revision;
  }

  /** Release every file watcher, timer, preview token, and archive lock. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const handle of this.watches.values()) handle.close();
    this.watches.clear();
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.tokens.clear();
    this.archiveLocks.clear();
  }

  private bumpRevision(): void {
    this.revision += 1;
  }

  private async discoverSources(signal: AbortSignal): Promise<{ rootPath: string; sources: TrellisProjectSource[] }> {
    signal.throwIfAborted();
    const configuredRoot = this.config.trellisProjectsRoot;
    let rootPath: string;
    try {
      const entry = await lstat(configuredRoot);
      if (entry.isSymbolicLink()) throw new Error("配置的项目目录不能是符号链接或目录联接");
      if (!entry.isDirectory()) throw new Error("配置的项目目录不是文件夹");
      rootPath = await realpath(configuredRoot);
    } catch (error) {
      if (missingCode(error)) throw new Error(`项目目录不存在：${configuredRoot}`);
      throw new Error(`无法读取项目目录 ${configuredRoot}：${String(error)}`);
    }

    const entries = await readdir(rootPath, { withFileTypes: true });
    const sources: TrellisProjectSource[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      signal.throwIfAborted();
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const candidate = join(rootPath, entry.name);
      try {
        const candidateEntry = await lstat(candidate);
        if (candidateEntry.isSymbolicLink() || !candidateEntry.isDirectory()) continue;
        const canonical = await realpath(candidate);
        if (!pathIsInside(rootPath, canonical)) continue;
        sources.push({
          id: projectIdForPath(canonical),
          path: canonical,
          title: basename(canonical),
        });
      } catch {
        // A single unreadable child must not hide the other configured projects.
      }
    }
    return { rootPath, sources };
  }

  private async discover(signal: AbortSignal): Promise<{ rootPath: string; projects: DiscoveredProject[] }> {
    const discovered = await this.discoverSources(signal);
    const scanned = await Promise.all(discovered.sources.map(async (source): Promise<DiscoveredProject> => ({
      source,
      scanned: await scanTrellisProject(source, this.config),
    })));
    return {
      rootPath: discovered.rootPath,
      projects: scanned.filter((project) => project.scanned.root !== null),
    };
  }

  private async requireProject(projectId: TrellisProjectId, signal: AbortSignal): Promise<DiscoveredProject> {
    const discovered = await this.discoverSources(signal);
    const source = discovered.sources.find((entry) => entry.id === projectId);
    if (source === undefined) {
      throw new Error("项目已不在配置目录中，或不再包含可读的 Git 与 .trellis/tasks；请刷新项目列表");
    }
    const scanned = await scanTrellisProject(source, this.config);
    if (scanned.root === null) {
      throw new Error("项目已不在配置目录中，或不再包含可读的 Git 与 .trellis/tasks；请刷新项目列表");
    }
    return { source, scanned };
  }

  async list(signal: AbortSignal): Promise<TrellisProjectListResult> {
    const discovered = await this.discover(signal);
    return {
      projectsRoot: discovered.rootPath,
      trellisRevision: this.revision,
      projects: discovered.projects.map((entry) => entry.scanned.detail.project),
    };
  }

  async get(request: GetTrellisProjectRequest, signal: AbortSignal): Promise<TrellisProjectDetail> {
    return (await this.requireProject(request.projectId, signal)).scanned.detail;
  }

  async prepareArchive(
    request: PrepareTrellisTaskArchiveRequest,
    signal: AbortSignal,
  ): Promise<TrellisArchivePreview> {
    signal.throwIfAborted();
    const preflight = await this.archivePreflight(
      request.projectId,
      request.taskKey,
      signal,
      true,
    );
    return preflight.preview;
  }

  async archive(request: ArchiveTrellisTaskRequest, signal: AbortSignal): Promise<TrellisArchiveResult> {
    signal.throwIfAborted();
    this.purgeExpiredTokens();
    const token = request.token;
    const authority = this.tokens.get(token);
    this.tokens.delete(token);
    if (authority === undefined) throw new Error("归档确认已过期或已使用，请重新检查任务");
    if (authority.expiresAt <= Date.now()) throw new Error("归档确认已过期，请重新检查任务");
    if (this.archiveLocks.has(authority.projectId)) throw new Error("该项目已有归档操作正在执行");

    this.archiveLocks.add(authority.projectId);
    try {
      const current = await this.archivePreflight(
        authority.projectId,
        authority.taskKey,
        signal,
        false,
      );
      if (current.preview.blockers.length > 0 || current.digest !== authority.digest) {
        throw new Error("任务、子任务、Git 摘要或归档目标已变化，请重新确认");
      }

      const scriptPath = join(current.root.scriptsPath, "task.py");
      const command = await this.runManaged(
        [
          this.config.trellisPythonExecutable,
          ...this.config.trellisPythonArgs,
          scriptPath,
          "archive",
          current.preview.task.directory,
          "--no-commit",
        ],
        current.root.rootPath,
        signal,
      );

      this.bumpRevision();
      await this.refreshWatches();
      const refreshed = (await this.requireProject(authority.projectId, signal)).scanned;
      const stillActive = refreshed.detail.activeTasks.some((task) => task.directory === current.preview.task.directory);
      const nowArchived = refreshed.detail.archivedTasks.some((task) => task.directory === current.preview.task.directory);
      const state = nowArchived ? "archived" : stillActive ? "active" : "uncertain";
      const processOk = command.outcome?.exitCode === 0 && !command.timedOut && command.spawnError === null;
      const message = state === "archived"
        ? processOk
          ? "任务已归档；未创建 Git 提交"
          : "任务已移动到归档目录，但进程未正常结束；请检查输出和磁盘状态"
        : state === "active"
          ? "归档未完成，任务仍在活动目录；未自动重试"
          : "无法确定归档结果；已重新读取磁盘，请人工检查后再决定下一步";
      return {
        state,
        message,
        projectId: authority.projectId,
        exitCode: command.outcome?.exitCode ?? null,
        signal: command.outcome?.signal ?? null,
        stdout: command.stdout,
        stderr: command.spawnError === null ? command.stderr : `${command.stderr}${command.stderr === "" ? "" : "\n"}${command.spawnError}`,
        project: refreshed.detail.project,
      };
    } finally {
      this.archiveLocks.delete(authority.projectId);
    }
  }

  private async archivePreflight(
    projectId: TrellisProjectId,
    taskKey: TrellisTaskKey,
    signal: AbortSignal,
    mintToken: boolean,
  ): Promise<ArchivePreflight> {
    signal.throwIfAborted();
    const scanned = (await this.requireProject(projectId, signal)).scanned;
    const root = scanned.root;
    if (root === null) throw new Error(`项目当前不可归档：${scanned.detail.project.statusMessage}`);
    const task = scanned.detail.activeTasks.find((entry) => entry.key === taskKey);
    if (task === undefined) throw new Error("活动任务已变化或不存在，请刷新项目后重试");

    const blockers: string[] = [];
    const warnings: string[] = [];
    if (task.status !== "completed") blockers.push("只有状态为 completed 的任务可以归档");
    const activeChildren = scanned.detail.activeTasks
      .filter((candidate) => task.children.some((child) => sameTaskRef(candidate, child)))
      .map((candidate) => candidate.title);
    if (activeChildren.length > 0) blockers.push("任务仍有关联在活动目录中的子任务");

    const scriptPath = join(root.scriptsPath, "task.py");
    let scriptText = "";
    try {
      scriptText = await fileTextWithin(root.rootPath, scriptPath, this.config.trellisMaxTaskBytes, ".trellis/scripts/task.py");
      if (!/add_argument\(\s*["']--no-commit["']/.test(scriptText)) {
        blockers.push("项目 task.py 不支持 --no-commit，UI 不会执行归档");
      }
    } catch (error) {
      blockers.push(`归档脚本不可用：${String(error)}`);
    }

    let configText = "";
    try {
      configText = await fileTextWithin(root.rootPath, root.configPath, this.config.trellisMaxTaskBytes, ".trellis/config.yaml");
      const parsed: unknown = parseYaml(configText);
      const hooks = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).hooks
        : undefined;
      const afterArchive = typeof hooks === "object" && hooks !== null && !Array.isArray(hooks)
        ? (hooks as Record<string, unknown>).after_archive
        : undefined;
      const configured = typeof afterArchive === "string"
        ? afterArchive.trim() !== ""
        : Array.isArray(afterArchive)
          ? afterArchive.some((entry) => typeof entry === "string" && entry.trim() !== "")
          : afterArchive !== undefined && afterArchive !== null;
      if (configured) blockers.push("项目配置了 hooks.after_archive shell hook，UI 归档已阻止");
    } catch (error) {
      if (!missingCode(error)) blockers.push(`无法安全读取 Trellis 配置：${String(error)}`);
    }

    let git: TrellisGitChanges = { dirty: false, count: 0, sample: [] };
    let gitRaw = "";
    try {
      const statusResult = await this.runManaged(
        [this.config.trellisGitExecutable, "status", "--porcelain=v1", "-z", "--untracked-files=normal"],
        root.rootPath,
        signal,
      );
      if (statusResult.spawnError !== null || statusResult.timedOut || statusResult.outcome?.exitCode !== 0) {
        throw new Error(statusResult.spawnError ?? (statusResult.stderr.trim() || "git status 未正常结束"));
      }
      gitRaw = statusResult.stdout;
      const rows = gitRaw.split("\0").filter(Boolean);
      git = {
        dirty: rows.length > 0,
        count: rows.length,
        sample: rows.slice(0, 8).map((row) => row.length > 3 ? row.slice(3) : row),
      };
    } catch (error) {
      blockers.push(`无法读取 Git 未提交摘要：${String(error)}`);
    }
    if (git.dirty) warnings.push(`项目存在 ${String(git.count)} 项未提交变更；归档不会提交这些变更`);
    if (task.evidence.state !== "meaningful") warnings.push("验证材料不足；归档不代表证据充分");

    const destination = trellisArchiveDestination(root, task.directory);
    try {
      await lstat(destination.path);
      blockers.push(`归档目标已存在：${destination.path}`);
    } catch (error) {
      if (!missingCode(error)) blockers.push(`无法检查归档目标：${String(error)}`);
    }

    const taskJsonText = await fileTextWithin(
      root.rootPath,
      join(root.tasksPath, task.directory, "task.json"),
      this.config.trellisMaxTaskBytes,
      `${task.directory}/task.json`,
    );
    const childSummary = scanned.detail.activeTasks
      .filter((candidate) => task.children.some((child) => sameTaskRef(candidate, child)))
      .map((candidate) => `${candidate.directory}:${candidate.status}:${candidate.completedAt ?? ""}`)
      .sort()
      .join("\n");
    const digest = hashText(
      root.rootPath,
      task.directory,
      taskJsonText,
      childSummary,
      destination.month,
      destination.path,
      gitRaw,
      scriptText,
      configText,
    );

    this.purgeExpiredTokens();
    const token = mintToken && blockers.length === 0
      ? randomBytes(24).toString("base64url") as TrellisArchiveToken
      : null;
    const expiresAt = token === null ? null : Date.now() + this.config.trellisArchivePreviewTtlMs;
    if (token !== null && expiresAt !== null) {
      this.tokens.set(token, { projectId, taskKey, digest, expiresAt });
    }

    return {
      root,
      digest,
      preview: {
        token,
        expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
        projectId,
        task,
        targetMonth: destination.month,
        destination: destination.path,
        evidence: task.evidence,
        git,
        activeChildren,
        warnings,
        blockers,
      },
    };
  }

  private purgeExpiredTokens(): void {
    const now = Date.now();
    for (const [token, authority] of this.tokens) {
      if (authority.expiresAt <= now) this.tokens.delete(token);
    }
  }

  private async runManaged(
    argv: readonly string[],
    cwd: string,
    parentSignal: AbortSignal,
  ): Promise<ManagedCommandResult> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = (): void => { controller.abort(parentSignal.reason); };
    parentSignal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Trellis managed command timed out"));
    }, this.config.trellisCommandTimeoutMs);
    timeout.unref();
    try {
      const executable = await this.ctx.subprocess.resolveExecutable(argv[0] ?? "", undefined, controller.signal);
      const handle = this.ctx.subprocess.spawn({
        argv: [executable, ...argv.slice(1)],
        cwd,
        stdio: {
          stdin: "ignore",
          stdout: { maxBytes: this.config.trellisOutputMaxBytes },
          stderr: { maxBytes: this.config.trellisOutputMaxBytes },
        },
        graceMs: this.config.trellisProcessGraceMs,
        signal: controller.signal,
      });
      let outcome: SubprocessOutcome | null = null;
      let spawnError: string | null = null;
      try {
        outcome = await handle.done;
      } catch (error) {
        spawnError = String(error);
      }
      return {
        outcome,
        stdout: outputOf(handle.collected.stdout),
        stderr: outputOf(handle.collected.stderr),
        timedOut,
        spawnError,
      };
    } catch (error) {
      return { outcome: null, stdout: "", stderr: "", timedOut, spawnError: String(error) };
    } finally {
      clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abort);
    }
  }

  private scheduleRevision(projectId: TrellisProjectId): void {
    if (this.disposed) return;
    const previous = this.debounceTimers.get(projectId);
    if (previous !== undefined) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectId);
      this.bumpRevision();
    }, this.config.trellisWatchDebounceMs);
    timer.unref();
    this.debounceTimers.set(projectId, timer);
  }

  private async treeFingerprint(tasksPath: string): Promise<string> {
    const entries: string[] = [];
    const visit = async (path: string, depth: number): Promise<void> => {
      if (entries.length >= this.config.trellisMaxTasks * 4 || depth > 4) return;
      const children = await readdir(path, { withFileTypes: true });
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entries.length >= this.config.trellisMaxTasks * 4) break;
        if (child.isSymbolicLink()) {
          entries.push(`L:${child.name}`);
          continue;
        }
        const childPath = join(path, child.name);
        if (child.isDirectory()) {
          entries.push(`D:${child.name}`);
          await visit(childPath, depth + 1);
        } else if (child.name === "task.json" || child.name.startsWith("validation") || child.name === "check.jsonl") {
          const info = await stat(childPath);
          entries.push(`F:${child.name}:${String(info.size)}:${String(info.mtimeMs)}`);
        }
      }
    };
    await visit(tasksPath, 0);
    return hashText(...entries);
  }

  private async startWatch(project: TrellisProjectSource): Promise<WatchHandle | null> {
    let root: ResolvedTrellisRoot;
    try {
      root = await resolveTrellisRoot(project);
    } catch {
      return null;
    }
    let watcher: FSWatcher | null = null;
    try {
      watcher = watch(root.tasksPath, { recursive: true, persistent: false }, () => {
        this.scheduleRevision(project.id);
      });
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      watcher = null;
    }

    let fingerprint = await this.treeFingerprint(root.tasksPath).catch(() => "unreadable");
    let polling = false;
    const poll = setInterval(() => {
      if (polling || this.disposed) return;
      polling = true;
      void this.treeFingerprint(root.tasksPath).then((next) => {
        if (next !== fingerprint) {
          fingerprint = next;
          this.scheduleRevision(project.id);
        }
      }).catch(() => {
        if (fingerprint !== "unreadable") {
          fingerprint = "unreadable";
          this.scheduleRevision(project.id);
        }
      }).finally(() => { polling = false; });
    }, this.config.trellisFallbackPollMs);
    poll.unref();

    return {
      watcher,
      poll,
      close: () => {
        watcher?.close();
        clearInterval(poll);
      },
    };
  }

  private async refreshWatches(): Promise<void> {
    if (this.disposed) return;
    for (const handle of this.watches.values()) handle.close();
    this.watches.clear();
    const discovered = await this.discoverSources(new AbortController().signal).catch(() => null);
    if (discovered === null) return;
    for (const project of discovered.sources) {
      if (this.disposed) return;
      const handle = await this.startWatch(project);
      if (handle !== null && !this.disposed) this.watches.set(project.id, handle);
      else handle?.close();
    }
  }
}

/** Exposed for focused relation and archive-output tests. */
export const trellisServiceInternals = { taskRef, sameTaskRef, hashText, outputOf };
