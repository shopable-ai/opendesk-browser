# OpenDesk Browser 续接：先收敛已有事实，严格限制执行范围

默认中文。继续 R16 R2、R23、R4.1、R22.1、R15.5 的剩余工作，但我怀疑上一轮过度执行。不要重新展开五条完整验收，也不要为补进度重复开发、构建、安装或跑同类用例。先复用证据、更新账本，再只推进一个明确缺口。已完成的相关输入没有变化就直接关闭。证据缺失与产品缺陷分开；无法推进的项准确保留 NOT_TESTED，不凑分或宣称整体成功。

## 范围及操作边界
Browser：/Users/shopme/Documents/workspace/opendesk-browser，现有 main。本任务已授权必要可逆修改、定向测试、证据整理和本地 Lore 提交。禁止新分支、Worktree、PR、新聊天、push/release、reset --hard、git clean、覆盖其他修改或历史证据、不新增依赖。不恢复采集、模板、分页、语音、任务树产品功能，不重建既有框架。
Go：/Users/shopme/Documents/workspace/opendesk，源码只读。四文件补丁已准备并在私人副本验证；原仓写入仍需单独明确授权，不因旧交接扩大权限。
我允许专家合理调整单 writer：可在归属清楚且文件不重叠时并行，Git index/commit、Chrome/Profile、Native 实例、端口、dist/ZIP仍须串行协调。不得永久改写 AGENTS 规则，不指挥其他任务停进程或改代码。
真实验收只用受控 CFT + 可信原生输入/CUA；CDP仅诊断及被动观察，不代跑业务，不 DOM 赋值、不 synthetic events、不假 Native ACK，不用个人敏感会话。任何历史 PID/端口/ID必须重核。

## 第一阶段：只读恢复，不启动测试或构建
读 AGENTS.md、docs/framework/testing-guide.md、docs/framework/parallel-development.md。
随后先读本轮专属工作流：
docs/framework/workstreams/unified-mac-01a1297c.zh-CN.md
本轮证据根：
.runtime/tests/unified-mac-01a1297c
本次交接：
.runtime/tests/unified-mac-01a1297c/handoff-current-git.json
.runtime/tests/unified-mac-01a1297c/continuation-handoff-20261011.json

核对 pwd/status/HEAD/origin/main/log/diff 与真实资源；必要时 fetch origin main，仅更新远端事实，不盲 pull。当前 Git index 有其他任务暂存的大量文件，不能 reset index、git add . 或提交整批暂存。先协调提交窗口及逐文件归属。
形成短表：实际功能、实施状态、证据等级、输入/候选身份、owner、REUSE_RECORDED_PASS/AFFECTED_INPUTS/EVIDENCE_INCOMPLETE/OWNED_ELSEWHERE/NOT_TESTED 或 NEEDS_REVIEW、最小剩余动作。
不要再次遍历全仓历史资料；只对仍有缺口的项读取对应最新工作流/正式合同/原始证据。

## 当前可靠事实
交接只读检查时 main=5d430297c1e2c38cf410d9cd74d542c19a846cc9，origin/main 本地引用=96812e6ed942fd256eb9f44d071093dc204ff554，ahead 2。新提交属其他任务；本轮没有 push。该引用不是实时远端保证。
本轮源码提交：
1dd3a3c2b2bb6d82e8075ce068a76b936ef87004；
普通整合提交 8a4d1cfdcd4d2b4c084a7744b97238a7cd0aefa6。
已实施：公开 preparation 字段白名单/脱敏及 capability 订阅；同 epoch 状态桥；Native admission 前的待处理 catalog 查询屏障；大 composer 避让；相关定向回归；受限页 Notes 驱动选择器修复。不要重复写 FIFO、状态桥或 composer 修复。定向 Node 证据及失败基线保存在证据根；不是 Native PASS。

实际已构建/测试的本轮 production 候选是 a735d30b7e6c1fd4919c687b1e2bc7d023403cbc 的普通文件系统快照：
.runtime/tests/unified-mac-01a1297c/candidate-final-a735d30b
实际输入：
candidate-final-a735d30b-inputs.json
双 receipt：
final-builds-a735d30b/build-production.json、build-development.json
production packageHash：
bf1aacb4847e7d37eeae07804ac088f67ddb048da32e34951b62306993c6a804
production ZIP SHA：
c3c9d80b15e7d744578379457dfe1654f014d2c1937a4f3310f77417ee6603b3
SW 320407 / 327680 字节。dev/CSS/ZIP其余 hash直接读 receipt 和包原文件，不推断。
libs:list/check、check、双 build、doctor strict、verify、size、双 pack 已有 PASS；不重跑。最终 npm test 原记录 1029 PASS / 2 FAIL / 2 SKIP：HTML入口审计已由 ESM owner 修复；mac helper 环境及 CDP业务输入不符合本轮要求，保留 FAIL/NEEDS_REVIEW，不盲重跑。
其他任务最新 ESM Node 原记录1039 PASS/1 SKIP/0 FAIL，只在相关输入/环境/断言一致时引用，不称 CI_PASS。入口：
docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md
.runtime/esm-r22-01a1296d/final-acceptance-index.json
其业务候选6f763f08；不能把旧候选或本轮a735的 Native PASS提升到最新main整体包。

