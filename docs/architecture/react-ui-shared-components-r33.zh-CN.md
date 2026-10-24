# OpenDesk Browser · 统一 React Side Panel 与自定义工具兼容合同（R33.1）

> **Shared AI Conversation R2.1 新增权威入口：** 2026-10-23 共享 AI Chat **R2.1 结构性归属修订**：通用 Provider Runtime 由 ToolShell 持有；Bookmark、Prompt（含独立 prompt-edit）、「我的」、Workflow 从安装/工作台实例领取各自 Lease，WorkflowView 不拥有其他消费者 Provider。详见 [共享 AI Conversation 权威合同](browser-framework/shared-ai-conversation-r2.zh-CN.md)。下方 R1.4/R1.5“由 WorkflowView 提供共享 Provider”“Prompt 尚未实施”等仅描述当时阶段快照，不是本轮 CURRENT；单一 React Root 与原 Opaque iframe/业务 Authority 保持。真实 Chrome/Native 验收仍需独立收据。


## Conversation R1.5 · WEB_PARTIAL 增量修复（2026-10-21）

**本节高于下方 R1.4 历史源码候选的实施状态，但不改变其原始产品目标。** 仍是书签首个真实业务试点：上方原书签管理器、下方共享可信 React Dock，Provider 只提议，Bookmark Service 与 SDK/Host 决定真实写入与读回。没有第二 Provider、Root、Chat iframe 或可执行动态 JSX 提权。

本轮 main 已提交：模型请求的独立撤权 Abort 与代际校验、HTTPS/Native 每写前权限复验、写入回执实际 ID 的 React 树定位（尊重用户中途滚动/搜索并提供查看入口）、当前网页 URL 归一、IM 输入法组合保护和增量 Node/Chromium 回归用例。**这是源码变更事实，不是运行测试 PASS。**

**关键边界：** 模型侧失权用 `E_MODEL_GRANT_REVOKED`，不得当作 Chrome Bookmarks Host 授权丢失而清空原树；已发出写入即使取消也须实际读回，UNKNOWN 禁止盲目重试。完整细节、未完成项、同源预览生成命令及分级测试账本见 [Conversation R1.5 WEB closeout](../framework/workstreams/conversation-r15-web-closeout-20261021.md)。

**当前交付状态：`WEB_PARTIAL`。** 定向测试文件和 Chromium 用例已提交，但本环境未执行 Node、WXT、真实 Chromium、真实模型或本地 Mac Chrome。已提交的 `preview/index.html` 是旧版；待 `preview/react/build-preview.mjs` 生成新 `preview/dev.html` 并通过真实 Chromium 审批后才发布。第二试点 `PROMPT_SHORTCUTS_NOT_IMPLEMENTED`。

## Conversation R1.4 · 可信 React 底部 Dock（2026-10-21 源码候选）

**原始产品目标不可缩减：** 用户保持原扩展界面可见，在底部对话区提出自然语言操作；AI 经现有 Workflow Provider 提议，扩展审计过的业务 Adapter 调用原 Service/SDK/Host，写后读回核验后原界面即时更新。首个真实业务试点为 Bookmark Manager；Prompt Shortcuts 为优先的第二试点，尚未完成准入和接入，不能当作正式 PASS。

**首期最小职责：**
- `src/ui/react/components/conversation.tsx` 的 `TrustedConversationWorkspace` 归可信 React Root，负责打开/收起、消息、草稿、Stop、滚动、可调高度和界面生命周期；`conversation-dock.css` 只消费原设计 Tokens。通用共享层不含书签实体、提示词数据、模型密钥、SDK 方法和执行器。
- 经现有 `trusted-bookmark-admission.js` 官方版本/包/摘要/安装/撤权代际核验后，既有 `src/ui/react/main.tsx` Portal 挂载书签 `App.jsx`，其窄 Adapter 在用户 Send 时固定真实选择 ID、经核实的连续引用和当前页上下文；仍由原 `workflow-view.js` Conversation/Provider 与 `bookmark-actions.js`/`BookmarkR2Service` 实际执行并逐写读回。
- 开 Dock 不隐藏、不卸载搜索或书签树；编辑草稿保持，先允许读/搜索，冲突写入须由用户先处理草稿；停止只阻止尚未发送的写入，不能撤销已发出操作；UNKNOWN/失权不自动重放。收起不等于 Stop。会话与引用仅在本次可信 Side Panel 存活期间按原内存会话能力恢复，不声称浏览器重启恢复。
- 原用户/AI/第三方 HTML/JS/React/Vue 安装包及 Classic 回退仍属于 opaque-origin sandbox；共享 React Root 仅消费经审计固定编译的第一方代码。不能从工具 ID、包自报 trusted 或 JSX 标签推定准入；不扩大 CSP/权限/包体门槛。

