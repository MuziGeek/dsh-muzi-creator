import { z } from "zod";

export const muziDocumentKeySchema = z.enum(["mother", "video", "wechat", "xiaohongshu", "blog"]);
export const muziDocumentStatusSchema = z.enum(["not_started", "draft", "review", "ready"]);
export const muziProjectStageSchema = z.enum(["idea", "research", "mother_draft", "adaptation", "review", "ready", "archived"]);
export const muziPrimaryDocumentSchema = z.enum(["mother", "video"]);
export const muziPublishTargetSchema = z.enum(["bilibili", "douyin", "wechat", "xiaohongshu", "blog"]);
export const muziPublicationStatusSchema = z.enum(["unpublished", "platform_draft", "published"]);
export const muziPublicationSourceSchema = z.enum(["manual", "sync", "publisher"]);
export const muziVideoPlatformSchema = z.enum(["bilibili", "douyin", "wechat", "xiaohongshu"]);
export const videoPublishModeSchema = z.enum(["prepare_only", "publish_now", "schedule"]);
export const acceptanceCapabilitySchema = z.enum(["prepare_only", "publish_now", "schedule", "metrics"]);

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
  remoteId: z.string().nullable(),
  url: z.string().url().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
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
  remoteId: z.string().min(1).optional(),
  url: z.string().url().optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  publishedAt: z.string().datetime().optional(),
});

export const platformPublishIntentSchema = z.object({
  platform: muziVideoPlatformSchema,
  accountProfile: z.string().trim().min(1).max(80),
  mode: videoPublishModeSchema,
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?\+08:00$/).optional(),
}).superRefine((value, context) => {
  if (value.mode === "schedule" && value.scheduledAt === undefined) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is required for schedule mode" });
  }
  if (value.mode !== "schedule" && value.scheduledAt !== undefined) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is allowed only for schedule mode" });
  }
});

