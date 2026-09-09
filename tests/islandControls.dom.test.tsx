/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type ChangeEvent, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IslandInput,
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

  it("preserves labelled controlled input, clear and disabled behavior through the styled shell", async () => {
    const user = userEvent.setup();
    function Field() {
      const [value, setValue] = useState("第一版");
      return <IslandInput className="featureSearch" id="controlled-search" name="search" aria-label="搜索内容" value={value}
        allowClear onClear={() => { setValue(""); }} onChange={(event: ChangeEvent<HTMLInputElement>) => { setValue(event.target.value); }} />;
    }
    const { rerender } = render(<Field />);
    const input = screen.getByRole("textbox", { name: "搜索内容" }) as HTMLInputElement;
    expect(input.id).toBe("controlled-search");
    expect(input.name).toBe("search");
    expect(input.parentElement?.classList.contains("islandInput")).toBe(true);
    expect(input.parentElement?.classList.contains("featureSearch")).toBe(true);
    await user.type(input, "补充");
    expect(input.value).toBe("第一版补充");
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(input.value).toBe("");
    rerender(<IslandInput aria-label="搜索内容" value="锁定" disabled allowClear onChange={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });

  it("keeps password and date input types and exposes validation state on the input shell", () => {
    const { rerender } = render(<IslandInput type="password" aria-label="密钥" status="error" value="" onChange={vi.fn()} />);
    const password = screen.getByLabelText("密钥") as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(password.parentElement?.classList.contains("is-error")).toBe(true);
    rerender(<IslandInput type="datetime-local" aria-label="计划时间" status="warning" value="2026-09-08T20:00" onChange={vi.fn()} />);
    const date = screen.getByLabelText("计划时间") as HTMLInputElement;
    expect(date.type).toBe("datetime-local");
    expect(date.value).toBe("2026-09-08T20:00");
    expect(date.parentElement?.classList.contains("is-warning")).toBe(true);
  });

  it("retains select keyboard navigation and restores focus after selecting or closing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IslandSelect aria-label="渠道" value="a" onChange={onChange} options={[{ key: "a", label: "博客" }, { key: "b", label: "视频" }]} />);
    const trigger = screen.getByRole("combobox", { name: "渠道" });
    trigger.focus();
    await user.keyboard("{Enter}{End}{Enter}");
    expect(onChange).toHaveBeenCalledWith("b");
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}{Escape}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
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
