#!/usr/bin/env node
import { access, lstat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { confinedPath, labPaths } from "./lab-paths.mjs";
import { assertDesktopLabConfiguration, isolatedDesktopEnvironment } from "./lab-start.mjs";

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

export async function startDesktop({ repositoryRoot, desktop, dryRun = false } = {}) {
  if (!desktop) throw new Error("未提供 Desktop 路径；lab:desktop 只接受显式已安装路径，Lab 不会自动安装软件。");
  try { await access(desktop); } catch { throw new Error(`找不到指定 Desktop：${desktop}`); }
  const desktopInfo = await lstat(desktop);
  if (!desktopInfo.isFile() || desktopInfo.isSymbolicLink()) {
    throw new Error(`Desktop 路径必须是明确的普通可执行文件：${desktop}`);
  }
  const paths = labPaths(repositoryRoot);
  await assertDesktopLabConfiguration(paths);
  const args = ["--user-data-dir", paths.desktopUserData];
  const env = isolatedDesktopEnvironment(paths);
  if (dryRun) return { executable: desktop, args, cwd: paths.root, env };
  const child = spawn(desktop, args, {
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
