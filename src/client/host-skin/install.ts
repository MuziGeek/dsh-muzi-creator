import type { ThemeTokenOverrides } from "@deepseek-ai/dsh-client-ui-theme/client";

import { MUZI_HOST_THEME_TOKENS } from "./tokens.ts";

/** Attribute marking the host-level Animal Island skin while it is active. */
export const MUZI_HOST_SKIN_ATTRIBUTE = "data-muzi-host-skin";

/** Value installed into {@link MUZI_HOST_SKIN_ATTRIBUTE}. */
export const MUZI_HOST_SKIN_NAME = "animal-island";

/** Stable source name used to own this theme-runtime override layer. */
export const MUZI_HOST_THEME_SOURCE = "dsh-muzi-creator: host-skin";

/** Minimal client composition used by the host skin lifecycle. */
export interface MuziHostSkinContext {
  /** Host theme runtime supplied by dsh-client-ui-theme. */
  readonly theme: {
    /** Stack a token layer and return its exact disposer. */
    overrideTokens(source: string, tokens: ThemeTokenOverrides): () => void;
  };
  /** Register a cleanup-aware lifecycle effect with the owning client context. */
  effect(setup: () => () => void, name: string): unknown;
}

/**
 * Register the Animal Island host palette without creating a selectable theme
 * or changing the user's light/dark preference. The DOM marker is restored to
 * its precise pre-install value when the owning context unloads.
 * @param ctx - client context carrying the existing host theme runtime.
 */
export function installMuziHostSkin(ctx: MuziHostSkinContext): void {
  ctx.effect(() => {
    const disposeTokens = ctx.theme.overrideTokens(MUZI_HOST_THEME_SOURCE, MUZI_HOST_THEME_TOKENS);
    if (typeof document === "undefined" || document.body === null) return disposeTokens;

    const body = document.body;
    const previous = body.getAttribute(MUZI_HOST_SKIN_ATTRIBUTE);
    body.setAttribute(MUZI_HOST_SKIN_ATTRIBUTE, MUZI_HOST_SKIN_NAME);

    return () => {
      disposeTokens();
      if (previous === null) {
        body.removeAttribute(MUZI_HOST_SKIN_ATTRIBUTE);
      } else {
        body.setAttribute(MUZI_HOST_SKIN_ATTRIBUTE, previous);
      }
    };
  }, "dsh-muzi-creator: install Animal Island host skin");
}
