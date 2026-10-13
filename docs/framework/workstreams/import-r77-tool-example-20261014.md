# R7.7 import-max-probe bounded sidecar

Owner: Codex executor sidecar, 2026-10-14. Branch: main. Parent owns Chrome installation and native verification.

2026-10-14 scope extension, explicitly authorized by user: sole writer for `tests/framework/page-import-fixed-tools-cft.mjs` (current diff empty before edit); add optional max/Classic branches without duplicating driver or changing default React/Vue. Add `examples/sidebar-tools/import-max-probe/classic/` with local mitt 3.0.1 UMD and ordered v2 assets. Continue no browser/shared dist/Git. Driver is the only newly allowed shared-file write. Parent will run controlled CFT serially. Current HEAD/input hashes will be rebound in evidence.

Write scope: `examples/sidebar-tools/import-max-probe/`, this record, and `docs/framework/workstreams/evidence/import-r77-20261014/tool-build/` only. No shared source, tests, dist, Git index/HEAD, browser/profile or ports. Existing unrelated working changes were inspected and preserved; assigned paths did not exist before work.

Resources: existing root node_modules/esbuild (read only); dedicated example `build/` output and dedicated evidence directory. No npm installation, watcher or extension build.

Plan: retain unmodified d3-array v3.2.4 raw GitHub max.js and ISC license with source SHA; compile local ESM using existing esbuild into Classic IIFE; package with existing build-sidebar-tool.mjs; validate package and execute its actual JS in a Node VM with a minimal tool root. Record exact input/output hashes. Real Chrome and visual evidence remain NOT_TESTED.

Success: formal zero-capability v1 JSON; `OpenDeskTool.root` result `#import-result` reads `Tool D3 max = 5`; offline runtime, no chrome/page capability calls or loader change; original third-party notice included in bundle.

## Initial bounded snapshot (before user-authorized driver extension)

- SOURCE_WIRED: local original `d3-array@3.2.4/src/max.js` + ISC license; local ESM source uses only OpenDeskTool.root. Config points to `build/tool.js`. This is d3-array 3.2.4, not historical full d3 3.2.4.
- BUILD_PASS: existing esbuild 0.28.2 compiled 1,884-byte Classic IIFE; existing formal packer validated zero-capability v1 JSON (3,070 bytes), installed:false. No extension build or dist output.
- NODE_PASS: formal JSON exactly matches current compiler output/source and canonical packer bytes; original ISC notice embedded; script parses as one IIFE; real default/accessor/null max behavior; actual bundled JS text and per-root execution counter; fresh Node context produces result again. VM root is a minimal model, not Chrome.
- NODE_PASS: existing `sidebar-tool-multiscript-r72.test.mjs`, 4 passed / 0 failed. Syntax checks for own JS/build/validator/bundle passed; scoped diff whitespace check passed. No shared tests edited.
- NOT_TESTED: actual import/install/open/reopen, opaque-origin enforcement, actual chrome/page availability, visual 360/400/600px, dark mode, keyboard, native inputs. Parent owns these; static CSS checks and Node global absence cannot close them.

Commands, from repo root:

```sh
node examples/sidebar-tools/import-max-probe/build.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/import-max-probe --out docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-max-probe.opendesk-tool.json
node examples/sidebar-tools/import-max-probe/validate.mjs docs/framework/workstreams/evidence/import-r77-20261014/tool-build/import-max-probe.opendesk-tool.json
node --test tests/environment/sidebar-tool-multiscript-r72.test.mjs
```

Evidence: [compile.json](evidence/import-r77-20261014/tool-build/compile.json), [package-build.json](evidence/import-r77-20261014/tool-build/package-build.json), [validation.json](evidence/import-r77-20261014/tool-build/validation.json), [multiscript-node.tap](evidence/import-r77-20261014/tool-build/multiscript-node.tap). Complete file/input SHA manifest: [manifest.json](evidence/import-r77-20261014/tool-build/manifest.json). Source HEAD is traceability only; current uncommitted input bytes are individually bound.

Key SHA-256 identities:

