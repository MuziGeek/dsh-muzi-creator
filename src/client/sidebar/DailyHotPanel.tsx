import { useCallback, useEffect, useId, useMemo, useState } from "react";

import type { DailyHotItem, DailyHotResult } from "../../dailyHotTypes.ts";
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
import type { ReadonlyResource } from "../workbench/WorkbenchData.ts";
import { useResourceSnapshot } from "../workbench/WorkbenchData.ts";
import { sidebarItemElementId } from "../workbench/sidebarLayoutBridge.ts";
import {
  IslandButton,
  IslandSelectableCard,
  IslandSkeleton,
  IslandState,
  IslandTag,
} from "../ui/IslandControls.tsx";
import "./DailyHotPanel.css";

interface DailyHotItemButtonProps {
  item: DailyHotItem;
  featured: boolean;
  selected: boolean;
  t: (key: CreatorKey) => string;
}

function DailyHotItemButton({ item, featured, selected, t }: DailyHotItemButtonProps) {
  return (
    <IslandSelectableCard
      id={sidebarItemElementId("hot", item.id)}
      className={`dailyHotItem${featured ? " featured" : ""}${selected ? " selected" : ""}`}
      aria-label={`${t("hot.openDetail")}：${item.title}`}
      selected={selected}
      selectedColor="lime-green"
      onSelect={() => {
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
    </IslandSelectableCard>
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
  resource: ReadonlyResource<DailyHotResult>;
}

/** Read-only AIHOT triage panel for the Muzi sidebar. */
export function DailyHotPanel({ t, resource }: DailyHotPanelProps) {
  const { data, loading, refreshing, error } = useResourceSnapshot(resource);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const selected = useDailyHotSelection();
  const otherId = useId();

  const load = useCallback(async (refresh: boolean) => {
    try {
      const next = await resource.load(refresh);
      const selectedId = getSelectedDailyHotItem()?.id;
      if (selectedId !== undefined) selectDailyHotItem(dailyHotItems(next).find((item) => item.id === selectedId) ?? null);
    } catch {
      // The shared resource publishes the scoped error while retaining its last value.
    }
  }, [resource]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const allItems = useMemo(() => data === null ? [] : dailyHotItems(data), [data]);
  const connectedLabel = data?.status === "stale" ? t("hot.status.stale") : t("hot.status.connected");
  const hasItems = allItems.length > 0;

  return (
    <div className="muziPanel dailyHotPanel" aria-busy={loading || refreshing}>
      <div className="muziSectionHeader dailyHotHeader">
        <span className="muziSectionLabel">
          <span>{t("hot.title")}</span>
          {data !== null && <IslandTag className="dailyHotHeaderCount" size="small" color="brown" variant="soft">{allItems.length}</IslandTag>}
        </span>
        <div className="muziHeaderActions">
          <IslandButton
            type="text"
            size="small"
            className="dailyHotRefresh"
            aria-label={refreshing ? t("hot.refreshing") : t("hot.refresh")}
            aria-busy={refreshing}
            disabled={refreshing}
            onClick={() => { void load(true); }}
          >
            {refreshing ? t("hot.refreshing") : t("hot.refresh")}
          </IslandButton>
        </div>
      </div>

      <div className="dailyHotScroll">
        {loading && data === null && (
          <div className="dailyHotLoading" aria-label={t("hot.loading")}>
            <IslandSkeleton variant="rect" widthValue="100%" heightValue={68} />
            <IslandSkeleton variant="rect" widthValue="100%" heightValue={68} />
            <IslandSkeleton variant="rect" widthValue="100%" heightValue={68} />
          </div>
        )}

        {error !== null && data === null && (
          <IslandState
            kind="error"
            title={t("hot.error.title")}
            message={error}
            action={<IslandButton type="primary" onClick={() => { void load(true); }}>{t("hot.error.retry")}</IslandButton>}
          />
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
                <span>{t("hot.warning.stale")} {data.error?.message ?? ""}</span>
              </div>
            )}
            {error !== null && (
              <div className="dailyHotWarning" role="status">
                <span>{t("hot.warning.local")} {error}</span>
              </div>
            )}

            {!hasItems
              ? <IslandState kind="empty" title={t("hot.empty")} />
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
