---
name: opendesk-ui-preview
description: Generate and check an offline OpenDesk Sidebar App HTML design preview using canonical buttons and tokens, with an attachable ChatGPT prompt OR generate a source-bound offline preview from an existing installed tool package; not arbitrary website design.
---

# OpenDesk 规范化 HTML 设计预览

网页模型不会因仓库中存在 skill 就获得其中内容。给网页对话的是**实际生成的 HTML 附件和提示词全文**，不是本地路径或“已阅读规范”的声明。

先按根 AGENTS.md 核对 main、目标文件 diff、工作流与输出资源。新原型运行：

```sh
node scripts/sidebar-preview-kit.mjs create --out artifacts/sidebar-preview-kit/<本次唯一目录> --title "工具名称"
```

生成的 `preview.html` 内联当前 `src/ui/design-tokens.css` 与 `src/ui/design-system.css`；`chatgpt-prompt.txt` 可直接粘贴，HTML 须实际附给网页模型；`manifest.json` 保留输入与文件 SHA。输出目录已有时换一个新目录，不覆盖旧证据。

离线公共模板沿用两个既有生成器，不自动进入安装、Browser 构建、发布、全量验收或评分。实际证据见本轮生成文件与报告；生成成功不代表交互终验或测试 PASS。

这是**独立离线设计文档**。只修改 `#od-preview-app` 内部 HTML，以及 `#od-preview-behavior` 中 `/* DESIGN_APP_BEHAVIOR */` 标记之后的工具模拟逻辑；标记及之前的共享宿主交互受 check 保护；保护其他区域和全部 CSS。用 od-* 公共组件，不另造按钮视觉。应用外部辅助区支持模拟已授权/未授权/撤权/加载/空/失败/长文本与恢复；light/dark 仅改变应用，宿主始终 light；主操作、表单错误、取消、危险确认和焦点恢复要实际可演示。实际扩展、Host/SDK、安装包与网站权限不在本阶段调用。

设计稿应用区不放预览说明、状态/主题控件或“重置模拟数据”操作，不重复工具标题；这些辅助内容留在应用之外。顶部正式工具标题已有 `role="heading"`，应用内不放 `h1`；未保存表单期间禁用外部状态/主题/恢复，取消或 Escape 返回后恢复这些控件。

