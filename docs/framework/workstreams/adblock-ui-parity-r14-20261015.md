# AdBlock UI / Preview Parity R1.4 — 2026-10-15

## Scope and ownership
- Target: `examples/sidebar-tools/adblock/` and existing Side Panel preview adapter. Branch: `main` only; no branch/worktree/PR/force push.
- This workstream owns its own record, AdBlock UI sources, AdBlock preview adapter, focused tests, and a narrowly scoped native AdBlock CSS section in `src/ui/tool-shell.css`. Shared preview-builder integration/lock will be reviewed against current `main` before editing. Do not edit AdBlock trusted Chrome/DNR service or permission authority, existing R1.3 workstream, or other agents' files.
- Reason: `adblock-r1-interactive-preview.html` showed bespoke cards, settings page and synthetic switches, while real product has trusted `createAdblockPermissionControls()` and a separate sandboxed exception list.
- UI acceptance: no logo, description, synthetic request count, fake rule controls or duplicate title. Trusted global and current-site toggles and sandbox exception list must remain separate. Preview must use compiled installable package HTML/CSS/JS, real Side Panel shell, and read-only trusted DOM snapshots from fixed host source, with offline in-memory mock calls.
- Evidence grades: static parity / Node / CI / native installed Chrome are separate. Missing native screenshots + computed-style comparison remain NOT_TESTED, not 95+ PASS.

## Execution ledger
- SOURCE_READ: root AGENTS, official UI design and preview contracts, actual AdBlock package and trusted host controls reviewed.
- INITIAL_DEFECT_CONFIRMED: static preview only is a visual simulation; actual trusted host uses labeled state buttons and iframe has just the exception list. Old preview cannot prove parity.
- IMPLEMENTATION: IN_PROGRESS.
- NODE: NOT_TESTED; CI: NOT_TESTED; NATIVE_MAC: NOT_TESTED; PRODUCT_SCORE: NOT_SCORED.

## Targeted verification
```sh
node scripts/preview/build-preview.mjs --tool adblock --surface side-panel --scenario success --theme light --width 360 --out examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html
node --test tests/environment/adblock-preview-contract.test.mjs tests/environment/sidebar-preview-shell.test.mjs tests/environment/adblock-r12.test.mjs
node scripts/preview/check-preview-contract.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/adblock
```
Re-review and refresh source locks only after auditing all shared-template and adapter edits. Do not treat CLI/CI success as actual Chrome blocking or installed UI validation.

## R1.5 verified repair lane — 2026-10-15

