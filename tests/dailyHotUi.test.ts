import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import type { DailyHotItem, DailyHotResult } from "../src/dailyHotTypes.ts";
import {
  dailyHotItems,
  dailyHotItemTimestamp,
  dailyHotPrimaryLink,
  dailyHotSummaryParagraphs,
  formatDailyHotCompactTime,
  formatDailyHotFullTime,
  previewDailyHotSources,
} from "../src/client/dailyHotUiModel.ts";
import {
  getSelectedDailyHotItem,
  selectDailyHotItem,
  subscribeDailyHotSelection,
} from "../src/client/dailyHotSelection.ts";
import { en, zh } from "../src/client/locales.ts";

function item(id: string, overrides: Partial<DailyHotItem> = {}): DailyHotItem {
  return {
    id: id as DailyHotItem["id"],
    kind: "selected",
    title: `Hotspot ${id}`,
    summary: "Summary",
    latest: null,
    source: { name: "Source" },
    sourceNames: [],
    sourceCount: 1,
    signalCount: 0,
    latestAt: "2026-08-02T01:00:00.000Z",
    publishedAt: "2026-08-02T00:00:00.000Z",
    discoveredAt: "2026-08-02T00:30:00.000Z",
    category: "ai-products",
    categoryLabel: "产品",
    score: 70,
    links: {
      aihot: `https://aihot.virxact.com/items/${id}`,
      original: `https://example.com/${id}`,
      story: null,
    },
    reportIds: [],
    storyStatus: null,
    attention: { domains: [], reason: "Worth browsing" },
    evidence: { level: "original-linked", label: "可回查原文" },
    ...overrides,
  };
}

function result(): DailyHotResult {
  return {
    schemaVersion: 1,
    status: "live",
    fetchedAt: "2026-08-02T02:00:00.000Z",
    expiresAt: "2026-08-02T02:15:00.000Z",
    source: { name: "AI HOT", url: "https://aihot.virxact.com/agent", attributionRequired: false },
    policy: { question: "Question", mustReadLimit: 3, rules: [], source: "built-in" },
    daily: {
      date: "2026-08-02",
      generatedAt: "2026-08-02T00:00:00.000Z",
      itemCount: 3,
      sectionCount: 1,
      links: { aihot: "https://aihot.virxact.com/daily/2026-08-02" },
    },
    counts: { upstreamHot: 1, upstreamSelected24h: 1, mustRead: 1, browse: 1, other: 1 },
    tiers: { mustRead: [item("must")], browse: [item("browse")], other: [item("other")] },
  };
}

afterEach(() => { selectDailyHotItem(null); });

describe("Daily Hot client model", () => {
  it("keeps tier order and chooses evidence links and timestamps deterministically", () => {
    const data = result();
    expect(dailyHotItems(data).map((entry) => entry.id)).toEqual(["must", "browse", "other"]);
    const story = item("story", {
      latestAt: null,
      links: {
        aihot: "https://aihot.virxact.com/items/story",
        original: null,
        story: "https://aihot.virxact.com/story/story",
      },
    });
    expect(dailyHotItemTimestamp(story)).toBe(story.discoveredAt);
    expect(dailyHotPrimaryLink(story)).toBe(story.links.story);
    expect(formatDailyHotCompactTime(null)).toBe("—");
    expect(formatDailyHotFullTime("invalid")).toBe("—");
  });

  it("preserves summary text while grouping only natural long-text boundaries", () => {
    expect(dailyHotSummaryParagraphs("第一段。\r\n\r\n第二段。 ")).toEqual(["第一段。", "第二段。"]);

    const sentences = [
      `第一句${"甲".repeat(88)}。`,
      `第二句${"乙".repeat(88)}。`,
      `第三句${"丙".repeat(88)}。`,
    ];
    const summary = sentences.join(" ");
    const paragraphs = dailyHotSummaryParagraphs(summary);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.every((paragraph) => paragraph.length <= 220)).toBe(true);
    expect(paragraphs.join(" ")).toBe(summary);

    const withoutNaturalBoundary = "连续内容".repeat(70);
    expect(dailyHotSummaryParagraphs(withoutNaturalBoundary)).toEqual([withoutNaturalBoundary]);
  });

  it("previews six source names without changing their order", () => {
    const cases = [0, 6, 7, 14];
    for (const count of cases) {
      const sources = Array.from({ length: count }, (_, index) => `Source ${String(index + 1)}`);
      const collapsed = previewDailyHotSources(sources, false);
      const expanded = previewDailyHotSources(sources, true);
      expect(collapsed.items).toEqual(sources.slice(0, 6));
      expect(collapsed.remaining).toBe(Math.max(0, count - 6));
      expect(expanded.items).toEqual(sources);
      expect(expanded.remaining).toBe(Math.max(0, count - 6));
    }
  });

  it("keeps selection in memory and emits only real object changes", () => {
    const selected = item("selected");
    let notifications = 0;
    const stop = subscribeDailyHotSelection(() => { notifications += 1; });
    selectDailyHotItem(selected);
    selectDailyHotItem(selected);
    expect(getSelectedDailyHotItem()).toBe(selected);
    expect(notifications).toBe(1);
    selectDailyHotItem({ ...selected, title: "Updated" });
    expect(notifications).toBe(2);
    selectDailyHotItem(null);
    expect(notifications).toBe(3);
    stop();
  });

  it("keeps Chinese and English locale keys paired", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    expect(zh["tab.hot"]).toBe("热点");
    expect(en["tab.hot"]).toBe("Hot");
    expect(zh["hot.sources.showMore"]).toBe("查看其余");
    expect(en["hot.sources.hide"]).toBe("Show fewer sources");
  });
});

