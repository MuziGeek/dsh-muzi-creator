import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bumpLibrary,
  bumpProfile,
  getLibraryEpoch,
  getProfileEpoch,
  getContentSelection,
  getKnowledgeSelection,
  getSelectedContentId,
  getSidebarTab,
  inspectorIsOpen,
  setContentSelection,
  setKnowledgeSelection,
  setSelectedContentId,
  setSidebarTab,
  subscribeLibrary,
  subscribeProfile,
  subscribeSelectedContentId,
  subscribeSidebarChrome,
} from "../src/client/contentSelection.ts";

describe("content selection", () => {
  afterEach(() => {
    setSidebarTab("sessions");
    setContentSelection(null);
    setKnowledgeSelection(null);
    vi.unstubAllGlobals();
  });

  it("notifies subscribers and persists", () => {
    setSidebarTab("content");
    const seen: Array<string | null> = [];
    const stop = subscribeSelectedContentId(() => {
      seen.push(getSelectedContentId());
    });
    setSelectedContentId("2026-01-23_demo");
    setSelectedContentId("2026-01-23_demo");
    expect(seen).toEqual(["2026-01-23_demo"]);
    expect(getSelectedContentId()).toBe("2026-01-23_demo");
    stop();
  });

  it("releases the active detail in sessions and restores it when content returns", () => {
    setSidebarTab("content");
    setSelectedContentId("2026-01-23_demo");
    expect(inspectorIsOpen()).toBe(true);
    const seen: Array<string | null> = [];
    const stop = subscribeSelectedContentId(() => {
      seen.push(getSelectedContentId());
    });
    let chrome = 0;
    const stopChrome = subscribeSidebarChrome(() => {
      chrome += 1;
    });
    setSidebarTab("sessions");
    expect(getSidebarTab()).toBe("sessions");
    expect(chrome).toBe(1);
    stopChrome();
    expect(getSelectedContentId()).toBeNull();
    expect(inspectorIsOpen()).toBe(false);
    expect(getContentSelection()).toBe("2026-01-23_demo");
    expect(seen).toEqual([null]);
    setSidebarTab("content");
    expect(getSelectedContentId()).toBe("2026-01-23_demo");
    expect(inspectorIsOpen()).toBe(true);
    expect(seen).toEqual([null, "2026-01-23_demo"]);
    stop();
  });

  it("bumps the library epoch", () => {
    const start = getLibraryEpoch();
    let seen = start;
    const stop = subscribeLibrary(() => {
      seen = getLibraryEpoch();
    });
    bumpLibrary();
    expect(seen).toBe(start + 1);
    stop();
  });

  it("keeps profile refreshes separate from library refreshes", () => {
    const profileStart = getProfileEpoch();
    let profileSeen = profileStart;
    const stop = subscribeProfile(() => {
      profileSeen = getProfileEpoch();
    });

    bumpLibrary();
    expect(profileSeen).toBe(profileStart);
    bumpProfile();
    expect(profileSeen).toBe(profileStart + 1);
    stop();
  });

  it("restores global sidebar chrome without selecting or mutating conversation DOM", async () => {
    class FakeStyle {
      private readonly values = new Map<string, { value: string; priority: string }>();

      getPropertyValue(name: string): string {
        return this.values.get(name)?.value ?? "";
      }

      getPropertyPriority(name: string): string {
        return this.values.get(name)?.priority ?? "";
      }

      setProperty(name: string, value: string, priority = ""): void {
        this.values.set(name, { value, priority });
      }

      removeProperty(name: string): void {
        this.values.delete(name);
      }
    }

    class FakeHTMLElement { readonly style = new FakeStyle(); }

    const root = new FakeHTMLElement();
    const querySelector = vi.fn();
    root.style.setProperty("--oil-sidebar-width", "11px", "important");
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("document", {
      documentElement: root,
      querySelector,
    });

    const { releaseShellChrome, setSidebarChromeWidth } =
      await import("../src/client/contentSelection.ts");

    setSelectedContentId("content-selection-test");
    setSelectedContentId(null);

    setSidebarChromeWidth(350);
    expect(root.style.getPropertyValue("--oil-sidebar-width")).toBe("350px");
    releaseShellChrome();
    expect(root.style.getPropertyValue("--oil-sidebar-width")).toBe("11px");
    expect(root.style.getPropertyPriority("--oil-sidebar-width")).toBe("important");
    expect(querySelector).not.toHaveBeenCalled();

    setSidebarChromeWidth(350);
    expect(root.style.getPropertyValue("--oil-sidebar-width")).toBe("350px");
    releaseShellChrome();
    expect(root.style.getPropertyValue("--oil-sidebar-width")).toBe("11px");
    expect(querySelector).not.toHaveBeenCalled();
  });

  it("keeps content and knowledge selections independently", () => {
    setContentSelection("content-one");
    setKnowledgeSelection({ kind: "page", locator: "atlas://wiki/topics/one.md" });
    expect(getContentSelection()).toBe("content-one");
    expect(getKnowledgeSelection()).toEqual({ kind: "page", locator: "atlas://wiki/topics/one.md" });
    for (const tab of ["hot", "projects", "sessions", "content"] as const) {
      setSidebarTab(tab);
      expect(getContentSelection()).toBe("content-one");
      expect(getKnowledgeSelection()).toEqual({ kind: "page", locator: "atlas://wiki/topics/one.md" });
    }
    setSidebarTab("knowledge");
    expect(getSelectedContentId()).toBe("knowledge:atlas://wiki/topics/one.md");
    setSelectedContentId(null);
    expect(getKnowledgeSelection()).toBeNull();
    expect(getContentSelection()).toBe("content-one");
  });
});
