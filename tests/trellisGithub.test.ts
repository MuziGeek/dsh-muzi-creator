import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.ts";
import { GithubApi, parseGithubRepository } from "../src/trellisGithubApi.ts";
import { githubProjectId } from "../src/trellisGithubReader.ts";
import { TrellisGithubService } from "../src/trellisGithubService.ts";
import { githubResultSchema } from "../src/trellisGithubSchemas.ts";
import { trellisProjectDetailSchema } from "../src/trellisSchemas.ts";

const selection = { owner: "sample", repo: "project", branch: "feature/progress" };
const id = githubProjectId(selection);
const sha = (value: string) => value.repeat(40);
const tree = (path: string, value: string, type = "tree", mode = type === "tree" ? "040000" : "100644") => ({ path, sha: sha(value), type, mode });
const blob = (value: unknown) => { const text = typeof value === "string" ? value : JSON.stringify(value); return { encoding: "base64", content: Buffer.from(text).toString("base64"), size: Buffer.byteLength(text) }; };

async function fixture(config: Partial<Config> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "trellis-github-"));
  const responses = new Map<string, unknown>([
    ["/repos/sample/project", { owner: { login: "sample" }, name: "project", default_branch: selection.branch, private: false }],
    ["/repos/sample/project/branches?per_page=100&page=1", [{ name: selection.branch }]],
    ["/repos/sample/project/commits/feature%2Fprogress", { sha: sha("a"), commit: { tree: { sha: sha("b") } } }],
    [`/repos/sample/project/git/trees/${sha("b")}`, { truncated: false, tree: [tree(".trellis", "c")] }],
    [`/repos/sample/project/git/trees/${sha("c")}`, { truncated: false, tree: [tree("tasks", "d")] }],
    [`/repos/sample/project/git/trees/${sha("d")}?recursive=1`, { truncated: false, tree: [tree("active/task.json", "e", "blob"), tree("archive/2026-09/done/task.json", "f", "blob"), tree("archive/2026-09/done/validation.md", "1", "blob")] }],
    [`/repos/sample/project/git/blobs/${sha("e")}`, blob({ id: "active", title: "Active task", status: "in_progress", current_phase: 2, children: ["done"] })],
    [`/repos/sample/project/git/blobs/${sha("f")}`, blob({ id: "done", title: "Done task", status: "completed", completedAt: "2026-09-08", parent: "active" })],
    [`/repos/sample/project/git/blobs/${sha("1")}`, blob("Verified task with recorded checks and a meaningful validation result.")],
  ]);
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const value = responses.get(url.pathname + url.search);
    if (url.hostname === "raw.githubusercontent.com") {
      const key = url.pathname.endsWith("active/task.json") ? "e" : url.pathname.endsWith("done/task.json") ? "f" : "1";
      const value = responses.get(`/repos/sample/project/git/blobs/${sha(key)}`) as { content: string };
      return new Response(Buffer.from(value.content, "base64"));
    }
    return value instanceof Response ? value : new Response(JSON.stringify(value ?? {}), { status: value === undefined ? 404 : 200 });
  });
  const credentials = { resolve: vi.fn(async (_ref: string): Promise<{ value: string } | undefined> => undefined), set: vi.fn(async () => {}), unset: vi.fn(async () => {}) };
  const service = new TrellisGithubService({ get: () => credentials }, dir, config as Config, fetcher);
  return { dir, responses, fetcher, service, credentials, signal: new AbortController().signal };
}
afterEach(() => { vi.useRealTimers(); });

