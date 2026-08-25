import { z } from "zod";

export const muziDocumentKeySchema = z.enum(["mother", "video", "wechat", "xiaohongshu", "blog"]);
export const muziDocumentStatusSchema = z.enum(["not_started", "draft", "review", "ready"]);
export const muziProjectStageSchema = z.enum(["idea", "research", "mother_draft", "adaptation", "review", "ready", "archived"]);
export const muziPrimaryDocumentSchema = z.enum(["mother", "video"]);
export const muziPublishTargetSchema = z.enum(["bilibili", "douyin", "wechat", "xiaohongshu", "blog"]);
export const muziPublicationStatusSchema = z.enum(["unpublished", "platform_draft", "published"]);
export const muziPublicationSourceSchema = z.enum(["manual", "sync"]);

export const atlasReferenceSchema = z.object({
  locator: z.string().regex(/^atlas:\/\/wiki\/(?:entities|topics|sources|comparisons|synthesis|queries)\/[^?#]+\.md$/),
  title: z.string().min(1).max(300),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  attachedAt: z.string().datetime(),
});

const muziDocumentStateSchema = z.object({
  status: muziDocumentStatusSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  derivedFrom: muziDocumentKeySchema.nullable(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  stale: z.boolean(),
});

const muziPublicationStateSchema = z.object({
  status: muziPublicationStatusSchema,
  url: z.string().url().nullable(),
  publishedAt: z.string().datetime().nullable(),
  source: muziPublicationSourceSchema.nullable(),
});

const muziProjectSummarySchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  locator: z.string().regex(/^creator:\/\/(?:active|archive)\/[^/\\]+$/),
  title: z.string().min(1).max(300),
  folderName: z.string().min(1).max(120).refine((value) => !/[\\/:*?"<>|]/.test(value)),
  revision: z.number().int().nonnegative(),
  stage: muziProjectStageSchema,
  primaryDocument: muziPrimaryDocumentSchema,
  updatedAt: z.string().datetime(),
  coverRevision: z.string().regex(/^[a-f0-9]{16}$/).nullable(),
  documents: z.record(muziDocumentKeySchema, muziDocumentStateSchema),
  publications: z.record(muziPublishTargetSchema, muziPublicationStateSchema),
  referenceCount: z.number().int().nonnegative(),
});

export const muziProjectDetailSchema = muziProjectSummarySchema.extend({
  brief: z.string(),
  evidence: z.string(),
  review: z.string(),
  content: z.record(muziDocumentKeySchema, z.string()),
  atlasReferences: z.array(atlasReferenceSchema),
});

export const muziProjectListRequestSchema = z.object({
  query: z.string().optional(),
  includeArchived: z.boolean().optional(),
  atlasLocator: atlasReferenceSchema.shape.locator.optional(),
});
export const muziProjectListResultSchema = z.object({ items: z.array(muziProjectSummarySchema) });
export const muziProjectGetRequestSchema = z.object({ id: z.string().regex(/^mc_[a-f0-9]{24}$/) });
export const muziProjectCreateRequestSchema = z.object({
  title: z.string().min(1).max(300),
  primaryDocument: muziPrimaryDocumentSchema,
  confirmed: z.boolean(),
  atlasReferences: z.array(atlasReferenceSchema).optional(),
});
export const muziDocumentSaveRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  document: muziDocumentKeySchema,
  text: z.string(),
  status: muziDocumentStatusSchema,
  expectedRevision: z.number().int().nonnegative(),
  confirmed: z.boolean(),
  derivedFrom: muziDocumentKeySchema.optional(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const muziProjectStatusRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  stage: muziProjectStageSchema,
  expectedRevision: z.number().int().nonnegative(),
});
export const muziPublicationSetRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  target: muziPublishTargetSchema,
  status: muziPublicationStatusSchema,
  expectedRevision: z.number().int().nonnegative(),
  source: muziPublicationSourceSchema,
  url: z.string().url().optional(),
  publishedAt: z.string().datetime().optional(),
});
export const muziArchiveRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  expectedRevision: z.number().int().nonnegative(),
  confirmed: z.boolean(),
});

