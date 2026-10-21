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

## R40.10.2 最新证据整理（WEB_PARTIAL，不替代整体 CI PASS）

### 四项原始 P0 回归（真实 Node 子测试）

GitHub Developer Node run `39568063901`、job `119115099038`，SHA `73dab8a859e1d372a047967dcba0c8f8ec2a9bc3`：

- Controller ESM 编辑取消：`ok 63`。
- UI 投影 Fixture / Run-Result：`ok 65`。
- Page 空源码立即禁用 Run：`ok 67`。
- Page Preview 与 Component Candidate 结果隔离：`ok 136`。

这些是四条真实 TAP 通过记录；**整体 job 随后被取消，因此不是 CI_PASS**。同一旧 job 的 `developer-layout.test.mjs:13` 静态断言仍旧查找旧 `script-editor.js` 业务代码；`0758e2b` 仅更新该断言到原有的 `controller-results-view.js` 所有者，保留 `onStatus('results', ...)` 的实际回调与文案。

GitHub Local run `39568063907`、job `119115102664` 原始日志提供：Local 已打开的安装确认 `ok 39`；迟到安装查询隔离 `ok 64`；Run 禁止被动 Provider/catalog 查询 `ok 65`；Controller ESM 高级检查 `ok 187`；Revision ESM/Classic 提交边界 `ok 193`/`ok 194`。该工作流也不是整体 PASS，因为其它 Page 测试与取消状态仍存在。

### 独立阻塞

- `developer-release-smoke` 在相关提交被 `scripts/bundle-provenance.mjs` 的固定来源守卫阻断，准确文件为 `examples/sidebar-tools/web-markdown-clipper/trusted/policy.js`；属 Web Markdown Clipper 固定来源重签职责，本轮不改弱守卫。
- `tests/environment/page-installed-programs.test.mjs:646`：对已安装内置 Page 测试预期 `E_BUILTIN_VERSION_UNAVAILABLE`，收到 `E_HASH`；与 CORE 内置资源身份/哈希检查相关，未在本轮 Editor / RunHost 源码路径中修改，需该 Page 身份所有者单独审计，不能放宽 SHA 校验。

### 最新生产结构审计（相对 R40.9 `99ebef86` 至 R40.10.2 `3ee1086`）

- 四个受影响生产文件的真实 GitHub compare：**+87/-51，净 +36 行**（包括 R40.10、R40.10.1、R40.10.2）。`script-editor.js` +49/-29；`controller-draft-run.js` +17/-12；`controller-revision-view.js` +9/-4；`local-project-install-ui.js` +12/-6。
- `script-editor.js` 当前约 656 源码行；R40.7 以前约 1231 行。当前主入口仍掌握 Candidate 保存/加载与导入协调，**未证明原始七项目标全部完成，亦未证明完整 Developer 生产代码净下降**。
- 真实减法包括：环境不变的 Run/Result 不再重写 `page-preview-tools` React 静态投影；原 Controller Owner 三份最终 source/generation 校验收敛为一个共享内部 `check()`，并为普通 JS 权限等待补齐 Stop/身份 fence。没有新增 Host/Authority/Context/Manager/Store/EventBus。
- 四环境所有权：Controller `controller-draft-run` + `controller-revision-view` / `controller-results-view`；Page `page-preview-flow` + `page-dependencies` / `page-candidate-actions`；React/Vue `page-component-remote` 与原 Page 受管预览；Local `local-project` + `local-project-run` / `local-project-install-ui`。总入口继续负责选择、状态投影与共享安全协调。
- R40.10.2 新增三种普通 Controller JS 权限等待竞态测试与 React 环境静态投影检查；截至本段写入，**最新精确 SHA 仍无完成的全套 Developer/Local CI 结果**，Node 综合及真实 Chrome/Mac Native/Provider 不可宣称 PASS。仍为 `WEB_PARTIAL`，暂不交接 R40.11。

## R40.10.3-WEB：真实 CI 超时审计、测试资源释放与 UI 协调减法（2026-10-21，WEB_PARTIAL）

### 范围、目标和真实任务树
- **唯一写入分支 main**；本次 owner 是 Developer R40.10.3。写入文件：scripts/preview/react-sidebar-ssr.mjs（现有 SSR 测试辅助所有者）、src/ui/script-editor.js、tests/environment/script-editor.test.mjs、本工作记录。不修改 RunHost、Authority、Native、固定来源守卫。
- 原始产品目标：Controller JS/ESM/Classic、Page JS/ESM、React/Vue、Local Project 四环境均可从当前源码直接 Run；Stop 仅取消本 owner 的准备、运行、受管 UI。Local 使用真实 bindingId/Provider epoch 与冻结源码。Revision、Candidate、结果、下载、安装和权限保持独立。禁止第二套 Host/Authority/Runtime/Store。
- 任务树与关闭条件：
  - P0：核对两个历史 CI 的精确提交、15 分钟取消原因、Controller 普通 JS 权限等待三个栅栏；修复真实资源收尾，最新 NODE/CI 须正常退出才可关闭。
  - P1：区分 Web Clipper 固定来源、Page 内置版本身份、App CI profile 的外部 owner；不改变安全校验。
  - P2：移除可证实的跨环境/稳态 UI 重复刷新，保留忙态和权限协作；原测试加断言。
  - P3：Controller/Page/React-Vue/Local 执行与 Stop/撤权/未知效果按身份复核；未做真实 Chrome/Provider 不记 PASS。
  - P4：按真实生产范围统计新增/删除/净变化，保留 Candidate/import 协调未完成的证据。

### P0：精确 CI 日志证据
- Actions https://github.com/shopable-ai/opendesk-browser/actions/runs/39571726541 ，developer-node job 119127296495：checkout SHA 0758e2bf2eb44385b465daca6c0be6c913204e8a；顶层 TAP 输出截至 ok 177，随后约 15 分钟没有汇总便取消。
- Actions https://github.com/shopable-ai/opendesk-browser/actions/runs/39572804196 ，developer-node job 119130892079：checkout SHA 9c58fd6e6262037c49c5989de85270f66bd4da84；同样至 ok 177 后取消。实际工作流 .github/workflows/developer-r362.yml 明确 developer-node.timeout-minutes: 15。**不能据此宣称全部 177 项通过后 Node 正常退出，更不能认定某一个未释放对象已被精确定位。**任务完成时清理了 Node/esbuild 子进程；task-workbench.test.mjs 在日志中未输出自身顶层测试，待重新判别是输出缓冲还是测试进程未退出。
- 后一精确 SHA 的原始 Node 子测试：Controller 普通 JS 权限等待时源码编辑 ok 61、scriptId 修改 ok 62、Stop 取消 ok 63；普通 Controller/Page 编辑不误取消组件准备 ok 66，稳态 Run/Result UI 投影 ok 68。**仅承认该历史 SHA 的子测试 PASS**，不是本次提交的整体 CI_PASS。
- 最小测试辅助资源修复：a04d622b39e000696b9039b41e74d3f67c5d57f5。现有 React SSR Fixture 在一次性 esbuild.build 调用结束（成功或抛错）后 finally stop()，不建立生命周期管理器，不触碰生产执行入口。它是否修复 Node 退出仍需同输入新 CI 的最终退出状态确认。

