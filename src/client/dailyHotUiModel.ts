import type { DailyHotItem, DailyHotResult } from "../dailyHotTypes.ts";

const DAILY_HOT_SUMMARY_MIN_LENGTH = 90;
const DAILY_HOT_SUMMARY_MAX_LENGTH = 220;

/** Number of source names shown before the inspector disclosure. */
export const DAILY_HOT_SOURCE_PREVIEW_LIMIT = 6;

export type DailyHotSourcePreview = {
  items: string[];
  remaining: number;
};

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

function splitSummaryBlock(block: string): string[] {
  if (block.length <= DAILY_HOT_SUMMARY_MAX_LENGTH) return [block];
  const sentences = block.split(/(?<=[。！？!?；;])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
  if (sentences.length < 2) return [block];

  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length === 0) {
      current = sentence;
      continue;
    }
    const combined = `${current} ${sentence}`;
    if (combined.length <= DAILY_HOT_SUMMARY_MAX_LENGTH || current.length < DAILY_HOT_SUMMARY_MIN_LENGTH) {
      current = combined;
      continue;
    }
    paragraphs.push(current);
    current = sentence;
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}

/** Preserve explicit paragraphs and group long plain-text summaries at sentence boundaries. */
export function dailyHotSummaryParagraphs(summary: string): string[] {
  const normalized = summary.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length === 0) return [];
  return normalized
    .split(/\n+/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap(splitSummaryBlock);
}

/** Return the ordered source-name preview and the number hidden by default. */
export function previewDailyHotSources(
  sourceNames: readonly string[],
  expanded: boolean,
  limit = DAILY_HOT_SOURCE_PREVIEW_LIMIT,
): DailyHotSourcePreview {
  const remaining = Math.max(0, sourceNames.length - limit);
  return {
    items: expanded ? [...sourceNames] : sourceNames.slice(0, limit),
    remaining,
  };
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
