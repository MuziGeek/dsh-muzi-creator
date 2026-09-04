import { describe, expect, it, vi } from "vitest";

import { stageSessionHandoff } from "../src/client/sessionHandoff.ts";

function fixture(hasLlmWiki = true) {
  let draft = "";
  let draftRev = 0;
  const insertReference = vi.fn(() => true);
  const notify = vi.fn();
  const submit = vi.fn();
  const create = vi.fn(async () => "fresh-session");
  const reveal = vi.fn();
  return {
    draft: () => draft,
    insertReference,
    notify,
    submit,
    create,
    reveal,
    dependencies: {
      create,
      inputFor: () => ({
        setDraft(text: string) { draft = text; draftRev += 1; },
        insertReference,
        notify,
        submit,
        state: { getSnapshot: () => ({ draft, draftRev }) },
      }),
      reveal,
      hasLlmWiki: vi.fn(async () => hasLlmWiki),
    },
  };
}

describe("session handoff", () => {
  it("always creates a fresh draft, inserts a structured reference, and never sends", async () => {
    const item = fixture();
    await stageSessionHandoff(item.dependencies, {
      prompt: "/llm-wiki 处理文件",
      label: "待消化文件",
      ref: `pending:pk_${"1".repeat(24)}:${"a".repeat(64)}`,
      requireLlmWiki: true,
    });
    expect(item.create).toHaveBeenCalledOnce();
    expect(item.draft()).toBe("/llm-wiki 处理文件\n\n@待消化文件");
    expect(item.insertReference).toHaveBeenCalledWith(
      expect.objectContaining({ source: "muzi", ref: expect.stringMatching(/^pending:/) }),
      {
        start: "/llm-wiki 处理文件\n\n".length,
        end: "/llm-wiki 处理文件\n\n@待消化文件".length,
        draftRev: 1,
      },
    );
    expect(item.reveal).toHaveBeenCalledWith("fresh-session");
    expect(item.submit).not.toHaveBeenCalled();
  });

  it("submits exactly once when a content proposal explicitly requests auto-submit", async () => {
    const item = fixture();
    await stageSessionHandoff(item.dependencies, {
      prompt: "基于灵感报告提出 3 个内容方向",
      label: "AI 创作趋势",
      ref: "inspiration:ii_demo:ir_demo",
      autoSubmit: true,
    });
    expect(item.submit).toHaveBeenCalledOnce();
    expect(item.submit).toHaveBeenCalledWith("queue");
    expect(item.reveal).toHaveBeenCalledWith("fresh-session");
  });

  it("shows the current knowledge title while retaining its stable locator", async () => {
    const item = fixture();
    await stageSessionHandoff(item.dependencies, {
      prompt: "讨论当前知识",
      label: "AI Agent 架构",
      ref: "knowledge:atlas://wiki/topics/ai-agent-architecture.md",
    });
    expect(item.draft()).toBe("讨论当前知识\n\n@AI Agent 架构");
    expect(item.insertReference).toHaveBeenCalledWith(
      {
        source: "muzi",
        ref: "knowledge:atlas://wiki/topics/ai-agent-architecture.md",
        label: "AI Agent 架构",
        clipboardText: "@AI Agent 架构",
      },
      expect.objectContaining({ draftRev: 1 }),
    );
  });

  it("opens an empty session with an actionable notice when llm-wiki is unavailable", async () => {
    const item = fixture(false);
    await stageSessionHandoff(item.dependencies, {
      prompt: "/llm-wiki 处理文件",
      label: "待消化文件",
      ref: "pending:id:hash",
      requireLlmWiki: true,
    });
    expect(item.draft()).toBe("");
    expect(item.insertReference).not.toHaveBeenCalled();
    expect(item.notify).toHaveBeenCalledWith("error", expect.stringContaining("未安装 llm-wiki"));
    expect(item.reveal).toHaveBeenCalledWith("fresh-session");
  });
});
