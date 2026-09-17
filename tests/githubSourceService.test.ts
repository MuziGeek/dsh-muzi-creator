import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

import type { Config } from "../src/config.ts";
import { GithubSourceService } from "../src/githubSourceService.ts";

const COMMIT_SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);

function config(dataDir: string, overrides: Partial<Config> = {}): Config {
  return {
    libraryRoot: join(dataDir, "library"),
    creatorRoot: join(dataDir, "creator"),
    atlasRoot: join(dataDir, "atlas"),
    dataDir,
    subtitleSkillDir: "",
    coverSkillDir: "",
    previewMaxBytes: 262144,
    searchResultLimit: 30,
    graphNodeLimit: 500,
    graphEdgeLimit: 5000,
    enabledDocuments: ["mother"],
    enabledPublishTargets: ["blog"],
    externalActionsEnabled: false,
    trellisGithubClientId: "",
    trellisGithubMaxRepositories: 20,
    trellisGithubMaxResponseBytes: 1024 * 1024,
    trellisGithubSyncTimeoutMs: 30_000,
    trellisGithubConcurrency: 2,
    trellisCommandTimeoutMs: 30_000,
    ...overrides,
  } as Config;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function treeFor(files: Array<{ path: string; sha: string; mode?: string; type?: string }>) {
  return {
    truncated: false,
    tree: files.map((file) => ({ path: file.path, sha: file.sha, mode: file.mode ?? "100644", type: file.type ?? "blob" })),
  };
}

function makeFetcher(files: Record<string, Uint8Array | string>, options: { private?: boolean; tree?: ReturnType<typeof treeFor> } = {}) {
  const requests: string[] = [];
  let failed = false;
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    requests.push(`${url} ${new Headers(init?.headers).get("authorization") ?? ""}`);
    if (failed) throw new TypeError("network down");
    if (url.endsWith(`/commits/main`)) return json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    if (url.includes(`/git/trees/${TREE_SHA}?recursive=1`)) {
      return json(options.tree ?? treeFor(Object.keys(files).map((path, index) => ({ path, sha: `${String(index + 1).repeat(40).slice(0, 40)}` }))));
    }
    if (url.includes("/git/blobs/")) {
      const blobSha = url.split("/git/blobs/")[1];
      const blobIndex = Object.keys(files).findIndex((_, index) => `${String(index + 1).repeat(40).slice(0, 40)}` === blobSha);
      const path = Object.keys(files)[blobIndex];
      if (path === undefined) return json({}, 404);
      const content = files[path];
      if (content === undefined) return json({}, 404);
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
      return json({ encoding: "base64", content: Buffer.from(bytes).toString("base64"), size: bytes.byteLength });
    }
    if (url.includes("/branches?")) return json([{ name: "main" }]);
    if (url.includes("/repos/owner/repo") && !url.includes("/git/")) return json({ name: "repo", owner: { login: "owner" }, default_branch: "main", private: options.private ?? false });
    if (url.startsWith("https://raw.githubusercontent.com/owner/repo/")) {
      const path = decodeURIComponent(url.slice(`https://raw.githubusercontent.com/owner/repo/${COMMIT_SHA}/`.length));
      const content = files[path];
      if (content === undefined) return json({}, 404);
      return new Response(typeof content === "string" ? content : Buffer.from(content) as unknown as BodyInit);
    }
    if (url.includes("/users/owner/repos?")) return json([{ name: "repo", owner: { login: "owner" }, default_branch: "main", private: options.private ?? false }]);
    return json({}, 404);
  });
  return { fetcher, requests, fail: () => { failed = true; } };
}

function context(token: string | undefined = undefined) {
  let current = token;
  return {
    get: (name: string) => name === "credentials"
      ? {
        resolve: async () => current === undefined ? undefined : { value: current },
        set: async (_ref: string, value: string) => { current = value; },
        unset: async () => { current = undefined; },
      }
      : undefined,
  };
}

