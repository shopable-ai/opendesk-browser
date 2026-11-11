# OD-MOUSE-GESTURES-DIRECTION-ARROWS-R2-ACCEPTANCE · Partial verification / native acceptance blocked

- Task: `OD-MOUSE-GESTURES-DIRECTION-ARROWS-R2-ACCEPTANCE`
- Reviewed: 2026-11-11
- Repository: `shopable-ai/opendesk-browser`, existing `main` only
- Historical R1 feature commit: `489fcf76ce1593984385624dee51545fa9f640b0`
- Product: `projects/mouse-gestures/` version `0.3.0`, Page Module revision `4`
- **Disposition: SOURCE_IMPLEMENTED / ISOLATED_V8_TESTED / LOCAL_NODE_BLOCKED / PACKAGE_NOT_BUILT / NATIVE_CHROME_BLOCKED. NOT ACCEPTED.**

## User-facing goal

Retain normal native context menus on plain right clicks. Starting at 12 px of trusted right-drag, show a non-intercepting path; at 56 px display exactly one independent single-direction arrow per recognized segment in a 36×36 px rounded square (9 px radius), near each segment endpoint. Permit two perpendicular legs such as `←↓`, `↓→`, `↑→`, never connected/double-headed arrow glyphs. Execute only once at trusted release when the full sequence is valid, explicitly configured (for combos) and reauthorized. Suppress partial turns, reversals, diagonals, unsupported third legs and stale asynchronous grants. Preserve installed default-on, explicit off, persisted CAS preferences, Alt-left fallback and conservative Mac menu-first abandon.

## Read-only remote source/ownership review

