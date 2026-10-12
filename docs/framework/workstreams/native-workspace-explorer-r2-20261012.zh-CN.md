# OpenDesk Browser · Native Workspace 文件资源管理器 R2

日期：2026-10-12。唯一目标分支：main。

## 目标与边界

入口不变：native-agent/workspace.html?sourceId=source-…；受信页面源码为 src/native-agent/workspace.html。R1 的 DIR / MD / TXT / HTML 方框不是直观文件图标；原先「文件树、刷新、全部折叠、/」跨多行，长文件名换行导致列表高度不一致，技术说明抢占首屏。

保留 Native opendesk.local-files.v1 协议、sourceId/workspaceId、CLI 授权、文件类型白名单、32 KiB 上限、只读与冲突规则、SHA 回执与真实读回。没有扩展授权目录、文件类型、网络权限、自动读取或自动执行。

## 设计与实施

- 文件图标：src/native-agent/workspace-file-icons.js 只包含固定本地 SVG path；目录分别显示 folder / folder-open；Markdown、JS/TS/TSX、JSON、HTML、CSS、TXT 使用不同轮廓，其余为通用文件。用户路径只作为 textContent/title，不插入 SVG/HTML。不增加字体、CDN、依赖。
- 树形工具栏：左侧标题「文件」，右端两枚 34px 图标按钮「刷新文件树」「折叠所有子目录」，保留既有 ID 与行为，title 和 aria-label 与名称一致；位置单独显示「根目录」或实际父目录，不单独裸露「/」。
- 层级与密度：桌面资源栏宽 272px、中屏 224px；每层 16px 缩进，图标与展开箭头固定位置，桌面单行截断并保留全路径提示，窄屏可显示两行，文件区独立滚动。
- 当前文件：主标题显示文件名，完整路径保留在 title 和 metadata；操作顺序为「重读、复制、丢弃草稿、保存」，后端不变。
- 次要说明：网页预览说明、技术页脚使用原生折叠详情，默认不占据大块首屏；自定义工具摘要用折叠箭头代替冗余「展开 / 收起」文字。
- 继续遵守 docs/architecture/ui-layout-conventions-r27.zh-CN.md 和 src/ui/design-tokens.css。Tailwind v4 离线编译且 1rem=16px，仅 Workspace 加载此样式，绝不扩散到 Side Panel 或网页沙箱。

## 定向验证

在 Mac main 无其他 Agent 占用的情况下执行：

    node --test tests/environment/workspace-file-icons.test.mjs tests/environment/workspace-file-tree.test.mjs tests/environment/workspace-integration.test.mjs
    npm run check
    npm run build && npm run build:dev && npm run verify
    node --test tests/environment/workspace-style.test.mjs

实际 Chrome + 已授权 Native 需要验证 sourceId 绑定、多个目录并存、展开/刷新/折叠、Tab/Enter/Space/方向键/Home/End、tooltip、可见焦点、200% 缩放、360/390/768/1024/1280/1440px；只读/断联/撤权/保存冲突/草稿/另存为读回仍不能回归。CI 组件测试不能冒充 Mac Chrome 最终验收。

## 95 分独立门槛

| 维度 | 95 分以上的必要证据 | 当前状态 |
| --- | --- | --- |
| 文件图标与辨识 | 不使用英文字符徽标，形状有区分且无不可信资源 | 待新候选验证 |
| 信息架构 | 主要操作单行明确、路径清晰、技术说明按需展开 | 待新候选验证 |
| 交互效率 | 目录展开不中断其他分支，鼠标/键盘可用 | 待新候选验证 |
| 响应式和缩放 | 360–1440px 和 Chrome 200% 无横向越界 | 待真实 Chrome |
| 无障碍与可读性 | 树 ARIA、SVG 隐藏、焦点可见、对比度达 AA | 待真实 Chrome |
| 安全与架构 | 权限、会话与读回核验无回归 | 待真实 Native |
| 可维护性和测试 | 定向组件、样式生成、生产和开发包验证 | 待 CI |

任何未测项不自报 95/100 或正式 PASS；各项独立评分，不用平均值掩盖单项风险。