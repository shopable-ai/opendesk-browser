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