export const knowledgeStatusSchema = z.object({
  status: z.enum(["ready", "incomplete", "unavailable"]),
  schemaVersion: z.string().nullable(),
  language: z.string().nullable(),
  rawMarkdownCount: z.number().int().nonnegative(),
  rawFileCount: z.number().int().nonnegative(),
  formalPageCount: z.number().int().nonnegative(),
  message: z.string().nullable(),
});
export const knowledgeCategorySchema = z.enum(["entities", "topics", "sources", "comparisons", "synthesis", "queries"]);
const knowledgePageSummarySchema = z.object({
  id: z.string().regex(/^kw_[a-f0-9]{24}$/),
  locator: z.string().regex(/^atlas:\/\/wiki\/(?:entities|topics|sources|comparisons|synthesis|queries)\/[^?#]+\.md$/),
  title: z.string(),
  category: knowledgeCategorySchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string().datetime(),
  excerpt: z.string(),
});
export const knowledgeDirectorySummarySchema = z.object({
  category: knowledgeCategorySchema,
  label: z.string(),
  role: z.enum(["primary", "analysis", "supporting"]),
  count: z.number().int().nonnegative(),
});
export const knowledgeHomeResultSchema = z.object({
  status: knowledgeStatusSchema,
  directories: z.array(knowledgeDirectorySummarySchema),
  topics: z.array(knowledgePageSummarySchema),
});
export const knowledgeGraphNodeSchema = z.object({
  id: z.string().regex(/^kw_[a-f0-9]{24}$/),
  locator: z.string().regex(/^atlas:\/\/wiki\/(?:entities|topics|sources|comparisons|synthesis|queries)\/[^?#]+\.md$/),
  title: z.string(),
  category: knowledgeCategorySchema,
  degree: z.number().int().nonnegative(),
});
export const knowledgeGraphEdgeSchema = z.object({
  id: z.string().regex(/^ke_[a-f0-9]{24}$/),
  sourceId: z.string().regex(/^kw_[a-f0-9]{24}$/),
  targetId: z.string().regex(/^kw_[a-f0-9]{24}$/),
});
export const knowledgePreviewResultSchema = z.object({
  status: knowledgeStatusSchema,
  stats: z.object({
    formal: z.number().int().nonnegative(),
    topics: z.number().int().nonnegative(),
    entities: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
    analyses: z.number().int().nonnegative(),
    pendingMarkdown: z.number().int().nonnegative(),
    rawFiles: z.number().int().nonnegative(),
  }),
  nodes: z.array(knowledgeGraphNodeSchema),
  edges: z.array(knowledgeGraphEdgeSchema),
  truncated: z.boolean(),
});
export const knowledgeListRequestSchema = z.object({
  category: knowledgeCategorySchema,
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const knowledgeListResultSchema = z.object({
  status: knowledgeStatusSchema,
  directory: knowledgeDirectorySummarySchema,
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  items: z.array(knowledgePageSummarySchema),
});
export const knowledgePageSchema = knowledgePageSummarySchema.extend({
  markdown: z.string(),
  related: z.array(knowledgePageSummarySchema),
});
export const knowledgeSearchRequestSchema = z.object({
  query: z.string().optional(),
  category: knowledgeCategorySchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const knowledgeSearchResultSchema = z.object({
  status: knowledgeStatusSchema,
  items: z.array(knowledgePageSummarySchema),
});
export const knowledgeGetRequestSchema = z.object({
  locator: z.string().regex(/^atlas:\/\/wiki\/(?:entities|topics|sources|comparisons|synthesis|queries)\/[^?#]+\.md$/),
});

export const pendingKnowledgeStateSchema = z.enum(["new", "changed", "source_missing"]);
export const pendingKnowledgePreviewKindSchema = z.enum(["markdown", "text", "html_text", "binary"]);
const pendingKnowledgeSummarySchema = z.object({
  id: z.string().regex(/^pk_[a-f0-9]{24}$/),
  relativePath: z.string().regex(/^raw\/(?!assets(?:\/|$))[^\\]+$/),
  title: z.string().min(1),
  extension: z.enum(["md", "txt", "pdf", "html"]),
  size: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  state: pendingKnowledgeStateSchema,
});
export const pendingKnowledgeListRequestSchema = z.object({
  query: z.string().optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const pendingKnowledgeListResultSchema = z.object({
  status: knowledgeStatusSchema,
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  items: z.array(pendingKnowledgeSummarySchema),
});
export const pendingKnowledgeGetRequestSchema = z.object({
  id: z.string().regex(/^pk_[a-f0-9]{24}$/),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const pendingKnowledgeFileSchema = pendingKnowledgeSummarySchema.extend({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  previewKind: pendingKnowledgePreviewKindSchema,
  text: z.string(),
  truncated: z.boolean(),
});
export const pendingKnowledgeReferenceSchema = z.object({ text: z.string().min(1) });
export const muziWorkspaceRevisionSchema = z.object({
  creator: z.string().regex(/^[a-f0-9]{16}$/),
  knowledge: z.string().regex(/^[a-f0-9]{16}$/),
  trellis: z.number().int().nonnegative(),
});
export const muziDocumentLocationRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  document: muziDocumentKeySchema,
});
export const muziDocumentLocationSchema = z.object({
  path: z.string().min(1),
  obsidianReady: z.boolean(),
  obsidianUri: z.string().nullable(),
  message: z.string().nullable(),
});
export const muziDocumentOpenResultSchema = z.object({
  opened: z.literal(true),
});
