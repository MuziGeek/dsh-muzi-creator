import type { Branded } from "@deepseek-ai/dsh-brand";

/** Stable identity derived from a discovered project's canonical root path. */
export type TrellisProjectId = Branded<"TrellisProjectId">;

/** Stable opaque key for a Trellis task location inside one discovered project. */
export type TrellisTaskKey = Branded<"TrellisTaskKey">;

/** Short-lived, single-use authority for one prepared archive operation. */
export type TrellisArchiveToken = Branded<"TrellisArchiveToken">;

export type TrellisTaskStatus = "planning" | "in_progress" | "completed" | "unknown";

/** A Trellis workflow phase and the action assigned to it. */
export interface TrellisPhaseAction {
  phase: number;
  action: string;
}

export type TrellisProjectConnectionStatus =
  | "ready"
  | "degraded"
  | "path-missing"
  | "not-git-root"
  | "trellis-missing"
  | "unreadable"
  | "invalid";

export interface TrellisProjectCounts {
  planning: number;
  inProgress: number;
  completed: number;
  unknown: number;
  archived: number;
  verifiedArchived: number;
  invalid: number;
}

export interface TrellisProjectSummary {
  projectId: TrellisProjectId;
  title: string;
  rootPath: string | null;
  status: TrellisProjectConnectionStatus;
  statusMessage: string;
  counts: TrellisProjectCounts | null;
  issues: string[];
}

export interface TrellisEvidenceSummary {
  state: "meaningful" | "missing" | "invalid";
  files: string[];
  message: string;
}

export interface TrellisTask {
  key: TrellisTaskKey;
  directory: string;
  id: string;
  name: string;
  title: string;
  description: string;
  status: TrellisTaskStatus;
  currentPhase: number | null;
  phaseActions: TrellisPhaseAction[];
  rawStatus: string | null;
  priority: string | null;
  creator: string | null;
  assignee: string | null;
  createdAt: string | null;
  completedAt: string | null;
  branch: string | null;
  baseBranch: string | null;
  commit: string | null;
  prUrl: string | null;
  parent: string | null;
  children: string[];
  relatedFiles: string[];
  notes: string;
  archived: boolean;
  archiveMonth: string | null;
  evidence: TrellisEvidenceSummary;
  verifiedCompletion: boolean;
  unknownFields: string[];
  issues: string[];
}

export interface TrellisProjectDetail {
  project: TrellisProjectSummary;
  activeTasks: TrellisTask[];
  archivedTasks: TrellisTask[];
  scannedAt: string;
}

export interface TrellisProjectListResult {
  projectsRoot: string;
  trellisRevision: number;
  projects: TrellisProjectSummary[];
}

export interface GetTrellisProjectRequest {
  projectId: TrellisProjectId;
}

export interface PrepareTrellisTaskArchiveRequest {
  projectId: TrellisProjectId;
  taskKey: TrellisTaskKey;
}

export interface TrellisGitChanges {
  dirty: boolean;
  count: number;
  sample: string[];
}

export interface TrellisArchivePreview {
  token: TrellisArchiveToken | null;
  expiresAt: string | null;
  projectId: TrellisProjectId;
  task: TrellisTask;
  targetMonth: string;
  destination: string;
  evidence: TrellisEvidenceSummary;
  git: TrellisGitChanges;
  activeChildren: string[];
  warnings: string[];
  blockers: string[];
}

export interface ArchiveTrellisTaskRequest {
  token: TrellisArchiveToken;
}

export interface TrellisArchiveResult {
  state: "archived" | "active" | "uncertain";
  message: string;
  projectId: TrellisProjectId;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  project: TrellisProjectSummary;
}