| Item | SHA-256 |
| --- | --- |
| Original max.js | `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d` |
| Original ISC LICENSE | `3e6849627f74ff73c257a3ae1efb574015d94fc1035c05ec3c15805165efcbc4` |
| Compiled build/tool.js | `7c4b6e1c3d5b84c0a459bf14689763e11f97bed38745321925c37eaa733c3cc9` |
| Formal import JSON | `33cd9930517aae6e27336b21852ae6474ddd7a098c8417546e4254eb93529519` |

## S10/v2 review and smallest native handoff

`scripts/build-sidebar-tool.mjs` already accepts v2 `files.dependencies` (ordered unique paths, at most eight); `src/ui/sidebar-tools/package.js` retains named original code/SHA assets; `src/sidebar-tools/bridge.js` checks each dependency hash immediately before that dependency loads and awaits each local Blob script load/error before main JS. Later hash failure does not roll back earlier evaluated assets; the existing tamper test covers the first asset. No new loader needed. Raw max.js is ESM, so it must be compiled before any Classic path. This single-IIFE example uses v1 and does not prove v2 native multiscript closure.

Testing reuse decision: AFFECTED_INPUTS for this new tool and new JSON; no prior package PASS inherited. Existing multi-Classic component mechanism is read and tested directly; historical native evidence remains at its original identity/level. Referenced R7 workstream `universal-dependency-file-first-r7-20261013.md` records D07 SOURCE_WIRED / TOOL_NATIVE_LIFECYCLE_NOT_CLOSED.

Parent should reuse `tests/framework/page-import-fixed-tools-cft.mjs` `setRealFileInput`, `importPackage`, `clickReal`, `openTool`, and frame observation methods. Its hardcoded React/Vue paths/SHA/capabilities and storage/note assertions require parent-owned adaptation to this exact package SHA, empty capabilities, #import-result and diagnostic observations. Use the real UI import/review/confirm/open path; verify no execution before active open, close frame via trusted back input, reopen with a new frame/session and result 5 / executions 1. Check actual environment text and candidate identity; capture native inputs/raw observation/screenshot. Do not run the driver unchanged as evidence for this tool, inject package into storage, call business JS from CDP, or modify the product loader. `sidebar-tools-native-probes.mjs` has legacy notes-specific selectors and assumes existing session evidence, so only its native input mechanics are reusable.

Full build, npm check, broad host regressions and native drivers were not run: this bounded sidecar changes no shared host/permission/schema files, and the user forbids shared dist/browser resources. Parent can apply shared verification to its final candidate after integration. Resource status: released (local build completed; no browser, profile, port, watcher or persistent process acquired). No git add/commit/push.

## Final extended handoff

User subsequently authorized the existing untracked `tests/framework/page-import-fixed-tools-cft.mjs` as an additional exclusive write file. Its original SHA is `2a2e672bc1fbea274be5a64a6fe31ad9c0530cabb16690d553fbac0f0b56f9bb`; [driver-original.mjs](evidence/import-r77-20261014/tool-build/driver-original.mjs) reconstructs and verifies those exact pre-edit bytes, and [driver-changes.patch](evidence/import-r77-20261014/tool-build/driver-changes.patch) makes this untracked-file change reviewable without touching Git. Final driver SHA: `e1a91f3338a84b92b27b3fa75ac0268920d88af2b752438514a4ca1fd4c2bd0a`.

Implemented the previously recommended adaptation directly in the same driver, retaining launcher, attach, trusted file-input/clicks, installed registry hash and actual SIDE_PANEL context validation. Optional `OPENDESK_IMPORT_MAX_TOOL_PACKAGE` / `OPENDESK_IMPORT_CLASSIC_TOOL_PACKAGE` bind file bytes before launch; when either is present, run only selected probes, otherwise the default React/Vue path remains. Probe runs do not require historical React/Vue package artifacts. `production-developer` candidate directories are accepted alongside `production`; both verify with explicit `{mode:'production'}` before/after and unchanged candidate packageHash.

Positive native driver checks (IMPLEMENTED_DRIVER, not run): no DOM/target iframe and no transient autoattached iframe during import/review/install; installed package exact SHA; trusted active open; #import-result result; actual opaque `globalThis.origin === 'null'`; actual `typeof chrome.tabs/page === 'undefined'`; UI diagnostics and per-frame execution count 1; trusted close + no iframe target residue; fresh target on reopen; trusted review/confirm uninstall while reopened frame is live + registry removal and no iframe residue. Phase screenshots and read-only frame/session observations are written. Before iframe scripts resume, CDP autoattach arms Network on child sessions; scoped HTTP/WS runtime requests are rejected and raw network observations retained. This observer is acceptance instrumentation, not a product loader. Native negative SHA/error/revocation/permission suite remains NOT_TESTED.

