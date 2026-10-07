# Controller campaigns — implemented, native pending

Writer scope: only `tests/framework/k5-controller-product-native.mjs`, its optional campaign helper, and this note. All product source, frozen contracts, ledger and raw failures remain unchanged.

## Product observation gap for parent writer

The current tool document does not expose RunHost/host-client/controller/artifact lifecycle counts. CDP can observe actual Worker targets and IDB retirement, but cannot count pending requests, timers, subscriptions, runtime ports or live Blob registrations from those facts. SDK diagnostics cover only their local SDK collections. These missing counts must not become invented zeroes.

The campaign implementation will read the parent-owned product's read-only `globalThis.OpenDeskResourceDiagnostics.snapshot()` from the actual tool document. Required output is `{pending,timers,subscriptions,ports,workers,blobs}` with six finite nonnegative integer counts backed by existing lifecycle collections/handles. The native runner also independently checks physical Worker inventory. Absence or incomplete output yields NOT_TESTED and stops dependent campaigns before a PASS claim. This hook is a proposed integration point, not a claim that it already exists. Parent should connect the actual product lifecycle reads before freezing or deliver another existing exact read expression.

## Changes

`tests/framework/k5-controller-product-native.mjs` retains the frozen full 27-case list and all case operations/assertions. `--campaigns` is explicit and always requests the original 1000/10/2 counts; reductions such as `--campaigns=10` and combining it with the unrelated `--single` diagnostic are rejected. Existing `--cases` continues to name only existing cases, with existing prerequisites, without claiming that unselected required cases passed. Campaigns run after selected-case prerequisites. Failure or a missing observation stops dependent rounds and subsequent browser environments.

The small `k5-controller-native-campaigns.mjs` helper schedules evidence, not product execution. It delegates all product effects to the existing runner's real trusted UI, exact document selection, saved revision, RunHost, Worker, original broker/IDB and native CDP helpers. It has no alternate extension, fake sender, synthetic callback, injected timer, monkeypatch, changed permission/CSP or new profile.

* Mixed: 200 each of success, throw, original 30-second product timeout, real UI cancel, and exact native navigation. Each occurrence saves its own revision/params, original run/result/journal, target selection, Worker creation/destruction events and native target inventories. Successful `page.title()` equals that precise document's native title. Throw marker, typed error, immutable source hash, unique run/result/physical Worker IDs, released retirement and slot, borrowed target survival and no late click admission/effect are checked.
* Reconnect: five host rounds and five SW rounds. Host closure interrupts a genuinely dispatched wait; a new actual tool document reads that terminal and runs a fresh successful Worker. SW rounds identify the exact extension target and native ServiceWorker version, stop that version, require the real destroyed event/absence while the host survives, reopen a tool in the same owned PID/profile, observe a distinct recovered SW target, read the original durable outcome and execute a fresh successful Worker. No process termination or replacement profile is used.
* Plugin disabled: two rounds check the actual tool's `MODULE_NOT_INSTALLED` status, empty template/row/seal stores and fully retired controllers; install/reinject the fixed SDK into a separate exact page, await real Hello, call the old `OpenDeskSDK.AppLocal` Promise set/get/remove chain, verify three original durable broker operations and their run/result association, compare the actual caller value with the original GET receipt, then execute ordinary JS successfully. The fixed SDK is initially installed before numerical baseline capture, so reinjection must not add another long-lived port/listener.

All six actual counts are checked against the initial campaign baseline before **every** occurrence and after its retirement; per-round equality alone cannot hide growth between rounds. Physical native Worker inventory independently agrees with the product count. Missing/invalid counts yield NOT_TESTED, not PASS. No zeroes are synthesized.

For long campaigns, the existing read-only IDB snapshot helper has an optional filter: campaigns transfer only the selected script or actual run/result/journal rows, while original case callers retain the full snapshot. Cursor observations remain real and the filter is recorded. No product database/schema is introduced or changed.

