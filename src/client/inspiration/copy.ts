/** Text keys owned by the inspiration ledger surfaces. */
const inspirationZhRaw = {
  title: "灵感研究台账", search: "搜索主题", refresh: "刷新", new: "新增灵感", running: "运行中", pending: "待处理",
  manual: "手动灵感", daily: "每日任务", recent: "最近报告", captureTitle: "开始一项调研", capture: "输入一个值得验证的创作主题，Agent 会从公开网页收集证据并生成报告。", topic: "创作主题", objective: "调研目标",
  questions: "关键问题", addQuestion: "添加问题", removeQuestion: "移除问题", advanced: "高级设置", mode: "调研模式", modeTopic: "主题研究", modeTrend: "趋势监测", language: "来源语言", languageBoth: "中文和英文", languageZh: "中文", languageEn: "英文", preferred: "偏好域名", excluded: "排除域名", depth: "调研深度", depthQuick: "快速", depthStandard: "标准", depthDeep: "深入",
  start: "开始调研", save: "保存待办", empty: "还没有灵感。先捕获一个值得研究的问题。", loading: "正在读取灵感台账", retry: "重试",
  active: "当前研究", reports: "近期报告", noActive: "当前没有运行或排队的调研。", noReports: "还没有生成报告。", noTasks: "还没有每日任务。", openSession: "打开 Agent 会话", rerun: "再次调研", stop: "停止本次", promote: "转为内容", obsidian: "在 Obsidian 中打开", back: "返回台账",
  sources: "来源", updated: "更新于", nextRun: "下次运行", status: "状态", details: "研究报告", findings: "关键发现", disagreements: "分歧与未知", angles: "创作角度", nextSteps: "建议的下一步", published: "发布", retrieved: "抓取", unknown: "未知", integrityMissing: "报告文件已被移除。", integrityChanged: "报告文件已在外部修改，已停止使用该引用。", integrityUnavailable: "报告目前不可读取。",
  task: "每日研究任务", authorization: "启用即授权模型服务按此时间访问公开网络开展研究，并把研究报告写入 Creator Studio；授权持续到你暂停或归档该任务。", taskName: "任务名称", dailyTime: "每日时间", saveTask: "保存任务",
  pause: "暂停", resume: "启用并授权", runNow: "立即运行", archive: "归档", edit: "编辑", close: "关闭", enabled: "已启用", paused: "已暂停", archived: "已归档", editPauses: "修改主题、来源、调研模式或时间后，任务会自动暂停，需要重新启用授权。",
  queued: "已排队", ready: "报告已就绪", partial: "部分完成", failed: "失败", attention: "需要处理", cancelled: "已取消", interrupted: "已中断", emptyReport: "选择一条灵感或报告以查看详情。", saved: "已保存", started: "已开始调研", stopped: "已停止本次调研", error: "操作未完成，请重试。", badgeAttention: "待处理", badgeRunning: "运行中", badgeUnread: "新结果",
} as const;

type InspirationLocalKey = keyof typeof inspirationZhRaw;
/** Namespaced translation keys owned by the inspiration ledger. */
export type InspirationCopyKey = `inspiration.${InspirationLocalKey}`;

export const inspirationZh: Record<InspirationCopyKey, string> = Object.fromEntries(
  Object.entries(inspirationZhRaw).map(([key, value]) => [`inspiration.${key}`, value]),
) as Record<InspirationCopyKey, string>;

const inspirationEnRaw: Record<InspirationLocalKey, string> = {
  title: "Inspiration research ledger", search: "Search topics", refresh: "Refresh", new: "New inspiration", running: "Running", pending: "Pending",
  manual: "Manual inspiration", daily: "Daily tasks", recent: "Recent reports", captureTitle: "Start a research brief", capture: "Enter a creative topic worth verifying. The Agent will gather evidence from public pages and produce a report.", topic: "Creative topic", objective: "Research objective",
  questions: "Key questions", addQuestion: "Add question", removeQuestion: "Remove question", advanced: "Advanced settings", mode: "Research mode", modeTopic: "Topic research", modeTrend: "Trend monitoring", language: "Source language", languageBoth: "Chinese and English", languageZh: "Chinese", languageEn: "English", preferred: "Preferred domains", excluded: "Excluded domains", depth: "Research depth", depthQuick: "Quick", depthStandard: "Standard", depthDeep: "Deep",
  start: "Start research", save: "Save for later", empty: "No inspirations yet. Capture a question worth researching.", loading: "Loading inspiration ledger", retry: "Retry",
  active: "Active research", reports: "Recent reports", noActive: "No research is running or queued.", noReports: "No reports have been generated yet.", noTasks: "No daily tasks yet.", openSession: "Open Agent session", rerun: "Research again", stop: "Stop this run", promote: "Turn into content", obsidian: "Open in Obsidian", back: "Back to ledger",
  sources: "Sources", updated: "Updated", nextRun: "Next run", status: "Status", details: "Research report", findings: "Key findings", disagreements: "Disagreements and unknowns", angles: "Creative angles", nextSteps: "Suggested next steps", published: "Published", retrieved: "Retrieved", unknown: "Unknown", integrityMissing: "The report file was removed.", integrityChanged: "The report file changed outside Muzi Creator, so this reference is blocked.", integrityUnavailable: "The report cannot be read right now.",
  task: "Daily research task", authorization: "Enabling authorizes the model service to research the public web at this time and write the report into Creator Studio. This authorization remains active until you pause or archive the task.", taskName: "Task name", dailyTime: "Daily time", saveTask: "Save task",
  pause: "Pause", resume: "Enable and authorize", runNow: "Run now", archive: "Archive", edit: "Edit", close: "Close", enabled: "Enabled", paused: "Paused", archived: "Archived", editPauses: "Changing the topic, sources, research mode, or time pauses the task until you authorize it again.",
  queued: "Queued", ready: "Report ready", partial: "Partial", failed: "Failed", attention: "Needs attention", cancelled: "Cancelled", interrupted: "Interrupted", emptyReport: "Select an inspiration or report to view its details.", saved: "Saved", started: "Research started", stopped: "This research run was stopped.", error: "The action did not finish. Please try again.", badgeAttention: "Needs attention", badgeRunning: "Running", badgeUnread: "New results",
};

export const inspirationEn: Record<InspirationCopyKey, string> = Object.fromEntries(
  Object.entries(inspirationEnRaw).map(([key, value]) => [`inspiration.${key}`, value]),
) as Record<InspirationCopyKey, string>;
