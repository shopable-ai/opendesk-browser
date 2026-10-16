# Cookie Editor R4.10.1 — scoped product closure

Date: 2026-10-16
Starting main: a38b1011db3fdc70d24a52aa5511b70f0815846e
Owner: Cookie Editor main-only workstream
Paths: examples/sidebar-tools/cookie-editor/{src/main.js,tool.config.json,cookie-editor.opendesk-tool.json,README.zh-CN.md}; tests/environment/{cookie-editor-ui.test.mjs,cookie-editor-r43-parity.test.mjs}; this note.
Protected: approved R4.9.2 UI preview, Browser SDK, Host, Installer, other team's sources, active Chrome profiles.

## Source finding

Untrusted Host/SDK error.message and error.code were included in Cookie operation failure UI. The service error may contain Cookie Value. This change uses exact allowlists and generic error guidance without changing SDK or real Cookie identity semantics. Failed draft is not reset and unknown outcomes are not automatically retried.

## Acceptance gates

- JS syntax checked during patch preparation; package fields source-aligned with current official config.
- Node targeted tests and check-project: NOT_TESTED until CI or local Node execution returns.
- Real Mac Chrome install/upgrade, Cookie CRUD, copy/download, responsive and accessibility: NOT_TESTED until same-sha native evidence.
- Unrelated 4 full regression failures (AdBlock, Mind Map, Time Review) are not modified.
