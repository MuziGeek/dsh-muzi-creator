import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseCollectOutput, type CollectResult, type CollectTarget } from "./collectPublish.ts";
import {
  collectCleanupNames,
  collectRegistryPath,
  defaultCollectSpaceName,
  loadCollectRegistry,
  pidIsAlive,
  registerCollectSpace,
  unregisterCollectSpace,
} from "./collectSpaces.ts";
import type { PublishPlatform } from "./types.ts";

export function collectScriptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "collect-publish.mjs");
}

export async function resolveCollectScript(preferred?: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    preferred,
    join(here, "collect-publish.mjs"),
    join(here, "..", "scripts", "collect-publish.mjs"),
  ];
  for (const path of candidates) {
    if (path === undefined) continue;
    try {
      await access(path);
      return path;
    } catch {
      continue;
    }
  }
  throw new Error("collect-publish.mjs is missing; rebuild dsh-muzi-creator");
}

export interface CollectRunOptions {
  platforms?: readonly PublishPlatform[];
  targets?: readonly CollectTarget[];
  spaceName?: string;
  keepSpace?: boolean;
  cleanupStale?: boolean;
  cleanupNames?: readonly string[];
  cleanupPrefixes?: readonly string[];
  maxPages?: number;
  xhsScrollSteps?: number;
  registryPath?: string;
  accounts?: Partial<Record<PublishPlatform, string>>;
  metricsGrants?: Partial<Record<PublishPlatform, string>>;
}

export { defaultCollectSpaceName } from "./collectSpaces.ts";

export async function runCollectPublish(
  scriptPath: string,
  signal: AbortSignal,
  options: CollectRunOptions = {},
): Promise<CollectResult> {
  const resolvedScript = await resolveCollectScript(scriptPath);
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const platforms = options.platforms;
    const targets = options.targets;
    const spaceName = options.spaceName?.trim() || defaultCollectSpaceName();
    const registryPath = options.registryPath ?? collectRegistryPath();
    const staleNames = options.cleanupStale === false
      ? []
      : loadCollectRegistry(registryPath)
        .filter((row) => row.name !== spaceName && !pidIsAlive(row.pid))
        .map((row) => row.name);
    const cleanupNames = collectCleanupNames({
      stale: staleNames,
      includeLegacy: options.cleanupStale !== false,
      ...(options.cleanupNames === undefined ? {} : { extra: options.cleanupNames }),
    });
    const env = { ...process.env };
    if (platforms !== undefined && platforms.length > 0) {
      env.OIL_COLLECT_PLATFORMS = platforms.join(",");
    }
    if (targets !== undefined && targets.length > 0) {
      env.OIL_COLLECT_TARGETS = JSON.stringify(targets);
    }
    env.OIL_COLLECT_SPACE = spaceName;
    env.OIL_COLLECT_KEEP = options.keepSpace === true ? "1" : "0";
    env.OIL_COLLECT_CLEANUP_STALE = options.cleanupStale === false ? "0" : "1";
    env.OIL_COLLECT_CLEANUP_NAMES = cleanupNames.join(",");
    if (options.cleanupPrefixes !== undefined && options.cleanupPrefixes.length > 0) {
      env.OIL_COLLECT_CLEANUP_PREFIXES = options.cleanupPrefixes.join(",");
    }
    if (options.maxPages !== undefined) env.OIL_COLLECT_MAX_PAGES = String(options.maxPages);
    if (options.xhsScrollSteps !== undefined) env.OIL_COLLECT_XHS_SCROLL = String(options.xhsScrollSteps);
    if (options.accounts !== undefined) env.OIL_COLLECT_ACCOUNTS = JSON.stringify(options.accounts);
    if (options.metricsGrants !== undefined) env.OIL_COLLECT_METRICS_GRANTS = JSON.stringify(options.metricsGrants);
    const child = spawn(process.execPath, [resolvedScript], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    if (child.pid !== undefined) {
      registerCollectSpace(registryPath, { name: spaceName, pid: child.pid, startedAt: Date.now() });
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    const onAbort = (): void => {
      child.kill("SIGTERM");
    };
    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", (cause) => {
      signal.removeEventListener("abort", onAbort);
      unregisterCollectSpace(registryPath, spaceName);
      reject(cause);
    });
    child.once("exit", (code) => {
      signal.removeEventListener("abort", onAbort);
      const raw = `${stdout}\n${stderr}`;
      if (code !== 0 && raw.trim() === "") {
        reject(new Error(`Patchright collector exited ${code}`));
        return;
      }
      try {
        const result = parseCollectOutput(raw);
        unregisterCollectSpace(registryPath, spaceName);
        resolve(result);
      } catch (cause) {
        const detail = raw.trim() === "" ? "" : `: ${raw.trim().slice(-500)}`;
        reject(new Error((cause instanceof Error ? cause.message : String(cause)) + detail));
      }
    });
  });
}
