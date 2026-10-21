# Dynamic App Runtime R1.4 native check

Use an already running, task-owned isolated Chrome for Testing with a frozen production extension. This driver never starts Chrome or changes its profile. Pass the launcher report, loaded extension directory, formal tool package, and an independently prepared expected.json. See `node tests/native/dynamic-app-r14.mjs --help`.

`--step=all` imports through the real Side Panel UI, approves the install and schedule reviews with native input, checks UI storage calls, closes both the Side Panel and manager tab, and waits for a real native Alarm. It reopens the UI and checks the algorithm, full payload, package/code identity, the approved schedule's Fire/Run/Result, completed state, retired Worker, and durable operations in the original journal. IndexedDB is read only for evidence; the driver never dispatches a callback or writes product state through evaluation.

The R1.4 fixtures additionally report rejected owner/identity overrides, a catchable large-read error, and actual Worker `securitypolicyviolation` events for fetch, importScripts, dynamic import and WebSocket. A DNS/network error by itself is insufficient. The test fails if the business result exists but its Run failed or has an unknown outcome.

Generate both fixture IDs and all code only after freezing the browser. Bind expected.json before installation/scheduling. Keep the hash manifest outside the frozen directory; compare every file afterwards. UI-open alone is reported as OPENED. Installation and scheduling alone do not prove the complete chain. On a timeout or uncertain receipt, inspect the saved state, exact schedule, Run and journal before taking any further action; never blindly rerun `all` or `schedule`.

Evidence is written below the explicit `--out` directory and includes Chrome/profile identity, actual runtime contexts, package/build hashes, native UI screenshots, native Alarm observations, and durable run records. The driver does not prove Store approval, OS memory isolation, arbitrary side-effect exactly-once semantics, browser-exit execution, or the full lifecycle/security acceptance matrix.
