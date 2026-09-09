import { describe, expect, it } from "vitest";

import { MZ_CREATOR_INVOCATIONS, PACKAGE_NAME, REMOTE_NAMESPACE } from "../src/remote-contract.ts";
import { TYPERT } from "../src/typert.host.ts";

describe("handwritten TYPERT", () => {
  it("matches the package and host face", () => {
    expect(TYPERT.package).toBe(PACKAGE_NAME);
    expect(TYPERT.face).toBe("host");
    expect(TYPERT.invocations).toBe(MZ_CREATOR_INVOCATIONS);
  });

  it("exposes mzCreator methods with zod v4 codecs", () => {
    const methods = MZ_CREATOR_INVOCATIONS.map((item) => item.method);
    expect(methods).toEqual([
      "listContents",
      "getContent",
      "getCoverThumb",
      "getVideoPlayback",
      "getArticleMedia",
      "getSubtitleText",
      "getVideoAccounts",
      "addVideoAccount",
      "setVideoAccountEnabled",
      "removeVideoAccount",
      "openVideoAccountLogin",
      "checkVideoAccountLogin",
      "reconnectVideoAccount",
      "pollVideoAccountConnection",
      "cancelVideoAccountConnection",
      "reopenVideoAccountConnection",
      "getPublishFlow",
      "preparePublishFlow",
      "resumePublishFlow",
      "invalidatePublishFlow",
      "commitPublishFlow",
      "getSettings",
      "getCapabilities",
      "getRevision",
      "setLibraryRoot",
      "setTrellisProjectsRoot",
      "setObsidianExecutable",
      "refreshCatalog",
      "createContent",
      "setContentStage",
      "setProfile",
      "setScriptRules",
      "bindProductionProject",
      "openProductionProjectFolder",
      "waitForExport",
      "cancelWaitForExport",
      "bindStudio",
      "openStudio",
      "setPublish",
      "syncPublish",
      "setScript",
      "openSubtitlePreview",
      "startSubtitleBurn",
      "startSubtitleGenerate",
      "startCoverGenerate",
      "listMuziProjects",
      "getMuziProject",
      "getMuziProjectCover",
      "createMuziProject",
      "saveMuziDocument",
      "setMuziProjectStatus",
      "setMuziPublication",
      "beginMuziVideoAcceptance",
      "getMuziVideoPublishCapabilities",
      "finalizeMuziVideoAcceptance",
      "getMuziVideoPublishStatus",
      "syncMuziVideoMetrics",
      "archiveMuziProject",
      "deleteMuziProject",
      "getMuziWorkspaceRevision",
      "getMuziDocumentLocation",
      "openMuziDocumentInObsidian",
      "getKnowledgeStatus",
      "getKnowledgeHome",
      "getKnowledgePreview",
      "listKnowledgeDirectory",
      "searchKnowledge",
      "getKnowledgePage",
      "listPendingKnowledge",
      "getPendingKnowledgeFile",
      "serializePendingKnowledgeReference",
      "getDailyHot",
      "listInspirations",
      "getInspirationRevision",
      "getInspiration",
      "saveInspirationDraft",
      "startInspirationResearch",
      "stopInspirationRun",
      "saveInspirationTask",
      "setInspirationTaskState",
      "runInspirationTaskNow",
      "markInspirationRead",
      "archiveInspiration",
      "deleteInspiration",
      "openInspirationReportInObsidian",
      "serializeInspirationReference",
      "manageTrellisGithub",
      "listTrellisProjects",
      "getTrellisProject",
      "prepareTrellisTaskArchive",
      "archiveTrellisTask",
    ]);
    for (const item of MZ_CREATOR_INVOCATIONS) {
      expect(item.service).toBe(REMOTE_NAMESPACE);
      expect(item.namespace).toBe(REMOTE_NAMESPACE);
      expect(item.result.mode).toBe("strict");
      if (item.result.mode !== "strict") continue;
      expect("_zod" in item.result.schema).toBe(true);
      expect(typeof item.result.schema.parse).toBe("function");
    }
  });
});
