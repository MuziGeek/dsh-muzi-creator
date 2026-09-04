import { randomUUID } from "node:crypto";

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
import { InspirationScheduler } from "./inspirationScheduler.ts";
import { registerInspirationTools } from "./inspirationTools.ts";
import { externalActionApprovalReason, externalActionKind } from "./externalActions.ts";

export const name = "dsh-muzi-creator";
export const inject = ["settings", "subprocess"];
export { Config };
export type { Config as ConfigType } from "./config.ts";

interface InspirationHostAgent {
  id: string;
  ctx: { tools: {
    schemas: () => Array<{ name: string }>;
    restrict: (filter: { allow: string[] }) => () => void;
  } };
  whenIdle: () => Promise<void>;
}

interface InspirationHostSessions {
  create: (request: { cwd: string }) => Promise<{ sessionId: string }>;
  resolveAgent: (sessionId: string) => Promise<{ agent: InspirationHostAgent } | { error: unknown }>;
  rename: (request: { sessionId: string; title: string }) => Promise<unknown>;
  prompt: (request: {
    requestId: string;
    sessionId: string;
    mode: "queue";
    content: Array<{ type: "text"; text: string }>;
    clientTimeZone: string;
  }, signal: AbortSignal) => Promise<unknown>;
  cancel: (request: { sessionId: string }) => Promise<unknown> | unknown;
}

interface InspirationHostTools {
  guard: (guard: (execution: Readonly<ToolExecution>) => string | undefined) => () => void;
}

function managedRuntime(ctx: Context) {
  const host = ctx as unknown as { sessionController: InspirationHostSessions; tools: InspirationHostTools };
  const agents = new Map<string, InspirationHostAgent>();
  const resolve = async (sessionId: string): Promise<InspirationHostAgent | null> => {
    const found = await host.sessionController.resolveAgent(sessionId);
    if ("error" in found) return null;
    agents.set(found.agent.id, found.agent);
    return found.agent;
  };
  return {
    sessionController: {
      async create({ workingDirectory }: { title: string; workingDirectory: string }) {
        const created = await host.sessionController.create({ cwd: workingDirectory });
        const agent = await resolve(created.sessionId);
        if (agent === null) throw new Error("新建的灵感研究会话无法激活");
        return { id: created.sessionId, agentId: agent.id };
      },
      async resolve(sessionId: string) {
        const agent = await resolve(sessionId);
        return agent === null ? null : { id: sessionId, agentId: agent.id };
      },
      async rename(sessionId: string, title: string) {
        await host.sessionController.rename({ sessionId, title });
      },
      async prompt(sessionId: string, prompt: string) {
        await host.sessionController.prompt({
          requestId: `inspiration-${randomUUID()}`,
          sessionId,
          mode: "queue",
          content: [{ type: "text", text: prompt }],
          clientTimeZone: "Asia/Shanghai",
        }, new AbortController().signal);
      },
      async cancel(sessionId: string) {
        await host.sessionController.cancel({ sessionId });
      },
      async waitForIdle(sessionId: string) {
        const agent = agents.get(sessionId) ?? await resolve(sessionId);
        if (agent === null) throw new Error("灵感研究会话已丢失");
        await agent.whenIdle();
      },
    },
    agents: {
      restrict(agentId: string, allowed: (toolName: string) => boolean) {
        const agent = agents.get(agentId);
        if (agent === undefined) throw new Error("灵感研究 Agent 尚未激活");
        const allow = agent.ctx.tools.schemas().map((schema) => schema.name).filter(allowed);
        return agent.ctx.tools.restrict({ allow });
      },
      installGlobalGuard(guard: (input: { agent?: { id?: string }; toolName?: string }) => boolean) {
        return host.tools.guard((execution) => guard({
          ...(execution.agent === undefined ? {} : { agent: { id: String(execution.agent.id) } }),
          toolName: execution.name,
        }) ? undefined : "灵感研究 Agent 只能使用公开网页检索、知识只读和报告提交工具。");
      },
    },
    logger: ctx.logger,
  };
}

export function apply(ctx: Context, config: Config): void {
  registerCreatorSettingsNamespace(ctx.settings);
  const service = new OilCreatorService(ctx, config);
  ctx.inject(["tools"], (toolsCtx) => {
    registerCreatorTools(toolsCtx as never, service);
    registerMuziTools(toolsCtx as never, service);
    registerInspirationTools(toolsCtx as never, service.inspiration);
  });
  ctx.on("tools/pre-execute", async (request: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    if (service.inspiration.isManagedAgent(String(request.agent?.id ?? "")) && !service.inspiration.isAllowedTool(request.name)) {
      return { kind: "deny" as const, reason: "灵感研究 Agent 只能使用公开网页检索、知识只读和报告提交工具。" };
    }
    const action = externalActionKind(request.name);
    if (action === null) return next();
    if (!service.externalActionsEnabled) {
      return { kind: "deny" as const, reason: "Muzi Creator 外部同步与发布默认关闭。请先在插件配置中显式启用。" };
    }
    return { kind: "ask" as const, reason: externalActionApprovalReason(action) };
  });
  ctx.inject(["systemPrompt"], (promptCtx) => {
    registerLibraryPrompt(promptCtx as never, service);
  });
  ctx.inject(["skills"], (skillsCtx) => {
    registerCreatorWorkbenchSkill(skillsCtx as never);
  });
  ctx.inject(["sessionController", "tools"], (runtimeCtx) => {
    runtimeCtx.effect(async () => {
      await service.inspiration.attachRuntime(managedRuntime(runtimeCtx));
      const scheduler = new InspirationScheduler(service.inspiration);
      await scheduler.start();
      return () => {
        scheduler.stop();
        service.inspiration.dispose();
      };
    }, "muzi-inspiration: runtime and scheduler");
  });
}
