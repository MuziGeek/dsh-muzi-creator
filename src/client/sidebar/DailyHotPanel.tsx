import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  IconChevronDownOutline14,
  IconLightOutline16,
  IconRefreshOutline16,
  IconWarningOutline16,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";

import type { DailyHotItem, DailyHotResult } from "../../dailyHotTypes.ts";
import { setSelectedContentId } from "../contentSelection.ts";
import {
  dailyHotItems,
  dailyHotItemTimestamp,
  formatDailyHotCompactTime,
} from "../dailyHotUiModel.ts";
import {
  getSelectedDailyHotItem,
  selectDailyHotItem,
  useDailyHotSelection,
} from "../dailyHotSelection.ts";
import type { DailyHotViewFace } from "../face.ts";
import type { CreatorKey } from "../locales.ts";
import { selectTrellisProject } from "../trellisSelection.ts";
import { IslandButton, IslandCard, IslandSkeleton, IslandTag } from "../ui/IslandControls.tsx";
import "./DailyHotPanel.css";

interface DailyHotItemButtonProps {
  item: DailyHotItem;
  featured: boolean;
  selected: boolean;
  t: (key: CreatorKey) => string;
}

function DailyHotItemButton({ item, featured, selected, t }: DailyHotItemButtonProps) {
  return (
    <IslandButton
      type="default"
      className={`dailyHotItem${featured ? " featured" : ""}${selected ? " selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${t("hot.openDetail")}：${item.title}`}
      onClick={() => {
        setSelectedContentId(null);
        selectTrellisProject(null);
        selectDailyHotItem(item);
      }}
    >
      <span className="dailyHotItemTitle">{item.title}</span>
      <span className="dailyHotItemMeta">
        <span>{item.evidence.label}</span>
        <span>{item.source.name}</span>
        <time dateTime={dailyHotItemTimestamp(item) ?? undefined}>
          {formatDailyHotCompactTime(dailyHotItemTimestamp(item))}
        </time>
      </span>
    </IslandButton>
  );
}

interface DailyHotTierProps {
  id: string;
  items: DailyHotItem[];
  label: string;
  featured?: boolean;
  emptyLabel: string;
  selectedId: string | null;
  t: (key: CreatorKey) => string;
}

function DailyHotTier({ id, items, label, featured = false, emptyLabel, selectedId, t }: DailyHotTierProps) {
  return (
    <section className="dailyHotTier" aria-labelledby={id}>
      <header>
        <h3 id={id}>{label}</h3>
        <IslandTag size="small" color="brown" variant="soft">{items.length}</IslandTag>
      </header>
      {items.length === 0
        ? <p className="dailyHotTierEmpty">{emptyLabel}</p>
        : <div className="dailyHotTierItems">
            {items.map((item) => (
              <DailyHotItemButton
                key={item.id}
                item={item}
                featured={featured}
                selected={selectedId === item.id}
                t={t}
              />
            ))}
          </div>}
    </section>
  );
}

export interface DailyHotPanelProps {
  face: DailyHotViewFace;
  t: (key: CreatorKey) => string;
}

