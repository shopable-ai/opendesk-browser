# 本地项目 R1.3 · 当前 Mac 验收

- Owner：Codex 01a143c5；2026-10-16；main；Browser 最小修复已实施，整体 R1.3 未通过。
- 目标：现有授权项目自动出现；保存自动准备但不执行；明确 Run 使用最新源码；Controller/Page 结果及 Stop 真实；异常状态可信。
- 初始 HEAD `91a5a1afa2d07518e8ea55c1bda7835db6e24928`，只读核查无本地独有提交后 fast-forward 到 `e355889799064b0d65497ef60aa76a79a349b3e7`。不新建 branch/worktree。
- 独占本轮人工操作资源：日常 Chrome 的标准测试页及 OpenDesk Side Panel；复用原 demo-form 服务 PID48261/43111、dev watcher PID36718/43119，绝不停止或覆盖其输出。其余 CFT/Profile 不操作。
- 当前模式：持续开发；Chrome 实际加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，0.1.0；Native Host PID84098；开发 WebSocket 活动连接。完整 runtime applied revision 尚待采集。
- 当前绑定 `local-v2-1463d1d597c22d263654916b`，Provider Epoch `f65c93cd-71b7-402b-a2c6-de5f89ae5dea`；初始源码 SHA `a135ac05ba6e32c65df9037388aa7a9d4f67bfd5dc8404e7a54d39865782cb88`。
- 拟写入：本记录；Browser 缺陷确认后再登记具体源文件和对应测试。测试临时修改仅限 `examples/programs/local-controller/src/extract.js`（原文/SHA先备份，结束逐字节恢复）；Page 使用现有测试授权及原项目，确认身份后再登记。Go只读，由独立explorer归因。
- 原始证据：`artifacts/local-project-r13-mac-01a143c5/`（日志、AX、截图、输入/结果身份；不提交个人浏览数据和授权配置）。
- 复用：先读 testing-guide、parallel-development、developer-project-catalog-stability-20261016 及原 local-controller 原始证据。历史268/268和局部Native不提升为本轮自动准备/Page/production/F3 PASS。
- 并行隔离：保留其他会话正在修改的 `docs/api/sidebar-local-projects.zh-CN.md`；不编辑其工作记录。Git索引/HEAD由leader串行操作；只暂存本轮路径。
- 构建：原watcher继续占有原dist；最终要求的静态构建在独立源码快照/输出与独立guard端口运行，不覆盖日常安装。检查相关输入前后身份。
- 已复现：真实保存version131后UI仍报告旧a135…，旧结果version1不变；明确Run返回version131，最近读取SHA为fa98941…；语法错误保存后UI仍旧已核验，明确Run正确E_PROJECT_SYNTAX拒绝。随后连续132/133/134保存，正在核对恢复。
- Browser必要修复写入范围扩展为 `src/ui/local-project.js`、`tests/environment/local-project-status-ui.test.mjs`：消费Provider规范的sourceRevision/artifactId，核对诊断和准备身份；不新增文件监听或编译机制。先加缺陷回归再修改。
- Page测试资源：复用前轮专用 `artifacts/developer-project-run-native-20261016/page/`（与真实业务隔离）；原CLI已退出，若通过既有官方CLI恢复仅持有本轮临时来源并在结束释放。不创建新的执行器或Native配置。

## 用户现在能否使用

