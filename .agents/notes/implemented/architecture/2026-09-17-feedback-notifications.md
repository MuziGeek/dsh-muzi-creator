# Agent Note: Feedback notifications and critical-state presentation

Status: implemented

## Problem

Settings and workbench actions mixed transient success messages with loading, validation, and critical-state content in page-local regions. Repeated actions could leave stale feedback visible and the host notification portal did not inherit the plugin theme scope.

## Decision

Use one client-only `showMuziNotification` adapter for transient `success`, `info`, `warning`, and `error` results. The adapter delegates rendering and lifecycle to Animal Island UI, assigns stable action keys, applies the plugin marker to the host notification portal, and maintains localized live-region and close-button semantics. Success and informational results use three seconds; warnings and errors use five seconds unless a caller supplies a duration.

Keep loading, validation, retry-required, authorization, unknown-result, and other critical states in their existing page-local regions. Critical states use text, background, border, and an icon-like marker together, and may also emit one notification to make the state discoverable without replacing the recovery content.

## Consequences

Settings, GitHub source, inspiration, account, project, and publish flows share consistent transient feedback while preserving their existing data and authorization paths. The notification stylesheet is imported from the client adapter so `tsdown` includes it in the installed client bundle, and the settings section styles are mirrored in the bundled appearance aggregate. Desktop acceptance is pinned to the locally installed DSH Desktop 2.0.10 executable; the host skin and Harness package baselines remain independently documented.
