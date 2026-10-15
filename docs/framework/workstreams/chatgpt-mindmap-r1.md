# ChatGPT Mind Map R1.1 · GitHub main source implementation · 2026-10-15

## Scope and contracts
Owner writes only `examples/programs/chatgpt-mindmap/**`, `tests/environment/chatgpt-mindmap-r1.test.mjs`, `tests/fixtures/chatgpt-mindmap.html`, this workstream. No `src/**`, other program or dist/build-watcher changes. Repository-integrated commits are the source of truth; user's Mac directory is not accessible from this environment.

## Actual XMind reuse
Direct authored-code port from `shopable-station`: `xmind-renderer-seams.ts` topic path identity, path parsing, per-branch HSL color, `xmind/skin.ts` static XMind central-topic/line theme. The SVG canvas actively calls these functions. Original XMind vendor binaries (4.04 MB) rely on window-global JSZip/Workbook/Topic/Dumper/_SB_ and were intentionally NOT redistributed; copyright/licensing and executable size/runtime policy remain unverified. No website conversation data is uploaded.

## Verified vs blocked vs untested
- SOURCE_WIRED: Page Program, answer-local controls, semantic DOM extraction, read-only SVG UI, XMind port are repository code.
- Baseline Node parser/layout tests: 6/6 PASS in prior isolated runner; do not credit latest XMind port until rerun.
- New XMind port tests: NOT_TESTED (must run from actual main).
- Project validator, frozen build/size/hash: NOT_TESTED (full local node_modules unavailable here).
- Current logged-in ChatGPT DOM, Chrome visual, dark/320px/200%, SPA/stream: NOT_TESTED.
- Candidate → Verification → Available → Installed + grant/disable/revoke: NOT_TESTED.
- Installed disable/uninstall immediate retirement of already-open UI: NOT_TESTED; installed-programs.js cannot yet be claimed to signal current document.
- Product-grade independent 95+ review: NOT_SCORED.

## Next work
1. On Mac, reconcile local and latest remote `main` preserving parallel changes; check `npm run dev` watcher owner, never overwrite `dist/development`.
2. `node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap`
3. `node --test tests/environment/chatgpt-mindmap-r1.test.mjs`
4. `npm run build:program -- examples/programs/chatgpt-mindmap`; record actual artifact path, byte size and SHA-256.
5. Same package: real six-answer fixture, logged-in ChatGPT 5+ answers, regeneration, toolbar recreation, identical answers, 20 toggles, return/original/fullscreen; capture dark, 320px and 200% screenshots.
6. Use existing authorized install/enable/disable/uninstall pipeline; validate native results and current-document cleanup. Repair only confirmed general host lifecycle gap.
7. Compare against Mindbank native XMind for layout and interaction, fix real defects before evidence-based independent scoring.
