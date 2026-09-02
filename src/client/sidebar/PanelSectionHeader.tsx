import {
  useId,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { IslandButton, IslandCard, IslandInput, IslandTag } from "../ui/IslandControls.tsx";

export interface PanelSectionHeaderProps {
  label: string;
  count?: number;
  query: string;
  searchLabel: string;
  searchName: string;
  searchPlaceholder: string;
  addLabel?: string;
  refreshLabel?: string;
  viewLabel?: string;
  viewContent?: ReactNode;
  previewLabel?: string;
  onQueryChange: (query: string) => void;
  onAdd?: () => void;
  onRefresh: () => void;
  onPreview?: () => void;
}

/** Shared Animal Island section chrome for search and list actions. */
export function PanelSectionHeader({
  label,
  count,
  query,
  searchLabel,
  searchName,
  searchPlaceholder,
  addLabel,
  refreshLabel,
  viewLabel,
  viewContent,
  previewLabel,
  onQueryChange,
  onAdd,
  onRefresh,
  onPreview,
}: PanelSectionHeaderProps) {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const viewId = useId();
  const searchInputId = useId();
  const searchButtonId = useId();
  const viewButtonId = useId();
  const closeView = (): void => {
    setViewOpen(false);
    window.requestAnimationFrame(() => { document.getElementById(viewButtonId)?.focus(); });
  };

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
          {count !== undefined && <IslandTag className="muziSectionCount" size="small" color="brown" variant="soft">{count}</IslandTag>}
        </span>
        <div className={searchExpanded ? "muziSearchSlot expanded" : "muziSearchSlot"}>
          <div className={searchExpanded ? "muziSearch expanded" : "muziSearch"}>
            <IslandButton id={searchButtonId} type="text" size="small" className="muziSearchButton" aria-label={searchLabel} aria-expanded={searchExpanded} onClick={expandSearch}>
              {searchExpanded ? "搜索中" : "搜索"}
            </IslandButton>
            <IslandInput
              id={searchInputId}
              className="muziSearchInput"
              type="text"
              name={searchName}
              aria-label={searchLabel}
              autoComplete="off"
              spellCheck={false}
              placeholder={searchPlaceholder}
              value={query}
              tabIndex={searchExpanded ? 0 : -1}
              onChange={(event: ChangeEvent<HTMLInputElement>) => { onQueryChange(event.target.value); }}
              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => { if (event.key === "Escape") closeSearch(); }}
            />
            {searchExpanded && (
              <IslandButton type="text" size="small" className="muziClearButton" aria-label="清除搜索" onClick={(event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); closeSearch(); }}>
                清除
              </IslandButton>
            )}
          </div>
        </div>
        <div className={searchExpanded ? "muziHeaderActions hidden" : "muziHeaderActions"}>
          {refreshLabel !== undefined && viewContent === undefined && (
            <IslandButton type="text" size="small" className="muziHeaderIcon" aria-label={refreshLabel} onClick={onRefresh}>
              刷新
            </IslandButton>
          )}
          {viewLabel !== undefined && viewContent !== undefined && (
            <IslandButton id={viewButtonId} type="text" size="small" className="muziHeaderIcon" aria-label={viewLabel} aria-expanded={viewOpen} aria-controls={viewId} onClick={() => { setViewOpen((open) => !open); }}>
              视图
            </IslandButton>
          )}
          {previewLabel !== undefined && onPreview !== undefined && (
            <IslandButton type="text" size="small" className="muziHeaderIcon" aria-label={previewLabel} onClick={onPreview}>
              预览
            </IslandButton>
          )}
          {addLabel !== undefined && onAdd !== undefined && (
            <IslandButton type="text" size="small" className="muziHeaderIcon" aria-label={addLabel} onClick={onAdd}>
              新增
            </IslandButton>
          )}
        </div>
      </div>
      {viewOpen && viewLabel !== undefined && viewContent !== undefined && (
        <IslandCard id={viewId} className="muziViewDisclosure" role="group" aria-label={viewLabel} onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          closeView();
        }}>
          {viewContent}
          <IslandButton type="text" size="small" className="muziViewRefresh" aria-label={refreshLabel ?? "刷新"} onClick={onRefresh}>
              刷新
          </IslandButton>
        </IslandCard>
      )}
    </div>
  );
}
