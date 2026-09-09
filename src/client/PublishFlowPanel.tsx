import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";

import type { PublishFlow, PublishFlowFace } from "../publishFlowSchemas.ts";
import type { VideoAccount, VideoAccountFace, VideoAccountManagement } from "../videoAccountSchemas.ts";
import type { MuziProjectDetail, MuziVideoPlatform, VideoPublishMode } from "../muziTypes.ts";
import type { CreatorKey } from "./locales.ts";
import { IslandButton, IslandCheckbox, IslandInput, IslandModal, IslandSelect, IslandSwitch, IslandTag } from "./ui/IslandControls.tsx";
import { isVerifiedVideoAccount, useVideoAccountEpoch } from "./videoAccountState.ts";
import "./PublishFlowPanel.css";

const PLATFORMS: Array<{ key: MuziVideoPlatform; label: string }> = [{ key: "bilibili", label: "B站" }, { key: "douyin", label: "抖音" }, { key: "wechat", label: "视频号" }, { key: "xiaohongshu", label: "小红书" }];
type Draft = { enabled: boolean; accountProfile: string; mode: VideoPublishMode; scheduledAt: string };
const modeLabel: Record<VideoPublishMode, string> = { prepare_only: "仅准备", publish_now: "立即发布", schedule: "定时发布" };
const defaultDrafts = (): Record<MuziVideoPlatform, Draft> => Object.fromEntries(PLATFORMS.map(({ key }) => [key, { enabled: true, accountProfile: "", mode: "prepare_only", scheduledAt: "" }])) as Record<MuziVideoPlatform, Draft>;
const localShanghai = (value: string | undefined): string => value?.replace(/:00\+08:00$/, "") ?? "";
const toShanghai = (value: string): string => value + ":00+08:00";
const stateLabel = (state: PublishFlow["targets"][number]["state"]): string => ({ pending: "等待开始", checking: "正在检查", preparing: "正在准备", ready: "等待确认", prepared: "已完成准备", committing: "正在提交", published: "已发布", scheduled: "已排程", blocked: "需要处理", unknown: "待核实" })[state];
const approvalFor = (target: PublishFlow["targets"][number]) => target.task?.platforms[target.platform]?.approvalSummary ?? null;
const canCommit = (target: PublishFlow["targets"][number]): boolean => target.state === "ready" && approvalFor(target) !== null && target.mode !== "prepare_only";
const accountAvailableIn = (accounts: VideoAccount[], accountProfile: string): boolean => accounts.some((account) => account.accountProfile === accountProfile);
const verifiedAccounts = (registry: VideoAccountManagement | null, platform: MuziVideoPlatform): VideoAccount[] => registry?.accounts.filter((account) => account.platform === platform && account.enabled && isVerifiedVideoAccount(registry, account)) ?? [];

export interface PublishFlowPanelProps { project: MuziProjectDetail; api: PublishFlowFace; accounts: VideoAccountFace; t: (key: CreatorKey) => string; onChanged?: () => void; }

