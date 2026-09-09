import { Context } from "@deepseek-ai/cordis";
import { bindScopeParent, createScope, type Scope } from "@deepseek-ai/dsh-scope";
import ToolRuntime, { type ToolDefinition } from "@deepseek-ai/dsh-tools";
import { describe, expect, it } from "vitest";

import { restrictInspirationTools } from "../src/inspirationToolScope.ts";

function tool(name: string): ToolDefinition {
  return {
    name, description: name, parameters: { type: "object", properties: {} },
    output: { schema: { type: "string" }, render: () => [{ type: "text", text: "ok" }] },
    execute: async () => "ok",
  };
}

async function scope(ctx: Context, key: object, parent?: object): Promise<Scope> {
  if (parent !== undefined) bindScopeParent(key, parent);
  let created!: Scope;
  await ctx.plugin(Object.assign((inner: Context) => { created = createScope(inner, key); }, { inject: ["tools"] }));
  return created;
}

describe("inspiration tool scope", () => {
  it("retains preset search and fetch while excluding host and preset mutation tools", async () => {
    const ctx = new Context();
    ctx.provide("systemPrompt", { tools: () => () => {}, section: () => () => {} });
    await ctx.plugin(ToolRuntime);
    try {
      ctx.tools.register(tool("muzi_knowledge_read"));
      ctx.tools.register(tool("muzi_inspiration_submit_report"));
      ctx.tools.register(tool("muzi_creator_save"));
      const presetKey = {};
      const preset = await scope(ctx, presetKey);
      for (const name of ["web_search", "web_fetch", "pwsh", "write", "subagent"]) preset.ctx.tools.register(tool(name));
      const agent = { id: "research", ctx };
      agent.ctx = (await scope(ctx, agent, presetKey)).ctx;
      const other = { id: "ordinary", ctx };
      other.ctx = (await scope(ctx, other, presetKey)).ctx;
      const allowed = new Set(["web_search", "web_fetch", "muzi_knowledge_read", "muzi_inspiration_submit_report"]);
      expect(ctx.tools.schemas().map((item) => item.name)).not.toContain("web_search");
      const dispose = restrictInspirationTools(agent, (name) => allowed.has(name));
      expect(ctx.tools.schemas(agent).map((item) => item.name).sort()).toEqual([...allowed].sort());
      expect(ctx.tools.get("web_search", agent)).toBeDefined();
      expect(ctx.tools.get("pwsh", agent)).toBeUndefined();
      expect(ctx.tools.get("write", agent)).toBeUndefined();
      expect(ctx.tools.get("muzi_creator_save", agent)).toBeUndefined();
      expect(ctx.tools.get("pwsh", other)).toBeDefined();
      dispose();
      expect(ctx.tools.get("pwsh", agent)).toBeDefined();
      restrictInspirationTools(agent, (name) => allowed.has(name));
      expect(ctx.tools.get("web_search", agent)).toBeDefined();
      expect(ctx.tools.get("pwsh", agent)).toBeUndefined();
    } finally {
      ctx.registry.delete(ToolRuntime);
    }
  });
});
