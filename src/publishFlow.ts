import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostname } from "node:os";
import { publishFlowActionSchema, publishFlowGetSchema, publishFlowPrepareSchema, publishFlowSchema, type PublishFlow, type PublishFlowAction, type PublishFlowPrepare } from "./publishFlowSchemas.ts";
import type { MuziCreatorService } from "./muziService.ts";
import type { MuziPublicationState, MuziVideoPlatform } from "./muziTypes.ts";
import type { VideoPublisherService } from "./videoPublisher.ts";
import { runVideoAccounts } from "./videoAccounts.ts";

type Target = PublishFlow["targets"][number];
type Job = { controller: AbortController; done: Promise<void> };
const terminal = new Set<Target["state"]>(["published", "scheduled", "prepared"]);
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Serializes each content flow across desktop and web hosts; a live owner is never evicted. */
async function claim(file: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, JSON.stringify({ pid: process.pid, host: hostname() }), { flag: "wx", mode: 0o600 });
      return () => unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let pid: unknown;
      try { const owner = JSON.parse(await readFile(file, "utf8")) as { pid?: unknown; host?: unknown }; if (owner.host !== hostname()) throw new Error("异地主机持有发布任务锁"); pid = owner.pid; }
      catch { throw new Error("发布任务锁无法读取，请检查正在运行的工作台"); }
      if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 1) throw new Error("发布任务锁无效");
      try { process.kill(pid, 0); }
      catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ESRCH") { await unlink(file); continue; }
      }
      throw new Error("该内容正在处理，请等待当前发布任务完成");
    }
  }
  throw new Error("无法取得发布任务锁");
}

/** Persistent publishing coordinator shared by RPC and Agent tools. */
export class PublishFlowService {
  private readonly directory: string;
  private readonly jobs = new Map<string, Job>();
  private readonly snapshots = new Map<string, PublishFlow>();
  private disposed = false;

  constructor(dataDir: string, private readonly muzi: MuziCreatorService, private readonly publisher: VideoPublisherService, private readonly allowed: () => boolean) {
    this.directory = join(dataDir, "publish-flows");
  }

