import { useCallback, useEffect, useMemo, useState } from "react";

import type { TrellisProjectListResult, TrellisProjectSummary } from "../../trellisTypes.ts";
import { setSelectedContentId } from "../contentSelection.ts";
import type { TrellisViewFace } from "../face.ts";
import type { CreatorKey } from "../locales.ts";
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
}

export function TrellisProjectPanel({ face, t }: TrellisProjectPanelProps) {
  const [listed, setListed] = useState<TrellisProjectListResult | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selection = useTrellisSelection();
  const epoch = useTrellisEpoch();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await face.listProjects();
      setListed(result);
      setError(null);
      const selectedProjectId = getSelectedTrellisProjectId();
      if (selectedProjectId !== null && !result.projects.some((project) => project.projectId === selectedProjectId)) {
        selectTrellisProject(null);
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [face]);

  useEffect(() => { void load(); }, [load, epoch]);
  useEffect(() => {
    const refresh = (): void => { void load(); };
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); };
  }, [load]);

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
        onRefresh={() => { void load(); }}
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
              className={`trellisProjectCard trellisProjectMain${selected ? " selected" : ""}`}
              selected={selected}
              onSelect={() => {
                  selectTrellisProject(project.projectId);
                  setSelectedContentId(null);
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
