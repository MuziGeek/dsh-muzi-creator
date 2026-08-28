import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";

import type {
  AtlasReference,
  MuziDocumentKey,
  MuziDocumentStatus,
  MuziProjectStage,
  MuziVideoPlatform,
  PlatformPublishIntent,
  VideoPublishMode,
} from "./muziTypes.ts";
import type { OilCreatorService } from "./service.ts";

interface ToolsContext {
  tools: { register: (tool: ToolDefinition) => void };
}

const JSON_VALUE = { type: "json" } as const;
const DOCUMENTS = ["mother", "video", "wechat", "xiaohongshu", "blog"] as const;
const DOCUMENT_STATUSES = ["not_started", "draft", "review", "ready"] as const;
const STAGES = ["idea", "research", "mother_draft", "adaptation", "review", "ready", "archived"] as const;
const VIDEO_PLATFORMS = ["xiaohongshu", "douyin", "bilibili", "wechat"] as const;
const VIDEO_PUBLISH_MODES = ["prepare_only", "publish_now", "schedule"] as const;

function signalOf(exec: { signal: AbortSignal }): AbortSignal {
  return exec.signal;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function card(title: string, rawInput: unknown) {
  return { card: "generic" as const, title, kind: "other" as const, rawInput };
}

function render(title: string, detail: string) {
  return [{ type: "text" as const, text: `${title}: ${detail}` }];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${name} is invalid`);
  return value as T;
}

function atlasReferences(value: unknown): AtlasReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("atlasReferences must be an array");
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error("atlasReferences item is invalid");
    const reference = item as Record<string, unknown>;
    if (typeof reference.locator !== "string" || typeof reference.title !== "string"
      || typeof reference.sha256 !== "string" || typeof reference.attachedAt !== "string") {
      throw new Error("atlasReferences requires locator, title, sha256 and attachedAt");
    }
    if (!/^atlas:\/\/wiki\/(entities|topics|sources|comparisons|synthesis|queries)\/.+\.md$/.test(reference.locator)
      || reference.title.trim() === "" || !/^[a-f0-9]{64}$/.test(reference.sha256)
      || Number.isNaN(Date.parse(reference.attachedAt))) {
      throw new Error("atlasReferences item is invalid");
    }
    return {
      locator: reference.locator,
      title: reference.title,
      sha256: reference.sha256,
      attachedAt: reference.attachedAt,
    };
  });
}

function videoPublishIntents(value: unknown): PlatformPublishIntent[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("intents must be a non-empty array");
  const seen = new Set<MuziVideoPlatform>();
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error("publish intent is invalid");
    const row = item as Record<string, unknown>;
    const platform = oneOf<MuziVideoPlatform>(row.platform, VIDEO_PLATFORMS, "platform");
    if (seen.has(platform)) throw new Error(`duplicate publish intent: ${platform}`);
    seen.add(platform);
    const mode = oneOf<VideoPublishMode>(row.mode, VIDEO_PUBLISH_MODES, "mode");
    if (typeof row.accountProfile !== "string" || row.accountProfile.trim() === "") throw new Error("accountProfile is required");
    const intent: PlatformPublishIntent = { platform, accountProfile: row.accountProfile.trim(), mode };
    if (mode === "schedule") {
      if (typeof row.scheduledAt !== "string") throw new Error("scheduledAt is required for schedule mode");
      intent.scheduledAt = row.scheduledAt;
    } else if (row.scheduledAt !== undefined) {
      throw new Error("scheduledAt is allowed only for schedule mode");
    }
    return intent;
  });
}

/** Registers Muzi knowledge and creator tools with explicit preview-confirm-save semantics. */
export function registerMuziTools(ctx: ToolsContext, service: OilCreatorService): void {
  ctx.tools.register(defineTool({
    name: "muzi_knowledge_search",
    description: "Search only formal llm-wiki pages. raw/ material is never searched or returned.",
    parameters: {
      query: { type: "string", description: "Search words; omit to recommend topics and high-level analyses." },
      category: { type: "string", enum: ["entities", "topics", "sources", "comparisons", "synthesis", "queries"] },
      limit: { type: "number", description: "Maximum results within the configured limit." },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Knowledge", `${(value as { items?: unknown[] }).items?.length ?? 0} pages`) },
    presentCall: (args) => card("Search Muzi knowledge", args),
    execute: (args, exec) => service.searchKnowledge({
      ...(typeof args.query === "string" ? { query: args.query } : {}),
      ...(typeof args.category === "string" ? { category: args.category as never } : {}),
      ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
    }, signalOf(exec)).then(asJson),
  }));

  ctx.tools.register(defineTool({
    name: "muzi_knowledge_read",
    description: "Read one formal llm-wiki page by its atlas://wiki/... locator and return sanitized Markdown with its current SHA-256.",
    parameters: { locator: { type: "string", required: true, description: "Formal atlas://wiki/... locator." } },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Knowledge page", (value as { title?: string }).title ?? "") },
    presentCall: (args) => card("Read Muzi knowledge", args),
    execute: (args, exec) => {
      if (typeof args.locator !== "string") throw new Error("locator is required");
      return service.getKnowledgePage({ locator: args.locator }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_status",
    description: "List Muzi Creator projects, document states, stale derivatives, references, and publication states without absolute paths.",
    parameters: {
      query: { type: "string" },
      includeArchived: { type: "boolean" },
      atlasLocator: { type: "string", description: "Exact formal Atlas locator used to find the uniquely associated project." },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Creator", `${(value as { items?: unknown[] }).items?.length ?? 0} projects`) },
    presentCall: (args) => card("Read creator status", args),
    execute: (args, exec) => service.listMuziProjects({
      ...(typeof args.query === "string" ? { query: args.query } : {}),
      ...(typeof args.includeArchived === "boolean" ? { includeArchived: args.includeArchived } : {}),
      ...(typeof args.atlasLocator === "string" ? { atlasLocator: args.atlasLocator } : {}),
    }, signalOf(exec)).then(asJson),
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_read",
    description: "Read one Muzi Creator project and its mother content and channel drafts by stable mc_ id.",
    parameters: { id: { type: "string", required: true } },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Creator project", (value as { title?: string }).title ?? "") },
    presentCall: (args) => card("Read creator project", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string") throw new Error("id is required");
      return service.getMuziProject({ id: args.id }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_create",
    description: "Preview or create a Creator Studio project. Call confirmed=false to validate the exact title, primary document, and references. An explicit '总结成为母内容' or '整理为脚本' instruction authorizes confirmed=true in the same turn for a new project.",
    parameters: {
      title: { type: "string", required: true },
      primaryDocument: { type: "string", required: true, enum: ["mother", "video"] },
      confirmed: { type: "boolean", required: true },
      atlasReferences: { type: "json", description: "Formal Atlas reference array with locator, title, current sha256 and attachedAt." },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Creator project", (value as { title?: string; preview?: boolean }).preview === true ? "preview only" : ((value as { title?: string }).title ?? "created")) },
    presentCall: (args) => card("Create creator project", args),
    execute: (args, exec) => {
      if (typeof args.title !== "string") throw new Error("title is required");
      const primaryDocument = oneOf(args.primaryDocument, ["mother", "video"] as const, "primaryDocument");
      const references = atlasReferences(args.atlasReferences);
      if (args.confirmed !== true) return asJson({ preview: true, title: args.title.trim(), primaryDocument, atlasReferences: references, writes: ["project.yml", "brief.md", "evidence.md", "mother-content.md", "channels/*", "review.md"] });
      return service.createMuziProject({ title: args.title, primaryDocument, confirmed: true, atlasReferences: references }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_save",
    description: "Preview or save one creator document. Read the latest project first, then call confirmed=false with the complete text. An explicit generation instruction authorizes confirmed=true in the same turn only when the target is empty; a non-empty target requires separate overwrite confirmation and overwriteConfirmed=true.",
    parameters: {
      id: { type: "string", required: true },
      document: { type: "string", required: true, enum: DOCUMENTS },
      text: { type: "string", required: true },
      status: { type: "string", required: true, enum: DOCUMENT_STATUSES },
      expectedRevision: { type: "number", required: true },
      confirmed: { type: "boolean", required: true },
      overwriteConfirmed: { type: "boolean", description: "Required only when replacing a non-empty target after separate user confirmation." },
      derivedFrom: { type: "string", enum: DOCUMENTS },
      sourceSha256: { type: "string" },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Creator document", (value as { preview?: boolean }).preview === true ? "preview only" : "saved") },
    presentCall: (args) => card("Save creator document", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string" || typeof args.text !== "string" || typeof args.expectedRevision !== "number") throw new Error("id, text and expectedRevision are required");
      const document = oneOf<MuziDocumentKey>(args.document, DOCUMENTS, "document");
      const status = oneOf<MuziDocumentStatus>(args.status, DOCUMENT_STATUSES, "status");
      const derivedFrom = args.derivedFrom === undefined ? undefined : oneOf<MuziDocumentKey>(args.derivedFrom, DOCUMENTS, "derivedFrom");
      if (args.confirmed !== true) return asJson({ preview: true, id: args.id, document, status, expectedRevision: args.expectedRevision, bytes: Buffer.byteLength(args.text, "utf8"), derivedFrom: derivedFrom ?? null, sourceSha256: typeof args.sourceSha256 === "string" ? args.sourceSha256 : null });
      return service.getMuziProject({ id: args.id }, signalOf(exec)).then((project) => {
        if (project.content[document].trim() !== "" && args.overwriteConfirmed !== true) {
          throw new Error("target document is non-empty: show the change and obtain separate overwrite confirmation");
        }
        return service.saveMuziDocument({
          id: args.id,
          document,
          text: args.text,
          status,
          expectedRevision: args.expectedRevision,
          confirmed: true,
          ...(derivedFrom === undefined ? {} : { derivedFrom }),
          ...(typeof args.sourceSha256 === "string" ? { sourceSha256: args.sourceSha256 } : {}),
        }, signalOf(exec));
      }).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_set_status",
    description: "Set the workflow stage of a Creator Studio project using optimistic revision checking. This does not publish anything.",
    parameters: {
      id: { type: "string", required: true },
      stage: { type: "string", required: true, enum: STAGES },
      expectedRevision: { type: "number", required: true },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Creator status", (value as { stage?: string }).stage ?? "updated") },
    presentCall: (args) => card("Set creator status", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string" || typeof args.expectedRevision !== "number") throw new Error("id and expectedRevision are required");
      const nextStage = oneOf<MuziProjectStage>(args.stage, STAGES, "stage");
      return service.setMuziProjectStatus({ id: args.id, stage: nextStage, expectedRevision: args.expectedRevision }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_prepare_video_publish",
    description: "Prepare one or more Xiaohongshu, Douyin, Bilibili, or WeChat Channels pages on Windows. Uploads and fills the pages but centrally blocks every final publish control. Each platform intent independently chooses prepare_only, publish_now, or schedule. This is an external action and requires current-run approval.",
    parameters: {
      id: { type: "string", required: true },
      expectedRevision: { type: "number", required: true },
      packagePath: { type: "string", description: "Optional publish-package path inside this Creator project; auto-detected when omitted." },
      intents: { type: "json", required: true, description: "Array of {platform, accountProfile, mode, scheduledAt?}. scheduledAt must include +08:00." },
      confirmed: { type: "boolean", required: true },
      originalRightsConfirmed: { type: "boolean", description: "Current-run confirmation only; never persisted as publishing authority." },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Video publish preparation", (value as { taskId?: string }).taskId ?? "prepared") },
    presentCall: (args) => card("Prepare external video pages (final submit locked)", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string" || typeof args.expectedRevision !== "number") throw new Error("id and expectedRevision are required");
      return service.prepareMuziVideoPublish({
        id: args.id,
        expectedRevision: args.expectedRevision,
        intents: videoPublishIntents(args.intents),
        confirmed: args.confirmed === true,
        ...(typeof args.packagePath === "string" ? { packagePath: args.packagePath } : {}),
        ...(typeof args.originalRightsConfirmed === "boolean" ? { originalRightsConfirmed: args.originalRightsConfirmed } : {}),
      }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_commit_video_publish",
    description: "Consume one 10-minute, one-use authorization and perform exactly one platform final action. The displayed account, title, mode, and time must match the prepared task. Never retries COMMIT_UNKNOWN.",
    parameters: {
      id: { type: "string", required: true },
      expectedRevision: { type: "number", required: true },
      taskId: { type: "string", required: true },
      platform: { type: "string", required: true, enum: VIDEO_PLATFORMS },
      authorizationDigest: { type: "string", required: true },
      accountProfile: { type: "string", required: true, description: "Account shown to the user for this confirmation." },
      title: { type: "string", required: true, description: "Exact prepared platform title shown to the user." },
      mode: { type: "string", required: true, enum: ["publish_now", "schedule"] },
      scheduledAt: { type: "string", description: "Exact +08:00 time shown to the user for schedule mode." },
      confirmed: { type: "boolean", required: true },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Video final action", (value as { status?: string }).status ?? "completed") },
    presentCall: (args) => card("Confirm one platform final video action", args),
    execute: async (args, exec) => {
      if (typeof args.id !== "string" || typeof args.expectedRevision !== "number" || typeof args.taskId !== "string" || typeof args.authorizationDigest !== "string") {
        throw new Error("id, expectedRevision, taskId and authorizationDigest are required");
      }
      const platform = oneOf<MuziVideoPlatform>(args.platform, VIDEO_PLATFORMS, "platform");
      const mode = oneOf<VideoPublishMode>(args.mode, ["publish_now", "schedule"] as const, "mode");
      const [status] = await Promise.all([
        service.getMuziVideoPublishStatus({ id: args.id, taskId: args.taskId }, signalOf(exec)),
        service.getMuziProject({ id: args.id }, signalOf(exec)),
      ]);
      const prepared = status.task?.platforms[platform];
      const approval = prepared?.approvalSummary;
      if (prepared === undefined || approval === null || approval === undefined
        || approval.platform !== platform || approval.accountProfile !== args.accountProfile
        || approval.mode !== mode || approval.title !== args.title
        || (approval.scheduledAt ?? undefined) !== (typeof args.scheduledAt === "string" ? args.scheduledAt : undefined)) {
        throw new Error("displayed approval summary does not match the prepared task");
      }
      return service.commitMuziVideoPublish({
        id: args.id,
        expectedRevision: args.expectedRevision,
        taskId: args.taskId,
        platform,
        authorizationDigest: args.authorizationDigest,
        confirmed: args.confirmed === true,
      }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_video_publish_status",
    description: "Read the current Windows video-publish task, blockers, one-use authorization state, evidence paths, and latest metric snapshots. This never opens an external page.",
    parameters: {
      id: { type: "string", required: true },
      taskId: { type: "string" },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Video publish status", (value as { task?: { status?: string } }).task?.status ?? "no task") },
    presentCall: (args) => card("Read video publish status", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string") throw new Error("id is required");
      return service.getMuziVideoPublishStatus({ id: args.id, ...(typeof args.taskId === "string" ? { taskId: args.taskId } : {}) }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_sync_video_metrics",
    description: "Manually read views, likes, and comments for this Creator project from selected published platform pages. Uses a 90-second cache unless force=true; missing values remain null and ambiguous titles are never bound automatically.",
    parameters: {
      id: { type: "string", required: true },
      expectedRevision: { type: "number", required: true },
      platforms: { type: "json", description: "Optional array of video platforms; defaults to this project's published or scheduled platforms." },
      force: { type: "boolean" },
      confirmed: { type: "boolean", required: true },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Video metrics", `${(value as { platforms?: unknown[] }).platforms?.length ?? 0} platforms`) },
    presentCall: (args) => card("Sync external video metrics", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string" || typeof args.expectedRevision !== "number") throw new Error("id and expectedRevision are required");
      const platforms = args.platforms === undefined
        ? undefined
        : Array.isArray(args.platforms)
          ? args.platforms.map((value) => oneOf<MuziVideoPlatform>(value, VIDEO_PLATFORMS, "platform"))
          : (() => { throw new Error("platforms must be an array"); })();
      return service.syncMuziVideoMetrics({
        id: args.id,
        expectedRevision: args.expectedRevision,
        confirmed: args.confirmed === true,
        ...(platforms === undefined ? {} : { platforms }),
        ...(typeof args.force === "boolean" ? { force: args.force } : {}),
      }, signalOf(exec)).then(asJson);
    },
  }));
}
