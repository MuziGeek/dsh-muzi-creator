import { z } from "zod";

/** Persisted selections contain repository identifiers, never credentials or file contents. */
export const githubSelectionSchema = z.object({
  owner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/),
  repo: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/).refine((s) => s !== "." && s !== ".."),
  branch: z.string().min(1).max(255),
});
export type GithubSelection = z.infer<typeof githubSelectionSchema>;

export const githubRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("beginAuth") }),
  z.object({ action: z.literal("pollAuth") }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("browse"), query: z.string().max(500) }),
  z.object({ action: z.literal("branches"), repository: z.string().min(1).max(500) }),
  z.object({ action: z.literal("connect"), repository: z.string().min(1).max(500), branch: z.string().min(1).max(255) }),
  z.object({ action: z.literal("remove"), projectId: z.string().min(1) }),
  z.object({ action: z.literal("mode"), mode: z.enum(["local", "github"]) }),
]);
export type GithubRequest = z.infer<typeof githubRequestSchema>;

export const githubRepositorySchema = z.object({
  fullName: z.string(), url: z.string(), defaultBranch: z.string(), private: z.boolean(),
});
export const githubResultSchema = z.object({
  mode: z.enum(["local", "github"]),
  authAvailable: z.boolean(),
  connected: z.boolean(),
  login: z.string().nullable(),
  pending: z.object({ userCode: z.string(), expiresAt: z.string(), interval: z.number() }).nullable(),
  repositories: z.array(githubRepositorySchema).optional(),
  branches: z.array(z.string()).optional(),
  message: z.string().optional(),
});
export type GithubResult = z.infer<typeof githubResultSchema>;
export type GithubRepository = z.infer<typeof githubRepositorySchema>;

export const githubSnapshotSchema = z.object({
  url: z.string(), branch: z.string(), sha: z.string().nullable(),
  syncedAt: z.string().nullable(), stale: z.boolean(),
});
