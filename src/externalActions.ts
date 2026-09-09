export type ExternalActionKind = "connection" | "acceptance" | "prepare" | "commit" | "metrics";

const EXTERNAL_ACTIONS: Readonly<Record<string, ExternalActionKind>> = Object.freeze({
  muzi_creator_connect_account: "connection",
  muzi_creator_reconnect_account: "connection",
  muzi_creator_reopen_connection: "connection",
  muzi_creator_open_account: "connection",
  muzi_creator_prepare_publish_flow: "prepare",
  muzi_creator_resume_publish_flow: "prepare",
  muzi_creator_commit_publish_flow: "commit",
  mz_sync_publish: "metrics",
  muzi_creator_begin_video_acceptance: "acceptance",
  muzi_creator_finalize_video_acceptance: "acceptance",
  muzi_creator_sync_video_metrics: "metrics",
});

export function externalActionKind(toolName: string | undefined): ExternalActionKind | null {
  if (toolName === undefined) return null;
  return EXTERNAL_ACTIONS[toolName] ?? null;
}
export function externalActionApprovalReason(kind: ExternalActionKind): string {
  if (kind === "connection") return "将打开所选平台的独立浏览器用于账号连接；不会上传素材或发布内容。";
  if (kind === "acceptance") return "该操作会打开隔离的外部创作者页面或写入受控验收记录；不会签发普通发布权限。请核对平台、账号和验收能力后批准。";
  if (kind === "commit") return "该操作会对本次选中的平台分别执行一次最终发布或定时提交。请核对每个平台、账号、标题、素材、动作和准确时间后批准。";
  if (kind === "prepare") return "该操作会登录外部平台、上传素材并填写页面，但最终提交仍保持锁定。请核对平台与账号后批准。";
  return "该操作会读取外部创作者后台并同步播放、点赞和评论数据。请核对平台与账号后批准。";
}
