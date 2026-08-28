import { appendFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  CreatorMetricLatest,
  CreatorMetricSnapshot,
  MuziVideoPlatform,
} from "./muziTypes.ts";

export interface MetricPost {
  title: string;
  remoteId?: string;
  url?: string;
  views?: number;
  likes?: number;
  comments?: number;
}

export type MetricMatch =
  | { status: "MATCHED"; post: MetricPost; by: "remoteId" | "url" | "title" }
  | { status: "AMBIGUOUS"; candidates: MetricPost[]; by: "remoteId" | "url" | "title" }
  | { status: "NOT_FOUND" };

export function creatorMetricsPath(dataDir: string): string {
  return join(dataDir, "creator-metrics.jsonl");
}

export function normalizeMetricTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function canonicalPublishUrl(value?: string | null): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const identityKeys = ["id", "objectId", "object_id", "note_id", "aweme_id", "bvid"];
    const identity = identityKeys.flatMap((key) => {
      const item = url.searchParams.get(key);
      return item === null || item === "" ? [] : [[key, item] as const];
    }).sort(([left], [right]) => left.localeCompare(right));
    const query = identity.length === 0
      ? ""
      : `?${identity.map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`).join("&")}`;
    return `${url.protocol.toLocaleLowerCase()}//${url.hostname.toLocaleLowerCase()}${url.port ? `:${url.port}` : ""}${path}${query}`;
  } catch {
    return null;
  }
}

function uniqueMatch(candidates: MetricPost[], by: "remoteId" | "url" | "title"): MetricMatch | null {
  if (candidates.length === 1) return { status: "MATCHED", post: candidates[0]!, by };
  if (candidates.length > 1) return { status: "AMBIGUOUS", candidates, by };
  return null;
}

export function matchMetricPost(
  known: { remoteId?: string | null; url?: string | null; title: string },
  posts: readonly MetricPost[],
): MetricMatch {
  if (known.remoteId !== undefined && known.remoteId !== null && known.remoteId !== "") {
    const match = uniqueMatch(posts.filter((post) => post.remoteId === known.remoteId), "remoteId");
    if (match !== null) return match;
  }
  const knownUrl = canonicalPublishUrl(known.url);
  if (knownUrl !== null) {
    const match = uniqueMatch(posts.filter((post) => canonicalPublishUrl(post.url) === knownUrl), "url");
    if (match !== null) return match;
  }
  const title = normalizeMetricTitle(known.title);
  if (title !== "") {
    const match = uniqueMatch(posts.filter((post) => normalizeMetricTitle(post.title) === title), "title");
    if (match !== null) return match;
  }
  return { status: "NOT_FOUND" };
}

function metric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

export function metricSnapshot(
  mcId: string,
  platform: MuziVideoPlatform,
  post: MetricPost,
  observedAt = new Date().toISOString(),
): CreatorMetricSnapshot {
  return {
    schema: "muzi.creator.metrics/1",
    mcId,
    platform,
    remoteId: post.remoteId?.trim() || null,
    observedAt,
    views: metric(post.views),
    likes: metric(post.likes),
    comments: metric(post.comments),
    collectorVersion: "1",
  };
}

function isSnapshot(value: unknown): value is CreatorMetricSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Partial<CreatorMetricSnapshot>;
  return row.schema === "muzi.creator.metrics/1"
    && typeof row.mcId === "string"
    && ["bilibili", "douyin", "wechat", "xiaohongshu"].includes(String(row.platform))
    && typeof row.observedAt === "string";
}

export async function readMetricSnapshots(dataDir: string): Promise<CreatorMetricSnapshot[]> {
  const text = await readFile(creatorMetricsPath(dataDir), "utf8").catch(() => "");
  return text.split(/\r?\n/).flatMap((line): CreatorMetricSnapshot[] => {
    if (line.trim() === "") return [];
    try {
      const value: unknown = JSON.parse(line);
      return isSnapshot(value) ? [value] : [];
    } catch {
      return [];
    }
  });
}

function delta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

export function latestMetricRows(snapshots: readonly CreatorMetricSnapshot[], mcId: string): Partial<Record<MuziVideoPlatform, CreatorMetricLatest>> {
  const byPlatform = new Map<MuziVideoPlatform, CreatorMetricSnapshot[]>();
  for (const snapshot of snapshots) {
    if (snapshot.mcId !== mcId) continue;
    const rows = byPlatform.get(snapshot.platform) ?? [];
    rows.push(snapshot);
    byPlatform.set(snapshot.platform, rows);
  }
  const result: Partial<Record<MuziVideoPlatform, CreatorMetricLatest>> = {};
  for (const [platform, rows] of byPlatform) {
    rows.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
    const current = rows.at(-1)!;
    const previous = rows.at(-2);
    result[platform] = {
      ...current,
      delta: {
        views: delta(current.views, previous?.views ?? null),
        likes: delta(current.likes, previous?.likes ?? null),
        comments: delta(current.comments, previous?.comments ?? null),
      },
    };
  }
  return result;
}

async function acquireFileLock(lockPath: string): Promise<() => Promise<void>> {
  await mkdir(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await mkdir(lockPath);
      return () => rm(lockPath, { recursive: true, force: true });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      const info = await stat(lockPath).catch(() => undefined);
      if (info !== undefined && Date.now() - info.mtimeMs > 60_000) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("creator metrics store is busy");
}

export async function appendMetricSnapshots(dataDir: string, snapshots: readonly CreatorMetricSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  const path = creatorMetricsPath(dataDir);
  const release = await acquireFileLock(`${path}.lock`);
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, snapshots.map((snapshot) => JSON.stringify(snapshot)).join("\n") + "\n", "utf8");
  } finally {
    await release();
  }
}
