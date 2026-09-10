/** Stable meanings shared by the component and the optional skin asset map. */
export const WORKBENCH_ICON_NAMES = [
  "refresh", "view-options", "copy", "clear", "back", "sidebar-open", "sidebar-close",
  "fit-view", "folder-open", "external-link", "add", "remove", "stop", "connect",
  "disconnect", "verify", "sessions", "hotspots", "inspiration", "content", "knowledge",
  "projects", "search", "sources", "knowledge-graph", "tasks", "video", "covers",
  "publishing", "calendar", "archive", "settings",
] as const;

/** A functional meaning, independent of the selected artwork. */
export type WorkbenchIconName = typeof WORKBENCH_ICON_NAMES[number];
