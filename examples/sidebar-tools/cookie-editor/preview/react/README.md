## R3.7 当前阶段：仅 dev，不构建（2026-10-27）

在本目录使用 Node 24 运行 `npm run dev`，固定监听 `127.0.0.1:43134`，端口占用直接失败。

- `/dev.html` 由 Vite 直接转换现有 `src/main.jsx` → 同一正式 `app/CookieEditorApp.jsx`；不读取旧生成 `index.html`。
- `/a-b-dev.html` 复用 `build-a-b.mjs` 的 wrapper 函数；左侧严格验证认可 HTML Blob `020adbf22005cba219af4ff27cd3f3e492978bed`，右侧同源加载 `/dev.html`，不生成 `a-b.html`。
- `/dev-product.css` 每次请求重新执行 `compileSharedToolCss` / `canonicalThemeOverride`，读取当前 `src/react.css`、唯一 tokens 和共享组件样式；这些源及固定运行时变更触发 dev 页面刷新。
- 固定 React 19.2.0 与已有 `dist/development/sidebar-shared-ui.js` 只读复用，不构建 Shared UI，不写 extension watcher 输出。
- `/dev-source.json` 返回当前 App、预览源码、样式、固定运行时的逐文件 SHA-256、聚合 `sourceHash` 和 `generatedHtmlUsed: false`。dev 证据不能标成静态构建或原生安装 PASS。

若共享 dev 输出正由其他 writer 更新，可用 `COOKIE_PREVIEW_SHARED_UI=dist/production/sidebar-shared-ui.js` 指向已有运行时再启动本目录 dev。路径相对仓库根目录，仍只读复用；来源记录包含实际文件哈希，不证明该 Browser 产物已包含当前可信代码。

### 2026-10-28 · 删除仓库交互

当前共享 App 不再显示本机加密仓库、口令、解锁或锁定。`accountsFirst` 场景从空账号开始，Chromium 定向用例 `first account saves directly` 已完成点击「＋」、命名和保存。此预览采用虚构 SDK；真实持久化、安装与 Chrome Cookie 结果需分别验证。旧场景和下面历史记录不作为新流程的原生证据。

### 2026-10-28 · 其余五页的 dev 核心操作

Cookie 页沿用已有结果，本轮按账号 → 企业 → 市场 → 定制 → 圈子推进同一 React 源码：

- 账号新建/重命名使用独立表单；确认回执成功后才返回列表。未保存草稿在取消或换页前确认，“继续编辑”恢复输入焦点，放弃后返回原操作入口。真实用户手势和原账号回执/站点校验保留。
- 企业页补齐功能图标与“其他 AI 服务 · 未接入”状态；预览席位/预算仍明确为虚构数据，可进入企业定制。
- 市场页保留搜索、分类和三个直接体验入口；账号及有效期入口聚焦目标 Tab，切换设置聚焦标题。有效期体验只打开未保存编辑区。
- 定制页的场景与生成摘要在同一 App 的 Tab 往返中保留；通过既有公开剪贴板 SDK 复制，未确认时支持从摘要手动复制。文字不自动发送，关闭/刷新 App 不承诺保存。
- 圈子页补齐渠道状态、紧凑入口按钮和说明；Telegram、Discord、微信均可展开/收起，真实邀请链接与联系方式保持“待公布”。

已在现有 CFT 的独立无痕窗口，通过 `a-b-dev.html` 的真实 React + Mock SDK 操作验证账号新建/重命名、草稿保护与焦点恢复，企业跳转，市场搜索/分类/体验入口，定制生成/模拟复制及跨 Tab 保留，三个社群入口展开/收起。日常 Chrome 的真实 SDK 注入会被预览安全门禁拒绝，未绕过该门禁、改动扩展配置或启动新服务。

五项现有定向 Node 检查通过：当前源码 CSS 的共享设计门禁/内存编译、六 Tab 布局与元数据、唯一公开 SDK 路径、账号可信回执和账号展示边界；`git diff --check` 通过。未构建 Shared UI 或扩展，未执行静态预览构建、打包、晋升、安装、全量矩阵、逐像素审计或评分。真实账号操作、企业服务接入与真实剪贴板 Host 仍为 `NOT_TESTED`。

以下 Cookie 逐像素审计命令与差异记录保留供后续使用，不作为当前 dev 阶段的默认执行或收尾条件：