describe("Daily Hot UI contract", () => {
  it("places Hot second and wires accessible list and disclosure behavior", async () => {
    const [sidebar, panel] = await Promise.all([
      readFile(new URL("../src/client/sidebar/OilSidebarRoot.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/client/sidebar/DailyHotPanel.tsx", import.meta.url), "utf8"),
    ]);
    const sessions = sidebar.indexOf('data-sidebar-tab="sessions"');
    const hot = sidebar.indexOf('data-sidebar-tab="hot"');
    const content = sidebar.indexOf('data-sidebar-tab="content"');
    const knowledge = sidebar.indexOf('data-sidebar-tab="knowledge"');
    const projects = sidebar.indexOf('data-sidebar-tab="projects"');
    expect(sessions).toBeLessThan(hot);
    expect(hot).toBeLessThan(content);
    expect(content).toBeLessThan(knowledge);
    expect(knowledge).toBeLessThan(projects);
    expect(sidebar).toContain("IconLightOutline16");
    expect(sidebar).toContain('if (tab !== "hot") selectDailyHotItem(null)');
    expect(panel).toContain("aria-busy={loading || refreshing}");
    expect(panel).toContain("aria-expanded={otherExpanded}");
    expect(panel).toContain("aria-controls={otherId}");
    expect(panel).toContain("aria-pressed={selected}");
    expect(panel).toContain('target="_blank" rel="noreferrer"');
  });

  it("reuses the shared inspector geometry and safe external links", async () => {
    const [inspector, css, client] = await Promise.all([
      readFile(new URL("../src/client/DailyHotInspector.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/client/DailyHotInspector.css", import.meta.url), "utf8"),
      readFile(new URL("../src/client/index.tsx", import.meta.url), "utf8"),
    ]);
    expect(inspector).toContain("resolveInspectorLayout");
    expect(inspector).toContain("applyConversationInset");
    expect(inspector).toContain("setInspectorWidth");
    expect(inspector).toContain('role="separator"');
    expect(inspector).toContain("data-layout={layout.mode}");
    expect(inspector).toContain('className="dailyHotDetailLayout"');
    expect(inspector).toContain('className="dailyHotEvidenceRail"');
    expect(inspector).toContain('className="dailyHotLatest"');
    expect(inspector).toContain("dailyHotSummaryParagraphs");
    expect(inspector).toContain("previewDailyHotSources");
    expect(inspector).toContain("aria-expanded={sourcesExpanded}");
    expect(inspector).toContain("aria-controls={sourceListId}");
    expect(inspector).toContain("scrollRef.current?.scrollTo({ top: 0 })");
    expect(inspector.match(/target="_blank" rel="noreferrer"/g)).toHaveLength(2);
    expect(css).toContain("@media (min-width: 1080px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 288px");
    expect(css).toContain("@media (max-width: 880px)");
    expect(css).toContain("width: 100% !important");
    expect(css).toContain("overflow: auto");
    expect(client).toContain('occupant: "content" | "hot" | "project" | null');
    expect(client).toContain("subscribeDailyHotSelection(sync)");
    expect(client).toContain('id: "muzi-daily-hot-inspector"');
  });
});
