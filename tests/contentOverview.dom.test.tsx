/** @vitest-environment jsdom */
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/client/MuziProjectCover.tsx", () => ({
  MuziProjectCover: ({ title }: { title: string }) => <span aria-label={`封面：${title}`} />,
}));

vi.mock("../src/client/PlatformMark.tsx", () => ({
  PlatformMark: () => <span aria-hidden="true" />,
}));

import { overviewEn } from "../src/client/overviewCopy.ts";
import { ContentOverview } from "../src/client/ContentOverview.tsx";
import { ContentOverview as WorkbenchContentOverview } from "../src/client/workbench/WorkbenchOverviews.tsx";
import {
  contentOverviewProduction,
  contentOverviewProject,
  contentOverviewPublication,
  contentOverviewTask,
} from "./helpers/contentOverviewFixture.ts";

afterEach(cleanup);

function renderOverview(options: Partial<ComponentProps<typeof ContentOverview>> = {}) {
  const onOpenDocument = vi.fn();
  const onOpenProduction = vi.fn();
  const onManagePublish = vi.fn();
  render(<div data-plugin="dsh-muzi-creator"><ContentOverview
    project={contentOverviewProject()}
    production={contentOverviewProduction()}
    productionError={null}
    publication={contentOverviewPublication(contentOverviewTask())}
    loadCover={vi.fn(async () => ({ found: false, mime: "", base64: "" }))}
    onOpenDocument={onOpenDocument}
    onOpenProduction={onOpenProduction}
    onManagePublish={onManagePublish}
    {...options}
  /></div>);
  return { onOpenDocument, onOpenProduction, onManagePublish };
}

describe("ContentOverview", () => {
  it("opens account management from the content overview even with no projects", () => {
    const onManageAccounts = vi.fn();
    render(<div data-plugin="dsh-muzi-creator"><WorkbenchContentOverview result={{ items: [] } as never} onSelect={vi.fn()} onManageAccounts={onManageAccounts} /></div>);
    fireEvent.click(screen.getByRole("button", { name: "账号管理" }));
    expect(onManageAccounts).toHaveBeenCalledOnce();
    expect(screen.getByText("还没有创作项目")).toBeTruthy();
  });
  it("keeps recorded publication facts visible beside a pending task and routes its alert to that platform", () => {
    const { onManagePublish } = renderOverview();
    expect(screen.getAllByText("未记录发布")).toHaveLength(2);
    expect(screen.getByText("已排程")).toBeTruthy();
    expect(screen.getAllByText("已发布")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "打开文章" }).getAttribute("href")).toBe("https://example.com/blog-1");
    fireEvent.click(screen.getByRole("button", { name: "小红书：待确认立即发布" }));
    expect(onManagePublish).toHaveBeenCalledWith("xiaohongshu");
    const manage = screen.getByRole("button", { name: "管理发布" });
    expect(manage.querySelector("img, svg")).toBeNull();
    expect(manage.getAttribute("aria-controls")).toBe("muzi-publish-management");
    expect(manage.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(manage);
    expect(onManagePublish).toHaveBeenLastCalledWith();
  });

  it("marks stale documents and opens their document key", () => {
    const { onOpenDocument } = renderOverview();
    expect(screen.getByText("来源已更新，待重新加工")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "视频稿：草稿" }));
    expect(onOpenDocument).toHaveBeenCalledWith("video");
  });

  it("shows a production load failure while retaining the production entry", () => {
    const { onOpenProduction } = renderOverview({ production: null, productionError: "制作目录暂不可读" });
    expect(screen.getByRole("alert").textContent).toContain("视频制作信息不可用");
    expect(screen.getByRole("alert").textContent).toContain("制作目录暂不可读");
    const production = screen.getByRole("button", { name: "查看制作" });
    expect(production.querySelector("img, svg")).toBeNull();
    fireEvent.click(production);
    expect(onOpenProduction).toHaveBeenCalledOnce();
  });

  it("tells the user to check an unknown submission result without offering a retry", () => {
    const { onManagePublish } = renderOverview({
      publication: contentOverviewPublication(contentOverviewTask({
        status: "COMMIT_UNKNOWN",
        commitBlocker: { code: "remote-result", message: "平台未返回可核验结果" },
      })),
      managementOpen: true,
    });
    expect(screen.getByText("提交结果未知，需核查：平台未返回可核验结果")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    expect(screen.getByRole("button", { name: "管理发布" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /小红书.*提交结果未知/ }));
    expect(onManagePublish).toHaveBeenCalledWith("xiaohongshu");
  });
  it("keeps all document statuses readable on an archived item", () => {
    renderOverview({ project: contentOverviewProject({ stage: "archived" }) });
    expect(screen.getByText("已归档")).toBeTruthy();
    for (const name of ["母内容：已就绪", "视频稿：草稿", "公众号：审阅中", "小红书：未开始"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("distinguishes an unscheduled platform draft and preserves it when its task is blocked", () => {
    const project = contentOverviewProject();
    project.publications.xiaohongshu = { ...project.publications.xiaohongshu, status: "platform_draft" };
    const { onManagePublish } = renderOverview({ project, publication: contentOverviewPublication(contentOverviewTask({ status: "BLOCKED", commitBlocker: { code: "account", message: "登录已失效" } })) });
    expect(screen.getByText("平台草稿")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /小红书.*登录已失效/ }));
    expect(onManagePublish).toHaveBeenCalledWith("xiaohongshu");
  });

  it("localizes production guidance and formats scheduled facts in Shanghai time", () => {
    renderOverview({ t: key => overviewEn[key] });
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(screen.getByText("2026/09/08 09:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View production" })).toBeTruthy();
    expect(screen.queryByText("完成剪辑并导出视频")).toBeNull();
  });

});