describe("GitHub project connections", () => {
  it("accepts only exact GitHub repositories, including .git URLs", () => {
    expect(parseGithubRepository("https://github.com/sample/project.git")).toEqual({ owner: "sample", repo: "project" });
    for (const value of ["https://evil.test/a/b", "https://token@github.com/a/b", "https://github.com/a/b?token=x", "a/..", "a/b/tree/main", "file:///tmp/project", "a/b#x"]) {
      expect(() => parseGithubRepository(value)).toThrow();
    }
  });

  it("connects, restores and removes a commit-pinned project with the existing task model", async () => {
    const f = await fixture();
    const browse = await f.service.manage({ action: "browse", query: "https://github.com/sample/project" }, f.signal);
    expect(browse.repositories?.[0]?.defaultBranch).toBe(selection.branch);
    const branches = await f.service.manage({ action: "branches", repository: "sample/project" }, f.signal);
    expect(branches.branches).toEqual([selection.branch]);
    const connected = await f.service.manage({ action: "connect", repository: "sample/project", branch: selection.branch }, f.signal);
    expect(githubResultSchema.parse(connected).mode).toBe("github");
    const detail = await f.service.get(id, f.signal);
    expect(trellisProjectDetailSchema.parse(detail).project.counts).toMatchObject({ inProgress: 1, archived: 1, verifiedArchived: 1 });
    expect(detail.activeTasks[0]).toMatchObject({ currentPhase: 2, children: ["done"] });
    expect(detail.project.github).toMatchObject({ branch: selection.branch, sha: sha("a"), stale: false });
    expect(detail.project.rootPath).toBeNull();
    expect(f.fetcher.mock.calls.every(([, init]) => init?.redirect === "error")).toBe(true);
    expect(f.fetcher.mock.calls.every(([, init]) => !new Headers(init?.headers).has("Authorization"))).toBe(true);
    const stored = await readFile(join(f.dir, "trellis-github.json"), "utf8");
    expect(stored).not.toMatch(/token|validation|Active task/);
    const restarted = new TrellisGithubService({ get: () => undefined }, f.dir, {} as Config, f.fetcher);
    expect((await restarted.list(f.signal)).projects[0]?.projectId).toBe(id);
    await f.service.manage({ action: "remove", projectId: id }, f.signal);
    expect((await f.service.list(f.signal)).projects).toEqual([]);
    await expect(f.service.get(id, f.signal)).rejects.toThrow("已移除");
  });

  it("preserves the original commit and sync time after a failed refresh", async () => {
    const f = await fixture();
    await f.service.manage({ action: "connect", repository: "sample/project", branch: selection.branch }, f.signal);
    const before = await f.service.get(id, f.signal);
    f.responses.delete("/repos/sample/project/commits/feature%2Fprogress");
    const failed = await f.service.get(id, f.signal);
    expect(failed.project.github).toEqual({ ...before.project.github, stale: true });
    expect(failed.project.status).toBe("degraded");
    expect(failed.activeTasks).toEqual(before.activeTasks);
  });

  it("rejects missing Trellis, truncated trees and excessive task counts before saving", async () => {
    for (const failure of ["missing", "truncated", "limit"]) {
      const f = await fixture({ trellisMaxTasks: failure === "limit" ? 1 : 10 });
      if (failure === "missing") f.responses.set(`/repos/sample/project/git/trees/${sha("b")}`, { truncated: false, tree: [] });
      if (failure === "truncated") f.responses.set(`/repos/sample/project/git/trees/${sha("d")}?recursive=1`, { truncated: true, tree: [] });
      await expect(f.service.manage({ action: "connect", repository: "sample/project", branch: selection.branch }, f.signal)).rejects.toThrow();
      expect(await f.service.mode()).toBe("local");
    }
  });

  it("does not follow symlinks or execute repository scripts", async () => {
    const f = await fixture();
    f.responses.set(`/repos/sample/project/git/trees/${sha("d")}?recursive=1`, { truncated: false, tree: [tree("active/task.json", "e", "blob", "120000"), tree("active/run.py", "f", "blob")] });
    await f.service.manage({ action: "connect", repository: "sample/project", branch: selection.branch }, f.signal);
    expect((await f.service.get(id, f.signal)).project.counts?.invalid).toBe(1);
    expect(f.fetcher.mock.calls.some(([input]) => String(input).includes("/git/blobs/"))).toBe(false);
  });

  it("prepares authorization without exposing device secrets and honors polling intervals", async () => {
    const f = await fixture({ trellisGithubClientId: "Iv1.synthetic" });
    vi.useFakeTimers();
    f.responses.set("/login/device/code", { device_code: "private-device-code", user_code: "DEMO-CODE", expires_in: 900, interval: 5 });
    f.responses.set("/login/oauth/access_token", { error: "slow_down" });
    const begun = await f.service.manage({ action: "beginAuth" }, f.signal);
    expect(JSON.stringify(begun)).not.toContain("private-device-code");
    await f.service.manage({ action: "pollAuth" }, f.signal);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 5000);
    expect((await f.service.manage({ action: "pollAuth" }, f.signal)).pending?.interval).toBe(10);
    f.responses.set("/login/oauth/access_token", { access_token: "synthetic-secret" });
    vi.setSystemTime(Date.now() + 10000);
    const result = await f.service.manage({ action: "pollAuth" }, f.signal);
    expect(f.credentials.set).toHaveBeenCalledWith("MZ_TRELLIS_GITHUB_USER_TOKEN", "synthetic-secret");
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    await f.service.manage({ action: "disconnect" }, f.signal);
    expect(f.credentials.unset).toHaveBeenCalledWith("MZ_TRELLIS_GITHUB_USER_TOKEN");
  });


  it("keeps private reads on the authenticated API and never sends credentials to raw file hosts", async () => {
    const f = await fixture();
    f.credentials.resolve.mockResolvedValue({ value: "synthetic-private-token" });
    await f.service.manage({ action: "connect", repository: "sample/project", branch: selection.branch }, f.signal);
    expect(f.fetcher.mock.calls.every(([input]) => new URL(String(input)).hostname === "api.github.com")).toBe(true);
    expect(f.fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get("Authorization") === "Bearer synthetic-private-token")).toBe(true);
    expect(JSON.stringify(await f.service.list(f.signal))).not.toContain("synthetic-private-token");
  });

  it("stops a failed file refresh without replacing a successful snapshot with partial counts", async () => {
    const f = await fixture();
    await f.service.manage({ action: "connect", repository: "sample/project", branch: selection.branch }, f.signal);
    f.responses.set("/repos/sample/project/commits/feature%2Fprogress", { sha: sha("2"), commit: { tree: { sha: sha("b") } } });
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, init) => {
      if (String(input).startsWith("https://raw.githubusercontent.com")) return new Response("unavailable", { status: 503 });
      return original(input, init);
    });
    const detail = await f.service.get(id, f.signal);
    expect(detail.project.github).toMatchObject({ sha: sha("a"), stale: true });
    expect(detail.project.counts).toMatchObject({ inProgress: 1, archived: 1, invalid: 0 });
  });

  it("shows an unavailable auth entry without a registered GitHub App", async () => {
    const f = await fixture();
    expect((await f.service.manage({ action: "status" }, f.signal)).authAvailable).toBe(false);
    await expect(f.service.manage({ action: "beginAuth" }, f.signal)).rejects.toThrow("ClientId");
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it("fails loudly for corrupt persisted selections and bounded response bodies", async () => {
    const f = await fixture();
    await writeFile(join(f.dir, "trellis-github.json"), JSON.stringify({ version: 10, mode: "github", selections: [] }));
    await expect(f.service.mode()).rejects.toThrow("配置格式无效");
    const api = new GithubApi(1000, 10, async () => new Response('"a response larger than the configured limit"'));
    await expect(api.request("/user", undefined, f.signal)).rejects.toThrow("超过读取上限");
  });
});
