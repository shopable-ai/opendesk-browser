# OpenDesk Extension UI R1 · scoped file ownership and verification

Date: 2026-10-14. Owner: this GitHub connector conversation; only authorized write branch: main.
Starting remote HEAD: `7497ca8a978c443bcf7c707bf996ee24b84820d5`. This remote read is not a local Mac git status, Chrome profile or watcher inspection.

## Files and contract
Production: `src/ui/scheduled-task-workbench.js`, `src/ui/tool.html`, `src/ui/tool-shell.css`.
Existing tests: `tests/environment/scheduled-task-ui-r1.test.mjs`, `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`, `tests/framework/scheduled-tasks-r23-native-zoom.test.mjs`.
No Task Registry, Authority, RunHost, Alarms, SDK, global token, iframe sandbox or other formal Tab modification.

## Implemented
Scheduled index shows scannable plan title/status/next execution/frequency and pause/edit. A same-Tab Detail owns paginated Fire history, version disclosure, delete review, state warnings and target URL. Return restores list focus and scroll. Edited plans retain task installation identity, expected generation and two-phase save. Manager uses the common header Back. Native pointer scripts are updated to enter Detail before expanding history/deleting. The original visible RunHost URL remains unchanged.

## Verification and handoff
Remote-current source anchor and V8 syntax checks: performed, **limited**. Real `node --test`, `npm run check`, production/development build, verify, Chrome/WXT screenshots, physical Side Panel widths, real browser 100–200% zoom and user Mac checkout: **NOT_TESTED** (not accessible here). All ten independent 95+ scores: **NOT_SCORED**.
No user Mac dist/profile/watcher used or released. Existing raw results remain unchanged. Follow-up acceptance must be tied to the actual frozen candidate hash and must correct any real test failures.

## R1 follow-up: exact candidate real Chrome failure triage

- Commit `b04adb9b5c041a136941043c66b86835c2b5177a` triggered Linux native baseline and lifecycle CI [run 38547377566](https://github.com/shopable-ai/opendesk-browser/actions/runs/38547377566), both FAIL. Build and Chrome 155 installed, plan and Chrome Alarm created. The native driver waited for the **old** runner heading containing 「运行页」 at line ~564. The R1 header intentionally now renders 「运行概览」, so this was a stale test expectation, not evidence of a Host/Alarm failure. Changed the expectation to exact single heading while still checking real TAB context, native Side Panel origin, visible runner, geometry, original Host and subsequent real effects.
- Also fixed view-switch scroll start/return focus: 20-plan list can be scrolled deeper than its shorter detail; entering detail/editor now starts at top, returning list restores prior scroll. Save/discard restores meaningful focus. Extended existing static contract and native installed Task driver to exercise visibility/top-of-detail.
- Linux native zoom/focus [run 38547377728](https://github.com/shopable-ai/opendesk-browser/actions/runs/38547377728) for prior SHA was SUCCESS but does not prove all interactive states or Mac physical widths. New follow-up candidate requires its own CI evidence.

- Follow-up in-memory V8 contract pass 24/25 and old R2.8 source assertion failed only because view-change predicate changed from `view!==activeView` to equivalent `changing=view!==prior`; the latter now also controls the real scroll switch. Updated original test to require the new explicit predicate. This is not Node or browser proof.
