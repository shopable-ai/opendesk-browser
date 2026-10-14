# Browser SDK R11 — Declarative Chrome Binding (2026-10-14)

**Ownership:** SDK R11. Only `main` writable; do not overwrite other agents. Web GitHub connector; no access to the user's Mac repo or Chrome Profile. No local watcher, native browser, or dist touched.

## Source contract and scope

- Approved runtime registry: `src/framework/sdk/browser-contract.js` (53 public operations). Trusted-only History/permissions: 2. Total approved contract **55**, unchanged. 1,830 discovered native rows are a *catalog*, not permissions or delivery count.
- Existing trusted installed-tool Browser Host: `src/platform/chrome/context-menus.js`; sender, document, packageHash, installEpoch, explicit permissions and one-shot click remain authoritative.
- First-party bookmark tree: `src/bookmark-manager/service.js`, **not** the installed-tool Browser SDK.
- `browser.bookmarks.create` currently returns opaque owned ref; cannot be represented as Chrome-native create without renaming and consumer migration. Full-bookmark access cannot piggyback on `browser.bookmarks` owned capability.
- No additional branches or worktrees. Target independent files only; check current file blob and main before writing.

## Implemented source slice

- `src/framework/sdk/browser.js`: generate the finite, deep-frozen public method tree from approved `BROWSER_OPERATIONS`; preserve current `network.watch` composite, clipboard positional convenience, local Page SDK discovery/denial and all existing Host operation strings. Commit `72b0f59345c4d57945a88d7a61908f0b7e6ed750`.
- `tests/environment/browser-sdk-r11-declarative.test.mjs`: approved method, namespace denial, exact request argument and Page isolation tests. Commit `0efdb5e1bd6d5503d3dead62488582805f8ba80d`.
- This is **not** yet the full declarative Host adapter or full bookmarks SDK; do not mark P0 accepted.

## Validation and evidence (this R11 source slice)

- Node: **NOT_TESTED locally** — GitHub interface has no Node execution; GitHub CI still pending when checked.
- Build: **NOT_TESTED locally** — same limitation; pending CI is separate.
- GitHub CI: **IN_PROGRESS** for `0efdb5e1` at https://github.com/shopable-ai/opendesk-browser/actions/runs/38578029413 and https://github.com/shopable-ai/opendesk-browser/actions/runs/38578029427.
- Mac real Chrome: **NOT_TESTED**; same-source candidate/extension id/installed package/permissions/real gesture and native receipt not collected.
- Prior unrelated global regression at https://github.com/shopable-ai/opendesk-browser/actions/runs/38577935799 failed `static import review ... explicit approval`. No evidence the SDK facade caused that failure. Never attribute/waive without logs and change analysis.

## Remaining

Finish finite approved Host Binding dispatcher with no raw `chrome[namespace][method]`, full bookmark service authorization/methods after independent capability and consent, matrix contract coordination, P0 Node/Build/CI and real Chrome acceptance. Do not alter evidence PASS counts without same candidate provenance.
