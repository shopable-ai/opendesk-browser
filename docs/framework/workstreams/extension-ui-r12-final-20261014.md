# OpenDesk Extension UI R1.2 · scoped product closure (2026-10-14)

Owner: this GitHub connector conversation; authorized branch: `main`.
Initial remote read: `3be4b08f01473bf9d4b23ce94b333219db869b9c`; the remote head is moving due to independent SDK/bookmark work. Mac checkout, git index, watcher, Chrome Profile and dist were NOT inspected or occupied.

## Owned scope
- `src/ui/scheduled-task-workbench.js`: P0 asynchronous refresh and mutation result recovery only; no changes to Task Registry, Authority, RunHost, schedule schema, alarms, SDK or other Tab business logic.
- `tests/environment/scheduled-task-ui-r1.test.mjs`: P0 regression of mutation acknowledgement and stale refresh response.
- This unique workstream document.

The existing `src/ui/tool.html`, `tool-shell.css`, design tokens and other active Tool/Bookmark/Stay Focus consumers are intentionally not claimed. R3 native detail workflow and prior evidence are reused where inputs remain identical.

## Initial findings
The existing UI awaits a successful `saveSchedule` / `changeSchedule` / `uninstallTask` and then `refresh()` in a single try/catch. A post-ack refresh failure can therefore be presented as a failed mutation, enabling misleading retries. Concurrent background polls may also apply an older list/catalog snapshot after a newer response.

## Verification boundary
R3 [run 38550074558](https://github.com/shopable-ai/opendesk-browser/actions/runs/38550074558) was successful on its original candidate SHA `8a2f4d141f9861a7de7f3594b0c5a79cfe99d6ca`. Its actual native acceptance is historical evidence, not a fresh installed-package receipt for this commit.

After implementation, record the exact commit and scoped CI result separately. Mac physical Side Panel, local Profile and user-installed build remain NOT_TESTED. Ten independent 95+ product scores remain NOT_SCORED until adequate evidence exists. No second runtime, branch, PR, worktree or local build output.
