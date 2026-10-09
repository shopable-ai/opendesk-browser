# native-limit-oracles-01a12028

Branch: `agent/native-limit-oracles-01a12028`

Scope: add original-case driver/oracle coverage for three existing, gap-free frozen recipes without changing frozen recipe bodies, product source, dependencies, ChromePage, CFT, Native resources, shared ports, or `scripts/wxt-checkpoint.mjs`.

## Implemented

- `NAV01-API10-LIMIT` uses the frozen `reload({waitUntil:'networkidle0'})` recipe and expects `E_OPTION_UNSUPPORTED`.
- `NAV01-API11-LIMIT` uses the frozen `goto(params.nextURL,{referer:'x',waitUntil:'networkidle2'})` recipe with a same-origin HTTP `nextURL` parameter and expects `E_OPTION_UNSUPPORTED`.
- `CMP04-API28-OK` uses the frozen `screenshotInWebview()` recipe and expects `E_CAPABILITY_UNAVAILABLE`.
- All three require zero page/native dispatches beyond the observed Worker barrier service request and the frozen 350 ms wait preamble. The oracle checks the current run's complete `controller-operation` journal, not only a single method filter.
- Negative unit oracle coverage rejects extra dispatch, wrong error code, target drift, parameter drift, wrong result revision, and unreleased retirement.

## Evidence

- `docs/framework/evidence/native-limit-oracles-01a12028/node-check.log` — syntax checks for the modified files.
- `docs/framework/evidence/native-limit-oracles-01a12028/original-cases-test.log` — original-cases unit oracle test suite.
- `docs/framework/evidence/native-limit-oracles-01a12028/f3-api48-cases-test.log` — frozen recipe inventory neighbor test.
- `docs/framework/evidence/native-limit-oracles-01a12028/original-limit-plan-repro.json` — direct plan expansion for the three added original IDs.
- `docs/framework/evidence/native-limit-oracles-01a12028/runner-contract-check-blocked.log` — non-native runner contract-check attempt blocked before this lane by missing `tests/prototypes/user-control-v2/profiles/chrome-149-v2/extensions_crx_cache/metadata.json` in `scripts/wxt-checkpoint.mjs`.

## Status

No Native, CFT, HTTP service, shared port, or standard `43111` resource was started. These changes prepare the original-case runner and oracle only; they do not record native PASS.

Denominators remain frozen: original 603, API48 192. Connected original driver cases are now 26 for this driver catalog; the frozen spec/recipe denominator was not changed. This work does not address Host DOM gaps.

## Follow-up Review

Integration review initially suspected the runner observation omitted `params`. Recheck found the runner already passes `params: captured.params`, and `captureOriginalReadOutcome()` decodes `captured.params` from the durable `actual.run.paramsWire`; no runner observation change was needed.

The follow-up tightened the zero-dispatch oracle so it accepts exactly one observed barrier service operation and exactly one observed 350 ms preamble wait. Duplicate barrier, duplicate preamble, or any other queued operation is rejected. A regression test now proves the new NAV01-API11-LIMIT oracle accepts params decoded from `actual.run.paramsWire` and rejects a wrong decoded params value.
