# GOAL：OpenDesk Browser Extension UI R2.5-WEB — 可复用业务布局模式、Group 组合与真实源码示例库

**默认中文｜ORIGINAL GOAL FIRST｜LAYOUT PATTERN FIRST｜BUSINESS SCENARIOS｜INTERACTIVE HTML FIRST｜LATEST MAIN｜REAL SOURCE FIRST｜CROSS-CHAT DEDUP｜DESIGN REFERENCE ONLY｜NO SECOND FRAMEWORK｜NO FAKE PASS｜专家目标各项 ≥95/100**

## 0. 原始最高目标（不可漂移）

项目：`shopable-ai/opendesk-browser`，正式分支：`main`，本地 Mac：`/Users/shopme/Documents/workspace/opendesk-browser`。

构建 OpenDesk 扩展开发者**真正可以复用的 UI 参考体系**：既统一 React、React Aria、Design Tokens 和原有共享组件的视觉/交互规则，也展示**Group、Section、Toolbar、List、Detail、Form、Workbench、Import、Permission、Feedback** 等完整业务排版与组合用法，并提供真实源码位置与可参考的最小代码。

目标是：未来开发新的 OpenDesk Sidebar Tool / Page UI / 可信 Tab 时，先按任务找到适合的**布局模式和业务模板**，再直接参考已验证的组件组合与代码，提高开发速度、可读性、一致性和操作可靠性；**不是组件越多越好，也不是复制一个完整管理后台**。

保留已有独立 HTML/CSS/JS、React 和 Vue 扩展以及 SDK、Host、Installer 的行为和隔离，不创建第二套 React Root、组件框架、设计 Tokens 或商业平台。

## 1. 真实基线与已保存内容（先查，不重做）

**正式 UI 来源：**
- `src/ui/design-tokens.css`、`src/ui/design-system.css`、`src/ui/react/components/ui/`
- `src/ui/react/tabs/develop*.tsx`、`tools.tsx`、`tool-host.tsx`、`locale-manager.tsx`
- `src/ui/react/preview/extension-ui-showcase.tsx`、`.css`
- `examples/sidebar-tools/prompt-shortcuts/`、`bookmark-manager/`、`cookie-editor/`、`reading-toc/`
- `prototypes/sidebar/extension-ui-showcase/index.html`、`prototypes/sidebar/react-preview/index.html`

**已经归档的审阅文件：**
- `prototypes/sidebar/extension-ui-showcase/archive/r23-web-chat-adapter.html` — R2.3 六种通用组件/设置展示
- `prototypes/sidebar/extension-ui-showcase/archive/r23-source-html-loader.html` — 旧版固定 React blob 获取器
- `prototypes/sidebar/extension-ui-showcase/r24-business-review.html` — R2.4 六业务+输入细节，内存模拟 `CHAT_ADAPTER_NOT_SOURCE_HTML`
- `prototypes/sidebar/extension-ui-showcase/README.zh-CN.md`
- `docs/framework/extension-ui-reference-patterns-r25.zh-CN.md` — **当前模式与缺口索引，首先读取**

上述预览已存在，不重复生成相同 R2.3/R2.4 文件或再实现其业务状态机。以实际读取时最新 `main` HEAD 为准，且先遵守 `AGENTS.md` 和业务 Owner 分工。此前基线会变化，不能锁死历史 SHA。

## 2. 关键任务树（按顺序执行）

### P0-A：补齐“组合布局”而不是补一套原子组件

从索引 P01–P16 中选至少 10–12 类有明确业务用途的 Pattern，整理成 **Layout / Group 参考集合**。必须有：
- Page Header + Action Group、Section / Settings Group、List Row、Search / Filter Toolbar
- List → Detail → Edit、Folder Tree、Compact Form / InputGroup
- Dense Metadata / Key-Value、Code Workbench / Run Result
- Import → Validate → Preview、Permission/Scope、Confirm/Menu、Feedback/Recovery、Locale Daily/Advanced

每个条目给出：**使用场景、真实源码路径、最小代码示例、窄屏与宽屏布局、组间间距/分隔/卡片决策、图标和操作入口、状态/焦点/异常处理、适用和禁用条件**。

Group 必须有明确对照：无边框 Section、带边界的 Settings Group、行内 Action Group、字段 InputGroup、低频 Disclosure 与高风险 Danger Group；避免所有区域一律包 Card。

### P0-B：双层交互预览，360px 首屏即用

