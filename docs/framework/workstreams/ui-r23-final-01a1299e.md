# R23 Final 本机验收 · 01a1299e

2026-10-11，Asia/Shanghai。状态：PARTIAL_ACCEPTANCE / NOT_FULL_PASS。仅 main；不创建分支、Git worktree、PR，不推送或发布。

初查 HEAD `b463196fae871ab7f25be8a5c31b915c8acd8b9e`，origin/main `de1d21dbebb96e60745679c65a37457186852749`。main 有其他会话差异且已分叉，pull --ff-only 不安全，因此不执行。R23 77ea8c/f71e566/189b68f 已包含；b5cd1d5/c2545f5 未包含。

归属：本文件、本轮 evidence 目录与 .runtime/ui-r23-final-01a1299e。现有 dist/production、dist/development、node_modules、.wxt 不覆盖；根包内容已保存只读哈希清单。现有 CFT PID1091/R16、PID42366/R155 及 43111 服务不操作。Native 已有桥只读 status，不接管。

验证策略：root 执行只读 check/R23 定向测试；独立验证输入副本无 .git，不是分支或 worktree，只作为测试产物，对 main 当前工作树字节建立哈希绑定。npm ci/双构建/verify 在独立命名空间执行，不能将副本构建或旧根 dist 冒充用户要求的最终 main/dist 包。当前源包含其他 owner 的未提交输入，候选保持 provisional。真实测试使用新 CFT Profile、独立端口；Native 写盘仅在本轮专属受控目录且有真实授权回执时进行。

历史证据：R23 ui-r23.md 原记录仅 READ_PASS，构建/真实 Chrome/Native 为 NOT_TESTED，六项 NOT_SCORED；R21/R22 历史成功仅保留原身份，不提升为本轮 PASS。knowledge-inbox 由只读子任务核查 owner 与最新证据后再决定复测。

通过条件：同一输入与 packageHash 的双构建/verify、R23 定向检查、真实扩展 UI 矩阵与 Native 回执；六专项没有充分实测就保持 NOT_SCORED。

## 构建与定向组件结果

根 check PASS（357 文件）。根 R23/样式测试 9 PASS/2 FAIL：workspace-style 两例检测到根 dist 是旧 CSS dec0b1e8…，源 CSS 为 e59779da…；原失败保留。专属验证副本 npm ci、build、build:dev、verify PASS，构建后 R23/样式/包测试 21/21 PASS。未放宽预算。生产 SW 320407/327680 字节，余 7273；tool-shell.js 320282；Workspace CSS 28958；Settings CSS 2166；Tokens 812；design-system CSS 3306；tool-shell CSS 48924。生产 packageHash 98add03107436271a070735cc61c53100c7acbe7818ba8e16797a5caa2f98a31；开发 af159b6babad1e537473b5373e54caa280ba653507bd76c8dd4bdd8432696bc9。

缺少的 b5cd1d5 仅修改 CI 触发，c2545f5 仅追加 ui-r23.md 证据；产品输入与当前已含 R23 实现一致。本轮只读取 c2545f5 文档到独立 evidence，不改历史工作流，不宣称缺少提交已包含。

knowledge-inbox `:199`：只读子任务核对归档 components-final.tap 的对应 PASS（83/83）及 git-pull-20261011-01a12950/candidate-components.tap.gz（101/101），哈希匹配 manifest；当前测试/knowledge 核心输入未变。复用组件 PASS，不重复修复。原 CI 失败没有可读原始堆栈，最多10轮 setImmediate 等待两次异步 SHA 的时序风险仅是推断，不能声称修复。并行 reading-toc/view.js 布局变化与 sender 校验用例不相交。

Chrome：专属新 CFT PID12027，Profile 与启动参数见 chrome-launch.json；只读原生 App 绑定返回其他任务窗口，未对其输入，因此本轮不使用该含糊绑定。后续产品验收使用受控进程的原生 Chrome 测试驱动，所有 DOM evaluate 仅观察，不注入状态或事件。Native 写盘暂 NOT_TESTED：新包 ID 尚未与已授权目录的真实实例匹配。

