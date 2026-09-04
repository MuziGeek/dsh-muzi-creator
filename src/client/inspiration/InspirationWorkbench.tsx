import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type {
  InspirationDetail,
  InspirationOverview,
  InspirationReference,
  InspirationResearchSpec,
  InspirationRun,
  InspirationTask,
} from "../../inspirationTypes.ts";
import type { InspirationViewFace } from "../face.ts";
import { useInspirationSelection } from "../inspirationSelection.ts";
import {
  IslandButton,
  IslandCard,
  IslandDrawer,
  IslandInput,
  IslandRadio,
  IslandSelect,
  IslandState,
  IslandTag,
  IslandTextarea,
} from "../ui/IslandControls.tsx";
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import { inspirationZh } from "./copy.ts";
import "./Inspiration.css";

type Translator = (key: string) => string;

export interface InspirationPromotionRequest {
  title: string;
  sourceRunId: string;
  reference: InspirationReference;
}

export interface InspirationWorkbenchProps {
  face: InspirationViewFace;
  resource: ReadonlyResource<InspirationOverview>;
  openSession: (sessionId: string) => void;
  promote: (reference: InspirationReference, request: InspirationPromotionRequest) => void | Promise<void>;
  t: Translator;
}

const initialSpec: InspirationResearchSpec = {
  topic: "",
  objective: "",
  questions: [],
  mode: "topic",
  sourceLanguage: "zh-en",
  preferredDomains: [],
  excludedDomains: [],
  depth: "standard",
};

function text(t: Translator, key: string): string {
  const namespaced = `inspiration.${key}` as keyof typeof inspirationZh;
  const value = t(namespaced);
  return value === namespaced ? inspirationZh[namespaced] : value;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function splitDomains(value: string): string[] {
  return [...new Set(value.split(/[\s,，]+/).map((domain) => domain.trim().toLowerCase()).filter(Boolean))];
}

function normalizeSpec(spec: InspirationResearchSpec, preferred: string, excluded: string): InspirationResearchSpec {
  const topic = spec.topic.trim();
  if (topic.length < 1 || topic.length > 200) throw new Error("创作主题需为 1–200 个字符");
  const preferredDomains = splitDomains(preferred);
  const excludedDomains = splitDomains(excluded);
  if (preferredDomains.length > 20 || excludedDomains.length > 20) throw new Error("偏好域名和排除域名分别最多 20 个");
  return {
    ...spec,
    topic,
    objective: spec.objective.trim(),
    questions: spec.questions.map((question) => question.trim()).filter(Boolean),
    preferredDomains,
    excludedDomains,
  };
}

function statusText(t: Translator, status: InspirationRun["status"]): string {
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
  return text(t, keys[status]);
}

function isTask(value: InspirationDetail["owner"]): value is InspirationTask {
  return "name" in value;
}

function formatTime(value: string | null, fallback: string): string {
  if (value === null) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? fallback
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function modeOptions(t: Translator) {
  return [
    { value: "topic", label: text(t, "modeTopic") },
    { value: "trend", label: text(t, "modeTrend") },
  ];
}

function languageOptions(t: Translator) {
  return [
    { key: "zh-en", label: text(t, "languageBoth") },
    { key: "zh", label: text(t, "languageZh") },
    { key: "en", label: text(t, "languageEn") },
  ];
}

function depthOptions(t: Translator) {
  return [
    { key: "quick", label: text(t, "depthQuick") },
    { key: "standard", label: text(t, "depthStandard") },
    { key: "deep", label: text(t, "depthDeep") },
  ];
}

function QuestionsEditor({ spec, t, onSpec }: {
  spec: InspirationResearchSpec;
  t: Translator;
  onSpec: (next: InspirationResearchSpec) => void;
}) {
  return <fieldset className="inspirationQuestions">
    <legend>{text(t, "questions")}</legend>
    {spec.questions.map((question, index) => <div className="inspirationQuestionRow" key={String(index)}>
      <IslandInput
        maxLength={300}
        aria-label={`${text(t, "questions")} ${String(index + 1)}`}
        value={question}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const questions = [...spec.questions];
          questions[index] = event.target.value;
          onSpec({ ...spec, questions });
        }}
      />
      <IslandButton
        type="text"
        size="small"
        aria-label={`${text(t, "removeQuestion")} ${String(index + 1)}`}
        onClick={() => { onSpec({ ...spec, questions: spec.questions.filter((_, candidate) => candidate !== index) }); }}
      >
        {text(t, "removeQuestion")}
      </IslandButton>
    </div>)}
    {spec.questions.length < 8 && <IslandButton type="text" size="small" onClick={() => { onSpec({ ...spec, questions: [...spec.questions, ""] }); }}>
      {text(t, "addQuestion")} ({String(spec.questions.length)}/8)
    </IslandButton>}
  </fieldset>;
}

