/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import { PanelSectionHeader } from "../src/client/sidebar/PanelSectionHeader.tsx";

afterEach(cleanup);

it("keeps refresh unavailable while reading and restores its named action afterward", async () => {
  const user = userEvent.setup();
  const refresh = vi.fn();
  const props = { label: "灵感", query: "", searchLabel: "搜索历史", searchName: "history", searchPlaceholder: "搜索历史", refreshLabel: "刷新历史", onQueryChange: vi.fn(), onRefresh: refresh };
  const { rerender } = render(<PanelSectionHeader {...props} refreshing />);
  const button = screen.getByRole("button", { name: "刷新历史" });
  expect(button.querySelector('[data-workbench-icon="refresh"]')).not.toBeNull();
  expect(button.getAttribute("aria-busy")).toBe("true");
  await user.click(button);
  expect(refresh).not.toHaveBeenCalled();
  rerender(<PanelSectionHeader {...props} refreshing={false} />);
  await user.click(screen.getByRole("button", { name: "刷新历史" }));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("img")).toBeNull();
});
