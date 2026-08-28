import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";

import { MUZI_ICON_SRC } from "./assets/muziIcon.ts";
import { NS } from "./locales.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "conversation.hero.brand.headline": { kind: "single"; scope: "root"; owner: HeroBrandHeadlineOwnerProps };
  }
}

/** Geometry supplied by the optional blank-session mark slot. */
export interface HeroBrandMarkOwnerProps {
  /** Requested square edge length in CSS pixels. */
  size: number;
  /** Host class reserved for its own fish mark treatment. */
  className: string;
}

/** Empty owner share for the Muzi Hero headline while the host owns its layout. */
export interface HeroBrandHeadlineOwnerProps {
  /** Marker field: the occupant owns its localized copy. */
  children?: never;
}

type MuziHeroHeadlineProps = HeroBrandHeadlineOwnerProps & PropsLocale<typeof NS>;

/** Small registry face shared by the two declaration-aware Hero registrations. */
export interface CompatibleHeroBrandSlots {
  register: (
    options: Record<string, unknown>,
    component: unknown,
  ) => () => void;
}

/**
 * Render the bundled Muzi avatar at the square geometry requested by the Hero.
 * The fish-specific host class is deliberately ignored because this raster mark
 * must not inherit the fish hover animation.
 * @param props - Host-supplied avatar geometry.
 * @returns decorative brand avatar.
 */
export function MuziHeroBrandMark({ size }: HeroBrandMarkOwnerProps) {
  return <img className="muziHeroBrandMark" src={MUZI_ICON_SRC} width={size} height={size} alt="" aria-hidden="true" />;
}

/**
 * Render the deployment-owned Hero phrase while the host retains title layout.
 * @param props - Slot locale share.
 * @returns localized Muzi brand phrase.
 */
export function MuziHeroBrandHeadline({ t }: MuziHeroHeadlineProps) {
  return <span className="muziHeroBrandHeadline">{t("hero.growth")}</span>;
}

/**
 * Register the Muzi avatar into the existing Hero mark slot.
 * @param slots - Slot registry whose conversation entry declared the mark.
 * @returns disposer for the registration.
 */
export function registerMuziHeroBrandMark(slots: CompatibleHeroBrandSlots): () => void {
  return slots.register({ name: "conversation.hero.brand.mark" }, MuziHeroBrandMark);
}

/**
 * Register the localized Muzi phrase into the optional Hero headline slot.
 * @param slots - Slot registry whose conversation entry declared the headline.
 * @returns disposer for the registration.
 */
export function registerMuziHeroBrandHeadline(slots: CompatibleHeroBrandSlots): () => void {
  return slots.register({ name: "conversation.hero.brand.headline", locale: NS }, MuziHeroBrandHeadline);
}
