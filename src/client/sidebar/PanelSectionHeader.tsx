import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { IslandButton, IslandInput, IslandTag } from "../ui/IslandControls.tsx";
import {
  IconCloseFill14,
  IconBrowseOutline16,
  IconPersonalizationOutline16,
  IconProjectAddOutline16,
  IconRefreshOutline16,
  IconSearchOutline16,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";

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

/** Shared section chrome matching the native DSH workspace browser. */
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
  const viewRoot = useRef<HTMLDivElement>(null);
  const viewId = useId();
  const searchInputId = useId();
  const searchButtonId = useId();
  const viewButtonId = useId();

  useEffect(() => {
    if (!viewOpen) return;
    const close = (event: PointerEvent): void => {
      if (event.target instanceof Node && !viewRoot.current?.contains(event.target)) setViewOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setViewOpen(false);
      document.getElementById(viewButtonId)?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [viewOpen]);

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
    <div className="muziSectionHeader">
      <span className={searchExpanded ? "muziSectionLabel hidden" : "muziSectionLabel"}>
        <span>{label}</span>
        {count !== undefined && <IslandTag className="muziSectionCount" size="small" color="brown" variant="soft">{count}</IslandTag>}
      </span>
      <div className={searchExpanded ? "muziSearchSlot expanded" : "muziSearchSlot"}>
        <div className={searchExpanded ? "muziSearch expanded" : "muziSearch"}>
          <Tooltip label={searchLabel} side="bottom" delayMs={500} disabled={searchExpanded}>
            <IslandButton id={searchButtonId} type="text" size="small" className="muziSearchButton" aria-label={searchLabel} aria-expanded={searchExpanded} onClick={expandSearch}>
              <IconSearchOutline16 size={searchExpanded ? 11 : 14} />
            </IslandButton>
          </Tooltip>
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
              <IconCloseFill14 />
            </IslandButton>
          )}
        </div>
      </div>
      <div className={searchExpanded ? "muziHeaderActions hidden" : "muziHeaderActions"}>
        {refreshLabel !== undefined && (
          <Tooltip label={refreshLabel} side="bottom" delayMs={500}>
            <IslandButton type="text" size="small" className="muziHeaderIcon" aria-label={refreshLabel} onClick={onRefresh}>
              <IconRefreshOutline16 size={16} />
            </IslandButton>
          </Tooltip>
        )}
        {viewLabel !== undefined && viewContent !== undefined && <div className="muziViewRoot" ref={viewRoot}>
          <Tooltip label={viewLabel} side="bottom" delayMs={500}>
            <IslandButton id={viewButtonId} type="text" size="small" className="muziHeaderIcon" aria-label={viewLabel} aria-expanded={viewOpen} aria-controls={viewId} onClick={() => { setViewOpen((open) => !open); }}>
              <IconPersonalizationOutline16 size={16} />
            </IslandButton>
          </Tooltip>
          {viewOpen && (
            <div id={viewId} className="muziViewMenu" role="group" aria-label={viewLabel}>
              {viewContent}
              <IslandButton type="text" size="small" className="muziViewMenuItem" onClick={() => { setViewOpen(false); onRefresh(); }}>
                <IconRefreshOutline16 size={16} />
                刷新
              </IslandButton>
            </div>
          )}
        </div>}
        {previewLabel !== undefined && onPreview !== undefined && (
          <Tooltip label={previewLabel} side="bottom" delayMs={500}>
            <IslandButton type="text" size="small" className="muziHeaderIcon" aria-label={previewLabel} onClick={onPreview}>
              <IconBrowseOutline16 size={16} />
            </IslandButton>
          </Tooltip>
        )}
        {addLabel !== undefined && onAdd !== undefined && (
          <Tooltip label={addLabel} side="bottom" delayMs={500}>
            <IslandButton type="text" size="small" className="muziHeaderIcon" aria-label={addLabel} onClick={onAdd}>
              <IconProjectAddOutline16 size={16} />
            </IslandButton>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
