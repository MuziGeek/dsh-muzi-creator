import refresh from "../assets/workbench-icons/refresh.png";
import view_options from "../assets/workbench-icons/view-options.png";
import copy from "../assets/workbench-icons/copy.png";
import clear from "../assets/workbench-icons/clear.png";
import back from "../assets/workbench-icons/back.png";
import sidebar_open from "../assets/workbench-icons/sidebar-open.png";
import sidebar_close from "../assets/workbench-icons/sidebar-close.png";
import fit_view from "../assets/workbench-icons/fit-view.png";
import folder_open from "../assets/workbench-icons/folder-open.png";
import external_link from "../assets/workbench-icons/external-link.png";
import add from "../assets/workbench-icons/add.png";
import remove from "../assets/workbench-icons/remove.png";
import stop from "../assets/workbench-icons/stop.png";
import connect from "../assets/workbench-icons/connect.png";
import disconnect from "../assets/workbench-icons/disconnect.png";
import verify from "../assets/workbench-icons/verify.png";
import sessions from "../assets/workbench-icons/sessions.png";
import hotspots from "../assets/workbench-icons/hotspots.png";
import inspiration from "../assets/workbench-icons/inspiration.png";
import content from "../assets/workbench-icons/content.png";
import knowledge from "../assets/workbench-icons/knowledge.png";
import projects from "../assets/workbench-icons/projects.png";
import search from "../assets/workbench-icons/search.png";
import sources from "../assets/workbench-icons/sources.png";
import knowledge_graph from "../assets/workbench-icons/knowledge-graph.png";
import tasks from "../assets/workbench-icons/tasks.png";
import video from "../assets/workbench-icons/video.png";
import covers from "../assets/workbench-icons/covers.png";
import publishing from "../assets/workbench-icons/publishing.png";
import calendar from "../assets/workbench-icons/calendar.png";
import archive from "../assets/workbench-icons/archive.png";
import settings from "../assets/workbench-icons/settings.png";
import "./WorkbenchIcon.css";

/** Generated Animal Island assets embedded in the distributable client bundle. */
export const WORKBENCH_ICONS = {
  "refresh": refresh,
  "view-options": view_options,
  "copy": copy,
  "clear": clear,
  "back": back,
  "sidebar-open": sidebar_open,
  "sidebar-close": sidebar_close,
  "fit-view": fit_view,
  "folder-open": folder_open,
  "external-link": external_link,
  "add": add,
  "remove": remove,
  "stop": stop,
  "connect": connect,
  "disconnect": disconnect,
  "verify": verify,
  "sessions": sessions,
  "hotspots": hotspots,
  "inspiration": inspiration,
  "content": content,
  "knowledge": knowledge,
  "projects": projects,
  "search": search,
  "sources": sources,
  "knowledge-graph": knowledge_graph,
  "tasks": tasks,
  "video": video,
  "covers": covers,
  "publishing": publishing,
  "calendar": calendar,
  "archive": archive,
  "settings": settings,
} as const;

/** Semantic names shared by navigation, feature headings and related actions. */
export type WorkbenchIconName = keyof typeof WORKBENCH_ICONS;

/** Decorative image; the containing control or heading owns its accessible name. */
export function WorkbenchIcon({ name, size = 24 }: { name: WorkbenchIconName; size?: number }) {
  return <img className="muziWorkbenchIcon" data-workbench-icon={name} src={WORKBENCH_ICONS[name]} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
