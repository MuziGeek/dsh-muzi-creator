import { describe, expect, it } from "vitest";

import { formatKnowledgeDate, knowledgeDisplayMarkdown } from "../src/client/knowledgeDisplay.ts";

describe("knowledgeDisplayMarkdown", () => {
  it("removes leading frontmatter and the duplicate page heading", () => {
    const markdown = [
      "---",
      "tags: [主题]",
      "updated: 2026-08-21",
      "---",
      "",
      "# AI Agent 架构",
      "",
      "> 构建可靠的 Agent 系统。",
    ].join("\n");
    expect(knowledgeDisplayMarkdown(markdown, "AI Agent 架构"))
      .toBe("> 构建可靠的 Agent 系统。");
  });

  it("supports CRLF frontmatter", () => {
    const markdown = "---\r\ntags: [主题]\r\n---\r\n\r\n# 标题\r\n\r\n正文";
    expect(knowledgeDisplayMarkdown(markdown, "标题")).toBe("正文");
  });

  it("keeps Markdown without display-only duplication unchanged", () => {
    const markdown = "# 另一个标题\n\n正文\n";
    expect(knowledgeDisplayMarkdown(markdown, "页面标题")).toBe(markdown);
  });

  it("removes a duplicate heading without requiring frontmatter", () => {
    expect(knowledgeDisplayMarkdown("# 标题\n\n## 第一节\n\n正文", "标题"))
      .toBe("## 第一节\n\n正文");
  });

  it("does not treat YAML-like body content as frontmatter", () => {
    const markdown = "# 标题\n\n配置示例：\n\ntags: [正文]\n\n---\n\n结尾";
    expect(knowledgeDisplayMarkdown(markdown, "其他标题")).toBe(markdown);
  });
});

describe("formatKnowledgeDate", () => {
  it("formats an ISO date and preserves an unknown value", () => {
    expect(formatKnowledgeDate("2026-08-21T08:00:00.000Z")).toBe("2026年8月21日");
    expect(formatKnowledgeDate("待确认")).toBe("待确认");
  });
});
