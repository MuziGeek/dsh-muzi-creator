import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconLightOutline16,
  IconLinkOutline16,
  IconWarningOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import {
  applyConversationInset,
  clearConversationInset,
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
  const [expanded, setExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number; latestWidth: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceListId = useId();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setExpanded(true); });
    return () => { window.cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    applyConversationInset(item !== null && expanded && layout.mode === "split" ? layout.width : 0, !dragging);
    return () => { clearConversationInset(); };
  }, [item, expanded, layout.mode, layout.width, dragging]);
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
      applyConversationInset(next, false);
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
        <div><IconLightOutline16 size={16} /><span>{t("hot.detail")}</span></div>
        <button type="button" aria-label={t("hot.close")} onClick={closeDetails}>
          <IconCloseOutline16 size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="dailyHotInspectorScroll">
        <div className="dailyHotDetailLayout">
          <article className="dailyHotArticle">
            <header className="dailyHotHero">
              <div className="dailyHotHeroMeta">
                <span className={`dailyHotEvidence ${item.evidence.level}`}>{item.evidence.label}</span>
                {item.categoryLabel !== null && <span>{item.categoryLabel}</span>}
              </div>
              <h1>{item.title}</h1>
              <p>{item.attention.reason}</p>
              {item.attention.domains.length > 0 && (
                <div className="dailyHotDomains" aria-label={t("hot.domains")}>
                  {item.attention.domains.map((domain) => <span key={domain.id}>{domain.label}</span>)}
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
                <ul id={sourceListId}>{sourcePreview.items.map((name) => <li key={name}>{name}</li>)}</ul>
                {sourcePreview.remaining > 0 && (
                  <button
                    type="button"
                    className="dailyHotSourcesToggle"
                    aria-expanded={sourcesExpanded}
                    aria-controls={sourceListId}
                    onClick={() => { setSourcesExpanded((value) => !value); }}
                  >
                    <span>{sourcesExpanded ? t("hot.sources.hide") : `${t("hot.sources.showMore")} ${String(sourcePreview.remaining)} ${t("hot.sources.unit")}`}</span>
                    <IconChevronDownOutline14 size={14} />
                  </button>
                )}
              </section>
            )}

            {(primaryLink !== null || item.links.original !== null) && (
              <nav className="dailyHotLinks" aria-label={t("hot.links")}>
                {primaryLink !== null && (
                  <a href={primaryLink} target="_blank" rel="noreferrer">
                    <IconLinkOutline16 size={16} />{t("hot.openEvent")}
                  </a>
                )}
                {item.links.original !== null && (
                  <a href={item.links.original} target="_blank" rel="noreferrer">
                    <IconLinkOutline16 size={16} />{t("hot.openOriginal")}
                  </a>
                )}
              </nav>
            )}

            <footer className="dailyHotDisclaimer">
              <IconWarningOutline16 size={16} />
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
