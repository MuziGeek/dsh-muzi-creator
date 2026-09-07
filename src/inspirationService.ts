import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { openConfiguredObsidian } from "./obsidian.ts";
import { inspirationReportSchema, inspirationReportSubmissionSchema } from "./inspirationSchemas.ts";
import { InspirationStore } from "./inspirationStore.ts";
import type {
  ArchiveInspirationRequest,
  ArchiveInspirationResult,
  GetInspirationRequest,
  InspirationDetail,
  InspirationEvidenceNote,
  InspirationId,
  InspirationItem,
  InspirationOverview,
  InspirationReference,
  InspirationResearchSpec,
  InspirationReport,
  InspirationReportSubmission,
  InspirationRun,
  InspirationRunId,
  InspirationRunStatus,
  InspirationTimeWindow,
  InspirationTask,
  ListInspirationsRequest,
  MarkInspirationReadRequest,
  OpenInspirationReportRequest,
  RunInspirationTaskNowRequest,
  SaveInspirationDraftRequest,
  SaveInspirationTaskRequest,
  SerializeInspirationReferenceRequest,
  SetInspirationTaskStateRequest,
  StartInspirationResearchRequest,
  StartInspirationResearchResult,
  StopInspirationRunRequest,
} from "./inspirationTypes.ts";

const ALLOWED_TOOLS = new Set([
  "web_search",
  "web_fetch",
  "muzi_knowledge_search",
  "muzi_knowledge_read",
  "muzi_inspiration_submit_report",
]);
const MAX_REPORT_BYTES = 64 * 1024;

/** Structural session API used by DSH Desktop 2.0.4 and test doubles. */
export interface InspirationSessionController {
  create(input: { title: string; workingDirectory: string }): Promise<string | { id: string; agentId?: string }>;
  resolve?(sessionId: string): Promise<{ id: string; agentId: string } | null>;
  rename?(sessionId: string, title: string): Promise<void> | void;
  prompt?(sessionId: string, prompt: string): Promise<void> | void;
  cancel?(sessionId: string): Promise<void> | void;
  waitForIdle?(sessionId: string): Promise<void> | void;
}

/** Structural guard API. A restriction may return a disposer owned by the host. */
export interface InspirationAgents {
  restrict(agentId: string, allowed: (toolName: string) => boolean): void | (() => void);
  installGlobalGuard?(guard: (input: { agent?: { id?: string }; toolName?: string; tool?: { name?: string } }) => boolean): void | (() => void);
}

/** Runtime services deliberately limited to the session and tool permissions this feature needs. */
export interface InspirationRuntime {
  sessionController: InspirationSessionController;
  agents: InspirationAgents;
  tools?: { register?: (tool: unknown) => void };
  logger?: { warn?: (message: string) => void; error?: (message: string) => void };
}

export interface InspirationServiceOptions {
  dataDir: string;
  creatorRoot: string;
  obsidianExecutable?: string | (() => string | undefined);
  now?: () => Date;
}

interface ManagedSession {
  sessionId: string;
  agentId: string;
}

function id<T extends string>(): T {
  return randomUUID() as T;
}

function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertRevision(actual: number, expected: number, label: string): void {
  if (actual !== expected) throw new Error(`${label} 已被其他操作更新，请刷新后重试`);
}

function finalStatus(status: InspirationRunStatus): boolean {
  return ["ready", "partial", "failed", "needs_attention", "cancelled", "interrupted"].includes(status);
}

const DEFAULT_TREND_TOPIC = "全网综合热点";
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function formatWindow(window: InspirationTimeWindow | undefined): string {
  return window === undefined ? "不限定时间范围" : `${window.startAt} 至 ${window.endAt}（结束时间不包含在内）`;
}

