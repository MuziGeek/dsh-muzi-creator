# Muzi Creator：单插件架构与现阶段实现

## UI Lab 与 Animal Island 约束

界面 Lab 是项目内的隔离开发环境，并在 `.lab/dsh-home/profiles/web` 创建一次性 DSH Web profile。Desktop 2.0.2 另用 `.lab/desktop-home/profiles/web` 与 `.lab/desktop-user-data`，不共享个人 DSH home 或 Electron user-data。两条 profile 都只含一个指向当前源码 checkout 的受控插件链接；每次启动前逐项核对 manifest、patch、workspace、受限写入路径、源码链接和 `lib/index.js`、`lib/client.js`、`lib/typert.host.js`、`lib/collect-publish.mjs` 构建产物，任一文件偏离生成值即拒绝启动。

Desktop 2.0.2 的私有 `<user-data>/profile-selection/state.json` 固定为 `{ "version": 1, "active": "web", "lastKnownGood": "web" }`；`<user-data>/desktop-market/state.json` 固定请求 `disabled`；`<desktop-home>/settings.yaml` 固定 `dsh-desktop.mode: compatibility`。三项状态都在 Electron spawn 前重新读取、严格比对。启动参数显式包含 `--user-data-dir <.lab/desktop-user-data>`；子进程的 `DSH_HOME`、`HOME`、`USERPROFILE` 指向 `.lab/desktop-home`，应用数据、遥测、凭据与外部能力保持隔离。脚本拒绝路径逃逸及其他符号链接/联接点，凭据为空且 `externalActionsEnabled` 固定为 `false`。Lab 不安装软件、不发布、不同步、不归档；本地 `.tgz` 成品路径只可做 `.lab/packages/` 下的准备性校验，安装与 Desktop 实机启动仍是单独验收步骤。

Animal Island UI 的入口只允许客户端 entry 的一次 `animal-island-ui/style` 导入和 `IslandControls` 适配层中的包根组件导入。库组件使用 `--animal-*` token，自定义布局使用插件根下的 `--muzi-island-*` token；宿主 DSH 对话、设置、审批和 shell layout 仍由 Host 所有。Inspector 只控制自身 Overlay 的位置和宽度，不查询对话滚动容器，也不向对话 DOM 写入 padding 或 transition；宽屏内的 480 px 分栏由 Inspector 容器查询切换内部单列布局，不依赖窗口宽度。组件映射、原生控件例外与响应式验收点集中记录在 [DESIGN.md](../DESIGN.md)。

`dsh-muzi-creator` 是挂在 DeepSeek Harness web 配置上的单个运行插件。它把选题、创作、知识、热点、项目进度和受控发布入口放进同一界面，同时保留 Agent 对话。

安装：`npx @deepseek-ai/dsh plugin --profile web add github:MuziGeek/dsh-muzi-creator`（本地开发用目录路径）

卸载：`npx @deepseek-ai/dsh plugin --profile web remove dsh-muzi-creator`

插件对官方侧栏的替换只写在项目自己的 `cordis.patch.yml`，通过 `package.json` 的 `dsh.bundle.patch` 随包安装。不要把这段配置写进用户的 `~/.dsh/profiles/web/cordis.patch.yml`；用户层不会跟随插件卸载，残留后会把官方侧栏继续关掉。

Harness 从 GitHub 安装时生成的构建包显式包含 README 引用的最终 `assets/readme/hero.svg`，不包含 `assets/readme/source/` 下的源素材。

本文写当前设计，不是变更记录。实现新功能时先读这里，再打开对应 Skill 或官方文档。

## 单插件架构边界

DeepSeek Harness 负责 Agent、会话、工具、一次性审批和 Workspace。Muzi Creator 只负责挂载导航与界面，并把外部事实转换为可展示或可审批的操作：Creator Studio 保存项目和创作内容，Muzi Atlas 只读提供知识，AIHOT 只读提供热点，各 Git 仓库与 `.trellis/tasks` 保存项目进度，`video-publisher` 保存平台账号、浏览器任务和验收事实。

创作、知识、热点、Trellis 和发布适配是同一个 npm 包中的逻辑模块，不是独立安装插件。当前 Profile 不包含组合套件或额外 Muzi 壳，也不依赖其他产品。插件不得复制这些来源的权威数据，只保存自身兼容配置、界面状态和受控操作所需的本地投影。

## 最终要做成什么样

目标是一条能走完的创作流水线，人在关键处动手，机器包办重复劳动。日常路径是：

