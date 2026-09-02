interface SidebarLayoutActions {
  collapsed: boolean;
  toggle: () => void;
}

let actions: SidebarLayoutActions | null = null;
let pendingFocus: { feature: string; key: string } | null = null;

/** Distinguish an item activation from navigation to another feature's remembered detail. */
export function isNewDetailSelection(
  previousFeature: string,
  previousKey: string | null,
  nextFeature: string,
  nextKey: string | null,
): boolean {
  return nextKey !== null && previousFeature === nextFeature && previousKey !== nextKey;
}

/** Stable id shared by a sidebar row and the central focus-restoration controller. */
export function sidebarItemElementId(feature: string, key: string): string {
  return `muzi-sidebar-${feature}-${encodeURIComponent(key)}`;
}

function focusPendingItem(): void {
  if (pendingFocus === null || typeof window === "undefined" || typeof document === "undefined") return;
  const target = pendingFocus;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.getElementById(sidebarItemElementId(target.feature, target.key))?.focus();
    });
  });
}

/** Bind the current official sidebar concession without reading host DOM. */
export function bindSidebarLayout(actionsValue: SidebarLayoutActions): () => void {
  actions = actionsValue;
  return () => {
    if (actions === actionsValue) actions = null;
  };
}

/** Compact the official sidebar only for a user-initiated detail selection. */
export function compactSidebarForDetail(): void {
  if (typeof window === "undefined" || window.innerWidth >= 880 || actions?.collapsed !== false) return;
  actions.toggle();
}

/** Reveal the list through the same official layout action used by the sidebar control. */
export function expandSidebarList(): void {
  if (actions?.collapsed === true) actions.toggle();
  focusPendingItem();
}

/** Remember a detail's source row without stealing focus from its central heading. */
export function rememberSidebarItemFocus(feature: string, key: string): void {
  pendingFocus = { feature, key };
}

/** Restore focus now when the list is visible, or after the next explicit expansion. */
export function restoreSidebarItemFocus(feature: string, key: string): void {
  rememberSidebarItemFocus(feature, key);
  if (actions?.collapsed !== true) focusPendingItem();
}
