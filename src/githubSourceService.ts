import { randomUUID, createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

import type { Config } from "./config.ts";
import {
  GithubApi,
  githubRepoResponse,
  parseGithubBrowseQuery,
  parseGithubRepository,
  repositoryOf,
} from "./trellisGithubApi.ts";
import {
  githubSourceRequestSchema,
  githubSourceSnapshotSchema,
  type GithubSourceRequest,
  type GithubSourceResult,
  type GithubSourceSnapshot,
  type GithubSourceTarget,
} from "./githubSourceSchemas.ts";
import { githubSelectionSchema, type GithubRepository, type GithubSelection } from "./trellisGithubSchemas.ts";

const credentialRef = "MZ_TRELLIS_GITHUB_USER_TOKEN";
const sourceStorePath = "github-sources.json";
const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const commitSchema = z.object({
  sha: shaSchema,
  commit: z.object({ tree: z.object({ sha: shaSchema }) }),
});
const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(z.object({
    path: z.string().min(1),
    mode: z.string(),
    type: z.string(),
    sha: shaSchema,
  })),
});
const blobSchema = z.object({
  encoding: z.literal("base64"),
  content: z.string(),
  size: z.number().int().nonnegative(),
});
const branchesSchema = z.array(z.object({ name: z.string().min(1) }));
const sourceEntrySchema = z.object({
  mode: z.enum(["local", "github"]),
  selection: githubSelectionSchema.optional(),
  snapshot: githubSourceSnapshotSchema.optional(),
});
const sourceStoreSchema = z.object({
  version: z.literal(1),
  sources: z.object({
    creator: sourceEntrySchema.optional(),
    knowledge: sourceEntrySchema.optional(),
  }),
});
type SourceEntry = z.infer<typeof sourceEntrySchema>;
type SourceStore = z.infer<typeof sourceStoreSchema>;

interface CredentialStore {
  resolve: (ref: string) => Promise<{ value: string } | undefined>;
  set: (ref: string, value: string) => Promise<void>;
  unset: (ref: string) => Promise<void>;
}

interface PendingAuth {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  interval: number;
  nextPoll: number;
}

interface SourceCache {
  path: string;
  sha: string;
  fileCount: number;
  bytes: number;
}

/** Manages read-only GitHub snapshots for the Creator Studio and Atlas roots. */
export class GithubSourceService {
  private readonly api: GithubApi;
  private readonly lifetime = new AbortController();
  private readonly clientId: string;
  private readonly maxRepos: number;
  private readonly syncTimeoutMs: number;
  private readonly concurrency: number;
  private readonly maxFiles: number;
  private readonly maxBytes: number;
  private readonly maxFileBytes: number;
  private tail: Promise<unknown> = Promise.resolve();
  private pending: PendingAuth | null = null;
  private authGeneration = 0;
  private revision = 0;

  constructor(
    private readonly ctx: { get: (name: string) => unknown },
    private readonly dataDir: string,
    config: Config,
    fetcher?: typeof fetch,
  ) {
    this.clientId = config.trellisGithubClientId?.trim() ?? "";
    this.maxRepos = config.trellisGithubMaxRepositories ?? 200;
    this.syncTimeoutMs = config.trellisGithubSyncTimeoutMs ?? 120000;
    this.concurrency = config.trellisGithubConcurrency ?? 4;
    this.maxFiles = config.githubSourceMaxFiles ?? 10000;
    this.maxBytes = config.githubSourceMaxBytes ?? 67108864;
    this.maxFileBytes = config.githubSourceMaxFileBytes ?? 8388608;
    this.api = new GithubApi(config.trellisCommandTimeoutMs ?? 30000, config.trellisGithubMaxResponseBytes ?? 8388608, fetcher);
  }

  get currentRevision(): number {
    return this.revision;
  }

  dispose(): void {
    this.lifetime.abort();
    this.pending = null;
    this.authGeneration++;
  }