做一个能直接打开、点击的 **R2.5 UI 参考 HTML**，两种切换入口：
1. **按 Pattern 查看**：分组布局、列表、表单等组合示例，点开能看到完整流转与代码出处；
2. **按真实业务查看**：开发、扩展管理、Prompt Shortcuts、Bookmark Manager、Cookie Editor、语言与资源管理。

预览外壳控制与正式 UI 分离，不把“Pattern Gallery”入口加入产品正式导航。默认 360px/浅色/中文；支持 320、400、440、960px、深色、长文本。960px 核验**实际 React 内容区**而不是仅外框。

优先使用仓库现有同源 React 构建产物；若本次只能创建独立交互 HTML，**必须标记 `CHAT_ADAPTER_NOT_SOURCE_HTML`**，与真实 React 浏览器结果分别统计。不得把内存模拟宣称为正式保存、授权、安装、运行或代码热更新。

### P0-C：新扩展作者可以复制“正确用法”

对每个 Pattern 给出**展开式源码示例**，优先从已有正式文件提取短片段，说明具体路径和依赖。提供：
- 可信 React / React Aria / 共享 Tokens 的正确组合；
- 独立 HTML Sidebar Tool 的布局和样式作用域示例；
- 在已有独立 React/Vue 示例中确实存在且能验证的代码路径；
- 哪些宿主 React 私有 import/CSS 不能复制进 iframe 或网站。

不要将展示性 helper 变成第二套公开 API；不要新增必须全仓迁移的组件库。明确“复制哪段”和“不能复制哪段”。

### P0-D：业务流与表单 UX 精修

针对 R2.3/R2.4 发现的问题：密码眼睛图标、搜索单一输入表面、图标视觉 18–20px、既有 Token 34px 图标按钮/触屏 44px 热区、字段标签语义、FormRow 不强制 2:3、textarea 三行和计数、重复标题和大卡片、窄屏不宜使用通用右 Drawer/底 Sheet。

让用户实际完成：菜单开关/取消/Escape/焦点恢复；列表→编辑→保存/取消；未保存返回；导入校验预览；错误保留草稿；结果未知禁止自动重放、先读回。若当前真实业务已经具备，标记 `ALREADY_FIXED` 并仅展示，不再改。

### P1：反方审计与证据

基于真实文件与可运行预览，回答：
- 哪些 Group、Card、Toolbar 根本不需要存在？
- 320px 哪些操作挤压内容、重复或被菜单遮挡？
- 哪些布局只适合 960px？哪些 Bottom Sheet / Drawer 应成为全宽子页面？
- 代码片段会不会把 HTML/React/Vue 工具错误绑定到可信 Host？
- 哪些只是模拟，不得宣称生产通过？

按 8 项独立打分（每项 100、综合算术平均）：业务模式覆盖、分组信息架构、视觉与 Tokens、窄屏适配、键盘焦点无障碍、完整交互/状态恢复、源码示例可复用性、同源预览与证据可信度。未运行 = `NOT_SCORED`，不得为了 ≥95 人为提高。

## 3. 执行边界与交付

本网页对话**先做设计与可点击 HTML**，不得对正式业务做大规模源码改动、构建、安装或发布；已有组件/业务代码**默认只读**。允许在用户已授权的参考档案范围内新增版本化 HTML、README、代码摘录及设计文档到最新 `main`，但先验证是否已有文件，**不得覆盖 R2.3/R2.4 或其他 Agent 正在修改的文件**。

如果真实 React 同源 HTML 的生成/预览链存在问题，列为本地 Codex 后续候选修复，而不是伪造浏览器结果。不创建分支、worktree、PR，不强推。

**最终交付顺序：**
1. 先展示默认 360px 的新 Pattern × 业务双层交互 HTML（或清楚说明本次为何不能显示）；
2. 用简洁矩阵说明 Group / Layout 使用时机、真源码路径、代码示例；
3. 对照旧 R2.3 与 R2.4 解释新增内容，不重复过去已完成工作；
4. 最多五项真正需要修复的 P0/P1 差异与 Owner；
5. 八项专家审阅、反方审计和 `NOT_TESTED` 项；
6. 用户亲自体验并反馈**之后**，再提供本地 Codex 最小修复/测试验收提示词。

**第一条操作：核对最新 main 的归档 README、R2.4 HTML、R2.5 模式文档与正式 React 展示源码，然后直接制作可点击的业务 Layout Pattern 参考页。不要先全仓审计，不要再堆无业务意义的 Checkbox/Card 示例。**
