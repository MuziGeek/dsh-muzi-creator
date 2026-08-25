import { z } from "zod";

const projectIdSchema = z.string().min(1);
const taskKeySchema = z.string().min(1);
const archiveTokenSchema = z.string().min(16);

export const trellisTaskStatusSchema = z.enum(["planning", "in_progress", "completed", "unknown"]);
export const trellisProjectConnectionStatusSchema = z.enum([
  "ready",
  "degraded",
  "path-missing",
  "not-git-root",
  "trellis-missing",
  "unreadable",
  "invalid",
]);

export const trellisProjectCountsSchema = z.object({
  planning: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  verifiedArchived: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
});

export const trellisProjectSummarySchema = z.object({
  projectId: projectIdSchema,
  title: z.string(),
  rootPath: z.string().nullable(),
  status: trellisProjectConnectionStatusSchema,
  statusMessage: z.string(),
  counts: trellisProjectCountsSchema.nullable(),
  issues: z.array(z.string()),
});

export const trellisEvidenceSummarySchema = z.object({
  state: z.enum(["meaningful", "missing", "invalid"]),
  files: z.array(z.string()),
  message: z.string(),
});

export const trellisTaskSchema = z.object({
  key: taskKeySchema,
  directory: z.string(),
  id: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  status: trellisTaskStatusSchema,
  rawStatus: z.string().nullable(),
  priority: z.string().nullable(),
  creator: z.string().nullable(),
  assignee: z.string().nullable(),
  createdAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  branch: z.string().nullable(),
  baseBranch: z.string().nullable(),
  commit: z.string().nullable(),
  prUrl: z.string().nullable(),
  parent: z.string().nullable(),
  children: z.array(z.string()),
  relatedFiles: z.array(z.string()),
  notes: z.string(),
  archived: z.boolean(),
  archiveMonth: z.string().nullable(),
  evidence: trellisEvidenceSummarySchema,
  verifiedCompletion: z.boolean(),
  unknownFields: z.array(z.string()),
  issues: z.array(z.string()),
});

export const trellisProjectDetailSchema = z.object({
  project: trellisProjectSummarySchema,
  activeTasks: z.array(trellisTaskSchema),
  archivedTasks: z.array(trellisTaskSchema),
  scannedAt: z.string(),
});

export const trellisProjectListResultSchema = z.object({
  projectsRoot: z.string(),
  trellisRevision: z.number().int().nonnegative(),
  projects: z.array(trellisProjectSummarySchema),
});

export const getTrellisProjectRequestSchema = z.object({ projectId: projectIdSchema });

export const prepareTrellisTaskArchiveRequestSchema = z.object({
  projectId: projectIdSchema,
  taskKey: taskKeySchema,
});

export const trellisArchivePreviewSchema = z.object({
  token: archiveTokenSchema.nullable(),
  expiresAt: z.string().nullable(),
  projectId: projectIdSchema,
  task: trellisTaskSchema,
  targetMonth: z.string(),
  destination: z.string(),
  evidence: trellisEvidenceSummarySchema,
  git: z.object({
    dirty: z.boolean(),
    count: z.number().int().nonnegative(),
    sample: z.array(z.string()),
  }),
  activeChildren: z.array(z.string()),
  warnings: z.array(z.string()),
  blockers: z.array(z.string()),
});

export const archiveTrellisTaskRequestSchema = z.object({ token: archiveTokenSchema });

export const trellisArchiveResultSchema = z.object({
  state: z.enum(["archived", "active", "uncertain"]),
  message: z.string(),
  projectId: projectIdSchema,
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  project: trellisProjectSummarySchema,
});
