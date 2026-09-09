import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import { z } from "zod";
import type { MzCreatorService } from "./service.ts";
import { addVideoAccountSchema, videoAccountLoginSchema, videoConnectionRequestSchema, videoConnectionReopenSchema } from "./videoAccountSchemas.ts";
import { publishFlowGetSchema, publishFlowPrepareSchema, publishFlowActionSchema } from "./publishFlowSchemas.ts";

/** Account and publishing tools use the same validated operations as the content workbench. */
export function registerPublishFlowTools(ctx: { tools: { register: (tool: ToolDefinition) => void } }, service: MzCreatorService): void {
  const entries: Array<{ name: string; description: string; run: (request: unknown, signal: AbortSignal) => Promise<unknown> }> = [
    { name: "muzi_creator_accounts", description: "List connected accounts, pending connections and last verified login states. No credentials are returned. Request {}.", run: (request, signal) => { z.object({}).strict().parse(request); return service.getVideoAccounts({}, signal); } },
    { name: "muzi_creator_connect_account", description: "With explicit user permission, open a platform login browser. Request {platform,confirmed:true}. User completes login; no account is registered until a stable platform identity is verified. Poll the returned connection id.", run: (request, signal) => service.addVideoAccount(addVideoAccountSchema.parse(request), signal) },
    { name: "muzi_creator_check_connection", description: "Check the pending login browser and complete verified registration. Request {connectionId}. Never treats a nickname or user assertion as proof of login.", run: (request, signal) => service.pollVideoAccountConnection(videoConnectionRequestSchema.parse(request), signal) },
    { name: "muzi_creator_cancel_connection", description: "Cancel a pending connection without deleting a registered account. Request {connectionId}.", run: (request, signal) => service.cancelVideoAccountConnection(videoConnectionRequestSchema.parse(request), signal) },
    { name: "muzi_creator_reopen_connection", description: "Reopen the existing pending login profile after the user requests it. Request {connectionId,confirmed:true}.", run: (request, signal) => service.reopenVideoAccountConnection(videoConnectionReopenSchema.parse(request), signal) },
    { name: "muzi_creator_reconnect_account", description: "Reconnect an existing account in its original browser profile. Request {platform,accountProfile,confirmed:true}; the user completes login manually.", run: (request, signal) => service.reconnectVideoAccount(videoAccountLoginSchema.parse(request), signal) },
    { name: "muzi_creator_open_account", description: "Open a connected account's creator platform without uploading or publishing. Request {platform,accountProfile,confirmed:true}.", run: (request, signal) => service.openVideoAccountLogin(videoAccountLoginSchema.parse(request), signal) },
    { name: "muzi_creator_publish_flow", description: "Read durable publishing progress and prepared confirmation summaries for one content item. Request {id}. Use this to restore UI or Agent work after interruption.", run: request => service.getPublishFlow(publishFlowGetSchema.parse(request)) },
    { name: "muzi_creator_prepare_publish_flow", description: "Start sequential preparation for the user's exact content and target list. Request {id,expectedRevision,intents:[{platform,accountProfile,mode,scheduledAt?}],confirmed:true,originalRightsConfirmed?}. One account per platform. Checks login and integrates first-use verification. Never performs final publication. Poll publish_flow until no longer busy.", run: (request, signal) => service.preparePublishFlow(publishFlowPrepareSchema.parse(request), signal) },
    { name: "muzi_creator_resume_publish_flow", description: "Resume only blocked targets after the user resolves login or another blocker. Request {id,flowId,expectedVersion,platforms,confirmed:true}. Never retries an uncertain final submission.", run: (request, signal) => service.resumePublishFlow(publishFlowActionSchema.parse(request), signal) },
    { name: "muzi_creator_commit_publish_flow", description: "After showing the prepared platform/account/title/materials/mode/time summaries and receiving the user's final confirmation, submit exactly those ready targets once. Request {id,flowId,expectedVersion,platforms,confirmed:true}. Do not infer confirmation from an earlier preparation request. prepare_only and unknown results cannot be submitted.", run: (request, signal) => service.commitPublishFlow(publishFlowActionSchema.parse(request), signal) },
  ];
  for (const entry of entries) ctx.tools.register(defineTool({
    name: entry.name, description: entry.description,
    parameters: { request: { type: "json", required: true, description: "Request fields described above; platform is xiaohongshu, douyin, bilibili or wechat." } },
    output: { schema: { type: "json" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    presentCall: args => ({ card: "generic", title: entry.name, kind: "other", rawInput: args }),
    execute: async (args, exec) => JSON.parse(JSON.stringify(await entry.run(args.request, exec.signal))) as never,
  }));
}
