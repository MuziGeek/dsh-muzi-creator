import type {
  DailyHotResult,
} from "../dailyHotTypes.ts";
import type {
  ContentDetail,
  ContentFilter,
  CoverThumbResult,
  CreatorCapabilities,
  CreatorProfile,
  LibrarySettings,
  ListContentsResult,
  PublishMark,
  PublishPlatform,
  SubtitlePreviewResult,
  SubtitleTextResult,
  SyncPublishResult,
  ArticleMediaResult,
  VideoPlaybackResult,
} from "../types.ts";
import type {
  KnowledgePage,
  KnowledgeCategory,
  KnowledgeHomeResult,
  KnowledgePreviewResult,
  KnowledgeListResult,
  KnowledgeSearchResult,
  KnowledgeStatus,
  MuziDocumentKey,
  MuziDocumentStatus,
  MuziPrimaryDocument,
  MuziProjectDetail,
  MuziProjectListResult,
  MuziProjectStage,
  MuziPublicationSource,
  MuziPublicationStatus,
  MuziPublishTarget,
  MuziWorkspaceRevision,
  PendingKnowledgeFile,
  PendingKnowledgeListResult,
} from "../muziTypes.ts";
import type {
  TrellisArchivePreview,
  TrellisArchiveResult,
  TrellisArchiveToken,
  TrellisProjectDetail,
  TrellisProjectId,
  TrellisProjectListResult,
  TrellisTaskKey,
} from "../trellisTypes.ts";

export interface CreatorViewFace {
  ready: () => boolean;
  listContents: (query: string, filter: ContentFilter) => Promise<ListContentsResult>;
  getRevision: () => Promise<number>;
  getContent: (id: string) => Promise<ContentDetail>;
  getCoverThumb: (id: string) => Promise<CoverThumbResult>;
  getVideoPlayback: (id: string) => Promise<VideoPlaybackResult>;
  getArticleMedia: (id: string) => Promise<ArticleMediaResult>;
  getSubtitleText: (id: string) => Promise<SubtitleTextResult>;
  pickDirectory: () => Promise<string | null>;
  openPath: (path: string) => Promise<void>;
  getSettings: () => Promise<LibrarySettings>;
  getCapabilities: () => Promise<CreatorCapabilities>;
  setLibraryRoot: (path: string) => Promise<void>;
  setTrellisProjectsRoot: (path: string) => Promise<void>;
  setObsidianExecutable: (path: string) => Promise<void>;
  setProfile: (profile: CreatorProfile) => Promise<void>;
  setScriptRules: (text: string) => Promise<void>;
  refreshCatalog: () => Promise<ListContentsResult>;
  createContent: (title: string) => Promise<{ id: string; folderPath: string }>;
  markReadyToRecord: (id: string) => Promise<ContentDetail>;
  bindStudio: (id: string, path: string) => Promise<ContentDetail>;
  openStudio: (id: string) => Promise<ContentDetail>;
  setPublish: (id: string, platform: PublishPlatform, status: PublishMark, url?: string) => Promise<ContentDetail>;
  syncPublish: (request?: { platform?: PublishPlatform; id?: string }) => Promise<SyncPublishResult>;
  openSubtitlePreview: (id: string) => Promise<SubtitlePreviewResult>;
  startSubtitleBurn: (id: string) => Promise<ContentDetail>;
  startSubtitleGenerate: (id: string) => Promise<ContentDetail>;
  startCoverGenerate: (id: string) => Promise<ContentDetail>;
  setScript: (id: string, text: string) => Promise<ContentDetail>;
}

export interface MuziViewFace {
  ready: () => boolean;
  listProjects: (query?: string, includeArchived?: boolean, atlasLocator?: string) => Promise<MuziProjectListResult>;
  getProject: (id: string) => Promise<MuziProjectDetail>;
  getProjectCover: (id: string) => Promise<CoverThumbResult>;
  createProject: (title: string, primaryDocument: MuziPrimaryDocument) => Promise<MuziProjectDetail>;
  saveDocument: (request: {
    id: string;
    document: MuziDocumentKey;
    text: string;
    status: MuziDocumentStatus;
    expectedRevision: number;
    derivedFrom?: MuziDocumentKey;
    sourceSha256?: string;
  }) => Promise<MuziProjectDetail>;
  setProjectStatus: (id: string, stage: MuziProjectStage, expectedRevision: number) => Promise<MuziProjectDetail>;
  setPublication: (request: {
    id: string;
    target: MuziPublishTarget;
    status: MuziPublicationStatus;
    expectedRevision: number;
    source: MuziPublicationSource;
    url?: string;
    publishedAt?: string;
  }) => Promise<MuziProjectDetail>;
  archiveProject: (id: string, expectedRevision: number) => Promise<MuziProjectDetail>;
  getKnowledgeStatus: () => Promise<KnowledgeStatus>;
  getKnowledgeHome: () => Promise<KnowledgeHomeResult>;
  getKnowledgePreview: () => Promise<KnowledgePreviewResult>;
  listKnowledgeDirectory: (category: KnowledgeCategory, offset?: number, limit?: number) => Promise<KnowledgeListResult>;
  searchKnowledge: (query?: string, category?: KnowledgeCategory, limit?: number) => Promise<KnowledgeSearchResult>;
  getKnowledgePage: (locator: string) => Promise<KnowledgePage>;
  listPendingKnowledge: (query?: string, offset?: number, limit?: number) => Promise<PendingKnowledgeListResult>;
  getPendingKnowledgeFile: (id: string) => Promise<PendingKnowledgeFile>;
  getWorkspaceRevision: () => Promise<MuziWorkspaceRevision>;
  openDocumentInObsidian: (id: string, document: MuziDocumentKey) => Promise<void>;
}

export interface TrellisViewFace {
  ready: () => boolean;
  listProjects: () => Promise<TrellisProjectListResult>;
  getProject: (projectId: TrellisProjectId) => Promise<TrellisProjectDetail>;
  prepareArchive: (projectId: TrellisProjectId, taskKey: TrellisTaskKey) => Promise<TrellisArchivePreview>;
  archiveTask: (token: TrellisArchiveToken) => Promise<TrellisArchiveResult>;
  openPath: (path: string) => Promise<void>;
}

/** Read-only client face for the AIHOT aggregate. */
export interface DailyHotViewFace {
  ready: () => boolean;
  getDailyHot: (refresh?: boolean) => Promise<DailyHotResult>;
}