| 真实操作 | 本轮结果 | 证据/限制 |
| --- | --- | --- |
| 已授权项目自动出现、重开侧栏恢复选择 | PASS | 01、33、34；无需重授权、刷新或选择即可启用 Run；完整 Chrome 重启未测 |
| 保存后自动展示最新准备状态 | FAIL | 02、07、10、15：哈希/状态仍停留于旧读取；错误要到明确 Run 才显示 |
| 保存不自动执行 | PASS（已测两类项目） | Controller 版本131及连续保存，Page v1→v2；网页/结果保留原运行版本 |
| 明确 Run 使用最新源码 | PASS（已测两类项目） | Controller 返回131、134；Page 显示 selected-page-r13-v2；均无需手动构建或刷新 |
| 语法错误拒绝运行、修复后再运行 | PASS（Controller） | 真正点击 Run 得到 E_PROJECT_SYNTAX；连续132/133/134保存修复后返回134。Page语法错误未测 |
| Page 重跑与 Stop | PASS | 16只见一个v2组件；18返回 preview-retired、instances=1、scope=managed-ui-only，组件消失 |
| Page 来源断开后安全保留 Stop | PASS | 17离线名称保留、Run禁用、Stop可用；18完成清理 |
| Controller 运行期间保存、Stop | PASS（已测场景） | 19→20保持运行且Run禁用；21→22停止并释放；32持久结果 stopped/E_CANCELLED |
| Chrome重启、多Sidebar/客户端竞争、切换文档、Provider断开期间快速保存 | NOT_TESTED | 不将侧栏重开提升为Chrome重启，不使用Mock替代 |
| 320/360/480px、长同名项目、完整焦点往返 | NOT_TESTED | 当前真实视口439 CSS px、DPR2；原生手柄操作没有改变视口，不虚报目标宽度PASS |

正常已授权且来源在线时，打开本地项目后需要 **1次明确 Run 点击**；不需要重复授权、手动编译或刷新。保存后的可见自动准备闭环仍失败，不能宣称最终体验完成。

## 最小 Browser 修复及验证边界

- `src/ui/local-project.js`：诊断优先显示规范 `sourceRevision`；准备身份绑定 `state/sourceRevision/sourceHash/artifactId`；resolve 返回的输入版本必须与捕获的已准备版本相同，即使输出源码SHA相同也拒绝版本漂移。
- `tests/environment/local-project-status-ui.test.mjs`：新增规范准备身份/诊断测试，以及相同输出字节、不同输入版本的拒绝测试；同时覆盖正常匹配版本不被拦截。
- `preparationIdentity()` 由现有安装UI的 `sourceCurrent()` 消费，负责使旧准备凭据失效；最终安装仍有独立检查。无新Compiler/Provider/授权存储/运行路径。
- 回归先红后绿；独立只读复核未发现新增安全或兼容性问题。由于当前Go没有传入准备状态，新增版本守卫的真实 capability 正向通路仍为 NOT_TESTED，不能把Node通过提升为Native通过。

## 真实环境与结果身份

- 扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`、0.1.0、Developer，实际目录 `dist/development`；demo `http://127.0.0.1:43111/demo-form.html`。完整路径和截图保留在原始证据。
- Native `/Applications/OpenDesk.app/Contents/MacOS/opendesk` SHA256 `2cd74b1bba8ebf0e25ed2b7569ea0ba9688cad68d7b5e03980da3e7d7644d285`；`opendesk-dev --doctor --json`确认同ID、Native授权和browserReady，CLI 0.1.0-r17.1；未安装第二Host/扩展、未改配对。
- 初始Provider Epoch `f65c93cd-71b7-402b-a2c6-de5f89ae5dea`；加入既有Page来源后 `4fd2136e-6a93-43dc-9507-2c6b4610209a`；退出后 `c856ba8b-b52d-4a21-9b84-071190f6e761`。
- Controller Binding `local-v2-1463d1d597c22d263654916b`；Page Binding `local-v2-fc9180cdccef89ee17f70d18`。

| 操作 | Run/Preview ID | 源码SHA256 | 结果身份/可信结果 |
| --- | --- | --- | --- |
| Controller131 | `f986c220-ef61-4527-ae40-5d1da5d3d2de` | `fa98941db3a6423e259fee38fbbf6ac33d25dbd3557450f3faf5fb6976db0dc9` | `ea01f1a9-d610-434c-9d19-88ddd960289b`，completed/ok，网页title/heading及version131 |
| Controller134 | `449015d8-937d-4015-bd66-3b44f3b5767f` | `83a751abc62617910e381803e8aa9ff8968d5a81b4286fc8f8ef3a700e612310` | `92c50539-8318-4140-9e82-593923bdeb4c`，completed/ok，version134 |
| Controller135 Stop | `6b2a527c-ef62-4c7e-8e84-aa70d3f3cc51` | `e7a6baf12b7a9f75604c9b564dcd79fab327cdf14400c06c19b5e833c6013773` | `f1c214a7-ab74-4b31-adde-2a96ab8a40db`，stopped/E_CANCELLED；slot available、currentRunId=null |
| Page v2 Stop | `8d55c95b-be80-4d70-a988-744199fcb071` | `0b10e0a3543cf47c01b15c997483533ecc99e92343b12f22bdf131f857151f3b` | preview-retired；opendesk.managed-ui.v1，instances=1，ok=true，managed-ui-only |

