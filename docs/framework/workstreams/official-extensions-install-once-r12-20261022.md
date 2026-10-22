# Official Extensions R1.2 · 2026-10-22 · scoped remote implementation

- Owner: 当前 OpenDesk Browser Official Extensions R1.2 对话（GitHub Connector；仅 main）。
- Starting inspected HEAD: `0b01417fc593d14a909542a2ef089fd7ba518489`; integrate against each newest target blob (no branch/worktree/PR/force).
- Confirmed user-impacting source defect: AdBlock React normal-operation status falsely asks for a second trusted approval, although reviewed official Host routine controls already dispatch and read back without an approval popup.
- Scoped write ownership: `examples/sidebar-tools/adblock/src/App.jsx`, `tests/environment/adblock-navigation-r15.test.mjs`, `tests/environment/time-review-host-controls-r51.test.mjs`. Inspect files afresh before each write. Do not take ownership of shared installer/SDK/Host, fixed provenance, emitted dist or installed packages.
- Regression triage: Time Review Actions #39733016528 had three DOM/bridge source assertions bound to pre-React implementation; Linux host tests encountered missing `dist/tool.css`; old fixed build rejected Time Review model's blob, but latest `scripts/bundle-provenance.mjs` already pins the current model SHA.
- Live-product priority: keep Time Review default-on+two grants, AdBlock DNR verified write/readback, Prompt Shortcuts first-run three examples, user off/revocation states and original SDK/Host semantics; only touch clearly proven defects.
- Resources: no local Mac workspace or Chrome profile access; no occupation of `dist/development`, production build, CFT/profile, npm watcher or other Agent's outputs.
- Evidence classification: static GitHub source/Actions only until new candidate tests/build/install are actually executed; all same-candidate real Mac Chrome checks remain NOT_TESTED. Release package promotion requires real builder candidate+verified `--promote-from`; do not fabricate packages or upgrade versions manually.

## Executed commits, source-bound release gate and handoff

- `7512e36fadcf4035b9b05141adcb3116576f255d` — registered scoped owner.
- `18ca2ee2c197e87a802a72b95ab556eb8be18d3b` — candidate React AdBlock routine-progress copy fixed (source only).
- `9fd4346598a4e832e2cdc34e9fdc877dd8ff189b` — replaced three proven stale Time Review assertions with current React presentation layout and identity-bound CustomEvent source contracts. This test-only modification remains on main.
- `a22c35fdc9a54771382f7a1f5506df0b8aa99da9` — added a corresponding AdBlock JSX source assertion.
- CI for the AdBlock source-only commit: https://github.com/shopable-ai/opendesk-browser/actions/runs/39742698863: two failures show deterministic 1.2.3 project package differs from changed JSX; installation/package contract correctly fails closed, later Mac step skipped. No evidence of a DNR logic regression.
- `99ae9301664c48316656d65352f7bde7d498e979` and `0f8bc77a4b844f1084a5d08ea8f71eb9d93c6a52` — safe forward commits to restore exact original `adblock-navigation-r15.test.mjs` and `adblock/src/App.jsx` blobs, preserving the existing verified official package. No reset, no branch, no manually fabricated dist/package.
- **Open product gap**: AdBlock React progress text still misleading in actual released 1.2.3 UI. Next authorized owner with a build-capable workspace must apply the same single-string replacement, build React with existing toolchain, generate verified candidate through `scripts/build-sidebar-tool.mjs --out`, run focused DNR + package tests, promote via `--promote-from` and check-package. Do not update JSX on main again without the corresponding verified same-candidate package.
- **Open verification**: Time Review latest source/pinned model and upgraded config description need true same-candidate build, stage prerequisites (`dist/tool.css`), targeted CI and real Mac Chrome permissions/site grant/pause/uninstall tests. Test-only assertions on main are not proof of Node passing until CI finishes.
- **Explicitly unavailable in this execution**: user Mac workspace, local watcher, Node tool builds and actual Chrome. No claim of `npm run check`, production build, promoted package, or real Chrome PASS.

## CI scope amendment (R1.2 Task 2)

- Additional owned path: `.github/workflows/time-review-r13-native.yml` only, narrowly to stage all three existing React official tool assets **before** the broad `sidebar-tools-host.test.mjs` regression. The prior Linux run https://github.com/shopable-ai/opendesk-browser/actions/runs/39742823728 failed `E_TOOL_STAGE: required project file missing: dist/tool.css` repeatedly and cancelled dependent tests; its later normal production and development builds **passed**, proving the deterministic build pipeline is available.
- Existing builder already invokes `buildAdblockReact`, `buildStayFocusReact`, `buildCookieEditorReactIfOfficial` prior to fingerprinting. Use their existing CLI counterparts as test prerequisites. Do not edit or regenerate any committed official package, pin, Host, or installer. CI-runner dist outputs are ephemeral.
