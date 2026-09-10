# Bundled workbench appearance

The client owns its appearance, icons and fonts. Registration stores stylesheet text; the active client effect mounts it and disposal removes its tags and appearance marker. Animal Island selectors are scoped to the active appearance marker, including modal portals, so importing an inactive plugin does not change the host. The host still owns light, dark and system theme selection.

Community entry adaptation requires semantic plugin markers and a verified button structure. It preserves original nodes, handlers and state inside the sidebar root; it does not disable another plugin or rewrite persisted theme settings. Compatibility selectors and artwork provenance are recorded with the bundled assets.

The build verifies icon dimensions, font and icon hashes, and font licenses before bundling. The release check requires that build step and verifies that the package includes font licenses and provenance manifests. DOM tests cover effect disposal, remounting, delayed entries and image fallback; package tests reject omitted validation and missing licenses. Desktop visual acceptance remains separate from these checks.
