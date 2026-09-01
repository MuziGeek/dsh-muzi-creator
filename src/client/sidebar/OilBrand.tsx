import { MUZI_ICON_SRC } from "../assets/muziIcon.ts";

export interface OilBrandProps {
  compact?: boolean;
  name?: string;
  tagline?: string;
}

/** Render the Muzi Creator identity inside plugin-owned sidebar chrome. */
export function OilBrand({ compact = false, name = "Muzi Creator", tagline }: OilBrandProps) {
  return (
    <span className="oilBrand">
      <img className="oilBrandIcon" src={MUZI_ICON_SRC} alt="" aria-hidden="true" />
      {!compact && (
        <span className="oilBrandCopy">
          <span className="oilBrandText">{name}</span>
          {tagline !== undefined && <span className="oilBrandTagline">{tagline}</span>}
        </span>
      )}
    </span>
  );
}
