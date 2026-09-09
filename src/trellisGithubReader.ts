import { createHash } from "node:crypto";
import { z } from "zod";
import { countsOf, markRelationCycles, parseTrellisTask, trellisScanInternals } from "./trellisScan.ts";
import { GithubApi, GithubRequestError } from "./trellisGithubApi.ts";
import type { GithubSelection } from "./trellisGithubSchemas.ts";
import type { TrellisEvidenceSummary, TrellisProjectDetail, TrellisProjectId, TrellisTask } from "./trellisTypes.ts";

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const treeSchema = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string(), mode: z.string(), type: z.string(), sha: shaSchema })) });

/** Repository and branch identity is independent of host paths and successive commits. */
export function githubProjectId(selection: GithubSelection): TrellisProjectId {
  return `github_${createHash("sha256").update(`${selection.owner.toLowerCase()}/${selection.repo.toLowerCase()}\0${selection.branch}`).digest("hex").slice(0, 32)}` as TrellisProjectId;
}

/** Read only task metadata and evidence from a single commit; repository scripts are never downloaded or run. */
export async function readGithubTrellis(
  api: GithubApi, selection: GithubSelection, token: string | undefined, signal: AbortSignal,
  limits: { maxTasks: number; maxTaskBytes: number; concurrency: number }, previous?: TrellisProjectDetail,
): Promise<TrellisProjectDetail> {
  const readsAbort = new AbortController();
  signal = AbortSignal.any([signal, readsAbort.signal]);
  const prefix = `/repos/${encodeURIComponent(selection.owner)}/${encodeURIComponent(selection.repo)}`;
  const projectId = githubProjectId(selection);
  const commit = z.object({ sha: shaSchema, commit: z.object({ tree: z.object({ sha: shaSchema }) }) }).parse(
    await api.request(`${prefix}/commits/${encodeURIComponent(selection.branch)}`, token, signal),
  );
  let syncedAt = new Date().toISOString();
  if (previous?.project.github?.sha === commit.sha && previous.project.status === "ready") {
    return { ...previous, scannedAt: syncedAt, project: { ...previous.project, github: { ...previous.project.github, syncedAt, stale: false } } };
  }
  const tree = async (sha: string, recursive = false) => {
    const result = treeSchema.parse(await api.request(`${prefix}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`, token, signal));
    if (result.truncated) throw new Error("GitHub 目录结果被截断，无法提供完整任务统计");
    return result.tree;
  };
  const folder = async (sha: string, name: string): Promise<string> => {
    const entry = (await tree(sha)).find((item) => item.path === name && item.type === "tree" && item.mode === "040000");
    if (!entry) throw new Error("所选分支未发现可读的 .trellis/tasks");
    return entry.sha;
  };
  const tasksSha = await folder(await folder(commit.commit.tree.sha, ".trellis"), "tasks");
  const entries = await tree(tasksSha, true);
  const files = new Map(entries.map((entry) => [entry.path, entry]));
  const paths = entries.filter((entry) => /^(?:[^/]+|archive\/\d{4}-(?:0[1-9]|1[0-2])\/[^/]+)\/task\.json$/.test(entry.path));
  if (paths.length > limits.maxTasks) throw new Error("任务数量超过读取上限，无法提供完整任务统计");
  const blob = async (path: string): Promise<string> => {
    const entry = files.get(path);
    if (!entry || entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) throw new Error("任务文件必须是普通文件");
    if (!token) {
      const text = await api.publicFile(`/${selection.owner}/${selection.repo}/${commit.sha}/.trellis/tasks/${path.split("/").map(encodeURIComponent).join("/")}`, signal);
      if (Buffer.byteLength(text) > limits.maxTaskBytes) throw new Error("任务文件超过读取上限");
      return text;
    }
    const result = z.object({ encoding: z.literal("base64"), content: z.string(), size: z.number().int().nonnegative() }).parse(
      await api.request(`${prefix}/git/blobs/${entry.sha}`, token, signal),
    );
    const bytes = Buffer.from(result.content, "base64");
    if (result.size > limits.maxTaskBytes || bytes.length > limits.maxTaskBytes) throw new Error("任务文件超过读取上限");
    return bytes.toString("utf8");
  };
  const active: TrellisTask[] = [], archived: TrellisTask[] = [], issues: string[] = [];
  let invalid = 0;
  for (const entry of entries) {
    if (entry.type !== "tree" || entry.path === "archive") continue;
    const parts = entry.path.split("/");
    const taskDirectory = parts.length === 1 || (parts.length === 3 && parts[0] === "archive" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(parts[1]!));
    if (taskDirectory && !files.has(`${entry.path}/task.json`)) { invalid++; issues.push(`${entry.path}: 未找到 task.json`); }
  }
  const readEntry = async (entry: typeof paths[number]): Promise<void> => {
    signal.throwIfAborted();
    const directory = entry.path.slice(0, -"/task.json".length);
    const parts = directory.split("/");
    try {
      const parsed: unknown = JSON.parse(await blob(entry.path));
      const evidence: TrellisEvidenceSummary = { state: "missing", files: [], message: "未找到验证材料" };
      const evidenceIssues: string[] = [];
      for (const name of ["validation.json", "validation.md", "check.jsonl"]) {
        if (!files.has(`${directory}/${name}`)) continue;
        evidence.files.push(name);
        try {
          const text = await blob(`${directory}/${name}`);
          const meaningful = name === "validation.md" ? trellisScanInternals.nonPlaceholderText(text)
            : name === "validation.json" ? trellisScanInternals.meaningfulJson(JSON.parse(text))
              : text.split(/\r?\n/).filter((row) => row.trim()).map((row) => JSON.parse(row) as unknown).some(trellisScanInternals.meaningfulJson);
          if (meaningful) evidence.state = "meaningful";
        } catch (error) { if (error instanceof GithubRequestError) throw error; evidenceIssues.push(`${name} 无法读取或格式无效`); }
      }
      if (evidence.state === "meaningful") evidence.message = "存在可读且有内容的验证材料";
      else if (evidenceIssues.length) { evidence.state = "invalid"; evidence.message = evidenceIssues.join("；"); }
      else if (evidence.files.length) evidence.message = "验证材料为空或仍是占位内容";
      if (evidenceIssues.length) issues.push(`${directory}: ${evidenceIssues.join("；")}`);
      const isArchived = parts.length === 3;
      const task = parseTrellisTask(parsed, projectId, directory, parts.at(-1)!, isArchived, isArchived ? parts[1]! : null, evidence);
      (isArchived ? archived : active).push(task);
    } catch (error) { if (error instanceof GithubRequestError) throw error; invalid++; issues.push(`${directory}/task.json 无法读取或格式无效`); }
  }
  let cursor = 0;
  try { await Promise.all(Array.from({ length: Math.min(limits.concurrency, paths.length) }, async () => {
    while (cursor < paths.length) { const entry = paths[cursor++]; if (entry) await readEntry(entry); }
  })); } catch (error) { readsAbort.abort(); throw error; }
  active.sort((a, b) => a.key.localeCompare(b.key)); archived.sort((a, b) => a.key.localeCompare(b.key)); issues.sort();
  signal.throwIfAborted();
  markRelationCycles([...active, ...archived]);
  syncedAt = new Date().toISOString();
  return {
    project: { projectId, title: `${selection.owner}/${selection.repo}`, rootPath: null,
      github: { url: `https://github.com/${selection.owner}/${selection.repo}`, branch: selection.branch, sha: commit.sha, syncedAt, stale: false },
      status: issues.length ? "degraded" : "ready", statusMessage: issues.length ? "部分任务无法读取，请查看读取提示" : "已同步 GitHub Trellis 任务；只显示已推送内容",
      counts: countsOf(active, archived, invalid), issues }, activeTasks: active, archivedTasks: archived, scannedAt: syncedAt,
  };
}