const videoPublishBlockerSchema = z.object({
  code: z.string(),
  message: z.string(),
  evidence: z.unknown().optional(),
});
const videoPublishApprovalSummarySchema = z.object({
  platform: muziVideoPlatformSchema,
  accountProfile: z.string().min(1),
  title: z.string().min(1),
  mode: z.enum(["publish_now", "schedule"]),
  scheduledAt: z.string().nullable(),
}).superRefine((value, context) => {
  if (value.mode === "schedule" && value.scheduledAt === null) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is required for schedule approval" });
  }
  if (value.mode === "publish_now" && value.scheduledAt !== null) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt must be null for immediate approval" });
  }
});
const videoPublishPlatformResultSchema = z.object({
  platform: muziVideoPlatformSchema,
  accountProfile: z.string(),
  mode: videoPublishModeSchema,
  scheduledAt: z.string().nullable(),
  status: z.enum(["NEW", "PREPARING", "READY_DRAFT", "READY_TO_PUBLISH", "READY_TO_SCHEDULE", "PUBLISHED_CONFIRMED", "SCHEDULE_CONFIRMED", "COMMIT_UNKNOWN", "BLOCKED"]),
  ready: z.boolean(),
  commitEnabled: z.boolean(),
  commitBlocker: videoPublishBlockerSchema.nullable(),
  approvalSummary: videoPublishApprovalSummarySchema.nullable(),
  authorizationDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  authorizationExpiresAt: z.string().nullable(),
  commitAttemptedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  remoteId: z.string().nullable(),
  url: z.string().nullable(),
  acceptanceSessionId: z.string().regex(/^vas-[a-f0-9]{24}$/).nullable().optional(),
  acceptanceEvidence: z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).nullable().optional(),
});
export const videoPublishTaskResultSchema = z.object({
  ok: z.boolean(),
  taskId: z.string(),
  projectId: z.string().regex(/^mc_[a-f0-9]{24}$/),
  revision: z.number().int().nonnegative(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  platforms: z.partialRecord(muziVideoPlatformSchema, videoPublishPlatformResultSchema),
});
export const videoPublishPrepareRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  expectedRevision: z.number().int().nonnegative(),
  packagePath: z.string().optional(),
  intents: z.array(platformPublishIntentSchema).min(1).max(4),
  confirmed: z.boolean(),
  originalRightsConfirmed: z.boolean().optional(),
  acceptanceSessionId: z.string().regex(/^vas-[a-f0-9]{24}$/).optional(),
});
export const videoPublishCommitRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  expectedRevision: z.number().int().nonnegative(),
  taskId: z.string().min(8),
  platform: muziVideoPlatformSchema,
  authorizationDigest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.boolean(),
  acceptanceSessionId: z.string().regex(/^vas-[a-f0-9]{24}$/).optional(),
});
export const videoAcceptanceBeginRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  expectedRevision: z.number().int().nonnegative(),
  packagePath: z.string().optional(),
  platform: muziVideoPlatformSchema,
  accountProfile: z.string().trim().min(1).max(80),
  capability: acceptanceCapabilitySchema,
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?\+08:00$/).optional(),
  expectedAccountLabel: z.string().trim().min(1).max(120),
  confirmed: z.boolean(),
}).superRefine((value, context) => {
  if (value.capability === "schedule" && value.scheduledAt === undefined) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is required for schedule acceptance" });
  }
  if (value.capability !== "schedule" && value.scheduledAt !== undefined) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is valid only for schedule acceptance" });
  }
});
export const videoAcceptanceSessionResultSchema = z.object({
  ok: z.literal(true),
  sessionId: z.string().regex(/^vas-[a-f0-9]{24}$/),
  expiresAt: z.string().datetime(),
  platform: muziVideoPlatformSchema,
  accountProfile: z.string().min(1),
  capability: acceptanceCapabilitySchema,
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/),
  account: z.object({ label: z.string().min(1), verified: z.literal(true), evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  durableAcceptanceWritten: z.literal(false),
  ordinaryAuthorizationIssued: z.literal(false),
});
export const videoAcceptanceFinalizeRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  expectedRevision: z.number().int().nonnegative(),
  packagePath: z.string().optional(),
  taskId: z.string().min(8).optional(),
  platform: muziVideoPlatformSchema,
  capability: acceptanceCapabilitySchema,
  acceptanceSessionId: z.string().regex(/^vas-[a-f0-9]{24}$/),
  confirmed: z.boolean(),
});
export const videoAcceptanceFinalizeResultSchema = z.object({
  ok: z.literal(true),
  platform: muziVideoPlatformSchema,
  capability: z.literal("prepare_only"),
  acceptedAt: z.string().datetime(),
  evidencePath: z.string().min(1),
  sessionId: z.string().regex(/^vas-[a-f0-9]{24}$/),
  commitEnabled: z.literal(false),
  authorizationDigest: z.null(),
});
export const videoPublishStatusRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  taskId: z.string().min(8).optional(),
});
const creatorMetricSnapshotSchema = z.object({
  schema: z.literal("muzi.creator.metrics/1"),
  mcId: z.string().regex(/^mc_[a-f0-9]{24}$/),
  platform: muziVideoPlatformSchema,
  remoteId: z.string().nullable(),
  observedAt: z.string().datetime(),
  views: z.number().int().nonnegative().nullable(),
  likes: z.number().int().nonnegative().nullable(),
  comments: z.number().int().nonnegative().nullable(),
  collectorVersion: z.literal("1"),
});
const creatorMetricLatestSchema = creatorMetricSnapshotSchema.extend({
  delta: z.object({ views: z.number().int().nullable(), likes: z.number().int().nullable(), comments: z.number().int().nullable() }),
});
const videoMetricPlatformResultSchema = z.object({
  platform: muziVideoPlatformSchema,
  status: z.enum(["SYNCED", "CACHED", "LOGIN_REQUIRED", "PAGINATION_INCOMPLETE", "AMBIGUOUS", "NOT_FOUND", "ERROR"]),
  message: z.string().nullable(),
  latest: creatorMetricLatestSchema.nullable(),
});
export const videoMetricsSyncRequestSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  expectedRevision: z.number().int().nonnegative(),
  platforms: z.array(muziVideoPlatformSchema).max(4).optional(),
  force: z.boolean().optional(),
  confirmed: z.boolean(),
  acceptanceSessionId: z.string().regex(/^vas-[a-f0-9]{24}$/).optional(),
});
export const videoMetricsSyncResultSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  revision: z.number().int().nonnegative(),
  cached: z.boolean(),
  observedAt: z.string().datetime(),
  platforms: z.array(videoMetricPlatformResultSchema),
});
export const videoPublishStatusResultSchema = z.object({
  id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  task: videoPublishTaskResultSchema.nullable(),
  metrics: z.partialRecord(muziVideoPlatformSchema, creatorMetricLatestSchema),
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
