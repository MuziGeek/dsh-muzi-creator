/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@deepseek-ai/dsh-client-ui-primitives", async (importOriginal) => ({
  ...await importOriginal<typeof import("@deepseek-ai/dsh-client-ui-primitives")>(), MarkdownText: ({ text }: { text: string }) => <div>{text}</div> }));
vi.mock("../src/client/KnowledgePreview.tsx", () => ({ KnowledgePreview: () => null }));
import { MuziInspector } from "../src/client/MuziInspector.tsx";
import { setSelectedContentId, setSidebarTab } from "../src/client/contentSelection.ts";
import type { MuziProjectDetail, VideoPublishTaskResult } from "../src/muziTypes.ts";
import type { VideoPublishCapabilitiesResult } from "../src/videoCapabilities.ts";
import type { VideoAccountFace, VideoAccountManagement } from "../src/videoAccountSchemas.ts";

function project(id = "overview-test"): MuziProjectDetail {
  return {
    id, title: id, folderName: id, locator: id, revision: 1, stage: "review", primaryDocument: "mother", updatedAt: "2026-09-07T02:00:00Z", coverRevision: null,
    documents: Object.fromEntries(["mother", "video", "wechat", "xiaohongshu", "blog"].map(key => [key, { status: "draft", sha256: null, derivedFrom: null, sourceSha256: null, stale: false }])) as MuziProjectDetail["documents"],
    publications: Object.fromEntries(["bilibili", "douyin", "wechat", "xiaohongshu", "blog"].map(key => [key, { status: "unpublished", remoteId: null, url: null, scheduledAt: null, publishedAt: null, source: null }])) as MuziProjectDetail["publications"],
    content: { mother: "母内容正文", video: "", wechat: "", xiaohongshu: "", blog: "" }, referenceCount: 0, brief: "", evidence: "", review: "", atlasReferences: [],
  };
}
const capability = { accepted: true, enabled: true, reason: null, acceptedAt: "2026-09-01T00:00:00Z", adapterVersion: "1" };
const capabilities: VideoPublishCapabilitiesResult = {
  schema: "muzi.video-publisher.capabilities/1", generatedAt: "2026-09-07T00:00:00Z", unavailableReason: null,
  accounts: [{ platform: "bilibili", accountProfile: "main", displayName: "测试账号", enabled: true, capabilities: { prepare_only: capability, publish_now: capability, schedule: capability, metrics: capability } }],
};
function task(): VideoPublishTaskResult {
  return { ok: false, taskId: "task", projectId: "overview-test", revision: 1, status: "COMMIT_UNKNOWN", createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z", platforms: {
    bilibili: { platform: "bilibili", accountProfile: "main", mode: "publish_now", scheduledAt: null, status: "COMMIT_UNKNOWN", ready: false, commitEnabled: false, commitBlocker: { code: "unknown", message: "请核查平台作品" }, approvalSummary: null, authorizationDigest: null, authorizationExpiresAt: null, commitAttemptedAt: null, confirmedAt: null, remoteId: null, url: null },
  } };
}
function mount(publishTask: VideoPublishTaskResult | null = null) {
  const account = { platform: "bilibili" as const, accountProfile: "main", displayName: "测试账号", enabled: true, platformAccountId: "bili-1", connectedAt: "2026-09-08T00:00:00.000Z" };
  let registry: VideoAccountManagement = { accounts: [account], loginStatuses: [{ platform: "bilibili", accountProfile: "main", state: "verified", checkedAt: account.connectedAt }], connections: [], capabilities, browserActionsEnabled: true, connectionPollIntervalMs: 2000 };
  const accounts: VideoAccountFace = { list: vi.fn(async () => registry), add: vi.fn(async () => registry), remove: vi.fn(async () => registry), pollConnection: vi.fn(async () => registry), cancelConnection: vi.fn(async () => registry), reopenConnection: vi.fn(async () => registry), reconnect: vi.fn(async () => registry), openLogin: vi.fn(async () => registry), checkLogin: vi.fn(async () => registry), setEnabled: vi.fn(async () => registry) };
  // The host integration fixture includes only fields consumed by the rendered panel.
  let current: any = publishTask === null ? null : { flowId: "vpf-0123456789abcdef01234567", id: "overview-test", version: 3, revision: 1, busy: false, originalRightsConfirmed: true, targets: [{ platform: "bilibili", accountProfile: "main", displayName: "测试账号", mode: "publish_now", state: "unknown", message: "请核查平台作品", materials: ["video.mp4"], task: publishTask }] };
  const flow = { get: vi.fn(async () => current), prepare: vi.fn(async () => current), resume: vi.fn(async () => current), commit: vi.fn(async () => current), invalidate: vi.fn(async () => current) };
  const face = { getProject: vi.fn(async (id: string) => project(id)), getProjectCover: vi.fn(async () => ({ found: false })), getVideoPublishStatus: vi.fn(async () => ({ id: "overview-test", task: publishTask, metrics: {} })), getVideoPublishCapabilities: vi.fn(async () => capabilities), accountManagement: accounts, publishFlow: flow };
  const props = { muziFace: face, mzFace: { getContent: vi.fn(async () => { throw new Error("制作目录暂不可用"); }) }, startPendingProcessing: vi.fn(), startKnowledgeDiscussion: vi.fn() } as unknown as ComponentProps<typeof MuziInspector>;
  const view = render(<MuziInspector {...props} />);
  return { face, flow, accounts, view, setRegistry: (value: VideoAccountManagement) => { registry = value; }, registry: () => registry, setFlow: (value: unknown) => { current = value; } };
}
async function openManagement() {
  fireEvent.click(await screen.findByRole("button", { name: "管理发布" }));
  const panel = document.getElementById("muzi-publish-management")!;
  await within(panel).findByRole("checkbox", { name: /原创或发布权利/ });
  return panel;
}
beforeEach(() => { setSidebarTab("content"); setSelectedContentId("overview-test"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setSelectedContentId(null); });

describe("overview publishing management", () => {
  it("keeps missing-platform account connection outside publishing management", async () => {
    const { accounts, setRegistry, flow } = mount();
    setRegistry({ accounts: [], loginStatuses: [], connections: [], capabilities, browserActionsEnabled: true, connectionPollIntervalMs: 2000 });
    const panel = await openManagement();
    expect(within(panel).getByText("暂无已连接账号，请到内容概览的账号管理中连接")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "账号管理" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "连接账号" })).toBeNull();
    expect(accounts.add).not.toHaveBeenCalled();
    expect(flow.prepare).not.toHaveBeenCalled(); expect(flow.commit).not.toHaveBeenCalled();
  });
  it("keeps form choices while folded and resets disclosure for another content item", async () => {
    const { flow } = mount();
    await screen.findByRole("heading", { name: "overview-test" });
    expect(document.getElementById("muzi-publish-management")?.hidden).toBe(true);
    const panel = await openManagement();
    expect(screen.queryByRole("region", { name: "账号能力验收" })).toBeNull();
    const rights = within(panel).getByRole("checkbox", { name: /原创或发布权利/ }) as HTMLInputElement;
    fireEvent.click(rights);
    fireEvent.click(screen.getByRole("button", { name: "管理发布" }));
    expect(panel.hidden).toBe(true);
    await openManagement(); expect(rights.checked).toBe(true);
    expect(flow.prepare).not.toHaveBeenCalled();
    act(() => { setSelectedContentId("another-item"); });
    await screen.findByRole("heading", { name: "another-item" });
    expect(document.getElementById("muzi-publish-management")?.hidden).toBe(true);
  });
  it("opens unknown progress from the overview without offering final submission", async () => {
    mount(task());
    fireEvent.click(await screen.findByRole("button", { name: /B站.*提交结果未知/ }));
    const panel = document.getElementById("muzi-publish-management")!;
    await within(panel).findByText("待核实");
    expect(within(panel).queryByRole("button", { name: /确认提交/ })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "继续此平台" })).toBeNull();
  });
  it("reads durable prepared results after leaving and reopening content details", async () => {
    const { flow, setFlow } = mount();
    setFlow({ flowId: "vpf-0123456789abcdef01234567", id: "overview-test", version: 3, revision: 1, busy: false, originalRightsConfirmed: true, targets: [{ platform: "bilibili", accountProfile: "main", displayName: "测试账号", mode: "prepare_only", state: "prepared", message: "准备结果已恢复", materials: ["video.mp4"], task: null }] });
    await openManagement();
    fireEvent.click(screen.getByRole("tab", { name: "母内容" }));
    fireEvent.click(screen.getByRole("tab", { name: "概览" }));
    expect(await screen.findByText("准备结果已恢复")).toBeTruthy();
    expect(flow.get.mock.calls.length).toBeGreaterThan(1);
    expect(flow.prepare).not.toHaveBeenCalled();
  });
});
