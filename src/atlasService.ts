import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, open, readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";

import type { Config } from "./config.ts";
import type {
  KnowledgeCategory,
  KnowledgeDirectoryRole,
  KnowledgeDirectorySummary,
  KnowledgeGetRequest,
  KnowledgeHomeResult,
  KnowledgeListRequest,
  KnowledgeListResult,
  KnowledgePage,
  KnowledgePageSummary,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgePreviewResult,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  KnowledgeStatus,
  PendingKnowledgeFile,
  PendingKnowledgeGetRequest,
  PendingKnowledgeListRequest,
  PendingKnowledgeListResult,
  PendingKnowledgeReference,
  PendingKnowledgeState,
} from "./muziTypes.ts";

const CATEGORIES = ["entities", "topics", "sources", "comparisons", "synthesis", "queries"] as const satisfies readonly KnowledgeCategory[];
const DEFAULT_SEARCH_CATEGORIES = ["topics", "synthesis", "comparisons", "queries"] as const satisfies readonly KnowledgeCategory[];
const CATEGORY_DETAILS: Record<KnowledgeCategory, { label: string; role: KnowledgeDirectoryRole; priority: number }> = {
  topics: { label: "主题", role: "primary", priority: 0 },
  synthesis: { label: "综合分析", role: "analysis", priority: 1 },
  comparisons: { label: "比较分析", role: "analysis", priority: 2 },
  queries: { label: "问题", role: "analysis", priority: 3 },
  entities: { label: "实体", role: "supporting", priority: 4 },
  sources: { label: "来源", role: "supporting", priority: 5 },
};
const PENDING_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".html"]);

interface CacheEntry {
  hash: string;
  sourcePage: string;
}

interface PendingRecord {
  path: string;
  summary: Omit<PendingKnowledgeFile, "sha256" | "previewKind" | "text" | "truncated">;
  sha256: string;
}

interface FormalPageRecord {
  markdown: string;
  summary: KnowledgePageSummary;
}

interface AtlasSnapshot {
  status: KnowledgeStatus;
  pages: FormalPageRecord[];
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function fileHash(relativePath: string, path: string): Promise<string> {
  const digest = createHash("sha256").update(relativePath).update(Buffer.from([0]));
  for await (const chunk of createReadStream(path)) digest.update(chunk as Buffer);
  return digest.digest("hex");
}

function childOf(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && resolve(root, rel) === resolve(target);
}

async function regularFiles(root: string): Promise<string[]> {
  const rootInfo = await lstat(root).catch(() => undefined);
  if (rootInfo === undefined || !rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return [];
  const canonicalRoot = await realpath(root);
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      const actual = await realpath(path).catch(() => undefined);
      if (actual === undefined || !childOf(canonicalRoot, actual)) continue;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(root);
  return files;
}

async function pendingFiles(root: string): Promise<string[]> {
  const rootInfo = await lstat(root).catch(() => undefined);
  if (rootInfo === undefined || !rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return [];
  const canonicalRoot = await realpath(root);
  const files: string[] = [];
  const visit = async (directory: string, depth: number): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink() || (depth === 0 && entry.name === "assets")) continue;
      const path = join(directory, entry.name);
      const actual = await realpath(path).catch(() => undefined);
      if (actual === undefined || !childOf(canonicalRoot, actual)) continue;
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile() && PENDING_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(path);
    }
  };
  await visit(root, 0);
  return files.sort();
}

function cacheEntries(value: unknown): Map<string, CacheEntry> {
  if (typeof value !== "object" || value === null || (value as { version?: unknown }).version !== 1) {
    throw new Error("llm-wiki 缓存格式无效，请先修复 .wiki-cache.json");
  }
  const rawEntries = (value as { entries?: unknown }).entries;
  if (typeof rawEntries !== "object" || rawEntries === null || Array.isArray(rawEntries)) {
    throw new Error("llm-wiki 缓存缺少 entries，请先修复 .wiki-cache.json");
  }
  const entries = new Map<string, CacheEntry>();
  for (const [path, raw] of Object.entries(rawEntries)) {
    if (typeof raw !== "object" || raw === null) throw new Error(`llm-wiki 缓存条目无效：${path}`);
    const entry = raw as { hash?: unknown; source_page?: unknown };
    if (typeof entry.hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry.hash)
      || typeof entry.source_page !== "string" || entry.source_page.trim() === "") {
      throw new Error(`llm-wiki 缓存条目无效：${path}`);
    }
    entries.set(path.replaceAll("\\", "/"), { hash: entry.hash.slice("sha256:".length), sourcePage: entry.source_page });
  }
  return entries;
}

