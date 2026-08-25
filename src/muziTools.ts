import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";

import type { AtlasReference, MuziDocumentKey, MuziDocumentStatus, MuziProjectStage } from "./muziTypes.ts";
import type { OilCreatorService } from "./service.ts";

interface ToolsContext {
  tools: { register: (tool: ToolDefinition) => void };
}

const JSON_VALUE = { type: "json" } as const;
const DOCUMENTS = ["mother", "video", "wechat", "xiaohongshu", "blog"] as const;
const DOCUMENT_STATUSES = ["not_started", "draft", "review", "ready"] as const;
const STAGES = ["idea", "research", "mother_draft", "adaptation", "review", "ready", "archived"] as const;

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
}