/** Read-only AIHOT triage panel for the Muzi sidebar. */
export function DailyHotPanel({ face, t }: DailyHotPanelProps) {
  const [data, setData] = useState<DailyHotResult | null>(null);
  const dataRef = useRef<DailyHotResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const requestEpoch = useRef(0);
  const selected = useDailyHotSelection();
  const otherId = useId();

  useEffect(() => { dataRef.current = data; }, [data]);

  const load = useCallback(async (refresh: boolean) => {
    const epoch = requestEpoch.current + 1;
    requestEpoch.current = epoch;
    if (dataRef.current === null) setLoading(true);
    if (refresh) setRefreshing(true);
    try {
      if (!face.ready()) throw new Error(t("hot.error.connecting"));
      const next = await face.getDailyHot(refresh);
      if (requestEpoch.current !== epoch) return;
      dataRef.current = next;
      setData(next);
      setError(null);
      const current = getSelectedDailyHotItem();
      if (current !== null) {
        selectDailyHotItem(dailyHotItems(next).find((item) => item.id === current.id) ?? null);
      }
    } catch (cause) {
      if (requestEpoch.current === epoch) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (requestEpoch.current === epoch) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [face, t]);

  useEffect(() => {
    void load(false);
    return () => { requestEpoch.current += 1; };
  }, [load]);

  const allItems = useMemo(() => data === null ? [] : dailyHotItems(data), [data]);
  const connectedLabel = data?.status === "stale" ? t("hot.status.stale") : t("hot.status.connected");
  const hasItems = allItems.length > 0;

  return (
    <div className="muziPanel dailyHotPanel" aria-busy={loading || refreshing}>
      <div className="muziSectionHeader dailyHotHeader">
        <span className="muziSectionLabel">
          <span>{t("hot.title")}</span>
          {data !== null && <span className="dailyHotHeaderCount">{allItems.length}</span>}
        </span>
        <div className="muziHeaderActions">
          <Tooltip label={refreshing ? t("hot.refreshing") : t("hot.refresh")} side="bottom" delayMs={500}>
            <IslandButton
              type="text"
              className={`muziHeaderIcon dailyHotRefresh${refreshing ? " spinning" : ""}`}
              aria-label={refreshing ? t("hot.refreshing") : t("hot.refresh")}
              aria-busy={refreshing}
              disabled={refreshing}
              onClick={() => { void load(true); }}
            >
              <IconRefreshOutline16 size={16} />
            </IslandButton>
          </Tooltip>
        </div>
      </div>

      <div className="dailyHotScroll">
        {loading && data === null && (
          <div className="dailyHotLoading" aria-label={t("hot.loading")}>
            <IslandSkeleton variant="rectangular" width="100%" height="44px" />
            <IslandSkeleton variant="rectangular" width="100%" height="44px" />
            <IslandSkeleton variant="rectangular" width="100%" height="44px" />
          </div>
        )}

        {error !== null && data === null && (
          <IslandCard className="dailyHotError" role="alert">
            <IconWarningOutline16 size={20} />
            <strong>{t("hot.error.title")}</strong>
            <p>{error}</p>
            <IslandButton type="primary" onClick={() => { void load(true); }}>{t("hot.error.retry")}</IslandButton>
          </IslandCard>
        )}

        {data !== null && (
          <>
            <section className={`dailyHotStatus${data.status === "stale" ? " stale" : ""}`} aria-label={connectedLabel}>
              <div className="dailyHotStatusLine">
                <span className="dailyHotStatusDot" aria-hidden="true" />
                <strong>{connectedLabel}</strong>
                <time dateTime={data.fetchedAt}>{formatDailyHotCompactTime(data.fetchedAt)}</time>
              </div>
              <div className="dailyHotCounts" aria-label={t("hot.summary") }>
                <span><b>{data.counts.upstreamHot}</b>{t("hot.count.hot")}</span>
                <span><b>{data.counts.mustRead}</b>{t("hot.count.mustRead")}</span>
                <span><b>{data.counts.upstreamSelected24h}</b>{t("hot.count.selected")}</span>
              </div>
              <a href={data.daily.links.aihot} target="_blank" rel="noreferrer">
                {t("hot.daily")} {data.daily.date ?? "—"} · {String(data.daily.itemCount)} {t("hot.itemUnit")}
              </a>
            </section>

            {data.status === "stale" && (
              <div className="dailyHotWarning" role="status">
                <IconWarningOutline16 size={14} />
                <span>{t("hot.warning.stale")} {data.error?.message ?? ""}</span>
              </div>
            )}
            {error !== null && (
              <div className="dailyHotWarning" role="status">
                <IconWarningOutline16 size={14} />
                <span>{t("hot.warning.local")} {error}</span>
              </div>
            )}

            {!hasItems
              ? <IslandCard className="dailyHotEmpty"><IconLightOutline16 size={22} /><p>{t("hot.empty")}</p></IslandCard>
              : <>
                  <DailyHotTier
                    id="daily-hot-must-read"
                    items={data.tiers.mustRead}
                    label={t("hot.mustRead")}
                    featured
                    emptyLabel={t("hot.mustRead.empty")}
                    selectedId={selected?.id ?? null}
                    t={t}
                  />
                  <DailyHotTier
                    id="daily-hot-browse"
                    items={data.tiers.browse}
                    label={t("hot.browse")}
                    emptyLabel={t("hot.browse.empty")}
                    selectedId={selected?.id ?? null}
                    t={t}
                  />
                  {data.tiers.other.length > 0 && (
                    <section className="dailyHotTier dailyHotOther" aria-labelledby={`${otherId}-label`}>
                      <IslandButton
                        type="text"
                        className="dailyHotOtherToggle"
                        aria-expanded={otherExpanded}
                        aria-controls={otherId}
                        onClick={() => { setOtherExpanded((expanded) => !expanded); }}
                      >
                        <span id={`${otherId}-label`}>{t("hot.other")} · {String(data.tiers.other.length)}</span>
                        <span>{otherExpanded ? t("hot.other.hide") : t("hot.other.show")}</span>
                        <IconChevronDownOutline14 className={otherExpanded ? "open" : ""} aria-hidden="true" />
                      </IslandButton>
                      {otherExpanded && (
                        <div id={otherId} className="dailyHotTierItems">
                          {data.tiers.other.map((item) => (
                            <DailyHotItemButton
                              key={item.id}
                              item={item}
                              featured={false}
                              selected={selected?.id === item.id}
                              t={t}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </>}

            <p className="dailyHotFootnote">{t("hot.disclaimer.short")}</p>
          </>
        )}
      </div>
    </div>
  );
}
