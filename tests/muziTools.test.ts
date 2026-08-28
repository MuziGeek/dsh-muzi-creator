import { describe, expect, it, vi } from "vitest";

import { registerMuziTools } from "../src/muziTools.ts";
import type { OilCreatorService } from "../src/service.ts";

interface CapturedTool {
  name: string;
  execute: (args: Record<string, unknown>, exec: { signal: AbortSignal }) => unknown;
}

function saveTool(content: string) {
  const tools: CapturedTool[] = [];
  const saveMuziDocument = vi.fn(async () => ({ title: "saved" }));
  const service = {
    getMuziProject: vi.fn(async () => ({ content: { mother: content } })),
    saveMuziDocument,
  } as unknown as OilCreatorService;
  registerMuziTools({ tools: { register(tool) { tools.push(tool as unknown as CapturedTool); } } }, service);
  return { tool: tools.find((tool) => tool.name === "muzi_creator_save")!, saveMuziDocument };
}

const SAVE_ARGS = {
  id: `mc_${"1".repeat(24)}`,
  document: "mother",
  text: "new text",
  status: "draft",
  expectedRevision: 1,
  confirmed: true,
};

describe("Muzi Creator save tool", () => {
  it("writes an empty target after the explicit generation flow", async () => {
    const { tool, saveMuziDocument } = saveTool("");
    await expect(tool.execute(SAVE_ARGS, { signal: new AbortController().signal })).resolves.toMatchObject({ title: "saved" });
    expect(saveMuziDocument).toHaveBeenCalledOnce();
  });

  it("requires a separate overwrite flag for a non-empty target", async () => {
    const { tool, saveMuziDocument } = saveTool("existing text");
    await expect(tool.execute(SAVE_ARGS, { signal: new AbortController().signal })).rejects.toThrow("separate overwrite confirmation");
    expect(saveMuziDocument).not.toHaveBeenCalled();
    await expect(tool.execute({ ...SAVE_ARGS, overwriteConfirmed: true }, { signal: new AbortController().signal })).resolves.toMatchObject({ title: "saved" });
  });
});

describe("Muzi Creator video acceptance tools", () => {
  it("forwards a bound prepare-only acceptance request without treating it as publication authority", async () => {
    const tools: CapturedTool[] = [];
    const beginMuziVideoAcceptance = vi.fn(async () => ({
      ok: true,
      sessionId: "vas-0123456789abcdef01234567",
      durableAcceptanceWritten: false,
      ordinaryAuthorizationIssued: false,
    }));
    const service = { beginMuziVideoAcceptance } as unknown as OilCreatorService;
    registerMuziTools({ tools: { register(tool) { tools.push(tool as unknown as CapturedTool); } } }, service);
    const tool = tools.find((item) => item.name === "muzi_creator_begin_video_acceptance")!;
    await expect(tool.execute({
      id: `mc_${"1".repeat(24)}`,
      expectedRevision: 1,
      platform: "xiaohongshu",
      accountProfile: "xiaohongshu-main",
      capability: "prepare_only",
      expectedAccountLabel: "验收账号",
      confirmed: true,
    }, { signal: new AbortController().signal })).resolves.toMatchObject({ durableAcceptanceWritten: false, ordinaryAuthorizationIssued: false });
    expect(beginMuziVideoAcceptance).toHaveBeenCalledWith(expect.objectContaining({
      platform: "xiaohongshu",
      accountProfile: "xiaohongshu-main",
      capability: "prepare_only",
      confirmed: true,
    }), expect.any(AbortSignal));
  });

  it("blocks non-prepare-only finalization in this rollout before it reaches the service", async () => {
    const tools: CapturedTool[] = [];
    const finalizeMuziVideoAcceptance = vi.fn();
    const service = { finalizeMuziVideoAcceptance } as unknown as OilCreatorService;
    registerMuziTools({ tools: { register(tool) { tools.push(tool as unknown as CapturedTool); } } }, service);
    const tool = tools.find((item) => item.name === "muzi_creator_finalize_video_acceptance")!;
    await expect(tool.execute({
      id: `mc_${"1".repeat(24)}`,
      expectedRevision: 1,
      platform: "xiaohongshu",
      capability: "metrics",
      acceptanceSessionId: "vas-0123456789abcdef01234567",
      confirmed: true,
    }, { signal: new AbortController().signal })).rejects.toThrow("prepare_only");
    expect(finalizeMuziVideoAcceptance).not.toHaveBeenCalled();
  });

  it("blocks non-prepare-only acceptance sessions before opening an external page", async () => {
    const tools: CapturedTool[] = [];
    const beginMuziVideoAcceptance = vi.fn();
    const service = { beginMuziVideoAcceptance } as unknown as OilCreatorService;
    registerMuziTools({ tools: { register(tool) { tools.push(tool as unknown as CapturedTool); } } }, service);
    const tool = tools.find((item) => item.name === "muzi_creator_begin_video_acceptance")!;
    await expect(tool.execute({
      id: `mc_${"1".repeat(24)}`,
      expectedRevision: 1,
      platform: "xiaohongshu",
      accountProfile: "xiaohongshu-main",
      capability: "schedule",
      scheduledAt: "2026-09-01T20:00:00+08:00",
      expectedAccountLabel: "验收账号",
      confirmed: true,
    }, { signal: new AbortController().signal })).rejects.toThrow("prepare_only");
    expect(beginMuziVideoAcceptance).not.toHaveBeenCalled();
  });
});
