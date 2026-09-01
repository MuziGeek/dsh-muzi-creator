#!/usr/bin/env node
import { lstat, mkdir, readlink, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { labPaths, prepareLabPath } from "./lab-paths.mjs";

export async function setupLab(repositoryRoot) {
  const paths = labPaths(repositoryRoot);
  for (const directory of [
    paths.lab,
    paths.home,
    paths.profile,
    paths.profileModules,
    paths.fixture,
    paths.library,
    paths.atlas,
    paths.trellis,
    paths.data,
    paths.skills,
  ]) {
    await prepareLabPath(paths.root, directory);
    await mkdir(directory, { recursive: true });
  }
  const project = join(paths.library, "2026-01-01_lab-fixture");
  await prepareLabPath(paths.root, project);
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "script.md"), "# Lab fixture\n", "utf8");
  await ensurePluginLink(paths.pluginLink, paths.root);
  console.log(`Lab 已准备：${paths.lab}`);
  return paths;
}

async function ensurePluginLink(link, repositoryRoot) {
  try {
    const info = await lstat(link);
    if (!info.isSymbolicLink()) {
      throw new Error(`Lab 插件链接位置已被普通文件占用：${link}`);
    }
    const linked = await realpath(link);
    const expected = await realpath(repositoryRoot);
    if (linked !== expected) {
      throw new Error(`Lab 插件链接指向意外位置：${await readlink(link)}`);
    }
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await symlink(repositoryRoot, link, process.platform === "win32" ? "junction" : "dir");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await setupLab(process.cwd());
}
