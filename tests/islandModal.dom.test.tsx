/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IslandModal } from "../src/client/ui/IslandModal.tsx";

afterEach(cleanup);
describe("theme-aware modal dismissal", () => {
  it("lets the parent veto Escape and restores focus when unmounted", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const view = render(<IslandModal open title="保留本地文件" onClose={close} footer={<button>取消</button>}><p>内容仍会保留。</p></IslandModal>);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-plugin-modal")).toBe("dsh-muzi-creator");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "取消" }));
    const event = new Event("cancel", { cancelable: true });
    fireEvent(dialog, event);
    expect(event.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect((dialog as HTMLDialogElement).open).toBe(true);
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
  it("does not interpret body clicks as backdrop dismissal", () => {
    const close = vi.fn();
    render(<IslandModal open title="编辑" onClose={close} maskClosable={false} footer={null}><p>正文</p></IslandModal>);
    fireEvent.click(screen.getByText("正文"));
    fireEvent.click(screen.getByRole("dialog"), { clientX: -1, clientY: -1 });
    expect(close).not.toHaveBeenCalled();
  });
});
