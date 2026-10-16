# OpenDesk Browser · 统一 React Side Panel 与自定义工具兼容合同（R33.1）

> **2026-10-16 用户最新决策。** 本文件是 React UI 相关任务的唯一产品/架构目标；此前 R32.8「只验证 React 开发能力」和 R33.0「只做局部 React 试点」属于历史阶段，不得覆盖本轮目标。**本文是待实施合同，不等于 React 重构已经完成或得到 Chrome 原生 PASS。**

## 一、最高优先级：五个可信 Side Panel Tab 统一 React，旧自定义工具不改

**核心产品目标（P0）：把 OpenDesk Browser 的可信 Side Panel 主界面建设为专业、统一、适合 AI 和开发者持续维护的 React 工作台，最终覆盖「我的／扩展／工作流／开发／云控」五个正式 Tab。** 用成熟 React UI 组件、清晰的状态与业务边界减少重复 DOM 操作和界面不一致；**最终结果是可信侧边栏 UI 的统一 React 架构，不是仅能编译 React、创建组件包、局部演示或长期维护两套主界面。**

**并列 P0：原有用户自定义扩展 UI 零退化，但不主动迁移或重写旧工具。** 用户可能使用 HTML/CSS/原生 JavaScript、Vue SFC、React JSX 或其他已经能够按现有打包合同产出安全 JS/CSS 的开发方式。已有 HTML/JS 工具、Vue 工具、React Starter 和已安装工具**保留现状，可继续充当示例代码**。只要求编译、打开、交互、SDK、数据与安装更新正常；**没有真实回归，不得为 React 主界面升级修改这些工具的 UI/业务源码、依赖、包版本或发行 JSON**。

**优先级边界：**
- **P0 — 可信 Side Panel 五 Tab：** 统一 React UI、交互、设计系统与业务适配；以「开发」「扩展」为优先实施区域，其余「工作流」「我的」「云控」完成后达到同一结构。
- **P0 — 自定义工具零退化：** 保留原 opaque-origin iframe + SDK/Host/安装链；保留原「开发」的 JS/React/Vue 编辑、编译、预览、Run、Save、Stop 语义。只做风险驱动的定向兼容测试，测试失败才最小修复。
- **P1 — 用户 React 工具按需复用组件：** 可以选用新的 React 组件源码；由工具自己预编译成原格式，不强制改 React Starter/旧工具，也不把新 UI Kit 加给 HTML/Vue 工具。可使用独立的受控消费验证，而不将所有现有工具改版。
- **P2 — 在独立完整标签页重新设计 UI：** 现有 `ui/tool.html?toolId=...` 已与 Side Panel 复用同一工具宿主及 Sandbox；保持可用即可，暂不单独开发一套 React 全页面。不得把独立页面改版作为五 Tab 的阻断项。
- **不属于本轮：** 全量重写扩展底层、Browser SDK、Host、SW、权限、安装器、用户工具 UI 或 Page USER_SCRIPT 系统。

## 二、组件库和构建方案：有方向，但不能虚报已经选型落地

- **已存在的基础：** WXT + Vite 是浏览器扩展原有构建链；React 19 在独立工具和 Page UI 已有既定入口；Vue、HTML/JS 继续并存。无需因 UI 重构更换整个浏览器框架。
- **首选待验证的 UI 方案：** `shadcn/ui`（React Aria base）+ `React Aria Components` + `Tailwind CSS v4`，映射**原有** `src/ui/design-tokens.css` 与语义视觉规范。shadcn/ui 于 2026-07 起提供 React Aria 第一方基底：<https://ui.shadcn.com/docs/changelog/2026-07-react-aria>。这只是**优先验证组合**，不是仓库已经引入、更不能无测试强制整库安装。
- **选型实证：** 对 Button/IconButton、Dialog、Menu、Field、Tabs 及真实需要的 Tree/Combobox，测键盘/焦点/ARIA、浮层 Portal、CSS scope、明暗主题、依赖许可证与 bundle。成熟控件优先，不为本轮凑数量；如 React Aria 组件与预算或架构冲突，应记录证据再比较 Base UI/Radix 或更小组合。
- **CSS 边界：** `src/ui/design-tokens.css` 是唯一 Tokens 来源。Tailwind v4 可作为**离线构建工具**，其 Preflight / 全局 reset 不得意外覆盖原 Side Panel 或工具 iframe；优先 CSS 作用域、显式映射，而不是复制第二套视觉变量。
- **组件归属：** 真实可信 Tab 已是确定消费者；待实测后决定共享源码位置（例如 `packages/opendesk-ui-react/`），不得以目录创建作为交付。用户工具可选择从同一源码预编译导入，但不借用宿主权限、DOM 或运行时全局。

