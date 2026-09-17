import { z } from "zod";

import { githubRepositorySchema, githubSelectionSchema } from "./trellisGithubSchemas.ts";

export const githubSourceTargetSchema = z.enum(["creator", "knowledge"]);
export type GithubSourceTarget = z.infer<typeof githubSourceTargetSchema>;

export const githubSourceSnapshotSchema = z.object({
  url: z.string().url(),
  branch: z.string().min(1),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  syncedAt: z.string().datetime(),
  stale: z.boolean(),
  fileCount: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type GithubSourceSnapshot = z.infer<typeof githubSourceSnapshotSchema>;

export const githubSourceViewSchema = z.object({
  mode: z.enum(["local", "github"]),
  url: z.string().url().nullable(),
  branch: z.string().nullable(),
  sha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
  syncedAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  readOnly: z.boolean(),
});
export type GithubSourceView = z.infer<typeof githubSourceViewSchema>;

const targetRequest = { target: githubSourceTargetSchema };

export const githubSourceRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...targetRequest, action: z.literal("status") }),
  z.object({ ...targetRequest, action: z.literal("beginAuth") }),
  z.object({ ...targetRequest, action: z.literal("pollAuth") }),
  z.object({ ...targetRequest, action: z.literal("disconnect") }),
  z.object({ ...targetRequest, action: z.literal("browse"), query: z.string().max(500) }),
  z.object({ ...targetRequest, action: z.literal("branches"), repository: z.string().min(1).max(500) }),
  z.object({ ...targetRequest, action: z.literal("connect"), repository: z.string().min(1).max(500), branch: z.string().min(1).max(255) }),
  z.object({ ...targetRequest, action: z.literal("refresh") }),
  z.object({ ...targetRequest, action: z.literal("remove") }),
  z.object({ ...targetRequest, action: z.literal("mode"), mode: z.enum(["local", "github"]) }),
]);
export type GithubSourceRequest = z.infer<typeof githubSourceRequestSchema>;

export const githubSourceResultSchema = z.object({
  target: githubSourceTargetSchema,
  mode: z.enum(["local", "github"]),
  authAvailable: z.boolean(),
  connected: z.boolean(),
  login: z.string().nullable(),
  pending: z.object({ userCode: z.string(), expiresAt: z.string().datetime(), interval: z.number().positive() }).nullable(),
  selection: githubSelectionSchema.nullable(),
  snapshot: githubSourceSnapshotSchema.nullable(),
  repositories: z.array(githubRepositorySchema).optional(),
  branches: z.array(z.string()).optional(),
  message: z.string().optional(),
});
export type GithubSourceResult = z.infer<typeof githubSourceResultSchema>;
