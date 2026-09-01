/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IslandSelect,
  IslandSelectableCard,
  IslandState,
  IslandTextarea,
} from "../src/client/ui/IslandControls.tsx";

describe("Island control adapters", () => {
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

  it("activates selectable cards with Enter and Space", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<IslandSelectableCard selected onSelect={onSelect}>一条内容</IslandSelectableCard>);

    const card = screen.getByRole("button", { name: "一条内容" });
    expect(card.getAttribute("aria-pressed")).toBe("true");
    card.focus();
    await user.keyboard("{Enter} ");

    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("keeps unavailable Select choices visible as reasons but outside the listbox", async () => {
    const user = userEvent.setup();
    render(
      <IslandSelect
        aria-label="发布账号"
        value=""
        onChange={vi.fn()}
        options={[
          { key: "active", label: "可用账号" },
          { key: "disabled", label: "停用账号", disabled: true, disabledReason: "账号已停用" },
        ]}
      />,
    );

    expect(screen.getByText("不可用选项：停用账号（账号已停用）")).toBeTruthy();
    await user.click(screen.getByRole("combobox", { name: "发布账号" }));
    const listbox = await screen.findByRole("listbox", { name: "发布账号" });

    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["可用账号"]);
    expect(within(listbox).queryByRole("option", { name: "停用账号" })).toBeNull();
  });

  it("renders the multiline exception as a controlled, labelled textarea", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <IslandTextarea aria-label="脚本规则" name="script-rules" value="第一版" onChange={onChange} />,
    );

    const textarea = screen.getByRole("textbox", { name: "脚本规则" });
    await user.type(textarea, "补充");
    expect(onChange).toHaveBeenCalled();

    rerender(<IslandTextarea aria-label="脚本规则" name="script-rules" value="第二版" onChange={onChange} />);
    expect((textarea as HTMLTextAreaElement).value).toBe("第二版");
  });

  it("announces loading and error states with the appropriate live semantics", async () => {
    const { rerender } = render(<IslandState kind="loading" title="正在读取" />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");

    rerender(<IslandState kind="error" title="读取失败" message="保持原数据，不自动重试" />);
    await waitFor(() => { expect(screen.getByRole("alert").textContent).toContain("不自动重试"); });
  });
});
