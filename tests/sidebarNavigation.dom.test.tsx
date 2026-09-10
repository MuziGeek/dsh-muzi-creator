/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getContentSelection, getKnowledgeSelection, getSidebarTab, setContentSelection, setKnowledgeSelection, getSelectedContentId, setSelectedContentId, setSidebarTab } from "../src/client/contentSelection.ts";
import { getSelectedDailyHotId, selectDailyHotItem } from "../src/client/dailyHotSelection.ts";
import { CREATOR_STORAGE_KEY, loadCreatorUiState } from "../src/client/persistence.ts";
import { getInspirationSelection, setInspirationSelection } from "../src/client/inspirationSelection.ts";
import { KnowledgePanel } from "../src/client/sidebar/KnowledgePanel.tsx";
import { MuziContentPanel } from "../src/client/sidebar/MuziContentPanel.tsx";
import { MzSidebarRoot } from "../src/client/sidebar/MzSidebarRoot.tsx";
import { getSelectedTrellisProjectId, selectTrellisProject } from "../src/client/trellisSelection.ts";
import type { SessionActivitySnapshot } from "../src/client/workbench/sessionActivity.ts";
import { zh, en } from "../src/client/locales.ts";
import { ReadonlyResource } from "../src/client/workbench/WorkbenchData.ts";

const EMPTY_SESSIONS: SessionActivitySnapshot = { ids: [], byId: {} };

function sidebarProps(sessionSnapshot: SessionActivitySnapshot = EMPTY_SESSIONS): ComponentProps<typeof MzSidebarRoot> {
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
      inspiration: "灵感",
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
      inspiration: unavailable(),
      content: unavailable(),
      knowledge: unavailable(),
      projects: unavailable(),
    },
    sessionList: {
      getSnapshot: () => sessionSnapshot,
      subscribe: () => () => undefined,
    },
  } as unknown as ComponentProps<typeof MzSidebarRoot>;
}

