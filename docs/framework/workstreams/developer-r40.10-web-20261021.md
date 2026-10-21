# Developer R40.10 Web ownership note (2026-10-21)

- Owner: Developer R40.10-web, GitHub-only, `main` only. No branch/worktree/PR.
- Write scope: `src/ui/script-editor.js`, `tests/environment/script-editor.test.mjs`, this evidence note. Shared RunHost, Authority, SDK, installations and build configuration are read-only.
- Source baseline blob: `eb300db7ab31db9f17dce338a46d7d606dac57ac`; test baseline blob: `8c55b0b21b499f8c1af7f576976975cd1e2626e3`. Main parent for this write: `d30ce1bf7dadb7e3f3ff4f26698757acb1acb566`.
- Product gap: status-only `update()` repeatedly patched static environment presentation; `sourceInput()` duplicated owner notifications and invalidated Controller on component-only edits; generic Stop cancellation called the component compiler twice or when unrelated Classic/Revision preparation was active.
- Change: memoize **presentation only** by execution intent; preserve live Run/Stop gate on every state change; active source owners notify on dependency/permission identity changes; Page Classic body-only edits additionally refresh controls because the resolver intentionally ignores unchanged dependency identity (Local/imported drafts also refresh explicitly); cancel the shared component compiler through its existing component owner and preserve the original run/preview generation fences.
- Regression assertions added: static mode fields retain projection identity during Controller Run/Result but change on Page selection; a cancelled component Candidate compile calls its compiler's cancel once and dispatches neither Controller nor Page Run.
- Evidence level: GitHub source review. Node tests, CI for this new commit, Chrome, Native and real provider are **NOT_TESTED** at commit creation. Previous unrelated workflow failures do not count as proof of this change. Follow-up must inspect exact commit checks before any release claim.
- Security: no changed RunHost/Authority, permission gesture, previewId, sourceHash, documentId, bindingId, Side Panel host, or installation contract. Failed/unknown effects never replayed.

- Stop ownership follow-up: Controller Draft Run and Revision now expose their own ESM-vs-Classic preparing kind (no new global runtime state). Exact ESM preparation triggers one component/compiler cancellation; Classic does not. Added both stale-save and no-cross-environment cancellation regression assertions. Browser execution remains untested.

- R40.10.1 source audit: Revision ESM/Classic previously reported Stop cancellation even after `commitControllerScript` had been submitted. Preserve the existing generation/source check until the final admission boundary, then clear `preparingKind` before the irreversible Host call; no new owner/state/transport. Added two gated-commit regressions (ESM and Classic) asserting no false cancel, no unrelated compiler cancellation, and single durable commit. Node, Chrome and Native execution remain **NOT_TESTED** until a relevant run completes.

- R40.10.1 P1 gate fix: the Controller ESM Run/Revision controls now observe the existing component owner's busy flag while advanced dependency inspection is in flight. Reuse the already-resolved `context==='controller-esm'` rather than reclassifying the source on each Run/Result projection. A gated-inspection regression covers disabled controls, single cancellation, and rejection of late preparation. Node and Chrome tests remain **NOT_TESTED** until executed.

- R40.10.1 P1 Local: prevent passive installed/Provider discovery and stale lookup reuse while the shared Run/Stop slot is busy; block already-open install confirmations without losing reviews. Reuse original `lookupToken` and `isBusy`, no second manager/state/Host. Added R25.1/R2.6 Local UI regressions; Node, CI, Chrome and Native remain **NOT_TESTED** until exact-run checks finish.

## R40.10.1-WEB 独立审计（当前 WEB_PARTIAL）

核查范围：截至本轮 Developer 最近提交 `5472ce5f925c07766c39a9dd91faa672fe92c509`，实际 GitHub `main` 还存在其他 Agent 的并行提交。源码/CI 状态必须以最终 HEAD 与路径 Blob 为准；本节不构成真实 Chrome/Native 验收。

### 原始七项目标（整体判断）

