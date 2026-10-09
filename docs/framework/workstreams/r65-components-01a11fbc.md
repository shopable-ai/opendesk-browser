# R6.5 component fixes 01a11fbc

Status: PASS for the targeted component failure set.

Branch: `agent/r65-component-fixes-01a11fbc`
Baseline: `0fd383ec69a136ed81b0ff46fd007537384684b6`
Recorded: `2026-10-09T08:53:11Z`

Scope:
- Fixed stale component fixtures and observer selectors for the 12 reported R6.5 failures.
- Did not change product security contracts, permissions, CSP, 320 KiB build policy, denominator, receipts, native effects, or global ledgers.
- Did not build shared dist, push, create a remote branch, or edit the main checkout.

Dist input:
- Copied read-only `/Users/shopme/Documents/workspace/opendesk-browser-r65-01a11fbc/source/dist` into this worktree's ignored `dist/` for package/B05 component tests.
- Relative file-list digest for copied `dist/`: `5384cfaa2e542ed6b3ddca1f05cb03c5fcdbc9a18ea42c891443893e5909feb9`.
- Relative file-list digest for source `dist/`: `5384cfaa2e542ed6b3ddca1f05cb03c5fcdbc9a18ea42c891443893e5909feb9`.

Fixes:
- `tests/foundation/storage.test.mjs`: SDK storage fixtures now model an active Chrome document frame and keep the stale-document negative after revoke.
- `tests/framework/schema-compaction.test.mjs`: VM execution now supplies browser-compatible `atob` plus `TextDecoder` for compacted schema unpacking.
- `tests/framework/k5-package-four-service-resources.test.mjs`: synthetic package fixture now includes current approved manifest HTML entries and file counts.
- `tests/framework/k5-package.test.mjs`: package assertions now match current approved HTML scan surface, development maps, and optional-host rejection message.
- `tests/framework/b05-product-acceptance-20261003.mjs`: frozen absolute manifest paths map to the current worktree, and CP4 discovery accepts the current unique positive `settleSdkDelivery` AST shape without relocating to a neighboring offset.

Verification:
- `node --test tests/foundation/storage.test.mjs tests/framework/schema-compaction.test.mjs tests/framework/k5-package-four-service-resources.test.mjs tests/framework/k5-package.test.mjs tests/framework/b05-native-observers.test.mjs` -> PASS, 99/99.
- `npm run check` -> PASS, `Syntax checked 175 source/test/build files; scripts/build-contract.mjs entries, fixed SDK/control entries, strict CSP and original MIT checked`.

Not tested:
- No shared dist build.
- No Chrome/native/F3/ZIP acceptance.
- No push or PR creation.
