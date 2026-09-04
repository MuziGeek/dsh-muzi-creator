import { useEffect, useMemo, useRef } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import type { KnowledgePage, PendingKnowledgeFile } from "../../muziTypes.ts";
import type { InspirationReference } from "../../inspirationTypes.ts";
import type { CreatorViewFace, InspirationViewFace, MuziViewFace, TrellisViewFace } from "../face.ts";
import type { CreatorKey } from "../locales.ts";
import { DailyHotInspector } from "../DailyHotInspector.tsx";
import { MuziInspector } from "../MuziInspector.tsx";
import { TrellisProjectInspector } from "../TrellisProjectInspector.tsx";
import { KnowledgePreview } from "../KnowledgePreview.tsx";
import { InspirationWorkbench, type InspirationCopyKey } from "../inspiration/index.ts";
import { setInspirationSelection, useInspirationSelection } from "../inspirationSelection.ts";
import {
  bumpLibrary,
  setContentSelection,
  setKnowledgeSelection,
  useFeatureSelections,
  useSidebarTab,
} from "../contentSelection.ts";
import {
  resolveDailyHotSelection,
  selectDailyHotItem,
  useDailyHotSelection,
  useDailyHotSelectionId,
} from "../dailyHotSelection.ts";
import { dailyHotItems } from "../dailyHotUiModel.ts";
import {
  bumpTrellis,
  selectTrellisProject,
  useTrellisSelection,
} from "../trellisSelection.ts";
import { IslandButton, IslandSkeleton, IslandState, IslandTag } from "../ui/IslandControls.tsx";
import type { WorkbenchResources } from "./WorkbenchData.ts";
import { useResourceSnapshot } from "./WorkbenchData.ts";
import { ContentOverview, HotOverview, ProjectsOverview } from "./WorkbenchOverviews.tsx";
import {
  compactSidebarForDetail,
  expandSidebarList,
  isNewDetailSelection,
  rememberSidebarItemFocus,
  restoreSidebarItemFocus,
} from "./sidebarLayoutBridge.ts";
import "./MuziWorkbench.css";

const TAB_TITLES = {
  hot: "热点工作台",
  inspiration: "灵感研究台账",
  content: "内容工作台",
  knowledge: "知识工作台",
  projects: "项目工作台",
} as const;

type WorkbenchFeature = keyof typeof TAB_TITLES;

export type MuziWorkbenchRootProps = PropsRuntime<"conversation"> & {
  resources: WorkbenchResources;
  inspirationFace: InspirationViewFace;
  muziFace: MuziViewFace;
  oilFace: CreatorViewFace;
  trellisFace: TrellisViewFace;
  t: (key: CreatorKey | InspirationCopyKey) => string;
  openInspirationSession: (sessionId: string) => void;
  promoteInspiration: (reference: InspirationReference) => Promise<void>;
  startPendingProcessing: (file: PendingKnowledgeFile) => Promise<void>;
  startKnowledgeDiscussion: (page: KnowledgePage) => Promise<void>;
};