## 三、可信 Side Panel React 迁移：最终统一、分模块落地

原可信 Side Panel 核心入口包括 `src/ui/tool.html`、`tool-shell.js`、`script-editor.js`、`sidebar-tools.js`、`workflow/workflow-view.js` 等，存在不少 DOM 事件与业务行为交织。**工作重点是 UI 与业务状态/服务解耦，而不是机械将 95KB HTML 全改成 JSX。**

1. **恢复基线：** 读取最新 `main`、现有五 Tab 页面结构、事件、数据状态、权限、工具 iframe 与已有 CI；先记实际依赖及行为，不因旧评分重做整套框架研究。
2. **组件方案确定：** 完成首选 UI 方案的真实技术验证；只建立真实消费的组件、Tokens 与安全 CSS 接入；不接新 Runtime CDN、第二套 Editor/Compiler/Host。
3. **React 主入口：** 设计**唯一可信 UI 根/Tab 容器**及原业务适配，保留现有 Chrome 扩展身份、导航语义和运行状态；React 接管某个区域后，原 JS 不得继续直接维护同一 DOM。迁移期允许短暂共存，最终清理被替代的 DOM owner。
4. **分 Tab 迁移并验收：** 优先「开发」「扩展」，再「工作流」，最后「我的」「云控」。每个 Tab 需有真实输入、操作、保存、错误、返回、焦点、Stop/生命周期的相应检查；迁移结果不得削弱既有 SDK、权限或调试行为。
5. **旧视图清理：** 仅在相应功能与回归证据通过后，删掉确已被替代的 UI 监听、组件和冗余 CSS；不批量删除不确定依赖或并行 Agent 工作。
6. **正式交付：** 最新候选的构建、TypeScript/JSX、包大小、真实 Chromium、回归和独立质量评分按功能模块逐项保留；尚未跑的项标 `NOT_TESTED`。

## 四、原有自定义工具：原样保留、按需测、不额外做 UI 改版

| 现有消费者 | 本轮动作 | 不允许的做法 |
| --- | --- | --- |
| 原生 HTML/CSS/JS Sidebar Tool | **保留，执行有代表性的构建/打开/交互/SDK 回归；继续作为示例** | 为统一 React 修改其 UI、强装依赖、改旧 JSON |
| Vue Sidebar Tool / Vue SFC | **保留，核对已有编译链和运行；继续作为示例** | 将 Vue 转 React、重写 Vue Starter、要求重新安装 |
| 已有 React Sidebar Tool | **保留；共享组件属于可选能力，只有需要时做单个受控示例** | 为展示组件库而强制迁移全部 React 示例 |
| 已安装用户/AI/第三方工具 | **保持旧 Tool ID、版本、权限、数据与安装/更新/卸载/SDK 合同** | 将动态工具 JS 提权到可信 React DOM，清空数据或修改安装器 |
| `开发` 原有代码入口 | **JS/React JSX/Vue SFC、直接编辑与本地项目的保存/准备/运行/停止继续工作** | 为迁移可信 Tab 重建或替换原编译器与编辑器 |
| 独立完整工具标签页 | **复用现有宿主与同一工具 UI；P2 专项优化** | 为了 React 主界面复制第二套工具页面 |

现有安全边界继续以 `docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md` 为准：可信静态 UI 可在受信 Side Panel 运行；**任何用户可安装动态工具仍为 opaque-origin sandbox**。React 的 DOM/ShadowRoot 或闭包都不能代替权限沙箱。

`scripts/build-sidebar-tool.mjs` 与 `tool.config.json` 等当前安装包链保持唯一；React/Vue 用户工具按原方式先本地编译，标准工具包预算与签名/来源校验仍有效。不允许为了新组件库无依据提高 JS/JSON 大小上限。

