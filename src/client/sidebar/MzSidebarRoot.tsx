import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import type { CreatorViewFace, InspirationViewFace, DailyHotViewFace, MuziViewFace, TrellisViewFace } from "../face.ts";
import type { CreatorKey } from "../locales.ts";
import { InspirationSidebarPanel, type InspirationCopyKey } from "../inspiration/index.ts";
import {
  setSidebarChromeWidth,
  setSidebarTab,
  setContentSelection,
  setKnowledgeSelection,
  useSidebarTab,
  useWorkbenchSlotError,
} from "../contentSelection.ts";
import { IslandButton } from "../ui/IslandControls.tsx";
import { WorkbenchIcon } from "../ui/WorkbenchIcon.tsx";
import { selectDailyHotItem } from "../dailyHotSelection.ts";
import { setInspirationSelection } from "../inspirationSelection.ts";
import { selectTrellisProject } from "../trellisSelection.ts";
import { nextSidebarTab } from "../trellisUiModel.ts";
import type { WorkbenchResources } from "../workbench/WorkbenchData.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import { bindSidebarLayout } from "../workbench/sidebarLayoutBridge.ts";
import { deriveSessionActivityBadge, type SessionActivitySnapshot } from "../workbench/sessionActivity.ts";
import { KnowledgePanel } from "./KnowledgePanel.tsx";
import { DailyHotPanel } from "./DailyHotPanel.tsx";
import { MuziContentPanel } from "./MuziContentPanel.tsx";
import { TrellisProjectPanel } from "./TrellisProjectPanel.tsx";
import { MzBrand } from "./MzBrand.tsx";
import type { MzSidebarSlotProps } from "./slots.ts";
import "./MzSidebarRoot.css";
import "./SidebarNavigation.css";

const COLLAPSE_SETTLE_MS = 150;
const SCROLLBAR_LINGER_MS = 2000;
function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}

export type MzSidebarRootProps =
  & MzSidebarSlotProps
  & {
    tabLabels: { sessions: string; hot: string; inspiration: string; content: string; knowledge: string; projects: string };
    contentFace: CreatorViewFace;
    hotFace: DailyHotViewFace;
    muziFace: MuziViewFace;
    inspirationFace: InspirationViewFace;
    trellisFace: TrellisViewFace;
    contentT: (key: CreatorKey | InspirationCopyKey) => string;
    resources: WorkbenchResources;
    sessionList: {
      getSnapshot: () => SessionActivitySnapshot;
      subscribe: (listener: () => void) => () => void;
    };
  };

