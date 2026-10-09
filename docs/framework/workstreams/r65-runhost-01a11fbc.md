# R65 RunHost Released Notification Fix

## Scope

- Worktree: `/Users/shopme/.codex/worktrees/r65-runhost-01a11fbc/opendesk-browser`
- Branch: `agent/r65-runhost-01a11fbc`
- Base: `b8a55f3cbeb5fe66091ac3fc2ecb60645b2f696e`
- Authorized files: `src/run-host.js`, `tests/framework/run-host-recovery.test.mjs`, this workstream record.
- Browser/shared dist: not used.

## Finding

The reported root cause was confirmed. `settleController()` notified observers before clearing `active` when `retireControllerTarget()` returned `released`. A synchronous observer that read `host.currentRun` during the terminal notification still saw the old `runId`, matching the Sidebar lock symptom after Native CLI completion and released retirement.

## Change

- `src/run-host.js`: clear `active` before notifying observers when the controller retirement is released.
- `tests/framework/run-host-recovery.test.mjs`: added synchronous observer regressions for both terminal cases:
  - released retirement notification sees `currentRun === null`;
  - pending retirement notification keeps `currentRun === runId`.

Pending/unknown retirement continues to hold the active RunHost slot. Stop, UNKNOWN, and Worker safety semantics were checked with adjacent framework regressions.

## Verification

2026-10-09 17:20 CST, local isolated worktree.

- `npm ci` -> pass; local dependencies installed in this worktree. npm reported existing audit findings and allow-scripts warnings; no package files were changed.
- `node --test tests/framework/run-host-recovery.test.mjs` -> pass, 5/5.
- `node --test tests/framework/run-host-recovery.test.mjs tests/framework/k2-control-state-regressions.test.mjs tests/framework/k3-controller-authority.test.mjs tests/framework/k5-controller-script-fence.test.mjs` -> pass, 112/112.
- `npm run check` -> pass; `Syntax checked 177 source/test/build files; scripts/build-contract.mjs entries, fixed SDK/control entries, strict CSP and original MIT checked`.

## Not Tested

- No real CFT/Chrome, installed ZIP, shared dist, or native browser resource was used in this branch. This is a component-level RunHost lifecycle fix and regression; it does not claim a new native PASS.