1. **选题**：在对话里讨论这一期讲什么，插件建一个当天的内容文件夹，笔记写进 `topic.md`。
2. **录制**：用 Screen Studio 录。插件可以绑定 `.screenstudio` 工程。
3. **剪辑**：对话里走 `screen-studio-editor` 清理停顿和误讲。人打开工程预览，确认后再亲手导出 MP4。插件不代替导出。
4. **等导出**：导出开始后，插件盯着影片目录，成片稳定落盘再往下走。这段时间可以并行做字幕和封面。
5. **字幕**：用百炼 Key 转录；`oil-subtitle` 首次 clone 后必须运行 `bash ~/.agents/skills/oil-subtitle/setup.sh`；人在 skill 自带的预览编辑器里改稿，确认后再烧进视频。
6. **封面**：有 ZenMux Key 就出 3:4 / 4:3 / 16:9。封面主标题和错别字由对话里的 Agent 核对，不交给脚本自行发挥。
7. **标签与发布包**：`publish-package.json` 给四个视频平台，只需要标题和 tags，不写平台长文案。`enabledPlatforms` 默认启用小红书、抖音、B 站、视频号四个平台，关闭的平台不参与 AI 发布和数据同步。公众号文章是旁边的 Markdown，不是第五个视频平台，走 `oil-video-article`，成稿在 `公众号文章/`。
8. **发布**：`muzi.creator/2` 项目通过 DSH 调用 `video-publisher` 的 Windows Patchright 控制面；每个平台独立选择仅准备、立即发布或原生定时发布。默认仅准备，最终动作逐平台确认。
9. **回收**：手动触发 Patchright 打开独立账号目录中的创作者后台，按远端 ID、规范化 URL、唯一精确标题依次匹配，追加播放 / 赞 / 评论快照。不是公开站爬虫；歧义或分页不完整时不写新事实。

一条片子对应影片目录里的一个子文件夹。工程在 Screen Studio 工程目录里，用绑定连起来。

## 现阶段已经能做什么

| 环节 | 现状 |
| --- | --- |
| 列表与检查器 | 自定义侧栏「内容」页；检查器叠在对话左边，聊天不关；概览用状态标签标明阶段，只展开当前步骤的操作 |
| 建内容、选题笔记 | 面板新建；`oil_create_content` 建文件夹；选题写 `topic.md` |
| 绑定 / 打开工程 | 面板换绑、打开；`oil_open_studio` |
| 等导出 | `oil_wait_export` 立刻返回并开始盯目录；成片稳定后清掉 waiting 标记 |
| 字幕预览、烧录、生成 | 按钮和同名工具会拉起 `oil-subtitle` 脚本 |
| 生成封面 | 按钮和工具拉起 `oil-cover` 脚本；标题先用文件夹名 |
| 发布状态 | 读 `{标题}.auto-publish.json`；点状态胶囊从菜单里选未发布 / 草稿 / 已发布，手写优先 |
| 已发布数据 | 检查器「同步已发布」只对当前这一期：找到标题就停翻页，overlay 也只写这一条。`oil_sync_publish` 不传 id 才同步整库 |
| API Key | 设置 → 插件 → 内容工作台；和视觉识别共用官方凭据 |
| 公众号 | 只显示目录里有没有 `公众号文章/`，不生成 |
| 剪辑、多平台上传 | 剪辑仍从对话调用 Skill；`muzi.creator/2` 项目已接入 Windows 四平台准备、逐平台提交和状态查询 |

上面这张表是工作台已经具备的能力：能看列表、绑定工程、启动字幕和封面脚本、标记发布状态。对照「最终要做成什么样」那 9 步，整条创作路径还没有全部接到插件里。现在有的是一条片子的工作台和几个可点的执行入口，不是点一次就从选题走到待发布。

日常路径里，插件还包不住、仍要在对话里自己喊 skill 或亲手做的：

1. **剪辑**：只能打开工程，不会替你跑 `screen-studio-editor`。
2. **导出后的并行编排**：「导出开始就同时做字幕和封面」没有连成一条自动流水。
3. **字幕校对**：生成完不会自动改专有名词；预览还要人自己看。
4. **封面主标题和错别字**：按钮不会先让 Agent 提炼标题，也不会验字。
5. **发布包**：能展示已有 `publish-package.json` 里的标签，不会在插件里写平台长文案。
6. **旧片库四平台上传**：`oil_*` 片库仍只记状态；`muzi.creator/2` 项目由新的 `muzi_creator_*` 工具调度 `video-publisher`。
7. **公众号成稿**：不会跑 `oil-video-article`。
8. **没有本地文件夹的旧作**：同步会翻完创作者后台的已发布列表，但对不上本地片子的不会自动建文件夹。

