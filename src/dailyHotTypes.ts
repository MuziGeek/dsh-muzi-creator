import type { Branded } from "@deepseek-ai/dsh-brand";

/** Stable identity supplied or derived from one AIHOT item. */
export type DailyHotItemId = Branded<"DailyHotItemId">;

/** Classification assigned to one normalized AIHOT item. */
export type DailyHotItemKind = "hot-topic" | "selected" | "daily";

/** Evidence level available for checking one normalized item. */
export type DailyHotEvidenceLevel = "multi-source" | "original-linked" | "summary-only";

/** One built-in attention domain matched by a hotspot. */
export interface DailyHotAttentionDomain {
  id: string;
  label: string;
}

/** Explainable attention decision for one hotspot. */
export interface DailyHotAttention {
  domains: DailyHotAttentionDomain[];
  reason: string;
}

/** Available evidence for checking one hotspot. */
export interface DailyHotEvidence {
  level: DailyHotEvidenceLevel;
  label: string;
}

/** Safe external links associated with one hotspot. */
export interface DailyHotLinks {
  aihot: string | null;
  original: string | null;
  story: string | null;
}

/** Normalized read-only item shown by the Hot view. */
export interface DailyHotItem {
  id: DailyHotItemId;
  kind: DailyHotItemKind;
  title: string;
  summary: string | null;
  latest: string | null;
  source: { name: string };
  sourceNames: string[];
  sourceCount: number;
  signalCount: number;
  latestAt: string | null;
  publishedAt: string | null;
  discoveredAt: string | null;
  category: string | null;
  categoryLabel: string | null;
  score: number | null;
  links: DailyHotLinks;
  reportIds: string[];
  storyStatus: string | null;
  attention: DailyHotAttention;
  evidence: DailyHotEvidence;
}

/** Attention tiers shown in the sidebar. */
export interface DailyHotTiers {
  mustRead: DailyHotItem[];
  browse: DailyHotItem[];
  other: DailyHotItem[];
}

/** Latest AIHOT daily-report metadata. */
export interface DailyHotDailyMeta {
  date: string | null;
  generatedAt: string | null;
  itemCount: number;
  sectionCount: number;
  links: { aihot: string };
}

/** Upstream and tier counts for one aggregate read. */
export interface DailyHotCounts {
  upstreamHot: number;
  upstreamSelected24h: number;
  mustRead: number;
  browse: number;
  other: number;
}

/** Explainable rules used to classify the current aggregate. */
export interface DailyHotPolicy {
  question: string;
  mustReadLimit: number;
  rules: string[];
  source: string;
}

/** Refresh error retained alongside a usable stale snapshot. */
export interface DailyHotRefreshError {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

/** Strict normalized AIHOT aggregate returned over the plugin Remote. */
export interface DailyHotResult {
  schemaVersion: 1;
  status: "live" | "stale";
  fetchedAt: string;
  expiresAt: string;
  staleAt?: string;
  error?: DailyHotRefreshError;
  source: {
    name: "AI HOT";
    url: string;
    attributionRequired: false;
  };
  policy: DailyHotPolicy;
  daily: DailyHotDailyMeta;
  counts: DailyHotCounts;
  tiers: DailyHotTiers;
}

/** Optional cache bypass for one AIHOT aggregate read. */
export interface GetDailyHotRequest {
  refresh?: boolean;
}

/** Internal configurable classifier used by the loader and deterministic tests. */
export interface DailyHotAttentionStrategy {
  mustReadLimit: number;
  browseLimit: number;
  otherLimit: number;
  minimumIndependentSources: number;
  question: string;
  rules: string[];
  source?: string;
  domains?: Array<{ id: string; label: string; keywords: string[] }>;
}