## 主线变化与共享依赖执行失误

并行集成后 main 为 c878687b5ec3f25c2c3476e8993e265e28513c1e，五个指定 R23 提交均已包含。远端随后到 63cd39a3…，pull --ff-only 明确失败，未 merge/rebase/reset/push。source inputs 较首轮包变化，见 main-drift-after-build.json；首轮包结果保留原身份，重新建立 candidate-final 验证输入副本。

准备 final 副本时一次 npm ci cwd 指向根仓库，替换了共享 node_modules；这是本轮操作失误，违反保护共享测试资源的约束。final-npm-ci.log 保留实际执行结果；package.json/lock 无新增差异，WXT 仍0.21.4，两类根 dist 哈希检查仍一致；执行时未观察到根 build/dev 进程。不能证明其他正在运行任务完全未受影响，也不能假称恢复了原 node_modules 字节。后续 ci/build 只在 candidate-final，根依赖不再改动。

## 当前候选复用核查

final 输入副本来自 c878687b5ec3f25c2c3476e8993e265e28513c1e。主线随后到 a735d30b7e6c1fd4919c687b1e2bc7d023403cbc；final-main-reuse-review.json 逐项核对 build.sourceInputs，产品/构建输入差异为空，故复用同包验证，不重建不升格。最终生产包 bf1aacb4847e7d37eeae07804ac088f67ddb048da32e34951b62306993c6a804；开发 adc41c3572d3d7fd15b31b3ec4319934b09bc24386e5bdd73d9ef545857e2ef0。final check 358、双构建、verify、R23定向21/21通过。

真实 CFT 新 PID29104；新 Profile 和原生 Extensions.loadUnpacked 回执见 current-chrome/chrome-identity.json。实际扩展 ID bpmdkcmjeaeaijlpbhegenjajbaimlln，实际加载 candidate-final/dist/production，根 dist 未改。这是当前 main 产品输入绑定包的真实扩展测试；尚未在用户指定的根 dist/production 安装。

首轮矩阵 120/70 PASS/50 FAIL 中，50项是观察器错误地对独立任务目录检查5页签；原始FAIL保留，依据 tool-shell.js 独立目录分流合同改为真实toolId入口；新候选从工具安装确认与真实“新标签页”按钮进入知识收件箱，检查隔离iframe，不伪造tool storage。安装完成 activeElement 是无id的真实工具按钮（dataset.sidebarToolId=knowledge-inbox），不是焦点丢失；回归观察补充tag/label/dataset，未制造产品修复。


## 独立工具真实缺陷与最小修复

核对最新实现提交 `d56c8427`（shopable-ai）及 main 集成/归档负责人 thinkido；知识业务两文件修改前无其他会话差异，原负责人归档交接已完成。本轮没有修复历史 `:199` 的时序猜测；只修复真实独立工具页缺陷。

Chrome 155 中，独立 `knowledge-inbox` 扩展 TAB 的 `webNavigation.getFrame({tabId,frameId:0})` 返回 `null`，而 `runtime.getContexts` 有真实 TAB/documentId。原来将正常扩展页误判为“工具宿主文档已变化”，空态一直停在“正在读取”。修复 `src/knowledge/service.js`：按 TAB/contextType、tabId、URL、顶层 frameId、非 incognito、真实 sender.documentId 精确匹配唯一 live context。保留 Side Panel 原策略及工具包锁、授权、revision、撤权、页面捕获等边界，不信任 sandbox 自报身份。Chrome 官方 API 类型依据：[runtime.getContexts](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts)。

回归 `tests/environment/knowledge-inbox-r1.test.mjs` 先失败，再验证成功与文档替换/错误 tab/iframe/incognito/URL/contextType/缺失文档全部拒绝。`independent-host-before.tap` 保留失败，`knowledge-after-host-fix.tap` 15/15 PASS。最终副本专项 `fixed-targeted.tap` 36/36 PASS，包括原 `Workspace import rereads durable session under the uninstall lock, and retains failed handoffs`（历史 :199，本轮因插入回归位移）。它在本机仍通过；不能据此宣称 Linux 时序风险已修复。原 CI 失败和未经证实的异步 hash 等待猜测保留，不修改等待次数或忽略用例。

