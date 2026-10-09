# Original Selector Oracles 01a12028

Status: component/native-runner oracle slice complete; real CFT execution not run in this worktree.

Branch: `agent/original-selector-oracles-01a12028`

Worktree: `/Users/shopme/.codex/worktrees/native-api-oracles-1009/opendesk-browser`

## Scope

- Added native original-case drivers for `CMP02-API12-OK`, `CMP02-API12-ERR`, `CMP02-API13-OK`, and `CMP02-API13-ERR`.
- Kept product code, source recipes in `f3-api48-cases.mjs`, expected spec, denominator, and acceptance ledger unchanged.
- Used the existing original selector A/B fixture family.
- Did not start Chrome, Native, CFT, servers, ports, full build, or full acceptance.

## Behavior Covered

- `page.$('#marker')` returns a detached serializable snapshot and `page.$('#absent')` returns `null`.
- `page.$$('.item')` returns detached serializable snapshots in document order and `page.$$('.absent')` returns `[]`.
- Mutating returned snapshots does not change the original A page; the oracle verifies this through `$eval` / `$$eval`.
- Invalid selector `[` rejects with `E_SELECTOR_INVALID`.
- The oracle rejects fake live DOM payloads, missing native completions, wrong absent values, changed A/B pages, changed error codes, and resource cleanup drift.

## Evidence

- `docs/framework/workstreams/evidence/original-selector-oracles-01a12028/regression-before.log`
  - Command: `node --test tests/framework/k5-controller-product-native-original-cases.test.mjs`
  - Result: PASS, 35/35 before implementation after `npm ci --ignore-scripts`
  - SHA-256: `e11159eb3ff4a8e354aa38014a1f039692dbe480ac97b22cc5975b914cda3b0d`

- `docs/framework/workstreams/evidence/original-selector-oracles-01a12028/regression-after.log`
  - Command: `node --test tests/framework/k5-controller-product-native-original-cases.test.mjs`
  - Result: PASS, 36/36 after implementation
  - SHA-256: `e5f4c0b535612c9c98f231d80f1eb5d316a782c23465489a8a862683a549435a`

- `docs/framework/workstreams/evidence/original-selector-oracles-01a12028/targeted-neighbor.log`
  - Command: `node --test tests/framework/f3-api48-cases.test.mjs tests/framework/k5-controller-product-native-original-cases.test.mjs tests/framework/k5-controller-script-fence.test.mjs`
  - Result: PASS, 78/78
  - SHA-256: `3affc13598030836faa43c5312ee1b74be278693f96cde417b39b0efa96684ee`

## Remaining Native Items

Real CFT/native execution remains for the main runner owner. Exact runnable command for this slice:

```sh
node tests/framework/k5-controller-product-native.mjs \
  --native --headed --native-ui-assist \
  --mode=production --chrome=138 \
  --original-api48=CMP02-API12-OK,CMP02-API12-ERR,CMP02-API13-OK,CMP02-API13-ERR \
  --permission-timeout=120000
```

This work does not mark those cases as native PASS. It only connects and verifies the local original-case driver/oracle layer.
