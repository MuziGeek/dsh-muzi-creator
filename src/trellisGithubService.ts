import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Config } from "./config.ts";
import { GithubApi, githubRepoResponse, parseGithubRepository, repositoryOf } from "./trellisGithubApi.ts";
import { githubProjectId, readGithubTrellis } from "./trellisGithubReader.ts";
import { githubRequestSchema, githubSelectionSchema, type GithubRequest, type GithubResult, type GithubRepository, type GithubSelection } from "./trellisGithubSchemas.ts";
import type { TrellisProjectDetail, TrellisProjectId, TrellisProjectListResult } from "./trellisTypes.ts";

const storeSchema = z.object({ version: z.literal(1), mode: z.enum(["local", "github"]), selections: z.array(githubSelectionSchema) });
type Store = z.infer<typeof storeSchema>;
const credentialRef = "MZ_TRELLIS_GITHUB_USER_TOKEN";
interface CredentialStore {
  resolve: (ref: string) => Promise<{ value: string } | undefined>;
  set: (ref: string, value: string) => Promise<void>;
  unset: (ref: string) => Promise<void>;
}
interface PendingAuth { deviceCode: string; userCode: string; expiresAt: number; interval: number; nextPoll: number }

/** Host-owned GitHub selections and device authorization; secrets only use DSH's credential service. */
export class TrellisGithubService {
  private readonly api: GithubApi;
  private readonly lifetime = new AbortController();
  private tail: Promise<unknown> = Promise.resolve();
  private pending: PendingAuth | null = null;
  private readonly cache = new Map<string, TrellisProjectDetail>();
  private authGeneration = 0;
  private revision = 0;
  private readonly clientId: string;
  private readonly maxRepos: number;
  private readonly syncTimeoutMs: number;
  private readonly limits: { maxTasks: number; maxTaskBytes: number; concurrency: number };

  constructor(private readonly ctx: { get: (name: string) => unknown }, private readonly dataDir: string, config: Config, fetcher?: typeof fetch) {
    this.clientId = config.trellisGithubClientId?.trim() ?? "";
    this.syncTimeoutMs = config.trellisGithubSyncTimeoutMs ?? 120000;
    this.maxRepos = config.trellisGithubMaxRepositories ?? 200;
    this.limits = { concurrency: config.trellisGithubConcurrency ?? 4, maxTasks: config.trellisMaxTasks ?? 2000, maxTaskBytes: config.trellisMaxTaskBytes ?? 262144 };
    this.api = new GithubApi(config.trellisCommandTimeoutMs ?? 30000, config.trellisGithubMaxResponseBytes ?? 8388608, fetcher);
  }

  get currentRevision(): number { return this.revision; }

  dispose(): void {
    this.lifetime.abort(); this.pending = null; this.cache.clear(); this.authGeneration++;
  }

  private credentials(): CredentialStore | undefined {
    const value = this.ctx.get("credentials") as Partial<CredentialStore> | undefined;
    return value && typeof value.resolve === "function" && typeof value.set === "function" && typeof value.unset === "function"
      ? value as CredentialStore : undefined;
  }

  private async token(): Promise<string | undefined> {
    return (await this.credentials()?.resolve(credentialRef))?.value;
  }

  private async store(): Promise<Store> {
    let text: string;
    try { text = await readFile(join(this.dataDir, "trellis-github.json"), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, mode: "local", selections: [] };
      throw new Error("无法读取 GitHub 项目配置，请检查数据目录权限");
    }
    const parsed = storeSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error("GitHub 项目配置格式无效，请修复 trellis-github.json");
    return parsed.data;
  }