### P1：外部阻塞不误归因
- 两次 developer-release-smoke 的原始失败仍为 scripts/bundle-provenance.mjs 固定 Web Markdown Clipper trusted/policy.js 字节身份检查；未绕过 SHA 或替独立业务 owner 改代码。
- 历史 page-installed-programs.test.mjs:646 的 E_BUILTIN_VERSION_UNAVAILABLE / E_HASH 与 E_APP_CI: cookie privileges require an explicit test profile 属 Page 内置资源、App CI 其他 owner；本轮没有改动，是否仍重现应按最新 CI 证据独立确认。

### P2/P3：真正删除重复协调，保留安全所有者
- 913927929d2384a175d31dcccd5074a3d7fa412e：主入口原先每次 update 都重新投影 page-component-status.hidden；现在仅在已有 modeProjection 环境变化时投影。组件消息与显隐仍由原 componentMessage 状态投影，无新 Store/Manager/EventBus。
- e07d961efb5844ecd1f686281bcff27cb4e80101：在现有 script-editor.test.mjs 的稳态 Run/Result 对象身份回归中加入 page-component-status 检查，保留全部原断言。**新精确 SHA 的 Node/CI 尚未完成**。
- 必要回调仍需保留：componentRemote.update 负责当前组件或 Controller ESM 依赖 busy；dependencyReview/Installer.update 管 Page 依赖及授权；localInstaller.update 管 Local 安装可用性；controllerRevisions.update 管 Controller 版本按钮和检查繁忙状态。普通 Run 不应刷新无关世界。
- 所有者边界：Controller＝controller-draft-run / controller-revision-view / controller-results-view；Page＝page-preview-flow / page-dependencies / page-candidate-actions；React/Vue＝page-component-remote + 原 Page 受管 Preview；Local＝local-project / local-project-run / local-project-install-ui。原 generation、sourceHash、previewId、documentId、runId、bindingId、Provider epoch、不可逆提交和未知效果仍须真实运行复核。主入口仍含 Candidate/import/加载协调。

### P4：精确维护复杂度数据、验收分级
- GitHub compare 从 R40.9 SHA 99ebef86f3cc840c5326e087e9cbf331295222cc 到本轮源码测试提交 e07d961efb5844ecd1f686281bcff27cb4e80101：四个实际受影响的生产文件 script-editor、controller-draft-run、controller-revision-view、local-project-install-ui，**新增 89、删除 52、净增加 37 行**。不将此标记为整体代码减法完成。测试专用 SSR helper 另为 +9/-2，不计生产。
- script-editor.js 历史精确行数：R40.7 前 SHA fdfcf74c7fab97c6052a6145208b5017ed125252 为 1231 行，R40.9 637 行，本次 e07d961 658 行；主文件职责确实拆出，**仍不能证明所有受影响 Developer 生产调用链整体净减少**。跨 R40.7 compare 超过 300 文件、不完整的 per-file diff 不能当作全部统计。
- 本轮新增执行基础设施和中间协调层为零；主文件中 Candidate/import 等高级协调保留，须由业务复现证明可迁走才继续减法。
- 本轮最新触发的 Developer workflow https://github.com/shopable-ai/opendesk-browser/actions/runs/39579032547 绑定 e07d961efb5844ecd1f686281bcff27cb4e80101，记录时 queued。必须等正常结论，不把排队当 PASS。
- 原始七目标：①主入口职责 PARTIAL；②四环境所有权 PARTIAL（SOURCE_REVIEWED）；③Run/Stop 直接性 PARTIAL（SOURCE_REVIEWED + 历史 TAP）；④重复协调删除 PARTIAL；⑤无第二套设施 PASS_SOURCE_ONLY；⑥整体生产代码和维护复杂度收敛 NOT_PROVEN；⑦安全与高级功能不退化 PARTIAL。当前新代码 NODE/CI 结论为 PENDING / NOT_TESTED，Chrome、Mac Native、真实 Provider 全为 NOT_TESTED。阶段继续 WEB_PARTIAL，不交付 R40.11-LOCAL。

## R40.10.4-WEB：Node 退出隔离诊断与当前交付边界（2026-10-21，WEB_PARTIAL）

### 原始目标与任务树
- 目标保持：当前源码选择 Controller JS/ESM/Classic、Page JS/ESM、React JSX/Vue SFC 或 Local Provider → Run → 原执行世界真实结果 → Stop；无需先存 Revision/Candidate/安装；原 RunHost/Authority/共享槽与 sourceHash、documentId、previewId、runId、bindingId/Provider epoch、未知效果和高级功能不退化。
- P0：先核查 R40.10.3 esbuild 资源释放修复的最新 CI，未正常退出则隔离具体测试文件与资源所有者；不允许增加 timeout、force exit 或删测试。
- P1：Web Clipper 固定源码守卫、Page 内置版本 E_HASH、App CI cookie profile 分别归其原业务 owner；不绕过校验。
- P2：核对剩余五个 owner.update() 的触发与 React Snapshot patch，只有证明无用才删除；保留 R40.10.3 page-component-status 减法。
- P3：对 Controller/Page/React-Vue/Local Run/Stop 身份边界及真实测试分层；不能用 Node Fixture 代替安装 Chrome、Mac Native、Provider。
- P4：对 R40.9 以来所有相关生产文件做 GitHub diff 统计，区分主文件缩小与整体维护复杂度下降。

