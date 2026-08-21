import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Config } from "../src/config.ts";
import { MuziCreatorService } from "../src/muziService.ts";

const roots: string[] = [];

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
});
