import { describe, expect, it } from "vitest";
import { layoutSummary } from "../src/client/inspiration/summaryLayout.ts";

function restored(text: string): string {
  return layoutSummary(text).map((group) => group.title + group.paragraphs.join("")).join("");
}

describe("summary reading layout", () => {
  it("separates existing topic labels without rewriting the summary", () => {
    const text = "本次总结。(1) 消费科技：发布会内容。(2) 国际新闻：外交动态。共引用12个来源。";
    expect(layoutSummary(text).map((group) => group.title)).toEqual(["", "(1) 消费科技：", "(2) 国际新闻："]);
    expect(restored(text)).toBe(text);
  });

  it("recognizes full-width labels and retains line breaks", () => {
    const text = "（1）科技：第一项。\n\n（2）文化：第二项。";
    expect(layoutSummary(text).map((group) => group.title)).toEqual(["（1）科技：", "（2）文化："]);
    expect(restored(text)).toBe(text);
  });

  it.each([
    "价格(1)99.99元，型号(2)稳定。",
    "摘要。(1) 引用说明：只有一项。",
    "摘要。(1) 科技：内容。(3) 新闻：内容。",
    "原文含网址 https://example.com/a?q=1.2 与版本 v1.2.3。",
    "",
  ])("keeps ambiguous labels and plain prose as prose: %s", (text) => {
    expect(layoutSummary(text).every((group) => group.title === "")).toBe(true);
    expect(restored(text)).toBe(text);
  });

  it("breaks long prose at punctuation outside quotes and parentheses", () => {
    const quoted = `“${"引文".repeat(45)}；仍在引号内。”`;
    const text = `第一行。\n\n${quoted}正文结束。${"后续说明".repeat(25)}；收尾。`;
    const groups = layoutSummary(text);
    expect(groups[0]!.paragraphs.some((paragraph) => paragraph.includes(quoted))).toBe(true);
    expect(groups[0]!.paragraphs.length).toBeGreaterThan(2);
    expect(restored(text)).toBe(text);
  });
});