```sh
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node visual-contract-check.mjs --dev-url http://127.0.0.1:43134/dev.html --cookie-only
```

审计主动选择 `approvedParity`，双方使用相同时钟与 Asia/Shanghai 时区；记录起止源码哈希，源码变化标 `TEST_INFRA_FAIL`。
每个场景保留两张真实截图及完整可见 DOM 清单（含滚动区内容）：全部控件、直接文本、SVG 树、属性、父索引、computed style、相对 rect、disabled/checked/selected/expanded/pressed/open/inert/focus/value 状态。
未匹配控件、文案、SVG、结构、几何和样式差异保持为待修差异，不自动豁免；现有显式安全/动态项保持独立 review 分类。
截图超时标 `TEST_INFRA_FAIL`，不能当视觉通过。默认仅比对 Cookie 列表，不代表所有交互弹层、正式 Chrome 权限或真实 Cookie 验收。
证据默认保存 `artifacts/cookie-editor-r37-dev/audit/`，可用 `--output` 指定独立目录。
`--enforce` 遇到 locked 差异或基础设施失败返回非零；默认审计模式写差异报告。

`npm run test:a-b:dev` 和 `npm run test:chromium:dev` 可连接该入口；后者是已有完整脚本，当前阶段不默认执行。
不带 `--dev-url` 仍走原静态严格来源核对，旧生成 HTML 漂移会拒绝，不自动重建。

默认审计可靠化（2026-10-27）：全页所有可见节点均保存，`coverage.total = product + preview`。实验台、Host 外框与站点模拟下拉保持 `PREVIEW_ONLY`；正式只读站点名通过独立 Host context 值核对。产品坐标以双方 sitebar 为原点，React 仅对测试外框 `.cookie-app` 约束高度，目标由原型 sitebar 到 `#panelScroll` 底边实测；不向产品注入 CSS。

匹配键包含 region、Cookie name / account displayName、语义角色、控件 owner 和稳定序号。布局 wrapper 全部保留 raw DOM，不因 tag/display/flex/grid 实现不同单独判视觉差异；文字使用 Text Range 几何，Tab 使用实际绘制 label 的字体/边框。透明边框不当作绘制色差，原始 border 值保留。ARIA null → false 单独记录 `STATE_ENHANCEMENT`；安全例外仍需 review，不作为 PASS。差异 category 为 STRUCTURE/COPY/ICON/STYLE/RECT/STATE/A11Y/TEST_INFRA_FAIL。

`node visual-contract-check.mjs --self-test` 运行当前 matcher 的八项定向自检，不启动浏览器。可读差量写入 `default-gap-list.json`，同时保留完整 report、双方 screenshot 和 DOM。

Cookie 交互状态复用同一审计器，固定当前 380px：

```sh
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node visual-contract-check.mjs --dev-url http://127.0.0.1:43134/dev.html --cookie-only --states default,edit,new,date,duration,advanced,search,filter,import,export --output ../../../../../artifacts/cookie-editor-r37-dev/cookie-verified-visual --enforce
```

每个状态先恢复双方同一虚构数据，再执行相同操作；关闭的 details 不计为可见元素，鼠标移出以避免把偶然 hover 当作状态。场景执行失败、截图失败和来源变化都保留为基础设施失败。`--enforce` 的非零 GAP 不因功能回归通过而豁免。

当前可见改进：Tab 和行间距对齐；有效期下拉与日期字号对齐；属性区保留只读身份及独立存储信息；筛选与排序同一行；导出恢复紧凑操作按钮与选中色；值字段明确提示“修改将在点击保存后生效”。脏编辑切换 Tab 后的 Escape / 继续编辑会恢复原 Tab 焦点，明确放弃后才选中并聚焦目标 Tab。

仍为 GAP 的差异按原因阅读，不能把节点级联位移当作多个独立缺陷：

- 当前公开读取将普通与分区 Cookie 合并后，最后两项次序与原型数组不同；保留来源顺序及分区身份，不改虚构数据或平台读取规则制造一致。
- 正式编辑区保留真实授权读取、清空值、未保存状态、无改动时禁止保存、只读 Domain / Path 及存储身份；模拟原型的“不会写入 Chrome”文案不进入正式产品。新增、搜索清除按钮和排序等已有功能继续保留。
- 正式导入使用现有 Sheet、文件选择和覆盖选项；认可 HTML 仍是内联元数据演示表单，二者布局差异未获视觉批准。
- 导出保留可用的包含值选项、一次操作授权和 JSON / Header 键盘 Tab；原型禁用的模拟控件及角色不同继续记录。浮层宽度与阴影等小差异亦未自动豁免。

