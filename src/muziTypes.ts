/** Documents managed by one Muzi Creator project. */
export type MuziDocumentKey = "mother" | "video" | "wechat" | "xiaohongshu" | "blog";

export type MuziDocumentStatus = "not_started" | "draft" | "review" | "ready";
export type MuziProjectStage = "idea" | "research" | "mother_draft" | "adaptation" | "review" | "ready" | "archived";
export type MuziPrimaryDocument = "mother" | "video";
export type MuziPublishTarget = "bilibili" | "douyin" | "wechat" | "xiaohongshu" | "blog";
export type MuziPublicationStatus = "unpublished" | "platform_draft" | "published";
export type MuziPublicationSource = "manual" | "sync" | "publisher";
export type MuziVideoPlatform = "bilibili" | "douyin" | "wechat" | "xiaohongshu";
export type VideoPublishMode = "prepare_only" | "publish_now" | "schedule";
export type VideoPublishState =
  | "NEW"
  | "PREPARING"
  | "READY_DRAFT"
  | "READY_TO_PUBLISH"
  | "READY_TO_SCHEDULE"
  | "PUBLISHED_CONFIRMED"
  | "SCHEDULE_CONFIRMED"
  | "COMMIT_UNKNOWN"
  | "BLOCKED";

export interface AtlasReference {
  locator: string;
  title: string;
  sha256: string;
  attachedAt: string;
}

export interface MuziDocumentState {
  status: MuziDocumentStatus;
  sha256: string | null;
  derivedFrom: MuziDocumentKey | null;
  sourceSha256: string | null;
  stale: boolean;
}

export interface MuziPublicationState {
  status: MuziPublicationStatus;
  remoteId: string | null;
  url: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  source: MuziPublicationSource | null;
}

export interface MuziProjectSummary {
  id: string;
  locator: string;
  title: string;
  folderName: string;
  revision: number;
  stage: MuziProjectStage;
  primaryDocument: MuziPrimaryDocument;
  updatedAt: string;
  coverRevision: string | null;
  documents: Record<MuziDocumentKey, MuziDocumentState>;
  publications: Record<MuziPublishTarget, MuziPublicationState>;
  referenceCount: number;
}

export interface MuziProjectDetail extends MuziProjectSummary {
  brief: string;
  evidence: string;
  review: string;
  content: Record<MuziDocumentKey, string>;
  atlasReferences: AtlasReference[];
}

export interface MuziProjectListRequest {
  query?: string;
  includeArchived?: boolean;
  atlasLocator?: string;
}

export interface MuziProjectListResult {
  items: MuziProjectSummary[];
}

export interface MuziProjectCreateRequest {
  title: string;
  primaryDocument: MuziPrimaryDocument;
  confirmed: boolean;
  atlasReferences?: AtlasReference[];
}

export interface MuziProjectGetRequest {
  id: string;
}

export interface MuziDocumentSaveRequest {
  id: string;
  document: MuziDocumentKey;
  text: string;
  status: MuziDocumentStatus;
  expectedRevision: number;
  confirmed: boolean;
  derivedFrom?: MuziDocumentKey;
  sourceSha256?: string;
}

export interface MuziProjectStatusRequest {
  id: string;
  stage: MuziProjectStage;
  expectedRevision: number;
}

export interface MuziPublicationSetRequest {
  id: string;
  target: MuziPublishTarget;
  status: MuziPublicationStatus;
  expectedRevision: number;
  source: MuziPublicationSource;
  remoteId?: string;
  url?: string;
  scheduledAt?: string;
  publishedAt?: string;
}

export interface PlatformPublishIntent {
  platform: MuziVideoPlatform;
  accountProfile: string;
  mode: VideoPublishMode;
  scheduledAt?: string;
}

export interface VideoPublishPlatformResult {
  platform: MuziVideoPlatform;
  accountProfile: string;
  mode: VideoPublishMode;
  scheduledAt: string | null;
  status: VideoPublishState;
  ready: boolean;
  commitEnabled: boolean;
  commitBlocker: { code: string; message: string; evidence?: unknown } | null;
  approvalSummary: {
    platform: MuziVideoPlatform;
    accountProfile: string;
    title: string;
    mode: "publish_now" | "schedule";
    scheduledAt: string | null;
  } | null;
  authorizationDigest: string | null;
  authorizationExpiresAt: string | null;
  commitAttemptedAt: string | null;
  confirmedAt: string | null;
  remoteId: string | null;
  url: string | null;
}

export interface VideoPublishTaskResult {
  ok: boolean;
  taskId: string;
  projectId: string;
  revision: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  platforms: Partial<Record<MuziVideoPlatform, VideoPublishPlatformResult>>;
}

export interface VideoPublishPrepareRequest {
  id: string;
  expectedRevision: number;
  packagePath?: string;
  intents: PlatformPublishIntent[];
  confirmed: boolean;
  originalRightsConfirmed?: boolean;
}

export interface VideoPublishCommitRequest {
  id: string;
  expectedRevision: number;
  taskId: string;
  platform: MuziVideoPlatform;
  authorizationDigest: string;
  confirmed: boolean;
}

