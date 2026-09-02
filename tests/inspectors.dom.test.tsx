/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  MarkdownText: ({ text }: { text: string }) => <div>{text}</div>,
}));

vi.mock("../src/client/KnowledgePreview.tsx", () => ({
  KnowledgePreview: () => <div data-testid="knowledge-preview" />,
}));

import type { DailyHotItem } from "../src/dailyHotTypes.ts";
import type { KnowledgePage } from "../src/muziTypes.ts";
import type { TrellisProjectDetail, TrellisProjectId, TrellisTaskKey } from "../src/trellisTypes.ts";
import { getKnowledgeSelection, setSelectedContentId, setSidebarTab } from "../src/client/contentSelection.ts";
import { DailyHotInspector } from "../src/client/DailyHotInspector.tsx";
import { selectDailyHotItem } from "../src/client/dailyHotSelection.ts";
import { MuziInspector } from "../src/client/MuziInspector.tsx";
import { TrellisProjectInspector } from "../src/client/TrellisProjectInspector.tsx";
import {
  getSelectedTrellisTaskKey,
  selectTrellisProject,
  selectTrellisTask,
} from "../src/client/trellisSelection.ts";

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
    counts: { planning: 0, inProgress: 0, completed: 0, unknown: 0, archived: 0, verifiedArchived: 0, invalid: 0 },
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

describe("central detail bodies", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    selectDailyHotItem(null);
    selectTrellisProject(null);
    setSidebarTab("content");
    setSelectedContentId(null);
    setSidebarTab("knowledge");
    setSelectedContentId(null);
    setSidebarTab("sessions");
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  });

  it("renders Hot as an embedded read-only article with no overlay geometry", () => {
    selectDailyHotItem(HOT_ITEM);
    render(<DailyHotInspector {...({ t: (key: string) => key } as ComponentProps<typeof DailyHotInspector>)} />);
    const detail = document.querySelector<HTMLElement>('[data-surface="daily-hot-inspector"]');
    expect(detail?.tagName).toBe("ARTICLE");
    expect(detail?.style.width).toBe("");
    expect(screen.getByRole("heading", { name: HOT_ITEM.title })).toBeTruthy();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("renders knowledge detail centrally and preserves the existing handoff action", async () => {
    setSidebarTab("knowledge");
    setSelectedContentId("knowledge:atlas://wiki/test");
    const discuss = vi.fn(async () => undefined);
    const props = {
      muziFace: { getKnowledgePage: vi.fn(async () => KNOWLEDGE_PAGE) },
      oilFace: {},
      startPendingProcessing: vi.fn(),
      startKnowledgeDiscussion: discuss,
    } as unknown as ComponentProps<typeof MuziInspector>;
    render(<MuziInspector {...props} />);
    await waitFor(() => { expect(screen.getByRole("heading", { name: "知识详情" })).toBeTruthy(); });
    fireEvent.click(screen.getByRole("button", { name: /与智能助手讨论/ }));
    await waitFor(() => { expect(discuss).toHaveBeenCalledWith(KNOWLEDGE_PAGE); });
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("returns an unavailable restored knowledge selection to its overview", async () => {
    setSidebarTab("knowledge");
    setSelectedContentId("knowledge:atlas://wiki/topics/removed.md");
    const props = {
      muziFace: {
        getKnowledgePage: vi.fn(async () => {
          throw new Error("knowledge page is unavailable or outside the formal Wiki categories");
        }),
      },
      oilFace: {},
      startPendingProcessing: vi.fn(),
      startKnowledgeDiscussion: vi.fn(),
    } as unknown as ComponentProps<typeof MuziInspector>;

    render(<MuziInspector {...props} />);
    await waitFor(() => { expect(getKnowledgeSelection()).toBeNull(); });
  });

  it("renders Trellis detail centrally while retaining read-only folder access", async () => {
    const getProject = vi.fn(async () => TRELLIS_DETAIL);
    const openPath = vi.fn(async () => undefined);
    selectTrellisProject(PROJECT_ID);
    const props = {
      face: { getProject, prepareArchive: vi.fn(), archiveTask: vi.fn(), openPath },
      t: (key: string) => key,
    } as unknown as ComponentProps<typeof TrellisProjectInspector>;
    render(<TrellisProjectInspector {...props} />);
    await waitFor(() => { expect(getProject).toHaveBeenCalledWith(PROJECT_ID); });
    fireEvent.click(screen.getByRole("button", { name: "projects.openFolder" }));
    expect(openPath).toHaveBeenCalledWith(TRELLIS_DETAIL.project.rootPath);
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("clears a restored Trellis task that the validated project no longer contains", async () => {
    selectTrellisProject(PROJECT_ID);
    selectTrellisTask("removed-task" as TrellisTaskKey);
    const props = {
      face: {
        getProject: vi.fn(async () => TRELLIS_DETAIL),
        prepareArchive: vi.fn(),
        archiveTask: vi.fn(),
        openPath: vi.fn(),
      },
      t: (key: string) => key,
    } as unknown as ComponentProps<typeof TrellisProjectInspector>;

    render(<TrellisProjectInspector {...props} />);
    await waitFor(() => { expect(getSelectedTrellisTaskKey()).toBeNull(); });
  });
});
