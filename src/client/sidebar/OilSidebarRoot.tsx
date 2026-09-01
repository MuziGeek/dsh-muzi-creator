import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { selectDailyHotItem } from "../dailyHotSelection.ts";
import type { CreatorViewFace, DailyHotViewFace, MuziViewFace, TrellisViewFace } from "../face.ts";
import type { CreatorKey } from "../locales.ts";
import {
  setSidebarChromeWidth,
  setSelectedContentId,
  setSidebarTab,
  useSidebarTab,
} from "../contentSelection.ts";
import { selectTrellisProject } from "../trellisSelection.ts";
import { IslandButton, IslandIcon } from "../ui/IslandControls.tsx";
import { nextSidebarTab, SIDEBAR_TABS } from "../trellisUiModel.ts";
import { KnowledgePanel } from "./KnowledgePanel.tsx";
import { DailyHotPanel } from "./DailyHotPanel.tsx";
import { MuziContentPanel } from "./MuziContentPanel.tsx";
import { TrellisProjectPanel } from "./TrellisProjectPanel.tsx";
import { OilBrand } from "./OilBrand.tsx";
import type { OilSidebarSlotProps } from "./slots.ts";
import "./OilSidebarRoot.css";

const COLLAPSE_SETTLE_MS = 150;
const SCROLLBAR_LINGER_MS = 2000;
function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}

export type OilSidebarRootProps =
  & OilSidebarSlotProps
  & {
    tabLabels: { sessions: string; hot: string; content: string; knowledge: string; projects: string };
    contentFace: CreatorViewFace;
    hotFace: DailyHotViewFace;
    muziFace: MuziViewFace;
    trellisFace: TrellisViewFace;
    contentT: (key: CreatorKey) => string;
  };

export function OilSidebarRoot({
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
  trellisFace,
  contentT,
}: OilSidebarRootProps) {
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

  const chooseTab = (tab: typeof sidebarTab): void => {
    if (tab === "hot" || tab === "knowledge" || tab === "projects") setSelectedContentId(null);
    if (tab !== "projects") selectTrellisProject(null);
    if (tab !== "hot") selectDailyHotItem(null);
    setSidebarTab(tab);
  };

  const moveSidebarTab = (event: KeyboardEvent<HTMLButtonElement>, current: typeof sidebarTab): void => {
    const next = nextSidebarTab(current, event.key);
    if (next === null) return;
    event.preventDefault();
    const tabList = event.currentTarget.closest("[role=tablist]");
    chooseTab(next);
    window.requestAnimationFrame(() => {
      tabList?.querySelector<HTMLButtonElement>(`[data-sidebar-tab="${next}"]`)?.focus();
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
  const [knowledgeMounted, setKnowledgeMounted] = useState(sidebarTab === "knowledge");
  const [projectsMounted, setProjectsMounted] = useState(sidebarTab === "projects");
  useEffect(() => {
    if (sidebarTab === "content") setContentMounted(true);
    if (sidebarTab === "hot") setHotMounted(true);
    if (sidebarTab === "knowledge") setKnowledgeMounted(true);
    if (sidebarTab === "projects") setProjectsMounted(true);
  }, [sidebarTab]);

  const sessionsVisible = !wide || sidebarTab === "sessions";
  const contentVisible = wide && sidebarTab === "content";
  const hotVisible = wide && sidebarTab === "hot";
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
            className={cx("brandButton", "wide")}
            aria-label={t("session.new.label")}
            onClick={() => { startSession(); }}
          >
            <OilBrand tagline={t("brand.tagline")} />
          </IslandButton>
        )}
        <IslandButton
          type="text"
          className={cx("iconButton", "toggle")}
          aria-label={collapsed ? t("toggle.open") : t("toggle.collapse")}
          onClick={() => { toggleSidebar(); }}
        >
          {!wide && <span className="railBrand"><OilBrand compact /></span>}
          <span className="toggleText">{wide ? "收起" : "展开"}</span>
        </IslandButton>
      </div>

      {!wide && (
        <IslandButton
          type="text"
          className="newSession"
          aria-label={t("session.new.label")}
          onClick={() => { startSession(); }}
        >
          <IslandIcon name="icon-chat" size={20} />
        </IslandButton>
      )}

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
              onClick={() => { chooseTab("sessions"); }}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { moveSidebarTab(event, "sessions"); }}
            >
              <IslandIcon name="icon-chat" size={18} />
              {tabLabels.sessions}
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
              <IslandIcon name="icon-miles" size={18} />
              {tabLabels.hot}
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
              <IslandIcon name="icon-diy" size={18} />
              {tabLabels.content}
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
              <IslandIcon name="icon-critterpedia" size={18} />
              {tabLabels.knowledge}
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
              <IslandIcon name="icon-map" size={18} />
              {tabLabels.projects}
            </IslandButton>
          </div>
        </div>
      )}

      <div className="regionArea">
        <div className={cx("regionPane", !sessionsVisible && "hidden")}>
          {wide && (
            <div className="headerNewSession">
              <IslandButton
                type="text"
                size="small"
                className="iconButton"
                aria-label={t("session.new.label")}
                onClick={() => { startSession(); }}
              >
                <IslandIcon name="icon-chat" size={18} />
              </IslandButton>
            </div>
          )}
          {renderSlot("sidebar.workspaces", {
            wide,
            expandSidebar: () => { if (collapsed) toggleSidebar(); },
          })}
        </div>
        {hotMounted && (
          <div className={cx("regionPane", !hotVisible && "hidden")}>
            <DailyHotPanel face={hotFace} t={contentT} />
          </div>
        )}
        {contentMounted && (
          <div className={cx("regionPane", !contentVisible && "hidden")}>
            <MuziContentPanel face={muziFace} />
          </div>
        )}
        {knowledgeMounted && (
          <div className={cx("regionPane", !knowledgeVisible && "hidden")}>
            <KnowledgePanel
              face={muziFace}
              onAddDirectory={() => {
                chooseTab("sessions");
                startSession();
              }}
            />
          </div>
        )}
        {projectsMounted && (
          <div className={cx("regionPane", !projectsVisible && "hidden")}>
            <TrellisProjectPanel face={trellisFace} t={contentT} />
          </div>
        )}
      </div>

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
