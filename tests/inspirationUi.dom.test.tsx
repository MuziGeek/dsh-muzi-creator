/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InspirationDetail, InspirationItem, InspirationOverview, InspirationRun, InspirationTask } from "../src/inspirationTypes.ts";
import type { InspirationViewFace } from "../src/client/face.ts";
import { InspirationSidebarPanel, InspirationWorkbench } from "../src/client/inspiration/index.ts";
import { setInspirationSelection } from "../src/client/inspirationSelection.ts";
import { ReadonlyResource } from "../src/client/workbench/WorkbenchData.ts";

const ITEM = {
  id: "inspiration-1", revision: 1, archived: false, sessionId: "session-1", latestRunId: "run-1", createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T01:00:00.000Z",
  spec: { topic: "AI 写作工作流", objective: "找出可验证的实践", questions: [], mode: "topic", sourceLanguage: "zh-en", preferredDomains: [], excludedDomains: [], depth: "standard" },
} as unknown as InspirationItem;
const RUN = { id: "run-1", revision: 1, ownerKind: "item", ownerId: "inspiration-1", trigger: "manual", status: "ready", spec: ITEM.spec, scheduledFor: null, queuedAt: "2026-09-03T00:00:00.000Z", startedAt: "2026-09-03T00:01:00.000Z", finishedAt: "2026-09-03T00:02:00.000Z", sessionId: "session-1", reportPath: "report.md", reportSha256: "a".repeat(64), unread: true, error: null } as InspirationRun;
const TASK = { id: "task-0001", revision: 1, name: "每日 AI 观察", spec: ITEM.spec, state: "paused", dailyTime: "09:00", timeZone: "Asia/Shanghai", authorizedAt: null, nextRunAt: null, sessionId: null, latestRunId: null, createdAt: ITEM.createdAt, updatedAt: ITEM.updatedAt } as unknown as InspirationTask;
const OVERVIEW = { schemaVersion: 1, revision: 1, generatedAt: "2026-09-03T00:00:00.000Z", items: [ITEM], tasks: [], recentRuns: [RUN], counts: { needsAttention: 0, running: 0, queued: 0, unread: 1 } } satisfies InspirationOverview;
const DETAIL = { schemaVersion: 1, owner: ITEM, run: RUN, reportIntegrity: "ok", previousRuns: [], report: { schemaVersion: 1, runId: RUN.id, generatedAt: "2026-09-03T00:02:00.000Z", status: "ready", partialReason: null, summary: "研究摘要", findings: [], disagreements: [], angles: ["内容角度一", "内容角度二", "内容角度三"], nextSteps: [], sources: [] } } satisfies InspirationDetail;

function resource(): ReadonlyResource<InspirationOverview> { return new ReadonlyResource(async () => OVERVIEW); }
function face(): InspirationViewFace {
  return {
    ready: () => true,
    list: vi.fn(async () => OVERVIEW),
    getRevision: vi.fn(async () => OVERVIEW.revision),
    saveDraft: vi.fn(async () => ITEM),
    startResearch: vi.fn(async () => ({ item: ITEM, run: RUN })),
    stopRun: vi.fn(async () => ({ ...RUN, status: "cancelled", unread: false } as InspirationRun)),
    saveTask: vi.fn(async () => TASK),
    setTaskState: vi.fn(async (request) => ({ ...TASK, revision: TASK.revision + 1, state: request.state })),
    runTaskNow: vi.fn(async () => RUN),
    markRead: vi.fn(async () => ({ ...RUN, revision: RUN.revision + 1, unread: false })),
    archive: vi.fn(async () => ({ ...ITEM, archived: true })),
    openReportInObsidian: vi.fn(async () => {}),
    serializeReference: vi.fn(async () => ({ ref: "inspiration:inspiration-1:run-1", label: "研究摘要", clipboardText: "研究摘要", sha256: "a".repeat(64), text: "# 研究摘要" })),
    get: vi.fn(async () => DETAIL),
  };
}
const t = (key: string): string => key;

afterEach(() => {
  cleanup();
  setInspirationSelection(null);
});

describe("inspiration ledger UI", () => {
  it("loads the shared sidebar resource and lets a keyboard user choose a report", async () => {
    const read = resource();
    render(<InspirationSidebarPanel resource={read} t={t} />);
    await screen.findAllByText("AI 写作工作流");
    const card = screen.getAllByRole("button", { name: /AI 写作工作流/ })[0]!;
    card.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });

  it("starts a research request from the capture form without invoking an agent", async () => {
    const creator = face();
    const openSession = vi.fn();
    const promote = vi.fn();
    render(<InspirationWorkbench resource={resource()} face={creator} t={t} openSession={openSession} promote={promote} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "创作主题" }), "新主题");
    await user.click(screen.getByRole("button", { name: "开始调研" }));
    await waitFor(() => { expect(creator.startResearch).toHaveBeenCalledWith(expect.objectContaining({ spec: expect.objectContaining({ topic: "新主题" }) })); });
    expect(openSession).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it("marks a visible report read and only promotes its validated reference", async () => {
    setInspirationSelection({ kind: "item", id: ITEM.id, runId: RUN.id });
    const creator = face();
    const promote = vi.fn(async () => {});
    render(<InspirationWorkbench resource={resource()} face={creator} t={t} openSession={vi.fn()} promote={promote} />);
    await screen.findByRole("heading", { name: "AI 写作工作流" });
    await waitFor(() => { expect(creator.markRead).toHaveBeenCalledWith(RUN.id, RUN.revision); });
    await userEvent.setup().click(screen.getByRole("button", { name: "转为内容" }));
    await waitFor(() => { expect(creator.serializeReference).toHaveBeenCalledWith({ runId: RUN.id, expectedSha256: RUN.reportSha256 }); });
    expect(promote).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit enable action for a paused daily task", async () => {
    const overview = { ...OVERVIEW, items: [], tasks: [TASK], recentRuns: [], counts: { needsAttention: 0, running: 0, queued: 0, unread: 0 } };
    const creator = face();
    creator.get = vi.fn(async () => ({ schemaVersion: 1, owner: TASK, run: null, report: null, reportIntegrity: "unavailable", previousRuns: [] } satisfies InspirationDetail));
    const dailyResource = new ReadonlyResource(async () => overview);
    render(<InspirationWorkbench resource={dailyResource} face={creator} t={t} openSession={vi.fn()} promote={vi.fn()} />);
    await screen.findByText("每日 AI 观察");
    await userEvent.setup().click(screen.getByRole("button", { name: "编辑" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "启用并授权" }));
    expect(creator.setTaskState).toHaveBeenCalledWith({ taskId: TASK.id, expectedRevision: TASK.revision, state: "enabled", confirmed: true });
  });
});
