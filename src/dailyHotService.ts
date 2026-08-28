import type {
  DailyHotAttentionDomain,
  DailyHotAttentionStrategy,
  DailyHotItem,
  DailyHotItemId,
  DailyHotRefreshError,
  DailyHotResult,
  DailyHotTiers,
  GetDailyHotRequest,
} from "./dailyHotTypes.ts";

export const AI_HOT_ORIGIN = "https://aihot.virxact.com";
export const DAILY_HOT_CACHE_TTL_MS = 15 * 60 * 1000;
export const DAILY_HOT_REQUEST_TIMEOUT_MS = 12_000;

/** Built-in attention policy shared with the Muzi Workbench reference implementation. */
export const DEFAULT_DAILY_HOT_ATTENTION_STRATEGY: Readonly<DailyHotAttentionStrategy> = Object.freeze({
  mustReadLimit: 3,
  browseLimit: 8,
  otherLimit: 12,
  minimumIndependentSources: 2,
  question: "这条变化是否可能影响未来一周的工具选择、工作方式或风险判断？",
  rules: [
    "只从多源热点、过去 24 小时精选和最新日报取候选。",
    "多源事件命中至少一个关注领域，才进入今日必看。",
    "热点只用于阅读分层，不自动生成选题或任务。",
  ],
  source: "built-in",
});

const ATTENTION_DOMAINS: ReadonlyArray<{
  id: string;
  label: string;
  patterns: readonly RegExp[];
}> = [
  {
    id: "agent-work",
    label: "Agent 与工具工作流",
    patterns: [
      /\bagents?\b/i,
      /智能体|工具调用|工作流|自动化|编程助手|MCP|Codex|Claude Code|ChatGPT Work/i,
    ],
  },
  {
    id: "guardrails",
    label: "安全、版权与政策边界",
    patterns: [/安全|越权|攻击|泄露|隐私|版权|侵权|监管|政策|法院|禁令|对齐/i],
  },
  {
    id: "content-production",
    label: "内容生产工具",
    patterns: [/视频|图像|图片|音频|语音|音乐|字幕|剪辑|多模态|Sora|Seedance/i],
  },
  {
    id: "capability-shift",
    label: "AI 能力边界",
    patterns: [/下一代|模型发布|新模型|推理|数学|科学|基准|benchmark|能力突破|开源模型/i],
  },
  {
    id: "knowledge-work",
    label: "知识工作与研究方式",
    patterns: [/知识|文档|办公|研究|搜索|阅读|学习|写作|记忆|检索|上下文/i],
  },
];

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  "ai-models": "模型",
  "ai-products": "产品",
  industry: "行业",
  paper: "论文",
  tip: "教程与观点",
};

type UnknownRecord = Record<string, unknown>;
type UndecoratedDailyHotItem = Omit<DailyHotItem, "attention" | "categoryLabel" | "evidence">;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
}

function nullableText(value: unknown): string | null {
  const text = compactText(value);
  return text === "" ? null : text;
}

function nonnegativeInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateValue(value: unknown): string | null {
  const text = compactText(value);
  if (text === "") return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function httpUrl(value: unknown): string | null {
  const text = compactText(value);
  if (text === "") return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function itemIdFromUrl(value: unknown): string | null {
  const url = httpUrl(value);
  if (url === null) return null;
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

function storyIdFromUrl(value: unknown): string | null {
  const url = httpUrl(value);
  if (url === null) return null;
  const parsed = new URL(url);
  if (parsed.origin !== AI_HOT_ORIGIN) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  return parts[0] === "story" ? parts[1] ?? null : null;
}

function normalizedLimit(value: unknown, fallback: number, maximum = 50): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum ? number : fallback;
}

function normalizeStrategy(
  strategy: Partial<DailyHotAttentionStrategy> | null | undefined,
): DailyHotAttentionStrategy {
  const domains = strategy?.domains?.filter((domain) =>
    compactText(domain.id) !== "" && compactText(domain.label) !== "" && Array.isArray(domain.keywords));
  return {
    mustReadLimit: normalizedLimit(strategy?.mustReadLimit, DEFAULT_DAILY_HOT_ATTENTION_STRATEGY.mustReadLimit),
    browseLimit: normalizedLimit(strategy?.browseLimit, DEFAULT_DAILY_HOT_ATTENTION_STRATEGY.browseLimit),
    otherLimit: normalizedLimit(strategy?.otherLimit, DEFAULT_DAILY_HOT_ATTENTION_STRATEGY.otherLimit),
    minimumIndependentSources: normalizedLimit(
      strategy?.minimumIndependentSources,
      DEFAULT_DAILY_HOT_ATTENTION_STRATEGY.minimumIndependentSources,
      20,
    ),
    question: nullableText(strategy?.question) ?? DEFAULT_DAILY_HOT_ATTENTION_STRATEGY.question,
    rules: strategy?.rules?.map(compactText).filter(Boolean)
      ?? [...DEFAULT_DAILY_HOT_ATTENTION_STRATEGY.rules],
    source: nullableText(strategy?.source) ?? "built-in",
    ...(domains !== undefined && domains.length > 0 ? { domains } : {}),
  };
}

function configuredAttentionDomains(
  strategy: DailyHotAttentionStrategy,
  haystack: string,
): DailyHotAttentionDomain[] | null {
  if (strategy.domains === undefined || strategy.domains.length === 0) return null;
  const normalizedHaystack = haystack.toLocaleLowerCase("zh-CN");
  return strategy.domains
    .filter((domain) => domain.keywords.some((keyword) => {
      const normalized = compactText(keyword).toLocaleLowerCase("zh-CN");
      return normalized !== "" && normalizedHaystack.includes(normalized);
    }))
    .map((domain) => ({ id: domain.id, label: domain.label }));
}

function attentionDomains(
  item: UndecoratedDailyHotItem,
  strategy: DailyHotAttentionStrategy,
): DailyHotAttentionDomain[] {
  const haystack = [
    item.title,
    item.summary,
    item.latest,
    item.source.name,
    ...item.sourceNames,
  ].filter((value): value is string => value !== null).join(" ");
  const configured = configuredAttentionDomains(strategy, haystack);
  if (configured !== null) return configured;
  return ATTENTION_DOMAINS
    .filter((domain) => domain.patterns.some((pattern) => pattern.test(haystack)))
    .map(({ id, label }) => ({ id, label }));
}

function decorateItem(
  item: UndecoratedDailyHotItem,
  strategy: DailyHotAttentionStrategy,
): DailyHotItem {
  const domains = attentionDomains(item, strategy);
  const domainLabel = domains[0]?.label;
  const reason = item.sourceCount >= 2 && domainLabel !== undefined
    ? `${String(item.sourceCount)} 个独立信源正在跟进，可能影响${domainLabel}。`
    : domainLabel !== undefined
      ? `与${domainLabel}相关，值得快速了解事实与当前边界。`
      : item.sourceCount >= 2
        ? `${String(item.sourceCount)} 个独立信源正在跟进，但暂未发现明确的近期行动关联。`
        : "已进入 AI HOT 精选，可按兴趣浏览，不占用今日必看名额。";
  const evidence = item.sourceCount >= 2
    ? { level: "multi-source" as const, label: `${String(item.sourceCount)} 个独立信源` }
    : item.links.original !== null
      ? { level: "original-linked" as const, label: "可回查原文" }
      : { level: "summary-only" as const, label: "仅有聚合摘要" };
  return {
    ...item,
    categoryLabel: item.category === null ? null : CATEGORY_LABELS[item.category] ?? item.category,
    attention: { domains, reason },
    evidence,
  };
}

function normalizeHotTopic(
  rawValue: unknown,
  storyResponse: unknown,
  strategy: DailyHotAttentionStrategy,
): DailyHotItem {
  const raw = asRecord(rawValue);
  const story = asRecord(asRecord(storyResponse)?.story);
  const rawLinks = asRecord(raw?.links);
  const storyLinks = asRecord(story?.links);
  const source = asRecord(raw?.source);
  const rawId = nullableText(raw?.id) ?? nullableText(story?.publicId) ?? nullableText(raw?.title) ?? "hot-topic";
  return decorateItem({
    id: rawId as DailyHotItemId,
    kind: "hot-topic",
    title: nullableText(raw?.title) ?? nullableText(story?.title) ?? "未命名热点",
    summary: nullableText(story?.digest),
    latest: nullableText(story?.latest),
    source: { name: nullableText(source?.name) ?? "AI HOT" },
    sourceNames: asArray(raw?.sourceNames).map(compactText).filter(Boolean),
    sourceCount: nonnegativeInteger(raw?.sourceCount),
    signalCount: nonnegativeInteger(raw?.signalCount),
    latestAt: dateValue(raw?.latestAt) ?? dateValue(story?.latestAt),
    publishedAt: dateValue(story?.firstReportAt),
    discoveredAt: dateValue(story?.firstReportAt),
    category: null,
    score: null,
    links: {
      aihot: httpUrl(rawLinks?.aihot) ?? httpUrl(storyLinks?.aihot),
      original: httpUrl(rawLinks?.original),
      story: httpUrl(rawLinks?.story) ?? httpUrl(storyLinks?.aihot),
    },
    reportIds: asArray(story?.reports)
      .map((report) => nullableText(asRecord(report)?.id))
      .filter((value): value is string => value !== null),
    storyStatus: nullableText(story?.status),
  }, strategy);
}

function normalizeSelectedItem(
  rawValue: unknown,
  kind: "selected" | "daily",
  strategy: DailyHotAttentionStrategy,
): DailyHotItem {
  const raw = asRecord(rawValue);
  const links = asRecord(raw?.links);
  const source = asRecord(raw?.source);
  const id = nullableText(raw?.id) ?? itemIdFromUrl(links?.aihot) ?? nullableText(raw?.title) ?? kind;
  return decorateItem({
    id: id as DailyHotItemId,
    kind,
    title: nullableText(raw?.title) ?? "未命名动态",
    summary: nullableText(raw?.summary),
    latest: null,
    source: { name: nullableText(source?.name) ?? "未知来源" },
    sourceNames: [],
    sourceCount: 1,
    signalCount: 0,
    latestAt: dateValue(raw?.discoveredAt) ?? dateValue(raw?.publishedAt),
    publishedAt: dateValue(raw?.publishedAt),
    discoveredAt: dateValue(raw?.discoveredAt),
    category: nullableText(raw?.category),
    score: finiteNumber(raw?.score),
    links: {
      aihot: httpUrl(links?.aihot),
      original: httpUrl(links?.original),
      story: null,
    },
    reportIds: [],
    storyStatus: null,
  }, strategy);
}

function normalizeDailyItems(reportValue: unknown, strategy: DailyHotAttentionStrategy): DailyHotItem[] {
  const report = asRecord(reportValue);
  return asArray(report?.sections).flatMap((sectionValue) => {
    const section = asRecord(sectionValue);
    return asArray(section?.items).map((itemValue) => {
      const item = asRecord(itemValue);
      const links = asRecord(item?.links);
      return normalizeSelectedItem({
        ...item,
        id: itemIdFromUrl(links?.aihot),
        category: null,
        discoveredAt: report?.generatedAt ?? null,
        publishedAt: null,
        score: null,
      }, "daily", strategy);
    });
  });
}

function uniqueItems(items: DailyHotItem[], excludedIds = new Set<string>()): DailyHotItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (excludedIds.has(item.id)) return false;
    const key = item.links.original ?? item.links.aihot ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Classify normalized candidates into the three read-only attention tiers. */
export function classifyDailyHot(input: {
  hotTopics?: unknown;
  selectedItems?: unknown;
  dailyReport?: unknown;
  strategy?: Partial<DailyHotAttentionStrategy> | null;
}): DailyHotTiers {
  const strategy = normalizeStrategy(input.strategy);
  const hot = asArray(input.hotTopics).map((entryValue) => {
    const entry = asRecord(entryValue);
    return normalizeHotTopic(entry?.item ?? entryValue, entry?.story ?? null, strategy);
  });
  const hotReportIds = new Set<string>([
    ...hot.map((item) => item.id),
    ...hot.flatMap((item) => item.reportIds),
  ]);
  const selected = uniqueItems(
    asArray(input.selectedItems).map((item) => normalizeSelectedItem(item, "selected", strategy)),
    hotReportIds,
  );
  const selectedIds = new Set(selected.map((item) => String(item.id)));
  const daily = uniqueItems(normalizeDailyItems(input.dailyReport, strategy), new Set([
    ...hotReportIds,
    ...selectedIds,
  ]));
  const mustRead = hot
    .filter((item) =>
      item.sourceCount >= strategy.minimumIndependentSources && item.attention.domains.length > 0)
    .slice(0, strategy.mustReadLimit);
  const usedIds = new Set(mustRead.map((item) => String(item.id)));
  const browse = [...hot, ...selected]
    .filter((item) => !usedIds.has(item.id))
    .slice(0, strategy.browseLimit);
  for (const item of browse) usedIds.add(item.id);
  const other = [...hot, ...selected, ...daily]
    .filter((item) => !usedIds.has(item.id))
    .slice(0, strategy.otherLimit);
  return { mustRead, browse, other };
}

class DailyHotRequestError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    message: string,
    code: string,
    options: { status?: number; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DailyHotRequestError";
    this.code = code;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function retryAfterSeconds(value: string | null, now: number): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

async function fetchJson(
  fetchImpl: typeof fetch,
  path: string,
  timeoutMs: number,
  now: () => number,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => { controller.abort(signal?.reason); };
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(`${AI_HOT_ORIGIN}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const retryAfter = response.status === 429
        ? retryAfterSeconds(response.headers.get("retry-after"), now())
        : undefined;
      throw new DailyHotRequestError(
        response.status === 429
          ? "AI HOT 请求过于频繁，请稍后刷新。"
          : `AI HOT ${path} 返回 HTTP ${String(response.status)}。`,
        response.status === 429 ? "AI_HOT_RATE_LIMITED" : "AI_HOT_UPSTREAM_ERROR",
        {
          status: response.status,
          ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
        },
      );
    }
    try {
      return await response.json() as unknown;
    } catch (cause) {
      throw new DailyHotRequestError(
        `AI HOT ${path} 返回了无法解析的数据。`,
        "AI_HOT_INVALID_RESPONSE",
        { cause },
      );
    }
  } catch (cause) {
    if (signal?.aborted === true) signal.throwIfAborted();
    if (cause instanceof DailyHotRequestError) throw cause;
    if (timedOut) {
      throw new DailyHotRequestError(
        `AI HOT ${path} 请求超时。`,
        "AI_HOT_TIMEOUT",
        { cause },
      );
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new DailyHotRequestError(
      `AI HOT ${path} 请求失败：${detail}`,
      "AI_HOT_NETWORK_ERROR",
      { cause },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function fetchStory(
  fetchImpl: typeof fetch,
  storyUrl: unknown,
  timeoutMs: number,
  now: () => number,
  signal?: AbortSignal,
): Promise<unknown> {
  const publicId = storyIdFromUrl(storyUrl);
  return publicId === null
    ? null
    : fetchJson(fetchImpl, `/api/v1/stories/${encodeURIComponent(publicId)}`, timeoutMs, now, signal);
}

function dailyMeta(reportValue: unknown): DailyHotResult["daily"] {
  const report = asRecord(reportValue);
  const items = asArray(report?.sections).flatMap((section) => asArray(asRecord(section)?.items));
  return {
    date: nullableText(report?.date),
    generatedAt: dateValue(report?.generatedAt),
    itemCount: items.length,
    sectionCount: asArray(report?.sections).length,
    links: { aihot: httpUrl(asRecord(report?.links)?.aihot) ?? `${AI_HOT_ORIGIN}/daily` },
  };
}

function refreshError(cause: unknown): DailyHotRefreshError {
  if (cause instanceof DailyHotRequestError) {
    return {
      code: cause.code,
      message: cause.message,
      ...(cause.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: cause.retryAfterSeconds }),
    };
  }
  return {
    code: "AI_HOT_REFRESH_FAILED",
    message: cause instanceof Error ? cause.message : "AI HOT 刷新失败。",
  };
}

/** Dependencies and timing controls for one in-memory AIHOT aggregate loader. */
export interface DailyHotLoaderOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
  strategy?: Partial<DailyHotAttentionStrategy> | null;
}

/** In-memory loader used by the plugin host service. */
export type DailyHotLoader = (
  request?: GetDailyHotRequest,
  signal?: AbortSignal,
) => Promise<DailyHotResult>;

/** Create an isolated loader with one successful-snapshot cache. */
export function createDailyHotLoader(options: DailyHotLoaderOptions = {}): DailyHotLoader {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("AI HOT loader requires fetch.");
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs !== undefined && options.cacheTtlMs > 0
    ? options.cacheTtlMs
    : DAILY_HOT_CACHE_TTL_MS;
  const requestTimeoutMs = options.requestTimeoutMs !== undefined && options.requestTimeoutMs > 0
    ? options.requestTimeoutMs
    : DAILY_HOT_REQUEST_TIMEOUT_MS;
  const strategy = normalizeStrategy(options.strategy);
  let cache: { expiresAt: number; payload: DailyHotResult } | null = null;

  return async (request = {}, signal) => {
    signal?.throwIfAborted();
    const requestedAt = now();
    if (request.refresh !== true && cache !== null && requestedAt < cache.expiresAt) {
      return cache.payload;
    }
    try {
      const [hotResponse, selectedResponse, dailyResponse] = await Promise.all([
        fetchJson(fetchImpl, "/api/v1/hot-topics", requestTimeoutMs, now, signal),
        fetchJson(fetchImpl, "/api/v1/items?mode=selected&window=24h&limit=20", requestTimeoutMs, now, signal),
        fetchJson(fetchImpl, "/api/v1/dailies/latest", requestTimeoutMs, now, signal),
      ]);
      const hotItems = asArray(asRecord(hotResponse)?.items);
      const stories = await Promise.allSettled(hotItems.map((item) =>
        fetchStory(fetchImpl, asRecord(asRecord(item)?.links)?.story, requestTimeoutMs, now, signal)));
      signal?.throwIfAborted();
      const hotTopics = hotItems.map((item, index) => ({
        item,
        story: stories[index]?.status === "fulfilled" ? stories[index].value : null,
      }));
      const selectedItems = asRecord(selectedResponse)?.items;
      const dailyReport = asRecord(dailyResponse)?.report;
      const tiers = classifyDailyHot({ hotTopics, selectedItems, dailyReport, strategy });
      const fetchedAt = new Date(requestedAt).toISOString();
      const payload: DailyHotResult = {
        schemaVersion: 1,
        status: "live",
        fetchedAt,
        expiresAt: new Date(requestedAt + cacheTtlMs).toISOString(),
        source: {
          name: "AI HOT",
          url: `${AI_HOT_ORIGIN}/agent`,
          attributionRequired: false,
        },
        policy: {
          question: strategy.question,
          mustReadLimit: strategy.mustReadLimit,
          rules: [...strategy.rules],
          source: strategy.source ?? "built-in",
        },
        daily: dailyMeta(dailyReport),
        counts: {
          upstreamHot: hotItems.length,
          upstreamSelected24h: asArray(selectedItems).length,
          mustRead: tiers.mustRead.length,
          browse: tiers.browse.length,
          other: tiers.other.length,
        },
        tiers,
      };
      cache = { expiresAt: requestedAt + cacheTtlMs, payload };
      return payload;
    } catch (cause) {
      if (signal?.aborted === true) signal.throwIfAborted();
      if (cache !== null) {
        return {
          ...cache.payload,
          status: "stale",
          staleAt: new Date(requestedAt).toISOString(),
          error: refreshError(cause),
        };
      }
      if (cause instanceof DailyHotRequestError) throw cause;
      throw new DailyHotRequestError(
        `AI HOT 暂时无法读取：${cause instanceof Error ? cause.message : String(cause)}`,
        "AI_HOT_UNAVAILABLE",
        { cause },
      );
    }
  };
}
