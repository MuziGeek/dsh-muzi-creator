/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoAccountManager } from "../src/client/VideoAccountManager.tsx";
import { zh, type CreatorKey } from "../src/client/locales.ts";
import type { VideoAccountFace, VideoAccountManagement, VideoConnection } from "../src/videoAccountSchemas.ts";

vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({ IconChevronDownOutline14: () => <svg aria-hidden="true" /> }));

const t = (key: CreatorKey) => zh[key];
const time = "2026-09-08T00:00:00.000Z";
const account = { platform: "douyin" as const, accountProfile: "creator", displayName: "木子", enabled: true, platformAccountId: "dy-1", connectedAt: time };
const pending = (connectionId = "vac-1234567890abcdef12345678", state: VideoConnection["state"] = "waiting_login"): VideoConnection => ({ connectionId, platform: "douyin", accountProfile: "creator", state, createdAt: time, expiresAt: "2026-09-08T01:00:00.000Z", displayName: null, message: null, account: null });
function management(patch: Partial<VideoAccountManagement> = {}): VideoAccountManagement {
  return { accounts: [account], loginStatuses: [{ platform: "douyin", accountProfile: "creator", state: "verified", checkedAt: time }], connections: [], connectionPollIntervalMs: 2000, capabilities: { schema: "muzi.video-publisher.capabilities/1", generatedAt: time, accounts: [], unavailableReason: null }, browserActionsEnabled: true, ...patch };
}
function setup(initial = management()) {
  let current = initial;
  const api: VideoAccountFace = { list: vi.fn(async () => current), add: vi.fn(async () => current), remove: vi.fn(async () => current), setEnabled: vi.fn(async () => current), openLogin: vi.fn(async () => current), checkLogin: vi.fn(async () => current), reconnect: vi.fn(async () => current), pollConnection: vi.fn(async () => current), cancelConnection: vi.fn(async () => current), reopenConnection: vi.fn(async () => current) };
  return { api, set: (value: VideoAccountManagement) => { current = value; } };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("account connection UI", () => {
  it("shows only recently verified bindings in the paper list and keeps stopped accounts", async () => {
    const stopped = { ...account, accountProfile: "stopped", displayName: "已停用号", enabled: false, platformAccountId: "dy-2" };
    const invalid = { ...account, accountProfile: "invalid", displayName: "失效号", platformAccountId: "dy-3" };
    const pendingRemoval = { ...account, accountProfile: "pending", displayName: "待清理号", removalPending: true, platformAccountId: "dy-4" };
    const { api } = setup(management({ accounts: [account, stopped, invalid, pendingRemoval], loginStatuses: [{ platform: "douyin", accountProfile: "creator", state: "verified", checkedAt: time }, { platform: "douyin", accountProfile: "stopped", state: "verified", checkedAt: time }, { platform: "douyin", accountProfile: "invalid", state: "login_required", checkedAt: time }, { platform: "douyin", accountProfile: "pending", state: "verified", checkedAt: time }] }));
    const view = render(<VideoAccountManager api={api} t={t} />);
    await screen.findByText("木子");
    expect(view.container.querySelector(".videoAccountPaper")).not.toBeNull();
    expect(screen.getByText("已停用号")).toBeTruthy();
    expect(screen.queryByText("失效号")).toBeNull();
    expect(screen.getByRole("button", { name: "账号连接问题 (2)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "账号管理 (2)" })).toBeTruthy();
    expect((screen.getAllByRole("button", { name: "打开平台" })[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("distinguishes loading, read failure, and an empty verified list", async () => {
    let resolveList: ((value: VideoAccountManagement) => void) | undefined;
    const { api } = setup(); vi.mocked(api.list).mockImplementation(() => new Promise((resolve) => { resolveList = resolve; }));
    render(<VideoAccountManager api={api} t={t} />);
    expect(screen.getByRole("status").textContent).toContain("正在读取");
    resolveList?.(management({ accounts: [], loginStatuses: [] }));
    await screen.findByText("暂无已验证账号。连接并完成验证后会显示在这里。");
    cleanup();
    const failed = setup(); vi.mocked(failed.api.list).mockRejectedValue(new Error("账号服务不可用")); render(<VideoAccountManager api={failed.api} t={t} />);
    await screen.findByText("账号服务不可用");
  });

  it("temporarily closes a selected connection without canceling or resuming its poll", async () => {
    const connection = pending(); let resolvePoll: ((value: VideoAccountManagement) => void) | undefined;
    const next = management({ accounts: [], loginStatuses: [], connections: [connection], connection, connectionPollIntervalMs: 15 });
    const { api } = setup(next); vi.mocked(api.pollConnection).mockImplementation(() => new Promise((resolve) => { resolvePoll = resolve; }));
    render(<VideoAccountManager api={api} t={t} initialPlatform="douyin" />);
    await waitFor(() => expect(api.pollConnection).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "暂时关闭" })); resolvePoll?.(next);
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(api.cancelConnection).not.toHaveBeenCalled(); expect(api.pollConnection).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "继续连接" }));
    await waitFor(() => expect(api.pollConnection).toHaveBeenCalledTimes(2));
  });

  it("uses one in-flight poll for automatic and manual checks", async () => {
    const connection = pending(); let resolvePoll: ((value: VideoAccountManagement) => void) | undefined;
    const next = management({ accounts: [], loginStatuses: [], connections: [connection], connection }); const { api } = setup(next);
    vi.mocked(api.pollConnection).mockImplementation(() => new Promise((resolve) => { resolvePoll = resolve; }));
    render(<VideoAccountManager api={api} t={t} initialPlatform="douyin" />);
    await waitFor(() => expect(api.pollConnection).toHaveBeenCalledOnce()); fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
    expect(api.pollConnection).toHaveBeenCalledOnce(); resolvePoll?.(next);
  });

  it("cancels an in-progress connection, ignores late success, and does not restore it before a new connection", async () => {
    const old = pending("vac-fedcbafedcbafedcbafedcba"); const fresh = pending("vac-abcdefabcdefabcdefabcdef"); let resolvePoll: ((value: VideoAccountManagement) => void) | undefined;
    const { api } = setup(management({ accounts: [], loginStatuses: [], connections: [old], connection: old }));
    vi.mocked(api.pollConnection).mockImplementation(() => new Promise((resolve) => { resolvePoll = resolve; }));
    vi.mocked(api.cancelConnection).mockResolvedValue(management({ accounts: [], loginStatuses: [], connections: [old], connection: old }));
    vi.mocked(api.add).mockResolvedValue(management({ accounts: [], loginStatuses: [], connections: [old, fresh], connection: fresh }));
    const onConnected = vi.fn(); render(<VideoAccountManager api={api} t={t} initialPlatform="douyin" onConnected={onConnected} />);
    await waitFor(() => expect(api.pollConnection).toHaveBeenCalledWith({ connectionId: old.connectionId })); fireEvent.click(screen.getByRole("button", { name: "取消连接" }));
    await waitFor(() => expect(api.cancelConnection).toHaveBeenCalledWith({ connectionId: old.connectionId }));
    expect(screen.getByRole("button", { name: "连接账号" })).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "连接账号" })); fireEvent.click(screen.getByRole("button", { name: "打开登录页" }));
    await waitFor(() => expect(api.add).toHaveBeenCalledOnce()); expect(api.add).toHaveBeenCalledWith({ platform: "douyin", confirmed: true }); await waitFor(() => expect(api.pollConnection).toHaveBeenCalledWith({ connectionId: fresh.connectionId }));
    resolvePoll?.(management({ accounts: [account], loginStatuses: [{ platform: "douyin", accountProfile: "creator", state: "verified", checkedAt: time }], connections: [{ ...old, state: "connected", account }], connection: { ...old, state: "connected", account } }));
    await new Promise((resolve) => setTimeout(resolve, 0)); expect(onConnected).not.toHaveBeenCalled();
  });

  it("does not create a replacement while the previous cancellation fails", async () => {
    const connection = pending(); const { api } = setup(management({ accounts: [], loginStatuses: [], connections: [connection], connection }));
    vi.mocked(api.pollConnection).mockImplementation(() => new Promise(() => undefined)); vi.mocked(api.cancelConnection).mockRejectedValue(new Error("取消失败"));
    render(<VideoAccountManager api={api} t={t} initialPlatform="douyin" />); await waitFor(() => expect(api.pollConnection).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "新建连接" })); await screen.findByText("取消失败");
    expect(api.add).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "取消连接" })).toBeTruthy();
  });
  it("prefers the newly returned connection over an older active record", async () => {
    const old = pending("vac-111111111111111111111111"); const fresh = pending("vac-222222222222222222222222"); const { api } = setup(management({ accounts: [], loginStatuses: [] }));
    vi.mocked(api.add).mockResolvedValue(management({ accounts: [], loginStatuses: [], connections: [old, fresh], connection: fresh }));
    render(<VideoAccountManager api={api} t={t} initialPlatform="douyin" />); await screen.findByRole("heading", { name: "账号管理 (0)" }); fireEvent.click(screen.getByRole("button", { name: "打开登录页" }));
    await waitFor(() => expect(api.add).toHaveBeenCalledWith({ platform: "douyin", confirmed: true })); await waitFor(() => expect(api.pollConnection).toHaveBeenCalledWith({ connectionId: fresh.connectionId })); expect(api.pollConnection).not.toHaveBeenCalledWith({ connectionId: old.connectionId });
  });

  it("cancels a pending poll on unmount even while the connection still says waiting_login", async () => {
    const connection = pending(); let resolvePoll: ((value: VideoAccountManagement) => void) | undefined; const onConnected = vi.fn(); const { api } = setup(management({ accounts: [], loginStatuses: [], connections: [connection], connection }));
    vi.mocked(api.pollConnection).mockImplementation(() => new Promise((resolve) => { resolvePoll = resolve; })); const view = render(<VideoAccountManager api={api} t={t} initialPlatform="douyin" onConnected={onConnected} />);
    await waitFor(() => expect(api.pollConnection).toHaveBeenCalledWith({ connectionId: connection.connectionId })); view.unmount(); await waitFor(() => expect(api.cancelConnection).toHaveBeenCalledWith({ connectionId: connection.connectionId }));
    resolvePoll?.(management({ accounts: [account], loginStatuses: [{ platform: "douyin", accountProfile: "creator", state: "verified", checkedAt: time }], connections: [{ ...connection, state: "connected", account }], connection: { ...connection, state: "connected", account } }));
    await new Promise((resolve) => setTimeout(resolve, 0)); expect(onConnected).not.toHaveBeenCalled();
  });

  it("recognizes a persisted connection after polling throws", async () => {
    const connection = pending(); const connected = { ...connection, state: "connected" as const, account };
    const { api } = setup(management({ accounts: [], loginStatuses: [], connections: [connection], connection }));
    vi.mocked(api.list).mockResolvedValueOnce(management({ accounts: [], loginStatuses: [], connections: [connection], connection })).mockResolvedValueOnce(management({ accounts: [account], loginStatuses: [{ platform: "douyin", accountProfile: "creator", state: "verified", checkedAt: time }], connections: [connected], connection: connected }));
    vi.mocked(api.pollConnection).mockRejectedValue(new Error("浏览器响应超时")); const onConnected = vi.fn(); render(<VideoAccountManager api={api} t={t} initialPlatform="douyin" onConnected={onConnected} />);
    await screen.findByText("账号已验证并连接。"); expect(onConnected).toHaveBeenCalledWith(account); expect(screen.queryByRole("dialog", { name: "连接创作者账号" })).toBeNull();
  });

  it("updates the live management record after enabling and guides disabled accounts", async () => {
    const stopped = { ...account, enabled: false }; const { api } = setup(management({ accounts: [stopped] }));
    vi.mocked(api.setEnabled).mockResolvedValue(management({ accounts: [account] })); render(<VideoAccountManager api={api} t={t} />);
    fireEvent.click(await screen.findByRole("button", { name: "管理" })); expect((screen.getByRole("button", { name: "重新验证" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "启用" })); await waitFor(() => expect(screen.getByRole("button", { name: "停用" })).toBeTruthy());
  });

  it("uses a confirmation before removal and exposes cleanup retry in 账号连接问题", async () => {
    const { api, set } = setup(); vi.mocked(api.remove).mockImplementation(async () => { const next = management({ accounts: [{ ...account, enabled: false, removalPending: true }] }); set(next); throw new Error("隔离登录清理未完成"); });
    render(<VideoAccountManager api={api} t={t} />); fireEvent.click(await screen.findByRole("button", { name: "管理" })); fireEvent.click(screen.getByRole("button", { name: "移除账号" })); expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "确认移除账号" })).getByRole("button", { name: "确认移除" })); await screen.findByText("隔离登录清理未完成"); await screen.findByRole("button", { name: "账号连接问题 (1)" }); fireEvent.click(screen.getByRole("button", { name: "账号连接问题 (1)" })); expect(screen.getByRole("button", { name: "重试移除" })).toBeTruthy();
  });
  it("expands problem accounts inline with eligible actions and removal confirmation", async () => {
    const legacy = { ...account, platformAccountId: null, connectedAt: null };
    const stopped = { ...legacy, accountProfile: "stopped", displayName: "待启用账号", enabled: false };
    const { api } = setup(management({ accounts: [legacy, stopped], loginStatuses: [] }));
    render(<VideoAccountManager api={api} t={t} />);
    const toggle = await screen.findByRole("button", { name: "账号连接问题 (2)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false"); expect(screen.queryByText("木子")).toBeNull();
    fireEvent.click(toggle); expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("待启用账号")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "重新验证" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getAllByRole("button", { name: "重新连接" })[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "启用" })); await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith({ platform: "douyin", accountProfile: "stopped", enabled: true }));
    fireEvent.click(screen.getAllByRole("button", { name: "移除账号" })[0]!); expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "确认移除账号" })).toBeTruthy();
  });

  it("keeps reconnect polling while collapsed and moves the verified account into the main list", async () => {
    const connection = pending(); const initial = management({ loginStatuses: [] , connectionPollIntervalMs: 20 });
    const { api, set } = setup(initial); const next = { ...initial, connection, connections: [connection] };
    vi.mocked(api.reconnect).mockImplementation(async () => { set(next); return next; });
    let resolvePoll: ((value: VideoAccountManagement) => void) | undefined;
    vi.mocked(api.pollConnection).mockImplementation(() => new Promise(resolve => { resolvePoll = resolve; }));
    const onConnected = vi.fn(); render(<VideoAccountManager api={api} t={t} onConnected={onConnected} />);
    fireEvent.click(await screen.findByRole("button", { name: "账号连接问题 (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    await waitFor(() => expect(api.reconnect).toHaveBeenCalledOnce()); await waitFor(() => expect(api.pollConnection).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull(); expect((screen.getByRole("button", { name: "正在连接" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /账号连接问题/ })); expect(screen.queryByRole("button", { name: "取消连接" })).toBeNull();
    resolvePoll?.(next); await waitFor(() => expect(api.pollConnection).toHaveBeenCalledTimes(2));
    expect(api.reconnect).toHaveBeenCalledOnce(); expect(api.cancelConnection).not.toHaveBeenCalled();
    const connected = { ...connection, state: "connected" as const, account };
    const success = management({ connection: connected, connections: [connected] }); set(success); resolvePoll?.(success);
    await screen.findByText("账号已验证并连接。"); expect(onConnected).toHaveBeenCalledWith(account);
    expect(screen.queryByRole("button", { name: /账号连接问题/ })).toBeNull(); expect(screen.getByRole("button", { name: "打开平台" })).toBeTruthy();
  });

  it("restores a problem connection inline and keeps cancellation failure in its row", async () => {
    const connection = pending(); const { api, set } = setup(management({ loginStatuses: [], connection, connections: [connection] }));
    let resolvePoll: ((value: VideoAccountManagement) => void) | undefined;
    vi.mocked(api.pollConnection).mockImplementation(() => new Promise(resolve => { resolvePoll = resolve; }));
    vi.mocked(api.cancelConnection).mockRejectedValueOnce(new Error("暂时无法取消"));
    const onConnected = vi.fn(); render(<VideoAccountManager api={api} t={t} onConnected={onConnected} />);
    await screen.findByRole("button", { name: "取消连接" }); expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /账号连接问题/ }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "取消连接" })); await screen.findByText("暂时无法取消");
    expect(screen.queryByRole("dialog")).toBeNull(); expect(api.reconnect).not.toHaveBeenCalled();
    const cancelled = { ...connection, state: "cancelled" as const }; const cancelledData = management({ loginStatuses: [], connection: cancelled, connections: [cancelled] });
    vi.mocked(api.cancelConnection).mockImplementation(async () => { set(cancelledData); return cancelledData; });
    fireEvent.click(screen.getByRole("button", { name: "取消连接" })); await screen.findByText("连接已取消。");
    resolvePoll?.(management({ connection: { ...connection, state: "connected", account } }));
    await new Promise(resolve => setTimeout(resolve, 0)); expect(onConnected).not.toHaveBeenCalled(); expect(api.reconnect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "重新连接" })).toBeTruthy();
  });

  it("reopens an attention-required connection inline without creating another connection", async () => {
    const connection = { ...pending(undefined, "needs_attention"), message: "浏览器已关闭，请重新打开" };
    const data = management({ loginStatuses: [], connection, connections: [connection] }); const { api } = setup(data);
    render(<VideoAccountManager api={api} t={t} />); await screen.findByText("浏览器已关闭，请重新打开");
    fireEvent.click(screen.getByRole("button", { name: "重新打开登录页" }));
    await waitFor(() => expect(api.reopenConnection).toHaveBeenCalledWith({ connectionId: connection.connectionId, confirmed: true }));
    expect(api.reconnect).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps a failed reconnect beside its account and retries without a modal", async () => {
    const { api, set } = setup(management({ loginStatuses: [] }));
    vi.mocked(api.reconnect).mockRejectedValueOnce(new Error("无法打开专用浏览器"));
    render(<VideoAccountManager api={api} t={t} />); fireEvent.click(await screen.findByRole("button", { name: /账号连接问题/ }));
    fireEvent.click(screen.getByRole("button", { name: "重新连接" })); await screen.findByText("无法打开专用浏览器");
    const region = screen.getByRole("region", { name: /账号连接问题/ }); expect(within(region).getByRole("alert").textContent).toContain("无法打开专用浏览器"); expect(screen.queryByRole("dialog")).toBeNull();
    const connection = pending(); const next = management({ loginStatuses: [], connection, connections: [connection] });
    vi.mocked(api.reconnect).mockImplementation(async () => { set(next); return next; });
    fireEvent.click(screen.getByRole("button", { name: "重新连接" })); await screen.findByRole("button", { name: "取消连接" });
    expect(api.reconnect).toHaveBeenCalledTimes(2); expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows only one reconnect request across problem rows", async () => {
    const second = { ...account, accountProfile: "second", displayName: "另一个账号" };
    const { api } = setup(management({ accounts: [account, second], loginStatuses: [] }));
    vi.mocked(api.reconnect).mockImplementation(() => new Promise(() => undefined));
    render(<VideoAccountManager api={api} t={t} />); fireEvent.click(await screen.findByRole("button", { name: /账号连接问题/ }));
    const buttons = screen.getAllByRole("button", { name: "重新连接" }); fireEvent.click(buttons[0]!); fireEvent.click(buttons[1]!);
    await waitFor(() => expect(api.reconnect).toHaveBeenCalledOnce());
    expect(api.reconnect).toHaveBeenCalledWith({ platform: "douyin", accountProfile: "creator", confirmed: true });
    fireEvent.click(screen.getByRole("button", { name: /账号连接问题/ })); expect(screen.getByRole("button", { name: /账号连接问题/ }).getAttribute("aria-expanded")).toBe("false");
  });

});
