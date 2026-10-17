# Trusted UI / Sandbox 渲染边界收敛 · 2026-10-17

## 当前工作范围与并行边界

- Owner：本对话的架构文档收敛工作；唯一写分支 `main`，不建分支、worktree、PR，不覆盖并行修改。
- 本轮写入仅此工作流记录与 `docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md` 的 2026-10-17 增补；不编辑共享 R33 React 组件、AdBlock、Time Review、Sandbox、Host、权限或正式工具包。
- 决策输入：`AGENTS.md`、`docs/architecture/react-ui-shared-components-r33.zh-CN.md`、现有安全架构文档、`src/ui/react/main.tsx`、`src/ui/react/components/ui/button.tsx`、`src/time-review/trusted-{admission,native-ui}.js`、`src/ui/sidebar-tools.js`、`examples/sidebar-tools/{adblock,quick-notes}/tool.config.json`、AdBlock `trusted/host-controls.js` 与相关工作流。
- 验证资源：仅远端 GitHub 文件读取和文档写入；未占用 Mac Chrome、CFT Profile、扩展 watcher、`dist` 或端口。此轮没有运行构建、Node、浏览器或真实 DNR 测试。

## 源码已知事实（以具体 main SHA、文件和当前读取时刻为准）

- 可信 React 主 UI 使用 `src/ui/react/main.tsx` 一处 React Root/Portals；现有共享组件根 `src/ui/react/components/ui/` 目前包含 Button/IconButton，不能宣称成熟组件库或所有页签已迁移完成。
- Time Review 已有随扩展打包的 `trusted-native-ui.js` 与 `trusted-admission.js`；严格核对安装版本/发行来源/摘要/撤销代际；它是静态可信 UI 挂载的现成正例，不表示最新 Mac 真实原生已 PASS。
- AdBlock 现有两枚关键开关由固定的 `trusted/host-controls.js` 创建；其普通工具包 `src/index.html`/`src/main.js` 仍按动态工具在 sandbox iframe 运行。按钮涉及可选 Chrome DNR 权限、网络规则与回读，不能把“界面元素简单”当作“执行环境简单”。现有 AdBlock 修复和原生验收由其独立工作流处理。
- Quick Notes 是 `opendesk.sidebar-tool` 类普通动态工具，适合在不修改源码/版本/数据的前提下作为沙箱负向回归；React Starter 可按影响范围补充预编译工具链验证。
- 当前共用 Tokens、`od-*` CSS 原语和多个布局规范已建立，但沙箱不直接注入可信宿主 CSS，界面视觉一致与代码运行权限不可混为一谈。

## 本轮裁决摘要

- 分离“谁负责渲染 UI”和“谁在何种权限下执行 JS”：固定受审计可信代码 / 固定组件可由宿主直接挂载；外部/用户/AI 动态 JS 继续 opaque-origin sandbox；Page/Controller 另按现有 USER_SCRIPT/RunHost 规范。
- 不为已受控的宿主 React UI 默认加 iframe、Shadow DOM、CSS Modules 或工具前缀；只有真实冲突和不同文档/页面作用域时，按影响范围处理。既有沙箱天然拥有独立样式域。
- 不新建 UI DSL/JSON Render Engine、第二套 React Root、组件仓库、Installer/SDK/Host、权限及存储服务；只有出现至少两个经过验证的非执行式 UI 数据消费者后，才评估极小白名单渲染接口。
- 不允许安装包凭 ID、店铺标签、作者“管理员”、自填标志或摘要直接提权，也不把工具包的 HTML/JS/CSS 插入特权 DOM 执行。用户自编代码若要成为可信组件，必须经过审核并打包进扩展。
- 不修改用户已经批准的样式、间距、工具栏、页签、版本、安装包与业务逻辑。

## 下一轮建议验证顺序（均未在本轮运行）

1. **UI-only 可信正例**：对已有 React `ExtensionRows`/`ExtensionToolbar` 或等效已迁移 UI，证明无 iframe、单 DOM Owner/React Root、复用 Tokens、最小交互/卸载。
2. **可信产品正例**：对 Time Review 的 `admittedNativeTimeReview`、固定代码来源和挂载/销毁做定向证明，覆盖同名假冒、版本/hash 错配、失效 epoch、更新及异步关闭时不提权；禁止启动用户计时作为架构试验。
3. **动态沙箱负例**：以 Quick Notes 已有测试确认安装/预览/运行仍在 opaque iframe，无法继承 `chrome.*`，卸载/更新/撤权阻止旧实例；保护用户笔记数据。可选 React Starter 做打包兼容。
4. **AdBlock 限定检查**：只读核对固定可信滑块 UI 与沙箱分界、样式及事件所有权；涉及授权点击/DNR/重启/拦截的真实验收仍由 AdBlock 专项负责，不覆盖其进行中的文件与环境。
5. **证据和取舍**：按源码/Node/构建/受控 Chromium/真实 Mac 安装分层标记 PASS、FAIL、NOT_TESTED 或 BLOCKED；先复用同候选且输入一致的现有证据，不因仅改文档重跑编译、全量测试。

## 反方需核对的遗漏

- 真实安全边界是“代码来源＋执行世界”，并非 UI 数量；宿主直接插入未经信任 HTML 或解释用户 CSS 仍有注入及权限风险。
- `chrome.*` 扩展权限是扩展级权限；不能把应用 SDK 的条件检查当作能约束已在特权页运行的任意 JS。
- 共享 React 的单一 DOM owner、异步回调过期、卸载/更新/多窗实例、监听器清理，优先于样式名前缀。
- 低权限组件的按钮/回调不能用模拟 click 伪造 Chrome 原生用户手势；权限弹框与异常必须走原 Host。
- 无需复制一套宿主 CSS 到 sandbox；若要主题一致，只按既有文档映射语义值且保持可信边界。
- 正式包原始 320,000 UTF-8 bytes/JS 上限与 React 构建约束，不因减少 iframe 放宽。

## 本轮完成与交接

- 范围：`DOC_DECISION`。产品源码修改、Node/Build/CI/Chromium/Mac Chrome 验收：`NOT_TESTED`。专家 95+ 是后续目标，不把未实施的设计称为最终 PASS。
- 运行边界的长期权威：`docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md`；React 主 UI/共享组件权威：`docs/architecture/react-ui-shared-components-r33.zh-CN.md`。本文件只提供决策来源、示范样本、缺口和执行提示，不取代两份架构合同。

