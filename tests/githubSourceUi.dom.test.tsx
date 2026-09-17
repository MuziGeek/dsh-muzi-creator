/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GithubSourceSettings } from "../src/client/GithubSourceSettings.tsx";
import { zh } from "../src/client/locales.ts";
import { destroyMuziNotifications } from "../src/client/ui/MuziNotification.ts";
import type { GithubSourceRequest, GithubSourceResult } from "../src/githubSourceSchemas.ts";

function result(mode: "local" | "github" = "local"): GithubSourceResult {
  return {
    target: "creator",
    mode,
    authAvailable: false,
    connected: false,
    login: null,
    pending: null,
    selection: null,
    snapshot: null,
  };
}

describe("GithubSourceSettings", () => {
  afterEach(() => {
    destroyMuziNotifications();
    cleanup();
  });

  it("switches to a repository, selects a branch, and connects the source", async () => {
    const user = userEvent.setup();
    let status = result();
    const github = vi.fn(async (request: GithubSourceRequest): Promise<GithubSourceResult> => {
      if (request.action === "mode") status = result(request.mode);
      if (request.action === "browse") {
        return {
          ...status,
          repositories: [{ fullName: "owner/repo", url: "https://github.com/owner/repo", defaultBranch: "main", private: false }],
        };
      }
      if (request.action === "branches") return { ...status, branches: ["main", "draft"] };
      if (request.action === "connect") {
        status = {
          ...status,
          mode: "github",
          selection: { owner: "owner", repo: "repo", branch: request.branch },
          snapshot: {
            url: "https://github.com/owner/repo",
            branch: request.branch,
            sha: "a".repeat(40),
            syncedAt: "2026-09-17T00:00:00.000Z",
            stale: false,
            fileCount: 1,
            bytes: 12,
          },
        };
      }
      return status;
    });
    const props: ComponentProps<typeof GithubSourceSettings> = {
      face: { github },
      target: "creator",
      t: (key) => zh[key],
      children: <span>Local creator folder</span>,
    };
    render(<div data-plugin="dsh-muzi-creator"><GithubSourceSettings {...props} /></div>);
    const region = screen.getByRole("combobox", { name: zh["githubSource.creator"] });
    await waitFor(() => expect(github).toHaveBeenCalledWith({ target: "creator", action: "status" }));
    expect(screen.getByText("Local creator folder")).toBeTruthy();

    await user.click(region);
    await user.click(await screen.findByRole("option", { name: zh["githubSource.remote"] }));
    await waitFor(() => expect(github).toHaveBeenCalledWith({ target: "creator", action: "mode", mode: "github" }));

    const query = screen.getByRole("textbox", { name: zh["githubSource.query"] });
    await user.type(query, "owner/repo");
    await user.click(screen.getByRole("button", { name: zh["githubSource.search"] }));
    await user.click(await screen.findByRole("combobox", { name: zh["githubSource.repository"] }));
    await user.click(await screen.findByRole("option", { name: "owner/repo" }));
    await waitFor(() => expect(github).toHaveBeenCalledWith({ target: "creator", action: "branches", repository: "owner/repo" }));
    const source = within(screen.getByText(zh["githubSource.remoteHint"]).parentElement!.parentElement!);
    expect(source.getByRole("combobox", { name: zh["githubSource.branch"] })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: zh["githubSource.connect"] }));
    await waitFor(() => expect(github).toHaveBeenCalledWith({ target: "creator", action: "connect", repository: "owner/repo", branch: "main" }));
    await waitFor(() => expect(document.querySelector('[data-notification-key="github-source-creator-connect"]')).not.toBeNull());
    expect(await screen.findByText("a".repeat(40))).toBeTruthy();
  });
});