describe("GithubSourceService", () => {
  it("lists public repositories when given a GitHub profile URL", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "mz-github-source-browse-"));
    try {
      const fixture = makeFetcher({});
      const service = new GithubSourceService(context(), dataDir, config(dataDir), fixture.fetcher);
      const result = await service.manage({ target: "creator", action: "browse", query: "https://github.com/owner" }, new AbortController().signal);
      expect(result.repositories?.map((item) => item.fullName)).toEqual(["owner/repo"]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("connects a public repository and materializes a commit-pinned source", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "mz-github-source-"));
    try {
      const files = { "10-active/project.yml": "schema: muzi.creator/2\n" };
      const fixture = makeFetcher(files);
      const service = new GithubSourceService(context(), dataDir, config(dataDir, { githubSourceMaxFiles: 5 }), fixture.fetcher);

      const result = await service.manage({ target: "creator", action: "connect", repository: "https://github.com/owner/repo.git", branch: "main" }, new AbortController().signal);
      expect(result.mode).toBe("github");
      expect(result.selection).toEqual({ owner: "owner", repo: "repo", branch: "main" });
      expect(result.snapshot?.sha).toBe(COMMIT_SHA);
      expect(result.snapshot?.fileCount).toBe(1);

      const root = await service.root("creator");
      expect(root).toBeTypeOf("string");
      await access(join(root!, "10-active", "project.yml"));
      await access(join(root!, "90-archive"));
      const persisted = await readFile(join(dataDir, "github-sources.json"), "utf8");
      expect(persisted).toContain("owner");
      expect(persisted).not.toContain("project.yml");
      expect(persisted).not.toContain("Bearer");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("uses the authenticated blob API for private repositories", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "mz-github-source-private-"));
    try {
      const fixture = makeFetcher({ "wiki/topics/one.md": "# One\n" }, { private: true });
      const service = new GithubSourceService(context("secret-token"), dataDir, config(dataDir), fixture.fetcher);
      await service.manage({ target: "knowledge", action: "connect", repository: "owner/repo", branch: "main" }, new AbortController().signal);
      expect(fixture.requests.some((request) => request.includes("raw.githubusercontent.com"))).toBe(false);
      expect(fixture.requests.some((request) => request.includes("Bearer secret-token"))).toBe(true);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("keeps the last materialized snapshot when a refresh fails", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "mz-github-source-stale-"));
    try {
      const fixture = makeFetcher({ "wiki/topics/one.md": "# One\n" });
      const service = new GithubSourceService(context(), dataDir, config(dataDir), fixture.fetcher);
      const connected = await service.manage({ target: "knowledge", action: "connect", repository: "owner/repo", branch: "main" }, new AbortController().signal);
      fixture.fail();
      const refreshed = await service.manage({ target: "knowledge", action: "refresh" }, new AbortController().signal);
      expect(refreshed.snapshot?.sha).toBe(connected.snapshot?.sha);
      expect(refreshed.snapshot?.stale).toBe(true);
      expect(await service.root("knowledge")).toBeTruthy();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("rejects symlinks and oversized files before exposing a source", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "mz-github-source-limits-"));
    try {
      const symlinkFixture = makeFetcher({ "link": "target" }, { tree: treeFor([{ path: "link", sha: "c".repeat(40), mode: "120000" }]) });
      const symlinkService = new GithubSourceService(context(), dataDir, config(dataDir), symlinkFixture.fetcher);
      await expect(symlinkService.manage({ target: "creator", action: "connect", repository: "owner/repo", branch: "main" }, new AbortController().signal)).rejects.toThrow("符号链接");

      const largeFixture = makeFetcher({ "large.bin": new Uint8Array(20) });
      const largeService = new GithubSourceService(context(), dataDir, config(dataDir, { githubSourceMaxFileBytes: 8 }), largeFixture.fetcher);
      await expect(largeService.manage({ target: "creator", action: "connect", repository: "owner/repo", branch: "main" }, new AbortController().signal)).rejects.toThrow("单文件");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