**证据分级：** 截至此段更新属于 `SOURCE_CANDIDATE`；Node 定向测试、正式 WXT build/预算、Chromium 同源预览、真实 Provider/Chrome Bookmarks、Mac 正式安装/升级，均须绑定提交与原始回执，未执行标 `NOT_TESTED`。独立 `preview/react/build-preview.mjs` 生成的 `preview/dev.html` 为隔离 Mock 候选，原 `preview/index.html` 的旧预览标识不得作为 R1.4 交付证据。第二试点 `NOT_IMPLEMENTED`，不以单个试点推导所有扩展适用。

## R37 正式入口与单根合同（2026-10-19，替代下文阶段性 HTML 接管约束）

正式入口为 `src/ui/sidepanel.html`，静态构建输出根目录 `sidepanel.html`，Manifest 的 `side_panel.default_path` 指向此处。`ui/tool.html` 已退役，无别名、重定向或第二 Host。HTML 仅声明文档、既有 CSP/样式/启动脚本和空的 `#opendesk-react-app`；不承载业务模板。

唯一启动链继续复用 `src/entrypoints/tool-shell.js → src/ui/tool-shell.js → src/ui/react/main.tsx → app-shell.tsx`。Main 直接创建一个 Root；App Shell 创建导航、五 Tab、目录、Dock 与 development Debug，不搬运旧 DOM，不保留 Scaffold 或第二挂载路径。原 Controller、RunHost、Host、Authority、安装及用户工具 Sandbox 继续拥有业务权威；React 负责可信 UI。编辑器与工具 iframe 仅保留必要的运行容器，不能据此重新引入业务模板。

可信路径使用 `src/tool-document-url.js` 的唯一常量；路径更名不改变安装身份、权限、hostInstanceId、documentId/frameId、Tool/Preview/Runner 排斥或撤权语义。独立工具、Preview、Catalog、Runner 均复用同一 React 应用。正式版五 Tab，Debug 仅 development 可见，诊断不触发云控授权或业务执行。

实施和候选验证进度见 [R37 本地交付记录](react-ui-r37-delivery-20261019.md)。下文及 R35.4 账本中的旧入口、Portal 接管与暂存旧模板均为历史阶段记录；不能覆盖本节。Node、构建、Chromium 和 Mac Chrome 证据须独立记录，未测不得宣布 COMPLETE 或 95+。

## R33.3.1 实施记录（2026-10-16，实测状态优先）

