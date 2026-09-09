import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { inspirationResearchSpecSchema } from "../src/inspirationSchemas.ts";
import { InspirationService } from "../src/inspirationService.ts";
import { inspirationIndexPath } from "../src/inspirationStore.ts";
import type { InspirationResearchSpec, InspirationReportSubmission, InspirationRun } from "../src/inspirationTypes.ts";

const temporary: string[] = [];

async function workspace(): Promise<{ dataDir: string; creatorRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "muzi-inspiration-"));
  temporary.push(root);
  return { dataDir: join(root, "data"), creatorRoot: join(root, "creator") };
}

const topicSpec: InspirationResearchSpec = {
  mode: "topic", topic: "creative research", objective: "Find usable video angles", questions: ["What changed?"],
  sourceLanguage: "zh-en", preferredDomains: [], excludedDomains: ["blocked.example"], depth: "quick",
};

function submission(runId: string, publishedAt: string | null = null): InspirationReportSubmission {
  return {
    runId: runId as InspirationReportSubmission["runId"], status: "ready", summary: "A verified result.",
    findings: [{ text: "The source supports the finding.", sourceIds: ["source-1"] }], disagreements: [{ text: "Evidence remains limited.", sourceIds: ["source-2"], evidence: "uncertain" }],
    angles: ["Make it visual", "Explain the trade-off", "Compare real examples"], nextSteps: ["Draft a script"],
    sources: Array.from({ length: 4 }, (_, index) => ({
      id: `source-${String(index + 1)}`, title: `Primary source ${String(index + 1)}`,
      url: `https://example${String(index + 1)}.com/article`, domain: `example${String(index + 1)}.com`, publishedAt,
    })),
  };
}

