/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishFlowPanel } from "../src/client/PublishFlowPanel.tsx";
import { zh, type CreatorKey } from "../src/client/locales.ts";

const t = (key: CreatorKey) => zh[key];
const account = { platform: "douyin", accountProfile: "muzi", displayName: "木子", enabled: true, platformAccountId: "dy-1", connectedAt: "2026-09-08T00:00:00.000Z" };
const bilibiliAccount = { platform: "bilibili", accountProfile: "bili", displayName: "B站号", enabled: true, platformAccountId: "bili-1", connectedAt: account.connectedAt };
// Partial wire fixtures exercise rendered controls without constructing unrelated content fields.
const project: any = { id: "mc_0123456789abcdef01234567", revision: 4, title: "测试成片" };
function target(platform: "douyin" | "bilibili", state: string = "ready", mode: "publish_now" | "prepare_only" = "publish_now") { return { platform, accountProfile: platform === "douyin" ? "muzi" : "bili", displayName: platform === "douyin" ? "木子" : "B站号", mode, state, scheduledAt: undefined, message: null, task: mode === "prepare_only" ? null : { platforms: { [platform]: { approvalSummary: { title: "测试成片", mode: "publish_now", scheduledAt: null } } } }, acceptanceSessionId: null, materials: ["video.mp4"] }; }
function flow(items = [target("douyin")]) { return { flowId: "vpf-0123456789abcdef01234567", id: project.id, revision: 4, version: 2, createdAt: account.connectedAt, updatedAt: account.connectedAt, busy: false, originalRightsConfirmed: true, targets: items }; }
function setup(items = [target("douyin")]) {
  let current: any = flow(items);
  let registry: any = { accounts: items.some((item) => item.platform === "bilibili") ? [account, bilibiliAccount] : [account], loginStatuses: items.some((item) => item.platform === "bilibili") ? [{ platform: "douyin", accountProfile: "muzi", state: "verified", checkedAt: account.connectedAt }, { platform: "bilibili", accountProfile: "bili", state: "verified", checkedAt: account.connectedAt }] : [{ platform: "douyin", accountProfile: "muzi", state: "verified", checkedAt: account.connectedAt }], connections: [], connectionPollIntervalMs: 2000, capabilities: { schema: "muzi.video-publisher.capabilities/1", generatedAt: account.connectedAt, accounts: [], unavailableReason: null }, browserActionsEnabled: true };
  const accounts: any = { list: vi.fn(async () => registry), add: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), openLogin: vi.fn(), checkLogin: vi.fn(), reconnect: vi.fn(), pollConnection: vi.fn(), cancelConnection: vi.fn(), reopenConnection: vi.fn() };
  const api: any = { get: vi.fn(async () => current), prepare: vi.fn(async () => current), resume: vi.fn(async () => current), commit: vi.fn(async () => current), invalidate: vi.fn(async () => current) };
  return { accounts, api, set: (next: any) => { current = next; }, setRegistry: (next: any) => { registry = next; } };
}
afterEach(cleanup);

