import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishFlowService } from "../src/publishFlow.ts";
import type { MuziCreatorService } from "../src/muziService.ts";
import type { VideoPublisherService } from "../src/videoPublisher.ts";
import type { PublishFlow, PublishFlowPrepare } from "../src/publishFlowSchemas.ts";
import type { PlatformPublishIntent, VideoPublishPrepareRequest, VideoPublishCommitRequest, VideoPublishTaskResult } from "../src/muziTypes.ts";
import { runVideoAccounts } from "../src/videoAccounts.ts";

vi.mock("../src/videoAccounts.ts", () => ({ runVideoAccounts: vi.fn() }));
const id = `mc_${"1".repeat(24)}`;
const account = (platform: "douyin" | "bilibili") => ({ platform, accountProfile: `${platform}-main`, displayName: `${platform} creator`, enabled: true, platformAccountId: `${platform}-123`, connectedAt: "2026-09-08T00:00:00.000Z" });
const intents: PlatformPublishIntent[] = ["douyin", "bilibili"].map(platform => ({ platform: platform as "douyin" | "bilibili", accountProfile: `${platform}-main`, mode: "publish_now" }));
const roots: string[] = [];
const services: PublishFlowService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.dispose())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); vi.clearAllMocks(); });

function task(request: VideoPublishPrepareRequest): VideoPublishTaskResult {
  const intent = request.intents[0]!;
  const now = new Date().toISOString();
  return { ok: true, taskId: `vp-${intent.platform}-12345678`, projectId: id, revision: request.expectedRevision, status: "READY", createdAt: now, updatedAt: now, platforms: {
    [intent.platform]: { platform: intent.platform, accountProfile: intent.accountProfile, mode: intent.mode, scheduledAt: intent.scheduledAt ?? null, status: intent.mode === "prepare_only" ? "READY_DRAFT" : "READY_TO_PUBLISH", ready: true, commitEnabled: intent.mode !== "prepare_only", commitBlocker: null, approvalSummary: intent.mode === "prepare_only" ? null : { platform: intent.platform, accountProfile: intent.accountProfile, title: "A real prepared title", mode: intent.mode, scheduledAt: intent.scheduledAt ?? null }, authorizationDigest: "a".repeat(64), authorizationExpiresAt: new Date(Date.now() + 600_000).toISOString(), commitAttemptedAt: null, confirmedAt: null, remoteId: null, url: null },
  } };
}

async function fixture(accepted = false, enabled = true) {
  const root = await mkdtemp(join(tmpdir(), "mz-publish-flow-")); roots.push(root);
  let revision = 4;
  const muzi = { getProject: vi.fn(async () => ({ revision })), patchPublicationStates: vi.fn(async () => ({ revision: ++revision })) };
  vi.mocked(runVideoAccounts).mockImplementation(async () => ({ accounts: [account("douyin"), account("bilibili")], connections: [], loginStatuses: ["douyin", "bilibili"].map(platform => ({ platform: platform as "douyin" | "bilibili", accountProfile: `${platform}-main`, state: "verified", checkedAt: new Date().toISOString() })) }));
  const prepared = new Map<string, VideoPublishTaskResult>();
  const publisher = {
    skillDir: "fixture",
    capabilities: vi.fn(async () => ({ unavailableReason: null, accounts: [account("douyin"), account("bilibili")].map(item => ({ ...item, capabilities: { prepare_only: { enabled: accepted }, publish_now: { enabled: accepted }, schedule: { enabled: accepted } } })) })),
    preparationSummary: vi.fn(async () => ({ title: "A real prepared title", materials: ["video.mp4"] })),
    beginAcceptance: vi.fn(async () => ({ sessionId: `vas-${"2".repeat(24)}` })),
    finalizeAcceptance: vi.fn(async () => ({})),
    status: vi.fn(async (request: { taskId: string }) => ({ task: prepared.get(request.taskId) ?? null })),
    prepare: vi.fn(async (request: VideoPublishPrepareRequest) => { const value = task(request); prepared.set(value.taskId, value); return value; }),
    commit: vi.fn(async (request: VideoPublishCommitRequest) => { const value = structuredClone(prepared.get(request.taskId)!); const row = value.platforms[request.platform]!; row.status = row.mode === "schedule" ? "SCHEDULE_CONFIRMED" : "PUBLISHED_CONFIRMED"; row.confirmedAt = new Date().toISOString(); row.remoteId = "remote-1"; return value; }),
  };
  const service = new PublishFlowService(root, muzi as unknown as MuziCreatorService, publisher as unknown as VideoPublisherService, () => enabled); services.push(service);
  const input: PublishFlowPrepare = { id, expectedRevision: 4, intents, confirmed: true, originalRightsConfirmed: true };
  return { root, service, publisher, muzi, input, changeRevision: () => { revision++; } };
}

