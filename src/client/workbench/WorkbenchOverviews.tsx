import type { DailyHotItem, DailyHotResult } from "../../dailyHotTypes.ts";
import type {
  MuziProjectListResult,
  MuziProjectStage,
  MuziProjectSummary,
} from "../../muziTypes.ts";
import type {
  TrellisProjectId,
  TrellisProjectListResult,
  TrellisProjectSummary,
} from "../../trellisTypes.ts";
import { IslandSelectableCard, IslandState, IslandTag } from "../ui/IslandControls.tsx";
import "./WorkbenchOverviews.css";

const STAGE_LABELS: Record<MuziProjectStage, string> = {
  idea: "灵感",
  research: "研究中",
  mother_draft: "母内容草稿",
  adaptation: "渠道改编",
  review: "审阅中",
  ready: "已就绪",
  archived: "已归档",
};

function displayDate(value: string | null | undefined): string {
  if (value === null || value === undefined) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "未知";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateOrder(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function contentReadiness(project: MuziProjectSummary): { ready: number; published: number } {
  return {
    ready: Object.values(project.documents).filter((document) => document.status === "ready").length,
    published: Object.values(project.publications).filter((publication) => publication.status === "published").length,
  };
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="workbenchOverviewMetric">
    <dt>{label}</dt>
    <dd>{value}</dd>
    {note !== undefined && <small>{note}</small>}
  </div>;
}

function OverviewHeader({ id, title, description }: { id: string; title: string; description: string }) {
  return <header className="workbenchOverviewHeader">
    <div>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  </header>;
}

/** Read-only AIHOT summary with a short, keyboard-selectable reading queue. */
export function HotOverview({ result, onSelect }: {
  result: DailyHotResult;
  onSelect: (item: DailyHotItem) => void;
}) {
  const focusItems = [...result.tiers.mustRead, ...result.tiers.browse].slice(0, 4);
  const sourceStatus = result.status === "live" ? "实时" : "暂存快照";
  return <section className="workbenchOverview" aria-labelledby="hot-overview-title">
    <OverviewHeader id="hot-overview-title" title="今日热点" description="只读浏览与优先阅读，不自动创建内容或任务。" />
    <dl className="workbenchOverviewMetrics">
      <Metric label="更新时间" value={displayDate(result.fetchedAt)} />
      <Metric label="数据状态" value={sourceStatus} />
      <Metric label="必读 / 浏览" value={`${String(result.counts.mustRead)} / ${String(result.counts.browse)}`} />
    </dl>
    {focusItems.length === 0 ? <IslandState kind="empty" title="暂无可读热点" message="当前聚合未返回重点条目。" /> : <div className="workbenchOverviewList" aria-label="重点热点">
      {focusItems.map((item) => <IslandSelectableCard key={item.id} className="workbenchOverviewCard" onSelect={() => { onSelect(item); }}>
        <span className="workbenchOverviewCardHeading">
          <strong>{item.title}</strong>
          <IslandTag color={item.evidence.level === "summary-only" ? "app-yellow" : "app-green"} size="small" variant="soft">{item.evidence.label}</IslandTag>
        </span>
        <span className="workbenchOverviewCardMeta">
          <span>{item.source.name}</span>
          <span>{displayDate(item.latestAt ?? item.discoveredAt ?? item.publishedAt)}</span>
        </span>
        {item.summary !== null && <span className="workbenchOverviewExcerpt">{item.summary}</span>}
      </IslandSelectableCard>)}
    </div>}
  </section>;
}

/** Read-only creation-project summary with real document and publication counts. */
export function ContentOverview({ result, onSelect }: {
  result: MuziProjectListResult;
  onSelect: (id: string) => void;
}) {
  const stageSummary = Object.entries(STAGE_LABELS)
    .map(([stage, label]) => ({ label, count: result.items.filter((item) => item.stage === stage).length }))
    .filter((entry) => entry.count > 0);
  const totals = result.items.reduce((summary, item) => {
    const counts = contentReadiness(item);
    return { ready: summary.ready + counts.ready, published: summary.published + counts.published };
  }, { ready: 0, published: 0 });
  const latest = [...result.items].sort((left, right) => dateOrder(right.updatedAt) - dateOrder(left.updatedAt));

  return <section className="workbenchOverview" aria-labelledby="content-overview-title">
    <OverviewHeader id="content-overview-title" title="创作内容" description="项目、稿件与发布事实保持在各自的只读来源中。" />
    <dl className="workbenchOverviewMetrics">
      <Metric label="内容项目" value={result.items.length} />
      <Metric label="稿件已就绪" value={totals.ready} />
      <Metric label="已发布记录" value={totals.published} />
      <Metric label="最近更新" value={latest[0] === undefined ? "不可用" : displayDate(latest[0].updatedAt)} />
    </dl>
    <div className="workbenchOverviewBreakdown" aria-label="项目阶段分布">
      <span>阶段分布</span>
      {stageSummary.length === 0 ? <small>不可用</small> : stageSummary.map((entry) => <IslandTag key={entry.label} color="brown" size="small" variant="soft">{entry.label} {entry.count}</IslandTag>)}
    </div>
    {latest.length === 0 ? <IslandState kind="empty" title="还没有创作项目" message="创建项目后，这里会显示来自项目列表的真实状态。" /> : <div className="workbenchOverviewList" aria-label="最近更新内容">
      {latest.slice(0, 4).map((project) => {
        const counts = contentReadiness(project);
        return <IslandSelectableCard key={project.id} className="workbenchOverviewCard" onSelect={() => { onSelect(project.id); }}>
          <span className="workbenchOverviewCardHeading">
            <strong>{project.title}</strong>
            <IslandTag color="app-teal" size="small" variant="soft">{STAGE_LABELS[project.stage]}</IslandTag>
          </span>
          <span className="workbenchOverviewCardMeta">
            <span>更新于 {displayDate(project.updatedAt)}</span>
            <span>{counts.ready} 稿就绪 · {counts.published} 项已发布</span>
          </span>
        </IslandSelectableCard>;
      })}
    </div>}
  </section>;
}

function connectionLabel(project: TrellisProjectSummary): string {
  if (project.status === "ready") return "连接正常";
  if (project.status === "degraded") return "连接需处理";
  return "连接不可用";
}

/** Read-only Trellis project summary; source DTO does not provide a project update timestamp. */
export function ProjectsOverview({ result, onSelect }: {
  result: TrellisProjectListResult;
  onSelect: (projectId: TrellisProjectId) => void;
}) {
  const projectsWithCounts = result.projects.filter((project) => project.counts !== null);
  const taskCounts = projectsWithCounts.reduce((summary, project) => {
    const counts = project.counts;
    if (counts === null) return summary;
    return {
      planning: summary.planning + counts.planning,
      inProgress: summary.inProgress + counts.inProgress,
      completed: summary.completed + counts.completed,
    };
  }, { planning: 0, inProgress: 0, completed: 0 });
  const connections = {
    ready: result.projects.filter((project) => project.status === "ready").length,
    degraded: result.projects.filter((project) => project.status === "degraded").length,
    unavailable: result.projects.filter((project) => project.status !== "ready" && project.status !== "degraded").length,
  };

  return <section className="workbenchOverview" aria-labelledby="projects-overview-title">
    <OverviewHeader id="projects-overview-title" title="项目进度" description="只汇总已连接项目中的 Trellis 任务与连接状态。" />
    <dl className="workbenchOverviewMetrics">
      <Metric label="已发现项目" value={result.projects.length} />
      <Metric label="可统计项目" value={projectsWithCounts.length === 0 ? "不可用" : projectsWithCounts.length} />
      <Metric label="最近项目" value="不可用" note="项目 DTO 未提供更新时间" />
    </dl>
    <div className="workbenchOverviewBreakdown" aria-label="任务状态分布">
      <span>任务状态</span>
      {projectsWithCounts.length === 0 ? <small>不可用</small> : <>
        <IslandTag color="app-yellow" size="small" variant="soft">计划中 {taskCounts.planning}</IslandTag>
        <IslandTag color="yellow-green" size="small" variant="soft">进行中 {taskCounts.inProgress}</IslandTag>
        <IslandTag color="app-green" size="small" variant="soft">已完成 {taskCounts.completed}</IslandTag>
      </>}
    </div>
    <div className="workbenchOverviewBreakdown" aria-label="项目连接健康">
      <span>连接健康</span>
      <IslandTag color="app-green" size="small" variant="soft">正常 {connections.ready}</IslandTag>
      <IslandTag color="app-yellow" size="small" variant="soft">需处理 {connections.degraded}</IslandTag>
      <IslandTag color="app-red" size="small" variant="soft">不可用 {connections.unavailable}</IslandTag>
    </div>
    {result.projects.length === 0 ? <IslandState kind="empty" title="尚未发现项目" message="配置项目根目录后，已连接的 Git 与 Trellis 项目会显示在这里。" /> : <div className="workbenchOverviewList" aria-label="已连接项目">
      {result.projects.slice(0, 4).map((project) => <IslandSelectableCard key={project.projectId} className="workbenchOverviewCard" onSelect={() => { onSelect(project.projectId); }}>
        <span className="workbenchOverviewCardHeading">
          <strong>{project.title}</strong>
          <IslandTag color={project.status === "ready" ? "app-green" : project.status === "degraded" ? "app-yellow" : "app-red"} size="small" variant="soft">{connectionLabel(project)}</IslandTag>
        </span>
        <span className="workbenchOverviewCardMeta">
          <span>{project.rootPath ?? project.statusMessage}</span>
          {project.counts === null ? <span>任务统计不可用</span> : <span>{project.counts.planning} 计划 · {project.counts.inProgress} 进行 · {project.counts.completed} 完成</span>}
        </span>
      </IslandSelectableCard>)}
    </div>}
  </section>;
}