## 修复候选、资源及真实复测

固定输入为 `b9eb7540108ac565ec2172a428daa002ff686056` 加本轮两文件 diff，副本 `.runtime/ui-r23-final-01a1299e/candidate-fixed`。`fixed-main-reuse-review.json` 证明 sourceInputs 与 main 当前工作树完全一致。仅编译资源 `knowledge/knowledge-host.js` 变化（16466 B）；其余 HTML/JS/CSS 相同，复用 `current-chrome/viewport-matrix.json` 的 80/80 布局及既有键盘/AX/长文本/滚轮观测，不重跑无关全量。

复用依赖软链接最初被 `bundle-provenance` 正确拒绝为仓库外模块；两份失败日志及 failed receipt 保留。删除仅本轮创建的软链接，`candidate-fixed` 内重新 `npm ci` 后生产/开发构建与 verify 成功。没有放宽任何来源或预算检查。此前根目录 npm ci 误执行的事件仍保留：锁未改、dist 未改，但无法证明所有其他任务进程完全不受影响。

最终 CFT PID37672，独立 Profile `codex-cft-i7a0jbx2`，Chrome155.0.8059.39；`fixed-chrome/chrome-identity.json` 及 chrome://extensions 开发者模式详细信息记录实际 ID `ocnmfegmbacpipedfmmepecallahjfni`、加载路径和启用状态。通过原生 `Extensions.loadUnpacked` 加载的是 `/Users/shopme/Documents/workspace/opendesk-browser/.runtime/ui-r23-final-01a1299e/candidate-fixed/dist/production`，不是根目录 dist。真实 native Chrome 输入安装工具、打开独立页、刷新；无 DOM 写入、synthetic event、模拟 Native ack。用例 observer 使用 Emulation 调整 CSS viewport，Chrome tabs.setZoom/getZoom 为真实浏览器缩放，不用 CSS zoom 代替。

生产 packageHash `14af113c272d0c189de40351331941dfe669eeb0f21a0bf88a18c758db6b7b00`；开发 `6aff0f03d2519d5cc273d6b28ef1cd5c7901362f3461a698088f5b5a4191aeaa`。check358 PASS；npm ci、build、build:dev、verify PASS。生产整包1307663 B，固定JS1022641 B；SW320407 B、tool-shell.js320285 B、tool-shell.css48924 B、Workspace CSS28958 B、Settings CSS2166 B、design-system3306 B、tokens812 B。开发整包4671666 B（含maps）。SW预算327680 B，余7273 B，97.78%容量风险，未改预算。

独立工具布局10/10及五宽/两档zoom真实刷新10/10通过（`fixed-chrome/knowledge-state-matrix.json`，包含 iframe正文、宽度、实际zoom及截图）；Side Panel刷新出现“收件箱已刷新”和正常0/0空态，320 CSS px/200%截图保存。此前截图中的红色错误不再出现。旧80/80仅证明布局，不能拿原独立工具红色错误截图宣称交互PASS；失败截图已保留。

## 六专项与未验证边界

专家评分口径和依据见 `expert-scores.json`。数字只评价本轮已观察范围，不是覆盖率、功能完成率、F3、ZIP或整体PASS。同步后的R23工作流已列出六专项名称，因此最终沿用它们：视觉一致性95；交互与无障碍92；组件架构与维护性96；性能与产物体积、MV3安全与生命周期、功能回归与证据完整性均NOT_SCORED。此前自主划分的六个观察维度仅保留为补充测量，不能替换历史合同。不计算含未评分项的总分，也不宣称六项95+。

Native：新扩展ID无匹配已授权 Native实例/目录；旧R22授权与原始写盘证据不移植。现有桥只读status有 provider conflict，其他任务资源未接管。Settings/Workspace断联、禁用操作只是 UI 证据；当前候选文件打开、草稿编辑、显式保存、读回、冲突、撤权和断联后的写盘效果均 NOT_TESTED。没有真实文件操作回执，未用内存Demo代替。

