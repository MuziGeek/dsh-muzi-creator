import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, resolve, sep } from "node:path";

import type { TrellisConfig } from "./config.ts";
import type {
  TrellisEvidenceSummary,
  TrellisProjectCounts,
  TrellisProjectDetail,
  TrellisProjectSummary,
  TrellisProjectId,
  TrellisTask,
  TrellisTaskKey,
  TrellisTaskStatus,
} from "./trellisTypes.ts";

const TASK_JSON = "task.json";
const ARCHIVE_MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const KNOWN_TASK_FIELDS = new Set([
  "id",
  "name",
  "title",
  "description",
  "status",
  "dev_type",
  "scope",
  "package",
  "priority",
  "creator",
  "assignee",
  "createdAt",
  "completedAt",
  "branch",
  "base_branch",
  "worktree_path",
  "commit",
  "pr_url",
  "subtasks",
  "children",
  "parent",
  "relatedFiles",
  "notes",
  "meta",
]);

export interface ResolvedTrellisRoot {
  rootPath: string;
  tasksPath: string;
  scriptsPath: string;
  configPath: string;
}

export interface TrellisProjectSource {
  id: TrellisProjectId;
  path: string;
  title: string;
}

export interface TrellisProjectScan {
  detail: TrellisProjectDetail;
  root: ResolvedTrellisRoot | null;
}

class TrellisRootError extends Error {
  constructor(
    readonly status: TrellisProjectSummary["status"],
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function taskStatus(raw: string | null): TrellisTaskStatus {
  if (raw === "planning" || raw === "in_progress" || raw === "completed") return raw;
  return "unknown";
}

function taskKey(projectId: TrellisProjectId, taskRelativePath: string): TrellisTaskKey {
  return createHash("sha256")
    .update(String(projectId))
    .update("\0")
    .update(taskRelativePath.replaceAll("\\", "/"))
    .digest("hex") as TrellisTaskKey;
}

function normalizedPath(path: string): string {
  const normalized = resolve(path).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function pathIsInside(root: string, candidate: string): boolean {
  const base = normalizedPath(root);
  const child = normalizedPath(candidate);
  return child === base || child.startsWith(`${base}${sep}`);
}

async function containedDirectory(root: string, path: string, label: string): Promise<string> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink()) throw new Error(`${label} 不允许使用符号链接或目录联接`);
  if (!entry.isDirectory()) throw new Error(`${label} 不是目录`);
  const canonical = await realpath(path);
  if (!pathIsInside(root, canonical)) throw new Error(`${label} 逃逸项目根目录`);
  return canonical;
}

async function containedFile(root: string, path: string, maxBytes: number, label: string): Promise<string> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink()) throw new Error(`${label} 不允许使用符号链接`);
  if (!entry.isFile()) throw new Error(`${label} 不是文件`);
  if (entry.size > maxBytes) throw new Error(`${label} 超过 ${String(maxBytes)} 字节限制`);
  const canonical = await realpath(path);
  if (!pathIsInside(root, canonical)) throw new Error(`${label} 逃逸项目根目录`);
  return canonical;
}

