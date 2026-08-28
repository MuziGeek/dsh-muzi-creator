import type { InvocationDescriptor } from "@deepseek-ai/dsh-typert-protocol";
import { z } from "zod";

import {
  capabilitiesResultSchema,
  contentDetailSchema,
  coverThumbResultSchema,
  idRequestSchema,
  librarySettingsSchema,
  listContentsRequestSchema,
  listContentsResultSchema,
  setLibraryRootRequestSchema,
  setObsidianExecutableRequestSchema,
  setTrellisProjectsRootRequestSchema,
  createContentRequestSchema,
  createContentResultSchema,
  setContentStageRequestSchema,
  setProfileRequestSchema,
  setScriptRulesRequestSchema,
  bindStudioRequestSchema,
  setPublishRequestSchema,
  setScriptRequestSchema,
  subtitlePreviewResultSchema,
  subtitleTextResultSchema,
  revisionResultSchema,
  syncPublishRequestSchema,
  syncPublishResultSchema,
  videoPlaybackResultSchema,
  articleMediaResultSchema,
} from "./schemas.ts";
import {
  knowledgeGetRequestSchema,
  knowledgeHomeResultSchema,
  knowledgeListRequestSchema,
  knowledgeListResultSchema,
  knowledgePageSchema,
  knowledgePreviewResultSchema,
  knowledgeSearchRequestSchema,
  knowledgeSearchResultSchema,
  knowledgeStatusSchema,
  muziArchiveRequestSchema,
  muziDocumentSaveRequestSchema,
  muziDocumentLocationRequestSchema,
  muziDocumentLocationSchema,
  muziDocumentOpenResultSchema,
  muziProjectCreateRequestSchema,
  muziProjectDetailSchema,
  muziProjectGetRequestSchema,
  muziProjectListRequestSchema,
  muziProjectListResultSchema,
  muziProjectStatusRequestSchema,
  muziPublicationSetRequestSchema,
  muziWorkspaceRevisionSchema,
  pendingKnowledgeFileSchema,
  pendingKnowledgeGetRequestSchema,
  pendingKnowledgeListRequestSchema,
  pendingKnowledgeListResultSchema,
  pendingKnowledgeReferenceSchema,
  videoMetricsSyncRequestSchema,
  videoMetricsSyncResultSchema,
  videoPublishCommitRequestSchema,
  videoPublishPrepareRequestSchema,
  videoPublishStatusRequestSchema,
  videoPublishStatusResultSchema,
  videoPublishTaskResultSchema,
} from "./muziSchemas.ts";
import {
  dailyHotResultSchema,
  getDailyHotRequestSchema,
} from "./dailyHotSchemas.ts";
import {
  archiveTrellisTaskRequestSchema,
  getTrellisProjectRequestSchema,
  prepareTrellisTaskArchiveRequestSchema,
  trellisArchivePreviewSchema,
  trellisArchiveResultSchema,
  trellisProjectDetailSchema,
  trellisProjectListResultSchema,
} from "./trellisSchemas.ts";

export const PACKAGE_NAME = "dsh-muzi-creator";
export const REMOTE_NAMESPACE = "oilCreator";

const emptyObjectSchema = z.object({});

function codec(typeSymbol: string, schema: z.ZodType<unknown>) {
  return { mode: "strict" as const, typeSymbol, schema };
}

function jsonParam(
  name: string,
  typeSymbol: string,
  schema: z.ZodType<unknown>,
): InvocationDescriptor["parameters"][number] {
  return {
    name,
    wire: name,
    source: "json",
    codec: codec(typeSymbol, schema),
  };
}

function invocation(
  method: string,
  request: z.ZodType<unknown>,
  result: z.ZodType<unknown>,
): InvocationDescriptor {
  return {
    id: `${PACKAGE_NAME}#${REMOTE_NAMESPACE}/${method}`,
    service: REMOTE_NAMESPACE,
    namespace: REMOTE_NAMESPACE,
    method,
    invocation: { kind: "direct" },
    parameters: [jsonParam("request", `${PACKAGE_NAME}#${method}Request`, request)],
    cancellation: { parameter: "signal" },
    result: codec(`${PACKAGE_NAME}#${method}Result`, result),
    sourceLocation: { file: "src/service.ts", line: 1, column: 1 },
  };
}