async function idle(service: PublishFlowService): Promise<PublishFlow> {
  for (let i = 0; i < 200; i++) { const value = await service.get({ id }); if (value && !value.busy) return value; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error("flow did not finish");
}
const action = (flow: PublishFlow, platforms = flow.targets.map(target => target.platform)) => ({ id, flowId: flow.flowId, expectedVersion: flow.version, platforms, confirmed: true as const });

describe("content publishing flow", () => {
  it("integrates first-use preparation and submits selected targets only after one fresh confirmation", async () => {
    const { service, publisher, muzi, input } = await fixture();
    const started = await service.prepare(input, new AbortController().signal);
    expect(started.busy).toBe(true);
    const ready = await idle(service);
    expect(ready.targets.map(target => target.state)).toEqual(["ready", "ready"]);
    expect(publisher.beginAcceptance).toHaveBeenCalledTimes(2);
    expect(publisher.commit).not.toHaveBeenCalled();
    expect(muzi.patchPublicationStates).not.toHaveBeenCalled();
    await service.commit(action(ready), new AbortController().signal);
    const done = await idle(service);
    expect(done.targets.map(target => target.state)).toEqual(["published", "published"]);
    expect(publisher.commit).toHaveBeenCalledTimes(2);
    expect(publisher.finalizeAcceptance).toHaveBeenCalledTimes(2);
    expect(muzi.patchPublicationStates).toHaveBeenCalledTimes(1);
    expect(publisher.commit.mock.calls.every(([request]) => request.expectedRevision === 4)).toBe(true);
    expect(vi.mocked(runVideoAccounts).mock.calls.filter(call => (call[2] as { inspectOnly?: boolean }).inspectOnly).length).toBe(2);
    await expect(service.commit(action(ready), new AbortController().signal)).rejects.toThrow("进度已变化");
  });
  it("finishes prepare-only without issuing a final action or recording a platform draft", async () => {
    const { service, publisher, muzi, input } = await fixture();
    await service.prepare({ ...input, intents: [{ ...intents[0]!, mode: "prepare_only" }] }, new AbortController().signal);
    const prepared = await idle(service);
    expect(prepared.targets[0]?.state).toBe("prepared");
    expect(publisher.finalizeAcceptance).toHaveBeenCalledTimes(1);
    await expect(service.commit(action(prepared), new AbortController().signal)).rejects.toThrow("不可执行");
    expect(publisher.commit).not.toHaveBeenCalled(); expect(muzi.patchPublicationStates).not.toHaveBeenCalled();
  });
  it("continues other targets after failure and retries only a blocked target", async () => {
    const { service, publisher, input } = await fixture(true);
    publisher.prepare.mockRejectedValueOnce(new Error("login expired"));
    await service.prepare(input, new AbortController().signal);
    const partial = await idle(service);
    expect(partial.targets.map(target => target.state)).toEqual(["blocked", "ready"]);
    await service.resume(action(partial, ["douyin"]), new AbortController().signal);
    expect((await idle(service)).targets.map(target => target.state)).toEqual(["ready", "ready"]);
    expect(publisher.prepare).toHaveBeenCalledTimes(3);
    expect(publisher.beginAcceptance).not.toHaveBeenCalled();
  });
  it("does not create capability evidence for failed preparation or unverified login", async () => {
    const { service, publisher, input } = await fixture();
    vi.mocked(runVideoAccounts).mockResolvedValue({ accounts: [], connections: [], loginStatuses: [] });
    await service.prepare(input, new AbortController().signal);
    expect((await idle(service)).targets.every(target => target.state === "blocked")).toBe(true);
    expect(publisher.prepare).not.toHaveBeenCalled(); expect(publisher.finalizeAcceptance).not.toHaveBeenCalled();
  });
  it("rejects stale confirmation, edited content and duplicate platform targets", async () => {
    const { service, input, changeRevision } = await fixture();
    await expect(service.prepare({ ...input, intents: [intents[0]!, intents[0]!] }, new AbortController().signal)).rejects.toThrow("每个平台");
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    changeRevision();
    await expect(service.commit(action(ready), new AbortController().signal)).rejects.toThrow("内容已修改");
    expect((await service.get({ id }))?.targets.every(target => target.state === "blocked")).toBe(true);
  });
  it("preserves uncertain final outcomes and forbids retry or replacement", async () => {
    const { service, publisher, input } = await fixture();
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    publisher.commit.mockRejectedValueOnce(new Error("connection lost after click"));
    await service.commit(action(ready, ["douyin"]), new AbortController().signal);
    const unknown = await idle(service);
    expect(unknown.targets[0]?.state).toBe("unknown");
    await expect(service.resume(action(unknown, ["douyin"]), new AbortController().signal)).rejects.toThrow("不可执行");
    await expect(service.prepare(input, new AbortController().signal)).rejects.toThrow("尚未核实");
  });
  it("restores durable progress and marks interrupted submission as unknown", async () => {
    const { service, root, input, publisher, muzi } = await fixture();
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    await service.dispose();
    ready.busy = true; ready.targets[0]!.state = "committing";
    await writeFile(join(root, "publish-flows", `${id}.json`), JSON.stringify(ready));
    const restored = new PublishFlowService(root, muzi as unknown as MuziCreatorService, publisher as unknown as VideoPublisherService, () => true); services.push(restored);
    const current = await restored.get({ id });
    expect(current?.busy).toBe(false); expect(current?.targets[0]?.state).toBe("unknown");
  });
  it("keeps external preparation disabled without affecting read-only progress", async () => {
    const { service, input } = await fixture(false, false);
    await expect(service.prepare(input, new AbortController().signal)).rejects.toThrow("上传和发布尚未启用");
    await expect(service.get({ id })).resolves.toBeNull();
  });
  it("persists configuration revocation and rejects the previous confirmation", async () => {
    const { service, input, root } = await fixture(true);
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    const revoked = await service.invalidate(action(ready));
    expect(revoked.targets.every(target => target.state === "blocked")).toBe(true);
    expect(revoked.targets.every(target => !target.task?.platforms[target.platform]?.authorizationDigest)).toBe(true);
    expect(JSON.parse(await readFile(join(root, "publish-flows", `${id}.json`), "utf8")).version).toBe(revoked.version);
    await expect(service.commit(action(ready), new AbortController().signal)).rejects.toThrow("进度已变化");
  });
  it("continues a second final target when the first outcome is uncertain", async () => {
    const { service, publisher, input } = await fixture(true);
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    publisher.commit.mockRejectedValueOnce(new Error("connection lost"));
    await service.commit(action(ready), new AbortController().signal);
    expect((await idle(service)).targets.map(target => target.state)).toEqual(["unknown", "published"]);
    expect(publisher.commit).toHaveBeenCalledTimes(2);
  });
  it("blocks changed platform identity before any final submission", async () => {
    const { service, publisher, input } = await fixture(true);
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    const registry = await runVideoAccounts("fixture", "list", {}, new AbortController().signal);
    registry.accounts[0]!.platformAccountId = "another-identity";
    vi.mocked(runVideoAccounts).mockResolvedValue(registry);
    await service.commit(action(ready, ["douyin"]), new AbortController().signal);
    expect((await idle(service)).targets[0]?.state).toBe("blocked");
    expect(publisher.commit).not.toHaveBeenCalled();
  });
  it("reconciles a durable confirmed result after host interruption without another click", async () => {
    const { service, publisher, muzi, root, input, changeRevision } = await fixture(true);
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    ready.busy = true; ready.targets[0]!.state = "committing";
    const confirmed = task({ id, expectedRevision: 4, intents: [intents[0]!], confirmed: true });
    confirmed.platforms.douyin!.status = "PUBLISHED_CONFIRMED";
    confirmed.platforms.douyin!.remoteId = "known-result";
    publisher.status.mockResolvedValue({ task: confirmed });
    await writeFile(join(root, "publish-flows", `${id}.json`), JSON.stringify(ready));
    changeRevision();
    const recovered = await service.get({ id });
    expect(recovered?.targets[0]?.state).toBe("published");
    expect(recovered?.targets[0]?.factsRecorded).toBe(true);
    expect(muzi.patchPublicationStates).toHaveBeenCalledTimes(1);
    expect(muzi.patchPublicationStates).toHaveBeenCalledWith(id, 5, expect.any(Object));
    await service.get({ id });
    expect(muzi.patchPublicationStates).toHaveBeenCalledTimes(1);
    expect(publisher.commit).not.toHaveBeenCalled();
  });
  it("does not reclaim a foreign host lock even when its PID is absent locally", async () => {
    const { service, input, root } = await fixture(true);
    await service.prepare(input, new AbortController().signal); const ready = await idle(service);
    await writeFile(join(root, "publish-flows", `${id}.json.lock`), JSON.stringify({ pid: 2147483647, host: `${hostname()}-other` }));
    await expect(service.commit(action(ready), new AbortController().signal)).rejects.toThrow("发布任务锁");
  });
});
