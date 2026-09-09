import { z } from "zod";
import { githubSelectionSchema, type GithubRepository } from "./trellisGithubSchemas.ts";

/** Only github.com repository URLs and owner/repository identifiers are accepted. */
export function parseGithubRepository(input: string): { owner: string; repo: string } {
  let value = input.trim();
  if (value.startsWith("https://")) {
    const url = new URL(value);
    if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash) {
      throw new Error("请输入 github.com 仓库链接，不要包含凭据、查询参数或片段");
    }
    value = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  }
  const parts = value.replace(/\.git$/, "").split("/");
  if (parts.length !== 2) throw new Error("请输入 https://github.com/用户名/仓库名");
  const parsed = githubSelectionSchema.safeParse({ owner: parts[0], repo: parts[1], branch: "HEAD" });
  if (!parsed.success) throw new Error("GitHub 用户名或仓库名无效");
  return { owner: parsed.data.owner, repo: parsed.data.repo };
}

export const githubRepoResponse = z.object({
  name: z.string(), owner: z.object({ login: z.string() }), default_branch: z.string(), private: z.boolean(),
});

/** Construct links from validated identifiers, never from API-provided URLs. */
export function repositoryOf(raw: z.infer<typeof githubRepoResponse>): GithubRepository {
  const repo = parseGithubRepository(`${raw.owner.login}/${raw.name}`);
  const fullName = `${repo.owner}/${repo.repo}`;
  return { fullName, url: `https://github.com/${fullName}`, defaultBranch: raw.default_branch, private: raw.private };
}

/** A network or HTTP failure invalidates the whole refresh rather than individual task data. */
export class GithubRequestError extends Error {}

/** Fixed-origin, bounded JSON transport. Redirects and provider error bodies never reach the client. */
export class GithubApi {
  constructor(private readonly timeoutMs: number, private readonly maxBytes: number, private readonly fetcher: typeof fetch = fetch) {}

  async request(path: string, token: string | undefined, signal: AbortSignal): Promise<unknown> {
    return this.json(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }, signal);
  }

  async oauth(endpoint: "device/code" | "oauth/access_token", fields: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    return this.json(`https://github.com/login/${endpoint}`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    }, signal);
  }

  /** Public files use a commit-pinned raw URL without authorization headers. */
  async publicFile(path: string, signal: AbortSignal): Promise<string> {
    return this.text(`https://raw.githubusercontent.com${path}`, {}, signal);
  }

  private async json(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    const text = await this.text(url, init, signal);
    try { return JSON.parse(text) as unknown; }
    catch { throw new Error("GitHub 返回的 JSON 无效"); }
  }

  private async text(url: string, init: RequestInit, signal: AbortSignal): Promise<string> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    let response: Response;
    try { response = await this.fetcher(url, { ...init, redirect: "error", signal: bounded }); }
    catch { throw new GithubRequestError(signal.aborted ? "GitHub 读取已取消" : "无法连接 GitHub，请检查网络后重试"); }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) throw new GithubRequestError("GitHub 授权已失效，请重新绑定");
      if (response.status === 403 || response.status === 429) throw new GithubRequestError("GitHub 权限不足或请求受限，请检查仓库授权，稍后重试");
      if (response.status === 404) throw new GithubRequestError("GitHub 仓库、分支或目录不存在，或当前账号无权读取");
      throw new GithubRequestError(`GitHub 返回 ${String(response.status)}，请稍后重试`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new GithubRequestError("GitHub 返回空响应");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > this.maxBytes) throw new GithubRequestError("GitHub 响应超过读取上限");
        chunks.push(chunk.value);
      }
    } catch (error) {
      if (error instanceof GithubRequestError) throw error;
      throw new GithubRequestError(bounded.aborted ? "GitHub 读取已超时或取消，请重试" : "GitHub 响应中断，请重试");
    } finally {
      try { await reader.cancel(); } catch { /* An errored response stream is already closed. */ }
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
  }
}
