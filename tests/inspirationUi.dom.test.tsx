/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  InspirationDetail,
  InspirationItem,
  InspirationOverview,
  InspirationRun,
} from "../src/inspirationTypes.ts";
import type { InspirationViewFace } from "../src/client/face.ts";
import {
  InspirationSidebarPanel,
  InspirationWorkbench,
} from "../src/client/inspiration/index.ts";
import {
  getInspirationSelection,
  setInspirationSelection,
} from "../src/client/inspirationSelection.ts";
import { ReadonlyResource } from "../src/client/workbench/WorkbenchData.ts";
import { inspirationEn } from "../src/client/inspiration/copy.ts";

const SPEC = {
  topic: "AI 写作工作流",
  objective: "",
  questions: [],
  mode: "topic",
  sourceLanguage: "zh-en",
  preferredDomains: [],
  excludedDomains: [],
  depth: "standard",
} as const;
const ITEM = {
  id: "inspiration-1",
  revision: 1,
  archived: false,
  sessionId: "session-1",
  latestRunId: "run-1",
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T01:00:00.000Z",
  spec: SPEC,
} as unknown as InspirationItem;
const RUN = {
  id: "run-1",
  revision: 1,
  ownerKind: "item",
  ownerId: ITEM.id,
  trigger: "manual",
  status: "ready",
  spec: SPEC,
  timeWindow: {
    startAt: "2026-09-02T16:00:00.000Z",
    endAt: "2026-09-03T16:00:00.000Z",
  },
  scheduledFor: null,
  queuedAt: "2026-09-03T00:00:00.000Z",
  startedAt: "2026-09-03T00:01:00.000Z",
  finishedAt: "2026-09-03T00:02:00.000Z",
  sessionId: "session-1",
  reportPath: "report.md",
  reportSha256: "a".repeat(64),
  unread: true,
  error: null,
} as unknown as InspirationRun;
const OVERVIEW = {
  schemaVersion: 1,
  revision: 1,
  generatedAt: "2026-09-03T00:00:00.000Z",
  items: [ITEM],
  tasks: [],
  recentRuns: [RUN],
  counts: { needsAttention: 0, running: 0, queued: 0, unread: 1 },
} satisfies InspirationOverview;
const DETAIL = {
  schemaVersion: 1,
  owner: ITEM,
  run: RUN,
  reportIntegrity: "ok",
  previousRuns: [],
  report: {
    schemaVersion: 1,
    runId: RUN.id,
    generatedAt: "2026-09-03T00:02:00.000Z",
    status: "ready",
    partialReason: null,
    summary: "研究摘要",
    findings: [
      { text: "有来源的发现", sourceIds: ["source-1"], evidence: "supported" },
    ],
    disagreements: [
      { text: "存在分歧", sourceIds: ["source-1"], evidence: "contested" },
    ],
    angles: ["内容角度"],
    nextSteps: [],
    sources: [
      {
        id: "source-1",
        title: "原始来源",
        url: "https://example.com/source",
        domain: "example.com",
        publishedAt: "2026-09-02T00:00:00.000Z",
        retrievedAt: "2026-09-03T00:00:00.000Z",
      },
    ],
  },
} satisfies InspirationDetail;

function resource(
  overview: InspirationOverview = OVERVIEW,
): ReadonlyResource<InspirationOverview> {
  return new ReadonlyResource(async () => overview);
}
function face(detail: InspirationDetail = DETAIL): InspirationViewFace {
  return {
    ready: () => true,
    list: vi.fn(async () => OVERVIEW),
    getRevision: vi.fn(async () => OVERVIEW.revision),
    get: vi.fn(async () => detail),
    saveDraft: vi.fn(),
    startResearch: vi.fn(async () => ({ item: ITEM, run: RUN })),
    stopRun: vi.fn(async () => ({ ...RUN, status: "cancelled" })),
    saveTask: vi.fn(),
    setTaskState: vi.fn(),
    runTaskNow: vi.fn(),
    markRead: vi.fn(async () => ({ ...RUN, unread: false })),
    deleteRecord: vi.fn(async () => ({ deleted: true })),
    archive: vi.fn(),
    openReportInObsidian: vi.fn(async () => {}),
    serializeReference: vi.fn(async () => ({
      ref: "inspiration:inspiration-1:run-1",
      label: "研究摘要",
      clipboardText: "short reference",
      sha256: "a".repeat(64),
      text: "# 完整报告\nhttps://example.com/source",
    })),
  } as unknown as InspirationViewFace;
}
const t = (key: string): string => key;

afterEach(() => {
  cleanup();
  setInspirationSelection(null);
  vi.restoreAllMocks();
});

