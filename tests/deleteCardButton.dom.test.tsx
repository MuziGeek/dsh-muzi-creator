/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MuziContentPanel } from "../src/client/sidebar/MuziContentPanel.tsx";
import { getContentSelection, setContentSelection } from "../src/client/contentSelection.ts";
import type { MuziViewFace } from "../src/client/face.ts";
import { DeleteCardButton } from "../src/client/DeleteCardButton.tsx";
import { ContentOverview } from "../src/client/workbench/WorkbenchOverviews.tsx";
import { ReadonlyResource } from "../src/client/workbench/WorkbenchData.ts";
import { contentOverviewProject } from "./helpers/contentOverviewFixture.ts";
import { deleteEn } from "../src/client/deleteCopy.ts";
import { userEvent } from "@testing-library/user-event";
afterEach(() => { cleanup(); setContentSelection(null); vi.restoreAllMocks(); });
it("blocks duplicate deletion and exposes failure for retry", async () => {
  let fail!: (error: Error) => void;
  const remove = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
  render(<DeleteCardButton title="测试" onDelete={remove} />);
  const button = screen.getByRole("button", { name: "删除：测试" });
  fireEvent.click(button);
  const confirm = screen.getByRole("button", { name: "删除" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(button).toHaveProperty("disabled", true);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => { fail(new Error("稍后重试")); });
  expect(screen.getByRole("alert").textContent).toBe("稍后重试");
  expect(button).toHaveProperty("disabled", false);
  expect(screen.getByRole("dialog")).toBeTruthy();
  remove.mockResolvedValueOnce();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "删除" })); });
  expect(remove).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("deletes a content summary without selecting it and localizes the confirmation", async () => {
  const project = contentOverviewProject();
  const remove = vi.fn(async () => {}); const select = vi.fn();
  render(<ContentOverview result={{items:[project]} as never} onSelect={select} onDelete={remove} t={(key) => deleteEn[key as keyof typeof deleteEn] ?? key} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", {name: `Delete：${project.title}`})); });
  expect(remove).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Delete this card?" }).textContent).toContain("Local folders, manuscripts and reports are kept");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Delete" })); });
  expect(remove).toHaveBeenCalledWith(project);
  expect(select).not.toHaveBeenCalled();
});
it("refreshes after an older read finishes instead of restoring a deleted card", async () => {
  let finish!: (value: string[]) => void;
  const loader = vi.fn().mockImplementationOnce(() => new Promise<string[]>((resolve) => { finish = resolve; })).mockResolvedValue([]);
  const resource = new ReadonlyResource<string[]>(loader);
  const old = resource.load(); const fresh = resource.refreshAfterMutation();
  finish(["deleted"]); await old; await fresh;
  expect(resource.getSnapshot().data).toEqual([]);
  expect(loader).toHaveBeenCalledTimes(2);
});

it("removes the selected content card after confirmation and reloads the list", async () => {
  const project = contentOverviewProject(); let items = [project];
  const face = {
    listProjects: vi.fn(async () => ({items})),
    getProjectCover: vi.fn(async () => ({found:false})),
    deleteProject: vi.fn(async () => { items=[]; return {deleted:true}; }),
  } as unknown as MuziViewFace;
  const shared = new ReadonlyResource(() => face.listProjects());
  setContentSelection(project.id);
  render(<MuziContentPanel face={face} resource={shared} />);
  const button = await screen.findByRole("button", {name:`删除：${project.title}`});
  await act(async () => { fireEvent.click(button); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "删除" })); });
  await waitFor(() => expect(screen.queryByRole("button", {name:`删除：${project.title}`})).toBeNull());
  expect(face.deleteProject).toHaveBeenCalledWith(project.id,project.revision);
  expect(getContentSelection()).toBeNull();
  expect(shared.getSnapshot().data?.items).toEqual([]);
});

it("focuses cancel, confines keyboard focus and restores the trigger without deleting", async () => {
  const user = userEvent.setup();
  const remove = vi.fn(async () => {});
  render(<DeleteCardButton title="保留的灵感" onDelete={remove} />);
  const trigger = screen.getByRole("button", { name: "删除：保留的灵感" });
  await user.click(trigger);
  const cancel = screen.getByRole("button", { name: "取消" });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  expect(screen.getByRole("dialog").dataset.pluginModal).toBe("dsh-muzi-creator");
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "删除" }));
  await user.tab();
  expect(document.activeElement).toBe(cancel);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(remove).not.toHaveBeenCalled();
});
