/** Minimum readable conversation width beside an open inspector. */
export const CONVERSATION_MIN = 440;

/** Minimum inspector width in split view. */
export const INSPECTOR_MIN = 420;

/** Maximum user-preferred inspector width. */
export const INSPECTOR_MAX = 800;

/** Default inspector width before a user preference is stored. */
export const INSPECTOR_DEFAULT = 640;

/** Rendered inspector placement for the current viewport. */
export interface InspectorLayout {
  mode: "split" | "full";
  width: number;
  maxWidth: number;
}

/** Clamp a persisted inspector preference independently of the viewport. */
export function clampInspectorPreference(px: number): number {
  return Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, Math.round(px)));
}

/** Resolve a viewport-safe inspector width without changing the stored preference. */
export function resolveInspectorLayout(
  viewportWidth: number,
  sidebarWidth: number,
  preferredWidth: number,
): InspectorLayout {
  const safeViewport = Math.max(0, Math.round(viewportWidth));
  const safeSidebar = Math.max(0, Math.round(sidebarWidth));
  const availableSplitWidth = safeViewport - safeSidebar - CONVERSATION_MIN;
  const maxWidth = Math.min(INSPECTOR_MAX, availableSplitWidth);
  if (maxWidth < INSPECTOR_MIN) {
    return { mode: "full", width: safeViewport, maxWidth: safeViewport };
  }
  return {
    mode: "split",
    width: Math.min(maxWidth, clampInspectorPreference(preferredWidth)),
    maxWidth,
  };
}
