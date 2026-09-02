#!/usr/bin/env node
import { access, lstat } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { confinedPath, labPaths } from "./lab-paths.mjs";
import {
  assertDesktopLabConfiguration,
  assertPersonalLabConfiguration,
  isolatedDesktopEnvironment,
  personalDesktopEnvironment,
} from "./lab-start.mjs";

const execFileAsync = promisify(execFile);

export const DSH_DESKTOP_VERSION = "2.0.4";
export const DSH_DESKTOP_FILE_VERSION = "2.0.4";
export const DSH_DESKTOP_PRODUCT_VERSION = "2.0.4.0";
export const DSH_DESKTOP_PRODUCT_NAME = "DSH Desktop";

async function powershellJson(script, desktop, label) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ], {
      env: { ...process.env, MUZI_DSH_DESKTOP_EXECUTABLE: desktop },
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      encoding: "utf8",
    }));
  } catch (error) {
    throw new Error(`无法读取 DSH Desktop ${label}：${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(stdout.trim());
  } catch (error) {
    throw new Error(`DSH Desktop ${label}不可解析：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Validates a locally packed plugin without installing it or changing any profile. */
export async function prepareLocalTgzAcceptance({ repositoryRoot, tgz } = {}) {
  if (!tgz) throw new Error("未提供本地 .tgz；安全准备不会下载或安装插件。");
  const paths = labPaths(repositoryRoot);
  await assertDesktopLabConfiguration(paths);
  const archive = resolve(tgz);
  await confinedLocalPackage(paths, archive);
  const info = await lstat(archive);
  if (!info.isFile() || info.isSymbolicLink() || extname(archive).toLowerCase() !== ".tgz") {
    throw new Error("Desktop 成品验收只接受 .lab/packages/ 下的普通本地 .tgz 文件。");
  }
  return { profile: "web", archive };
}

async function confinedLocalPackage(paths, archive) {
  await confinedPath(paths.packageStaging, archive);
}

/** Reads the signed-in machine's Windows version resource without executing the target. */
export async function inspectDesktopExecutable(desktop) {
  if (process.platform !== "win32") {
    throw new Error(`DSH Desktop ${DSH_DESKTOP_VERSION} 隔离验收只支持 Windows x64。`);
  }
  const script = [
    "$info = (Get-Item -LiteralPath $env:MUZI_DSH_DESKTOP_EXECUTABLE).VersionInfo",
    "[pscustomobject]@{ fileVersion = $info.FileVersion; productVersion = $info.ProductVersion; productName = $info.ProductName } | ConvertTo-Json -Compress",
  ].join("; ");
  return powershellJson(script, desktop, "版本资源");
}

/** Rejects any executable other than the fixed Desktop 2.0.4 Windows build identity. */
export function assertDesktopExecutableIdentity(identity) {
  if (
    identity?.fileVersion !== DSH_DESKTOP_FILE_VERSION
    || identity?.productVersion !== DSH_DESKTOP_PRODUCT_VERSION
    || identity?.productName !== DSH_DESKTOP_PRODUCT_NAME
  ) {
    throw new Error(
      `Desktop 版本不匹配：要求 ${DSH_DESKTOP_PRODUCT_NAME} ${DSH_DESKTOP_VERSION}`
      + `（FileVersion ${DSH_DESKTOP_FILE_VERSION} / ProductVersion ${DSH_DESKTOP_PRODUCT_VERSION}），`
      + `实际为 ${JSON.stringify(identity)}。`,
    );
  }
}

/** Lists processes using the same executable so Electron cannot hand off to a non-isolated instance. */
export async function inspectRunningDesktopProcesses(desktop) {
  if (process.platform !== "win32") return [];
  const script = [
    "$target = (Resolve-Path -LiteralPath $env:MUZI_DSH_DESKTOP_EXECUTABLE).Path",
    "$items = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target } | ForEach-Object { [pscustomobject]@{ processId = $_.ProcessId; commandLine = $_.CommandLine } })",
    "[pscustomobject]@{ processes = $items } | ConvertTo-Json -Compress -Depth 4",
  ].join("; ");
  const result = await powershellJson(script, desktop, "运行实例");
  return Array.isArray(result?.processes) ? result.processes : [];
}

export async function startDesktop({
  repositoryRoot,
  desktop,
  personal = false,
  personalPaths,
  dryRun = false,
  inspectVersion = inspectDesktopExecutable,
  inspectInstances = inspectRunningDesktopProcesses,
} = {}) {
  if (!desktop) throw new Error("未提供 Desktop 路径；lab:desktop 只接受显式已安装路径，Lab 不会自动安装软件。");
  const executable = resolve(desktop);
  try { await access(executable); } catch { throw new Error(`找不到指定 Desktop：${executable}`); }
  const desktopInfo = await lstat(executable);
  if (!desktopInfo.isFile() || desktopInfo.isSymbolicLink()) {
    throw new Error(`Desktop 路径必须是明确的普通可执行文件：${executable}`);
  }
  const identity = await inspectVersion(executable);
  assertDesktopExecutableIdentity(identity);
  const running = await inspectInstances(executable);
  if (!Array.isArray(running)) throw new Error("DSH Desktop 运行实例检查返回了无效结果。");
  if (running.length > 0) {
    const processIds = running
      .map((entry) => entry?.processId)
      .filter((value) => Number.isInteger(value))
      .join(", ");
    throw new Error(
      `检测到同一 DSH Desktop 2.0.4 正在运行${processIds.length > 0 ? `（PID ${processIds}）` : ""}；`
      + "请先正常关闭现有窗口，再启动隔离验收，避免 Electron 把请求交给正式 Profile。",
    );
  }
  const paths = labPaths(repositoryRoot);
  if (personal) await assertPersonalLabConfiguration(paths, personalPaths);
  else await assertDesktopLabConfiguration(paths);
  const userData = personal ? paths.personalUserData : paths.desktopUserData;
  const args = [`--user-data-dir=${userData}`];
  const env = personal ? personalDesktopEnvironment(paths) : isolatedDesktopEnvironment(paths);
  if (dryRun) return { executable, identity, args, cwd: paths.root, env };
  const child = spawn(executable, args, {
    cwd: paths.root,
    env,
    stdio: "inherit",
    shell: false,
  });
  return new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const index = process.argv.indexOf("--desktop");
  const tgzIndex = process.argv.indexOf("--prepare-tgz");
  if (tgzIndex !== -1) {
    await prepareLocalTgzAcceptance({ tgz: process.argv[tgzIndex + 1] });
  } else {
    await startDesktop({ desktop: index === -1 ? undefined : process.argv[index + 1] });
  }
}