function promptFor(run: InspirationRun): string {
  const sourceTarget = run.spec.depth === "quick" ? "4–6" : run.spec.depth === "standard" ? "8–12" : "12–20";
  return [
    "你是受限的 Muzi Creator 灵感研究员。请用中文提交结构化报告。",
    `研究类型：${run.spec.mode === "trend" ? "全网综合趋势研究" : "主题研究"}`,
    `研究主题：${run.spec.topic}`,
    `实际时间窗：${formatWindow(run.timeWindow)}`,
    `研究目标：${run.spec.objective}`,
    `待回答问题：${run.spec.questions.join(" | ") || "无"}`,
    `来源语言：${run.spec.sourceLanguage}`,
    `研究深度：${run.spec.depth}；目标 ${sourceTarget} 个相互独立的公开来源。`,
    `优先域名：${run.spec.preferredDomains.join(", ") || "无"}`,
    `排除域名：${run.spec.excludedDomains.join(", ") || "无"}`,
    "只能访问公开 HTTP(S) 页面。不得登录、访问私有账号或绕过付费内容。",
    run.spec.mode === "trend"
      ? "趋势报告的每个来源必须声明发布时间，且声明日期位于实际时间窗内；未知或窗外日期不能作为窗口热点依据。合并同一事件，逐项说明事件和有来源支持的关注原因，不得编造全网排名、榜单位置或热度数字。"
      : "优先使用一手和权威来源；未知发布时间须明确保留为未知。",
    "报告只包含摘要、可核查事实、案例、创作角度、下一步和来源，不要撰写完整文章。",
    "发现和分歧必须通过 sourceIds 关联对应来源；创作角度应基于这些发现，涉及具体事实时标注对应来源 id。",
    "只能使用允许的研究和知识工具；不要把报告正文写入聊天消息。",
    "如果来源或信息不足，提交部分报告并在 partialReason 说明；空结果可以保留，不得编造来源、日期或结论。",
    `完成后调用 muzi_inspiration_submit_report，并传入 runId ${run.id}`,
  ].join("\n");
}

function normalizeSpec(spec: InspirationResearchSpec): InspirationResearchSpec {
  const topic = spec.topic.trim();
  if (spec.mode === "topic" && topic === "") throw new Error("主题研究需要非空主题");
  return {
    ...copy(spec),
    topic: spec.mode === "trend" && topic === "" ? DEFAULT_TREND_TOPIC : topic,
  };
}

function calendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new Error("自定义时间范围必须使用 YYYY-MM-DD 日期");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("自定义时间范围包含无效日期");
  }
  return new Date(Date.UTC(year, month - 1, day, -8));
}

function resolveTimeWindow(spec: InspirationResearchSpec, now: Date): InspirationTimeWindow | undefined {
  const selected = spec.timeRange ?? (spec.mode === "trend" ? { kind: "24h" as const } : undefined);
  if (selected === undefined) return undefined;
  if (selected.kind !== "custom") {
    const hours = selected.kind === "24h" ? 24 : selected.kind === "7d" ? 7 * 24 : 30 * 24;
    return { startAt: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(), endAt: now.toISOString() };
  }
  const start = calendarDate(selected.startDate);
  const end = calendarDate(selected.endDate);
  const shanghaiToday = shanghaiDate(now);
  if (selected.endDate > shanghaiToday) throw new Error("自定义时间范围不能包含未来日期");
  if (start.getTime() > end.getTime()) throw new Error("自定义时间范围的开始日期不能晚于结束日期");
  return { startAt: start.toISOString(), endAt: new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString() };
}

function declaredPublishedAt(value: string | null): Date | null {
  if (value === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try { return calendarDate(value); } catch { return null; }
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (match === null) return null;
  try { calendarDate(match[1]!); } catch { return null; }
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = match[4] === undefined ? 0 : Number(match[4]);
  const zone = match[5]!;
  if (hour > 23 || minute > 59 || second > 59 || (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))) return null;
  const published = new Date(value);
  return Number.isNaN(published.getTime()) ? null : published;
}

function publishedWithin(source: { publishedAt: string | null }, window: InspirationTimeWindow, receivedAt: Date): boolean {
  const published = declaredPublishedAt(source.publishedAt);
  return published !== null && published.getTime() <= receivedAt.getTime()
    && published.getTime() >= new Date(window.startAt).getTime()
    && published.getTime() < new Date(window.endAt).getTime();
}

function isInside(root: string, target: string): boolean {
  const part = relative(root, target);
  return part === "" || (!part.startsWith("..") && !isAbsolute(part));
}

async function safeDirectory(path: string): Promise<string> {
  const full = resolve(path);
  const root = parse(full).root;
  const pieces = relative(root, full).split(/[\\/]+/).filter(Boolean);
  let current = root;
  for (const piece of pieces) {
    current = join(current, piece);
    await mkdir(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) throw new Error(`报告目录不能包含符号链接或目录联接：${current}`);
    if (!entry.isDirectory()) throw new Error(`报告目录不是文件夹：${current}`);
  }
  return realpath(full);
}

function shanghaiDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function fileSlug(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[. -]+$/g, "")
    .replace(/^-+/g, "")
    .slice(0, 48);
  return cleaned === "" ? "inspiration" : cleaned;
}

