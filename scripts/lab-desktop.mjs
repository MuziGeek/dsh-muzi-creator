#!/usr/bin/env node
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { labPaths } from "./lab-paths.mjs";
import { assertLabConfiguration, isolatedEnvironment } from "./lab-start.mjs";

export async function startDesktop({ repositoryRoot, desktop } = {}) {
  if (!desktop) throw new Error("未提供 Desktop 路径；lab:desktop 只接受显式已安装路径，Lab 不会自动安装软件。");
  try { await access(desktop); } catch { throw new Error(`找不到指定 Desktop：${desktop}`); }
  const paths = labPaths(repositoryRoot);
  await assertLabConfiguration(paths);
  const child = spawn(desktop, [], {
    cwd: paths.root,
    env: isolatedEnvironment(paths),
    stdio: "inherit",
    shell: false,
  });
  return new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const index = process.argv.indexOf("--desktop");
  await startDesktop({ desktop: index === -1 ? undefined : process.argv[index + 1] });
}
