import { PUBLISH_PLATFORM_DEFINITIONS, type PublishPlatform } from "./platforms.ts";

export interface LibraryPromptSource {
  libraryRoot: string;
  dataDir: string;
  cache?: { libraryRoot: string } | undefined;
  cachedScriptRules?: string | undefined;
  cachedEnabledPlatforms?: readonly string[] | undefined;
}

interface PromptSectionHost {
  systemPrompt: {
    section: (section: {
      name: string;
      order: number;
      text: string | (() => string);
    }) => () => void;
  };
}

export function resolvePromptLibraryRoot(source: LibraryPromptSource): string {
  return source.cache?.libraryRoot ?? source.libraryRoot;
}

function enabledPlatformNames(platforms: readonly string[]): string {
  return platforms.map((key) => {
    if (Object.hasOwn(PUBLISH_PLATFORM_DEFINITIONS, key)) {
      return PUBLISH_PLATFORM_DEFINITIONS[key as PublishPlatform].name;
    }
    return key;
  }).join("、");
}

export function libraryConventionText(
  libraryRoot: string,
  dataDir: string,
  scriptRules?: string,
  enabledPlatforms?: readonly string[],
): string {
  const lines = [
    "Muzi Creator 使用 Creator Studio 作为唯一可写创作事实源，使用 muzi_creator_* 工具读取或保存；不要用通用文件工具绕过修订检查。",
    "Muzi Atlas 是只读知识事实源；只用 muzi_knowledge_* 工具读取正式 Wiki。raw/ 不参与搜索或生成，知识写入只能由标准 llm-wiki 流程完成。",
    "项目包含母内容、视频稿、公众号、小红书和博客稿，可从母内容或视频稿起步。派生稿记录源文档哈希，源更新后不自动覆盖。",
    "创建或保存必须先展示预览并等待用户明确确认。发布状态不根据文件存在推断。",
    "写或改 script.md 必须遵循用户的脚本规则（人设）：先用 oil_script_rules 读取；还没配置时主动问清语气、结构和禁忌，再用 oil_script_rules 存下来。",
    "Oil 工具继续提供 Screen Studio、字幕、封面与本地媒体能力。外部同步、上传和发布默认关闭；启用后也必须逐次通过 DSH 审批。",
  ];
  if (enabledPlatforms !== undefined) {
    lines.push(
      enabledPlatforms.length === 0
        ? "当前没有启用发布平台。不要调用 video-publisher 或 oil_sync_publish。"
        : `当前启用平台：${enabledPlatformNames(enabledPlatforms)}。video-publisher 和 oil_sync_publish 只处理这些平台。`,
    );
  }
  if (scriptRules !== undefined && scriptRules.trim() !== "") {
    lines.push("", "当前脚本规则（人设）：", scriptRules.trim());
  }
  return lines.join("\n");
}

export function registerLibraryPrompt(ctx: PromptSectionHost, source: LibraryPromptSource): () => void {
  return ctx.systemPrompt.section({
    name: "oil:library",
    order: 120,
    text: () => libraryConventionText(
      resolvePromptLibraryRoot(source),
      source.dataDir,
      source.cachedScriptRules,
      source.cachedEnabledPlatforms,
    ),
  });
}
