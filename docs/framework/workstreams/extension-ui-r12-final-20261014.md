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

## R1.2 implementation and evidence register

### Actual commits on `main`
- `e2cb279a`: scoped handoff note, owns only this file.
- `aff4c6ab`: schedule UI separates successful server mutation from a failed subsequent refresh and fences stale concurrent catalog/list responses.
- `c3ca98d`: executable Node acknowledgement/failure recovery and static refresh regressions.
- `d99542c`: original R2 save assertion now follows the unchanged real `saveSchedule` RPC behind the helper.
- `82f1a84`: restores the exact trusted `src/ui/bookmark-manager.css` -> `ui/bookmark-manager.css` static build asset missing in both Linux and macOS CI. No bookmark business/permission code edited.
- `89f608f`: executable 135-Fire page merge and two-plan history separation test.
- `0d8c73e`: strengthens R21 strict known-assets assertion for the added bookmark CSS; no verifier weakened.
- `b1409dd`: returns focus to task-manager's originating edit-form action; adds a genuine Chrome native dirty-draft manager roundtrip assertion (currently requires fresh R3).
- `1d28dc0`: repairs two outdated R2.5/R2.6 timezone form tests to preserve the real save RPC and new refresh-success semantics. Its new Linux zoom rerun is a separate receipt.

Other agents advanced `main` concurrently. Commits above were written to `main` without force, worktree, PR or reset. No Mac local checkout/index/profile was read.

### CI receipts (never promote source existence to native PASS)
- Historical R3 on `8a2f4d1`: [38550074558](https://github.com/shopable-ai/opendesk-browser/actions/runs/38550074558) **SUCCESS** on the original candidate, not the newest package.
- R1 Node components and production/development package on `89f608f`: [38554200039](https://github.com/shopable-ai/opendesk-browser/actions/runs/38554200039) **SUCCESS**, two jobs. Real CI ran the 135-Fire synthetic UI merge test as well as existing persisted 135-Fire repository tests. The UI merge data is test fixture, not real Chrome.
- R21 shared Sidebar/UI/package on `0d8c73e`: [38554541751](https://github.com/shopable-ai/opendesk-browser/actions/runs/38554541751) **SUCCESS**. Verified production hash `09b378adc1fcb4dc179f7478733b6385b8ccd33510814f3fad1b6f09bc599913`; development hash `5ca99aeab7d38a441e871ed5bb9eb102305c1d7387c22498d321464a4f733db5` (ONLY that SHA).
- R19 static Chrome on `d99542c`: [38553394480](https://github.com/shopable-ai/opendesk-browser/actions/runs/38553394480) **SUCCESS**. Current R19 is queued/in progress separately.
- R2.3 on `89f608f`: [38554200123](https://github.com/shopable-ai/opendesk-browser/actions/runs/38554200123), macOS genuine Chrome **SUCCESS**, Linux **FAIL in pre-Chrome Node time-zone contract** due two old regex assertions; fixed by `1d28dc0`, whose new run [38555029260](https://github.com/shopable-ai/opendesk-browser/actions/runs/38555029260) needs an independent final receipt.
- New R3 on `b1409dd`: [38554942145](https://github.com/shopable-ai/opendesk-browser/actions/runs/38554942145) runs the added real manager/back/draft/focus assertion; queued at last read. Earlier R3 on `89f608f` [38554200052](https://github.com/shopable-ai/opendesk-browser/actions/runs/38554200052) also queued.
- Dist/Chrome identity must always cite the exact testing candidate. Any new `main` commit touching bundle inputs invalidates package fingerprint equivalence; do not mix receipts.

### Not closed / local Mac handoff
- Actual user Mac `/Users/shopme/Documents/workspace/opendesk-browser` git status, watcher, extension ID and Chrome Profile: **NOT_TESTED** (no access here).
- 300/320/360/420/520 **physical** Side Panel widths, 100/125/150/200% actual Side Panel zoom (vs CDP runner viewport), 20 truly persisted plans with scrolling, 100+ real Chrome-visible Fire records, keyboard all control paths, dark/light/reduced motion, screenshots/computed-geometry of current post-`b1409dd` package: **NOT_TESTED** unless a specifically bound CI receipt is subsequently recorded.
- R3 historical real two-plan deletion/History, and R2.3 runner TAB zoom, do not satisfy the complete list of physical scenarios.
- Ten independent product scores remain **NOT_SCORED** pending those genuine UI and accessibility receipts; the 95+ gate is not declared accepted.
- Do not alter Browser SDK, fixed Task authorization, generation/installation identity, visible RunHost, Scheduler or tool iframe trust boundaries in local acceptance.
