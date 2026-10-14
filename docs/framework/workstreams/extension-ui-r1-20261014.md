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