1. **主编辑器业务职责抽离：PARTIAL**。普通执行、结果、保存与本地执行已归所有者，但 `script-editor.js` 仍负责 Candidate 准备/保存、导入流程与多环境 UI 状态协调。
2. **四环境所有权：SOURCE_REVIEWED**。Controller: `controller-draft-run.js`、`controller-revision-view.js`；Page: `page-preview-flow.js` 与原依赖业务；React/Vue: 原有 `page-component-remote.js`、受管 Page Preview；Local: `local-project-run.js`、`local-project-install-ui.js`。真实运行未验证。
3. **普通 Run/Stop 直接性：SOURCE_REVIEWED**。编辑器 `start()` 直接分发到当前 Local/Page/Controller owner；`stop()` 保留原执行槽和受管组件归属；没有强制 Revision/Candidate/安装。
4. **重复状态/刷新实际减少：PARTIAL**。R40.10 已限制上下文刷新；R40.10.1 阻止 Local Run 触发无关被动安装查询，复用原 lookupToken 而非另建 Store。其余五项 `update()` 的触发仍有合法状态投影，不能无证据删除。
5. **无第二套 Runtime/Authority：PASS_SOURCE_ONLY**。未修改 `src/run-host.js`、权限/身份/原生协议，无新增 Context/Manager/Facade/EventBus。
6. **整体可维护性与代码减法：NOT_MET**。详见下方实际生产 diff，不能凭主文件行数或通过测试宣称已完成。
7. **权限/身份/高级功能保留：PARTIAL_EVIDENCE**。源码保留 sourceHash/documentId/previewId/runId/bindingId 与 Revision、Candidate、安装、结果入口；端到端回归尚待实际执行。

### P0–P4

- **P0 PARTIAL**：修复 `controller-revision-view.js` ESM/Classic 持久化请求已发送后 Stop 伪报“取消”；新增最后源码身份校验和不可逆提交边界。R40.10 旧 CI 的 `developer-release-smoke` 失败为 Web Clipper 固定源码 SHA 校验，`draft-and-saved-regression` 失败为 `workflow-r15.test.mjs` 旧源码断言；不得记为本轮 Developer 功能 FAIL，也不得记为本轮 PASS。新提交 Node 尚未通过实际证明。
- **P1 PARTIAL**：`componentRemote.update()` 在 Component/Controller ESM 及离开环境时负责高级依赖忙态；`dependencyReview.update()` 和 `dependencyInstaller.update()` 仅 Page/环境切换负责源码与授权投影；`controllerRevisions.update()` 负责版本按钮、当前草稿身份；`localInstaller.update()` 保留按钮和当前身份投影，普通 Run/Stop 不再启动新的被动 Provider/安装目录发现，旧查询由既有 token 隔离。Controller ESM 新增“高级依赖检查 busy → Run/Revision 禁用”。
- **P2 PARTIAL**：已有 `browserPrepareGeneration`、Controller generation、依赖锁版本、预览/文档及 Local 绑定隔离；新增保存提交前最后一次校验与 Local 查询代次栅栏；真正 ESM/Classic/React/Vue/Local 异步竞态执行证据仍待跑测试。
- **P3 NOT_TESTED**：新版本 `script-editor.test.mjs`、`script-editor-ui.test.mjs`、`page-candidate-source.test.mjs`、`page-component-remote.test.mjs`、`local-project-install-ui-r251.test.mjs`、`local-project-install-ui-r26.test.mjs` 及关联 Node/CI、真实 Chrome/Mac Native/Provider 必须独立报告。旧 `d6a9389` 的 developer-node Syntax/TSX 步骤曾 PASS，不能替代 R40.10.1。
- **P4 PARTIAL**：已对比生产 diff 与恢复原始所有者边界，但尚无关键 Node/真实环境验收；未达到停止条件或 95+ 质量目标。

### 可审计生产代码增减（不计测试和文档）

- 相对 R40.9 `99ebef86f3cc840c5326e087e9cbf331295222cc`，截止 `5472ce5`：`script-editor.js` 637→654（+17），`controller-draft-run.js` 135→136（+1），`controller-revision-view.js` 154→159（+5），`local-project-install-ui.js` 498→504（+6）；受影响四个生产文件 **增加 70、删除 41、净增加 29 行**。所以本轮不能宣称“真实整体代码减法完成”。
- R40.7 之前的参照提交 `fdfcf74c7fab97c6052a6145208b5017ed125252`：主编辑器 1231→654（减少 577 行）；包含当时已有及后续新增的十个代表性 Developer 执行/结果/依赖所有者文件，合计 1717→1995（**净增加 278 行**，不等于完整 Developer 代码基数）。说明职责确实被移动，**未证明整体生产行数下降**。
- 没有新增第二个 RunHost/Authority/Store；保留必要共享安全协调。任何剩余冗余需先用真实失效与调用证据确认，严禁为负行数删除门禁。