/** Stable central root; feature switches update content without re-registering the conversation slot. */
export function MuziWorkbenchRoot({
  resources,
  inspirationFace,
  muziFace,
  oilFace,
  trellisFace,
  t,
  openInspirationSession,
  promoteInspiration,
  startPendingProcessing,
  startKnowledgeDiscussion,
}: MuziWorkbenchRootProps) {
  const sidebarTab = useSidebarTab();
  const feature: WorkbenchFeature = sidebarTab === "sessions" ? "hot" : sidebarTab;
  const selections = useFeatureSelections();
  const hotId = useDailyHotSelectionId();
  const hotItem = useDailyHotSelection();
  const [inspirationSelection] = useInspirationSelection();
  const trellisSelection = useTrellisSelection();
  const hot = useResourceSnapshot(resources.hot);
  const inspiration = useResourceSnapshot(resources.inspiration);
  const content = useResourceSnapshot(resources.content);
  const knowledge = useResourceSnapshot(resources.knowledge);
  const projects = useResourceSnapshot(resources.projects);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const resource = feature === "hot" ? resources.hot
      : feature === "inspiration" ? resources.inspiration
        : feature === "content" ? resources.content
          : feature === "knowledge" ? resources.knowledge
            : resources.projects;
    void resource.load(false).catch(() => undefined);
  }, [feature, resources]);

  useEffect(() => {
    if (hot.data !== null) resolveDailyHotSelection(dailyHotItems(hot.data));
  }, [hot.data]);

  useEffect(() => {
    if (projects.data === null || trellisSelection.projectId === null) return;
    if (!projects.data.projects.some((project) => project.projectId === trellisSelection.projectId)) {
      selectTrellisProject(null);
    }
  }, [projects.data, trellisSelection.projectId]);

  useEffect(() => {
    if (inspiration.data === null || inspirationSelection === null) return;
    const owners = inspirationSelection.kind === "item" ? inspiration.data.items : inspiration.data.tasks;
    if (!owners.some((owner) => owner.id === inspirationSelection.id)) setInspirationSelection(null);
  }, [inspiration.data, inspirationSelection]);

  const detailKey = feature === "hot" ? hotId
    : feature === "inspiration"
      ? inspirationSelection === null ? null : `${inspirationSelection.kind}:${inspirationSelection.id}:${inspirationSelection.runId ?? "latest"}`
      : feature === "content" ? selections.contentId
        : feature === "knowledge"
          ? selections.knowledge === null ? null : `${selections.knowledge.kind}:${selections.knowledge.kind === "page" ? selections.knowledge.locator : selections.knowledge.id}`
          : trellisSelection.projectId;
  const previousDetail = useRef({ feature, key: detailKey });
  useEffect(() => {
    if (detailKey !== null) rememberSidebarItemFocus(feature, detailKey);
    if (isNewDetailSelection(
      previousDetail.current.feature,
      previousDetail.current.key,
      feature,
      detailKey,
    )) {
      compactSidebarForDetail();
      window.requestAnimationFrame(() => {
        (document.getElementById("muzi-workbench-detail-title")
          ?? document.getElementById("inspiration-detail-title")
          ?? headingRef.current)?.focus();
      });
    }
    previousDetail.current = { feature, key: detailKey };
  }, [detailKey, feature]);

  const snapshot = feature === "hot" ? hot
    : feature === "inspiration" ? inspiration
      : feature === "content" ? content
        : feature === "knowledge" ? knowledge
          : projects;
  const statusLabel = snapshot.refreshing ? "刷新中"
    : snapshot.error !== null ? "部分不可用"
      : snapshot.data === null ? "读取中"
        : "数据就绪";

  const refresh = async (): Promise<void> => {
    const resource = feature === "hot" ? resources.hot
      : feature === "inspiration" ? resources.inspiration
        : feature === "content" ? resources.content
          : feature === "knowledge" ? resources.knowledge
            : resources.projects;
    const request = resource.load(true);
    if (feature === "content" || feature === "knowledge") bumpLibrary();
    if (feature === "projects") bumpTrellis();
    await request;
  };

  const returnToOverview = (): void => {
    if (detailKey !== null) restoreSidebarItemFocus(feature, detailKey);
    if (feature === "hot") selectDailyHotItem(null);
    if (feature === "inspiration") setInspirationSelection(null);
    if (feature === "content") setContentSelection(null);
    if (feature === "knowledge") setKnowledgeSelection(null);
    if (feature === "projects") selectTrellisProject(null);
  };

  const overview = useMemo(() => {
    if (feature === "hot" && hot.data !== null) {
      return <HotOverview result={hot.data} onSelect={selectDailyHotItem} />;
    }
    if (feature === "inspiration") {
      return (
        <InspirationWorkbench
          face={inspirationFace}
          resource={resources.inspiration}
          openSession={openInspirationSession}
          promote={(reference) => promoteInspiration(reference)}
          t={(key) => t(key as CreatorKey | InspirationCopyKey)}
        />
      );
    }
    if (feature === "content" && content.data !== null) {
      return <ContentOverview result={content.data} onSelect={setContentSelection} />;
    }
    if (feature === "knowledge" && knowledge.data !== null) {
      return <KnowledgePreview result={knowledge.data} onRefresh={async () => { await resources.knowledge.load(true); }} />;
    }
    if (feature === "projects" && projects.data !== null) {
      return <ProjectsOverview result={projects.data} onSelect={selectTrellisProject} />;
    }
    return null;
  }, [content.data, feature, hot.data, inspirationFace, knowledge.data, openInspirationSession, projects.data, promoteInspiration, resources.inspiration, resources.knowledge, t]);

  const detail = feature === "hot"
    ? hotItem === null ? null : <DailyHotInspector t={t} />
    : feature === "inspiration" ? null
    : feature === "content" || feature === "knowledge"
      ? detailKey === null ? null : <MuziInspector muziFace={muziFace} oilFace={oilFace} startPendingProcessing={startPendingProcessing} startKnowledgeDiscussion={startKnowledgeDiscussion} />
      : trellisSelection.projectId === null ? null : <TrellisProjectInspector face={trellisFace} t={t} />;

  if (sidebarTab === "sessions") return null;

  return (
    <main data-plugin="dsh-muzi-creator" data-surface="central-workbench" data-feature={feature}>
      <header className="muziWorkbenchBar">
        <div className="muziWorkbenchHeading">
          <h1 ref={headingRef} tabIndex={-1}>{TAB_TITLES[feature]}</h1>
          <IslandTag size="small" color={snapshot.error === null ? "app-green" : "app-yellow"} variant="soft">{statusLabel}</IslandTag>
        </div>
        <div className="muziWorkbenchActions">
          <IslandButton className="muziWorkbenchExpand" type="text" size="small" onClick={expandSidebarList}>展开列表</IslandButton>
          {detailKey !== null && <IslandButton type="text" size="small" onClick={returnToOverview}>返回概览</IslandButton>}
          <IslandButton type="default" size="small" loading={snapshot.refreshing} disabled={snapshot.refreshing} onClick={() => { void refresh().catch(() => undefined); }}>刷新</IslandButton>
        </div>
      </header>
      {snapshot.error !== null && snapshot.data !== null && <div className="muziWorkbenchRefreshError" role="status">刷新失败，继续显示上次数据：{snapshot.error}</div>}
      <div className={`muziWorkbenchContent${detail !== null ? " detail" : " overview"}`}>
        {detail}
        {detail === null && overview}
        {detail === null && overview === null && snapshot.loading && <div className="muziWorkbenchLoading" aria-label="正在读取工作台数据"><IslandSkeleton variant="rect" widthValue="100%" heightValue={128} /><IslandSkeleton variant="rect" widthValue="100%" heightValue={220} /></div>}
        {detail === null && overview === null && !snapshot.loading && snapshot.error !== null && <IslandState kind="error" title="当前功能暂不可用" message={snapshot.error} action={<IslandButton type="primary" onClick={() => { void refresh().catch(() => undefined); }}>重试</IslandButton>} />}
      </div>
    </main>
  );
}