export function MzSidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  t,
  renderSlot,
  tabLabels,
  contentFace,
  hotFace,
  muziFace,
  inspirationFace,
  trellisFace,
  contentT,
  resources,
  sessionList,
}: MzSidebarRootProps) {
  const [settled, setSettled] = useState(collapsed);
  useEffect(() => {
    if (!collapsed) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => { setSettled(true); }, COLLAPSE_SETTLE_MS);
    return () => { window.clearTimeout(timer); };
  }, [collapsed]);

  const wide = !collapsed || !settled;
  const lastWideWidth = useRef(width);
  if (!collapsed) lastWideWidth.current = width;

  const everWide = useRef(!collapsed);
  if (!collapsed) everWide.current = true;

  const sidebarTab = useSidebarTab();
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu.current !== null) menu.current.scrollTop = 0;
  }, [wide]);
  const startingSession = useRef(false);
  const [sessionPending, setSessionPending] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const beginSession = async (): Promise<void> => {
    if (startingSession.current) return;
    startingSession.current = true;
    setSessionPending(true);
    setSessionError(null);
    try {
      await startSession();
      setSidebarTab("sessions");
    } catch (cause) {
      setSessionError(`${t("session.new.label")}: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      startingSession.current = false;
      setSessionPending(false);
    }
  };
  const slotError = useWorkbenchSlotError();
  const sessionActivity = deriveSessionActivityBadge(useSyncExternalStore(
    sessionList.subscribe,
    sessionList.getSnapshot,
    sessionList.getSnapshot,
  ));
  const inspirationSnapshot = useResourceSnapshot(resources.inspiration);
  useEffect(() => { void resources.inspiration.load(false).catch(() => undefined); }, [resources.inspiration]);
  const inspirationActivity = inspirationSnapshot.data === null ? null
    : inspirationSnapshot.data.counts.needsAttention > 0
      ? { kind: "pending", label: `${contentT("inspiration.badgeAttention")} ${String(inspirationSnapshot.data.counts.needsAttention)}` }
      : inspirationSnapshot.data.counts.running > 0 || inspirationSnapshot.data.counts.queued > 0
        ? { kind: "running", label: `${contentT("inspiration.badgeRunning")} ${String(inspirationSnapshot.data.counts.running + inspirationSnapshot.data.counts.queued)}` }
        : inspirationSnapshot.data.counts.unread > 0
          ? { kind: "unread", label: `${contentT("inspiration.badgeUnread")} ${String(inspirationSnapshot.data.counts.unread)}` }
          : null;

  useEffect(() => bindSidebarLayout({ collapsed, toggle: toggleSidebar }), [collapsed, toggleSidebar]);

  const chooseTab = (tab: typeof sidebarTab): void => {
    // Community panels own their controller state; their active entry closes them.
    column.current?.querySelectorAll<HTMLButtonElement>(
      "[data-dsh-ssh-entry][data-active], [data-dsh-taskboard-entry][data-active]",
    ).forEach((entry) => { entry.click(); });
    if (tab === "hot") selectDailyHotItem(null);
    if (tab === "inspiration") setInspirationSelection(null);
    if (tab === "content") setContentSelection(null);
    if (tab === "knowledge") setKnowledgeSelection(null);
    if (tab === "projects") selectTrellisProject(null);
    setSidebarTab(tab);
  };

  const moveSidebarTab = (event: KeyboardEvent<HTMLButtonElement>, current: typeof sidebarTab): void => {
    const next = nextSidebarTab(current, event.key);
    if (next === null) return;
    event.preventDefault();
    const tabList = event.currentTarget.closest("[role=tablist]");
    chooseTab(next);
    window.requestAnimationFrame(() => {
      tabList?.querySelector<HTMLButtonElement>(`[data-sidebar-tab="${next}"]`)?.focus({ preventScroll: true });
    });
  };



  const column = useRef<HTMLDivElement>(null);
  const [pointerInside, setPointerInside] = useState(false);
  const lingerTimer = useRef<number | undefined>(undefined);

  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return;
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined;
      setPointerInside(false);
    }, SCROLLBAR_LINGER_MS);
  };

  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current);
    lingerTimer.current = undefined;
  };

  useEffect(() => {
    if (!pointerInside) return;
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom;
      if (inside) cancelLinger();
      else armLinger();
    };
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelLinger();
    };
  }, [pointerInside]);

  const [contentMounted, setContentMounted] = useState(sidebarTab === "content");
  const [hotMounted, setHotMounted] = useState(sidebarTab === "hot");
  const [inspirationMounted, setInspirationMounted] = useState(sidebarTab === "inspiration");
  const [knowledgeMounted, setKnowledgeMounted] = useState(sidebarTab === "knowledge");
  const [projectsMounted, setProjectsMounted] = useState(sidebarTab === "projects");
  useEffect(() => {
    if (sidebarTab === "content") setContentMounted(true);
    if (sidebarTab === "hot") setHotMounted(true);
    if (sidebarTab === "inspiration") setInspirationMounted(true);
    if (sidebarTab === "knowledge") setKnowledgeMounted(true);
    if (sidebarTab === "projects") setProjectsMounted(true);
  }, [sidebarTab]);

  const sessionsVisible = !wide || sidebarTab === "sessions";
  const contentVisible = wide && sidebarTab === "content";
  const hotVisible = wide && sidebarTab === "hot";
  const inspirationVisible = wide && sidebarTab === "inspiration";
  const knowledgeVisible = wide && sidebarTab === "knowledge";
  const projectsVisible = wide && sidebarTab === "projects";

  useEffect(() => {
    setSidebarChromeWidth(!wide ? 56 : collapsed ? lastWideWidth.current : width);
  }, [wide, collapsed, width]);

  return (
    <div
      ref={column}
      data-plugin="dsh-muzi-creator"
      data-surface="sidebar"
      data-sidebar-expanded={wide || undefined}
      className={cx(
        !wide && "collapsed",
        !wide && everWide.current && "railIn",
        collapsed && wide && "fading",
        !pointerInside && "quietBars",
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger();
        setPointerInside(true);
      }}
      onPointerLeave={() => { armLinger(); }}
    >
      <div className="logoRow">
        {wide && (
          <IslandButton
            type="text"
            className={cx("brandButton", "wide", "newSessionAnchor")}
            aria-label={t("session.new.label")}
            loading={sessionPending}
            onClick={() => { void beginSession(); }}
          >
            <MzBrand tagline={t("brand.tagline")} />
          </IslandButton>
        )}
        {wide && sidebarTab === "sessions" && (
          <IslandButton
            type="text"
            size="small"
            className={cx("iconButton", "topNewSession")}
            aria-label={t("session.new.label")}
            title={t("session.new.label")}
            loading={sessionPending}
            onClick={() => { void beginSession(); }}
          >
            <WorkbenchIcon name="sessions" purpose="navigation" />
          </IslandButton>
        )}
        <IslandButton
          type="text"
          className={cx("iconButton", "toggle")}
          aria-label={collapsed ? t("toggle.open") : t("toggle.collapse")}
          onClick={() => { toggleSidebar(); }}
        >
          {!wide && <span className="railBrand"><MzBrand compact /></span>}
          <span className="toggleText muziIconLabel"><WorkbenchIcon name={wide ? "sidebar-close" : "sidebar-open"} />{wide && "收起"}</span>
        </IslandButton>
      </div>

      {!wide && (
        <IslandButton
          type="text"
          className="newSession"
          aria-label={t("session.new.label")}
          title={t("session.new.label")}
          loading={sessionPending}
          onClick={() => { void beginSession(); }}
        >
          <WorkbenchIcon name="sessions" purpose="navigation" />
        </IslandButton>
      )}

      <div
        ref={menu}
        className="sidebarMenu"
        data-sidebar-menu=""
        onFocusCapture={(event) => {
          const viewport = event.currentTarget;
          const bounds = viewport.getBoundingClientRect();
          const target = event.target.getBoundingClientRect();
          if (target.top < bounds.top) viewport.scrollTop += target.top - bounds.top;
          else if (target.bottom > bounds.bottom) viewport.scrollTop += target.bottom - bounds.bottom;
        }}
      >
        {wide && (
          <div className="tabRow">
            <div className="tabList" role="tablist" aria-orientation="vertical" aria-label="Muzi Creator 导航">
              <IslandButton
                type={sidebarTab === "sessions" ? "primary" : "text"}
                role="tab"
                aria-selected={sidebarTab === "sessions"}
                tabIndex={sidebarTab === "sessions" ? 0 : -1}
                data-sidebar-tab="sessions"
                className={cx("tabButton", sidebarTab === "sessions" && "active")}
                aria-label={sessionActivity === null ? tabLabels.sessions : `${tabLabels.sessions}，${sessionActivity.label}`}
                onClick={() => { chooseTab("sessions"); }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { moveSidebarTab(event, "sessions"); }}
              >
                <span className="tabIcon" aria-hidden="true"><WorkbenchIcon name="sessions" purpose="navigation" /></span>
                <span className="tabLabel">{tabLabels.sessions}</span>
                {sessionActivity !== null && (
                  <span className={`sessionActivityBadge ${sessionActivity.kind}`} aria-hidden="true">
                    <i />
                    <span className="sessionActivityText">{sessionActivity.label}</span>
                  </span>
                )}
              </IslandButton>
              <IslandButton
                type={sidebarTab === "hot" ? "primary" : "text"}
                role="tab"
                aria-selected={sidebarTab === "hot"}
                tabIndex={sidebarTab === "hot" ? 0 : -1}
                data-sidebar-tab="hot"
                className={cx("tabButton", sidebarTab === "hot" && "active")}
                onClick={() => { chooseTab("hot"); }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { moveSidebarTab(event, "hot"); }}
              >
                <span className="tabIcon" aria-hidden="true"><WorkbenchIcon name="hotspots" purpose="navigation" /></span>
                <span className="tabLabel">{tabLabels.hot}</span>
              </IslandButton>
              <IslandButton
                type={sidebarTab === "inspiration" ? "primary" : "text"}
                role="tab"
                aria-selected={sidebarTab === "inspiration"}
                tabIndex={sidebarTab === "inspiration" ? 0 : -1}
                data-sidebar-tab="inspiration"
                className={cx("tabButton", sidebarTab === "inspiration" && "active")}
                aria-label={inspirationActivity === null ? tabLabels.inspiration : `${tabLabels.inspiration}，${inspirationActivity.label}`}
                onClick={() => { chooseTab("inspiration"); }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { moveSidebarTab(event, "inspiration"); }}
              >
                <span className="tabIcon" aria-hidden="true"><WorkbenchIcon name="inspiration" purpose="navigation" /></span>
                <span className="tabLabel">{tabLabels.inspiration}</span>
                {inspirationActivity !== null && (
                  <span className={`sessionActivityBadge ${inspirationActivity.kind}`} aria-hidden="true">
                    <i />
                    <span className="sessionActivityText">{inspirationActivity.label}</span>
                  </span>
                )}
              </IslandButton>
              <IslandButton
                type={sidebarTab === "content" ? "primary" : "text"}
                role="tab"
                aria-selected={sidebarTab === "content"}
                tabIndex={sidebarTab === "content" ? 0 : -1}
                data-sidebar-tab="content"
                className={cx("tabButton", sidebarTab === "content" && "active")}
                onClick={() => { chooseTab("content"); }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { moveSidebarTab(event, "content"); }}
              >
                <span className="tabIcon" aria-hidden="true"><WorkbenchIcon name="content" purpose="navigation" /></span>
                <span className="tabLabel">{tabLabels.content}</span>
              </IslandButton>
              <IslandButton
                type={sidebarTab === "knowledge" ? "primary" : "text"}
                role="tab"
                aria-selected={sidebarTab === "knowledge"}
                tabIndex={sidebarTab === "knowledge" ? 0 : -1}
                data-sidebar-tab="knowledge"
                className={cx("tabButton", sidebarTab === "knowledge" && "active")}
                onClick={() => { chooseTab("knowledge"); }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { moveSidebarTab(event, "knowledge"); }}
              >
                <span className="tabIcon" aria-hidden="true"><WorkbenchIcon name="knowledge" purpose="navigation" /></span>
                <span className="tabLabel">{tabLabels.knowledge}</span>
              </IslandButton>
              <IslandButton
                type={sidebarTab === "projects" ? "primary" : "text"}
                role="tab"
                aria-selected={sidebarTab === "projects"}
                tabIndex={sidebarTab === "projects" ? 0 : -1}
                data-sidebar-tab="projects"
                className={cx("tabButton", sidebarTab === "projects" && "active")}
                onClick={() => { chooseTab("projects"); }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { moveSidebarTab(event, "projects"); }}
              >
                <span className="tabIcon" aria-hidden="true"><WorkbenchIcon name="projects" purpose="navigation" /></span>
                <span className="tabLabel">{tabLabels.projects}</span>
              </IslandButton>
            </div>
          </div>
        )}

        <div className="communityNavigation" data-sidebar-community-entries="" />
      </div>

      <div className="regionArea">
        {slotError !== null && sidebarTab !== "sessions" && <div className="workbenchSlotError" role="alert">中央工作台未能接管当前区域，已保留官方会话界面。{slotError}</div>}
        <div className={cx("regionPane", !sessionsVisible && "hidden")}>
          <div className="sessionBrowser" data-surface="session-browser">
            {renderSlot("sidebar.workspaces", {
              wide,
              expandSidebar: () => { if (collapsed) toggleSidebar(); },
            })}
          </div>
        </div>
        {hotMounted && (
          <div className={cx("regionPane", !hotVisible && "hidden")}>
            <DailyHotPanel face={hotFace} t={contentT} resource={resources.hot} />
          </div>
        )}
        {inspirationMounted && (
          <div className={cx("regionPane", !inspirationVisible && "hidden")}>
            <InspirationSidebarPanel face={inspirationFace}
              resource={resources.inspiration}
              t={(key) => contentT(key as CreatorKey | InspirationCopyKey)}
            />
          </div>
        )}
        {contentMounted && (
          <div className={cx("regionPane", !contentVisible && "hidden")}>
            <MuziContentPanel t={(key) => contentT(key as CreatorKey)} face={muziFace} resource={resources.content} />
          </div>
        )}
        {knowledgeMounted && (
          <div className={cx("regionPane", !knowledgeVisible && "hidden")}>
            <KnowledgePanel face={muziFace} />
          </div>
        )}
        {projectsMounted && (
          <div className={cx("regionPane", !projectsVisible && "hidden")}>
            <TrellisProjectPanel face={trellisFace} t={contentT} resource={resources.projects} />
          </div>
        )}
      </div>

      {sessionError !== null && <div className="workbenchSlotError" role="alert" title={sessionError}>{sessionError}</div>}
      <div className="footArea">
        <div className="footerActions">
          {renderSlot("sidebar.footer.action", { wide })}
        </div>
        <div className="settingsArea">
          {renderSlot("sidebar.settings", { wide })}
        </div>
      </div>
    </div>
  );
}
