import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { TrellisConfig } from "../src/config.ts";
import { pathIsInside, scanTrellisProject, trellisScanInternals } from "../src/trellisScan.ts";
import type { TrellisProjectId } from "../src/trellisTypes.ts";

const config: TrellisConfig = {
  trellisProjectsRoot: "D:\\GitProject",
  trellisGitExecutable: "git",
  trellisPythonExecutable: "python",
  trellisPythonArgs: [],
  trellisMaxTaskBytes: 262144,
  trellisMaxTasks: 100,
  trellisWatchDebounceMs: 20,
  trellisFallbackPollMs: 60000,
  trellisArchivePreviewTtlMs: 120000,
  trellisCommandTimeoutMs: 30000,
  trellisProcessGraceMs: 100,
  trellisOutputMaxBytes: 65536,
};

function project(path: string) {
  return {
    id: "trellis_fixture" as TrellisProjectId,
    path,
    title: "Fixture project",
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "muzi-trellis-scan-"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".trellis", "tasks", "archive"), { recursive: true });
  return root;
}

async function task(
  root: string,
  directory: string,
  data: Record<string, unknown>,
  month?: string,
): Promise<string> {
  const base = month === undefined
    ? join(root, ".trellis", "tasks", directory)
    : join(root, ".trellis", "tasks", "archive", month, directory);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, "task.json"), `${JSON.stringify(data, null, 2)}\n`);
  return base;
}

describe("scanTrellisProject", () => {
  it("classifies active and archived tasks without inventing a completion percentage", async () => {
    const root = await fixture();
    await task(root, "01-plan", { id: "plan", title: "Plan", status: "planning", priority: "P2" });
    await task(root, "02-work", { id: "work", title: "Work", status: "in_progress", assignee: "Muzi" });
    await task(root, "03-review", { id: "review", title: "Review", status: "review", customFlag: true });
    const archived = await task(root, "00-done", {
      id: "done",
      title: "Done",
      status: "completed",
      completedAt: "2026-08-24",
    }, "2026-08");
    await writeFile(join(archived, "validation.md"), "# Validation\n\n- `pnpm test` passed with 42 focused checks.\n");

    const result = await scanTrellisProject(project(root), config);

    expect(result.detail.project.status).toBe("ready");
    expect(result.detail.project.counts).toEqual({
      planning: 1,
      inProgress: 1,
      completed: 0,
      unknown: 1,
      archived: 1,
      verifiedArchived: 1,
      invalid: 0,
    });
    expect(result.detail.activeTasks.find((entry) => entry.id === "review")).toMatchObject({
      status: "unknown",
      rawStatus: "review",
      unknownFields: ["customFlag"],
    });
    expect(result.detail.archivedTasks[0]).toMatchObject({ verifiedCompletion: true });
    expect(result.detail.project).not.toHaveProperty("progress");
  });

  it("reports corrupt tasks as degraded instead of converting the project to zero progress", async () => {
    const root = await fixture();
    await task(root, "01-good", { id: "good", title: "Good", status: "in_progress" });
    const bad = join(root, ".trellis", "tasks", "02-bad");
    await mkdir(bad);
    await writeFile(join(bad, "task.json"), "{not-json\n");

    const result = await scanTrellisProject(project(root), config);

    expect(result.detail.project.status).toBe("degraded");
    expect(result.detail.project.counts).toMatchObject({ inProgress: 1, invalid: 1 });
    expect(result.detail.project.issues[0]).toContain("02-bad");
  });

  it("marks parent-child cycles without recursively hiding either task", async () => {
    const root = await fixture();
    await task(root, "01-a", { id: "a", title: "A", status: "planning", children: ["02-b"] });
    await task(root, "02-b", { id: "b", title: "B", status: "planning", children: ["01-a"] });

    const result = await scanTrellisProject(project(root), config);

    expect(result.detail.activeTasks).toHaveLength(2);
    expect(result.detail.activeTasks.every((entry) => entry.issues.includes("父子任务关系存在循环"))).toBe(true);
  });

  it("requires the selected path itself to be a Git root", async () => {
    const root = await fixture();
    const nested = join(root, "nested");
    await mkdir(join(nested, ".trellis", "tasks"), { recursive: true });

    const result = await scanTrellisProject(project(nested), config);

    expect(result.detail.project.status).toBe("not-git-root");
    expect(result.detail.project.counts).toBeNull();
  });

  it("rejects a linked Trellis task root instead of following it outside the project", async () => {
    const root = await mkdtemp(join(tmpdir(), "muzi-trellis-link-root-"));
    const outside = await mkdtemp(join(tmpdir(), "muzi-trellis-link-outside-"));
    await mkdir(join(root, ".git"));
    await mkdir(join(root, ".trellis"));
    await mkdir(join(outside, "tasks"));
    try {
      await symlink(join(outside, "tasks"), join(root, ".trellis", "tasks"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    const result = await scanTrellisProject(project(root), config);

    expect(result.detail.project.status).toBe("invalid");
    expect(result.detail.project.statusMessage).toMatch(/链接|逃逸/);
  });
});

describe("Trellis scan safety helpers", () => {
  it("keeps path containment segment-aware", () => {
    expect(pathIsInside("C:\\project", "C:\\project\\.trellis\\tasks")).toBe(true);
    expect(pathIsInside("C:\\project", "C:\\project-escape\\task.json")).toBe(false);
  });

  it("does not treat placeholder validation text as evidence", () => {
    expect(trellisScanInternals.nonPlaceholderText("# Validation\n\nTBD")).toBe(false);
    expect(trellisScanInternals.nonPlaceholderText("# Validation\n\npnpm test passed for the archive integration fixture.")).toBe(true);
  });
});
