import { describe, expect, it } from "vitest";

import {
  libraryConventionText,
  registerLibraryPrompt,
  resolvePromptLibraryRoot,
} from "../src/libraryPrompt.ts";

describe("libraryConventionText", () => {
  it("describes the Muzi facts and prevents direct file writes", () => {
    const text = libraryConventionText("/Movies/视频项目", "/.dsh-oil-creator");
    expect(text).toContain("Creator Studio");
    expect(text).toContain("Muzi Atlas");
    expect(text).toContain("raw/ 不参与搜索");
    expect(text).toContain("muzi_creator_*");
    expect(text).toContain("muzi_knowledge_*");
    expect(text).toContain("script.md");
    expect(text).toContain("oil_script_rules");
    expect(text).toContain("逐次通过 DSH 审批");
    expect(text).not.toContain("/Movies/视频项目");
    expect(text).not.toContain("/.dsh-oil-creator");
    expect(text).not.toContain("当前启用平台");
  });

  it("names the enabled publish platforms", () => {
    const text = libraryConventionText("/Movies/视频项目", "/.dsh-oil-creator", undefined, ["douyin", "wechat"]);
    expect(text).toContain("当前启用平台：抖音、视频号");
    expect(libraryConventionText("/Movies/视频项目", "/.dsh-oil-creator", undefined, []))
      .toContain("当前没有启用发布平台");
  });

  it("appends the configured script rules", () => {
    const text = libraryConventionText("/Movies/视频项目", "/.dsh-oil-creator", " 口语化，少用术语。 ");
    expect(text).toContain("当前脚本规则（人设）：");
    expect(text).toContain("口语化，少用术语。");
    const without = libraryConventionText("/Movies/视频项目", "/.dsh-oil-creator", "   ");
    expect(without).not.toContain("当前脚本规则");
  });
});

describe("resolvePromptLibraryRoot", () => {
  it("prefers the scanned library root", () => {
    expect(resolvePromptLibraryRoot({
      libraryRoot: "/default",
      dataDir: "/data",
      cache: { libraryRoot: "/chosen" },
    })).toBe("/chosen");
  });
});

describe("registerLibraryPrompt", () => {
  it("registers a stable oil:library section", () => {
    const seen: Array<{ name: string; order: number; text: string }> = [];
    registerLibraryPrompt({
      systemPrompt: {
        section(section) {
          const text = typeof section.text === "function" ? section.text() : section.text;
          seen.push({ name: section.name, order: section.order, text });
          return () => undefined;
        },
      },
    }, { libraryRoot: "/lib", dataDir: "/data" });
    expect(seen).toEqual([{
      name: "oil:library",
      order: 120,
      text: libraryConventionText("/lib", "/data"),
    }]);
  });
});
