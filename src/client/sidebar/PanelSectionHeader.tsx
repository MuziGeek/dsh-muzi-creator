import { WorkbenchIcon } from "../ui/WorkbenchIcon.tsx";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { IslandButton, IslandCard, IslandInput } from "../ui/IslandControls.tsx";

export interface PanelSectionHeaderProps {
  label: string;
  query: string;
  searchLabel: string;
  searchName: string;
  searchPlaceholder: string;
  searchButtonText?: string;
  clearSearchLabel?: string;
  clearSearchText?: string;
  actions?: ReactNode;
  refreshLabel?: string;
  refreshText?: string;
  refreshing?: boolean;
  viewLabel?: string;
  viewContent?: ReactNode;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
}

/** Shared Animal Island section chrome for search and list actions. */
export function PanelSectionHeader({
  label,
  query,
  searchLabel,
  searchName,
  searchPlaceholder,
  searchButtonText = "搜索",
  clearSearchLabel = "清除搜索",
  clearSearchText = "清除",
  actions,
  refreshLabel,
  refreshText = "刷新",
  refreshing = false,
  viewLabel,
  viewContent,
  onQueryChange,
  onRefresh,
}: PanelSectionHeaderProps) {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const viewId = useId();
  const searchInputId = useId();
  const searchButtonId = useId();
  const viewButtonId = useId();
  const closeView = useCallback((): void => {
    setViewOpen(false);
    window.requestAnimationFrame(() => { document.getElementById(viewButtonId)?.focus(); });
  }, [viewButtonId]);

  useEffect(() => {
    if (!viewOpen) return undefined;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeView();
    };
    document.addEventListener("keydown", handleEscape);
    return () => { document.removeEventListener("keydown", handleEscape); };
  }, [closeView, viewOpen]);

  const expandSearch = (): void => {
    setViewOpen(false);
    setSearchExpanded(true);
    window.setTimeout(() => { document.getElementById(searchInputId)?.focus(); }, 0);
  };

  const closeSearch = (): void => {
    onQueryChange("");
    setSearchExpanded(false);
    window.requestAnimationFrame(() => { document.getElementById(searchButtonId)?.focus(); });
  };

  return (
    <div className="muziPanelHeader">
      <div className="muziSectionHeader">
        <span className={searchExpanded ? "muziSectionLabel hidden" : "muziSectionLabel"}>
          <span>{label}</span>
        </span>
        <div className={searchExpanded ? "muziSearchSlot expanded" : "muziSearchSlot"}>
          <div className={searchExpanded ? "muziSearch expanded" : "muziSearch"}>
            <IslandButton id={searchButtonId} type="text" size="small" className={searchButtonText === "" ? "muziSearchButton muziSearchButtonIconOnly" : "muziSearchButton"} aria-label={searchLabel} title={searchLabel} aria-expanded={searchExpanded} aria-controls={searchExpanded ? searchInputId : undefined} icon={<WorkbenchIcon name="search" />} onClick={expandSearch}>
              {searchButtonText}
            </IslandButton>
            {searchExpanded && <IslandInput
              id={searchInputId}
              className="muziSearchInput"
              type="text"
              name={searchName}
              aria-label={searchLabel}
              autoComplete="off"
              spellCheck={false}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) => { onQueryChange(event.target.value); }}
              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => { if (event.key === "Escape") closeSearch(); }}
            />}
            {searchExpanded && (
              <IslandButton icon={<WorkbenchIcon name="clear" />} type="text" size="small" className="muziClearButton" aria-label={clearSearchLabel} onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); closeSearch(); }}>
                {clearSearchText}
              </IslandButton>
            )}
          </div>
        </div>
        <div className={searchExpanded ? "muziHeaderActions hidden" : "muziHeaderActions"}>
          {refreshLabel !== undefined && viewContent === undefined && (
            <IslandButton icon={<WorkbenchIcon name="refresh" />} type="text" size="small" className="muziHeaderIcon" aria-label={refreshLabel} disabled={refreshing} aria-busy={refreshing} onClick={onRefresh}>
              {refreshText}
            </IslandButton>
          )}
          {viewLabel !== undefined && viewContent !== undefined && (
            <IslandButton icon={<WorkbenchIcon name="view-options" />} id={viewButtonId} type="text" size="small" className="muziHeaderIcon" aria-label={viewLabel} aria-expanded={viewOpen} aria-controls={viewId} onClick={() => { setViewOpen((open) => !open); }}>
              视图
            </IslandButton>
          )}
          {actions}
        </div>
      </div>
      {viewOpen && viewLabel !== undefined && viewContent !== undefined && (
        <IslandCard id={viewId} className="muziViewDisclosure" role="group" aria-label={viewLabel}>
          {viewContent}
          <IslandButton icon={<WorkbenchIcon name="refresh" />} type="text" size="small" className="muziViewRefresh" aria-label={refreshLabel ?? "刷新"} onClick={onRefresh}>
              刷新
          </IslandButton>
        </IslandCard>
      )}
    </div>
  );
}
