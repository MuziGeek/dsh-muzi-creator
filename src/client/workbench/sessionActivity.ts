export interface SessionActivitySummary {
  running: boolean;
  pendingInteraction?: string;
}

export interface SessionActivitySnapshot {
  ids: readonly string[];
  byId: Readonly<Record<string, SessionActivitySummary>>;
}

export type SessionActivityBadge =
  | { kind: "pending"; count: number; label: string }
  | { kind: "running"; count: number; label: string }
  | null;

/** Pending interactions take precedence over background activity. */
export function deriveSessionActivityBadge(snapshot: SessionActivitySnapshot): SessionActivityBadge {
  let pending = 0;
  let running = 0;
  for (const id of snapshot.ids) {
    const session = snapshot.byId[id];
    if (session === undefined) continue;
    if (session.pendingInteraction !== undefined) pending += 1;
    if (session.running) running += 1;
  }
  if (pending > 0) return { kind: "pending", count: pending, label: `待处理 ${String(pending)}` };
  if (running > 0) return { kind: "running", count: running, label: `运行中 ${String(running)}` };
  return null;
}
