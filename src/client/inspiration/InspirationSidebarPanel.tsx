import type { InspirationViewFace } from "../face.ts";
import { DeleteCardButton } from "../DeleteCardButton.tsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  InspirationItem,
  InspirationOverview,
  InspirationRun,
  InspirationTask,
} from "../../inspirationTypes.ts";
import { getInspirationSelection, useInspirationSelection } from "../inspirationSelection.ts";
import { sidebarItemElementId } from "../workbench/sidebarLayoutBridge.ts";
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import {
  IslandButton,
  IslandSelectableCard,
  IslandState,
  IslandTag,
} from "../ui/IslandControls.tsx";
import { PanelSectionHeader } from "../sidebar/PanelSectionHeader.tsx";
import { WorkbenchIcon } from "../ui/WorkbenchIcon.tsx";
import { inspirationZh } from "./copy.ts";
import "./Inspiration.css";

type Translator = (key: string) => string;
type Owner = InspirationItem | InspirationTask;
type Entry =
  | { kind: "run"; run: InspirationRun }
  | { kind: "owner"; owner: Owner };
export interface InspirationSidebarPanelProps {
  face: InspirationViewFace;
  resource: ReadonlyResource<InspirationOverview>;
  t: Translator;
}
function label(t: Translator, key: string): string {
  const namespaced = `inspiration.${key}` as keyof typeof inspirationZh;
  const value = t(namespaced);
  return value === namespaced ? inspirationZh[namespaced] : value;
}
function status(t: Translator, value: InspirationRun["status"]): string {
  return label(
    t,
    (
      {
        queued: "queued",
        running: "running",
        ready: "ready",
        partial: "partial",
        failed: "failed",
        needs_attention: "attention",
        cancelled: "cancelled",
        interrupted: "interrupted",
      } as const
    )[value],
  );
}
function time(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
function entryDate(entry: Entry): string {
  return entry.kind === "run"
    ? (entry.run.finishedAt ?? entry.run.queuedAt)
    : entry.owner.updatedAt;
}
function title(entry: Entry): string {
  return entry.kind === "run"
    ? entry.run.spec.topic || "热点"
    : "name" in entry.owner
      ? entry.owner.name
      : entry.owner.spec.topic;
}
function entryMatches(entry: Entry, query: string): boolean {
  return (
    query === "" ||
    `${title(entry)} ${entry.kind === "run" ? entry.run.spec.objective : entry.owner.spec.objective}`
      .toLocaleLowerCase()
      .includes(query)
  );
}

function HistoryCard({ entry, t, face, resource }: { entry: Entry; t: Translator; face: InspirationViewFace; resource: ReadonlyResource<InspirationOverview> }) {
  const [selection, select] = useInspirationSelection();
  const isRun = entry.kind === "run";
  const kind = isRun
    ? entry.run.ownerKind
    : "name" in entry.owner
      ? "task"
      : "item";
  const id = isRun ? entry.run.ownerId : entry.owner.id;
  const runId = isRun ? entry.run.id : undefined;
  const key = `${kind}:${id}:${runId ?? "latest"}`;
  const selected =
    selection?.kind === kind &&
    selection.id === id &&
    (selection.runId ?? undefined) === runId;
  return (
    <div className="cardWithActions">
    <IslandSelectableCard
      id={sidebarItemElementId("inspiration", key)}
      className="inspirationLedgerCard"
      selected={selected}
      selectedColor="app-teal"
      onSelect={() => {
        select({
          kind,
          id: id as never,
          ...(runId === undefined ? {} : { runId: runId as never }),
        });
      }}
      aria-label={`${title(entry)} · ${isRun ? status(t, entry.run.status) : label(t, "draft")} `}
    >
      <span className="inspirationLedgerTitle">{title(entry)}</span>
      <span className="inspirationLedgerMeta">
        <span>{isRun ? status(t, entry.run.status) : label(t, "draft")}</span>
        <time dateTime={entryDate(entry)}>{time(entryDate(entry))}</time>
      </span>
    </IslandSelectableCard>
    <DeleteCardButton title={title(entry)} t={t}
      disabled={isRun && (entry.run.status === "queued" || entry.run.status === "running")}
      onDelete={async () => {
        await face.deleteRecord({ kind, id: id as never, ...(runId === undefined ? {} : { runId }), expectedRevision: isRun ? entry.run.revision : entry.owner.revision, confirmed: true });
        const current = getInspirationSelection();
        if (current?.kind === kind && current.id === id && (runId === undefined || current.runId === runId || current.runId === undefined)) select(null);
        await resource.refreshAfterMutation();
      }} />
    </div>
  );
}

/** One chronological history keeps legacy owners reachable without duplicating any run. */
export function InspirationSidebarPanel({
  face,
  resource,
  t,
}: InspirationSidebarPanelProps) {
  const { data, loading, refreshing, error } = useResourceSnapshot(resource);
  const [query, setQuery] = useState("");
  const load = useCallback(
    async (force: boolean) => {
      try {
        await resource.load(force);
      } catch {
        /* Scoped resource state renders the recovery UI. */
      }
    },
    [resource],
  );
  useEffect(() => {
    void load(false);
  }, [load]);
  const history = useMemo(() => {
    if (data === null) return [];
    const represented = new Set(
      data.recentRuns.map((run) => `${run.ownerKind}:${run.ownerId}`),
    );
    const legacy = [
      ...data.items.filter((item) => !item.archived),
      ...data.tasks.filter((task) => task.state !== "archived"),
    ]
      .filter(
        (owner) =>
          !represented.has(`${"name" in owner ? "task" : "item"}:${owner.id}`),
      )
      .map((owner): Entry => ({ kind: "owner", owner }));
    return [
      ...data.recentRuns.map((run): Entry => ({ kind: "run", run })),
      ...legacy,
    ]
      .filter((entry) => entryMatches(entry, query.trim().toLocaleLowerCase()))
      .sort((left, right) => entryDate(right).localeCompare(entryDate(left)));
  }, [data, query]);
  return (
    <section
      className="muziPanel inspirationSidebar"
      aria-label={label(t, "title")}
      aria-busy={loading || refreshing}
    >
      <PanelSectionHeader
        label={label(t, "title")}
        query={query}
        searchLabel={label(t, "historySearch")}
        searchName="inspiration-history-search"
        searchPlaceholder={label(t, "historySearch")}
        searchButtonText={label(t, "search")}
        clearSearchLabel={label(t, "clearHistorySearch")}
        clearSearchText={label(t, "clear")}
        onQueryChange={setQuery}
        refreshLabel={label(t, "refresh")}
        refreshText={label(t, "refresh")}
        refreshing={refreshing}
        onRefresh={() => { void load(true); }}
      />
      <div className="inspirationSidebarBody">
        {loading && data === null && (
          <IslandState kind="loading" title={label(t, "loading")} />
        )}
        {error !== null && data === null && (
          <IslandState
            kind="error"
            title={label(t, "error")}
            message={error}
            action={
              <IslandButton icon={<WorkbenchIcon name="refresh" />}
                type="primary"
                onClick={() => {
                  void load(true);
                }}
              >
                {label(t, "retry")}
              </IslandButton>
            }
          />
        )}
        {data !== null && (
          <section
            className="inspirationLedgerGroup"
            aria-label={label(t, "history")}
          >
            <header>
              <h3>{label(t, "history")}</h3>
              <IslandTag size="small" color="brown" variant="soft">
                {history.length}
              </IslandTag>
            </header>
            {history.length > 0 ? (
              <div>
                {history.map((entry) => (
                  <HistoryCard
                    key={
                      entry.kind === "run"
                        ? entry.run.id
                        : `${"name" in entry.owner ? "task" : "item"}:${entry.owner.id}`
                    }
                    face={face}
                    resource={resource}
                    entry={entry}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <IslandState kind="empty" title={label(t, "empty")} />
            )}
          </section>
        )}
      </div>
    </section>
  );
}
