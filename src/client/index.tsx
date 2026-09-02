import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { SessionId, WorkspaceId } from "@deepseek-ai/dsh-client-connection/client";
import type { IConversation } from "@deepseek-ai/dsh-client-ui-conversation/client";
import "animal-island-ui/style";
import "./host-skin/dsh-2.0.4.css";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";

import { TYPERT_REMOTE } from "../remote.ts";
import { CREATOR_SETTINGS_NAMESPACE } from "../settingsContract.ts";
import type { DailyHotResult } from "../dailyHotTypes.ts";
import { startLibraryLiveSync } from "./catalogSync.ts";
import { remountPluginCss, releasePluginCss } from "./pluginCss.ts";
import { releaseShellChrome } from "./contentSelection.ts";
import { registerMuziTriggers } from "./contentTriggers.ts";
import { installMuziHostSkin } from "./host-skin/index.ts";
import { stageSessionHandoff } from "./sessionHandoff.ts";
import {
  pickSettingsDirectory,
  type UiWorkspaceDirectoryPicker,
} from "./directoryPicker.ts";
import type {
  ContentDetail,
  ContentFilter,
  CoverThumbResult,
  CreateContentResult,
  CreatorCapabilities,
  CreatorProfile,
  LibrarySettings,
  ListContentsResult,
  PublishMark,
  PublishPlatform,
  SubtitlePreviewResult,
  SyncPublishResult,
  ArticleMediaResult,
  VideoPlaybackResult,
} from "../types.ts";
import type {
  KnowledgeCategory,
  KnowledgeHomeResult,
  KnowledgeListResult,
  KnowledgePage,
  KnowledgePreviewResult,
  KnowledgeSearchResult,
  KnowledgeStatus,
  MuziArchiveRequest,
  MuziDocumentSaveRequest,
  MuziProjectCreateRequest,
  MuziProjectDetail,
  MuziProjectListResult,
  MuziProjectStatusRequest,
  MuziPublicationSetRequest,
  MuziWorkspaceRevision,
  PendingKnowledgeFile,
  PendingKnowledgeListResult,
  PendingKnowledgeReference,
  VideoMetricsSyncRequest,
  VideoMetricsSyncResult,
  VideoPublishCommitRequest,
  VideoPublishPrepareRequest,
  VideoPublishStatusResult,
  VideoPublishTaskResult,
  VideoAcceptanceBeginRequest,
  VideoAcceptanceFinalizeRequest,
  VideoAcceptanceFinalizeResult,
  VideoAcceptanceSessionResult,
} from "../muziTypes.ts";
import type { VideoPublishCapabilitiesResult } from "../videoCapabilities.ts";
import type {
  ArchiveTrellisTaskRequest,
  GetTrellisProjectRequest,
  PrepareTrellisTaskArchiveRequest,
  TrellisArchivePreview,
  TrellisArchiveResult,
  TrellisProjectDetail,
  TrellisProjectListResult,
} from "../trellisTypes.ts";
import {
  registerMuziHeroBrandMark,
  type CompatibleHeroBrandSlots,
} from "./heroBrand.tsx";
import "./IslandWorkbench.css";
import {
  bumpLibrary,
  bumpProfile,
  getSidebarTab,
  setSidebarTab,
  setWorkbenchSlotError,
  subscribeSidebarChrome,
} from "./contentSelection.ts";
import type { CredentialsClient } from "./credentialsApi.ts";
import { CreatorSettingsCard } from "./CreatorSettingsCard.tsx";
import type { CreatorViewFace, DailyHotViewFace, MuziViewFace, TrellisViewFace } from "./face.ts";
import { en, NS, type CreatorKey, zh } from "./locales.ts";
import { OilSidebarRoot } from "./sidebar/OilSidebarRoot.tsx";
import type { OilSidebarInjected, OilSidebarSlotProps } from "./sidebar/slots.ts";
import {
  registerCreatorSettingsCard,
  type CompatibleSettingsSlots,
} from "./settingsSlot.ts";
import { bumpTrellis } from "./trellisSelection.ts";
import { createWorkbenchResources } from "./workbench/WorkbenchData.ts";
import { MuziWorkbenchRoot } from "./workbench/MuziWorkbenchRoot.tsx";
import { ConversationWorkbenchController } from "./workbench/conversationSlot.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "dsh.oil.creator": CreatorKey;
  }
}