- The R1 commit exists and includes the segmentation logic, Page UI/runtime wiring, sidebar preferences, preview and tests.
- The current `main` moved during this task; last observed pre-record HEAD: `4ceae05a03ca59e5ec7728c6b3ee8f982fe1fbaf`. This is an observation, not a frozen checkout.
- Comparison from R1 to then-current `main`: 20 commits ahead, **zero changed files under `projects/mouse-gestures/`**. The two touched shared UI/bridge paths had web-markdown-clipper-specific changes; they do not demonstrate a native regression but shared-host integration still needs testing.
- `projects/mouse-gestures/package.json` and `tool.config.json` both declare `0.3.0`; `tool.config.json` declares Page Module revision `4`. `src/page/main.js` imports `runtime.js` → `gesture.js` → `segments.js`. This is static import-chain evidence only, **not** a built bundle receipt.
- Directory listing contains no promoted `mouse-gestures.opendesk-tool.json` installable package.
- GitHub Actions App CI run [43049960722](https://github.com/shopable-ai/opendesk-browser/actions/runs/43049960722), triggered on R1 SHA, remains **queued**, conclusion `null`, no artifacts. Do not describe this as PASS.

## Tests actually executed

The local Mac CodexPro service was unavailable (`UNAVAILABLE`), and the OpenDesk Mac file/desktop/Browser services were unavailable (including HTTP 429). The independent execution container has Node v22.16.0 but no repository checkout and cannot resolve `github.com` to clone. Thus **the requested `node --test`, `node --check`, normal packaging and installed Chrome tests were not executed**.

To maximize useful read-only verification, actual GitHub `main` source and six repository test files were retrieved and executed in an isolated JavaScript V8 compatibility harness. The harness removes static ESM/Node import syntax, injects the actual source exports and adapters for `node:test`, `node:assert/strict`, virtual file reads and `vm`. The original test bodies were executed. **This is not native Node or repository-integrated execution; it provides only limited isolated evidence.** No original CLI stdout, package hash or Chrome evidence was created.

| Test file | Isolated V8 pass | Fail |
| --- | ---: | ---: |
| `tests/segments.test.mjs` | 6 | 0 |
| `tests/gesture.test.mjs` | 19 | 0 |
| `tests/four-directions.test.mjs` | 8 | 0 |
| `tests/runtime.test.mjs` | 7 | 0 |
| `tests/panel.test.mjs` | 8 | 0 |
| `tests/preview-parity.test.mjs` | 2 | 0 |
| **Total** | **50** | **0** |

Additionally 12 isolated V8 boundary probes passed: 11/12 px intent, 55/56 px activation, all eight perpendicular combos (configured/unconfigured), 11/12/55/56 px second-leg thresholds, third-leg nonexecution, 13 px reversal and invalid mapping rejection. **Combined isolated evidence: 62/62 PASS, still below formal repository Node and native Chrome acceptance.**

GitHub source blob identities for V8 harness:

- `src/page/segments.js`: `9e199df9d895ae0fa521b0bc7236764b03779697`
- `src/page/gesture.js`: `10f46df7b1845a513c0d8cbd87a14622f3947508`
- `src/page/runtime.js`: `8c4d823abb295bfe9d412604d8b05365ebb8d228`
- `src/main.js`: `43e32aef8b64bc93130259b5297c7787224f5e22`

## Evidence/status matrix

| Acceptance item | Status | Reason |
| --- | --- | --- |
| R1 source: single arrow per segment, rounded-square SVG, two-segment recognition, safe mapping | DONE (source review + isolated V8 tests) | Source and existing tests confirm logic; native render is not yet observed |
| Repository `node --test projects/mouse-gestures/tests/*.test.mjs` | BLOCKED | No connected local repo execution |
| Five requested `node --check` commands | BLOCKED | Same limitation |
| Build existing Sidebar Tool / embedded Page Module and verify packaged `segments.js`, revision 4 | BLOCKED | No connected repository builder, no candidate package |
| Chrome installed candidate identity / permission grant / manual native menu-first and menu-after | BLOCKED | No authorized local Mac browser connection |
| Chrome physical mouse single and two-leg gestures, 36×36 rendered arrow visual | BLOCKED | No physical mouse evidence |
| Revoke, disable, uninstall and native cleanup | BLOCKED | No installed Chrome evidence |
| Windows native compatibility | NOT_TESTED | No Windows evidence |
| Changes to R2 product source | NONE | No reproduced failing source test justified modification or bump |

## Provisional six-view review (0–100 each; not six external human audits)

These are **independent category estimates of current evidence adequacy**, not formal product acceptance scores. Deduct for lack of actual installed Chrome/packaging evidence.

| View | Score | What works / deduction |
| --- | ---: | --- |
| Product | 86 | Product source covers the requested flow; installed usability and native default-right compatibility unproven |
| Interaction | 91 | Separate badges, dimensions and text behavior have code/tests; no real viewport/mouse visual evidence |
| Algorithm | 93 | 50 existing tests + 12 isolated boundaries; Node/full sparse/OS event integration still pending |
| Chrome | 40 | Conservative menu-first/menu-after logic exists; no real macOS/Windows menu timing observed |
| Security | 82 | Authority, CAS, cancellation guards present in code and mocks; revocation/uninstall integration not validated |
| Test quality | 70 | 62 isolated checks pass, but native Node, candidate identity, CI and Chrome evidence missing |
| **Arithmetic mean** | **77.0** | **Below the ≥95 acceptance goal; do not claim ACCEPTED** |

## Bounded next continuation (no repeated development)

1. Reconnect CodexPro and authorized Mac Browser; first recheck `main`, local dirty files, existing source identity and any latest R2 evidence, without taking over another agent's workspace.
2. Execute `node --test projects/mouse-gestures/tests/*.test.mjs` plus the five requested `node --check` commands on the real repo. Record raw TAP totals and failures; retain V8 results as historical isolated evidence instead of rerunning them.
3. Use the existing `scripts/build-sidebar-tool.mjs` to build an explicit candidate `artifacts/sidebar-tools/mouse-gestures/candidate.opendesk-tool.json`, confirm embedded Page Module v4/segments content/source digest and check project promotion rules. Do not promote if checks fail or the installed package/candidate identity is unknown.
4. On the authorized macOS Chrome profile, document actual plain right click, right dragging, three two-leg combos, Alt-left fallback, Esc/invalid actions, settings readback, disable, revocation and uninstall, including menu-first vs menu-after. Keep synthetic/Playwright and physical mouse distinct. Windows remains NOT_TESTED unless tested.
5. Fix only actual failures, rerun affected tests and preserve other agents' changes. If no fix is needed, do not bump version or manufacture a source commit. Record current candidate SHA and evidence, then recalculate independent scores. Accept only with actual required evidence and mean ≥95.

No native Chrome session, shared browser profile, install state, user files or source files were modified during this blocked verification.

---

## R3 continued acceptance — 2026-11-12

- Task: `OD-MOUSE-GESTURES-DIRECTION-ARROWS-R3-LOCAL-ACCEPTANCE`
- Scope: native repository Node tests, formal Sidebar Tool candidate build, and physical macOS Chrome acceptance only. R1/R2 source and 62 V8 checks were **not** repeated.
- Disposition: **REMOTE_SOURCE_RECHECKED / LOCAL_NODE_BLOCKED / CANDIDATE_BUILD_BLOCKED / NATIVE_CHROME_BLOCKED / NOT_ACCEPTED**.
- Remote `main` HEAD observed before this document update: `f469c1f832c959faba4f6791a8509918aafc542c`; remote `main` moved during the R3 review, so this is an observation and **not** a local checkout.
- From R1 feature commit `489fcf76ce1593984385624dee51545fa9f640b0` to this remote HEAD: comparison `ahead`, 32 commits ahead, 0 behind; files under `projects/mouse-gestures/` changed: **0**. This does **not** check uncommitted changes on the user's Mac.

### Existing source and test evidence, rechecked remotely

- Read repository `AGENTS.md`, current project README, this R2 record, six tests, the core Page modules, project metadata, and the existing packaging Skill. No new source edit was justified from this remote read-only review.
- `package.json` and `tool.config.json`: version `0.3.0`, Page Module revision `4`; static import chain `src/page/main.js` → `runtime.js` → `gesture.js` → `segments.js` exists.
- Core source blobs remain `segments.js=9e199df9d895ae0fa521b0bc7236764b03779697`, `gesture.js=10f46df7b1845a513c0d8cbd87a14622f3947508`, `runtime.js=8c4d823abb295bfe9d412604d8b05365ebb8d228`, `src/main.js=43e32aef8b64bc93130259b5297c7787224f5e22`.
- Six original tests exist in GitHub (`segments`, `gesture`, `four-directions`, `runtime`, `panel`, `preview-parity`). Historical **62/62 isolated V8 checks** remain R2 evidence only and were **not** counted as R3 native Node tests.
- GitHub Actions run [43049960722](https://github.com/shopable-ai/opendesk-browser/actions/runs/43049960722) was queried again: `status=queued`, `conclusion=null`; its `discover` job is queued and its artifact list empty. **No CI PASS or package may be inferred.**

### Actual attempted execution and blockers

1. `CodexPro.open_current_workspace` → `UNAVAILABLE: Error code: UNAVAILABLE; Error: McpServerError: Connection failed.` No workspace ID, dirty-file state, or local agent ownership could be obtained.
2. OpenDesk Mac Desktop `tm_status`, `tm_inspect_desktop`, `tm_browser_status`, and Code Mac `tm_files_status` → `UNAVAILABLE: ... MCP SSE probe returned 429 from openai.org`. No host-bound browser session, Chrome tab, user authorization or physical mouse evidence available.
3. Independent execution container: Node `v22.16.0` exists, but no Git checkout; `git ls-remote https://github.com/shopable-ai/opendesk-browser.git refs/heads/main` → `fatal: ... Could not resolve host: github.com`. This is a **separate container**, not the Mac Codex workspace. No synthetic reenactment has been counted as native acceptance.
4. **Not executed:** `node --test projects/mouse-gestures/tests/*.test.mjs`; `node --check` for `segments.js`, `gesture.js`, `runtime.js`, `page/main.js`, and `src/main.js`. Native Node pass/fail numbers, TAP stdout and original failure traces: **unavailable**.
5. **Not executed:** `node scripts/build-sidebar-tool.mjs projects/mouse-gestures --out artifacts/sidebar-tools/mouse-gestures/candidate.opendesk-tool.json`. GitHub project listing shows no tracked `mouse-gestures.opendesk-tool.json`. No verified candidate path on the Mac, candidate bytes, SHA-256, package source identity or `--promote-from` / `--check-project` receipt exists. **No promotion performed.**
6. **Not executed:** real macOS Chrome plain right-click, one-leg arrow, three two-leg examples, configured-once action, partial/diagonal/reversal/third-leg safeguards, Escape/blur/visibility, persisted on/off, Alt-left, `showTrace=false`, permission revoke, disable/uninstall cleanup, and menu-first/menu-after screenshots/video. **All native Chrome acceptance cases BLOCKED.** Windows remains `NOT_TESTED`.
7. No remote business source was modified, no local Mac or Chrome profile touched, and no repair, version bump, duplicate builder, new branch or purported installable artifact created. The only intended write for R3 is this accurate continuation of the existing acceptance document.

### Acceptance matrix (R3)

| Gate | Evidence | R3 status |
| --- | --- | --- |
| R1 implementation / remote source wiring | Current source and blobs read; comparison from R1 shows 0 business-file changes | SOURCE_RECHECKED, not native-verified |
| Six repository test files | Existence and imports confirmed; **no native CLI output** | LOCAL_NODE_BLOCKED |
| Five native Node syntax checks | No real workspace | BLOCKED |
| Official candidate built from existing packager | No builder execution, candidate file, byte digest or promotion | BLOCKED |
| Real installed macOS Chrome / physical mouse / menu timing | Mac services HTTP 429; cannot access native input | BLOCKED |
| Disable / revoke / uninstall lifecycle | No installed Chrome receipt | BLOCKED |
| Windows | No Windows environment evidence | NOT_TESTED |
| Product source repair | No reproduced source failure; source left untouched | NONE |
| Production release / final sign-off | Required gates missing | **NOT ACCEPTED** |

### Independent six-view evidence-quality scores (provisional, 0–100)

Scores measure **adequacy of verified evidence** rather than claiming six external human audits. Remote recheck does not substitute for missing local/Chrome gates, so the R2 provisional deductions remain warranted.

| View | Score | Principal remaining deduction |
| --- | ---: | --- |
| Product | 86 | Actual installed end-user behavior unknown |
| Interaction | 91 | Rounded 36×36 arrow presentation not viewed with a physical mouse |
| Algorithm | 93 | Native repository Node and OS input lifecycle not rerun |
| Chrome | 40 | No actual menu-first / menu-after or installed Chrome behavior |
| Security | 82 | Real authorization, withdrawal, unload and cleanup not verified |
| Test quality | 70 | 62 isolated checks only; missing Node TAP, build digest and Chrome evidence |
| **Arithmetic mean** | **77.0 / 100** | **Below the ≥95 goal. NOT ACCEPTED.** |

### Precise next unblocked actions

When the *authorized user's Mac* can be connected, inspect its current `main` / dirty files / competing agents first. Run the exact six requested native Node CLI commands and retain raw TAP + syntax-check results. If passing, run the existing packager to the stable candidate path, validate package/source/version/revision/identity and only then consider promotion under the repository's existing gate. Use the authorized real macOS Chrome session with a physical mouse to collect the requested menu-first, menu-after, direction, cancellation and revoke evidence. Report real failures and fix only reproduced defects; recalculate scores and accept **only** after required evidence exists. Do not rerun or re-label the historical isolated 62 checks.