## 五、独立验收门槛与真实状态

- **P0-A 五 Tab 可信 React UI：** 最终均由 React 维护视图和组件；业务操作、导航、焦点、保存、错误/撤回、持久状态、权限、生命周期等通过真实产品验收。单个 Tab PASS 不能冒充五 Tab 完成。
- **P0-B 原有自定义 UI 零退化：** 复用旧候选记录，仅对变化覆盖到的代码/合同做针对性 Node、构建、包和 Chrome 回归，必要时选典型原生、Vue、React 和已安装旧工具做冒烟；**不要求对每个示例进行 UI 改版或对与本轮不相关的所有旧工具全量重建**。出现真正退化应先修复，不能用 React 迁移 PASS 抵消。
- **P0-C 安全/性能：** 不新增权限、跨越宿主与 Sandbox；记录 React、ReactDOM、组件 CSS/JS 真实增量和依赖版本，避免重复挂载、事件泄漏和长期双状态系统。
- **P1 React 自定义工具可选组件复用：** 验证已有/新项目能在**不修改原 Host/SDK/安装器**的情况下选择使用组件，失败时明确真实原因；不是要修改所有旧工具。
- **P2 完整页面：** 现有入口仍能打开即可，单独的响应式 UI 重构不阻断当前核心交付。
- **质量门禁：** 产品目标、成熟组件方案、五 Tab 架构、设计一致性、开发界面完整性、自定义工具零退化、键盘焦点、安全隔离、依赖/预算、维护性、真实 Chromium 各项单独评分，目标 ≥95/100；`FAIL` 与 `NOT_TESTED` 分开记录，不能把文档或历史 CI 当最新代码原生 PASS。

## 六、已有事实、旧方案和证据的效力

- `docs/framework/workstreams/react-ui-r328-minimal-20261016.md` 中“不需要公共 React 组件库”仅为 R32.8 旧阶段的窄范围决定；其旧 CI / 打包证据仍保留。
- R33.0 主张的“先做一处 React Island + 一个 React Tool 即完成核心目标”只可作为早期试点，而**不是 R33.1 的最终验收标准**。最终目标必须是**五个可信 Tab 统一 React**。
- `docs/api/page-ui-frameworks.zh-CN.md`、`docs/architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md` 的 Standard/Developer 差异必须保留：Standard 不因此装入浏览器 JSX/SFC 大编译器；Developer 保留其已支持的原生编辑/编译能力。
- 现有 `docs/architecture/ui-layout-conventions-r27.zh-CN.md`、`docs/architecture/sidebar-design-system-r20.zh-CN.md` 的 Tokens 规范继续有效；React UI 组件实现须承接其视觉合同。
- 历史 [React/Vue 工具构建 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38878878661) 与 [Bookmark React 离线预览 Chromium](https://github.com/shopable-ai/opendesk-browser/actions/runs/38878700939) 只对应旧固定源码，不证明 R33.1 五 Tab 已转换或原生验收通过。

## 七、后续文档所有权与防漂移

- **本文件是本任务唯一产品/架构目标入口**：P0 优先级、五 Tab 最终方向、UI 技术候选、旧工具不改、独立验收。
- `AGENTS.md` 保持简短指针；当下一轮 AI 对迁移范围不确定，先读取本文件，而不是反复从 R32.8 旧限制推理。
- `docs/api/sidebar-tool-development.zh-CN.md`、`.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`：保留已实现的旧工具开发流程；只有新 React 组件导入实际运行并测过后才增量写对应使用说明。
- `docs/framework/workstreams/`：逐轮实施文件、源 SHA、每 Tab 进展、独立 CI/Chromium 回执、真实失败/未测。
- `AGENTS.md` 和 `docs/api/page-ui-frameworks.zh-CN.md` 不重复贴整份方案，保留权限/编译/开发合同与真实能力边界。

**任务优先级：可信 Side Panel 五 Tab 产品体验与组件化 > 原有自定义 UI 零退化 > 代码复用/安全/构建预算 > 用户 React 工具可选共享组件 > 独立完整页面专项优化。**
