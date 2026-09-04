import type { TrellisArchivePreview, TrellisProjectSummary, TrellisTask } from "../trellisTypes.ts";

export const SIDEBAR_TABS = ["sessions", "hot", "inspiration", "content", "knowledge", "projects"] as const;

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

export interface TrellisTaskPhaseSummary {
  current: string;
  next: string;
}

const PHASE_ACTION_LABELS: Readonly<Record<string, string>> = {
  brainstorm: "需求梳理",
  research: "调研",
  implement: "实现",
  check: "检查",
  "update-spec": "更新规范",
  "record-session": "记录会话",
};

function phaseActionLabel(action: string): string {
  return PHASE_ACTION_LABELS[action] ?? action;
}

export function taskPhaseSummary(task: Pick<TrellisTask, "currentPhase" | "phaseActions">): TrellisTaskPhaseSummary | null {
  const currentPhase = task.currentPhase;
  if (currentPhase === null) return null;
  const total = task.phaseActions.length;
  const currentAction = task.phaseActions.find((entry) => entry.phase === currentPhase);
  const nextAction = task.phaseActions.find((entry) => entry.phase > currentPhase);
  const current = currentAction !== undefined
    ? `${String(currentPhase)}/${String(total)} · ${phaseActionLabel(currentAction.action)}`
    : currentPhase === 0 && total > 0
      ? `待开始 · 0/${String(total)}`
      : `阶段 ${String(currentPhase)}`;
  const next = nextAction === undefined
    ? "—"
    : `${String(nextAction.phase)}/${String(total)} · ${phaseActionLabel(nextAction.action)}`;
  return { current, next };
}

export function archivePreviewCanExecute(preview: TrellisArchivePreview, busy: boolean): boolean {
  return !busy && preview.token !== null && preview.blockers.length === 0;
}
