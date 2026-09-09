import { WorkbenchIcon } from "../ui/WorkbenchIcon.tsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import type {
  InspirationDetail,
  InspirationOverview,
  InspirationReference,
  InspirationResearchSpec,
  InspirationRun,
  InspirationTimeRange,
} from "../../inspirationTypes.ts";
import type { InspirationViewFace } from "../face.ts";
import { useInspirationSelection } from "../inspirationSelection.ts";
import {
  IslandButton,
  IslandInput,
  IslandSelect,
  IslandState,
  IslandTabs,
  IslandTag,
  type IslandTabItem,
} from "../ui/IslandControls.tsx";
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import { inspirationZh } from "./copy.ts";
import { layoutSummary } from "./summaryLayout.ts";
import "./Inspiration.css";

type Translator = (key: string) => string;
type SearchMode = "topic" | "trend";
export interface InspirationPromotionRequest {
  title: string;
  sourceRunId: string;
  reference: InspirationReference;
}
export interface InspirationWorkbenchProps {
  face: InspirationViewFace;
  resource: ReadonlyResource<InspirationOverview>;
  openSession: (sessionId: string) => void;
  promote: (
    reference: InspirationReference,
    request: InspirationPromotionRequest,
  ) => void | Promise<void>;
  t: Translator;
}

function text(t: Translator, key: string): string {
  const namespaced = `inspiration.${key}` as keyof typeof inspirationZh;
  const value = t(namespaced);
  return value === namespaced ? inspirationZh[namespaced] : value;
}
function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
function statusText(t: Translator, status: InspirationRun["status"]): string {
  return text(
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
    )[status],
  );
}
function formatTime(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }).format(date);
}
function rangeFor(
  kind: Exclude<InspirationTimeRange["kind"], "custom">,
): InspirationTimeRange {
  return { kind };
}
function researchSpec(
  mode: SearchMode,
  topic: string,
  range: InspirationTimeRange,
): InspirationResearchSpec {
  return {
    mode,
    topic: topic.trim(),
    objective: "",
    questions: [],
    sourceLanguage: "zh-en",
    preferredDomains: [],
    excludedDomains: [],
    depth: "standard",
    ...(mode === "trend" ? { timeRange: range } : {}),
  };
}

