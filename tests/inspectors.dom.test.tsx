/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  MarkdownText: ({ text }: { text: string }) => <div>{text}</div>,
}));

vi.mock("../src/client/KnowledgePreview.tsx", () => ({
  KnowledgePreview: () => <div data-testid="knowledge-preview" />,
}));

import type { DailyHotItem } from "../src/dailyHotTypes.ts";
import type { KnowledgePage } from "../src/muziTypes.ts";
import type { TrellisProjectDetail, TrellisProjectId } from "../src/trellisTypes.ts";
import {
  releaseShellChrome,
  setInspectorWidth,
  setSelectedContentId,
  setSidebarChromeWidth,
} from "../src/client/contentSelection.ts";
import { DailyHotInspector } from "../src/client/DailyHotInspector.tsx";
import { selectDailyHotItem } from "../src/client/dailyHotSelection.ts";
import { MuziInspector } from "../src/client/MuziInspector.tsx";
import { TrellisProjectInspector } from "../src/client/TrellisProjectInspector.tsx";
import { selectTrellisProject } from "../src/client/trellisSelection.ts";

const HOT_ITEM = {
  id: "hot-1",
  kind: "hot-topic",
  title: "一条足够长的热点标题",
  summary: "摘要",
  latest: "最新进展",
  source: { name: "来源" },
  sourceNames: ["来源"],
  sourceCount: 1,
  signalCount: 1,
  latestAt: "2026-09-01T00:00:00.000Z",
  publishedAt: null,
  discoveredAt: null,
  category: null,
  categoryLabel: null,
  score: null,
  links: { aihot: "https://example.com/hot", original: "https://example.com/source", story: null },
  reportIds: [],
  storyStatus: null,
  attention: { domains: [], reason: "测试" },
  evidence: { level: "original-linked", label: "原始来源" },
} as unknown as DailyHotItem;

const PROJECT_ID = "trellis-project" as TrellisProjectId;
const TRELLIS_DETAIL = {
  project: {
    projectId: PROJECT_ID,
    title: "Trellis 项目",
    rootPath: "D:\\GitProject\\trellis-project",
    status: "ready",
    statusMessage: "可用",
    counts: {
      planning: 0,
      inProgress: 0,
      completed: 0,
      unknown: 0,
      archived: 0,
      verifiedArchived: 0,
      invalid: 0,
    },
    issues: [],
  },
  activeTasks: [],
  archivedTasks: [],
  scannedAt: "2026-09-01T00:00:00.000Z",
} satisfies TrellisProjectDetail;

const KNOWLEDGE_PAGE = {
  id: "knowledge-page",
  locator: "atlas://wiki/test",
  title: "知识详情",
  category: "topics",
  sha256: "a".repeat(64),
  updatedAt: "2026-09-01T00:00:00.000Z",
  excerpt: "摘要",
  markdown: "# 知识详情",
  related: [],
} satisfies KnowledgePage;

function setViewport(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

describe("Inspector overlay behavior", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    setViewport(1440);
    setSidebarChromeWidth(360);
    setInspectorWidth(640);
  });

  afterEach(() => {
    cleanup();
    selectDailyHotItem(null);
    selectTrellisProject(null);
    setSelectedContentId(null);
    releaseShellChrome();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    vi.unstubAllGlobals();
  });

  it("opens, closes and resizes the Hot inspector without touching host conversation DOM", async () => {
    const closeDetails = vi.fn();
    selectDailyHotItem(HOT_ITEM);
    render(<DailyHotInspector {...({ t: (key: string) => key, closeDetails } as unknown as ComponentProps<typeof DailyHotInspector>)} />);

    const inspector = document.querySelector<HTMLElement>('[data-surface="daily-hot-inspector"]');
    expect(inspector?.style.width).toBe("640px");
    const separator = screen.getByRole("separator", { name: "hot.resize" });
    fireEvent.pointerDown(separator, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 20 });
    await waitFor(() => { expect(inspector?.style.width).toBe("560px"); });
    fireEvent.pointerUp(window, { clientX: 20 });

    fireEvent.click(screen.getByRole("button", { name: "hot.close" }));
    expect(closeDetails).toHaveBeenCalledOnce();
  });

  it("switches the Muzi inspector between split and full width and restores its close action", async () => {
    const closeDetails = vi.fn();
    setSelectedContentId("knowledge:atlas://wiki/test");
    const props = {
      muziFace: { getKnowledgePage: vi.fn(async () => KNOWLEDGE_PAGE) },
      oilFace: {},
      startPendingProcessing: vi.fn(),
      startKnowledgeDiscussion: vi.fn(),
      closeDetails,
    } as unknown as ComponentProps<typeof MuziInspector>;
    render(<MuziInspector {...props} />);

    const inspector = document.querySelector<HTMLElement>('[data-surface="muzi-inspector"]');
    await waitFor(() => { expect(inspector?.style.width).toBe("640px"); });
    expect(inspector?.classList.contains("full")).toBe(false);
    expect(screen.getByRole("separator", { name: "调整详情宽度" })).toBeTruthy();

    act(() => { setViewport(1024); });
    await waitFor(() => {
      expect(inspector?.classList.contains("full")).toBe(true);
      expect(inspector?.style.width).toBe("1024px");
    });
    expect(screen.queryByRole("separator", { name: "调整详情宽度" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));
    expect(closeDetails).toHaveBeenCalledOnce();
  });

  it("switches the Trellis inspector to full width while preserving its read-only face", async () => {
    const closeDetails = vi.fn();
    const getProject = vi.fn(async () => TRELLIS_DETAIL);
    selectTrellisProject(PROJECT_ID);
    const props = {
      face: {
        getProject,
        prepareArchive: vi.fn(),
        archiveTask: vi.fn(),
        openPath: vi.fn(),
      },
      t: (key: string) => key,
      closeDetails,
    } as unknown as ComponentProps<typeof TrellisProjectInspector>;
    render(<TrellisProjectInspector {...props} />);

    const inspector = document.querySelector<HTMLElement>('[data-surface="trellis-inspector"]');
    await waitFor(() => {
      expect(getProject).toHaveBeenCalledWith(PROJECT_ID);
      expect(inspector?.style.width).toBe("640px");
    });
    expect(screen.getByRole("separator", { name: "调整项目详情宽度" })).toBeTruthy();

    act(() => { setViewport(1024); });
    await waitFor(() => {
      expect(inspector?.classList.contains("full")).toBe(true);
      expect(inspector?.style.width).toBe("1024px");
    });
    expect(screen.queryByRole("separator", { name: "调整项目详情宽度" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭项目详情" }));
    expect(closeDetails).toHaveBeenCalledOnce();
  });
});
