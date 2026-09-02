/** The DSH Desktop release whose host selectors this skin has been checked against. */
export const DSH_HOST_SKIN_VERSION = "2.0.4" as const;

export type HostSkinSelectorKind = "semantic" | "structural";

/**
 * A stable, host-owned selector used by the optional Animal Island host skin.
 *
 * Appearance selectors exclude this plugin's own root and portal so its Animal
 * components keep their component-level appearance. Narrow-screen shell
 * selectors may target the plugin root only to preserve conversation width.
 */
export interface HostSkinSelector {
  readonly selector: string;
  readonly surface: string;
  readonly purpose: string;
  readonly version: typeof DSH_HOST_SKIN_VERSION;
  readonly kind: HostSkinSelectorKind;
}

const host = 'body[data-muzi-host-skin="animal-island"]';
const outsidePlugin = ':not([data-plugin="dsh-muzi-creator"]):not([data-plugin="dsh-muzi-creator"] *):not([data-plugin-modal="dsh-muzi-creator"]):not([data-plugin-modal="dsh-muzi-creator"] *)';
const hostElement = `${host} ${outsidePlugin}`;
const hostTarget = (target: string) => `${host} ${target}${outsidePlugin}`;
const expandedNarrowSidebar = `${host} [data-plugin="dsh-muzi-creator"][data-surface="sidebar"][data-sidebar-expanded="true"]`;
const expandedNarrowFrame = `${host} [data-details-collapsed]:has([data-plugin="dsh-muzi-creator"][data-surface="sidebar"][data-sidebar-expanded="true"])`;
const expandedNarrowConversation = `${expandedNarrowFrame} > :has(> [data-slot="conversation"])`;

/**
 * The full selector inventory for the fixed DSH Desktop 2.0.4 compatibility skin.
 *
 * No structural selector is needed: the host exposes sufficient data and ARIA
 * semantics for each surface this skin adjusts.
 */
export const dsh204HostSkinSelectors = [
  { selector: host, surface: "page", purpose: "constrain page overflow", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostElement, surface: "host typography", purpose: "apply the host font outside the plugin", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget(':where(button, input, select)'), surface: "controls", purpose: "align native control size and corner radius", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget("textarea"), surface: "composer", purpose: "keep host composer textareas usable and wrapping", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget("form:has(textarea)"), surface: "composer", purpose: "constrain the semantic composer container", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget('[role="dialog"]'), surface: "dialog", purpose: "keep dialog content within narrow screens", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget('[aria-modal="true"]'), surface: "modal", purpose: "keep modal content within narrow screens", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget('[role="menu"]'), surface: "menu", purpose: "round menus without changing their stacking", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget('[role="menuitem"]'), surface: "menu item", purpose: "preserve readable wrapping in menu actions", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget('[role="tooltip"]'), surface: "tooltip", purpose: "limit tooltip width and wrap long copy", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget(':where([role="status"], [role="alert"])'), surface: "toast", purpose: "keep live announcements readable", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget("aside"), surface: "aside", purpose: "prevent side content from widening the page", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget(':where(button, input, select, textarea, [tabindex]):focus-visible'), surface: "focus", purpose: "provide a token-backed visible focus ring", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: hostTarget(":where(p, li, dd, dt, pre, code, blockquote)"), surface: "long text", purpose: "wrap unbroken host content", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: `${hostElement}`, surface: "scrollbar", purpose: "use host token colors for scrollbars", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: expandedNarrowConversation, surface: "narrow conversation", purpose: "preserve the full conversation width while the sidebar is expanded", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
  { selector: expandedNarrowSidebar, surface: "narrow sidebar", purpose: "overlay the expanded sidebar without hiding its collapse control", version: DSH_HOST_SKIN_VERSION, kind: "semantic" },
] as const satisfies readonly HostSkinSelector[];
