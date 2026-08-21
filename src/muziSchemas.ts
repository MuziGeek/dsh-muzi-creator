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
const knowledgePageSummarySchema = z.object({
  id: z.string().regex(/^kw_[a-f0-9]{24}$/),
  locator: z.string().regex(/^atlas:\/\/wiki\/(?:entities|topics|sources|comparisons|synthesis|queries)\/[^?#]+\.md$/),
  title: z.string(),
  category: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string().datetime(),
  excerpt: z.string(),
});
export const knowledgePageSchema = knowledgePageSummarySchema.extend({ markdown: z.string() });
export const knowledgeSearchRequestSchema = z.object({
  query: z.string().optional(),
  category: z.enum(["entities", "topics", "sources", "comparisons", "synthesis", "queries"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const knowledgeSearchResultSchema = z.object({
  status: knowledgeStatusSchema,
  items: z.array(knowledgePageSummarySchema),
});
export const knowledgeGetRequestSchema = z.object({
  locator: z.string().regex(/^atlas:\/\/wiki\/(?:entities|topics|sources|comparisons|synthesis|queries)\/[^?#]+\.md$/),
});
