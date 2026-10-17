# AdBlock · React 19 离线零构建交互预览（R2.0）

**早期纯 HTML / CSS / JavaScript（R1，单文件）**：[index.html](index.html)；**当前 React 19 零构建交互预览**：[index-react.html](index-react.html)。两个文件用途明确，都是本地 `file://` 页面。R1 原件字节保持不变。本目录只用于产品演示，**不会调用 Chrome DNR、网页权限、扩展后台、Browser SDK，也不是正式工具安装包**。

## 日常开发：保存 → 刷新

在 Mac 上使用 Finder/VS Code 打开两个不同的本地 HTML。React 组件日常修改仅使用 `index-react.html`，不要直接修改已批准的 R1 原件。仓库根目录执行：

```sh
open -a "Google Chrome" examples/sidebar-tools/adblock/preview/index.html       # 原始单文件 HTML/JS
open -a "Google Chrome" examples/sidebar-tools/adblock/preview/index-react.html # 当前 React 19 + HTM
```

直接使用 Chrome 的 **`file://`** 地址即可，**不需要** `npm install`、`npm dev`、`npm build`、Vite、Webpack 或任何 HTTP Server。断网也能打开和操作。修改 [app.js](app.js) 中的 React 组件，保存后刷新 Chrome；修改 [style.css](style.css) 同理。不要修改固定运行时来调整 UI。

`app.js` 是 **普通 JavaScript + HTM Tagged Templates**，使用真正的 React 19 `createRoot()`、`useState()`、`useEffect()`、组件 props 和事件回调，并非手工 `innerHTML` 或伪 React。React 负责工具 UI、演示控制与通知的全部 DOM 更新。

### 目录与加载链

| 文件 | 用途 |
|---|---|
| `index.html` | **纯 HTML/CSS/JavaScript 早期 R1**，单文件可直接打开；原始批准设计不可编辑 |
| `index-react.html` | **当前 React 19 + HTM** 零构建入口，使用本目录 `app.js`、`style.css` 和仓库固定离线运行时 |
| `app.js` | **日常可编辑源码**：AdBlockApp、ToolHeader、GlobalProtection、CurrentSite、RulesSummary、ExceptionsView、SettingsView、PreviewControls 和 MockAdBlockService |
| `style.css` | 从已批准的 R1 HTML 中提取的同一套布局、字号、颜色变量、间距和圆角 |
| `../../../../src/libs/page-frameworks/react-19.2.0.js` | **固定离线 React 19.2.0 + React DOM Client 浏览器预构建运行时**（仓库现有资源，避免复制 193 KB/双 React 版本） |
| `vendor/htm-3.1.1.js` | 固定离线 HTM 3.1.1 经典脚本运行时 |
| `vendor/htm-src/*.mjs` | HTM 3.1.1 上游锁定源码，供维护人员复现本地运行时 |
| `vendor/rebuild-htm.mjs` | 仅更新/校验 HTM 固定运行时时使用，无第三方构建依赖 |
| `acceptance.mjs` | Node 22+ 原生 CDP + 真 Chrome/Chromium `file://` 交互验收，无额外 npm 依赖 |

整个仓库 checkout 是运行时依赖：`index-react.html` 故意复用仓库固定 React 文件，**仅单独复制 preview 目录而不带仓库 React 资源无法运行**。它与正式宿主 React Root 隔离；本预览自身只挂载一个 React Root。

## 运行时版本、许可证和可复现升级

- **React + React DOM Client 19.2.0**：来自本仓库经审查并锁定的 `src/libs/page-frameworks/react-19.2.0.js`，同时包含 `createRoot`、Hooks、JSX runtime。SHA-256: `d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758`；出处与版本清单见 `src/libs/page-frameworks/contract.js`。许可证：MIT，`src/libs/page-frameworks/react-LICENSE.txt`；上游：https://github.com/facebook/react 。
- **HTM 3.1.1**：上游 https://github.com/developit/htm/tree/3.1.1 ，许可证 **Apache-2.0**，见 [vendor/LICENSE-htm.txt](vendor/LICENSE-htm.txt)。仓库保存该版本 `src/build.mjs`、`src/index.mjs`、`src/constants.mjs`，通过一次性脚本转换成浏览器经典脚本。运行时不依赖 CDN、动态 import、浏览器 Babel 或 `eval`。

