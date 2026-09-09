import { z } from "zod";
import { muziVideoPlatformSchema, videoPublishPrepareRequestSchema, videoPublishTaskResultSchema } from "./muziSchemas.ts";

/** Durable progress for one content item, with independently guarded platform targets. */
export const publishFlowSchema = z.object({
  flowId: z.string().regex(/^vpf-[a-f0-9]{24}$/), id: z.string().regex(/^mc_[a-f0-9]{24}$/),
  revision: z.number().int().nonnegative(), version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), busy: z.boolean(),
  originalRightsConfirmed: z.boolean(), packagePath: z.string().optional(),
  targets: z.array(z.object({
    platform: muziVideoPlatformSchema, accountProfile: z.string().min(1), displayName: z.string(),
    platformAccountId: z.string().nullable().optional(), factsRecorded: z.boolean().optional(),
    title: z.string().optional(),
    mode: z.enum(["prepare_only", "publish_now", "schedule"]), scheduledAt: z.string().optional(),
    state: z.enum(["pending", "checking", "preparing", "ready", "prepared", "committing", "published", "scheduled", "blocked", "unknown"]),
    message: z.string().nullable(), task: videoPublishTaskResultSchema.nullable(), acceptanceSessionId: z.string().nullable(),
    materials: z.array(z.string()),
  })).min(1).max(4),
});
export const publishFlowGetSchema = z.object({ id: publishFlowSchema.shape.id }).strict();
export const publishFlowPrepareSchema = videoPublishPrepareRequestSchema.omit({ acceptanceSessionId: true }).extend({ confirmed: z.literal(true) }).superRefine((value, ctx) => {
  if (new Set(value.intents.map(item => item.platform)).size !== value.intents.length) ctx.addIssue({ code: "custom", path: ["intents"], message: "每个平台只能选择一个账号" });
});
export const publishFlowActionSchema = z.object({
  id: publishFlowSchema.shape.id, flowId: publishFlowSchema.shape.flowId,
  expectedVersion: z.number().int().nonnegative(), platforms: z.array(muziVideoPlatformSchema).min(1).max(4), confirmed: z.literal(true),
}).strict().superRefine((value, ctx) => { if (new Set(value.platforms).size !== value.platforms.length) ctx.addIssue({ code: "custom", path: ["platforms"], message: "平台不能重复" }); });
export type PublishFlow = z.infer<typeof publishFlowSchema>;
export type PublishFlowPrepare = z.infer<typeof publishFlowPrepareSchema>;
export type PublishFlowAction = z.infer<typeof publishFlowActionSchema>;
export interface PublishFlowFace {
  get: (request: { id: string }) => Promise<PublishFlow | null>;
  prepare: (request: PublishFlowPrepare) => Promise<PublishFlow>;
  resume: (request: PublishFlowAction) => Promise<PublishFlow>;
  invalidate: (request: PublishFlowAction) => Promise<PublishFlow>;
  commit: (request: PublishFlowAction) => Promise<PublishFlow>;
}