describe("inspiration research UI", () => {
  it("reveals history filtering on demand and restores the list and focus on Escape or clear", async () => {
    const user = userEvent.setup();
    const creator = face();
    render(<InspirationSidebarPanel face={creator} resource={new ReadonlyResource(async () => OVERVIEW)} t={t} />);
    const history = await screen.findByRole("region", { name: "历史记录" });
    const searchHistory = screen.getByRole("button", { name: "搜索历史" });
    expect(screen.queryByRole("textbox", { name: "搜索历史" })).toBeNull();
    expect(searchHistory.getAttribute("aria-expanded")).toBe("false");
    expect(searchHistory.querySelector('[data-workbench-icon="search"]')).not.toBeNull();
    expect(within(history).getByRole("button", { name: /AI 写作工作流 ·/ })).toBeTruthy();

    for (const close of ["escape", "clear"]) {
      await user.click(searchHistory);
      const input = screen.getByRole("textbox", { name: "搜索历史" });
      await waitFor(() => expect(document.activeElement).toBe(input));
      expect(searchHistory.getAttribute("aria-controls")).toBe(input.id);
      await user.type(input, "不存在的主题");
      expect(within(history).queryByRole("button", { name: /AI 写作工作流 ·/ })).toBeNull();
      if (close === "escape") await user.keyboard("{Escape}");
      else await user.click(screen.getByRole("button", { name: "清除历史搜索" }));
      await waitFor(() => expect(document.activeElement).toBe(searchHistory));
      expect(screen.queryByRole("textbox", { name: "搜索历史" })).toBeNull();
      expect(searchHistory.getAttribute("aria-expanded")).toBe("false");
      expect(within(history).getByRole("button", { name: /AI 写作工作流 ·/ })).toBeTruthy();
    }

    expect(searchHistory.textContent).toBe("搜索");
    expect(screen.queryByRole("button", { name: "搜索" })).toBeNull();
    expect(screen.queryByRole("button", { name: "新搜索" })).toBeNull();
    expect(creator.startResearch).not.toHaveBeenCalled();
    await user.click(within(history).getByRole("button", { name: /AI 写作工作流 ·/ }));
    expect(getInspirationSelection()?.runId).toBe(RUN.id);
  });

  it("labels the English history filter without a separate research action", async () => {
    const user = userEvent.setup();
    render(<InspirationSidebarPanel face={face()} resource={new ReadonlyResource(async () => OVERVIEW)} t={(key) => inspirationEn[key as keyof typeof inspirationEn] ?? key} />);
    await user.click(screen.getByRole("button", { name: "Search history" }));
    expect(screen.getByRole("textbox", { name: "Search history" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear history search" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Search history" }).textContent).toBe("Search");
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("confirms deletion, removes the selected history card and preserves cancelled cards", async () => {
    const creator = face();
    let current = OVERVIEW;
    const shared = new ReadonlyResource(async () => current);
    creator.deleteRecord = vi.fn(async () => {
      current = { ...OVERVIEW, revision: 9, items: [], recentRuns: [] };
      return { deleted: true };
    });
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    render(<InspirationSidebarPanel face={creator} resource={shared} t={t} />);
    const button = await screen.findByRole("button", { name: `删除：${SPEC.topic}` });
    await userEvent.setup().click(button);
    expect(screen.getByRole("dialog").textContent).toContain("保留本地目录、稿件和报告文件");
    await userEvent.setup().click(screen.getByRole("button", { name: "取消" }));
    expect(creator.deleteRecord).not.toHaveBeenCalled();
    expect(getInspirationSelection()?.runId).toBe(RUN.id);
    await userEvent.setup().click(button);
    await userEvent.setup().click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: `删除：${SPEC.topic}` })).toBeNull());
    expect(creator.deleteRecord).toHaveBeenCalledWith({kind: "item", id: ITEM.id, runId: RUN.id, expectedRevision: RUN.revision, confirmed: true});
    expect(getInspirationSelection()).toBeNull();
  });

  it("keeps failed deletions visible and disables deletion for running research", async () => {
    const creator = face();
    creator.deleteRecord = vi.fn(async () => { throw new Error("revision conflict"); });
    const mounted = render(<InspirationSidebarPanel face={creator} resource={resource()} t={t} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: `删除：${SPEC.topic}` }));
    await userEvent.setup().click(screen.getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "revision conflict");
    expect(screen.getByRole("button", { name: `删除：${SPEC.topic}` })).toBeTruthy();
    mounted.unmount();
    render(<InspirationSidebarPanel face={creator} resource={resource({...OVERVIEW, recentRuns: [{...RUN, status: "running"}]})} t={t} />);
    expect(await screen.findByRole("button", { name: `删除：${SPEC.topic}` })).toHaveProperty("disabled", true);
  });

  it("blocks duplicate submits and selects the run only after history has loaded", async () => {
    const creator = face();
    let finishRefresh!: (value: InspirationOverview) => void;
    const loader = vi
      .fn()
      .mockResolvedValue(OVERVIEW)
      .mockResolvedValueOnce(OVERVIEW)
      .mockImplementationOnce(
        () =>
          new Promise<InspirationOverview>((resolve) => {
            finishRefresh = resolve;
          }),
      );
    const state = new ReadonlyResource<InspirationOverview>(loader);
    await state.load();
    render(
      <InspirationWorkbench
        resource={state}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const input = screen.getByRole("textbox", { name: "主题" });
    expect(
      screen.getByRole("button", { name: "搜索" }).hasAttribute("disabled"),
    ).toBe(true);
    await user.type(input, "新主题{Enter}{Enter}");
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(creator.startResearch).toHaveBeenCalledTimes(1);
    expect(getInspirationSelection()).toBeNull();
    await act(async () => {
      finishRefresh(OVERVIEW);
    });
    await waitFor(() => expect(getInspirationSelection()?.runId).toBe(RUN.id));
  });

  it("renders explicit empty material and source sections for a partial report", async () => {
    const empty = {
      ...DETAIL,
      report: {
        ...DETAIL.report!,
        status: "partial" as const,
        partialReason: "没有可靠来源",
        findings: [],
        disagreements: [],
        angles: [],
        sources: [],
      },
    };
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    render(
      <InspirationWorkbench
        resource={resource()}
        face={face(empty)}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    expect(await screen.findByText("暂无可靠来源。")).toBeTruthy();
    expect(
      screen.getByText("暂无可靠参考素材，请调整主题或时间范围后重试。"),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["总结", "主要发现", "来源"]);
    const article = screen.getByRole("article");
    expect(article.firstElementChild?.textContent).toContain("没有可靠来源");
  });

  it("keeps the full report expanded and matches citation numbers to source order", async () => {
    const report = {
      ...DETAIL.report,
      summary: "第一段总结。\n\n第二段总结，保留完整内容。",
      findings: [
        { text: "第一条发现\n保留补充说明", sourceIds: ["source-9", "source-1"], evidence: "supported" as const },
        { text: "第二条发现", sourceIds: ["source-9"], evidence: "uncertain" as const },
      ],
      disagreements: [
        ...DETAIL.report.disagreements,
        { text: "证据不足的事项", sourceIds: [], evidence: "uncertain" as const },
        { text: "来源支持的补充", sourceIds: ["source-9"], evidence: "supported" as const },
      ],
      sources: [
        DETAIL.report.sources[0]!,
        { ...DETAIL.report.sources[0]!, id: "source-9", title: "补充来源", url: "https://example.com/second", publishedAt: null },
      ],
    };
    const creator = face({ ...DETAIL, report });
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    render(<InspirationWorkbench resource={resource()} face={creator} t={t} openSession={vi.fn()} promote={vi.fn()} />);
    const article = await screen.findByRole("article");
    expect(within(article).getAllByRole("heading").map((heading) => heading.textContent))
      .toEqual(["总结", "主要发现", "分歧与未知", "创作角度", "来源"]);
    expect(article.querySelector(".inspirationSummaryContent")?.textContent).toBe(report.summary);
    expect(article.querySelectorAll("details")).toHaveLength(0);
    const firstFinding = article.querySelector(".inspirationEvidenceList > li")! as HTMLElement;
    expect(firstFinding.querySelector("p")?.textContent).toBe(report.findings[0]!.text);
    const citations = within(firstFinding).getAllByRole("link");
    expect(citations.map((link) => [link.textContent, link.getAttribute("href")]))
      .toEqual([["[2]", "https://example.com/second"], ["[1]", "https://example.com/source"]]);
    expect(citations[0]?.getAttribute("aria-label")).toBe("来源 2：补充来源");
    const sourceList = article.querySelector(".inspirationSources")!;
    expect(Array.from(sourceList.querySelectorAll("li")).map((item) => [item.querySelector("span")?.textContent, item.querySelector("a")?.getAttribute("href")]))
      .toEqual([["[1]", "https://example.com/source"], ["[2]", "https://example.com/second"]]);
    expect(sourceList.textContent).toContain("未知");
    expect(Array.from(article.querySelectorAll(".inspirationEvidenceStatus")).map((label) => label.textContent))
      .toEqual(["存在分歧", "尚不确定", "有来源支持"]);
    expect(creator.startResearch).not.toHaveBeenCalled();
  });

  it("submits the default topic search with Enter once", async () => {
    const creator = face();
    const user = userEvent.setup();
    render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "主题" }),
      "新主题{Enter}",
    );
    await waitFor(() => expect(creator.startResearch).toHaveBeenCalledTimes(1));
    expect(creator.startResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({ mode: "topic", topic: "新主题" }),
      }),
    );
  });

  it("starts an empty hotspot query with the default 24-hour range", async () => {
    const creator = face();
    const user = userEvent.setup();
    render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "获取热点" }));
    await user.click(screen.getByRole("button", { name: "获取" }));
    await waitFor(() =>
      expect(creator.startResearch).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: expect.objectContaining({
            mode: "trend",
            topic: "",
            timeRange: { kind: "24h" },
          }),
        }),
      ),
    );
  });

  it("passes selected preset and custom inclusive date ranges", async () => {
    const creator = face();
    const user = userEvent.setup();
    render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "获取热点" }));
    const range = screen.getByRole("combobox");
    await user.click(range);
    await user.click(await screen.findByRole("option", { name: "过去 7 天" }));
    await user.click(range);
    await user.click(await screen.findByRole("option", { name: "过去 30 天" }));
    await user.click(range);
    await user.click(await screen.findByRole("option", { name: "自定义日期" }));
    await user.type(screen.getByLabelText("开始日期"), "2026-09-01");
    await user.type(screen.getByLabelText("结束日期"), "2026-09-03");
    await user.click(screen.getByRole("button", { name: "获取" }));
    await waitFor(() =>
      expect(creator.startResearch).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: expect.objectContaining({
            timeRange: {
              kind: "custom",
              startDate: "2026-09-01",
              endDate: "2026-09-03",
            },
          }),
        }),
      ),
    );
  });

  it("keeps the sidebar as one deduplicated keyboard-selectable history", async () => {
    const duplicateOverview = {
      ...OVERVIEW,
      items: [{ ...ITEM, latestRunId: RUN.id }],
      recentRuns: [RUN],
    };
    render(
      <InspirationSidebarPanel face={face()} resource={resource(duplicateOverview)} t={t} />,
    );
    const entry = await screen.findByRole("button", {
      name: /^AI 写作工作流/,
    });
    expect(
      screen.getAllByRole("button", { name: /^AI 写作工作流/ }),
    ).toHaveLength(1);
    entry.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(entry.getAttribute("aria-pressed")).toBe("true");
  });

  it("copies the full integrity-checked report and keeps extra actions inline", async () => {
    const creator = face();
    const clipboard = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "AI 写作工作流" });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "复制结果" }));
    await waitFor(() =>
      expect(creator.serializeReference).toHaveBeenCalledWith({
        runId: RUN.id,
        expectedSha256: RUN.reportSha256,
      }),
    );
    await waitFor(() =>
      expect(clipboard).toHaveBeenCalledWith(
        "# 完整报告\nhttps://example.com/source",
      ),
    );
    expect(screen.getByText("总结")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "主要发现" })).toBeTruthy();
    expect(screen.getByText("分歧与未知")).toBeTruthy();
    expect(screen.queryByText("更多")).toBeNull();
    expect(
      screen.getByRole("button", { name: "在 Obsidian 中打开" }),
    ).toBeTruthy();
  });

  it("shows partial results truthfully and blocks changed reports", async () => {
    const partial = {
      ...DETAIL,
      reportIntegrity: "changed" as const,
      report: {
        ...DETAIL.report!,
        status: "partial" as const,
        partialReason: "一项来源不可访问",
        sources: [],
        angles: ["不应强行展示的角度"],
      },
    } satisfies InspirationDetail;
    const creator = face(partial);
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "报告文件已在外部修改",
    );
    expect(screen.queryByRole("button", { name: "复制结果" })).toBeNull();
  });

  it("reports a failed retry and allows a later retry", async () => {
    const creator = face();
    creator.startResearch = vi
      .fn()
      .mockRejectedValueOnce(new Error("网络暂不可用"))
      .mockResolvedValue({ item: ITEM, run: RUN });
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "重新搜索" });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "重新搜索" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "网络暂不可用",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "重新搜索" }));
    await waitFor(() => expect(creator.startResearch).toHaveBeenCalledTimes(2));
  });

  it("does not stop an active run on unmount, then sends one explicit stop", async () => {
    const activeRun = { ...RUN, status: "running" as const, unread: false };
    const activeDetail = {
      ...DETAIL,
      run: activeRun,
      report: null,
    } satisfies InspirationDetail;
    const creator = face(activeDetail);
    const stop = vi.fn(async () => ({
      ...activeRun,
      status: "cancelled" as const,
    }));
    creator.stopRun = stop;
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    const view = render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "停止本次" });
    view.unmount();
    expect(stop).not.toHaveBeenCalled();
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    render(
      <InspirationWorkbench
        resource={resource()}
        face={creator}
        t={t}
        openSession={vi.fn()}
        promote={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "停止本次" });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "停止本次" }));
    expect(stop).toHaveBeenCalledWith(RUN.id, RUN.revision);
  });
});
