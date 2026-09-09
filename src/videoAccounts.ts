import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { videoAccountRegistrySchema } from "./videoAccountSchemas.ts";
import { recordVideoAccountTrace, videoAccountConfigPath } from "./videoAccountDiagnostics.ts";

const platformSchema = z.enum(["xiaohongshu", "douyin", "bilibili", "wechat_channels"])
  .transform((platform) => platform === "wechat_channels" ? "wechat" as const : platform);
const runtimeRegistrySchema = z.object({
  ok: z.literal(true),
  accounts: z.array(z.object({ platform: platformSchema }).passthrough()),
  loginStatuses: z.array(z.object({ platform: platformSchema }).passthrough()),
  connections: z.array(z.object({ platform: platformSchema, account: z.object({ platform: platformSchema }).passthrough().nullable() }).passthrough()).default([]),
  connection: z.object({ platform: platformSchema, account: z.object({ platform: platformSchema }).passthrough().nullable() }).passthrough().optional(),
});

/** Validate the subprocess output before exposing account data to the client. */
export function accountRegistryFromRuntime(value: unknown) {
  return videoAccountRegistrySchema.parse(runtimeRegistrySchema.parse(value));
}

/** Run the Node account CLI under Node or Electron; cancellation leaves manual-login Chrome open. */
export async function runVideoAccounts(
  skillDir: string,
  command: "list" | "start-connection" | "check-connection" | "cancel-connection" | "reopen-connection" | "reconnect" | "set-enabled" | "open-login" | "check-login" | "remove-account",
  request: object,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const traceId = randomUUID();
  const configPath = videoAccountConfigPath();
  recordVideoAccountTrace("request", { traceId, command, configPath, skillDir, executable: process.execPath, module: import.meta.url });
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(90_000)]);
  const raw = await new Promise<unknown>((resolve, reject) => {
    const child = spawn(process.execPath, [join(skillDir, "scripts", "v3", "accounts.mjs"), command], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", VIDEO_PUBLISHER_CONFIG: configPath, VIDEO_PUBLISHER_ACCOUNT_TRACE_ID: traceId },
    });
    let stdout = "";
    let stderr = "";
    const abort = () => { child.kill(); };
    bounded.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); if (stdout.length > 1_048_576) child.kill(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.stdin.on("error", (error) => { if ((error as NodeJS.ErrnoException).code !== "EPIPE") reject(error); });
    child.once("error", (error) => { bounded.removeEventListener("abort", abort); reject(error); });
    child.once("close", (code) => {
      recordVideoAccountTrace("process_closed", { traceId, command, exitCode: code, aborted: bounded.aborted });
      bounded.removeEventListener("abort", abort);
      if (bounded.aborted) { reject(bounded.reason); return; }
      try {
        const last = stdout.trim().split(/\r?\n/).at(-1) ?? "";
        const result: unknown = JSON.parse(last);
        const failure = z.object({ ok: z.literal(false), error: z.object({ message: z.string(), code: z.string().optional() }) }).safeParse(result);
        if (failure.success) throw Object.assign(new Error(failure.data.error.code === "ACCOUNT_BUSY"
          ? "账号正在连接、发布或读取数据，请等待该操作结束后重试。"
          : failure.data.error.message), { code: failure.data.error.code });
        if (code !== 0) throw new Error(`账号操作失败 (${code})`);
        resolve(result);
      } catch (error) {
        reject(error instanceof SyntaxError ? new Error(stderr.includes("MODULE_NOT_FOUND")
          ? "账号管理程序或依赖缺失，请检查 video-publisher 安装。"
          : `账号管理程序未返回有效 JSON（退出码 ${code}），请检查运行环境。`) : error);
      }
    });
    child.stdin.end(JSON.stringify(request));
    if (bounded.aborted) abort();
  });
  const registry = accountRegistryFromRuntime(raw);
  recordVideoAccountTrace("response_validated", { traceId, command, accounts: registry.accounts.length, connectionId: registry.connection?.connectionId ?? null, state: registry.connection?.state ?? null });
  return registry;
}