/** Durable multi-platform publishing controls that only use currently verified account bindings. */
export function PublishFlowPanel({ project, api, accounts, t, onChanged }: PublishFlowPanelProps) {
  const id = useId();
  const accountEpoch = useVideoAccountEpoch();
  const mounted = useRef(true);
  const polling = useRef(false);
  const invalidating = useRef(false);
  const loadRevision = useRef(0);
  const operationRevision = useRef(0);
  const scopeRevision = useRef(0);
  const firstLoad = useRef(true);
  const [registry, setRegistry] = useState<VideoAccountManagement | null>(null);
  const [flow, setFlow] = useState<PublishFlow | null>(null);
  const [drafts, setDrafts] = useState(defaultDrafts);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invalidatingBusy, setInvalidatingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [commitSelection, setCommitSelection] = useState<Set<MuziVideoPlatform>>(new Set());
  const eligible = (platform: MuziVideoPlatform, data = registry): VideoAccount[] => verifiedAccounts(data, platform);
  const accountAvailable = (platform: MuziVideoPlatform, profile: string, data = registry): boolean => eligible(platform, data).some((account) => account.accountProfile === profile);
  const current = (scope: number, operation: number): boolean => mounted.current && scope === scopeRevision.current && operation === operationRevision.current;
  const update = (next: PublishFlow, scope: number, operation: number): void => { if (current(scope, operation)) { setFlow(next); onChanged?.(); } };
  const restoreDrafts = (nextRegistry: VideoAccountManagement, nextFlow: PublishFlow | null): void => setDrafts((current) => Object.fromEntries(PLATFORMS.map(({ key }) => {
    const target = nextFlow?.targets.find((item) => item.platform === key);
    const verified = verifiedAccounts(nextRegistry, key);
    if (target !== undefined) return [key, accountAvailableIn(verified, target.accountProfile) ? { enabled: true, accountProfile: target.accountProfile, mode: target.mode, scheduledAt: localShanghai(target.scheduledAt) } : { ...current[key], enabled: false, accountProfile: "" }];
    if (nextFlow !== null) return [key, { ...current[key], enabled: false, accountProfile: "" }];
    if (accountAvailableIn(verified, current[key].accountProfile)) return [key, current[key]];
    if (verified[0] !== undefined) return [key, { ...current[key], accountProfile: verified[0].accountProfile, enabled: true }];
    return [key, { ...current[key], accountProfile: "", enabled: false }];
  })) as Record<MuziVideoPlatform, Draft>);
  const clearUnavailableDrafts = (nextRegistry: VideoAccountManagement): void => setDrafts((current) => Object.fromEntries(PLATFORMS.map(({ key }) => {
    const draft = current[key];
    return [key, accountAvailableIn(verifiedAccounts(nextRegistry, key), draft.accountProfile) ? draft : { ...draft, enabled: false, accountProfile: "" }];
  })) as Record<MuziVideoPlatform, Draft>);
  const invalidateUnavailable = (nextFlow: PublishFlow, nextRegistry: VideoAccountManagement, scope: number): void => {
    const platforms = nextFlow.targets.filter((target) => (target.state === "ready" || target.state === "prepared") && !accountAvailableIn(verifiedAccounts(nextRegistry, target.platform), target.accountProfile)).map((target) => target.platform);
    if (platforms.length === 0 || invalidating.current) return;
    setStale(true); setConfirming(false); setCommitSelection((current) => new Set([...current].filter((platform) => !platforms.includes(platform))));
    const operation = ++operationRevision.current;
    invalidating.current = true; setInvalidatingBusy(true);
    void api.invalidate({ id: project.id, flowId: nextFlow.flowId, expectedVersion: nextFlow.version, platforms, confirmed: true }).then((next) => { update(next, scope, operation); }).catch((cause: unknown) => { if (current(scope, operation)) setError(cause instanceof Error ? cause.message : "账号已变化，原有准备结果需要重新读取后再处理。"); }).finally(() => { if (current(scope, operation)) { invalidating.current = false; setInvalidatingBusy(false); } });
  };
  const load = async (): Promise<void> => {
    const request = ++loadRevision.current;
    const scope = scopeRevision.current;
    const operation = operationRevision.current;
    if (current(scope, operation)) { setRegistry(null); setAccountError(null); }
    const [registryResult, flowResult] = await Promise.allSettled([accounts.list(), api.get({ id: project.id })]);
    if (!current(scope, operation) || request !== loadRevision.current) return;
    if (registryResult.status === "rejected") {
      setAccountError(registryResult.reason instanceof Error ? registryResult.reason.message : "无法读取账号状态");
    } else {
      const nextRegistry = registryResult.value;
      setRegistry(nextRegistry);
      if (firstLoad.current && flowResult.status === "fulfilled") {
        firstLoad.current = false;
        const nextFlow = flowResult.value;
        setFlow(nextFlow);
        setRights(nextFlow?.originalRightsConfirmed ?? false);
        restoreDrafts(nextRegistry, nextFlow);
        setCommitSelection(new Set(nextFlow?.targets.filter((target) => canCommit(target) && accountAvailableIn(verifiedAccounts(nextRegistry, target.platform), target.accountProfile)).map((target) => target.platform) ?? []));
        if (nextFlow !== null) invalidateUnavailable(nextFlow, nextRegistry, scope);
      } else {
        clearUnavailableDrafts(nextRegistry);
        if (flowResult.status === "fulfilled" && flowResult.value !== null) invalidateUnavailable(flowResult.value, nextRegistry, scope);
      }
    }
    if (flowResult.status === "rejected") setError(flowResult.reason instanceof Error ? flowResult.reason.message : "无法读取发布状态");
    else setError(null);
  };
  useEffect(() => {
    mounted.current = true;
    scopeRevision.current += 1;
    operationRevision.current += 1;
    loadRevision.current += 1;
    firstLoad.current = true;
    invalidating.current = false;
    setRegistry(null); setFlow(null); setDrafts(defaultDrafts()); setRights(false); setBusy(false); setInvalidatingBusy(false); setError(null); setAccountError(null); setStale(false); setConfirming(false); setCommitSelection(new Set());
    void load();
    return () => { mounted.current = false; scopeRevision.current += 1; loadRevision.current += 1; };
  }, [api, accounts, project.id]);
  useEffect(() => { if (firstLoad.current === false) void load(); }, [accountEpoch]);
  useEffect(() => { const refreshOnFocus = (): void => { void load(); }; window.addEventListener("focus", refreshOnFocus); return () => { window.removeEventListener("focus", refreshOnFocus); }; }, [api, accounts, project.id]);
  useEffect(() => { if (flow === null || !flow.busy || registry === null) return; let disposed = false; const scope = scopeRevision.current; const tick = async (): Promise<void> => { if (disposed || polling.current) return; polling.current = true; const operation = operationRevision.current; try { const next = await api.get({ id: project.id }); if (!disposed && next !== null) update(next, scope, operation); } catch (cause) { if (!disposed && current(scope, operation)) setError(cause instanceof Error ? cause.message : "无法更新发布状态"); } finally { polling.current = false; } }; void tick(); const timer = window.setInterval(() => { void tick(); }, 2000); return () => { disposed = true; window.clearInterval(timer); }; }, [api, flow?.busy, project.id, registry]);
  const invalidate = (): void => {
    setConfirming(false); setCommitSelection(new Set());
    if (flow === null || invalidating.current) return;
    const platforms = flow.targets.filter((target) => target.state === "ready" || target.state === "prepared").map((target) => target.platform);
    if (platforms.length === 0) return;
    const scope = scopeRevision.current;
    const operation = ++operationRevision.current;
    setStale(true); invalidating.current = true; setInvalidatingBusy(true);
    void api.invalidate({ id: project.id, flowId: flow.flowId, expectedVersion: flow.version, platforms, confirmed: true }).then((next) => { update(next, scope, operation); }).catch((cause: unknown) => { if (current(scope, operation)) setError(cause instanceof Error ? cause.message : "无法使原有准备结果失效，请重新读取后再试。"); }).finally(() => { if (current(scope, operation)) { invalidating.current = false; setInvalidatingBusy(false); } });
  };
  const setDraft = (platform: MuziVideoPlatform, patch: Partial<Draft>): void => { setDrafts((current) => ({ ...current, [platform]: { ...current[platform], ...patch } })); invalidate(); };
  const prepare = async (): Promise<void> => {
    if (invalidatingBusy || registry === null) return;
    const chosen = PLATFORMS.filter(({ key }) => drafts[key].enabled && accountAvailable(key, drafts[key].accountProfile));
    if (chosen.length === 0) { setError("暂无已连接账号，请到内容概览的账号管理中连接。"); return; }
    const scope = scopeRevision.current;
    const operation = ++operationRevision.current;
    try {
      setBusy(true); setError(null); setConfirming(false);
      const intents = chosen.map(({ key }) => { const item = drafts[key]; if (item.mode === "schedule" && item.scheduledAt === "") throw new Error("请填写定时发布的中国标准时间（+08:00）。"); return { platform: key, accountProfile: item.accountProfile, mode: item.mode, ...(item.mode === "schedule" ? { scheduledAt: toShanghai(item.scheduledAt) } : {}) }; });
      const next = await api.prepare({ id: project.id, expectedRevision: project.revision, intents, confirmed: true, originalRightsConfirmed: rights }); update(next, scope, operation); if (current(scope, operation)) { setStale(false); setCommitSelection(new Set(next.targets.filter((target) => canCommit(target) && accountAvailable(target.platform, target.accountProfile)).map((target) => target.platform))); }
    } catch (cause) { if (current(scope, operation)) setError(cause instanceof Error ? cause.message : "发布准备失败"); } finally { if (current(scope, operation)) setBusy(false); }
  };
  const resume = async (platform: MuziVideoPlatform): Promise<void> => { if (flow === null || registry === null || !accountAvailable(platform, flow.targets.find((target) => target.platform === platform)?.accountProfile ?? "")) return; const scope = scopeRevision.current; const operation = ++operationRevision.current; try { setBusy(true); setError(null); update(await api.resume({ id: project.id, flowId: flow.flowId, expectedVersion: flow.version, platforms: [platform], confirmed: true }), scope, operation); } catch (cause) { if (current(scope, operation)) setError(cause instanceof Error ? cause.message : "无法继续该平台的准备"); } finally { if (current(scope, operation)) setBusy(false); } };
  const selectedReady = flow?.targets.filter((target) => canCommit(target) && accountAvailable(target.platform, target.accountProfile) && commitSelection.has(target.platform)) ?? [];
  const commit = async (): Promise<void> => { if (flow === null || registry === null || selectedReady.length === 0 || stale) return; const scope = scopeRevision.current; const operation = ++operationRevision.current; try { setBusy(true); setError(null); setConfirming(false); update(await api.commit({ id: project.id, flowId: flow.flowId, expectedVersion: flow.version, platforms: selectedReady.map((target) => target.platform), confirmed: true }), scope, operation); } catch (cause) { if (current(scope, operation)) setError(cause instanceof Error ? cause.message : "提交结果待核实，请先到平台侧核对。"); } finally { if (current(scope, operation)) setBusy(false); } };
  const availablePlatforms = PLATFORMS.filter(({ key }) => eligible(key).length > 0);
  const accountsUnavailable = registry === null;
  return <section className="publishFlowPanel" aria-labelledby={id + "-title"} aria-busy={busy || flow?.busy === true}>
    <header className="publishFlowHeading"><div><h2 id={id + "-title"}>{t("overview.management.title")}</h2><p>选择目标 → 检查与准备 → 确认结果。默认仅准备；所有时间使用中国标准时间（+08:00）。</p></div></header>
    {error !== null && <p className="publishFlowError" role="alert">{error}</p>}{accountError !== null && <p className="publishFlowError" role="alert">账号读取失败：{accountError}</p>}{stale && <p className="publishFlowError" role="status">目标账号已变化；请重新准备后再提交。</p>}
    <div className="publishRights"><IslandCheckbox options={[{ value: "rights", label: "确认本次素材拥有所需原创或发布权利" }]} value={rights ? ["rights"] : []} disabled={accountsUnavailable || busy || flow?.busy === true} onChange={(values: Array<string | number>) => { setRights(values.includes("rights")); invalidate(); }} /></div>
    {accountsUnavailable ? <p className="publishFlowEmpty" role="status">{accountError === null ? "正在读取已连接账号…" : "账号状态暂不可用，暂时不能准备或提交。"}</p> : availablePlatforms.length === 0 ? <p className="publishFlowEmpty" role="status">暂无已连接账号，请到内容概览的账号管理中连接</p> : <div className="publishFlowTargets">{availablePlatforms.map(({ key, label }) => { const draft = drafts[key]; const verified = eligible(key); return <div className="publishFlowTarget" key={key}><div className="publishTargetTitle"><IslandSwitch checked={draft.enabled} disabled={accountsUnavailable || busy || flow?.busy === true} aria-label={"选择" + label} onChange={(checked: boolean) => { setDraft(key, { enabled: checked }); }} /><strong>{label}</strong></div>{draft.enabled && <div className="publishTargetControls"><label><span id={id + "-" + key + "-account"}>账号</span><IslandSelect aria-labelledby={id + "-" + key + "-account"} value={draft.accountProfile} options={verified.map((account) => ({ key: account.accountProfile, label: account.displayName }))} onChange={(value: string) => { setDraft(key, { accountProfile: value }); }} disabled={accountsUnavailable || busy || flow?.busy === true} /></label><label><span id={id + "-" + key + "-mode"}>方式</span><IslandSelect aria-labelledby={id + "-" + key + "-mode"} value={draft.mode} options={(Object.entries(modeLabel) as Array<[VideoPublishMode, string]>).map(([value, mode]) => ({ key: value, label: mode }))} onChange={(value: string) => { setDraft(key, { mode: value as VideoPublishMode }); }} disabled={accountsUnavailable || busy || flow?.busy === true} /></label>{draft.mode === "schedule" && <label><span>中国标准时间（+08:00）</span><IslandInput type="datetime-local" value={draft.scheduledAt} onChange={(event: ChangeEvent<HTMLInputElement>) => { setDraft(key, { scheduledAt: event.currentTarget.value }); }} disabled={accountsUnavailable || busy || flow?.busy === true} /></label>}</div>}</div>; })}</div>}
    <div className="publishFlowActions"><IslandButton icon={<WorkbenchIcon name="tasks" />} type="primary" loading={busy || flow?.busy === true || invalidatingBusy} disabled={accountsUnavailable || busy || flow?.busy === true || invalidatingBusy || !rights || availablePlatforms.length === 0} onClick={() => { void prepare(); }}>{invalidatingBusy ? "正在更新准备状态" : "开始准备"}</IslandButton>{selectedReady.length > 0 && !stale && <IslandButton type="primary" danger disabled={accountsUnavailable || busy || flow?.busy === true || invalidatingBusy} onClick={() => { setConfirming(true); }}>确认提交 {selectedReady.length} 个平台</IslandButton>}</div>
    {flow !== null && <div className="publishFlowResults">{flow.targets.map((target) => { const platformLabel = PLATFORMS.find((item) => item.key === target.platform)?.label ?? target.platform; const usable = accountAvailable(target.platform, target.accountProfile); const selectionLabel = "选择" + platformLabel + " " + target.displayName + "提交"; return <div key={target.platform} className={"publishFlowResult " + target.state}><div><strong>{platformLabel} · {target.displayName}</strong><IslandTag size="small" color={target.state === "blocked" || target.state === "unknown" ? "app-red" : target.state === "published" || target.state === "scheduled" ? "app-green" : "app-yellow"}>{stateLabel(target.state)}</IslandTag>{canCommit(target) && usable && !stale && <IslandCheckbox options={[{ value: target.platform, label: selectionLabel }]} value={commitSelection.has(target.platform) ? [target.platform] : []} onChange={(values: Array<string | number>) => { setCommitSelection((current) => { const next = new Set(current); if (values.includes(target.platform)) next.add(target.platform); else next.delete(target.platform); return next; }); }} />}</div><p>{target.message ?? (target.state === "unknown" ? "提交结果待核实，请在平台侧确认；系统不会自动重试。" : "")}</p><small>内容：{approvalFor(target)?.title ?? target.title ?? project.title} · 素材：{target.materials.join("、") || "平台准备包"} · 方式：{modeLabel[target.mode]}{target.mode === "schedule" ? " · " + (target.scheduledAt ?? "") : ""}</small>{target.state === "blocked" && <IslandButton type="default" size="small" disabled={accountsUnavailable || !usable || busy || flow.busy} onClick={() => { void resume(target.platform); }}>继续此平台</IslandButton>}</div>; })}</div>}
    {confirming && <IslandModal typewriter={false} open={confirming} title="确认最终提交" onClose={() => { if (!busy) setConfirming(false); }} footer={<><IslandButton icon={<WorkbenchIcon name="back" />} type="text" disabled={busy} onClick={() => { setConfirming(false); }}>返回修改</IslandButton><IslandButton type="primary" danger loading={busy} onClick={() => { void commit(); }}>确认提交</IslandButton></>}><p>以下操作将向平台提交。仅准备的目标不会出现在这里。</p><ul className="publishFlowConfirmList">{selectedReady.map((target) => <li key={target.platform}><strong>{PLATFORMS.find((item) => item.key === target.platform)?.label} · {target.displayName}</strong><span>内容：{approvalFor(target)?.title ?? target.title ?? project.title}</span><span>素材：{target.materials.join("、") || "平台准备包"}</span><span>操作：{target.mode === "schedule" ? "定时发布 · " + (target.scheduledAt ?? "") : "立即发布"}</span></li>)}</ul></IslandModal>}
  </section>;
}
