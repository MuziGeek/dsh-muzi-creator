/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSelectedContentId, setSidebarTab } from "../src/client/contentSelection.ts";
import { selectDailyHotItem } from "../src/client/dailyHotSelection.ts";
import { OilSidebarRoot } from "../src/client/sidebar/OilSidebarRoot.tsx";
import { selectTrellisProject } from "../src/client/trellisSelection.ts";
import type { SessionActivitySnapshot } from "../src/client/workbench/sessionActivity.ts";
import { ReadonlyResource } from "../src/client/workbench/WorkbenchData.ts";

const EMPTY_SESSIONS: SessionActivitySnapshot = { ids: [], byId: {} };

function sidebarProps(sessionSnapshot: SessionActivitySnapshot = EMPTY_SESSIONS): ComponentProps<typeof OilSidebarRoot> {
  const unavailable = <T,>() => new ReadonlyResource<T>(async () => { throw new Error("测试数据不可用"); });
  return {
    collapsed: false,
    width: 360,
    startSession: vi.fn(),
    toggleSidebar: vi.fn(),
    t: (key: string) => key,
    renderSlot: () => null,
    tabLabels: {
      sessions: "会话",
      hot: "热点",
      content: "内容",
      knowledge: "知识",
      projects: "项目",
    },
    contentFace: {} as never,
    hotFace: {
      ready: () => false,
      getDailyHot: async () => { throw new Error("测试中未连接热点服务"); },
    },
    muziFace: {} as never,
    trellisFace: {} as never,
    contentT: (key: string) => key,
    resources: {
      hot: unavailable(),
      content: unavailable(),
      knowledge: unavailable(),
      projects: unavailable(),
    },
    sessionList: {
      getSnapshot: () => sessionSnapshot,
      subscribe: () => () => undefined,
    },
  } as unknown as ComponentProps<typeof OilSidebarRoot>;
}

describe("Muzi Creator sidebar navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    setSidebarTab("sessions");
    setSelectedContentId(null);
    selectDailyHotItem(null);
    selectTrellisProject(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps all five entries in product order with roving keyboard focus", async () => {
    render(<OilSidebarRoot {...sidebarProps()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["会话", "热点", "内容", "知识", "项目"]);
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1"]);
    expect(tabs.map((tab) => tab.getAttribute("data-sidebar-tab"))).toEqual(["sessions", "hot", "content", "knowledge", "projects"]);
    for (const tab of tabs) {
      expect(tab.querySelector(".tabIcon")?.getAttribute("aria-hidden")).toBe("true");
      expect(tab.querySelector(".tabLabel")?.textContent).not.toBe("");
    }

    tabs[0]?.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowDown" });
    const hot = screen.getByRole("tab", { name: "热点" });
    await waitFor(() => {
      expect(hot.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(hot);
    });

    fireEvent.keyDown(hot, { key: "Home" });
    const sessions = screen.getByRole("tab", { name: "会话" });
    await waitFor(() => { expect(document.activeElement).toBe(sessions); });
  });

  it("preserves the host-provided 360px expanded width and settles into the collapsed rail", async () => {
    const { rerender } = render(<OilSidebarRoot {...sidebarProps()} />);
    const sidebar = document.querySelector<HTMLElement>('[data-surface="sidebar"]');
    expect(sidebar?.style.width).toBe("360px");

    rerender(<OilSidebarRoot {...sidebarProps()} collapsed />);
    await waitFor(() => {
      expect(document.querySelector<HTMLElement>('[data-surface="sidebar"]')?.classList.contains("collapsed")).toBe(true);
    });
  });

  it("announces pending interactions before background running sessions", () => {
    render(<OilSidebarRoot {...sidebarProps({
      ids: ["running", "pending"],
      byId: {
        running: { running: true },
        pending: { running: true, pendingInteraction: "approval" },
      },
    })} />);

    const sessions = screen.getByRole("tab", { name: "会话，待处理 1" });
    expect(sessions.textContent).toContain("待处理 1");
    expect(sessions.querySelector(".sessionActivityBadge.pending i")).not.toBeNull();
  });

  it("keeps the expanded new-session action in the brand row and the official browser in a stable wrapper", async () => {
    const user = userEvent.setup();
    const startSession = vi.fn();
    const props = sidebarProps();
    render(<OilSidebarRoot {...props} startSession={startSession} />);

    const topAction = document.querySelector<HTMLButtonElement>(".logoRow > .topNewSession");
    expect(topAction).not.toBeNull();
    expect(document.querySelector(".regionArea .topNewSession")).toBeNull();
    expect(document.querySelector(".headerNewSession")).toBeNull();
    expect(document.querySelector('[data-surface="session-browser"]')).not.toBeNull();

    await user.click(topAction!);
    expect(startSession).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "内容" }));
    expect(document.querySelector(".topNewSession")).toBeNull();
  });

  it("keeps the official session toolbar controls event-complete", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onView = vi.fn();
    const onAdd = vi.fn();
    const props = sidebarProps();
    render(<OilSidebarRoot {...props} renderSlot={(slot) => slot === "sidebar.workspaces" ? (
      <div>
        <div>
          <span>Workspaces</span>
          <div><div><button id="official-search" onClick={onSearch}><svg /></button><input type="text" tabIndex={-1} /></div></div>
          <div><button id="official-view" onClick={onView}><svg /></button><button id="official-add" onClick={onAdd}><svg /></button></div>
        </div>
      </div>
    ) : null} />);

    const sessionBrowser = document.querySelector<HTMLElement>('[data-surface="session-browser"]');
    expect(sessionBrowser?.hasAttribute("style")).toBe(false);
    for (const id of ["official-search", "official-view", "official-add"]) {
      expect(document.querySelector(`#${id} > svg`)).not.toBeNull();
    }

    await user.click(document.querySelector<HTMLButtonElement>("#official-search")!);
    await user.click(document.querySelector<HTMLButtonElement>("#official-view")!);
    await user.click(document.querySelector<HTMLButtonElement>("#official-add")!);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
