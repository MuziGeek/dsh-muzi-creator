/** Documents managed by one Muzi Creator project. */
export type MuziDocumentKey = "mother" | "video" | "wechat" | "xiaohongshu" | "blog";

export type MuziDocumentStatus = "not_started" | "draft" | "review" | "ready";
export type MuziProjectStage = "idea" | "research" | "mother_draft" | "adaptation" | "review" | "ready" | "archived";
export type MuziPrimaryDocument = "mother" | "video";
export type MuziPublishTarget = "bilibili" | "douyin" | "wechat" | "xiaohongshu" | "blog";
export type MuziPublicationStatus = "unpublished" | "platform_draft" | "published";
export type MuziPublicationSource = "manual" | "sync";

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
  url: string | null;
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
  url?: string;
  publishedAt?: string;
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
