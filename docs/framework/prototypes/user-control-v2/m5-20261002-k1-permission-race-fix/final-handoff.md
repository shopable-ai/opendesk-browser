K1 control replacement frozen for independent union review.

Effective round6 plan hash: da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1
Final source hash: 4666d1e0275ee69e82ab9e0c713260df201a717a359fd6efca4dbc55af91cfd5

Both full native matrices: 56 PASS / 0 FAIL; same source, fresh profiles, exact 138.0.7204.183 and 154.0.8037.92.

- [Chrome/138.0.7204.183 full report](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/evidence/m5-round6-138-owner-guard-final-2026-10-02T21-50-45.267Z/report.json)
- [Chrome/154.0.8037.92 full report](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/evidence/m5-round6-154-owner-guard-final-2026-10-02T21-50-45.267Z/report.json)

CR-F1-CTRL-001: request entry captures immutable run/host/sandbox/target identity. The original owner is rechecked after permission awaits and before tabs/scripting effects; stopped operations cannot acquire a new run/tab. Ten continuation regressions per version cover goto/click under stop, deadline, host-close, new run and new target, with zero raw server effects through browser exit and genuine positive recovery. The reviewer-derived native pending-promise probe additionally confirms request -> legal stop -> actual native permission result, zero tabs.update dispatch/server requests, and a later genuine run on both versions. Official independent closure remains pending.

CR-F1-CTRL-002: all 20 outcome rounds now load their original actual Blob before revoke and fail that same URL after revoke in its creating opaque realm before teardown; each exact Worker is independently destroyed/absent and resources return to baseline. All five cancel/five timeout rounds record real pageWaits=1/pending=1/timer=1 before trigger, then zero.

Changed source: fixture/host.js, fixture/sandbox.html, run-native.mjs, run.mjs. Backend, permissions and 3s oracle are unchanged. Physical loop proofs still record the old 2s STOP/DEADLINE FAIL diagnostics. No loop Worker or creator inspector is attached.

[12-contract mapping](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prototypes/user-control-v2/m5-20261002-k1-permission-race-fix/final-contract-mapping.json), [full matrix](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prototypes/user-control-v2/m5-20261002-k1-permission-race-fix/final-matrix.json), [blocker closure evidence](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prototypes/user-control-v2/m5-20261002-k1-permission-race-fix/blocker-closure-evidence.json), [cleanup audit](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prototypes/user-control-v2/m5-20261002-k1-permission-race-fix/final-cleanup-audit.json), [source manifest](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prototypes/user-control-v2/m5-20261002-k1-permission-race-fix/final-source-manifest.json), [evidence manifest](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prototypes/user-control-v2/m5-20261002-k1-permission-race-fix/final-evidence-manifest.json).

173 prior artifacts, original 711f/46 PASS exports, round4 failures and original independent HIGH/counter report bytes remain unchanged. Intermediate fb58 matrix/probe and the early HOST-CLOSE sampling failure are retained as separate evidence, not final qualification. All five native run browser groups are gone (exit0); local servers closed; final host resources/Worker sets zero; borrowed sentinel survived adapter disposal. Probe profiles were removed, evidence browser profiles retained.

Five page contracts and page dimensions of VERSION-MATRIX are explicitly mapped to the other lane, not claimed by K1. Headless native UI/permissions grant state is saved. Author evidence does not qualify the union or product migration: backendPrototypePassed=false; F2=false; independent review required. No product/public gate/shared browser files were changed.
