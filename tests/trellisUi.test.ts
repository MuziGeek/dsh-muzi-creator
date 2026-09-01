import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  archivePreviewCanExecute,
  filterTasksByPriority,
  nextSidebarTab,
  previewTrellisTasks,
  projectMatchesQuery,
  SIDEBAR_TABS,
  taskIsOutsidePreview,
  taskPhaseSummary,
} from "../src/client/trellisUiModel.ts";
import type {
  TrellisArchivePreview,
  TrellisProjectSummary,
  TrellisTask,
} from "../src/trellisTypes.ts";

const project = {
  projectId: "trellis-project-1",
  title: "DeepSeek Harness",
  rootPath: "D:\\Muzi\\DSH",
  status: "ready",
  statusMessage: "ready",
  counts: null,
  issues: [],
} as unknown as TrellisProjectSummary;

function task(priority: string | null): TrellisTask {
  return {
    key: `task-${priority ?? "none"}`,
    directory: "task",
    id: "task",
    name: "task",
    title: "Task",
    description: "",
    status: "planning",
    currentPhase: null,
    phaseActions: [],
    rawStatus: "planning",
    priority,
    creator: null,
    assignee: null,
    createdAt: null,
    completedAt: null,
    branch: null,
    baseBranch: null,
    commit: null,
    prUrl: null,
    parent: null,
    children: [],
    relatedFiles: [],
    notes: "",
    archived: false,
    archiveMonth: null,
    evidence: { state: "missing", files: [], message: "missing" },
    verifiedCompletion: false,
    unknownFields: [],
    issues: [],
  } as unknown as TrellisTask;
}

function preview(token: string | null, blockers: string[] = []): TrellisArchivePreview {
  return {
    token,
    expiresAt: token === null ? null : "2026-08-24T00:02:00.000Z",
    projectId: "trellis-project-1",
    task: task("P1"),
    targetMonth: "2026-08",
    destination: "D:\\Muzi\\DSH\\.trellis\\tasks\\archive\\2026-08\\task",
    evidence: { state: "meaningful", files: ["validation.md"], message: "ready" },
    git: { dirty: false, count: 0, sample: [] },
    activeChildren: [],
    warnings: [],
    blockers,
  } as unknown as TrellisArchivePreview;
}