## 可直接复用的新真实证据（都绑定 a735 production）
R15.5：
production-controller-native-receipt.json、controller-repeat-summary.json：
实际 Sidebar→Controller 10轮，upper="HELLO"、chunks=[[1,2],[3]]、date="2026-10-10"，每轮新runId/resultId，结果自有revision/sourceHash，retirement released。
controller-stop-summary.json、controller-stop-receipt.json：
真实 Native Stop，status=stopped，E_CANCELLED，Worker已释放；历史驱动错期待cancelled的FAIL保留。
page-repeat-summary.json：实际 USER_SCRIPT 10次成功；同文档第7次 E_PREVIEW_WORLD_LIMIT正确失败关闭，未提高次数限额。
page-jquery-summary.json、page-jquery-native-result-0.json：
指令按需 jQuery 3.7.1，实际回执/资源hash，MAIN全局隔离。
以上 Page是 preview，不是正式Task持久结果。尚缺正式Task、部分ready/重启/旧ABI/独立故障注入、真实冷/热分段性能，不能宣布R15.5整体完成。
历史15库消费者只读复核：
readonly-library-consumers.md。当前没有非空extensionId的生产Fingerprint分支或业务消费者，不为公开facade强行迁入旧库，不新增依赖。

R4.1：
正式阅读目录1.0.2已实际安装，不降级。
reading-range-six-after.json/png：真实 createRange+第6节跳转，多点可见。
reading-mdn-static-methods.json/png：真实 MDN Promise 技术文章，24标题；Native跳 Static methods，2 Range rect/6点可读。
真实知乎 https://zhuanlan.zhihu.com/p/26033573 仅欢迎页，无文章：reading-zhihu-actual.json/png，NOT_TESTED。ChatGPT无授权测试会话，NOT_TESTED。
Quick Notes最新1.1.5已通过原生文件选择器选入，停在导入预览；确认安装因前台PID防护失败，未安装、未保存，不能写PASS：
notes-file-path-ax.json、notes-import-preview-final-ax.json、notes-install-review-0.json/png、notes-install-confirm-native-input.json。
如下一步选Notes，仅一次 Native确认及实际保存/读回，不重复导入、目录安装和MDN跳转；先重核当前UI及包身份。
其余生命周期、旧版升级、SPA/流式/BFCache、手动中断负回执、Notes冲突、视觉/键盘/性能缺口按原合同保留。composer已有Node几何证据，不称真实ChatGPT通过。

R22.1：
正常Ctrl+C/SIGINT已闭合：dev-sigint.log、dev-sigint-cleanup.json，不重复。
真实200%完整物理viewport已拍：
workspace-production-actual-200-full-0.json/png、workspace-200-native-summary.json；
CSS600×403/DPR4、PNG2400×1614，当前断连/错误状态，不能称文件读写或完整视觉矩阵通过。175%误命名截图保留，不能改作200%。
真实Native文件读写仍阻塞：
安装App sha3f9c74b0a10c0e2379626e01885cb89b26b272cf56076d78cdc39acbf40539df曾真实连接，文件请求 E_FILES_TIMEOUT、后续CLI E_FILES_BUSY；没有派发写入。
ESM独立Go binary sha e7841c9be4e5b1292da0b22e1c63c02cbf8404fcdea86a2e1ad765aa2ad52e37：
实际来源802fb009+wire overlays，关键启动源码与961相同，不能仅父仓HEAD宣称完整961输入。
其Chrome子进程采样停dyld/__open，未进入Go，不能认定961源码bug。原生设置正常关闭，两个旧受控Host都已退出。
readonly-native-files-diagnosis.md、native-go-host-sample.txt、native-wire-host-sample.txt、native-wire-component-closure.json保留。
本任务目录同hash副本 browser help PASS：native-go-wire-copy-preflight.json；尚未尝试从该副本启动新的NativeHost，不自动开展新矩阵。
真实Native读/写/独立磁盘读回、冲突、只读、撤权、未知结果保护未补齐。真实ChatGPT绑定/回填/用户发送/答案读取NT。独立复核NOT_SCORED，局部证据不足以硬凑95分。

R23：
公开脱敏/同epoch Bridge的Browser修复已提交和定向PASS；FIFO观察器b9eb7540已由owner完成，观察进入准备槽而非beforeVerify，不重复编写。
Node24无--allow-net导致历史ETIMEDOUT；Node26.3.1离线helper已得到严格 ERR_ACCESS_DENIED / BUILT_UNVERIFIED，不能放宽断言，不能把helper升级为Sidebar整轮PASS。
Go preparation四文件补丁尚未写原仓：
go-preparation-review.patch、go-preparation-review-identity.json、
go-review-current-inputs.json、go-preparation-current-review.log。
当前961副本定向R17/Preparation PASS；补丁适用及验证方案准备好后集中请求Go原仓明确写入授权。
整轮Sidebar/Codex/MCP/Chrome lifecycle及离线权限仍按证据缺口保留。

