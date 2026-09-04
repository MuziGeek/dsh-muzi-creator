import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { InspirationScheduler, latestDailyOccurrence } from "../src/inspirationScheduler.ts";
import { InspirationService } from "../src/inspirationService.ts";
import { inspirationIndexPath } from "../src/inspirationStore.ts";
import type { InspirationResearchSpec, InspirationReportSubmission } from "../src/inspirationTypes.ts";

const temporary: string[] = [];

async function workspace(): Promise<{ dataDir: string; creatorRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "muzi-inspiration-"));
  temporary.push(root);
  return { dataDir: join(root, "data"), creatorRoot: join(root, "creator") };
}

const spec: InspirationResearchSpec = {
  mode: "topic", topic: "creative research", objective: "Find usable video angles", questions: ["What changed?"],
  sourceLanguage: "zh-en", preferredDomains: [], excludedDomains: ["blocked.example"], depth: "quick",
};

function submission(runId: string): InspirationReportSubmission {
  const sources = Array.from({ length: 4 }, (_, index) => ({
    id: `source-${String(index + 1)}`,
    title: `Primary source ${String(index + 1)}`,
    url: `https://example${String(index + 1)}.com/article`,
    domain: `example${String(index + 1)}.com`,
    publishedAt: null,
  }));
  return {
    runId: runId as InspirationReportSubmission["runId"], status: "ready", summary: "A verified result.", findings: [{ text: "The source supports the finding.", sourceIds: ["source-1"] }], disagreements: [], angles: ["Make it visual", "Explain the trade-off", "Compare real examples"], nextSteps: ["Draft a script"], sources,
  };
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("inspiration ledger", () => {
  it("repairs a crash-left running run when loading the durable index", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    const item = await service.saveInspirationDraft({ spec });
    const index = await service.store.read();
    index.runs["run-0001"] = {
      id: "run-0001" as never, revision: 0, ownerKind: "item", ownerId: item.id, trigger: "manual", status: "running", spec,
      scheduledFor: null, queuedAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: null,
      sessionId: null, reportPath: null, reportSha256: null, unread: false, error: null,
    };
    await writeFile(inspirationIndexPath(dataDir), JSON.stringify(index), "utf8");
    const restarted = new InspirationService({ dataDir, creatorRoot });
    const repaired = await restarted.store.read();
    expect(repaired.runs["run-0001"]?.status).toBe("interrupted");
    expect(repaired.runs["run-0001"]?.error?.code).toBe("HOST_RESTART");
  });

  it("runs through a visible restricted session and atomically writes an integrity-checked report", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    const restricted = vi.fn();
    const create = vi.fn(async () => ({ id: "session-1", agentId: "agent-1" }));
    const prompt = vi.fn(async (_sessionId: string, text: string) => {
      const match = /runId ([^\s]+)/.exec(text);
      await service.submitReport("agent-1", submission(match![1]!));
    });
    await service.attachRuntime({
      sessionController: {
        create,
        prompt,
        waitForIdle: vi.fn(async () => {}),
      },
      agents: { restrict: restricted },
    });
    const { run } = await service.startInspirationResearch({ spec });
    await vi.waitFor(async () => {
      const current = (await service.getInspiration({ kind: "item", id: (await service.listInspirations()).items[0]!.id })).run!;
      expect(`${current.status}:${current.error?.message ?? ""}`).toBe("ready:");
    });
    const detail = await service.getInspiration({ kind: "item", id: (await service.listInspirations()).items[0]!.id, runId: run.id });
    expect(detail.reportIntegrity).toBe("ok");
    expect(detail.run?.reportPath).toContain(join("00-inbox", "inspirations", "one-off"));
    expect(restricted).toHaveBeenCalledWith("agent-1", expect.any(Function));
    const allowTool = restricted.mock.calls[0]?.[1] as (name: string) => boolean;
    expect(allowTool("web_fetch")).toBe(true);
    expect(allowTool("muzi_knowledge_read")).toBe(true);
    expect(allowTool("muzi_inspiration_submit_report")).toBe(true);
    expect(allowTool("filesystem_write")).toBe(false);
    expect(service.globalGuard({ agent: { id: "agent-1" }, toolName: "web_search" })).toBe(true);
    expect(service.globalGuard({ agent: { id: "agent-1" }, toolName: "shell" })).toBe(false);
    const reference = await service.serializeInspirationReference({ runId: run.id });
    expect(reference.sha256).toBe(detail.run?.reportSha256);
    const reportFile = await readFile(detail.run!.reportPath!, "utf8");
    expect(detail.run?.reportPath).toMatch(/\.md$/);
    expect(reportFile).toContain("schema: muzi.inspiration/1");
    expect(reportFile).toContain("## 关键发现");
    expect(reportFile).toContain(String(run.id));
    await expect(service.submitReport("different-agent", submission(run.id))).rejects.toThrow("绑定的 Agent");
    expect((await service.submitReport("agent-1", submission(run.id))).id).toBe(run.id);
    await expect(service.submitReport("agent-1", { ...submission(run.id), summary: "A different report." })).rejects.toThrow("不同的第二份报告");

    const item = (await service.listInspirations()).items[0]!;
    const rerun = await service.startInspirationResearch({ id: item.id, expectedRevision: item.revision, spec: item.spec });
    await vi.waitFor(async () => {
      expect((await service.getInspiration({ kind: "item", id: item.id, runId: rerun.run.id })).run?.status).toBe("ready");
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledTimes(2);

    const restored = new InspirationService({ dataDir, creatorRoot });
    const restoredRestriction = vi.fn();
    await restored.attachRuntime({
      sessionController: {
        create: vi.fn(async () => ({ id: "unused", agentId: "unused-agent" })),
        resolve: vi.fn(async (sessionId) => ({ id: sessionId, agentId: "restored-agent" })),
      },
      agents: { restrict: restoredRestriction },
    });
    expect(restored.isManagedAgent("restored-agent")).toBe(true);
    expect(restored.isManagedAgent("session-1")).toBe(false);
    expect(restored.globalGuard({ agent: { id: "restored-agent" }, toolName: "shell" })).toBe(false);
    expect(restoredRestriction).toHaveBeenCalledWith("restored-agent", expect.any(Function));
    restored.dispose();
  });

  it("turns an idle run without a valid source set into needs_attention without retrying", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    let submissionError = "";
    const prompt = vi.fn(async (_sessionId: string, text: string) => {
      const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
      const invalid = submission(runId);
      invalid.sources = invalid.sources.slice(0, 1);
      try {
        await service.submitReport("agent-limited", invalid);
      } catch (cause) {
        submissionError = cause instanceof Error ? cause.message : String(cause);
      }
    });
    await service.attachRuntime({
      sessionController: {
        create: vi.fn(async () => ({ id: "session-limited", agentId: "agent-limited" })),
        prompt,
        waitForIdle: vi.fn(async () => {}),
      },
      agents: { restrict: vi.fn() },
    });
    const started = await service.startInspirationResearch({ spec });
    await vi.waitFor(async () => {
      expect((await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id })).run?.status).toBe("needs_attention");
    });
    expect(submissionError).toContain("来源不足 4 条");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("uses the previous successful trend report as the next comparison baseline", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    const trendSpec = { ...spec, mode: "trend" as const, topic: "daily creator trends" };
    const prompts: string[] = [];
    const prompt = vi.fn(async (_sessionId: string, text: string) => {
      prompts.push(text);
      const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
      await service.submitReport("agent-trend", submission(runId));
    });
    await service.attachRuntime({
      sessionController: {
        create: vi.fn(async () => ({ id: "session-trend", agentId: "agent-trend" })),
        prompt,
        waitForIdle: vi.fn(async () => {}),
      },
      agents: { restrict: vi.fn() },
    });

    const first = await service.startInspirationResearch({ spec: trendSpec });
    await vi.waitFor(async () => {
      expect((await service.getInspiration({ kind: "item", id: first.item.id, runId: first.run.id })).run?.status).toBe("ready");
    });
    const firstDetail = await service.getInspiration({ kind: "item", id: first.item.id, runId: first.run.id });
    const item = (await service.listInspirations()).items[0]!;
    const second = await service.startInspirationResearch({ id: item.id, expectedRevision: item.revision, spec: trendSpec });
    await vi.waitFor(async () => {
      expect((await service.getInspiration({ kind: "item", id: item.id, runId: second.run.id })).run?.status).toBe("ready");
    });

    expect(prompts[0]).toContain("first trend run");
    expect(prompts[0]).toContain("last 24 hours");
    expect(prompts[1]).toContain("follow-up trend run");
    expect(prompts[1]).toContain("previous successful report completed at");
    expect(prompts[1]).toContain(firstDetail.run?.finishedAt ?? "missing-finished-at");
  });

  it("requires explicit daily authorization and revokes it when the schedule specification changes", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot, now: () => new Date("2026-09-03T02:00:00.000Z") });
    const created = await service.saveInspirationTask({ name: "Daily brief", spec, dailyTime: "09:00", timeZone: "Asia/Shanghai" });
    expect(created.state).toBe("paused");
    expect(created.authorizedAt).toBeNull();
    await expect(service.setInspirationTaskState({ taskId: created.id, expectedRevision: created.revision, state: "enabled" })).rejects.toThrow("明确确认");
    const enabled = await service.setInspirationTaskState({ taskId: created.id, expectedRevision: created.revision, state: "enabled", confirmed: true });
    expect(enabled.authorizedAt).toBe("2026-09-03T02:00:00.000Z");
    expect(enabled.nextRunAt).toBe("2026-09-04T01:00:00.000Z");

    const edited = await service.saveInspirationTask({
      id: enabled.id,
      expectedRevision: enabled.revision,
      name: enabled.name,
      spec: { ...enabled.spec, topic: "changed topic" },
      dailyTime: enabled.dailyTime,
      timeZone: enabled.timeZone,
    });
    expect(edited.state).toBe("paused");
    expect(edited.authorizedAt).toBeNull();
    expect(edited.nextRunAt).toBeNull();

    const reenabled = await service.setInspirationTaskState({ taskId: edited.id, expectedRevision: edited.revision, state: "enabled", confirmed: true });
    const paused = await service.setInspirationTaskState({ taskId: reenabled.id, expectedRevision: reenabled.revision, state: "paused" });
    expect(paused.authorizedAt).toBeNull();
    const archived = await service.setInspirationTaskState({ taskId: paused.id, expectedRevision: paused.revision, state: "archived" });
    await expect(service.setInspirationTaskState({ taskId: archived.id, expectedRevision: archived.revision, state: "enabled", confirmed: true })).rejects.toThrow("不能重新启用");
  });

  it("calculates the latest Shanghai daily run and performs only one startup catch-up", async () => {
    const now = new Date("2026-09-03T02:00:00.000Z");
    const task = { id: "task", dailyTime: "09:30", timeZone: "Asia/Shanghai", state: "enabled", nextRunAt: null };
    expect(latestDailyOccurrence(task, now).toISOString()).toBe("2026-09-03T01:30:00.000Z");
    const enqueueScheduled = vi.fn(async () => {});
    const scheduler = new InspirationScheduler({ listEnabledTasks: async () => [task as never], enqueueScheduled }, () => now);
    await scheduler.start();
    await scheduler.start();
    scheduler.stop();
    expect(enqueueScheduled).toHaveBeenCalledTimes(1);
    expect(enqueueScheduled).toHaveBeenLastCalledWith(task, new Date("2026-09-03T01:30:00.000Z"), "catch-up");
  });

  it("rejects an unsupported durable index instead of replacing it", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    await service.saveInspirationDraft({ spec });
    const path = inspirationIndexPath(dataDir);
    const invalid = JSON.parse(await readFile(path, "utf8")) as { schemaVersion: number };
    invalid.schemaVersion = 2;
    await writeFile(path, JSON.stringify(invalid), "utf8");
    const reopened = new InspirationService({ dataDir, creatorRoot });
    await expect(reopened.store.read()).rejects.toThrow("不支持的灵感研究台账版本");
  });
});
