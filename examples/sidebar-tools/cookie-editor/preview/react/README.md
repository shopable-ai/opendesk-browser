# Cookie Editor R5.20 · shared App offline preview

## Development delivery

The daily extension uses `dist/development`, extension ID `ccfcjegpkdlgbclopjmadlcjedelidmf`, and the existing `npm run dev` watcher. The installed React 2.0.25 candidate previously completed disposable localhost Cookie create/read/edit/clear-value/restore/save/reopen/delete operations through the real SDK. Its evidence remains in `artifacts/cookie-editor-r520/development-delivery.json`; it does not prove the merged candidate.

The merged development candidate is **2.0.26**, built with the original packer into `artifacts/sidebar-tools/cookie-editor/r56-react-2.0.26-candidate.opendesk-tool.json`. The formal native config and unique installation JSON remain **2.0.23**. No promotion or production extension build is part of this task. Current candidate installation and native results must be read from the matching development delivery receipt.

`official.jsx` → `CookieEditorApp` → Controller / SDK adapter → `OpenDeskSDK.browser` → existing Host / Authority → Chrome Cookies API is the only native path. The preview imports the same App. `src/mock-sdk.js` provides fictional responses and scene controls only; it is excluded from the native candidate.

The merged App keeps the compact native controls, inline ×, restore-original action, icon-only cancel/delete, and an inline more-tools menu. Metadata checks run only while the browser list is visible and idle, normally every 2 seconds, with a 30-second delay after read failures. They neither read Cookie values nor write Cookies. Editing, dirty drafts, open panels/confirmations, hidden or disconnected surfaces block refresh application. Unknown writes never retry automatically. Existing Controller observation capabilities remain available without a separate product observation panel.

## Local preview

`index.html` is standalone and embeds fixed React 19.2.0, shared UI, the actual App, and product CSS. Its CSP blocks network connections. It does not install or run a browser extension. `src/style.css` owns only the preview frame and fictional scene controls; product icon sizes and text geometry belong to `../../src/react.css`.

Prerequisites: Node >=22.12, the existing preview lockfile/dependencies, `src/libs/page-frameworks/react-19.2.0.js`, and the shared UI emitted by the existing watcher at `dist/development/sidebar-shared-ui.js`. Do not start another Host writer or fall back to production output.

```sh
npm run build
npm run check
npm test
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:chromium
```

The existing Vite plus `build-preview.mjs` wrapper binds the document to source input hashes. `check` detects stale HTML; the Chromium command checks the current build without rebuilding it. Artifacts and screenshots are local evidence under `artifacts/cookie-editor-r520/`, not extra committed snapshot matrices.

Native evidence must identify the daily Profile, extension ID/path/client, installed package version/SHA256, and disposable localhost scope. Private draft backups and Cookie values must not be printed or committed. Production, formal promotion, complete lifecycle, native unknown-write fault injection, and 95+ scoring remain **NOT_TESTED**. Width/zoom and internationalization matrices are **OUT_OF_SCOPE**. Historical review material remains in Git and `REVIEW.zh-CN.md`.
