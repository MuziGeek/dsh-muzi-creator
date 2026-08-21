import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconCloseFill14,
  IconPersonalizationOutline16,
  IconProjectAddOutline16,
  IconRefreshOutline16,
  IconSearchOutline16,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";

export interface PanelSectionHeaderProps {
  label: string;
  query: string;
  searchLabel: string;
  searchPlaceholder: string;
  addLabel: string;
  viewLabel: string;
  viewContent: ReactNode;
  onQueryChange: (query: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
}

/** Shared section chrome matching the native DSH workspace browser. */
export function PanelSectionHeader({
  label,
  query,
  searchLabel,
  searchPlaceholder,
  addLabel,
  viewLabel,
  viewContent,
  onQueryChange,
  onAdd,
  onRefresh,
}: PanelSectionHeaderProps) {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const viewRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewOpen) return;
    const close = (event: PointerEvent): void => {
      if (event.target instanceof Node && !viewRoot.current?.contains(event.target)) setViewOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("pointerdown", close); };
  }, [viewOpen]);

  const expandSearch = (): void => {
    setViewOpen(false);
    setSearchExpanded(true);
    window.setTimeout(() => { searchInput.current?.focus(); }, 0);
  };

  const closeSearch = (): void => {
    onQueryChange("");
    setSearchExpanded(false);
  };

  return (
    <div className="muziSectionHeader">
      <span className={searchExpanded ? "muziSectionLabel hidden" : "muziSectionLabel"}>{label}</span>
      <div className={searchExpanded ? "muziSearchSlot expanded" : "muziSearchSlot"}>
        <div className={searchExpanded ? "muziSearch expanded" : "muziSearch"} onClick={expandSearch}>
          <Tooltip label={searchLabel} side="bottom" delayMs={500} disabled={searchExpanded}>
            <button type="button" className="muziSearchButton" aria-label={searchLabel} aria-expanded={searchExpanded} onClick={expandSearch}>
              <IconSearchOutline16 size={searchExpanded ? 11 : 14} />
            </button>
          </Tooltip>
          <input
            ref={searchInput}
            className="muziSearchInput"
            type="text"
            placeholder={searchPlaceholder}
            value={query}
            tabIndex={searchExpanded ? 0 : -1}
            onChange={(event) => { onQueryChange(event.target.value); }}
            onKeyDown={(event) => { if (event.key === "Escape") closeSearch(); }}
          />
          {searchExpanded && (
            <button type="button" className="muziClearButton" aria-label="清除搜索" onClick={(event) => { event.stopPropagation(); closeSearch(); }}>
              <IconCloseFill14 />
            </button>
          )}
        </div>
      </div>
      <div className={searchExpanded ? "muziHeaderActions hidden" : "muziHeaderActions"}>
        <div className="muziViewRoot" ref={viewRoot}>
          <Tooltip label={viewLabel} side="bottom" delayMs={500}>
            <button type="button" className="muziHeaderIcon" aria-label={viewLabel} aria-expanded={viewOpen} onClick={() => { setViewOpen((open) => !open); }}>
              <IconPersonalizationOutline16 size={16} />
            </button>
          </Tooltip>
          {viewOpen && (
            <div className="muziViewMenu" role="menu">
              {viewContent}
              <button type="button" role="menuitem" className="muziViewMenuItem" onClick={() => { setViewOpen(false); onRefresh(); }}>
                <IconRefreshOutline16 size={16} />
                刷新
              </button>
            </div>
          )}
        </div>
        <Tooltip label={addLabel} side="bottom" delayMs={500}>
          <button type="button" className="muziHeaderIcon" aria-label={addLabel} onClick={onAdd}>
            <IconProjectAddOutline16 size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
