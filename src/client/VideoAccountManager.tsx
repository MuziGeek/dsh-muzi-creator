import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
import { useEffect, useId, useRef, useState } from "react";
import { IconChevronDownOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";

import type { VideoAccount, VideoAccountFace, VideoAccountManagement, VideoConnection } from "../videoAccountSchemas.ts";
import type { MuziVideoPlatform } from "../muziTypes.ts";
import type { CreatorKey } from "./locales.ts";
import { PlatformMark, type PlatformId } from "./PlatformMark.tsx";
import { IslandButton, IslandModal, IslandSelect, IslandTag } from "./ui/IslandControls.tsx";
import { isVerifiedVideoAccount, notifyVideoAccountsChanged, useVideoAccountEpoch } from "./videoAccountState.ts";
import "./VideoAccountManager.css";

const PLATFORMS: MuziVideoPlatform[] = ["bilibili", "douyin", "wechat", "xiaohongshu"];
const ACTIVE_CONNECTIONS = new Set<VideoConnection["state"]>(["waiting_login", "checking", "needs_attention"]);
const TERMINAL_CONNECTIONS = new Set<VideoConnection["state"]>(["failed", "cancelled", "expired"]);
const platformIcon: Record<MuziVideoPlatform, PlatformId> = { bilibili: "bilibili", douyin: "douyin", wechat: "wechat", xiaohongshu: "xhs" };

export interface VideoAccountManagerProps { api: VideoAccountFace; t: (key: CreatorKey) => string; onConnected?: (account: VideoAccount) => void; initialPlatform?: MuziVideoPlatform; disabled?: boolean; }
function accountKey(account: Pick<VideoAccount, "platform" | "accountProfile">): string { return account.platform + ":" + account.accountProfile; }
function loginFor(data: VideoAccountManagement, account: VideoAccount) { return data.loginStatuses.find((item) => item.platform === account.platform && item.accountProfile === account.accountProfile); }
function issueLabel(data: VideoAccountManagement, account: VideoAccount): string {
  if (account.removalPending) return "本机登录资料尚未清理";
  const login = loginFor(data, account);
  if (account.platformAccountId === null || account.connectedAt === null) return "尚未完成平台账号连接";
  if (login?.state === "login_required") return "平台登录已失效";
  if (login?.state === "identity_mismatch") return "身份不匹配";
  if (login?.state === "challenge") return "需要人工处理";
  return "尚未完成验证";
}
function connectionFrom(data: VideoAccountManagement | null, id: string | null): VideoConnection | undefined { return data === null || id === null ? undefined : data.connection?.connectionId === id ? data.connection : data.connections.find((item) => item.connectionId === id); }
function activeConnection(data: VideoAccountManagement | null): VideoConnection | undefined {
  if (data === null) return undefined;
  if (data.connection !== undefined && ACTIVE_CONNECTIONS.has(data.connection.state)) return data.connection;
  return data.connections.find((item) => ACTIVE_CONNECTIONS.has(item.state));
}
function newConnection(result: VideoAccountManagement | undefined, platform: MuziVideoPlatform): VideoConnection | undefined {
  if (result?.connection !== undefined && ACTIVE_CONNECTIONS.has(result.connection.state)) return result.connection;
  return result?.connections.find((item) => ACTIVE_CONNECTIONS.has(item.state) && item.platform === platform);
}
function connectionLabel(connection: VideoConnection): string { return ({ waiting_login: "等待登录", checking: "正在核验", connected: "已连接", needs_attention: "需要处理", failed: "连接失败", cancelled: "已取消", expired: "已过期" })[connection.state]; }

/** Manages verified platform accounts while keeping recoverable login problems out of the primary list. */
export function VideoAccountManager({ api, t, onConnected, initialPlatform, disabled = false }: VideoAccountManagerProps) {
  const id = useId(); const epoch = useVideoAccountEpoch();
  const mounted = useRef(true); const scope = useRef(0); const mutation = useRef(0); const loadRequest = useRef(0);
  const actionBusy = useRef(false); const checkBusy = useRef(false); const checkingConnection = useRef<string | null>(null); const checkEpoch = useRef(0);
  const selectedConnectionRef = useRef<string | null>(null); const dataRef = useRef<VideoAccountManagement | null>(null); const pausedRef = useRef(false);
  const restored = useRef(false); const cancelledConnectionIds = useRef(new Set<string>()); const ignoreOwnEpoch = useRef(false);
  const [data, setData] = useState<VideoAccountManagement | null>(null); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(false); const [connecting, setConnecting] = useState(false);
  const [platform, setPlatform] = useState<MuziVideoPlatform>("bilibili"); const [selectedConnection, setSelectedConnection] = useState<string | null>(null); const [connectionPaused, setConnectionPaused] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false); const [managed, setManaged] = useState<VideoAccount | null>(null); const [removing, setRemoving] = useState<VideoAccount | null>(null);
  const [issueTarget, setIssueTarget] = useState<string | null>(null); const issueTargetRef = useRef<string | null>(null);
  const startingConnection = useRef(false);
  const selectIssue = (key: string | null): void => { issueTargetRef.current = key; setIssueTarget(key); };
  const hasInlineConnection = (): boolean => {
    const selected = connectionFrom(dataRef.current, selectedConnectionRef.current);
    return issueTargetRef.current !== null && selected !== undefined && accountKey(selected) === issueTargetRef.current && ACTIVE_CONNECTIONS.has(selected.state);
  };
  const label = (value: MuziVideoPlatform) => t(("accounts.platform." + value) as CreatorKey);
  const current = (requestScope: number, requestMutation: number): boolean => mounted.current && scope.current === requestScope && mutation.current === requestMutation;
  const selectConnection = (connectionId: string | null): void => { selectedConnectionRef.current = connectionId; setSelectedConnection(connectionId); };
  const pauseConnection = (value: boolean): void => { pausedRef.current = value; setConnectionPaused(value); };
  const apply = (next: VideoAccountManagement, changed = false): void => { if (!mounted.current) return; dataRef.current = next; setData(next); if (changed) { ignoreOwnEpoch.current = true; notifyVideoAccountsChanged(); } };
  const load = async (changed = false, clearError = false): Promise<VideoAccountManagement | undefined> => {
    const request = ++loadRequest.current; const requestScope = scope.current; const requestMutation = mutation.current;
    try { const next = await api.list(); if (!current(requestScope, requestMutation) || request !== loadRequest.current) return undefined; apply(next, changed); if (clearError) setError(null); return next; }
    catch (cause) { if (current(requestScope, requestMutation) && request === loadRequest.current) setError(cause instanceof Error ? cause.message : t("accounts.loadFailed")); return undefined; }
  };
  const refreshAfterAction = async (requestScope: number, requestMutation: number): Promise<VideoAccountManagement | undefined> => {
    const request = ++loadRequest.current;
    try { const next = await api.list(); if (!current(requestScope, requestMutation) || request !== loadRequest.current) return undefined; apply(next, true); return next; }
    catch (cause) { if (current(requestScope, requestMutation)) setError(cause instanceof Error ? cause.message : t("accounts.actionFailed")); return undefined; }
  };
  const runAction = async (work: () => Promise<VideoAccountManagement>, message?: string): Promise<VideoAccountManagement | undefined> => {
    if (disabled || actionBusy.current) return undefined;
    const requestScope = scope.current; const requestMutation = ++mutation.current; actionBusy.current = true; setBusy(true); setError(null); setNotice(null);
    try { const result = await work(); if (!current(requestScope, requestMutation)) return undefined; apply(result, true); if (message !== undefined) setNotice(message); return result; }
    catch (cause) { if (!current(requestScope, requestMutation)) return undefined; setError(cause instanceof Error ? cause.message : t("accounts.actionFailed")); return await refreshAfterAction(requestScope, requestMutation); }
    finally { if (current(requestScope, requestMutation)) setBusy(false); actionBusy.current = false; }
  };
  const finishIfConnected = (next: VideoAccountManagement | undefined, connectionId: string, requestScope: number, requestMutation: number, check: number): void => {
    const connection = connectionFrom(next ?? null, connectionId);
    if (!current(requestScope, requestMutation) || check !== checkEpoch.current || selectedConnectionRef.current !== connectionId || next === undefined || connection === undefined || connection.state !== "connected" || connection.account === null) return;
    const connectedAccount = connection.account; if (connectedAccount === null) return;
    const actualAccount = next.accounts.find((account) => accountKey(account) === accountKey(connectedAccount));
    if (actualAccount === undefined || !isVerifiedVideoAccount(next, actualAccount)) return;
    selectConnection(null); selectIssue(null); pauseConnection(false); setConnecting(false); setError(null); setNotice("账号已验证并连接。"); onConnected?.(actualAccount);
  };
  const checkSelected = async (): Promise<void> => {
    const connectionId = selectedConnectionRef.current;
    if (connectionId === null || checkBusy.current || disabled || pausedRef.current) return;
    const requestScope = scope.current; const requestMutation = mutation.current; const check = ++checkEpoch.current;
    checkBusy.current = true; checkingConnection.current = connectionId; setChecking(true); setError(null);
    try { await api.pollConnection({ connectionId }); if (!current(requestScope, requestMutation) || check !== checkEpoch.current) return; finishIfConnected(await refreshAfterAction(requestScope, requestMutation), connectionId, requestScope, requestMutation, check); }
    catch (cause) { if (!current(requestScope, requestMutation) || check !== checkEpoch.current) return; setError(cause instanceof Error ? cause.message : t("accounts.actionFailed")); finishIfConnected(await refreshAfterAction(requestScope, requestMutation), connectionId, requestScope, requestMutation, check); }
    finally { if (checkingConnection.current === connectionId) { checkBusy.current = false; checkingConnection.current = null; if (mounted.current) setChecking(false); } }
  };
  const clearForNewConnection = async (): Promise<boolean> => {
    if (actionBusy.current || disabled) return false;
    const connectionId = selectedConnectionRef.current;
    if (connectionId === null || TERMINAL_CONNECTIONS.has(connectionFrom(dataRef.current, connectionId)?.state ?? "cancelled")) { restored.current = true; pauseConnection(false); selectConnection(null); return true; }
    const requestScope = scope.current; const requestMutation = ++mutation.current; checkEpoch.current += 1; pauseConnection(true); actionBusy.current = true; setBusy(true);
    try {
      const result = await api.cancelConnection({ connectionId });
      if (!current(requestScope, requestMutation)) return false;
      apply(result, true); restored.current = true; cancelledConnectionIds.current.add(connectionId); checkBusy.current = false; checkingConnection.current = null; setChecking(false); pauseConnection(false); selectConnection(null); return true;
    } catch (cause) {
      if (current(requestScope, requestMutation)) { setError(cause instanceof Error ? cause.message : t("accounts.actionFailed")); if (issueTargetRef.current === null) setConnecting(true); else setIssuesOpen(true); }
      return false;
    } finally { actionBusy.current = false; if (current(requestScope, requestMutation)) setBusy(false); }
  };
  const cancelSelected = async (): Promise<void> => { if (await clearForNewConnection()) { setConnecting(false); setError(null); setNotice("连接已取消。"); } };
  const startConnection = async (): Promise<void> => {
    if (hasInlineConnection() || startingConnection.current) return;
    startingConnection.current = true;
    try {
      if (!await clearForNewConnection()) return; const result = await runAction(() => api.add({ platform, confirmed: true }), "已打开登录页。完成登录后会自动核验。"); const connection = newConnection(result, platform);
      if (connection !== undefined) { cancelledConnectionIds.current.delete(connection.connectionId); selectConnection(connection.connectionId); pauseConnection(false); }
    } finally { startingConnection.current = false; }
  };
  const reconnect = async (account: VideoAccount, inline = false): Promise<void> => {
    if (actionBusy.current || startingConnection.current || disabled || hasInlineConnection()) return;
    if (inline && ACTIVE_CONNECTIONS.has(connectionFrom(dataRef.current, selectedConnectionRef.current)?.state ?? "cancelled")) return;
    startingConnection.current = true;
    try {
      if (!await clearForNewConnection()) return;
      setManaged(null); selectIssue(inline ? accountKey(account) : null); if (inline) { setIssuesOpen(true); setConnecting(false); }
      const result = await runAction(() => api.reconnect({ platform: account.platform, accountProfile: account.accountProfile, confirmed: true }), "已打开重新登录页。"); const connection = newConnection(result, account.platform);
      if (connection !== undefined) { cancelledConnectionIds.current.delete(connection.connectionId); setPlatform(account.platform); selectConnection(connection.connectionId); pauseConnection(false); setConnecting(!inline); }
    } finally { startingConnection.current = false; }
  };
  const reopenSelected = async (): Promise<void> => {
    const connectionId = selectedConnectionRef.current; if (connectionId === null) return;
    const result = await runAction(() => api.reopenConnection({ connectionId, confirmed: true }), "已重新打开登录页。"); const next = result?.connection?.connectionId === connectionId ? result.connection : connectionFrom(result ?? null, connectionId);
    if (next !== undefined && ACTIVE_CONNECTIONS.has(next.state)) { selectConnection(next.connectionId); pauseConnection(false); }
  };

  useEffect(() => {
    mounted.current = true; scope.current += 1; mutation.current += 1; loadRequest.current += 1; checkEpoch.current += 1; restored.current = false; cancelledConnectionIds.current.clear(); selectConnection(null); dataRef.current = null; pauseConnection(false);
    setData(null); selectIssue(null); setError(null); setNotice(null); setBusy(false); setChecking(false); setConnecting(initialPlatform !== undefined); setIssuesOpen(false); setManaged(null); setRemoving(null); if (initialPlatform !== undefined) setPlatform(initialPlatform); void load(false, true);
    return () => { const connectionId = checkingConnection.current; mounted.current = false; scope.current += 1; checkEpoch.current += 1; if (connectionId !== null) void api.cancelConnection({ connectionId }).catch(() => undefined); };
  }, [api]);
  useEffect(() => { if (ignoreOwnEpoch.current) { ignoreOwnEpoch.current = false; return; } if (data !== null) void load(); }, [epoch]);
  useEffect(() => { if (initialPlatform !== undefined && !hasInlineConnection()) { setPlatform(initialPlatform); setConnecting(true); } }, [initialPlatform]);
  useEffect(() => {
    if (data === null || selectedConnection !== null || restored.current) return;
    restored.current = true; const candidate = activeConnection(data);
    if (candidate === undefined || cancelledConnectionIds.current.has(candidate.connectionId)) return;
    const account = data.accounts.find((item) => accountKey(item) === accountKey(candidate));
    if (account !== undefined && !account.removalPending && !isVerifiedVideoAccount(data, account)) { selectIssue(accountKey(account)); setIssuesOpen(true); setConnecting(false); }
    selectConnection(candidate.connectionId);
  }, [data, selectedConnection]);
  const selectedState = connectionFrom(data, selectedConnection)?.state; const pollInterval = data?.connectionPollIntervalMs ?? 2000;
  useEffect(() => {
    if (selectedConnection === null || selectedState === undefined || !ACTIVE_CONNECTIONS.has(selectedState) || connectionPaused) return;
    let disposed = false; const tick = (): void => { if (!disposed && !pausedRef.current && !checkBusy.current) void checkSelected(); }; tick(); const timer = window.setInterval(tick, pollInterval);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [api, selectedConnection, selectedState, pollInterval, connectionPaused]);

  const verified = data?.accounts.filter((account) => isVerifiedVideoAccount(data, account)) ?? []; const issues = data?.accounts.filter((account) => !isVerifiedVideoAccount(data, account)) ?? [];
  const connection = connectionFrom(data, selectedConnection); const managedCurrent = managed === null ? null : data?.accounts.find((account) => accountKey(account) === accountKey(managed)) ?? null; const removingCurrent = removing === null ? null : data?.accounts.find((account) => accountKey(account) === accountKey(removing)) ?? null;
  const locked = busy || disabled; const hasPausedConnection = connection !== undefined && ACTIVE_CONNECTIONS.has(connection.state); const hasTerminalConnection = connection !== undefined && TERMINAL_CONNECTIONS.has(connection.state); const managementTitle = managedCurrent === null ? "" : label(managedCurrent.platform) + " · " + managedCurrent.displayName;
  const inlineConnection = issueTarget !== null && connection !== undefined && accountKey(connection) === issueTarget ? connection : undefined;
  const inlineActive = inlineConnection !== undefined && ACTIVE_CONNECTIONS.has(inlineConnection.state);
  const issueErrorVisible = issueTarget !== null && issues.some((account) => accountKey(account) === issueTarget);
  const canCheck = (account: VideoAccount): boolean => account.enabled && account.platformAccountId !== null && account.connectedAt !== null && !account.removalPending;
  return <section className="videoAccountManager" aria-labelledby={id + "-title"} aria-busy={busy}>
    <header className="videoAccountHeading"><div><h2 id={id + "-title"}>{t("accounts.title")} {data !== null && <span className="videoAccountCount">({verified.length})</span>}</h2><p>只有最近验证通过的账号会显示在这里。</p></div><IslandButton icon={<WorkbenchIcon name="connect" />} type="primary" size="small" disabled={locked || data === null || inlineActive} onClick={() => { selectIssue(null); setConnecting(true); pauseConnection(false); setError(null); }}>{inlineActive ? "正在连接" : issueTarget !== null ? "连接账号" : hasPausedConnection ? "继续连接" : hasTerminalConnection ? "新建连接" : "连接账号"}</IslandButton></header>
    {error !== null && !connecting && !issueErrorVisible && <div className="videoAccountMessage error" role="alert">{error}<IslandButton icon={<WorkbenchIcon name="refresh" />} type="text" size="small" disabled={locked} onClick={() => { void load(false, true); }}>重新读取</IslandButton></div>}
    {notice !== null && <p className="videoAccountMessage" role="status">{notice}</p>}
    {data === null ? error === null && <p className="videoAccountState" role="status">{t("accounts.loading")}</p> : verified.length === 0 ? <p className="videoAccountState" role="status">暂无已验证账号。连接并完成验证后会显示在这里。</p> : <div className="videoAccountPaper"><ul className="videoAccountList">{verified.map((account) => { const login = loginFor(data, account); return <li key={accountKey(account)}><div className="videoAccountIdentity"><PlatformMark id={platformIcon[account.platform]} size={20} /><div><strong>{account.displayName}</strong><small>{label(account.platform)} · {account.platformAccountId}</small></div><IslandTag size="small" color={account.enabled ? "app-green" : "brown"}>{account.enabled ? "已启用" : "已停用"}</IslandTag></div><p>最近验证：<time dateTime={login?.checkedAt ?? undefined}>{new Date(login?.checkedAt ?? "").toLocaleString()}</time></p><div className="videoAccountActions"><IslandButton icon={<WorkbenchIcon name="external-link" />} type="default" size="small" disabled={locked || inlineActive || !account.enabled} onClick={() => { void runAction(() => api.openLogin({ platform: account.platform, accountProfile: account.accountProfile, confirmed: true }), "已打开平台页面。"); }}>打开平台</IslandButton><IslandButton type="text" size="small" disabled={locked || inlineActive} onClick={() => { setManaged(account); }}>管理</IslandButton></div></li>; })}</ul></div>}
    {issues.length > 0 && <section className="videoAccountProblems">
      <h3><IslandButton type="text" className="videoIssueToggle" id={id + "-issues-toggle"} aria-expanded={issuesOpen} aria-controls={id + "-issues"} onClick={() => { setIssuesOpen((open) => !open); }}>
        <span>账号连接问题 ({issues.length})</span>{inlineActive && <span className="videoAccountCount">正在连接</span>}<IconChevronDownOutline14 className={issuesOpen ? "videoIssueChevron open" : "videoIssueChevron"} aria-hidden="true" />
      </IslandButton></h3>
      <div id={id + "-issues"} role="region" aria-labelledby={id + "-issues-toggle"} hidden={!issuesOpen}>{issuesOpen && <div className="videoAccountPaper"><ul className="videoAccountList videoIssueList">
        {issues.map((account) => {
          const key = accountKey(account); const selected = inlineConnection !== undefined && accountKey(inlineConnection) === key ? inlineConnection : undefined;
          const active = selected !== undefined && ACTIVE_CONNECTIONS.has(selected.state);
          return <li key={key}>
            <div className="videoAccountIdentity"><PlatformMark id={platformIcon[account.platform]} size={20} /><div><strong>{account.displayName}</strong><small>{label(account.platform)}{account.platformAccountId !== null && <> · {account.platformAccountId}</>}</small></div><IslandTag size="small" color="brown">{account.removalPending ? "移除未完成" : account.enabled ? "待处理" : "已停用"}</IslandTag></div>
            <p>{issueLabel(data!, account)}</p>
            <div className="videoAccountActions">
              {account.removalPending ? <IslandButton icon={<WorkbenchIcon name="remove" />} type="primary" danger size="small" disabled={locked || hasPausedConnection} onClick={() => { selectIssue(key); setRemoving(account); }}>重试移除</IslandButton> : <>
                {!account.enabled && <IslandButton type="default" size="small" disabled={locked || hasPausedConnection} onClick={() => { selectIssue(key); void runAction(() => api.setEnabled({ platform: account.platform, accountProfile: account.accountProfile, enabled: true }), "账号已启用。"); }}>启用</IslandButton>}
                <IslandButton icon={<WorkbenchIcon name="connect" />} type="default" size="small" disabled={locked || hasPausedConnection || !account.enabled} onClick={() => { void reconnect(account, true); }}>重新连接</IslandButton>
                <IslandButton icon={<WorkbenchIcon name="verify" />} type="text" size="small" disabled={locked || hasPausedConnection || !canCheck(account)} onClick={() => { selectIssue(key); void runAction(() => api.checkLogin({ platform: account.platform, accountProfile: account.accountProfile, confirmed: true }), "已重新验证账号。"); }}>重新验证</IslandButton>
                <IslandButton icon={<WorkbenchIcon name="remove" />} type="text" size="small" className="videoAccountRemoveAction" disabled={locked || hasPausedConnection} onClick={() => { selectIssue(key); setRemoving(account); }}>移除账号</IslandButton>
              </>}
            </div>
            {(selected !== undefined || (issueTarget === key && error !== null)) && <div className="videoIssueProgress">
              {selected !== undefined && <div className="videoConnectionStatus" role="status"><strong>{connectionLabel(selected)}</strong><p>{selected.message ?? "请在专用浏览器完成登录，页面会自动核验账号。"}</p></div>}
              {issueTarget === key && error !== null && <p className="videoAccountMessage error" role="alert">{error}</p>}
              {active && <div className="videoAccountActions">
                <IslandButton icon={<WorkbenchIcon name="verify" />} type="default" size="small" disabled={locked || checking} onClick={() => { if (connectionPaused) pauseConnection(false); else void checkSelected(); }}>{connectionPaused ? "继续检查" : "重新检查"}</IslandButton>
                {selected.state === "needs_attention" && <IslandButton icon={<WorkbenchIcon name="external-link" />} type="default" size="small" disabled={locked} onClick={() => { void reopenSelected(); }}>重新打开登录页</IslandButton>}
                <IslandButton icon={<WorkbenchIcon name="disconnect" />} type="text" size="small" disabled={locked} onClick={() => { void cancelSelected(); }}>取消连接</IslandButton>
              </div>}
            </div>}
          </li>;
        })}
      </ul></div>}</div>
    </section>}
    {connecting && issueTarget === null && <IslandModal typewriter={false} open={true} title="连接创作者账号" onClose={() => { if (!locked) { setConnecting(false); pauseConnection(connection !== undefined); } }} footer={connection === undefined ? <><IslandButton type="text" disabled={locked} onClick={() => { setConnecting(false); }}>暂时关闭</IslandButton><IslandButton icon={<WorkbenchIcon name="external-link" />} type="primary" loading={busy} disabled={locked} onClick={() => { void startConnection(); }}>打开登录页</IslandButton></> : TERMINAL_CONNECTIONS.has(connection.state) ? <><IslandButton type="text" disabled={locked} onClick={() => { setConnecting(false); }}>暂时关闭</IslandButton><IslandButton icon={<WorkbenchIcon name="add" />} type="primary" disabled={locked} onClick={() => { void clearForNewConnection(); }}>新建连接</IslandButton></> : <><IslandButton type="text" disabled={locked} onClick={() => { setConnecting(false); pauseConnection(true); }}>暂时关闭</IslandButton>{connection.state === "needs_attention" && <IslandButton icon={<WorkbenchIcon name="external-link" />} type="default" disabled={locked} onClick={() => { void reopenSelected(); }}>重新打开登录页</IslandButton>}<IslandButton icon={<WorkbenchIcon name="verify" />} type="default" disabled={locked || checking} onClick={() => { void checkSelected(); }}>重新检查</IslandButton><IslandButton icon={<WorkbenchIcon name="disconnect" />} type="text" disabled={locked} onClick={() => { void cancelSelected(); }}>取消连接</IslandButton><IslandButton icon={<WorkbenchIcon name="add" />} type="text" disabled={locked} onClick={() => { void clearForNewConnection(); }}>新建连接</IslandButton></>}><label className="videoAccountDialogField"><span id={id + "-platform"}>平台</span><IslandSelect aria-labelledby={id + "-platform"} value={platform} disabled={locked || connection !== undefined} options={PLATFORMS.map((value) => ({ key: value, label: label(value) }))} onChange={(value: string) => { setPlatform(value as MuziVideoPlatform); }} /></label>{error !== null && <p className="videoAccountMessage error" role="alert">{error}</p>}{connection === undefined ? <p>在隔离页面完成登录后，页面会自动核验身份。</p> : <div className="videoConnectionStatus" role="status"><strong>{label(connection.platform)} · {connectionLabel(connection)}</strong><p>{connection.message ?? (connection.state === "needs_attention" ? "请重新打开登录页完成处理。" : "完成登录后会自动检查。")}</p></div>}</IslandModal>}
    {managedCurrent !== null && <IslandModal
      className="videoAccountManagementModal"
      typewriter={false}
      open={true}
      title={<span className="videoAccountManagementTitle">{"管理 " + managementTitle}</span>}
      onClose={() => { if (!locked) setManaged(null); }}
      footer={<div className="videoAccountManagementFooter">
        <IslandButton icon={<WorkbenchIcon name="remove" />} type="default" danger className="videoAccountManagementRemove" disabled={locked} onClick={() => { setRemoving(managedCurrent); setManaged(null); }}>移除账号</IslandButton>
        <IslandButton type="default" disabled={locked} onClick={() => { setManaged(null); }}>关闭</IslandButton>
      </div>}
    >
      <div className="videoAccountManagementBody">
        <p>可在此启用、停用、重新验证或解除该账号的连接。</p>
        <div className="videoAccountManagementStatus">
          <span>{managedCurrent.enabled ? "账号已启用" : "账号已停用"}</span>
          <IslandButton icon={<WorkbenchIcon name={managedCurrent.enabled ? "stop" : "verify"} />} type="default" disabled={locked || managedCurrent.removalPending === true} onClick={() => { void runAction(() => api.setEnabled({ platform: managedCurrent.platform, accountProfile: managedCurrent.accountProfile, enabled: !managedCurrent.enabled }), managedCurrent.enabled ? "账号已停用。" : "账号已启用。"); }}>{managedCurrent.enabled ? "停用" : "启用"}</IslandButton>
        </div>
        <div className="videoAccountManagementActions">
          <IslandButton icon={<WorkbenchIcon name="verify" />} type="default" disabled={locked || !canCheck(managedCurrent)} onClick={() => { void runAction(() => api.checkLogin({ platform: managedCurrent.platform, accountProfile: managedCurrent.accountProfile, confirmed: true }), "已重新验证账号。"); }}>重新验证</IslandButton>
          <IslandButton icon={<WorkbenchIcon name="connect" />} type="default" disabled={locked || !managedCurrent.enabled || managedCurrent.removalPending === true} onClick={() => { void reconnect(managedCurrent); }}>重新连接</IslandButton>
        </div>
        {!managedCurrent.enabled && <p>启用账号后才能打开平台、重新验证或重新连接。</p>}
      </div>
    </IslandModal>}
    {removingCurrent !== null && <IslandModal typewriter={false} open={true} title={removingCurrent.removalPending ? "确认重试移除" : "确认移除账号"} onClose={() => { if (!locked) setRemoving(null); }} footer={<><IslandButton type="text" disabled={locked} onClick={() => { setRemoving(null); }}>取消</IslandButton><IslandButton icon={<WorkbenchIcon name="remove" />} type="primary" danger loading={busy} disabled={locked} onClick={() => { void runAction(() => api.remove({ platform: removingCurrent.platform, accountProfile: removingCurrent.accountProfile, confirmed: true }), "账号已移除。").then(() => { if (mounted.current) setRemoving(null); }); }}>确认移除</IslandButton></>}><p>将解除「{label(removingCurrent.platform)} · {removingCurrent.displayName}」的绑定，并清除该账号专用浏览器的本机登录资料。内容与已保存的发布记录不会删除。</p></IslandModal>}
  </section>;
}
