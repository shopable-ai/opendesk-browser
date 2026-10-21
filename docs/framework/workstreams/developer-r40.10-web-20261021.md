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
