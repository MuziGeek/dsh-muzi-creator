/** @vitest-environment jsdom */
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { destroyMuziNotifications, showMuziNotification } from "../src/client/ui/MuziNotification.ts";

function notification(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-animal-notification-root] [data-notification-key="${key}"]`);
}

describe("Muzi notifications", () => {
  afterEach(() => {
    destroyMuziNotifications();
    cleanup();
    document.documentElement.lang = "";
  });

  it("mounts an accessible, themed notification and updates duplicate keys", async () => {
    document.documentElement.lang = "zh-CN";
    showMuziNotification({ kind: "success", message: "已保存", description: "配置已更新", key: "settings-save" });

    await waitFor(() => expect(notification("settings-save")).not.toBeNull());
    const root = document.querySelector<HTMLElement>("[data-animal-notification-root]");
    expect(root?.dataset.plugin).toBe("dsh-muzi-creator");
    expect(root?.getAttribute("role")).toBe("status");
    expect(root?.getAttribute("aria-live")).toBe("polite");
    expect(root?.getAttribute("aria-hidden")).toBe("false");
    expect(root?.getAttribute("aria-label")).toBe("工作台通知");
    expect(notification("settings-save")?.classList.contains("muziNotification-success")).toBe(true);
    expect(notification("settings-save")?.textContent).toContain("配置已更新");
    expect(notification("settings-save")?.querySelector("button")?.getAttribute("aria-label")).toBe("关闭通知");

    showMuziNotification({ kind: "info", message: "已刷新", key: "settings-save" });
    await waitFor(() => expect(notification("settings-save")?.textContent).toContain("已刷新"));
    expect(document.querySelectorAll('[data-animal-notification-root] [data-notification-key="settings-save"]')).toHaveLength(1);
    expect(notification("settings-save")?.classList.contains("muziNotification-info")).toBe(true);
  });

  it("supports manual close and automatic dismissal", async () => {
    showMuziNotification({ kind: "warning", message: "请检查配置", key: "manual-close", duration: 30 });
    await waitFor(() => expect(notification("manual-close")).not.toBeNull());
    fireEvent.click(notification("manual-close")?.querySelector("button") as HTMLButtonElement);
    await waitFor(() => expect(notification("manual-close")).toBeNull());

    showMuziNotification({ kind: "error", message: "读取失败", key: "auto-close", duration: 0.01 });
    await waitFor(() => expect(notification("auto-close")).not.toBeNull());
    await waitFor(() => expect(notification("auto-close")).toBeNull(), { timeout: 1000 });
    expect(document.querySelector<HTMLElement>("[data-animal-notification-root]")?.getAttribute("aria-hidden")).toBe("true");
  });
});
