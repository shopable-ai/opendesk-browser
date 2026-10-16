# Cookie Import Native Driver · 2026-10-17

- Owner: executor, assigned by leader; status: DEVELOPMENT_CASES_VERIFIED; branch: main; starting HEAD: `1fbba04d42e55574f88f20a9069308b2b835cacf`.
- Exclusive write scope: `tests/framework/cookie-editor-r33-native.mjs`, `tests/environment/cookie-editor-native-selection.test.mjs`, this record. Business / SDK / Host / shared fixture / dependencies remain read-only. No branch, worktree, Git index, commit or build operation.
- Expected candidate: Cookie Editor 2.0.20. Changes consume the leader's row-status / skip-invalid-and-expired / `cookies.setMany({url,cookies})` contract; this executor does not implement it. Latest batch policy supersedes the initial 10-row proposal: UTF-8 payload `{url,cookies}` <=11500 bytes, <=50 items, same Store/Partition. Driver reads the actual batch count from the visible native tool confirmation plan and verifies exactly that many Host confirmations; it does not duplicate business normalization or infer batches from Cookie count. Each exact imported key/value is then verified by native read-only calls in memory.
- Goal: selectable >10-row pasted import, actual native file selection, same-key overwrite, mixed invalid/expired preview with valid rows continuing, native read-only Cookie verification, one combined site grant in one production/Profile run. No replay on unknown outcome.
- Evidence: nonempty fictional Cookie values stay in memory; no payload in trace/report/screenshots. Fictional file chooser fixture uses only explicit empty values, with temporary file cleanup. Authorized sensitive sample is read from the existing local file without making a copy; sample mode disables screenshots, input-step recording and command/event trace entirely. Only counts and metadata are reported.

## Read-only environment discovery

- Mode: production acceptance driver preparation only. No CFT launch / attach / UI operation. Dev serve-client connection NOT_VERIFIED; no claim of continuous development or native acceptance.
- Existing independent production: `.runtime/cookie-editor-r4103-01a14571/source-main-6087d273/dist/production`, bundled Cookie Editor **2.0.19**. This is historical input, not a 2.0.20 candidate.
- Existing build entry: `node scripts/build.mjs production` from a leader-owned independent source snapshot. `OPENDESK_BUILD_EVIDENCE_DIR` selects receipt output; the script owns its output guard. Do not run in the shared daily watcher tree.
- Resource observation: dev watcher npm PID 23751 / node PID 23773 (43119/43120), fixture PID 48261 on 43111. Other headed CFT PIDs 52056 (Mind Map / live launcher 52055), 34706 and 66752 (schedule workflows). Preserved; not acquired/released by this executor. Existing native guard will reject competing active headed CFT.
- Later leader update supersedes that observation: 52056 released; remaining 59188 has parent 1 (existing guard ignores parent-1 orphan processes). This executor does not attach, launch or terminate any browser.
- Leader baseline attempt was rejected by the unchanged resource guard before browser launch: another Agent's AdBlock CFT PID 61460 / parent 61459 had a custom app name. Preserve that failure; no resource-guard bypass or browser termination.
- Launcher creates one fresh Profile and ephemeral debugging port per driver invocation. No environment option accepts an arbitrary existing Profile; all selected cases share that invocation's candidate and Profile.

## Invocation contract

Required: `COOKIE_NATIVE_EXTENSION`, `COOKIE_NATIVE_CHROME_BIN`, `COOKIE_NATIVE_EVIDENCE`. Selection: `COOKIE_NATIVE_STAGE=import-export`, `COOKIE_NATIVE_CASES=<comma-separated exact IDs>`. Candidate checks: `COOKIE_NATIVE_VERSION=2.0.20`, optional `COOKIE_NATIVE_TOOL_SHA`; source-commit binding requires both `COOKIE_NATIVE_CANDIDATE_SHA` and `COOKIE_NATIVE_BUILD_RECEIPT`. These latter two must describe the actual historical snapshot, not current main.

`--list-cases` runs offline before required browser paths and does not create an evidence directory/Profile. Real file selection is coordinated by `COOKIE_NATIVE_FILE_PICKER` with the owned CFT PID/path, followed by a read-only DOM filename/content check. It never uses `DOM.setFileInputFiles` or synthetic DOM events.

## Earlier batching freeze handoff (superseded by the evidence repair below)

