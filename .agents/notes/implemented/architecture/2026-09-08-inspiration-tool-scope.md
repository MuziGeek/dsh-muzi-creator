# Inspiration tool scope

The Web host mounts search and fetch in an inherited agent-preset scope. `tools.schemas()` without an explicit scope returns global registrations, even when the service is accessed through `agent.ctx`. Materializing the research allowlist from that view removes inherited web tools and produces `UNKNOWN_TOOL` before a provider can run.

`restrictInspirationTools` enumerates `schemas(agent)` with the live agent object, then applies the research role's existing allowlist. The execution guard remains authoritative for agent-local registrations, which registry restrictions do not mask. Other agents retain their own tools. Restrictions are disposed and rebuilt when managed sessions are restored; failed research requires a manual retry.

The regression test uses the real Cordis tool registry and a parent preset scope with search, fetch, shell, file-write and delegation tools. It checks research visibility, an unaffected ordinary agent, disposal and reapplication. Provider execution is verified separately against the installed Desktop runtime.