## Evidence produced when actually run

The original runner's timestamp/UUID evidence directory contains `production-138/campaigns/` (and the actual other environment). Each occurrence has its own JSON file with a `/round` pointer, fresh round/session IDs, start/end monotonic times and complete actual input/result. Checkpoints are persisted before admission and before/after native fences so an interrupted occurrence remains unfinished. The final reference SHA covers the final bytes of that occurrence file. No prior raw failure is modified or reused.

`campaigns/manifest.json` records requested counts, observed IDs, statuses, baseline and remaining NOT_TESTED rounds after failure. `campaigns-production-results.json` merges only real observations of the same campaign ID from distinct real environments; development is kept in its own file. These additional IDs are never substituted for original mandatory case IDs. Package/source drift fields are finalized only after the existing after-input/package/ZIP checks. The final acceptance flag remains false and this implementation does not modify the ledger, contracts, gates or owner.

## Short run instructions for parent

After all product functions including actual lifecycle reads are connected, freeze/build/pack the candidate serially, refresh the existing runner qualification and its Main exclusive-window rebuild receipt, then run from `/Users/shopme/Documents/workspace/opendesk-browser`:

```sh
node tests/framework/k5-controller-product-native.mjs --native --headed --mode=production --chrome=all --campaigns --rebuild-receipt=<fresh-receipt-path>
```

The existing global launcher, exact binary/version checks, owned PID/profile, native UI-assist path and cleanup lifecycle remain in force. The 200 timeout rounds per environment use the original product deadline; no accelerated or substitute timing is used. Expect real execution time accordingly.

Expected: 1000 mixed + 10 reconnect + 2 plugin-disabled distinct successful occurrences per actual production environment, real six-count numerical baseline restoration, final package/input/ZIP identity unchanged, native launcher cleanup complete. Actual: **not executed**; no native results/screenshots or package acceptance were claimed. Missing current product observation is precisely the hook described above.

## Contract bindings read, unchanged

`verify-product-acceptance.mjs` requires campaign names `mixed`, `reconnect`, `pluginDisabled`, distinct result IDs and unique `(environment,session,round)` and `(environment,evidence SHA,pointer)` occurrences, every declared real environment, original evidence hashes and six integer cleanup counts. The same final production package and original mandatory-case closure remain required.

Read specification SHA: `9ccdc5995b89005661dabf62f39b63563c2cbce6e34c37c7e0879b2831febb4d`.
Read ledger SHA: `fac9504ca84772d9d699f9f3c8d19c5b39b001cd69327779935f0a93be83ab28`.
Original denominators remain 603 + 19. Explicit count-bearing required cases read include `RESOURCE01-LOAD-CLEANUP`, `LEAK01.F006.ChromeBridgeEvents`, and `LEAK01.SDK.lifecycle`; each is still not-tested in the ledger. This scheduling addition alone does not close their other resource-load/error, callback/repeated-reply, SDK lifecycle or plugin enable/register/disable semantics. Parent must retain the respective original acceptance observations; campaign IDs cannot replace those required case records.

## Verification and cleanup

Only `node --check tests/framework/k5-controller-product-native.mjs` and `node --check tests/framework/k5-controller-native-campaigns.mjs` were executed, both exit 0. No build, package, browser, native or full-suite test was started. No PID/profile/server/operation was created to clean up. Native status: **implemented, pending verification**.

Implementation file SHAs after syntax checks:

* Native runner: `7d33fe2f117d6d5a3a7bb8ae696bb9d854931f7993554118acb1f28efae6f413`.
* Campaign helper: `fc22f76baf2e315799f5c00b5785ba335c7bd69d8824d3ce37c8aa0f20ba2920`.

These are source/verification-file identities, not product package or ZIP identities. The helper is included in the runner's source fingerprint and the existing verification-input closure; a fresh receipt is required.
