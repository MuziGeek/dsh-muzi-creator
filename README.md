<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Muzi Creator：让灵感与知识落在本地创作里，从资料到主题目录，再到多渠道稿件。">
</p>

# Muzi Creator

**DeepSeek Harness 上的本地创作工作台。** 搜索灵感、回看知识、整理稿件与视频产物，在同一个界面查看内容和项目进度。

[开始使用](#开始使用) · [灵感搜索](docs/inspiration.md) · [完整使用说明](docs/usage.md) · [设计说明](DESIGN.md)

**0.2.0 接口调整：**插件工具统一使用 `mz_*`，远程命名空间为 `mzCreator`，旧接口停止支持。已有数据目录继续读取，不自动迁移。[升级与命名说明](docs/mz-naming.md)

## 从一个主题开始

在「灵感」输入主题，获取带来源的总结和参考素材；回到「知识」查阅已有主题，再把需要创作的内容放进本地项目目录。正文、证据、渠道稿件与媒体文件始终可以用自己的编辑器打开。

```text
一个主题目录/
├── brief.md                 创作方向
├── evidence.md              参考证据
├── mother-content.md        母内容
├── channels/
│   ├── video/script.md      视频稿
│   ├── wechat/draft.md      公众号稿
│   ├── xiaohongshu/draft.md  小红书稿
│   └── blog/draft.md        博客稿
└── review.md                审阅记录
```

这是 Creator Studio 的文件组织示意，不代表搜索后自动生成上述文件。灵感结果可以在「更多 → 转为内容」中交给新会话讨论方向，后续写入由你确认。[查看完整目录约定](docs/files.md)

## 开始使用

### 1. 安装到 `web` 配置

```bash
npx @deepseek-ai/dsh plugin --profile web add github:MuziGeek/dsh-muzi-creator
```

安装后重启 DSH，并选择安装插件的 **`web` 配置**。如果桌面端仍选中 `desktop`，不会加载这个配置中的个人工作台。

灵感搜索使用当前会话预设的网页工具及宿主配置的搜索提供方（可使用 ModSearch），同时保留研究员的只读限制。更新后需重启宿主并手动重新搜索。[研究工具说明](docs/inspiration.md)

> [!IMPORTANT]
> 当前代码适配基线为 **Windows x64 DSH Desktop 2.0.4**、内置 Harness `0.1.2-alpha.1` 和 Node.js `22.19+`。Desktop 2.0.5 的完整插件兼容性尚未验收；成功安装或打开宿主不等于所有功能已验证。集成的 Animal Island UI 用于个人、非商业用途，详见 [NOTICE](NOTICE)。

<details>
<summary>从源码安装</summary>

```bash
git clone https://github.com/MuziGeek/dsh-muzi-creator.git
cd dsh-muzi-creator
pnpm install --frozen-lockfile
pnpm build
npx @deepseek-ai/dsh plugin --profile web add "$PWD"
```

仅在安装工具明确提示插件构建被阻止时，按提示授权该包构建：

```bash
npx @deepseek-ai/dsh plugin --profile web add --allow-build=dsh-muzi-creator github:MuziGeek/dsh-muzi-creator
```

</details>

### 2. 检查自己的目录

选择 `standard` 或 `code` Agent preset，对 AI 说：

> 检查并配置内容工作台，找到适合的内容目录，并告诉我还缺哪些能力。

内置配置 Skill 会检查现有目录与可选能力，先预览变更，确认后保存。也可以在 **设置 → 插件 → 内容工作台** 中调整内容目录、项目目录、Obsidian 路径和脚本规则。不存在的路径不要作为已配置目录填写；字幕、封面等能力可以稍后配置。

### 3. 做一次主题搜索

打开 **灵感 → 主题搜索**，输入一个具体主题，例如「个人知识库如何辅助视频选题」，点击「搜索」或按回车。结果按 **总结 → 主要发现 → 分歧与创作角度 → 来源** 完整展开，发现下方的引用与来源列表使用一致编号；点击原文核对资料，或复制包含来源链接的结果。

总结中原有的连续编号主题会分节显示，长段落按标点增加阅读间隔，保留完整原文。这一步需要宿主可用的模型和公开网络搜索能力。灵感搜索不依赖字幕、封面或发布 Skill。

## 六个入口，各自保留上下文

| 入口 | 用来做什么 |
| --- | --- |
| 会话 | 使用完整的 DSH Agent，继续讨论、写作和工具操作。 |
| 热点 | 只读查看 AIHOT 聚合事件、过去 24 小时精选与日报。 |
| 灵感 | 手动搜索主题，或按指定期限获取热点资料。 |
| 内容 | 查看本地项目、正文、成片、字幕、封面和发布事实。 |
| 知识 | 只读浏览 Wiki 主题，搜索主题并探索显式链接组成的 3D 星图。 |
| 项目 | 查看 Git + Trellis 项目的任务与证据，按确认流程归档。 |

功能入口与相关操作使用统一的 32 枚 Animal Island 图标，位置与素材来源见[图标说明](docs/iconography.md)。

界面沿用暖色浅色/深色主题。选择内容后在中央区域阅读详情；切回会话恢复 DSH 官方界面。页面切换会记住有效选择，也不会停止后台 Agent 或灵感搜索。

### 灵感：主题搜索与限期热点

- **主题搜索**：主题必填，默认搜索中英文公开资料，用中文总结。
- **获取热点**：主题选填；留空获取综合热点。支持近 24 小时、近 7 天、近 30 天或自定义日期。
- **结果可回查**：提供观点、案例、创作切入点及来源；限期热点说明事件与关注原因，不编造全网排名或热度数字。
- **运行可控制**：运行时显示进度并可停止；复制结果包含来源链接，重新搜索保留新的历史记录。

自定义日期按 `Asia/Shanghai` 解释，包含起止两天；相对期限按每次点击重新计算。未知日期或范围外来源不能作为期限内热点依据；来源不足显示部分结果，没有可靠材料显示空结果。日期校验不替代对原网页事实的核对。

每日自动研究已停用：旧计划暂停、未执行的自动队列取消，历史报告继续可读。搜索不会自动生成完整文章。[查看操作与结果说明](docs/inspiration.md)

### 内容与知识：文件仍由你掌握

Creator Studio 保存正文和明确状态，Muzi Atlas 提供只读知识。内容详情可编辑正文、打开关联工程或文档，并依据本地产物展示制作阶段；发布状态单独记录。知识页只覆盖 `wiki/topics`，星图关系来自可唯一解析的显式 Wiki 链接，不写入知识库。

视频制作可以使用任意本地录制或剪辑工具。在「内容 → 视频制作」中绑定工程文件或目录，打开所在目录，或直接等待 MP4/MOV 成片导出到内容目录。绑定只保存引用，不搬动素材或修改工程；字幕、封面与发布工作流继续按需接入。Screen Studio 保留为 macOS 专属适配，录制、剪辑、预览和导出由人在对应工具中完成。[查看跨平台视频流程](docs/video-production.md)

### 项目：进度来自 Trellis 文件

项目页支持本地目录与 GitHub 仓库来源，在「设置 → 插件 → 个人内容工作台 → 项目来源」统一配置。本地模式读取配置目录中的一级 Git 项目；GitHub 模式通过仓库链接或用户名选择仓库及分支，读取 `.trellis/tasks` 并显示提交与同步时间。任务按状态分组，支持筛选、组内滚动与详情定位，不生成主观完成百分比。远程任务只读；公开链接无需授权，私有仓库需管理员配置 GitHub App 后连接账号。参见 [GitHub 项目来源](docs/github-projects.md)。

归档先预览具体影响，再确认执行；状态漂移或校验失败会阻止操作。归档只调用项目自己的 `task.py archive --no-commit`，不自动提交或推送。[查看项目操作说明](docs/usage.md)

## 可选能力

| 需要的环节 | 依赖 |
| --- | --- |
| 字幕转录、预览、排版与烧录 | `oil-subtitle` 及相应服务凭据 |
| 多画幅封面 | `oil-cover` 及相应服务凭据 |
| 通用录制与剪辑流程 | 使用自己的录制/剪辑工具；工程引用和 MP4/MOV 导出等待不依赖 Screen Studio |
| Screen Studio 专属适配（可选） | macOS 上的 Screen Studio 与 `screen-studio-editor`；不作为主流程前提 |
| 在 Obsidian 中定位文档 | 已安装 Obsidian，并配置可执行文件绝对路径 |
| 发布准备、立即/定时发布、数据回收 | Chrome、固定版本 Patchright、`video-publisher` 与已验收账号能力 |
| 公众号图文工作流 | `oil-video-article` |

账号从「内容模块概览 → 账号管理」连接，浏览器登录和平台身份核验通过后才添加成功。点击内容卡片选择平台、账号和模式，首次验证融入准备，准备完成后再统一确认最终提交。具体步骤见[账号管理与内容发布](docs/usage.md#账号管理)。

账号管理支持 Node 和 DSH Desktop。提示程序或依赖缺失时检查 `video-publisher` 安装；提示未返回有效 JSON 时检查运行环境。

字幕、封面需预先安装相应 Skill 和运行环境，由插件调用其中的脚本；插件不会自动安装。公众号文章由外部 Skill 处理，工作台负责读取和展示。

缺少某项时，只影响对应环节。配置检查会报告可用性与缺项；凭据通过 Harness 官方凭据服务保存，界面不回显明文。[查看工具和配置说明](docs/usage.md)

## 数据与操作边界

灵感历史和内容卡片可在确认后从工作台删除，本地目录、稿件和报告文件保留。灵感报告操作默认直接显示，无需展开。

- **正文留在本地**：普通文件保存创作正文和媒体产物；插件的兼容配置与界面状态以有效 `dataDir` 为准，新安装默认使用 `~/.dsh-mz-creator`，已有目录配置继续保留。
- **知识保持只读**：插件不写入 Atlas。灵感报告保存到 Creator Studio 的 `00-inbox/inspirations`，保留正文与 SHA-256 校验。
- **搜索范围明确**：灵感专用 Agent 访问公开 HTTP(S) 页面与只读知识接口，不能执行 Shell、修改项目、创建内容或发布。
- **上传与发布默认关闭**：账号连接独立授权，不会打开 `externalActionsEnabled`。启用外部操作后，准备上传、最终提交和数据同步仍分别确认，每个平台的提交授权只使用一次。
- **外部服务按需使用**：AIHOT 提供只读热点；模型、网络搜索、字幕、封面和平台同步会访问相应服务。本地存储不意味着所有处理都离线。

## 开发与文档

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` 包含类型检查、测试与构建。准备提交发布内容时使用 `pnpm release:check`，它要求工作区干净并检查安装包内容。构建只写当前仓库的 `lib/`，不会自动更新桌面端已安装的插件。

- [灵感搜索使用说明](docs/inspiration.md)
- [日常使用、配置与隔离 Lab](docs/usage.md)
- [文件夹约定](docs/files.md)
- [实现与兼容性](docs/implementation.md)
- [界面设计](DESIGN.md) · [产品说明](PRODUCT.md)
- [反馈问题](https://github.com/MuziGeek/dsh-muzi-creator/issues)

<details>
<summary>卸载与旧配置清理</summary>

```bash
npx @deepseek-ai/dsh plugin --profile web remove dsh-muzi-creator
```

操作后重启对应配置。不要复制项目的 `cordis.patch.yml` 到用户配置；插件自带的 bundle patch 负责装配和清理。若旧版本曾在用户 patch 中手动禁用 `ui-sidebar`，需清理那条遗留配置，避免卸载后官方侧栏仍被关闭。

</details>

## 来源与许可

项目自有代码使用 [MIT](LICENSE)。上游来源、版权署名及第三方归属见 [NOTICE](NOTICE)。Animal Island UI 使用 CC BY-NC 4.0，相关使用边界详见上述说明。

Muzi 输入框、多行文本、日期时间和下拉框统一使用贴合圆角外壳的聚焦描边，覆盖浅色、暗色及弹窗。内容详情的标签栏与正文共用一张浮层卡片，随内容区域宽度调整外边距，正文独立滚动。
