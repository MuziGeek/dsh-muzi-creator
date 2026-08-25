import { describe, expect, it } from "vitest";

import type { KnowledgePageSummary } from "../src/muziTypes.ts";
import {
  formatKnowledgeDate,
  knowledgeDisplayMarkdown,
  knowledgeLinkedMarkdown,
  resolveKnowledgeWikiMention,
} from "../src/client/knowledgeDisplay.ts";

const RELATED: KnowledgePageSummary[] = [
  {
    id: "kw_agent_runtime",
    locator: "atlas://wiki/entities/agent-runtime.md",
    title: "Agent Runtime",
    category: "entities",
    sha256: "a".repeat(64),
    updatedAt: "2026-08-21T08:00:00.000Z",
    excerpt: "运行时实体",
  },
  {
    id: "kw_claude_source",
    locator: "atlas://wiki/sources/2026-04-15-Claude-Code源码拆解.md",
    title: "Claude Code 源码拆解：从启动到多 Agent 扩展层",
    category: "sources",
    sha256: "b".repeat(64),
    updatedAt: "2026-08-20T08:00:00.000Z",
    excerpt: "七层架构",
  },
];

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

describe("knowledgeLinkedMarkdown", () => {
  it("promotes resolved key concepts and related pages to Wiki mention controls", () => {
    const markdown = [
      "## 关键概念",
      "",
      "- [[Agent Runtime]] — 运行时是 Agent 的命脉",
      "- [[Missing]] — 尚未建立正式页面",
      "",
      "## 相关页面",
      "",
      "- [[entities/agent-runtime]]",
      "- [[2026-04-15-Claude-Code源码拆解|Claude Code 源码拆解]]",
    ].join("\n");
    expect(knowledgeLinkedMarkdown(markdown, RELATED)).toBe([
      "## 关键概念",
      "",
      "- `[[Agent Runtime]]` — 运行时是 Agent 的命脉",
      "- [[Missing]] — 尚未建立正式页面",
      "",
      "## 相关页面",
      "",
      "- `[[entities/agent-runtime]]`",
      "- `[[2026-04-15-Claude-Code源码拆解|Claude Code 源码拆解]]`",
    ].join("\n"));
  });

  it("preserves Wiki-like text inside inline and fenced code", () => {
    const markdown = [
      "正文 [[Agent Runtime]] 与 `[[Agent Runtime]]`",
      "```md",
      "[[Agent Runtime]]",
      "```",
      "~~~md",
      "[[Agent Runtime]]",
      "~~~",
    ].join("\n");
    expect(knowledgeLinkedMarkdown(markdown, RELATED)).toBe([
      "正文 `[[Agent Runtime]]` 与 `[[Agent Runtime]]`",
      "```md",
      "[[Agent Runtime]]",
      "```",
      "~~~md",
      "[[Agent Runtime]]",
      "~~~",
    ].join("\n"));
  });

  it("preserves CRLF and resolves headings and aliases to the approved page", () => {
    const markdown = "[[Agent Runtime#生命周期|运行时]]\r\n[[Missing]]";
    expect(knowledgeLinkedMarkdown(markdown, RELATED))
      .toBe("`[[Agent Runtime#生命周期|运行时]]`\r\n[[Missing]]");
    expect(resolveKnowledgeWikiMention("[[Agent Runtime#生命周期|运行时]]", RELATED)?.locator)
      .toBe("atlas://wiki/entities/agent-runtime.md");
    expect(resolveKnowledgeWikiMention("[[Missing]]", RELATED)).toBeNull();
    expect(resolveKnowledgeWikiMention("Agent Runtime", RELATED)).toBeNull();
  });
});

describe("formatKnowledgeDate", () => {
  it("formats an ISO date and preserves an unknown value", () => {
    expect(formatKnowledgeDate("2026-08-21T08:00:00.000Z")).toBe("2026年8月21日");
    expect(formatKnowledgeDate("待确认")).toBe("待确认");
  });
});
