import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";

import type { InspirationItem, InspirationOverview, InspirationRun, InspirationTask } from "../../inspirationTypes.ts";
import { useInspirationSelection } from "../inspirationSelection.ts";
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { sidebarItemElementId } from "../workbench/sidebarLayoutBridge.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import { IslandButton, IslandInput, IslandSelectableCard, IslandState, IslandTag } from "../ui/IslandControls.tsx";
import { inspirationZh } from "./copy.ts";
import "./Inspiration.css";

type Translator = (key: string) => string;
type InspirationOwner = InspirationItem | InspirationTask;

export interface InspirationSidebarPanelProps {
  resource: ReadonlyResource<InspirationOverview>;
  t: Translator;
  onNew?: () => void;
}

function label(t: Translator, key: string): string {
  const namespaced = `inspiration.${key}` as keyof typeof inspirationZh;
  const value = t(namespaced);
  return value === namespaced ? inspirationZh[namespaced] : value;
}

function formatTime(value: string | null): string {
  return value === null
    ? "—"
    : new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function runFor(overview: InspirationOverview, owner: InspirationOwner): InspirationRun | undefined {
  return overview.recentRuns.find((run) => run.id === owner.latestRunId);
}

function runLabel(t: Translator, run: InspirationRun | undefined): string {
  if (run === undefined) return label(t, "pending");
  const keys: Record<InspirationRun["status"], string> = {
    queued: "queued",
    running: "running",
    ready: "ready",
    partial: "partial",
    failed: "failed",
    needs_attention: "attention",
    cancelled: "cancelled",
    interrupted: "interrupted",
  };
  return label(t, keys[run.status]);
}

function ownerKind(owner: InspirationOwner): "item" | "task" {
  return "name" in owner ? "task" : "item";
}

function ownerTitle(owner: InspirationOwner): string {
  return "name" in owner ? owner.name : owner.spec.topic;
}

function selectionKey(kind: "item" | "task", id: string, runId?: string): string {
  return `${kind}:${id}:${runId ?? "latest"}`;
}

function matches(query: string, owner: InspirationOwner): boolean {
  if (query === "") return true;
  const name = "name" in owner ? owner.name : "";
  return `${name} ${owner.spec.topic} ${owner.spec.objective}`.toLocaleLowerCase().includes(query);
}

function runMatches(query: string, run: InspirationRun): boolean {
  return query === "" || `${run.spec.topic} ${run.spec.objective}`.toLocaleLowerCase().includes(query);
}

function LedgerCard({ overview, owner, t }: { overview: InspirationOverview; owner: InspirationOwner; t: Translator }) {
  const [selection, select] = useInspirationSelection();
  const run = runFor(overview, owner);
  const kind = ownerKind(owner);
  const selected = selection?.kind === kind
    && selection.id === owner.id
    && (selection.runId === undefined || selection.runId === run?.id);
  const timestamp = "name" in owner ? owner.nextRunAt ?? owner.updatedAt : owner.updatedAt;
  const next = run === undefined
    ? { kind, id: owner.id }
    : { kind, id: owner.id, runId: run.id };
  const key = selectionKey(kind, owner.id, run?.id);
  return (
    <IslandSelectableCard
      id={sidebarItemElementId("inspiration", key)}
      className="inspirationLedgerCard"
      selected={selected}
      selectedColor="app-teal"
      onSelect={() => { select(next); }}
      aria-label={`${ownerTitle(owner)} · ${runLabel(t, run)}`}
    >
      <span className="inspirationLedgerTitle">{ownerTitle(owner)}</span>
      {"name" in owner && owner.name !== owner.spec.topic && <span className="inspirationLedgerTopic">{owner.spec.topic}</span>}
      <span className="inspirationLedgerMeta">
        <span>{"name" in owner ? label(t, "daily") : label(t, "manual")}</span>
        <span>{runLabel(t, run)}</span>
      </span>
      <time className="inspirationLedgerTime" dateTime={timestamp}>
        {"name" in owner ? `${label(t, "nextRun")} ${formatTime(timestamp)}` : `${label(t, "updated")} ${formatTime(timestamp)}`}
      </time>
    </IslandSelectableCard>
  );
}

function RunCard({ run, t, restoreId }: { run: InspirationRun; t: Translator; restoreId: boolean }) {
  const [selection, select] = useInspirationSelection();
  const selected = selection?.kind === run.ownerKind && selection.id === run.ownerId && selection.runId === run.id;
  const key = selectionKey(run.ownerKind, run.ownerId, run.id);
  return (
    <IslandSelectableCard
      id={restoreId ? sidebarItemElementId("inspiration", key) : undefined}
      className="inspirationLedgerCard"
      selected={selected}
      selectedColor="app-teal"
      onSelect={() => { select({ kind: run.ownerKind, id: run.ownerId, runId: run.id }); }}
      aria-label={`${run.spec.topic} · ${runLabel(t, run)}`}
    >
      <span className="inspirationLedgerTitle">{run.spec.topic}</span>
      <span className="inspirationLedgerMeta"><span>{runLabel(t, run)}</span><span>{formatTime(run.finishedAt ?? run.queuedAt)}</span></span>
    </IslandSelectableCard>
  );
}

/** Compact searchable ledger list shared with the central inspiration workbench. */
export function InspirationSidebarPanel({ resource, t, onNew }: InspirationSidebarPanelProps) {
  const { data, loading, refreshing, error } = useResourceSnapshot(resource);
  const [query, setQuery] = useState("");
  const load = useCallback(async (force: boolean) => {
    try {
      await resource.load(force);
    } catch {
      // The resource exposes its scoped error state to this panel.
    }
  }, [resource]);
  useEffect(() => { void load(false); }, [load]);
  const filtered = useMemo(() => {
    if (data === null) return { items: [], tasks: [], activeRuns: [], reportRuns: [] };
    const normalized = query.trim().toLocaleLowerCase();
    const latestRunIds = new Set([...data.items, ...data.tasks].map((owner) => owner.latestRunId).filter((id): id is InspirationRun["id"] => id !== null));
    const activeRuns = data.recentRuns.filter((run) => (run.status === "running" || run.status === "queued" || run.status === "needs_attention") && runMatches(normalized, run));
    const activeOwnerIds = new Set(activeRuns.map((run) => run.ownerId));
    return {
      items: data.items.filter((item) => !item.archived && !activeOwnerIds.has(item.id) && matches(normalized, item)),
      tasks: data.tasks.filter((task) => task.state !== "archived" && !activeOwnerIds.has(task.id) && matches(normalized, task)),
      activeRuns,
      reportRuns: data.recentRuns.filter((run) => (run.status === "ready" || run.status === "partial") && !latestRunIds.has(run.id) && runMatches(normalized, run)).slice(0, 5),
    };
  }, [data, query]);
  const visibleCount = filtered.items.length + filtered.tasks.length + filtered.activeRuns.length + filtered.reportRuns.length;
  return (
    <section className="muziPanel inspirationSidebar" aria-label={label(t, "title")} aria-busy={loading || refreshing}>
      <header className="muziSectionHeader inspirationSidebarHeader">
        <span className="muziSectionLabel">{label(t, "title")}</span>
        <div className="muziHeaderActions">
          <IslandButton type="text" size="small" disabled={refreshing} onClick={() => { void load(true); }}>{label(t, "refresh")}</IslandButton>
          <IslandButton type="text" size="small" onClick={onNew}>{label(t, "new")}</IslandButton>
        </div>
      </header>
      <div className="inspirationSidebarBody">
        <IslandInput aria-label={label(t, "search")} value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => { setQuery(event.target.value); }} allowClear placeholder={label(t, "search")} />
        {loading && data === null && <IslandState kind="loading" title={label(t, "loading")} />}
        {error !== null && data === null && <IslandState kind="error" title={label(t, "error")} message={error} action={<IslandButton type="primary" onClick={() => { void load(true); }}>{label(t, "retry")}</IslandButton>} />}
        {data !== null && <div className="inspirationLedgerGroups">
          <LedgerGroup title={label(t, "active")} count={filtered.activeRuns.length}>{filtered.activeRuns.map((run) => <RunCard key={run.id} run={run} t={t} restoreId={false} />)}</LedgerGroup>
          <LedgerGroup title={label(t, "manual")} count={filtered.items.length}>{filtered.items.map((item) => <LedgerCard key={item.id} overview={data} owner={item} t={t} />)}</LedgerGroup>
          <LedgerGroup title={label(t, "daily")} count={filtered.tasks.length}>{filtered.tasks.map((task) => <LedgerCard key={task.id} overview={data} owner={task} t={t} />)}</LedgerGroup>
          <LedgerGroup title={label(t, "recent")} count={filtered.reportRuns.length}>{filtered.reportRuns.map((run) => <RunCard key={run.id} run={run} t={t} restoreId />)}</LedgerGroup>
          {visibleCount === 0 && <IslandState kind="empty" title={label(t, "empty")} />}
        </div>}
      </div>
    </section>
  );
}

function LedgerGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="inspirationLedgerGroup" aria-label={title}><header><h3>{title}</h3><IslandTag size="small" color="brown" variant="soft">{count}</IslandTag></header>{count > 0 && <div>{children}</div>}</section>;
}
