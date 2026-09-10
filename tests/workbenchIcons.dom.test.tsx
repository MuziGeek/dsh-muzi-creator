/** @vitest-environment jsdom */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkbenchIcon } from "../src/client/ui/WorkbenchIcon.tsx";
import { WorkbenchSettingsTrigger } from "../src/client/ui/WorkbenchSettingsTrigger.tsx";
import { IslandButton } from "../src/client/ui/IslandControls.tsx";
import { userEvent } from "@testing-library/user-event";

afterEach(cleanup);

it("keeps image decoration out of the control name and preserves activation", async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(<IslandButton icon={<WorkbenchIcon name="search" />} onClick={onClick}>搜索资料</IslandButton>);
  const button = screen.getByRole("button", { name: "搜索资料" });
  expect(screen.queryByRole("img")).toBeNull();
  expect(button.querySelector('[data-workbench-icon="search"] img')).not.toBeNull();
  await user.click(button);
  button.focus();
  await user.keyboard("{Enter}");
  expect(onClick).toHaveBeenCalledTimes(2);
});

it("uses the settings icon in wide and rail content without owning the host button", () => {
  const { container, rerender } = render(<WorkbenchSettingsTrigger wide t={() => "设置"} />);
  expect(screen.getByText("设置")).toBeTruthy();
  expect(container.querySelector("button")).toBeNull();
  expect(container.querySelector("[data-workbench-icon]")?.getAttribute("data-workbench-icon")).toBe("settings");
  rerender(<WorkbenchSettingsTrigger wide={false} t={() => "设置"} />);
  expect(screen.getByText("设置").className).toBe("muziIconSrOnly");
  expect(container.querySelector("[data-workbench-icon]")?.getAttribute("data-icon-purpose")).toBe("navigation");
});

it("retains the host settings button name when the sidebar collapses", () => {
  const { rerender } = render(<button><WorkbenchSettingsTrigger wide t={() => "设置"} /></button>);
  expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
  rerender(<button><WorkbenchSettingsTrigger wide={false} t={() => "设置"} /></button>);
  expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
});