describe("durable publish flow panel", () => {
  it("restores durable targets and invalidates ready results after a rights edit", async () => {
    const { accounts, api } = setup(); render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    expect(await screen.findByText("抖音 · 木子")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /原创或发布权利/ }));
    await waitFor(() => expect(api.invalidate).toHaveBeenCalledWith(expect.objectContaining({ id: project.id, platforms: ["douyin"], confirmed: true })));
    expect(screen.queryByRole("button", { name: /确认提交/ })).toBeNull();
    expect(screen.getByText(/请重新准备后再提交/)).toBeTruthy();
  });
  it("commits only the ready targets selected in the one confirmation dialog", async () => {
    const { accounts, api } = setup([target("douyin"), target("bilibili")]); render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    await screen.findByText("抖音 · 木子");
    fireEvent.click(screen.getByRole("checkbox", { name: "选择抖音 木子提交" }));
    fireEvent.click(screen.getByRole("button", { name: "确认提交 1 个平台" }));
    expect(within(screen.getByRole("dialog")).getByText("素材：video.mp4")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("内容：测试成片")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
    await waitFor(() => expect(api.commit).toHaveBeenCalledWith(expect.objectContaining({ platforms: ["bilibili"] })));
  });
  it("continues each blocked platform separately and never retries an unknown result", async () => {
    const { accounts, api } = setup([target("douyin", "blocked"), target("bilibili", "unknown")]); render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    fireEvent.click(await screen.findByRole("button", { name: "继续此平台" }));
    await waitFor(() => expect(api.resume).toHaveBeenCalledWith(expect.objectContaining({ platforms: ["douyin"] })));
    expect(screen.queryByText("继续B站号")).toBeNull(); expect(screen.getAllByText(/待核实/).length).toBeGreaterThan(0);
  });
  it("clears unavailable targets on focus, invalidates preparation, and keeps the result visible", async () => {
    const { accounts, api, setRegistry } = setup();
    render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    await screen.findByText("抖音 · 木子");
    setRegistry({ accounts: [], loginStatuses: [], connections: [], connectionPollIntervalMs: 2000, capabilities: { schema: "muzi.video-publisher.capabilities/1", generatedAt: account.connectedAt, accounts: [], unavailableReason: null }, browserActionsEnabled: true });
    fireEvent.focus(window);
    await waitFor(() => expect(api.invalidate).toHaveBeenCalledWith(expect.objectContaining({ platforms: ["douyin"], confirmed: true })));
    expect(screen.getByText("暂无已连接账号，请到内容概览的账号管理中连接")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "选择抖音 木子提交" })).toBeNull();
    expect(screen.getByText("抖音 · 木子")).toBeTruthy();
  });
  it("blocks preparation while account loading fails instead of relying on a prior registry", async () => {
    const { accounts, api } = setup();
    vi.mocked(accounts.list).mockRejectedValue(new Error("账号服务暂不可用"));
    render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    await screen.findByText("账号状态暂不可用，暂时不能准备或提交。");
    expect(screen.getByText(/账号读取失败：账号服务暂不可用/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始准备" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("checkbox", { name: "选择抖音 木子提交" })).toBeNull();
  });
  it("keeps local rights edits when focus refreshes the account registry", async () => {
    const { accounts, api } = setup();
    render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    const rights = await screen.findByRole("checkbox", { name: /原创或发布权利/ }) as HTMLInputElement;
    fireEvent.click(rights);
    expect(rights.checked).toBe(false);
    fireEvent.focus(window);
    await waitFor(() => expect(accounts.list.mock.calls.length).toBeGreaterThan(1));
    expect(rights.checked).toBe(false);
  });
  it("excludes a verified label that has no completed login check timestamp", async () => {
    const { accounts, api } = setup();
    const registry = await accounts.list();
    accounts.list.mockResolvedValue({ ...registry, loginStatuses: registry.loginStatuses.map((status: { checkedAt: string | null }) => ({ ...status, checkedAt: null })) });
    render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    await screen.findByText("暂无已连接账号，请到内容概览的账号管理中连接");
    expect(screen.getByRole("button", { name: "开始准备" }).hasAttribute("disabled")).toBe(true);
  });
  it("does not replace a cleared account with another verified account after focus", async () => {
    const first = { ...account, accountProfile: "first", displayName: "第一个账号" };
    const second = { ...account, accountProfile: "second", displayName: "第二个账号" };
    let registry: any = { accounts: [first, second], loginStatuses: [{ platform: "douyin", accountProfile: "first", state: "verified", checkedAt: account.connectedAt }, { platform: "douyin", accountProfile: "second", state: "verified", checkedAt: account.connectedAt }], connections: [], connectionPollIntervalMs: 2000, capabilities: { schema: "muzi.video-publisher.capabilities/1", generatedAt: account.connectedAt, accounts: [], unavailableReason: null }, browserActionsEnabled: true };
    const accounts: any = { list: vi.fn(async () => registry) };
    const api: any = { get: vi.fn(async () => null), prepare: vi.fn(), resume: vi.fn(), commit: vi.fn(), invalidate: vi.fn() };
    render(<PublishFlowPanel project={project} accounts={accounts} api={api} t={t} />);
    await screen.findByText("第一个账号");
    registry = { ...registry, accounts: [second], loginStatuses: [{ platform: "douyin", accountProfile: "second", state: "verified", checkedAt: account.connectedAt }] };
    fireEvent.focus(window);
    await waitFor(() => expect(accounts.list.mock.calls.length).toBeGreaterThan(1));
    expect(screen.getByRole("switch", { name: "选择抖音" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("第二个账号")).toBeNull();
  });
});
