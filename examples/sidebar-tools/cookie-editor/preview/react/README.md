# Cookie Editor R5.20 · shared App offline preview

## 日常开发入口交付（2026-10-19）

日常 Mac Chrome 的同一 Profile、扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 已通过现有安装器将 Cookie Editor 从原生 2.0.23 更新为 React **2.0.25**。加载目录仍为仓库 `dist/development`，现有唯一 `npm run dev` watcher 的开发 client 已实际连接，观察到的构建指纹为 `122ad7155226f7f60367351101a8e6f0a985cf428080e80902f7b9b0077ce350`。旧 watcher 缓存了更新前的入口白名单；有序重启同一个服务后恢复，无需放宽来源门禁。

实际调用链为 `official.jsx → CookieEditorApp → cookie-controller / browser-sdk adapter → OpenDeskSDK.browser → 现有 Host / Authority → Chrome Cookie API`。预览复用同一个 App，仅外围提供虚构 SDK 和场景控件。图标尺寸、行距和文本折行规则现归产品 `src/react.css`，预览不再覆盖这些规则。

开发候选位于 `artifacts/sidebar-tools/cookie-editor/r56-react-2.0.25-candidate.opendesk-tool.json`，SHA256 为 `06a132f355e7be04aaf86e92376373ebf16c595837efc8661f850190bbd647b5`。使用项目 `npm run build && npm run stage:candidate` 生成；原目录唯一正式 JSON 和 `tool.config.json` 仍保留原生 2.0.23 基线，本轮没有正式晋升或 extension production 构建。

已在日常入口仅针对 `127.0.0.1:43111/demo-form.html` 的可丢弃测试 Cookie 验证新建、原值读取、修改保存、输入框内 × 清空、恢复原值、空串保存、关闭重开回读，以及一次删除。删除只有一次宿主确认，测试 Cookie 已清理，原有两条未改动。原 `opendesk_r519_gui` 草稿在升级前私下保全，现已恢复到 React 表单且保持未保存；备份不进入 Git 或日志。安装身份变更后的本站权限通过现有授权 UI 重新审阅，未扩大到其他站点。

本轮定向构建/来源检查 10/10、产品 CSS 检查 4/4、最新离线 Chromium 交互 15/15 通过。Mock 定向回归 14/14 覆盖 overwrite 按原生 Domain/Path/Store/Partition 槽位替换，以及 save/import/clear/remove 的未知结果不自动重试。Controller/Domain 44 项保留既有有效证据，输入未变不重复执行。真实 SDK 的未知写入故障注入、完整生命周期、正式发布及评分为 **NOT_TESTED**。

最新 `index.html` SHA256：`69b867fdebe14dc1a9dae924ded574052fe987a92dc0116c1bce004196d7d914`。对应开发截图与日志保存在忽略目录 `artifacts/cookie-editor-r520/`；预览的 Chromium 证据与上述日常 Chrome 证据分别记录。

## 前阶段预览迁移记录（历史范围，以上述交付为准）

Current stage: **development only**. The completion criteria are shared-App reuse, minimum core Chromium interactions and 380px light/dark/editing screenshots. The offline HTML and current screenshots use the development Shared UI resource; earlier evidence is retained in the ignored `before-development-shared-ui/` artifact directory. Production acceptance, install/upgrade acceptance, 95+ scoring, CI and broad matrices are **OUT_OF_SCOPE**. Existing broader test code and historical results remain available without being rerun. Legacy sources are preserved.

The preview mounts `../../app/CookieEditorApp.jsx` unchanged. The same App constructs the existing SDK Adapter, Controller and Domain used by the official React candidate. `src/App.jsx` owns only the external scenario controls and mock SDK lifetime; `src/mock-sdk.js` supplies fictional in-memory Cookie responses. There is no second editor, import parser, exporter, dirty-state implementation or permission framework.

The preexisting R5.19 preview-title change is retained in intent and advanced to R5.20. R5.18 interactions remain implemented by the shared components: inline editing, original-value restoration/clearing, dirty guards, advanced identities, scoped modal clearing, automatic import preflight and copy/download export. Preview clipboard delivery is simulated; the download is a fictional local file. Native consent is never granted by this page. “模拟允许访问” changes only the mock scene outside the product App.

## Build and open

`index.html` is the generated single-file artifact. Open it directly through `file://`; it contains fixed React **19.2.0**, Shared UI, App code and CSS. CSP blocks all network connections. No extension installation, server or CDN is required to view it.

Development prerequisites are Node >=22.12, this directory's existing locked dependencies, the repository's fixed `src/libs/page-frameworks/react-19.2.0.js`, and **only** `dist/development/sidebar-shared-ui.js` from the existing development watcher. There is no fallback to another build directory. The main controller owns the running watcher; do not start a Host build or another watcher here. If its development output is unavailable, wait before rebuilding/checking the preview. This preview does not generate a replacement runtime or Shared UI implementation.

From this directory:

```sh
npm run build
npm run check
npm test
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:chromium
```

`build` uses the existing Vite + `build-preview.mjs` pipeline. Vite leaves React and Shared UI external, and the existing wrapper embeds their fixed resources into the HTML. `check` compares the HTML bytes and the recorded source-input hashes, failing if shared App/Controller/Domain inputs have changed since compilation. `test:chromium` checks the existing build before running it; it does not redundantly rebuild. On another system, set `CHROME_BIN` to its Chromium executable or use the existing Playwright browser installation.

The official stylesheet and canonical shared tokens/primitives are reused without editing their sources. `src/style.css` contains the preview frame and approved compact row/text/icon geometry needed by a standalone document without host SVG defaults. This fallback is preview-only; native geometry requires separate host verification.

## Verification and boundaries

The local Node regressions exercise the real SDK Adapter and Controller using fictional responses: metadata redaction, rename receipts, scoped clear cancel/confirm, batch import, export, denied values, unknown writes and observation/disposal. `tests/environment/cookie-editor-react-source.test.mjs` locks shared App composition and preserves sensitive-value safeguards without the obsolete `ui/` barrel. `cookie-editor-r50-trusted-pilot.test.mjs` retains the legacy 2.0.23 baseline and isolation assertions while checking the actual component owner and Controller clear-preflight chain; removal of the obsolete barrel is checked with `ENOENT`.

`chromium.mjs` drives the generated file at **380 CSS px**, including filters/search, dirty draft pinning, save/rename/delete, import preflight/conflicts, export/download/errors, real modal focus/cancel, grant-event scrubbing, loading/empty/read-only scenes and offline workspace switching. It also checks compact icon geometry, readable Cookie names, no horizontal overflow, no page exceptions and no HTTP requests.

Current evidence is stored in ignored `artifacts/cookie-editor-r520/`: `chromium-results.json`, `380-light.png`, `380-dark.png`, `380-editing.png` and the fictional download. Each result is tied to the generated HTML SHA256. These are mock-backed Chromium preview results, **not** native Cookie/permission/installation acceptance or a 95+ product score. Other widths, browser zoom, production installation and CI execution were not run in this task. The existing CI workflow was not modified; its clean-run prerequisites need separate confirmation.

Only this preview and the necessary source-test assertions are part of R5.20's write scope. Official config, official Vite config/build tests, legacy production `src/`, SDK/Host and the installable JSON package remain with their current owners. No branch, worktree, commit or package promotion is performed here. Earlier review history remains in `REVIEW.zh-CN.md` and Git.
