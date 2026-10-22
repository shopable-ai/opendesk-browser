# Official Extensions R1.2 · 2026-10-22 · scoped remote implementation

- Owner: 当前 OpenDesk Browser Official Extensions R1.2 对话（GitHub Connector；仅 main）。
- Starting inspected HEAD: `0b01417fc593d14a909542a2ef089fd7ba518489`; integrate against each newest target blob (no branch/worktree/PR/force).
- Confirmed user-impacting source defect: AdBlock React normal-operation status falsely asks for a second trusted approval, although reviewed official Host routine controls already dispatch and read back without an approval popup.
- Scoped write ownership: `examples/sidebar-tools/adblock/src/App.jsx`, `tests/environment/adblock-navigation-r15.test.mjs`, `tests/environment/time-review-host-controls-r51.test.mjs`. Inspect files afresh before each write. Do not take ownership of shared installer/SDK/Host, fixed provenance, emitted dist or installed packages.
- Regression triage: Time Review Actions #39733016528 had three DOM/bridge source assertions bound to pre-React implementation; Linux host tests encountered missing `dist/tool.css`; old fixed build rejected Time Review model's blob, but latest `scripts/bundle-provenance.mjs` already pins the current model SHA.
- Live-product priority: keep Time Review default-on+two grants, AdBlock DNR verified write/readback, Prompt Shortcuts first-run three examples, user off/revocation states and original SDK/Host semantics; only touch clearly proven defects.
- Resources: no local Mac workspace or Chrome profile access; no occupation of `dist/development`, production build, CFT/profile, npm watcher or other Agent's outputs.
- Evidence classification: static GitHub source/Actions only until new candidate tests/build/install are actually executed; all same-candidate real Mac Chrome checks remain NOT_TESTED. Release package promotion requires real builder candidate+verified `--promote-from`; do not fabricate packages or upgrade versions manually.
