# F2/K3 controller lane freeze

Explicit cwd: `/Users/shopme/Documents/workspace/opendesk-browser`.
Product source is frozen for Main's fresh full glob and same-source dual package build.
This report is targeted F2 evidence, not F3 or a global gate update.

Owned admission no longer passes missing tabId to JSON canonicalization:
the pre-creation native fence uses `[null, frameId]`, with frame default 0.
Public authority owned retirement passes and only removes the exact created tab
after the durable terminal commit. Borrowed child frames retain exact native
frame/document binding; borrowed targets are never closed.

`createRunHost({client:foundationClient})` shares the UI registration and exposes
`artifactResources`, created by the sole existing Host Blob registry with its clock.
Ordinary committed JS follows unique client/delegate/context/private sandbox/native
driver and durable result handling. SDK short services do not claim the controller slot.

Changed product paths:

- `src/run-host.js`
- `src/platform/host/client.js`
- `src/platform/host/controller-methods.js`
- `src/platform/target/index.js`
- `src/framework/context.js`
- `src/framework/control/native-driver.js`
- `src/scripting/packaged/page-session.js`
- `src/scripting/sandbox/controller.js`

Changed/additional targeted tests:

- `tests/framework/k3-controller-authority.test.mjs`
- `tests/framework/k3-native-driver.test.mjs`
- `tests/framework/k3-controller-native-page.js`
- `tests/framework/k3-controller-native.mjs`

Evidence stays in `docs/framework/evidence/f2-controller-continuation/`.
No authority/broker/storage/SW/protocol/UI/package/ledger write was made by this lane.
No dependencies or Git initialization/commit/push were added.

Fresh validation:

- Public authority: 12 tests, 12 pass, exit 0. Covers real authority delegation,
  UTF8/headCAS/pin, owned and exact child-frame targets, permission/removal fences,
  hostGone/recovery, namespace durable reads, SDK coexistence and forced Node
  harness Worker termination before terminal commit and retirement.
- `node --test tests/framework/k3-*.test.mjs`: 49 tests, 49 pass, exit 0.
  Output: `node-targeted.tap`.
- Syntax: 14 scoped source files checked with `node --check`, exit 0.
- `node tests/framework/k3-controller-native.mjs`: exit 0. Evidence:
  `native-2026-10-03T08-09-01.281Z/`. Actual product SW/client/authority/IDB/RunHost/
  ctx/opaque sandbox/driver graph, with a fixture consumer and static localhost
  permission. Chrome 138.0.7204.183 and 154.0.8037.92 each pass 8 functional cases;
  both pass physical busy Worker stop evidence without Worker/creator inspector
  attachment. Exact native targetDestroyed/absence and CPU cessation fall inside
  the approved 3000ms bound. Chrome 138 confirms mapped renderer PID exit by OS
  inventory; Chrome 154 retains the mapped renderer with post-stop CPU deltas 0
  and 0.000103 seconds. Both browser PIDs are absent and owned profiles removed.
  Earlier failed observer/fixture attempts remain saved; they are not relabeled.

Main-owner integration still required:

1. Add webpack fixed entry `scripting/packaged/page-session` pointing to
   `./src/scripting/packaged/page-session.js`; current webpack configuration has
   the sandbox entries but omits this new fixed ISOLATED entry. The native targeted
   runner includes it explicitly; this does not prove the final product package.
2. The frozen single-codec obligation remains open: expose the canonical codec's
   self-contained factory and replace the inherited private control codec bridge
   in generated harnesses. The lane never presents that bridge as contract completion.
3. Shared script GC currently requires every pin owner to be `sdk-operation`.
   Extend it for bound `controller-lease` only when the pin is released, the lease
   terminal, worker retired and target retirement released. Current behavior is
   a conservative GC block; it does not collect a live revision.

Main owns fresh full glob, source/package verification, dual package build and SDK
native matrix. These targeted proofs do not establish final UI/download acceptance
or the full 48-member F3 matrix.
