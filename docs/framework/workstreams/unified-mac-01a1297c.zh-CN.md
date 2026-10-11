# 五项本地续接 · 01a1297c

日期：2026-10-11（Asia/Shanghai）。本轮仅现有 main；Go 与旧来源只读；不 push、release、分支、worktree、PR 或新聊天。源码、构建和共享原生资源串行操作，只读子 Agent 核对独立证据。

## 恢复现场

初查 Browser HEAD `2a7bc0be1a71c23890c6fb54f740a16a2a234955`。初始未提交 tracked 差异仅 `examples/programs/local-controller/src/extract.js`（ESM R2.2）和 `tests/environment/local-dev-preparation.test.mjs`（R155 观察器补丁）。原未跟踪 R16/R41/R155/ESM 文档、驱动与运行证据全部保留。fetch 后 origin/main 继续变化；随后观察到其他任务正在普通合并，MERGE_HEAD 为 `189b68f2cf252b692da63f79578b65652f23c059`。本轮不接管 index、不 pull、不提交并行暂存区。

R16 与 R41 已通过获授权的资源交接消息确认停止主动操作。R16 CFT PID1091、43129、专属 profile、Native instance 与 scoped Codex Home 保留，可在核验身份后接续。R155 CFT PID42366 属另一任务，不操作。根 dist/.wxt 当前未见 dev lock；仍不在根构建。43111 服务 PID91036 已有 owner，不替换。ESM R2.2 仍 active，源码写入窗口未交接；本轮先准备独立可审阅补丁与证据，源码 apply/commit 需等待明确单 writer 窗口。

## 初始复用与最小动作

| 实际功能 | 实施/证据等级 | 候选与 owner | 决定 | 剩余最小动作 |
|---|---|---|---|---|
| R16 官方 Codex | scoped Home、真实多轮/流式中断已 PASS；正式同包整体未完成 | 官方 0.159.2；旧诊断与正式2cc包分开；R16已交接资源 | REUSE_RECORDED_PASS / AFFECTED_INPUTS | 正式候选同包闭环、完整离线窗口被动网络观察、兼容与布局、Gate A–F独立复核 |
| R23 开发准备 | 缓存/队列/准备已实施；公开脱敏与Go桥未关闭 | 2a5d62be；R23已暂停释放资源 | REUSE_RECORDED_PASS / NOT_TESTED | 审阅现有FIFO补丁，落实Browser白名单；Go仅准备补丁，定位离线超时 |
| R22 Native Workspace | CSS错误保留、同编译器Demo、响应式/徽标已提交；旧Native读写/冲突/只读有效 | 4e0fc216、CSS dec0b1e8…；R22已释放 | REUSE_RECORDED_PASS / AFFECTED_INPUTS | 正常SIGINT收尾、最终200%完整截图、尚缺异常证据；真实ChatGPT保持NOT_TESTED |
| R4.1 阅读与笔记 | Range多点实现已有；高composer仍有缺口；受限页保存驱动漏selector | 旧a4f31102包；R41已交接 | AFFECTED_INPUTS / EVIDENCE_INCOMPLETE | composer几何修复与回归、真实Range、可信lazy触发、在途中断、受限页保存、最新工具矩阵 |
| R15.5 默认库 | Controller10次正确结果、Page6次默认库/隔离成功；Stop旧断言和每文档6world预算错配 | production8b8e0631…；R155另一任务idle但未交接CFT | REUSE_RECORDED_PASS / EVIDENCE_INCOMPLETE | 保留成功；驱动分文档补jquery/Stop/撤权、重启/ABI/故障包、真实性能；不操作其Profile |

所有原FAIL/SKIP/NOT_TESTED与receipt保留。旧包NATIVE不提升新包、AI E2E、F3或ZIP。整体603＋19/B05/campaign/baseline/F3/ZIP合同不由五项局部PASS关闭。**R16 R2 尚未完成最终验收。**

原始新增证据目录：`.runtime/tests/unified-mac-01a1297c/`。具体执行、身份和本地提交在后续追加，不把计划写成PASS。

## 本轮实施与验证追加

- 用户于本轮明确允许专家调整单 writer。本任务采用无重叠文件的并行源码修改；Git提交、构建、Profile/端口/Native仍串行。已向 ESM R2.2 聊天同步9个负责文件；其所有dirty、暂存及未跟踪文件保留。本轮未改AGENTS历史规则。
- `b463196fae871ab7f25be8a5c31b915c8acd8b9e` 已普通合并 origin `189b68f2cf252b692da63f79578b65652f23c059`，由另一聊天完成；本轮没有pull或修改其merge index。初始HEAD与fetch日志保留 `restore.json`。
- Browser公开preparation投影只保留状态、合法hash、有限计数/耗时及脱敏诊断；modern catalog与legacy projects.list均覆盖。只有Host明确声明数字 `localDevPreparationVersion=1` 才在注册后订阅状态，断连和关闭释放订阅，旧Host不会收到状态推送而误轮换epoch。
- Sidebar同epoch只刷新元数据，仍核对目录身份；新增异步屏障让延迟目录核对先于resolve/dispatch。删除、sourceId变化、断连、换epoch、源错误和状态查询失败均拒绝迟到派发；有限重复通知串行合并。`catalog-barrier-before-delayed-50ms.tap` 精确复现修复前零派发断言失败，全部失败日志保留。实际RPC已有超时边界；本轮不宣称任意永久挂起的mock都能自动收敛。
- 阅读目录使用整个composer form几何而非半屏高度回退到textarea。无足够空间容纳头部时网页浮层暂时隐藏，恢复空间后恢复；Side Panel目录仍可用。新增900/600×400组件几何与恢复回归；真实Range、物理视口和线上页面仍待补。阅读目录最新1.0.2、Quick Notes最新1.1.5，旧正式CFT的官方预览仍1.0.1，未确认旧版本安装。
- R41受限页笔记驱动修正为准确的 `#note-text` 输入目标；旧失败保持FAIL，未重标NATIVE_PASS。R155现有Stop期望已修为stopped，Page第7次失败对应每文档6次限制；不得删限制，尚需每文档分组补jQuery与负向断言。