describe("Trellis project UI behavior", () => {
  it("places Hot second and Projects fifth with roving keyboard navigation", () => {
    expect(SIDEBAR_TABS).toEqual(["sessions", "hot", "content", "knowledge", "projects"]);
    expect(nextSidebarTab("knowledge", "ArrowDown")).toBe("projects");
    expect(nextSidebarTab("projects", "ArrowDown")).toBe("sessions");
    expect(nextSidebarTab("sessions", "ArrowDown")).toBe("hot");
    expect(nextSidebarTab("hot", "ArrowDown")).toBe("content");
    expect(nextSidebarTab("sessions", "End")).toBe("projects");
    expect(nextSidebarTab("projects", "Home")).toBe("sessions");
    expect(nextSidebarTab("projects", "Enter")).toBeNull();
  });

  it("filters projects by title or path and tasks by exact priority", () => {
    expect(projectMatchesQuery(project, "harness")).toBe(true);
    expect(projectMatchesQuery(project, "muzi\\dsh")).toBe(true);
    expect(projectMatchesQuery(project, "creator studio")).toBe(false);
    expect(filterTasksByPriority([task("P0"), task("P2"), task(null)], "P2")).toHaveLength(1);
    expect(filterTasksByPriority([task("P0"), task("P2")], "all")).toHaveLength(2);
  });

  it("previews each task group without changing the filtered order", () => {
    const tasks: TrellisTask[] = Array.from({ length: 8 }, (_, index) => ({
      ...task(index % 2 === 0 ? "P1" : "P2"),
      key: `task-${String(index)}` as TrellisTask["key"],
      title: `Task ${String(index)}`,
    }));
    expect(previewTrellisTasks([], false)).toEqual({ visible: [], remaining: 0 });
    expect(previewTrellisTasks(tasks.slice(0, 5), false)).toEqual({ visible: tasks.slice(0, 5), remaining: 0 });
    expect(previewTrellisTasks(tasks.slice(0, 6), false)).toEqual({ visible: tasks.slice(0, 5), remaining: 1 });
    expect(previewTrellisTasks(tasks, false)).toEqual({ visible: tasks.slice(0, 5), remaining: 3 });
    expect(previewTrellisTasks(tasks, true)).toEqual({ visible: tasks, remaining: 3 });
    expect(taskIsOutsidePreview(tasks.slice(0, 5), tasks[4]?.key ?? null)).toBe(false);
    expect(taskIsOutsidePreview(tasks, tasks[5]?.key ?? null)).toBe(true);
    expect(taskIsOutsidePreview(tasks, null)).toBe(false);

    const filtered = filterTasksByPriority(tasks, "P2");
    expect(previewTrellisTasks(filtered, false).visible.map((item) => item.title)).toEqual(["Task 1", "Task 3", "Task 5", "Task 7"]);
  });

  it("summarizes current and next Trellis phases without inventing completion", () => {
    const phases = [
      { phase: 1, action: "brainstorm" },
      { phase: 2, action: "research" },
      { phase: 3, action: "implement" },
      { phase: 4, action: "check" },
      { phase: 5, action: "update-spec" },
      { phase: 6, action: "record-session" },
    ];
    expect(taskPhaseSummary({ currentPhase: 0, phaseActions: phases })).toEqual({ current: "待开始 · 0/6", next: "1/6 · 需求梳理" });
    expect(taskPhaseSummary({ currentPhase: 4, phaseActions: phases })).toEqual({ current: "4/6 · 检查", next: "5/6 · 更新规范" });
    expect(taskPhaseSummary({ currentPhase: 6, phaseActions: phases })).toEqual({ current: "6/6 · 记录会话", next: "—" });
    expect(taskPhaseSummary({ currentPhase: 6, phaseActions: [] })).toEqual({ current: "阶段 6", next: "—" });
    expect(taskPhaseSummary({ currentPhase: 1, phaseActions: [{ phase: 1, action: "custom-action" }] })).toEqual({ current: "1/1 · custom-action", next: "—" });
    expect(taskPhaseSummary({ currentPhase: null, phaseActions: phases })).toBeNull();
  });

  it("keeps archive execution disabled until a blocker-free one-time token exists", () => {
    expect(archivePreviewCanExecute(preview(null), false)).toBe(false);
    expect(archivePreviewCanExecute(preview("signed-token", ["active child"]), false)).toBe(false);
    expect(archivePreviewCanExecute(preview("signed-token"), true)).toBe(false);
    expect(archivePreviewCanExecute(preview("signed-token"), false)).toBe(true);
  });

  it("includes full-width details with Animal modal and controlled priority selection", async () => {
    const [css, inspector] = await Promise.all([
      readFile(new URL("../src/client/TrellisProjectInspector.css", import.meta.url), "utf8"),
      readFile(new URL("../src/client/TrellisProjectInspector.tsx", import.meta.url), "utf8"),
    ]);
    expect(css).toContain("@media (max-width: 880px)");
    expect(css).toContain("width: 100% !important");
    expect(inspector).toContain("IslandModal");
    expect(inspector).toContain("maskClosable={!busy}");
    expect(inspector).toContain("typewriter={false}");
    expect(inspector).toContain("if (!busy) onCancel()");
    expect(inspector).toContain("aria-expanded={expanded}");
    expect(inspector).toContain("aria-controls={rowsId}");
    expect(inspector).toContain("taskIsOutsidePreview");
    expect(inspector).toContain("IslandSelect");
    expect(inspector).toContain("value={priority}");
    expect(inspector).toContain("options={priorityItems}");
    expect(inspector).toContain("archivePreviewCanExecute(preview, busy)");
    expect(inspector).not.toContain("Menu,");
    expect(inspector).not.toContain("<dialog");
    expect(inspector).not.toContain("<select");
    expect(css).toContain('.trellisPriorityField [role="combobox"]');
    expect(css).toContain(".trellisArchiveModal");
    const fontSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number.parseInt(match[1] ?? "0", 10));
    expect(fontSizes.length).toBeGreaterThan(0);
    expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(11);
  });
});
