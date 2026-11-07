# R5.20 preview cleanup

Current stage (latest user override): development only. Completion is shared-App reuse, core offline Chromium interactions and 380px light/dark/editing screenshots. Reuse the existing evidence; do not repeat builds or tests without a relevant change. Production acceptance, installation/upgrade acceptance, 95+ scoring, CI and broad matrices are OUT_OF_SCOPE and do not block this development delivery. Preserve legacy sources and historical evidence.

Scope: `preview/react/` and preview assertions only; shared `app/`, official CSS/config/package and legacy production sources remain owned by their existing authors.

1. Lock composition, fixed offline runtime/CSP, fictional SDK isolation, and Controller-driven save/rename/clear/import/export regressions before replacing the duplicated preview business.
2. Mount `app/CookieEditorApp.jsx` unchanged. Keep only fictional cookies, mock public SDK responses and scenario controls in the preview. Reuse the existing Controller, Domain, fixed React 19 and Shared UI outputs and approved R5.18 presentation/CSS.
3. Build with the existing Vite + single-file pipeline; check byte identity. Exercise the resulting file in Chromium at 380 CSS px, including light/dark/editing captures in ignored artifacts. Record candidate hashes and untested native behavior. Preserve the preexisting R5.19 title intent by advancing the preview to R5.20.

The existing Chromium suite is the behavior reference. Replace preview-specific simulated UI assertions with actual shared-App interactions; do not retain a second implementation to satisfy old selectors. Shared-App defects are reported to its owner instead of repaired outside this scope. No branch, worktree, commit, installation or production build.

The last consumer of the forwarding-only `ui/CookieEditorView.jsx` layer was this preview. It now mounts `app/CookieEditorApp.jsx`, which owns the Controller/SDK composition and imports the real view from `app/components/CookieEditorView.jsx`. Inline editing, clear confirmation, import/export, permissions and offline workspace also come directly from `app/components/`. The main controller has removed the unused forwarding layer; the source tests assert its absence and the actual App/component ownership while retaining sensitive-value and isolation checks. The main controller reports 22/22 targeted tests passing in `artifacts/cookie-editor-r520/development-targeted.log`.

Offline assembly reads Shared UI only from `dist/development/sidebar-shared-ui.js`, supplied by the existing development watcher. This preview never starts a Host build or a second watcher. Rebuild/check and refresh the 380px evidence when this development resource is ready; retain earlier results as historical evidence.