### 仍未关闭的阻塞

- 最新合并节点上新增三类回归测试未取得 CI 真实 PASS（Revision 提交边界、Controller ESM 高级检查、Local 忙态与迟到读回）。
- 主编辑器尚保留 Candidate/import 等高级任务协调，需继续证明业务必要性或在原 owner 安全收敛；不得搬移为第二套管理框架。
- 测试矩阵涵盖的真实 Chrome/Mac Native/Local Provider 不可在本轮 GitHub 源码审计中冒充已执行。保持 **WEB_PARTIAL**，不得提前交付 R40.11-LOCAL。

- R40.10.1 P0 CI (actual macOS Node evidence): `local-dev` job `119107600523` at `fd1e361` ended **270 PASS / 4 FAIL**. Three failures were immediate source change/cancellation or Page preview timing (`R40.9 ordinary Controller and Page edits...`, `R40.10 Page body-only...`, `R40.9 component Candidate...`), and one test fixture incorrectly used `f.view.getSnapshot()` instead of the actual projection `f.editor.model.getSnapshot()`. Root-cause source/input ID handlers were deferred by `on()`'s microtask; now call `sourceInput()` synchronously with the same `fail` boundary, preserving trusted Run click and immediate generation fence. Added exact-bytes immediate Controller Run test. **FIX_SUBMITTED / RETEST_PENDING**; do not yet mark these four PASS. GitHub job: https://github.com/shopable-ai/opendesk-browser/actions/runs/39565786146/job/119107600523.

## R40.10.2-WEB 复验与减法跟进（2026-10-21，WEB_PARTIAL）

- 写入 owner：Developer R40.10.2-web；仅 main；生产代码 `src/ui/script-editor.js`、定向测试 `tests/environment/script-editor.test.mjs` 和本证据记录。未触碰 RunHost/Authority/Native/业务扩展。
- P0 四项历史失败源于 `fd1e361` CI 的实际 270 PASS / 4 FAIL。后续 `73dab8a` 已同步源码 input/script-id 取消栅栏并修复 `f.editor.model.getSnapshot()` Fixture；这四项在 R40.10.2 新提交前仍缺精确 Node/CI PASS，标记 `FIX_SUBMITTED / RETEST_PENDING`，不是 DONE。
- P1 本次真实减法：`page-preview-tools` 只由当前执行环境决定，原每次 Run/Result 状态变化都 patch React Snapshot；现在归入已有的 `modeProjection` 环境变化分支，移除每轮重复 patch，不新增字段缓存、管理器或执行层。扩展原生产 Fixture 验证稳定 Run/Result 保持字段对象身份，切换 Page 时更新。安全 Run/Stop、Source/Preview 代次不变。
- 外部 CI 阻塞：`developer-release-smoke` 在 `73dab8a` 的 job `119115098565` 被 Web Markdown Clipper 固定来源 SHA 守卫阻断（`examples/sidebar-tools/web-markdown-clipper/trusted/policy.js`），不属本轮 Developer RunHost；未修改或弱化该守卫。
- 验证等级：修改提交前源代码审计；精确新 commit 的 Developer Node、Local install Node、Chrome、Mac Native、Provider 均待实际 CI/运行结果，不允许由源代码推断 PASS。完整七项目标继续 `WEB_PARTIAL`。

- R40.10.2 额外源码身份缺口与修复：`controller-draft-run.js` 的普通 JS 权限等待此前不具备 ESM/Classic 的最终 generation/source/id/world 校验，Stop 也不能取消纯 JS 等待。现将三种格式收敛到当前 Controller owner 同一个 admission 前 check，保留格式特定的 stale 错误码；纯 JS 等待标为原 preparation（非第二执行槽），Stop 只失效代次，原 Host 一旦提交绝不伪取消。新增 source/script-id/Stop 三个 gate 回归；CI/NODE 仍待本提交实际验证。

- R40.10.2 Developer layout 旧归属断言：精确历史 Node 日志（run `39568063901`，job `119115099038`，最终被取消）报告 `developer-layout.test.mjs` 首项失败，因测试仍在 `script-editor.js` 查找结果展示字面量。生产逻辑实际归 `controller-results-view.js`，由 `onStatus('results', ...)` 回调投影回原主界面；本次仅将测试源码检查改为当前真实结果 owner，原状态文案与主视图语义断言保留。回归结果待本提交 CI，取消的原 job 不能判为 PASS。
