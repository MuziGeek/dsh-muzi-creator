import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function runCollector(env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const script = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "collect-publish.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => { resolve({ code, stdout, stderr }); });
  });
}

describe("Patchright metrics account grant", () => {
  it("fails before Chrome startup when the current account has no exact DSH grant", async () => {
    const result = await runCollector({
      OIL_COLLECT_PLATFORMS: "xiaohongshu",
      OIL_COLLECT_ACCOUNTS: JSON.stringify({ xiaohongshu: "xiaohongshu-main" }),
      OIL_COLLECT_METRICS_GRANTS: JSON.stringify({ xiaohongshu: "another-account" }),
      OIL_COLLECT_CLEANUP_STALE: "0",
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as { collected: Array<{ error?: string }> };
    expect(payload.collected[0]?.error).toContain("xiaohongshu/xiaohongshu-main has no current account-bound metrics grant");
  });
});
