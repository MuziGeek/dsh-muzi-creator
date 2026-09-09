import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import Schema from "@deepseek-ai/schemastery";

export interface Config {
  libraryRoot: string;
  creatorRoot: string;
  atlasRoot: string;
  dataDir: string;
  subtitleSkillDir: string;
  coverSkillDir: string;
  videoPublisherSkillDir?: string;
  videoConnectionTimeoutMs?: number;
  videoConnectionPollIntervalMs?: number;
  videoAccountCapabilitiesTimeoutMs?: number;
  previewMaxBytes: number;
  searchResultLimit: number;
  graphNodeLimit: number;
  graphEdgeLimit: number;
  enabledDocuments: string[];
  enabledPublishTargets: string[];
  externalActionsEnabled: boolean;
  obsidianExecutable?: string;
  trellisProjectsRoot?: string;
  trellisGithubClientId?: string;
  trellisGithubConcurrency?: number;
  trellisGithubSyncTimeoutMs?: number;
  trellisGithubMaxRepositories?: number;
  trellisGithubMaxResponseBytes?: number;
  trellisGitExecutable?: string;
  trellisPythonExecutable?: string;
  trellisPythonArgs?: string[];
  trellisMaxTaskBytes?: number;
  trellisMaxTasks?: number;
  trellisWatchDebounceMs?: number;
  trellisFallbackPollMs?: number;
  trellisArchivePreviewTtlMs?: number;
  trellisCommandTimeoutMs?: number;
  trellisProcessGraceMs?: number;
  trellisOutputMaxBytes?: number;
}

export type TrellisConfig = Required<Pick<Config,
  | "trellisProjectsRoot"
  | "trellisGitExecutable"
  | "trellisPythonExecutable"
  | "trellisPythonArgs"
  | "trellisMaxTaskBytes"
  | "trellisMaxTasks"
  | "trellisWatchDebounceMs"
  | "trellisFallbackPollMs"
  | "trellisArchivePreviewTtlMs"
  | "trellisCommandTimeoutMs"
  | "trellisProcessGraceMs"
  | "trellisOutputMaxBytes"
>>;

export function resolveTrellisConfig(config: Config): TrellisConfig {
  const configuredProjectsRoot = config.trellisProjectsRoot?.trim();
  return {
    trellisProjectsRoot: expandHomePath(configuredProjectsRoot === undefined || configuredProjectsRoot === ""
      ? defaultTrellisProjectsRoot()
      : configuredProjectsRoot),
    trellisGitExecutable: config.trellisGitExecutable ?? "git",
    trellisPythonExecutable: config.trellisPythonExecutable ?? (process.platform === "win32" ? "python" : "python3"),
    trellisPythonArgs: config.trellisPythonArgs ?? [],
    trellisMaxTaskBytes: config.trellisMaxTaskBytes ?? 262144,
    trellisMaxTasks: config.trellisMaxTasks ?? 2000,
    trellisWatchDebounceMs: config.trellisWatchDebounceMs ?? 350,
    trellisFallbackPollMs: config.trellisFallbackPollMs ?? 15000,
    trellisArchivePreviewTtlMs: config.trellisArchivePreviewTtlMs ?? 120000,
    trellisCommandTimeoutMs: config.trellisCommandTimeoutMs ?? 30000,
    trellisProcessGraceMs: config.trellisProcessGraceMs ?? 2000,
    trellisOutputMaxBytes: config.trellisOutputMaxBytes ?? 65536,
  };
}

export function defaultCreatorRoot(): string {
  return "D:\\Muzi\\Workspace\\creator-studio";
}

export function defaultAtlasRoot(): string {
  return "D:\\Muzi\\Knowledge\\muzi-atlas";
}

export function defaultTrellisProjectsRoot(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "D:\\GitProject" : join(homedir(), "Projects");
}

export function defaultLibraryRoot(platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return join(defaultCreatorRoot(), "10-active");
  const videos = platform === "darwin" ? "Movies" : "Videos";
  return join(homedir(), videos, "Muzi Creator");
}

export function defaultDataDir(home = homedir()): string {
  return join(home, ".dsh-mz-creator");
}

export function legacyDataDir(home = homedir()): string {
  return join(home, ".dsh-oil-creator");
}

export function defaultSubtitleSkillDir(): string {
  return join(homedir(), ".claude", "skills", "oil-subtitle");
}

export function defaultCoverSkillDir(): string {
  return join(homedir(), ".claude", "skills", "oil-cover");
}

export function skillDirCandidates(skillName: string, home = homedir()): string[] {
  return [
    join(home, ".claude", "skills", skillName),
    join(home, ".codex", "skills", skillName),
    join(home, ".agents", "skills", skillName),
    join(home, ".grok", "skills", skillName),
  ];
}

function joinUnderHome(home: string, rest: string): string {
  return join(home, ...rest.replaceAll("\\", "/").split("/").filter(Boolean));
}

