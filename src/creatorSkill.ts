interface SkillsContext {
  skills: {
    register: (skill: {
      name: string;
      description: string;
      source: "runtime";
      content: string;
      invocation: { modelInvocable: boolean; userInvocable: boolean };
    }) => () => void;
  };
}

export const CREATOR_WORKBENCH_SKILL = {
  name: "muzi-creator-workbench",
  description:
    "使用 Muzi Creator 将正式 llm-wiki 知识加工成母内容和多渠道稿件，并管理本地视频制作状态。",
  source: "runtime" as const,
  invocation: { modelInvocable: true, userInvocable: true },
  content: `# Muzi Creator

## 事实源

- Creator Studio 是唯一可写创作事实源。使用 \`muzi_creator_*\` 工具，不用通用文件工具改项目正文或 project.yml。
- Muzi Atlas 是只读知识事实源。只用 \`muzi_knowledge_search\` 和 \`muzi_knowledge_read\` 读取正式 Wiki；不得搜索或引用 raw/。
- 知识写入只能由用户明确调用标准 llm-wiki ingest、digest、lint 流程。本插件不实现第二套知识写入器。
- 工具返回的 \`creator://\`、\`atlas://\`、稳定 ID 与哈希是跨界引用；不要尝试猜测或输出绝对路径。

## 生成与保存

1. 先用 \`muzi_knowledge_search\` 找正式知识，再按需读取页面。零正式 Wiki 时明确说明必须先通过 llm-wiki 消化原始素材。
2. 主题会话携带正式 Atlas 定位符时，先用 \`muzi_creator_status atlasLocator=<定位符>\` 精确查找项目。唯一匹配时复用；无匹配时以知识标题创建；多个匹配时停止并让用户选择。
3. 未收到生成指令前只讨论观点、证据边界和创作方向，不写 Creator Studio。
4. 用户明确输入“总结成为母内容”即授权本轮生成并保存到 \`mother-content.md\`；明确输入“整理为脚本”即授权本轮生成并保存到 \`channels/video/script.md\`。该授权允许完成工具预检、创建新项目和写入空目标，不需要再索要一次确认。
5. 新项目的 primaryDocument 必须与目标文档一致，并通过 \`atlasReferences\` 保存正式知识的定位符、标题、当前 SHA-256 和引用时间。先以 \`confirmed=false\` 核对精确参数，再在同一轮以 \`confirmed=true\` 创建。
6. 保存前必须用 \`muzi_creator_read\` 读取最新 revision 和目标文档。目标为空时，生成指令本身允许先预览再在同一轮 \`confirmed=true\` 保存；目标已有非空内容时，必须展示拟议变化并等待用户明确同意覆盖，随后才可设置 \`overwriteConfirmed=true\`，不能把生成指令当作覆盖授权。
7. 保存使用未变化的文本和最新 expectedRevision。修订冲突时重新读取项目，重新核对目标内容，不静默重试覆盖。
8. 视频稿由已有母内容派生时填写 \`derivedFrom=mother\` 和母内容当前哈希 \`sourceSha256\`。源哈希变化后只报告“来源已更新，待重新加工”，不自动覆盖旧稿。

## 创作结构

- 项目可从母内容或视频稿起步。
- 文档包括母内容、视频稿、公众号、小红书和博客；状态是 not_started、draft、review、ready。
- 写或改视频稿前先用 \`oil_script_rules\` 读取长期语气、结构、观众与禁忌。
- 发布目标包括 B站、抖音、公众号、小红书和博客；状态只能依据用户或已批准同步的事实填写，不根据文件存在推断。
- Atlas 引用只存定位符、标题、引用时哈希与时间，不复制知识正文。

## Oil 视频能力与外部安全

- Screen Studio、字幕、封面与本地媒体检查继续使用 Oil 工具；缺少能力只降级对应环节。
- 外部同步、上传和发布默认关闭。即使启用，每次也必须等待 DSH 审批；没有审批通道或审批被拒绝时不得执行。
- 不向用户索要 API Key 明文；凭据只在 DSH 设置中配置。
- “开始运行”不等于“完成”，长任务以真实产物或状态为准。

每次只推进当前缺失的下一步，并让用户保留最终表达、审阅、上传与发布决定。`,
};

export function registerCreatorWorkbenchSkill(ctx: SkillsContext): () => void {
  return ctx.skills.register(CREATOR_WORKBENCH_SKILL);
}
