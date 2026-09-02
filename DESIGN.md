# Muzi Creator Animal Island UI Lab

This Lab is an isolated visual and interaction harness for Muzi Creator. It supplies no credentials and authorizes no publishing, synchronization, or archive action.

## Visual system

The application imports `animal-island-ui/style` once at the client entry. Library components own their `--animal-*` tokens; Muzi layout CSS uses scoped `--muzi-island-*` aliases for warm parchment backgrounds, earth-brown text, mint-teal actions, rounded controls, and yellow or mint focus rings. UI text uses Nunito with Noto Sans SC; pure-black text, cold-gray surfaces, and cold-blue focus rings are not part of this system.

The package is `animal-island-ui@1.6.0`, licensed CC BY-NC 4.0 by guokaigdg. Muzi Creator code remains MIT; `NOTICE` is the attribution record.

## Component map

| Surface | Preferred component | Notes |
| --- | --- | --- |
| Content, knowledge, hot and project cards | `IslandSelectableCard` over `Card` | Provides `button`, `aria-pressed`, roving focus compatibility, and Enter/Space selection without restyling the library card. |
| Status, stage, file and source labels | `Tag` | Keep status meaning in text, not color alone. |
| Search and controlled text fields | `Input` | Controlled value and change handler are required. |
| Platform, account and mode choices | `Select` | Controlled `options`, `value`, and `onChange`; unavailable choices stay visible as explanatory text but are excluded from the focusable option list. |
| Enable/confirm choices | `Checkbox` / `Switch` | Preserve the external-action safety defaults. |
| Actions | `Button` | Primary depth shadow is reserved for primary/danger actions. |
| Loading | `Skeleton` / `Loading` | Do not replace meaningful error or unavailable states with an indefinite spinner. |
| Loading, error, empty and information messages | `IslandState` | Keeps live-region semantics and optional recovery actions consistent. |
| Details and confirmation | `Modal` / `Drawer` | Keep focus, cancellation, and one-time confirmation behavior. |
| Icons | `Icon` | Use package-root exports; no deep imports, emoji, or hand-drawn replacement icons. |
| Multiline editor | `IslandTextarea` | Controlled native textarea exception with a shared theme, label and focus treatment. |

Native `datetime-local`, the controlled textarea inside `IslandTextarea`, and the 3D graph canvas remain because the library has no behavior-equivalent component. The graph retains its keyboard fallback; date and textarea fields retain labels, focus visibility and DOM coverage. No other raw form control is part of the plugin UI.

## Layout and responsive constraints

The host-provided sidebar width is authoritative: 360 px is the primary expanded design width and 56 px is the settled rail. Inspectors persist a 640 px preference, clamp split view to 480–800 px, and leave at least 440 px of the host conversation visible. The overlay owns only its own width and position; it never queries the conversation scrollport or writes styles into the conversation DOM. If those minima do not fit, the inspector becomes viewport-wide. Viewport breakpoints handle the shell while a named Inspector container query stacks its own content below 560 px, including a 480 px split Inspector inside a wide Desktop window. At 880/620/560/430 px the internal layouts stack or reduce padding without creating page-level horizontal overflow. The graph canvas has a keyboard-accessible fallback and retains loading, empty, unavailable, and reduced-motion states.

Tabs remain one line, scroll horizontally, and use the library keyboard behavior for Arrow keys, Home and End. Long Chinese or English titles, URLs, source labels and Windows paths either wrap at safe boundaries or truncate inside a `min-width: 0` container. Card shadows are not added by plugin CSS; depth remains owned by Animal Island primary or danger actions.

## Theme and portal boundary

The client installs one `ThemeRuntime.overrideTokens()` layer and marks `body` with `data-muzi-host-skin="animal-island"`. The layer maps the DSH application, panel, message, input, menu, Markdown, scrollbar and status tokens to an explicit light and dark Animal Island palette without changing the user's light, dark or system preference. Unloading the plugin removes the token layer and restores the exact body attribute value that existed before installation.

The DSH Desktop 2.0.4 compatibility stylesheet is scoped by that body marker. It may style stable semantic host anchors such as controls, dialogs, menus, tooltips and details regions, but it must not use generated CSS Module hashes, hide functional elements, intercept input, or replace the official conversation, composer, approval, settings or details components. The version-pinned selector manifest records every semantic or structural anchor; a missing required selector fails the compatibility test instead of widening the stylesheet silently.

All plugin roots carry `data-plugin="dsh-muzi-creator"`. Body portals additionally carry `data-plugin-modal="dsh-muzi-creator"`; appearance rules exclude both so Animal Island components continue to own their colors, radii and depth. The only plugin-root exception is a layout-only rule that positions an expanded 360 px sidebar over the conversation below 640 px instead of shrinking the conversation; collapsing it restores the host's 56 px rail. Animal Island 1.6.0 uses fixed-palette cream cards, tabs and Modal shells. The shared adapter keeps their matching brown text palette in a dark host and uses the library's high-contrast lime card for selection. The narrow DSH settings host may expose less than 100 px of inline space, so the plugin-owned settings card becomes a contained viewport panel below 430 px. Closing a portal restores body scrolling and the element that held focus before opening.

## Desktop 2.0.4 acceptance boundary

The Desktop path is pinned to Windows x64 DSH Desktop 2.0.4 and its bundled Harness 0.1.2-alpha.1. `.lab/desktop-home` owns the isolated DSH Profile; `.lab/desktop-user-data` owns Electron state. The generated `profile-selection/state.json` is exactly `{ "version": 1, "active": "web", "lastKnownGood": "web" }`; `desktop-market/state.json` explicitly requests `disabled`; `settings.yaml` explicitly sets `dsh-desktop.mode: compatibility`. Desktop launch is fail-closed when the executable identity, any generated profile file, source link, writable directory, selection state or required `lib/` artifact differs.

On 2026-09-02 the source-linked plugin was verified with Desktop 2.0.4's packaged Harness in an isolated Web Profile: the host loaded without browser errors, the five Muzi entries rendered and switched, and the global light/dark token layer applied. The native Electron walkthrough remains `UNVERIFIED` while another regular Desktop instance owns the application's single-instance lock; compatibility-mode restart persistence and local `.tgz` installation are also still pending. A downloaded installer with the expected SHA-256 proves artifact identity only.

## Host integration boundary

DSH continues to own the conversation, settings host, approvals, composer, details column and shell layout. Muzi Creator changes their presentation through the public theme service and a fixed-version compatibility stylesheet; it does not shadow the `conversation`, `conversation.view`, `conversation.composer.bar` or `sidebar.settings` slots and does not read or write host business state. The compatibility stylesheet is presentation-only and cannot add event handlers, change disabled state, or select plugin-owned Animal Island surfaces.

The plugin owns its business surfaces under `data-plugin="dsh-muzi-creator"` and its own CSS files. The injected Hero mark carries the same ownership attribute. The Lab creates disposable Web and Desktop profiles under `.lab/`, links only the current source checkout into those profiles, and never copies a real DSH profile, credentials, or user content. Every Lab start verifies the generated manifest, patch, workspace file, confined writable paths, checkout link and built artifacts before launching DSH.
