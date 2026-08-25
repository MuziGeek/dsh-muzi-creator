import { spawn as spawnChild } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { Context } from "@deepseek-ai/cordis";
import type { SubprocessHandle, SubprocessRuntime, SubprocessSpawnSpec } from "@deepseek-ai/dsh-subprocess";
import { describe, expect, it } from "vitest";

import type { Config } from "../src/config.ts";
import { TrellisProjectService } from "../src/trellisService.ts";
import type { TrellisProjectId } from "../src/trellisTypes.ts";

const execFileAsync = promisify(execFile);

function config(projectsRoot: string, overrides: Partial<Config> = {}): Config {
  return {
    libraryRoot: "",
    creatorRoot: "",
    atlasRoot: "",
    dataDir: "",
    subtitleSkillDir: "",
    coverSkillDir: "",
    previewMaxBytes: 262144,
    searchResultLimit: 30,
    graphNodeLimit: 500,
    graphEdgeLimit: 5000,
    enabledDocuments: [],
    enabledPublishTargets: [],
    externalActionsEnabled: false,
    trellisProjectsRoot: projectsRoot,
    trellisGitExecutable: "git",
    trellisPythonExecutable: "python",
    trellisPythonArgs: [],
    trellisMaxTaskBytes: 262144,
    trellisMaxTasks: 100,
    trellisWatchDebounceMs: 20,
    trellisFallbackPollMs: 60000,
    trellisArchivePreviewTtlMs: 120000,
    trellisCommandTimeoutMs: 5000,
    trellisProcessGraceMs: 100,
    trellisOutputMaxBytes: 65536,
    ...overrides,
  };
}

const archiveScript = `
import argparse
import datetime
import json
import os
import shutil
import sys
import time

parser = argparse.ArgumentParser()
commands = parser.add_subparsers(dest="command")
archive = commands.add_parser("archive")
archive.add_argument("name")
archive.add_argument("--no-commit", action="store_true")
args = parser.parse_args()
root = os.getcwd()
source = os.path.join(root, ".trellis", "tasks", args.name)
mode_path = os.path.join(root, ".trellis", "test-mode.txt")
mode = open(mode_path, encoding="utf-8").read().strip() if os.path.exists(mode_path) else "success"
if mode == "slow":
    time.sleep(2)
with open(os.path.join(source, "task.json"), encoding="utf-8") as handle:
    task = json.load(handle)
task["status"] = "completed"
task["completedAt"] = datetime.date.today().isoformat()
with open(os.path.join(source, "task.json"), "w", encoding="utf-8") as handle:
    json.dump(task, handle, ensure_ascii=False, indent=2)
    handle.write("\\n")
month = datetime.date.today().strftime("%Y-%m")
target = os.path.join(root, ".trellis", "tasks", "archive", month, args.name)
os.makedirs(os.path.dirname(target), exist_ok=True)
shutil.move(source, target)
print(target)
if mode == "partial":
    sys.exit(7)
`;

async function git(root: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root });
  return result.stdout.trim();
}

interface RepositoryFixture {
  projectsRoot: string;
  root: string;
}

async function repository(taskData: Record<string, unknown> = {}): Promise<RepositoryFixture> {
  const projectsRoot = await mkdtemp(join(tmpdir(), "muzi-trellis-projects-"));
  const root = join(projectsRoot, "archive-fixture");
  await mkdir(join(root, ".trellis", "tasks", "01-done"), { recursive: true });
  await mkdir(join(root, ".trellis", "tasks", "archive"), { recursive: true });
  await mkdir(join(root, ".trellis", "scripts"), { recursive: true });
  await writeFile(join(root, ".trellis", "tasks", "01-done", "task.json"), `${JSON.stringify({
    id: "done",
    name: "done",
    title: "Done task",
    status: "completed",
    completedAt: "2026-08-23",
    children: [],
    ...taskData,
  }, null, 2)}\n`);
  await writeFile(join(root, ".trellis", "tasks", "01-done", "validation.md"), "# Validation\n\nFocused archive integration test passed without a Git commit.\n");
  await writeFile(join(root, ".trellis", "scripts", "task.py"), archiveScript);
  await writeFile(join(root, ".trellis", "config.yaml"), "hooks: {}\nsession_auto_commit: false\n");
  await git(root, "init");
  await git(root, "add", ".");
  await git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture");
  return { projectsRoot, root: await realpath(root) };
}

