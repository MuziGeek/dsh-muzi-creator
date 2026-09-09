import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { videoAccountConfigPath } from "../src/videoAccountDiagnostics.ts";
import { accountRegistryFromRuntime, runVideoAccounts } from "../src/videoAccounts.ts";
import { addVideoAccountSchema, videoAccountLoginSchema } from "../src/videoAccountSchemas.ts";
import { MzCreatorService } from "../src/service.ts";
import { MZ_CREATOR_INVOCATIONS } from "../src/remote-contract.ts";

const roots: string[] = [];
async function runtime(source: string) {
  const root = await mkdtemp(join(tmpdir(), "mz-accounts-bridge-")); roots.push(root);
  await mkdir(join(root, "scripts", "v3"), { recursive: true });
  await writeFile(join(root, "scripts", "v3", "accounts.mjs"), source);
  return root;
}
beforeEach(async () => { const root = await mkdtemp(join(tmpdir(), "mz-account-diagnostics-")); roots.push(root); vi.stubEnv("VIDEO_PUBLISHER_CONFIG", join(root, "config.json")); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("account management bridge", () => {
  it("passes the resolved registry path and trace identifier to the actual subprocess", async () => {
    const root = await runtime(`if(process.env.VIDEO_PUBLISHER_CONFIG!==${JSON.stringify(process.env.VIDEO_PUBLISHER_CONFIG)}||!process.env.VIDEO_PUBLISHER_ACCOUNT_TRACE_ID)throw Error('wrong runtime context'); console.log(JSON.stringify({ok:true,accounts:[],loginStatuses:[]}));`);
    await runVideoAccounts(root, "list", { displayName: "DO_NOT_LOG_PRIVATE_INPUT" }, new AbortController().signal);
    const trace = await readFile(join(videoAccountConfigPath(), "..", "account-diagnostics.jsonl"), "utf8");
    expect(trace).toContain("response_validated"); expect(trace).not.toContain("DO_NOT_LOG_PRIVATE_INPUT");
    vi.stubEnv("VIDEO_PUBLISHER_CONFIG", ""); vi.stubEnv("XDG_CONFIG_HOME", root);
    expect(videoAccountConfigPath()).toBe(join(root, "video-publisher", "config.json"));
  });
  it("returns and rereads a saved verified account even when publishing capability lookup fails", async () => {
    const account = { platform: "xiaohongshu", accountProfile: "fixture", displayName: "Fixture creator", enabled: true, platformAccountId: "fixture-42", connectedAt: "2026-09-09T00:00:00.000Z" };
    const registry = { ok: true, accounts: [account], loginStatuses: [{ platform: account.platform, accountProfile: account.accountProfile, state: "verified", checkedAt: account.connectedAt }], connections: [] };
    const root = await runtime(`import fs from 'node:fs'; const p=process.env.VIDEO_PUBLISHER_CONFIG;if(process.argv[2]==='start-connection')fs.writeFileSync(p,${JSON.stringify(JSON.stringify(registry))});console.log(fs.readFileSync(p,'utf8'));`);
    const service = Object.create(MzCreatorService.prototype) as MzCreatorService;
    Object.defineProperties(service, { videoPublisher: { value: { skillDir: root, capabilities: async () => { throw new Error("fixture capabilities failure"); } } }, muzi: { value: { creatorRoot: root } }, videoAccountCapabilitiesTimeoutMs: { value: 5000 }, videoConnectionPollIntervalMs: { value: 2000 }, videoConnectionTimeoutMs: { value: 600000 } });
    const result = await service.addVideoAccount({ platform: "xiaohongshu", confirmed: true }, new AbortController().signal);
    expect(result.accounts[0]?.platformAccountId).toBe("fixture-42");
    expect(result.capabilities.accounts).toEqual([]); expect(result.capabilities.unavailableReason).toContain("账号连接状态已保留");
    expect((await service.getVideoAccounts({}, new AbortController().signal)).accounts).toEqual(result.accounts);
  });
  it("maps WeChat identifiers and rejects malformed persisted login evidence", () => {
    const raw = { ok: true, accounts: [{ platform: "wechat_channels", accountProfile: "wechat-main", displayName: "Test", enabled: true }], loginStatuses: [{ platform: "wechat_channels", accountProfile: "wechat-main", state: "verified", checkedAt: "2026-09-08T00:00:00.000Z" }] };
    expect(accountRegistryFromRuntime(raw).accounts[0]?.platform).toBe("wechat");
    expect(() => accountRegistryFromRuntime({ ...raw, loginStatuses: [{ ...raw.loginStatuses[0], state: "published" }] })).toThrow();
    expect(() => accountRegistryFromRuntime({ ...raw, accounts: [{ ...raw.accounts[0], accountProfile: "../daily-profile" }] })).toThrow();
  });
  it("sends nicknames as JSON data and reads complete output on close", async () => {
    const root = await runtime(`let body=""; for await(const chunk of process.stdin) body+=chunk; const r=JSON.parse(body); console.log(JSON.stringify({ok:true,accounts:[{platform:r.platform,accountProfile:"generated",displayName:r.displayName,enabled:true}],loginStatuses:[]}));`);
    const name = '名字 " $() `literal`';
    const result = await runVideoAccounts(root, "start-connection", { platform: "douyin", displayName: name }, new AbortController().signal);
    expect(result.accounts[0]?.displayName).toBe(name);
  });
  it("returns typed runtime errors and stops a cancelled controller", async () => {
    const failed = await runtime('console.log(JSON.stringify({ok:false,error:{code:"CONFIG_BUSY",message:"配置正在更新"}}));process.exitCode=1;');
    await expect(runVideoAccounts(failed, "list", {}, new AbortController().signal)).rejects.toMatchObject({ code: "CONFIG_BUSY", message: "配置正在更新" });
    const waiting = await runtime('setInterval(()=>{},1000);');
    const abort = new AbortController();
    const pending = runVideoAccounts(waiting, "list", {}, abort.signal);
    abort.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
  });
  it("launches the account CLI in Node mode without changing the host environment", async () => {
    const inherited = process.env.ELECTRON_RUN_AS_NODE;
    const root = await runtime('if(process.env.ELECTRON_RUN_AS_NODE!=="1") process.exit(2); console.log(JSON.stringify({ok:true,accounts:[],loginStatuses:[]}));');
    await expect(runVideoAccounts(root, "list", {}, new AbortController().signal)).resolves.toEqual({ accounts: [], loginStatuses: [], connections: [] });
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe(inherited);
  });
  it("distinguishes missing dependencies from an empty or invalid runtime response", async () => {
    const empty = await runtime('console.log("");');
    await expect(runVideoAccounts(empty, "list", {}, new AbortController().signal)).rejects.toThrow("未返回有效 JSON（退出码 0）");
    const missing = await runtime('import "./missing-module.mjs";');
    await expect(runVideoAccounts(missing, "list", {}, new AbortController().signal)).rejects.toThrow("程序或依赖缺失");
  });
  it("requires explicit connection confirmation without accepting manually supplied identity", async () => {
    expect(videoAccountLoginSchema.safeParse({ platform: "douyin", accountProfile: "main" }).success).toBe(false);
    expect(addVideoAccountSchema.safeParse({ platform: "douyin", displayName: "   " }).success).toBe(false);
    expect(addVideoAccountSchema.safeParse({ platform: "douyin", displayName: "Test", accountProfile: "injected" }).success).toBe(false);
    expect(addVideoAccountSchema.safeParse({ platform: "douyin", confirmed: true }).success).toBe(true);
    expect(addVideoAccountSchema.safeParse({ platform: "douyin" }).success).toBe(false);
  });
  it("registers every account endpoint with the host gateway", () => {
    for (const method of ["getVideoAccounts", "addVideoAccount", "setVideoAccountEnabled", "removeVideoAccount", "openVideoAccountLogin", "checkVideoAccountLogin", "reconnectVideoAccount", "pollVideoAccountConnection", "cancelVideoAccountConnection", "reopenVideoAccountConnection"]) {
      expect(MZ_CREATOR_INVOCATIONS.find(item => item.method === method)).toBeTruthy();
      expect(typeof MzCreatorService.prototype[method as keyof MzCreatorService]).toBe("function");
    }
  });
  it("dispatches confirmed removal through the runtime with platform mapping", async () => {
    const root = await runtime(`let body='';for await(const chunk of process.stdin)body+=chunk;const request=JSON.parse(body);if(process.argv[2]!=='remove-account'||request.platform!=='wechat_channels'||request.confirmed!==true)throw Error('unexpected removal request');console.log(JSON.stringify({ok:true,accounts:[],loginStatuses:[]}));`);
    const service = Object.create(MzCreatorService.prototype) as MzCreatorService;
    Object.defineProperties(service, { videoPublisher: { value: { skillDir: root, capabilities: async () => ({ schema: "muzi.video-publisher.capabilities/1", generatedAt: new Date().toISOString(), accounts: [], unavailableReason: null }) } }, videoAccountCapabilitiesTimeoutMs: { value: 5000 }, videoConnectionPollIntervalMs: { value: 2000 } });
    const removed = await service.removeVideoAccount({ platform: "wechat", accountProfile: "fixture", confirmed: true }, new AbortController().signal);
    expect(removed.accounts).toEqual([]);
    expect(removed.browserActionsEnabled).toBe(true);
  });
  it("preserves pending cleanup and explains an account mutex failure", async () => {
    const parsed = accountRegistryFromRuntime({ ok: true, accounts: [{ platform: "douyin", accountProfile: "fixture", displayName: "Example", enabled: false, removalPending: true }], loginStatuses: [] });
    expect(parsed.accounts[0]?.removalPending).toBe(true);
    const root = await runtime('console.log(JSON.stringify({ok:false,error:{code:"ACCOUNT_BUSY",message:"PID fixture"}}));process.exitCode=1;');
    await expect(runVideoAccounts(root, "remove-account", {}, new AbortController().signal)).rejects.toMatchObject({ code: "ACCOUNT_BUSY", message: "账号正在连接、发布或读取数据，请等待该操作结束后重试。" });
  });
});