- React 正式扩展视图已在 `src/ui/react/main.tsx` 收敛为一处 `createRoot`，列表/详情/搜索筛选工具栏使用 React Portals 保留现有容器与 ID；扩展动作仍由 `src/ui/extension-center.js` 路由至原 Host/权限服务。工具栏原生静态节点仍用于不带 React 注入的遗留 DOM 测试；正式 React 路径不再重复绑定菜单/筛选事件。列表、详情、工具栏完成后，扩展空态、清理回执、返回等区域暂仍旧 DOM 管理，扩展 Tab 只可记 PARTIAL。
- 构建安全 P0：旧版 CI 中 React 19 静态原型恢复和 ReactDOM 值追踪引起两类 `.constructor` 触发；前者由并行维护者在 `scripts/verify-package.mjs` 限定 AST 形态，后者在唯一可信固定产物上由 `scripts/react-dom-input-csp.mjs` 对 ReactDOM 19.2.0 实施可审计、失败关闭的源码转换。原 CSP、拒绝动态执行的 AST 扫描及包预算不放宽；必须以同 SHA 的 production/dev CI 结果宣布 PASS。
- 本次新增 React 19 SSR 真实 JSX 输出、HTML 转义、筛选状态和菜单 ARIA 渲染测试（非 Chrome 用户输入模拟）；原侧边栏工具 Host 异步审阅测试替换固定次数轮询为等待可观察状态，保留所有安全断言。原有非 React 工具源码/版本/安装包完全不动。
- **未完成**：五 Tab 全部 React 化、React Aria/shadcn 成熟浮层选型实测、扩展 Tab 完整生命周期的真实 Chrome 验收、Mac 安装后的原生证据、自定义 HTML/Vue/React 三类工具的同候选完整回归。每项仍为 NOT_TESTED 或 PARTIAL，禁止用旧 CI/历史截图冒充新 PASS。

## R33.3 最新生效决定：单一可信 React UI 根（2026-10-16）

**这是本文件当前唯一生效的 React 源码路径决定**：所有当前可信 Side Panel React 页面和纯 UI 组件均归属 `src/ui/react/`，其中 `components/ui/` 是现阶段唯一共享组件根。**本轮不创建** `packages/opendesk-ui-react/`。仅在真实出现独立构建的第二 React 消费者、完成复用/依赖/预算实证后，才另行评估提取；必须迁移原消费者并移除重复源码，禁止复制长期并存。

正式入口继续是 `src/entrypoints/tool-shell.js` → `src/ui/tool-shell.js` → `ui/tool-shell.js`（不增加 WXT 入口或独立 HTML）。原 `examples/sidebar-tools/` HTML/JS、Vue、React 工具、安装包、SDK、Sandbox、版本、用户数据默认原样保留。每块 DOM **同时只能有一位运行时所有者**；没有完成真实迁移与回归的页面保持原样。

**R33.3 首次实施的真实范围：** 正式「扩展」Tab 的列表 `#extension-center-list` 和详情容器 `#extension-center-detail-body` 已采用 `src/ui/react/tabs/tools.tsx`，可信安装/启停/审阅仍走既有 `extension-center.js` 与 Sidebar Host；扩展筛选/菜单/安装导入及开发、工作流、我的、云控仍为旧视图，**不可据此声称五 Tab 已完成**。组件暂使用 React 19、原有 OpenDesk Button/Tokens 与浏览器原生 ARIA；React Aria/shadcn 成熟控件、Tailwind 组件构建须先实测预算/焦点/隔离再逐项接入，不得虚报已交付。真实 Node、WXT 与 Chromium 结果按当前源码候选独立记录，禁止引用历史 CI 冒充验收。


> **2026-10-16 用户最新决策。** 本文件是 React UI 相关任务的唯一产品/架构目标；此前 R32.8「只验证 React 开发能力」和 R33.0「只做局部 React 试点」属于历史阶段，不得覆盖本轮目标。**本文是待实施合同，不等于 React 重构已经完成或得到 Chrome 原生 PASS。**

## 一、最高优先级：五个可信 Side Panel Tab 统一 React，旧自定义工具不改

**核心产品目标（P0）：把 OpenDesk Browser 的可信 Side Panel 主界面建设为专业、统一、适合 AI 和开发者持续维护的 React 工作台，最终覆盖「我的／扩展／工作流／开发／云控」五个正式 Tab。** 用成熟 React UI 组件、清晰的状态与业务边界减少重复 DOM 操作和界面不一致；**最终结果是可信侧边栏 UI 的统一 React 架构，不是仅能编译 React、创建组件包、局部演示或长期维护两套主界面。**

**并列 P0：原有用户自定义扩展 UI 零退化，但不主动迁移或重写旧工具。** 用户可能使用 HTML/CSS/原生 JavaScript、Vue SFC、React JSX 或其他已经能够按现有打包合同产出安全 JS/CSS 的开发方式。已有 HTML/JS 工具、Vue 工具、React Starter 和已安装工具**保留现状，可继续充当示例代码**。只要求编译、打开、交互、SDK、数据与安装更新正常；**没有真实回归，不得为 React 主界面升级修改这些工具的 UI/业务源码、依赖、包版本或发行 JSON**。