### 新证据与本轮提交
- 最新 R40.10.3 核心 Run https://github.com/shopable-ai/opendesk-browser/actions/runs/39579032547 ，代码 SHA `e07d961efb5844ecd1f686281bcff27cb4e80101`；R40.10.4 复核时 developer-node / developer-release-smoke 均仍为 **queued**，没有运行证据。不能把已提交 `a04d622` 的 `esbuild.stop()` 视为确认消除 Node 卡住。
- 两次旧 CI（https://github.com/shopable-ai/opendesk-browser/actions/runs/39571726541 和 https://github.com/shopable-ai/opendesk-browser/actions/runs/39572804196 ）Node 仅打印 `ok 177` 后约 15 分钟超时取消；没有完整 TAP 汇总。取消清理发现 Node、esbuild 子进程，说明需查进程/资源收尾但不是确定的单一根因。
- 按最新六个源码文件的静态 test() 声明和旧 CI 实际 TAP 名称核对：`task-workbench.test.mjs` 51 条顶层声明均无可见 TAP；另外五个文件有输出。Node runner 可能延迟输出仍在运行文件的 TAP，**不能据此判断 51 条没有执行**。优先隔离此文件进程退出，再跑原六文件综合回归，以区分独立资源泄漏与跨文件问题。
- 直接提交 `f831b0918cbfd1900f5b3f035cf9a47368e3ee73`：仅修改 `.github/workflows/developer-r362.yml`，在原六文件 Node 命令前增加独立 `node --test tests/environment/task-workbench.test.mjs` 步骤；原综合测试不变，15 分钟 Job timeout 不变，不强制退出，不跳过断言、不涉及生产 RunHost/SDK/权限。该提交的 Node/CI 结论仍待实际 GitHub Actions 运行。
- 最新源代码比较 `e07d961...f831b091` 只触及上述 Developer workflow，没有修改此前四个 Developer 生产文件。因此 R40.9 至 R40.10.3 生产 +89/-52、净 +37 行仍为当前已知精确比较；不能称整体代码减法已完成。

### 七项目标及验收
1. 主编辑器职责收敛 **PARTIAL**：四环境已有独立 owner；Candidate/import 跨环境协调仍在主入口。
2. 四环境唯一业务所有者 **PARTIAL**：静态边界已核查；缺真实 Chrome/Provider 同步结果。
3. 当前源码直接 Run/Stop **PARTIAL**：既有入口、历史关键 TAP 有证据；最新总 CI 未正常退出。
4. 删除重复协调 **PARTIAL**：静态投影减法已有提交；其他 owner.update 尚需证明为冗余才可删。
5. 无第二套 Host/Authority/Runtime **PASS（源码范围）**：本轮未增加执行基础设施；不代表功能端到端 PASS。
6. 整体生产复杂度下降 **PARTIAL / NOT_PROVEN**：主文件 1231→658，但四生产文件比较净 +37；不能以主文件缩短替代整体证据。
7. 安全与高级功能无退化 **PARTIAL**：旧子测试通过及源码身份栅栏可见，最新综合 CI/真实运行尚未完成。

**当前证据标签**：`NODE_PASS=NOT_TESTED_ON_NEW_SHA`、`CI_PASS=NOT_TESTED_ON_NEW_SHA`、`CHROME_PASS=NOT_TESTED`、`NATIVE_PASS=NOT_TESTED`、`PROVIDER_PASS=NOT_TESTED`。保持 `WEB_PARTIAL`，不提前宣布 `WEB_IMPLEMENTED_LOCAL_VALIDATION_PENDING`。后续只按 GitHub Actions 真实结果在原所有者修复资源；无确证不为行数指标改动高风险产品代码。

## R40.10.5-WEB：Task Workbench 测试初始化与 Node 资源所有权修复（2026-10-21，WEB_PARTIAL）

### 原始目标与边界
- 原始七项均继承：① script-editor 总入口职责收敛；② Controller/Page/React-Vue/Local 四环境由已有 owner 唯一负责；③ 当前源码直接 Run/Stop；④ 删除被证实重复的协调；⑤ 原 Host/Authority/共享执行槽唯一；⑥整体维护复杂度下降；⑦保存、安装、结果、权限/身份/撤权及不可逆效果无退化。
- 本轮先 P0 Node 正常退出，不为 CI 绿灯改写 RunHost、权限、固定来源 guard 或 Task 执行路径。P2 减法及 P3 Chrome/Provider 须建立在真实 P0 结果后。

