/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DailyHotItem, DailyHotResult, DailyHotTiers } from "../src/dailyHotTypes.ts";
import { HotOverview } from "../src/client/workbench/WorkbenchOverviews.tsx";

function item(id: string): DailyHotItem {
  return {
    id: id as DailyHotItem["id"], kind: "selected", title: `演示热点 ${id}`,
    summary: `演示摘要 ${id}`, latest: null, source: { name: "演示来源" },
    sourceNames: [], sourceCount: 1, signalCount: 0,
    latestAt: null, publishedAt: null, discoveredAt: null,
    category: null, categoryLabel: null, score: null,
    links: { aihot: null, original: null, story: null }, reportIds: [], storyStatus: null,
    attention: { domains: [], reason: "演示关注原因" },
    evidence: { level: "summary-only", label: "仅有摘要" },
  };
}

function result(tiers: DailyHotTiers): DailyHotResult {
  return {
    schemaVersion: 1, status: "live",
    fetchedAt: "2026-09-09T00:00:00.000Z", expiresAt: "2026-09-09T00:15:00.000Z",
    source: { name: "AI HOT", url: "https://example.com", attributionRequired: false },
    policy: { question: "演示", mustReadLimit: 3, rules: [], source: "demo" },
    daily: { date: null, generatedAt: null, itemCount: 0, sectionCount: 0, links: { aihot: "https://example.com" } },
    counts: { upstreamHot: 30, upstreamSelected24h: 50, mustRead: tiers.mustRead.length, browse: tiers.browse.length, other: tiers.other.length },
    tiers,
  };
}

afterEach(cleanup);

describe("HotOverview", () => {
  it("shows every returned item in tier order and opens items beyond the fourth", async () => {
    const tiers = {
      mustRead: Array.from({ length: 3 }, (_, index) => item(`must-${index}`)),
      browse: Array.from({ length: 8 }, (_, index) => item(`browse-${index}`)),
      other: Array.from({ length: 12 }, (_, index) => item(`other-${index}`)),
    };
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<HotOverview result={result(tiers)} onSelect={onSelect} />);

    expect(screen.getAllByRole("button")).toHaveLength(23);
    expect(screen.getByText("全部热点").parentElement?.textContent).toBe("全部热点23");
    for (const [name, items] of [["今日必看", tiers.mustRead], ["值得浏览", tiers.browse], ["其余动态", tiers.other]] as const) {
      const region = screen.getByRole("region", { name: `${name}${items.length} 条` });
      expect(within(region).getAllByRole("button").map((card) => card.querySelector("strong")?.textContent))
        .toEqual(items.map((entry) => entry.title));
    }
    await user.click(screen.getByRole("button", { name: /演示热点 browse-7/ }));
    expect(onSelect).toHaveBeenLastCalledWith(tiers.browse[7]);
    screen.getByRole("button", { name: /演示热点 other-11/ }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith(tiers.other[11]);
  });

  it("keeps other-only results readable instead of showing an empty state", () => {
    render(<HotOverview result={result({ mustRead: [], browse: [], other: [item("other")] })} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /演示热点 other/ })).toBeTruthy();
    expect(screen.queryByText("暂无可读热点")).toBeNull();
    expect(screen.queryByRole("heading", { name: /今日必看/ })).toBeNull();
  });

  it("shows an empty state only when all tiers are empty", () => {
    render(<HotOverview result={result({ mustRead: [], browse: [], other: [] })} onSelect={vi.fn()} />);
    expect(screen.getByText("暂无可读热点")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("全部热点").parentElement?.textContent).toBe("全部热点0");
  });
});