维护者仅在升级依赖时执行：

```sh
node examples/sidebar-tools/adblock/preview/vendor/rebuild-htm.mjs
node examples/sidebar-tools/adblock/preview/acceptance.mjs
```

HTM 更新必须同时审查上游源码、许可证、固定版本、运行时变更和真实浏览器验收。React 更新应复用根仓库维护的 `scripts/build-page-framework-runtimes.mjs` 与 `src/libs/page-frameworks/contract.js` 锁定流程；先审计版本、SHA 和安全策略，再更新本预览的引用及验收脚本。以上**固定资源维护步骤不属于日常组件开发**。

## R2.0 官方预览 Skill 与同源边界

- 主 Skill：`.agents/skills/opendesk-ui-preview/SKILL.md`，不是仅复制 Skill 名称。已核对 R27/R20 与权威预览模板两种职责。
- **React 设计稿** `preview/index-react.html` 是经认可的独立、离线 `file://` Mock。该可信设计评审文件只读加载仓库 `src/ui/design-tokens.css` 与 `src/ui/design-system.css`，组件采用 `od-surface`、`od-icon-button`、`od-button`；此种样式复用**不得复制到正式工具沙箱 iframe**。
- **设计模板** `scripts/templates/sidebar-preview.html` 由 `scripts/sidebar-preview-kit.mjs create/check` 生成、校验。现有 React 设计稿不是其生成物，不能直接运行此 `check` 并假报 PASS。
- **正式源码同源模板** `scripts/templates/sidebar-tool-preview-shell.html` 由 `scripts/preview/build-preview.mjs --tool adblock --surface side-panel --scenario success --theme light --width 360 --height 760` 使用；输入为现有正式工具源码/可信 Host 而非此 React Mock。生成 `artifacts/previews/adblock/` 下的正式快照，严禁手工编辑。已跟踪的 `../adblock-r1-interactive-preview.html` 也是正式生成快照，不能覆盖本设计稿。
- 官方预览外壳仅浅色；本设计稿因用户保留的演示需求可显式切换深浅 Mock。两者**不能等价**。聊天交互若无法直接执行 React 原文，标记 `CHAT_ADAPTER_NOT_SOURCE_HTML`。
- 新增读取中/失败/权限不足/不可信文本模拟状态只在右侧原型控制里，正式用户界面只按状态临时显示提示；失败不允许开关静默生效。规则和返回路径更明确，Chrome DNR/权限/安装代码不变。
- 控件密度对齐 34px 图标、12px 圆角与 8/12/16px 节奏；目前仅对设计稿做变更，正式同源预览仍需与实际安装产品按相同候选单独对照，禁止宣称 UI 漂移完全消除。

## 产品与 Mock 边界

预览正常宽度为约 **360px**，原型场景切换、深浅色、重置和说明放在**工具画布之外**。保留原批准的盾牌与工具标题、全局保护、当前网站、演示统计、默认推荐过滤、已停用网站管理、设置页及返回交互。

`MockAdBlockService` 只读取有限的固定虚构域名列表及演示统计，不监听真实网站，不发送网络请求，也不读取或写入真实浏览器规则。全局关停时本站开关禁用，但例外列表不丢失；浏览器内部 `chrome://settings` 只显示不可操作状态。演示状态优先保存到 `localStorage` 的 `opendesk.adblock.preview.r2`，兼容读取旧 R1 key；如果 `file://` 存储受限，则保持当前页面内的 React 状态，刷新恢复默认，不提示真实拦截已经生效。

