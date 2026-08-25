import type { Context } from "@deepseek-ai/cordis";
import type { PreToolDecision, ToolExecution } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-subprocess";

import { Config } from "./config.ts";
import { registerCreatorWorkbenchSkill } from "./creatorSkill.ts";
import { registerLibraryPrompt } from "./libraryPrompt.ts";
import { OilCreatorService } from "./service.ts";
import { registerCreatorSettingsNamespace } from "./settingsHost.ts";
import { registerCreatorTools } from "./tools.ts";
import { registerMuziTools } from "./muziTools.ts";

export const name = "dsh-muzi-creator";
export const inject = ["settings", "subprocess"];
export { Config };
export type { Config as ConfigType } from "./config.ts";

export function apply(ctx: Context, config: Config): void {
  registerCreatorSettingsNamespace(ctx.settings);
  const service = new OilCreatorService(ctx, config);
  ctx.inject(["tools"], (toolsCtx) => {
    registerCreatorTools(toolsCtx as never, service);
    registerMuziTools(toolsCtx as never, service);
  });
  ctx.on("tools/pre-execute", async (request: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    const external = request.name === "oil_sync_publish" || request.name?.includes("upload") === true
      || request.name?.includes("publish") === true;
    if (!external) return next();
    if (!service.externalActionsEnabled) {
      return { kind: "deny" as const, reason: "Muzi Creator 外部同步与发布默认关闭。请先在插件配置中显式启用。" };
    }
    return { kind: "ask" as const, reason: "该操作会访问外部平台。请核对平台、内容与账号后逐次批准。" };
  });
  ctx.inject(["systemPrompt"], (promptCtx) => {
    registerLibraryPrompt(promptCtx as never, service);
  });
  ctx.inject(["skills"], (skillsCtx) => {
    registerCreatorWorkbenchSkill(skillsCtx as never);
  });
}