function AdvancedFields({ spec, preferred, excluded, t, onSpec, onPreferred, onExcluded }: {
  spec: InspirationResearchSpec;
  preferred: string;
  excluded: string;
  t: Translator;
  onSpec: (next: InspirationResearchSpec) => void;
  onPreferred: (next: string) => void;
  onExcluded: (next: string) => void;
}) {
  return <div className="inspirationAdvanced">
    <label>{text(t, "mode")}<IslandRadio value={spec.mode} onChange={(mode: string | number) => { onSpec({ ...spec, mode: mode as InspirationResearchSpec["mode"] }); }} options={modeOptions(t)} /></label>
    <label>{text(t, "language")}<IslandSelect value={spec.sourceLanguage} onChange={(sourceLanguage: string) => { onSpec({ ...spec, sourceLanguage: sourceLanguage as InspirationResearchSpec["sourceLanguage"] }); }} options={languageOptions(t)} /></label>
    <label>{text(t, "depth")}<IslandSelect value={spec.depth} onChange={(depth: string) => { onSpec({ ...spec, depth: depth as InspirationResearchSpec["depth"] }); }} options={depthOptions(t)} /></label>
    <label>{text(t, "preferred")}<IslandInput value={preferred} onChange={(event: ChangeEvent<HTMLInputElement>) => { onPreferred(event.target.value); }} /></label>
    <label>{text(t, "excluded")}<IslandInput value={excluded} onChange={(event: ChangeEvent<HTMLInputElement>) => { onExcluded(event.target.value); }} /></label>
  </div>;
}

