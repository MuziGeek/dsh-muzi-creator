import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AtlasReadService } from "../src/atlasService.ts";
import type { Config } from "../src/config.ts";
import type { KnowledgeCategory } from "../src/muziTypes.ts";

const roots: string[] = [];
const CATEGORIES: KnowledgeCategory[] = ["entities", "topics", "sources", "comparisons", "synthesis", "queries"];

async function fixture(): Promise<Config> {
  const root = await mkdtemp(join(tmpdir(), "muzi-atlas-test-"));
  roots.push(root);
  const atlasRoot = join(root, "atlas");
  await mkdir(join(atlasRoot, "raw"), { recursive: true });
  await Promise.all(CATEGORIES.map((category) => mkdir(join(atlasRoot, "wiki", category), { recursive: true })));
  await writeFile(join(atlasRoot, ".wiki-schema.md"), "# llm-wiki\nSchema Version: 1.1\nLanguage: zh-CN\n");
  await writeFile(join(atlasRoot, "raw", "private.md"), "raw secret");
  await writeFile(join(atlasRoot, "raw", "asset.bin"), "raw asset");
  await writeFile(join(atlasRoot, "wiki", "topics", "formal.md"), "# 正式主题\n\n可信正文<script>alert(1)</script>\n![](https://example.com/a.png)\n\n[[Agent Runtime]]\n```md\n[[Code Only]]\n```");
  await writeFile(join(atlasRoot, "wiki", "entities", "agent-runtime.md"), "# Agent Runtime\n\n运行时实体");
  await writeFile(join(atlasRoot, "wiki", "entities", "code-only.md"), "# Code Only\n\n只在代码块中引用");
  await writeFile(join(atlasRoot, "wiki", "sources", "source.md"), "# 素材摘要\n\n正式来源");
  return {
    atlasRoot,
    creatorRoot: join(root, "creator"),
    libraryRoot: join(root, "creator", "10-active"),
    dataDir: join(root, "data"),
    subtitleSkillDir: "",
    coverSkillDir: "",
    previewMaxBytes: 262144,
    searchResultLimit: 30,
    graphNodeLimit: 500,
    graphEdgeLimit: 5000,
    enabledDocuments: [],
    enabledPublishTargets: [],
    externalActionsEnabled: false,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("llm-wiki read projection", () => {
  it("builds a topic-first home without expanding entities or sources", async () => {
    const service = new AtlasReadService(await fixture());
    const home = await service.home();
    expect(home.status).toMatchObject({ schemaVersion: "1.1", rawMarkdownCount: 1, rawFileCount: 2, formalPageCount: 4 });
    expect(home.topics.map((page) => page.title)).toEqual(["正式主题"]);
    expect(home.directories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "topics", role: "primary", count: 1 }),
      expect.objectContaining({ category: "entities", role: "supporting", count: 2 }),
      expect.objectContaining({ category: "sources", role: "supporting", count: 1 }),
    ]));
    expect(home.topics.every((page) => page.category === "topics")).toBe(true);
  });

  it("keeps entities in their directory when no topic exists", async () => {
    const config = await fixture();
    await rm(join(config.atlasRoot, "wiki", "topics", "formal.md"));
    const home = await new AtlasReadService(config).home();
    expect(home.topics).toEqual([]);
    expect(home.directories).toContainEqual(expect.objectContaining({ category: "entities", count: 2 }));
  });

  it("uses directory paging and keeps raw material outside every formal result", async () => {
    const service = new AtlasReadService(await fixture());
    const first = await service.list({ category: "entities", limit: 1 });
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.nextOffset).toBe(1);
    const second = await service.list({ category: "entities", offset: first.nextOffset!, limit: 1 });
    expect(second.items).toHaveLength(1);
    expect(second.nextOffset).toBeNull();
    expect((await service.search({ query: "raw secret" })).items).toHaveLength(0);
  });

  it("recommends high-level knowledge for an empty query and ranks title matches first", async () => {
    const config = await fixture();
    const service = new AtlasReadService(config);
    const recommendations = await service.search({ query: "" });
    expect(recommendations.items.map((page) => page.category)).toEqual(["topics"]);
    const result = await service.search({ query: "agent runtime" });
    expect(result.items[0]).toMatchObject({ title: "Agent Runtime", category: "entities" });
    expect(result.items.some((page) => page.category === "topics")).toBe(true);
  });

  it("returns only resolved explicit Wiki links as related knowledge", async () => {
    const service = new AtlasReadService(await fixture());
    const page = await service.get({ locator: "atlas://wiki/topics/formal.md" });
    expect(page.related.map((item) => item.title)).toEqual(["Agent Runtime"]);
    expect(page.related.some((item) => item.title === "Code Only")).toBe(false);
  });

  it("builds preview statistics and one deduplicated relation from the same readable snapshot", async () => {
    const config = await fixture();
    await writeFile(join(config.atlasRoot, "wiki", "entities", "agent-runtime.md"), "# agent-runtime\n\n[[正式主题]] [[正式主题]] [[Missing]]");
    await writeFile(join(config.atlasRoot, "wiki", "topics", "formal.md"), "# 正式主题\n\n[[agent-runtime]] [[正式主题]]\n```md\n[[Code Only]]\n```\n~~~md\n[[素材摘要]]\n~~~");
    const preview = await new AtlasReadService(config).preview();
    expect(preview.status.status).toBe("ready");
    expect(preview.stats).toEqual({
      formal: 4,
      topics: 1,
      entities: 2,
      sources: 1,
      analyses: 0,
      pendingMarkdown: 1,
      rawFiles: 2,
    });
    expect(preview.nodes).toHaveLength(4);
    expect(preview.edges).toHaveLength(1);
    expect(preview.edges[0]).toMatchObject({
      sourceId: expect.stringMatching(/^kw_/),
      targetId: expect.stringMatching(/^kw_/),
    });
    expect(preview.truncated).toBe(false);
  });

  it("excludes ambiguous Wiki links and reports graph limit truncation", async () => {
    const config = await fixture();
    await writeFile(join(config.atlasRoot, "wiki", "sources", "duplicate-a.md"), "# 重名页面\n");
    await writeFile(join(config.atlasRoot, "wiki", "synthesis", "duplicate-b.md"), "# 重名页面\n");
    await writeFile(join(config.atlasRoot, "wiki", "topics", "formal.md"), "# 正式主题\n\n[[Agent Runtime]] [[重名页面]]");
    config.graphNodeLimit = 2;
    config.graphEdgeLimit = 1;
    const preview = await new AtlasReadService(config).preview();
    expect(preview.nodes.map((node) => node.title)).toEqual(["正式主题", "Agent Runtime"]);
    expect(preview.edges).toHaveLength(1);
    expect(preview.truncated).toBe(true);
  });

  it("does not expose graph data for an unsupported schema", async () => {
    const config = await fixture();
    await writeFile(join(config.atlasRoot, ".wiki-schema.md"), "# llm-wiki\nSchema Version: 2.0\nLanguage: zh-CN\n");
    const preview = await new AtlasReadService(config).preview();
    expect(preview.status.status).toBe("incomplete");
    expect(preview.nodes).toEqual([]);
    expect(preview.edges).toEqual([]);
  });

  it("sanitizes dangerous Markdown and rejects non-Wiki locators", async () => {
    const service = new AtlasReadService(await fixture());
    const page = await service.get({ locator: "atlas://wiki/topics/formal.md" });
    expect(page.markdown).not.toContain("<script>");
    expect(page.markdown).not.toContain("https://example.com/a.png");
    await expect(service.get({ locator: "atlas://raw/private.md" })).rejects.toThrow("only formal Wiki");
  });
});
