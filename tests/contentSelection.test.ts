import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bumpLibrary,
  bumpProfile,
  getLibraryEpoch,
  getProfileEpoch,
  getSelectedContentId,
  getSidebarTab,
  inspectorIsOpen,
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
    setSelectedContentId(null);
    vi.unstubAllGlobals();
  });

  it("notifies subscribers and persists", () => {
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

  it("keeps the inspector when switching to sessions", () => {
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
    expect(getSelectedContentId()).toBe("2026-01-23_demo");
    expect(inspectorIsOpen()).toBe(true);
    expect(seen).toEqual([]);
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
});
