import type { CoverThumbResult } from "../types.ts";
import { CoverThumb } from "./CoverThumb.tsx";
import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";

export function MuziProjectCover({
  id,
  title,
  revision,
  load,
  className,
}: {
  id: string;
  title: string;
  revision: string | null;
  load: (id: string) => Promise<CoverThumbResult>;
  className: string;
}) {
  return (
    <span className={className}>
      <CoverThumb
        id={id}
        load={load}
        revision={revision ?? "missing"}
        width={3}
        height={4}
        fallback={(
          <span className="muziCoverFallback" role="img" aria-label={`暂无封面：${title}`}>
            <WorkbenchIcon name="covers" purpose="heading" />
            <span>无图片</span>
          </span>
        )}
      />
    </span>
  );
}