  private async save(store: Store): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    await mkdir(this.dataDir, { recursive: true });
    const temporary = join(this.dataDir, `trellis-github.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
      this.lifetime.signal.throwIfAborted();
      await rename(temporary, join(this.dataDir, "trellis-github.json"));
    } finally { await rm(temporary, { force: true }); }
    this.revision++;
  }

  async mode(): Promise<"local" | "github"> { return (await this.store()).mode; }

  /** Serializes configuration and authorization operations; device polling has no background timers. */
  async manage(raw: GithubRequest, signal: AbortSignal): Promise<GithubResult> {
    const request = githubRequestSchema.parse(raw);
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    const result = this.tail.then(() => { combined.throwIfAborted(); return this.run(request, combined); });
    this.tail = result.catch(() => undefined);
    try { return await result; }
    catch (error) {
      if (error instanceof z.ZodError) throw new Error("GitHub 响应或请求格式无效，请检查配置后重试");
      throw error;
    }
  }

  private async status(): Promise<GithubResult> {
    const store = await this.store();
    if (this.pending && this.pending.expiresAt <= Date.now()) this.pending = null;
    return { mode: store.mode, authAvailable: this.clientId !== "" && this.credentials() !== undefined,
      connected: Boolean(await this.token()), login: null,
      pending: this.pending ? { userCode: this.pending.userCode, expiresAt: new Date(this.pending.expiresAt).toISOString(), interval: this.pending.interval } : null };
  }

  private async run(request: GithubRequest, signal: AbortSignal): Promise<GithubResult> {
    const store = await this.store();
    if (request.action === "status") return this.status();
    if (request.action === "mode") { store.mode = request.mode; await this.save(store); return this.status(); }
    if (request.action === "disconnect") {
      await this.credentials()?.unset(credentialRef);
      this.pending = null; this.authGeneration++; this.cache.clear(); this.revision++;
      return this.status();
    }
    if (request.action === "beginAuth") {
      if (!this.clientId || !this.credentials()) throw new Error("请先配置 trellisGithubClientId，并启用 DSH 凭据存储及 GitHub App Device flow");
      const auth = z.object({ device_code: z.string(), user_code: z.string(), expires_in: z.number().positive(), interval: z.number().positive() }).parse(
        await this.api.oauth("device/code", { client_id: this.clientId }, signal),
      );
      signal.throwIfAborted();
      this.pending = { deviceCode: auth.device_code, userCode: auth.user_code, expiresAt: Date.now() + auth.expires_in * 1000, interval: auth.interval, nextPoll: Date.now() + auth.interval * 1000 };
      return this.status();
    }
    if (request.action === "pollAuth") {
      const pending = this.pending;
      if (!pending || pending.expiresAt <= Date.now()) { this.pending = null; throw new Error("授权已过期，请重新连接 GitHub"); }
      if (Date.now() < pending.nextPoll) return this.status();
      pending.nextPoll = Date.now() + pending.interval * 1000;
      const result = z.object({ access_token: z.string().optional(), error: z.string().optional() }).parse(
        await this.api.oauth("oauth/access_token", { client_id: this.clientId, device_code: pending.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }, signal),
      );
      signal.throwIfAborted();
      if (result.access_token) {
        await this.credentials()!.set(credentialRef, result.access_token);
        this.pending = null; this.cache.clear(); this.authGeneration++; this.revision++;
      } else if (result.error === "slow_down") { pending.interval += 5; pending.nextPoll = Date.now() + pending.interval * 1000; }
      else if (result.error !== "authorization_pending") { this.pending = null; throw new Error("GitHub 授权被拒绝或已过期，请重新连接"); }
      return this.status();
    }
    if (request.action === "remove") {
      store.selections = store.selections.filter((item) => githubProjectId(item) !== request.projectId);
      await this.save(store); this.cache.delete(request.projectId); return this.status();
    }
    const token = await this.token();
    if (request.action === "browse") {
      const repositories = await this.browse(request.query.trim(), token, signal);
      return { ...await this.status(), repositories };
    }
    const selection = parseGithubRepository(request.repository);
    const prefix = `/repos/${encodeURIComponent(selection.owner)}/${encodeURIComponent(selection.repo)}`;
    if (request.action === "branches") {
      const branches = await this.pages(`${prefix}/branches`, token, signal, z.array(z.object({ name: z.string() })), (value) => value);
      return { ...await this.status(), branches: branches.map((item) => item.name) };
    }
    const selected = githubSelectionSchema.parse({ ...selection, branch: request.branch });
    const detail = await readGithubTrellis(this.api, selected, token, AbortSignal.any([signal, AbortSignal.timeout(this.syncTimeoutMs)]), this.limits);
    const id = githubProjectId(selected);
    store.selections = [...store.selections.filter((item) => githubProjectId(item) !== id), selected];
    if (store.selections.length > this.maxRepos) throw new Error("已连接项目数量达到上限");
    store.mode = "github";
    signal.throwIfAborted();
    await this.save(store); this.cache.set(id, detail);
    return { ...await this.status(), message: `已添加 ${selection.owner}/${selection.repo} · ${selected.branch}` };
  }

  private async pages<T, R>(path: string, token: string | undefined, signal: AbortSignal, schema: z.ZodType<T>, rows: (data: T) => R[]): Promise<R[]> {
    const result: R[] = [];
    for (let page = 1; ; page++) {
      const data = schema.parse(await this.api.request(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${String(page)}`, token, signal));
      const batch = rows(data); result.push(...batch);
      if (result.length > this.maxRepos) throw new Error("仓库或分支数量超过读取上限，请直接粘贴目标仓库链接或提高配置上限");
      if (batch.length < 100) return result;
    }
  }

  private async browse(query: string, token: string | undefined, signal: AbortSignal): Promise<GithubRepository[]> {
    if (query.includes("/")) {
      const { owner, repo } = parseGithubRepository(query);
      return [repositoryOf(githubRepoResponse.parse(await this.api.request(`/repos/${owner}/${repo}`, token, signal)))];
    }
    if (query) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(query)) throw new Error("请输入 GitHub 用户名或仓库链接");
      return (await this.pages(`/users/${query}/repos?sort=updated`, token, signal, z.array(githubRepoResponse), (data) => data)).map(repositoryOf);
    }
    if (!token) throw new Error("请粘贴公开仓库链接、输入 GitHub 用户名，或先绑定账号");
    const installations = await this.pages("/user/installations", token, signal, z.object({ installations: z.array(z.object({ id: z.number().int().positive() })) }), (data) => data.installations);
    const result = new Map<string, GithubRepository>();
    for (const installation of installations) {
      const repos = await this.pages(`/user/installations/${String(installation.id)}/repositories`, token, signal, z.object({ repositories: z.array(githubRepoResponse) }), (data) => data.repositories);
      for (const raw of repos) { const repo = repositoryOf(raw); result.set(repo.fullName.toLowerCase(), repo); }
      if (result.size > this.maxRepos) throw new Error("授权仓库数量超过读取上限，请粘贴具体仓库链接");
    }
    return [...result.values()];
  }

  async list(signal: AbortSignal): Promise<TrellisProjectListResult> {
    const store = await this.store();
    const projects = [];
    for (const selection of store.selections) projects.push((await this.get(githubProjectId(selection), signal)).project);
    return { projectsRoot: "GitHub", trellisRevision: this.revision, projects };
  }

  /** Failed refreshes retain the last snapshot with its original commit and sync time, explicitly marked stale. */
  async get(id: TrellisProjectId, signal: AbortSignal): Promise<TrellisProjectDetail> {
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    const selection = (await this.store()).selections.find((item) => githubProjectId(item) === id);
    if (!selection) throw new Error("GitHub 项目已移除，请刷新列表");
    const generation = this.authGeneration;
    const previous = this.cache.get(id);
    try {
      const detail = await readGithubTrellis(this.api, selection, await this.token(), AbortSignal.any([combined, AbortSignal.timeout(this.syncTimeoutMs)]), this.limits, previous);
      combined.throwIfAborted();
      if (generation !== this.authGeneration || !(await this.store()).selections.some((item) => githubProjectId(item) === id)) throw new Error("项目连接已改变，请刷新");
      this.cache.set(id, detail); return detail;
    } catch (error) {
      combined.throwIfAborted();
      if (generation !== this.authGeneration) throw new Error("GitHub 授权已改变，请刷新");
      const message = error instanceof z.ZodError ? "GitHub 响应格式无效，请稍后重试" : error instanceof Error ? error.message : "GitHub 同步失败";
      const detail: TrellisProjectDetail = previous ? { ...previous, project: { ...previous.project,
        status: "degraded", statusMessage: `同步失败，显示上次结果：${message}`, issues: [message], github: { ...previous.project.github!, stale: true } } }
        : { project: { projectId: id, title: `${selection.owner}/${selection.repo}`, rootPath: null, status: "unreadable", statusMessage: message, counts: null, issues: [message],
          github: { url: `https://github.com/${selection.owner}/${selection.repo}`, branch: selection.branch, sha: null, syncedAt: null, stale: true } }, activeTasks: [], archivedTasks: [], scannedAt: new Date().toISOString() };
      return detail;
    }
  }
}