  async root(target: GithubSourceTarget): Promise<string | undefined> {
    const store = await this.store();
    const entry = this.entry(store, target);
    if (entry.mode !== "github" || entry.selection === undefined) return undefined;
    if (entry.snapshot !== undefined && await this.cacheExists(target, entry.selection, entry.snapshot.sha)) {
      return this.cachePath(target, entry.selection, entry.snapshot.sha);
    }
    const refreshed = await this.synchronize(target, this.lifetime.signal);
    if (refreshed.snapshot === undefined || refreshed.selection === undefined) return undefined;
    return await this.cacheExists(target, refreshed.selection, refreshed.snapshot.sha)
      ? this.cachePath(target, refreshed.selection, refreshed.snapshot.sha)
      : undefined;
  }

  async targetRevision(target: GithubSourceTarget): Promise<number> {
    const entry = this.entry(await this.store(), target);
    return entry.mode === "github" ? this.revision : 0;
  }

  async mode(target: GithubSourceTarget): Promise<"local" | "github"> {
    return this.entry(await this.store(), target).mode;
  }

  /** Serializes source selection, authorization, browsing, and snapshot refreshes. */
  async manage(raw: GithubSourceRequest, signal: AbortSignal): Promise<GithubSourceResult> {
    const request = githubSourceRequestSchema.parse(raw);
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    const result = this.tail.then(() => {
      combined.throwIfAborted();
      return this.run(request, combined);
    });
    this.tail = result.catch(() => undefined);
    try {
      return await result;
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error("GitHub 来源配置格式无效，请检查后重试");
      throw error;
    }
  }

  private credentials(): CredentialStore | undefined {
    const value = this.ctx.get("credentials") as Partial<CredentialStore> | undefined;
    return value && typeof value.resolve === "function" && typeof value.set === "function" && typeof value.unset === "function"
      ? value as CredentialStore
      : undefined;
  }

  private async token(): Promise<string | undefined> {
    return (await this.credentials()?.resolve(credentialRef))?.value;
  }

  private emptyStore(): SourceStore {
    return { version: 1, sources: {} };
  }