`chromium.mjs --test-match '…' --single-width 380 --dev-url http://127.0.0.1:43134/dev.html` 可定向重跑有效期与导出等操作，不扩成宽度矩阵。场景切换等待旧 App 退出；导出尺寸测量外浮层，回执只列实际保存的截图。`cookie-verified/chromium-results.json` 保存本轮编辑、排序、草稿、导入、导出及焦点检查；这些均为正式 React + Mock SDK 的 dev 证据，真实 Host / 安装 / 发布仍为 NOT_TESTED。

正式包仍是 2.0.39、源码配置为 2.0.40；两项发布身份检查不一致保留，当前 dev 阶段不重打包或晋升来消除此差异。

以下构建/晋升及静态 HTML 说明均为历史流程，不构成本轮执行要求。

---

# 2026-10-27 · HTML 视觉基准 → 正式 React 的网页源码迁移

- **视觉参考唯一文件**：../cookie-editor.html（原生 HTML/CSS/JS，已审核的交互原型，不是真实 SDK 或正式 React）。
- **React 业务源码**：../../app/CookieEditorApp.jsx、../../app/components/CookieBusinessPanels.jsx、../../app/components/CookieAccountExperiences.jsx、../../app/components/CookieAccounts.jsx、../../app/components/CookieInlineEditor.jsx、../../app/components/CookieEditorView.jsx、../../src/react.css。
- **已在 GitHub main 写入的差量**：六个 Tab、企业/定制/圈子 React 页面、官方会员链接、轻量市场直接体验、七档邀请有效期、匿名领取 1/3/5/10 次、Cookie Expiration 单行下拉与条件日期输入；原 Controller、SDK、Trusted Host 不动。
- **必须区分状态**：React 源码已变更，然而 react/index.html 是既有生成产物，**目前并未在本网页环境重建**，因此不能将旧 HTML 当作最新 React 的视觉或功能证据。预览构建、源指纹核对、截图一致性、Cookie 原生验收仍为 **NOT_TESTED**。不允许手改生成后的 React bundle 伪造通过。
- **继续推进**：先从真实 React 源码构建同源 HTML 并完成关键 UI 状态比对，修正视觉偏差；之后才交本地 Codex 执行轻量真实 Chrome 测试、修复与验收。已有历史固定预览不删除，来源身份和正式安装 JSON 由原有晋升流程维护。

---

# Cookie Editor R5.20 · shared App offline preview

## 2026-10-23 · 导出浮层交互（React 原型源码）

导出不再进入独立的 `panel='export'` 页面。正式 React 与此预览共用
`app/CookieEditorApp.jsx`、`app/components/CookieExport.jsx`、
`app/components/CookieEditorView.jsx`、`src/react.css`。
点击列表工具栏导出图标，打开靠右对齐的非模态 Popover；原 Cookie 列表保持挂载，
已有未保存的编辑草稿不被清空。面板仅显示 JSON 与 Cookie Header 两个格式选项卡，
默认 JSON，可选“包含 Cookie 值”，直接复制或下载。Netscape 从界面移除，
底层旧数据解析兼容不变。失焦、点击外部、Escape 关闭；Host 执行期间保护进行中的
操作，失败保留弹层供用户手动重试。存在分区 Cookie 时禁止有损 Header 导出。

测试入口：`npm test` 和 `npm run test:chromium`，其中 Chromium 检查
320/360/400/440px、选项卡键盘操作、失焦关闭、真实 Controller 的虚构 SDK
复制/下载、导出失败重试。

**交付状态：**本次已提交共享 React 源码、样式和测试，但网页侧无法运行
Node/Vite/Chromium 构建；仓库现有 `preview/react/index.html` 仍为上一版已
生成快照，正式可安装 JSON 也未更新。须在 Mac 工作区执行 `npm run build`
（此处指 `preview/react`）、`npm run check`、`npm test`、
`npm run test:chromium`，重建独立预览并提交同源产物；随后由正式发行构建
路径生成安装包。未经过的构建/原生验收均为 **NOT_TESTED**。

## 2026-10-22 · 授权页面单按钮预览