async function safeReportPath(
  creatorRoot: string,
  run: InspirationRun,
  timestamp: Date,
  mustNotExist = false,
): Promise<string> {
  const root = await safeDirectory(creatorRoot);
  const category = run.ownerKind === "item" ? "one-off" : "recurring";
  const folder = await safeDirectory(join(
    root,
    "00-inbox",
    "inspirations",
    category,
    ...(run.ownerKind === "task" ? [run.ownerId] : []),
  ));
  if (!isInside(root, folder)) throw new Error("报告目录逃逸 Creator 根目录");
  const shortId = String(run.id).replaceAll("-", "").slice(0, 8);
  const name = run.ownerKind === "item"
    ? `${shanghaiDate(timestamp)}_${fileSlug(run.spec.topic)}_${shortId}.md`
    : `${shanghaiDate(timestamp)}_${run.id}.md`;
  const path = resolve(folder, name);
  if (!isInside(folder, path)) throw new Error("报告文件路径非法");
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) throw new Error("报告文件不能是符号链接或目录联接");
    if (!entry.isFile()) throw new Error("报告目标不是普通文件");
    if (mustNotExist) throw new Error("历史灵感报告已存在，不能覆盖");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return path;
}

function markdownText(value: string): string {
  return value.replaceAll("\r", "").trim();
}

function reportDocument(report: InspirationReport, run: InspirationRun): string {
  const sourceLines = report.sources.map((source) => {
    const published = source.publishedAt ?? "未知";
    return `- [${source.id}] ${source.title} — <${source.url}> — 发布：${published} — 抓取：${source.retrievedAt}`;
  });
  const evidenceLines = (notes: InspirationReport["findings"]): string[] => notes.map((note) => {
    const citations = note.sourceIds.map((sourceId) => `[${sourceId}]`).join(" ");
    return `- ${markdownText(note.text)}${citations === "" ? "" : ` ${citations}`}（${note.evidence}）`;
  });
  const frontmatter = stringifyYaml({ schema: "muzi.inspiration/1", report }, { lineWidth: 0 }).trimEnd();
  return [
    "---",
    frontmatter,
    "---",
    "",
    `# ${markdownText(run.spec.topic)}`,
    "",
    "## 摘要",
    "",
    markdownText(report.summary),
    "",
    "## 关键发现",
    "",
    ...evidenceLines(report.findings),
    "",
    "## 分歧与未知",
    "",
    ...(report.disagreements.length === 0 ? ["- 暂无已识别的分歧。"] : evidenceLines(report.disagreements)),
    "",
    "## 创作角度",
    "",
    ...report.angles.map((angle) => `- ${markdownText(angle)}`),
    "",
    "## 建议的下一步",
    "",
    ...report.nextSteps.map((step) => `- ${markdownText(step)}`),
    "",
    "## 来源",
    "",
    ...sourceLines,
    "",
  ].join("\n");
}

function parseReportDocument(text: string): InspirationReport | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (match?.[1] === undefined) return null;
  const metadata = parseYaml(match[1]) as unknown;
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as { schema?: unknown; report?: unknown };
  if (record.schema !== "muzi.inspiration/1") return null;
  const parsed = inspirationReportSchema.safeParse(record.report);
  return parsed.success ? parsed.data as InspirationReport : null;
}

function referenceText(report: InspirationReport, run: InspirationRun): string {
  const evidenceLabels = { supported: "有来源支持", contested: "存在分歧", uncertain: "尚待核实" } as const;
  const evidenceLines = (notes: InspirationEvidenceNote[]): string[] => notes.map((note) => {
    const citations = note.sourceIds.map((sourceId) => `[${sourceId}]`).join(" ");
    return `- ${markdownText(note.text)}${citations === "" ? "" : ` ${citations}`}（${evidenceLabels[note.evidence]}）`;
  });
  const sourceLines = report.sources.map((source) => `- [${source.id}] ${source.title} — <${source.url}> — 发布：${source.publishedAt ?? "未知"}`);
  return [
    `# 灵感研究报告：${run.spec.topic}`,
    ...(run.timeWindow === undefined ? [] : [`时间窗：${run.timeWindow.startAt} 至 ${run.timeWindow.endAt}（结束时间不包含在内）`]),
    "",
    "## 总结",
    report.summary,
    ...(report.partialReason === null ? [] : ["", "### 局限说明", report.partialReason]),
    "",
    "## 参考素材",
    ...(report.findings.length === 0 ? ["- 暂无可确认发现。"] : evidenceLines(report.findings)),
    ...(report.disagreements.length === 0 ? [] : ["", "### 分歧与未知", ...evidenceLines(report.disagreements)]),
    ...(report.angles.length === 0 ? [] : ["", "### 创作角度", ...report.angles.map((angle) => `- ${markdownText(angle)}`)]),
    ...(report.nextSteps.length === 0 ? [] : ["", "### 建议的下一步", ...report.nextSteps.map((step) => `- ${markdownText(step)}`)]),
    "",
    "## 来源",
    ...(sourceLines.length === 0 ? ["暂无可靠来源。"] : sourceLines),
  ].join("\n").slice(0, MAX_REPORT_BYTES);
}