**优先级边界：**
- **P0 — 可信 Side Panel 五 Tab：** 统一 React UI、交互、设计系统与业务适配；以「开发」「扩展」为优先实施区域，其余「工作流」「我的」「云控」完成后达到同一结构。
- **P0 — 自定义工具零退化：** 保留原 opaque-origin iframe + SDK/Host/安装链；保留原「开发」的 JS/React/Vue 编辑、编译、预览、Run、Save、Stop 语义。只做风险驱动的定向兼容测试，测试失败才最小修复。
- **P1 — 用户 React 工具按需复用组件：** 可以选用新的 React 组件源码；由工具自己预编译成原格式，不强制改 React Starter/旧工具，也不把新 UI Kit 加给 HTML/Vue 工具。可使用独立的受控消费验证，而不将所有现有工具改版。
- **P2 — 在独立完整标签页重新设计 UI：** 现有 `sidepanel.html?toolId=...` 已与 Side Panel 复用同一工具宿主及 Sandbox；保持可用即可，暂不单独开发一套 React 全页面。不得把独立页面改版作为五 Tab 的阻断项。
- **不属于本轮：** 全量重写扩展底层、Browser SDK、Host、SW、权限、安装器、用户工具 UI 或 Page USER_SCRIPT 系统。

## 二、组件库和构建方案：有方向，但不能虚报已经选型落地

- **已存在的基础：** WXT + Vite 是浏览器扩展原有构建链；React 19 在独立工具和 Page UI 已有既定入口；Vue、HTML/JS 继续并存。无需因 UI 重构更换整个浏览器框架。
- **首选待验证的 UI 方案：** `shadcn/ui`（React Aria base）+ `React Aria Components` + `Tailwind CSS v4`，映射**原有** `src/ui/design-tokens.css` 与语义视觉规范。shadcn/ui 于 2026-07 起提供 React Aria 第一方基底：<https://ui.shadcn.com/docs/changelog/2026-07-react-aria>。这只是**优先验证组合**，不是仓库已经引入、更不能无测试强制整库安装。
- **选型实证：** 对 Button/IconButton、Dialog、Menu、Field、Tabs 及真实需要的 Tree/Combobox，测键盘/焦点/ARIA、浮层 Portal、CSS scope、明暗主题、依赖许可证与 bundle。成熟控件优先，不为本轮凑数量；如 React Aria 组件与预算或架构冲突，应记录证据再比较 Base UI/Radix 或更小组合。
- **CSS 边界：** `src/ui/design-tokens.css` 是唯一 Tokens 来源。Tailwind v4 可作为**离线构建工具**，其 Preflight / 全局 reset 不得意外覆盖原 Side Panel 或工具 iframe；优先 CSS 作用域、显式映射，而不是复制第二套视觉变量。
- **组件归属：** 真实可信 Tab 已是确定消费者；本阶段共享源码固定归属 `src/ui/react/components/ui/`；未来是否提取 npm 包须另行实证，不得以目录创建作为交付。用户工具可选择从同一源码预编译导入，但不借用宿主权限、DOM 或运行时全局。

### R33.2：历史目录提议（2026-10-16，已由上方 R33.3 覆盖）

**避免 AI 执行漂移：** 本节约束下一轮的目标路径，但**不表示这些新文件现在已经创建或获得测试通过**。在 GitHub `main` 的本次核查中，`packages/` 只有 `opendesk-dev/`，`packages/opendesk-ui-react/` 不存在；该路径查询不到已合入 `main` 的历史提交。若 Mac 本地/其他只读历史中有同名目录，先查 Git status、文件内容、引用和来源，**禁止直接 `rm -rf`、`git clean` 或删除未知 Agent 文件**。