- Ownership: R1.4 workstream, AdBlock preview-only host simulator, preview-only SDK mock, shared preview builder's AdBlock initial height, focused regression, and exact Quick Notes preview source lock. No changes to privileged DNR service/authority, install pipeline, other tools' business sources, or public SDK.
- Read source and raw failures: preview CI [38734108278](https://github.com/shopable-ai/opendesk-browser/actions/runs/38734108278) fails on a stale `scripts/templates/sidebar-tool-preview-shell.html` input; `scripts/preview/build-preview.mjs` is also stale in the same lock. Of the reviewed text inputs, all others match; the Quick Notes binary asset SHA is untouched. AdBlock CI [38734107866](https://github.com/shopable-ai/opendesk-browser/actions/runs/38734107866) reports 63 PASS / 10 FAIL involving first DNR grant, storage.session fence, error handling and cleanup; native Chrome job is SKIPPED.
- Preview root cause: unlike the trusted host's restart-required state, an initial offline DNR grant immediately enabled its simulated filtering. Standalone preview initially rendered its iframe at 140px even though the real host's source initializes at 220px. Offline child exception messages could modify the parent exception count without a confirmed restore interaction.
- Targeted fix: first grant now enters a disabled, source-derived `restart` snapshot and cannot enable filtering by repeated clicks. Granted/restart/rule-readback state stays synchronized with the iframe mock. Restore updates the visible list only after an explicitly accepted, matching requestId response. Reject malformed/non-opaque simulated iframe messages. Match production initial iframe height (220px) and bounded resize policy (140–1600px). These mock changes neither grant Chrome permission nor claim real DNR/network effects.
- Shared source lock: inspected template/preview builder and the stored lock; refreshed only the two mismatched blob hashes, preserving the source-lock gate and all original assertions. Added VM regression for grant→restart and origin/height acceptance, plus receipt and height source assertions.
- Required checks after source commit: `node scripts/preview/check-preview-contract.mjs`, `node --test tests/environment/adblock-preview-contract.test.mjs tests/environment/sidebar-preview-shell.test.mjs`, preview generator and browser run, AdBlock focused tests, official tool build. Pending CI logs must be bound to the exact candidate, not projected as PASS.
- Dependency still open: the R1.2 DNR service has no demonstrated, passing session fence implementation at the audited revision; its native tests need fixing by the owning AdBlock service task, without weakening failure-closed security. This preview-only fix does not close it.
- Product parity closure still open: side-by-side installed Chrome screenshot, DOM/style diff, manual switch/exception interactions, actual network DNR proof, browser restart, permission revoke and macOS native acceptance: NOT_TESTED. Product rating NOT_SCORED, no claim of 95+.
- The checked-in `adblock-r1-interactive-preview.html` remains a generated artifact and must be synchronized with the source change separately, not edited as independent business HTML.

## R1.5 continuation: Chrome preview runtime gate (2026-10-15)

### Source and CI evidence (do not conflate grades)
- Confirmed [preview run 38738334560](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738334560) PASS, including canonical lock/determinism, 73 Node tests, official preview package generation, Quick Notes headless Chrome 13 cases, and Bookmark Manager browser mock compatibility. Subsequent preview runs 38739239205 and 38739266378 also passed on their recorded heads. This is a static/offline preview grade, **not** installed AdBlock Chrome or real DNR.
- Audited and corrected an additional existing UI test race: the native HTML dialog dispatches `close` asynchronously. `scripts/tests/sidebar-preview-runtime-chrome.mjs` now waits up to a bounded interval for the **same strict requirement** (dialog closed AND focus returned to the unload button). No assertion or test suite was deleted.
- Added `scripts/tests/adblock-preview-chrome.mjs` and the matching existing `.github/workflows/sidebar-preview-contract.yml` step: exercise the source-built AdBlock host switches, sandbox exception list, confirmation/cancel/receipt, malicious text, fail-closed states, source CSS widths, and capture per-state Chrome screenshots/JSON. The exact output is **offline preview** with no Chrome permission or network effects.
- Initial CDP headless attempts at sandbox real pointer/keyboard inputs (runs 38741460880 through 38743424522) did not produce a valid iframe user activation: the sandbox was an opaque out-of-process iframe; observed pointer delivery could target the frame's HTML rather than its restore button. A DOM-triggered package click is now used **solely for offline message-flow tests** and is explicitly named/recorded `DOM_SIMULATION_NOT_TRUSTED`. It must never be counted as `NATIVE_CHROME_PASS`, real gesture PASS, or actual DNR. The true user-gesture acceptance remains open.
- Rechecked Quick Notes source-lock text inputs after the independent localization work changed `scripts/build-sidebar-tool.mjs`. Its diff adds an opt-in compile-time locale resource and marker, with no unlocalized AdBlock tool-package path change. Updated only the new reviewed packer Git blob in `contracts/ui-preview/quick-notes.lock.json`; all other 12 text inputs matched. Lock validation was not disabled.
- At the time of this entry, the source candidate `6e28ce6fa7e0fe34c62774118224ae04375840cb` has [preview CI run 38744415955](https://github.com/shopable-ai/opendesk-browser/actions/runs/38744415955) QUEUED; do not claim this later gate PASS until its same-SHA raw job has completed and been checked. Tests and runtime scripts were updated incrementally on `main` only, without force push.
- `examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html` remains canonical output. The produced HTML matches source-bound production AdBlock tool package/host snapshots apart from source-revision metadata. No second business UI and no privileged Chrome code were introduced.

### Product dependency (unchanged)
- Native R1.2 AdBlock CI [38737778206](https://github.com/shopable-ai/opendesk-browser/actions/runs/38737778206) still showed 63 PASS / 10 FAIL before this continuation; the trusted service and DNR session-fence handling are owned by its separate service workstream. `trusted/service.js`, `trusted/rules.js`, native authority/permissions are **not** changed here. Source/browser mock grades cannot close those failures.
- Installed production candidate identity, same-candidate Side Panel screenshots and computed CSS vs preview, Chrome DNR network readback, full browser restart/permission revocation, and macOS native acceptance remain **NOT_TESTED**. No evidenced 95+ product score; all product-wide scores remain **NOT_SCORED**.

### Required gate to advance
1. Verify AdBlock DOM/message Chrome preview CI on its exact commit SHA; preserve any failures and screenshots.
2. Native service owner completes the session-fence/fail-closed tests, then obtains the same-candidate official package and macOS Chrome DNR/network proof.
3. Compare installed UI screenshot, DOM and computed CSS to `adblock-r1-interactive-preview.html`, test real mouse/keyboard and lifecycle. Only then consider independent 95+ scoring.