上述Run/Result身份由DevTools通过只读DOM和IndexedDB采集（26、30–32），没有写存储或派发业务命令。Page停止来自正式按钮/回执（18）。未取得v1 Preview ID，不补写。

### 持续开发、静态包与已应用版本

- 14/26采集的实际应用revision：`03ce689c843218bf07998be9ac9ee2287301e73c660c9dfd3dab3f1ff964a517`。
- 原watcher PID36718自行退出；本轮未终止它。确认43119/43120无人监听后，按原 `npm run dev` 恢复，仍写原 `dist/development`（日志 `restored-dev-watcher.log`），不切换扩展ID/路径。
- 恢复后输出revision `c038582d894119ccaf44b42c2aa96cd2626170e50fd2e4b7a019934bc62652d2`；Chrome实际提示“源码已编译；任务、原生请求或未知结果仍未释放，自动刷新已延后”。只读检查native ledger无OUTCOME_UNKNOWN，但commandJournal有13条阻塞状态，RunHost当前槽位已释放（28–30）。不删除历史未知副作用，不绕过守卫重装/强刷。
- **最新候选实际应用到Chrome：NOT_TESTED/被安全守卫阻塞**。侧栏重开恢复授权不能证明全扩展已切到新revision。production静态包安装亦未测。

## GOAL 2：Go最小修复合同（Browser不代做）

只读检查Go `master` HEAD `27765894058885ce497f60d52d32582a4e53f82a`及当前工作区；相关Go文件已有他人改动，本轮未修改、提交或推送。

1. 用户保存后Node已有准备产物，但Side Panel一直显示旧核验/哈希，语法错误也不主动显示。
2. `internal/browserbridge/host_dev_multi_unix.go` 的modernEntry/readCatalog/list聚合没有投影preparation；modern+legacy混合的legacyCatalog还会丢preparation/runtimeKind。纯legacy直通与resolve返回不能混为一谈。
3. `host_unix.go` authenticated未提供数值 `localDevPreparationVersion:1`，Node `native-agent/local-dev/provider.mjs` 仅严格匹配该能力时发送准备更新。聚合provider.changed无条件轮换epoch，也需区分准备更新与真实目录/租约变化。
4. 完整传递有界、去隐私的 `preparation.state/sourceRevision/sourceHash/artifactId` 及现有timings/cache计数。准备摘要的规范字段是sourceRevision，不能要求不存在的preparation.inputHash。resolve已有 `sourceRevision/inputHash/artifactId/timings/cacheHit` 在deliverDevReply保留，保持现有sourceHash/sourceVersion/chunk/容量与E_LIMIT/NOT_DISPATCHED语义。全部链路实现后才宣告能力。
5. 同一真实Node→socket→Go→Native→Sidebar验证：保存正常/语法错/修复/连续保存后状态和哈希自动更新，纯准备事件保持epoch，不自动执行；显式Run匹配最新sourceRevision/inputHash/sourceHash/artifactId。另覆盖modern+legacy混合、来源退役、撤权、迟到响应；Page离线Stop继续有效。

不能直接应用历史go-preparation-review.patch：旧基线、NOT_APPLIED/NATIVE_NOT_TESTED且会丢E_LIMIT细节。Go接续后需同候选真实Chrome复验，本轮不宣称该问题修复。

## 测试证据与交付门禁