R4.3 历史模拟页面移除了「仅查看」授权按钮和重复说明。React 预览复用正式 `app/CookieEditorApp.jsx`，首次授权提示改为「Cookie 访问授权」+ 一句范围说明 +「允许管理所有网站 Cookie」单按钮；对应 JSX、CSS 和独立 `index.html` 已同步为新视觉。**R4.3 是按本站授权的历史模拟；当前正式 Cookie Editor 使用 HTTP/HTTPS 全站授权，不能以历史原型改变可信 Host 的授权范围。**

此改动没有调用或修改真实 Chrome Cookie/Host、没有更新正式安装包。独立 HTML 是对现有固定 React bundle 的定向预览同步，**并非本轮执行 Vite 构建的产物**。必须在本地执行 `npm run build && npm run check && npm test && npm run test:chromium` 重新生成、提交并核对严格同源；完成前将构建一致性、真实 Chromium 及 Mac Chrome 安装升级标记为 **NOT_TESTED**。


## Current dev delivery · 2.0.29 (2026-10-20)

The unique installable package, root config, and development catalog now use the same React App as this offline preview. The website-URL dropdown left of Refresh has been removed. The preview source check passes for `index.html` SHA-256 `2c6b3b5744a9b6dd63ffc33e2767fa1bb98c4f44a1b01c692299cbf33eede624`.

The existing installer upgraded the real development Chrome profile from 2.0.23 to 2.0.29. Localhost Cookie create, edit/save, native value readback, and exact deletion passed; the disposable Cookie is gone. The daily Chrome installation was also updated through Review Update, and its details show 2.0.29. `npm run dev` serves `dist/development`, extension ID `ccfcjegpkdlgbclopjmadlcjedelidmf`; the development client connection was verified in the test profile. Evidence: `artifacts/cookie-editor-current-delivery/development-delivery.json`. Production builds, full acceptance, and scoring remain NOT_TESTED.

## Local preview

`index.html` is standalone and embeds fixed React 19.2.0, shared UI, the actual App, and product CSS. Its CSP blocks network connections. It does not install or run a browser extension. `src/style.css` owns only the preview frame and fictional scene controls; product icon sizes and text geometry belong to `../../src/react.css`.

The shared product components retain the compact editor labels and value hints, the “属性” / “存储信息” disclosures, and the compact site hostname. The preview does not restore the old standalone business UI or its separate “变化观察” section. Chromium coverage retains disclosure-based selectors, read-only Domain/Path, disabled Host-only, and partition identity checks against the actual App; preview CSS does not override those product styles.

Prerequisites: Node >=22.12, the existing preview lockfile/dependencies, `src/libs/page-frameworks/react-19.2.0.js`, and the shared UI emitted by the existing watcher at `dist/development/sidebar-shared-ui.js`. Do not start another Host writer or fall back to production output.

```sh
npm run build
npm run check
npm test
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:chromium
```

Latest **2.0.28** development evidence: the existing daily Chrome update review matched SHA-256 `b60b1248ae24570dddc8d65549f00ab613f58b69b1677b22fd7b7a5c59accf62`, with no added or removed capabilities. Invalid paste input produced one concise error; cancelling retained the original two Cookies. Opening the standalone tool reproduced site-change interruption, and the explicit **重新读取 Cookie** action restored the real localhost list without replaying the pending write. A disposable localhost Cookie was then imported through Host confirmation, its value read back correctly, and individually deleted. No original Cookie was written or deleted. The private unsaved draft is protected by its existing 0600 backup; its final restoration is recorded only as booleans in the local receipt.

The integrated Controller/domain/source checks, fictional transport checks, 7 package/design checks and 17 offline Chromium cases passed. Native file-picker completion remains **NOT_TESTED**: the system path popup did not complete reliably during automation, so it was cancelled; the successful native import used paste. The interrupted read regression uses the actual shared App. Latest local evidence: `artifacts/cookie-editor-r520/recovery-development-delivery.json`, `recovery-*.log`, and `native/recovery-*.png`. The current offline HTML SHA-256 is `a7a8b3b1b3be37e602e9a40294fd78915470fd615f32f0b724de8350cd63f395`; its source check still passed after the unrelated main integration without rebuilding. Historical evidence below remains bound to its original candidate.

