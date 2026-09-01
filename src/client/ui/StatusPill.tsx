import type { ReactNode } from "react";
import { IslandTag, type IslandTagColor } from "./IslandControls.tsx";

import "./StatusPill.css";

export type StatusTone = "neutral" | "pending" | "active" | "success" | "error";

const TONE_COLOR: Record<StatusTone, IslandTagColor> = {
  neutral: "brown",
  pending: "app-yellow",
  active: "yellow-green",
  success: "app-green",
  error: "app-red",
};

export function statusPillClass(tone: StatusTone, extra?: string): string {
  return ["statusPill", tone, extra].filter((part) => part !== undefined && part !== "").join(" ");
}

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <IslandTag
      className={statusPillClass(tone)}
      color={TONE_COLOR[tone]}
      size="small"
      variant="soft"
    >
      <span aria-hidden="true" className="statusPillDot" />
      {children}
    </IslandTag>
  );
}
