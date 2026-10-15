# ChatGPT Mind Map R2 — execution record

Date: 2026-10-15. Owner: Codex session 1879cafa65a4. Status: SOURCE_MIGRATED / RELEASE_BLOCKED. Probe resources released.
Branch: main. Base: 8dc346e0432e11115862b39614b2d46a04f5cebb.
Reference: shopable-ai/shopable-station@b76abf4b95e34c1234a33927051ea13165d92715 (read-only).

Scope: examples/programs/chatgpt-mindmap/{src,assets,tests,package.json,README.zh-CN.md};
tests/environment/chatgpt-mindmap-r1.test.mjs; tests/fixtures/chatgpt-mindmap.html;
tests/framework/chatgpt-mindmap-xmind-probe.mjs; this workstream and its own evidence directory.
No shared host/runtime/CSP/library/permission contract is changed before feasibility is demonstrated.
No other program, global ledger or historical receipt is rewritten.

Environment: separate Linux checkout of main, no access to user Mac path or its Chrome/Native Host.
No shared dist/development watcher or profile used. Program builds use checkout-local artifacts only.
Resources: reference assets in session scratch; browser probes use an independent ephemeral profile and loopback port.
Prior R1 tests cover the wrong SVG engine and cannot establish XMind acceptance.

Initial audit: fixed four assets total 4,042,573 bytes. Git blob identities verified.
VM with string code generation disabled can execute real Workbook/Topic/Dumper;
static new Function/eval occurrences alone are not proof that the read-only path fails CSP.
At the initial audit, Snowbrush rendering, license provenance, resource admission, installation and ChatGPT were unverified. Final results follow.

## Final changes and verification

The actual fixed SDK ran in independent Linux Chromium 149.0.7827.0 with
`script-src 'self'`, no unsafe-eval or web-security/CSP bypass. This is a local
test document, not an extension USER_SCRIPT install, ChatGPT MAIN injection,
Mac Chrome or CFT acceptance. The normal CFT download returned an invalid
archive; a scratch-only Chromium package was used. No product dependency changed.

Only the real XMind renderer remains. Deleted: `mindmap-renderer.js`,
`mindbank-xmind-theme.js`, `tests/layout.test.mjs`, `tests/xmind-theme.test.mjs`.
Removed old renderer CSS and obsolete product claims. Retained and fixed the
per-answer registry, adapter, HTML extraction and managed UI entry. Ported
original Workbook/Topic/Dumper/JSZip conversion, notes/path identity, skin,
staging mount, zoom/scroll, native branch controls and controller close.
Source files/blob SHAs are recorded in module headers and
`examples/programs/chatgpt-mindmap/tests/xmind-provenance.json`.

Vendor JS is not redistributed before its license/resource/isolation admission
is verified. `main()` refuses an unavailable runtime before modifying any DOM.
The existing shipped R1 revision is not silently upgraded or reinstalled.

The first probe established only fold-button state. A stronger assertion found
that the original SDK collapse action needs selection; its failure is preserved
as `prior-fold-assertion-fail.json` (earlier source, not this final candidate).
The adapter now uses original Workbook branch flags for all-branch folding.
The final probe waits for operation completion and counts visible topics,
including collapsed DOM that the SDK retains: **8 → 2 → 8**.

Raw evidence and source bindings:
[manifest.json](evidence/chatgpt-mindmap-r2-1879cafa65a4/manifest.json).

