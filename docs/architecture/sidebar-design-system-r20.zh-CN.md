# OpenDesk Browser Sidebar R20 设计系统和布局契约

日期：2026-10-10，R26 布局补充：2026-10-12；范围：现有 Side Panel 五页签「我的／发现／工作流／开发／工具」，以及共用 `tool.html` 的任务目录、独立工具标签页。

## 为什么本轮不引入 Tailwind

本项目实际使用 Chrome MV3、原生 HTML/JavaScript 和 WXT 固定输出，`tool-shell.css` 先前将全局 reset、按钮、输入框、视图布局混在一份约 50KB 的文件里。Tailwind 的主要作用是提供 utility classes 和编译时样式生成；不建立统一语义组件、不规范使用方式，照样可以出现五个页面五套间距。仓库目前严格审核所有 HTML 资源引用，禁止 CSS 运行时 import/URL，且 SW 有固定体积限制。直接加入 Tailwind 插件和依赖锁可能扩大影响面，不是这次调整的必要条件。

**选定：一个本地、静态、零新依赖的 Design System + 各视图专属 CSS**。以后独立 Vue/React 工具可按同样变量映射使用 Tailwind，但不得加载浏览器 CDN 或在受控页面执行外部样式运行时。

## 源码位置与责任边界

- `src/ui/design-tokens.css`：唯一可信宿主 `:root` 设计变量，语义色、4/8/12/16px 间距、8px 控件圆角、12px 卡片圆角、34px 图标按钮、11px 宿主页面水平 gutter。
- `src/ui/design-system.css`：读取上述 token，负责基础原生控件、通用布局原语和可访问性焦点；不得再定义另一套 `:root` 调色板。
- `src/ui/tool-shell.css`：仅保存五页签和完整目录的特殊布局/响应式/运行反馈；不再声明全局 `:root` 或基础控件 reset。
- 通用类规范：`od-page` 页签、`od-toolbar` 头部/工具栏、`od-stack` 纵向列表、`od-surface` 卡片、`od-button`/次按钮 `od-button--secondary`、`od-icon-button`、`od-field`、`od-segmented`。
- 新 UI 先选通用原语，只有真实交互或布局差异才添加 `developer-*`、`workflow-*` 等视图选择器。严格保留所有旧 DOM IDs、真实 Role/ARIA、RunHost/Stop 所有权和信任边界。
- 工具沙箱运行用户 HTML，不能自动加载这套高权限 UI 样式；需要独立、安全的工具主题合同才允许后续复用。

## R26 Side Panel 和隔离工具：统一尺寸与唯一留白层（2026-10-12）

### 间距与圆角规格（统一 4px 基础网格）

| Token | 值 | 使用位置 |
| --- | ---: | --- |
| `--space-1` | 4px | 标签与数量、辅助说明与内容之间的紧密间隔 |
| `--space-2` | 8px | 工具栏按钮间、表单标签与输入框、同行元素 |
| `--space-3` | 12px | 卡片内边距、工具自身的页面留白、编辑内容区 |
| `--space-4` | 16px | 不同功能章节或列表分组之间 |
| `--radius-control` | 8px | 输入框、按钮和标签 chip |
| `--radius-surface` | 12px | 卡片、区块表面 |
| `--od-icon-size` | 34px | Side Panel 常规 icon 按钮；不得因为窄屏随机改变规格 |
| `--od-page-gutter` | 11px（≤340px 时 9px） | 可信宿主 `#workspace-content` 外层内容边距 |

### 留白所有权和使用原则