interface RemoteAnswer<T> {
  ok: boolean;
  value?: T;
  error?: { code: string; message: string };
}

interface OilCreatorRemote {
  listContents: (request: { query: string; filter: ContentFilter }) => Promise<RemoteAnswer<ListContentsResult>>;
  getContent: (request: { id: string }) => Promise<RemoteAnswer<ContentDetail>>;
  getCoverThumb: (request: { id: string }) => Promise<RemoteAnswer<CoverThumbResult>>;
  getVideoPlayback: (request: { id: string }) => Promise<RemoteAnswer<VideoPlaybackResult>>;
  getArticleMedia: (request: { id: string }) => Promise<RemoteAnswer<ArticleMediaResult>>;
  getSubtitleText: (request: { id: string }) => Promise<RemoteAnswer<{ text: string; cues: Array<{ text: string; at?: string }> }>>;
  getSettings: (request: Record<string, never>) => Promise<RemoteAnswer<LibrarySettings>>;
  getCapabilities: (request: Record<string, never>) => Promise<RemoteAnswer<{ capabilities: CreatorCapabilities }>>;
  getRevision: (request: Record<string, never>) => Promise<RemoteAnswer<{ revision: number }>>;
  setLibraryRoot: (request: { path: string }) => Promise<RemoteAnswer<LibrarySettings>>;
  setTrellisProjectsRoot: (request: { path: string }) => Promise<RemoteAnswer<LibrarySettings>>;
  setObsidianExecutable: (request: { path: string }) => Promise<RemoteAnswer<LibrarySettings>>;
  setProfile: (request: { profile: CreatorProfile }) => Promise<RemoteAnswer<LibrarySettings>>;
  setScriptRules: (request: { text: string }) => Promise<RemoteAnswer<LibrarySettings>>;
  refreshCatalog: (request: Record<string, never>) => Promise<RemoteAnswer<ListContentsResult>>;
  createContent: (request: { title: string }) => Promise<RemoteAnswer<CreateContentResult>>;
  setContentStage: (request: { id: string; readyToRecord: boolean }) => Promise<RemoteAnswer<ContentDetail>>;
  bindStudio: (request: { id: string; path: string }) => Promise<RemoteAnswer<ContentDetail>>;
  openStudio: (request: { id: string }) => Promise<RemoteAnswer<ContentDetail>>;
  setPublish: (request: {
    id: string;
    platform: PublishPlatform;
    status: PublishMark;
    url?: string;
  }) => Promise<RemoteAnswer<ContentDetail>>;
  syncPublish: (request: { id?: string; platform?: PublishPlatform; force?: boolean }) => Promise<RemoteAnswer<SyncPublishResult>>;
  openSubtitlePreview: (request: { id: string }) => Promise<RemoteAnswer<SubtitlePreviewResult>>;
  startSubtitleBurn: (request: { id: string }) => Promise<RemoteAnswer<ContentDetail>>;
  startSubtitleGenerate: (request: { id: string }) => Promise<RemoteAnswer<ContentDetail>>;
  startCoverGenerate: (request: { id: string }) => Promise<RemoteAnswer<ContentDetail>>;
  setScript: (request: { id: string; text: string }) => Promise<RemoteAnswer<ContentDetail>>;
  listMuziProjects: (request: { query?: string; includeArchived?: boolean; atlasLocator?: string }) => Promise<RemoteAnswer<MuziProjectListResult>>;
  getMuziProject: (request: { id: string }) => Promise<RemoteAnswer<MuziProjectDetail>>;
  getMuziProjectCover: (request: { id: string }) => Promise<RemoteAnswer<CoverThumbResult>>;
  createMuziProject: (request: MuziProjectCreateRequest) => Promise<RemoteAnswer<MuziProjectDetail>>;
  saveMuziDocument: (request: MuziDocumentSaveRequest) => Promise<RemoteAnswer<MuziProjectDetail>>;
  setMuziProjectStatus: (request: MuziProjectStatusRequest) => Promise<RemoteAnswer<MuziProjectDetail>>;
  setMuziPublication: (request: MuziPublicationSetRequest) => Promise<RemoteAnswer<MuziProjectDetail>>;
  getMuziVideoPublishCapabilities: (request: Record<string, never>) => Promise<RemoteAnswer<VideoPublishCapabilitiesResult>>;
  beginMuziVideoAcceptance: (request: VideoAcceptanceBeginRequest) => Promise<RemoteAnswer<VideoAcceptanceSessionResult>>;
  finalizeMuziVideoAcceptance: (request: VideoAcceptanceFinalizeRequest) => Promise<RemoteAnswer<VideoAcceptanceFinalizeResult>>;
  prepareMuziVideoPublish: (request: VideoPublishPrepareRequest) => Promise<RemoteAnswer<VideoPublishTaskResult>>;
  commitMuziVideoPublish: (request: VideoPublishCommitRequest) => Promise<RemoteAnswer<VideoPublishTaskResult>>;
  getMuziVideoPublishStatus: (request: { id: string; taskId?: string }) => Promise<RemoteAnswer<VideoPublishStatusResult>>;
  syncMuziVideoMetrics: (request: VideoMetricsSyncRequest) => Promise<RemoteAnswer<VideoMetricsSyncResult>>;
  archiveMuziProject: (request: MuziArchiveRequest) => Promise<RemoteAnswer<MuziProjectDetail>>;
  getKnowledgeStatus: (request: Record<string, never>) => Promise<RemoteAnswer<KnowledgeStatus>>;
  getKnowledgeHome: (request: Record<string, never>) => Promise<RemoteAnswer<KnowledgeHomeResult>>;
  getKnowledgePreview: (request: Record<string, never>) => Promise<RemoteAnswer<KnowledgePreviewResult>>;
  listKnowledgeDirectory: (request: { category: KnowledgeCategory; offset?: number; limit?: number }) => Promise<RemoteAnswer<KnowledgeListResult>>;
  searchKnowledge: (request: { query?: string; category?: KnowledgeCategory; limit?: number }) => Promise<RemoteAnswer<KnowledgeSearchResult>>;
  getKnowledgePage: (request: { locator: string }) => Promise<RemoteAnswer<KnowledgePage>>;
  listPendingKnowledge: (request: { query?: string; offset?: number; limit?: number }) => Promise<RemoteAnswer<PendingKnowledgeListResult>>;
  getPendingKnowledgeFile: (request: { id: string }) => Promise<RemoteAnswer<PendingKnowledgeFile>>;
  serializePendingKnowledgeReference: (request: { id: string; expectedSha256?: string }) => Promise<RemoteAnswer<PendingKnowledgeReference>>;
  getDailyHot: (request: { refresh?: boolean }) => Promise<RemoteAnswer<DailyHotResult>>;
  getMuziWorkspaceRevision: (request: Record<string, never>) => Promise<RemoteAnswer<MuziWorkspaceRevision>>;
  openMuziDocumentInObsidian: (request: { id: string; document: MuziDocumentSaveRequest["document"] }) => Promise<RemoteAnswer<{ opened: true }>>;
  listTrellisProjects: (request: Record<string, never>) => Promise<RemoteAnswer<TrellisProjectListResult>>;
  getTrellisProject: (request: GetTrellisProjectRequest) => Promise<RemoteAnswer<TrellisProjectDetail>>;
  prepareTrellisTaskArchive: (request: PrepareTrellisTaskArchiveRequest) => Promise<RemoteAnswer<TrellisArchivePreview>>;
  archiveTrellisTask: (request: ArchiveTrellisTaskRequest) => Promise<RemoteAnswer<TrellisArchiveResult>>;
}

