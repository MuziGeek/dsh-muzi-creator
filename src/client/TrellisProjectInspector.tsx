import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  TrellisArchivePreview,
  TrellisProjectDetail,
  TrellisTask,
  TrellisTaskKey,
  TrellisTaskStatus,
} from "../trellisTypes.ts";
import type { TrellisViewFace } from "./face.ts";
import type { CreatorKey } from "./locales.ts";
import {
  selectTrellisTask,
  useTrellisEpoch,
  useTrellisSelection,
} from "./trellisSelection.ts";
import {
  archivePreviewCanExecute,
  filterTasksByPriority,
  previewTrellisTasks,
  taskIsOutsidePreview,
  taskPhaseSummary,
} from "./trellisUiModel.ts";
import {
  IslandButton,
  IslandModal,
  IslandSelect,
  IslandSkeleton,
  IslandTag,
} from "./ui/IslandControls.tsx";
import "./TrellisProjectInspector.css";

function displayDate(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const STATUS_LABELS: Record<TrellisTaskStatus, string> = {
  planning: "计划中",
  in_progress: "进行中",
  completed: "已完成待归档",
  unknown: "未知状态",
};

const TASK_GROUP_KEYS = ["inProgress", "planning", "completed", "archived"] as const;
type TaskGroupKey = (typeof TASK_GROUP_KEYS)[number];
type ExpandedTaskGroups = Record<TaskGroupKey, boolean>;
const EMPTY_TASKS: TrellisTask[] = [];

function collapsedTaskGroups(): ExpandedTaskGroups {
  return { inProgress: false, planning: false, completed: false, archived: false };
}

function taskRefs(task: TrellisTask): string[] {
  return [task.directory, task.id, task.name];
}

function sameRef(task: TrellisTask, value: string): boolean {
  const tail = value.replaceAll("\\", "/").replace(/\/+$/, "").split("/").at(-1);
  return taskRefs(task).some((candidate) => candidate === tail);
}

interface ArchiveDialogProps {
  preview: TrellisArchivePreview;
  busy: boolean;
  error: string | null;
  t: (key: CreatorKey) => string;
  onCancel: () => void;
  onConfirm: () => void;
}

function ArchiveDialog({ preview, busy, error, t, onCancel, onConfirm }: ArchiveDialogProps) {
  return (
    <IslandModal
      open
      className="trellisArchiveModal"
      width={560}
      maskClosable={!busy}
      typewriter={false}
      title={(
        <span className="trellisArchiveTitle">
          <span><strong>{t("projects.archive.title")}</strong><small>{preview.task.title}</small></span>
        </span>
      )}
      footer={(
        <>
          <IslandButton disabled={busy} onClick={onCancel}>{t("projects.cancel")}</IslandButton>
          <IslandButton
            danger
            type="primary"
            loading={busy}
            disabled={!archivePreviewCanExecute(preview, busy)}
            onClick={onConfirm}
          >
            {busy ? "正在归档…" : t("projects.archive.execute")}
          </IslandButton>
        </>
      )}
      onClose={() => { if (!busy) onCancel(); }}
    >
      <div data-plugin-modal="dsh-muzi-creator" className="trellisArchiveDialogBody">
        <p className="trellisNoCommit">{t("projects.archive.noCommit")}</p>
        <dl className="trellisImpactGrid">
          <div><dt>{t("projects.archive.destination")}</dt><dd>{preview.targetMonth}</dd></div>
          <div><dt>{t("projects.archive.evidence")}</dt><dd>{preview.evidence.message}</dd></div>
          <div><dt>{t("projects.archive.git")}</dt><dd>{preview.git.dirty ? `${String(preview.git.count)} 项` : "无"}</dd></div>
          <div><dt>{t("projects.archive.children")}</dt><dd>{preview.activeChildren.length === 0 ? "无" : preview.activeChildren.join("、")}</dd></div>
        </dl>
        <div className="trellisDestination"><span>归档位置</span><code>{preview.destination}</code></div>
        {preview.warnings.length > 0 && <section className="trellisArchiveMessages warning"><h3>归档前请确认</h3><ul>{preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        {preview.blockers.length > 0 && <section className="trellisArchiveMessages blocker"><h3>{t("projects.archive.blocked")}</h3><ul>{preview.blockers.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        {preview.git.sample.length > 0 && <details><summary>查看未提交文件摘要</summary><ul className="trellisGitSample">{preview.git.sample.map((item) => <li key={item}><code>{item}</code></li>)}</ul></details>}
        {error !== null && <p className="trellisArchiveError" role="alert">{error}</p>}
      </div>
    </IslandModal>
  );
}

interface TaskListProps {
  groupKey: TaskGroupKey;
  label: string;
  tasks: TrellisTask[];
  selected: TrellisTaskKey | null;
  emptyLabel: string;
  expanded: boolean;
  onToggle: (groupKey: TaskGroupKey) => void;
  t: (key: CreatorKey) => string;
}

function TaskList({ groupKey, label, tasks, selected, emptyLabel, expanded, onToggle, t }: TaskListProps) {
  const preview = previewTrellisTasks(tasks, expanded);
  const rowsId = `trellis-task-rows-${groupKey}`;
  return (
    <section className="trellisTaskGroup">
      <header><h3>{label}</h3><span>{tasks.length}</span></header>
      {tasks.length === 0
        ? <p className="trellisGroupEmpty">{emptyLabel}</p>
        : <>
          <div id={rowsId} className="trellisTaskRows">{preview.visible.map((task) => (
            <IslandButton
              key={task.key}
              type="text"
              block
              className={selected === task.key ? "selected" : ""}
              aria-pressed={selected === task.key}
              onClick={() => { selectTrellisTask(task.key); }}
            >
              <span className={`trellisTaskStatus ${task.status}`} aria-hidden="true" />
              <span className="trellisTaskRowBody"><strong>{task.title}</strong><small>{task.priority ?? "未设优先级"} · {task.assignee ?? "未分配"}</small></span>
              {task.archived && <IslandTag className={task.verifiedCompletion ? "trellisEvidence good" : "trellisEvidence weak"} color={task.verifiedCompletion ? "app-green" : "app-yellow"} size="small" variant="soft">{task.verifiedCompletion ? "已验证" : "证据不足"}</IslandTag>}
            </IslandButton>
          ))}</div>
          {preview.remaining > 0 && <IslandButton
            type="text"
            size="small"
            className="trellisTaskDisclosure"
            aria-expanded={expanded}
            aria-controls={rowsId}
            onClick={() => { onToggle(groupKey); }}
          >
            {expanded ? t("projects.showLess") : `${t("projects.showMore")} ${String(preview.remaining)} ${t("projects.taskUnit")}`}
          </IslandButton>}
        </>}
    </section>
  );
}

export interface TrellisProjectInspectorProps {
  face: TrellisViewFace;
  t: (key: CreatorKey) => string;
}

export function TrellisProjectInspector({ face, t }: TrellisProjectInspectorProps) {
  const selection = useTrellisSelection();
  const epoch = useTrellisEpoch();
  const [detail, setDetail] = useState<TrellisProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState("all");
  const [archivePreview, setArchivePreview] = useState<TrellisArchivePreview | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<ExpandedTaskGroups>(collapsedTaskGroups);

  const load = useCallback(async () => {
    if (selection.projectId === null) return;
    try {
      const result = await face.getProject(selection.projectId);
      setDetail(result);
      setError(null);
      const all = [...result.activeTasks, ...result.archivedTasks];
      if (selection.taskKey !== null && !all.some((task) => task.key === selection.taskKey)) {
        selectTrellisTask(null);
      }
    } catch (cause) {
      setError(String(cause));
    }
  }, [face, selection.projectId, selection.taskKey]);

  useEffect(() => { void load(); }, [load, epoch]);
  const active = detail?.activeTasks ?? EMPTY_TASKS;
  const archived = detail?.archivedTasks ?? EMPTY_TASKS;
  const priorities = useMemo(() => {
    const values = new Set<string>();
    for (const task of [...active, ...archived]) {
      if (task.priority !== null) values.add(task.priority);
    }
    return [...values].sort();
  }, [active, archived]);
  const taskGroups = useMemo<Record<TaskGroupKey, TrellisTask[]>>(() => ({
    inProgress: filterTasksByPriority(active.filter((task) => task.status === "in_progress"), priority),
    planning: filterTasksByPriority(active.filter((task) => task.status === "planning"), priority),
    completed: filterTasksByPriority(active.filter((task) => task.status === "completed" || task.status === "unknown"), priority),
    archived: filterTasksByPriority(archived, priority),
  }), [active, archived, priority]);
  const taskGroupsRef = useRef(taskGroups);
  taskGroupsRef.current = taskGroups;
  useEffect(() => {
    setExpandedTaskGroups(collapsedTaskGroups());
    if (priority !== "all" && !priorities.includes(priority)) setPriority("all");
  }, [selection.projectId, priority, priorities]);
  useEffect(() => {
    if (selection.taskKey === null) return;
    for (const groupKey of TASK_GROUP_KEYS) {
      if (taskIsOutsidePreview(taskGroupsRef.current[groupKey], selection.taskKey)) {
        setExpandedTaskGroups((current) => current[groupKey] ? current : { ...current, [groupKey]: true });
        return;
      }
    }
  }, [selection.projectId, selection.taskKey]);
  const toggleTaskGroup = (groupKey: TaskGroupKey): void => {
    setExpandedTaskGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }));
  };
  const selectedTask = [...active, ...archived].find((task) => task.key === selection.taskKey) ?? null;
  const parent = selectedTask?.parent === null || selectedTask === null ? null : [...active, ...archived].find((task) => sameRef(task, selectedTask.parent ?? "")) ?? null;
  const children = selectedTask === null ? [] : [...active, ...archived].filter((task) => selectedTask.children.some((child) => sameRef(task, child)));
  const counts = detail?.project.counts ?? null;
  const phaseSummary = selectedTask === null ? null : taskPhaseSummary(selectedTask);
  const priorityItems = useMemo(() => [
    { key: "all", label: t("projects.filter.all") },
    ...priorities.map((value) => ({ key: value, label: value })),
  ], [priorities, t]);

  const prepareArchive = async (): Promise<void> => {
    if (selection.projectId === null || selectedTask === null) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      setArchivePreview(await face.prepareArchive(selection.projectId, selectedTask.key));
    } catch (cause) {
      setNotice(String(cause));
    } finally {
      setArchiveBusy(false);
    }
  };

  const executeArchive = async (): Promise<void> => {
    if (archivePreview?.token === null || archivePreview === null) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const result = await face.archiveTask(archivePreview.token);
      setNotice(`${result.message}${result.stderr.trim() === "" ? "" : ` · ${result.stderr.trim()}`}`);
      setArchivePreview(null);
      await load();
    } catch (cause) {
      setArchiveError(String(cause));
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <article
      data-plugin="dsh-muzi-creator"
      data-surface="trellis-inspector"
      aria-label={t("projects.detail")}
    >
      <div className="trellisInspectorTop">
        <div><span>{detail?.project.title ?? t("projects.detail")}</span></div>
        <div className="trellisTopActions">
          <IslandButton type="text" size="small" aria-label={t("projects.refresh")} onClick={() => { void load(); }}>{t("projects.refresh")}</IslandButton>
          {detail?.project.rootPath !== null && detail?.project.rootPath !== undefined && <IslandButton type="text" size="small" aria-label={t("projects.openFolder")} onClick={() => { void face.openPath(detail.project.rootPath ?? ""); }}>{t("projects.openFolder")}</IslandButton>}
        </div>
      </div>

      {error !== null && detail === null && <div className="trellisInspectorState error"><strong>{t("projects.error")}</strong><p>{error}</p></div>}
      {detail === null && error === null && <div className="trellisInspectorState" aria-label={t("projects.loading")}><IslandSkeleton variant="text" width="72%" /><IslandSkeleton variant="text" width="46%" /></div>}
      {detail !== null && (
        <div className="trellisInspectorScroll">
          <header className="trellisProjectHero">
            <div className="trellisHeroHeading"><IslandTag className={`trellisProjectState ${detail.project.status}`} color={detail.project.status === "ready" ? "app-green" : detail.project.status === "degraded" ? "app-yellow" : "app-red"} size="small" variant="soft">{detail.project.status === "ready" ? t("projects.ready") : detail.project.status === "degraded" ? t("projects.degraded") : t("projects.unavailable")}</IslandTag><h1 id="muzi-workbench-detail-title" tabIndex={-1}>{detail.project.title}</h1><p>{detail.project.statusMessage}</p></div>
            {counts !== null && <div className="trellisDistribution" aria-label="任务状态分布">
              <div><strong>{counts.planning}</strong><span>{t("projects.planning")}</span></div>
              <div><strong>{counts.inProgress}</strong><span>{t("projects.inProgress")}</span></div>
              <div><strong>{counts.completed}</strong><span>{t("projects.completed")}</span></div>
              <div><strong>{counts.archived}</strong><span>{t("projects.archived")}</span></div>
            </div>}
            {detail.project.issues.length > 0 && <details className="trellisProjectIssues"><summary>{detail.project.issues.length} 项读取提示</summary><ul>{detail.project.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></details>}
          </header>

          <div className="trellisProjectToolbar">
            <div className="trellisPriorityField">
              <span className="trellisPriorityLabel">优先级</span>
              <IslandSelect
                aria-label="优先级"
                value={priority}
                options={priorityItems}
                onChange={(value: string) => {
                  if (value === "all" || priorities.includes(value)) setPriority(value);
                }}
              />
            </div>
            <span>读取于 {new Date(detail.scannedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          <div className="trellisTaskBoard">
            <TaskList groupKey="inProgress" label={t("projects.inProgress")} tasks={taskGroups.inProgress} selected={selection.taskKey} emptyLabel={t("projects.noTasks")} expanded={expandedTaskGroups.inProgress} onToggle={toggleTaskGroup} t={t} />
            <TaskList groupKey="planning" label={t("projects.planning")} tasks={taskGroups.planning} selected={selection.taskKey} emptyLabel={t("projects.noTasks")} expanded={expandedTaskGroups.planning} onToggle={toggleTaskGroup} t={t} />
            <TaskList groupKey="completed" label={t("projects.completed")} tasks={taskGroups.completed} selected={selection.taskKey} emptyLabel={t("projects.noTasks")} expanded={expandedTaskGroups.completed} onToggle={toggleTaskGroup} t={t} />
            <TaskList groupKey="archived" label={t("projects.archived")} tasks={taskGroups.archived} selected={selection.taskKey} emptyLabel={t("projects.noTasks")} expanded={expandedTaskGroups.archived} onToggle={toggleTaskGroup} t={t} />
          </div>

          {selectedTask !== null && <section className="trellisTaskDetail">
            <header><div><IslandTag className={`trellisStatusLabel ${selectedTask.status}`} color={selectedTask.status === "completed" ? "app-green" : selectedTask.status === "in_progress" ? "yellow-green" : selectedTask.status === "planning" ? "app-yellow" : "brown"} size="small" variant="soft">{STATUS_LABELS[selectedTask.status]}</IslandTag><h2>{selectedTask.title}</h2><p>{selectedTask.description || "未填写任务说明"}</p></div>{!selectedTask.archived && selectedTask.status === "completed" && <IslandButton className="trellisArchiveButton" loading={archiveBusy} disabled={archiveBusy} onClick={() => { void prepareArchive(); }}>{archiveBusy ? t("projects.archive.checking") : t("projects.archive")}</IslandButton>}</header>
            <dl className="trellisTaskFacts">
              <div><dt>优先级</dt><dd>{selectedTask.priority ?? "—"}</dd></div>
              <div><dt>负责人</dt><dd>{selectedTask.assignee ?? "—"}</dd></div>
              <div><dt>创建时间</dt><dd>{displayDate(selectedTask.createdAt)}</dd></div>
              <div><dt>完成时间</dt><dd>{displayDate(selectedTask.completedAt)}</dd></div>
              <div><dt>分支</dt><dd>{selectedTask.branch ?? "—"}</dd></div>
              <div><dt>基础分支</dt><dd>{selectedTask.baseBranch ?? "—"}</dd></div>
            </dl>
            {phaseSummary !== null && <dl className="trellisPhaseSummary" aria-label="任务阶段">
              <div><dt>当前阶段</dt><dd>{phaseSummary.current}</dd></div>
              <div><dt>下一阶段</dt><dd>{phaseSummary.next}</dd></div>
            </dl>}
            <div className={`trellisEvidenceCard ${selectedTask.evidence.state}`}><div><strong>{selectedTask.archived && selectedTask.verifiedCompletion ? t("projects.evidence.verified") : selectedTask.evidence.state === "meaningful" ? "验证材料可读" : t("projects.evidence.insufficient")}</strong><p>{selectedTask.evidence.message}{selectedTask.evidence.files.length > 0 ? ` · ${selectedTask.evidence.files.join("、")}` : ""}</p></div></div>
            {(parent !== null || children.length > 0) && <div className="trellisRelations"><h3>父子任务</h3>{parent !== null && <p><span>父任务</span><IslandButton type="link" size="small" onClick={() => { selectTrellisTask(parent.key); }}>{parent.title}</IslandButton></p>}{children.length > 0 && <p><span>子任务</span>{children.map((child) => <IslandButton key={child.key} type="link" size="small" onClick={() => { selectTrellisTask(child.key); }}>{child.title}</IslandButton>)}</p>}</div>}
            {selectedTask.relatedFiles.length > 0 && <div className="trellisRelatedFiles"><h3>相关文件</h3><ul>{selectedTask.relatedFiles.map((file) => <li key={file}><code>{file}</code></li>)}</ul></div>}
            {selectedTask.notes !== "" && <div className="trellisTaskNotes"><h3>任务记录</h3><p>{selectedTask.notes}</p></div>}
            {selectedTask.unknownFields.length > 0 && <p className="trellisUnknownFields">未识别字段：{selectedTask.unknownFields.join("、")}</p>}
            {selectedTask.issues.length > 0 && <ul className="trellisTaskIssues">{selectedTask.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          </section>}
        </div>
      )}

      {notice !== null && <div className="trellisNotice" role="status"><span>{notice}</span><IslandButton type="text" size="small" aria-label="关闭提示" onClick={() => { setNotice(null); }}>关闭</IslandButton></div>}
      {archivePreview !== null && <ArchiveDialog preview={archivePreview} busy={archiveBusy} error={archiveError} t={t} onCancel={() => { if (!archiveBusy) setArchivePreview(null); }} onConfirm={() => { void executeArchive(); }} />}
    </article>
  );
}