## Muzi Creator Windows 发布控制面

`VideoPublisherService` 是 DSH 与项目本地 `video-publisher` Skill 的唯一桥。它只允许 `publish-package.json` 位于当前 Creator 项目内，准备和提交前都校验 `revision`。准备可包含四个平台，状态分别为 `READY_DRAFT`、`READY_TO_PUBLISH` 或 `READY_TO_SCHEDULE`；提交一次只接受一个平台。Skill 把项目、素材散列、账号、标题/标签/原创声明、模式、准确时间和最终页面证据绑定为 10 分钟一次性摘要。最终点击前先写 `COMMIT_UNKNOWN`，因此点击后结果不可靠时不会自动重试。

Windows 的 `prepare_only`、`publish_now`、`schedule`、`metrics` 按账号分别受 `~/.video-publisher/acceptance.json` 控制。DSH 只读调用 `publisher.mjs capabilities`，集中校验 `muzi.video-publisher.capabilities/1`：账号、启用状态、每项能力、验收时间和适配器信息有任何缺失、格式错误或重复都 fail closed。自动测试通过不等于真实账号可用；只有带时间和服务端证据的 Windows 真实验收才打开对应能力。旧 Ego 验收不能沿用。原生定时失败直接返回 `SCHEDULE_UNAVAILABLE`，不降级为立即发布。

验收控制面分为四步：只读开始并核验账号、执行该能力的单一路径、核对结构化结果证据、最终写入该账号的单项能力。账号核验本身不能直接完成验收。`prepare_only` 必须取得 `READY_DRAFT` 与 guard 证据；立即/定时必须在独立确认后取得可靠远端结果；指标必须强制跳过缓存并完成分页。指标子进程不再自行读取旧 acceptance 文件，而是只接受 DSH 在完成账号检查后传入的本次精确账号 grant。

项目发布事实保持 `muzi.creator/2`：旧项目缺少 `remoteId` 或 `scheduledAt` 时按 `null` 读取。仅在平台明确保存草稿、确认排程或确认发布后更新事实；每次写入重新读取 revision，冲突即停止。指标快照追加到 `creator-metrics.jsonl`，90 秒缓存不追加重复快照，登录失效、页面变化、分页不完整或标题歧义不覆盖旧数据。

工作阶段（`workflow`）由文件和 overlay 推出来，不是单独手填一张总表：

- `idle` 未开始
- `record` 待录制（overlay 里标了准备录）
- `cut` 待剪辑（已绑工程、还没有成片）
- `finish` 待加字幕 / 封面
- `publish` 待发布（字幕和封面都齐）

## 一层工作台，skill 继续执行重活

保持 **一个** Harness 插件。官方要求：只有能力需要独立替换时才拆包，不要预防性拆分。见 DeepSeek Harness `docs/user/develop/practice/index.zh.md`。

设置位 `settings.plugin.item` 的含义是「一个插件一张卡」，不是一个功能一张卡。
Harness `0.1.1-rc.2` 从 Host 的 `settings.describe` 取得插件命名空间，再按同名 `key` 派发设置卡；插件同时保留列表槽位使用的 `id` 兼容坐标。当前设置值仍统一由插件 Remote 和 `~/.dsh-oil-creator/overlay.json` 管理，Host 命名空间只负责让设置卡被发现，避免双数据源；两类槽位都由锁定的 rc.2 包执行测试。

执行分工：

- **磁盘文件**：片子的正文。约定见 [files.md](files.md)。模型用系统自带的列文件 / 读文件 / 写文件。
- **插件**：侧栏、检查器、阶段推导、官方凭据、给模型的文件约定（`systemPrompt` 段落 `oil:library`）。核心界面和 `oil_*` 工具不依赖专用 Agent Preset。
- **内置 Skill**：`creator-workbench` 负责首次体检、配置预览、目录整理和发布安全流程。普通带 Skill 与文件工具的 Agent 就能使用，推荐 `standard` 或 `code`；`minimal` 不适合这条引导。专用 Creator Preset 以后只作为可选入口。
- **Harness 工具**：用官方 `defineTool` 注册。只做文件做不到的事，或启动一项已经约定好的脚本。长任务立刻返回，完成与否看文件夹里有没有产物。`oil_wait_export` 也是启动监视，不把 `execute` 阻塞到导出结束。
- **Skill 脚本**：ASR、FFmpeg 烧录、选帧生图。不要把 Python 和 SOP 整份搬进 `execute()`。
- **对话里的 Agent**：校对字幕、提炼封面主标题、看封面错别字、审查剪辑报告。这些判断留在对话里。

对话里的插件工具：