已有工具精简界面时，依照[内容区与状态行规范](../../../docs/api/sidebar-tool-development.zh-CN.md#6-统一-uiux-与代码质量规范)同步正式源码与原交互 HTML：去掉重复对象/检测说明，区域刷新靠右上角，状态文案自然撑高且底部留白均衡；移除节点后也要移除模拟脚本中的对应访问。只检查本次移动按钮、状态换行与反馈间距；独立设计稿仍标为模拟，不宣称安装包同源或原生通过。

回收模型返回的完整文件后运行：

```sh
node scripts/sidebar-preview-kit.mjs check /absolute/path/returned-preview.html
```

失败则针对错误修订；过期则重生成，仅迁移应用内部内容与 `/* DESIGN_APP_BEHAVIOR */` 标记之后的工具逻辑。lint 通过只证明静态合同，不能证明任意 JS 安全、真实模型读取附件、视觉或原生功能。按当前改动选择独立离线浏览器中的点击/键盘、工具主题或 computed style 检查；无证据项记 NOT_TESTED。默认不做缩放或 Side Panel 物理宽度专项测试。

完整目标、验收表、网页附件回收、生产迁移边界见 [预览套件合同](../../../docs/api/sidebar-preview-kit.zh-CN.md)。真实实现按 [应用开发 skill](../opendesk-sidebar-tool-dev/SKILL.md) 接续；不可把完整宿主 CSS/脚本从此设计文档注入动态工具 iframe，也不可把静态设计稿当作可安装包。历史 ≥95 方案评分不作为离线预览前置；产品通过须另有同候选原生证据。

## R32.3：平台原型、候选评估与结论回写

平台 UI、书签 Tree、反复失效的 Select/Combobox 或 React 选型任务，先读 [现行架构](../../../docs/architecture/browser-ui-r23.zh-CN.md) 的 R32.3 补充与 [续接 GOAL](../../../docs/framework/prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md)。目标是复用成熟视觉和行为，不是每个工具重写树、菜单和焦点系统。

保留原生基线，优先制作书签 Tree/Select/Menu 的最小真实 React 候选。React Aria 与 Radix 加明确 Tree 方案均待验证，不以旧聊天评分封版，不强制制作七套完整产品或先重写五个 Tab。相同数据和场景下比较实际交互；HTML 模拟、实际库运行、静态 Chrome 与已安装工具证据分开。

旧容量是可调整的内部预算，不能在候选筛选前按旧值排除 React；实际容量变更由 [打包 Skill](../opendesk-sidebar-tool-package/SKILL.md) 接续全链一致性，不改变权限、CSP 或安装语义。按需构建并复用同源公共视觉，不能跨 iframe 借用宿主特权。

每阶段审计、原型、选型、预算实验完成后，立即写回架构与 [R32 工作流](../../../docs/framework/workstreams/ui-platform-r32-20261015.md)：状态、决定、理由、证据、版本、限制和下一步；合同变化再同步相关 Skill。用户已要求保存时正常提交授权 main 文档，不以下载文件代替。当前环境不能直接渲染 HTML 时，明确说明并生成完整可打开文件；不得假报模型已读附件或交互通过。

## 生产工具同源预览（Preview Contract R1）

**阶段区别**：前面的 `sidebar-preview-kit.mjs` 是可编辑的网页对话**设计稿**，并非正式工具组件。已存在真实独立工具时，使用以下**安装包同源预览**，不要把设计稿直接冒充可安装工具，也不要创建另一套 UI Skill。新增能力以 [生产预览构建/验收合同](../../../docs/architecture/browser-framework/ui-preview-contract-r1.zh-CN.md) 为准。

源码→共享资源→正式包→预览：`src/ui/design-tokens.css` / `src/ui/design-system.css` → `scripts/preview/shared-tool-design.mjs`（构建期提取非特权视觉规则）→ `scripts/build-sidebar-tool.mjs`（现有正式可安装包）→ `scripts/preview/build-preview.mjs`（同样的 HTML、CSS、业务 JS，只有 SDK 适配边界切换为内存 Mock）。quick-notes 是首个样板；其他工具仅按 builder 已接入的 adapter 声明支持，不据此假定具备相同状态控件。网页注入和独立页面请求必须报未实现，不能用 iframe 假装正式 ShadowRoot。

从仓库根目录执行：

```sh
node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760
node scripts/preview/check-preview-contract.mjs
node --test tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs
```

quick-notes 的 `--scenario` 值为 `success / permission-denied / revoked / loading / empty / error / untrusted / long`；`--theme` 可选 `light / dark`，宽度沿用既有 CLI 参数，离线自包含结果在 `artifacts/previews/quick-notes/`。输入变动后**先重新生成并审核**，再显式 `node scripts/preview/check-preview-contract.mjs --update-lock`；CI 会依据原始正式资源与源码 SHA 检出陈旧产物。生成 HTML 不允许手修，Mock 无真实 Chrome/网络/存储/任务权限；动态内容仍走业务 JS 的安全文本赋值。不得替 sandbox 注入宿主完整 CSS。

影响样式边界或来源锁时，运行对应非法自定义按钮样式、过期 Token 反例并记录结果。Mac 实装 Chrome 和网页注入环境是另一证据等级；未执行项标 `NOT_TESTED`，不以离线结果声称原生通过。缩放/物理宽度矩阵和评分不作为离线预览前置。新工具应在最小范围实现正式共享 UI 及对应 Mock 适配，再扩大 CLI 允许范围；仍由原官方安装器管理权限和生命周期。


## R1.2：浅色 Side Panel 外壳模板（正式预览必须遵守）

先读 [预览模板与当前增量合同](../../../docs/architecture/browser-framework/ui-preview-shell-template-r12.zh-CN.md)。**宿主预览外壳始终浅色**；允许应用外部的工具 light/dark 选择器，只改变已支持的应用区域，不另造手工 Palette 或黑白两套模板。正式扩展的暗色支持不改。

- 两个既有生成器共用 `scripts/templates/sidebar-tool-preview-shell.html` 这一唯一完整宿主 DOM，以及 `scripts/preview/sidebar-shell-behavior.js` 这一唯一共享导航/返回/模拟卸载行为。设计稿的 `scripts/templates/sidebar-preview.html` 仅为内容/模拟逻辑 fragment，kit 仍输出完整单文件 HTML、prompt 和 manifest。共享 helper 配置只读、纯模拟，不写入平台或改变公开 API。
- 正式安装包同源预览通过 `scripts/preview/build-preview.mjs` 调用 `scripts/templates/sidebar-tool-preview-shell.html`。导航和工具页头必须由 `scripts/preview/sidebar-shell-source.mjs` 从 `src/ui/react/` 及正式 `src/ui/tool-shell.css` 提取。SSR 当前含 7 项，预览只保留可见正式五 Tab，不硬编码 SSR 总数或显示隐藏的 `app-debug`。禁止复制所有五个选项卡的内容、复制专用按钮 CSS，或把整套可信宿主权限脚本加入工具 iframe。
- 五个一级标签只作为可见上下文；预览中只有“扩展”有真实业务 UI。保留真实 Back/Title/卸载位置，卸载二次确认只关闭模拟 iframe，返回仅需精简的工具列表占位。列表中点击打开、在新标签打开等非关键流程默认省略；具体工具确需 Settings/网页注入开关时再按正式源码启用。
- 按当前改动检查受影响状态与交互，不把历史整组矩阵恢复为每轮前置。quick-notes 的外部状态/主题/恢复切换重建纯内存 iframe，必须提示模拟数据会重置；不得假装真实授权。对话中**直接展示可交互 HTML**并附上可打开的正式生成文件，未具备 HTML 执行能力就说明限制；只给图片、下载包或仓库 URL 不能代替当前上下文预览。
- 相关生成输入变更后按需执行 `node scripts/preview/check-preview-contract.mjs`、`node --test tests/environment/sidebar-preview-shell.test.mjs tests/environment/sidebar-preview-contract.test.mjs`；明确记载生产已安装 Chrome 尚未验证部分。模板/正式依赖修改后重新生成并审阅，不准手改生成的 HTML 解决视觉问题。

为了节省 AI 上下文，传递“工具/展示面/当前视图 + 关键状态/交互 + 设计来源与 commit/Mock 声明”的短提要即可；详细源码和编译产物留在仓库并按需加载。不要把 5 个 Tab、真实包 JS、全部 CSS 内联进每轮文字提示词。

## R1.3：聊天内交互展示与极简上下文（2026-10-15）

沿用前述 **两个既有生成器**，不再创建 HTML 框架、设计系统或总 Registry。详见 [模板的 R1.3 正式合同](../../../docs/architecture/browser-framework/ui-preview-shell-template-r12.zh-CN.md)。

- 日常入口：“使用 OpenDesk 正式预览模板，设计 XXX 工具，直接在当前对话展示可交互的浅色 HTML。” 先确认工具所属环境和已有源码；已有工具使用 `scripts/preview/build-preview.mjs`，全新设计稿使用 `sidebar-preview-kit.mjs create`。
- 正式工具生成时保存同名 `.context.json` 轻量文件，优先提供 `view/scenario/hostInteractions/source/simulation`，不把五个 Tab 的 JS/CSS 或整个业务包塞进每轮对话。
- **只有客户端确实载入正式生成 HTML 字节，才能宣称 `SOURCE_HTML_INLINE`。** 如果只可以用聊天交互组件近似还原，必须显著标注 `CHAT_ADAPTER_NOT_SOURCE_HTML`，报告差异，另外交付正式离线 HTML 路径。图或 URL 不算对话内交互通过。
- 正式 Side Panel 导航从真实宿主提取，预览时仅把 `aria-controls` 绑定到确实存在的模拟面板；模拟卸载明确不清理真实数据；取消/Escape 正常恢复触发按钮焦点。
- 离线 Node、Headless Chrome、用户 Mac 已安装扩展是**三种独立证据**。无同候选 Mac Chrome 记录，`NATIVE_CHROME=NOT_TESTED`，不得用静态评分补齐。


## R1.4：预览诊断区必须在工具之外（2026-10-15）

有正式工具的 Source-Bound Preview 严格划分 **实际工具区域** 与 **离线预览辅助工具**：

- \`src/index.html\` / 正式安装包 / \`iframe#opendesk-preview-frame\` 只包含生产业务 UI。**禁止**将“预览实验台”、模拟权限切换、故障注入、测试菜单、CI 操作按钮插入工具容器、详情、页面顶部或 sandbox iframe，即使它们标注“不是正式工具”也不行。

- **公共辅助区与专有 adapter**：允许在共享模板增加真正通用的外部状态/工具主题/恢复区域，变更后同步来源锁及受影响检查；不要求无关产物字节永远不变。书签专属 lab 的 8 项命令（含 revoke/restore）仍仅由 `bookmark-manager` adapter 注入。其他工具未接入的控件明确不支持，不注入书签 lab；正式工具包 / 内层 iframe 无辅助控件。
- 源码同源预览的公共辅助区与专有诊断均位于 `.preview-device` 之外；专有诊断由 `scripts/preview/build-preview.mjs` 按工具 ID 显式启用，默认折叠并明确“非正式工具”，真实截图/用户观察首先呈现不带诊断的正式 Side Panel。临时故障注入不得改变正式 SDK/Host、权限、发布包或浏览器持久数据。
- quick-notes 与 bookmark-manager 公共控件通过重建纯内存 iframe 切换场景、工具主题或恢复，明确重置模拟数据，不涉及真实结果未知（unknown）的操作，也不放宽产品未知副作用保护。书签外部选择仅支持 `success / empty / error / loading / permission-denied / untrusted` 六种既有场景及 light/dark，不支持 quick-notes 的 `revoked / long` 场景值；书签专有 lab 另保留 8 项运行时命令（含 revoke/restore），其中 `revoke` 命令不同于 `revoked` 场景。lab 继续使用工具 Mock 允许列表及有界的仅预览消息协议，核对来源 WindowProxy 和离线确认消息；不得借 \`allow-same-origin\`、直接 \`chrome.*\`、外部网络、跨世界 DOM 访问或通用特权 Bridge。
- 受影响的离线回归按需核对：真实包内无实验台；生成 frameHtml 内无实验台控件；外部 \`.preview-device\` 之外可找到实验台；控件点击只修改 Mock 内存。用户点击书签行只查看只读详情；仅“编辑”操作进入输入态。编辑草稿未保存而选其他行时，先显示清晰的放弃/保留决定，不得把新行呈现为仍在编辑的表单。
- 实验台不属于生产 UI 视觉评分范围；CI Chrome Mock 只能证明模拟交互，Native 扩展安装/CRUD 必须另有相同候选身份的证据。共享模板源码锁变化需审查后按 Git blob 核实，绝不随意哈希重算制造通过。


## R5.6 · React Sandbox Tool 正式同源预览

针对 `uiRuntime: "opendesk.react-ui.v1"` 的工具，预览**必须同时锁定工具 UI 编译字节和宿主发布的 React/Shared UI Runtime 版本**。检查 `src/entrypoints/sidebar-shared-ui.js`、`examples/sidebar-tools/adblock/vite.config.mjs` 和 `examples/sidebar-tools/shared-ui-demo/preview/index.html` 的实际执行合同；JSX 应由原 Vite 编译为 Classic IIFE 与静态 CSS，预览只消费这些已有字节，不重新维护一份 React 模拟组件。

预览的 Host 只注入范围明确的模拟 `OpenDeskTool.request`，不可具备 `chrome.*`、真实 DNR、安装/撤权或未审计权限。诊断控制、主题/宽度和故障注入只在工具 iframe **外面**。生成记录应含候选 commit、`tool.config.json`、HTML/CSS/JS 哈希、共享 Runtime/版本来源及模拟标识。更换 JSX、Host mock 或任何编译资源都要重新生成和检查；若缺少与源码匹配的共享 Runtime 或编译字节，**阻止声明 SOURCE_HTML_INLINE 或 SOURCE_PARITY_PASS**，不得将旧预览保留为本轮的正式预览。设计稿、Mock UI、离线真实源码预览、可导入正式包和已安装 Chrome 分级展示，实际未测的标 `NOT_TESTED`。


## 2026-10-30 · 组件组合入口

模板完善与新设计先运行原 `sidebar-preview-kit.mjs create`，从同目录 `components.html` 实际操作真实共享 Button/IconButton/Card/Switch，读取 `component-recipes.md` 的 HTML/JSX 接入；设计稿外部有直接入口。不是另建 Atlas，完整参考仍用 `prototypes/sidebar/extension-ui-showcase/index.html`。具体支持、源码及边界见[组件与组合入口](../../../docs/api/sidebar-preview-kit.zh-CN.md#组件与组合的直接入口2026-10-30)。

默认复用 Card、od-form-field/label/field/help/error、od-alert 及各语义状态组合，不能只要求“遵守规范”。React 从现有 `@opendesk/ui` 导入，原生字段不是虚构的 Field/Select API；运行时不自动发布全套表单/布局 CSS，需要时由工具静态 CSS 显式编译 canonical 规则。HTML 原工具继续原生语义，原共享样式提取器现已输出同源 Card 子集，不手绘 React Aria Switch。组件示例为 SOURCE_COMPONENT_PREVIEW，单独保存源/依赖/产物 SHA，不能冒充安装包或 Native 验收。