**正式迁移建议**：完成预览验收后，通过宿主现有**单一 React Root**渲染可复用的可信 UI 组件，将 `MockAdBlockService` 换为明确授权、写入及回读的宿主业务适配器。绝不将 Mock 直接接到 DNR，也不把本预览的 React runtime 再打进正式 AdBlock 小型工具包。本轮不修改正式工具 `src/`、DNR、宿主权限、Installer、SDK 或安全策略。

## 真实验收

在装有 Chrome/Chromium、Node 22+ 的机器上，从仓库中执行：

```sh
node examples/sidebar-tools/adblock/preview/acceptance.mjs
```

可指定 Chrome 可执行文件：`CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node examples/sidebar-tools/adblock/preview/acceptance.mjs`。

脚本先验证固定 React SHA、资源路径、无 CDN/浏览器 Babel；再通过 **真实 Chrome DevTools Protocol** 打开本地 `file://` 文件，并禁止 HTTP(S) 请求，测试 React 挂载、开关同步、例外关闭与恢复、模拟站点、限制页面、设置与返回、深浅色、重置后刷新、**主动模拟 localStorage 禁用时的内存降级**、320/360px 无溢出与桌面下真实 360px 工具画布，以及**临时复制页面的 `app.js` 改动后直接刷新生效**。禁止使用静态截图代替运行结果。真实浏览器未执行时仅能报告「待验收」，不能宣称 PASS。

