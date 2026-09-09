# 0.2.0 命名与升级

产品名称保持 Muzi Creator，安装包仍是 `dsh-muzi-creator`。插件自有命名统一为 MZ；已有 `muzi_creator_*` 接口保持不变。

## 调用方调整

- 插件工具前缀由 `oil_*` 改为 `mz_*`，例如 `mz_creator_setup`、`mz_update_content`、`mz_generate_subtitles` 和 `mz_generate_cover`。
- 远程命名空间由 `oilCreator` 改为 `mzCreator`，客户端使用 `remote.mzCreator`。
- 国际化命名空间改为 `dsh.mz.creator`；内容引用来源标记改为 `mz`。
- 插件采集脚本变量由 `OIL_COLLECT_*` 改为 `MZ_COLLECT_*`，参数后缀和用途不变。

旧接口和旧采集变量不再注册或读取，没有兼容转发。需要同步更新调用方，并在升级时一起替换宿主和客户端构建，重启后开启新会话；历史会话中记录的旧调用不会被改写，也不能作为可继续执行的旧接口使用。

## 数据目录

显式配置的 `dataDir` 始终优先。未配置时，仅存在 `~/.dsh-oil-creator` 就继续读取该目录；没有旧目录时使用 `~/.dsh-mz-creator`。两者都存在时，需要明确设置 `dataDir`，插件不会猜测、合并或移动数据。

这项规则同时适用于内容记录、预览服务登记与采集空间登记。历史采集登记和遗留空间清理标记仍按原有规则处理；新采集空间统一使用 MZ 前缀。升级不改写历史报告、会话正文及校验值；不修改个人目录或模型配置。

## 保留的外部名称

字幕、封面及其他外部 Skill 继续使用 `oil-subtitle`、`oil-cover`、`oil-tone`、`oil-video-article` 的真实名称、来源、脚本和目录。`OIL_SUBTITLE_SKILL` 与 `OIL_COVER_SKILL` 仍可配置其路径；`generate_oil_cover.py` 仍为上游脚本入口。工具 `mz_generate_subtitles` 和 `mz_generate_cover` 只是插件入口改名，不代表替换执行器。

上游版权、LICENSE、NOTICE 和来源署名继续保留。

[返回 README](../README.md)

图标来源清单和图标说明保留图标生成工具的原始署名。此例外仅限 `src/client/assets/workbench-icons/manifest.json` 与 `docs/iconography.md`，不能用于插件接口或其他文件中的旧命名。
