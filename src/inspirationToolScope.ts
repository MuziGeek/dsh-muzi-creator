/** Tool services exposed by a live inspiration agent. */
export interface InspirationToolAgent {
  ctx: { tools: {
    schemas: (scope: object) => Array<{ name: string }>;
    restrict: (filter: { allow: string[] }) => () => void;
  } };
}

/**
 * Retain approved tools inherited from the host and the agent's preset.
 * The agent object is the registry's scope identity; its id or scoped context
 * cannot substitute for it. Execution guards still protect agent-local tools.
 * @param agent - live agent whose inherited tools are restricted.
 * @param allowed - the research role's tool-name policy.
 * @returns disposer restoring the inherited tool view.
 */
export function restrictInspirationTools(agent: InspirationToolAgent, allowed: (name: string) => boolean): () => void {
  const allow = agent.ctx.tools.schemas(agent).map((schema) => schema.name).filter(allowed);
  return agent.ctx.tools.restrict({ allow });
}
