# Muzi Creator Animal Island UI Lab

This Lab is an isolated visual and interaction harness for Muzi Creator. It supplies no credentials and authorizes no publishing, synchronization, or archive action.

## Visual system

The application imports `animal-island-ui/style` once at the client entry. Library components own their `--animal-*` tokens; Muzi layout CSS uses scoped `--muzi-island-*` aliases for warm parchment backgrounds, earth-brown text, mint-teal actions, rounded controls, and yellow or mint focus rings. UI text uses Nunito with Noto Sans SC; pure-black text, cold-gray surfaces, and cold-blue focus rings are not part of this system.

The package is `animal-island-ui@1.6.0`, licensed CC BY-NC 4.0 by guokaigdg. Muzi Creator code remains MIT; `NOTICE` is the attribution record.

## Component map

| Surface | Preferred component | Notes |
| --- | --- | --- |
| Content and knowledge cards | `Card` | Retain explicit keyboard semantics when a card selects content. |
| Status, stage, file and source labels | `Tag` | Keep status meaning in text, not color alone. |
| Search and controlled text fields | `Input` | Controlled value and change handler are required. |
| Platform, account and mode choices | `Select` | Controlled `options`, `value`, and `onChange`; preserve disabled capability states. |
| Enable/confirm choices | `Checkbox` / `Switch` | Preserve the external-action safety defaults. |
| Actions | `Button` | Primary depth shadow is reserved for primary/danger actions. |
| Loading | `Skeleton` / `Loading` | Do not replace meaningful error or unavailable states with an indefinite spinner. |
| Details and confirmation | `Modal` / `Drawer` | Keep focus, cancellation, and one-time confirmation behavior. |
| Icons | `Icon` | Use package-root exports; no deep imports, emoji, or hand-drawn replacement icons. |

Native `datetime-local`, the 3D graph canvas, and host-provided tooltips may remain when there is no equivalent component or when replacement would change behavior. Such exceptions need DOM and keyboard coverage.

## Layout and responsive constraints

The workbench keeps a session/sidebar region, a content or knowledge region, and an inspector region. The inspector can be resized and must not cover the host conversation. At narrow widths the inspector becomes full-width; existing 960/880/680/560/430 px rules remain acceptance points. The graph canvas has a keyboard-accessible fallback and must retain its loading, empty, unavailable, and reduced-motion states.

## Host integration boundary

The plugin owns its client surfaces under `data-plugin="dsh-muzi-creator"` and its own CSS files. DSH owns the conversation, settings host, approvals, and shell layout. The Lab creates a disposable Web profile under `.lab/dsh-home`, links only the current source checkout into that profile, and never copies a real DSH profile, credentials, or user content.
