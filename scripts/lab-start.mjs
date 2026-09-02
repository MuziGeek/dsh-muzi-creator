#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  createLabProfileManifest,
  createLabProfilePatch,
  createLabSafetyConfig,
  createDesktopMarketSelectionState,
  createDesktopProfileSelectionState,
  LAB_PROFILE_WORKSPACE,
  LAB_WRITABLE_PATH_KEYS,
} from "./lab-config.mjs";
import { confinedPath, labPaths } from "./lab-paths.mjs";

async function executable(candidate) {
  try { await access(candidate); return candidate; } catch { return undefined; }
}

export async function findDshCli(explicit) {
  const requested = explicit ?? process.env.DSH_CLI;
  if (requested) {
    const found = await executable(requested);
    if (!found) throw new Error(`找不到指定 DSH CLI：${requested}`);
    return found;
  }
  const names = process.platform === "win32" ? ["dsh.cmd", "dsh.exe", "dsh"] : ["dsh"];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const name of names) {
      const found = await executable(join(directory, name));
      if (found) return found;
    }
  }
  throw new Error("未发现 DSH CLI；请用 --cli <dsh 路径> 或先安装/配置 DSH CLI。Lab 未启动。");
}

export function isolatedEnvironment(paths) {
  return {
    ...process.env,
    DSH_HOME: paths.home,
    HOME: paths.home,
    USERPROFILE: paths.home,
    DSH_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    DSH_EXTERNAL_ACTIONS_ENABLED: "0",
    DSH_DESKTOP_BACKGROUND_AUTOMATION: "",
    DEEPSEEK_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    ZENMUX_API_KEY: "",
  };
}

/** Returns Desktop's isolated process environment and private Electron user-data root. */
export function isolatedDesktopEnvironment(paths) {
  return {
    ...isolatedEnvironment({ ...paths, home: paths.desktopHome }),
    APPDATA: paths.desktopUserData,
    LOCALAPPDATA: paths.desktopUserData,
    XDG_CONFIG_HOME: paths.desktopUserData,
  };
}

const LAB_BUILD_ARTIFACTS = Object.freeze([
  "lib/index.js",
  "lib/client.js",
  "lib/typert.host.js",
  "lib/collect-publish.mjs",
]);

async function assertRegularFile(target, message) {
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(message);
}