interface SkillCatalogApi {
  list: (
    request: { sessionId: SessionId },
    signal: AbortSignal,
  ) => Promise<{ result: RemoteAnswer<{ skills: Array<{ name: string }> }> }>;
}

interface FreshSessionsClient {
  list: {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => {
      ids: SessionId[];
      current: SessionId | undefined;
      byId: Record<string, {
        id: SessionId;
        cwd?: string;
        running: boolean;
        pendingInteraction?: string;
      }>;
    };
  };
  create: (options: { workspaceId: WorkspaceId }) => Promise<SessionId>;
  scope: (id: SessionId) => ClientContext | undefined;
  open: (id: SessionId) => void;
}

function credentialsOf(ctx: ClientContext): CredentialsClient | undefined {
  const connection = ctx.get("connection") as { api?: { credentials?: CredentialsClient } } | undefined;
  return connection?.api?.credentials;
}

function unwrap<T>(answer: RemoteAnswer<T>, fallback: string): T {
  if (!answer.ok || answer.value === undefined) {
    throw new Error(answer.error?.message ?? fallback);
  }
  return answer.value;
}

export const inject = ["slots", "locale", "remote", "workspaces", "uiWorkspace", "layout", "connection", "conversation", "theme"];

export function apply(ctx: ClientContext): void {
  installMuziHostSkin(ctx);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-oil-creator: dictionaries");
  ctx.effect(() => {
    remountPluginCss();
    return () => {
      releasePluginCss();
      releaseShellChrome();
    };
  }, "dsh-oil-creator: chrome");
  const remoteOf = (): OilCreatorRemote | undefined =>
    ctx.get("remote.oilCreator") as OilCreatorRemote | undefined;
  const trellisRemoteOf = (): OilCreatorRemote | undefined => {
    const remote = remoteOf();
    return remote !== undefined
      && typeof remote.listTrellisProjects === "function"
      && typeof remote.getTrellisProject === "function"
      && typeof remote.prepareTrellisTaskArchive === "function"
      && typeof remote.archiveTrellisTask === "function"
      ? remote
      : undefined;
  };
  const dailyHotRemoteOf = (): OilCreatorRemote | undefined => {
    const remote = remoteOf();
    return remote !== undefined && typeof remote.getDailyHot === "function" ? remote : undefined;
  };

  const face = (): CreatorViewFace => ({
    ready: () => remoteOf() !== undefined,
    listContents: async (query, filter) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.listContents({ query, filter }), "list failed");
    },
    getContent: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getContent({ id }), "content failed");
    },
    getCoverThumb: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) return { found: false, mime: "", base64: "" };
      const answer = await remote.getCoverThumb({ id });
      return answer.ok && answer.value !== undefined
        ? answer.value
        : { found: false, mime: "", base64: "" };
    },
    getVideoPlayback: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) return { found: false, url: "", kind: "raw" };
      const answer = await remote.getVideoPlayback({ id });
      return answer.ok && answer.value !== undefined
        ? answer.value
        : { found: false, url: "", kind: "raw" };
    },
    getArticleMedia: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) return { found: false, origin: "" };
      const answer = await remote.getArticleMedia({ id });
      return answer.ok && answer.value !== undefined
        ? answer.value
        : { found: false, origin: "" };
    },
    getSubtitleText: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) return { text: "", cues: [] };
      const answer = await remote.getSubtitleText({ id });
      return answer.ok && answer.value !== undefined ? answer.value : { text: "", cues: [] };
    },
    pickDirectory: () => pickSettingsDirectory(
      ctx.get("uiWorkspace") as UiWorkspaceDirectoryPicker,
    ),
    openPath: (path) => ctx.workspaces.openPath(path),
    getSettings: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getSettings({}), "settings failed");
    },
    getCapabilities: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getCapabilities({}), "capabilities failed").capabilities;
    },
    getRevision: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getRevision({}), "revision failed").revision;
    },
    setLibraryRoot: async (path) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.setLibraryRoot({ path }), "set root failed");
      bumpLibrary();
    },
    setTrellisProjectsRoot: async (path) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.setTrellisProjectsRoot({ path }), "set projects root failed");
      bumpTrellis();
    },
    setObsidianExecutable: async (path) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.setObsidianExecutable({ path }), "set obsidian executable failed");
    },
    setProfile: async (profile) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.setProfile({ profile }), "set profile failed");
      bumpProfile();
    },
    setScriptRules: async (text) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.setScriptRules({ text }), "set script rules failed");
      bumpProfile();
    },
    refreshCatalog: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const listed = unwrap(await remote.refreshCatalog({}), "refresh failed");
      bumpLibrary();
      return listed;
    },
    createContent: async (title) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const created = unwrap(await remote.createContent({ title }), "create failed");
      bumpLibrary();
      return created;
    },
    markReadyToRecord: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.setContentStage({ id, readyToRecord: true }), "stage failed");
      bumpLibrary();
      return next;
    },
    bindStudio: async (id, path) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.bindStudio({ id, path }), "bind failed");
      bumpLibrary();
      return next;
    },
    openStudio: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.openStudio({ id }), "open failed");
    },
    setPublish: async (id, platform, status, url) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(
        await remote.setPublish(url === undefined ? { id, platform, status } : { id, platform, status, url }),
        "publish failed",
      );
      bumpLibrary();
      return next;
    },
    syncPublish: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const result = unwrap(
        await remote.syncPublish(request ?? {}),
        "sync failed",
      );
      bumpLibrary();
      return result;
    },
    openSubtitlePreview: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.openSubtitlePreview({ id }), "preview failed");
    },
    startSubtitleBurn: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.startSubtitleBurn({ id }), "burn failed");
      bumpLibrary();
      return next;
    },
    startSubtitleGenerate: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.startSubtitleGenerate({ id }), "transcribe failed");
      bumpLibrary();
      return next;
    },
    startCoverGenerate: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.startCoverGenerate({ id }), "cover failed");
      bumpLibrary();
      return next;
    },
    setScript: async (id, text) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.setScript({ id, text }), "script failed");
    },
  });

  const contentFace = face();
  const muziFace: MuziViewFace = {
    ready: () => remoteOf() !== undefined,
    listProjects: async (query, includeArchived, atlasLocator) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.listMuziProjects({
        ...(query === undefined ? {} : { query }),
        ...(includeArchived === undefined ? {} : { includeArchived }),
        ...(atlasLocator === undefined ? {} : { atlasLocator }),
      }), "creator list failed");
    },
    getProject: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getMuziProject({ id }), "creator project failed");
    },
    getProjectCover: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) return { found: false, mime: "", base64: "" };
      const answer = await remote.getMuziProjectCover({ id });
      return answer.ok && answer.value !== undefined ? answer.value : { found: false, mime: "", base64: "" };
    },
    createProject: async (title, primaryDocument) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const created = unwrap(await remote.createMuziProject({ title, primaryDocument, confirmed: true }), "create failed");
      bumpLibrary();
      return created;
    },
    saveDocument: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const saved = unwrap(await remote.saveMuziDocument({ ...request, confirmed: true }), "save failed");
      bumpLibrary();
      return saved;
    },
    setProjectStatus: async (id, stage, expectedRevision) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.setMuziProjectStatus({ id, stage, expectedRevision }), "status failed");
      bumpLibrary();
      return next;
    },
    setPublication: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.setMuziPublication(request), "publication failed");
      bumpLibrary();
      return next;
    },
    getVideoPublishCapabilities: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getMuziVideoPublishCapabilities({}), "video publish capabilities failed");
    },
    beginVideoAcceptance: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.beginMuziVideoAcceptance(request), "video acceptance start failed");
    },
    finalizeVideoAcceptance: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.finalizeMuziVideoAcceptance(request), "video acceptance finalization failed");
    },
    prepareVideoPublish: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.prepareMuziVideoPublish(request), "video publish preparation failed");
    },
    commitVideoPublish: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.commitMuziVideoPublish(request), "video final action failed");
      bumpLibrary();
      return next;
    },
    getVideoPublishStatus: async (id, taskId) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getMuziVideoPublishStatus({ id, ...(taskId === undefined ? {} : { taskId }) }), "video publish status failed");
    },
    syncVideoMetrics: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.syncMuziVideoMetrics(request), "video metrics sync failed");
      bumpLibrary();
      return next;
    },
    archiveProject: async (id, expectedRevision) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const next = unwrap(await remote.archiveMuziProject({ id, expectedRevision, confirmed: true }), "archive failed");
      bumpLibrary();
      return next;
    },
    getKnowledgeStatus: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getKnowledgeStatus({}), "knowledge status failed");
    },
    getKnowledgeHome: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getKnowledgeHome({}), "knowledge home failed");
    },
    getKnowledgePreview: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getKnowledgePreview({}), "knowledge preview failed");
    },
    listKnowledgeDirectory: async (category, offset, limit) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.listKnowledgeDirectory({
        category,
        ...(offset === undefined ? {} : { offset }),
        ...(limit === undefined ? {} : { limit }),
      }), "knowledge directory failed");
    },
    searchKnowledge: async (query, category, limit) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.searchKnowledge({
        ...(query === undefined ? {} : { query }),
        ...(category === undefined ? {} : { category }),
        ...(limit === undefined ? {} : { limit }),
      }), "knowledge search failed");
    },
    getKnowledgePage: async (locator) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getKnowledgePage({ locator }), "knowledge page failed");
    },
    listPendingKnowledge: async (query, offset, limit) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.listPendingKnowledge({
        ...(query === undefined ? {} : { query }),
        ...(offset === undefined ? {} : { offset }),
        ...(limit === undefined ? {} : { limit }),
      }), "pending knowledge list failed");
    },
    getPendingKnowledgeFile: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getPendingKnowledgeFile({ id }), "pending knowledge file failed");
    },
    getWorkspaceRevision: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getMuziWorkspaceRevision({}), "workspace revision failed");
    },
    openDocumentInObsidian: async (id, document) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.openMuziDocumentInObsidian({ id, document }), "open in Obsidian failed");
    },
  };

  const trellisFace: TrellisViewFace = {
    ready: () => trellisRemoteOf() !== undefined,
    listProjects: async () => {
      const remote = trellisRemoteOf();
      if (remote === undefined) throw new Error("项目接口正在连接，请稍候后重试");
      return unwrap(await remote.listTrellisProjects({}), "project list failed");
    },
    getProject: async (projectId) => {
      const remote = trellisRemoteOf();
      if (remote === undefined) throw new Error("项目接口正在连接，请稍候后重试");
      return unwrap(await remote.getTrellisProject({
        projectId,
      }), "project detail failed");
    },
    prepareArchive: async (projectId, taskKey) => {
      const remote = trellisRemoteOf();
      if (remote === undefined) throw new Error("项目接口正在连接，请稍候后重试");
      return unwrap(await remote.prepareTrellisTaskArchive({
        projectId,
        taskKey,
      }), "archive preview failed");
    },
    archiveTask: async (token) => {
      const remote = trellisRemoteOf();
      if (remote === undefined) throw new Error("项目接口正在连接，请稍候后重试");
      const result = unwrap(await remote.archiveTrellisTask({ token }), "archive failed");
      bumpTrellis();
      return result;
    },
    openPath: (path) => ctx.workspaces.openPath(path),
  };
  const dailyHotFace: DailyHotViewFace = {
    ready: () => dailyHotRemoteOf() !== undefined,
    getDailyHot: async (refresh) => {
      const remote = dailyHotRemoteOf();
      if (remote === undefined) throw new Error("热点接口正在连接，请稍候后重试");
      return unwrap(
        await remote.getDailyHot(refresh === undefined ? {} : { refresh }),
        "hotspot read failed",
      );
    },
  };
  const workbenchResources = createWorkbenchResources(dailyHotFace, muziFace, trellisFace);

  const handoffWorkspace = (): WorkspaceId => {
    const workspaces = ctx.workspaces.list.getSnapshot();
    const sessions = (ctx.get("sessions") as unknown as FreshSessionsClient).list.getSnapshot();
    const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current];
    const currentWorkspace = current?.cwd === undefined
      ? undefined
      : workspaces.items.find((workspace) => workspace.path === current.cwd && workspace.sessionIds.includes(current.id));
    const workspaceId = currentWorkspace?.workspaceId ?? workspaces.recentWorkspaceId ?? workspaces.items[0]?.workspaceId;
    if (workspaceId === undefined) throw new Error("请先创建或打开一个工作区，再开始 Agent 会话");
    return workspaceId;
  };

  const revealHandoff = (sessionId: SessionId): void => {
    (ctx.get("sessions") as unknown as FreshSessionsClient).open(sessionId);
    setSidebarTab("sessions");
  };

  const createHandoff = async (options: {
    prompt: string;
    label: string;
    ref: string;
    requireLlmWiki?: boolean;
  }): Promise<void> => {
    const sessions = ctx.get("sessions") as unknown as FreshSessionsClient;
    await stageSessionHandoff({
      create: () => sessions.create({ workspaceId: handoffWorkspace() }),
      inputFor: (sessionId) => {
        const scope = sessions.scope(sessionId);
        if (scope === undefined) throw new Error("新会话尚未就绪，请重试");
        return (ctx.get("conversation") as IConversation).input.for(scope);
      },
      reveal: revealHandoff,
      hasLlmWiki: async (sessionId) => {
        const connection = ctx.get("connection") as { api?: { skills?: SkillCatalogApi } } | undefined;
        const skills = connection?.api?.skills;
        if (skills === undefined) throw new Error("当前 Agent 无法读取 Skill 列表");
        const { result } = await skills.list({ sessionId }, new AbortController().signal);
        if (!result.ok || result.value === undefined) throw new Error(result.error?.message ?? "未知错误");
        return result.value.skills.some((skill) => skill.name === "llm-wiki");
      },
    }, options);
  };

  ctx.effect(() => {
    const triggers = ctx.get("inputTriggers") as
      | Parameters<typeof registerMuziTriggers>[0]
      | undefined;
    return registerMuziTriggers(
      triggers,
      (id) => muziFace.getProject(id),
      async () => {
        const listed = await muziFace.listProjects();
        return listed.items.map((item) => ({ id: item.id, title: item.title }));
      },
      (locator) => muziFace.getKnowledgePage(locator),
      async (query) => (await muziFace.searchKnowledge(query)).items,
      async (id, expectedSha256) => {
        const remote = remoteOf();
        if (remote === undefined) throw new Error("remote unavailable");
        return unwrap(await remote.serializePendingKnowledgeReference({
          id,
          ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
        }), "pending knowledge reference failed");
      },
    );
  }, "dsh-oil-creator: content triggers");

  const injectSidebar = (): OilSidebarInjected => ({
    startSession: (workspaceId?: WorkspaceId) => {
      ctx.workspaces.startSession(workspaceId);
    },
    toggleSidebar: () => {
      ctx.layout.toggleSidebar();
    },
  });

  function BoundSidebar(props: OilSidebarSlotProps) {
    const contentT = ctx.locale.bind(NS);
    return (
      <OilSidebarRoot
        {...props}
        tabLabels={{
          sessions: contentT("tab.sessions"),
          hot: contentT("tab.hot"),
          content: contentT("tab"),
          knowledge: contentT("tab.knowledge"),
          projects: contentT("tab.projects"),
        }}
        contentFace={contentFace}
        hotFace={dailyHotFace}
        muziFace={muziFace}
        trellisFace={trellisFace}
        contentT={contentT}
        sessionList={(ctx.get("sessions") as unknown as FreshSessionsClient).list}
        resources={workbenchResources}
      />
    );
  }

  ctx.slots.inject("sidebar", () =>
    ctx.slots.register({
      name: "sidebar",
      locale: NS,
      priority: -1,
      children: {
        "sidebar.workspaces": { kind: "single", scope: "root" },
        "sidebar.settings": { kind: "single", scope: "root" },
        "sidebar.footer.action": { kind: "list", scope: "root" },
      },
      inject: injectSidebar,
    }, BoundSidebar),
  );
  ctx.slots.inject("conversation.hero.brand.mark" as never, () =>
    registerMuziHeroBrandMark(ctx.slots as unknown as CompatibleHeroBrandSlots),
  );

  ctx.effect(async () => {
    const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
    // Cordis waits for async effect setup during unload. Do not install new
    // slots after the owner has already entered teardown; release the remote
    // contribution immediately in that race.
    if (ctx.fiber.state >= 5) {
      await disposeRemote();
      return () => {};
    }
    bumpProfile();
    bumpTrellis();

    const stopWorkbench = ctx.slots.inject("conversation", () => {
      const controller = new ConversationWorkbenchController(
        () => ctx.slots.register({
          name: "conversation",
          priority: -10,
          locale: NS,
          inject: () => ({
            resources: workbenchResources,
            muziFace,
            oilFace: contentFace,
            trellisFace,
            t: ctx.locale.bind(NS),
            startPendingProcessing: (file: PendingKnowledgeFile) => createHandoff({
              prompt: "/llm-wiki 请消化所引用的待处理文件。先执行隐私自查与缓存检查；确认可处理后，按 llm-wiki 标准写入正式知识并更新索引。完成后报告新增或更新的正式知识定位符。",
              label: "待消化文件",
              ref: `pending:${file.id}:${file.sha256}`,
              requireLlmWiki: true,
            }),
            startKnowledgeDiscussion: (page: KnowledgePage) => createHandoff({
              prompt: "请基于所引用的正式知识，先讨论核心观点、证据边界与可行的创作方向。除非我明确输入“总结成为母内容”或“整理为脚本”，否则不要写入 Creator Studio。",
              label: page.title,
              ref: `knowledge:${page.locator}`,
            }),
          }),
        }, MuziWorkbenchRoot),
        setWorkbenchSlotError,
      );
      const sync = (): void => { controller.sync(getSidebarTab()); };
      const stopTab = subscribeSidebarChrome(sync);
      sync();
      return () => {
        stopTab();
        controller.dispose();
      };
    });
    const stopSettings = ctx.slots.inject("settings.plugin.item", () =>
      registerCreatorSettingsCard(
        ctx.slots as unknown as CompatibleSettingsSlots,
        CreatorSettingsCard,
        {
          namespace: CREATOR_SETTINGS_NAMESPACE,
          legacyId: "dsh-oil-creator",
          legacyOrder: 40,
          locale: NS,
          inject: () => ({
            ...face(),
            credentials: credentialsOf(ctx),
          }),
        },
      ));
    const stopLive = startLibraryLiveSync(() => contentFace.getRevision());
    const stopMuziLive = startLibraryLiveSync(async () => {
      const revision = await muziFace.getWorkspaceRevision();
      return `${revision.creator}:${revision.knowledge}`;
    });
    const stopTrellisLive = startLibraryLiveSync(async () => {
      const revision = await muziFace.getWorkspaceRevision();
      return revision.trellis;
    }, undefined, bumpTrellis);

    return async () => {
      stopLive();
      stopMuziLive();
      stopTrellisLive();
      stopWorkbench();
      stopSettings();
      await disposeRemote();
    };
  }, "dsh-oil-creator: remote-view");
}