- Original frozen driver SHA-256: `529a5798ba16178af84b9fa0a324994f750db8b4480cf6dc46b5bbeaa644aad1`. Following the pre-launch resource rejection, leader explicitly requested dynamic batching changes. Current re-frozen driver SHA-256: `0a6bd6b289215b1239badc0dd0b69724c2512853328fb824d78ca56830cc9054`. No edits during any browser run.
- Read-only identity checks: independent production Cookie Editor JSON and repository formal JSON both 2.0.19, byte-identical, SHA-256 `6a2b9b1d8ec3b9f16f76a09cde555d27c10318cdc93cc4660944db7a51b0e80e`. Catalog version/hash match; MV3 and import/export control markers match. Whole production tree is historical and is not claimed equal to current main.
- Baseline selection: `import-sample-file-preview,import-sample-paste-preview`; `COOKIE_NATIVE_VERSION=2.0.19`, `COOKIE_NATIVE_TARGET=https://chatgpt.com/`, `COOKIE_NATIVE_SAMPLE_FILE=<existing absolute local path>`. Sample path/content is not copied into this record. Baseline success means `BASELINE_REPRODUCTION_ONLY / PREVIEW_REJECTED`, with zero import writes, not a successful import.
- Candidate selection: sensitive `import-sample-file,import-sample-paste`, or fictional `import-json-bulk,import-json-file,import-overwrite,import-skipped-rows`. Sensitive and fictional cases cannot mix in one invocation. Default gap selection never implicitly includes sensitive samples.
- Leader's latest formal 2.0.20 tool SHA-256: `a5f9372d855becd9207774473dfcfefb40dee8071e9f029d3e6e75ea75819874` (reported by leader; new production/native execution remains leader-owned). Baseline stays the independently preserved 2.0.19 SHA above. AdBlock CFT 61460 remains occupied per leader; no further case-matrix expansion.
- Sample structure is 30 records; valid/expired counts are recomputed against current time at each preview. The earlier 27/3 split is historical, not an assertion. Original expiration timestamps are never changed. Crossing an expiry boundary during preview requires an explicit re-preview rather than blindly importing a stale plan.
- File and paste apply cases verify current preview counts, all visible row statuses, the dynamically declared batch approval count, exact native identities/values, expired rows unchanged, and site grants unchanged. A 17 KB sample may need about two batches, but no fixed approval count is asserted. Sample import is authorized by the user's latest instruction; preview cases never confirm mutation.
- The existing launcher still owns a fresh temporary Profile and cleans it when the invocation ends. This driver is acceptance evidence, not an import into the user's daily Chrome Profile.

## Validation and handoff

### Current freeze: import-invalid error observation and correction

- Leader reported real development bulk 12-row, file, overwrite and skipped-row cases PASS; `import-invalid` failed waiting for obsolete generic `预检失败`. These are leader-reported native observations and retain their original driver/output bindings. No whole-suite native rerun is required by this repair.
- Only the `import-invalid` branch changed: malformed `{invalid` must produce `#status.error` with JSON/format wording, hide tool/Host confirmation, preserve the exact textarea input in memory and leave native Cookies unchanged. Then the same open textarea receives one fictional corrected JSON row, previews one valid new Cookie, calls existing `confirmImport`, and verifies native data through that existing read-only helper. Returned evidence contains booleans/counts/metadata; input and Cookie values are not output.
- Removed the 501-row limit from this native branch per user direction; existing Node coverage owns that limit. Other native branches, development/production path guards, grants and file-click behavior are unchanged.
- Fresh targeted command only: `node --test --test-name-pattern='import-invalid preserves' tests/environment/cookie-editor-native-selection.test.mjs`: **1 PASS / 0 FAIL**. Regression also rejects an error without the error class and the obsolete generic wording, checks one panel opening/two submissions and metadata-only observations. Driver syntax and targeted diff checks PASS. The whole selection suite was not rerun.
- Frozen driver SHA-256: `6011768b7d65387cdc45523843c170b1bc7f153798e6d6ccdadcc55b3b07f956`.
- Frozen focused test SHA-256: `2a5dfcaa503713cbd5941ce01acac1314c2ffdb4c929d110707ff84556e29cbb`.
- No Chrome/CFT, build, watcher or Git-state operation performed. Leader owns the sensitive sample file/paste run and subsequent isolated `import-invalid` native verification; those new runs remain NOT_TESTED by this executor. Do not edit the driver during those runs.

### Earlier freeze: explicit development mode and native file-button click

- Latest user scope is development debugging. `COOKIE_NATIVE_MODE=development` explicitly permits only this repository's exact `dist/development`; both requested and resolved real paths are checked. Default mode remains production and retains the development-directory rejection. No arbitrary development output or Profile override was added.
- `--list-cases` discloses mode and `productionAcceptance`; development reports use `mode: headed-owned-macos-CFT-development`, `productionAcceptance: false` and `one-development-one-fresh-profile`. This is development debugging evidence, not production acceptance.
- Existing `dist/development/official-tools` is present, so no fallback or alternate installer is needed. Read-only checks passed: Cookie Editor 2.0.20, tool/catalog SHA-256 `a5f9372d855becd9207774473dfcfefb40dee8071e9f029d3e6e75ea75819874`, and SDK resource manifest hashes/bytes. Driver retains tool version/hash, whole extension fingerprint, sender, site grants, native ownership and drift checks, and now verifies the existing SDK resource manifest directly. No build or watcher started; watcher PID 23773 and ports 43119/43120 remain leader-owned.
- File inputs now use `x = r.x + Math.min(24, r.width / 2)`; all other targets retain their center point. Stable iframe/Host hit tests and `Input.dispatchMouseEvent` press/release are unchanged. The focused regression first failed at the old center, then passed with the requested left point; it also checks ordinary control centering and zero Input events when obstructed.
- Final focused tests: **23 PASS / 0 FAIL**; syntax and targeted diff checks PASS. Native case matrix is unchanged. Prior intermediate failures are superseded by this final run.
- Frozen driver SHA-256: `2a19bf3a268c1d7acfd4533c5aaad3664efc5916e46faa5ce0197a1334dba96d`.
- Frozen focused test SHA-256: `f8db3d3d606b1d02572f342dcd570c9ef48d1ef4f7244821471bb0af56ab98fe`.
- No browser/CFT, build, watcher, Git index, commit, branch or worktree operation performed. Development native run is leader-owned and NOT_TESTED by this executor. Earlier production run stopped by leader; preserve its evidence separately. New runs must bind this frozen driver, rather than upgrading old-run evidence.

