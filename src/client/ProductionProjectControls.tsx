import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
/** Local project references and export watching; never launches a bound project file. */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ContentDetail } from "../types.ts";
import type { CreatorViewFace } from "./face.ts";
import { zh, type CreatorKey } from "./locales.ts";
import { IslandButton, IslandInput } from "./ui/IslandControls.tsx";
import "./ProductionProjectControls.css";

export interface ProductionProjectControlsProps {
  detail: ContentDetail;
  face: Pick<CreatorViewFace, "bindProductionProject" | "openProductionProjectFolder" | "waitForExport" | "cancelWaitForExport" | "pickDirectory">;
  onChange: (detail: ContentDetail) => void;
  t?: (key: CreatorKey) => string;
}

/** Edit an optional project reference independently from the recording or editing software. */
export function ProductionProjectControls({ detail, face, onChange, t = (key) => zh[key] }: ProductionProjectControlsProps) {
  const bound = detail.productionProjectPath ?? detail.studioPath ?? "";
  const [path, setPath] = useState(bound);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { setPath(bound); }, [bound]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : t("production.actionFailed")); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const update = async (action: () => Promise<ContentDetail>): Promise<void> => {
    const next = await action();
    if (mounted.current) onChange(next);
  };
  const save = (event: FormEvent): void => {
    event.preventDefault();
    if (!path.trim()) { setError(t("production.pathRequired")); return; }
    void run(() => update(() => face.bindProductionProject(detail.id, path.trim())));
  };
  const hasVideo = detail.videoRaw !== undefined || detail.videoSubtitled !== undefined;
  return <section className="productionProjectControls" aria-label={t("production.project")} aria-busy={busy}>
    <h3 className="muziIconLabel"><WorkbenchIcon name="video" />{t("production.project")}</h3>
    <p>{t("production.projectHint")}</p>
    <form onSubmit={save}>
      <label className="productionProjectPath">
        <span>{t("production.path")}</span>
        <IslandInput value={path} disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => setPath(event.currentTarget.value)} placeholder={t("production.pathPlaceholder")} aria-label={t("production.path")} />
      </label>
      <div className="productionProjectActions">
        <IslandButton icon={<WorkbenchIcon name="connect" />} type="primary" htmlType="submit" disabled={busy || !path.trim()}>{t("production.bind")}</IslandButton>
        <IslandButton icon={<WorkbenchIcon name="folder-open" />} disabled={busy} onClick={() => { void run(async () => {
          const selected = await face.pickDirectory();
          if (mounted.current && selected !== null) setPath(selected);
        }); }}>{t("production.chooseFolder")}</IslandButton>
        {bound !== "" && <>
          <IslandButton icon={<WorkbenchIcon name="folder-open" />} disabled={busy} onClick={() => { void run(async () => { await face.openProductionProjectFolder(detail.id); }); }}>{t("production.openFolder")}</IslandButton>
          <IslandButton icon={<WorkbenchIcon name="disconnect" />} disabled={busy} onClick={() => { void run(() => update(() => face.bindProductionProject(detail.id, null))); }}>{t("production.unbind")}</IslandButton>
        </>}
      </div>
    </form>
    {bound !== "" && <p className="productionBoundPath"><strong>{t("production.bound")}</strong> {bound}</p>}
    <div className="productionExportActions">
      <p>{t("production.exportHint")} <span className="productionBoundPath">{detail.folderPath}</span></p>
      {detail.waitingForExport
        ? <IslandButton icon={<WorkbenchIcon name="stop" />} disabled={busy} onClick={() => { void run(() => update(() => face.cancelWaitForExport(detail.id))); }}>{t("production.stopWaiting")}</IslandButton>
        : <IslandButton disabled={busy || hasVideo} onClick={() => { void run(() => update(() => face.waitForExport(detail.id))); }}>{t(hasVideo ? "production.videoFound" : "production.waitVideo")}</IslandButton>}
    </div>
    {error !== null && <p role="alert">{error}</p>}
  </section>;
}