function domainAllowed(domain: string, excluded: readonly string[]): boolean {
  const normalized = domain.toLowerCase();
  return !excluded.some((candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`));
}

/** Host-owned inspiration workflow, persistence, queueing, visible sessions, and report integrity. */
export class InspirationService {
  readonly store: InspirationStore;
  private readonly now: () => Date;
  private readonly queue: InspirationRunId[] = [];
  private draining = false;
  private runtime: InspirationRuntime | undefined;
  private readonly managedSessions = new Map<string, ManagedSession>();
  private readonly managedAgentIds = new Set<string>();
  private readonly restrictions = new Map<string, () => void>();
  private globalGuardDisposer: (() => void) | undefined;

  constructor(private readonly options: InspirationServiceOptions) {
    this.store = new InspirationStore(options.dataDir);
    this.now = options.now ?? (() => new Date());
  }

  /** Attach the Desktop services used for visible session execution and install the managed-session guard. */
  async attachRuntime(runtime: InspirationRuntime): Promise<void> {
    this.globalGuardDisposer?.();
    for (const dispose of this.restrictions.values()) dispose();
    this.restrictions.clear();
    this.managedSessions.clear();
    this.managedAgentIds.clear();
    this.runtime = runtime;
    const disposer = runtime.agents.installGlobalGuard?.((input) => this.globalGuard(input));
    this.globalGuardDisposer = typeof disposer === "function" ? disposer : undefined;
    const index = await this.store.read();
    for (const owner of [...Object.values(index.items), ...Object.values(index.tasks)]) {
      if (owner.sessionId === null || runtime.sessionController.resolve === undefined) continue;
      const resumed = await runtime.sessionController.resolve(owner.sessionId);
      if (resumed !== null) this.rememberManagedSession({ sessionId: resumed.id, agentId: resumed.agentId });
    }
    const queued = Object.values(index.runs)
      .filter((run) => run.status === "queued")
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
    for (const run of queued.filter((candidate) => candidate.ownerKind === "item")) {
      if (!this.queue.includes(run.id)) this.queue.push(run.id);
    }
    void this.drain();
  }

  /** Release guards and scoped restrictions without changing durable task authorization. */
  dispose(): void {
    this.globalGuardDisposer?.();
    this.globalGuardDisposer = undefined;
    for (const dispose of this.restrictions.values()) dispose();
    this.restrictions.clear();
    this.managedSessions.clear();
    this.managedAgentIds.clear();
    this.runtime = undefined;
  }

  /** Return whether an invocation is allowed by the global guard for a managed agent. */
  globalGuard(input: { agent?: { id?: string }; toolName?: string; tool?: { name?: string } }): boolean {
    const agentId = input.agent?.id;
    if (agentId === undefined || !this.isManagedAgent(agentId)) return true;
    return this.isAllowedTool(input.toolName ?? input.tool?.name ?? "");
  }

  /** Return whether a tool belongs to the narrow inspiration allowlist. */
  isAllowedTool(toolName: string): boolean {
    return ALLOWED_TOOLS.has(toolName);
  }

  /** Return whether an agent currently belongs to a host-managed inspiration session. */
  isManagedAgent(agentId: string): boolean {
    return this.managedAgentIds.has(agentId)
      || [...this.managedSessions.values()].some((record) => record.agentId === agentId);
  }

  async listInspirations(request: ListInspirationsRequest = {}): Promise<InspirationOverview> {
    const index = await this.store.read();
    const query = request.query?.trim().toLowerCase() ?? "";
    const match = (value: string) => query === "" || value.toLowerCase().includes(query);
    const items = Object.values(index.items)
      .filter((item) => (request.includeArchived === true || !item.archived) && match(`${item.spec.topic} ${item.spec.objective}`));
    const tasks = Object.values(index.tasks)
      .filter((task) => (request.includeArchived === true || task.state !== "archived") && match(`${task.name} ${task.spec.topic} ${task.spec.objective}`));
    const allRuns = Object.values(index.runs).sort((left, right) => right.queuedAt.localeCompare(left.queuedAt));
    const recentRuns = allRuns.slice(0, 100);
    return {
      schemaVersion: 1,
      revision: index.revision,
      generatedAt: this.now().toISOString(),
      items: copy(items), tasks: copy(tasks), recentRuns: copy(recentRuns),
      counts: {
        needsAttention: allRuns.filter((run) => run.status === "needs_attention").length,
        running: allRuns.filter((run) => run.status === "running").length,
        queued: allRuns.filter((run) => run.status === "queued").length,
        unread: allRuns.filter((run) => run.unread).length,
      },
    };
  }

  /** Return the durable ledger revision without materializing the overview. */
  async getRevision(): Promise<number> {
    return (await this.store.read()).revision;
  }

  async getInspiration(request: GetInspirationRequest): Promise<InspirationDetail> {
    const index = await this.store.read();
    const owner = request.kind === "item" ? index.items[request.id] : index.tasks[request.id];
    if (owner === undefined) throw new Error("找不到灵感研究记录");
    const run = request.runId === undefined
      ? (owner.latestRunId === null ? null : index.runs[owner.latestRunId] ?? null)
      : index.runs[request.runId] ?? null;
    if (run !== null && run.ownerId !== owner.id) throw new Error("研究运行不属于该记录");
    const loaded = run === null ? { report: null, integrity: "unavailable" as const } : await this.loadReport(run);
    const previousRuns = Object.values(index.runs)
      .filter((candidate) => candidate.ownerId === owner.id && candidate.id !== run?.id)
      .sort((left, right) => right.queuedAt.localeCompare(left.queuedAt));
    return { schemaVersion: 1, owner: copy(owner), run: run === null ? null : copy(run), report: loaded.report, reportIntegrity: loaded.integrity, previousRuns: copy(previousRuns) };
  }

  async saveInspirationDraft(request: SaveInspirationDraftRequest): Promise<InspirationItem> {
    return this.store.mutate((index) => {
      const now = this.now().toISOString();
      if (request.id === undefined) {
        const item: InspirationItem = { id: id<InspirationId>(), revision: 0, spec: normalizeSpec(request.spec), archived: false, sessionId: null, latestRunId: null, createdAt: now, updatedAt: now };
        index.items[item.id] = item;
        return copy(item);
      }
      const item = index.items[request.id];
      if (item === undefined) throw new Error("找不到灵感草稿");
      if (request.expectedRevision === undefined) throw new Error("更新草稿需要 expectedRevision");
      assertRevision(item.revision, request.expectedRevision, "灵感草稿");
      item.spec = normalizeSpec(request.spec); item.revision += 1; item.updatedAt = now;
      return copy(item);
    });
  }

  async startInspirationResearch(request: StartInspirationResearchRequest): Promise<StartInspirationResearchResult> {
    const receivedAt = this.now();
    const spec = normalizeSpec(request.spec);
    const timeWindow = resolveTimeWindow(spec, receivedAt);
    const item = await this.saveInspirationDraft({ ...request, spec });
    const run = await this.enqueue(item.id, "item", request.id === undefined ? "manual" : "rerun", timeWindow);
    if (run === null) throw new Error("已归档的灵感不能再次调研");
    return { item: await this.item(item.id), run };
  }

  async stopInspirationRun(request: StopInspirationRunRequest): Promise<InspirationRun> {
    const run = await this.store.mutate((index) => {
      const value = index.runs[request.runId];
      if (value === undefined) throw new Error("找不到研究运行");
      assertRevision(value.revision, request.expectedRevision, "研究运行");
      if (finalStatus(value.status)) return copy(value);
      value.status = "cancelled"; value.finishedAt = this.now().toISOString(); value.revision += 1;
      return copy(value);
    });
    if (run.sessionId !== null) await this.runtime?.sessionController.cancel?.(run.sessionId);
    return run;
  }

  async saveInspirationTask(request: SaveInspirationTaskRequest): Promise<InspirationTask> {
    void request;
    throw new Error("每日灵感任务已停用；请新建一次性研究");
  }

  async setInspirationTaskState(request: SetInspirationTaskStateRequest): Promise<InspirationTask> {
    void request;
    throw new Error("每日灵感任务已停用；请新建一次性研究");
  }

  async runInspirationTaskNow(request: RunInspirationTaskNowRequest): Promise<InspirationRun> {
    void request;
    throw new Error("每日灵感任务已停用；请新建一次性研究");
  }

  async markInspirationRead(request: MarkInspirationReadRequest): Promise<InspirationRun> {
    return this.store.mutate((index) => {
      const run = index.runs[request.runId];
      if (run === undefined) throw new Error("找不到研究运行");
      assertRevision(run.revision, request.expectedRevision, "研究运行");
      run.unread = false; run.revision += 1;
      return copy(run);
    });
  }

  async archiveInspiration(request: ArchiveInspirationRequest): Promise<ArchiveInspirationResult> {
    return this.store.mutate((index) => {
      const item = index.items[request.id];
      if (item === undefined) throw new Error("找不到灵感草稿");
      assertRevision(item.revision, request.expectedRevision, "灵感草稿");
      item.archived = true; item.revision += 1; item.updatedAt = this.now().toISOString();
      return copy(item);
    });
  }

  async serializeInspirationReference(request: SerializeInspirationReferenceRequest): Promise<InspirationReference> {
    const run = await this.run(request.runId);
    const { report, integrity } = await this.loadReport(run);
    if (integrity !== "ok" || report === null || run.reportSha256 === null) throw new Error("报告不可用或完整性校验失败");
    if (request.expectedSha256 !== undefined && request.expectedSha256 !== run.reportSha256) throw new Error("报告已更新，请刷新后再复制引用");
    const text = referenceText(report, run);
    return { ref: `inspiration:${run.ownerId}:${run.id}`, label: report.summary.slice(0, 80), clipboardText: `${report.summary}\n\n[灵感研究报告 ${run.id}]`, sha256: run.reportSha256, text };
  }

  async openInspirationReport(request: OpenInspirationReportRequest, signal: AbortSignal = new AbortController().signal): Promise<{ opened: true }> {
    const run = await this.run(request.runId);
    const { integrity } = await this.loadReport(run);
    if (integrity !== "ok" || run.reportPath === null) throw new Error("报告不可用或完整性校验失败");
    const uri = `obsidian://open?path=${encodeURIComponent(run.reportPath)}`;
    const executable = typeof this.options.obsidianExecutable === "function"
      ? this.options.obsidianExecutable()
      : this.options.obsidianExecutable;
    await openConfiguredObsidian(executable, uri, signal);
    return { opened: true };
  }

  /** Accept an agent's structured report only while its exact run is active. */
  async submitReport(agentId: string | undefined, submission: InspirationReportSubmission): Promise<InspirationRun> {
    const byteLength = Buffer.byteLength(JSON.stringify(submission), "utf8");
    if (byteLength > MAX_REPORT_BYTES) throw new Error("灵感报告超过 64KiB 限制");
    const parsed = inspirationReportSubmissionSchema.safeParse(submission);
    if (!parsed.success) throw new Error(`灵感报告格式无效：${parsed.error.message}`);
    const validated = parsed.data as InspirationReportSubmission;
    return this.store.mutate(async (index) => {
      const run = index.runs[validated.runId];
      if (run === undefined) throw new Error("找不到研究运行");
      const managed = run.sessionId === null ? undefined : this.managedSessions.get(run.sessionId);
      const boundAgentId = managed?.agentId ?? run.sessionId;
      if (agentId === undefined || boundAgentId === null || boundAgentId !== agentId) {
        throw new Error("报告只能由该运行绑定的 Agent 提交");
      }
      if (run.status === "ready" || run.status === "partial") {
        const loaded = await this.loadReport(run);
        if (loaded.integrity === "ok" && loaded.report !== null && this.sameSubmission(loaded.report, validated)) return copy(run);
        if (loaded.integrity === "ok") throw new Error("同一运行不能提交不同的第二份报告");
        throw new Error("已完成报告的完整性校验失败");
      }
      if (run.status !== "running") throw new Error("该研究运行当前不接受报告");
      this.validateSubmission(run, validated);
      const completedAt = this.now().toISOString();
      const report: InspirationReport = {
        schemaVersion: 1, runId: run.id, generatedAt: completedAt, status: validated.status,
        partialReason: validated.status === "partial" ? validated.partialReason ?? "研究结果不完整" : null,
        summary: validated.summary,
        findings: validated.findings.map((note) => ({ ...note, evidence: note.evidence ?? "supported" })),
        disagreements: validated.disagreements.map((note) => ({ ...note, evidence: note.evidence ?? "contested" })),
        angles: validated.angles, nextSteps: validated.nextSteps,
        sources: validated.sources.map((source) => ({ ...source, retrievedAt: this.now().toISOString() })),
      };
      const checked = inspirationReportSchema.parse(report) as InspirationReport;
      const text = reportDocument(checked, run);
      if (Buffer.byteLength(text, "utf8") > MAX_REPORT_BYTES) throw new Error("渲染后的灵感报告超过 64KiB 限制");
      const path = await safeReportPath(this.options.creatorRoot, run, new Date(checked.generatedAt), true);
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
      try {
        await link(temporary, path);
      } finally {
        await unlink(temporary).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            this.runtime?.logger?.warn?.(`无法清理灵感报告临时文件：${String(error)}`);
          }
        });
      }
      run.status = checked.status; run.finishedAt = completedAt; run.reportPath = path; run.reportSha256 = textHash(text); run.unread = true; run.error = null; run.revision += 1;
      return copy(run);
    });
  }

  private async enqueue(
    ownerId: InspirationId,
    ownerKind: "item",
    trigger: "manual" | "rerun",
    timeWindow: InspirationTimeWindow | undefined,
  ): Promise<InspirationRun | null> {
    const run = await this.store.mutate((index) => {
      const owner = index.items[ownerId];
      if (owner === undefined) throw new Error("找不到灵感研究所有者");
      if (owner.archived) return null;
      const duplicate = Object.values(index.runs).find((candidate) => candidate.ownerId === ownerId && (candidate.status === "queued" || candidate.status === "running"));
      if (duplicate !== undefined) {
        return copy(duplicate);
      }
      const now = this.now().toISOString();
      const created: InspirationRun = { id: id<InspirationRunId>(), revision: 0, ownerKind, ownerId, trigger, status: "queued", spec: copy(owner.spec), ...(timeWindow === undefined ? {} : { timeWindow }), scheduledFor: null, queuedAt: now, startedAt: null, finishedAt: null, sessionId: null, reportPath: null, reportSha256: null, unread: false, error: null };
      index.runs[created.id] = created;
      owner.latestRunId = created.id; owner.revision += 1; owner.updatedAt = now;
      return copy(created);
    });
    if (run !== null && !this.queue.includes(run.id)) {
      this.queue.push(run.id);
      void this.drain();
    }
    return run;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const runId = this.queue.shift();
        if (runId !== undefined) {
          await this.execute(runId);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async execute(runId: InspirationRunId): Promise<void> {
    let run = await this.store.mutate((index) => {
      const current = index.runs[runId];
      if (current === undefined || current.status !== "queued") return null;
      current.status = "running"; current.startedAt = this.now().toISOString(); current.revision += 1;
      return copy(current);
    });
    if (run === null) return;
    try {
      const session = await this.ensureSession(run);
      run = await this.store.mutate((index) => {
        const current = index.runs[runId]!;
        if (current.status !== "running") return copy(current);
        current.sessionId = session.sessionId; current.revision += 1;
        const owner = current.ownerKind === "item" ? index.items[current.ownerId] : index.tasks[current.ownerId];
        if (owner !== undefined && owner.sessionId !== session.sessionId) { owner.sessionId = session.sessionId; owner.revision += 1; owner.updatedAt = this.now().toISOString(); }
        return copy(current);
      });
      if (run.status !== "running") return;
      if (this.runtime === undefined) throw new Error("灵感研究运行时尚未连接");
      await this.runtime.sessionController.rename?.(session.sessionId, `灵感 · ${run.spec.topic}`);
      if (!await this.running(runId)) return;
      await this.runtime.sessionController.prompt?.(session.sessionId, promptFor(run));
      await this.runtime.sessionController.waitForIdle?.(session.sessionId);
      await this.store.mutate((index) => {
        const current = index.runs[runId]!;
        if (current.status === "running") { current.status = "needs_attention"; current.finishedAt = this.now().toISOString(); current.error = { code: "REPORT_MISSING", message: "Agent became idle without submitting a structured report." }; current.revision += 1; }
      });
    } catch (error) {
      await this.store.mutate((index) => {
        const current = index.runs[runId];
        if (current === undefined || current.status !== "running") return;
        current.status = "failed"; current.finishedAt = this.now().toISOString(); current.error = { code: "SESSION_FAILURE", message: error instanceof Error ? error.message : String(error) }; current.revision += 1;
      });
      this.runtime?.logger?.error?.(`灵感研究 ${runId} 执行失败：${String(error)}`);
    }
  }

  private async ensureSession(run: InspirationRun): Promise<ManagedSession> {
    if (this.runtime === undefined) throw new Error("灵感研究运行时尚未连接");
    const index = await this.store.read();
    const owner = run.ownerKind === "item" ? index.items[run.ownerId] : index.tasks[run.ownerId];
    if (owner?.sessionId !== null && owner !== undefined) {
      const existing = this.managedSessions.get(owner.sessionId);
      if (existing !== undefined) return existing;
      const resumed = await this.runtime.sessionController.resolve?.(owner.sessionId);
      if (resumed !== null && resumed !== undefined) {
        return this.rememberManagedSession({ sessionId: resumed.id, agentId: resumed.agentId });
      }
    }
    const workdir = resolve(this.options.dataDir, "inspiration", "sessions", run.ownerId);
    const dataRoot = await safeDirectory(this.options.dataDir);
    if (!isInside(dataRoot, workdir)) throw new Error("研究会话工作目录逃逸 dataDir");
    await safeDirectory(workdir);
    const created = await this.runtime.sessionController.create({ title: `灵感 · ${run.spec.topic}`, workingDirectory: workdir });
    const sessionId = typeof created === "string" ? created : created.id;
    const agentId = typeof created === "string" ? created : created.agentId ?? created.id;
    return this.rememberManagedSession({ sessionId, agentId });
  }

  private rememberManagedSession(managed: ManagedSession): ManagedSession {
    this.managedSessions.set(managed.sessionId, managed);
    this.managedAgentIds.add(managed.agentId);
    this.restrictions.get(managed.sessionId)?.();
    const disposer = this.runtime?.agents.restrict(managed.agentId, (tool) => this.isAllowedTool(tool));
    if (typeof disposer === "function") this.restrictions.set(managed.sessionId, disposer);
    return managed;
  }

  private validateSubmission(run: InspirationRun, report: InspirationReportSubmission): void {
    const minimumSources = run.spec.depth === "quick" ? 4 : run.spec.depth === "standard" ? 8 : 12;
    if (report.sources.length < minimumSources && report.status !== "partial") {
      throw new Error(`来源不足 ${minimumSources} 条时必须提交部分报告`);
    }
    if (report.status === "partial" && (report.partialReason === undefined || report.partialReason.trim() === "")) {
      throw new Error("部分报告必须说明来源或信息不足的原因");
    }
    if (report.status === "partial" && report.sources.length === 0 && (report.findings.length !== 0 || report.disagreements.length !== 0 || report.angles.length !== 0)) {
      throw new Error("无来源的部分报告不能包含发现、分歧或创作角度");
    }
    const sourceIds = new Set<string>();
    for (const source of report.sources) {
      if (sourceIds.has(source.id)) throw new Error("报告来源 id 不能重复");
      sourceIds.add(source.id);
      let domain: string;
      try { domain = new URL(source.url).hostname.toLowerCase(); } catch { throw new Error("报告来源 URL 无效"); }
      if (domain !== source.domain.toLowerCase()) throw new Error("报告来源 domain 必须与 URL 主机名一致");
      if (!domainAllowed(domain, run.spec.excludedDomains)) throw new Error(`报告包含排除域名：${domain}`);
      if (run.spec.mode === "trend" && (run.timeWindow === undefined || !publishedWithin(source, run.timeWindow, this.now()))) {
        throw new Error("趋势报告来源必须声明位于实际时间窗内的 ISO 发布时间");
      }
    }
    for (const note of [...report.findings, ...report.disagreements]) {
      if (note.sourceIds.length === 0) throw new Error("报告观点必须关联对应来源");
      for (const sourceId of note.sourceIds) if (!sourceIds.has(sourceId)) throw new Error(`报告引用了不存在的来源：${sourceId}`);
    }
  }

  private sameSubmission(report: InspirationReport, submission: InspirationReportSubmission): boolean {
    const normalized = {
      status: submission.status,
      partialReason: submission.status === "partial" ? submission.partialReason ?? null : null,
      summary: submission.summary,
      findings: submission.findings.map((note) => ({ ...note, evidence: note.evidence ?? "supported" })),
      disagreements: submission.disagreements.map((note) => ({ ...note, evidence: note.evidence ?? "contested" })),
      angles: submission.angles,
      nextSteps: submission.nextSteps,
      sources: submission.sources,
    };
    const stored = {
      status: report.status,
      partialReason: report.partialReason,
      summary: report.summary,
      findings: report.findings,
      disagreements: report.disagreements,
      angles: report.angles,
      nextSteps: report.nextSteps,
      sources: report.sources.map(({ retrievedAt: _retrievedAt, ...source }) => source),
    };
    return JSON.stringify(stored) === JSON.stringify(normalized);
  }

  private async item(itemId: InspirationId): Promise<InspirationItem> {
    const item = (await this.store.read()).items[itemId];
    if (item === undefined) throw new Error("找不到灵感草稿");
    return copy(item);
  }

  private async run(runId: InspirationRunId): Promise<InspirationRun> {
    const run = (await this.store.read()).runs[runId];
    if (run === undefined) throw new Error("找不到研究运行");
    return copy(run);
  }

  private async running(runId: InspirationRunId): Promise<boolean> {
    return (await this.store.read()).runs[runId]?.status === "running";
  }

  private async loadReport(run: InspirationRun): Promise<{ report: InspirationReport | null; integrity: InspirationDetail["reportIntegrity"] }> {
    if (run.reportPath === null || run.reportSha256 === null) return { report: null, integrity: "unavailable" };
    try {
      const expected = await safeReportPath(this.options.creatorRoot, run, new Date(run.finishedAt ?? run.queuedAt));
      if (resolve(run.reportPath) !== expected) return { report: null, integrity: "changed" };
      const entry = await lstat(expected);
      if (entry.isSymbolicLink() || !entry.isFile()) return { report: null, integrity: "changed" };
      if (entry.size > MAX_REPORT_BYTES) return { report: null, integrity: "changed" };
      const text = await readFile(expected, "utf8");
      if (textHash(text) !== run.reportSha256) return { report: null, integrity: "changed" };
      const report = parseReportDocument(text);
      return report === null ? { report: null, integrity: "changed" } : { report, integrity: "ok" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { report: null, integrity: "missing" };
      return { report: null, integrity: "unavailable" };
    }
  }
}