### 新工程证据（仅本地NODE/组件，不称CI）

- 初始35项定向PASS；状态桥50项PASS；合并快照91项PASS，包括进入准备槽的FIFO补丁（原R155未提交测试观察器，借用为验证输入，未夹带提交）。后续独立复核发现竞态，修复后再次91项PASS；最终边界55项PASS/0FAIL/0SKIP，日志 `main-edge-regressions.tap`。测试驱动的空参数/完成方式/界面状态断言失误及中间FAIL均保留。
- `npm ci --ignore-scripts --no-audit --no-fund`在初始独立快照成功；合并快照固定package/lock输入未变，复用私有已安装依赖。check检查357文件通过，libs:list/check通过。
- 固定 `/opt/homebrew/Cellar/node/26.3.1/bin/node`、清空NODE_OPTIONS、仅授文件权限，原TCP离线探针准确返回 `ERR_ACCESS_DENIED`，`offline-build.log`；Node24未知net权限不能视为已拒绝TCP。来源：[Node25 net权限引入](https://nodejs.org/en/blog/release/v25.0.0)、[Node26权限](https://nodejs.org/download/release/v26.3.1/docs/api/cli.html#--allow-net)。这是离线构建NODE证据，不替代Sidebar/MCP全轮。
- 本任务私有快照 `npm run dev` 在43161/43162实际进入RUNNING后Ctrl+C自然退出，端口、锁、update文件及进程均释放，`dev-sigint.log`、`dev-sigint-cleanup.json`；根dist未操作。
- 中间双包：production `f7e81e0005f48aab7a16a55872e2c02534a0b9257236f2e1a6703a77ec7a8888`，SW320407/327680；development `e09f1cb8cfbf82cd033167ffe86aa91c4e92e05de969f849e9ddc6d9c610c304`。随后屏障/异常/极高composer改动使这些成为中间证据，**不冻结为最终**；旧receipt保留。

### Go只读审阅材料

`go-preparation-review.patch` 与 `go-preparation-review-identity.json` 为可审阅补丁，不已应用。补丁在Go桥保留脱敏preparation，纯状态更新不轮换aggregate epoch，目录authority变化仍轮换，并声明明确能力版本。原Go仓库未写入。本任务私有复制品中2项新增回归及现有R17租约/权限回归通过，原始日志 `go-preparation-review-fixed-runtime.log`、`go-preparation-review-integration.log`。这不算Go主工作区或Native通过；需授权后重核Go最新差异、应用和实际状态桥验收。

### 原生现场复核

重新核对受控PID1091、CFT155.0.8059.39、R16专属profile和原binary后，复用原精确guard激活一次。CUA在chrome://extensions详情确认ID `deofeaadofkjjocgijngcjnbeamamjob`、版本0.1.0、实际旧加载路径；打开正式Side Panel且未运行旧版本安装。旧包正式UI可达性不提升为新候选验收。43111旧owner服务已退出，本轮没有抢占。R155 PID42366未接管。

R16 Gate A复用已有官方独立Home登录、多轮/流式/Stop限定证据；Gate B新输入仍需最终同包；Gate C十RPC未闭合；Gate D旧诊断闭环保留但不替代新正式包；Gate E缺全窗口零模型请求观察，HTTPS无本轮Key继续NOT_TESTED；Gate F缺正式同包视觉/独立最终接受。真正ChatGPT会话未授权继续NOT_TESTED；知乎待实际访问；F3/ZIP安装继续NOT_TESTED。**R16 R2 尚未完成最终验收。**

## 当前远端输入核对

origin/main于实施期间前进至 `de1d21dbebb96e60745679c65a37457186852749`，共同基线189b68f2。新增R4.4当前回答自动跟随/上下文、R15.6统一库owner及对应工程/原生记录。`HEAD→origin`差异中的composer删除是两侧历史分歧，不据此认定远端回归。按merge-base核对当前dirty交集，仅本任务的view.js与placement测试；ESM dirty无远端文件重叠。先提交本任务9个文件及本工作流，再普通merge，保留本轮composer和remote自动跟随；旧中间双包不升级新输入。ESM已确认9文件无重叠且其尚未占用提交窗口。
