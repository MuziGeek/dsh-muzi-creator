import { useCallback, useEffect, useMemo, useState } from "react";

import type { TrellisProjectListResult, TrellisProjectSummary } from "../../trellisTypes.ts";
import type { TrellisViewFace } from "../face.ts";
import type { CreatorKey } from "../locales.ts";
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import { sidebarItemElementId } from "../workbench/sidebarLayoutBridge.ts";
import {
  getSelectedTrellisProjectId,
  selectTrellisProject,
  useTrellisEpoch,
  useTrellisSelection,
} from "../trellisSelection.ts";
import { projectMatchesQuery } from "../trellisUiModel.ts";
import { PanelSectionHeader } from "./PanelSectionHeader.tsx";
import {
  IslandIcon,
  IslandSelectableCard,
  IslandSkeleton,
  IslandState,
} from "../ui/IslandControls.tsx";
import "./TrellisProjectPanel.css";

function projectStateLabel(project: TrellisProjectSummary, t: (key: CreatorKey) => string): string {
  if (project.status === "ready") return t("projects.ready");
  if (project.status === "degraded") return t("projects.degraded");
  return t("projects.unavailable");
}

export interface TrellisProjectPanelProps {
  face: TrellisViewFace;
  t: (key: CreatorKey) => string;
  resource: ReadonlyResource<TrellisProjectListResult>;
}

export function TrellisProjectPanel({ t, resource }: TrellisProjectPanelProps) {
  const [query, setQuery] = useState("");
  const { data: listed, loading, error } = useResourceSnapshot(resource);
  const selection = useTrellisSelection();
  const epoch = useTrellisEpoch();

  const load = useCallback(async (force = false) => {
    try {
      const result = await resource.load(force);
      const selectedProjectId = getSelectedTrellisProjectId();
      if (selectedProjectId !== null && !result.projects.some((project) => project.projectId === selectedProjectId)) {
        selectTrellisProject(null);
      }
    } catch {
      // The shared resource retains its last valid project list.
    }
  }, [resource]);

  useEffect(() => { void load(epoch > 0); }, [load, epoch]);

  const filtered = useMemo(() => {
    const projects = listed?.projects ?? [];
    return projects.filter((project) => projectMatchesQuery(project, query));
  }, [listed, query]);

  return (
    <div className="muziPanel trellisProjectPanel">
      <PanelSectionHeader
        label={t("projects.title")}
        {...listed === null ? {} : { count: listed.projects.length }}
        query={query}
        searchLabel={t("projects.search")}
        searchName="trellis-project-search"
        searchPlaceholder={t("projects.search.placeholder")}
        refreshLabel={t("projects.refresh")}
        onQueryChange={setQuery}
        onRefresh={() => { void load(true); }}
      />
      <div className="trellisProjectList">
        {listed !== null && <p className="trellisProjectsRoot"><span>{t("projects.root")}</span><code title={listed.projectsRoot}>{listed.projectsRoot}</code></p>}
        {loading && listed === null && <div className="muziCardSkeletons" aria-label={t("projects.loading")}><IslandSkeleton variant="rect" widthValue="100%" heightValue={84} /><IslandSkeleton variant="rect" widthValue="100%" heightValue={84} /></div>}
        {error !== null && listed === null && <IslandState kind="error" title={t("projects.error")} message={error} />}
        {!loading && listed !== null && listed.projects.length === 0 && <IslandState kind="empty" title={t("projects.empty")} action={<IslandIcon name="icon-map" size={24} />} />}
        {filtered.map((project) => {
          const selected = selection.projectId === project.projectId;
          const counts = project.counts;
          return (
            <IslandSelectableCard
              key={project.projectId}
              id={sidebarItemElementId("projects", project.projectId)}
              className={`trellisProjectCard trellisProjectMain${selected ? " selected" : ""}`}
              selected={selected}
              onSelect={() => {
                selectTrellisProject(project.projectId);
              }}
            >
                <span className={`trellisConnectionMark ${project.status}`} aria-hidden="true" />
                <span className="trellisProjectBody">
                  <span className="trellisProjectHeading"><strong>{project.title}</strong><small>{projectStateLabel(project, t)}</small></span>
                  <span className="trellisProjectPath">{project.rootPath ?? project.statusMessage}</span>
                  {counts !== null && (
                    <span className="trellisProjectCounts">
                      <span>{t("projects.planning")} <b>{counts.planning}</b></span>
                      <span>{t("projects.inProgress")} <b>{counts.inProgress}</b></span>
                      <span>{t("projects.archived")} <b>{counts.archived}</b></span>
                      {counts.invalid > 0 && <span className="invalid">{t("projects.invalid")} <b>{counts.invalid}</b></span>}
                    </span>
                  )}
                </span>
            </IslandSelectableCard>
          );
        })}
      </div>
    </div>
  );
}