describe("Muzi Creator sidebar navigation", () => {
  it("keeps menu scrolling separate, preserves it on navigation and resets it after folding", async () => {
    act(() => { setSidebarTab("knowledge"); });
    const props = sidebarProps();
    const view = render(<MzSidebarRoot {...props} />);
    const menu = view.container.querySelector<HTMLElement>('[data-sidebar-menu]')!;
    const host = menu.querySelector('[data-sidebar-community-entries]')!;
    const region = view.container.querySelector<HTMLElement>('.regionArea')!;
    expect(menu.scrollTop).toBe(0);
    expect([...menu.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute('data-sidebar-tab')))
      .toEqual(['sessions', 'hot', 'inspiration', 'content', 'knowledge', 'projects']);
    menu.scrollTop = 80;
    act(() => { setSidebarTab("content"); });
    expect(menu.scrollTop).toBe(80);
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 288 } as DOMRect);
    const projects = screen.getByRole('tab', { name: '项目' });
    vi.spyOn(projects, 'getBoundingClientRect').mockReturnValue({ top: 296, bottom: 340 } as DOMRect);
    fireEvent.focus(projects);
    expect(menu.scrollTop).toBe(132); expect(region.scrollTop).toBe(0);
    const plugin = document.createElement('button'); host.append(plugin);
    view.rerender(<MzSidebarRoot {...props} collapsed={true} />);
    await waitFor(() => expect(view.container.querySelector('.collapsed')).not.toBeNull());
    expect(plugin.isConnected).toBe(true); expect(screen.queryByRole('tab')).toBeNull();
    view.rerender(<MzSidebarRoot {...props} />);
    expect(view.container.querySelector('[data-sidebar-community-entries]')).toBe(host);
    expect(plugin.isConnected).toBe(true); expect(menu.scrollTop).toBe(0);
  });

  it("returns to sessions after creating from a feature and preserves its selection", async () => {
    const user = userEvent.setup();
    setSidebarTab("hot");
    const props = sidebarProps();
    render(<MzSidebarRoot {...props} />);
    await user.click(screen.getByRole("button", { name: "session.new.label" }));
    expect(props.startSession).toHaveBeenCalledOnce();
    expect(getSidebarTab()).toBe("sessions");
  });

  it.each([false, true])("reports create failures and allows retry with collapsed=%s", async (collapsed) => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    const startSession = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; })).mockResolvedValue(undefined);
    render(<MzSidebarRoot {...sidebarProps()} collapsed={collapsed} startSession={startSession} />);
    const button = document.querySelector<HTMLButtonElement>(collapsed ? ".newSession" : ".topNewSession")!;
    await user.click(button);
    await user.click(button);
    expect(startSession).toHaveBeenCalledOnce();
    await act(async () => { reject(new Error("连接失败")); });
    expect(screen.getByRole("alert").textContent).toContain("连接失败");
    await user.click(button);
    expect(startSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["sessions", "hot", "inspiration", "content", "knowledge", "projects"] as const)(
    "provides the community new-session insertion anchor when restored to %s",
    async (tab) => {
      act(() => { setSidebarTab(tab); });
      const props = sidebarProps();
      const view = render(<MzSidebarRoot {...props} />);
      const logo = view.container.querySelector('[class*="logoRow"]')!;
      const anchor = logo.parentElement!.querySelector<HTMLButtonElement>('button[class*="newSession"]');
      expect(anchor).not.toBeNull();
      expect(anchor!.closest('[class*="logoRow"]')).toBe(logo);
      await userEvent.setup().click(anchor!);
      expect(props.startSession).toHaveBeenCalledOnce();
      view.rerender(<MzSidebarRoot {...props} collapsed={true} />);
      await waitFor(() => expect(view.container.querySelector('.collapsed button[class*="newSession"]')).not.toBeNull());
    },
  );

  it.each(["ssh", "taskboard"])("closes the active %s panel through its controller action on feature navigation", async (panel) => {
    const props = sidebarProps();
    const view = render(<MzSidebarRoot {...props} />);
    const root = view.container.querySelector('[data-surface="sidebar"]')!;
    const active = document.createElement("button");
    active.setAttribute(`data-dsh-${panel}-entry`, "");
    active.setAttribute("data-active", "true");
    const close = vi.fn(() => { active.removeAttribute("data-active"); });
    active.addEventListener("click", close);
    const inactive = document.createElement("button");
    inactive.setAttribute(`data-dsh-${panel === "ssh" ? "taskboard" : "ssh"}-entry`, "");
    const toggle = vi.fn();
    inactive.addEventListener("click", toggle);
    root.append(active, inactive);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "内容" }));
    expect(close).toHaveBeenCalledOnce();
    expect(getSidebarTab()).toBe("content");
    await user.click(screen.getByRole("tab", { name: "知识" }));
    expect(close).toHaveBeenCalledOnce();
    expect(toggle).not.toHaveBeenCalled();
    expect(props.startSession).not.toHaveBeenCalled();
    active.remove();
    inactive.remove();
  });

  it("clears a restored hotspot identity before its data has loaded", async () => {
    const saved = localStorage.getItem(CREATOR_STORAGE_KEY);
    try {
      localStorage.setItem(CREATOR_STORAGE_KEY, JSON.stringify({ ...loadCreatorUiState(undefined), selections: { ...loadCreatorUiState(undefined).selections, hotId: "cold-hotspot" } }));
      vi.resetModules();
      const cold = await import("../src/client/dailyHotSelection.ts");
      expect(cold.getSelectedDailyHotItem()).toBeNull();
      expect(cold.getSelectedDailyHotId()).toBe("cold-hotspot");
      cold.selectDailyHotItem(null);
      expect(cold.getSelectedDailyHotId()).toBeNull();
      expect(JSON.parse(localStorage.getItem(CREATOR_STORAGE_KEY)!).selections.hotId).toBeNull();
    } finally {
      if (saved === null) localStorage.removeItem(CREATOR_STORAGE_KEY);
      else localStorage.setItem(CREATOR_STORAGE_KEY, saved);
    }
  });

  const features = [
    { tab: "hot", label: "热点", previous: "会话", seed: () => selectDailyHotItem({ id: "hot-navigation", title: "测试热点" } as NonNullable<Parameters<typeof selectDailyHotItem>[0]>), selected: getSelectedDailyHotId },
    { tab: "inspiration", label: "灵感", previous: "热点", seed: () => setInspirationSelection({ kind: "item", id: "inspiration-navigation" }), selected: getInspirationSelection },
    { tab: "content", label: "内容", previous: "灵感", seed: () => setContentSelection("content-navigation"), selected: getContentSelection },
    { tab: "knowledge", label: "知识", previous: "内容", seed: () => setKnowledgeSelection({ kind: "page", locator: "atlas://wiki/topics/navigation.md" }), selected: getKnowledgeSelection },
    { tab: "projects", label: "项目", previous: "知识", seed: () => selectTrellisProject("project-navigation" as NonNullable<Parameters<typeof selectTrellisProject>[0]>), selected: getSelectedTrellisProjectId },
  ] as const;

  it.each(features)("opens $label overview on entry, repeated click, return and keyboard navigation", async (feature) => {
    const user = userEvent.setup();
    const props = sidebarProps();
    render(<MzSidebarRoot {...props} />);
    act(() => { for (const entry of features) entry.seed(); });
    await user.click(screen.getByRole("tab", { name: feature.label }));
    expect(getSidebarTab()).toBe(feature.tab);
    expect(feature.selected()).toBeNull();
    for (const other of features.filter((entry) => entry !== feature)) expect(other.selected()).not.toBeNull();
    act(feature.seed);
    expect(feature.selected()).not.toBeNull();
    await user.click(screen.getByRole("tab", { name: feature.label }));
    expect(feature.selected()).toBeNull();
    act(feature.seed);
    await user.click(screen.getByRole("tab", { name: "会话" }));
    expect(feature.selected()).not.toBeNull();
    await user.click(screen.getByRole("tab", { name: feature.label }));
    expect(feature.selected()).toBeNull();
    await user.click(screen.getByRole("tab", { name: feature.previous }));
    act(feature.seed);
    fireEvent.keyDown(screen.getByRole("tab", { name: feature.previous }), { key: "ArrowDown" });
    expect(getSidebarTab()).toBe(feature.tab);
    expect(feature.selected()).toBeNull();
    expect(props.startSession).not.toHaveBeenCalled();
  });

  it("retains the original host icon action without title decoration or added labels", () => {
    const activate = vi.fn();
    const props = sidebarProps();
    const translate = (dictionary: Record<string, string>) => (key: string) => dictionary[key] ?? key;
    const renderSlot: typeof props.renderSlot = (slot) => slot === "sidebar.workspaces"
      ? <button aria-label="Host search" onClick={activate}><svg /></button>
      : null;
    const { rerender } = render(<MzSidebarRoot {...props} renderSlot={renderSlot} t={translate(zh)} />);
    const button = screen.getByRole("button", { name: "Host search" });
    const wrapper = document.querySelector<HTMLElement>('[data-surface="session-browser"]')!;
    expect(wrapper.style.getPropertyValue("--muzi-workspace-title-icon")).toBe("");
    expect(wrapper.style.getPropertyValue("--muzi-workspace-search-label")).toBe("");
    rerender(<MzSidebarRoot {...props} renderSlot={renderSlot} t={translate(en)} />);
    expect(wrapper.style.getPropertyValue("--muzi-workspace-search-label")).toBe("");
    expect(screen.getByRole("button", { name: "Host search" })).toBe(button);
    expect(button.querySelector("svg")).not.toBeNull();
    fireEvent.click(button);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("keeps content search and archive options without a toolbar create action or total", async () => {
    const user = userEvent.setup();
    const listProjects = vi.fn(async () => ({ items: [] }));
    const face = { listProjects } as unknown as ComponentProps<typeof MuziContentPanel>["face"];
    render(<MuziContentPanel face={face} resource={new ReadonlyResource(() => face.listProjects("", false))} />);
    await screen.findByText("可通过会话创建内容，创建后会显示在这里。");
    const header = document.querySelector(".muziSectionHeader")!;
    expect(header.textContent).toBe("创作项目搜索视图");
    expect(screen.queryByRole("button", { name: /新增|预览/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "内容视图选项" }));
    await user.click(screen.getByRole("checkbox", { name: "显示归档目录" }));
    await waitFor(() => expect(listProjects).toHaveBeenCalledWith("", true));
    await user.click(screen.getByRole("button", { name: "搜索内容" }));
    await user.type(screen.getByRole("textbox", { name: "搜索内容" }), "测试主题");
    await waitFor(() => expect(listProjects).toHaveBeenCalledWith("测试主题", true));
  });

  it("keeps project browsing and the global settings trigger without a project sources entry", async () => {
    const user = userEvent.setup();
    const props = sidebarProps();
    const github = vi.fn();
    const openSettings = vi.fn();
    render(<MzSidebarRoot {...props} trellisFace={{ ...props.trellisFace, github }} renderSlot={(slot) => slot === "sidebar.settings" ? <button onClick={openSettings}>设置</button> : null} />);
    await user.click(screen.getByRole("tab", { name: "项目" }));
    expect(screen.queryByRole("button", { name: "github.sources" })).toBeNull();
    expect(document.querySelector(".trellisGithubSources")).toBeNull();
    expect(screen.getByRole("button", { name: "projects.refresh" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "projects.search" }));
    expect(screen.getByRole("textbox", { name: "projects.search" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(github).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    setSidebarTab("sessions");
    setSelectedContentId(null);
    selectDailyHotItem(null);
    selectTrellisProject(null);
    setKnowledgeSelection(null);
    setInspirationSelection(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps all six entries in product order with roving keyboard focus", async () => {
    render(<MzSidebarRoot {...sidebarProps()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["会话", "热点", "灵感", "内容", "知识", "项目"]);
    expect(tabs.map((tab) => tab.querySelector("[data-workbench-icon]")?.getAttribute("data-workbench-icon"))).toEqual(["sessions", "hotspots", "inspiration", "content", "knowledge", "projects"]);
    expect(tabs.every((tab) => tab.querySelector("[data-workbench-icon]")?.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    expect(tabs.map((tab) => tab.getAttribute("data-sidebar-tab"))).toEqual(["sessions", "hot", "inspiration", "content", "knowledge", "projects"]);
    for (const tab of tabs) {
      expect(tab.querySelector(".tabIcon")?.getAttribute("aria-hidden")).toBe("true");
      expect(tab.querySelector(".tabLabel")?.textContent).not.toBe("");
    }
    expect(screen.getByRole("tab", { name: "知识" }).querySelector('[data-workbench-icon="knowledge"]')).not.toBeNull();

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

  it("keeps exactly one selected entry when clicking between all six features", async () => {
    const user = userEvent.setup();
    render(<MzSidebarRoot {...sidebarProps()} />);
    const tabs = screen.getAllByRole("tab");

    for (const tab of [...tabs.slice(1), tabs[0]!]) {
      await user.click(tab);
      expect(screen.getAllByRole("tab", { selected: true })).toEqual([tab]);
      expect(tab.tabIndex).toBe(0);
      for (const other of tabs.filter((entry) => entry !== tab)) {
        expect(other.getAttribute("aria-selected")).toBe("false");
        expect(other.tabIndex).toBe(-1);
      }
    }
  });

  it("preserves the host-provided 360px expanded width and settles into the collapsed rail", async () => {
    const { rerender } = render(<MzSidebarRoot {...sidebarProps()} />);
    const sidebar = document.querySelector<HTMLElement>('[data-surface="sidebar"]');
    expect(sidebar?.style.width).toBe("360px");

    rerender(<MzSidebarRoot {...sidebarProps()} collapsed />);
    await waitFor(() => {
      expect(document.querySelector<HTMLElement>('[data-surface="sidebar"]')?.classList.contains("collapsed")).toBe(true);
    });
  });

  it("announces pending interactions before background running sessions", () => {
    render(<MzSidebarRoot {...sidebarProps({
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
    render(<MzSidebarRoot {...props} startSession={startSession} />);

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
    render(<MzSidebarRoot {...props} renderSlot={(slot) => slot === "sidebar.workspaces" ? (
      <div>
        <div>
          <span>Workspaces</span>
          <div><div><button id="official-search" onClick={onSearch}><svg /></button><input type="text" tabIndex={-1} /></div></div>
          <div><button id="official-view" onClick={onView}><svg /></button><button id="official-add" onClick={onAdd}><svg /></button></div>
        </div>
      </div>
    ) : null} />);

    const sessionBrowser = document.querySelector<HTMLElement>('[data-surface="session-browser"]');
    expect(sessionBrowser?.style.getPropertyValue("--muzi-workspace-title-icon")).toBe("");
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

  it("keeps knowledge cards text-first while keyboard selection opens the same knowledge detail", async () => {
    setSidebarTab("knowledge");
    const topic = {
      id: "long-topic",
      locator: "atlas://wiki/topics/long-topic.md",
      title: "A deliberately long English knowledge title that remains readable alongside 中文主题名称",
      category: "topics" as const,
      sha256: "a".repeat(64),
      updatedAt: "2026-09-03T00:00:00.000Z",
      excerpt: "A deliberately long English knowledge title that remains readable alongside 中文主题名称\n这是一段用于验证两行摘要截断和卡片文本层级的主题知识摘要。",
    };
    const face = {
      getKnowledgeHome: async () => ({
        status: {
          status: "ready" as const,
          schemaVersion: "1",
          language: "zh-CN",
          rawMarkdownCount: 1,
          rawFileCount: 1,
          formalPageCount: 1,
          message: null,
        },
        directories: [],
        topics: [topic],
      }),
    };
    render(
      <KnowledgePanel
        face={face as unknown as ComponentProps<typeof KnowledgePanel>["face"]}
      />,
    );

    const card = await screen.findByRole("button", { name: /A deliberately long English knowledge title/ });
    expect(document.querySelector(".muziSectionHeader")?.textContent).toBe("知识搜索");
    expect(screen.queryByRole("button", { name: /预览知识库|通过会话新增知识/ })).toBeNull();
    expect(document.querySelector(".muziBrowseHeading")?.textContent).toBe("主题知识1");
    expect(card.querySelector(".muziListIcon")).toBeNull();
    expect(card.querySelector('[data-workbench-icon="knowledge"]')).toBeNull();
    expect(card.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(card.textContent).toContain(topic.title);
    expect(card.textContent).toContain("主题知识");
    expect(card.textContent).toContain("这是一段用于验证两行摘要截断和卡片文本层级的主题知识摘要。");
    expect(card.getAttribute("aria-pressed")).toBe("false");

    fireEvent.keyDown(card, { key: "Enter" });
    await waitFor(() => {
      expect(card.getAttribute("aria-pressed")).toBe("true");
      expect(getSelectedContentId()).toBe(`knowledge:${topic.locator}`);
    });

    setSelectedContentId(null);
    fireEvent.keyDown(card, { key: " " });
    await waitFor(() => {
      expect(card.getAttribute("aria-pressed")).toBe("true");
      expect(getSelectedContentId()).toBe(`knowledge:${topic.locator}`);
    });
  });
});
