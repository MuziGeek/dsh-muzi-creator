import { MUZI_ICON_SRC } from "./assets/muziIcon.ts";

/** Geometry supplied by the optional blank-session mark slot. */
export interface HeroBrandMarkOwnerProps {
  /** Requested square edge length in CSS pixels. */
  size: number;
  /** Host class reserved for its own fish mark treatment. */
  className: string;
}

/** Small registry face used by the declaration-aware Hero registration. */
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
 * Register the Muzi avatar into the existing Hero mark slot.
 * @param slots - Slot registry whose conversation entry declared the mark.
 * @returns disposer for the registration.
 */
export function registerMuziHeroBrandMark(slots: CompatibleHeroBrandSlots): () => void {
  return slots.register({ name: "conversation.hero.brand.mark" }, MuziHeroBrandMark);
}
