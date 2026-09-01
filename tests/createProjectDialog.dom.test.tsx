/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateProjectDialog } from "../src/client/sidebar/CreateProjectDialog.tsx";

describe("CreateProjectDialog portal behavior", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    document.body.removeAttribute("data-ds-dark-theme");
    vi.unstubAllGlobals();
  });

  it("marks the body portal with the plugin theme boundary and restores focus", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "打开新增内容";
    document.body.append(trigger);
    trigger.focus();

    const onCancel = vi.fn();
    const { unmount } = render(
      <CreateProjectDialog
        title=""
        primary="mother"
        submitting={false}
        error={null}
        onTitleChange={vi.fn()}
        onPrimaryChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "新增内容" });
    await waitFor(() => {
      expect(dialog.parentElement).not.toBeNull();
      expect(dialog.dataset.plugin).toBe("dsh-muzi-creator");
      expect(dialog.dataset.surface).toBe("muzi-create-dialog");
      expect(document.body.style.overflow).toBe("hidden");
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();

    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
      expect(document.activeElement).toBe(trigger);
    });
    trigger.remove();
  });

  it("keeps cancellation locked while creation is submitting", async () => {
    const onCancel = vi.fn();
    render(
      <CreateProjectDialog
        title="可用标题"
        primary="video"
        submitting
        error={null}
        onTitleChange={vi.fn()}
        onPrimaryChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );

    const cancel = screen.getByRole("button", { name: "取消" });
    expect(cancel.hasAttribute("disabled")).toBe(true);
    await userEvent.setup().keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
