# GitHub 内容与知识来源

在「设置 → 插件 → 个人内容工作台」中，分别配置「创作内容来源」和「知识来源」。两者都可以选择「本地目录」或「GitHub 仓库」，因此 Creator Studio 与 Muzi Atlas 可以放在不同仓库中。

选择「GitHub 仓库」后输入 `https://github.com/owner/repository`、带 `.git` 后缀的地址、`owner/repository`、GitHub 用户名或用户主页链接（例如 `https://github.com/MuziGeek`），点击「读取仓库」，选择仓库和分支，再点击「连接来源」。公开仓库不需要授权；私有仓库需要先配置 GitHub App Client ID 并完成 Device flow 授权。

连接时插件读取所选分支当前指向的提交，并把仓库中的普通文件同步到插件数据目录下的只读快照。内容和知识继续使用本地工作台已有的目录解析规则；同步结果显示提交号、分支、文件数量和快照大小。

远程来源只读。Creator Studio 的新建、编辑、状态、发布标记、归档和删除操作会被拒绝；知识页和待处理素材也不会写回 GitHub。插件不会执行仓库脚本，不接受符号链接，也不会把凭据写进来源配置。

刷新失败时，如果已有完整快照，工作台保留上次结果并显示「过期」状态；没有成功快照时不会伪造内容。修改远程仓库后，需要先推送提交，再回到设置中点击「刷新快照」。移除来源只清除该来源的连接和本地快照，不会删除 GitHub 仓库。

## 配置上限

| 配置 | 默认值 | 用途 |
| --- | ---: | --- |
| `githubSourceMaxFiles` | 10000 | 单次快照允许的普通文件数量 |
| `githubSourceMaxBytes` | 67108864 | 单次快照允许的总字节数 |
| `githubSourceMaxFileBytes` | 8388608 | 单个文件允许的字节数 |

网络超时和 GitHub JSON 响应上限沿用 `trellisGithubSyncTimeoutMs`、`trellisCommandTimeoutMs` 和 `trellisGithubMaxResponseBytes`。来源选择保存在 `dataDir/github-sources.json`，快照保存在 `dataDir/github-source-cache/`；其中不包含 GitHub 令牌。

项目页的 Trellis GitHub 来源仍按 [GitHub 项目来源](github-projects.md) 配置，两套来源可以同时使用。
