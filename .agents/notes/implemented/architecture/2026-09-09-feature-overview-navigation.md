# Feature overview navigation

Sidebar feature activation clears the destination detail before switching the central workbench. Repeated activation and keyboard navigation use the same path. Selection setters and programmatic tab changes retain their existing behavior so refresh restoration, card navigation and account-management links remain available. Sessions preserve the official Agent state.

A persisted hotspot identity can exist before its data object loads. Clearing that selection must compare both the object and the identity; a null object alone does not mean the overview is selected.

Feature headers use one row for the title and actions. Session controls retain their host icons and accessible names without injected title artwork or action labels. Visual rules are documented in DESIGN.md; navigation behavior is documented in docs/usage.md.