- **已安装工具列表**：`#workspace-content` 负责一层 gutter；工具卡片内部仅使用自己的 12px 内边距。列表条目统一以标题为主，说明最多一行，升级状态跟随标题，而不是平铺数个操作按钮。
- **工具详情**：宿主返回按钮/标题继续对齐 `#workspace-content`；`#sidebar-tool-frame` 横向向两边扩展，抵消宿主 gutter；iframe 不绘制第二层边框和 padding。各个沙箱工具自行用其 `.notes-app` 等顶层容器设置 12px 内容留白，工具内容与上方宿主标题保持约 1px 以内的视觉对齐。
- **区域内布局**：一行控件以 `gap:var(--space-2)` 为主；控件组垂直间隔用 8px、独立章节用 16px；卡片内部 pad 12px；辅助文案与正文用 4px。不要为了修视觉问题多次覆写同一处 `padding`，不要叠加父级和子级两个“页面 gutter”。
- **窄屏与长文本**：所有弹性子项 `min-width:0`，标题/URL 按需换行；标签列表可局部横向滚动，但 `#workspace-content` 不得因 iframe 额外产生横向滚动。输入框正文的 8px 内边距属于控件自身，并不计入页面的第二层 gutter。
- **显示状态与低频技术信息**：空列表一句话说明下一步；技术摘要（如源代码 SHA）放在“技术信息”折叠区域；从详情返回工具列表后不保留“已隐藏悬浮目录”等过期操作反馈。

### CSS 与工具隔离边界

工具沙箱为 opaque-origin，`src/sidebar-tools/sandbox.html` 不加载高权限 `design-tokens.css` / `design-system.css`，不允许外部 CDN、运行时 @import 或绕过 CSP。独立工具在自身 CSS 中声明**数值匹配**的 token（例如 `examples/sidebar-tools/quick-notes/src/style.css`），而非跨信任边界复用宿主样式。默认 Page Installed 记录和 Side Panel 工具包属于两个不同安装系统，列表只进行可信读取展示，绝不合并注册表。

### 交付检查标准

- 静态回归检查宿主 gutter 与工具 iframe outdent、沙箱独立 4/8/12/16px token、控件 34px、简洁空状态、技术信息折叠与返回列表清理提示。
- 实际 Mac Chrome 需在 300/320/360/420/520px 及 125%/200% 缩放中检查真实已安装工具列表、网页笔记详情（长标题/网址/文本）、手动保存与更新，不能出现页面级水平滚动或 iframe 被裁切。
- 没有绑定当前候选源码身份的真实浏览器证据时，必须明确记为 `NOT_TESTED`，不能仅凭静态合同测试宣称原生通过或产品专家评分达到 95+。

## 安全与构建闭环

`src/ui/tool.html` 顺序链接 `design-system.css` 然后 `tool-shell.css`，随后原有 JS。通过 `scripts/prepare-public.mjs` 的静态资源白名单复制为 `ui/design-system.css`；`scripts/verify-package.mjs` 同时要求两份 CSS，逐份拒绝 `@import`、`url(` 和 `expression(`，不改变 Chrome 权限/CSP、不增加运行时脚本，也不提高单个 JS 构建体积上限。既有开发源文件 watcher 派生自相同的静态映射，新 CSS 也会被监测并安全发布。

R19 的真实 HTML/CSS 静态 Chrome 检查扩展为加载两份本地样式后再执行 300／360／420／520px 的 28 个组合、测量控件/间距和截图。测试只切换显示与示例内容，`STATIC_MARKUP_CHROME` 不代表原生扩展/授权回执。

## 后续验收与限制

- 定向组件：Sidebar 样式约束、五页 DOM 基本类、package 文件缺失/恶意 CSS、历史用户脚本回归。
- 构建：`npm run check`，生产/开发双包和 `npm run verify`；检查实际 `ui/design-system.css` 文件的引用与安装包一致。
- 静态 Chrome：五页签状态、不同宽度无横向溢出、开发区块一致性、圆角、键盘焦点；旧 R19 截图仍保留作对照。
- 真正 Mac Chrome 原生视觉／125%/200% 缩放／键盘交互／Run/Stop 等待独立实际验收，不能把静态 PASS 说成专家评分 95+。

Native Agent 全页 Workspace 和 Settings 具有自己的大屏结构与本地文件操作流程，而且正在由其他会话并行开发，不在本轮直接整体重写。这两页可在后续独立任务复用 `--od-*` tokens 并迁移到对应密度规范，避免并行改动覆盖。