  private async store(): Promise<SourceStore> {
    let text: string;
    try {
      text = await readFile(join(this.dataDir, sourceStorePath), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.emptyStore();
      throw new Error("无法读取 GitHub 内容来源配置，请检查数据目录权限");
    }
    try {
      const parsed = sourceStoreSchema.safeParse(JSON.parse(text) as unknown);
      if (!parsed.success) throw new Error("invalid");
      return parsed.data;
    } catch {
      throw new Error("GitHub 内容来源配置格式无效，请修复 github-sources.json");
    }
  }

  private async save(store: SourceStore): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    await mkdir(this.dataDir, { recursive: true });
    const path = join(this.dataDir, sourceStorePath);
    const temporary = join(this.dataDir, `github-sources.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      this.lifetime.signal.throwIfAborted();
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
    this.revision++;
  }

  private entry(store: SourceStore, target: GithubSourceTarget): SourceEntry {
    return store.sources[target] ?? { mode: "local" };
  }

  private async status(target: GithubSourceTarget, message?: string): Promise<GithubSourceResult> {
    const entry = this.entry(await this.store(), target);
    const selection = entry.selection;
    const snapshot = entry.snapshot;
    return {
      target,
      mode: entry.mode,
      authAvailable: this.clientId !== "" && this.credentials() !== undefined,
      connected: Boolean(await this.token()),
      login: null,
      pending: this.pending && this.pending.expiresAt > Date.now()
        ? { userCode: this.pending.userCode, expiresAt: new Date(this.pending.expiresAt).toISOString(), interval: this.pending.interval }
        : null,
      selection: selection ?? null,
      snapshot: snapshot ?? null,
      ...(message === undefined ? {} : { message }),
    };
  }

  private async run(request: GithubSourceRequest, signal: AbortSignal): Promise<GithubSourceResult> {
    const store = await this.store();
    if (request.action === "status") return this.status(request.target);
    if (request.action === "mode") {
      const current = this.entry(store, request.target);
      store.sources[request.target] = { ...current, mode: request.mode };
      await this.save(store);
      return this.status(request.target);
    }
    if (request.action === "disconnect") {
      await this.credentials()?.unset(credentialRef);
      this.pending = null;
      this.authGeneration++;
      this.revision++;
      return this.status(request.target);
    }
    if (request.action === "beginAuth") {
      if (!this.clientId || !this.credentials()) throw new Error("请先配置 trellisGithubClientId，并启用 DSH 凭据存储及 GitHub App Device flow");
      const auth = z.object({
        device_code: z.string(),
        user_code: z.string(),
        expires_in: z.number().positive(),
        interval: z.number().positive(),
      }).parse(await this.api.oauth("device/code", { client_id: this.clientId }, signal));
      signal.throwIfAborted();
      this.pending = {
        deviceCode: auth.device_code,
        userCode: auth.user_code,
        expiresAt: Date.now() + auth.expires_in * 1000,
        interval: auth.interval,
        nextPoll: Date.now() + auth.interval * 1000,
      };
      return this.status(request.target);
    }
    if (request.action === "pollAuth") {
      const pending = this.pending;
      if (!pending || pending.expiresAt <= Date.now()) {
        this.pending = null;
        throw new Error("授权已过期，请重新连接 GitHub");
      }
      if (Date.now() < pending.nextPoll) return this.status(request.target);
      pending.nextPoll = Date.now() + pending.interval * 1000;
      const result = z.object({ access_token: z.string().optional(), error: z.string().optional() }).parse(
        await this.api.oauth("oauth/access_token", {
          client_id: this.clientId,
          device_code: pending.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }, signal),
      );
      signal.throwIfAborted();
      if (result.access_token) {
        await this.credentials()!.set(credentialRef, result.access_token);
        this.pending = null;
        this.authGeneration++;
        this.revision++;
      } else if (result.error === "slow_down") {
        pending.interval += 5;
        pending.nextPoll = Date.now() + pending.interval * 1000;
      } else if (result.error !== "authorization_pending") {
        this.pending = null;
        throw new Error("GitHub 授权被拒绝或已过期，请重新连接");
      }
      return this.status(request.target);
    }
    const token = await this.token();
    if (request.action === "browse") {
      const repositories = await this.browse(request.query.trim(), token, signal);
      return { ...await this.status(request.target), repositories };
    }
    if (request.action === "branches") {
      const selection = parseGithubRepository(request.repository);
      const branches = await this.pages(
        `/repos/${encodeURIComponent(selection.owner)}/${encodeURIComponent(selection.repo)}/branches`,
        token,
        signal,
        branchesSchema,
        (value) => value,
      );
      return { ...await this.status(request.target), branches: branches.map((item) => item.name) };
    }
    if (request.action === "connect") {
      const repository = parseGithubRepository(request.repository);
      const selection = githubSelectionSchema.parse({ ...repository, branch: request.branch });
      const cache = await this.materialize(request.target, selection, token, signal);
      const nextStore = await this.store();
      nextStore.sources[request.target] = { mode: "github", selection, snapshot: cacheSnapshot(selection, cache) };
      await this.save(nextStore);
      return this.status(request.target, `已连接 ${selection.owner}/${selection.repo} · ${selection.branch}`);
    }
    if (request.action === "refresh") {
      const synchronized = await this.synchronize(request.target, signal);
      return this.status(request.target, synchronized.message ?? "GitHub 来源已刷新");
    }
    if (request.action === "remove") {
      await rm(join(this.dataDir, "github-source-cache", request.target), { recursive: true, force: true });
      store.sources[request.target] = { mode: "local" };
      await this.save(store);
      return this.status(request.target);
    }
    throw new Error("GitHub 内容来源操作未识别");
  }

  private async synchronize(target: GithubSourceTarget, signal: AbortSignal): Promise<{ selection?: GithubSelection; snapshot?: GithubSourceSnapshot; message?: string }> {
    const store = await this.store();
    const current = this.entry(store, target);
    if (current.mode !== "github" || current.selection === undefined) return {};
    const generation = this.authGeneration;
    try {
      const cache = await this.materialize(target, current.selection, await this.token(), signal);
      signal.throwIfAborted();
      if (generation !== this.authGeneration) throw new Error("GitHub 授权已改变，请刷新");
      const latest = await this.store();
      const latestEntry = this.entry(latest, target);
      if (latestEntry.mode !== "github" || latestEntry.selection === undefined
        || !sameSelection(latestEntry.selection, current.selection)) {
        throw new Error("GitHub 来源已改变，请刷新");
      }
      latest.sources[target] = { ...latestEntry, snapshot: cacheSnapshot(current.selection, cache) };
      await this.save(latest);
      return { selection: current.selection, snapshot: cacheSnapshot(current.selection, cache) };
    } catch (error) {
      signal.throwIfAborted();
      if (generation !== this.authGeneration) throw new Error("GitHub 授权已改变，请刷新");
      const latest = await this.store();
      const latestEntry = this.entry(latest, target);
      if (latestEntry.snapshot === undefined || latestEntry.selection === undefined) throw error;
      const message = error instanceof z.ZodError
        ? "GitHub 响应格式无效"
        : error instanceof Error
          ? error.message
          : "GitHub 同步失败";
      const stale = { ...latestEntry.snapshot, stale: true };
      latest.sources[target] = { ...latestEntry, snapshot: stale };
      await this.save(latest);
      return { selection: latestEntry.selection, snapshot: stale, message: `同步失败，显示上次结果：${message}` };
    }
  }

  private async browse(query: string, token: string | undefined, signal: AbortSignal): Promise<GithubRepository[]> {
    const parsed = parseGithubBrowseQuery(query);
    if (parsed.kind === "repository") {
      const { owner, repo } = parsed;
      return [repositoryOf(githubRepoResponse.parse(await this.api.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        token,
        signal,
      )))];
    }
    if (parsed.kind === "user") {
      const repositories = await this.pages(
        `/users/${encodeURIComponent(parsed.username)}/repos?sort=updated`,
        token,
        signal,
        githubRepoResponse.array(),
        (value) => value,
      );
      return repositories.map(repositoryOf);
    }
    if (!token) throw new Error("请粘贴公开仓库链接、输入 GitHub 用户名，或先绑定账号");
    const installations = await this.pages(
      "/user/installations",
      token,
      signal,
      z.object({ installations: z.array(z.object({ id: z.number().int().positive() })) }),
      (value) => value.installations,
    );
    const result = new Map<string, GithubRepository>();
    for (const installation of installations) {
      const repositories = await this.pages(
        `/user/installations/${String(installation.id)}/repositories`,
        token,
        signal,
        z.object({ repositories: githubRepoResponse.array() }),
        (value) => value.repositories,
      );
      for (const raw of repositories) {
        const repository = repositoryOf(raw);
        result.set(repository.fullName.toLowerCase(), repository);
        if (result.size > this.maxRepos) throw new Error("授权仓库数量超过读取上限，请粘贴具体仓库链接");
      }
    }
    return [...result.values()];
  }

  private async pages<T, R>(
    path: string,
    token: string | undefined,
    signal: AbortSignal,
    schema: z.ZodType<T>,
    rows: (data: T) => R[],
  ): Promise<R[]> {
    const result: R[] = [];
    for (let page = 1; ; page++) {
      const data = schema.parse(await this.api.request(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${String(page)}`,
        token,
        signal,
      ));
      const batch = rows(data);
      result.push(...batch);
      if (result.length > this.maxRepos) throw new Error("仓库或分支数量超过读取上限，请直接粘贴目标仓库链接或提高配置上限");
      if (batch.length < 100) return result;
    }
  }

  private cachePath(target: GithubSourceTarget, selection: GithubSelection, sha: string): string {
    const key = createHash("sha256")
      .update(`${target}\0${selection.owner.toLowerCase()}/${selection.repo.toLowerCase()}\0${selection.branch}\0${sha}`)
      .digest("hex");
    return join(this.dataDir, "github-source-cache", target, key);
  }

  private async cacheExists(target: GithubSourceTarget, selection: GithubSelection, sha: string): Promise<boolean> {
    const root = this.cachePath(target, selection, sha);
    const rootInfo = await lstat(root).catch(() => undefined);
    if (rootInfo === undefined || !rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return false;
    const complete = await lstat(join(root, ".complete")).catch(() => undefined);
    return complete !== undefined && complete.isFile() && !complete.isSymbolicLink();
  }

  private async materialize(target: GithubSourceTarget, selection: GithubSelection, token: string | undefined, signal: AbortSignal): Promise<SourceCache> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(this.syncTimeoutMs)]);
    const prefix = `/repos/${encodeURIComponent(selection.owner)}/${encodeURIComponent(selection.repo)}`;
    const commit = commitSchema.parse(await this.api.request(
      `${prefix}/commits/${encodeURIComponent(selection.branch)}`,
      token,
      bounded,
    ));
    const tree = treeSchema.parse(await this.api.request(
      `${prefix}/git/trees/${commit.commit.tree.sha}?recursive=1`,
      token,
      bounded,
    ));
    if (tree.truncated) throw new Error("GitHub 仓库目录过大，无法提供完整快照");
    const files = tree.tree.filter((entry) => {
      if (entry.type !== "blob") return false;
      if (!["100644", "100755"].includes(entry.mode)) {
        if (entry.mode === "120000") throw new Error("GitHub 来源包含不支持的符号链接");
        return false;
      }
      validateRelativePath(entry.path);
      return true;
    });
    if (files.length > this.maxFiles) throw new Error("GitHub 来源文件数量超过读取上限");
    const tempRoot = join(this.dataDir, "github-source-cache", "staging", randomUUID());
    await mkdir(tempRoot, { recursive: true });
    if (target === "creator") {
      await mkdir(join(tempRoot, "10-active"), { recursive: true });
      await mkdir(join(tempRoot, "90-archive"), { recursive: true });
    }
    let totalBytes = 0;
    let cursor = 0;
    const readFile = async (): Promise<void> => {
      while (cursor < files.length) {
        const entry = files[cursor++];
        if (entry === undefined) return;
        bounded.throwIfAborted();
        const bytes = token === undefined
          ? await this.api.publicFileBytes(`/${selection.owner}/${selection.repo}/${commit.sha}/${entry.path.split("/").map(encodeURIComponent).join("/")}`, bounded)
          : decodeBlob(await this.api.request(`${prefix}/git/blobs/${entry.sha}`, token, bounded));
        if (bytes.byteLength > this.maxFileBytes) throw new Error("GitHub 来源单文件超过读取上限");
        totalBytes += bytes.byteLength;
        if (totalBytes > this.maxBytes) throw new Error("GitHub 来源总大小超过读取上限");
        const target = resolve(tempRoot, ...entry.path.split("/"));
        assertChild(tempRoot, target);
        await mkdir(resolve(target, ".."), { recursive: true });
        await writeFile(target, bytes, { flag: "wx" });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(this.concurrency, files.length) }, () => readFile()));
      await writeFile(join(tempRoot, ".complete"), `${commit.sha}\n`, { encoding: "utf8", flag: "wx" });
      const finalRoot = this.cachePath(target, selection, commit.sha);
      await mkdir(resolve(finalRoot, ".."), { recursive: true });
      if (await this.cacheExists(target, selection, commit.sha)) {
        await rm(tempRoot, { recursive: true, force: true });
      } else {
        await rm(finalRoot, { recursive: true, force: true });
        await rename(tempRoot, finalRoot);
      }
      return { path: finalRoot, sha: commit.sha, fileCount: files.length, bytes: totalBytes };
    } catch (error) {
      await rm(tempRoot, { recursive: true, force: true });
      throw error;
    }
  }
}

function cacheSnapshot(selection: GithubSelection, cache: SourceCache): GithubSourceSnapshot {
  return githubSourceSnapshotSchema.parse({
    url: `https://github.com/${selection.owner}/${selection.repo}`,
    branch: selection.branch,
    sha: cache.sha,
    syncedAt: new Date().toISOString(),
    stale: false,
    fileCount: cache.fileCount,
    bytes: cache.bytes,
  });
}

function decodeBlob(value: unknown): Buffer {
  const blob = blobSchema.parse(value);
  const bytes = Buffer.from(blob.content, "base64");
  if (bytes.length !== blob.size) throw new Error("GitHub 文件响应大小不一致");
  return bytes;
}

function sameSelection(left: GithubSelection, right: GithubSelection): boolean {
  return left.owner === right.owner && left.repo === right.repo && left.branch === right.branch;
}

function validateRelativePath(path: string): void {
  if (path.includes("\\") || path.startsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("GitHub 来源包含无效路径");
  }
}

function assertChild(root: string, target: string): void {
  const child = relative(root, target);
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error("GitHub 来源路径越界");
  }
}
