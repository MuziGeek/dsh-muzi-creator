import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendMetricSnapshots,
  canonicalPublishUrl,
  latestMetricRows,
  matchMetricPost,
  metricSnapshot,
  readMetricSnapshots,
} from "../src/muziMetrics.ts";

describe("Muzi creator metrics", () => {
  it("matches remote id, then canonical URL, then one exact title", () => {
    const posts = [
      { remoteId: "1", url: "https://example.com/video/1?track=x", title: "同名", views: 1 },
      { remoteId: "2", url: "https://example.com/video/2", title: "另一个", views: 2 },
    ];
    expect(matchMetricPost({ remoteId: "2", url: "https://example.com/video/1", title: "同名" }, posts)).toMatchObject({ status: "MATCHED", by: "remoteId", post: { remoteId: "2" } });
    expect(matchMetricPost({ remoteId: "missing", url: "https://example.com/video/1#top", title: "同名" }, posts)).toMatchObject({ status: "MATCHED", by: "url", post: { remoteId: "1" } });
    expect(matchMetricPost({ title: "另 一个" }, posts)).toMatchObject({ status: "MATCHED", by: "title", post: { remoteId: "2" } });
    expect(canonicalPublishUrl("https://EXAMPLE.com/video/1/?track=x#top")).toBe("https://example.com/video/1");
    expect(canonicalPublishUrl("https://example.com/share?track=x&objectId=42")).toBe("https://example.com/share?objectId=42");
  });

  it("does not bind a duplicated exact title", () => {
    const match = matchMetricPost({ title: "同名" }, [
      { remoteId: "1", title: "同名" },
      { remoteId: "2", title: "同 名" },
    ]);
    expect(match.status).toBe("AMBIGUOUS");
  });

  it("stores missing metrics as null and preserves append-only history with deltas", async () => {
    const root = await mkdtemp(join(tmpdir(), "muzi-metrics-"));
    const first = metricSnapshot("mc_0123456789abcdef01234567", "douyin", { remoteId: "42", title: "A", views: 10 }, "2026-08-28T01:00:00.000Z");
    const second = metricSnapshot("mc_0123456789abcdef01234567", "douyin", { remoteId: "42", title: "A", views: 15, likes: 3 }, "2026-08-28T02:00:00.000Z");
    await appendMetricSnapshots(root, [first]);
    await appendMetricSnapshots(root, [second]);
    const rows = await readMetricSnapshots(root);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ views: 10, likes: null, comments: null });
    expect(latestMetricRows(rows, first.mcId).douyin).toMatchObject({
      views: 15,
      likes: 3,
      comments: null,
      delta: { views: 5, likes: null, comments: null },
    });
    expect((await readFile(join(root, "creator-metrics.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
    await rm(root, { recursive: true, force: true });
  });
});
