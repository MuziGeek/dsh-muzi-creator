import { describe, expect, it, vi } from "vitest";
import { registerPublishFlowTools } from "../src/publishFlowTools.ts";
import type { MzCreatorService } from "../src/service.ts";

function fixture() {
  const methods = { addVideoAccount: vi.fn(async () => ({ accounts: [], connections: [] })), pollVideoAccountConnection: vi.fn(async () => ({ accounts: [] })), preparePublishFlow: vi.fn(async () => ({ busy: true })), commitPublishFlow: vi.fn(async () => ({ busy: true })) };
  const tools: Array<{ name: string; execute: (args: { request: unknown }, exec: { signal: AbortSignal }) => Promise<unknown> }> = [];
  registerPublishFlowTools({ tools: { register: tool => { tools.push(tool as unknown as typeof tools[number]); } } }, methods as unknown as MzCreatorService);
  return { methods, call: (name: string, request: unknown) => tools.find(tool => tool.name === name)!.execute({ request }, { signal: new AbortController().signal }) };
}
describe("shared account and publishing Agent tools", () => {
  it("starts a connection without manual identity and rejects missing explicit confirmation", async () => {
    const { methods, call } = fixture();
    await expect(call("muzi_creator_connect_account", { platform: "douyin" })).rejects.toThrow();
    await call("muzi_creator_connect_account", { platform: "douyin", confirmed: true });
    expect(methods.addVideoAccount).toHaveBeenCalledWith({ platform: "douyin", confirmed: true }, expect.any(AbortSignal));
  });
  it("requires a current flow reference and final confirmation before dispatching commits", async () => {
    const { methods, call } = fixture();
    const request = { id: `mc_${"a".repeat(24)}`, flowId: `vpf-${"a".repeat(24)}`, expectedVersion: 6, platforms: ["douyin", "bilibili"] };
    await expect(call("muzi_creator_commit_publish_flow", request)).rejects.toThrow();
    expect(methods.commitPublishFlow).not.toHaveBeenCalled();
    await call("muzi_creator_commit_publish_flow", { ...request, confirmed: true });
    expect(methods.commitPublishFlow).toHaveBeenCalledWith({ ...request, confirmed: true }, expect.any(AbortSignal));
  });
});