function titleOf(markdown: string, path: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  return heading === undefined || heading === "" ? basename(path, ".md") : heading;
}

function safeMarkdown(markdown: string): string {
  return markdown
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replaceAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replaceAll(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/!\[[^\]]*\]\(https?:\/\/[^)]+\)/gi, "[远程图片已隐藏]")
    .replaceAll(/\[[^\]]*\]\((?:javascript|data):[^)]+\)/gi, "[危险链接已移除]");
}

function excerptOf(markdown: string): string {
  return safeMarkdown(markdown)
    .replaceAll(/^---[\s\S]*?---\s*/gm, "")
    .replaceAll(/^#+\s+/gm, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function locatorOf(atlasRoot: string, path: string): string {
  return `atlas://${relative(atlasRoot, path).replaceAll("\\", "/")}`;
}

function categoryOf(path: string): KnowledgeCategory {
  const normalized = path.replaceAll("\\", "/");
  const category = CATEGORIES.find((candidate) => normalized.includes(`/wiki/${candidate}/`));
  if (category === undefined) throw new Error("page is outside the formal Wiki categories");
  return category;
}

function compareTitles(left: KnowledgePageSummary, right: KnowledgePageSummary): number {
  return left.title.localeCompare(right.title, "zh-CN");
}

function directoryOf(category: KnowledgeCategory, pages: readonly FormalPageRecord[]): KnowledgeDirectorySummary {
  const details = CATEGORY_DETAILS[category];
  return {
    category,
    label: details.label,
    role: details.role,
    count: pages.filter((page) => page.summary.category === category).length,
  };
}

function normalizedWikilinkTarget(raw: string): string {
  return raw.split("|", 1)[0]!.split("#", 1)[0]!.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\.md$/i, "");
}

function aliasesOf(page: FormalPageRecord): string[] {
  const relativeLocator = page.summary.locator.slice("atlas://wiki/".length).replace(/\.md$/i, "");
  const base = relativeLocator.slice(relativeLocator.lastIndexOf("/") + 1);
  return [page.summary.title, base, relativeLocator, `wiki/${relativeLocator}`].map((value) => value.toLocaleLowerCase());
}

function aliasesIndex(pages: readonly FormalPageRecord[]): Map<string, FormalPageRecord[]> {
  const aliases = new Map<string, FormalPageRecord[]>();
  for (const page of pages) {
    for (const alias of aliasesOf(page)) {
      const matches = aliases.get(alias) ?? [];
      if (!matches.some((match) => match.summary.id === page.summary.id)) matches.push(page);
      aliases.set(alias, matches);
    }
  }
  return aliases;
}

