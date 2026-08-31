> Muzi Creator 是基于 [Oil Creator](https://github.com/oil-oil/dsh-oil-creator) 的私有改造版，继续保留原项目的 MIT License。它把 Oil 的本地视频工作流扩展为 llm-wiki 正式知识 → 母内容/视频稿 → 多渠道稿件的创作工作台。

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="dsh-oil-creator：让 AI 和本地内容目录一起工作">
</p>

<p align="center">
  <strong>DeepSeek Harness 上的知识驱动创作工作台。</strong><br>
  从正式知识、母内容和多渠道稿件，到录屏工程、字幕、封面与发布事实，一个主题始终对应一个本地项目。
</p>

> [!NOTE]
> 当前兼容 Node.js 22.19+、DeepSeek Harness `0.1.0-rc.6` / `0.1.0-rc.7`。核心片库可独立使用；Screen Studio、字幕、封面、公众号和发布能力均可按需安装。

## 一个主题，就是一个项目目录

插件不建立封闭的内容数据库。正文和产物仍是普通文件，任何编辑器和 AI 文件工具都能读取：

```text
creator-studio/10-active/YYYY-MM-DD_可读标题/
├── project.yml
├── brief.md
├── evidence.md
├── mother-content.md
├── channels/video/script.md
├── channels/wechat/draft.md
├── channels/xiaohongshu/draft.md
├── channels/blog/draft.md
├── assets/refs.yml
└── review.md
```

Creator Studio 保存创作正文和明确状态；Muzi Atlas 始终只读。Oil 的本地媒体 overlay 独立保存在兼容目录 `~/.dsh-oil-creator/overlay.json`，不会写入 Atlas。

左侧将“会话 / 热点 / 内容 / 知识 / 项目”纵向排列。知识区域只展示 `wiki/topics` 主题页面，搜索也仅覆盖主题。顶部“预览”会在只读浮层中显示实时统计与 3D 主题中心知识星图；星图支持滚轮缩放、旋转视角和拖动节点，只使用正式 Wiki 中可唯一解析的显式 `[[Wiki 链接]]`，不会运行 llm-wiki 的离线图谱写入流程，也不会持久化节点位置。内容目录可直接新建，知识新增入口会切换到会话并交由标准 llm-wiki 流程写入。

内容详情中的项目阶段、稿件状态、发布状态和视频制作状态均以中文只读展示。概览会显示从制作准备、录制、剪辑与导出、字幕与封面到成片就绪的紧凑阶段进度；视频制作页展开每个阶段的本地工程、任务和产物事实，字幕与封面作为并行工作展示。发布状态仍由发布渠道单独记录，不生成进度百分比。正文仍可显式编辑和保存，状态变更由创作事实源或经过确认的 Agent 工具负责。

空白会话的中心标题使用内置 Muzi 头像与“木子在生长”（英文界面为 “Muzi is growing”），不显示预览徽标；侧边栏仍显示 “Muzi Creator”。

## AIHOT 每日热点

“热点”入口通过 [AIHOT REST v1](https://aihot.virxact.com/agent) 的匿名只读接口读取多源热点、过去 24 小时精选和最新日报。结果按“今日必看 / 值得浏览 / 其余动态”分层：今日必看最多 3 条，要求至少两个独立信源并命中 Agent 工作流、安全与政策、内容生产、AI 能力或知识工作关注领域；其余两层分别最多展示 8 条和 12 条。

宿主会缓存最近一次成功结果 15 分钟。刷新失败时继续显示上一版有效数据并明确标记为陈旧；首次读取失败只影响热点模块，不阻塞会话、内容、知识或项目。热点详情在宽屏全屏状态使用主文与证据双栏，在分栏和窄屏下按阅读顺序堆叠；长综述仅按原文自然边界分段，跟进来源默认显示前 6 个并可展开。详情提供 AIHOT 事件和原始来源链接，标题、摘要与事件综述可能由 AI 生成，重要数字、政策和引文仍需回到第三方原文核对。

热点始终是只读外部信号，不会自动生成选题、内容、任务、Agent 指令或发布动作；页面也不会把热点结果写入本地配置或持久化数据。

## 项目管理与 Trellis 进度

“项目”入口直接读取 `trellisProjectsRoot` 下的一级子目录；Windows 默认目录是 `D:\GitProject`，其他平台默认使用 `~/Projects`。列表每次从磁盘重新发现项目，项目标识由规范化后的真实路径稳定生成，不依赖 DSH Workspace，也不保存一份容易失效的关联清单。

只有**本身**是 Git 根目录且包含可读 `.trellis/tasks` 的一级子目录才会进入列表。插件不会递归搜索、向上查找父仓库，也不会把缺失、无权限或损坏的目录换算成零进度。项目卡片和详情面板展示 Trellis 文件中的事实计数：计划中、进行中、已完成待归档、未知状态、已归档和异常任务；不生成主观健康度或虚假的完成百分比。

详情面板读取活动任务和 `archive/YYYY-MM`，展示优先级、负责人、当前阶段与下一阶段、父子关系、时间、分支、相关文件和验证材料。阶段摘要直接读取 Trellis 的 `current_phase` 与 `next_action`，不生成完成百分比。只有归档任务同时满足 `status: completed`、存在 `completedAt` 且包含有意义的验证材料，才标记为“已验证完成”；其他归档任务明确显示“证据不足”。目录监听、防抖 revision 和窗口聚焦刷新会同步磁盘变化。

任务按状态分组，默认每组显示前 5 条并保留原始顺序；超过 5 条时可在组内展开或收起其余任务。优先级筛选先于折叠计算，切换项目或筛选会恢复折叠状态；通过父子关系定位到隐藏任务时，对应分组会自动展开。

UI 归档采用两阶段确认：先重新检查任务摘要、目标月份、验证材料、Git 未提交摘要、活动子任务和具体影响，再签发短时一次性令牌。确认执行时仍会重新校验；状态漂移、活动子任务、路径异常、缺少 `--no-commit` 支持或配置了 `hooks.after_archive` 都会阻止归档。验证材料不足或 Git 工作树不干净会显示醒目警告。

归档只通过项目自己的 `.trellis/scripts/task.py archive <task> --no-commit` 移动 Trellis 文件。它不会自动提交、推送、发布，也不会在失败或结果不确定时自动重试。首版只提供读取、筛选、详情和受控归档，不提供任务新建、编辑、启动或状态修改。

## 一条片子如何向前推进

| 阶段 | AI 与插件可以做什么 | 仍由人确认什么 |
| --- | --- | --- |
| 选题与脚本 | 新建规范目录，读写 `topic.md` / `script.md`，遵守长期脚本规则 | 选题方向和最终表达 |
| 录制与剪辑 | 绑定并打开 Screen Studio 工程，等待导出文件稳定落盘 | 录制、时间线剪辑和导出 |
| 字幕与封面 | 启动字幕工作流，打开预览，烧录字幕，生成三种画幅封面 | 专有名词、标题和错别字 |
| 发布 | Windows 下用 `video-publisher` + Patchright 分平台选择仅准备、立即发布或原生定时发布 | 每个平台最终动作单独确认；默认仅准备 |
| 数据回收 | 手动触发 Patchright 同步已发布作品的播放、赞、评和链接 | 登录状态、分页完整性和异常匹配结果 |

工作台不会假装替人完成录制、剪辑或最终发布。它负责把每一步需要的文件、状态和下一步动作放在同一个上下文里。

## 开始使用

### 1. 安装插件

使用 DeepSeek Harness 自带的插件管理命令：

```bash
npx @deepseek-ai/dsh plugin --profile web add github:MuziGeek/dsh-muzi-creator
```

重启 `web` profile 后即可使用。插件会登记到配置里，不需要手改 Harness 配置。已经全局安装 `dsh` 时，可以去掉命令里的 `npx @deepseek-ai/dsh`。

Harness 从 GitHub 安装时生成的构建包包含 README 引用的最终 `assets/readme/hero.svg`，不会包含 `assets/readme/source/` 下的源素材。

<details>
<summary>从源码安装</summary>

```bash
git clone https://github.com/MuziGeek/dsh-muzi-creator.git
cd dsh-muzi-creator
pnpm install --frozen-lockfile
pnpm build
npx @deepseek-ai/dsh plugin --profile web add "$PWD"
npx @deepseek-ai/dsh web
```

如果 pnpm 明确提示安装期构建被阻止，再带 `--allow-build` 重试；正常安装不需要这一步：

```bash
npx @deepseek-ai/dsh plugin --profile web add --allow-build=dsh-muzi-creator github:MuziGeek/dsh-muzi-creator
```

</details>

### 2. 让 AI 完成首次配置

推荐选择 Harness 的 `standard` 或 `code` Agent preset，然后直接说：

> 检查并配置内容工作台，找到适合的内容目录，并告诉我还缺哪些能力。

内置 `creator-workbench` Skill 会先调用只读的 `oil_creator_setup`：

1. 寻找已有的内容目录。
2. 检查 Screen Studio、字幕、封面、Chrome 和 Patchright 等可选能力。
3. 只报告凭据是否已配置，不把 API Key 读回对话。
4. 先预览配置变化，得到确认后才保存。

候选目录不存在时，AI 会先展示准备创建的完整路径；确认创建后再重新预览配置。`minimal` preset 不包含 Skill 和文件工具，不适合首次配置或自动整理目录。

### 3. 做第一条内容

可以直接对 AI 说：

> 今天做一期 DeepSeek Harness 安装上手。新建内容目录，把选题写进笔记，再给我一个脚本初稿。

随后继续说“绑定刚才的 Screen Studio 工程”“等待成片后生成字幕和封面”或“这条还缺什么”。工作台会根据文件夹里的真实产物推进阶段。

## 核心能力

- **本地片库**：按 `日期_可读标题` 扫描目录，展示阶段、成片、字幕、封面、文章和发布状态。
- **对话上下文**：通过 `@当前详情`、内容搜索或 `/current content` 把目标文件夹交给 AI。
- **AI 自举配置**：自动发现标准安装路径，缺少能力时给出明确安装方式，写入前必须预览和确认。
- **长期脚本规则**：保存语气、结构、禁忌和目标观众，之后写或修改 `script.md` 时复用。
- **长任务追踪**：字幕、封面和烧录启动后立即返回，由工作台继续观察文件产物和任务状态。
- **项目进度**：自动发现配置目录中的 Git + Trellis 项目，以事实计数、任务关系和验证材料查看开发进度，并在二次确认后无提交归档。
- **每日热点**：读取 AIHOT 的多源事件、24 小时精选和日报，按可解释规则分层浏览并回查来源。
- **目录整理**：预览并修正旧文件夹名称；默认不执行、不删除文件。
- **可选发布闭环**：准备平台草稿后由人最终发表，再同步播放、点赞、评论和作品链接。

完整工具列表和逐步示例见 [使用说明](docs/usage.md)。

## 可选能力

核心片库和脚本管理不依赖下表中的外部工具。缺少某项时，只关闭对应环节。

| 能力 | 可选依赖 | 说明 |
| --- | --- | --- |
| 字幕转录、排版、预览和烧录 | [oil-subtitle](https://github.com/oil-oil/oil-subtitle) + `DASHSCOPE_API_KEY` | 首次 clone 后必须运行 `bash ~/.agents/skills/oil-subtitle/setup.sh`；Key 在[百炼控制台](https://bailian.console.aliyun.com)申请 |
| 三画幅封面 | [oil-cover](https://github.com/oil-oil/oil-cover) + `ZENMUX_API_KEY` | Key 在 [ZenMux](https://zenmux.ai) 申请 |
| Screen Studio 自动剪辑 | [screen-studio-editor](https://github.com/oil-oil/screen-studio-editor) | 仅 macOS；录制和导出仍在 Screen Studio 完成 |
| Creator 文档定位 | [Obsidian](https://obsidian.md/) | 配置宿主上的 `obsidianExecutable` 绝对路径后，内容详情可直接定位到对应 Markdown 文档 |
| 多平台草稿、立即/定时发布与数据回收 | 本机 Chrome + 固定版本 Patchright + [video-publisher](https://github.com/oil-oil/video-publisher-skill) | Windows 使用独立账号目录；各平台能力须经真实账号验收，最终动作和同步均需当次批准 |
| 公众号图文 | [oil-video-article](https://github.com/oil-oil/oil-video-article) | 独立工作流，工作台负责展示已有文章 |

字幕和封面 Skill 留空时，插件会依次从 `~/.claude/skills`、`~/.codex/skills`、`~/.agents/skills` 自动发现；只有非标准安装位置才需要填写高级路径。

## 配置原则

设置入口位于 **设置 → 插件 → 内容工作台**。设置页只保留需要人决定的信息，例如内容目录、项目目录、Obsidian 定位路径、脚本规则和可选能力凭据；可以通过系统检查发现的路径不重复暴露。

- API Key 使用 Harness 官方凭据服务保存。页面只显示“已配置 / 未配置”，不会回显明文。
- 内容目录可以换成任意已有的绝对路径，每个直接子文件夹代表一条内容。
- 项目目录（`trellisProjectsRoot`）决定「项目」页从哪里发现 Git + Trellis 项目；留空恢复自动默认（Windows 为 `D:\GitProject`，其他平台为 `~/Projects`）。
- Obsidian 定位路径（`obsidianExecutable`）必须是宿主机器上 Obsidian 可执行文件的绝对路径，用于在 Obsidian 中定位 Creator 文档；留空回退到 Cordis 配置值（如有）。
- `enabledPlatforms` 默认全开，包含小红书、抖音、B 站和视频号。关闭的平台不会参与 AI 发布或数据同步；全部关闭时不执行这两项操作。
- `externalActionsEnabled` 默认关闭。打开它只允许请求进入 DSH 审批，不会保存发布授权；准备上传、每个平台最终提交和数据同步仍分别确认。
- 脚本规则既可以在设置页修改，也可以让 AI 通过 `oil_script_rules` 记录和更新。
- 页面填写的项目目录和 Obsidian 路径保存在兼容目录 `~/.dsh-oil-creator/overlay.json`，覆盖 Cordis 配置的初始值，不迁移既有本地数据。Cordis 高级配置仍保留 `libraryRoot`、`creatorRoot`、`atlasRoot`、`dataDir`、`subtitleSkillDir`、`coverSkillDir`、`obsidianExecutable` 和 `trellisProjectsRoot`，作为首次启动和自动发现无法覆盖特殊环境时的回退。知识预览通过 `graphNodeLimit` 和 `graphEdgeLimit` 控制只读星图上限，默认分别为 500 个节点和 5000 条关系。

## 数据与权限边界

- 正文、视频、字幕、封面和文章保存在用户选择的本地目录。
- 插件不会自动上传内容；上传只在用户明确调用发布 Skill 后发生，并停在最终发表前。
- 字幕、封面和平台同步会访问各自的外部服务；不安装、不配置就不会启用。
- 目录创建、配置保存和批量重命名都遵循“先预览、再确认、后执行”。
- Trellis 项目发现保持只读；归档只移动目标项目中的 Trellis 文件，不会自动提交、推送或发布。
- AIHOT 热点只在本地工作台中读取和展示，不自动转成内容或任务，也不进行公开数据再分发。

## 卸载

```bash
npx @deepseek-ai/dsh plugin --profile web remove dsh-muzi-creator
```

安装、卸载或更新配置后重启 `dsh web`。不要手动修改 `~/.dsh/profiles/web/package.json`，也不要把项目的 `cordis.patch.yml` 复制到用户 profile；插件自己的 bundle patch 会负责装配和清理侧栏。

如果旧版本曾在 profile 的 `cordis.patch.yml` 里手动加入以下内容，迁移后应删除，避免卸载插件后官方侧栏仍被关闭：

```yaml
- id: ui-sidebar
  disabled: true
```

## 开发与验证

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` 会依次运行 TypeScript 检查、Vitest 测试和 Host / Client 构建。欢迎提交 Issue 或 Pull Request；涉及文件格式、配置兼容或外部能力时，请同时补充对应测试和文档。

准备推送开源提交或创建 GitHub tag 前运行 `pnpm release:check`。它会先拒绝脏工作树、未跟踪的关键文件或缺失的 `origin`，再验证测试、构建和 GitHub 安装包内容；不会发布到 npm。

## 文档

- [日常使用与完整工具说明](docs/usage.md)
- [内容文件夹约定](docs/files.md)
- [插件实现与兼容性说明](docs/implementation.md)

## 使用问题

安装或使用过程中遇到问题，可以到 [oiloil.org](https://www.oiloil.org/#consulting) 联系我。代码缺陷和功能建议仍然欢迎提交 Issue。

## License

插件自有代码使用 [MIT](LICENSE)。内容与知识工作台直接使用的 [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) 采用 CC BY-NC 4.0，本地集成仅用于个人、非商业用途；第三方署名见 [NOTICE](NOTICE)。