`oil_creator_guide`、`oil_script_rules`、`oil_creator_setup`、`oil_create_content`、`oil_update_content`、`oil_creator_profile`、`oil_organize_library`、`oil_sync_publish`、`oil_open_studio`、`oil_wait_export`、`oil_open_subtitle_preview`、`oil_burn_subtitles`、`oil_generate_subtitles`、`oil_generate_cover`，以及只读的 `muzi_creator_video_publish_capabilities`、`muzi_creator_prepare_video_publish`、`muzi_creator_begin_video_acceptance`、`muzi_creator_finalize_video_acceptance`、`muzi_creator_commit_video_publish`、`muzi_creator_video_publish_status`、`muzi_creator_sync_video_metrics`。

`oil_creator_guide` 是自举入口：用户不知道插件能做什么、或模型不确定下一步时调用，返回带当前能力状态的完整指引，包括 Chrome 缺失时页面准备和数据回收不可用。`oil_script_rules` 读写脚本规则（人设），存在 overlay 里；写或改 `script.md` 前模型先读它。`oil_creator_setup` 无参数时只读检查目录、操作系统、Screen Studio、字幕、封面、凭据和 Chrome。带配置字段但 `apply=false` 时只返回提案；只有用户确认后才用 `apply=true` 写入。可选依赖缺失只降级对应能力，不影响片库核心。

检查器中间栏默认 640px，可在 480–800px 内拖动，并至少给右侧对话保留 440px；空间不足时自动全屏。它走 `shell.overlay`，不占用官方右侧「详情」栏。官方详情栏保持关闭。发布区拆成同步、视频平台、公众号、标签几张卡。概览封面并排 3:4 和 4:3。视频页播放 `_subtitled` 成片，没有则播原片。脚本写在内容文件夹的 `script.md`，已经转好的 Markdown 在 `公众号文章/`。列表按文件夹名里的日期倒序，同一天按文件夹创建时间倒序；重导出或重新生成产物不会改变顺序。对话里 `@` 可以点一条片子或「当前详情」，`/current content` 引用当前打开的那条；发给模型的只有文件夹路径，正文和封面用系统列文件 / 读文件。

## 状态存在哪里

不要往 `overlay.json` 里写 API Key，也不要把密钥回读到页面。

| 数据 | 位置 |
| --- | --- |
| 影片目录、项目目录（`trellisProjectsRoot`）、Obsidian 定位路径（`obsidianExecutable`）、`enabledPlatforms`、脚本规则（人设）、工程绑定、待录制、等导出、手写发布状态、同步到的播放/赞/评、烧录/生成任务 | `~/.dsh-oil-creator/overlay.json` |
| 成片、字幕、封面、发布包、公众号文章 | `~/Movies/视频项目/<日期_标题>/` |
| 字幕和封面 Key | Harness 官方凭据（字幕用 `DASHSCOPE_API_KEY`、封面用 `ZENMUX_API_KEY`），与 `dsh-vision` 共用 |
| 列表选中项、侧栏宽度 | 浏览器本地 UI 状态 |
| Windows 发布任务与一次性授权 | `~/.video-publisher/v3-tasks/<task-id>/`；授权 10 分钟有效且只能使用一次 |
| 四平台独立登录态与账号锁 | `~/.video-publisher/chrome-profiles/`、`~/.video-publisher/account-locks/` |
| `muzi.creator/2` 指标历史 | DSH `dataDir/creator-metrics.jsonl`，追加式快照；缺失指标保存为 `null` |

旧片库发布状态仍是两层：文件夹里的 `{标题}.auto-publish.json` 推断草稿；overlay 里的手写状态盖过它。Patchright 同步成功后，对应平台写成 `published`，并带上 `url` / `views` / `likes` / `comments` / `syncedAt`，来源记为 `sync`。`muzi.creator/2` 另用向后兼容的 `remoteId`、`scheduledAt` 和 `source: publisher`，不把每次指标值反复写回 `project.yml`。

采集本身是机械脚本，不经过模型判断：

```text
node scripts/collect-publish.mjs
```

采集脚本使用固定版本 Patchright 连接本机 Chrome；每个平台和账号使用独立持久化目录，且与发布共用账号级互斥锁。`pnpm build` 用原地覆写把 `scripts/collect-publish.mjs` 写进 `lib/`，避免 `cp` 断开 profile 里 `file:` 依赖的硬链接。翻页范围：小红书 `note/user/posted`（列表滚到底）、抖音 `work_list`（`max_cursor`）、B 站 `/x/web/archives`（`pn`）、视频号 `post/post_list`（`currentPage`）。达到页数/滚动上限却没有完整结果时返回 `PAGINATION_INCOMPLETE`，不覆盖已有指标。

