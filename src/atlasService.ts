import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import type { Config } from "./config.ts";
import type {
  KnowledgeGetRequest,
  KnowledgePage,
  KnowledgePageSummary,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  KnowledgeStatus,
} from "./muziTypes.ts";

const CATEGORIES = ["entities", "topics", "sources", "comparisons", "synthesis", "queries"] as const;
type Category = typeof CATEGORIES[number];

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
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

function categoryOf(path: string): Category {
  const normalized = path.replaceAll("\\", "/");
  const category = CATEGORIES.find((candidate) => normalized.includes(`/wiki/${candidate}/`));
  if (category === undefined) throw new Error("page is outside the formal Wiki categories");
  return category;
}

export class AtlasReadService {
  readonly atlasRoot: string;
  readonly previewMaxBytes: number;
  readonly searchResultLimit: number;

  constructor(config: Config) {
    this.atlasRoot = resolve(config.atlasRoot);
    this.previewMaxBytes = config.previewMaxBytes;
    this.searchResultLimit = config.searchResultLimit;
  }

  async status(): Promise<KnowledgeStatus> {
    try {
      const info = await lstat(this.atlasRoot);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("atlasRoot must be a real directory");
      const schemaText = await readFile(join(this.atlasRoot, ".wiki-schema.md"), "utf8");
      const version = /(?:schema(?:\s+version)?|版本)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(schemaText)?.[1] ?? null;
      const language = /(?:language|语言)\s*[:：]\s*([^\r\n]+)/i.exec(schemaText)?.[1]?.trim() ?? null;
      const rawFiles = await regularFiles(join(this.atlasRoot, "raw"));
      const formalFiles = await this.formalFiles();
      const compatible = version === "1.1" || schemaText.includes("1.1");
      return {
        status: compatible ? "ready" : "incomplete",
        schemaVersion: version ?? (compatible ? "1.1" : null),
        language,
        rawMarkdownCount: rawFiles.filter((path) => path.toLowerCase().endsWith(".md")).length,
        rawFileCount: rawFiles.length,
        formalPageCount: formalFiles.length,
        message: compatible ? null : "仅支持 llm-wiki Schema 1.1",
      };
    } catch (cause) {
      return {
        status: "unavailable",
        schemaVersion: null,
        language: null,
        rawMarkdownCount: 0,
        rawFileCount: 0,
        formalPageCount: 0,
        message: cause instanceof Error ? cause.message : "知识库不可用",
      };
    }
  }

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResult> {
    const status = await this.status();
    if (status.status === "unavailable") return { status, items: [] };
    const query = request.query?.trim().toLocaleLowerCase() ?? "";
    const category = request.category;
    const max = Math.min(request.limit ?? this.searchResultLimit, this.searchResultLimit);
    const items: KnowledgePageSummary[] = [];
    for (const path of await this.formalFiles()) {
      const pageCategory = categoryOf(path);
      if (category !== undefined && category !== pageCategory) continue;
      const info = await stat(path);
      if (info.size > this.previewMaxBytes) continue;
      const markdown = await readFile(path, "utf8");
      const title = titleOf(markdown, path);
      if (query !== "" && !`${title}\n${markdown}`.toLocaleLowerCase().includes(query)) continue;
      const locator = locatorOf(this.atlasRoot, path);
      items.push({
        id: `kw_${hash(locator).slice(0, 24)}`,
        locator,
        title,
        category: pageCategory,
        sha256: hash(markdown),
        updatedAt: info.mtime.toISOString(),
        excerpt: excerptOf(markdown),
      });
      if (items.length >= max) break;
    }
    return { status, items };
  }

  async get(request: KnowledgeGetRequest): Promise<KnowledgePage> {
    if (!request.locator.startsWith("atlas://wiki/")) throw new Error("only formal Wiki locators are allowed");
    const relativePath = request.locator.slice("atlas://".length).replaceAll("/", sep);
    const path = resolve(this.atlasRoot, relativePath);
    if (!childOf(this.atlasRoot, path)) throw new Error("knowledge locator escapes atlasRoot");
    const category = categoryOf(path);
    const actual = await realpath(path);
    const actualRoot = await realpath(this.atlasRoot);
    if (!childOf(actualRoot, actual)) throw new Error("knowledge locator resolves outside atlasRoot");
    const info = await lstat(actual);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("knowledge page must be a regular file");
    if (info.size > this.previewMaxBytes) throw new Error("knowledge page exceeds previewMaxBytes");
    const raw = await readFile(actual, "utf8");
    const markdown = safeMarkdown(raw);
    return {
      id: `kw_${hash(request.locator).slice(0, 24)}`,
      locator: request.locator,
      title: titleOf(raw, actual),
      category,
      sha256: hash(raw),
      updatedAt: info.mtime.toISOString(),
      excerpt: excerptOf(raw),
      markdown,
    };
  }

  private async formalFiles(): Promise<string[]> {
    const lists = await Promise.all(CATEGORIES.map((category) => regularFiles(join(this.atlasRoot, "wiki", category))));
    return lists.flat().filter((path) => path.toLowerCase().endsWith(".md")).sort();
  }
}
