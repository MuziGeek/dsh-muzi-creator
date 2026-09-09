import { MUZI_ICON_SRC } from "../assets/muziIcon.ts";

export interface MzBrandProps {
  compact?: boolean;
  name?: string;
  tagline?: string;
}

/** Render the Muzi Creator identity inside plugin-owned sidebar chrome. */
export function MzBrand({ compact = false, name = "Muzi Creator", tagline }: MzBrandProps) {
  return (
    <span className="mzBrand">
      <img className="mzBrandIcon" src={MUZI_ICON_SRC} alt="" aria-hidden="true" />
      {!compact && (
        <span className="mzBrandCopy">
          <span className="mzBrandText">{name}</span>
          {tagline !== undefined && <span className="mzBrandTagline">{tagline}</span>}
        </span>
      )}
    </span>
  );
}
