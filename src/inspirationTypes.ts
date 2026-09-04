import type { Branded } from "@deepseek-ai/dsh-brand";

/** Stable identity for one manually captured inspiration. */
export type InspirationId = Branded<"InspirationId">;

/** Stable identity for one recurring inspiration task. */
export type InspirationTaskId = Branded<"InspirationTaskId">;

/** Stable identity for one immutable research attempt. */
export type InspirationRunId = Branded<"InspirationRunId">;

export type InspirationResearchMode = "topic" | "trend";
export type InspirationDepth = "quick" | "standard" | "deep";
export type InspirationSourceLanguage = "zh-en" | "zh" | "en";
export type InspirationTaskState = "enabled" | "paused" | "archived";
export type InspirationRunTrigger = "manual" | "rerun" | "scheduled" | "catch-up" | "run-now";
export type InspirationRunStatus =
  | "queued"
  | "running"
  | "ready"
  | "partial"
  | "failed"
  | "needs_attention"
  | "cancelled"
  | "interrupted";

/** Validated inputs copied into every run so later task edits cannot rewrite history. */
export interface InspirationResearchSpec {
  mode: InspirationResearchMode;
  topic: string;
  objective: string;
  questions: string[];
  sourceLanguage: InspirationSourceLanguage;
  preferredDomains: string[];
  excludedDomains: string[];
  depth: InspirationDepth;
}

/** A manually captured idea and its dedicated visible Agent Session. */
export interface InspirationItem {
  id: InspirationId;
  revision: number;
  spec: InspirationResearchSpec;
  archived: boolean;
  sessionId: string | null;
  latestRunId: InspirationRunId | null;
  createdAt: string;
  updatedAt: string;
}

/** A daily research task whose authorization persists until it is paused. */
export interface InspirationTask {
  id: InspirationTaskId;
  revision: number;
  name: string;
  spec: InspirationResearchSpec;
  state: InspirationTaskState;
  dailyTime: string;
  timeZone: string;
  authorizedAt: string | null;
  nextRunAt: string | null;
  sessionId: string | null;
  latestRunId: InspirationRunId | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspirationRunError {
  code: string;
  message: string;
}

/** One queued, active, or settled research attempt. */
export interface InspirationRun {
  id: InspirationRunId;
  revision: number;
  ownerKind: "item" | "task";
  ownerId: InspirationId | InspirationTaskId;
  trigger: InspirationRunTrigger;
  status: InspirationRunStatus;
  spec: InspirationResearchSpec;
  scheduledFor: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  sessionId: string | null;
  reportPath: string | null;
  reportSha256: string | null;
  unread: boolean;
  error: InspirationRunError | null;
}

export interface InspirationSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  retrievedAt: string;
}

export interface InspirationEvidenceNote {
  text: string;
  sourceIds: string[];
  evidence: "supported" | "contested" | "uncertain";
}

/** Immutable human-readable research report written by the Host. */
export interface InspirationReport {
  schemaVersion: 1;
  runId: InspirationRunId;
  generatedAt: string;
  status: "ready" | "partial";
  partialReason: string | null;
  summary: string;
  findings: InspirationEvidenceNote[];
  disagreements: InspirationEvidenceNote[];
  angles: string[];
  nextSteps: string[];
  sources: InspirationSource[];
}

/** Report body accepted only from the Agent bound to the active run. */
export interface InspirationReportSubmission {
  runId: InspirationRunId;
  status: "ready" | "partial";
  partialReason?: string;
  summary: string;
  findings: Array<Omit<InspirationEvidenceNote, "evidence"> & { evidence?: InspirationEvidenceNote["evidence"] }>;
  disagreements: Array<Omit<InspirationEvidenceNote, "evidence"> & { evidence?: InspirationEvidenceNote["evidence"] }>;
  angles: string[];
  nextSteps: string[];
  sources: Array<Omit<InspirationSource, "retrievedAt">>;
}

export interface InspirationCounts {
  needsAttention: number;
  running: number;
  queued: number;
  unread: number;
}

export interface InspirationOverview {
  schemaVersion: 1;
  revision: number;
  generatedAt: string;
  items: InspirationItem[];
  tasks: InspirationTask[];
  recentRuns: InspirationRun[];
  counts: InspirationCounts;
}

export interface InspirationDetail {
  schemaVersion: 1;
  owner: InspirationItem | InspirationTask;
  run: InspirationRun | null;
  report: InspirationReport | null;
  reportIntegrity: "ok" | "missing" | "changed" | "unavailable";
  previousRuns: InspirationRun[];
}

export interface InspirationReference {
  ref: string;
  label: string;
  clipboardText: string;
  sha256: string;
  text: string;
}

export interface ListInspirationsRequest {
  query?: string;
  includeArchived?: boolean;
}

export interface GetInspirationRequest {
  kind: "item" | "task";
  id: InspirationId | InspirationTaskId;
  runId?: InspirationRunId;
}

export interface SaveInspirationDraftRequest {
  id?: InspirationId;
  expectedRevision?: number;
  spec: InspirationResearchSpec;
}

export interface StartInspirationResearchRequest extends SaveInspirationDraftRequest {}

export interface StartInspirationResearchResult {
  item: InspirationItem;
  run: InspirationRun;
}

export interface StopInspirationRunRequest {
  runId: InspirationRunId;
  expectedRevision: number;
}

export interface SaveInspirationTaskRequest {
  id?: InspirationTaskId;
  expectedRevision?: number;
  name: string;
  spec: InspirationResearchSpec;
  dailyTime: string;
  timeZone: string;
}

export interface SetInspirationTaskStateRequest {
  taskId: InspirationTaskId;
  expectedRevision: number;
  state: InspirationTaskState;
  confirmed?: boolean;
}

export interface RunInspirationTaskNowRequest {
  taskId: InspirationTaskId;
  expectedRevision: number;
}

export interface MarkInspirationReadRequest {
  runId: InspirationRunId;
  expectedRevision: number;
}

export interface ArchiveInspirationRequest {
  id: InspirationId;
  expectedRevision: number;
}

export interface SerializeInspirationReferenceRequest {
  runId: InspirationRunId;
  expectedSha256?: string;
}

export interface OpenInspirationReportRequest {
  runId: InspirationRunId;
}

export type ArchiveInspirationResult = InspirationItem;