S10 Classic example uses original mitt@3.0.1 UMD (520 B, SHA `1b48d419d5c66d6c39a8a2e2cb69e797989c8cd934f17122abc35d766650a82f`) and original MIT LICENSE (1,069 B, SHA `1cab22f196264195a4caec8ca5630170fdde76ee8f43346e47021d087332d3b0`). v2 files.dependencies lists original UMD then src/second.js (SHA `cae10f60e4c94293b920963e11fa685becc501ec983e0f03b2a82df3941378d4`); main performs a real emitter subscription/emit and reports `Tool Classic mitt = 5`, order `mitt>second>main`, emits 1. No new loader, npm deps, Browser SDK/Host changes or shared dist. Full original MIT notice travels with main JS.

Final identities (use these packages for parent CFT, not the retained initial D3 JSON):

| Item | Bytes | SHA-256 |
| --- | --- | --- |
| D3 build/tool.js with added actual chrome.tabs diagnostic | 1,940 | `9ce4bc1690f4d9c137613f19b7c319cf4aa95d5d8b31460ffacf3a4a830c11d4` |
| import-max-probe-final.opendesk-tool.json | 3,126 | `fecc6cfcf224250912e20bd3e59ae3c5ddf67f9ecf0365bf10baee426a9799f4` |
| Classic build/main.js (license included) | 2,108 | `7b9a57b5308d73f3e32e528aa58b0554d2b080d742c001d4fac73303b7852e86` |
| import-classic-probe.opendesk-tool.json | 4,452 | `1c8124021d84f65e193157ff885d880174791924bd72c9ca9b9ab3acfa995f9a` |

Fresh evidence: [compile-final.json](evidence/import-r77-20261014/tool-build/compile-final.json), [package-build-final.json](evidence/import-r77-20261014/tool-build/package-build-final.json), [validation-final.json](evidence/import-r77-20261014/tool-build/validation-final.json), [classic-build.json](evidence/import-r77-20261014/tool-build/classic-build.json), [classic-package-build.json](evidence/import-r77-20261014/tool-build/classic-package-build.json), [classic-validation.json](evidence/import-r77-20261014/tool-build/classic-validation.json). Existing multi-Classic Node negative tests' inputs unchanged, so reuse original 4 PASS TAP instead of rerunning. Driver default Node mode: 3 PASS / 1 SKIP; optional-probe Node mode: 2 PASS / 2 SKIP (native launch skipped, historical fixed-package test intentionally skipped in optional mode). [Default TAP](evidence/import-r77-20261014/tool-build/driver-default-node.tap), [probe TAP](evidence/import-r77-20261014/tool-build/driver-probes-node.tap), [syntax/whitespace checks](evidence/import-r77-20261014/tool-build/syntax-checks.json). Network protocol mock tests verify enable-before-resume, event session scope and HTTP rejection; not real Chrome network evidence.

Build/validate commands for both packages and exact parent-owned CFT invocation are in [example README](../../../examples/sidebar-tools/import-max-probe/README.zh-CN.md). CFT invocation must set OPENDESK_FIXED_TOOLS_CFT=1 only in parent-owned independent resources. This sidecar explicitly ran all driver Node commands with OPENDESK_FIXED_TOOLS_CFT=0. Final source and read-only input identities: [manifest.json](evidence/import-r77-20261014/tool-build/manifest.json); original initial snapshot preserved separately as manifest-initial.json. Workstream/evidence directory is ignored by existing .gitignore; no ignore/index changes performed.

Final status: SOURCE_WIRED / BUILD_PASS / NODE_PASS. Chrome installation, both native lifecycle branches, real opaque enforcement, network isolation, screenshots, visual widths/dark/keyboard: NOT_TESTED. No browser, shared port/dist, Git operation, release or push. Assigned resources are released to parent; driver write ownership handed back with exact final SHA and review patch.
