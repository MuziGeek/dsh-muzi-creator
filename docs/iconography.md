# 工作台图标

工作台内置 34 枚透明 PNG，包含已有 32 枚图标及由 oil-icon 补充的 SSH、技能中心图标。资源位于 src/client/appearance/assets/icons，manifest.json 记录来源、128px 尺寸和 SHA-256；style-spec.json 保留风格参考。

WorkbenchIcon 接受图标含义与 purpose，直接引用打包资源，没有远端描述文件或皮肤监听。navigation 和 action 默认 24px，heading 为 32px，empty 为 40px，compact 为 18px SVG。图片失败回退为对应 SVG。图标只作装饰，所属控件负责名称、提示与键盘操作。

第三方入口通过稳定插件标记适配。SSH、技能中心和任务看板使用对应图标；未知入口展开时隐藏原装饰图标并保留图标槽，折叠时使用通用图标及名称提示。结构不符合验证条件时保持原样。停用外观后原有图标恢复。

头像、平台标志保留身份含义，密集控件继续使用 SVG。明暗模式保持 PNG 原色。pnpm build:appearance 校验资源摘要和尺寸；新资源应在明暗及对比背景下按 24px、32px 检查透明边缘和辨识度。
