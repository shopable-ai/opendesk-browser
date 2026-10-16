# AdBlock · React 19 离线零构建交互预览（R2.0）

**唯一当前已批准 UI 的 React 交互预览**：[index.html](index.html)。本目录只用于产品演示，**不会调用 Chrome DNR、网页权限、扩展后台、Browser SDK，也不是正式工具安装包**。

## 日常开发：保存 → 刷新

在 Mac 上使用 Finder/VS Code 打开 `examples/sidebar-tools/adblock/preview/index.html`，或在仓库根目录执行：

```sh
open examples/sidebar-tools/adblock/preview/index.html
```

直接使用 Chrome 的 **`file://`** 地址即可，**不需要** `npm install`、`npm dev`、`npm build`、Vite、Webpack 或任何 HTTP Server。断网也能打开和操作。修改 [app.js](app.js) 中的 React 组件，保存后刷新 Chrome；修改 [style.css](style.css) 同理。不要修改固定运行时来调整 UI。

`app.js` 是 **普通 JavaScript + HTM Tagged Templates**，使用真正的 React 19 `createRoot()`、`useState()`、`useEffect()`、组件 props 和事件回调，并非手工 `innerHTML` 或伪 React。React 负责工具 UI、演示控制与通知的全部 DOM 更新。

### 目录与加载链

| 文件 | 用途 |
|---|---|
| `index.html` | 稳定的 `file://` 启动页面，只包含本地样式、React/HTM/应用的经典脚本，按顺序 `defer` |
| `app.js` | **日常可编辑源码**：AdBlockApp、ToolHeader、GlobalProtection、CurrentSite、RulesSummary、ExceptionsView、SettingsView、PreviewControls 和 MockAdBlockService |
| `style.css` | 从已批准的 R1 HTML 中提取的同一套布局、字号、颜色变量、间距和圆角 |
| `../../../../src/libs/page-frameworks/react-19.2.0.js` | **固定离线 React 19.2.0 + React DOM Client 浏览器预构建运行时**（仓库现有资源，避免复制 193 KB/双 React 版本） |
| `vendor/htm-3.1.1.js` | 固定离线 HTM 3.1.1 经典脚本运行时 |
| `vendor/htm-src/*.mjs` | HTM 3.1.1 上游锁定源码，供维护人员复现本地运行时 |
| `vendor/rebuild-htm.mjs` | 仅更新/校验 HTM 固定运行时时使用，无第三方构建依赖 |
| `acceptance.mjs` | Node 22+ 原生 CDP + 真 Chrome/Chromium `file://` 交互验收，无额外 npm 依赖 |

整个仓库 checkout 是运行时依赖：`index.html` 故意复用仓库固定 React 文件，**仅单独复制 preview 目录而不带仓库 React 资源无法运行**。它与正式宿主 React Root 隔离；本预览自身只挂载一个 React Root。

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
- **React 设计稿** `preview/index.html` 是经认可的独立、离线 `file://` Mock。该可信设计评审文件只读加载仓库 `src/ui/design-tokens.css` 与 `src/ui/design-system.css`，组件采用 `od-surface`、`od-icon-button`、`od-button`；此种样式复用**不得复制到正式工具沙箱 iframe**。
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

脚本先验证固定 React SHA、资源路径、无 CDN/浏览器 Babel；再通过 **真实 Chrome DevTools Protocol** 打开本地 `file://` 文件，并禁止 HTTP(S) 请求，测试 React 挂载、开关同步、例外关闭与恢复、模拟站点、限制页面、设置与返回、深浅色、重置、刷新保存/降级、320/360px 无溢出，以及**临时复制页面的 `app.js` 改动后直接刷新生效**。禁止使用静态截图代替运行结果。真实浏览器未执行时仅能报告「待验收」，不能宣称 PASS。

### 设计历史与生产快照

- 已批准 R1 HTML 原件：2026-10-15 Git blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`。R2 CSS 继承此前 `preview/index.html` 的已批准视觉变量。
- `../adblock-r1-interactive-preview.html` 是 `scripts/preview/build-preview.mjs` 生成的**生产源码同源快照**，不是此已批准 React 交互预览，不能互相覆盖。正式 Chrome DNR / 安装升级仍需独立验收。
