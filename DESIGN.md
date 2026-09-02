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
| Plugin settings card header | DSH disclosure chrome | The settings-list shell mirrors the official 2.0.4 plugin card, including its host tokens and chevron; the disclosed business form continues to use `IslandControls`. |

Native `datetime-local`, the controlled textarea inside `IslandTextarea`, and the 3D graph canvas remain because the library has no behavior-equivalent component. The graph retains its keyboard fallback; date and textarea fields retain labels, focus visibility and DOM coverage. No other raw form control is part of the plugin UI.

## Layout and responsive constraints

The host-provided sidebar width is authoritative: 360 px is the primary expanded design width and 56 px is the settled rail. The central `conversation` region has two explicit modes. Selecting Sessions unregisters the Muzi occupant and restores the complete official Agent tree. Selecting Hot, Content, Knowledge or Projects registers one stable Muzi workbench root at priority `-10`; switching between those four features updates that root without re-registering it. Business details are ordinary central views and no longer use `shell.overlay`, fixed positioning, resizable widths, masks or close layers.

The five-entry navigation reserves a 22 px leading icon slot, centers each label against the full button, and reserves the trailing edge for the Sessions activity badge. The expanded new-session action sits in the brand row; the collapsed rail keeps its existing action. The official Sessions search, view and add-workspace controls remain host-owned and event-complete, while the plugin-owned `session-browser` wrapper gives their Desktop 2.0.4 presentation a stable scope. In an expanded sidebar those controls use the same 36 px warm text-button treatment as other feature headers (`搜索 / 视图 / 新增`, localized in English); the 56 px rail keeps the official icons, and an expanded search restores the official input and clear action. Content view options disclose inline between the section toolbar and the list, so they participate in normal layout instead of covering the first card; refresh keeps the disclosure open and Escape returns focus to its trigger.

The central root has one top bar and one independently scrolling content region. Overview content is limited to 1120 px, reading content to about 72 characters, and the knowledge graph uses the available width. Below 880 px, only a new item selection asks the official layout action to collapse the sidebar; opening an overview, refreshing, changing features or restoring an existing selection does not. The expanded-list action and overview return restore keyboard focus to the source row. At 620/560/430 px internal layouts stack or reduce padding without page-level horizontal overflow. The graph canvas keeps its keyboard fallback and loading, empty, unavailable and reduced-motion states.

Tabs remain one line, scroll horizontally, and use the library keyboard behavior for Arrow keys, Home and End. Long Chinese or English titles, URLs, source labels and Windows paths either wrap at safe boundaries or truncate inside a `min-width: 0` container. Card shadows are not added by plugin CSS; depth remains owned by Animal Island primary or danger actions.

## Theme and portal boundary

The client installs one `ThemeRuntime.overrideTokens()` layer and marks `body` with `data-muzi-host-skin="animal-island"`. The layer maps the DSH application, panel, message, input, menu, Markdown, scrollbar and status tokens to an explicit light and dark Animal Island palette without changing the user's light, dark or system preference. Unloading the plugin removes the token layer and restores the exact body attribute value that existed before installation.

The DSH Desktop 2.0.4 compatibility stylesheet is scoped by that body marker. It may style stable semantic host anchors such as controls, dialogs, menus, tooltips and details regions, but it must not use generated CSS Module hashes, hide functional elements, intercept input, or replace the official conversation, composer, approval, settings or details components. The version-pinned selector manifest records every semantic or structural anchor; a missing required selector fails the compatibility test instead of widening the stylesheet silently.

All plugin roots carry `data-plugin="dsh-muzi-creator"`. Body portals additionally carry `data-plugin-modal="dsh-muzi-creator"`; appearance rules exclude both so Animal Island components continue to own their colors, radii and depth. Two plugin-root exceptions are explicit: a layout-only rule positions an expanded 360 px sidebar over the conversation below 640 px, and version-pinned structural rules style only the official `sidebar.workspaces` controls rendered inside the plugin's `session-browser` wrapper. The latter changes size, color and interaction states only; it does not hide controls or replace their events. Animal Island 1.6.0 uses fixed-palette cream cards, tabs and Modal shells. The shared adapter keeps their matching brown text palette in a dark host and uses the library's high-contrast lime card for selection. The narrow DSH settings host may expose less than 100 px of inline space, so the plugin-owned settings card becomes a contained viewport panel below 430 px. Closing a portal restores body scrolling and the element that held focus before opening.