统一的 [Sidebar Preview Contract CI](https://github.com/shopable-ai/opendesk-browser/actions/workflows/sidebar-preview-contract.yml) 在 Ubuntu 真实 Chrome 中运行同一 `acceptance.mjs`，不再维护专用于 AdBlock React 文件的独立 Actions YAML。共享作业读取仓库已锁定 React/HTM 资源，校验可复现性，并在 `artifacts/preview-chrome/adblock-react-file/` 输出 320/360/1024px 浅色及 360px 深色的真实 Chrome PNG；截图包含在统一预览浏览器证据工件中。Linux CI runner 安装 `fonts-noto-cjk` 只为中文截图可读，不影响浏览器本地离线使用。**共享 Ubuntu Chrome、用户 Mac 本机 Chrome、macOS 正式扩展安装与 DNR 是不同证据等级，不能相互冒充。**

### 设计历史与生产快照

- 已批准 R1 HTML 原件：[index.html](index.html)（历史上曾命名为 `adblock-r1-interactive-preview.html`、`index-r1.html`，当前文件内容完全不变）；2026-10-15 Git blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`。R2 CSS 继承早期单文件 HTML 原型的已批准视觉变量。
- `../adblock-r1-interactive-preview.html` 是 `scripts/preview/build-preview.mjs` 生成的**生产源码同源快照**，不是此已批准 React 交互预览，不能互相覆盖。正式 Chrome DNR / 安装升级仍需独立验收。

## R2.2 · CI 统一入口（2026-10-17）

用户明确要求不得为了验证某个 React 预览文件而长期保留单独的 GitHub Actions 工作流。现有 `.github/workflows/sidebar-preview-contract.yml` 已负责共享 Sidebar 预览、官方生产同源 Mock、多个工具与真实 Chrome；因此将 AdBlock `file://` React 验收和中文截图并入这一现有工作流，并移除 `.github/workflows/adblock-r20-react-zero-build.yml`。**没有新增第二套 CI、运行时、打包器或宿主特权。**

- 日常设计预览：直接 Chrome 打开 `preview/index-react.html`，编辑 `app.js`/ `style.css` 后刷新，不要求执行 npm。
- 本机定向回归：`node examples/sidebar-tools/adblock/preview/acceptance.mjs`；是否通过必须记录实际 Node + Chrome 结果。
- 共享 CI：`Sidebar Preview Contract R1` 的 Ubuntu Chrome 作业，包含固定 HTM 复现、真实 `file://`、离线、键盘与 320/360px 检查、截图。不能把其 `npm ci`（服务于其它共享测试）误写成预览日常依赖。
- macOS Runner 独立 React 预览矩阵随重复工作流移除；Mac 本机 `file://` 验收仍需独立证据，正式 AdBlock 安装/DNR 继续使用现有正式发布门禁。
- ChatGPT 当前对话内近似交互 UI 必须标记 `CHAT_ADAPTER_NOT_SOURCE_HTML`；**只有直接打开真实仓库 `preview/index-react.html` 才证明运行的是 React 源码。**

## R2.1 · Mac CI、官方来源合同和 360px 收敛（2026-10-17）

### 三种预览的身份（不可互换）

| 入口 | 可修改源码 | 实际渲染来源 | 不可作出的声明 |
| --- | --- | --- | --- |
| `scripts/sidebar-preview-kit.mjs create/check` | 官方设计模板中的受保护编辑区 | 唯一设计系统 CSS 快照与模板 JS | `preview/index-react.html` **并非**该生成器的输出，也不能冒充通过其 `check` |
| `preview/index-react.html` | **本目录 `app.js`、`style.css`** | 固定 React 19.2.0 + HTM、本地官方 Token、独立 Mock | 不调用正式 DNR、权限、Host 或 SDK；标记 `DESIGN_REACT_MOCK_NOT_INSTALLED` |
| `scripts/preview/build-preview.mjs --tool adblock` | `src/ui/tool.html`、`tool-shell.css`、`trusted/host-controls.js`、AdBlock 正式工具源码 | **正式安装包同源**可信宿主快照 + 工具 iframe；SDK 边界使用 Mock | 不把生成的 `adblock-r1-interactive-preview.html` 当作 React 设计稿，也不手工修改它 |

**当前需保留的差异**：React 独立设计稿自绘蓝盾、标题和设置入口；正式工具由可信宿主控制**唯一**标题/返回/设置/卸载工具栏，开关、权限及全局状态由 `trusted/host-controls.js` 生成；AdBlock 沙箱 `src/index.html` 只呈现例外列表和恢复操作。正式 UI 的来源与职责已经确认，但**不等于这两种页面视觉一致**。在得到用户批准和真实候选浏览器证据前，不把 React Demo DOM 复制进正式工具，也不在 iframe 内重复标题/设置/权限开关。

### 本轮源码级防漂移

- `index-react.html` 必须明确标记 `DESIGN_REACT_MOCK_NOT_INSTALLED`，只以本地路径加载运行时与 CSS。
- `acceptance.mjs` 静态检查官方 `--od-icon-size:34px`、`--radius-control:8px`、`--radius-surface:12px`、`--od-page-gutter:11px`，在真实 Chrome 的 computed style 中复核 **34px 设置按钮、12px 卡片圆角、11px 单一 gutter**；反例与来源变化不得假报模板 check PASS。
- 360px 保留原始信息结构，卡片内采用 **12px**、同级操作间距 **8/12px**、独立标题间距 **16px**；长域名使用 `overflow-wrap:anywhere`，320/360px 检查横向溢出。
- 测试使用 CDP 真正发送 Space 与 Shift+Tab，验证开关语义和焦点顺序；旧的程序化 `.click()` 保留用于其他业务状态路径，二者不可互相替代。
- CI `ADBLOCK_PREVIEW_EVIDENCE_DIR` 下由 **相同 `file://` 浏览器会话**生成 320、360、1024px 浅色及 360px 深色 PNG，上传单独 artifact；截图存在只代表像素证据，不代表 95 分。

### Mac 启动失败与证据等级

历史 [React CI 38955276818](https://github.com/shopable-ai/opendesk-browser/actions/runs/38955276818) 在 macOS-15 的 Chrome for Testing 启动/CDP 阶段出现 `MachPortRendezvousServer Permission denied (1100)` 和 network-service crash，75 秒 watchdog 退出。它**没有进入 React UI 测试**，不能归因为 React 业务失败。R2.1 使 macOS CI 优先尝试 Runner 预装 Google Chrome，CFT 仍作为 fallback；给 CDP 探测/命令加有界超时、诊断日志，**不取消任何业务断言**。如果 runner 安全策略仍拒绝启动，结果必须是 `MACOS_CHROME_BLOCKED` / FAIL，而不是用 Linux 替代 PASS。

以下分别记账：`STATIC_GUARDS`、`LINUX_FILE_CHROME`、`MACOS_RUNNER_FILE_CHROME`、`USER_MAC_CHROME`、`INSTALLED_EXTENSION`、`NATIVE_DNR_NETWORK_REVOKE`。其中最后一项由 [正式 AdBlock CI](https://github.com/shopable-ai/opendesk-browser/actions/workflows/adblock-r12.yml) 独立负责。旧版本撤权测试超时仍属发布阻塞；不得以本目录 React 预览的 PASS 解除。

代码改动后执行：`node examples/sidebar-tools/adblock/preview/acceptance.mjs`；正式同源对照仍需独立执行 `node scripts/preview/build-preview.mjs --tool adblock --surface side-panel --scenario success --theme light --width 360 --height 760`、`node scripts/preview/check-preview-contract.mjs` 与三个已存在的 `tests/environment/sidebar-preview-*.test.mjs` 定向测试。聊天内适配展示必须标 `CHAT_ADAPTER_NOT_SOURCE_HTML`，不能称为真实 React `index-react.html` 执行。


## R2.2.1 · R1 归档命名与本地 Switch CSS 级联修复（2026-10-17）

- 历史 R2.2.1 的命名曾是 React 使用 `preview/index.html`、静态原型使用 `preview/index-r1.html`；现统一约定：**React 使用 `preview/index-react.html`，静态原型恢复 `preview/index.html`**，不改变任何一个 HTML 的源字节；静态原件 Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，原始 SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`。工具根目录 `../adblock-r1-interactive-preview.html` 是**正式源码生成快照**，不随本次重命名。
- 本预览使用 React 19.2.0、HTM 3.1.1、自有组件和 OpenDesk 共享 CSS Tokens/Primitives；**没有引入 shadcn/ui、Radix UI、React Aria 或独立组件构建工程**。共享 `design-system.css` 全局 `button { min-height:34px }` 会覆盖原本 `.toggle { height:27px }` 的高度目标，现通过局部 `.toggle { min-height:27px }` 修复，宽度 46px、圆点 21px 保留。
- 真实 Chromium `file://` 定向回归按 320px/360px 分别测量全局/本站开关的 `getBoundingClientRect()`、`getComputedStyle().minHeight` 与圆点高度，不再只看按钮是否可点击。聊天内 HTML 适配器没有执行相同 React/CSS 字节，**绝不能用其外观代表本地真实页面视觉通过**。

## R2.2.3 · 文件名按实现技术区分（2026-10-17）

- `index.html` = **早期纯 HTML/内联 CSS/原生 JS 的单文件原型**，保留 R1 批准原件，不需要 React；Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，保持原 SHA-256。
- `index-react.html` = **当前 React 19 + HTM 零构建预览**，其可编辑逻辑和样式分别为 `app.js` / `style.css`。由原 `index.html` **只改名不改字节**；通过本仓库已锁定的 React、HTM 和设计系统 CSS 离线加载。
- 不使用含糊的 `index-r1.html`、`index-old.html`、`index-final.html` 作为长期入口；版本沿 Git 历史追踪。若未来确实存在 Vue 等并列实现，才建立 `index-vue.html`，不创建空文件。
- `acceptance.mjs` 明确打开 `index-react.html`，执行真实 `file://` Chrome 回归；`tests/environment/adblock-preview-contract.test.mjs` 明确校验 `index.html` 原始不可变 SHA 与 React 模板的独立性。统一 CI 仍使用 `.github/workflows/sidebar-preview-contract.yml`。