R16 R2：
Gate A官方独立Home登录/多轮/流式Stop/MCP可复用有效旧证据；冷恢复SKIP保留。
Gate B本轮工程/package与局部Native，不是正式同包AI闭环。
Gate C旧十RPC不是Node CLI七项，不能宣称全部通过。
Gate D旧诊断包AI规划/采用/持久结果/保存及两次离线回放仅DIAGNOSTIC_AI_E2E；缺正式候选及完整本轮进程+扩展网络窗口。断开Native不证明无模型调用。
Gate E无本轮HTTPS Key，真实HTTPS推理NT，不找其他凭据、不新增第二模型门槛；原Node高级ESM/npm/MCP和migration fence合同保留。
Gate F正式320/360/420/520、200%、focus/aria/error/StopRunSave完整矩阵未关闭。
优先保留 /Users/shopme/Library/Application Support/OpenDesk/R16R2-01a128f3/codex-home；允许读/复制auth但不打印凭据、不改个人配置、不扩大版本。
完整闭环未过时必须明确：“R16 R2 尚未完成最终验收。”

## 仍在运行的本轮受控资源（需实时重核）
CFT主PID32890，launcher32887，CDP43169，Chrome155.0.8059.39。
Profile：/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-eeaqmirc
扩展injcnmlnfnmakhhfanldlafcaicokmna，version0.1.0，路径candidate-final-a735d30b/dist/production。
正式入口：
chrome-extension://injcnmlnfnmakhhfanldlafcaicokmna/native-agent/workspace.html
标准demo服务PID38832/43111，服务本轮快照examples/tasks，http://127.0.0.1:43111/demo-form.html。
旧R16/R155/其他UI Profile不是本轮资源，不接管。
本轮Native实例 unified-mac-01a1297c-wire 当前连接关闭，manifest/wrapper/自有文件授权仍保留；不要假释放或清理他人实例。
production-chrome-launch.json绑定实际身份；launcher退出会删除其自有临时Profile，不在证据保存前贸然关浏览器。
可信驱动 native-steps.py/native-semantic.py每步须精确PID/profile/binary/loadedPath和前台保护。macOS窗口会移动，重新读AX几何。native-control命令text（不是type）。旧硬编码picker不能用。本轮确认失败属于安全防护，不删防护。
CUA此前绑定旧PID1091，未证明绑定本轮前不能用它输入。CDP观察脚本可以读已有状态/截图，不改业务状态。

## 控制执行量与停止条件
1. 首轮仅事实复用/账本，报告真正仍缺的最多三个动作；不运行全量工程、重装、登录或重建候选。
2. 从中选一个最小动作直接完成，其余不并行扩张。发现故障先定位，只有代码/环境/观察方法明确变化才重试同一失败。
3. 证据齐全即关闭，不因新聊天、无关提交、mtime重新测试。驱动修正只重评已有正确回执，能不重跑就不重跑。
4. 新源码修改必须先讲具体文件、实际缺陷、通过条件，再做最小定向验证。无缺陷不制造修改。
5. 确实需要冻结新包时才集中构建一次；与provenance相关使用同一双构建OPENDESK_BUILD_EVIDENCE_DIR。snapshot核对实际文件，不用父仓HEAD替代输入。
6. 所有旧FAIL/SKIP/BLOCKED/NOT_TESTED/OUTCOME_UNKNOWN保留。NODE/CI、SOURCE/PACKAGE/RUNTIME/NATIVE、AI E2E、F3、ZIP等级不能提升。
7. 原603+19、B05、campaign、resource baseline、独立最终F3、ZIP安装一致性合同继续保留，局部通过不自动关闭整体。不要为达到95分补造矩阵或修改分母。
8. 如外部/授权/资源阻塞，只完成独立可推进工作并给具体阻塞+审阅材料；不要不停寻找更多可做任务。
9. 当前本轮尚未做最终记录本地提交；Git index大量他人暂存。先逐文件核对和协调，不能夹带提交。所有提交Lore，无push。
10. 最终报告简明给五项状态/Gate A–F、实际候选与main差异、复用依据、修改与必要验证、原始证据路径、外部NT/F3/ZIP、剩余最小动作。不要虚报整体成功。

需追溯时，原始任务入口仍在：
docs/framework/prompts/goal-r16-r2-local-macos-repair-acceptance.zh-CN.md
docs/framework/workstreams/r16-r2-macos-01a128f3.md
docs/framework/workstreams/local-dev-prebuild-r23.md
docs/framework/workstreams/reading-toc-r41-mac-01a12924.md
docs/framework/workstreams/native-workspace-tailwind-r22.zh-CN.md
docs/framework/workstreams/r155-final-mac-01a12969.md
仅为未关闭项按需读取对应正式合同及原始证据，不重做已确认闭合项。