### Earlier evidence serializer repair (superseded freeze)

- Leader reported short Cookie values such as `0` / `1` corrupting candidate SHA, timestamps and error locations through global string replacement. Only the driver, its focused selection test and this record changed; native case selection and batch/expiry behavior are unchanged.
- Structured `value` fields are redacted. Substring replacement is limited to `status`, `message` and `messages` free text. Hash, path, identity and timestamp metadata are preserved verbatim. Persisted frame/screenshot/candidate-check/close errors now use existing `evidenceError`, which omits assertion messages and preserves stack locations. Persistence remains counts/metadata only, with no input payloads; sensitive samples still have no CDP trace, input-step recording or screenshots.
- One regression with fictional short values first reproduced the corruption, then passed after the repair. It verifies unchanged SHA/path/time/store/partition metadata and stack line/column, plus structured value and free-text redaction.
- Fresh `node --test tests/environment/cookie-editor-native-selection.test.mjs`: **21 PASS / 0 FAIL**. Driver syntax and targeted `git diff --check`: PASS.
- Current frozen driver SHA-256: `c4c6e618d42d6ef5c0e992b5d060c0cadf469718fc2b4ace87518481aecc65cf`.
- Current focused test SHA-256: `836bfea3791117b41f275de05a51084ca0f23bea3a113c61133c140fe8329109`.
- Previously damaged reports are retained as historical failed evidence; their modified metadata cannot establish candidate identity. No report was rewritten. Native rerun remains leader-owned and NOT_TESTED by this executor. No CFT, build, branch/worktree, staging or commit operation occurred.

### Earlier batching freeze validation (superseded by the repair above)


- Reuse: prior native records stay historical. Import >10 / mixed row behavior and this modified driver are AFFECTED_INPUTS; no inherited native PASS.
- `node --test tests/environment/cookie-editor-native-selection.test.mjs`: **20 PASS / 0 FAIL** (exit 0), including dynamically declared batch confirmation counts, no replay after UNKNOWN, cancellation with a byte-limited first batch of 37/51 records, sample selection isolation, dynamic expiry and report redaction. Current test file SHA-256: `4396aa16b05cccd6e004aac12b3ce695a30f94552d1b1a7ad5a90d1906fe6321`. Earlier 10-row assumptions/results remain superseded by this latest run.
- `node --check tests/framework/cookie-editor-r33-native.mjs` and targeted `git diff --check`: PASS. Offline baseline `--list-cases`: correct file/paste-preview selection, one site grant, no values grant or cleanup mutation.
- Real CFT, installation/upgrade, Chrome permission dialog, new import cases: NOT_TESTED; leader owns execution and production identity binding.
- No browser, profile, port, dist, watcher or Git resource acquired. Driver handed off re-frozen to leader after the requested batch update. No business/SDK/Host changes, branch/worktree, commit or push. This new workstream file matches the existing `/docs/framework/workstreams/**` ignore rule; it exists locally and was not staged or force-added.

## Leader收尾：仅开发环境，2026-10-17

本子Agent未重新启动；leader接管原有driver/test写入。最新driver SHA-256 `91c21f0515e9618e5f154f95fa4a70fd8959593d37371dd627dba2446b0280e3`，定向测试文件SHA-256 `6fc9128ba279d00b90742d3d73d1393161d5f796c3847fd7c82f7a00a3305bed`。

最新冻结修正：精确预览baseline在选文件后读取；Host gutter原生滚轮；sample-only原生只读onChanged事件在内存核对值/属性（仅计数进入证据，已有正确写入后发生变化单列）；sampleMode执行路径跳过fixture清理；错误状态与真实data-state合同一致。7个新增/受影响单项回归逐项PASS，syntax和定向diff检查PASS，没有全套重复。

样本file/paste均PASS，实际25有效/5过期：文件25条正确原生结果、末尾24匹配/1随后变化；粘贴末尾25全部匹配。原report保留complete=false的fixture-only误清理断言，清理副作用未执行，后续执行守卫Node验证PASS，不重跑样本。import-invalid新原生运行complete=true、同框错误恢复和1条原生回读PASS。准确目录、失败历史及产品边界见主记录最新收尾节。所有自有CFT/Profile已清理，无production实测。
