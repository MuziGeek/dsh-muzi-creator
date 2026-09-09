import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  Config,
  defaultCoverSkillDir,
  defaultDataDir,
  defaultLibraryRoot,
  defaultSubtitleSkillDir,
  defaultTrellisProjectsRoot,
  expandHomePath,
  legacyDataDir,
  resolveConfiguredPath,
  resolveDataDir,
  resolveSkillDir,
  resolveTrellisConfig,
  skillDirCandidates,
} from "../src/config.ts";

describe("portable config defaults", () => {
  it("uses Creator Studio on Windows and a Muzi Creator media root elsewhere", () => {
    expect(defaultLibraryRoot("darwin")).toBe(join(homedir(), "Movies", "Muzi Creator"));
    expect(defaultLibraryRoot("win32")).toBe(join("D:\\Muzi\\Workspace\\creator-studio", "10-active"));
    expect(defaultLibraryRoot("linux")).toBe(join(homedir(), "Videos", "Muzi Creator"));
  });

  it("uses the local Git collection as the Windows Trellis project root", () => {
    expect(defaultTrellisProjectsRoot("win32")).toBe("D:\\GitProject");
    expect(defaultTrellisProjectsRoot("linux")).toBe(join(homedir(), "Projects"));
    expect(resolveTrellisConfig({ trellisProjectsRoot: "   " } as Config).trellisProjectsRoot)
      .toBe(defaultTrellisProjectsRoot());
  });

  it("uses the Muzi data directory for a fresh installation", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-mz-data-home-"));
    expect(defaultDataDir(home)).toBe(join(home, ".dsh-mz-creator"));
    expect(resolveDataDir({ dataDir: "" }, home)).toBe(defaultDataDir(home));
  });

  it("uses the legacy directory unchanged when it is the only existing data directory", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-mz-data-home-"));
    const legacy = legacyDataDir(home);
    mkdirSync(legacy);
    const history = join(legacy, "overlay.json");
    writeFileSync(history, "{\"history\":true}\n", "utf8");

    expect(resolveDataDir({ dataDir: "" }, home)).toBe(legacy);
    expect(defaultDataDir(home)).not.toBe(legacy);
    expect(resolveDataDir({ dataDir: "" }, home)).toBe(legacy);
    expect(readFileSync(history, "utf8")).toBe("{\"history\":true}\n");
  });

  it("requires an explicit dataDir when both old and new data directories exist", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-mz-data-home-"));
    const legacy = legacyDataDir(home);
    const current = defaultDataDir(home);
    const explicit = join(home, "chosen-data");
    mkdirSync(legacy);
    mkdirSync(current);

    expect(() => resolveDataDir({ dataDir: "" }, home)).toThrow(/显式设置 dataDir/);
    expect(Config().dataDir).toBe("");
    const parsed = Config({ dataDir: explicit } as Config);
    expect(parsed.dataDir).toBe(explicit);
    expect(resolveDataDir(parsed, home)).toBe(explicit);
  });

  it("lets config and env override skill directories", () => {
    expect(resolveConfiguredPath("", defaultSubtitleSkillDir())).toBe(defaultSubtitleSkillDir());
    expect(resolveConfiguredPath("", defaultCoverSkillDir(), "/tmp/from-env")).toBe("/tmp/from-env");
    expect(resolveConfiguredPath("/opt/oil-cover", defaultCoverSkillDir(), "/tmp/from-env")).toBe("/opt/oil-cover");
  });

  it("discovers common skill roots without overriding explicit choices", () => {
    expect(skillDirCandidates("oil-cover")).toEqual([
      join(homedir(), ".claude", "skills", "oil-cover"),
      join(homedir(), ".codex", "skills", "oil-cover"),
      join(homedir(), ".agents", "skills", "oil-cover"),
      join(homedir(), ".grok", "skills", "oil-cover"),
    ]);
    expect(resolveSkillDir("/opt/custom-skill", "oil-cover", "/opt/from-env")).toBe("/opt/custom-skill");
    expect(resolveSkillDir("", "oil-cover", "/opt/from-env")).toBe("/opt/from-env");
    expect(expandHomePath("~/Movies/content")).toBe(join(homedir(), "Movies", "content"));
    expect(expandHomePath("%USERPROFILE%\\Videos\\content")).toBe(join(homedir(), "Videos", "content"));
  });
});
