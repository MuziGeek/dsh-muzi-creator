import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AtlasReadService } from "../src/atlasService.ts";
import type { Config } from "../src/config.ts";

const roots: string[] = [];

async function fixture(): Promise<Config> {
  const root = await mkdtemp(join(tmpdir(), "muzi-atlas-test-"));
  roots.push(root);
  const atlasRoot = join(root, "atlas");
  await mkdir(join(atlasRoot, "raw"), { recursive: true });
  await mkdir(join(atlasRoot, "wiki", "topics"), { recursive: true });
  await writeFile(join(atlasRoot, ".wiki-schema.md"), "# llm-wiki\nSchema Version: 1.1\nLanguage: zh-CN\n");
  await writeFile(join(atlasRoot, "raw", "private.md"), "raw secret");
  await writeFile(join(atlasRoot, "raw", "asset.bin"), "raw asset");
  await writeFile(join(atlasRoot, "wiki", "topics", "formal.md"), "# 正式主题\n\n可信正文<script>alert(1)</script>\n![](https://example.com/a.png)");
  return {
    atlasRoot,
    creatorRoot: join(root, "creator"),
    libraryRoot: join(root, "creator", "10-active"),
    dataDir: join(root, "data"),
    subtitleSkillDir: "",
    coverSkillDir: "",
    previewMaxBytes: 262144,
    searchResultLimit: 30,
    enabledDocuments: [],
    enabledPublishTargets: [],
    externalActionsEnabled: false,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("llm-wiki read projection", () => {
  it("counts raw files but searches formal pages only", async () => {
    const service = new AtlasReadService(await fixture());
    const result = await service.search({ query: "" });
    expect(result.status).toMatchObject({ schemaVersion: "1.1", rawMarkdownCount: 1, rawFileCount: 2, formalPageCount: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.locator).toBe("atlas://wiki/topics/formal.md");
    expect((await service.search({ query: "raw secret" })).items).toHaveLength(0);
  });

  it("sanitizes dangerous Markdown and rejects non-Wiki locators", async () => {
    const service = new AtlasReadService(await fixture());
    const page = await service.get({ locator: "atlas://wiki/topics/formal.md" });
    expect(page.markdown).not.toContain("<script>");
    expect(page.markdown).not.toContain("https://example.com/a.png");
    await expect(service.get({ locator: "atlas://raw/private.md" })).rejects.toThrow("only formal Wiki");
  });
});