root `dist/production` 40文件、development57文件哈希仍与初始相同（`root-dist-preservation-final.json`）；root dist加载NOT_TESTED。宽度通过CDP viewport override，而非逐档拖动实体侧栏；屏幕阅读器、全配色对比度、复杂工作流执行保留缺口。已拥有的三个 Profile 均按PID绑定关闭；其他 CFT/Native/43111服务未终止或删除。

提交前一次 fetch 完成；当时远端新 `879d0c03` 仅侧栏工具标准文档，本地main ahead24/behind1，ff-only条件不成立。未强行merge/rebase/reset；先前 pull --ff-only 的失败日志保留。五个R23提交都已在main包含。当前候选产品输入与远端新增文档无冲突，但 main 与 origin/main 未完全同步，当时构成集成阻断；下述最终快进复核已消除此项。仅提交本轮归属明确且定向/包/真实工具复测通过的文件，未经授权不推送或发布。


## 最终提交与身份闭合

只读子代理审查未发现授权边界放宽，见 `readonly-review.md`。源码与回归提交 `698409af1308bc9c49431d43889976df1138c3a8`（2文件，26新增/2删除），未包含其他owner文件。构建先于提交，`candidate-binding.json` 逐项从该提交读取 sourceInputs 校验全部吻合；这是构建字节与实际候选SHA的绑定，不改写旧Chrome/构建receipt。

并行集成者合入远端文档后 HEAD 到 `ca56eca31869f101919acac6a24235ae809dd180`，本轮再执行 `git pull --ff-only origin main` 返回 Already up to date，最终同步检查PASS（仅本地ahead提交）；原失败记录仍保留。五个指定R23提交均为候选祖先。root最终check358 PASS；当前产品/构建输入与已验证修复包没有差异，不重建。

最终检查发现初查的旧43111服务已退出，原Chrome基页ERR_CONNECTION_REFUSED并保存。另一统一验收owner此时已用PID38832启动相同标准demo-form服务；本轮绑定尝试EADDRINUSE立即失败，未替换或终止服务。只读核对其demo文件与main字节相同，实际新浏览器页正常显示Browser Test Lab（`fixture-reuse-review.json`），没有用失效基页声称RunHost通过。本轮三个独立CFT均已关闭，launcher临时Profile已清理；其他CFT PID1091/42366与新43111服务保持运行。

当前整体仍PARTIAL_ACCEPTANCE / NOT_FULL_PASS：Native真实写盘/读回/冲突/撤权、性能/内存、Linux时序场景、根dist加载、完整F3/ZIP尚无本轮成功证据。无推送、发布或远端main改写。


## 2026-10-11 真实 Native 续验及当前 main 冻结（01a1299e）

本段补充并取代本文件上方关于“本轮 Native 未测试”的当前结论，保留历史原文和失败。完整续验报告：`evidence/ui-r23-final-01a1299e/native-turn2/final-report.md`。当前 main 候选 e83738816d108506e13f28bd3d4e3be48ac30e4e，258构建输入完全一致；生产packageHash4f0de41aca0a1e7c80406e4bab0619d464898b7f5addaf933d813048aef28d06，真实扩展fahogihogbphclgicdghfelfikllgapk，加载candidate-main-current/dist/production。38/38定向组件、80/80布局复用与当前R24独立刷新10/10通过。真实Native文件打开/草稿/显式写盘/读回/冲突/断联/重连/撤权通过；保存和拒写都保留原始Native Port包与磁盘SHA。焦点与撤权控件缺陷分别由整合者提交b4094708、388b2535并完成本轮真实复测。

六专项：视觉95、交互/可访问性95、架构/可维护性96，性能、MV3完整生命周期、整体功能/证据完整性均NOT_SCORED。整体仍PARTIAL_ACCEPTANCE：根dist实际只读加载efhcmggbgamacpfhhmooelgdkepdcghh但属于OLD_DIST，原CSS失败保留；原Linux :199失败的同环境复核、性能和完整生命周期仍缺证。禁止以本段宣称整体PASS或最终F3。根40/57构建文件和原R22授权未改，自有Chrome/Profile与测试授权已清理。