The merged **2.0.27** candidate was installed in the daily Chrome Profile through the existing update review, with no added capabilities. The localhost website grant was reconfirmed after update. The new import dialog submitted one disposable localhost Cookie through the existing Controller and Host confirmation; its value was read back and single deletion was checked. The original two Cookies were retained. Earlier **2.0.26** evidence also covers create/edit/explicit-empty-save/reopen/delete with the unchanged Controller and inline editor. It remains labeled with that version.

Fresh validation after the import merge: 8 source checks, 7 package/design checks (including rejection of source drift before candidate output), 14 fictional transport checks, and 15 offline Chromium UI checks passed. The 53 Controller/domain checks passed before this import-only merge; those implementation inputs are unchanged. The packer receives the successful source-bound React build receipt. Copy checks use completion/error state and transport unit coverage because the compact UI omits success banners. Evidence is in `artifacts/cookie-editor-r520/merged-development-delivery.json`, `merged-*.log` and `latest-*.log`.

Candidate SHA256: `da3f49a30c7cc7ee3daf34c0330de0b81ca8aed24214d090864cd08c8abea0b0`.
Offline HTML SHA256: `92701da6b39cdd300119978bc01937f69ab67c51ea790eb5705915b28c3115bc`.

The existing Vite plus `build-preview.mjs` wrapper binds the document to source input hashes. `check` detects stale HTML; the Chromium command checks the current build without rebuilding it. Artifacts and screenshots are local evidence under `artifacts/cookie-editor-r520/`, not extra committed snapshot matrices.

Native evidence must identify the daily Profile, extension ID/path/client, installed package version/SHA256, and disposable localhost scope. Private draft backups and Cookie values must not be printed or committed. Production, formal promotion, complete lifecycle, native unknown-write fault injection, and 95+ scoring remain **NOT_TESTED**. Width/zoom and internationalization matrices are **OUT_OF_SCOPE**. Historical review material remains in Git and `REVIEW.zh-CN.md`.


## Historical delivery notes

The following notes describe earlier candidates and failures; they do not describe the current 2.0.29 delivery.

2026-10-20 header update: removed the entire website-URL tools dropdown to the left of Refresh in the shared App. Rebuilt `index.html` (SHA-256 `2c6b3b5744a9b6dd63ffc33e2767fa1bb98c4f44a1b01c692299cbf33eede624`); preview build/source check and targeted offline Chromium refresh, search, edit/save, and import-return checks passed with fictional data and no page errors. Local evidence: `artifacts/cookie-editor-ui-dropdown/`. The extension Vite assets were emitted with the menu absent, but the build wrapper fails its existing literal `browser.cookies.setMany` check. Source/design checks passed 12/15; all three failing assertions also fail against the unchanged HEAD sources (surface class, import callback signature, minified CSS). No installation or package promotion was performed; native behavior remains **NOT_TESTED** for this update. Historical receipts below retain their original candidate identities.

## Development delivery

The daily extension uses `dist/development`, extension ID `ccfcjegpkdlgbclopjmadlcjedelidmf`, and the existing `npm run dev` watcher. The installed React 2.0.25 candidate previously completed disposable localhost Cookie create/read/edit/clear-value/restore/save/reopen/delete operations through the real SDK. Its evidence remains in `artifacts/cookie-editor-r520/development-delivery.json`; it does not prove the merged candidate.

The current development candidate is **2.0.28**, built with the original packer into `artifacts/sidebar-tools/cookie-editor/r56-react-2.0.28-candidate.opendesk-tool.json`. The formal native config and unique installation JSON remain **2.0.23**. No promotion or production extension build is part of this task. Current candidate installation and native results must be read from the matching development delivery receipt.

`official.jsx` → `CookieEditorApp` → Controller / SDK adapter → `OpenDeskSDK.browser` → existing Host / Authority → Chrome Cookies API is the only native path. The preview imports the same App. `src/mock-sdk.js` provides fictional responses and scene controls only; it is excluded from the native candidate.

The merged App keeps the compact native controls, inline ×, restore-original action, icon-only cancel/delete. The site header shows the hostname and refresh action; the more-tools dropdown entry has been removed from the shared preview and extension App. Metadata checks run only while the browser list is visible and idle, normally every 2 seconds, with a 30-second delay after read failures. They neither read Cookie values nor write Cookies. Editing, dirty drafts, open panels/confirmations, hidden or disconnected surfaces block refresh application. Unknown writes never retry automatically. The merged Controller uses guarded metadata synchronization; there is no separate observation panel or observation method.
