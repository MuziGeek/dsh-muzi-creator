import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";

import type {
  AtlasReference,
  MuziDocumentKey,
  MuziDocumentStatus,
  MuziProjectStage,
  MuziVideoPlatform,
  AcceptanceCapability,
} from "./muziTypes.ts";
import type { MzCreatorService } from "./service.ts";

interface ToolsContext {
  tools: { register: (tool: ToolDefinition) => void };
}

const JSON_VALUE = { type: "json" } as const;
const DOCUMENTS = ["mother", "video", "wechat", "xiaohongshu", "blog"] as const;
const DOCUMENT_STATUSES = ["not_started", "draft", "review", "ready"] as const;
const STAGES = ["idea", "research", "mother_draft", "adaptation", "review", "ready", "archived"] as const;
const VIDEO_PLATFORMS = ["xiaohongshu", "douyin", "bilibili", "wechat"] as const;
const ACCEPTANCE_CAPABILITIES = ["metrics"] as const;

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

/** Registers Muzi knowledge and creator tools with explicit preview-confirm-save semantics. */
export function registerMuziTools(ctx: ToolsContext, service: MzCreatorService): void {
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
    name: "muzi_creator_video_publish_capabilities",
    description: "Read the locally registered video-publisher accounts and their server-evidenced prepare, publish, schedule, and metrics capabilities. Missing or malformed capability data is reported unavailable and never enables an action.",
    parameters: {},
    output: { schema: JSON_VALUE, render: (_args, value) => render("Video publish capabilities", `${(value as { accounts?: unknown[] }).accounts?.length ?? 0} accounts`) },
    presentCall: () => card("Read video publishing capabilities", {}),
    execute: (_args, exec) => service.getMuziVideoPublishCapabilities({}, signalOf(exec)).then(asJson),
  }));

  ctx.tools.register(defineTool({
    name: "muzi_creator_begin_video_acceptance",
    description: "Open only the isolated Windows creator page for one platform acceptance capability, verify the user-supplied account label, and create a maximum 30-minute bound acceptance session. It never uploads, writes durable acceptance, or issues normal publication authority. Login, SMS, captcha, risk control, or uncertain identity stops the request.",
    parameters: {
      id: { type: "string", required: true },
      expectedRevision: { type: "number", required: true },
      packagePath: { type: "string", description: "Optional publish-package path inside this Creator project; auto-detected when omitted." },
      platform: { type: "string", required: true, enum: VIDEO_PLATFORMS },
      accountProfile: { type: "string", required: true, description: "Isolated local account profile, for example xiaohongshu-main." },
      capability: { type: "string", required: true, enum: ACCEPTANCE_CAPABILITIES },
      scheduledAt: { type: "string", description: "Required only for schedule acceptance; exact +08:00 time." },
      expectedAccountLabel: { type: "string", required: true, description: "Actual creator account label the user is verifying in the isolated browser." },
      confirmed: { type: "boolean", required: true },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Video acceptance session", (value as { sessionId?: string }).sessionId ?? "not started") },
    presentCall: (args) => card("Begin isolated video acceptance", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string" || typeof args.expectedRevision !== "number" || typeof args.accountProfile !== "string" || typeof args.expectedAccountLabel !== "string") {
        throw new Error("id, expectedRevision, accountProfile and expectedAccountLabel are required");
      }
      const platform = oneOf<MuziVideoPlatform>(args.platform, VIDEO_PLATFORMS, "platform");
      const capability = oneOf<AcceptanceCapability>(args.capability, ACCEPTANCE_CAPABILITIES, "capability");
      const scheduledAt = typeof args.scheduledAt === "string" ? args.scheduledAt : undefined;
      return service.beginMuziVideoAcceptance({
        id: args.id,
        expectedRevision: args.expectedRevision,
        platform,
        accountProfile: args.accountProfile.trim(),
        capability,
        expectedAccountLabel: args.expectedAccountLabel.trim(),
        confirmed: args.confirmed === true,
        ...(typeof args.packagePath === "string" ? { packagePath: args.packagePath } : {}),
        ...(scheduledAt === undefined ? {} : { scheduledAt }),
      }, signalOf(exec)).then(asJson);
    },
  }));





  ctx.tools.register(defineTool({
    name: "muzi_creator_finalize_video_acceptance",
    description: "After the user reviews the saved local evidence and guarded platform page, finalize exactly one bound acceptance session. Finalization records account capability evidence only; it never grants a final publication authorization.",
    parameters: {
      id: { type: "string", required: true },
      expectedRevision: { type: "number", required: true },
      packagePath: { type: "string", description: "Optional publish-package path inside this Creator project; auto-detected when omitted." },
      taskId: { type: "string", description: "Prepared task id; defaults only when the session has an exact prepared task." },
      platform: { type: "string", required: true, enum: VIDEO_PLATFORMS },
      capability: { type: "string", required: true, enum: ACCEPTANCE_CAPABILITIES },
      acceptanceSessionId: { type: "string", required: true },
      confirmed: { type: "boolean", required: true, description: "Confirms that the user reviewed the local crops and page state in this run." },
    },
    output: { schema: JSON_VALUE, render: (_args, value) => render("Video acceptance", (value as { capability?: string }).capability ?? "not finalized") },
    presentCall: (args) => card("Finalize guarded video acceptance", args),
    execute: (args, exec) => {
      if (typeof args.id !== "string" || typeof args.expectedRevision !== "number" || typeof args.acceptanceSessionId !== "string") {
        throw new Error("id, expectedRevision and acceptanceSessionId are required");
      }
      const platform = oneOf<MuziVideoPlatform>(args.platform, VIDEO_PLATFORMS, "platform");
      const capability = oneOf<AcceptanceCapability>(args.capability, ACCEPTANCE_CAPABILITIES, "capability");
      return service.finalizeMuziVideoAcceptance({
        id: args.id,
        expectedRevision: args.expectedRevision,
        platform,
        capability,
        acceptanceSessionId: args.acceptanceSessionId,
        confirmed: args.confirmed === true,
        ...(typeof args.packagePath === "string" ? { packagePath: args.packagePath } : {}),
        ...(typeof args.taskId === "string" ? { taskId: args.taskId } : {}),
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
      accountProfiles: { type: "json", description: "Optional platform-to-registered-account map. Required when the project has no current publish task account binding." },
      force: { type: "boolean" },
      confirmed: { type: "boolean", required: true },
      acceptanceSessionId: { type: "string", description: "Optional bound metrics acceptance session when the publisher requires it." },
      acceptanceAccountProfile: { type: "string", description: "Required with acceptanceSessionId; the registered isolated account bound to this metrics acceptance." },
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
      const accountProfiles = args.accountProfiles === undefined
        ? undefined
        : typeof args.accountProfiles === "object" && args.accountProfiles !== null && !Array.isArray(args.accountProfiles)
          ? Object.fromEntries(Object.entries(args.accountProfiles).map(([key, value]) => [
            oneOf<MuziVideoPlatform>(key, VIDEO_PLATFORMS, "accountProfiles platform"),
            typeof value === "string" && value.trim() !== "" ? value.trim() : (() => { throw new Error("accountProfiles values must be non-empty strings"); })(),
          ])) as Partial<Record<MuziVideoPlatform, string>>
          : (() => { throw new Error("accountProfiles must be an object"); })();
      return service.syncMuziVideoMetrics({
        id: args.id,
        expectedRevision: args.expectedRevision,
        confirmed: args.confirmed === true,
        ...(platforms === undefined ? {} : { platforms }),
        ...(accountProfiles === undefined ? {} : { accountProfiles }),
        ...(typeof args.force === "boolean" ? { force: args.force } : {}),
        ...(typeof args.acceptanceSessionId === "string" ? { acceptanceSessionId: args.acceptanceSessionId } : {}),
        ...(typeof args.acceptanceAccountProfile === "string" ? { acceptanceAccountProfile: args.acceptanceAccountProfile.trim() } : {}),
      }, signalOf(exec)).then(asJson);
    },
  }));
}
