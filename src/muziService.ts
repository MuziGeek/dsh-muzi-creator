import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { parse, stringify } from "yaml";

import type { Config } from "./config.ts";
import type {
  AtlasReference,
  MuziArchiveRequest,
  MuziDocumentKey,
  MuziDocumentLocation,
  MuziDocumentLocationRequest,
  MuziDocumentSaveRequest,
  MuziDocumentState,
  MuziProjectCreateRequest,
  MuziProjectDetail,
  MuziProjectGetRequest,
  MuziProjectListRequest,
  MuziProjectListResult,
  MuziProjectStage,
  MuziProjectStatusRequest,
  MuziPublicationSetRequest,
  MuziPublicationState,
  MuziPublishTarget,
} from "./muziTypes.ts";
import type { CoverThumbResult } from "./types.ts";

const DOCUMENTS: readonly MuziDocumentKey[] = ["mother", "video", "wechat", "xiaohongshu", "blog"];
const TARGETS: readonly MuziPublishTarget[] = ["bilibili", "douyin", "wechat", "xiaohongshu", "blog"];
const DOCUMENT_PATHS: Record<MuziDocumentKey, string> = {
  mother: "mother-content.md",
  video: "channels/video/script.md",
  wechat: "channels/wechat/draft.md",
  xiaohongshu: "channels/xiaohongshu/draft.md",
  blog: "channels/blog/draft.md",
};
const COVER_SUFFIXES = ["_3x4.png", "_4x3.png", "_16x9.png"] as const;

interface StoredDocument {
  status?: unknown;
  sha256?: unknown;
  derivedFrom?: unknown;
  sourceSha256?: unknown;
}

interface StoredPublication {
  status?: unknown;
  remoteId?: unknown;
  url?: unknown;
  scheduledAt?: unknown;
  publishedAt?: unknown;
  source?: unknown;
}

interface ProjectManifest {
  schema?: unknown;
  id?: unknown;
  title?: unknown;
  created?: unknown;
  updated?: unknown;
  revision?: unknown;
  stage?: unknown;
  primaryDocument?: unknown;
  documents?: Record<string, StoredDocument>;
  publications?: Record<string, StoredPublication>;
  channels?: Record<string, unknown>;
  atlasReferences?: unknown;
}

interface LocatedProject {
  root: string;
  archive: boolean;
  manifest: ProjectManifest;
}

interface ProjectCover {
  path: string;
  revision: string;
}

function isPng(bytes: Buffer): boolean {
  return bytes.byteLength >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asRevision(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function documentStatus(value: unknown): MuziDocumentState["status"] {
  return value === "draft" || value === "review" || value === "ready" ? value : "not_started";
}

function stage(value: unknown): MuziProjectStage {
  return value === "research" || value === "mother_draft" || value === "adaptation"
    || value === "review" || value === "ready" || value === "archived" ? value : "idea";
}

function normalizeTitle(value: string): string {
  const title = value.trim().replaceAll(/\s+/g, " ");
  if (title === "") throw new Error("title is required");
  return title;
}

function folderSlug(title: string): string {
  const readable = title
    .normalize("NFKC")
    .replaceAll(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return readable === "" ? "content" : readable;
}

function datePrefix(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function obsidianRegistryPath(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "obsidian", "obsidian.json");
  }
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "obsidian", "obsidian.json");
}

function assertRelativeChild(root: string, target: string): void {
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || resolve(root, rel) !== resolve(target)) {
    throw new Error("path escapes configured root");
  }
}

async function readText(path: string, maxBytes: number): Promise<string> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined) return "";
  if (!info.isFile()) throw new Error("expected a regular file");
  if (info.size > maxBytes) throw new Error(`file exceeds previewMaxBytes (${maxBytes})`);
  return readFile(path, "utf8");
}

