import { useState } from "react";
import * as primitives from "@deepseek-ai/dsh-client-ui-primitives";
import { BUNDLED_ICONS } from "../appearance/icons.ts";
import type { WorkbenchIconName } from "./workbenchIconNames.ts";
import "./WorkbenchIcon.css";

export type { WorkbenchIconName } from "./workbenchIconNames.ts";

/** Layout intent; dimensions and typography belong to the workbench appearance. */
export type WorkbenchIconPurpose = "navigation" | "action" | "heading" | "empty" | "compact";

const HOST_GLYPHS = {
  refresh: primitives.IconRefreshOutline16, copy: primitives.IconCopyOutline16,
  clear: primitives.IconTrashOutline16, back: primitives.IconChevronLeftOutline14,
  "sidebar-open": primitives.IconPanelLeftOutline16, "sidebar-close": primitives.IconPanelLeftOutline16,
  "fit-view": primitives.IconFullscreenOutline16, "folder-open": primitives.IconFolderOpenOutline16,
  "external-link": primitives.IconRightUpOutline16, add: primitives.IconPlusOutline16,
  stop: primitives.IconStopFill16, verify: primitives.IconCheckOutline16,
  sessions: primitives.IconNewChatOutline16, inspiration: primitives.IconLightOutline16,
  content: primitives.IconListPenOutline16, projects: primitives.IconFolderOpenOutline16,
  search: primitives.IconSearchOutline16, sources: primitives.IconGlobeOutline14,
  tasks: primitives.IconChecklistOutline14, video: primitives.IconPlayOutline16,
  publishing: primitives.IconSendOutline16, archive: primitives.IconArchiveOutline20,
  settings: primitives.IconSettingsOutline16,
} as const;

const LOCAL_PATHS = {
  "view-options": "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
  remove: "M5 12h14",
  connect: "M8 5v5M12 5v5M6 10h8v3a4 4 0 0 1-8 0v-3ZM10 17v3h8v-5",
  disconnect: "M7 3v4M11 3v4M5 7h8v3a4 4 0 0 1-8 0V7ZM9 14v3M16 14v7M20 14v7M15 12l7 7",
  hotspots: "M13 3c1 5-3 5-2 9 2-1 3-3 3-4 4 3 6 8 2 12-2 2-7 2-9-1-4-5 1-8 2-12 0 3 1 4 2 4 1-2 2-5 2-8Z",
  knowledge: "M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15",
  "knowledge-graph": "M9 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm12 1a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm-6 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM9 6h6M7 9l3 7M17 10l-4 6",
  covers: "M3 4h18v16H3V4Zm0 12 5-5 4 4 3-3 6 6M15 8h.01",
  calendar: "M4 5h16v16H4V5Zm0 5h16M8 2v6M16 2v6M8 14h2M14 14h2M8 18h2M14 18h2",
} satisfies Record<Exclude<WorkbenchIconName, keyof typeof HOST_GLYPHS>, string>;

function WorkbenchGlyph({ name }: { name: WorkbenchIconName }) {
  if (name in HOST_GLYPHS) {
    const Glyph = HOST_GLYPHS[name as keyof typeof HOST_GLYPHS];
    return <Glyph size={24} />;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d={LOCAL_PATHS[name as keyof typeof LOCAL_PATHS]} /></svg>;
}

/** Decorative artwork; its containing control owns the accessible name and interaction. */
export function WorkbenchIcon({ name, purpose = "action" }: { name: WorkbenchIconName; purpose?: WorkbenchIconPurpose }) {
  const [failed, setFailed] = useState<string>();
  const src = purpose === "compact" ? undefined : BUNDLED_ICONS[name];
  return <span className="muziWorkbenchIcon" data-workbench-icon={name} data-icon-purpose={purpose} aria-hidden="true">
    {src !== undefined && src !== failed
      ? <img src={src} alt="" draggable={false} onError={() => setFailed(src)} />
      : <WorkbenchGlyph name={name} />}
  </span>;
}