90 秒内再点同步会使用 `~/.dsh-oil-creator/collect-cache.json`，但缓存必须同时匹配平台、账号、远端身份/URL 和精确标题；不同项目或账号不会复用。超过这个时间再跑 Patchright；显式 `force` 跳过缓存。可用 `OIL_COLLECT_PLATFORMS=wechat,douyin` 只跑其中几个，`OIL_COLLECT_ACCOUNTS` 指定平台账号。工作台按钮和同步工具走同一条脚本。

文件夹约定：`YYYY-MM-DD_可读标题`。发布包规范名是 `publish-package.json`。带字幕的成片文件名含 `_subtitled`。

## 实现时参考什么

先官方约定，再打开对应 skill。不要重新发明目录、密钥或烧录参数。

### DeepSeek Harness 源码仓库

| 题目 | 读什么 |
| --- | --- |
| 插件怎么挂、`apply` / `ctx` | `docs/user/develop/basic/index.zh.md` |
| 给模型注册工具 | `docs/user/develop/basic/tool.zh.md` |
| 长任务、规范返回值、不要把散文当 API | `docs/cookbook/adding-a-tool.md` |
| 一个包还是拆成 Definition / Provider | `docs/user/develop/practice/index.zh.md`（不要预防性拆分） |
| API Key 只写不回读 | 官方凭据服务；界面对照已安装的 `@oil-oil/dsh-vision` 设置卡 |
| 设置卡槽位 | `packages/client/ui-settings-plugins` 里对 `settings.plugin.item` 的说明 |

官方 Bash 那种三包拆分，只适用于「同一能力会换执行环境」。内容工作台不是这种能力。

### oil 自己的 skill（执行器和产品规则）

标准安装位置是 `~/.claude/skills`、`~/.codex/skills`、`~/.agents/skills` 三选一，插件自动发现；下表统一写 `~/.agents/skills`。

| 环节 | Skill | 路径 | 插件可以包什么 | 仍留给 Agent / 人 |
| --- | --- | --- | --- | --- |
| 剪辑工程 | `screen-studio-editor` | `~/.agents/skills/screen-studio-editor` | 以后可加「按绑定工程开剪辑」；现在只绑定和打开 | 审查删除、Screen Studio 里预览、手动导出 |
| 字幕 | `oil-subtitle` | `~/.agents/skills/oil-subtitle` | clone 后必须运行 `setup.sh`；已包预览编辑器、转录、按稿烧录 | 校对不确定词、确认预览后再烧 |
| 封面 | `oil-cover` | `~/.agents/skills/oil-cover` | 已包脚本模式三画幅生成 | 提炼主标题、看错别字、决定是否重跑某一画幅 |
| 发布文案语气 | `oil-tone` | `~/.agents/skills/oil-tone` | 不执行；写标题简介时读档案 | 成稿必须过 `tone_lint.py` 再通读 |
| 公众号图文 | `oil-video-article` | `~/.agents/skills/oil-video-article` | 识别 `公众号文章/` | 从无头像屏幕轨截图、按 oil-tone 写文章 |
| 四平台视频发布 | `video-publisher` | `~/.agents/skills/video-publisher` | Windows 下调度准备、逐平台最终动作、状态和指标同步 | Patchright 上传并保持最终保护；真实能力逐平台验收，每次最终动作由人批准 |

字幕脚本入口以 oil-subtitle 为准：`bailian_transcribe.py` → `review_subtitles.py` → `prepare_subtitles.py` → `preview_editor.py`，用户确认后再 `burn_subtitles.py`（有审过的 SRT 用 `--srt-input`）。不要在预览前烧录。封面脚本是 `generate_oil_cover.py`，主标题由调用方按 oil-cover 提炼后传入 `--title`，Key 用环境变量 `ZENMUX_API_KEY`。不要改 skill 仓库里的用户路径和密钥。

封面还有 Agent 自主模式，依赖执行环境自己的生图工具。Harness 工作台默认走脚本模式，因为这里稳定的是 ZenMux 脚本，不是 Codex 内置 `image_gen`。

## 改代码时的约束

- 插件只做一张工作台，新能力优先加模块，不加新插件。
- 密钥走官方凭据；页面只显示已配置 / 未配置。
- 重媒体继续调用已有脚本，参数与对应 SKILL.md 保持一致。
- 人导出、人点平台发布、Agent 做校对和标题，这三件事不要改成全自动。
- Host remote 或工具改完后要重新 `pnpm build` 并重启 `dsh web`。