/** Central capture, report and daily-task interface for the persistent inspiration ledger. */
export function InspirationWorkbench({ face, resource, openSession, promote, t }: InspirationWorkbenchProps) {
  const { data, loading, error } = useResourceSnapshot(resource);
  const [selection, select] = useInspirationSelection();
  const [spec, setSpec] = useState(initialSpec);
  const [advanced, setAdvanced] = useState(false);
  const [preferred, setPreferred] = useState("");
  const [excluded, setExcluded] = useState("");
  const [detail, setDetail] = useState<InspirationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [task, setTask] = useState<InspirationTask | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const markedRead = useRef(new Set<string>());
  const refresh = useCallback(async () => { await resource.load(true); }, [resource]);

  useEffect(() => { void resource.load(false).catch(() => undefined); }, [resource]);

  useEffect(() => {
    if (selection === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    void face.get({ kind: selection.kind, id: selection.id as never, ...(selection.runId === undefined ? {} : { runId: selection.runId as never }) }).then((next) => {
      if (cancelled) return;
      if (selection.runId !== undefined && next.run?.id !== selection.runId) {
        select(null);
        return;
      }
      setDetail(next);
    }, (cause: unknown) => {
      if (!cancelled) setDetailError(errorText(cause));
    });
    return () => { cancelled = true; };
  }, [data?.revision, face, selection]);

  useEffect(() => {
    const run = detail?.run;
    if (run === null || run === undefined || !run.unread || (run.status !== "ready" && run.status !== "partial") || markedRead.current.has(run.id)) return;
    markedRead.current.add(run.id);
    void face.markRead(run.id, run.revision).then((updated) => {
      setDetail((current) => current === null ? current : { ...current, run: updated });
      void resource.load(true).catch(() => undefined);
    }, () => { markedRead.current.delete(run.id); });
  }, [detail?.run, face, resource]);

  const runAction = async (action: () => Promise<void>, success?: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
      if (success !== undefined) setNotice(success);
    } catch (cause) {
      setNotice(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const saveSpec = async (start: boolean): Promise<void> => {
    await runAction(async () => {
      const next = normalizeSpec(spec, preferred, excluded);
      if (start) {
        const result = await face.startResearch({ spec: next });
        select({ kind: "item", id: result.item.id, runId: result.run.id });
      } else {
        const item = await face.saveDraft({ spec: next });
        select({ kind: "item", id: item.id });
      }
      await refresh();
    }, text(t, start ? "started" : "saved"));
  };

  const rerun = async (selected: InspirationDetail): Promise<void> => {
    await runAction(async () => {
      if (isTask(selected.owner)) {
        const run = await face.runTaskNow(selected.owner.id, selected.owner.revision);
        select({ kind: "task", id: selected.owner.id, runId: run.id });
      } else {
        const result = await face.startResearch({ id: selected.owner.id, expectedRevision: selected.owner.revision, spec: selected.owner.spec });
        select({ kind: "item", id: result.item.id, runId: result.run.id });
      }
      await refresh();
    }, text(t, "started"));
  };

  const stop = async (run: InspirationRun): Promise<void> => {
    await runAction(async () => {
      const stopped = await face.stopRun(run.id, run.revision);
      setDetail((current) => current === null ? current : { ...current, run: stopped });
      await refresh();
    }, text(t, "stopped"));
  };

  const active = useMemo(
    () => data?.recentRuns.filter((run) => run.status === "running" || run.status === "queued" || run.status === "needs_attention") ?? [],
    [data],
  );

  const selectedTask = detail !== null && isTask(detail.owner) ? detail.owner : null;
  if (selection !== null) {
    return <div className="inspirationWorkbench" data-plugin="dsh-muzi-creator" data-surface="inspiration-workbench">
      <section className="inspirationDetail" aria-live="polite">
        {detailError !== null && <IslandState kind="error" title={text(t, "error")} message={detailError} />}
        {detail === null && detailError === null && <IslandState kind="loading" title={text(t, "loading")} />}
        {detail !== null && <DetailView
          detail={detail}
          busy={busy}
          t={t}
          openSession={openSession}
          onRerun={() => { void rerun(detail); }}
          onStop={(run) => { void stop(run); }}
          onOpenTask={() => { setTask(selectedTask); setTaskOpen(true); }}
          onOpenObsidian={(run) => { void runAction(async () => { await face.openReportInObsidian(run.id); }); }}
          onPromote={(run) => { void runAction(async () => {
            const reference = await face.serializeReference({ runId: run.id, ...(run.reportSha256 === null ? {} : { expectedSha256: run.reportSha256 }) });
            await promote(reference, { title: detail.owner.spec.topic, sourceRunId: run.id, reference });
          }); }}
        />}
        {notice !== "" && <p className="inspirationLive" role="status" aria-live="polite">{notice}</p>}
      </section>
      <DailyTaskDrawer open={taskOpen} task={selectedTask} initialSpec={detail?.owner.spec ?? initialSpec} face={face} t={t} close={() => { setTaskOpen(false); }} refresh={refresh} />
    </div>;
  }

  return <div className="inspirationWorkbench" data-plugin="dsh-muzi-creator" data-surface="inspiration-workbench">
    <section className="inspirationCapture">
      <header><div><h2>{text(t, "captureTitle")}</h2><p>{text(t, "capture")}</p></div></header>
      <div className="inspirationCaptureGrid inspirationTopicRow"><label>{text(t, "topic")}<IslandInput maxLength={200} value={spec.topic} onChange={(event: ChangeEvent<HTMLInputElement>) => { setSpec({ ...spec, topic: event.target.value }); }} /></label><label>{text(t, "objective")}<IslandTextarea rows={3} maxLength={1000} value={spec.objective} onChange={(event) => { setSpec({ ...spec, objective: event.target.value }); }} /></label></div>
      <QuestionsEditor spec={spec} t={t} onSpec={setSpec} />
      <IslandButton type="text" size="small" aria-expanded={advanced} onClick={() => { setAdvanced(!advanced); }}>{text(t, "advanced")}</IslandButton>
      {advanced && <AdvancedFields spec={spec} preferred={preferred} excluded={excluded} t={t} onSpec={setSpec} onPreferred={setPreferred} onExcluded={setExcluded} />}
      <div className="inspirationCaptureActions"><IslandButton type="primary" loading={busy} disabled={busy || !spec.topic.trim()} onClick={() => { void saveSpec(true); }}>{text(t, "start")}</IslandButton><IslandButton type="default" disabled={busy || !spec.topic.trim()} onClick={() => { void saveSpec(false); }}>{text(t, "save")}</IslandButton><IslandButton type="text" disabled={busy} onClick={() => { setTask(null); setTaskOpen(true); }}>{text(t, "task")}</IslandButton></div>
      {notice !== "" && <p className="inspirationLive" role="status" aria-live="polite">{notice}</p>}
    </section>
    {error !== null && <IslandState kind="error" title={text(t, "error")} message={error} action={<IslandButton type="primary" onClick={() => { void refresh().catch(() => undefined); }}>{text(t, "retry")}</IslandButton>} />}
    {loading && data === null && <IslandState kind="loading" title={text(t, "loading")} />}
    {data !== null && <div className="inspirationBoard">
      <LedgerSection title={text(t, "active")}><RunList runs={active} t={t} empty={text(t, "noActive")} onSelect={(run) => { select({ kind: run.ownerKind, id: run.ownerId, runId: run.id }); }} /></LedgerSection>
      <LedgerSection title={text(t, "reports")}><RunList runs={data.recentRuns.filter((run) => run.status === "ready" || run.status === "partial").slice(0, 8)} t={t} empty={text(t, "noReports")} onSelect={(run) => { select({ kind: run.ownerKind, id: run.ownerId, runId: run.id }); }} /></LedgerSection>
      <LedgerSection className="inspirationTaskLedger" title={text(t, "daily")}><TaskList tasks={data.tasks.filter((candidate) => candidate.state !== "archived")} t={t} empty={text(t, "noTasks")} onSelect={(selected) => { select({ kind: "task", id: selected.id, ...(selected.latestRunId === null ? {} : { runId: selected.latestRunId }) }); }} onEdit={(selected) => { setTask(selected); setTaskOpen(true); }} /></LedgerSection>
    </div>}
    <DailyTaskDrawer open={taskOpen} task={task} initialSpec={spec} face={face} t={t} close={() => { setTaskOpen(false); }} refresh={refresh} />
  </div>;
}

function LedgerSection({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <section className={className}><h2>{title}</h2>{children}</section>;
}

function RunList({ runs, t, empty, onSelect }: { runs: InspirationRun[]; t: Translator; empty: string; onSelect: (run: InspirationRun) => void }) {
  if (runs.length === 0) return <p className="inspirationEmptyText">{empty}</p>;
  return <div className="inspirationRunList">{runs.map((run) => <IslandCard key={run.id} className="inspirationRunCard" role="button" tabIndex={0} onClick={() => { onSelect(run); }} onKeyDown={(event: KeyboardEvent<HTMLElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(run); } }}><strong>{run.spec.topic}</strong><span>{statusText(t, run.status)}</span></IslandCard>)}</div>;
}

function TaskList({ tasks, t, empty, onSelect, onEdit }: { tasks: InspirationTask[]; t: Translator; empty: string; onSelect: (task: InspirationTask) => void; onEdit: (task: InspirationTask) => void }) {
  if (tasks.length === 0) return <p className="inspirationEmptyText">{empty}</p>;
  return <div className="inspirationRunList">{tasks.map((task) => <IslandCard key={task.id} className="inspirationRunCard inspirationTaskCard"><button type="button" onClick={() => { onSelect(task); }}><strong>{task.name}</strong><span>{task.state === "enabled" ? `${text(t, "nextRun")} ${formatTime(task.nextRunAt, text(t, "unknown"))}` : text(t, task.state)}</span></button><IslandButton type="text" size="small" onClick={() => { onEdit(task); }}>{text(t, "edit")}</IslandButton></IslandCard>)}</div>;
}

function integrityMessage(detail: InspirationDetail, t: Translator): string | null {
  if (detail.reportIntegrity === "missing") return text(t, "integrityMissing");
  if (detail.reportIntegrity === "changed") return text(t, "integrityChanged");
  if (detail.reportIntegrity === "unavailable" && detail.run?.reportPath !== null) return text(t, "integrityUnavailable");
  return null;
}

function DetailView({ detail, busy, t, openSession, onRerun, onStop, onOpenTask, onOpenObsidian, onPromote }: {
  detail: InspirationDetail;
  busy: boolean;
  t: Translator;
  openSession: (sessionId: string) => void;
  onRerun: () => void;
  onStop: (run: InspirationRun) => void;
  onOpenTask: () => void;
  onOpenObsidian: (run: InspirationRun) => void;
  onPromote: (run: InspirationRun) => void;
}) {
  const run = detail.run;
  const report = detail.report;
  const integrity = integrityMessage(detail, t);
  return <>
    <header><div><h2 id="inspiration-detail-title" tabIndex={-1}>{detail.owner.spec.topic}</h2>{run !== null && <IslandTag size="small" color="app-teal" variant="soft">{statusText(t, run.status)}</IslandTag>}</div></header>
    {integrity !== null && <IslandState kind="error" title={text(t, "details")} message={integrity} />}
    {report !== null && detail.reportIntegrity === "ok" ? <ReportBody report={report} t={t} /> : integrity === null && <IslandState kind="info" title={run === null ? text(t, "emptyReport") : statusText(t, run.status)} message={run?.error?.message ?? ""} />}
    <div className="inspirationDetailActions">
      {run?.sessionId !== null && run?.sessionId !== undefined && <IslandButton type="default" disabled={busy} onClick={() => { openSession(run.sessionId!); }}>{text(t, "openSession")}</IslandButton>}
      {run !== null && (run.status === "running" || run.status === "queued") && <IslandButton type="default" disabled={busy} onClick={() => { onStop(run); }}>{text(t, "stop")}</IslandButton>}
      <IslandButton type="default" disabled={busy || (isTask(detail.owner) && detail.owner.state !== "enabled")} onClick={onRerun}>{text(t, "rerun")}</IslandButton>
      {run !== null && report !== null && detail.reportIntegrity === "ok" && <IslandButton type="default" disabled={busy} onClick={() => { onOpenObsidian(run); }}>{text(t, "obsidian")}</IslandButton>}
      {run !== null && report !== null && detail.reportIntegrity === "ok" && <IslandButton type="primary" disabled={busy} onClick={() => { onPromote(run); }}>{text(t, "promote")}</IslandButton>}
      {isTask(detail.owner) && <IslandButton type="text" disabled={busy} onClick={onOpenTask}>{text(t, "edit")}</IslandButton>}
    </div>
  </>;
}

function ReportBody({ report, t }: { report: NonNullable<InspirationDetail["report"]>; t: Translator }) {
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  return <article className="inspirationReport">
    {report.partialReason !== null && <p className="inspirationPartialReason">{report.partialReason}</p>}
    <p>{report.summary}</p>
    <EvidenceList title={text(t, "findings")} values={report.findings} sources={sources} />
    <EvidenceList title={text(t, "disagreements")} values={report.disagreements} sources={sources} />
    <TextList title={text(t, "angles")} values={report.angles} />
    <TextList title={text(t, "nextSteps")} values={report.nextSteps} />
    {report.sources.length > 0 && <section><h3>{text(t, "sources")}</h3><ol className="inspirationSources">{report.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.domain}</span><small>{text(t, "published")}：{source.publishedAt === null ? text(t, "unknown") : formatTime(source.publishedAt, text(t, "unknown"))} · {text(t, "retrieved")}：{formatTime(source.retrievedAt, text(t, "unknown"))}</small></li>)}</ol></section>}
  </article>;
}

function EvidenceList({ title, values, sources }: { title: string; values: NonNullable<InspirationDetail["report"]>["findings"]; sources: Map<string, NonNullable<InspirationDetail["report"]>["sources"][number]> }) {
  if (values.length === 0) return null;
  return <section><h3>{title}</h3><ul>{values.map((value, index) => <li key={`${String(index)}-${value.text}`}><span>{value.text}</span>{value.sourceIds.length > 0 && <span className="inspirationCitations">{value.sourceIds.map((sourceId) => { const source = sources.get(sourceId); return source === undefined ? <span key={sourceId}>[{sourceId}]</span> : <a key={sourceId} href={source.url} target="_blank" rel="noreferrer">[{sourceId}]</a>; })}</span>}</li>)}</ul></section>;
}

function TextList({ title, values }: { title: string; values: string[] }) {
  return values.length === 0 ? null : <section><h3>{title}</h3><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></section>;
}

function DailyTaskDrawer({ open, task, initialSpec: seedSpec, face, t, close, refresh }: { open: boolean; task: InspirationTask | null; initialSpec: InspirationResearchSpec; face: InspirationViewFace; t: Translator; close: () => void; refresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [time, setTime] = useState("09:00");
  const [spec, setSpec] = useState(seedSpec);
  const [preferred, setPreferred] = useState("");
  const [excluded, setExcluded] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = task?.spec ?? seedSpec;
    setName(task?.name ?? next.topic);
    setTime(task?.dailyTime ?? "09:00");
    setSpec(next);
    setPreferred(next.preferredDomains.join(", "));
    setExcluded(next.excludedDomains.join(", "));
    setError("");
  }, [open, seedSpec, task]);

  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };

  const save = async (): Promise<void> => {
    await perform(async () => {
      const normalized = normalizeSpec(spec, preferred, excluded);
      if (name.trim() === "") throw new Error("任务名称不能为空");
      await face.saveTask(task === null
        ? { name: name.trim(), spec: normalized, dailyTime: time, timeZone: "Asia/Shanghai" }
        : { id: task.id, expectedRevision: task.revision, name: name.trim(), spec: normalized, dailyTime: time, timeZone: "Asia/Shanghai" });
      await refresh();
      close();
    });
  };

  const change = async (state: InspirationTask["state"]): Promise<void> => {
    if (task === null) return;
    await perform(async () => {
      await face.setTaskState(state === "enabled"
        ? { taskId: task.id, expectedRevision: task.revision, state, confirmed: true }
        : { taskId: task.id, expectedRevision: task.revision, state });
      await refresh();
      close();
    });
  };

  return <IslandDrawer open={open} title={text(t, "task")} placement="right" width={480} onClose={() => { if (!busy) close(); }} footer={<><IslandButton type="default" disabled={busy} onClick={close}>{text(t, "close")}</IslandButton><IslandButton type="primary" loading={busy} disabled={busy || !name.trim() || !spec.topic.trim()} onClick={() => { void save(); }}>{text(t, "saveTask")}</IslandButton></>}>
    <div className="inspirationTaskDrawer">
      <p className="inspirationAuthorization">{text(t, "authorization")}</p>
      {task !== null && <p className="inspirationEditWarning">{text(t, "editPauses")}</p>}
      <label>{text(t, "taskName")}<IslandInput maxLength={100} value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => { setName(event.target.value); }} /></label>
      <label>{text(t, "dailyTime")}<IslandInput type="time" value={time} onChange={(event: ChangeEvent<HTMLInputElement>) => { setTime(event.target.value); }} /></label>
      <label>{text(t, "topic")}<IslandInput maxLength={200} value={spec.topic} onChange={(event: ChangeEvent<HTMLInputElement>) => { setSpec({ ...spec, topic: event.target.value }); }} /></label>
      <label>{text(t, "objective")}<IslandTextarea rows={3} maxLength={1000} value={spec.objective} onChange={(event) => { setSpec({ ...spec, objective: event.target.value }); }} /></label>
      <QuestionsEditor spec={spec} t={t} onSpec={setSpec} />
      <AdvancedFields spec={spec} preferred={preferred} excluded={excluded} t={t} onSpec={setSpec} onPreferred={setPreferred} onExcluded={setExcluded} />
      {error !== "" && <p className="inspirationLive" role="alert">{error}</p>}
      {task !== null && <div className="inspirationTaskActions">
        {task.state === "enabled"
          ? <IslandButton type="default" disabled={busy} onClick={() => { void change("paused"); }}>{text(t, "pause")}</IslandButton>
          : <IslandButton type="primary" disabled={busy || task.state === "archived"} onClick={() => { void change("enabled"); }}>{text(t, "resume")}</IslandButton>}
        <IslandButton type="default" disabled={busy || task.state !== "enabled"} onClick={() => { void perform(async () => { await face.runTaskNow(task.id, task.revision); await refresh(); close(); }); }}>{text(t, "runNow")}</IslandButton>
        <IslandButton type="text" disabled={busy} onClick={() => { void change("archived"); }}>{text(t, "archive")}</IslandButton>
      </div>}
    </div>
  </IslandDrawer>;
}
