/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
    ).toEqual(["总结", "参考素材", "来源"]);
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
      <InspirationSidebarPanel resource={resource(duplicateOverview)} t={t} />,
    );
    const entry = await screen.findByRole("button", {
      name: /AI 写作工作流/,
    });
    expect(
      screen.getAllByRole("button", { name: /AI 写作工作流/ }),
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
    expect(screen.getByText("参考素材")).toBeTruthy();
    expect(screen.getByText("分歧与未知")).toBeTruthy();
    await userEvent.setup().click(screen.getByText("更多"));
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
