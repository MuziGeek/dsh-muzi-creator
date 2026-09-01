import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import {
  getInspectorWidth,
  setInspectorWidth,
  useSidebarChromeWidth,
} from "./contentSelection.ts";
import {
  dailyHotItemTimestamp,
  dailyHotPrimaryLink,
  dailyHotSummaryParagraphs,
  formatDailyHotFullTime,
  previewDailyHotSources,
} from "./dailyHotUiModel.ts";
import { useDailyHotSelection } from "./dailyHotSelection.ts";
import {
  clampInspectorPreference,
  INSPECTOR_MIN,
  resolveInspectorLayout,
} from "./inspectorLayout.ts";
import type { CreatorKey } from "./locales.ts";
import { IslandButton, IslandTag } from "./ui/IslandControls.tsx";
import "./DailyHotInspector.css";

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => typeof window === "undefined" ? 1440 : window.innerWidth);
  useEffect(() => {
    const update = (): void => { setWidth(window.innerWidth); };
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("resize", update); };
  }, []);
  return width;
}

export type DailyHotInspectorProps = PropsRuntime<"shell.overlay"> & {
  t: (key: CreatorKey) => string;
  closeDetails: () => void;
};

/** Shared-width read-only detail view for one selected AIHOT item. */
export function DailyHotInspector({ t, closeDetails }: DailyHotInspectorProps) {
  const item = useDailyHotSelection();
  const [width, setWidth] = useState(getInspectorWidth);
  const viewportWidth = useViewportWidth();
  const sidebarWidth = useSidebarChromeWidth();
  const layout = resolveInspectorLayout(viewportWidth, sidebarWidth, width);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number; latestWidth: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceListId = useId();

  useEffect(() => {
    setSourcesExpanded(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [item?.id]);
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent): void => {
      if (drag.current === null) return;
      const next = Math.min(
        layout.maxWidth,
        Math.max(INSPECTOR_MIN, drag.current.width + event.clientX - drag.current.x),
      );
      drag.current.latestWidth = next;
      setWidth(next);
    };
    const up = (): void => {
      if (drag.current !== null) setInspectorWidth(drag.current.latestWidth);
      setDragging(false);
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, layout.maxWidth]);

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (layout.mode !== "split") return;
    const step = event.shiftKey ? 64 : 16;
    const next = event.key === "Home" ? INSPECTOR_MIN
      : event.key === "End" ? layout.maxWidth
        : event.key === "ArrowLeft" ? layout.width - step
          : event.key === "ArrowRight" ? layout.width + step
            : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.min(layout.maxWidth, clampInspectorPreference(next));
    setWidth(clamped);
    setInspectorWidth(clamped);
  };

  if (item === null) return null;
  const primaryLink = dailyHotPrimaryLink(item);
  const timestamp = dailyHotItemTimestamp(item);
  const summaryParagraphs = item.summary === null ? [] : dailyHotSummaryParagraphs(item.summary);
  const sourcePreview = previewDailyHotSources(item.sourceNames, sourcesExpanded);

  return (
    <aside
      data-plugin="dsh-muzi-creator"
      data-surface="daily-hot-inspector"
      data-layout={layout.mode}
      className={`${layout.mode === "full" ? "full" : ""}${dragging ? " dragging" : ""}`}
      style={{ width: layout.width }}
      aria-label={t("hot.detail")}
    >
      <div className="dailyHotInspectorTop">
        <div><span>{t("hot.detail")}</span></div>
        <IslandButton
          className="dailyHotClose"
          type="text"
          size="small"
          aria-label={t("hot.close")}
          onClick={closeDetails}
        >关闭</IslandButton>
      </div>

      <div ref={scrollRef} className="dailyHotInspectorScroll">
        <div className="dailyHotDetailLayout">
          <article className="dailyHotArticle">
            <header className="dailyHotHero">
              <div className="dailyHotHeroMeta">
                <IslandTag
                  className={`dailyHotEvidence ${item.evidence.level}`}
                  color={item.evidence.level === "summary-only" ? "app-yellow" : "app-green"}
                  size="small"
                  variant="soft"
                >
                  {item.evidence.label}
                </IslandTag>
                {item.categoryLabel !== null && <IslandTag color="brown" size="small" variant="soft">{item.categoryLabel}</IslandTag>}
              </div>
              <h1>{item.title}</h1>
              <p>{item.attention.reason}</p>
              {item.attention.domains.length > 0 && (
                <div className="dailyHotDomains" aria-label={t("hot.domains")}>
                  {item.attention.domains.map((domain) => <IslandTag key={domain.id} color="yellow-green" size="small" variant="outlined">{domain.label}</IslandTag>)}
                </div>
              )}
            </header>

            {item.latest !== null && (
              <section className="dailyHotLatest">
                <h2>{t("hot.latest")}</h2>
                <p>{item.latest}</p>
              </section>
            )}

            {summaryParagraphs.length > 0 && (
              <section className="dailyHotSummary">
                <h2>{t("hot.aiSummary")}</h2>
                <div className="dailyHotSummaryBody">
                  {summaryParagraphs.map((paragraph, index) => <p key={`${String(index)}-${paragraph}`}>{paragraph}</p>)}
                </div>
              </section>
            )}
          </article>

          <div className="dailyHotEvidenceRail">
            <section className="dailyHotEvidenceGroup">
              <h2>{t("hot.evidence")}</h2>
              <dl className="dailyHotFacts">
                <div><dt>{t("hot.source")}</dt><dd>{item.source.name}</dd></div>
                <div><dt>{t("hot.sourceCount")}</dt><dd>{String(item.sourceCount)}</dd></div>
                <div><dt>{t("hot.category")}</dt><dd>{item.categoryLabel ?? "—"}</dd></div>
                <div><dt>{t("hot.updatedAt")}</dt><dd>{formatDailyHotFullTime(timestamp)}</dd></div>
              </dl>
            </section>

            {item.sourceNames.length > 0 && (
              <section className="dailyHotEvidenceGroup dailyHotSourceNames">
                <h2>{t("hot.sources")}</h2>
                <ul id={sourceListId}>{sourcePreview.items.map((name) => <li key={name}><IslandTag color="brown" size="small" variant="soft">{name}</IslandTag></li>)}</ul>
                {sourcePreview.remaining > 0 && (
                  <IslandButton
                    className="dailyHotSourcesToggle"
                    type="text"
                    size="small"
                    aria-expanded={sourcesExpanded}
                    aria-controls={sourceListId}
                    onClick={() => { setSourcesExpanded((value) => !value); }}
                  >
                    {sourcesExpanded ? t("hot.sources.hide") : `${t("hot.sources.showMore")} ${String(sourcePreview.remaining)} ${t("hot.sources.unit")}`}
                  </IslandButton>
                )}
              </section>
            )}

            {(primaryLink !== null || item.links.original !== null) && (
              <nav className="dailyHotLinks" aria-label={t("hot.links")}>
                {primaryLink !== null && (
                  <a href={primaryLink} target="_blank" rel="noreferrer">
                    {t("hot.openEvent")}
                  </a>
                )}
                {item.links.original !== null && (
                  <a href={item.links.original} target="_blank" rel="noreferrer">
                    {t("hot.openOriginal")}
                  </a>
                )}
              </nav>
            )}

            <footer className="dailyHotDisclaimer">
              <p><strong>{t("hot.readOnly")}</strong>{t("hot.disclaimer")}</p>
            </footer>
          </div>
        </div>
      </div>

      {layout.mode === "split" && (
        <div
          className="dailyHotResize"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("hot.resize")}
          aria-valuemin={INSPECTOR_MIN}
          aria-valuemax={layout.maxWidth}
          aria-valuenow={layout.width}
          tabIndex={0}
          onKeyDown={resizeWithKeyboard}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, width: layout.width, latestWidth: layout.width };
            setDragging(true);
          }}
        />
      )}
    </aside>
  );
}
