/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSelectedContentId, setSidebarTab } from "../src/client/contentSelection.ts";
import { selectDailyHotItem } from "../src/client/dailyHotSelection.ts";
import { OilSidebarRoot } from "../src/client/sidebar/OilSidebarRoot.tsx";
import { selectTrellisProject } from "../src/client/trellisSelection.ts";

function sidebarProps(): ComponentProps<typeof OilSidebarRoot> {
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
    const user = userEvent.setup();
    render(<OilSidebarRoot {...sidebarProps()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["会话", "热点", "内容", "知识", "项目"]);
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1"]);

    tabs[0]?.focus();
    await user.keyboard("{ArrowDown}");
    const hot = screen.getByRole("tab", { name: "热点" });
    await waitFor(() => {
      expect(hot.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(hot);
    });

    await user.keyboard("{Home}");
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
});
