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
