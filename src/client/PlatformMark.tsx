import { PLATFORM_ICONS, type PlatformId } from "./platformIcons.ts";
import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";

export type { PlatformId };

export function PlatformMark({ id, size = 18 }: { id: PlatformId; size?: number }) {
  if (id === "article") return <WorkbenchIcon name="content" size={size} />;
  return (
    <img
      className="platformMark"
      src={PLATFORM_ICONS[id]}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
