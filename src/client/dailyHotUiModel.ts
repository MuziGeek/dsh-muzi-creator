import type { DailyHotItem, DailyHotResult } from "../dailyHotTypes.ts";

/** Return every visible tier in reading order. */
export function dailyHotItems(result: DailyHotResult): DailyHotItem[] {
  return [...result.tiers.mustRead, ...result.tiers.browse, ...result.tiers.other];
}

/** Pick the most useful timestamp for list and detail presentation. */
export function dailyHotItemTimestamp(item: DailyHotItem): string | null {
  return item.latestAt ?? item.discoveredAt ?? item.publishedAt;
}

/** Prefer an event page, then the aggregate item page. */
export function dailyHotPrimaryLink(item: DailyHotItem): string | null {
  return item.links.story ?? item.links.aihot;
}

/** Format a compact local time without inventing missing dates. */
export function formatDailyHotCompactTime(value: string | null, now = Date.now()): string {
  if (value === null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  const current = new Date(now);
  if (date.toDateString() === current.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(date);
}

/** Format one full date and time for the inspector. */
export function formatDailyHotFullTime(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