export const OIL_CREATOR_INVOCATIONS: readonly InvocationDescriptor[] = [
  invocation("listContents", listContentsRequestSchema, listContentsResultSchema),
  invocation("getContent", idRequestSchema, contentDetailSchema),
  invocation("getCoverThumb", idRequestSchema, coverThumbResultSchema),
  invocation("getVideoPlayback", idRequestSchema, videoPlaybackResultSchema),
  invocation("getArticleMedia", idRequestSchema, articleMediaResultSchema),
  invocation("getSubtitleText", idRequestSchema, subtitleTextResultSchema),
  invocation("getSettings", emptyObjectSchema, librarySettingsSchema),
  invocation("getCapabilities", emptyObjectSchema, capabilitiesResultSchema),
  invocation("getRevision", emptyObjectSchema, revisionResultSchema),
  invocation("setLibraryRoot", setLibraryRootRequestSchema, librarySettingsSchema),
  invocation("setTrellisProjectsRoot", setTrellisProjectsRootRequestSchema, librarySettingsSchema),
  invocation("setObsidianExecutable", setObsidianExecutableRequestSchema, librarySettingsSchema),
  invocation("refreshCatalog", emptyObjectSchema, listContentsResultSchema),
  invocation("createContent", createContentRequestSchema, createContentResultSchema),
  invocation("setContentStage", setContentStageRequestSchema, contentDetailSchema),
  invocation("setProfile", setProfileRequestSchema, librarySettingsSchema),
  invocation("setScriptRules", setScriptRulesRequestSchema, librarySettingsSchema),
  invocation("bindStudio", bindStudioRequestSchema, contentDetailSchema),
  invocation("openStudio", idRequestSchema, contentDetailSchema),
  invocation("setPublish", setPublishRequestSchema, contentDetailSchema),
  invocation("syncPublish", syncPublishRequestSchema, syncPublishResultSchema),
  invocation("setScript", setScriptRequestSchema, contentDetailSchema),
  invocation("openSubtitlePreview", idRequestSchema, subtitlePreviewResultSchema),
  invocation("startSubtitleBurn", idRequestSchema, contentDetailSchema),
  invocation("startSubtitleGenerate", idRequestSchema, contentDetailSchema),
  invocation("startCoverGenerate", idRequestSchema, contentDetailSchema),
  invocation("listMuziProjects", muziProjectListRequestSchema, muziProjectListResultSchema),
  invocation("getMuziProject", muziProjectGetRequestSchema, muziProjectDetailSchema),
  invocation("getMuziProjectCover", muziProjectGetRequestSchema, coverThumbResultSchema),
  invocation("createMuziProject", muziProjectCreateRequestSchema, muziProjectDetailSchema),
  invocation("saveMuziDocument", muziDocumentSaveRequestSchema, muziProjectDetailSchema),
  invocation("setMuziProjectStatus", muziProjectStatusRequestSchema, muziProjectDetailSchema),
  invocation("setMuziPublication", muziPublicationSetRequestSchema, muziProjectDetailSchema),
  invocation("prepareMuziVideoPublish", videoPublishPrepareRequestSchema, videoPublishTaskResultSchema),
  invocation("commitMuziVideoPublish", videoPublishCommitRequestSchema, videoPublishTaskResultSchema),
  invocation("getMuziVideoPublishStatus", videoPublishStatusRequestSchema, videoPublishStatusResultSchema),
  invocation("syncMuziVideoMetrics", videoMetricsSyncRequestSchema, videoMetricsSyncResultSchema),
  invocation("archiveMuziProject", muziArchiveRequestSchema, muziProjectDetailSchema),
  invocation("getMuziWorkspaceRevision", emptyObjectSchema, muziWorkspaceRevisionSchema),
  invocation("getMuziDocumentLocation", muziDocumentLocationRequestSchema, muziDocumentLocationSchema),
  invocation("openMuziDocumentInObsidian", muziDocumentLocationRequestSchema, muziDocumentOpenResultSchema),
  invocation("getKnowledgeStatus", emptyObjectSchema, knowledgeStatusSchema),
  invocation("getKnowledgeHome", emptyObjectSchema, knowledgeHomeResultSchema),
  invocation("getKnowledgePreview", emptyObjectSchema, knowledgePreviewResultSchema),
  invocation("listKnowledgeDirectory", knowledgeListRequestSchema, knowledgeListResultSchema),
  invocation("searchKnowledge", knowledgeSearchRequestSchema, knowledgeSearchResultSchema),
  invocation("getKnowledgePage", knowledgeGetRequestSchema, knowledgePageSchema),
  invocation("listPendingKnowledge", pendingKnowledgeListRequestSchema, pendingKnowledgeListResultSchema),
  invocation("getPendingKnowledgeFile", pendingKnowledgeGetRequestSchema, pendingKnowledgeFileSchema),
  invocation("serializePendingKnowledgeReference", pendingKnowledgeGetRequestSchema, pendingKnowledgeReferenceSchema),
  invocation("getDailyHot", getDailyHotRequestSchema, dailyHotResultSchema),
  invocation("listTrellisProjects", emptyObjectSchema, trellisProjectListResultSchema),
  invocation("getTrellisProject", getTrellisProjectRequestSchema, trellisProjectDetailSchema),
  invocation("prepareTrellisTaskArchive", prepareTrellisTaskArchiveRequestSchema, trellisArchivePreviewSchema),
  invocation("archiveTrellisTask", archiveTrellisTaskRequestSchema, trellisArchiveResultSchema),
];