### P0：隔离日志揭示的真实根因与最小修复
- R40.10.4 隔离 run [39584545806](https://github.com/shopable-ai/opendesk-browser/actions/runs/39584545806)，绑定 SHA `f831b0918cbfd1900f5b3f035cf9a47368e3ee73`；Job developer-node `119170090057` 独立测试 51 项打印 **50 not ok、1 ok**，50 项都在 `task-workbench.js:787` 调用 `developerAction(developerView=null,...)` 处抛 `Cannot read properties of null (reading 'actions')`；之后无完整 TAP，15 分钟取消，清理了两个 Node 进程。不能归结为 esbuild.stop() 不生效，也不能记为 51/51 PASS。
- 正式 `src/ui/tool-shell.js` 已使用 `createDeveloperView()` 并向 Task Workbench 传入真实 `developerView`；旧 `task-workbench.test.mjs` 的 `make()` 仍使用无 Developer View 的 DOM Fixture。构造函数之前已建立 `BroadcastChannel`，异常发生在返回 dispose() 之前；失败实例不能归原 dispose 收尾，能够解释持续活动资源。
- 提交 [a29a42e](https://github.com/shopable-ai/opendesk-browser/commit/a29a42edc9e4c7d8219ef25673d52aaabc0c0dd6)：测试 Fixture 按正式 Side Panel 初始化现有 Developer View，并在原 Task Workbench dispose 后释放视图，不新增生产 UI/Runtime。
- 提交 [8bffbfe](https://github.com/shopable-ai/opendesk-browser/commit/8bffbfea5b29897fbed77a2929d3a5b796797d73)：将 Task Workbench 测试路径纳入既有 Developer 工作流 push filter，隔离测试和原六文件综合命令不变。
- 提交 [4dd37d3](https://github.com/shopable-ai/opendesk-browser/commit/4dd37d3726ccbacc3cdaeb872391b64852b3535a)：在 Task Workbench 原所有者内部，延后建立同一个 catalog BroadcastChannel，直到全部同步视图/控制器接线成功且将要返回带 dispose() 的实例；保留原订阅、refresh hint 和 close，不另设资源管理器。初始化同步失败不再预先持有此资源。
- 需要特别核验：旧 Task 测试大量断言仍引用历史 DOM Fake / Element.fire；本次只修复已证实的入口与资源故障，并**未**将这些旧断言预先认定为 React View PASS。若新日志出现测试语义不匹配，应按正式 React View owner 修复，不可删除/跳过测试或构造第二套产品 UI。

### 精确新 CI 及当前限制
- [Developer workflow run 39608550598](https://github.com/shopable-ai/opendesk-browser/actions/runs/39608550598)，精确 SHA `8bffbfea5b29897fbed77a2929d3a5b796797d73`：最近读取时 isolated Task Node **in_progress**，尚无完整 TAP/退出结论。独立 `developer-release-smoke` **FAIL**：`scripts/bundle-provenance.mjs` 固定来源守卫指向 `examples/sidebar-tools/adblock/trusted/policy.js`，外部 AdBlock owner，未绕过安全。
- [Developer workflow run 39609943170](https://github.com/shopable-ai/opendesk-browser/actions/runs/39609943170)，精确 SHA `4dd37d3726ccbacc3cdaeb872391b64852b3535a`：最近查询时 queued，不能冒充 NODE_PASS 或 CI_PASS。后续以实际各 Job 和完整 TAP 更新，不引用其它 main 提交替代。
- **P0=FIX_SUBMITTED / RETEST_IN_PROGRESS**，不是 CLOSED；P1 外部构建归责已证实；P2/P3/P4 新版完整安全/维护验收未完成；`CHROME_PASS`、`NATIVE_PASS`、`PROVIDER_PASS` 均 `NOT_TESTED`。七目标仍保持上一节的逐项 PARTIAL/PASS_SOURCE_ONLY/NOT_PROVEN 边界，不能提供 ≥95 的伪评分。阶段 **WEB_PARTIAL**。

### 复杂度与改动边界
- 本轮 Task Workbench 生产代码仅重新安排已有 BroadcastChannel 取得时点，保留原通道、监听与 dispose；测试 Fixture 复用真实 Developer View，工作流只补充路径触发；未触碰 Controller/Page/React-Vue/Local Run/Stop、基础 Authority、RunHost、依赖锁和持久 Store，也未迁移 Candidate/import。
- R40.9 至 R40.10.3 的四个 Developer 生产文件基准仍是 **+89/-52、净 +37 行**；这次 Task 资源修复不等于对完整 Developer 调用链完成代码减法，P4 保留 NOT_PROVEN。应先关闭准确 Node 失败，不因行数或无关 main 更新执行机械搬迁。

### R40.10.5 后续实证：第一轮修复未关闭 P0
- 精确 SHA `8bffbfea5b29897fbed77a2929d3a5b796797d73` 的 [run 39608550598](https://github.com/shopable-ai/opendesk-browser/actions/runs/39608550598) 已产生完整 **51 项逐项 TAP**，**3 ok / 48 not ok**，但仍无文件最终 `1..51 / # tests / # pass / # fail` 汇总，`developer-node` 15 分钟 `cancelled`，工作流不能视为 Node PASS。50 个统一构造错误消失，证实真实 Developer View 注入解决原入口异常；剩余 48 项为历史 DOM Fake 对已迁移 React View 的过期事件/DOM 投影断言或未完成 run，必须面向真实 React View 业务 owner 迁移，不得增加兼容 DOM 运行器、删除或跳过测试。
- 精确 SHA `4dd37d3726ccbacc3cdaeb872391b64852b3535a` 的 [run 39609943170](https://github.com/shopable-ai/opendesk-browser/actions/runs/39609943170) 已核实 `developer-release-smoke` **FAIL**，原因仍是 AdBlock trusted/policy.js 固定来源身份；`developer-node` 在最近核查时仍运行独立 Task 步骤，完整退出/综合结果待其真实终态，不能推定成功。
- 提交 [d3f8869](https://github.com/shopable-ai/opendesk-browser/commit/d3f88693b98cd9fcb143b17bd1bb88ece13af08a)：仅在 Task 测试原有收尾增加 `process.getActiveResourcesInfo()` 与活动句柄类型的诊断，保留所有断言与正常 Node 退出，**不强制 process.exit、不 unref、不延长 timeout**。诊断需由实际运行日志验证，当前不可当作成功证据。
- P0 当前结论：`ENTRY_FIX_VERIFIED_BY_TAP`、`NODE_PROCESS_EXIT=FAIL_ON_8bffbfe`、`CURRENT_SOURCE_EXIT=NOT_CONFIRMED`。P2 整体代码减法、P3 四环境真实端到端与 P4 全链复杂度减法尚不满足交付门槛。全局阶段保持 **WEB_PARTIAL**。


## R40.10.6-WEB：真实 React 测试迁移与 Node 退出关闭条件（2026-10-21，WEB_PARTIAL）

### 原始最高目标与七项不变约束
普通用户选择 Controller JS/ESM/Classic、Page JS/ESM、React JSX/Vue SFC 或 Local Provider，在当前编辑源码后直接 Run、看到真实结果并正确 Stop；不强迫保存 Revision、创建 Candidate 或正式安装。继续由 Controller、Page、Component、Local 四个已有业务 owner 执行，统一原 Host/Authority/共享执行槽；sourceHash、documentId、previewId、runId、bindingId、Provider epoch、源码/环境切换和撤权栅栏、不可逆提交、未知效果、持久结果、安装及下载不得退化。原始七项目标分别检查总入口职责、唯一业务所有权、Run/Stop 直接性、重复刷新删除、唯一基础设施、整体维护复杂度、安全及高级功能。

### P0：实证故障与修复提交
- 已完成历史精确 CI 复核：run 39584545806（f831b091）51 项 50 FAIL/1 PASS，原 developerView=null 构造异常，独立 Node 15 分钟取消。run 39608550598（8bffbfe）51 项 48 FAIL/3 PASS，构造错误被越过，但 Node 继续取消；run 39609943170（4dd37d3）已终结，48 FAIL/3 PASS，developer-node cancelled，六文件综合没有运行，developer-release-smoke 单独失败。均无完整 TAP 汇总和 Node 正常退出。
- d3f8869 活动资源诊断提交尚没有查询到精确 head SHA 的 Developer CI；上述旧 Jobs 亦未输出 TASK_WORKBENCH_EXIT_RESOURCES，**不能指认某个具体残留活动资源或声称资源已清理**。
- ef43a53、1fcebf0、e9b9546：旧 Task 测试开始直接调用正式 React myView.actions、myView.field/myView.data，迁移 Run、安装/授权、过滤、参数保存、持久结果、目录导航、原身份围栏等原业务断言。
- 0744490、710e857：覆盖连续 20 次实际 Task RunHost 测试驱动、撤权禁止请求权限及 admission、跨任务结果隔离、原 owner Stop、迟到结果、导入错误、源码审阅和敏感信息遮盖。保留真实 Run/Stop、结果身份的原语义；Node Fixture 不宣称 Chrome 实测。
- 9863c7e：目录 handoff 单次消费与错误 SHA/RunId 防护、任务管理撤销确认、导航 veto 与 Scheduled 所有权全部迁移现有 React 业务 action。
- e2bc95d、8f21fa3：只将原正式 React Navigation 的 Arrow/Home/End 计算提取为可测试的纯函数，并通过原 SSR 辅助编译出口导出；未建立新导航、Runtime 或 Store。
- 90de532：使用以上实际 React 键位决策及正式 React SSR 角色/激活属性，而不是旧 Fake 的 keyboard fire；真实 DOM 焦点及滚动必须由 Chrome 验证。
- f80b723：删除测试中的历史 Element 事件类、Element.fire、全局 Option 及模块级拼装 HTML；只留下必要的 Document 焦点请求记录，所有 51 个 test() 保留。大量测试不再借旧 HTML 节点层级伪装 React 组件。
- 这些提交全部是 SOURCE_FIX_COMMITTED；**没有获得当前最新 SHA 的完整单文件 Node TAP 和自然退出，也没有六文件综合 PASS**。首批 Developer 新 run 39615416195、后续 run 39617622368 最近查询均为 queued。不能以队列、源码迁移或断言条数代替通过证明。

### P1：外部构建归责
历史 developer-release-smoke 固定身份失败是 scripts/bundle-provenance.mjs 的 Trusted AdBlock source changed，文件 examples/sidebar-tools/adblock/trusted/policy.js。属于 AdBlock 原所有者，未修改或绕过 pin、SHA、Policy 和其它扩展源码。不能将其误报为 Developer Run/Stop 回归。

### P2/P3：生产代码与分层验证
- 因 P0 尚未关闭，**没有继续机械剪除** script-editor.js 的 Candidate/import，也未删除 componentRemote、dependencyReview、dependencyInstaller、localInstaller、controllerRevisions 的未证明冗余的 update；保留 R40.10.3 静态 React 投影减法与原安全状态。
- NODE_PASS=NOT_CONFIRMED；ISOLATED_NODE_PASS=PENDING；COMBINED_NODE_PASS=NOT_TESTED；CI_PASS=NOT_CONFIRMED；CHROME_PASS=NOT_TESTED；NATIVE_PASS=NOT_TESTED；PROVIDER_PASS=NOT_TESTED。四环境端到端源码 Run/Stop 未在本轮网页环境确证。需要真实 CI、Linux Chrome、Mac Chrome/Native/Provider 逐项验收。

### P4：可核实的生产维护变化（同基线逐文件行级 LCS）
相对 R40.9 99ebef86 至 R40.10.6 f80b723，数据不含测试与文档：
- src/ui/script-editor.js：636→657 行，新增 51 / 删除 30 / 净 +21。
- src/ui/controller-draft-run.js：134→139，+17/-12，净 +5。
- src/ui/controller-revision-view.js：153→158，+9/-4，净 +5。
- src/ui/local-project-install-ui.js：497→503，+12/-6，净 +6。
- 上述原四个文件合计 +89/-52，净 +37；不能称整体生产减法完成。
- src/ui/task-workbench.js：880→885，+10/-5，净 +5（Channel 所有权时点修复）。
- src/ui/react/tabs/navigation.tsx：59→64，+12/-7，净 +5（原处理器纯键位函数）。
- **上述六个生产文件合计 +111/-64，净 +47**，仅是这六个文件的可比集合，不能充当完整 Developer 业务树。
- 测试 task-workbench.test.mjs 1042→1080，+554/-516，净 +38；SSR 测试辅助 57→64，+10/-3，净 +7，均不计生产。R40.7 前主入口约 1231 行，当前约 657；主入口变短不等于整体生产代码收敛。

### 原始七项目标与交付边界
1. 主编辑器职责收敛 PARTIAL：Candidate/import 与必要共享安全协调仍在。
2. 四环境唯一业务 owner PARTIAL：源码归属明确，缺四环境真实回归。
3. 当前源码直接 Run/Stop PARTIAL：已有入口，最新完整 Node/Chrome 未通过。
4. 重复协调删除 PARTIAL：历史 Fake 测试事件系统已删，生产重复仍需证据。
5. 唯一执行 Host/Authority PASS_SOURCE_ONLY：未建立第二运行设施。
6. 整体生产维护复杂度 NOT_PROVEN：六文件净增加 47 行，不能虚称代码减法完成。
7. 权限、身份、Stop、结果及安装保护 PARTIAL：断言保留但仍待真实执行核验。

阶段保持 **WEB_PARTIAL**；只有精确最新代码的 51 项独立 Node 全部语义通过且自然退出、原六文件综合也自然退出、Developer CI 和四世界网页级身份/Stop 回归可复核后，才允许进入 WEB_IMPLEMENTED_LOCAL_VALIDATION_PENDING。Mac Native/Provider 属后续 R40.11-LOCAL；不得伪称六位专家 ≥95。


### R40.10.6 后续 CI 实证修订（以 Job 原始日志为准）
- 早期迁移提交 ef43a53 的 Developer run 39615416195、developer-node job 119274998544 最终 **cancelled**，旧测试仍大量失败，诊断显示 activeResources 有 PipeWrap、MessagePort，测试语义及 Node 退出均未关闭。
- 关键中间提交 9863c7e 的 [run 39617622368](https://github.com/shopable-ai/opendesk-browser/actions/runs/39617622368)、developer-node job 119282616115：**完整 TAP 1..51，45 PASS / 6 FAIL / 0 CANCELLED，约 887.95 ms，Node 自然退出（exit code 1 原因仅断言失败）**。诊断 TASK_WORKBENCH_EXIT_RESOURCES 仅有 PipeWrap、PipeWrap 和 Socket、Socket，未再出现 MessagePort。这是该精确中间版本的 **NODE_NATURAL_EXIT_VERIFIED_WITH_FAILED_ASSERTIONS**，不是 51/51 PASS，也不是六文件综合 PASS。
- 六项失败：#20/#21 当时尚未迁移的旧 Fake 键盘与焦点；#46–49 迁移时错误移除了 taskReviewHandoffKey 原导入。#20/#21 后由 90de532 改为正式 React 键位函数/状态与 SSR，Chrome 原生 focus 另记 NOT_TESTED；#46–49 在 [d702cd7](https://github.com/shopable-ai/opendesk-browser/commit/d702cd7306be28f88dac82c63b31ac5206d19a69) 补回原 taskReviewHandoffKey import。实际最新 SHA 的 51 项和六文件综合仍需新 CI 证明。
- 最新已结束的 developer-release-smoke job 119282615496（绑定 9863c7e）失败是固定 Marketplace 来源守卫 opendesk-fixed-marketplace 在 scripts/bundle-provenance.mjs:304 拒绝 examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js（Historical/user/vendor code cannot enter a privileged fixed bundle）；属 Prompt Shortcuts owner，**与旧 AdBlock trusted/policy.js 失败是不同精确 SHA 的不同外部阻塞**。两者均不能绕过 pin 或重新归咎 Developer Run/Stop。
- 因最新代码的最终隔离和六文件综合尚无实证，保留全局 **WEB_PARTIAL**。完整 TAP 与退出资源新证据使 P0 由“未知卡死”推进到“中间 SHA 进程正常退出，剩余断言已提交修复待复验”，**不提前标记 ISOLATED_NODE_PASS 或 COMBINED_NODE_PASS**。


## R40.10.7-WEB：Node 证据复用、主编辑器职责审计与 React 快照定向收敛

### 原始用户目标与七项永久约束

普通用户的核心路径仍为：选择 Controller JS/ESM/Classic、Page JS/ESM、React JSX/Vue SFC 或 Local Project → 编辑当前源码 → Run → 看真实结果 → Stop。普通 Run 不要求 Revision/Candidate/安装/项目目录扫描。只使用已有 RunHost、Authority、固定编译器、Page 受管挂载、Provider bindingId+epoch 与执行槽，保留来源身份、撤权、未知结果和不可逆提交保护。

七项验收维度继续为：①主编辑器只保留必要协调和 UI；②四环境业务 owner 唯一；③当前源码 Run/Stop 直接；④删重复刷新/快照；⑤单 RunHost/Authority/Host/SDK；⑥整体生产维护复杂度有证据下降；⑦安全和高级功能无退化。文件行数并不等于产品完成度。

### P0：真实 GitHub 身份与已通过 Node 证据（READBACK）

- 核对基线：d702cd7306be28f88dac82c63b31ac5206d19a69；Actions run https://github.com/shopable-ai/opendesk-browser/actions/runs/39620085344；developer-node job https://github.com/shopable-ai/opendesk-browser/actions/runs/39620085344/job/119290906186。
- 原始完整 TAP：Task Workbench 独立子进程 1..51、51 PASS、0 FAIL；原六文件综合 292 PASS、0 FAIL。两个 Node 进程均正常退出；日志诊断只有 PipeWrap/Socket，不存在 MessagePort。标注 NODE_PASS@d702cd7，而非新文件输入的 PASS。
- d702cd7 至本轮首次读取最新 main 的 compare 中，script-editor、Controller/Page/Local 运行 owner、六文件 Node 测试与 Developer 工作流未发生改动；无关 AGENTS / 其他扩展 / 其他 workflow 提交不使历史 Node 证据自动失效。
- R40.10.7 已写入的源码 commit：4ed8b19278509cf7c8a75232c2e31a87739cdb81，后续安全补丁 a64750e4d0b7084de44134880da49cfaa00eb197。新测试 commit：a141f3c3a001b291056beb5afd133d745fdaff98，后续读回覆盖 c5506fd0993b1f94c726e645463b08649f67460a。
- 源码 Blob：script-editor.js b12e444bf7e1fd15b045581ca7540e5df9e0adbf；develop-view.js 新 Blob 24bbd8c13cdd3e17fae3439c5a3f57ccbd0b048b；script-editor.test.mjs 新 Blob 896147044001aac6fb8b53a3d5047bf28189a01f。新改动提交后的完整 CI/TAP 尚未读到，标记 NODE_REGRESSION_PENDING，不可把 d702cd7 的 292/292 冒充为 c5506fd 的新测试 PASS。

### P0.1–P0.7：script-editor.js 精确职责审计

| 主编辑器原行号 | 现有业务 owner 与触发事件 | Controller 普通 Run 是否必要 | 决策及理由 |
|---|---|---|---|
| 178–250 update() | editor 判定 context；componentRemote / dependencyReview / dependencyInstaller / localInstaller / controllerRevisions 各自持有准备/检查/安装状态；Run、结果、权限回执和切换均可调用 | 只有共享执行槽、Run/Stop、当前身份门禁和 Controller Revision 状态必要；Page/Local 检查按上下文受限 | 保留安全门禁和 context 限制；R40.10.3 静态模式投影 key 不变。减少共享视图相同标量字段无效 React Snapshot 克隆，未移除必要 owner 更新；Page dependency projection 有对象/权限副作用，暂无证据可盲删 |
| 273–283 start() | Local→localRunner；Page/组件→pagePreviewFlow；其它→controllerRunner；可信手势同步归原执行 owner | 必要 | 保留：无额外 Manager、无 Revision/Candidate/安装前置条件 |
| 284–345 Candidate | pageCandidates 为 Page 保存 owner，componentRemote/browserPreparer 为编译 owner，pagePreviewFlow 保留真实预览；editor 只持源码模式/票据和 UI busy | 非必要，且不进入直接 Run | 保留：冻结 Candidate 需独立源码/编译身份、目标复验及不可逆保存边界；强行迁移将重复 store/state |
| 376–398 Page Candidate load | pageLibrary 发起获取；validatePageCandidateAuthoring、dependencyResolver 和 componentRemote 各保有验证或失效逻辑 | 非必要 | 保留前后两次 changed() 和编译代次，防止异步返回期间编辑器切换后覆盖当前内容 |
| 450–494 sourceInput()/world change | controllerRunner generation；browserPreparer/componentRemote；Page dependencyResolver；Classic readiness；各 owner 的局部失效 | 有关 Controller/source/scriptId 的同步栅栏必要 | 保留按世界的失效与仅对 Page Classic body-only 更新控件；不能为了减一次通知允许迟到执行 |
| 540–559 stop() | 原 pagePreviewFlow、localRunner、controllerRunner 以真实 ownedRunId/managed preview 判断可 Stop，组件 compiler 在准备中只取消一次 | 必要 | 保留：权限等待、不可逆提交和外部 owner 运行的 Stop 边界需统一安全分发 |
| 587–657 import/openRun/dispose | programSource 负责项目输入验证与来源快照；page-bundle validator 校验固定字节；localProject 负责 Provider；editor 负责导入后的当前世界/字段同步及资源收尾 | import 对普通 Run 非必要；公开接口/资源收尾必要 | 保留目前项目与 Page Bundle 分别校验，不能用同一后验 source equality 替换：importProject() 成功时会先切换可读源码 snapshot；简单合并易误判合法项目为 stale。未来仅有可靠测试时再消除重复分支 |

结论：主文件 **657 行、604 行非空且非独立 // 注释**；R40.7 前约 1231 行，缩小约 46.6%。热点主要是 Candidate、load/import 与动态状态投影；本轮没有证明 219 行可以删除。没有业务迁往新 Manager，未改主编辑器已有调用链。

### P1：整体 owner 与生产维护复杂度审计

调用关系：正式 React DevelopField → develop-view 的单一字段快照与动作 → script-editor 的共享 context/状态投影 → Controller Draft Run / Page Preview Flow / Component Remote+原 Compiler / Local Project Run 各自执行业务 → 原 RunHost/Authority/Host/SDK。结果/历史/下载由 Controller Results View + Run Artifact Download，Candidate 由 Page Candidate Actions + Page Library，导入字节由 Program Source 负责。未新增第二 Runtime、Store、Host、Manager、事件总线或执行入口。

本轮最小生产变更：在原 src/ui/develop-view.js 的 patch() 里，对“字段已有值与旧 snapshot 值均不变”的纯标量 patch 快速返回。对象/函数数据继续原样发布（防止原地可变状态丢通知），textContent 首次 textSet、源码编辑/Run/Stop 真实状态变化也必须发布；只增加五行，不增加持久状态、计时器、回调链或新抽象。

针对该变化新增 Node 回归（原 script-editor.test.mjs）：40 次相同 Run disabled 投影应为同一快照、零订阅通知；真实 Run gate 转换发布一次；相同 gate 后续无重复通知；data 对象可变更新必须通知；字段先由外部修改再请求同值投影时仍能读回。此为测试合同，尚待新精确 SHA 的真实 TAP。

下表是**同一套 21 个有代表性的生产文件在本轮最新源码的行数**（不代表全部 Developer 生产代码树）；R40.10.6 的同组总数 4128，本轮总数 4133，增加 5 行：

| 生产文件（src/ui/ 下；React 独立标出） | 本轮行数 | R40.10.7 + / - / 净变化 |
|---|---:|---:|
| script-editor.js | 657 | +0 / -0 / +0 |
| controller-draft-run.js | 139 | +0 / -0 / +0 |
| controller-revision-view.js | 158 | +0 / -0 / +0 |
| controller-results-view.js | 97 | +0 / -0 / +0 |
| controller-classic-readiness.js | 52 | +0 / -0 / +0 |
| page-preview-flow.js | 224 | +0 / -0 / +0 |
| page-dependencies.js | 337 | +0 / -0 / +0 |
| page-dependency-review.js | 150 | +0 / -0 / +0 |
| page-dependency-install.js | 170 | +0 / -0 / +0 |
| page-candidate-actions.js | 42 | +0 / -0 / +0 |
| page-program-library.js | 170 | +0 / -0 / +0 |
| page-component-remote.js | 316 | +0 / -0 / +0 |
| page-component-preparer.js | 115 | +0 / -0 / +0 |
| local-project.js | 400 | +0 / -0 / +0 |
| local-project-run.js | 184 | +0 / -0 / +0 |
| local-project-install-ui.js | 503 | +0 / -0 / +0 |
| program-source.js | 156 | +0 / -0 / +0 |
| run-artifact-download.js | 104 | +0 / -0 / +0 |
| static-esm-preparer.js | 53 | +0 / -0 / +0 |
| develop-view.js | 67 | +5 / -0 / +5 |
| react/tabs/develop.tsx | 39 | +0 / -0 / +0 |
| 合计（代表性样本，非完整业务树） | **4133** | **+5 / -0 / +5** |

另保留 R40.9→R40.10.6 六个不同生产文件的历史增减基准 +111/-64、净 +47；本轮新 view 不在那组六文件中。不得把 UI 通知/克隆减少等价为全生产 LOC 净减或整体维护质量 95+。当前确证的是“无新运行抽象、删掉无效标量投影的实际工作”，完整生产调用链净减少仍为 NOT_PROVEN。

### P2：四环境 Run/Stop 证据矩阵

| 环境与核心用户路径 | 本轮源码归属审计 | 历史 Node | 新视图输入回归 | Installed Chrome / Mac Native |
|---|---|---|---|---|
| Controller JS/ESM/Classic：草稿 Run / owned Stop / 结果 | SOURCE_REVIEWED | NODE_PASS@d702cd7 覆盖对应 Fixture（不代表真实 Chrome） | PENDING | NOT_TESTED |
| Page JS/ESM：documentId / 导航 / late result / managed Stop | SOURCE_REVIEWED | NODE_PASS@d702cd7 覆盖对应 Fixture | PENDING | NOT_TESTED |
| React JSX/Vue SFC：固定编译 / Page 受管 UI / Stop | SOURCE_REVIEWED | NODE_PASS@d702cd7 覆盖对应 Fixture | PENDING | NOT_TESTED |
| Local：Provider bindingId/epoch / 冻结源码 / owned Stop | SOURCE_REVIEWED | NODE_PASS@d702cd7 覆盖 Mock/Fixture | PENDING | NOT_TESTED（真实 Provider） |

旧 Node 使用了原完整 TAP，不是实际 Mac、真实 Provider 或生产 MV3 的使用证据。真实源码修改后的单独 Developer Node CI、Developer Chrome Shell smoke、四环境产品级 Run/Stop 实测仍各自等待独立证据。

### P3：发布 CI 与外部 blocker

- 同一个 d702cd7 的 developer-release-smoke Job 119290906594 未通过 Source and Developer Edition build；原日志报 scripts/bundle-provenance.mjs:304、examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js、opendesk-fixed-marketplace。属于 Prompt Shortcuts 固定来源身份的 owner，不是 Developer Node 或 Stop 断言失败。
- 历史 AdBlock trusted/policy.js 属另一精确早期构建阻塞。bundle-provenance.mjs 在随后 main 中已有其他 owner 修改（d702cd7 compare 显示 +7/-5），因此旧失败不等于最新提交的构建仍因同文件失败；必须看新 CI 日志。绝不禁用 Guard/伪造 Blob/pin，不改别的 Agent 扩展。

### P4：七项目标、当前进度、质量与下阶段

1. 主编辑器职责收敛 PARTIAL：执行 owner 已拆出，Candidate/import 和必要共享安全协调仍在。
2. 四环境唯一业务 owner PARTIAL：静态调用链唯一，四环境安装后的真实行为 NOT_TESTED。
3. 当前源码简单 Run/Stop PARTIAL：入口直达，Node Fixture 完整通过，但未做原生四世界实测。
4. 重复协调减法 PARTIAL：R40.10.3 稳态静态字段 guard 保留；本轮消除相同标量快照复制，其他依赖状态与通知不可无证据删。
5. 单 RunHost/Authority PASS_SOURCE_ONLY：本轮未引入第二设施。
6. 整体生产维护复杂度 PARTIAL/NOT_PROVEN：单一 view 的零重复快照路径有可测语义；生产代表性样本净 +5 行，整体删除量不足以证明全链下降。
7. 安全与高级功能 PARTIAL：身份/权限/Stop/未知回执/安装/历史源码合同保留，仍需新 Node 和原生实测。

保守六维证据评分（非正式验收）：产品一致性 86，四环境归属 84，协调简洁性 82，生产维护减法 75，身份权限 Stop 安全 86，真实交付证据 74；平均 81.2，最低 74，均未达到要求的 95+。拒绝对未测项授予 Chrome/Native/Provider PASS。阶段 **WEB_PARTIAL**。

R40.11-LOCAL 最短 Codex 验收入口（仅 Mac 本地执行）：在 /Users/shopme/Documents/workspace/opendesk-browser 查看 main HEAD 与本记录绑定源码；核实已有 npm run dev 的 dist/development 与扩展 ID/Native allowed_origins，不新建 watcher/Worktree；对 Controller JS/ESM/Classic、Page JS/ESM、React/Vue、真实 Local Provider 逐个用当前源码 Run→真实结果→Stop，并对源码中途变化、导航、Provider epoch、权限撤权及非 owner Stop 做最小验证；输出真实命令、日志、RunId/sourceHash/previewId/documentId/bindingId 和 PASS/FAIL/NOT_TESTED，不覆盖并行 Agent 产物。当前网页会话无法把未运行的 Mac 验收标记为通过。

### R40.10.7 后续 CI 时间顺序核对：旧 SHA 迟到不得降级新证据

- 另查到较晚结束的 Developer run https://github.com/shopable-ai/opendesk-browser/actions/runs/39622376092 （developer-node job 119298938236），Task Workbench 51 项中 41 PASS / 10 FAIL；该 run 绑定 SHA **710e857f776e31f4a77d74f672d7f3933903b03f**，不是最新 main，更不是 R40.10.7 生产代码。
- 精确 GitHub compare d702cd7...710e857 的结果：status=behind、ahead=0、behind=17、merge base=710e857。即 **710e857 是 d702cd7 前 17 个提交的旧祖先**；后结束的 CI 只是旧 SHA 迟到，不能据完成时间把旧 41/51 覆盖后续 d702cd7 的 51/51 与 292/292 PASS。
- 该旧 run 的 developer-release-smoke job 119298937775 在 Source and Developer Edition build 报 scripts/bundle-provenance.mjs 的 Web Clipper trusted/policy.js 固定来源守卫失败；这是较旧 SHA 的第三类外部 blocker，不得声称与 d702cd7 的 Prompt Shortcuts blocker 同一版本发生，也不得改其它扩展 guard。
- 当前 R40.10.7 开发新增 view/test Blob 的独立 CI 仍 **NOT_TESTED / 无可引用的新 Job**；已完成的 d702cd7 Node 成绩仍是未变化执行 owner 的可靠历史门槛，而不是新增 view 代码的绿灯。

### R40.10.7 精确新 CI TAP 实证：51/51 + 293/293

- 新变更的首次测试提交 `a141f3c3a001b291056beb5afd133d745fdaff98` 已获开发 Node Job 119310957497 **success**，Actions https://github.com/shopable-ai/opendesk-browser/actions/runs/39625904187；独立 Task Workbench 1..51 / 51 PASS、综合 293 PASS / 0 FAIL、0 CANCELLED，Node 无 MessagePort 且正常退出。新增测试 TAP `ok 178 - R40.10.7 unchanged scalar React field projections reuse snapshots without dropping real or mutable changes`。此提交还未含最终字段外部修改读回增强，不能替代后续提交的精确回归。
- 本轮最终生产补丁和测试的精确 SHA `c5506fd0993b1f94c726e645463b08649f67460a`：Actions https://github.com/shopable-ai/opendesk-browser/actions/runs/39625966312；developer-node job https://github.com/shopable-ai/opendesk-browser/actions/runs/39625966312/job/119311173285。原始日志显示独立 TAP **51 PASS / 0 FAIL / 0 CANCELLED**、综合 TAP **293 PASS / 0 FAIL / 0 CANCELLED**，新增标量投影测试 `ok 178`，两份资源诊断只有 PipeWrap/Socket，无 MessagePort；全部 11 个 step（含 Complete job）返回 success。**查询当时 GitHub job.status 仍为 in_progress、conclusion=null**；已确认精确 TAP 和步骤，但不得伪写最终 GitHub Job conclusion=success，待 API 最终完成后再更新。
- 同 SHA 的 developer-release-smoke job **119311173812** 已完成 failure：`Source and Developer Edition build` 步骤 `scripts/bundle-provenance.mjs:306` 因 `examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js` 触发 `[opendesk-fixed-marketplace] Historical/user/vendor code cannot enter a privileged fixed bundle`。这是当前精确 SHA 的真实外部发布 blocker，其他扩展负责人处理；Developer 未更改 guard、pin、可信代码。
- P0 Node 自然退出和本轮有变化的共享 React View 快照回归已具备精确 TAP 证据，状态 NODE_TAP_PASS@c5506fd；Developer Release/Installed MV3/真实四世界/Native/Provider 仍 **FAIL(外部构建) / NOT_TESTED**，综合交付状态仍 `WEB_PARTIAL`，不能宣称 95+ 或 `WEB_IMPLEMENTED_LOCAL_VALIDATION_PENDING`。
- Node 新增数据表示测试总数由 292 到 293，**不是**为通过而删减或更换旧 292 项；同一次独立 Node 51 项未变。没有缩小不可逆提交、Stop owner 和来源身份的安全保护。
