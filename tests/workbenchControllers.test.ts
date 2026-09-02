import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationWorkbenchController } from "../src/client/workbench/conversationSlot.ts";
import { deriveSessionActivityBadge } from "../src/client/workbench/sessionActivity.ts";
import {
  bindSidebarLayout,
  compactSidebarForDetail,
  expandSidebarList,
  isNewDetailSelection,
  rememberSidebarItemFocus,
  sidebarItemElementId,
} from "../src/client/workbench/sidebarLayoutBridge.ts";
import { ReadonlyResource } from "../src/client/workbench/WorkbenchData.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ConversationWorkbenchController", () => {
  it("keeps one central root across Muzi features and releases it for sessions", () => {
    const dispose = vi.fn();
    const register = vi.fn(() => dispose);
    const errors: Array<string | null> = [];
    const controller = new ConversationWorkbenchController(register, (message) => { errors.push(message); });

    controller.sync("hot");
    controller.sync("content");
    controller.sync("knowledge");
    controller.sync("projects");
    expect(register).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    controller.sync("sessions");
    expect(dispose).toHaveBeenCalledTimes(1);
    controller.sync("content");
    expect(register).toHaveBeenCalledTimes(2);
    controller.dispose();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(errors.at(-1)).toBeNull();
  });

  it("reports registration failures without hiding the official occupant", () => {
    const errors: Array<string | null> = [];
    const controller = new ConversationWorkbenchController(
      () => { throw new Error("conversation seat unavailable"); },
      (message) => { errors.push(message); },
    );

    controller.sync("hot");
    expect(errors).toEqual(["conversation seat unavailable"]);
    controller.sync("sessions");
    expect(errors.at(-1)).toBeNull();
  });
});

describe("ReadonlyResource", () => {
  it("coalesces concurrent reads and retains the last value when refresh fails", async () => {
    let resolveFirst: ((value: number) => void) | undefined;
    const loader = vi.fn(() => new Promise<number>((resolve) => { resolveFirst = resolve; }));
    const resource = new ReadonlyResource(loader);

    const first = resource.load();
    const duplicate = resource.load(true);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(resource.getSnapshot()).toMatchObject({ data: null, loading: true, refreshing: false, error: null });
    resolveFirst?.(7);
    await expect(first).resolves.toBe(7);
    await expect(duplicate).resolves.toBe(7);
    expect(resource.getSnapshot()).toEqual({ data: 7, loading: false, refreshing: false, error: null });

    loader.mockRejectedValueOnce(new Error("refresh unavailable"));
    await expect(resource.load(true)).rejects.toThrow("refresh unavailable");
    expect(resource.getSnapshot()).toEqual({
      data: 7,
      loading: false,
      refreshing: false,
      error: "refresh unavailable",
    });
  });
});

describe("session activity badge", () => {
  it("prioritizes pending interaction counts over running sessions", () => {
    expect(deriveSessionActivityBadge({
      ids: ["a", "b", "c"],
      byId: {
        a: { running: true },
        b: { running: true, pendingInteraction: "approval" },
        c: { running: false, pendingInteraction: "question" },
      },
    })).toEqual({ kind: "pending", count: 2, label: "待处理 2" });
    expect(deriveSessionActivityBadge({
      ids: ["a", "b"],
      byId: { a: { running: true }, b: { running: false } },
    })).toEqual({ kind: "running", count: 1, label: "运行中 1" });
    expect(deriveSessionActivityBadge({ ids: [], byId: {} })).toBeNull();
  });
});

describe("official sidebar layout bridge", () => {
  it("recognizes only a new selection within the active feature", () => {
    expect(isNewDetailSelection("hot", null, "hot", "hot-1")).toBe(true);
    expect(isNewDetailSelection("hot", "hot-1", "hot", "hot-1")).toBe(false);
    expect(isNewDetailSelection("hot", "hot-1", "content", "content-1")).toBe(false);
    expect(isNewDetailSelection("content", "content-1", "content", null)).toBe(false);
  });

  it("compacts only below 880px and expands through the bound host action", () => {
    const compactToggle = vi.fn();
    vi.stubGlobal("window", { innerWidth: 879 });
    const releaseCompact = bindSidebarLayout({ collapsed: false, toggle: compactToggle });
    compactSidebarForDetail();
    expect(compactToggle).toHaveBeenCalledTimes(1);
    releaseCompact();

    const wideToggle = vi.fn();
    vi.stubGlobal("window", { innerWidth: 880 });
    const releaseWide = bindSidebarLayout({ collapsed: false, toggle: wideToggle });
    compactSidebarForDetail();
    expect(wideToggle).not.toHaveBeenCalled();
    releaseWide();

    const expandToggle = vi.fn();
    const releaseExpand = bindSidebarLayout({ collapsed: true, toggle: expandToggle });
    expandSidebarList();
    expect(expandToggle).toHaveBeenCalledTimes(1);
    releaseExpand();
  });

  it("restores the remembered sidebar item after an explicit expansion", () => {
    const focus = vi.fn();
    const getElementById = vi.fn(() => ({ focus }));
    vi.stubGlobal("window", {
      innerWidth: 390,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    vi.stubGlobal("document", { getElementById });
    const toggle = vi.fn();
    const release = bindSidebarLayout({ collapsed: true, toggle });

    rememberSidebarItemFocus("knowledge", "page:atlas://wiki/topics/focus.md");
    expandSidebarList();

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(getElementById).toHaveBeenCalledWith(sidebarItemElementId(
      "knowledge",
      "page:atlas://wiki/topics/focus.md",
    ));
    expect(focus).toHaveBeenCalledTimes(1);
    release();
  });
});
