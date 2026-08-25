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
