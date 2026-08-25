import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  archivePreviewCanExecute,
  filterTasksByPriority,
  nextSidebarTab,
  projectMatchesQuery,
  SIDEBAR_TABS,
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
  it("places Projects fourth and supports roving keyboard navigation", () => {
    expect(SIDEBAR_TABS).toEqual(["sessions", "content", "knowledge", "projects"]);
    expect(nextSidebarTab("knowledge", "ArrowDown")).toBe("projects");
    expect(nextSidebarTab("projects", "ArrowDown")).toBe("sessions");
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

  it("keeps archive execution disabled until a blocker-free one-time token exists", () => {
    expect(archivePreviewCanExecute(preview(null), false)).toBe(false);
    expect(archivePreviewCanExecute(preview("signed-token", ["active child"]), false)).toBe(false);
    expect(archivePreviewCanExecute(preview("signed-token"), true)).toBe(false);
    expect(archivePreviewCanExecute(preview("signed-token"), false)).toBe(true);
  });

  it("includes full-width narrow-screen details and modal cancellation handling", async () => {
    const [css, inspector] = await Promise.all([
      readFile(new URL("../src/client/TrellisProjectInspector.css", import.meta.url), "utf8"),
      readFile(new URL("../src/client/TrellisProjectInspector.tsx", import.meta.url), "utf8"),
    ]);
    expect(css).toContain("@media (max-width: 880px)");
    expect(css).toContain("width: 100% !important");
    expect(inspector).toContain("onCancel={(event)");
    expect(inspector).toContain("if (!busy) onCancel()");
  });
});