## Desktop 2.0.4 acceptance boundary

The Desktop path is pinned to Windows x64 DSH Desktop 2.0.4 and its bundled Harness 0.1.2-alpha.1. `.lab/desktop-home` owns the isolated DSH Profile; `.lab/desktop-user-data` owns Electron state. Both isolated homes provide ordinary writable `Desktop`, `Documents` and `Downloads` directories because the host directory picker does not accept an initial location. The generated `profile-selection/state.json` is exactly `{ "version": 2, "active": "web" }`; `desktop-market/state.json` explicitly requests `disabled`; `settings.yaml` explicitly sets `dsh-desktop.mode: compatibility`. Desktop launch is fail-closed when the executable identity, any generated profile file, source link, writable directory, selection state or required `lib/` artifact differs. Desktop 2.0.4 rejects the former version-1 state and otherwise recovers to its launcher-owned `desktop` Profile, so the Lab validator rejects that legacy document before launch.

The opt-in personal mode keeps `.lab/personal/dsh-home`, `.lab/personal/user-data` and `.lab/personal/data` separate from both the fixture Lab and the user's formal DSH state. It preserves the process's real `HOME` and `USERPROFILE` only for native shell discovery, while `DSH_HOME`, application-data variables, credentials, telemetry and external-action policy remain isolated. Its generated profile points to the validated local Creator Studio, Atlas, Trellis and Obsidian paths. Configuration files are create-once: identical regeneration is allowed, but a conflicting personal config, profile or overlay is never overwritten silently. These business roots are real rather than sandbox fixtures, so validation is read-only and deliberately avoids content creation, organization, archive, synchronization, publication and Atlas writes.

On 2026-09-02 the source-linked plugin was verified with Desktop 2.0.4's packaged Harness in the isolated `web` Profile. The native Electron walkthrough confirmed compatibility mode, all five Muzi entries, central overview replacement for hot/content/knowledge/projects, official Agent restoration for sessions, hotspot detail restoration across feature switches, and hotspot detail restoration after a full Desktop restart. The same build passed light/dark Web Lab checks at 1440×900, 1280×800, 1024×768, 879×800 and 390×844 without page-level horizontal overflow. The isolated fixture intentionally leaves Atlas and Trellis unavailable, so their empty/error states were verified without writes. Local `.tgz` installation remains a separate `UNVERIFIED` packaging check; a downloaded installer with the expected SHA-256 proves artifact identity only.

## Host integration boundary

DSH continues to own session state, the official Agent tree, settings host, approvals, composer, details column and shell layout. Muzi Creator conditionally occupies only the root `conversation` slot for Hot, Content, Knowledge and Projects. Selecting Sessions disposes that registration so the official component tree, active session, draft, queue and stream return unchanged. Muzi never registers `conversation.view`, `conversation.composer.bar` or `sidebar.settings`; the official details region and global portals remain intact. A failed root registration leaves the official conversation visible and reports the failure in the Muzi sidebar instead of using DOM selectors or hiding host components.

The four business features share one read controller per source. First open loads once, concurrent sidebar and overview requests are coalesced, manual refresh retains the last valid value, and one source failure stays local to that feature. UI schema 2 stores independent Hot, Content, Knowledge and Project selections under `dsh-muzi-creator/ui/v2`; every restored identity is checked through its existing Face before detail rendering, and a missing object returns to that feature's overview. The Sessions badge reads only official session summaries and prioritizes pending interactions over running counts. None of these paths sends, stops, cancels, approves or switches a session.

The compatibility stylesheet is presentation-only and cannot add event handlers, change disabled state, or select plugin-owned Animal Island surfaces.

The plugin owns its business surfaces under `data-plugin="dsh-muzi-creator"` and its own CSS files. The injected Hero mark carries the same ownership attribute. The Lab creates disposable Web and Desktop profiles under `.lab/`, links only the current source checkout into those profiles, and never copies a real DSH profile, credentials, or user content. Every Lab start verifies the generated manifest, patch, workspace file, confined writable paths, checkout link and built artifacts before launching DSH.
