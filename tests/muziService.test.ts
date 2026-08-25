import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Config } from "../src/config.ts";
import { MuziCreatorService } from "../src/muziService.ts";

const roots: string[] = [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function config(): Promise<Config> {
  const root = await mkdtemp(join(tmpdir(), "muzi-creator-test-"));
  roots.push(root);
  const creatorRoot = join(root, "creator");
  await mkdir(creatorRoot);
  return {
    creatorRoot,
    atlasRoot: join(root, "atlas"),
    libraryRoot: join(creatorRoot, "10-active"),
    dataDir: join(root, "data"),
    subtitleSkillDir: "",
    coverSkillDir: "",
    previewMaxBytes: 262144,
    searchResultLimit: 30,
    graphNodeLimit: 500,
    graphEdgeLimit: 5000,
    enabledDocuments: ["mother", "video", "wechat", "xiaohongshu", "blog"],
    enabledPublishTargets: ["bilibili", "douyin", "wechat", "xiaohongshu", "blog"],
    externalActionsEnabled: false,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("muzi.creator/2", () => {
  it("requires preview confirmation and optimistic revisions", async () => {
    const service = new MuziCreatorService(await config());
    await expect(service.createProject({ title: "主题", primaryDocument: "mother", confirmed: false })).rejects.toThrow("preview required");
    const created = await service.createProject({ title: "主题", primaryDocument: "mother", confirmed: true });
    expect(created.id).toMatch(/^mc_[a-f0-9]{24}$/);
    expect(created.primaryDocument).toBe("mother");
    await expect(service.saveDocument({ id: created.id, document: "mother", text: "母内容", status: "draft", expectedRevision: created.revision, confirmed: false })).rejects.toThrow("preview required");
    const saved = await service.saveDocument({ id: created.id, document: "mother", text: "母内容", status: "draft", expectedRevision: created.revision, confirmed: true });
    expect(saved.revision).toBe(created.revision + 1);
    await expect(service.saveDocument({ id: created.id, document: "video", text: "视频", status: "draft", expectedRevision: created.revision, confirmed: true })).rejects.toThrow("revision conflict");
  });

  it("marks a derivative stale when its source changes", async () => {
    const service = new MuziCreatorService(await config());
    let project = await service.createProject({ title: "先母内容", primaryDocument: "mother", confirmed: true });
    project = await service.saveDocument({ id: project.id, document: "mother", text: "v1", status: "ready", expectedRevision: project.revision, confirmed: true });
    const sourceHash = project.documents.mother.sha256!;
    project = await service.saveDocument({ id: project.id, document: "wechat", text: "派生稿", status: "draft", expectedRevision: project.revision, confirmed: true, derivedFrom: "mother", sourceSha256: sourceHash });
    expect(project.documents.wechat.stale).toBe(false);
    project = await service.saveDocument({ id: project.id, document: "mother", text: "v2", status: "ready", expectedRevision: project.revision, confirmed: true });
    expect(project.documents.wechat.stale).toBe(true);
    expect(project.content.wechat).toBe("派生稿");
  });

  it("filters projects by an exact Atlas locator", async () => {
    const service = new MuziCreatorService(await config());
    const locator = "atlas://wiki/topics/agent.md";
    await service.createProject({
      title: "Agent",
      primaryDocument: "mother",
      confirmed: true,
      atlasReferences: [{ locator, title: "Agent", sha256: "a".repeat(64), attachedAt: "2026-08-22T00:00:00.000Z" }],
    });
    await service.createProject({ title: "Other", primaryDocument: "video", confirmed: true });
    expect((await service.listProjects({ atlasLocator: locator })).items.map((item) => item.title)).toEqual(["Agent"]);
    expect((await service.listProjects({ atlasLocator: "atlas://wiki/topics/missing.md" })).items).toEqual([]);
  });

  it("projects document changes through a revision token and returns an Obsidian registration guide", async () => {
    const cfg = await config();
    const service = new MuziCreatorService(cfg);
    const created = await service.createProject({ title: "只读预览", primaryDocument: "mother", confirmed: true });
    const before = await service.revision();
    const projectRoot = join(cfg.creatorRoot, "10-active", created.folderName);
    await writeFile(join(projectRoot, "mother-content.md"), "在 Obsidian 中编辑");
    const after = await service.revision();
    expect(after).not.toBe(before);
    const location = await service.documentLocation({ id: created.id, document: "mother" });
    expect(location.path).toBe(join(projectRoot, "mother-content.md"));
    expect(location.obsidianReady).toBe(false);
    expect(location.obsidianUri).toBeNull();
    expect(location.message).toContain("独立仓库");
  });

  it("migrates V1 without changing the stable id or body", async () => {
    const cfg = await config();
    const projectRoot = join(cfg.creatorRoot, "10-active", "2026-08-20_old");
    await mkdir(join(projectRoot, "channels", "video"), { recursive: true });
    await writeFile(join(projectRoot, "project.yml"), "schema: muzi.creator/1\nid: mc_0123456789abcdef01234567\ntitle: Old\ncreated: 2026-08-20T00:00:00.000Z\nupdated: 2026-08-20T00:00:00.000Z\nrevision: 2\nstage: idea\nchannels:\n  video: draft\natlasReferences: []\n");
    await writeFile(join(projectRoot, "channels", "video", "script.md"), "原脚本");
    const service = new MuziCreatorService(cfg);
    const project = await service.getProject({ id: "mc_0123456789abcdef01234567" });
    expect(project.revision).toBe(3);
    expect(project.primaryDocument).toBe("video");
    expect(project.content.video).toBe("原脚本");
    expect(await readFile(join(projectRoot, "project.yml"), "utf8")).toContain("muzi.creator/2");
  });

  it("prefers the portrait Oil cover and exposes no filesystem path", async () => {
    const cfg = await config();
    const service = new MuziCreatorService(cfg);
    const created = await service.createProject({ title: "有封面", primaryDocument: "mother", confirmed: true });
    const projectRoot = join(cfg.creatorRoot, "10-active", created.folderName);
    const wide = Buffer.concat([PNG, Buffer.from("wide")]);
    const portrait = Buffer.concat([PNG, Buffer.from("portrait")]);
    await writeFile(join(projectRoot, "episode_16x9.png"), wide);
    await writeFile(join(projectRoot, "episode_3x4.png"), portrait);

    const project = await service.getProject({ id: created.id });
    const cover = await service.getProjectCover({ id: created.id });
    expect(project.coverRevision).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(project)).not.toContain(projectRoot);
    expect(cover).toEqual({ found: true, mime: "image/png", base64: portrait.toString("base64") });
  });

  it("returns an empty cover for missing, invalid, oversized, and linked files", async () => {
    const cfg = await config();
    const service = new MuziCreatorService(cfg);
    const created = await service.createProject({ title: "无封面", primaryDocument: "mother", confirmed: true });
    const projectRoot = join(cfg.creatorRoot, "10-active", created.folderName);
    expect((await service.getProject({ id: created.id })).coverRevision).toBeNull();
    expect(await service.getProjectCover({ id: created.id })).toEqual({ found: false, mime: "", base64: "" });

    await writeFile(join(projectRoot, "broken_3x4.png"), "not a png");
    expect((await service.getProject({ id: created.id })).coverRevision).toBeNull();

    await rm(join(projectRoot, "broken_3x4.png"));
    await writeFile(join(projectRoot, "large_3x4.png"), Buffer.concat([PNG, Buffer.alloc(cfg.previewMaxBytes)]));
    expect((await service.getProject({ id: created.id })).coverRevision).toBeNull();

    await rm(join(projectRoot, "large_3x4.png"));
    const external = join(cfg.creatorRoot, "external-cover");
    await mkdir(external);
    await writeFile(join(external, "cover.png"), PNG);
    await symlink(external, join(projectRoot, "linked_3x4.png"), "junction");
    expect((await service.getProject({ id: created.id })).coverRevision).toBeNull();
    expect(await service.getProjectCover({ id: created.id })).toEqual({ found: false, mime: "", base64: "" });
  });
});