export interface VideoPublishStatusRequest {
  id: string;
  taskId?: string;
}

export interface CreatorMetricSnapshot {
  schema: "muzi.creator.metrics/1";
  mcId: string;
  platform: MuziVideoPlatform;
  remoteId: string | null;
  observedAt: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  collectorVersion: "1";
}

export interface CreatorMetricLatest extends CreatorMetricSnapshot {
  delta: { views: number | null; likes: number | null; comments: number | null };
}

export type VideoMetricSyncState = "SYNCED" | "CACHED" | "LOGIN_REQUIRED" | "PAGINATION_INCOMPLETE" | "AMBIGUOUS" | "NOT_FOUND" | "ERROR";

export interface VideoMetricPlatformResult {
  platform: MuziVideoPlatform;
  status: VideoMetricSyncState;
  message: string | null;
  latest: CreatorMetricLatest | null;
}

export interface VideoMetricsSyncRequest {
  id: string;
  expectedRevision: number;
  platforms?: MuziVideoPlatform[];
  force?: boolean;
  confirmed: boolean;
}

export interface VideoMetricsSyncResult {
  id: string;
  revision: number;
  cached: boolean;
  observedAt: string;
  platforms: VideoMetricPlatformResult[];
}

export interface VideoPublishStatusResult {
  id: string;
  task: VideoPublishTaskResult | null;
  metrics: Partial<Record<MuziVideoPlatform, CreatorMetricLatest>>;
}

export interface MuziArchiveRequest {
  id: string;
  expectedRevision: number;
  confirmed: boolean;
}

export interface KnowledgeStatus {
  status: "ready" | "incomplete" | "unavailable";
  schemaVersion: string | null;
  language: string | null;
  rawMarkdownCount: number;
  rawFileCount: number;
  formalPageCount: number;
  message: string | null;
}

export type PendingKnowledgeState = "new" | "changed" | "source_missing";
export type PendingKnowledgePreviewKind = "markdown" | "text" | "html_text" | "binary";

export interface PendingKnowledgeSummary {
  id: string;
  relativePath: string;
  title: string;
  extension: "md" | "txt" | "pdf" | "html";
  size: number;
  updatedAt: string;
  state: PendingKnowledgeState;
}

export interface PendingKnowledgeFile extends PendingKnowledgeSummary {
  sha256: string;
  previewKind: PendingKnowledgePreviewKind;
  text: string;
  truncated: boolean;
}

export interface PendingKnowledgeListRequest {
  query?: string;
  offset?: number;
  limit?: number;
}

export interface PendingKnowledgeListResult {
  status: KnowledgeStatus;
  total: number;
  offset: number;
  nextOffset: number | null;
  items: PendingKnowledgeSummary[];
}

export interface PendingKnowledgeGetRequest {
  id: string;
  expectedSha256?: string;
}

export interface PendingKnowledgeReference {
  text: string;
}

export interface MuziWorkspaceRevision {
  creator: string;
  knowledge: string;
  trellis: number;
}

export interface MuziDocumentLocationRequest {
  id: string;
  document: MuziDocumentKey;
}

export interface MuziDocumentLocation {
  path: string;
  obsidianReady: boolean;
  obsidianUri: string | null;
  message: string | null;
}

export type KnowledgeCategory = "entities" | "topics" | "sources" | "comparisons" | "synthesis" | "queries";
export type KnowledgeDirectoryRole = "primary" | "analysis" | "supporting";

export interface KnowledgePageSummary {
  id: string;
  locator: string;
  title: string;
  category: KnowledgeCategory;
  sha256: string;
  updatedAt: string;
  excerpt: string;
}

export interface KnowledgePage extends KnowledgePageSummary {
  markdown: string;
  related: KnowledgePageSummary[];
}

export interface KnowledgeDirectorySummary {
  category: KnowledgeCategory;
  label: string;
  role: KnowledgeDirectoryRole;
  count: number;
}

export interface KnowledgeHomeResult {
  status: KnowledgeStatus;
  directories: KnowledgeDirectorySummary[];
  topics: KnowledgePageSummary[];
}

export interface KnowledgeGraphNode {
  id: string;
  locator: string;
  title: string;
  category: KnowledgeCategory;
  degree: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface KnowledgePreviewStats {
  formal: number;
  topics: number;
  entities: number;
  sources: number;
  analyses: number;
  pendingMarkdown: number;
  rawFiles: number;
}

export interface KnowledgePreviewResult {
  status: KnowledgeStatus;
  stats: KnowledgePreviewStats;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  truncated: boolean;
}

export interface KnowledgeListRequest {
  category: KnowledgeCategory;
  offset?: number;
  limit?: number;
}

export interface KnowledgeListResult {
  status: KnowledgeStatus;
  directory: KnowledgeDirectorySummary;
  total: number;
  offset: number;
  nextOffset: number | null;
  items: KnowledgePageSummary[];
}

export interface KnowledgeSearchRequest {
  query?: string;
  category?: KnowledgeCategory;
  limit?: number;
}

export interface KnowledgeSearchResult {
  status: KnowledgeStatus;
  items: KnowledgePageSummary[];
}

export interface KnowledgeGetRequest {
  locator: string;
}
