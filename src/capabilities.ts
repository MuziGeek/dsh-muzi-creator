import { constants, existsSync } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { skillDirCandidates } from "./config.ts";
import { resolveCoverSkill } from "./generate.ts";
import {
  extraBinDirs,
  pathEnvValue,
} from "./runtimePaths.ts";
import { resolveSubtitleSkill, subtitleInstallCommand } from "./subtitle.ts";
import type {
  CreatorCapabilities,
  CreatorCapability,
  CreatorSecrets,
  CreatorSetupStatus,
  LibrarySettings,
} from "./types.ts";

interface InspectCreatorSetupOptions {
  libraryRoot: string;
  dataDir: string;
  subtitleSkillDir: string;
  coverSkillDir: string;
  settings: LibrarySettings;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
  findSkillDir?: (skillName: string) => string | undefined;
}

export function defaultFindSkillDir(skillName: string, home = homedir()): string | undefined {
  return skillDirCandidates(skillName, home).find((candidate) => existsSync(join(candidate, "SKILL.md")));
}

function capability(
  state: CreatorCapability["state"],
  required: boolean,
  detail: string,
  path?: string,
): CreatorCapability {
  return path === undefined
    ? { state, required, detail }
    : { state, required, detail, path };
}

async function libraryCapability(path: string): Promise<CreatorCapability> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) {
    return capability("missing", true, "内容目录不存在，需要先选择或创建目录。", path);
  }
  const writable = await access(path, constants.R_OK | constants.W_OK).then(() => true, () => false);
  return writable
    ? capability("ready", true, "内容目录可读写。", path)
    : capability("missing", true, "内容目录存在，但当前进程没有读写权限。", path);
}

async function screenStudioCapability(
  platform: NodeJS.Platform,
  home: string,
  editingSkill: CreatorCapability,
): Promise<CreatorCapability> {
  if (platform !== "darwin") {
    return capability("unsupported", false, "Screen Studio 专属自动剪辑仅支持 macOS；可继续绑定任意制作工程、打开所在目录并等待 MP4/MOV 成片。");
  }
  const candidates = [join(home, "Applications", "Screen Studio.app")];
  if (home === homedir()) candidates.unshift("/Applications/Screen Studio.app");
  for (const path of candidates) {
    const app = await stat(path).catch(() => undefined);
    if (app?.isDirectory() && await appRuntimeAvailable(path, platform)) {
      if (editingSkill.state === "ready") {
        return capability("ready", false, "已发现 Screen Studio 及 screen-studio-editor，可使用专属自动剪辑。", path);
      }
      return capability("missing", false, "已发现 Screen Studio，但 screen-studio-editor 的 SKILL.md 入口不可用；专属自动剪辑暂不可用。", path);
    }
  }
  return capability("missing", false, "未发现可执行的 Screen Studio；专属自动剪辑暂不可用。可继续使用任意制作工具。");
}

async function appRuntimeAvailable(path: string, platform: NodeJS.Platform): Promise<boolean> {
  const runtimeDir = join(path, "Contents", "MacOS");
  const entries = await readdir(runtimeDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && await executableFile(join(runtimeDir, entry.name), platform)) return true;
  }
  return false;
}

async function executableFile(path: string, platform: NodeJS.Platform): Promise<boolean> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined || !info.isFile()) return false;
  const mode = platform === "win32" ? constants.F_OK : constants.X_OK;
  return access(path, mode).then(() => true, () => false);
}

async function interpreterAvailable(
  python: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): Promise<boolean> {
  if (await executableFile(python, platform)) return true;
  if (python.includes("/") || python.includes("\\")) return false;
  return (await findExecutable(python, env, platform, home)) !== undefined;
}

async function subtitleCapability(
  path: string,
  platform: NodeJS.Platform,
): Promise<CreatorCapability> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) {
    return capability(
      "missing",
      false,
      `未发现 oil-subtitle；执行 ${subtitleInstallCommand(path)} 后重试。${platform === "win32" ? " Windows 请在 Git Bash 或其他 bash 环境运行上游 setup.sh。" : ""}`,
      path,
    );
  }
  try {
    const resolved = await resolveSubtitleSkill(path, platform);
    if (!await executableFile(resolved.python, platform)) {
      return capability(
        "missing",
        false,
        `已发现 oil-subtitle，但虚拟环境解释器不可执行；${setupInstruction(path, platform)} 字幕生成和预览暂不可用。`,
        path,
      );
    }
    return capability("ready", false, "已发现字幕工作流。", resolved.root);
  } catch {
    return capability(
      "missing",
      false,
      `已发现 oil-subtitle 目录，但尚未完成 setup.sh；${setupInstruction(path, platform)} 字幕生成和预览暂不可用。`,
      path,
    );
  }
}