function settledRun(id: string, ownerId: string, revision = 0): InspirationRun {
  return {
    id: id as never,
    revision,
    ownerKind: "item",
    ownerId: ownerId as never,
    trigger: "manual",
    status: "ready",
    deleted: false,
    spec: topicSpec,
    scheduledFor: null,
    queuedAt: "2026-09-07T00:00:00.000Z",
    startedAt: "2026-09-07T00:00:00.000Z",
    finishedAt: "2026-09-07T00:01:00.000Z",
    sessionId: null,
    reportPath: null,
    reportSha256: null,
    unread: false,
    error: null,
  };
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("inspiration ledger", () => {
  it("repairs a crash-left running run when loading the durable index", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    const item = await service.saveInspirationDraft({ spec: topicSpec });
    const index = await service.store.read();
    index.runs["run-0001"] = {
      id: "run-0001" as never, revision: 0, ownerKind: "item", ownerId: item.id, trigger: "manual", status: "running", deleted: false, spec: topicSpec,
      scheduledFor: null, queuedAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: null,
      sessionId: null, reportPath: null, reportSha256: null, unread: false, error: null,
    };
    await writeFile(inspirationIndexPath(dataDir), JSON.stringify(index), "utf8");
    const repaired = await new InspirationService({ dataDir, creatorRoot }).store.read();
    expect(repaired.runs["run-0001"]?.status).toBe("interrupted");
    expect(repaired.runs["run-0001"]?.error?.code).toBe("HOST_RESTART");
  });

  it("defaults public-research fields and normalizes a blank trend topic", async () => {
    const parsed = inspirationResearchSpecSchema.parse({ mode: "trend", topic: "   ", objective: "", questions: [], preferredDomains: [], excludedDomains: [] });
    expect(parsed.sourceLanguage).toBe("zh-en");
    expect(parsed.depth).toBe("standard");
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot, now: () => new Date("2026-09-07T04:00:00.000Z") });
    const item = await service.saveInspirationDraft({ spec: parsed });
    expect(item.spec.topic).toBe("全网综合热点");
    await expect(service.saveInspirationDraft({ spec: { ...topicSpec, topic: "   " } })).rejects.toThrow("主题研究");
  });

  it("resolves relative and inclusive Shanghai calendar windows at enqueue time", async () => {
    const { dataDir, creatorRoot } = await workspace();
    let now = new Date("2026-09-07T04:00:00.000Z");
    const service = new InspirationService({ dataDir, creatorRoot, now: () => now });
    const created = await service.startInspirationResearch({ spec: { ...topicSpec, mode: "trend", timeRange: { kind: "custom", startDate: "2026-09-05", endDate: "2026-09-06" } } });
    expect(created.run.timeWindow).toEqual({ startAt: "2026-09-04T16:00:00.000Z", endAt: "2026-09-06T16:00:00.000Z" });
    now = new Date("2026-09-08T04:00:00.000Z");
    const item = (await service.listInspirations()).items[0]!;
    const rerun = await service.startInspirationResearch({ id: item.id, expectedRevision: item.revision, spec: { ...item.spec, timeRange: { kind: "24h" } } });
    expect(rerun.run.timeWindow).toEqual({ startAt: "2026-09-07T04:00:00.000Z", endAt: "2026-09-08T04:00:00.000Z" });
    expect((await service.getInspiration({ kind: "item", id: created.item.id, runId: created.run.id })).run?.timeWindow).toEqual({ startAt: "2026-09-04T16:00:00.000Z", endAt: "2026-09-06T16:00:00.000Z" });
    for (const [kind, startAt] of [["7d", "2026-09-01T04:00:00.000Z"], ["30d", "2026-08-09T04:00:00.000Z"], [undefined, "2026-09-07T04:00:00.000Z"]] as const) {
      const run = await service.startInspirationResearch({ spec: { ...topicSpec, mode: "trend", ...(kind === undefined ? {} : { timeRange: { kind } }) } });
      expect(run.run.timeWindow).toEqual({ startAt, endAt: "2026-09-08T04:00:00.000Z" });
    }
    await expect(service.startInspirationResearch({ spec: { ...topicSpec, mode: "trend", timeRange: { kind: "custom", startDate: "2026-09-07", endDate: "2026-09-09" } } })).rejects.toThrow("未来日期");
    await expect(service.startInspirationResearch({ spec: { ...topicSpec, mode: "trend", timeRange: { kind: "custom", startDate: "2026-09-08", endDate: "2026-09-07" } } })).rejects.toThrow("开始日期");
    await expect(service.startInspirationResearch({ spec: { ...topicSpec, mode: "trend", timeRange: { kind: "custom", startDate: "2026-02-30", endDate: "2026-03-01" } } })).rejects.toThrow("无效日期");
  });

  it("writes a source-linked topic report and preserves integrity", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    const restricted = vi.fn();
    const create = vi.fn(async () => ({ id: "session-1", agentId: "agent-1" }));
    const prompt = vi.fn(async (_sessionId: string, text: string) => {
      const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
      await service.submitReport("agent-1", submission(runId));
    });
    await service.attachRuntime({ sessionController: { create, prompt, waitForIdle: vi.fn(async () => {}) }, agents: { restrict: restricted } });
    const started = await service.startInspirationResearch({ spec: topicSpec });
    await vi.waitFor(async () => expect((await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id })).run?.status).toBe("ready"));
    const detail = await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id });
    expect(detail.reportIntegrity).toBe("ok");
    expect(await readFile(detail.run!.reportPath!, "utf8")).toContain("schema: muzi.inspiration/1");
    expect(prompt).toHaveBeenCalledWith("session-1", expect.stringContaining("不要撰写完整文章"));
    const allowTool = restricted.mock.calls[0]?.[1] as (name: string) => boolean;
    expect(allowTool("web_fetch")).toBe(true);
    expect(allowTool("muzi_inspiration_submit_report")).toBe(true);
    expect(allowTool("filesystem_write")).toBe(false);
    expect(service.globalGuard({ agent: { id: "agent-1" }, toolName: "shell" })).toBe(false);
    const reference = await service.serializeInspirationReference({ runId: started.run.id });
    expect(reference.sha256).toBe(detail.run?.reportSha256);
    expect(reference.text.split("\n").filter((line) => line.startsWith("## "))).toEqual(["## 总结", "## 参考素材", "## 来源"]);
    expect(reference.text).toContain("### 建议的下一步");
    expect(reference.text).toContain("## 来源");
    expect(reference.text).toContain("Evidence remains limited.");
    expect(reference.text).toContain("<https://example1.com/article>");
    await expect(service.submitReport("different-agent", submission(started.run.id))).rejects.toThrow("绑定的 Agent");
    expect((await service.submitReport("agent-1", submission(started.run.id))).id).toBe(started.run.id);
    await expect(service.submitReport("agent-1", { ...submission(started.run.id), summary: "A different report." })).rejects.toThrow("不同的第二份报告");
    const item = (await service.listInspirations()).items[0]!;
    const rerun = await service.startInspirationResearch({ id: item.id, expectedRevision: item.revision, spec: item.spec });
    await vi.waitFor(async () => expect((await service.getInspiration({ kind: "item", id: item.id, runId: rerun.run.id })).run?.status).toBe("ready"));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("turns an idle run with too few sources into needs_attention without retrying", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    let submissionError = "";
    const prompt = vi.fn(async (_sessionId: string, text: string) => {
      const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
      try { await service.submitReport("agent-limited", { ...submission(runId), sources: submission(runId).sources.slice(0, 1) }); } catch (error) { submissionError = String(error); }
    });
    await service.attachRuntime({ sessionController: { create: vi.fn(async () => ({ id: "session-limited", agentId: "agent-limited" })), prompt, waitForIdle: vi.fn(async () => {}) }, agents: { restrict: vi.fn() } });
    const started = await service.startInspirationResearch({ spec: topicSpec });
    await vi.waitFor(async () => expect((await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id })).run?.status).toBe("needs_attention"));
    expect(submissionError).toContain("来源不足 4 条");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("does not prompt when Stop wins while a visible session is being created", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    let completeCreate: ((value: { id: string; agentId: string }) => void) | undefined;
    const create = vi.fn(() => new Promise<{ id: string; agentId: string }>((resolve) => { completeCreate = resolve; }));
    const prompt = vi.fn(async () => {});
    await service.attachRuntime({ sessionController: { create, prompt }, agents: { restrict: vi.fn() } });
    const started = await service.startInspirationResearch({ spec: topicSpec });
    await vi.waitFor(async () => expect(create).toHaveBeenCalledOnce());
    const running = (await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id })).run!;
    expect(running.status).toBe("running");
    await service.stopInspirationRun({ runId: running.id, expectedRevision: running.revision });
    completeCreate?.({ id: "session-stopped", agentId: "agent-stopped" });
    await vi.waitFor(async () => expect((await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id })).run?.status).toBe("cancelled"));
    expect(prompt).not.toHaveBeenCalled();
  });

  it("rejects unknown and out-of-window source dates for trend evidence", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot, now: () => new Date("2026-09-07T04:00:00.000Z") });
    const errors: string[] = [];
    await service.attachRuntime({
      sessionController: {
        create: vi.fn(async () => ({ id: "session-trend", agentId: "agent-trend" })),
        prompt: vi.fn(async (_sessionId: string, text: string) => {
          const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
          try { await service.submitReport("agent-trend", submission(runId)); } catch (error) { errors.push(String(error)); }
          try { await service.submitReport("agent-trend", submission(runId, "2026-08-01T00:00:00.000Z")); } catch (error) { errors.push(String(error)); }
          try { await service.submitReport("agent-trend", submission(runId, "2026-09-07T04:30:00")); } catch (error) { errors.push(String(error)); }
          try { await service.submitReport("agent-trend", submission(runId, "2026-09-07T04:00:00.000Z")); } catch (error) { errors.push(String(error)); }
          await service.submitReport("agent-trend", submission(runId, "2026-09-06T04:00:00.000Z"));
        }),
        waitForIdle: vi.fn(async () => {}),
      },
      agents: { restrict: vi.fn() },
    });
    const started = await service.startInspirationResearch({ spec: { ...topicSpec, mode: "trend", timeRange: { kind: "24h" } } });
    await vi.waitFor(async () => expect((await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id })).run?.status).toBe("ready"));
    expect(errors.join("\n")).toContain("ISO 发布时间");
    expect(errors).toHaveLength(4);
  });

  it("retains an empty partial report but rejects findings or angles without sources", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    await service.attachRuntime({
      sessionController: {
        create: vi.fn(async () => ({ id: "session-empty", agentId: "agent-empty" })),
        prompt: vi.fn(async (_sessionId: string, text: string) => {
          const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
          const partial = { ...submission(runId), status: "partial" as const, partialReason: "No public sources were available.", sources: [] };
          await expect(service.submitReport("agent-empty", partial)).rejects.toThrow("无来源");
          await expect(service.submitReport("agent-empty", { ...partial, findings: [], angles: [], disagreements: [{ text: "Unverified disagreement", sourceIds: [], evidence: "uncertain" }] })).rejects.toThrow("无来源");
          await expect(service.submitReport("agent-empty", { ...submission(runId), findings: [{ text: "Unlinked finding", sourceIds: [] }] })).rejects.toThrow("关联对应来源");
          await service.submitReport("agent-empty", { ...partial, findings: [], disagreements: [], angles: [] });
        }),
        waitForIdle: vi.fn(async () => {}),
      },
      agents: { restrict: vi.fn() },
    });
    const started = await service.startInspirationResearch({ spec: topicSpec });
    await vi.waitFor(async () => expect((await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id })).run?.status).toBe("partial"));
    const reference = await service.serializeInspirationReference({ runId: started.run.id });
    expect(reference.text).toContain("### 局限说明");
    expect(reference.text).toContain("No public sources were available.");
  });

  it("reads a pre-window ledger while pausing legacy recurrence and cancelling its queue", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const legacySpec = { ...topicSpec };
    await mkdir(join(dataDir, "inspiration"), { recursive: true });
    await writeFile(inspirationIndexPath(dataDir), JSON.stringify({
      schemaVersion: 1, revision: 3, items: {},
      tasks: {
        "task-0001": { id: "task-0001", revision: 1, name: "Legacy daily", spec: legacySpec, state: "enabled", dailyTime: "09:00", timeZone: "Asia/Shanghai", authorizedAt: "2026-09-01T00:00:00.000Z", nextRunAt: "2026-09-07T01:00:00.000Z", sessionId: null, latestRunId: "run-0001", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
        "task-0003": { id: "task-0003", revision: 1, name: "Archived daily", spec: legacySpec, state: "archived", dailyTime: "09:00", timeZone: "Asia/Shanghai", authorizedAt: "2026-09-01T00:00:00.000Z", nextRunAt: "2026-09-07T01:00:00.000Z", sessionId: null, latestRunId: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
      },
      runs: {
        "run-0001": { id: "run-0001", revision: 0, ownerKind: "task", ownerId: "task-0001", trigger: "scheduled", status: "queued", spec: legacySpec, scheduledFor: "2026-09-07T01:00:00.000Z", queuedAt: "2026-09-07T00:00:00.000Z", startedAt: null, finishedAt: null, sessionId: null, reportPath: null, reportSha256: null, unread: false, error: null },
        "run-0002": { id: "run-0002", revision: 0, ownerKind: "item", ownerId: "missing-item", trigger: "manual", status: "running", spec: legacySpec, scheduledFor: null, queuedAt: "2026-09-06T00:00:00.000Z", startedAt: "2026-09-06T00:01:00.000Z", finishedAt: null, sessionId: null, reportPath: null, reportSha256: null, unread: false, error: null },
      },
    }), "utf8");
    const index = await new InspirationService({ dataDir, creatorRoot }).store.read();
    expect(index.tasks["task-0001"]?.state).toBe("paused");
    expect(index.tasks["task-0001"]?.authorizedAt).toBeNull();
    expect(index.tasks["task-0001"]?.nextRunAt).toBeNull();
    expect(index.tasks["task-0003"]?.state).toBe("archived");
    expect(index.tasks["task-0003"]?.authorizedAt).toBeNull();
    expect(index.runs["run-0001"]?.status).toBe("cancelled");
    expect(index.runs["run-0001"]?.error?.code).toBe("RECURRENCE_DISABLED");
    expect(index.runs["run-0002"]?.status).toBe("interrupted");
    expect(index.runs["run-0002"]?.timeWindow).toBeUndefined();
    const prompt = vi.fn(async () => {});
    await new InspirationService({ dataDir, creatorRoot }).attachRuntime({ sessionController: { create: vi.fn(), prompt }, agents: { restrict: vi.fn() } });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("restores a queued manual run without restoring retired task runs", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const initial = new InspirationService({ dataDir, creatorRoot });
    const item = await initial.saveInspirationDraft({ spec: topicSpec });
    const index = await initial.store.read();
    index.runs["run-manual"] = { id: "run-manual" as never, revision: 0, ownerKind: "item", ownerId: item.id, trigger: "manual", status: "queued", deleted: false, spec: topicSpec, scheduledFor: null, queuedAt: "2026-09-07T00:00:00.000Z", startedAt: null, finishedAt: null, sessionId: null, reportPath: null, reportSha256: null, unread: false, error: null };
    index.items[item.id]!.latestRunId = "run-manual" as never;
    await writeFile(inspirationIndexPath(dataDir), JSON.stringify(index), "utf8");
    const restarted = new InspirationService({ dataDir, creatorRoot });
    await restarted.attachRuntime({
      sessionController: {
        create: vi.fn(async () => ({ id: "session-manual", agentId: "agent-manual" })),
        prompt: vi.fn(async (_sessionId: string, text: string) => {
          const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
          await restarted.submitReport("agent-manual", submission(runId));
        }),
        waitForIdle: vi.fn(async () => {}),
      },
      agents: { restrict: vi.fn() },
    });
    await vi.waitFor(async () => expect((await restarted.getInspiration({ kind: "item", id: item.id, runId: "run-manual" as never })).run?.status).toBe("ready"));
  });

  it("rejects retired recurring task API paths", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    await expect(service.saveInspirationTask({ name: "Daily", spec: topicSpec, dailyTime: "09:00", timeZone: "Asia/Shanghai" })).rejects.toThrow("已停用");
    await expect(service.setInspirationTaskState({ taskId: "task-0001" as never, expectedRevision: 0, state: "enabled", confirmed: true })).rejects.toThrow("已停用");
    await expect(service.runInspirationTaskNow({ taskId: "task-0001" as never, expectedRevision: 0 })).rejects.toThrow("已停用");
  });

  it("soft-deletes a settled report card without resurrecting its owner as a draft", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    const item = await service.saveInspirationDraft({ spec: topicSpec });
    await service.store.mutate((index) => {
      index.runs["run-only"] = settledRun("run-only", item.id, 3);
      index.items[item.id]!.latestRunId = "run-only" as never;
    });

    await expect(service.deleteInspiration({ kind: "item", id: item.id, runId: "run-only" as never, expectedRevision: 2, confirmed: true })).rejects.toThrow("请刷新后重试");
    await expect(service.deleteInspiration({ kind: "item", id: item.id, runId: "run-only" as never, expectedRevision: 3, confirmed: false })).rejects.toThrow("需要确认");
    await expect(service.deleteInspiration({ kind: "item", id: item.id, runId: "run-only" as never, expectedRevision: 3, confirmed: true })).resolves.toEqual({ deleted: true });

    expect((await service.listInspirations()).items).toEqual([]);
    expect((await service.listInspirations()).recentRuns).toEqual([]);
    await expect(service.getInspiration({ kind: "item", id: item.id, runId: "run-only" as never })).rejects.toThrow("已删除");
    await expect(service.markInspirationRead({ runId: "run-only" as never, expectedRevision: 3 })).rejects.toThrow("已删除");
    expect((await new InspirationService({ dataDir, creatorRoot }).store.read()).runs["run-only"]?.deleted).toBe(true);
  });

  it("retains a deleted report's original file and hash", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    await service.attachRuntime({
      sessionController: {
        create: vi.fn(async () => ({ id: "session-retained", agentId: "agent-retained" })),
        prompt: vi.fn(async (_sessionId: string, text: string) => {
          const runId = /runId ([^\s]+)/.exec(text)?.[1] ?? "";
          await service.submitReport("agent-retained", submission(runId));
        }),
        waitForIdle: vi.fn(async () => {}),
      },
      agents: { restrict: vi.fn() },
    });
    const started = await service.startInspirationResearch({ spec: topicSpec });
    let detail: Awaited<ReturnType<typeof service.getInspiration>> | undefined;
    await vi.waitFor(async () => {
      detail = await service.getInspiration({ kind: "item", id: started.item.id, runId: started.run.id });
      expect(detail.run?.status).toBe("ready");
    });
    const reportPath = detail!.run!.reportPath!;
    const body = await readFile(reportPath, "utf8");
    const hash = createHash("sha256").update(body).digest("hex");
    expect(hash).toBe(detail!.run!.reportSha256);

    await service.deleteInspiration({ kind: "item", id: started.item.id, runId: started.run.id, expectedRevision: detail!.run!.revision, confirmed: true });
    expect(await readFile(reportPath, "utf8")).toBe(body);
    expect(createHash("sha256").update(await readFile(reportPath, "utf8")).digest("hex")).toBe(hash);
  });

  it("does not resume a queued run already marked deleted", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const initial = new InspirationService({ dataDir, creatorRoot });
    const item = await initial.saveInspirationDraft({ spec: topicSpec });
    await initial.store.mutate((index) => {
      index.items[item.id]!.deleted = true;
      index.runs["run-deleted"] = { ...settledRun("run-deleted", item.id), status: "queued", startedAt: null, finishedAt: null, deleted: true };
    });
    const resumed = new InspirationService({ dataDir, creatorRoot });
    const create = vi.fn(async () => ({ id: "session-deleted", agentId: "agent-deleted" }));
    const prompt = vi.fn(async () => {});
    await resumed.attachRuntime({ sessionController: { create, prompt }, agents: { restrict: vi.fn() } });
    expect(create).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
    expect((await resumed.listInspirations()).recentRuns).toEqual([]);
  });

  it("keeps other settled report cards visible and rejects active deletions", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    const item = await service.saveInspirationDraft({ spec: topicSpec });
    await service.store.mutate((index) => {
      index.runs["run-earlier"] = settledRun("run-earlier", item.id, 1);
      index.runs["run-latest"] = { ...settledRun("run-latest", item.id, 2), queuedAt: "2026-09-07T01:00:00.000Z" };
      index.items[item.id]!.latestRunId = "run-latest" as never;
    });

    await service.deleteInspiration({ kind: "item", id: item.id, runId: "run-latest" as never, expectedRevision: 2, confirmed: true });
    const overview = await service.listInspirations();
    expect(overview.items).toHaveLength(1);
    expect(overview.recentRuns.map((run) => run.id)).toEqual(["run-earlier"]);
    expect((await service.getInspiration({ kind: "item", id: item.id })).run?.id).toBe("run-earlier");

    await service.store.mutate((index) => {
      index.runs["run-active"] = { ...settledRun("run-active", item.id, 4), status: "running", finishedAt: null };
    });
    await expect(service.deleteInspiration({ kind: "item", id: item.id, expectedRevision: overview.items[0]!.revision, confirmed: true })).rejects.toThrow("运行中的研究不能删除");
  });

  it("rejects an unsupported durable index instead of replacing it", async () => {
    const { dataDir, creatorRoot } = await workspace();
    const service = new InspirationService({ dataDir, creatorRoot });
    await service.saveInspirationDraft({ spec: topicSpec });
    const path = inspirationIndexPath(dataDir);
    const invalid = JSON.parse(await readFile(path, "utf8")) as { schemaVersion: number };
    invalid.schemaVersion = 2;
    await writeFile(path, JSON.stringify(invalid), "utf8");
    await expect(new InspirationService({ dataDir, creatorRoot }).store.read()).rejects.toThrow("不支持的灵感研究台账版本");
  });
});