function localSubprocess(): SubprocessRuntime {
  return {
    resolveExecutable: async (command: string) => command,
    spawn: (spec: SubprocessSpawnSpec): SubprocessHandle => {
      const child = spawnChild(spec.argv[0] ?? "", spec.argv.slice(1), {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => { stdout = `${stdout}${chunk}`.slice(-65536); });
      child.stderr?.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-65536); });
      const abort = (): void => { child.kill(); };
      spec.signal?.addEventListener("abort", abort, { once: true });
      const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => {
          spec.signal?.removeEventListener("abort", abort);
          resolve({ exitCode: code, signal: signal as NodeJS.Signals | null });
        });
      });
      const reader = (value: () => string) => ({
        readFrom: (_offset: number) => ({ text: value(), nextOffset: Buffer.byteLength(value()), lossy: false }),
      });
      return {
        pid: child.pid ?? -1,
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        collected: { stdout: reader(() => stdout), stderr: reader(() => stderr) },
        done,
        terminate: () => { child.kill(); },
        waitForExit: async () => { await done; return true; },
      };
    },
  } as SubprocessRuntime;
}

function serviceHarness(
  projectsRoot: string,
  overrides: Partial<Config> = {},
): { service: TrellisProjectService; dispose: () => void } {
  const disposers: Array<() => void> = [];
  const ctx = {
    subprocess: localSubprocess(),
    effect: (setup: () => (() => void)) => { disposers.push(setup()); },
  } as unknown as Context;
  const service = new TrellisProjectService(ctx, config(projectsRoot, overrides));
  return {
    service,
    dispose: () => { for (const disposer of disposers.splice(0)) disposer(); },
  };
}

async function discoveredProject(service: TrellisProjectService): Promise<{ projectId: TrellisProjectId; rootPath: string }> {
  const result = await service.list(new AbortController().signal);
  const project = result.projects[0];
  if (project === undefined || project.rootPath === null) throw new Error("Expected one discovered Trellis project");
  return { projectId: project.projectId, rootPath: project.rootPath };
}

