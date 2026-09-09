# GitHub 项目来源

在「设置 → 插件 → 个人内容工作台 → 项目来源」选择「GitHub 仓库」后输入公开仓库链接（`https://github.com/owner/repository`、带 `.git` 后缀的链接或 `owner/repository`）或 GitHub 用户名，点击「读取仓库」，选择仓库及分支后添加项目。添加成功后项目来源切换到 GitHub；选择「本地目录」时仅显示目录设置，选择「GitHub 仓库」时仅显示仓库链接及相关配置；切换不会清空未保存的目录或仓库输入。本地目录在同一区域选择，通过设置页底部「保存」生效。来源切换及 GitHub 操作即时生效，不受「放弃」影响。项目侧栏保留列表、搜索与刷新，全局设置入口位于侧栏底部。

所选分支必须包含 `.trellis/tasks`。工作台通过 GitHub API 定位文件，并从固定提交的 raw 地址读取公开任务 JSON（私有文件使用授权 API） 和 `validation.json`、`validation.md`、`check.jsonl` 验证材料；父子关系、阶段、任务状态及归档统计沿用本地 Trellis 解析规则。验证材料有内容表示材料可读，不表示工作台独立执行或通过了其中的检查。

每次同步先解析分支的提交，再从该提交的 Git 树读取文件。详情显示仓库、分支、提交及最近成功同步时间；未推送的本地更新不在远程结果中。刷新失败保留当前进程中上次成功读取的快照并标为过期；没有快照时显示无法读取，统计保持未知。目录截断和超过读取上限不会作为完整结果展示。

远程项目只读。更新任务、归档或修复文件需要在项目中完成并推送，然后刷新工作台。移除项目只移除本地连接记录；不会删除 GitHub 仓库或任务。任务文件和仓库脚本不会执行。请求仅发送到 GitHub 固定 API 与 raw 文件地址，重定向不被跟随。

## 账号授权

公开仓库链接接入无需 GitHub App。私有仓库及授权仓库列表需要管理员注册 GitHub App，将仓库权限设为 Metadata 和 Contents 只读，开启 Device flow，并安装到选定仓库。将该 App 的公开 Client ID 配置到插件的 `trellisGithubClientId`，并确保 DSH 凭据服务支持写入及删除。未完成配置时，工作台说明所缺条件并停用连接按钮。

点击「连接 GitHub」后，在 GitHub 页面输入工作台显示的验证码并确认授权，然后点击「我已授权，检查连接」。主机按 GitHub 指定的最小间隔检查授权；验证码过期或拒绝授权时需要重新连接。授权入口使用设备流程，不需要在浏览器页面或插件配置中放置 App secret。

用户令牌保存在 DSH 凭据服务的独立条目 `MZ_TRELLIS_GITHUB_USER_TOKEN`，其实际存储保护和可写性由 DSH 凭据提供方决定。项目配置、前端响应和日志不包含令牌。GitHub App 用户令牌过期后需重新连接；本功能不自动刷新令牌。断开账号清除该凭据及内存快照，不撤销 GitHub 上的 App 安装，仓库连接记录仍保留。GitHub 的安装范围与用户权限共同决定可访问仓库，授权不保证仓库包含 Trellis。

参阅 [GitHub App 用户授权](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) 和 [修改 App 仓库访问范围](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps)。

## 配置与数据

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `trellisGithubClientId` | 空 | GitHub App 的公开 Client ID；空值不影响公开链接 |
| `trellisGithubSyncTimeoutMs` | 120000 | 整体同步超时；超时保留上次快照 |
| `trellisGithubConcurrency` | 4 | 同时读取任务的数量上限 |
| `trellisGithubMaxRepositories` | 200 | 仓库、分支列表和已连接项目数量上限；列表超过上限时提示缩小范围 |
| `trellisGithubMaxResponseBytes` | 8388608 | 单次 GitHub JSON 响应字节上限 |
| `trellisMaxTasks` | 2000 | 单个仓库任务数量上限 |
| `trellisMaxTaskBytes` | 262144 | 单个任务或验证文件字节上限 |
| `trellisCommandTimeoutMs` | 30000 | 单次 GitHub 网络请求超时 |

`dataDir/trellis-github.json` 保存来源模式和仓库、分支选择，不保存凭据或仓库文件。配置文件损坏时明确报错，不自动覆盖。任务缓存仅在内存中，重启后重新读取 GitHub。项目列表刷新会核对所选分支，提交未改变时可复用已解析的完整快照。
