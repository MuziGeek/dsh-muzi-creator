import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  IconBrowseOutline16,
  IconFolderClose16,
  IconNewChatOutline16,
  IconPanelLeftOutline16,
  IconProjectAddOutline16,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";

import type { CreatorViewFace, MuziViewFace, TrellisViewFace } from "../face.ts";
import type { CreatorKey } from "../locales.ts";
import {
  setSidebarChromeWidth,
  setSelectedContentId,
  setSidebarTab,
  useSidebarTab,
} from "../contentSelection.ts";
import { selectTrellisProject } from "../trellisSelection.ts";
import { nextSidebarTab, SIDEBAR_TABS } from "../trellisUiModel.ts";
import { KnowledgePanel } from "./KnowledgePanel.tsx";
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
    tabLabels: { sessions: string; content: string; knowledge: string; projects: string };
    contentFace: CreatorViewFace;
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
    if (tab === "knowledge" || tab === "projects") setSelectedContentId(null);
    if (tab !== "projects") selectTrellisProject(null);
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
  const [knowledgeMounted, setKnowledgeMounted] = useState(sidebarTab === "knowledge");
  const [projectsMounted, setProjectsMounted] = useState(sidebarTab === "projects");
  useEffect(() => {
    if (sidebarTab === "content") setContentMounted(true);
    if (sidebarTab === "knowledge") setKnowledgeMounted(true);
    if (sidebarTab === "projects") setProjectsMounted(true);
  }, [sidebarTab]);

  const sessionsVisible = !wide || sidebarTab === "sessions";
  const contentVisible = wide && sidebarTab === "content";
  const knowledgeVisible = wide && sidebarTab === "knowledge";
  const projectsVisible = wide && sidebarTab === "projects";

  useEffect(() => {
    setSidebarChromeWidth(!wide ? 56 : collapsed ? lastWideWidth.current : width);
  }, [wide, collapsed, width]);

  return (
    <div
      ref={column}
      data-plugin="dsh-oil-creator"
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
          <button
            type="button"
            className={cx("brandButton", "wide")}
            aria-label={t("session.new.label")}
            onClick={() => { startSession(); }}
          >
            <OilBrand />
          </button>
        )}
        <Tooltip label={collapsed ? t("toggle.open") : t("toggle.collapse")} delayMs={500}>
          <button
            type="button"
            className={cx("iconButton", "toggle")}
            aria-label={collapsed ? t("toggle.open") : t("toggle.collapse")}
            onClick={() => { toggleSidebar(); }}
          >
            {!wide && (
              <span className="railBrand">
                <OilBrand compact />
              </span>
            )}
            <IconPanelLeftOutline16 className="panelIcon" size={wide ? 16 : 18} />
          </button>
        </Tooltip>
      </div>

      {!wide && (
        <Tooltip label={t("session.new.label")} delayMs={500}>
          <button
            type="button"
            className="newSession"
            aria-label={t("session.new.label")}
            onClick={() => { startSession(); }}
          >
            <IconNewChatOutline16 size={18} />
          </button>
        </Tooltip>
      )}

      {wide && (
        <div className="tabRow">
          <div className="tabList" role="tablist" aria-orientation="vertical" aria-label="Muzi Creator 导航">
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === "sessions"}
              tabIndex={sidebarTab === "sessions" ? 0 : -1}
              data-sidebar-tab="sessions"
              className={cx("tabButton", sidebarTab === "sessions" && "active")}
              onClick={() => { chooseTab("sessions"); }}
              onKeyDown={(event) => { moveSidebarTab(event, "sessions"); }}
            >
              <IconNewChatOutline16 size={14} />
              {tabLabels.sessions}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === "content"}
              tabIndex={sidebarTab === "content" ? 0 : -1}
              data-sidebar-tab="content"
              className={cx("tabButton", sidebarTab === "content" && "active")}
              onClick={() => { chooseTab("content"); }}
              onKeyDown={(event) => { moveSidebarTab(event, "content"); }}
            >
              <IconBrowseOutline16 size={14} />
              {tabLabels.content}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === "knowledge"}
              tabIndex={sidebarTab === "knowledge" ? 0 : -1}
              data-sidebar-tab="knowledge"
              className={cx("tabButton", sidebarTab === "knowledge" && "active")}
              onClick={() => { chooseTab("knowledge"); }}
              onKeyDown={(event) => { moveSidebarTab(event, "knowledge"); }}
            >
              <IconFolderClose16 size={14} />
              {tabLabels.knowledge}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === "projects"}
              tabIndex={sidebarTab === "projects" ? 0 : -1}
              data-sidebar-tab="projects"
              className={cx("tabButton", sidebarTab === "projects" && "active")}
              onClick={() => { chooseTab("projects"); }}
              onKeyDown={(event) => { moveSidebarTab(event, "projects"); }}
            >
              <IconProjectAddOutline16 size={14} />
              {tabLabels.projects}
            </button>
          </div>
        </div>
      )}

      <div className="regionArea">
        <div className={cx("regionPane", !sessionsVisible && "hidden")}>
          {wide && (
            <div className="headerNewSession">
              <Tooltip label={t("session.new.label")} delayMs={500}>
                <button
                  type="button"
                  className="iconButton"
                  aria-label={t("session.new.label")}
                  onClick={() => { startSession(); }}
                >
                  <IconNewChatOutline16 size={16} />
                </button>
              </Tooltip>
            </div>
          )}
          {renderSlot("sidebar.workspaces", {
            wide,
            expandSidebar: () => { if (collapsed) toggleSidebar(); },
          })}
        </div>
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
