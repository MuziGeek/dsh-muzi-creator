# Verified account connections and durable content publication

Account creation is a pending connection, separate from the registered account list. A visible creator login and an unambiguous platform identity must both be verified before registration. Reconnection uses the existing browser profile and rejects a different identity. Duplicate platform identities never replace an existing account. Config version 4 preserves older accounts as unverified and backs up their original configuration before migration.

The account CLI preserves configuration preferences and serializes writes with a configuration lock and file fingerprint checks. Browser operations share the profile and account lock with publishing and metrics. Pending sessions expire after a configured timeout and survive page reload. Polling only inspects the opened profile; a closed browser requires an explicit reopen action. Public responses contain account identifiers and verification times, never browser credentials.

Connecting an account has its own explicit permission and never enables uploading, publication, or data access. Disabling an account retains its browser profile and evidence. A missing configuration can be initialized; malformed existing data fails without being overwritten.

`PublishFlowService` owns the durable per-content target list for both RPC and Agent tools. Each target binds content revision, platform, account profile and verified platform identity, mode, schedule and a runtime task. First-use verification uses the requested content. Final confirmation selects ready targets and consumes each target's runtime authorization independently. Public legacy prepare and commit endpoints are disabled so they cannot race the coordinator.

The coordinator holds a per-content host/PID lock while operating, persists progress before final submission, and treats interrupted submission as unknown. Recovery reads durable runtime results and reconciles confirmed local publication facts without another external click. Unknown results cannot be resumed or replaced. An edited content revision or target configuration revokes prepared confirmation. Confirmed targets are recorded together after the selected batch so a revision update does not invalidate the next selected target mid-batch.

Keyless runtime and UI tests establish state transitions and refusal paths. They do not establish that current platform selectors, logged-in profiles, uploads, publication, scheduling or metrics work against real services; each platform and operation requires separate actual evidence.

Account and publisher subprocesses set `ELECTRON_RUN_AS_NODE=1` in their child environment because DSH Desktop exposes the Electron executable as `process.execPath`. Without Node mode, the desktop executable can exit successfully with no JSON instead of running the CLI. The parent environment is unchanged. Missing modules and invalid CLI output produce separate diagnostics.
