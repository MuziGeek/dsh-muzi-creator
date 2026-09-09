/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TrellisGithubSources } from "../src/client/TrellisGithubSources.tsx";
import { zh } from "../src/client/locales.ts";
import type { GithubRequest, GithubResult } from "../src/trellisGithubSchemas.ts";

afterEach(cleanup);

it("keeps the current configuration after a failed source switch and preserves the GitHub draft when toggled", async () => {
  let mode: GithubResult["mode"] = "github";
  let failSwitch = true;
  const github = vi.fn(async (request: GithubRequest): Promise<GithubResult> => {
    if (request.action === "mode") {
      if (failSwitch) throw new Error("Cannot save source");
      mode = request.mode;
    }
    return { mode, authAvailable: false, connected: false, login: null, pending: null };
  });
  render(<TrellisGithubSources face={{ github }} t={key => zh[key]}><span>Local directory settings</span></TrellisGithubSources>);
  const query = await screen.findByRole("textbox", { name: zh["github.query"] });
  fireEvent.change(query, { target: { value: "sample/project" } });
  const changeMode = async (name: string) => {
    fireEvent.click(screen.getByRole("combobox", { name: zh["github.sources"] }));
    fireEvent.click(await screen.findByRole("option", { name }));
  };
  await changeMode(zh["github.local"]);
  expect((await screen.findByRole("alert")).textContent).toBe("Cannot save source");
  expect(screen.queryByText("Local directory settings")).toBeNull();
  expect(screen.getByRole("textbox", { name: zh["github.query"] })).toBeTruthy();
  failSwitch = false;
  await changeMode(zh["github.local"]);
  await screen.findByText("Local directory settings");
  expect(screen.queryByRole("textbox", { name: zh["github.query"] })).toBeNull();
  expect(screen.queryByRole("button", { name: zh["github.bind"] })).toBeNull();
  await changeMode(zh["github.remote"]);
  expect((await screen.findByRole("textbox", { name: zh["github.query"] }) as HTMLInputElement).value).toBe("sample/project");
  expect(screen.queryByText("Local directory settings")).toBeNull();
});

it("offers public repository selection while explaining the unavailable GitHub App authorization", async () => {
  const github = vi.fn(async (request: GithubRequest) => ({
    mode: "github" as const, authAvailable: false, connected: false, login: null, pending: null,
    ...(request.action === "browse" ? { repositories: [{ fullName: "sample/project", url: "https://github.com/sample/project", defaultBranch: "main", private: false }] } : {}),
    ...(request.action === "branches" ? { branches: ["main", "development"] } : {}),
    ...(request.action === "connect" ? { message: "Connected sample/project" } : {}),
  }));
  render(<div data-plugin="dsh-muzi-creator"><TrellisGithubSources face={{ github }} t={(key) => zh[key]} /></div>);
  await screen.findByText(zh["github.setup"]);
  expect((screen.getByRole("button", { name: zh["github.bind"] }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: zh["github.query"] }), { target: { value: "https://github.com/sample/project" } });
  fireEvent.click(screen.getByRole("button", { name: zh["github.search"] }));
  await waitFor(() => expect(github).toHaveBeenCalledWith({ action: "browse", query: "https://github.com/sample/project" }));
  const repo = await screen.findByRole("combobox", { name: zh["github.repository"] });
  fireEvent.click(repo);
  fireEvent.click(await screen.findByRole("option", { name: "sample/project" }));
  await waitFor(() => expect(github).toHaveBeenCalledWith({ action: "branches", repository: "sample/project" }));
  await screen.findByRole("combobox", { name: zh["github.branch"] });
  fireEvent.click(screen.getByRole("button", { name: zh["github.add"] }));
  await screen.findByText("Connected sample/project");
  expect(github).toHaveBeenCalledWith({ action: "connect", repository: "sample/project", branch: "main" });
  fireEvent.change(screen.getByRole("textbox", { name: zh["github.query"] }), { target: { value: "new/repo" } });
  expect(screen.queryByRole("button", { name: zh["github.add"] })).toBeNull();
});
