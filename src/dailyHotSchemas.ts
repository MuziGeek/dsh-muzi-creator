import { z } from "zod";

export const getDailyHotRequestSchema = z.object({
  refresh: z.boolean().optional(),
}).strict();

const dailyHotAttentionDomainSchema = z.object({
  id: z.string(),
  label: z.string(),
}).strict();

const nullableUrlSchema = z.string().url().nullable();

export const dailyHotItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["hot-topic", "selected", "daily"]),
  title: z.string().min(1),
  summary: z.string().nullable(),
  latest: z.string().nullable(),
  source: z.object({ name: z.string().min(1) }).strict(),
  sourceNames: z.array(z.string()),
  sourceCount: z.number().int().nonnegative(),
  signalCount: z.number().int().nonnegative(),
  latestAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  discoveredAt: z.string().nullable(),
  category: z.string().nullable(),
  categoryLabel: z.string().nullable(),
  score: z.number().nullable(),
  links: z.object({
    aihot: nullableUrlSchema,
    original: nullableUrlSchema,
    story: nullableUrlSchema,
  }).strict(),
  reportIds: z.array(z.string()),
  storyStatus: z.string().nullable(),
  attention: z.object({
    domains: z.array(dailyHotAttentionDomainSchema),
    reason: z.string(),
  }).strict(),
  evidence: z.object({
    level: z.enum(["multi-source", "original-linked", "summary-only"]),
    label: z.string(),
  }).strict(),
}).strict();

export const dailyHotResultSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["live", "stale"]),
  fetchedAt: z.string(),
  expiresAt: z.string(),
  staleAt: z.string().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  source: z.object({
    name: z.literal("AI HOT"),
    url: z.string().url(),
    attributionRequired: z.literal(false),
  }).strict(),
  policy: z.object({
    question: z.string(),
    mustReadLimit: z.number().int().nonnegative(),
    rules: z.array(z.string()),
    source: z.string(),
  }).strict(),
  daily: z.object({
    date: z.string().nullable(),
    generatedAt: z.string().nullable(),
    itemCount: z.number().int().nonnegative(),
    sectionCount: z.number().int().nonnegative(),
    links: z.object({ aihot: z.string().url() }).strict(),
  }).strict(),
  counts: z.object({
    upstreamHot: z.number().int().nonnegative(),
    upstreamSelected24h: z.number().int().nonnegative(),
    mustRead: z.number().int().nonnegative(),
    browse: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }).strict(),
  tiers: z.object({
    mustRead: z.array(dailyHotItemSchema),
    browse: z.array(dailyHotItemSchema),
    other: z.array(dailyHotItemSchema),
  }).strict(),
}).strict();
