import { useEffect, useId, useRef, useState } from "react";
import {
  dailyHotItemTimestamp,
  dailyHotPrimaryLink,
  dailyHotSummaryParagraphs,
  formatDailyHotFullTime,
  previewDailyHotSources,
} from "./dailyHotUiModel.ts";
import { useDailyHotSelection } from "./dailyHotSelection.ts";
import type { CreatorKey } from "./locales.ts";
import { IslandButton, IslandTag } from "./ui/IslandControls.tsx";
import "./DailyHotInspector.css";

export interface DailyHotInspectorProps {
  t: (key: CreatorKey) => string;
}

/** Central read-only detail view for one selected AIHOT item. */
export function DailyHotInspector({ t }: DailyHotInspectorProps) {
  const item = useDailyHotSelection();
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceListId = useId();

  useEffect(() => {
    setSourcesExpanded(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [item?.id]);
  if (item === null) return null;
  const primaryLink = dailyHotPrimaryLink(item);
  const timestamp = dailyHotItemTimestamp(item);
  const summaryParagraphs = item.summary === null ? [] : dailyHotSummaryParagraphs(item.summary);
  const sourcePreview = previewDailyHotSources(item.sourceNames, sourcesExpanded);

  return (
    <article
      data-plugin="dsh-muzi-creator"
      data-surface="daily-hot-inspector"
      aria-label={t("hot.detail")}
    >
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
              <h1 id="muzi-workbench-detail-title" tabIndex={-1}>{item.title}</h1>
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

    </article>
  );
}
