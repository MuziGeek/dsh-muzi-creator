import { useSyncExternalStore } from "react";
import type { VideoAccount, VideoAccountManagement } from "../videoAccountSchemas.ts";

let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => revision;
/** Refresh account lists and capability selectors after a local account change. */
export function notifyVideoAccountsChanged(): void { revision += 1; for (const listener of listeners) listener(); }
export function useVideoAccountEpoch(): number { return useSyncExternalStore(subscribe, snapshot, snapshot); }

/** A managed identity requires a completed connection and the latest successful login check.
 * @param data Current account registry.
 * @param account Registered identity to check.
 * @returns Whether identity and timestamped login evidence are valid, regardless of its enabled flag.
 */
export function isVerifiedVideoAccount(data: VideoAccountManagement, account: VideoAccount): boolean {
  return account.platformAccountId !== null && account.connectedAt !== null && account.removalPending !== true
    && data.loginStatuses.some(status => status.platform === account.platform && status.accountProfile === account.accountProfile && status.state === "verified" && status.checkedAt !== null);
}