| 代码职责 | 约定路径 | 写入/保留要求 |
| --- | --- | --- |
| **R33.2 历史候选公共包（已弃用）** | `packages/opendesk-ui-react/` | **R33.3 不创建、不消费**；仅在出现真实独立第二消费者及性能/维护实证后，才可评估抽取；绝不与 `src/ui/react/components/ui/` 重复维护 |
| **可信 Side Panel React UI 和共享组件（R33.3 当前唯一来源）** | `src/ui/react/` | 五 Tab 页面、React 挂载与 `components/ui/` 统一归属；渐进接管，禁止重复 DOM owner；只创建正式使用的文件 |
| **既有浏览器 HTML / 启动入口** | `src/ui/sidepanel.html`、`src/ui/tool-shell.js`、`src/entrypoints/tool-shell.js` | HTML 仅提供空挂载点；复用**同一个** WXT 固定产物 `ui/tool-shell.js`，默认**禁止**另建 React WXT entry、另一份 sidebar.html 或第二路由入口 |
| **现有业务服务和旧视图** | `src/ui/script-editor.js`、`src/ui/sidebar-tools.js`、`src/ui/workflow/` 等 | 已迁移的视图用薄适配器复用原业务逻辑；旧视图完成真实回归前保留，不直接整文件覆盖；明确 React DOM 所有权，避免双事件写入 |
| **视觉标准** | `src/ui/design-tokens.css`、`src/ui/design-system.css` | 单一权威；共享 UI 组件从现有 CSS variables/构建时映射获取视觉值；不用新色板，Tailwind Preflight 不全局注入用户工具 |
| **原有用户自定义工具/Starter** | `examples/sidebar-tools/*` | **默认只读**，HTML/JS、Vue、React 保持原样作为示例；新组件只是新 React 工具可选项，除实际回归缺陷外不改正式源码、工具 ID、版本或安装包 |
| **回归测试** | `tests/environment/`、已有 `tests/framework/` 或现有测试入口 | 对真正变更的组件、可信 Tab 和旧自定义工具兼容分别验证，使用必要的定向测试，无第二套测试框架 |
| **技术决策与交付证据** | 本文件 + `docs/framework/workstreams/` | 本文件固定目标和路径；每轮实际提交文件清单、原始 CI/Chrome、独立评分与未完成项记工作记录 |

**关键构建注意：** 现有 `src/entrypoints/tool-shell.js` -> `src/ui/tool-shell.js` 由 WXT 固定入口处理，禁止为了 React UI 迁移随意增加/改名固定入口。`scripts/build.mjs` 当前来源输入检测主要收集 `src/`、`scripts/`、根 manifest/package/lock 及工具资源，**不会自动覆盖新建的 `packages/opendesk-ui-react/` 源码**。未来若确实批准且消费该公共目录，必须以定向、经过测试的方式把其文件加入 build provenance/source-drift 校验，保证变更/构建/回执确切对应；不要因此重做完整构建系统。根 `package.json`、`package-lock.json` 只允许因真实 React/组件依赖而定向修改并锁版本；避免重复安装多份 React。独立工具仍按自身 Vite+原打包器构建，不能引用宿主内存中的特权 React Runtime。

**旧目录处理规则：** 存在旧文件不等于做错。按`路径->功能->实际引用->可替代性->受影响测试`判断：可复用则增量保留；同职责重复实现则先迁移真实消费者/测试再删除确实失效的文件；无引用的试验代码仅在核查它不属于其他 Agent、没有独立成果或用户数据后才定向清理。没有证据时不删除、不重命名、不批量格式化。

## 三、可信 Side Panel React 迁移：最终统一、分模块落地

R33 历史基线的可信 Side Panel 核心入口包括已退役的 `src/ui/tool.html`、`tool-shell.js`、`script-editor.js`、`sidebar-tools.js`、`workflow/workflow-view.js` 等，存在不少 DOM 事件与业务行为交织。**工作重点是 UI 与业务状态/服务解耦，而不是机械将 95KB HTML 全改成 JSX。**

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


## R33.3.2 实际迁移边界（2026-10-16）