async function assertWritableDirectory(target) {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Lab 可写路径不是受控目录：${target}`);
  }
  try {
    await access(target, constants.W_OK);
  } catch (error) {
    throw new Error(`Lab 可写路径不可写：${target}。${String(error)}`);
  }
}

async function assertProfile(paths, profile) {
  const profileFiles = profile === "desktop"
    ? {
      manifest: paths.desktopProfileManifest,
      patch: paths.desktopProfilePatch,
      workspace: paths.desktopProfileWorkspace,
      modules: paths.desktopProfileModules,
      pluginLink: paths.desktopPluginLink,
    }
    : {
      manifest: paths.profileManifest,
      patch: paths.profilePatch,
      workspace: paths.profileWorkspace,
      modules: paths.profileModules,
      pluginLink: paths.pluginLink,
    };
  for (const target of [profileFiles.manifest, profileFiles.patch, profileFiles.workspace]) {
    await confinedPath(paths.lab, target);
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(profileFiles.manifest, "utf8"));
  } catch (error) {
    throw new Error(`Lab ${profile} profile manifest 不可读。${String(error)}`);
  }
  if (!isDeepStrictEqual(manifest, createLabProfileManifest(paths))) {
    throw new Error(`Lab ${profile} profile manifest 已偏离隔离配置；请重新运行 pnpm lab:config。`);
  }
  const patch = await readFile(profileFiles.patch, "utf8");
  if (patch !== createLabProfilePatch(createLabSafetyConfig(paths))) {
    throw new Error(`Lab ${profile} profile patch 已偏离隔离配置；请重新运行 pnpm lab:config。`);
  }
  const workspace = await readFile(profileFiles.workspace, "utf8");
  if (workspace !== LAB_PROFILE_WORKSPACE) {
    throw new Error(`Lab ${profile} profile workspace 已偏离隔离配置；请重新运行 pnpm lab:config。`);
  }
  await confinedPath(paths.lab, profileFiles.modules);
  const pluginLink = await lstat(profileFiles.pluginLink);
  if (!pluginLink.isSymbolicLink()) {
    throw new Error(`Lab ${profile} 插件入口必须是指向当前源码 checkout 的受控链接。`);
  }
  const [linkedPlugin, repository] = await Promise.all([realpath(profileFiles.pluginLink), realpath(paths.root)]);
  if (linkedPlugin !== repository) {
    throw new Error(`Lab ${profile} 插件入口未指向当前源码 checkout；请重新运行 pnpm lab:setup。`);
  }
}

async function assertLabBuildArtifacts(paths) {
  for (const relativePath of LAB_BUILD_ARTIFACTS) {
    const target = join(paths.root, relativePath);
    await assertRegularFile(target, `Lab 构建产物缺失或不安全：${relativePath}；请先运行 pnpm build。`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function desktopSettingMatches(settings, key, expected) {
  return !Object.hasOwn(settings, key) || settings[key] === expected;
}

function assertSafeDesktopSettings(document) {
  let parsed;
  try {
    parsed = parseYaml(document);
  } catch (error) {
    throw new Error(`Desktop settings.yaml 不可读。${String(error)}`);
  }
  const desktop = isRecord(parsed) && isRecord(parsed["dsh-desktop"])
    ? parsed["dsh-desktop"]
    : undefined;
  const notifications = isRecord(parsed) && isRecord(parsed["dsh-desktop-notifications"])
    ? parsed["dsh-desktop-notifications"]
    : undefined;
  if (
    !desktop
    || desktop.mode !== "compatibility"
    || !desktopSettingMatches(desktop, "windowsMaterial", "off")
    || !desktopSettingMatches(desktop, "openBrowser", false)
    || !desktopSettingMatches(desktop, "networkExposure", "loopback")
    || (notifications && notifications.enabled !== false)
  ) {
    throw new Error("Desktop settings.yaml 未保持隔离兼容配置；请重新检查 Desktop 设置。");
  }
}

export async function assertLabConfiguration(paths) {
  for (const target of [paths.safetyManifest]) {
    await confinedPath(paths.lab, target);
  }
  let safety;
  try {
    safety = JSON.parse(await readFile(paths.safetyManifest, "utf8"));
  } catch (error) {
    throw new Error(`Lab 配置不存在或不可读；请先运行 pnpm lab:config。${String(error)}`);
  }
  const expectedSafety = createLabSafetyConfig(paths);
  if (!isDeepStrictEqual(safety, expectedSafety)) {
    throw new Error("Lab 安全配置与当前隔离目录不一致；请重新运行 pnpm lab:config。");
  }
  for (const key of LAB_WRITABLE_PATH_KEYS) {
    await confinedPath(paths.lab, safety[key]);
    await assertWritableDirectory(safety[key]);
  }
  await assertProfile(paths, "web");
  await assertLabBuildArtifacts(paths);
  return safety;
}

/** Validates every Desktop-only isolation boundary before an Electron spawn. */
export async function assertDesktopLabConfiguration(paths) {
  const safety = await assertLabConfiguration(paths);
  await confinedPath(paths.lab, paths.desktopHome);
  await confinedPath(paths.lab, paths.desktopUserData);
  await assertWritableDirectory(paths.desktopHome);
  await assertWritableDirectory(paths.desktopUserData);
  await assertWritableDirectory(paths.packageStaging);
  await assertProfile(paths, "desktop");
  await confinedPath(paths.desktopUserData, paths.desktopProfileSelection);
  await assertRegularFile(
    paths.desktopProfileSelection,
    "Desktop profile-selection state 不存在或不是普通文件；请重新运行 pnpm lab:config。",
  );
  let state;
  try {
    state = JSON.parse(await readFile(paths.desktopProfileSelection, "utf8"));
  } catch (error) {
    throw new Error(`Desktop profile-selection state 不可读。${String(error)}`);
  }
  if (!isDeepStrictEqual(state, createDesktopProfileSelectionState())) {
    throw new Error("Desktop profile-selection state 未严格选择 web Profile；请重新运行 pnpm lab:config。");
  }
  await confinedPath(paths.desktopUserData, paths.desktopMarketSelection);
  await assertRegularFile(
    paths.desktopMarketSelection,
    "Desktop Market state 不存在或不是普通文件；请重新运行 pnpm lab:config。",
  );
  let market;
  try {
    market = JSON.parse(await readFile(paths.desktopMarketSelection, "utf8"));
  } catch (error) {
    throw new Error(`Desktop Market state 不可读。${String(error)}`);
  }
  if (!isDeepStrictEqual(market, createDesktopMarketSelectionState())) {
    throw new Error("Desktop Market state 未严格禁用插件市场；请重新运行 pnpm lab:config。");
  }
  await confinedPath(paths.desktopHome, paths.desktopSettings);
  await assertRegularFile(
    paths.desktopSettings,
    "Desktop settings.yaml 不存在或不是普通文件；请重新运行 pnpm lab:config。",
  );
  assertSafeDesktopSettings(await readFile(paths.desktopSettings, "utf8"));
  return safety;
}

function cliInvocation(cli, dshArgs) {
  const extension = extname(cli).toLowerCase();
  if (extension === ".ts" || extension === ".tsx") {
    throw new Error("Lab 不直接执行 TypeScript CLI；请先构建 DSH 并传入 apps/cli/lib/bin.js。");
  }
  if ([".js", ".mjs", ".cjs"].includes(extension)) {
    return { executable: process.execPath, args: [cli, ...dshArgs], shell: false };
  }
  return {
    executable: cli,
    args: dshArgs,
    shell: process.platform === "win32" && cli.toLowerCase().endsWith(".cmd"),
  };
}

export async function startLab({ repositoryRoot, cli, port = 51873, dryRun = false } = {}) {
  const paths = labPaths(repositoryRoot);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Lab 端口无效：${String(port)}`);
  await assertLabConfiguration(paths);
  const executablePath = await findDshCli(cli);
  const env = isolatedEnvironment(paths);
  const invocation = cliInvocation(executablePath, ["--profile", "web", "--no-open", "--port", String(port)]);
  if (dryRun) return { ...invocation, cwd: paths.root, env };
  const child = spawn(invocation.executable, invocation.args, {
    cwd: paths.root,
    env,
    stdio: "inherit",
    shell: invocation.shell,
  });
  return new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cliIndex = process.argv.indexOf("--cli");
  const portIndex = process.argv.indexOf("--port");
  await startLab({
    cli: cliIndex === -1 ? undefined : process.argv[cliIndex + 1],
    port: portIndex === -1 ? 51873 : Number(process.argv[portIndex + 1]),
  });
}
