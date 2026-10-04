# F1 EX08 real Chrome observation

Design manifest: `acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f`.
Fixture manifest: `5cab9686da1ab1fbea307650bb419d7481e21d3292327d9d77b198e43826c815`.

On 2026-10-02 UTC the owner executed `node tests/prototypes/execution/run-ex08.mjs` from `/Users/shopme/Documents/workspace/opendesk-browser`. Exit code was 1. The run used the already bundled Playwright library, headed Chrome for Testing 149.0.7827.55, and a separate profile inside `tests/prototypes/execution/profiles/chrome-149`. No dependency was installed. The installed stable Chrome 154.0.8037.97 was observed from its application metadata; it was not tested. Minimum/stable support is unproved.

The minimal fixture contains fixed packaged probes, not the F3 product workbench. It introduces no authority, broker, journal, IDB, user-code compiler or production adapter. Its sandbox policy is `sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'none'; object-src 'none'`. It has no `allow-same-origin`; source contains no eval/new Function. The unsafe-eval policy token is confined to the manifest sandbox and does not itself prove a user script backend.

| Case | Actual observation | Evidence limit |
| --- | --- | --- |
| Fixed extension packaged classic Worker | worker-ready received | Control only; privileged fixed code is not user execution |
| Manifest sandbox | MessageEvent origin null; extension runtime id absent; parent document access denied | Sandbox observations, not every Worker API or policy-container assertion |
| Sandbox classic packaged URL | Constructor SecurityError: extension script cannot be accessed from origin null | No Worker RPC/network/CPU checks reached |
| Sandbox module packaged URL | Same constructor SecurityError | No Worker RPC/network/CPU checks reached |
| Sandbox classic Blob | worker-ready; private MessagePort pong; fetch TypeError; loop-entered; terminate invoked; sandbox heartbeat continued | Partial feasibility. No direct CSP attribution, allowed-network control, adversarial channel tests, user async body or immutable revision |
| Sandbox module Blob | Worker error before ready, no detailed browser error message | No stronger root-cause claim; remaining phases untested |
| Cleanup | Fixture counters Workers/ports/Blob URLs/timers returned to zero; host port closed; iframe removed; isolated context and loopback server closed; no profile Chrome process remained | Counters are fixture bookkeeping, not full product leak or general CPU/OS resource proof |

The loopback HTTP server observed zero requests. `console.json` and document CSP violation collection were empty. Worker-specific CSP violations/policy were not collected; fetch failure must not be attributed conclusively to connect-src. Termination milliseconds measure the fixture call-to-heartbeat interval, not an independent CPU cessation measurement. The harness labels classic Blob PASS for its fixed probe; this is not backendPrototypePassed. Its all-four-loader AND also does not define the design's required supported execution modes.

Raw report, screenshot and console are frozen alongside this file. Original output is under `tests/prototypes/execution/evidence/chrome-149`. The screenshot displays the prototype report; it is not evidence of F3 user editing/running/downloading. The initial candidate files remain unchanged. Re-running the current command writes its test output location again; the frozen copies and recorded hashes preserve this observation.

Required untested scope includes Worker user async body/revision semantics, spoof/replay/global patch rejection, complete Worker isolation and network attribution, userScripts code/file/authorization/exact-document/Promise/error, the minimum/stable matrix, R1–R8 and 17 historical failures, all F2 integration and F3 real workbench/durable/download/artifact-hash/resource cases. Independent review determines the bounded gate disposition. Product implementation remains held; failed loader branches are stopped and no substitute backend is introduced.
