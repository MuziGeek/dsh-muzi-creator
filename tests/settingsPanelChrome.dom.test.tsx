/** @vitest-environment jsdom */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ComponentProps, SVGProps } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  IconChevronDownOutline14: ({ className, ...props }: SVGProps<SVGSVGElement>) => <svg className={className} {...props} />,
}));

import { CreatorSettingsCard } from "../src/client/CreatorSettingsCard.tsx";
import { en, zh, type CreatorKey } from "../src/client/locales.ts";
import { PanelSectionHeader } from "../src/client/sidebar/PanelSectionHeader.tsx";
import { IslandCheckbox } from "../src/client/ui/IslandControls.tsx";

function settingsCardProps(locale: typeof zh | typeof en) {
  return {
    t: (key: CreatorKey) => locale[key],
    ready: () => true,
    getSettings: async () => ({
      libraryRoot: "D:\\Creator",
      profile: { enabledPlatforms: [] },
      secrets: {
        subtitle: { kind: "subtitle" as const, ref: "DASHSCOPE_API_KEY", configured: false, writable: true },
        cover: { kind: "cover" as const, ref: "ZENMUX_API_KEY", configured: false, writable: true },
      },
      scriptRules: "",
      trellisProjectsRoot: "",
      obsidianExecutable: "",
    }),
    getCapabilities: async () => undefined,
    setLibraryRoot: vi.fn(),
    setTrellisProjectsRoot: vi.fn(),
    setObsidianExecutable: vi.fn(),
    setProfile: vi.fn(),
    setScriptRules: vi.fn(),
    pickDirectory: vi.fn(),
    credentials: undefined,
  } as unknown as ComponentProps<typeof CreatorSettingsCard>;
}

describe("settings and content-panel disclosure chrome", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the host-style settings disclosure and keeps content view controls inline", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CreatorSettingsCard {...settingsCardProps(zh)} />);

    const collapsed = screen.getByRole("button", { name: "展开设置" });
    const bodyId = collapsed.getAttribute("aria-controls");
    expect(collapsed.tagName).toBe("BUTTON");
    expect(bodyId).not.toBeNull();
    expect(collapsed.querySelector("svg.chevron")).not.toBeNull();
    expect(collapsed.querySelector("svg.chevron")?.getAttribute("aria-hidden")).toBe("true");

    await user.click(collapsed);
    const expanded = screen.getByRole("button", { name: "收起设置" });
    expect(expanded.getAttribute("aria-expanded")).toBe("true");
    expect(bodyId === null ? null : document.getElementById(bodyId)?.className).toBe("body");
    expect(expanded.querySelector("svg.chevron.open")).not.toBeNull();

    unmount();
    render(<CreatorSettingsCard {...settingsCardProps(en)} />);
    expect(screen.getByRole("button", { name: "Show settings" })).toBeTruthy();

    cleanup();
    const onRefresh = vi.fn();
    render(
      <PanelSectionHeader
        label="创作项目"
        query=""
        searchLabel="搜索内容"
        searchName="content-search"
        searchPlaceholder="搜索内容…"
        viewLabel="内容视图选项"
        viewContent={(
          <IslandCheckbox
            options={[{ label: "显示归档目录", value: "archived" }]}
            value={[]}
            onChange={vi.fn()}
          />
        )}
        onQueryChange={vi.fn()}
        onRefresh={onRefresh}
      />,
    );

    const viewButton = screen.getByRole("button", { name: "内容视图选项" });
    await user.click(viewButton);
    const disclosure = screen.getByRole("group", { name: "内容视图选项" });
    expect(disclosure.classList.contains("muziViewDisclosure")).toBe(true);
    expect(disclosure.previousElementSibling?.classList.contains("muziSectionHeader")).toBe(true);

    await user.click(screen.getByRole("button", { name: "刷新" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("group", { name: "内容视图选项" })).toBeTruthy();

    const checkbox = screen.getByRole("checkbox", { name: "显示归档目录" });
    checkbox.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "内容视图选项" })).toBeNull();
      expect(document.activeElement).toBe(viewButton);
    });

    await user.click(viewButton);
    await user.click(screen.getByRole("button", { name: "搜索内容" }));
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "内容视图选项" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "搜索内容" }));
    });
  });

  it("pins the official card metrics and keeps the view disclosure in normal layout", async () => {
    const [settingsCss, panelsCss] = await Promise.all([
      readFile(resolve(process.cwd(), "src/client/CreatorSettingsCard.css"), "utf8"),
      readFile(resolve(process.cwd(), "src/client/sidebar/MuziPanels.css"), "utf8"),
    ]);

    expect(settingsCss).toContain("border: 1px solid var(--dsw-alias-border-l2)");
    expect(settingsCss).toContain("border-radius: 12px");
    expect(settingsCss).toContain("background: var(--dsw-alias-bg-layer-3)");
    expect(settingsCss).toContain("padding: 14px 16px");
    expect(settingsCss).toContain("transition: transform 0.16s");
    expect(panelsCss).toMatch(/\.muziViewDisclosure\s*\{[\s\S]*?margin:\s*0 12px 8px 4px/);
    expect(panelsCss).not.toMatch(/\.muziViewDisclosure\s*\{[^}]*position:\s*(?:absolute|fixed)/);
  });
});
