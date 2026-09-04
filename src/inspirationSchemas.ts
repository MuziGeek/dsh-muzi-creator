import { z } from "zod";

const idSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revisionSchema = z.number().int().nonnegative();
const timestampSchema = z.string().min(1).max(64);
const domainSchema = z.string().min(1).max(253).regex(/^[a-z0-9.-]+$/);

export const inspirationResearchSpecSchema = z.object({
  mode: z.enum(["topic", "trend"]),
  topic: z.string().trim().min(1).max(200),
  objective: z.string().trim().max(1000),
  questions: z.array(z.string().trim().min(1).max(300)).max(8),
  sourceLanguage: z.enum(["zh-en", "zh", "en"]),
  preferredDomains: z.array(domainSchema).max(20),
  excludedDomains: z.array(domainSchema).max(20),
  depth: z.enum(["quick", "standard", "deep"]),
}).strict();

export const inspirationItemSchema = z.object({
  id: idSchema,
  revision: revisionSchema,
  spec: inspirationResearchSpecSchema,
  archived: z.boolean(),
  sessionId: z.string().min(1).nullable(),
  latestRunId: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

export const inspirationTaskSchema = z.object({
  id: idSchema,
  revision: revisionSchema,
  name: z.string().trim().min(1).max(100),
  spec: inspirationResearchSpecSchema,
  state: z.enum(["enabled", "paused", "archived"]),
  dailyTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().min(1).max(100),
  authorizedAt: timestampSchema.nullable(),
  nextRunAt: timestampSchema.nullable(),
  sessionId: z.string().min(1).nullable(),
  latestRunId: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

export const inspirationRunStatusSchema = z.enum([
  "queued",
  "running",
  "ready",
  "partial",
  "failed",
  "needs_attention",
  "cancelled",
  "interrupted",
]);

export const inspirationRunSchema = z.object({
  id: idSchema,
  revision: revisionSchema,
  ownerKind: z.enum(["item", "task"]),
  ownerId: idSchema,
  trigger: z.enum(["manual", "rerun", "scheduled", "catch-up", "run-now"]),
  status: inspirationRunStatusSchema,
  spec: inspirationResearchSpecSchema,
  scheduledFor: timestampSchema.nullable(),
  queuedAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  sessionId: z.string().min(1).nullable(),
  reportPath: z.string().nullable(),
  reportSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  unread: z.boolean(),
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict().nullable(),
}).strict();

const inspirationSourceSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  url: z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://")),
  domain: domainSchema,
  publishedAt: timestampSchema.nullable(),
  retrievedAt: timestampSchema,
}).strict();

const inspirationEvidenceNoteSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  sourceIds: z.array(z.string().min(1).max(80)).max(30),
  evidence: z.enum(["supported", "contested", "uncertain"]),
}).strict();

export const inspirationReportSchema = z.object({
  schemaVersion: z.literal(1),
  runId: idSchema,
  generatedAt: timestampSchema,
  status: z.enum(["ready", "partial"]),
  partialReason: z.string().trim().min(1).max(2000).nullable(),
  summary: z.string().trim().min(1).max(12000),
  findings: z.array(inspirationEvidenceNoteSchema).max(12),
  disagreements: z.array(inspirationEvidenceNoteSchema).max(12),
  angles: z.array(z.string().trim().min(1).max(1000)).min(3).max(5),
  nextSteps: z.array(z.string().trim().min(1).max(1000)).max(12),
  sources: z.array(inspirationSourceSchema).max(30),
}).strict();

export const inspirationReportSubmissionSchema = inspirationReportSchema
  .omit({ schemaVersion: true, generatedAt: true })
  .extend({
    partialReason: z.string().trim().min(1).max(2000).optional(),
    findings: z.array(inspirationEvidenceNoteSchema.extend({ evidence: inspirationEvidenceNoteSchema.shape.evidence.optional() })).max(12),
    disagreements: z.array(inspirationEvidenceNoteSchema.extend({ evidence: inspirationEvidenceNoteSchema.shape.evidence.optional() })).max(12),
    sources: z.array(inspirationSourceSchema.omit({ retrievedAt: true })).max(30),
  })
  .strict();

export const inspirationOverviewSchema = z.object({
  schemaVersion: z.literal(1),
  revision: revisionSchema,
  generatedAt: timestampSchema,
  items: z.array(inspirationItemSchema),
  tasks: z.array(inspirationTaskSchema),
  recentRuns: z.array(inspirationRunSchema),
  counts: z.object({
    needsAttention: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const inspirationDetailSchema = z.object({
  schemaVersion: z.literal(1),
  owner: z.union([inspirationItemSchema, inspirationTaskSchema]),
  run: inspirationRunSchema.nullable(),
  report: inspirationReportSchema.nullable(),
  reportIntegrity: z.enum(["ok", "missing", "changed", "unavailable"]),
  previousRuns: z.array(inspirationRunSchema),
}).strict();

export const inspirationReferenceSchema = z.object({
  ref: z.string().min(1),
  label: z.string().min(1),
  clipboardText: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  text: z.string().min(1).max(65536),
}).strict();

export const listInspirationsRequestSchema = z.object({
  query: z.string().max(200).optional(),
  includeArchived: z.boolean().optional(),
}).strict();

export const getInspirationRequestSchema = z.object({
  kind: z.enum(["item", "task"]),
  id: idSchema,
  runId: idSchema.optional(),
}).strict();

export const saveInspirationDraftRequestSchema = z.object({
  id: idSchema.optional(),
  expectedRevision: revisionSchema.optional(),
  spec: inspirationResearchSpecSchema,
}).strict();

export const startInspirationResearchRequestSchema = saveInspirationDraftRequestSchema;

export const startInspirationResearchResultSchema = z.object({
  item: inspirationItemSchema,
  run: inspirationRunSchema,
}).strict();

export const stopInspirationRunRequestSchema = z.object({
  runId: idSchema,
  expectedRevision: revisionSchema,
}).strict();

export const saveInspirationTaskRequestSchema = z.object({
  id: idSchema.optional(),
  expectedRevision: revisionSchema.optional(),
  name: z.string().trim().min(1).max(100),
  spec: inspirationResearchSpecSchema,
  dailyTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().min(1).max(100),
}).strict();

export const setInspirationTaskStateRequestSchema = z.object({
  taskId: idSchema,
  expectedRevision: revisionSchema,
  state: z.enum(["enabled", "paused", "archived"]),
  confirmed: z.boolean().optional(),
}).strict();

export const runInspirationTaskNowRequestSchema = z.object({
  taskId: idSchema,
  expectedRevision: revisionSchema,
}).strict();

export const markInspirationReadRequestSchema = z.object({
  runId: idSchema,
  expectedRevision: revisionSchema,
}).strict();

export const archiveInspirationRequestSchema = z.object({
  id: idSchema,
  expectedRevision: revisionSchema,
}).strict();

export const serializeInspirationReferenceRequestSchema = z.object({
  runId: idSchema,
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const openInspirationReportRequestSchema = z.object({ runId: idSchema }).strict();

export const openedInspirationReportSchema = z.object({ opened: z.literal(true) }).strict();