export function expandHomePath(path: string, home = homedir()): string {
  const trimmed = path.trim();
  if (trimmed === "~" || trimmed === "%USERPROFILE%" || trimmed === "%HOME%") return home;
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return joinUnderHome(home, trimmed.slice(2));
  const windowsHome = /^%(?:USERPROFILE|HOME)%([\\/].*)?$/i.exec(trimmed);
  if (windowsHome !== null) {
    const rest = windowsHome[1];
    return rest === undefined || rest === "" ? home : joinUnderHome(home, rest);
  }
  return trimmed;
}

/** @deprecated Use {@link defaultLibraryRoot}. Kept so existing imports keep working. */
export const DEFAULT_LIBRARY_ROOT = defaultLibraryRoot();

export const Config: Schema<Config> = Schema.object({
  libraryRoot: Schema.string().default(defaultLibraryRoot()),
  creatorRoot: Schema.string().default(defaultCreatorRoot()),
  atlasRoot: Schema.string().default(defaultAtlasRoot()),
  dataDir: Schema.string().default(""),
  subtitleSkillDir: Schema.string().default(""),
  coverSkillDir: Schema.string().default(""),
  videoPublisherSkillDir: Schema.string().default(""),
  videoConnectionTimeoutMs: Schema.number().min(60_000).max(1_800_000).default(600_000),
  videoConnectionPollIntervalMs: Schema.number().min(1000).max(30_000).default(2000),
  videoAccountCapabilitiesTimeoutMs: Schema.number().min(1000).max(90_000).default(5000),
  previewMaxBytes: Schema.number().min(4096).max(1048576).default(262144),
  searchResultLimit: Schema.number().min(1).max(100).default(30),
  graphNodeLimit: Schema.number().min(10).max(2000).default(500),
  graphEdgeLimit: Schema.number().min(10).max(20000).default(5000),
  enabledDocuments: Schema.array(String).default(["mother", "video", "wechat", "xiaohongshu", "blog"]),
  enabledPublishTargets: Schema.array(String).default(["bilibili", "douyin", "wechat", "xiaohongshu", "blog"]),
  externalActionsEnabled: Schema.boolean().default(false),
  obsidianExecutable: Schema.string().default(""),
  trellisGithubSyncTimeoutMs: Schema.number().min(1000).max(600000).default(120000),
  trellisGithubConcurrency: Schema.number().min(1).max(8).default(4),
  trellisGithubClientId: Schema.string().default(""),
  trellisGithubMaxRepositories: Schema.number().min(1).max(2000).default(200),
  trellisGithubMaxResponseBytes: Schema.number().min(1048576).max(33554432).default(8388608),
  trellisProjectsRoot: Schema.string().default(defaultTrellisProjectsRoot()),
  trellisGitExecutable: Schema.string().default("git"),
  trellisPythonExecutable: Schema.string().default(process.platform === "win32" ? "python" : "python3"),
  trellisPythonArgs: Schema.array(String).default([]),
  trellisMaxTaskBytes: Schema.number().min(4096).max(1048576).default(262144),
  trellisMaxTasks: Schema.number().min(1).max(10000).default(2000),
  trellisWatchDebounceMs: Schema.number().min(50).max(10000).default(350),
  trellisFallbackPollMs: Schema.number().min(1000).max(300000).default(15000),
  trellisArchivePreviewTtlMs: Schema.number().min(5000).max(600000).default(120000),
  trellisCommandTimeoutMs: Schema.number().min(1000).max(600000).default(30000),
  trellisProcessGraceMs: Schema.number().min(100).max(30000).default(2000),
  trellisOutputMaxBytes: Schema.number().min(4096).max(1048576).default(65536),
});

export function resolveDataDir(
  config: Pick<Config, "dataDir"> & Partial<Config>,
  home = homedir(),
): string {
  if (config.dataDir !== "") return config.dataDir;

  const legacy = legacyDataDir(home);
  const current = defaultDataDir(home);
  if (existsSync(legacy) && existsSync(current)) {
    throw new Error(
      `检测到旧数据目录 ${legacy} 和新数据目录 ${current}；请在 dsh-muzi-creator 配置中显式设置 dataDir。`,
    );
  }
  return existsSync(legacy) ? legacy : current;
}

export function resolveConfiguredPath(configured: string, fallback: string, envValue?: string): string {
  if (configured.trim() !== "") return configured;
  if (envValue !== undefined && envValue.trim() !== "") return envValue;
  return fallback;
}

export function resolveSkillDir(
  configured: string,
  skillName: string,
  envValue?: string,
): string {
  if (configured.trim() !== "") return expandHomePath(configured);
  if (envValue !== undefined && envValue.trim() !== "") return expandHomePath(envValue);
  return skillDirCandidates(skillName).find((candidate) => existsSync(candidate))
    ?? skillDirCandidates(skillName)[0]!;
}
