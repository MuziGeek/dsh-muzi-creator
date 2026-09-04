import { describe, expect, it, vi } from "vitest";

import { chipLabel, registerContentTriggers, registerMuziTriggers } from "../src/client/contentTriggers.ts";
import type { KnowledgePageSummary } from "../src/muziTypes.ts";

describe("chipLabel", () => {
  it("keeps short names that fit the composer chip", () => {
    expect(chipLabel("当前详情")).toBe("当前详情");
    expect(chipLabel("当前内容")).toBe("当前内容");
    expect(chipLabel("DeepSeek")).toBe("DeepSeek");
  });

  it("prefixes long titles so the 4em chip is not center-clipped", () => {
    expect(chipLabel("DeepSeek Harness 安装上手和使用心得")).toBe("DeepSee…");
    expect(chipLabel("如何用 AI 视频做有趣的交互动画？")).toBe("如何用…");
  });
});

describe("registerContentTriggers", () => {
  it("registers a /current content slash command", async () => {
    const sources: Array<{ trigger: string; name: string; candidates: Function; codec?: { clipboardText: (ref: string) => string } }> = [];
    registerContentTriggers(
      {
        registerSource(src) {
          sources.push(src);
          return () => undefined;
        },
      },
      async () => {
        throw new Error("unused");
      },
      async () => [],
    );
    const slash = sources.find((src) => src.trigger === "/");
    expect(slash?.name).toBe("oil");
    const items = await slash?.candidates(undefined, { query: "", signal: new AbortController().signal });
    expect(items).toEqual([{
      name: "current content",
      description: "把当前打开的内容交给对话",
    }]);
    expect(slash?.codec?.clipboardText("current")).toBe("/current content");
  });

  it("puts a short chip label on @ picks and keeps the full title on the clipboard", () => {
    const sources: Array<{ trigger: string; onPick: (pick: { candidate: { name: string; description?: string } }) => unknown }> = [];
    registerContentTriggers(
      {
        registerSource(src) {
          sources.push(src);
          return () => undefined;
        },
      },
      async () => {
        throw new Error("unused");
      },
      async () => [],
    );
    const at = sources.find((src) => src.trigger === "@");
    expect(at?.onPick({
      candidate: {
        name: "DeepSeek Harness 安装上手和使用心得",
        description: "2026-08-14_DeepSeek Harness 安装上手和使用心得",
      },
    })).toEqual({
      insert: {
        source: "oil",
        ref: "2026-08-14_DeepSeek Harness 安装上手和使用心得",
        label: "DeepSee…",
        clipboardText: "@DeepSeek Harness 安装上手和使用心得",
      },
    });
  });

  it("serializes a pick to the folder path", async () => {
    const sources: Array<{ codec?: { serialize: (ref: string, signal: AbortSignal) => Promise<string> } }> = [];
    registerContentTriggers(
      {
        registerSource(src) {
          sources.push(src);
          return () => undefined;
        },
      },
      async () => ({
        folderPath: "/tmp/videos/2026-08-10_做海外社媒第一个月经验分享",
      } as never),
      async () => [],
    );
    const path = await sources[0]?.codec?.serialize(
      "2026-08-10_做海外社媒第一个月经验分享",
      new AbortController().signal,
    );
    expect(path).toBe("/tmp/videos/2026-08-10_做海外社媒第一个月经验分享");
  });
});

describe("registerMuziTriggers", () => {
  it("forwards the composer query to formal knowledge search", async () => {
    const sources: Array<{ name: string; candidates: (session: unknown, request: { query: string; signal: AbortSignal }) => Promise<readonly unknown[]> }> = [];
    const queries: string[] = [];
    const topic: KnowledgePageSummary = {
      id: "kw_0123456789abcdef01234567",
      locator: "atlas://wiki/topics/agent.md",
      title: "Agent 主题",
      category: "topics",
      sha256: "0".repeat(64),
      updatedAt: "2026-08-21T00:00:00.000Z",
      excerpt: "主题摘要",
    };
    registerMuziTriggers(
      {
        registerSource(source) {
          sources.push(source);
          return () => undefined;
        },
      },
      async () => { throw new Error("unused"); },
      async () => [],
      async () => { throw new Error("unused"); },
      async (query) => {
        queries.push(query);
        return [topic];
      },
      async () => ({ text: "unused" }),
    );
    const source = sources.find((candidate) => candidate.name === "muzi");
    const signal = new AbortController().signal;
    expect(await source?.candidates(undefined, { query: "", signal })).toEqual([
      { name: "知识 · Agent 主题", description: "knowledge:atlas://wiki/topics/agent.md" },
    ]);
    await source?.candidates(undefined, { query: "Agent", signal });
    expect(queries).toEqual(["", "Agent"]);
  });

  it("serializes a pending reference with its expected content hash", async () => {
    const sources: Array<{ codec?: { serialize: (ref: string, signal: AbortSignal) => Promise<string> } }> = [];
    const calls: Array<{ id: string; expectedSha256?: string }> = [];
    registerMuziTriggers(
      { registerSource(source) { sources.push(source); return () => undefined; } },
      async () => { throw new Error("unused"); },
      async () => [],
      async () => { throw new Error("unused"); },
      async () => [],
      async (id, expectedSha256) => {
        calls.push({ id, ...(expectedSha256 === undefined ? {} : { expectedSha256 }) });
        return { text: "pending source" };
      },
    );
    expect(await sources[0]?.codec?.serialize(
      `pending:pk_${"1".repeat(24)}:${"a".repeat(64)}`,
      new AbortController().signal,
    )).toBe("pending source");
    expect(calls).toEqual([{ id: `pk_${"1".repeat(24)}`, expectedSha256: "a".repeat(64) }]);
  });

  it("serializes a structured inspiration reference through the Host", async () => {
    const sources: Array<{ codec?: { serialize: (ref: string, signal: AbortSignal) => Promise<string> } }> = [];
    const serializeInspiration = vi.fn(async () => "# 灵感研究报告\n\n受限引用内容");
    registerMuziTriggers(
      { registerSource(source) { sources.push(source); return () => undefined; } },
      async () => { throw new Error("unused"); },
      async () => [],
      async () => { throw new Error("unused"); },
      async () => [],
      async () => ({ text: "unused" }),
      serializeInspiration,
    );
    const ref = "inspiration:ii_demo:ir_demo";
    expect(await sources[0]?.codec?.serialize(ref, new AbortController().signal)).toBe("# 灵感研究报告\n\n受限引用内容");
    expect(serializeInspiration).toHaveBeenCalledOnce();
    expect(serializeInspiration).toHaveBeenCalledWith(ref);
  });
});
