# Cookie Editor R5.20 · shared App offline preview

## Development delivery

The daily extension uses `dist/development`, extension ID `ccfcjegpkdlgbclopjmadlcjedelidmf`, and the existing `npm run dev` watcher. The installed React 2.0.25 candidate previously completed disposable localhost Cookie create/read/edit/clear-value/restore/save/reopen/delete operations through the real SDK. Its evidence remains in `artifacts/cookie-editor-r520/development-delivery.json`; it does not prove the merged candidate.

The current development candidate is **2.0.28**, built with the original packer into `artifacts/sidebar-tools/cookie-editor/r56-react-2.0.28-candidate.opendesk-tool.json`. The formal native config and unique installation JSON remain **2.0.23**. No promotion or production extension build is part of this task. Current candidate installation and native results must be read from the matching development delivery receipt.

`official.jsx` → `CookieEditorApp` → Controller / SDK adapter → `OpenDeskSDK.browser` → existing Host / Authority → Chrome Cookies API is the only native path. The preview imports the same App. `src/mock-sdk.js` provides fictional responses and scene controls only; it is excluded from the native candidate.

The merged App keeps the compact native controls, inline ×, restore-original action, icon-only cancel/delete, and an inline more-tools menu. Metadata checks run only while the browser list is visible and idle, normally every 2 seconds, with a 30-second delay after read failures. They neither read Cookie values nor write Cookies. Editing, dirty drafts, open panels/confirmations, hidden or disconnected surfaces block refresh application. Unknown writes never retry automatically. The merged Controller uses guarded metadata synchronization; there is no separate observation panel or observation method.

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
