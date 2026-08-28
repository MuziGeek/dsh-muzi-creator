import { describe, expect, it } from "vitest";

import { dailyHotResultSchema, getDailyHotRequestSchema } from "../src/dailyHotSchemas.ts";
import { classifyDailyHot, createDailyHotLoader } from "../src/dailyHotService.ts";

function hotItem(options: {
  id: string;
  title: string;
  sourceCount?: number;
  story?: string;
}): Record<string, unknown> {
  return {
    id: options.id,
    title: options.title,
    source: { name: "测试来源" },
    sourceCount: options.sourceCount ?? 4,
    signalCount: 2,
    sourceNames: ["来源 A", "来源 B"],
    latestAt: "2026-08-02T01:00:00.000Z",
    links: {
      aihot: `https://aihot.virxact.com/items/${options.id}`,
      original: `https://example.com/${options.id}`,
      ...(options.story === undefined
        ? {}
        : { story: `https://aihot.virxact.com/story/${options.story}` }),
    },
  };
}

function selectedItem(id: string, title: string): Record<string, unknown> {
  return {
    id,
    title,
    summary: `${title}的摘要`,
    source: { name: "测试精选来源" },
    links: {
      aihot: `https://aihot.virxact.com/items/${id}`,
      original: `https://example.com/${id}`,
    },
    publishedAt: "2026-08-02T00:30:00.000Z",
    discoveredAt: "2026-08-02T00:40:00.000Z",
    category: "ai-products",
    score: 72,
    selected: true,
  };
}