function setupInstruction(path: string, platform: NodeJS.Platform): string {
  const command = `执行 bash "${join(path, "setup.sh")}" 后重试。`;
  return platform === "win32"
    ? `请在 Git Bash 或其他 bash 环境${command}`
    : command;
}

async function coverCapability(
  path: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): Promise<CreatorCapability> {
  try {
    const resolved = await resolveCoverSkill(path, platform);
    if (!await interpreterAvailable(resolved.python, platform, env, home)) {
      return capability("missing", false, "已发现 oil-cover，但未找到可执行的 Python 解释器；封面生成暂不可用。", path);
    }
    return capability("ready", false, "已发现封面工作流。", resolved.root);
  } catch {
    return capability("missing", false, "未发现 oil-cover；封面生成不可用。", path);
  }
}

function credentialCapability(secret: CreatorSecrets[keyof CreatorSecrets], label: string): CreatorCapability {
  return secret.configured
    ? capability("ready", false, `${label}凭据已配置。`)
    : capability("missing", false, `${label}凭据未配置。`);
}

async function skillCapability(
  findSkillDir: (skillName: string) => string | undefined,
  skillName: string,
): Promise<CreatorCapability> {
  const found = findSkillDir(skillName);
  if (found === undefined) return capability("missing", false, `未发现 ${skillName}。`);
  const entryPath = join(found, "SKILL.md");
  const entry = await stat(entryPath).catch(() => undefined);
  const readable = entry?.isFile() && await access(entryPath, constants.R_OK).then(() => true, () => false);
  return readable
    ? capability("ready", false, `已发现 ${skillName}。`, found)
    : capability("missing", false, `已发现 ${skillName} 目录，但缺少可读取的 SKILL.md 入口。`, found);
}

export async function findExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): Promise<string | undefined> {
  const pathValue = pathEnvValue(env);
  const extensions = platform === "win32"
    ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)]
    : [""];
  const directories = [
    ...pathValue.split(delimiter).filter(Boolean),
    ...extraBinDirs(platform, home, env),
  ];
  for (const directory of directories) {
    for (const extension of extensions) {
      const fileName = platform === "win32" && extension !== ""
        ? `${command}${extension}`
        : command;
      const path = join(directory, fileName);
      if (await executableFile(path, platform)) return path;
    }
  }
  return undefined;
}

function chromeInstallCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string[] {
  if (platform === "win32") {
    return [
      env.VIDEO_PUBLISHER_CHROME,
      env.PROGRAMFILES && join(env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      env["PROGRAMFILES(X86)"] && join(env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    ].filter((value): value is string => typeof value === "string" && value !== "");
  }
  if (platform === "darwin") {
    return [env.VIDEO_PUBLISHER_CHROME, join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      .filter((value): value is string => typeof value === "string" && value !== "");
  }
  return [env.VIDEO_PUBLISHER_CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .filter((value): value is string => typeof value === "string" && value !== "");
}

async function findChrome(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): Promise<string | undefined> {
  for (const path of chromeInstallCandidates(platform, env, home)) {
    const info = await stat(path).catch(() => undefined);
    if (info?.isFile()) return path;
  }
  return undefined;
}

function patchrightCapability(found: string | undefined): CreatorCapability {
  if (found === undefined) {
    return capability("missing", false, "未发现 Google Chrome；Windows Patchright 页面准备和发布数据同步不可用。");
  }
  return capability("ready", false, "已发现 Google Chrome；Patchright 使用独立账号目录，真实发布和数据同步仍需逐平台验收及当次批准。", found);
}

function recommendationsOf(capabilities: CreatorCapabilities, platform: NodeJS.Platform): string[] {
  const recommendations: string[] = [];
  if (capabilities.library.state !== "ready") recommendations.push("先选择一个可读写的内容目录。");
  if (capabilities.screenStudio.state === "missing") recommendations.push("需要录屏和自动剪辑时再安装 Screen Studio（screen.studio，仅 macOS）。");
  if (capabilities.subtitleSkill.state !== "ready") {
    const installedPath = capabilities.subtitleSkill.path;
    recommendations.push(
      capabilities.subtitleSkill.detail.includes("尚未完成 setup.sh") && installedPath !== undefined
        ? `字幕：bash "${join(installedPath, "setup.sh")}"${platform === "win32" ? "（Windows 请在 Git Bash 或其他 bash 环境运行）" : ""}`
        : installedPath === undefined
          ? `字幕：git clone https://github.com/oil-oil/oil-subtitle ~/.agents/skills/oil-subtitle && bash ~/.agents/skills/oil-subtitle/setup.sh${platform === "win32" ? "（Windows 请在 Git Bash 或其他 bash 环境运行 setup.sh）" : ""}`
          : `字幕：${subtitleInstallCommand(installedPath)}${platform === "win32" ? "（Windows 请在 Git Bash 或其他 bash 环境运行 setup.sh）" : ""}`,
    );
  }
  if (capabilities.subtitleCredential.state !== "ready") recommendations.push("字幕 Key：到百炼控制台（https://bailian.console.aliyun.com）申请 DASHSCOPE_API_KEY，在设置页填写。");
  if (capabilities.coverSkill.state !== "ready") recommendations.push("封面：git clone https://github.com/oil-oil/oil-cover ~/.agents/skills/oil-cover");
  if (capabilities.coverCredential.state !== "ready") recommendations.push("封面 Key：到 ZenMux（https://zenmux.ai）控制台申请 ZENMUX_API_KEY，在设置页填写。");
  if (capabilities.publishSync.state !== "ready") {
    recommendations.push("自动发布和数据回收：安装 Google Chrome，或通过 VIDEO_PUBLISHER_CHROME 指定 chrome.exe。");
  }
  if (capabilities.editingSkill.state === "missing") recommendations.push("自动剪辑：git clone https://github.com/oil-oil/screen-studio-editor ~/.agents/skills/screen-studio-editor");
  if (capabilities.publishSkill.state !== "ready") recommendations.push("自动发布：git clone https://github.com/oil-oil/video-publisher-skill ~/.agents/skills/video-publisher");
  if (capabilities.articleSkill.state !== "ready") recommendations.push("公众号图文：git clone https://github.com/oil-oil/oil-video-article ~/.agents/skills/oil-video-article");
  return recommendations;
}

export async function inspectCreatorSetup(
  options: InspectCreatorSetupOptions,
): Promise<CreatorSetupStatus> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const findSkillDir = options.findSkillDir ?? ((name: string) => defaultFindSkillDir(name, home));
  const discoveredEditingSkill = await skillCapability(findSkillDir, "screen-studio-editor");
  const screenStudio = await screenStudioCapability(platform, home, discoveredEditingSkill);
  const editingSkill = platform !== "darwin"
    ? capability("unsupported", false, "screen-studio-editor 仅可与 macOS 上可执行的 Screen Studio 配合使用；当前系统不提供该专属自动剪辑。")
    : screenStudio.state === "ready"
      ? discoveredEditingSkill
      : capability(
        "missing",
        false,
        discoveredEditingSkill.state === "ready"
          ? "已发现 screen-studio-editor，但可执行的 Screen Studio 尚不可用；专属自动剪辑暂不可用。"
          : discoveredEditingSkill.detail,
        discoveredEditingSkill.path,
      );
  const capabilities: CreatorCapabilities = {
    library: await libraryCapability(options.libraryRoot),
    screenStudio,
    subtitleSkill: await subtitleCapability(options.subtitleSkillDir, platform),
    subtitleCredential: credentialCapability(options.settings.secrets.subtitle, "字幕"),
    coverSkill: await coverCapability(options.coverSkillDir, platform, env, home),
    coverCredential: credentialCapability(options.settings.secrets.cover, "封面"),
    publishSync: patchrightCapability(await findChrome(platform, env, home)),
    editingSkill,
    publishSkill: await skillCapability(findSkillDir, "video-publisher"),
    articleSkill: await skillCapability(findSkillDir, "oil-video-article"),
  };
  return {
    platform,
    dataDir: options.dataDir,
    settings: options.settings,
    capabilities,
    recommendations: recommendationsOf(capabilities, platform),
  };
}
