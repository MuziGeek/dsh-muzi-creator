/** @vitest-environment jsdom */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DSH_HOST_SKIN_VERSION,
  dsh204HostSkinSelectors,
} from "../src/client/host-skin/selectorManifest.ts";

const cssPath = resolve(process.cwd(), "src/client/host-skin/dsh-2.0.4.css");
const layoutClientPath = resolve(
  process.cwd(),
  "node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js",
);

describe("DSH Desktop 2.0.4 host skin compatibility", () => {
  it("keeps the selector inventory versioned and scoped to an explicit host opt-in", () => {
    expect(dsh204HostSkinSelectors).not.toHaveLength(0);

    for (const selector of dsh204HostSkinSelectors) {
      expect(selector.version).toBe(DSH_HOST_SKIN_VERSION);
      expect(selector.selector).toContain('body[data-muzi-host-skin="animal-island"]');
      if (selector.kind === "structural") {
        expect(selector.selector).toContain('[data-surface="session-browser"]');
        expect(selector.selector).toContain('[data-slot="sidebar.workspaces"]');
        expect(selector.selector).not.toContain("[aria-label=");
        expect(selector.selector).not.toMatch(/\.[A-Za-z0-9-]*_[A-Za-z0-9_-]{5,}/);
      } else if (!selector.surface.startsWith("narrow") && selector.surface !== "page") {
        expect(selector.selector).toContain(':not([data-plugin="dsh-muzi-creator"] *)');
        expect(selector.selector).toContain(':not([data-plugin-modal="dsh-muzi-creator"] *)');
      }
    }
  });

  it("matches stable host fixtures while excluding the plugin root and portal", () => {
    document.body.dataset.muziHostSkin = "animal-island";
    document.body.innerHTML = `
      <form id="host-composer"><textarea>Long host content</textarea></form>
      <div role="dialog" id="host-dialog"><button>Continue</button></div>
      <div role="menu" id="host-menu"><button role="menuitem">Choose</button></div>
      <div role="tooltip" id="host-tooltip">Helpful text</div>
      <aside id="host-aside">Side content</aside>
      <main data-details-collapsed="true" id="narrow-frame">
        <div data-slot="sidebar">
          <section data-plugin="dsh-muzi-creator" data-surface="sidebar" data-sidebar-expanded="true" id="narrow-sidebar">
            <button aria-label="收起侧边栏">Collapse</button>
          </section>
        </div>
        <div id="narrow-conversation"><div data-slot="conversation"></div></div>
      </main>
      <section data-plugin="dsh-muzi-creator" data-surface="sidebar" id="plugin-sidebar">
        <div data-surface="session-browser">
          <div data-slot="sidebar.workspaces">
            <div id="session-browser-root">
              <div id="session-browser-header">
                <span>Workspaces</span>
                <div><div id="session-browser-search"><button id="session-search" aria-expanded="false"><svg /></button><input id="session-search-input" type="text" tabindex="-1" /></div></div>
                <div id="session-actions"><button id="session-view"><svg /></button><button id="session-add"><svg /></button></div>
              </div>
              <div id="session-list"></div>
            </div>
          </div>
        </div>
        <textarea id="plugin-textarea"></textarea>
      </section>
      <section data-plugin="dsh-muzi-creator" data-surface="sidebar" class="collapsed" id="plugin-rail">
        <div data-surface="session-browser">
          <div data-slot="sidebar.workspaces">
            <div>
              <div><div><button id="rail-add"><svg /></button></div></div>
              <div><button id="rail-search"><svg /></button></div>
              <div></div>
            </div>
          </div>
        </div>
      </section>
      <section data-plugin-modal="dsh-muzi-creator"><div role="dialog" id="plugin-dialog"></div></section>
    `;

    const selectorBySurface = new Map<string, string>(
      dsh204HostSkinSelectors.map((entry) => [entry.surface, entry.selector]),
    );
    const select = (surface: string) => document.querySelector(selectorBySurface.get(surface)!);

    expect(select("composer")?.id).toBe("host-composer");
    expect(select("dialog")?.id).toBe("host-dialog");
    expect(select("menu")?.id).toBe("host-menu");
    expect(select("tooltip")?.id).toBe("host-tooltip");
    expect(select("aside")?.id).toBe("host-aside");
    expect(select("session browser")?.id).toBe("session-browser-root");
    expect(select("session browser actions")?.id).toBe("session-actions");
    expect(select("session browser controls")?.id).toBe("session-search");
    expect(select("session browser icons")?.tagName).toBe("svg");
    expect(select("session browser search slot")?.querySelector("input")?.type).toBe("text");
    expect(select("session browser search")?.id).toBe("session-browser-search");
    expect(select("session browser search input")?.id).toBe("session-search-input");
    expect(document.querySelectorAll(selectorBySurface.get("session browser rail controls")!)).toHaveLength(2);
    expect(select("narrow conversation")?.id).toBe("narrow-conversation");
    expect(select("narrow sidebar")?.id).toBe("narrow-sidebar");

    const textareaSelector = dsh204HostSkinSelectors.find((entry) => entry.surface === "composer" && entry.purpose.includes("textareas"))?.selector;
    const dialogSelector = selectorBySurface.get("dialog");
    expect(document.querySelectorAll(textareaSelector!)).toHaveLength(1);
    expect(document.querySelectorAll(dialogSelector!)).toHaveLength(1);
  });

  it("contains only scoped non-destructive rules and the responsive safety net", async () => {
    const css = await readFile(cssPath, "utf8");

    expect(css).not.toMatch(/(?:^|[^\w-])(?:[A-Za-z_-][\w-]*__|[A-Za-z_-][\w-]*_[A-Za-z0-9_-]{5,})/m);
    expect(css).not.toContain("!important");
    expect(css).not.toMatch(/(?:display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none)/);
    expect(css).not.toMatch(/box-shadow\s*:/);
    expect(css).toContain('body[data-muzi-host-skin="animal-island"]');
    expect(css).toContain(':not([data-plugin="dsh-muzi-creator"] *)');
    expect(css).toContain(':not([data-plugin-modal="dsh-muzi-creator"] *)');
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("@media (max-width: 390px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("var(--dsw-");
    expect(css.match(/\bposition\s*:/g)).toHaveLength(2);
    expect(css).toContain("position: fixed");
    expect(css.match(/\bz-index\s*:/g)).toHaveLength(1);

    const ruleStarts = css
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.endsWith("{") && !line.startsWith("@"));
    expect(ruleStarts).not.toHaveLength(0);
    for (const ruleStart of ruleStarts) {
      expect(ruleStart.startsWith('body[data-muzi-host-skin="animal-island"]')).toBe(true);
    }
  });

  it("keeps every selector synchronized with the pinned host layout artifact", async () => {
    const [css, layoutClient, sidebarSource] = await Promise.all([
      readFile(cssPath, "utf8"),
      readFile(layoutClientPath, "utf8"),
      readFile(resolve(process.cwd(), "src/client/sidebar/OilSidebarRoot.tsx"), "utf8"),
    ]);
    const compact = (value: string) => value.replace(/\s+/g, " ").trim();
    const compactCss = compact(css);

    for (const entry of dsh204HostSkinSelectors) {
      expect(compactCss).toContain(compact(entry.selector));
    }

    expect(layoutClient).toContain('"data-details-collapsed"');
    expect(layoutClient).toContain('renderSlot("sidebar"');
    expect(layoutClient).toContain('renderSlot("conversation"');
    expect(sidebarSource).toContain("data-sidebar-expanded={wide || undefined}");
  });
});