function missingCode(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/** Resolve the project path without walking to a parent Git repository. */
export async function resolveTrellisRoot(project: TrellisProjectSource): Promise<ResolvedTrellisRoot> {
  let canonical: string;
  try {
    canonical = await realpath(project.path);
  } catch (error) {
    if (missingCode(error)) throw new TrellisRootError("path-missing", "工作区路径已不存在");
    throw new TrellisRootError("unreadable", `无法解析工作区路径：${String(error)}`);
  }

  let rootEntry;
  try {
    rootEntry = await lstat(canonical);
  } catch (error) {
    throw new TrellisRootError("unreadable", `无法读取工作区路径：${String(error)}`);
  }
  if (!rootEntry.isDirectory()) throw new TrellisRootError("path-missing", "工作区路径不是目录");

  const gitMarker = join(canonical, ".git");
  try {
    const gitEntry = await lstat(gitMarker);
    if (gitEntry.isSymbolicLink() || (!gitEntry.isDirectory() && !gitEntry.isFile())) {
      throw new TrellisRootError("not-git-root", "所选路径的 .git 标记无效");
    }
  } catch (error) {
    if (error instanceof TrellisRootError) throw error;
    if (missingCode(error)) {
      throw new TrellisRootError("not-git-root", "所选路径本身不是 Git 根目录");
    }
    throw new TrellisRootError("unreadable", `无法读取 Git 根目录标记：${String(error)}`);
  }

  const trellisPath = join(canonical, ".trellis");
  const tasksPath = join(trellisPath, "tasks");
  try {
    await containedDirectory(canonical, trellisPath, ".trellis");
    await containedDirectory(canonical, tasksPath, ".trellis/tasks");
  } catch (error) {
    if (missingCode(error)) {
      throw new TrellisRootError("trellis-missing", "项目缺少可读的 .trellis/tasks");
    }
    const message = String(error);
    if (message.includes("不允许") || message.includes("逃逸") || message.includes("不是目录")) {
      throw new TrellisRootError("invalid", message);
    }
    throw new TrellisRootError("unreadable", `无法读取 Trellis 目录：${message}`);
  }

  return {
    rootPath: canonical,
    tasksPath,
    scriptsPath: join(trellisPath, "scripts"),
    configPath: join(trellisPath, "config.yaml"),
  };
}

function nonPlaceholderText(text: string): boolean {
  const plain = text
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/[`#>*_\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length < 20) return false;
  return !/^(?:tbd|todo|待补充|暂无|none|n\/a)[.!。\s]*$/i.test(plain);
}

function meaningfulJson(value: unknown): boolean {
  if (typeof value === "string") return nonPlaceholderText(value);
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(meaningfulJson);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, entry]) => key !== "_example" && meaningfulJson(entry));
}

async function inspectEvidence(
  projectRoot: string,
  taskDirectory: string,
  maxBytes: number,
): Promise<TrellisEvidenceSummary> {
  const files: string[] = [];
  const invalid: string[] = [];
  let meaningful = false;
  const candidates = ["validation.json", "validation.md", "check.jsonl"] as const;

  for (const name of candidates) {
    const path = join(taskDirectory, name);
    try {
      const safePath = await containedFile(projectRoot, path, maxBytes, name);
      const text = await readFile(safePath, "utf8");
      files.push(name);
      if (name === "validation.md") {
        meaningful ||= nonPlaceholderText(text);
      } else if (name === "validation.json") {
        meaningful ||= meaningfulJson(JSON.parse(text));
      } else {
        const rows = text.split(/\r?\n/).filter((line) => line.trim() !== "");
        meaningful ||= rows.some((line) => {
          const parsed: unknown = JSON.parse(line);
          return meaningfulJson(parsed);
        });
      }
    } catch (error) {
      if (missingCode(error)) continue;
      invalid.push(`${name}: ${String(error)}`);
    }
  }

  if (meaningful) {
    return {
      state: "meaningful",
      files,
      message: invalid.length === 0 ? "存在可读且有内容的验证材料" : `验证材料可用，另有 ${String(invalid.length)} 项异常`,
    };
  }
  if (invalid.length > 0) {
    return { state: "invalid", files, message: invalid.join("；") };
  }
  return {
    state: "missing",
    files,
    message: files.length === 0 ? "未找到验证材料" : "验证材料为空或仍是占位内容",
  };
}

async function readTask(
  project: TrellisProjectSource,
  root: ResolvedTrellisRoot,
  directory: string,
  taskRelativePath: string,
  archived: boolean,
  archiveMonth: string | null,
  config: TrellisConfig,
): Promise<TrellisTask> {
  const safeDirectory = await containedDirectory(root.tasksPath, directory, `任务 ${taskRelativePath}`);
  const taskJson = await containedFile(root.tasksPath, join(safeDirectory, TASK_JSON), config.trellisMaxTaskBytes, `${taskRelativePath}/${TASK_JSON}`);
  const parsed: unknown = JSON.parse(await readFile(taskJson, "utf8"));
  if (!isRecord(parsed)) throw new Error(`${taskRelativePath}/${TASK_JSON} 必须是 JSON 对象`);

  const directoryName = basename(safeDirectory);
  const id = stringValue(parsed.id) ?? stringValue(parsed.name) ?? directoryName;
  const name = stringValue(parsed.name) ?? id;
  const rawStatus = stringValue(parsed.status);
  const status = taskStatus(rawStatus);
  const evidence = await inspectEvidence(root.rootPath, safeDirectory, config.trellisMaxTaskBytes);
  const issues: string[] = [];
  if (rawStatus === null) issues.push("任务未声明状态");
  else if (status === "unknown") issues.push(`未知任务状态：${rawStatus}`);
  if (archived && status !== "completed") issues.push("任务已归档，但状态不是 completed");

  const completedAt = stringValue(parsed.completedAt);
  return {
    key: taskKey(project.id, taskRelativePath),
    directory: directoryName,
    id,
    name,
    title: stringValue(parsed.title) ?? name,
    description: stringValue(parsed.description) ?? "",
    status,
    rawStatus,
    priority: stringValue(parsed.priority),
    creator: stringValue(parsed.creator),
    assignee: stringValue(parsed.assignee),
    createdAt: stringValue(parsed.createdAt),
    completedAt,
    branch: stringValue(parsed.branch),
    baseBranch: stringValue(parsed.base_branch),
    commit: stringValue(parsed.commit),
    prUrl: stringValue(parsed.pr_url),
    parent: stringValue(parsed.parent),
    children: stringArray(parsed.children),
    relatedFiles: stringArray(parsed.relatedFiles),
    notes: stringValue(parsed.notes) ?? "",
    archived,
    archiveMonth,
    evidence,
    verifiedCompletion: archived && status === "completed" && completedAt !== null && evidence.state === "meaningful",
    unknownFields: Object.keys(parsed).filter((field) => !KNOWN_TASK_FIELDS.has(field)).sort(),
    issues,
  };
}

function refName(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function markRelationCycles(tasks: TrellisTask[]): void {
  const byRef = new Map<string, TrellisTask>();
  for (const task of tasks) {
    for (const ref of [task.directory, task.id, task.name]) byRef.set(refName(ref), task);
  }
  const visiting = new Set<TrellisTaskKey>();
  const visited = new Set<TrellisTaskKey>();
  const path: TrellisTask[] = [];

  const visit = (task: TrellisTask): void => {
    if (visited.has(task.key)) return;
    const cycleAt = path.findIndex((entry) => entry.key === task.key);
    if (cycleAt >= 0) {
      for (const member of path.slice(cycleAt)) {
        if (!member.issues.includes("父子任务关系存在循环")) member.issues.push("父子任务关系存在循环");
      }
      return;
    }
    if (visiting.has(task.key)) return;
    visiting.add(task.key);
    path.push(task);
    for (const child of task.children) {
      const target = byRef.get(refName(child));
      if (target !== undefined) visit(target);
    }
    path.pop();
    visiting.delete(task.key);
    visited.add(task.key);
  };

  for (const task of tasks) visit(task);
}

async function scanTaskDirectories(
  project: TrellisProjectSource,
  root: ResolvedTrellisRoot,
  config: TrellisConfig,
): Promise<{ active: TrellisTask[]; archived: TrellisTask[]; invalid: number; issues: string[] }> {
  const active: TrellisTask[] = [];
  const archived: TrellisTask[] = [];
  const issues: string[] = [];
  let invalid = 0;
  let visited = 0;

  const add = async (directory: string, taskRelativePath: string, isArchived: boolean, month: string | null): Promise<void> => {
    if (visited >= config.trellisMaxTasks) {
      if (!issues.includes(`任务数量超过 ${String(config.trellisMaxTasks)} 项读取上限`)) {
        issues.push(`任务数量超过 ${String(config.trellisMaxTasks)} 项读取上限`);
      }
      return;
    }
    visited += 1;
    try {
      const task = await readTask(project, root, directory, taskRelativePath, isArchived, month, config);
      (isArchived ? archived : active).push(task);
    } catch (error) {
      invalid += 1;
      issues.push(`${taskRelativePath}: ${String(error)}`);
    }
  };

  const top = await readdir(root.tasksPath, { withFileTypes: true });
  for (const entry of top.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "archive") continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      if (entry.name !== ".DS_Store") {
        invalid += 1;
        issues.push(`${entry.name}: 任务入口不是普通目录`);
      }
      continue;
    }
    await add(join(root.tasksPath, entry.name), entry.name, false, null);
  }

  const archivePath = join(root.tasksPath, "archive");
  try {
    await containedDirectory(root.tasksPath, archivePath, "archive");
    const months = await readdir(archivePath, { withFileTypes: true });
    for (const month of months.sort((a, b) => b.name.localeCompare(a.name))) {
      if (!month.isDirectory() || month.isSymbolicLink() || !ARCHIVE_MONTH.test(month.name)) {
        invalid += 1;
        issues.push(`archive/${month.name}: 归档月份目录格式无效`);
        continue;
      }
      const monthPath = join(archivePath, month.name);
      await containedDirectory(root.tasksPath, monthPath, `archive/${month.name}`);
      const entries = await readdir(monthPath, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          invalid += 1;
          issues.push(`archive/${month.name}/${entry.name}: 归档任务入口不是普通目录`);
          continue;
        }
        await add(
          join(monthPath, entry.name),
          join("archive", month.name, entry.name),
          true,
          month.name,
        );
      }
    }
  } catch (error) {
    if (!missingCode(error)) {
      invalid += 1;
      issues.push(`archive: ${String(error)}`);
    }
  }

  markRelationCycles([...active, ...archived]);
  return { active, archived, invalid, issues };
}

function emptyCounts(): TrellisProjectCounts {
  return { planning: 0, inProgress: 0, completed: 0, unknown: 0, archived: 0, verifiedArchived: 0, invalid: 0 };
}

function countsOf(active: TrellisTask[], archived: TrellisTask[], invalid: number): TrellisProjectCounts {
  const counts = emptyCounts();
  counts.invalid = invalid;
  counts.archived = archived.length;
  counts.verifiedArchived = archived.filter((task) => task.verifiedCompletion).length;
  for (const task of active) {
    if (task.status === "planning") counts.planning += 1;
    else if (task.status === "in_progress") counts.inProgress += 1;
    else if (task.status === "completed") counts.completed += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function failedDetail(project: TrellisProjectSource, status: TrellisProjectSummary["status"], message: string): TrellisProjectDetail {
  return {
    project: {
      projectId: project.id,
      title: project.title,
      rootPath: project.path,
      status,
      statusMessage: message,
      counts: null,
      issues: [message],
    },
    activeTasks: [],
    archivedTasks: [],
    scannedAt: new Date().toISOString(),
  };
}

/** Scan one exact project root and return factual task records or an explicit degraded state. */
export async function scanTrellisProject(project: TrellisProjectSource, config: TrellisConfig): Promise<TrellisProjectScan> {
  let root: ResolvedTrellisRoot;
  try {
    root = await resolveTrellisRoot(project);
  } catch (error) {
    if (error instanceof TrellisRootError) {
      return { detail: failedDetail(project, error.status, error.message), root: null };
    }
    return { detail: failedDetail(project, "unreadable", String(error)), root: null };
  }

  try {
    const result = await scanTaskDirectories(project, root, config);
    const status = result.issues.length === 0 ? "ready" : "degraded";
    const statusMessage = status === "ready"
      ? "Git 与 Trellis 目录可读"
      : `可读取，存在 ${String(result.issues.length)} 项异常`;
    const projectSummary: TrellisProjectSummary = {
      projectId: project.id,
      title: project.title,
      rootPath: root.rootPath,
      status,
      statusMessage,
      counts: countsOf(result.active, result.archived, result.invalid),
      issues: result.issues,
    };
    return {
      root,
      detail: {
        project: projectSummary,
        activeTasks: result.active,
        archivedTasks: result.archived,
        scannedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { detail: failedDetail(project, "unreadable", `读取 Trellis 任务失败：${String(error)}`), root };
  }
}

/** Resolve a user-provided related file only for display/open requests inside the project. */
export function resolveProjectRelativeFile(root: string, value: string): string | null {
  if (value.trim() === "" || isAbsolute(value)) return null;
  const candidate = resolve(root, value);
  return pathIsInside(root, candidate) ? candidate : null;
}

/** Return the archive destination used by Trellis for the Host's current local month. */
export function trellisArchiveDestination(root: ResolvedTrellisRoot, taskDirectory: string, now = new Date()): { month: string; path: string } {
  const month = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { month, path: join(root.tasksPath, "archive", month, taskDirectory) };
}

/** Exposed for focused safety tests. */
export const trellisScanInternals = {
  nonPlaceholderText,
  meaningfulJson,
  refName,
  taskStatus,
};