| Command / verification | Result | Evidence level |
| --- | --- | --- |
| node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap | PASS | AUTHORING_VALID_NOT_PACKAGED |
| node --test tests/environment/chatgpt-mindmap-r1.test.mjs | PASS 10, SKIP 3 | Missing real SDK is explicitly NOT_TESTED |
| XMIND_REFERENCE_DIR=<fixed assets> with the same Node command | PASS 13/13 | Actual Workbook/Topic/Dumper/JSZip; string code generation disabled |
| npm run build:program -- examples/programs/chatgpt-mindmap | PASS | BUILT_UNVERIFIED; installable:false |
| npm run check | PASS | Static/source contracts; see check.log |
| tests/framework/chatgpt-mindmap-xmind-probe.mjs | PASS 15 | Local real SDK fixture only |
| Controller cleanup | PASS in fixture | 28 created/28 closed; 0 owned UI; originals restored; separate late-init close 1/1 |
| Current extension / actual ChatGPT / Mac | NOT_TESTED | No extension ID, Native Host or authorized current target available |
| Source → Build → Candidate → Verification → Available → Installed | BLOCKED after Build | No verification/install receipts |
| Visual comparison with original Mindbank page | NOT_PASSED | Missing CJK fonts, fit/position/cropping issues; no actual reference-page screenshot |

Product JS modules: **41,037 B**; CSS: **2,573 B**. Compiled program: **44,322 B**,
SHA-256 `45ab0cd685da4158e4b7cebcd858969d90291b1606efd69135cbf5550819e808`.
Build directory:
`artifacts/programs/opendesk.chatgpt-mindmap/0.2.0/r31-production/45ab0cd685da4158-2f325af8d196/`.
The **4,042,573 B** upstream runtime is excluded, not counted as a small complete
installation. All four raw asset hashes and sizes are in the evidence.

## Independent acceptance dimensions

No independent expert review was performed. Each score is NOT_SCORED; a local
component test count cannot produce an honest 95+ product score.

| Dimension | Score | Current evidence / missing requirement |
| --- | --- | --- |
| XMind authenticity | NOT_SCORED | Actual SDK fixture PASS; installed USER_SCRIPT unverified |
| Visual quality | NOT_SCORED | Screenshot failures; original Mindbank comparison missing |
| Content correctness | NOT_SCORED | Semantic + real Workbook tests PASS; live ChatGPT untested |
| Per-answer isolation | NOT_SCORED | Six-answer fixture PASS; current ChatGPT versions untested |
| Interaction | NOT_SCORED | Real zoom/fold/fullscreen PASS; fit/notes/gestures still open |
| Code quality | NOT_SCORED | Old renderer removed; independent review missing |
| Security/privacy | NOT_SCORED | Fixed hashes; no external request in fixture; resource/license/style admission blocked |
| Performance/lifecycle | NOT_SCORED | All controllers close; shared global SDK styles remain; memory/BFCache untested |
| Formal installation | NOT_SCORED | Source/Build only |
| Native verification | NOT_SCORED | No current extension/ChatGPT/Mac evidence |

## Blocking facts and next work

1. Match the exact Snowbrush/SDK/polyfill and their transitive licenses to
   distribution provenance. The SDK and viewer-wrapper official MIT licenses
   do not by themselves identify this merged Snowbrush binary. Checked primary
   sources: https://github.com/xmindltd/xmind-sdk-js/blob/master/LICENSE and
   https://github.com/xmindltd/xmind-viewer/blob/master/LICENSE. This is an
   unresolved provenance gap, not a claim that redistribution is prohibited.
2. Existing source/assets/optional-library budgets do not admit this runtime.
   Real probing also shows global stylesheet insertion; 6 style nodes remain
   after every controller closes (including the fixture's baseline style).
   Validate the smallest local fixed-resource/drawing isolation extension of
   the existing framework before modifying its public contracts. No second
   loader, permission system, iframe/RPC framework or expanded CSP was added.
3. Resolve fit/resize, scoped styling, note UI and native interactions. Then
   verify the same candidate through Page Authority on real authorized ChatGPT,
   including installation, auto-run, revoke/uninstall and BFCache. Keep the
   missing-runtime guard until actual resource admission exists; never restore SVG.

Remote parallel changes through `ecd1d64316c7df55a8b5953f3b17be2972386b96` were
fast-forwarded on main after confirming no task path overlap. Other Bookmark
and AI VIP Share changes remain intact. Integration uses the exact remote head
and a non-force lease. No shared watcher/dist/profile or user Mac source changed.
Each browser probe closed its browser and ephemeral server in finally.