function wikilinkTargets(markdown: string): string[] {
  const withoutCode = markdown
    .replaceAll(/^[ \t]*(`{3,}|~{3,})[^\r\n]*(?:\r?\n)[\s\S]*?^[ \t]*\1[ \t]*$/gm, "")
    .replaceAll(/`[^`\r\n]*`/g, "");
  return [...withoutCode.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => normalizedWikilinkTarget(match[1] ?? "").toLocaleLowerCase())
    .filter((target) => target !== "");
}

function relatedPages(current: FormalPageRecord, pages: readonly FormalPageRecord[], limit: number): KnowledgePageSummary[] {
  const aliases = aliasesIndex(pages);
  const related: KnowledgePageSummary[] = [];
  const seen = new Set<string>();
  for (const target of wikilinkTargets(current.markdown)) {
    const candidates = aliases.get(target) ?? [];
    if (candidates.length !== 1) continue;
    const candidate = candidates[0]!;
    if (candidate.summary.id === current.summary.id || seen.has(candidate.summary.id)) continue;
    seen.add(candidate.summary.id);
    related.push(candidate.summary);
    if (related.length >= limit) break;
  }
  return related;
}

interface GraphBuildResult {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  truncated: boolean;
}

function buildGraph(pages: readonly FormalPageRecord[], nodeLimit: number, edgeLimit: number): GraphBuildResult {
  const aliases = aliasesIndex(pages);
  const rawEdges = new Map<string, { sourceId: string; targetId: string }>();
  for (const page of pages) {
    for (const target of wikilinkTargets(page.markdown)) {
      const candidates = aliases.get(target) ?? [];
      if (candidates.length !== 1 || candidates[0]!.summary.id === page.summary.id) continue;
      const ids = [page.summary.id, candidates[0]!.summary.id].sort();
      const key = `${ids[0]}:${ids[1]}`;
      rawEdges.set(key, { sourceId: ids[0]!, targetId: ids[1]! });
    }
  }

  const degree = new Map<string, number>();
  const topicNeighbors = new Map<string, Set<string>>();
  const pageById = new Map(pages.map((page) => [page.summary.id, page]));
  for (const edge of rawEdges.values()) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
    const source = pageById.get(edge.sourceId)!;
    const target = pageById.get(edge.targetId)!;
    if (source.summary.category === "topics") {
      const connected = topicNeighbors.get(target.summary.id) ?? new Set<string>();
      connected.add(source.summary.id);
      topicNeighbors.set(target.summary.id, connected);
    }
    if (target.summary.category === "topics") {
      const connected = topicNeighbors.get(source.summary.id) ?? new Set<string>();
      connected.add(target.summary.id);
      topicNeighbors.set(source.summary.id, connected);
    }
  }

  const compareGraphPages = (left: FormalPageRecord, right: FormalPageRecord): number =>
    (topicNeighbors.get(right.summary.id)?.size ?? 0) - (topicNeighbors.get(left.summary.id)?.size ?? 0)
    || (degree.get(right.summary.id) ?? 0) - (degree.get(left.summary.id) ?? 0)
    || CATEGORY_DETAILS[left.summary.category].priority - CATEGORY_DETAILS[right.summary.category].priority
    || compareTitles(left.summary, right.summary);
  const topics = pages.filter((page) => page.summary.category === "topics").sort(compareGraphPages);
  const satellites = pages.filter((page) => page.summary.category !== "topics").sort(compareGraphPages);
  const selectedPages = [...topics, ...satellites].slice(0, nodeLimit);
  const selectedIds = new Set(selectedPages.map((page) => page.summary.id));
  const edgeRows = [...rawEdges.entries()]
    .filter(([, edge]) => selectedIds.has(edge.sourceId) && selectedIds.has(edge.targetId))
    .sort((left, right) => {
      const leftTopic = pageById.get(left[1].sourceId)!.summary.category === "topics" || pageById.get(left[1].targetId)!.summary.category === "topics";
      const rightTopic = pageById.get(right[1].sourceId)!.summary.category === "topics" || pageById.get(right[1].targetId)!.summary.category === "topics";
      return Number(rightTopic) - Number(leftTopic)
        || (degree.get(right[1].sourceId) ?? 0) + (degree.get(right[1].targetId) ?? 0)
          - (degree.get(left[1].sourceId) ?? 0) - (degree.get(left[1].targetId) ?? 0)
        || left[0].localeCompare(right[0]);
    });
  const keptEdges = edgeRows.slice(0, edgeLimit);
  return {
    nodes: selectedPages.map((page) => ({
      id: page.summary.id,
      locator: page.summary.locator,
      title: page.summary.title,
      category: page.summary.category,
      degree: degree.get(page.summary.id) ?? 0,
    })),
    edges: keptEdges.map(([, edge]) => ({
      id: `ke_${hash(`${edge.sourceId}:${edge.targetId}`).slice(0, 24)}`,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
    })),
    truncated: selectedPages.length < pages.length || keptEdges.length < edgeRows.length,
  };
}

function searchRank(page: FormalPageRecord, query: string): number | null {
  const title = page.summary.title.toLocaleLowerCase();
  if (query === "") return CATEGORY_DETAILS[page.summary.category].priority;
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  if (page.markdown.toLocaleLowerCase().includes(query)) return 3;
  return null;
}

export class AtlasReadService {
  readonly atlasRoot: string;
  readonly previewMaxBytes: number;
  readonly searchResultLimit: number;
  readonly graphNodeLimit: number;
  readonly graphEdgeLimit: number;

  constructor(config: Config) {
    this.atlasRoot = resolve(config.atlasRoot);
    this.previewMaxBytes = config.previewMaxBytes;
    this.searchResultLimit = config.searchResultLimit;
    this.graphNodeLimit = config.graphNodeLimit;
    this.graphEdgeLimit = config.graphEdgeLimit;
  }

  async status(): Promise<KnowledgeStatus> {
    return (await this.snapshot()).status;
  }

  async home(): Promise<KnowledgeHomeResult> {
    const snapshot = await this.snapshot();
    const directories = CATEGORIES.map((category) => directoryOf(category, snapshot.pages));
    const topics = snapshot.pages
      .filter((page) => page.summary.category === "topics")
      .map((page) => page.summary)
      .sort(compareTitles);
    return { status: snapshot.status, directories, topics };
  }

  async list(request: KnowledgeListRequest): Promise<KnowledgeListResult> {
    const snapshot = await this.snapshot();
    const offset = request.offset ?? 0;
    const limit = Math.min(request.limit ?? this.searchResultLimit, this.searchResultLimit);
    const all = snapshot.pages
      .filter((page) => page.summary.category === request.category)
      .map((page) => page.summary)
      .sort(compareTitles);
    const items = all.slice(offset, offset + limit);
    const nextOffset = offset + items.length < all.length ? offset + items.length : null;
    return {
      status: snapshot.status,
      directory: directoryOf(request.category, snapshot.pages),
      total: all.length,
      offset,
      nextOffset,
      items,
    };
  }

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResult> {
    const snapshot = await this.snapshot();
    if (snapshot.status.status === "unavailable") return { status: snapshot.status, items: [] };
    const query = request.query?.trim().toLocaleLowerCase() ?? "";
    const allowed = request.category === undefined
      ? new Set<KnowledgeCategory>(query === "" ? DEFAULT_SEARCH_CATEGORIES : CATEGORIES)
      : new Set<KnowledgeCategory>([request.category]);
    const max = Math.min(request.limit ?? this.searchResultLimit, this.searchResultLimit);
    const ranked = snapshot.pages
      .filter((page) => allowed.has(page.summary.category))
      .map((page) => ({ page, rank: searchRank(page, query) }))
      .filter((entry): entry is { page: FormalPageRecord; rank: number } => entry.rank !== null)
      .sort((left, right) => left.rank - right.rank
        || CATEGORY_DETAILS[left.page.summary.category].priority - CATEGORY_DETAILS[right.page.summary.category].priority
        || compareTitles(left.page.summary, right.page.summary));
    return { status: snapshot.status, items: ranked.slice(0, max).map((entry) => entry.page.summary) };
  }

  async get(request: KnowledgeGetRequest): Promise<KnowledgePage> {
    if (!request.locator.startsWith("atlas://wiki/")) throw new Error("only formal Wiki locators are allowed");
    const snapshot = await this.snapshot();
    const record = snapshot.pages.find((page) => page.summary.locator === request.locator);
    if (record === undefined) throw new Error("knowledge page is unavailable or outside the formal Wiki categories");
    return {
      ...record.summary,
      markdown: safeMarkdown(record.markdown),
      related: relatedPages(record, snapshot.pages, this.searchResultLimit),
    };
  }

  async listPending(request: PendingKnowledgeListRequest): Promise<PendingKnowledgeListResult> {
    const [snapshot, records] = await Promise.all([this.snapshot(), this.pendingRecords()]);
    const query = request.query?.trim().toLocaleLowerCase() ?? "";
    const offset = request.offset ?? 0;
    const limit = Math.min(request.limit ?? this.searchResultLimit, this.searchResultLimit);
    const matches = records.filter((record) => query === ""
      || record.summary.title.toLocaleLowerCase().includes(query)
      || record.summary.relativePath.toLocaleLowerCase().includes(query));
    const items = matches.slice(offset, offset + limit).map((record) => record.summary);
    return {
      status: snapshot.status,
      total: matches.length,
      offset,
      nextOffset: offset + items.length < matches.length ? offset + items.length : null,
      items,
    };
  }

  async getPending(request: PendingKnowledgeGetRequest): Promise<PendingKnowledgeFile> {
    const record = (await this.pendingRecords()).find((candidate) => candidate.summary.id === request.id);
    if (record === undefined) throw new Error("待消化文件已处理、已移动或不存在，请刷新列表");
    const previewKind = record.summary.extension === "md"
      ? "markdown"
      : record.summary.extension === "html"
        ? "html_text"
        : record.summary.extension === "pdf"
          ? "binary"
          : "text";
    if (previewKind === "binary") {
      return { ...record.summary, sha256: record.sha256, previewKind, text: "", truncated: false };
    }
    const handle = await open(record.path, "r");
    try {
      const length = Math.min(record.summary.size, this.previewMaxBytes);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      const source = buffer.subarray(0, bytesRead).toString("utf8");
      return {
        ...record.summary,
        sha256: record.sha256,
        previewKind,
        text: previewKind === "html_text" ? safeMarkdown(source) : safeMarkdown(source),
        truncated: record.summary.size > bytesRead,
      };
    } finally {
      await handle.close();
    }
  }

  async pendingReference(request: PendingKnowledgeGetRequest): Promise<PendingKnowledgeReference> {
    const record = (await this.pendingRecords()).find((candidate) => candidate.summary.id === request.id);
    if (record === undefined) throw new Error("待消化文件已处理、已移动或不存在，请刷新列表");
    if (request.expectedSha256 !== undefined && request.expectedSha256 !== record.sha256) {
      throw new Error("待消化文件内容已变化，请刷新预览后重新发送");
    }
    const stateLabel: Record<PendingKnowledgeState, string> = {
      new: "首次消化",
      changed: "内容已变化，需要重新消化",
      source_missing: "正式来源页缺失，需要重新消化",
    };
    return {
      text: [
        "# 待消化素材",
        `文件：${record.summary.title}`,
        `Atlas 相对位置：${record.summary.relativePath}`,
        `本地文件路径：${record.path}`,
        `状态：${stateLabel[record.summary.state]}`,
        `SHA-256：${record.sha256}`,
      ].join("\n"),
    };
  }

  async revision(): Promise<string> {
    const paths = [
      join(this.atlasRoot, ".wiki-cache.json"),
      ...(await pendingFiles(join(this.atlasRoot, "raw"))),
      ...(await this.formalFiles()),
    ];
    const rows = await Promise.all(paths.map(async (path) => {
      const info = await stat(path).catch(() => undefined);
      return info === undefined ? `${path}\0missing` : `${path}\0${info.size}\0${Math.trunc(info.mtimeMs)}`;
    }));
    return hash(rows.sort().join("\n")).slice(0, 16);
  }

  async preview(): Promise<KnowledgePreviewResult> {
    const snapshot = await this.snapshot();
    const pending = await this.pendingRecords();
    const counts = new Map(CATEGORIES.map((category) => [category, directoryOf(category, snapshot.pages).count]));
    const graph = snapshot.status.status === "ready"
      ? buildGraph(snapshot.pages, this.graphNodeLimit, this.graphEdgeLimit)
      : { nodes: [], edges: [], truncated: false };
    return {
      status: snapshot.status,
      stats: {
        formal: snapshot.pages.length,
        topics: counts.get("topics") ?? 0,
        entities: counts.get("entities") ?? 0,
        sources: counts.get("sources") ?? 0,
        analyses: (counts.get("synthesis") ?? 0) + (counts.get("comparisons") ?? 0) + (counts.get("queries") ?? 0),
        pendingMarkdown: pending.filter((record) => record.summary.extension === "md").length,
        rawFiles: snapshot.status.rawFileCount,
      },
      ...graph,
    };
  }

  private async snapshot(): Promise<AtlasSnapshot> {
    try {
      const info = await lstat(this.atlasRoot);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("atlasRoot must be a real directory");
      const schemaText = await readFile(join(this.atlasRoot, ".wiki-schema.md"), "utf8");
      const version = /(?:schema(?:\s+version)?|版本)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(schemaText)?.[1] ?? null;
      const language = /(?:language|语言)\s*[:：]\s*([^\r\n]+)/i.exec(schemaText)?.[1]?.trim() ?? null;
      const [rawFiles, formalFiles] = await Promise.all([regularFiles(join(this.atlasRoot, "raw")), this.formalFiles()]);
      const pages = (await Promise.all(formalFiles.map(async (path): Promise<FormalPageRecord | undefined> => {
        const fileInfo = await stat(path);
        if (fileInfo.size > this.previewMaxBytes) return undefined;
        const markdown = await readFile(path, "utf8");
        const category = categoryOf(path);
        const locator = locatorOf(this.atlasRoot, path);
        return {
          markdown,
          summary: {
            id: `kw_${hash(locator).slice(0, 24)}`,
            locator,
            title: titleOf(markdown, path),
            category,
            sha256: hash(markdown),
            updatedAt: fileInfo.mtime.toISOString(),
            excerpt: excerptOf(markdown),
          },
        };
      }))).filter((page): page is FormalPageRecord => page !== undefined);
      const compatible = version === "1.1" || schemaText.includes("1.1");
      return {
        status: {
          status: compatible ? "ready" : "incomplete",
          schemaVersion: version ?? (compatible ? "1.1" : null),
          language,
          rawMarkdownCount: rawFiles.filter((path) => path.toLowerCase().endsWith(".md")).length,
          rawFileCount: rawFiles.length,
          formalPageCount: pages.length,
          message: compatible ? null : "仅支持 llm-wiki Schema 1.1",
        },
        pages,
      };
    } catch {
      return {
        status: {
          status: "unavailable",
          schemaVersion: null,
          language: null,
          rawMarkdownCount: 0,
          rawFileCount: 0,
          formalPageCount: 0,
          message: "知识库不可用",
        },
        pages: [],
      };
    }
  }

  private async pendingRecords(): Promise<PendingRecord[]> {
    const cachePath = join(this.atlasRoot, ".wiki-cache.json");
    const cacheText = await readFile(cachePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cacheText) as unknown;
    } catch {
      throw new Error("llm-wiki 缓存损坏，请先修复 .wiki-cache.json");
    }
    const entries = cacheEntries(parsed);
    const rawRoot = join(this.atlasRoot, "raw");
    const paths = await pendingFiles(rawRoot);
    const records = (await Promise.all(paths.map(async (path): Promise<PendingRecord | undefined> => {
      const relativePath = relative(this.atlasRoot, path).replaceAll("\\", "/");
      const info = await stat(path);
      const sha256 = await fileHash(relativePath, path);
      const entry = entries.get(relativePath);
      let state: PendingKnowledgeState | undefined;
      if (entry === undefined) state = "new";
      else if (entry.hash !== sha256) state = "changed";
      else if (!await this.sourcePageExists(entry.sourcePage)) state = "source_missing";
      if (state === undefined) return undefined;
      const extension = extname(path).slice(1).toLowerCase() as PendingKnowledgeFile["extension"];
      return {
        path,
        sha256,
        summary: {
          id: `pk_${hash(relativePath).slice(0, 24)}`,
          relativePath,
          title: basename(path, extname(path)),
          extension,
          size: info.size,
          updatedAt: info.mtime.toISOString(),
          state,
        },
      };
    }))).filter((record): record is PendingRecord => record !== undefined);
    const priority: Record<PendingKnowledgeState, number> = { changed: 0, source_missing: 1, new: 2 };
    return records.sort((left, right) => priority[left.summary.state] - priority[right.summary.state]
      || right.summary.updatedAt.localeCompare(left.summary.updatedAt)
      || left.summary.relativePath.localeCompare(right.summary.relativePath, "zh-CN"));
  }

  private async sourcePageExists(sourcePage: string): Promise<boolean> {
    if (sourcePage.includes("\\") || sourcePage.startsWith("/") || /^[A-Za-z]:/.test(sourcePage)) return false;
    const target = resolve(this.atlasRoot, sourcePage);
    if (!childOf(this.atlasRoot, target)) return false;
    const info = await lstat(target).catch(() => undefined);
    return info !== undefined && info.isFile() && !info.isSymbolicLink();
  }

  private async formalFiles(): Promise<string[]> {
    const lists = await Promise.all(CATEGORIES.map((category) => regularFiles(join(this.atlasRoot, "wiki", category))));
    return lists.flat().filter((path) => path.toLowerCase().endsWith(".md")).sort();
  }
}
