# OpenDesk Browser Sidebar R20 设计系统和布局契约

日期：2026-10-10；范围：现有 Side Panel 五页签「我的／发现／工作流／开发／工具」，以及共用 `tool.html` 的任务目录、独立工具标签页。

## 为什么本轮不引入 Tailwind

本项目实际使用 Chrome MV3、原生 HTML/JavaScript 和 WXT 固定输出，`tool-shell.css` 先前将全局 reset、按钮、输入框、视图布局混在一份约 50KB 的文件里。Tailwind 的主要作用是提供 utility classes 和编译时样式生成；不建立统一语义组件、不规范使用方式，照样可以出现五个页面五套间距。仓库目前严格审核所有 HTML 资源引用，禁止 CSS 运行时 import/URL，且 SW 有固定体积限制。直接加入 Tailwind 插件和依赖锁可能扩大影响面，不是这次调整的必要条件。

**选定：一个本地、静态、零新依赖的 Design System + 各视图专属 CSS**。以后独立 Vue/React 工具可按同样变量映射使用 Tailwind，但不得加载浏览器 CDN 或在受控页面执行外部样式运行时。

## 源码位置与责任边界

- `src/ui/design-system.css`：唯一 `:root` 设计变量、品牌颜色／语义色、4/8/12/16px 的间距、8px 控件圆角、12px 表面圆角、胶囊徽章，以及统一的原生按钮/输入、label、可访问性焦点和基础控件重置。
- `src/ui/tool-shell.css`：仅保存五页签和完整目录的特殊布局/响应式/运行反馈；不再声明全局 `:root` 或基础控件 reset。
- 通用类规范：`od-page` 页签、`od-toolbar` 头部/工具栏、`od-stack` 纵向列表、`od-surface` 卡片、`od-button`/次按钮 `od-button--secondary`、`od-icon-button`、`od-field`、`od-segmented`。
- 新 UI 先选通用原语，只有真实交互或布局差异才添加 `developer-*`、`workflow-*` 等视图选择器。严格保留所有旧 DOM IDs、真实 Role/ARIA、RunHost/Stop 所有权和信任边界。
- 工具沙箱运行用户 HTML，不能自动加载这套高权限 UI 样式；需要独立、安全的工具主题合同才允许后续复用。

## 安全与构建闭环

`src/ui/tool.html` 顺序链接 `design-system.css` 然后 `tool-shell.css`，随后原有 JS。通过 `scripts/prepare-public.mjs` 的静态资源白名单复制为 `ui/design-system.css`；`scripts/verify-package.mjs` 同时要求两份 CSS，逐份拒绝 `@import`、`url(` 和 `expression(`，不改变 Chrome 权限/CSP、不增加运行时脚本，也不提高单个 JS 构建体积上限。既有开发源文件 watcher 派生自相同的静态映射，新 CSS 也会被监测并安全发布。

R19 的真实 HTML/CSS 静态 Chrome 检查扩展为加载两份本地样式后再执行 300／360／420／520px 的 28 个组合、测量控件/间距和截图。测试只切换显示与示例内容，`STATIC_MARKUP_CHROME` 不代表原生扩展/授权回执。

## 后续验收与限制

- 定向组件：Sidebar 样式约束、五页 DOM 基本类、package 文件缺失/恶意 CSS、历史用户脚本回归。
- 构建：`npm run check`，生产/开发双包和 `npm run verify`；检查实际 `ui/design-system.css` 文件的引用与安装包一致。
- 静态 Chrome：五页签状态、不同宽度无横向溢出、开发区块一致性、圆角、键盘焦点；旧 R19 截图仍保留作对照。
- 真正 Mac Chrome 原生视觉／125%/200% 缩放／键盘交互／Run/Stop 等待独立实际验收，不能把静态 PASS 说成专家评分 95+。

Native Agent 全页 Workspace 和 Settings 具有自己的大屏结构与本地文件操作流程，而且正在由其他会话并行开发，不在本轮直接整体重写。这两页可在后续独立任务复用 `--od-*` tokens 并迁移到对应密度规范，避免并行改动覆盖。