async function atomicWrite(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.muzi-${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

async function acquireManifestLock(root: string): Promise<() => Promise<void>> {
  const lockPath = join(root, ".muzi-project-write.lock");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await mkdir(lockPath);
      try {
        await writeFile(join(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
      } catch (cause) {
        await rm(lockPath, { recursive: true, force: true });
        throw cause;
      }
      return () => rm(lockPath, { recursive: true, force: true });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      const info = await stat(lockPath).catch(() => undefined);
      if (info !== undefined && Date.now() - info.mtimeMs > 60_000) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  throw new Error("project manifest is busy");
}

function emptyPublications(): Record<MuziPublishTarget, StoredPublication> {
  return Object.fromEntries(TARGETS.map((target) => [target, {
    status: "unpublished",
    remoteId: null,
    url: null,
    scheduledAt: null,
    publishedAt: null,
    source: null,
  }])) as Record<MuziPublishTarget, StoredPublication>;
}

function emptyDocuments(primary: "mother" | "video"): Record<MuziDocumentKey, StoredDocument> {
  return Object.fromEntries(DOCUMENTS.map((document) => [document, {
    status: document === primary ? "draft" : "not_started",
    sha256: null,
    derivedFrom: null,
    sourceSha256: null,
  }])) as Record<MuziDocumentKey, StoredDocument>;
}

function atlasReferences(value: unknown): AtlasReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AtlasReference[] => {
    if (!isRecord(item)) return [];
    const locator = asString(item.locator);
    const title = asString(item.title);
    const hash = asString(item.sha256).toLowerCase();
    const attachedAt = asString(item.attachedAt);
    if (!/^atlas:\/\/wiki\/(entities|topics|sources|comparisons|synthesis|queries)\/.+\.md$/.test(locator)) return [];
    if (title === "" || !/^[a-f0-9]{64}$/.test(hash) || Number.isNaN(Date.parse(attachedAt))) return [];
    return [{ locator, title, sha256: hash, attachedAt }];
  });
}

export class MuziCreatorService {
  readonly creatorRoot: string;
  readonly previewMaxBytes: number;
  readonly ready: Promise<void>;

  constructor(config: Config) {
    this.creatorRoot = resolve(config.creatorRoot);
    this.previewMaxBytes = config.previewMaxBytes;
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    await mkdir(join(this.creatorRoot, "10-active"), { recursive: true });
    await mkdir(join(this.creatorRoot, "90-archive"), { recursive: true });
    await this.assertRoot();
    await this.migrateV1Projects();
  }

  private async assertRoot(): Promise<void> {
    const rootInfo = await lstat(this.creatorRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("creatorRoot must be a real directory");
    await access(this.creatorRoot, constants.R_OK | constants.W_OK);
  }

  private async roots(includeArchived: boolean): Promise<Array<{ path: string; archive: boolean }>> {
    return [
      { path: join(this.creatorRoot, "10-active"), archive: false },
      ...(includeArchived ? [{ path: join(this.creatorRoot, "90-archive"), archive: true }] : []),
    ];
  }

  private async locateAll(includeArchived: boolean): Promise<LocatedProject[]> {
    await this.ready;
    const located: LocatedProject[] = [];
    for (const group of await this.roots(includeArchived)) {
      const entries = await readdir(group.path, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const root = join(group.path, entry.name);
        assertRelativeChild(group.path, root);
        const actual = await realpath(root);
        assertRelativeChild(await realpath(group.path), actual);
        const projectFile = join(root, "project.yml");
        const text = await readText(projectFile, this.previewMaxBytes);
        if (text === "") continue;
        const parsed = parse(text) as unknown;
        if (!isRecord(parsed)) continue;
        const manifest = parsed as ProjectManifest;
        if (manifest.schema !== "muzi.creator/2") continue;
        located.push({ root, archive: group.archive, manifest });
      }
    }
    return located;
  }

  private async locate(id: string): Promise<LocatedProject> {
    const matches = (await this.locateAll(true)).filter((item) => item.manifest.id === id);
    if (matches.length !== 1) throw new Error(matches.length === 0 ? "creator project not found" : "duplicate creator project id");
    return matches[0]!;
  }

  private async projectCover(root: string): Promise<ProjectCover | undefined> {
    const entries = await readdir(root, { withFileTypes: true });
    for (const suffix of COVER_SUFFIXES) {
      const entry = entries
        .filter((candidate) => candidate.isFile() && !candidate.isSymbolicLink() && candidate.name.endsWith(suffix))
        .sort((left, right) => left.name.localeCompare(right.name))[0];
      if (entry === undefined) continue;
      const path = join(root, entry.name);
      assertRelativeChild(root, path);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > this.previewMaxBytes) continue;
      const actual = await realpath(path);
      assertRelativeChild(await realpath(root), actual);
      const bytes = await readFile(path);
      if (!isPng(bytes)) continue;
      return {
        path,
        revision: sha256(`${entry.name}\0${info.size}\0${Math.trunc(info.mtimeMs)}`).slice(0, 16),
      };
    }
    return undefined;
  }

  private async detail(located: LocatedProject): Promise<MuziProjectDetail> {
    const { manifest, root, archive } = located;
    const id = asString(manifest.id);
    if (!/^mc_[a-f0-9]{24}$/.test(id)) throw new Error("invalid creator project id");
    const title = normalizeTitle(asString(manifest.title));
    const revision = asRevision(manifest.revision);
    const primaryDocument = manifest.primaryDocument === "video" ? "video" : "mother";
    const content = {} as Record<MuziDocumentKey, string>;
    const hashes = {} as Record<MuziDocumentKey, string | null>;
    for (const document of DOCUMENTS) {
      content[document] = await readText(join(root, DOCUMENT_PATHS[document]), this.previewMaxBytes);
      hashes[document] = content[document] === "" ? null : sha256(content[document]);
    }
    const documents = {} as Record<MuziDocumentKey, MuziDocumentState>;
    for (const document of DOCUMENTS) {
      const stored = manifest.documents?.[document] ?? {};
      const derivedFrom = DOCUMENTS.includes(stored.derivedFrom as MuziDocumentKey)
        ? stored.derivedFrom as MuziDocumentKey
        : null;
      const sourceHash = typeof stored.sourceSha256 === "string" && /^[a-f0-9]{64}$/.test(stored.sourceSha256)
        ? stored.sourceSha256
        : null;
      documents[document] = {
        status: documentStatus(stored.status),
        sha256: hashes[document],
        derivedFrom,
        sourceSha256: sourceHash,
        stale: derivedFrom !== null && sourceHash !== null && hashes[derivedFrom] !== sourceHash,
      };
    }
    const publications = {} as Record<MuziPublishTarget, MuziPublicationState>;
    for (const target of TARGETS) {
      const stored = manifest.publications?.[target] ?? {};
      const statusValue = stored.status === "platform_draft" || stored.status === "published"
        ? stored.status
        : "unpublished";
      const remoteId = typeof stored.remoteId === "string" && stored.remoteId.trim() !== "" ? stored.remoteId : null;
      const url = typeof stored.url === "string" && /^https?:\/\//.test(stored.url) ? stored.url : null;
      const scheduledAt = typeof stored.scheduledAt === "string" && !Number.isNaN(Date.parse(stored.scheduledAt))
        ? stored.scheduledAt
        : null;
      const publishedAt = typeof stored.publishedAt === "string" && !Number.isNaN(Date.parse(stored.publishedAt))
        ? stored.publishedAt
        : null;
      const source = stored.source === "manual" || stored.source === "sync" || stored.source === "publisher" ? stored.source : null;
      publications[target] = { status: statusValue, remoteId, url, scheduledAt, publishedAt, source };
    }
    const references = atlasReferences(manifest.atlasReferences);
    const updatedAt = asString(manifest.updated);
    const cover = await this.projectCover(root);
    return {
      id,
      locator: `creator://${archive ? "archive" : "active"}/${basename(root)}`,
      title,
      folderName: basename(root),
      revision,
      stage: archive ? "archived" : stage(manifest.stage),
      primaryDocument,
      updatedAt: Number.isNaN(Date.parse(updatedAt)) ? new Date(0).toISOString() : updatedAt,
      coverRevision: cover?.revision ?? null,
      documents,
      publications,
      referenceCount: references.length,
      brief: await readText(join(root, "brief.md"), this.previewMaxBytes),
      evidence: await readText(join(root, "evidence.md"), this.previewMaxBytes),
      review: await readText(join(root, "review.md"), this.previewMaxBytes),
      content,
      atlasReferences: references,
    };
  }

  async listProjects(request: MuziProjectListRequest): Promise<MuziProjectListResult> {
    const query = request.query?.trim().toLocaleLowerCase() ?? "";
    const details = await Promise.all((await this.locateAll(request.includeArchived === true)).map((item) => this.detail(item)));
    return {
      items: details
        .filter((item) => query === "" || item.title.toLocaleLowerCase().includes(query))
        .filter((item) => request.atlasLocator === undefined
          || item.atlasReferences.some((reference) => reference.locator === request.atlasLocator))
        .map(({ brief: _brief, evidence: _evidence, review: _review, content: _content, atlasReferences: _refs, ...summary }) => summary)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  async getProject(request: MuziProjectGetRequest): Promise<MuziProjectDetail> {
    return this.detail(await this.locate(request.id));
  }

  async projectRootPath(id: string): Promise<string> {
    return (await this.locate(id)).root;
  }

  async getProjectCover(request: MuziProjectGetRequest): Promise<CoverThumbResult> {
    const located = await this.locate(request.id);
    const cover = await this.projectCover(located.root);
    if (cover === undefined) return { found: false, mime: "", base64: "" };
    const bytes = await readFile(cover.path);
    if (bytes.byteLength > this.previewMaxBytes || !isPng(bytes)) return { found: false, mime: "", base64: "" };
    return { found: true, mime: "image/png", base64: bytes.toString("base64") };
  }

  async revision(): Promise<string> {
    const records: string[] = [];
    for (const project of await this.locateAll(true)) {
      for (const relativePath of ["project.yml", ...Object.values(DOCUMENT_PATHS)]) {
        const path = join(project.root, relativePath);
        const info = await lstat(path).catch(() => undefined);
        if (info === undefined || !info.isFile() || info.isSymbolicLink()) continue;
        records.push(`${basename(project.root)}/${relativePath}\0${info.size}\0${Math.trunc(info.mtimeMs)}`);
      }
    }
    return sha256(records.sort().join("\n")).slice(0, 16);
  }

  async documentLocation(request: MuziDocumentLocationRequest): Promise<MuziDocumentLocation> {
    const located = await this.locate(request.id);
    const target = join(located.root, DOCUMENT_PATHS[request.document]);
    assertRelativeChild(located.root, target);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("creator document is not a regular file");
    const actualTarget = await realpath(target);
    assertRelativeChild(await realpath(located.root), actualTarget);

    const registryText = await readFile(obsidianRegistryPath(), "utf8").catch(() => undefined);
    let obsidianReady = false;
    if (registryText !== undefined) {
      try {
        const registry = JSON.parse(registryText) as unknown;
        if (isRecord(registry) && isRecord(registry.vaults)) {
          const creatorActual = await realpath(this.creatorRoot);
          for (const value of Object.values(registry.vaults)) {
            if (!isRecord(value) || typeof value.path !== "string") continue;
            const vaultActual = await realpath(resolve(value.path)).catch(() => undefined);
            if (vaultActual === creatorActual) {
              obsidianReady = true;
              break;
            }
          }
        }
      } catch {
        // A malformed Obsidian registry is treated as an unregistered vault; the file remains readable here.
      }
    }

    return {
      path: actualTarget,
      obsidianReady,
      obsidianUri: obsidianReady ? `obsidian://open?path=${encodeURIComponent(actualTarget)}` : null,
      message: obsidianReady
        ? null
        : `请先在 Obsidian 中将 ${this.creatorRoot} 打开为独立仓库，然后重试。`,
    };
  }

  async createProject(request: MuziProjectCreateRequest): Promise<MuziProjectDetail> {
    await this.ready;
    if (!request.confirmed) throw new Error("preview required: ask the user to confirm before creating a project");
    const title = normalizeTitle(request.title);
    const id = `mc_${randomBytes(12).toString("hex")}`;
    const folderName = `${datePrefix()}_${folderSlug(title)}`;
    const root = join(this.creatorRoot, "10-active", folderName);
    assertRelativeChild(join(this.creatorRoot, "10-active"), root);
    if (await stat(root).catch(() => undefined) !== undefined) throw new Error("creator project folder already exists");
    const now = new Date().toISOString();
    const manifest: ProjectManifest = {
      schema: "muzi.creator/2",
      id,
      title,
      created: now,
      updated: now,
      revision: 0,
      stage: "idea",
      primaryDocument: request.primaryDocument,
      documents: emptyDocuments(request.primaryDocument),
      publications: emptyPublications(),
      atlasReferences: request.atlasReferences ?? [],
    };
    await mkdir(root, { recursive: false });
    for (const path of ["channels/video", "channels/wechat", "channels/xiaohongshu", "channels/blog", "assets"]) {
      await mkdir(join(root, path), { recursive: true });
    }
    await Promise.all([
      atomicWrite(join(root, "project.yml"), stringify(manifest)),
      atomicWrite(join(root, "brief.md"), "# 创作简报\n\n"),
      atomicWrite(join(root, "evidence.md"), "# 证据与来源\n\n"),
      atomicWrite(join(root, "review.md"), "# 人工审阅\n\n"),
      atomicWrite(join(root, "assets/refs.yml"), "schema: muzi.creator.assets/1\nitems: []\n"),
      ...DOCUMENTS.map((document) => atomicWrite(join(root, DOCUMENT_PATHS[document]), "")),
    ]);
    return this.getProject({ id });
  }

  async saveDocument(request: MuziDocumentSaveRequest): Promise<MuziProjectDetail> {
    if (!request.confirmed) throw new Error("preview required: ask the user to confirm before saving");
    const located = await this.locate(request.id);
    if (located.archive) throw new Error("archived projects are read-only");
    const revision = asRevision(located.manifest.revision);
    if (revision !== request.expectedRevision) throw new Error(`revision conflict: expected ${request.expectedRevision}, current ${revision}`);
    const target = join(located.root, DOCUMENT_PATHS[request.document]);
    assertRelativeChild(located.root, target);
    if (Buffer.byteLength(request.text, "utf8") > this.previewMaxBytes) throw new Error("document exceeds previewMaxBytes");
    await atomicWrite(target, request.text);
    const nextDocuments = { ...(located.manifest.documents ?? {}) };
    nextDocuments[request.document] = {
      status: request.status,
      sha256: request.text === "" ? null : sha256(request.text),
      derivedFrom: request.derivedFrom ?? null,
      sourceSha256: request.sourceSha256 ?? null,
    };
    const next: ProjectManifest = {
      ...located.manifest,
      schema: "muzi.creator/2",
      updated: new Date().toISOString(),
      revision: revision + 1,
      documents: nextDocuments,
    };
    await atomicWrite(join(located.root, "project.yml"), stringify(next));
    return this.getProject({ id: request.id });
  }

  async setProjectStatus(request: MuziProjectStatusRequest): Promise<MuziProjectDetail> {
    const located = await this.locate(request.id);
    if (located.archive) throw new Error("archived projects are read-only");
    return this.patchManifest(located, request.expectedRevision, { stage: request.stage });
  }

  async setPublication(request: MuziPublicationSetRequest): Promise<MuziProjectDetail> {
    const located = await this.locate(request.id);
    if (located.archive) throw new Error("archived projects are read-only");
    const publications = { ...(located.manifest.publications ?? {}) };
    publications[request.target] = {
      status: request.status,
      remoteId: request.remoteId ?? null,
      url: request.url ?? null,
      scheduledAt: request.scheduledAt ?? null,
      publishedAt: request.publishedAt ?? null,
      source: request.source,
    };
    return this.patchManifest(located, request.expectedRevision, { publications });
  }

  async patchPublicationStates(
    id: string,
    expectedRevision: number,
    updates: Partial<Record<MuziPublishTarget, MuziPublicationState>>,
  ): Promise<MuziProjectDetail> {
    const located = await this.locate(id);
    if (located.archive) throw new Error("archived projects are read-only");
    const publications = { ...(located.manifest.publications ?? {}) };
    for (const [target, update] of Object.entries(updates) as Array<[MuziPublishTarget, MuziPublicationState]>) {
      publications[target] = {
        status: update.status,
        remoteId: update.remoteId,
        url: update.url,
        scheduledAt: update.scheduledAt,
        publishedAt: update.publishedAt,
        source: update.source,
      };
    }
    return this.patchManifest(located, expectedRevision, { publications });
  }

  async archiveProject(request: MuziArchiveRequest): Promise<MuziProjectDetail> {
    if (!request.confirmed) throw new Error("archive confirmation required");
    const located = await this.locate(request.id);
    if (located.archive) return this.detail(located);
    const revision = asRevision(located.manifest.revision);
    if (revision !== request.expectedRevision) throw new Error(`revision conflict: expected ${request.expectedRevision}, current ${revision}`);
    await this.patchManifest(located, revision, { stage: "archived" });
    const target = join(this.creatorRoot, "90-archive", basename(located.root));
    assertRelativeChild(join(this.creatorRoot, "90-archive"), target);
    if (await stat(target).catch(() => undefined) !== undefined) throw new Error("archive destination exists");
    await rename(located.root, target);
    return this.getProject({ id: request.id });
  }

  private async patchManifest(
    located: LocatedProject,
    expectedRevision: number,
    patch: Partial<ProjectManifest>,
  ): Promise<MuziProjectDetail> {
    const release = await acquireManifestLock(located.root);
    try {
      const manifestPath = join(located.root, "project.yml");
      const currentValue = parse(await readFile(manifestPath, "utf8")) as unknown;
      if (!isRecord(currentValue)) throw new Error("project manifest is invalid");
      const current = currentValue as ProjectManifest;
      if (asString(current.id) !== asString(located.manifest.id)) throw new Error("project identity changed before update");
      const revision = asRevision(current.revision);
      if (revision !== expectedRevision) throw new Error(`revision conflict: expected ${expectedRevision}, current ${revision}`);
      await atomicWrite(manifestPath, stringify({
        ...current,
        ...patch,
        schema: "muzi.creator/2",
        updated: new Date().toISOString(),
        revision: revision + 1,
      }));
    } finally {
      await release();
    }
    return this.getProject({ id: asString(located.manifest.id) });
  }

  private async migrateV1Projects(): Promise<void> {
    for (const group of await this.roots(true)) {
      const entries = await readdir(group.path, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const root = join(group.path, entry.name);
        const projectFile = join(root, "project.yml");
        const text = await readText(projectFile, this.previewMaxBytes);
        if (text === "") continue;
        const parsed = parse(text) as unknown;
        if (!isRecord(parsed) || parsed.schema !== "muzi.creator/1") continue;
        const old = parsed as ProjectManifest;
        const primary = (await readText(join(root, DOCUMENT_PATHS.video), this.previewMaxBytes)) !== "" ? "video" : "mother";
        const docs = emptyDocuments(primary);
        for (const document of DOCUMENTS) {
          const body = await readText(join(root, DOCUMENT_PATHS[document]), this.previewMaxBytes);
          const oldStatus = document === "mother" ? (body === "" ? "not_started" : "draft") : old.channels?.[document];
          docs[document] = {
            status: documentStatus(oldStatus),
            sha256: body === "" ? null : sha256(body),
            derivedFrom: null,
            sourceSha256: null,
          };
        }
        await atomicWrite(projectFile, stringify({
          ...old,
          schema: "muzi.creator/2",
          primaryDocument: primary,
          documents: docs,
          publications: emptyPublications(),
          revision: asRevision(old.revision) + 1,
          updated: new Date().toISOString(),
        }));
      }
    }
  }
}