function successfulResponse(pathname: string): unknown {
  if (pathname === "/api/v1/hot-topics") {
    return {
      schemaVersion: 1,
      count: 1,
      items: [hotItem({ id: "agent-hot", title: "Agent 工作流能力升级" })],
    };
  }
  if (pathname === "/api/v1/items") {
    return { schemaVersion: 1, items: [], page: { hasMore: false } };
  }
  if (pathname === "/api/v1/dailies/latest") {
    return {
      schemaVersion: 1,
      report: {
        date: "2026-08-02",
        generatedAt: "2026-08-02T00:00:00.000Z",
        links: { aihot: "https://aihot.virxact.com/daily/2026-08-02" },
        sections: [],
      },
    };
  }
  throw new Error(`unexpected path ${pathname}`);
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("AIHOT classification", () => {
  it("uses an explainable attention gate and removes story-level duplicates", () => {
    const tiers = classifyDailyHot({
      hotTopics: [
        {
          item: hotItem({ id: "agent-hot", title: "Agent 工具调用能力升级", story: "agent-story" }),
          story: {
            story: {
              publicId: "agent-story",
              title: "Agent 工具调用能力升级",
              status: "active",
              digest: "多家来源正在验证新的 Agent 工具调用能力。",
              firstReportAt: "2026-08-01T23:00:00.000Z",
              latestAt: "2026-08-02T01:00:00.000Z",
              reports: [{ id: "agent-report" }],
              links: { aihot: "https://aihot.virxact.com/story/agent-story" },
            },
          },
        },
        { item: hotItem({ id: "funding-hot", title: "某 AI 公司完成新一轮融资" }), story: null },
      ],
      selectedItems: [
        selectedItem("agent-report", "同一 Agent 事件的另一篇报道"),
        selectedItem("product-selected", "一款新产品上线"),
      ],
      dailyReport: {
        generatedAt: "2026-08-02T00:00:00.000Z",
        sections: [{
          label: "产品",
          items: [
            selectedItem("product-selected", "一款新产品上线"),
            selectedItem("daily-only", "日报中的普通动态"),
          ],
        }],
      },
    });

    expect(tiers.mustRead.map((item) => item.id)).toEqual(["agent-hot"]);
    expect(tiers.mustRead[0]?.attention.domains[0]?.id).toBe("agent-work");
    expect(tiers.mustRead[0]?.evidence.label).toBe("4 个独立信源");
    expect([...tiers.mustRead, ...tiers.browse, ...tiers.other]
      .some((item) => item.id === "agent-report")).toBe(false);
    expect(tiers.browse.some((item) => item.id === "funding-hot")).toBe(true);
    expect(tiers.browse.some((item) => item.id === "product-selected")).toBe(true);
    expect(tiers.other.map((item) => item.id)).toEqual(["daily-only"]);
  });

  it("keeps source order, applies 3/8/12 limits, and normalizes unsafe fields", () => {
    const hotTopics = Array.from({ length: 14 }, (_, index) => ({
      item: {
        ...hotItem({ id: `hot-${String(index)}`, title: `Agent 热点 ${String(index)}` }),
        ...(index === 0
          ? {
              sourceCount: -10,
              latestAt: "not-a-date",
              links: { original: "javascript:alert(1)" },
            }
          : {}),
      },
      story: null,
    }));
    const selectedItems = Array.from({ length: 14 }, (_, index) =>
      selectedItem(`selected-${String(index)}`, `精选 ${String(index)}`));
    const dailyItems = Array.from({ length: 20 }, (_, index) =>
      selectedItem(`daily-${String(index)}`, `日报 ${String(index)}`));
    const tiers = classifyDailyHot({
      hotTopics,
      selectedItems,
      dailyReport: { generatedAt: "2026-08-02T00:00:00.000Z", sections: [{ items: dailyItems }] },
    });

    expect(tiers.mustRead).toHaveLength(3);
    expect(tiers.browse).toHaveLength(8);
    expect(tiers.other).toHaveLength(12);
    expect(tiers.mustRead.map((item) => item.id)).toEqual(["hot-1", "hot-2", "hot-3"]);
    expect(tiers.browse[0]).toMatchObject({ id: "hot-0", latestAt: null, sourceCount: 0 });
    expect(tiers.browse[0]?.links.original).toBeNull();
  });
});

describe("AIHOT loader", () => {
  it("caches a successful read and exposes stale data after a failed refresh", async () => {
    let currentTime = Date.parse("2026-08-02T02:00:00.000Z");
    let fail = false;
    let calls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      calls += 1;
      if (fail) throw new Error("offline");
      return jsonResponse(successfulResponse(new URL(String(input)).pathname));
    };
    const loader = createDailyHotLoader({
      now: () => currentTime,
      cacheTtlMs: 1_000,
      requestTimeoutMs: 1_000,
      fetchImpl,
    });

    const first = await loader();
    const cached = await loader();
    expect(first.status).toBe("live");
    expect(cached.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBe(3);
    currentTime += 2_000;
    fail = true;
    const stale = await loader();
    expect(stale).toMatchObject({ status: "stale", fetchedAt: first.fetchedAt });
    expect(stale.error?.message).toContain("offline");
    expect(dailyHotResultSchema.parse(stale)).toEqual(stale);
  });

  it("bypasses a valid cache only for an explicit refresh", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      calls += 1;
      return jsonResponse(successfulResponse(new URL(String(input)).pathname));
    };
    const loader = createDailyHotLoader({ fetchImpl });
    await loader();
    await loader();
    expect(calls).toBe(3);
    await loader({ refresh: true });
    expect(calls).toBe(6);
  });

  it("keeps the aggregate live when one optional story request fails", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      calls += 1;
      const path = new URL(String(input)).pathname;
      if (path === "/api/v1/hot-topics") {
        return jsonResponse({
          items: [hotItem({ id: "agent-hot", title: "Agent 工作流", story: "agent-story" })],
        });
      }
      if (path === "/api/v1/stories/agent-story") return jsonResponse({ error: "unavailable" }, 503);
      return jsonResponse(successfulResponse(path));
    };
    const result = await createDailyHotLoader({ fetchImpl })();
    expect(result.status).toBe("live");
    expect(result.tiers.mustRead[0]).toMatchObject({ id: "agent-hot", summary: null });
    expect(calls).toBe(4);
  });

  it("reports rate limits without retrying and rejects unknown request fields", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return jsonResponse({ error: "rate limited" }, 429, { "Retry-After": "30" });
    };
    await expect(createDailyHotLoader({ fetchImpl })()).rejects.toMatchObject({
      code: "AI_HOT_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
    expect(calls).toBe(3);
    expect(getDailyHotRequestSchema.safeParse({ refresh: true, unexpected: true }).success).toBe(false);
  });

  it("distinguishes request timeouts from caller cancellation", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    });
    await expect(createDailyHotLoader({ fetchImpl, requestTimeoutMs: 10 })()).rejects.toMatchObject({
      code: "AI_HOT_TIMEOUT",
    });

    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    controller.abort(reason);
    await expect(createDailyHotLoader({ fetchImpl })({}, controller.signal)).rejects.toBe(reason);
  });
});