/** Compact one-off topic and bounded hotspot research surface. */
export function InspirationWorkbench({
  face,
  resource,
  openSession,
  promote,
  t,
}: InspirationWorkbenchProps) {
  const { data, loading, error } = useResourceSnapshot(resource);
  const [selection, select] = useInspirationSelection();
  const [mode, setMode] = useState<SearchMode>("topic");
  const [topic, setTopic] = useState("");
  const [rangeKind, setRangeKind] =
    useState<InspirationTimeRange["kind"]>("24h");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detail, setDetail] = useState<InspirationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, retryDetail] = useState(0);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const selectionRef = useRef(selection);
  const markedRead = useRef(new Set<string>());
  selectionRef.current = selection;
  const refresh = useCallback(async () => {
    await resource.load(true);
  }, [resource]);
  useEffect(() => {
    void resource.load(false).catch(() => undefined);
  }, [resource]);

  useEffect(() => {
    if (selection === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let current = true;
    const requested = selection;
    setDetail(null);
    setDetailError(null);
    void face
      .get({
        kind: requested.kind,
        id: requested.id as never,
        ...(requested.runId === undefined
          ? {}
          : { runId: requested.runId as never }),
      })
      .then(
        (next) => {
          if (!current || selectionRef.current !== requested) return;
          if (
            requested.runId !== undefined &&
            next.run?.id !== requested.runId
          ) {
            select(null);
            return;
          }
          setDetail(next);
        },
        (cause: unknown) => {
          if (current && selectionRef.current === requested)
            setDetailError(errorText(cause));
        },
      );
    return () => {
      current = false;
    };
  }, [data?.revision, detailAttempt, face, select, selection]);

  useEffect(() => {
    const run = detail?.run;
    if (
      run === null ||
      run === undefined ||
      !run.unread ||
      (run.status !== "ready" && run.status !== "partial") ||
      markedRead.current.has(run.id)
    )
      return;
    markedRead.current.add(run.id);
    void face.markRead(run.id, run.revision).then(
      (updated) => {
        if (selectionRef.current?.runId === run.id)
          setDetail((present) =>
            present?.run?.id === run.id
              ? { ...present, run: updated }
              : present,
          );
        void resource.load(true).catch(() => undefined);
      },
      () => {
        markedRead.current.delete(run.id);
      },
    );
  }, [detail?.run, face, resource]);

  const perform = async (
    action: () => Promise<void>,
    success?: string,
  ): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    try {
      await action();
      if (success !== undefined) {
        setNotice(success);
        setNoticeError(false);
      }
    } catch (cause) {
      setNotice(errorText(cause));
      setNoticeError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const selectedRange = (): InspirationTimeRange => {
    if (rangeKind !== "custom") return rangeFor(rangeKind);
    if (startDate === "" || endDate === "")
      throw new Error(text(t, "dateRequired"));
    if (startDate > endDate) throw new Error(text(t, "dateOrder"));
    return { kind: "custom", startDate, endDate };
  };
  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    await perform(async () => {
      const spec = researchSpec(
        mode,
        topic,
        mode === "trend" ? selectedRange() : rangeFor("24h"),
      );
      if (mode === "topic" && spec.topic === "")
        throw new Error(text(t, "topicRequired"));
      const result = await face.startResearch({ spec });
      await refresh();
      select({ kind: "item", id: result.item.id, runId: result.run.id });
    });
  };
  const rerun = async (selected: InspirationDetail): Promise<void> => {
    await perform(async () => {
      const result = await face.startResearch({
        spec: selected.run?.spec ?? selected.owner.spec,
      });
      await refresh();
      select({ kind: "item", id: result.item.id, runId: result.run.id });
    });
  };
  const stop = async (run: InspirationRun): Promise<void> => {
    await perform(
      async () => {
        const stopped = await face.stopRun(run.id, run.revision);
        if (selectionRef.current?.runId === run.id)
          setDetail((present) =>
            present?.run?.id === run.id
              ? { ...present, run: stopped }
              : present,
          );
        await refresh();
      },
      text(t, "stopped"),
    );
  };
  const copy = async (run: InspirationRun): Promise<void> => {
    await perform(
      async () => {
        const reference = await face.serializeReference({
          runId: run.id,
          ...(run.reportSha256 === null
            ? {}
            : { expectedSha256: run.reportSha256 }),
        });
        await navigator.clipboard.writeText(reference.text);
      },
      text(t, "copied"),
    );
  };
  const promoteRun = async (
    run: InspirationRun,
    title: string,
  ): Promise<void> => {
    await perform(async () => {
      const reference = await face.serializeReference({
        runId: run.id,
        ...(run.reportSha256 === null
          ? {}
          : { expectedSha256: run.reportSha256 }),
      });
      await promote(reference, { title, sourceRunId: run.id, reference });
    });
  };
  const active = useMemo(
    () =>
      data?.recentRuns.filter(
        (run) => run.status === "running" || run.status === "queued",
      ) ?? [],
    [data],
  );
  if (selection !== null)
    return (
      <div
        className="inspirationWorkbench"
        data-plugin="dsh-muzi-creator"
        data-surface="inspiration-workbench"
      >
        <section className="inspirationDetail" aria-live="polite">
          {detailError !== null && (
            <IslandState
              kind="error"
              title={text(t, "error")}
              message={detailError}
              action={
                <IslandButton icon={<WorkbenchIcon name="refresh" />}
                  onClick={() => retryDetail((attempt) => attempt + 1)}
                >
                  {text(t, "retry")}
                </IslandButton>
              }
            />
          )}
          {detail === null && detailError === null && (
            <IslandState kind="loading" title={text(t, "loading")} />
          )}
          {detail !== null && (
            <DetailView
              detail={detail}
              busy={busy}
              t={t}
              openSession={openSession}
              onRerun={() => {
                void rerun(detail);
              }}
              onStop={(run) => {
                void stop(run);
              }}
              onCopy={(run) => {
                void copy(run);
              }}
              onOpenObsidian={(run) => {
                void perform(async () => {
                  await face.openReportInObsidian(run.id);
                });
              }}
              onPromote={(run, title) => {
                void promoteRun(run, title);
              }}
              onOpenRun={(run) =>
                select({ kind: run.ownerKind, id: run.ownerId, runId: run.id })
              }
            />
          )}
          {notice !== "" && (
            <p
              className="inspirationLive"
              role={noticeError ? "alert" : "status"}
            >
              {notice}
            </p>
          )}
        </section>
      </div>
    );
  const searchForm = (
    <form
      className="inspirationSearchForm"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        void submit(event);
      }}
    >
      <label>
        {text(t, mode === "topic" ? "topic" : "optionalTopic")}
        <IslandInput
          maxLength={200}
          value={topic}
          placeholder={
            mode === "topic"
              ? text(t, "topicPlaceholder")
              : text(t, "hotspotPlaceholder")
          }
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setTopic(event.target.value);
          }}
        />
      </label>
      {mode === "trend" && (
        <fieldset className="inspirationRange">
          <legend className="muziIconLabel"><WorkbenchIcon name="calendar" />{text(t, "range")}</legend>
          <IslandSelect
            value={rangeKind}
            onChange={(value: string) => {
              setRangeKind(value as InspirationTimeRange["kind"]);
            }}
            options={["24h", "7d", "30d", "custom"].map((kind) => ({
              key: kind,
              label: text(t, `range${kind}`),
            }))}
          />
          {rangeKind === "custom" && (
            <div className="inspirationDateRange">
              <label>
                {text(t, "startDate")}
                <IslandInput
                  type="date"
                  value={startDate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setStartDate(event.target.value);
                  }}
                />
              </label>
              <label>
                {text(t, "endDate")}
                <IslandInput
                  type="date"
                  value={endDate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setEndDate(event.target.value);
                  }}
                />
              </label>
            </div>
          )}
          {rangeKind === "custom" && <small>{text(t, "dateZone")}</small>}
        </fieldset>
      )}
      <div className="inspirationCaptureActions">
        <IslandButton
          htmlType="submit"
          icon={<WorkbenchIcon name={mode === "topic" ? "search" : "hotspots"} />}
          type="primary"
          loading={busy}
          disabled={busy || (mode === "topic" && !topic.trim())}
        >
          {text(t, mode === "topic" ? "search" : "getHotspots")}
        </IslandButton>
      </div>
    </form>
  );
  const tabItems: IslandTabItem[] = [
    { key: "topic", label: <span className="muziIconLabel"><WorkbenchIcon name="search" />{text(t, "searchTopic")}</span>, children: searchForm },
    { key: "trend", label: <span className="muziIconLabel"><WorkbenchIcon name="hotspots" />{text(t, "hotspots")}</span>, children: searchForm },
  ];
  return (
    <div
      className="inspirationWorkbench"
      data-plugin="dsh-muzi-creator"
      data-surface="inspiration-workbench"
    >
      <section className="inspirationCapture">
        <IslandTabs
          className="inspirationModeTabs"
          aria-label={text(t, "researchMode")}
          activeKey={mode}
          onChange={(value: string) => {
            setMode(value as SearchMode);
          }}
          leafAnimation={false}
          items={tabItems}
        />

        {active.length > 0 && (
          <div className="inspirationActiveRuns" aria-label={text(t, "active")}>
            <h3>{text(t, "active")}</h3>
            {active.map((run) => (
              <div key={run.id}>
                <span>{run.spec.topic || text(t, "hotspots")}</span>
                <IslandTag size="small" color="app-teal" variant="soft">
                  {statusText(t, run.status)}
                </IslandTag>
                <IslandButton icon={<WorkbenchIcon name="stop" />}
                  type="text"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    void stop(run);
                  }}
                >
                  {text(t, "stop")}
                </IslandButton>
              </div>
            ))}
          </div>
        )}
        {notice !== "" && (
          <p
            className="inspirationLive"
            role={noticeError ? "alert" : "status"}
          >
            {notice}
          </p>
        )}
      </section>
      {error !== null && (
        <IslandState
          kind="error"
          title={text(t, "error")}
          message={error}
          action={
            <IslandButton icon={<WorkbenchIcon name="refresh" />}
              type="primary"
              onClick={() => {
                void refresh().catch(() => undefined);
              }}
            >
              {text(t, "retry")}
            </IslandButton>
          }
        />
      )}
      {loading && data === null && (
        <IslandState kind="loading" title={text(t, "loading")} />
      )}
    </div>
  );
}

