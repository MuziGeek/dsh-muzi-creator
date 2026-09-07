import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import type {
  InspirationItem,
  InspirationOverview,
  InspirationRun,
  InspirationTask,
} from "../../inspirationTypes.ts";
import { useInspirationSelection } from "../inspirationSelection.ts";
import { sidebarItemElementId } from "../workbench/sidebarLayoutBridge.ts";
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import {
  IslandButton,
  IslandInput,
  IslandSelectableCard,
  IslandState,
  IslandTag,
} from "../ui/IslandControls.tsx";
import { inspirationZh } from "./copy.ts";
import "./Inspiration.css";

type Translator = (key: string) => string;
type Owner = InspirationItem | InspirationTask;
type Entry =
  | { kind: "run"; run: InspirationRun }
  | { kind: "owner"; owner: Owner };
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

function HistoryCard({ entry, t }: { entry: Entry; t: Translator }) {
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
  );
}

/** One chronological history keeps legacy owners reachable without duplicating any run. */
export function InspirationSidebarPanel({
  resource,
  t,
  onNew,
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
      <header className="muziSectionHeader inspirationSidebarHeader">
        <span className="muziSectionLabel">{label(t, "title")}</span>
        <div className="muziHeaderActions">
          <IslandButton
            type="text"
            size="small"
            disabled={refreshing}
            onClick={() => {
              void load(true);
            }}
          >
            {label(t, "refresh")}
          </IslandButton>
          <IslandButton type="text" size="small" onClick={onNew}>
            {label(t, "new")}
          </IslandButton>
        </div>
      </header>
      <div className="inspirationSidebarBody">
        <IslandInput
          aria-label={label(t, "historySearch")}
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value);
          }}
          allowClear
          placeholder={label(t, "historySearch")}
        />
        {loading && data === null && (
          <IslandState kind="loading" title={label(t, "loading")} />
        )}
        {error !== null && data === null && (
          <IslandState
            kind="error"
            title={label(t, "error")}
            message={error}
            action={
              <IslandButton
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