  private file(id: string) { publishFlowGetSchema.parse({ id }); return join(this.directory, `${id}.json`); }
  private async read(id: string): Promise<PublishFlow | null> {
    let bytes: string;
    try { bytes = await readFile(this.file(id), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const flow = publishFlowSchema.parse(JSON.parse(bytes));
    if (flow.id !== id) throw new Error("发布记录与内容不匹配");
    return flow;
  }
  private async save(flow: PublishFlow) {
    flow.version++; flow.updatedAt = new Date().toISOString();
    const file = this.file(flow.id), temp = `${file}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(temp, `${JSON.stringify(publishFlowSchema.parse(flow), null, 2)}\n`, { flag: "wx", mode: 0o600 });
    // Windows readers can briefly hold a handle without delete sharing.
    for (let attempt = 0; ; attempt++) {
      try { await rename(temp, file); break; }
      catch (error) {
        if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "") || attempt >= 20) throw error;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    this.snapshots.set(flow.id, structuredClone(flow));
  }
  private checkAllowed(signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.disposed) throw new Error("发布服务正在关闭");
    if (!this.allowed()) throw new Error("上传和发布尚未启用，请先在插件配置中启用外部操作。账号连接不受此开关影响。");
  }
  private async revision(flow: Pick<PublishFlow, "id" | "revision">) {
    if ((await this.muzi.getProject({ id: flow.id })).revision !== flow.revision) throw new Error("内容已修改，请重新选择目标并准备");
  }

  /** Read without opening a platform; interrupted final actions remain non-retryable. */
  async get(request: { id: string }): Promise<PublishFlow | null> {
    const { id } = publishFlowGetSchema.parse(request);
    if (this.jobs.has(id)) { const value = this.snapshots.get(id); if (value) return { ...structuredClone(value), busy: true }; }
    const flow = await this.read(id);
    if (!flow || this.jobs.has(id)) return flow;
    const project = await this.muzi.getProject({ id });
    const needsRecovery = flow.busy || flow.targets.some(target => target.state === "unknown" || (["published", "scheduled"].includes(target.state) && !target.factsRecorded));
    const needsRevocation = project.revision !== flow.revision && flow.targets.some(target => ["ready", "prepared"].includes(target.state));
    if (!needsRecovery && !needsRevocation) return flow;
    let release: () => Promise<void>;
    try { release = await claim(`${this.file(id)}.lock`); } catch { return flow; }
    try {
      const current = await this.read(id);
      if (!current) return null;
      const before = JSON.stringify(current);
      if (current.busy) {
        for (const target of current.targets) {
          if (target.state === "committing") { target.state = "unknown"; target.message = "最终提交被中断，请先核实平台结果，不能自动重试"; }
          else if (["checking", "preparing", "pending"].includes(target.state)) { target.state = "blocked"; target.message = "准备已中断，可继续此目标"; }
        }
        current.busy = false;
      }
      await this.reconcileResults(current);
      await this.recordFacts(current);
      if ((await this.muzi.getProject({ id })).revision !== current.revision) {
        for (const target of current.targets) if (["ready", "prepared"].includes(target.state)) {
          target.state = "blocked"; target.message = "内容已修改，需要重新准备";
          const row = target.task?.platforms[target.platform];
          if (row) { row.commitEnabled = false; row.authorizationDigest = null; }
        }
      }
      if (JSON.stringify(current) !== before) await this.save(current);
      return current;
    } finally { await release(); }

  }

  /** Start bounded preparation after the caller authorizes the exact target list. */
  async prepare(request: PublishFlowPrepare, signal: AbortSignal): Promise<PublishFlow> {
    const input = publishFlowPrepareSchema.parse(request); this.checkAllowed(signal);
    await mkdir(this.directory, { recursive: true });
    const release = await claim(`${this.file(input.id)}.lock`);
    let started = false;
    try {
      const previous = await this.read(input.id);
      if (previous?.targets.some(target => target.state === "unknown" || target.state === "committing")) throw new Error("上次提交结果尚未核实，不能重新发布此内容");
      await this.revision({ id: input.id, revision: input.expectedRevision });
      const now = new Date().toISOString();
      const flow: PublishFlow = {
        flowId: `vpf-${randomBytes(12).toString("hex")}`, id: input.id, revision: input.expectedRevision, version: 0,
        createdAt: now, updatedAt: now, busy: true, originalRightsConfirmed: input.originalRightsConfirmed === true,
        ...(input.packagePath ? { packagePath: input.packagePath } : {}),
        targets: input.intents.map(intent => ({ ...intent, displayName: "", state: "pending", message: null, task: null, acceptanceSessionId: null, materials: [] })),
      };
      if (previous) await writeFile(join(this.directory, `${previous.flowId}.json`), `${JSON.stringify(previous)}\n`, { flag: "wx", mode: 0o600 }).catch(error => { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; });
      await this.save(flow);
      const result = structuredClone(flow);
      this.launch(flow, flow.targets, "prepare", release); started = true;
      return result;
    } finally { if (!started) await release(); }
  }

  async resume(request: PublishFlowAction, signal: AbortSignal): Promise<PublishFlow> { return this.action(request, signal, "prepare"); }
  async commit(request: PublishFlowAction, signal: AbortSignal): Promise<PublishFlow> { return this.action(request, signal, "commit"); }

  /** Revoke persisted preparation when the user edits target configuration. */
  async invalidate(request: PublishFlowAction): Promise<PublishFlow> {
    const input = publishFlowActionSchema.parse(request);
    const release = await claim(`${this.file(input.id)}.lock`);
    try {
      const flow = await this.read(input.id);
      if (!flow || flow.flowId !== input.flowId || flow.version !== input.expectedVersion || flow.busy) throw new Error("发布进度已变化，请刷新后修改");
      for (const target of flow.targets) if (input.platforms.includes(target.platform) && ["ready", "prepared"].includes(target.state)) {
        target.state = "blocked"; target.message = "发布配置已修改，请重新选择目标并准备";
        const row = target.task?.platforms[target.platform];
        if (row) { row.authorizationDigest = null; row.commitEnabled = false; }
      }
      await this.save(flow); return flow;
    } finally { await release(); }
  }

  private async action(request: PublishFlowAction, signal: AbortSignal, operation: "prepare" | "commit") {
    const input = publishFlowActionSchema.parse(request); this.checkAllowed(signal);
    const release = await claim(`${this.file(input.id)}.lock`);
    let started = false;
    try {
      const flow = await this.read(input.id);
      if (!flow || flow.flowId !== input.flowId || flow.version !== input.expectedVersion || flow.busy) throw new Error("发布进度已变化，请刷新后确认");
      await this.revision(flow);
      const targets = input.platforms.map(platform => {
        const target = flow.targets.find(item => item.platform === platform);
        if (!target) throw new Error("发布目标不存在");
        if (operation === "prepare" ? target.state !== "blocked" : target.state !== "ready" || target.mode === "prepare_only") throw new Error("目标当前不可执行该操作");
        if (operation === "commit") this.approval(target);
        return target;
      });
      flow.busy = true; await this.save(flow);
      const result = structuredClone(flow);
      this.launch(flow, targets, operation, release); started = true;
      return result;
    } finally { if (!started) await release(); }
  }

  private approval(target: Target) {
    const row = target.task?.platforms[target.platform];
    const summary = row?.approvalSummary;
    if (!row?.commitEnabled || !row.authorizationDigest || !summary || summary.platform !== target.platform || summary.accountProfile !== target.accountProfile || summary.mode !== target.mode || summary.scheduledAt !== (target.scheduledAt ?? null) || Date.parse(row.authorizationExpiresAt ?? "") <= Date.now() || !Number.isFinite(Date.parse(row.authorizationExpiresAt ?? ""))) throw new Error("准备结果或确认已失效，请重新准备");
    return row;
  }

  private launch(flow: PublishFlow, targets: Target[], operation: "prepare" | "commit", release: () => Promise<void>) {
    const controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      for (const target of targets) {
        if (controller.signal.aborted) break;
        try {
          this.checkAllowed(controller.signal); await this.revision(flow);
          if (operation === "prepare") await this.prepareTarget(flow, target, controller.signal);
          else await this.commitTarget(flow, target, controller.signal);
        } catch (error) {
          if (target.state === "committing") target.state = "unknown";
          else if (!terminal.has(target.state)) target.state = "blocked";
          target.message = messageOf(error); await this.save(flow);
        }
      }
      if (operation === "commit") await this.recordFacts(flow);
    }).catch(async error => {
      for (const target of targets) if (!terminal.has(target.state) && target.state !== "unknown") { target.state = target.state === "committing" ? "unknown" : "blocked"; target.message = messageOf(error); }
    }).finally(async () => {
      try {
        for (const target of targets) if (["pending", "checking", "preparing"].includes(target.state)) { target.state = "blocked"; target.message = "准备已中断，可继续此目标"; }
        flow.busy = false; await this.save(flow);
      } finally { await release(); this.jobs.delete(flow.id); this.snapshots.delete(flow.id); }
    });
    this.jobs.set(flow.id, { controller, done });
    // Observe storage/teardown failures even when no UI is currently polling.
    void done.catch(error => { console.error("Publishing flow persistence failed:", messageOf(error)); });
  }

  private async verifyAccount(target: Target, signal: AbortSignal, inspectOnly = false) {
    const registry = await runVideoAccounts(this.publisher.skillDir, "check-login", { platform: target.platform === "wechat" ? "wechat_channels" : target.platform, accountProfile: target.accountProfile, confirmed: true, inspectOnly }, signal);
    const account = registry.accounts.find(item => item.platform === target.platform && item.accountProfile === target.accountProfile);
    const login = registry.loginStatuses.find(item => item.platform === target.platform && item.accountProfile === target.accountProfile);
    if (!account?.enabled || account.removalPending || !account.platformAccountId || !account.connectedAt || login?.state !== "verified") throw new Error("账号已不可用，请到内容概览的账号管理中检查，再重新选择账号并准备");
    if (inspectOnly && target.platformAccountId !== account.platformAccountId) throw new Error("账号身份已变化，请重新准备并确认");
    target.displayName = account.displayName; target.platformAccountId = account.platformAccountId;
  }

  private async prepareTarget(flow: PublishFlow, target: Target, signal: AbortSignal) {
    target.state = "checking"; target.message = null; target.task = null; target.acceptanceSessionId = null; await this.save(flow);
    await this.verifyAccount(target, signal);
    const capabilities = await this.publisher.capabilities(signal);
    const account = capabilities.accounts.find(item => item.platform === target.platform && item.accountProfile === target.accountProfile);
    if (capabilities.unavailableReason) throw new Error(capabilities.unavailableReason);
    const base = { id: flow.id, expectedRevision: flow.revision, ...(flow.packagePath ? { packagePath: flow.packagePath } : {}), confirmed: true };
    if (!account?.capabilities[target.mode].enabled) {
      const session = await this.publisher.beginAcceptance({ ...base, platform: target.platform, accountProfile: target.accountProfile, capability: target.mode, expectedAccountLabel: target.displayName, ...(target.scheduledAt ? { scheduledAt: target.scheduledAt } : {}) }, signal);
      target.acceptanceSessionId = session.sessionId;
    }
    const summary = await this.publisher.preparationSummary(flow.id, flow.packagePath, target.platform);
    target.materials = summary.materials; target.title = summary.title;
    target.state = "preparing"; await this.save(flow);
    target.task = await this.publisher.prepare({ ...base, intents: [{ platform: target.platform, accountProfile: target.accountProfile, mode: target.mode, ...(target.scheduledAt ? { scheduledAt: target.scheduledAt } : {}) }], originalRightsConfirmed: flow.originalRightsConfirmed, ...(target.acceptanceSessionId ? { acceptanceSessionId: target.acceptanceSessionId } : {}) }, signal);
    const row = target.task.platforms[target.platform];
    if (!row?.ready) throw new Error(row?.commitBlocker?.message ?? "平台页面尚未准备完成");
    if (target.mode === "prepare_only") {
      if (target.acceptanceSessionId) await this.publisher.finalizeAcceptance({ ...base, platform: target.platform, capability: "prepare_only", acceptanceSessionId: target.acceptanceSessionId, taskId: target.task.taskId }, signal, { recordPublication: false });
      target.state = "prepared"; target.message = "已准备，等待检查；未执行发布";
    } else { this.approval(target); target.state = "ready"; }
    await this.save(flow);
  }

  private async commitTarget(flow: PublishFlow, target: Target, signal: AbortSignal) {
    const row = this.approval(target);
    await this.verifyAccount(target, signal, true);
    // Persist uncertainty before entering the external submission controller.
    target.state = "committing"; target.message = null; await this.save(flow);
    const base = { id: flow.id, expectedRevision: flow.revision, ...(flow.packagePath ? { packagePath: flow.packagePath } : {}), confirmed: true, platform: target.platform };
    target.task = await this.publisher.commit({ ...base, taskId: target.task!.taskId, authorizationDigest: row.authorizationDigest!, ...(target.acceptanceSessionId ? { acceptanceSessionId: target.acceptanceSessionId } : {}) }, signal, { recordPublication: false });
    const result = target.task.platforms[target.platform];
    if (result?.status === "COMMIT_UNKNOWN") { target.state = "unknown"; target.message = "提交结果待核实，不能自动重试"; }
    else if (result?.status === "PUBLISHED_CONFIRMED" || result?.status === "SCHEDULE_CONFIRMED") {
      if (target.acceptanceSessionId) await this.publisher.finalizeAcceptance({ ...base, taskId: target.task.taskId, capability: target.mode, acceptanceSessionId: target.acceptanceSessionId }, signal, { recordPublication: false });
      target.state = result.status === "PUBLISHED_CONFIRMED" ? "published" : "scheduled";
    } else throw new Error(result?.commitBlocker?.message ?? "未取得确定的发布结果，请先核实平台");
    await this.save(flow);
  }

  private async reconcileResults(flow: PublishFlow) {
    for (const target of flow.targets) {
      if (target.state !== "unknown" || !target.task) continue;
      try {
        const signal = AbortSignal.timeout(15_000);
        const status = await this.publisher.status({ id: flow.id, taskId: target.task.taskId }, signal);
        const row = status.task?.platforms[target.platform];
        if (!row || !["PUBLISHED_CONFIRMED", "SCHEDULE_CONFIRMED"].includes(row.status)) continue;
        target.task = status.task;
        target.state = row.status === "PUBLISHED_CONFIRMED" ? "published" : "scheduled";
        target.message = null;
        if (target.acceptanceSessionId) {
          try {
            await this.publisher.finalizeAcceptance({ id: flow.id, expectedRevision: flow.revision, ...(flow.packagePath ? { packagePath: flow.packagePath } : {}), taskId: status.task!.taskId, platform: target.platform, capability: target.mode, acceptanceSessionId: target.acceptanceSessionId, confirmed: true }, signal, { recordPublication: false });
          } catch (error) { target.message = `平台结果已核实，能力验证记录待处理：${messageOf(error)}`; }
        }
      } catch (error) { target.message = `提交结果仍待核实：${messageOf(error)}`; }
    }
  }

  private async recordFacts(flow: PublishFlow) {
    const updates: Partial<Record<MuziVideoPlatform, MuziPublicationState>> = {};
    const pending: Target[] = [];
    const project = await this.muzi.getProject({ id: flow.id });
    for (const target of flow.targets) {
      const row = target.task?.platforms[target.platform];
      if (!row || target.factsRecorded || !["published", "scheduled"].includes(target.state)) continue;
      const fact: MuziPublicationState = { status: target.state === "published" ? "published" : "platform_draft", remoteId: row.remoteId, url: row.url, scheduledAt: row.scheduledAt, publishedAt: target.state === "published" ? row.confirmedAt : null, source: "publisher" };
      const existing = project.publications?.[target.platform];
      if (existing && Object.entries(fact).every(([key, value]) => existing[key as keyof MuziPublicationState] === value)) {
        target.factsRecorded = true;
      } else { updates[target.platform] = fact; pending.push(target); }
    }
    if (!pending.length) return;
    try {
      const updated = await this.muzi.patchPublicationStates(flow.id, project.revision, updates);
      flow.revision = updated.revision;
      for (const target of pending) target.factsRecorded = true;
      for (const target of flow.targets) if (["ready", "prepared"].includes(target.state)) {
        target.state = "blocked"; target.message = "其他目标已提交，继续前请重新准备当前内容版本";
        const row = target.task?.platforms[target.platform];
        if (row) { row.authorizationDigest = null; row.commitEnabled = false; }
      }
    } catch (error) {
      for (const target of pending) target.message = `平台操作已完成，本地记录待同步：${messageOf(error)}`;
    }
  }

  /** Abort controllers and wait for final durable progress before plugin disposal. */
  async dispose(): Promise<void> {
    this.disposed = true;
    const jobs = [...this.jobs.values()];
    for (const job of jobs) job.controller.abort(new Error("工作台已关闭"));
    await Promise.allSettled(jobs.map(job => job.done));
  }
}