- 同一 `src/ui/react/main.tsx` root 已新增扩展空状态、计数、状态和卸载清理恢复 Portal。正式安装/启停/卸载/授权/Host 继续唯一由 `src/ui/extension-center.js` 及原服务执行；没有新的 React 安装服务。
- 「开发」Tab **开始迁移**：`src/ui/react/tabs/develop.tsx` 只显示当前活动网页身份与可执行状态的可信指示器，由 `src/ui/script-editor.js` 提供快照模型；原 DOM 无 React 时保留完整行为。仍复用相同 React Root，不新建包或第二 Root。
- 草稿/编译器/JS、JSX、Vue/Run/Stop/本地项目/权限与存储的所有权**未迁移**，不得称 Developer Tab 已全部 React 化。禁止 React 修改原编辑器的 input、textarea 或自动启动脚本。
- 成功的源码模拟 Chromium CI 与 `dist` 包 CI 只能证明相应提交的部分门槛，不能代替已安装 Mac Chrome 的用户级功能验收。最新变动仍以 CI 实际状态为准。


### R2.2 跨业务 AI Chat 共享 React 边界

`src/ui/react/main.tsx` 继续拥有唯一 `createRoot`。`SharedConversationFrame`/`SharedProviderSettingsSheet` 是同一 React 树内的组件/Portal，不能为设置或用户扩展再建根。MyTaskAgent 与 Bookmark/Prompt 各自的 Service、Session、授权及 HTML/JS iframe 不因共享交互 UI 而合并。Provider 配置仍只归 ToolShell 的 Runtime：单 Root 下的全局设置 Portal 只经 ToolShell 提供的三方法受限 Facade（`settingsSnapshot/subscribeSettings/updateSettings`）编辑原 Runtime；UI 不持有 Runtime 的 `configuration()`/`acquire()` 权限，公开快照不包含会话 API Key；Workflow 原控制器只保留业务运行快照与 Native/Observation 授权管理，并被动同步 Runtime 代次。动态用户 HTML/JS/React/Vue 仍留原沙箱与 SDK 边界。

## 共享 Sidebar Tool 管理规范（2026-10-24 增量）

**唯一产品 UI owner：** `src/ui/react/tabs/tool-host.tsx` + `src/ui/sidebar-tools-view.js` 的 Field Snapshot；交互与安全生命周期仍由 `src/ui/sidebar-tools.js`、原 Installer、原权限 Authority 负责。安装工具右上角仅直接显示「工具设置」「卸载」两个管理图标；扩展中心列表/工具业务的专用更多菜单不属于此规则，不能误删。

工具设置依次呈现：仅在工具具备可配置业务项时显示的「扩展设置」；仅当安装能力/授权场景确实需要时显示的「权限管理」；所有已安装 Sidebar Tool 的唯一「应用管理」。应用管理始终只有一个 `#sidebar-tool-enable`，使用 `role=switch` + `aria-checked`，状态为「已启用 / 已停用 · 数据保留」；启停通过既有 Controller 经草稿/保存保护后执行，不在 UI 副本或预览里私自写安装记录。

完整书签授权仅对声明 `browser.bookmarks.full` 的工具显示；Cookie 首次授权继续在可信卡片内完整解释作用域和风险，完成后权限控制回到共享「工具设置」，不能产生第二个启停控件。原安全审阅、风险提示、Chrome 权限申请、撤权、卸载确认、安装身份/代际核验全部保留。文字精简仅作用于管理设置摘要，不得替代首次权限审阅。

正式同源离线预览沿用 `scripts/preview/build-sidebar-six-react-preview.mjs` → `prototypes/sidebar/react-preview/index.html`。该 HTML 必须由当前源码重新生成，标记 `UI_PREVIEW_ONLY`，任何启停、授权、卸载演示只允许修改内存 Fixture，绝不调用真实 Installer/Chrome Permission。Mac 常用浏览器始终加载 `dist/development` 与现有 `npm run dev` watcher；源码更新不代表现有已运行的扩展产物自动刷新。没有实际浏览器指纹和点击回执时，一律 `NOT_TESTED`。
