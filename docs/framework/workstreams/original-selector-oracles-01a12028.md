# Original Selector Oracles 01a12028

Status: review rejected; unsupported host selector cases restored to unroutable.

Branch: `agent/original-selector-oracles-01a12028`

Worktree: `/Users/shopme/.codex/worktrees/native-api-oracles-1009/opendesk-browser`

## Correction

Main-thread review found the previous local driver exceeded the frozen contract:

- `f3-api48-cases.mjs` keeps `CMP02-API12-OK` and `CMP02-API13-OK` as `body:null` because the approved host DOM branch has no shipped host ctx consumer.
- `CMP02-API12-ERR` and `CMP02-API13-ERR` also retain gaps because Worker execution hits DOM context preflight before the original host selector-error branch.
- The prior custom `selectorCases` body override changed the contract boundary by replacing the host DOM path with Worker-returned plain `{outerHTML}` values.

The correction withdraws those four drivers from the original native runner. They remain unsupported/unroutable until a legitimate shipped host ctx consumer exists in product scope. This branch does not add such a consumer, does not expand `ChromePage`, and does not edit product code or frozen recipes.

## Current Behavior

- `CMP02-API12-OK`, `CMP02-API12-ERR`, `CMP02-API13-OK`, and `CMP02-API13-ERR` are not in `ORIGINAL_SELECTOR_READ_IDS` or `ORIGINAL_READ_IDS`.
- `originalReadPlan(...)` rejects all four with `Original case has no complete native input/oracle driver`.
- Regression verifies the frozen recipe gaps:
  - OK cases: `body:null` and `no shipped host ctx consumer`.
  - ERR cases: `DOM context preflight` gap.
- Worker `snapshot()` / `snapshots()` LIMIT cases remain available only as LIMIT drivers and cannot count as `$` / `$$` support.

## Preserved Attempt Logs

The five local attempt logs are intentionally preserved under `docs/framework/workstreams/evidence/original-selector-oracles-01a12028/`:

- `regression-before.log` — pre-change baseline after `npm ci --ignore-scripts`.
- `regression-after-attempt1.log` — intermediate failing attempt.
- `regression-after-attempt2.log` — intermediate passing attempt for the now-rejected driver.
- `regression-after.log` — prior passing attempt for the now-rejected driver.
- `targeted-neighbor.log` — prior neighbor test attempt for the now-rejected driver.

These logs are trace evidence only. They do not establish support or native PASS for API12/API13 OK/ERR.

## Verification After Correction

- `node --test tests/framework/k5-controller-product-native-original-cases.test.mjs`
  - Result: PASS 36/36 after correction.
  - Log: `docs/framework/workstreams/evidence/original-selector-oracles-01a12028/correction-regression.log`
  - SHA-256: `151a4546d9c44d30236ab9478cec3580e63b6cbda87be64a6d72fc935056378b`

- `node --test tests/framework/f3-api48-cases.test.mjs tests/framework/k5-controller-product-native-original-cases.test.mjs tests/framework/k5-controller-script-fence.test.mjs`
  - Result: PASS 78/78 after correction.
  - Log: `docs/framework/workstreams/evidence/original-selector-oracles-01a12028/correction-targeted-neighbor.log`
  - SHA-256: `459ae9a0015c976c571af5fb3accc0c53f6a72999e96bf223139b3beb14bb04d`

## Bounded Follow-Up Candidates

Possible future work should target original cases whose frozen recipes already have complete non-gap bodies and shipped consumers. Do not use this branch to widen `ChromePage` or create a host DOM selector channel.
