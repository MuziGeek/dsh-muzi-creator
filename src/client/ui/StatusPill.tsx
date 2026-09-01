import type { ReactNode } from "react";
import { Tag, type TagColor } from "animal-island-ui";

import "./StatusPill.css";

export type StatusTone = "neutral" | "pending" | "active" | "success" | "error";

const TONE_COLOR: Record<StatusTone, TagColor> = {
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
    <Tag
      className={statusPillClass(tone)}
      color={TONE_COLOR[tone]}
      size="small"
      variant="soft"
    >
      <span aria-hidden="true" className="statusPillDot" />
      {children}
    </Tag>
  );
}
