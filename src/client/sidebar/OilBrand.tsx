import { MUZI_ICON_SRC } from "../assets/muziIcon.ts";

export function OilBrand({ compact = false, name = "Muzi Creator" }: { compact?: boolean; name?: string }) {
  return (
    <span className="oilBrand">
      <img className="oilBrandIcon" src={MUZI_ICON_SRC} alt="" aria-hidden="true" />
      {!compact && <span className="oilBrandText">{name}</span>}
    </span>
  );
}