- `targeted-baseline.log`：用户要求的两文件，138/138。
- `regression-red.log`：两个新增测试先失败；`regression-green.log`：2/2。`targeted-after-fix.log`首次139/140，发现fixture初始异步刷新竞争，显式发布项目快照后修正fixture，保留原失败。
- `related-regression.log`：Local Projects、Script Editor、连接/源码传输、Node准备/managedUI、NativeAgent/归属、RunHost等13文件，361/361；`install-regression.log`：安装准备/安装UI，32/32。分别是组件/Node证据。
- 所有静态构建在非Git工作区 `artifacts/local-project-r13-mac-01a143c5/build-workspace`、独立guard/输出执行；未覆盖原watcher。初轮外部node_modules软链接被来源校验拒绝，build/build:dev/verify失败全部保留。改用本机克隆副本，依赖9505条目SHA一致且无共享inode后，check/build/build:dev/verify各退出0。详见 `build-workspace/artifacts/independent-recovery-20261016T084015Z/REPORT.md`。
- 该快照初始示例version134已恢复；例子不是546项product inputs或模块图依赖，产物字节未变。并行main的tool.html/css变化已同步到快照并复验，未因无关HEAD变化重复已有测试。
- 最终静态复验 `build-workspace/artifacts/current-product-inputs-20261016T090043Z/REPORT.md`：check/build/build:dev/verify各退出0；546项product inputs、配置、实际bundle模块闭包及依赖复制字节均与当前原仓库一致，前后相关漂移0。输入聚合SHA `562371632db376ee528c6854e7670df077b00a049d1b68f423d3c055211922fa`。production Standard packageHash `9b7e92e139793f0ac4a6182e585768d7f4ee6341f9f0e9915cd2b1b276ad5106`；静态development Standard `d51176dbc19467b43ea3412b1beb49904c621642d72451842b3b03a785075e24`。不提升为当前Chrome已应用/production安装PASS。
- 35补采真正的E_PROJECT_SYNTAX拒绝截图；随后恢复原文，36→37明确Run返回version1、completed且资源已释放。08/09是早期坐标尝试，不能当作语法拒绝回执。
- 所有临时Controller/Page源码按备份字节恢复。Controller原SHA `385343aa301a671510e94e8c2ecfbd2f5d0039dd13174c7d58aceeb2c3c1e88c`；Page main `c115fd79ea815ec282db782c7742d5d80ea05a715cf13c54418902518af6929e`、version `ba14c44bb6bb7bcfcc633686d3a2585c6ba63bd43a44fb0c1027c2fe8680b12e`。只退出本轮Page CLI PID97966，原Controller PID85201与demo服务继续保留。
- 资源交接：恢复后的dev writer PID1938继续运行并监听43119/43120，仍使用原dist；本轮Page临时来源和DevTools已收尾，日常Chrome/Profile、原Controller、demo服务未关闭。源文件写入范围只含本轮两个文件和本记录；其他Agent的文档改动保留。Git索引事务由本轮leader在提交前重新核对，仅暂存这三个路径；提交/推送及Actions原始结果保存到本轮artifacts，不改写旧receipt。

## UX证据评分（保守验收分，整体不达95）

每维度5个可观察项，每个PASS=20；FAIL或NOT_TESTED不记通过分。分数只表示本轮证据覆盖的质量下限，不是产品完成百分比，也不将未测认定为缺陷。

| 维度 | 分数 | 五项逐项依据（P通过/F失败/N未测） |
| --- | ---: | --- |
| 操作效率 | 80 | P自动恢复项目；P无需重复授权；F保存后自动可见准备；P一次Run；P无需手动构建刷新 |
| 信息架构 | 80 | P当前项目；F最新准备准确；P主Run固定可见；P真实结果可见；P高级诊断折叠 |
| 状态准确性 | 60 | P连接/来源区分；F准备状态；P实际运行结果；P停止/释放；N未知业务结果恢复 |
| 错误恢复 | 60 | P语法错拒绝派发；F保存时主动报错；P修复后免刷新运行；P离线保留身份/Stop；NChrome重启恢复 |
| 安全可靠性 | 80 | P保存不执行；P明确Run最新源码；N跨文档/多客户端竞争；P所有权Stop；P未知记录阻止自动更新 |
| 一致性与可访问性 | 60 | P当前439px实际排版；PController/Page参数区分；P原生键盘开关/披露操作；N320/360/480px；N长同名项目/完整焦点 |

评分证据：01–04、10–18、19–22、26–34的AX/截图及本记录的限制；未达标原因首先是Go准备信息缺失，再是未测场景与全扩展更新阻塞。不得对外宣传95+或最终交付完成。
