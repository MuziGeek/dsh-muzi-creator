import type { TrellisArchivePreview, TrellisProjectSummary, TrellisTask } from "../trellisTypes.ts";

export const SIDEBAR_TABS = ["sessions", "content", "knowledge", "projects"] as const;

export function nextSidebarTab(
  current: (typeof SIDEBAR_TABS)[number],
  key: string,
): (typeof SIDEBAR_TABS)[number] | null {
  const currentIndex = SIDEBAR_TABS.indexOf(current);
  const nextIndex = key === "Home"
    ? 0
    : key === "End"
      ? SIDEBAR_TABS.length - 1
      : key === "ArrowDown" || key === "ArrowRight"
        ? (currentIndex + 1) % SIDEBAR_TABS.length
        : key === "ArrowUp" || key === "ArrowLeft"
          ? (currentIndex - 1 + SIDEBAR_TABS.length) % SIDEBAR_TABS.length
          : -1;
  return nextIndex < 0 ? null : SIDEBAR_TABS[nextIndex] ?? null;
}

export function projectMatchesQuery(project: TrellisProjectSummary, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle === "" || `${project.title}\n${project.rootPath ?? ""}`.toLocaleLowerCase().includes(needle);
}

export function filterTasksByPriority(tasks: TrellisTask[], priority: string): TrellisTask[] {
  return priority === "all" ? tasks : tasks.filter((task) => task.priority === priority);
}

export function archivePreviewCanExecute(preview: TrellisArchivePreview, busy: boolean): boolean {
  return !busy && preview.token !== null && preview.blockers.length === 0;
}