function integrityMessage(
  detail: InspirationDetail,
  t: Translator,
): string | null {
  if (detail.reportIntegrity === "missing") return text(t, "integrityMissing");
  if (detail.reportIntegrity === "changed") return text(t, "integrityChanged");
  if (
    detail.reportIntegrity === "unavailable" &&
    detail.run?.reportPath != null
  )
    return text(t, "integrityUnavailable");
  return null;
}
function DetailView({
  detail,
  busy,
  t,
  openSession,
  onRerun,
  onStop,
  onCopy,
  onOpenObsidian,
  onPromote,
  onOpenRun,
}: {
  detail: InspirationDetail;
  busy: boolean;
  t: Translator;
  openSession: (sessionId: string) => void;
  onRerun: () => void;
  onStop: (run: InspirationRun) => void;
  onCopy: (run: InspirationRun) => void;
  onOpenObsidian: (run: InspirationRun) => void;
  onPromote: (run: InspirationRun, title: string) => void;
  onOpenRun: (run: InspirationRun) => void;
}) {
  const run = detail.run;
  const report = detail.report;
  const integrity = integrityMessage(detail, t);
  const title =
    run?.spec.topic || detail.owner.spec.topic || text(t, "hotspots");
  return (
    <>
      <header>
        <div className="inspirationReportHeading">
          <h2 id="inspiration-detail-title" tabIndex={-1}>
            {title}
          </h2>
          <div className="inspirationReportMeta">
            {run !== null && run !== undefined && (
              <IslandTag size="small" color="app-teal" variant="soft">
                {statusText(t, run.status)}
              </IslandTag>
            )}
            {run?.timeWindow !== undefined && (
              <p className="inspirationTimeWindow">
                {text(t, "timeWindow")}：{formatTime(run.timeWindow.startAt)} –{" "}
                {formatTime(run.timeWindow.endAt)}
              </p>
            )}
          </div>
        </div>
      </header>
      {integrity !== null && (
        <IslandState
          kind="error"
          title={text(t, "details")}
          message={integrity}
        />
      )}
      {report !== null && detail.reportIntegrity === "ok" ? (
        <ReportBody report={report} t={t} />
      ) : (
        integrity === null && (
          <IslandState
            kind="info"
            title={
              run === null ? text(t, "emptyReport") : statusText(t, run.status)
            }
            message={
              run?.error?.code === "REPORT_MISSING"
                ? text(t, "reportMissing")
                : (run?.error?.message ?? "")
            }
          />
        )
      )}
      <div className="inspirationDetailActions">
        {run !== null &&
          run !== undefined &&
          (run.status === "running" || run.status === "queued") && (
            <IslandButton icon={<WorkbenchIcon name="stop" />}
              size="small"
              type="default"
              disabled={busy}
              onClick={() => {
                onStop(run);
              }}
            >
              {text(t, "stop")}
            </IslandButton>
          )}
        {run !== null &&
          run !== undefined &&
          report !== null &&
          detail.reportIntegrity === "ok" && (
            <IslandButton icon={<WorkbenchIcon name="copy" />}
              size="small"
              type="default"
              disabled={busy}
              onClick={() => {
                onCopy(run);
              }}
            >
              {text(t, "copy")}
            </IslandButton>
          )}
        <IslandButton
              size="small"
          type="default"
          disabled={
            busy || run?.status === "running" || run?.status === "queued"
          }
          icon={<WorkbenchIcon name="search" />}
          onClick={onRerun}
        >
          {text(t, "rerun")}
        </IslandButton>
            {run?.sessionId !== null && run?.sessionId !== undefined && (
              <IslandButton
              size="small"
                type="default"
                disabled={busy}
                icon={<WorkbenchIcon name="sessions" />}
                onClick={() => {
                  openSession(run.sessionId!);
                }}
              >
                {text(t, "openSession")}
              </IslandButton>
            )}
            {run !== null &&
              run !== undefined &&
              report !== null &&
              detail.reportIntegrity === "ok" && (
                <IslandButton
              size="small"
                  type="default"
                  disabled={busy}
                  icon={<WorkbenchIcon name="knowledge" />}
                  onClick={() => {
                    onOpenObsidian(run);
                  }}
                >
                  {text(t, "obsidian")}
                </IslandButton>
              )}
            {run !== null &&
              run !== undefined &&
              report !== null &&
              detail.reportIntegrity === "ok" && (
                <IslandButton
              size="small"
                  type="default"
                  disabled={busy}
                  icon={<WorkbenchIcon name="content" />}
                  onClick={() => {
                    onPromote(run, title);
                  }}
                >
                  {text(t, "promote")}
                </IslandButton>
              )}
      </div>
      {detail.previousRuns.length > 0 && (
        <div className="inspirationHistoryActions">
            <IslandSelect
              aria-label={text(t, "earlierReports")}
              placeholder={text(t, "earlierReports")}
              value=""
              options={detail.previousRuns.map((previous) => ({
                key: previous.id,
                label: `${formatTime(previous.queuedAt)} · ${statusText(t, previous.status)}`,
              }))}
              onChange={(id: string) => {
                const previous = detail.previousRuns.find(
                  (candidate) => candidate.id === id,
                );
                if (previous !== undefined) onOpenRun(previous);
              }}
            />
        </div>
      )}
    </>
  );
}
function ReportBody({
  report,
  t,
}: {
  report: NonNullable<InspirationDetail["report"]>;
  t: Translator;
}) {
  const sources = new Map(
    report.sources.map((source, index) => [source.id, { ...source, number: index + 1 }]),
  );
  const hasMaterials =
    report.findings.length > 0 ||
    report.disagreements.length > 0 ||
    (report.sources.length > 0 && report.angles.length > 0);
  return (
    <article className="inspirationReport">
      {report.partialReason !== null && (
        <aside className="inspirationPartialReason">
          <strong>{text(t, "partial")}</strong>
          <p>{report.partialReason}</p>
        </aside>
      )}
      <section className="inspirationSummary">
        <h3>{text(t, "summary")}</h3>
        <div className="inspirationSummaryContent">
          {layoutSummary(report.summary).map((group, index) => (
            <div className={group.title ? "inspirationSummaryGroup" : "inspirationSummaryIntro"} key={index}>
              {group.title && <h4>{group.title}</h4>}
              {group.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>{text(t, "findings")}</h3>
        {!hasMaterials && <p>{text(t, "noMaterials")}</p>}
        <EvidenceList values={report.findings} sources={sources} t={t} />
        {report.disagreements.length > 0 && (
          <section>
            <h4>{text(t, "disagreements")}</h4>
            <EvidenceList
              values={report.disagreements}
              sources={sources}
              t={t}
              showEvidence
            />
          </section>
        )}
        {report.sources.length > 0 && report.angles.length > 0 && (
          <TextList title={text(t, "angles")} values={report.angles} />
        )}
      </section>
      <section>
        <h3 className="muziIconLabel"><WorkbenchIcon name="sources" />{text(t, "sources")}</h3>
        {report.sources.length === 0 && <p>{text(t, "noSources")}</p>}
        <ol className="inspirationSources">
          {report.sources.map((source, index) => (
            <li key={source.id}>
              <span className="inspirationSourceNumber">[{index + 1}]</span>
              <div className="inspirationSourceBody">
                <a href={source.url} target="_blank" rel="noreferrer"><WorkbenchIcon name="external-link" />
                  {source.title}
                </a>
                <small>
                  {source.domain} · {text(t, "published")}：
                  {source.publishedAt === null
                    ? text(t, "unknown")
                    : formatTime(source.publishedAt)}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
function EvidenceList({
  values,
  sources,
  t,
  showEvidence = false,
}: {
  values: NonNullable<InspirationDetail["report"]>["findings"];
  sources: Map<
    string,
    NonNullable<InspirationDetail["report"]>["sources"][number] & { number: number }
  >;
  t: Translator;
  showEvidence?: boolean;
}) {
  if (values.length === 0) return null;
  return (
    <ol className="inspirationEvidenceList">
      {values.map((value, index) => (
        <li key={`${String(index)}-${value.text}`}>
          <p className="inspirationReportText">{value.text}</p>
          {showEvidence && (
            <span className="inspirationEvidenceStatus">
              {text(t, `evidence_${value.evidence}`)}
            </span>
          )}
          {value.sourceIds.length > 0 && (
            <span className="inspirationCitations">
              <span>{text(t, "sources")}</span>
              {value.sourceIds.map((sourceId) => {
                const source = sources.get(sourceId);
                return source === undefined ? (
                  <span key={sourceId}>[{sourceId}]</span>
                ) : (
                  <a
                    key={sourceId}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${text(t, "sources")} ${source.number}：${source.title}`}
                    title={source.title}
                  >
                    [{source.number}]
                  </a>
                );
              })}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
function TextList({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h4>{title}</h4>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  );
}
