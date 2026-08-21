import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultCoverSkillDir,
  defaultDataDir,
  defaultLibraryRoot,
  defaultSubtitleSkillDir,
  expandHomePath,
  resolveConfiguredPath,
  resolveDataDir,
  resolveSkillDir,
  skillDirCandidates,
} from "../src/config.ts";

describe("portable config defaults", () => {
  it("uses Creator Studio on Windows and a Muzi Creator media root elsewhere", () => {
    expect(defaultLibraryRoot("darwin")).toBe(join(homedir(), "Movies", "Muzi Creator"));
    expect(defaultLibraryRoot("win32")).toBe(join("D:\\Muzi\\Workspace\\creator-studio", "10-active"));
    expect(defaultLibraryRoot("linux")).toBe(join(homedir(), "Videos", "Muzi Creator"));
  });

  it("resolves empty dataDir to the home-local store", () => {
    expect(resolveDataDir({
      libraryRoot: defaultLibraryRoot(),
      dataDir: "",
      subtitleSkillDir: "",
      coverSkillDir: "",
    })).toBe(defaultDataDir());
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
