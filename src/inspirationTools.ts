import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";

import { InspirationService } from "./inspirationService.ts";
import type { InspirationReportSubmission } from "./inspirationTypes.ts";

interface ToolsContext {
  tools: { register: (tool: ToolDefinition) => void };
}

function present(rawInput: unknown): { card: "generic"; title: string; kind: "other"; rawInput: unknown } {
  return { card: "generic", title: "Submit inspiration report", kind: "other", rawInput };
}

function agentIdOf(exec: unknown): string | undefined {
  const value = exec as { agent?: { id?: unknown } };
  return typeof value.agent?.id === "string" ? value.agent.id : undefined;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

/** Register the only write tool granted to managed inspiration research agents. */
export function registerInspirationTools(ctx: ToolsContext, service: InspirationService): void {
  ctx.tools.register(defineTool({
    name: "muzi_inspiration_submit_report",
    description: "Submit the final structured inspiration report for the active managed research run. Do not put report content in chat text.",
    parameters: {
      runId: { type: "string", required: true, description: "Active inspiration run id." },
      status: { type: "string", required: true, enum: ["ready", "partial"], description: "Whether the report is complete." },
      partialReason: { type: "string", description: "Required explanation when status is partial." },
      summary: { type: "string", required: true, description: "Concise research summary." },
      findings: { type: "array", required: true, items: { type: "json" }, description: "Evidence-backed findings." },
      disagreements: { type: "array", required: true, items: { type: "json" }, description: "Contested or uncertain evidence." },
      angles: { type: "array", required: true, items: { type: "string" }, description: "Creator angles." },
      nextSteps: { type: "array", required: true, items: { type: "string" }, description: "Suggested follow-ups." },
      sources: { type: "array", required: true, items: { type: "json" }, description: "Cited web or knowledge sources." },
    },
    output: {
      schema: { type: "json" } as const,
      render: () => [{ type: "text", text: "Inspiration report submitted." }],
    },
    presentCall: present,
    execute: async (args, exec) => asJson(await service.submitReport(agentIdOf(exec), args as InspirationReportSubmission)),
  }));
}