describe("Trellis project discovery", () => {
  it("discovers only immediate Git roots with readable .trellis/tasks and keeps stable path-based ids", async () => {
    const fixture = await repository();
    await mkdir(join(fixture.projectsRoot, "git-without-trellis", ".git"), { recursive: true });
    await mkdir(join(fixture.projectsRoot, "ordinary-directory"));
    await mkdir(join(fixture.projectsRoot, "nested-parent", "nested-project", ".git"), { recursive: true });
    await mkdir(join(fixture.projectsRoot, "nested-parent", "nested-project", ".trellis", "tasks"), { recursive: true });
    const harness = serviceHarness(fixture.projectsRoot);
    const signal = new AbortController().signal;
    try {
      const first = await harness.service.list(signal);
      const second = await harness.service.list(signal);
      expect(first.projectsRoot).toBe(await realpath(fixture.projectsRoot));
      expect(first.projects).toHaveLength(1);
      expect(first.projects[0]).toMatchObject({ title: "archive-fixture", rootPath: fixture.root, status: "ready" });
      expect(second.projects[0]?.projectId).toBe(first.projects[0]?.projectId);
      const detail = await harness.service.get({ projectId: first.projects[0]!.projectId }, signal);
      expect(detail.activeTasks[0]?.title).toBe("Done task");
    } finally {
      harness.dispose();
    }
  }, 15000);

  it("rejects a stale project id after the project is no longer an exact Git root", async () => {
    const fixture = await repository();
    const harness = serviceHarness(fixture.projectsRoot);
    const signal = new AbortController().signal;
    try {
      const { projectId } = await discoveredProject(harness.service);
      await rename(join(fixture.root, ".git"), join(fixture.root, ".git-away"));
      await expect(harness.service.get({ projectId }, signal)).rejects.toThrow("不在配置目录");
    } finally {
      harness.dispose();
    }
  });

  it("debounces Trellis revisions and releases pending notifications on dispose", async () => {
    const fixture = await repository();
    const harness = serviceHarness(fixture.projectsRoot);
    const { projectId } = await discoveredProject(harness.service);
    const probe = harness.service as unknown as { scheduleRevision: (id: TrellisProjectId) => void };
    const before = harness.service.trellisRevision;
    probe.scheduleRevision(projectId);
    probe.scheduleRevision(projectId);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(harness.service.trellisRevision).toBe(before + 1);
    harness.dispose();
    const disposedRevision = harness.service.trellisRevision;
    probe.scheduleRevision(projectId);
    harness.service.dispose();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(harness.service.trellisRevision).toBe(disposedRevision);
  });
});
describe("Trellis projects root override", () => {
  it("re-discovers from a new root and bumps the revision", async () => {
    const first = await repository();
    const second = await repository();
    const harness = serviceHarness(first.projectsRoot);
    try {
      const before = harness.service.trellisRevision;
      harness.service.applyProjectsRoot(second.projectsRoot);
      const listed = await harness.service.list(new AbortController().signal);
      expect(listed.projectsRoot).toBe(await realpath(second.projectsRoot));
      expect(listed.projects).toHaveLength(1);
      expect(listed.projects[0]?.rootPath).toBe(second.root);
      expect(harness.service.trellisRevision).toBeGreaterThan(before);
    } finally {
      harness.dispose();
    }
  });

  it("falls back to the cordis default when the override is cleared", async () => {
    const fixture = await repository();
    const harness = serviceHarness(fixture.projectsRoot);
    try {
      harness.service.applyProjectsRoot(undefined);
      const listed = await harness.service.list(new AbortController().signal);
      expect(listed.projectsRoot).toBe(await realpath(fixture.projectsRoot));
      expect(listed.projects).toHaveLength(1);
    } finally {
      harness.dispose();
    }
  });
});
describe("controlled Trellis archive", () => {
  it("uses a one-time token, moves the task, writes completedAt, and leaves Git HEAD unchanged", async () => {
    const fixture = await repository();
    const harness = serviceHarness(fixture.projectsRoot);
    const signal = new AbortController().signal;
    try {
      const { projectId } = await discoveredProject(harness.service);
      const detail = await harness.service.get({ projectId }, signal);
      const task = detail.activeTasks[0];
      expect(task).toBeDefined();
      const head = await git(fixture.root, "rev-parse", "HEAD");
      const preview = await harness.service.prepareArchive({ projectId, taskKey: task!.key }, signal);
      expect(preview.blockers).toEqual([]);
      expect(preview.token).not.toBeNull();
      expect(preview.warnings).toEqual([]);

      const result = await harness.service.archive({ token: preview.token! }, signal);
      expect(result.state).toBe("archived");
      expect(result.message).toContain("未创建 Git 提交");
      expect(await git(fixture.root, "rev-parse", "HEAD")).toBe(head);
      const archived = (await harness.service.get({ projectId }, signal)).archivedTasks[0];
      expect(archived?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await expect(harness.service.archive({ token: preview.token! }, signal)).rejects.toThrow(/已过期|已使用/);
    } finally {
      harness.dispose();
    }
  });

  it("expires tokens and refuses a changed task summary", async () => {
    const fixture = await repository();
    const harness = serviceHarness(fixture.projectsRoot, { trellisArchivePreviewTtlMs: 500 });
    const signal = new AbortController().signal;
    try {
      const { projectId } = await discoveredProject(harness.service);
      const task = (await harness.service.get({ projectId }, signal)).activeTasks[0]!;
      const expired = await harness.service.prepareArchive({ projectId, taskKey: task.key }, signal);
      await new Promise((resolve) => setTimeout(resolve, 550));
      await expect(harness.service.archive({ token: expired.token! }, signal)).rejects.toThrow("过期");

      const current = await harness.service.prepareArchive({ projectId, taskKey: task.key }, signal);
      const path = join(fixture.root, ".trellis", "tasks", "01-done", "task.json");
      const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      await writeFile(path, `${JSON.stringify({ ...parsed, notes: "changed after preview" }, null, 2)}\n`);
      await expect(harness.service.archive({ token: current.token! }, signal)).rejects.toThrow("已变化");
    } finally {
      harness.dispose();
    }
  });

  it("blocks active children and after_archive shell hooks before signing a token", async () => {
    const fixture = await repository({ children: ["02-child"] });
    await mkdir(join(fixture.root, ".trellis", "tasks", "02-child"));
    await writeFile(join(fixture.root, ".trellis", "tasks", "02-child", "task.json"), `${JSON.stringify({ id: "child", title: "Child", status: "in_progress", parent: "01-done" }, null, 2)}\n`);
    const harness = serviceHarness(fixture.projectsRoot);
    const signal = new AbortController().signal;
    try {
      const { projectId } = await discoveredProject(harness.service);
      const task = (await harness.service.get({ projectId }, signal)).activeTasks.find((entry) => entry.directory === "01-done")!;
      const childBlocked = await harness.service.prepareArchive({ projectId, taskKey: task.key }, signal);
      expect(childBlocked.token).toBeNull();
      expect(childBlocked.blockers.join("\n")).toContain("子任务");

      await writeFile(join(fixture.root, ".trellis", "tasks", "01-done", "task.json"), `${JSON.stringify({ id: "done", title: "Done task", status: "completed", completedAt: "2026-08-23", children: [] }, null, 2)}\n`);
      await writeFile(join(fixture.root, ".trellis", "config.yaml"), "hooks:\n  after_archive:\n    - echo unsafe\n");
      const refreshedTask = (await harness.service.get({ projectId }, signal)).activeTasks.find((entry) => entry.directory === "01-done")!;
      const hookBlocked = await harness.service.prepareArchive({ projectId, taskKey: refreshedTask.key }, signal);
      expect(hookBlocked.token).toBeNull();
      expect(hookBlocked.blockers.join("\n")).toContain("after_archive");
    } finally {
      harness.dispose();
    }
  });

  it("does not retry a timed-out command and reports a partial move from disk facts", async () => {
    const slowFixture = await repository();
    await writeFile(join(slowFixture.root, ".trellis", "test-mode.txt"), "slow\n");
    const slowHarness = serviceHarness(slowFixture.projectsRoot);
    const signal = new AbortController().signal;
    try {
      const { projectId } = await discoveredProject(slowHarness.service);
      const task = (await slowHarness.service.get({ projectId }, signal)).activeTasks[0]!;
      const preview = await slowHarness.service.prepareArchive({ projectId, taskKey: task.key }, signal);
      (slowHarness.service as unknown as { config: { trellisCommandTimeoutMs: number } }).config.trellisCommandTimeoutMs = 800;
      const result = await slowHarness.service.archive({ token: preview.token! }, signal);
      expect(result.state).toBe("active");
      expect(result.message).toContain("未自动重试");
    } finally {
      slowHarness.dispose();
    }

    const partialFixture = await repository();
    await writeFile(join(partialFixture.root, ".trellis", "test-mode.txt"), "partial\n");
    const partialHarness = serviceHarness(partialFixture.projectsRoot);
    try {
      const { projectId } = await discoveredProject(partialHarness.service);
      const task = (await partialHarness.service.get({ projectId }, signal)).activeTasks[0]!;
      const preview = await partialHarness.service.prepareArchive({ projectId, taskKey: task.key }, signal);
      const result = await partialHarness.service.archive({ token: preview.token! }, signal);
      expect(result.state).toBe("archived");
      expect(result.exitCode).toBe(7);
      expect(result.message).toContain("进程未正常结束");
    } finally {
      partialHarness.dispose();
    }
  }, 15000);
});
