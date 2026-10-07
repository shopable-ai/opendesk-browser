# 阶段01测试计划（1.0.0）

状态：`planned`；`productResult: not-run`；产品测试执行数 **0**。本计划是test-engineer设计交付，只写本文件与 `test-plan.json`。M01–M11是技术门禁，M12商业证据独立 `pending`。

## 权威与适用边界

已读取v3、v4-01/common及当前contract/schema/semantics/state-machines、36 scenarios和迁移fixtures。逐输入SHA-256见JSON的inputSnapshots，含最新page-transaction/transaction-template/download-attempts。当前并行作者仍在修订，02A/02B开始前必须重核hash。本计划中的步骤、expected、测试签名、控制站点路径都不是已运行证据。

URL断言以semantics.md为准：数据字段resolve-url可跨origin，但仅HTTP(S)、无用户名密码；执行target、startUrl、next-link仍单origin。strict-url向量按resolutionScope分支核targetAllowed，不能把合法跨域数据链接判失败或误执行。旧migration说明的局部URL/CSV文字不能覆盖公共语义及新字节向量。fixture里的E_RECORD/E_TEMPLATE/E_TARGET等局部diagnostic与contract公共错误码分别记录；02B/03补映射，禁止悄悄扩大公共枚举。

## 测试层与普通Chrome矩阵

| 层 | 使用真实能力 | 能证明的范围 |
| --- | --- | --- |
| unit | 纯schema/语义/compiler/canonical/formatter/状态归约；可控clock与输入；mock只可证明该层局部逻辑 | 本层局部行为；不能替代普通Chrome门禁 |
| realIDB | 浏览器真实indexedDB连接、原生readwrite事务/abort/CAS/重开；不使用fake-indexeddb或内存仓库；每例独立测试DB，记录DB名/版本/事务提交次序 | 本层局部行为；不能替代普通Chrome门禁 |
| ordinaryChrome | 实际生产pack加载普通Google Chrome，工具窗口、SW、专用tab、原生downloads；控制站点后授权真实列表烟测 | 具体case/版本/pack的实测行为 |

| 浏览器记录ID | 计划目标 | 实际验收完整版本 | 当前状态 |
| --- | --- | --- | --- |
| B120 | 普通Google Chrome 120.x最低目标，逐API核验；较高版本不得代替120记录 | null，待执行取chrome://version | planned / not-run |
| B-STABLE | 执行当日当前Stable普通Google Chrome；完整版本和频道证据单列 | null，待执行取chrome://version与About/更新频道证据 | planned / not-run |

本机 `/Applications/Google Chrome.app` Info.plist读取到 `149.0.7827.55`；仅二进制元数据，没有验证当前Stable或加载产品。这一观测不能填成B-STABLE验收。CFT/headless、旧149下载探针和mock不替代普通Chrome。每版使用隔离测试profile，保存OS/架构、二进制路径/hash、extensionId与真实pack/source/lockfile/contract hash。

02B提供test-build专用事务/调用gap屏障，只控制顺序，不替换原生IDB/Chrome API。所有注入/独立download probe明确标记；最终生产包检查这些入口未暴露，并重新跑无屏障全旅程。IDB oncomplete及commitSeq决定stop/dispatch/seal先后，按钮时刻和sleep不是事务证明。关键竞态每版每个提交次序至少3个独立run，保留每次失败。自然SW闲置终止与主动终止分别记录，普通验收关闭DevTools且无保活心跳。

## 当前可运行的静态命令与02待提供命令

工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`。当前不存在package.json/生产npm scripts。现有下列命令已真实运行，退出码均0；只验证fixture/参考算法内部一致，产品仍not-run：

```sh
python3 contracts/fixtures/migration/verify.py
node contracts/fixtures/migration/reference-check.cjs
```

观测数量：3类迁移、29严格转换、19 URL、45 CSV公式安全、9模板拒绝；canonical模板hash `3475cba7ddc43506711b82a1865ae0228c056f074b45b364706322c057d681fa`。另外本计划JSON可用Python标准库检查：

```sh
python3 -m json.tool docs/contracts/test-plan.json > /dev/null
```

以下只是建议命令接口，全部 **planned-not-available**；不能现在复制执行，也不能报告已通过。02A/02B handoff必须换成真实脚本路径/参数/证据目录/退出码/控制服务与清理命令；03补领域case registry：

| 命令ID | 建议接口 | 交付用途 |
| --- | --- | --- |
| CMD-UNIT | `npm run test:unit -- --case <case-or-vector-id>` | schema/compiler/canonical/formatter/状态归约 |
| CMD-IDB | `npm run test:real-idb -- --case <case-id>` | 真实浏览器IDB/事务/CAS/重开，不能fake IDB |
| CMD-SITE | `npm run test:site -- --port 8765 --secondary-port 8766` | 计划控制站点和可操作屏障 |
| CMD-CHROME | `npm run test:chrome -- --browser-profile <B120\|B-STABLE> --chrome-binary <absolute-path> --case <case-id>` | 普通Chrome生产包或明确test-build的实际场景 |
| CMD-PACK | `npm run build && npm run pack && npm run test:pack` | 真实构建/资源/classic/manifest/动态代码扫描及审查 |

每case执行顺序：核输入hash→选指定layer与浏览器→启动对应控制fixture→按setup和case屏障步骤重现→保存实际observed及证据→比断言→清理该测试DB/profile/目标tab。未实现runner、无浏览器或原生故障未观测时记pending/not-run及原因。

## 最新实施拆分与测试owner

真人fork最新拆分优先于旧02称呼。02A只交基础环境，不包含运行可靠底座；依赖图为01 ready（含⑤图+复用清单）→02A→02B→03正式集成→04，03可在获准写域内做非集成准备。registry/提示由父交接更新，本作者不改其他文件。

| owner | 测试责任 | 不能替代的证据 |
| --- | --- | --- |
| 02A | 工程/build/pack/manifest、窗口入口/复用、classic静态注入槽与固定模块槽检查 | 无run/stop/IDB/download/授权可靠底座；静态槽不证明产品旅程 |
| 02B | RunHost/PagePort、sender/target/owner/journal/stop/退役、真实IDB/stage/seal、download attempt/receipt、签名授权、公共Chrome/故障屏障harness | 公共底座局部通过不替代03领域/最终组合闭环 |
| 03 | 选区/字段/UI、compiler/迁移、模板/预览、采集/分页/formatter、10页×100行压力fixture | 不另建owner/DB/PagePort，不改公共工程 |
| 04 | 两个普通Chrome版本分开真实记录、控制站点及一个授权真实列表、最终production pack集成 | 不用mock/静态/旧passed填产品passed |

所有case的ownerStages/testOwnership、fixture suites与命令provider均在JSON逐项更新；跨层case分别记录上述断言归属，不把可靠断言放02A。工程对应M02-classic-selection/M02-two-windows-race的窗口部分、M09-package-restricted的pack部分和M11静态槽；这些case的运行可靠部分仍归02B，领域交互归03。

### 压力ID修订记录

旧 `M06-stress-10x1000` → 新 `M06-stress-10x100`；旧控制fixture `C10x1000` → `C10x100`。旧10页×1000=10000目标为已纠正错误；当前实际目标10页×100=1000，路径rows=100、断言count1000、每页至少3批同步修订。JSON idChangeLedger明确记录旧ID供父registry更新，当前gate/case引用均用新ID。产品10000行硬上限及预算+1测试不受此修正影响。

## M01–M11逐门禁映射

| 门禁 | 设计测试映射 | 放行证据 |
| --- | --- | --- |
| M01 来源与行为 | `M01-source-readonly`, `confirmed-single-page`, `next-selector-was-memory-only`, `unsupported-config` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M02 真实包与选区 | `M02-classic-selection`, `M02-two-windows-race`, `M11-authorized-real-list` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M03 模板一致性 | `template-reject`, `template-falsy-long-notitle`, `M03-revision-cas`, `M03-css-missing-empty`, `M11-authorized-real-list`, `confirmed-single-page`, `next-selector-was-memory-only`, `unsupported-config`, `NV-T01`, `NV-T02`, `NV-T03`, `NV-T04`, `NV-T05`, `NV-T06`, `NV-T07`, `NV-T08`, `NV-T09`, `NV-T10`, `NV-T11`, `NV-T12`, `NV-T13`, `NV-T14`, `NV-T15`, `NV-T16`, `NV-T17`, `NV-T18`, `NV-T19`, `NV-T20`, `NV-T21`, `NV-T22`, `NV-T23`, `NV-T24`, `NV-T25`, `NV-T26`, `NV-T27`, `NV-T28`, `NV-T29`, `NV-T30`, `NV-T31`, `NV-T32`, `NV-T33`, `NV-T34`, `NV-T35`, `NV-T36`, `NV-T37`, `NV-T38`, `NV-T39`, `NV-T40`, `suite:strict-conversion`, `suite:strict-url`, `suite:template-rejection` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M04 重复执行 | `template-falsy-long-notitle`, `run-isolation-pagination`, `M06-stress-10x100`, `M11-authorized-real-list`, `confirmed-single-page`, `NV-T01`, `NV-T02`, `NV-T03`, `NV-T04`, `NV-T05`, `NV-T06`, `NV-T07`, `NV-T08`, `NV-T09`, `NV-T10`, `NV-T11`, `NV-T12`, `NV-T13`, `NV-T14`, `NV-T15`, `NV-T16`, `NV-T17`, `NV-T18`, `NV-T19`, `NV-T20`, `NV-T21`, `NV-T22`, `NV-T23`, `NV-T24`, `NV-T25`, `NV-T26`, `NV-T27`, `NV-T28`, `NV-T29`, `NV-T30`, `NV-T31`, `NV-T32`, `NV-T33`, `NV-T34`, `NV-T35`, `NV-T36`, `NV-T37`, `NV-T38`, `NV-T39`, `NV-T40`, `suite:strict-conversion` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M05 分页与上限 | `run-isolation-pagination`, `pagination-signature`, `budget-plus-one`, `M03-css-missing-empty`, `M05-end-empty-evidence`, `M06-stress-10x100`, `M06-backpressure-byte-limits`, `M10-free-boundaries`, `M11-authorized-real-list`, `next-selector-was-memory-only`, `suite:strict-url` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M06 事务与背压 | `three-batch-last-fails`, `three-batch-seal`, `stop-before-seal`, `seal-before-stop`, `stage-duplicate`, `stage-digest-conflict`, `seal-missing-batch`, `seal-duplicate`, `budget-plus-one`, `M05-end-empty-evidence`, `M06-stress-10x100`, `M06-backpressure-byte-limits`, `M06-seal-validation-watermark`, `FX-PAGE-lastBatchFailure`, `FX-PAGE-allSealed`, `FX-PAGE-stopFirst`, `FX-PAGE-sealFirst`, `FX-PAGE-duplicateStage`, `FX-PAGE-digestConflict` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M07 停止与中断 | `stop-first`, `dispatch-first`, `dispatch-call-gap`, `epoch-late-reply`, `lease-no-takeover`, `retire-unverified`, `retire-release`, `stop-before-seal`, `seal-before-stop`, `M07-host-loss-sw-reconnect`, `M07-completion-stop-order`, `M07-source-target-retirement`, `M10-approved-run-snapshot`, `M11-authorized-real-list`, `FX-PAGE-stopFirst`, `FX-PAGE-sealFirst` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M08 交付与回执 | `download-id-start`, `download-complete`, `download-interrupted`, `download-zero`, `download-one`, `download-many`, `download-host-close-after-complete`, `download-host-close-before-terminal`, `download-deadline-late-complete`, `download-reexport-isolation`, `download-abandon-tombstone`, `download-multivolume`, `M06-stress-10x100`, `M06-seal-validation-watermark`, `M08-format-byte-volume`, `M08-download-dispatch-gap`, `M08-mapping-identity-time`, `M08-known-id-deadline-late`, `M10-approved-run-snapshot`, `M11-authorized-real-list`, `confirmed-single-page`, `NV-T01`, `NV-T02`, `NV-T03`, `NV-T04`, `NV-T05`, `NV-T06`, `NV-T07`, `NV-T08`, `NV-T09`, `NV-T10`, `NV-T11`, `NV-T12`, `NV-T13`, `NV-T14`, `NV-T15`, `NV-T16`, `NV-T17`, `NV-T18`, `NV-T19`, `NV-T20`, `NV-T21`, `NV-T22`, `NV-T23`, `NV-T24`, `NV-T25`, `NV-T26`, `NV-T27`, `NV-T28`, `NV-T29`, `NV-T30`, `NV-T31`, `NV-T32`, `NV-T33`, `NV-T34`, `NV-T35`, `NV-T36`, `NV-T37`, `NV-T38`, `NV-T39`, `NV-T40`, `suite:strict-conversion`, `suite:csv-formula-safety`, `FX-DOWNLOAD-0`, `FX-DOWNLOAD-1`, `FX-DOWNLOAD-duplicate-event`, `FX-DOWNLOAD-many`, `FX-DOWNLOAD-wrong-extension`, `FX-DOWNLOAD-wrong-url`, `FX-DOWNLOAD-outside-window`, `FX-DOWNLOAD-late-reexport` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M09 权限与安全 | `stop-first`, `epoch-late-reply`, `template-reject`, `permissions-senders`, `M02-classic-selection`, `M07-source-target-retirement`, `M09-package-restricted`, `M11-authorized-real-list`, `unsupported-config`, `NV-T01`, `NV-T02`, `NV-T03`, `NV-T04`, `NV-T05`, `NV-T06`, `NV-T07`, `NV-T08`, `NV-T09`, `NV-T10`, `NV-T11`, `NV-T12`, `NV-T13`, `NV-T14`, `NV-T15`, `NV-T16`, `NV-T17`, `NV-T18`, `NV-T19`, `NV-T20`, `NV-T21`, `NV-T22`, `NV-T23`, `NV-T24`, `NV-T25`, `NV-T26`, `NV-T27`, `NV-T28`, `NV-T29`, `NV-T30`, `NV-T31`, `NV-T32`, `NV-T33`, `NV-T34`, `NV-T35`, `NV-T36`, `NV-T37`, `NV-T38`, `NV-T39`, `NV-T40`, `suite:strict-url`, `suite:csv-formula-safety`, `suite:template-rejection`, `FX-DOWNLOAD-wrong-extension`, `FX-DOWNLOAD-wrong-url` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M10 授权与数据 | `download-abandon-tombstone`, `storage-delete-retention`, `entitlement-exports`, `M10-free-boundaries`, `M10-pro-template-limits`, `M10-signature-revocation`, `M10-offline-72h`, `M10-approved-run-snapshot`, `M10-delete-pins-retention`, `M11-authorized-real-list`, `unsupported-config`, `FX-DOWNLOAD-late-reexport` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |
| M11 单产品集成 | `module-single-product`, `M11-authorized-real-list`, `M11-production-pack-journey` | 对应新产品证据，ordinaryChrome双版本分别记录；当前planned/not-run |

## 控制站点与共同复现准备

控制站点由02B测试底座提供、03提供领域DOM fixture，目前没有已启动服务器。计划originA=`http://127.0.0.1:8765`、originB=`http://127.0.0.1:8766`，不同端口仍视为不同origin。固定 `.rows`/`:scope > .row`、`.next`/`.end`/`.empty-list`，字段无title，server保存每页序号、click数及seed。DOM原始URL/baseURI必须保留，不能只用innerHTML代替。

| fixture | 计划路径 | 预期/用途 |
| --- | --- | --- |
| C2x3 | `/list?pages=2&rows=3&mode=next-link&seed=01` | p1 keys1..3，p2 keys4..6，末页.end；source页不导航；run各6条 |
| C10x100 | `/list?pages=10&rows=100&mode=next-link&seed=stress01` | 1000唯一行（10页×100行），末页.end；每页至少3批，所有<=256KiB；暂存<20MiB，预算10min；产品硬上限10000行是独立边界测试 |
| C3B | `/list?pages=2&rows=6&mode=next-button&seed=threebatch` | 底座fixture先seal P0=2行；P1=6行强制2行/批即b0,b1,b2；最多2待ACK |
| C-SIGNATURE | `/signature` | 前5条相同，第6条变化；之后全页重复；button同URL，真实完整signature检验 |
| C-EMPTY | `/empty?marker=present\|absent` | 真实0条+empty依据可零批seal；无marker且allowEmpty=false失败 |
| C-END | `/end?next=missing&marker=present\|absent` | next消失只有末页marker成立才自然结束；错误selector不得成功 |
| C-CSP | `/csp` | script-src self等限制，测试真实classic选区注入与页面原脚本保持；非凭页面日志断言 |
| C-REDIRECT | `/redirect-to-origin-b` | 跨origin暂停/拒绝，未在B继续采集 |
| C-WAIT | `/wait-next` | 控制站点阻止翻页结果，stop屏障能精确安排commit次序 |
| C-LARGE | `/large-export` | 10000条每条固定较长受控内容，stage占用<20MiB而CSV/JSON至少一格式超过8MiB；按完整行分卷 |
| C-VECTORS | `/vectors/<vector-id>` | 原字节DOM供真实querySelector/baseURI读取，不能仅innerHTML复刻而丢base上下文 |

### Setup COMMAND

1. 用02B真实底座注册工具host，claimRun绑定originA专用tab，保存Identity；seed command C1=next-button及digest。
2. 在测试构建设置after_prepare、after_dispatch_commit_before_chrome、after_cancel_commit屏障。
3. 各屏障只在原生IDB事务完成后通知驱动；保存每次commitSeq，再按case步骤释放。
4. 读取journal/run投影及控制站点click/navigation日志；恢复普通pack复核正常停止。

### Setup PAGE3

1. 读取transaction-template.json并核contentHash；读取page-transaction.json的initialProjection，P0可见keys精确P0:0/P0:1、count2/pages1、完整checkpoint。
2. 按stageRequests[0..2]精确6行raw/typed/keys，每批2行、252 UTF8字节、批digest按fixture；P1总756字节；使用sealRequest完整pageSignature/nextCheckpoint。
3. 先seed真实IDB中P0 sealed页和对应记录，不能只写count2而缺记录；ACK前/后查询readRecords，重开连接证实P1 staged耐久。
4. 按case屏障安排abort/cancel/seal，逐字段比较oracles（完整visibleRecordKeys/count/pages/checkpoint、P1 staged bytes/rows、export count），保存commit trace。
5. 普通Chrome按exactFixtureExecutionPolicy创建真实身份与bindings，保留fixture关系而不把合成id当浏览器对象。

### Setup DOWNLOAD

1. 先有已sealed数据，以显式导出创建jobA/artifactA，保存真实字节/hash/行数与reader pin。
2. 持久prepare attemptA=新鲜Blob URL，dispatch事务完成后仅调用一次真实downloads.download。
3. 调用/ID-save gap在02B测试构建使用屏障；SW重启后读取attempt与onCreated候选并真实downloads.search。
4. 每次查询保存id/url匹配hash/byExtensionId/startTime/state/error及查询时间，不按filename或最近结果猜测。
5. 用户动作reexport/abandon独立记录；最终核每个job的activeAttemptIds，资源释放历史与原生receipt。

### Setup TEMPLATE

1. 读取migration single-page完整输入与上下文；迁移器输出完整对象，统一compiler在真实目标DOM编译CSS。
2. 从工具UI命名保存不可变revision，关窗重开读取hash/列序/字段/分页；预览和执行记录compilerVersion/planHash。
3. 在隔离模板副本施加case变化；分别尝试preview/save/claimRun/format，断言拒绝无副作用。

### Setup JOURNEY

1. 普通Chrome加载真实生产pack，originA打开C2x3，用户gesture选区→字段→下一页→预览→命名模板保存。
2. 用户gesture授予精确origin optional host permission，展示effectiveLimits并确认，创建专用tab执行。
3. 记录runId、源/执行tab/frame/document、2页seal、6行结果；退役执行tab并证实不存在，关窗重开。
4. 复跑相同revision新run，从起始URL重新采6条；显式停止另一run并导出已sealed部分。
5. CSV/JSON逐行核字节和下载查询complete；所有卷完成才delivery_complete。

正常负载固定2页×3行，每run6条并复跑；压力负载按最新用户修订固定 **10页×100行=1000条**。压力采用Pro测试签名、总暂存<20MiB、每页至少3批、batch<=256KiB、未ACK<=2、cursor<=500，第10页明确末页证据且无未知命令后才completed；达到任何有效上限但尚有下一页则limit_reached。产品10000行硬上限仍另测，不能从旧错误测试名推导压力数量。记录host/SW内存峰值和测量方法、stage/profile占用、quota、耗时及行集合；没有预设假的内存成绩，字节预算不等于浏览器内存。

## 新增精确事务与下载fixture映射

精确输入为 `contracts/fixtures/page-transaction.json`、`transaction-template.json`、`download-attempts.json`；全部planned/not-run。每个case保持原36scenario ID并加独立FX变体，完整input/oracle JSON Pointer与hash见test-plan.json。

事务templateHash=`ecca25dbde309a0c9ec8cd27616263e288dda8890b59dc9fbffca8fddf13997f`；P0真实sealed记录keys=P0:0/P0:1、count2/pages1/checkpoint={pageNumber:1,url:https://fixture.example/list?page=1,lastSnapshotId:P0}。P1三批各2行、各252 UTF8字节、total756；必须先seed P0实际记录，不只写计数。stage duplicate/digest conflict的FX变体沿P0基线保持count2；原scenario独立空run的count0仍保留，不混用两个oracle。

| 精确case ID | 原scenario ID | oracle与断言 |
| --- | --- | --- |
| `FX-PAGE-lastBatchFailure` | `three-batch-last-fails` | `contracts/fixtures/page-transaction.json#/oracles/lastBatchFailure`；`{"failedBatchIndex":2,"visibleRecordKeys":["P0:0","P0:1"],"committedCount":2,"committedPages":1,"checkpointSnapshotId":"P0","openPageState":"aborted","P1ExportCount":0,"P1DurableStagedRowCount":4,"P1StagedBytes":504,"runState":"interrupted","error":"E_QUOTA"}` |
| `FX-PAGE-allSealed` | `three-batch-seal` | `contracts/fixtures/page-transaction.json#/oracles/allSealed`；`{"visibleRecordKeys":["P0:0","P0:1","P1:0","P1:1","P1:2","P1:3","P1:4","P1:5"],"committedCount":8,"committedPages":2,"checkpointSnapshotId":"P1"}` |
| `FX-PAGE-stopFirst` | `stop-before-seal` | `contracts/fixtures/page-transaction.json#/oracles/stopFirst`；`{"stopRunRevision":2,"cancelSeq":1,"sealError":"E_CANCELLED","visibleRecordKeys":["P0:0","P0:1"],"committedCount":2,"committedPages":1,"checkpointSnapshotId":"P0"}` |
| `FX-PAGE-sealFirst` | `seal-before-stop` | `contracts/fixtures/page-transaction.json#/oracles/sealFirst`；`{"cancelSeq":1,"visibleRecordKeys":["P0:0","P0:1","P1:0","P1:1","P1:2","P1:3","P1:4","P1:5"],"committedCount":8,"committedPages":2,"checkpointSnapshotId":"P1"}` |
| `FX-PAGE-duplicateStage` | `stage-duplicate` | `contracts/fixtures/page-transaction.json#/oracles/duplicateStage`；`{"stageIndex":0,"ackLostThenResent":true,"durableStagedRows":2,"committedCount":2}` |
| `FX-PAGE-digestConflict` | `stage-digest-conflict` | `contracts/fixtures/page-transaction.json#/oracles/digestConflict`；`{"sameBatchId":"P1:0","replacementRecords":"different bytes","error":"E_BATCH_CONFLICT","P1State":"aborted","committedCount":2}` |
| `FX-DOWNLOAD-0` | `download-zero` | `contracts/fixtures/download-attempts.json#/candidateCases/0`；`"mapping_unknown, no retry"` |
| `FX-DOWNLOAD-1` | `download-one`, `download-id-start` | `contracts/fixtures/download-attempts.json#/candidateCases/1`；`"bind id7, still not complete"` |
| `FX-DOWNLOAD-duplicate-event` | `download-one` | `contracts/fixtures/download-attempts.json#/candidateCases/2`；`"dedupe id7 then bind"` |
| `FX-DOWNLOAD-many` | `download-many` | `contracts/fixtures/download-attempts.json#/candidateCases/3`；`"conflict, bind none"` |
| `FX-DOWNLOAD-wrong-extension` |  | `contracts/fixtures/download-attempts.json#/candidateCases/4`；`"0 matches"` |
| `FX-DOWNLOAD-wrong-url` |  | `contracts/fixtures/download-attempts.json#/candidateCases/5`；`"0 matches despite filename"` |
| `FX-DOWNLOAD-outside-window` |  | `contracts/fixtures/download-attempts.json#/candidateCases/6`；`"0 matches"` |
| `FX-DOWNLOAD-late-reexport` | `download-deadline-late-complete`, `download-reexport-isolation`, `download-abandon-tombstone`, `download-host-close-after-complete` | `contracts/fixtures/download-attempts.json#/lateCompleteSequence`；`{"A":"complete late=true","jobA":"delivery_complete","jobB":"delivering","B":"dispatched","AResolvesB":false,"timedOutAt":"2026-10-01T18:10:00Z","resourceReleasedAt":"2026-10-01T18:10:00Z"}` |

下载unit/realIDB精确用A的URL=`blob:chrome-extension://abcdefghijklmnopabcdefghijklmnop/attempt-A-fresh`、dispatchAt=18:00:00Z、mappingDeadline=18:01:00Z、downloadDeadline=18:10:00Z；候选id7、startTime18:00:01Z，many另id8，duplicate-event仍同id7。0例now=18:01:01Z才mapping_unknown；wrong extension/url/outside-window均不认领。B新URL `attempt-B-fresh`，窗18:11..18:12、截止18:21；18:11:03的id7 complete只归A，不能完成B。全部日期均2026-10-01 UTC，是合成精确oracle而非真实发生时间。

普通Chrome必须创建真实host/tab/document/Blob/native下载ID与实际dispatch时间，另保存fixtureNativeBindings表，不向fixture tabId=20发操作、不把人工id7/8或手写Blob URL当作原生对象。替换身份后生产算法重算hash，保留结构/行集合/相对时间/唯一URL/attempt归属。fixture的`a×64` Artifact hash和100字节是mapping输入占位，普通层必须由真实formatter重测bytes/hash/行数，不能当Artifact内容已验证。注入候选只算局部逻辑证据。

新增只读静态命令（同项目根，检查内部一致而非产品执行）：

```sh
python3 - <<'PY_CHECK'
import json, hashlib
from pathlib import Path
root=Path('.')
load=lambda p: json.loads((root/p).read_text())
canonical=lambda x: json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')
h=lambda b: hashlib.sha256(b).hexdigest()
p=load('contracts/fixtures/page-transaction.json'); t=load('contracts/fixtures/transaction-template.json'); d=load('contracts/fixtures/download-attempts.json')
assert h(canonical({k:v for k,v in t.items() if k!='contentHash'}))==t['contentHash']==p['templateHash']
rows=[]
for i,b in enumerate(p['stageRequests']):
    assert b['batchIndex']==i and b['batchId']=='P1:'+str(i) and len(b['records'])==2
    data=canonical({k:b[k] for k in ['snapshotId','batchIndex','records']})
    assert len(data)==b['utf8Bytes']==252 and h(data)==b['digest']
    rows.extend(b['records'])
s=p['sealRequest']; assert s['batchCount']==3 and s['rowCount']==6 and s['byteCount']==756
assert s['batchDigests']==[b['digest'] for b in p['stageRequests']]
assert h(canonical({'pageIdentity':s['pageIdentity'],'records':[{'raw':r['raw'],'values':r['values']} for r in rows]}))==s['pageSignature']
assert p['oracles']['lastBatchFailure']['visibleRecordKeys']==['P0:0','P0:1']
assert p['oracles']['allSealed']['visibleRecordKeys']==['P0:0','P0:1']+[r['recordKey'] for r in rows]
assert p['oracles']['duplicateStage']['committedCount']==p['initialProjection']['committedCount']==2
assert d['attemptA']['blobUrl']!=d['attemptB']['blobUrl']
assert len(d['candidateCases'])==7 and len(d['lateCompleteSequence'])==3
assert d['lateCompleteSequence'][-1]['AResolvesB'] is False and d['receiptInvariant']['diskHashVerified'] is False
print('static fixture integrity only; product tests not-run')
PY_CHECK
```

## 36个scenario逐ID复现与断言

每条保留scenarios.json原ID、原expected与JSON Pointer；JSON包含fixtureSteps、reproductionSteps、layer/browser/owner和evidenceGroups。下表步骤在指定setup后执行。所有条目planned/not-run，无实测证据。

| ID / 门禁 / 层 | 具体复现步骤 | 观测断言（原expected） |
| --- | --- | --- |
| `stop-first` / M07,M09 / unit,realIDB,ordinaryChrome；COMMAND | 1) 到after_prepare保持C1未派发；调用stopRun并等cancel事务oncomplete，再释放dispatch屏障。 2) 查询C1=cancelled、run=stopping；核Chrome调用0与取消后派生/重试0，再只读对账退役。 | `{"command":"cancelled","chromeCalls":0,"run":"stopping","newRetries":0}` |
| `dispatch-first` / M07 / unit,realIDB,ordinaryChrome；COMMAND | 1) 先等C1 dispatched提交，保持Chrome调用屏障；提交stop，再释放单次原生click。 2) 页面可在stop后变化；对账证明结果后stopped；取消后不产生第二命令；runRevision变化不抹掉已获准调用。 | `{"chromeCalls":1,"runAfterReconcile":"stopped","mayChangePageAfterStop":true,"newDispatches":0}` |
| `dispatch-call-gap` / M07 / unit,realIDB,ordinaryChrome；COMMAND | 1) 在dispatched已提交、原生调用未发生时终止SW；关闭调试连接后重启broker。 2) 不再释放已丢失回调，不伪造effect proof；对账无充分证据，effect_unknown/paused_unknown且slot仍占用，禁止重放。 | `{"command":"effect_unknown","run":"paused_unknown","chromeReplays":0,"slotHeld":true}` |
| `epoch-late-reply` / M07,M09 / unit,realIDB,ordinaryChrome；COMMAND | 1) 未知C1后显式abandon围栏epoch、关闭精确旧tab并持久化不存在证据，再claim新run。 2) 送回原C1身份/真实旧sender的迟到结果；仅旧审计追加，核新run计数/checkpoint/command列表完全不变。 | `{"newRunChanges":0,"oldResultVisibility":false,"oldReply":"audit-only","newChromeDispatchesFromOldEpoch":0}` |
| `lease-no-takeover` / M07 / unit,realIDB,ordinaryChrome；COMMAND | 1) 只让lease/握手超时，不发abandon、不关闭tab；尝试第二工具host claimRun。 2) 核paused_unknown与slot原owner；第二claim拒绝E_OWNER，无第二runner/执行tab。 | `{"run":"paused_unknown","newRunRejected":"E_OWNER","slotHeld":true}` |
| `retire-unverified` / M07 / unit,realIDB,ordinaryChrome；COMMAND | 1) 显式放弃后观察epoch递增与target capability撤销；测试层让关闭确认缺失，tabs.get仍存在。 2) 再次claim失败；retiring保持slot，不能仅依据tabs.remove调用或lease时长释放。 | `{"run":"retiring","slotHeld":true,"newRunRejected":"E_OWNER"}` |
| `retire-release` / M07 / unit,realIDB,ordinaryChrome；COMMAND | 1) 显式放弃；围栏/abort open页；真实关闭旧tab，保存真实onRemoved或tabs.get not-found证明。 2) 证据IDB提交后slot才释放；新run起始页新身份，旧消息拒绝；确认旧epoch禁Chrome/DB写。 | `{"oldRun":"abandoned_unknown","slotReleased":true,"newRunAllowed":true,"oldPagesAborted":true}` |
| `three-batch-last-fails` / M06 / unit,realIDB,ordinaryChrome；PAGE3 | 1) P0已seal2行；P1前两批各2行ACK并重开DB证明耐久；第3批原生事务abort并标受控故障，另测真实quota。 2) P1=aborted、暂存4行仍计字节；visible/export仅P0的2行、1页、checkpoint=P0；run interrupted E_QUOTA。 | `{"visibleRows":2,"committedCount":2,"committedPages":1,"checkpoint":"P0","P1StagedRows":4,"P1State":"aborted","P1ExportedRows":0,"run":"interrupted with E_QUOTA","storedBytesIncludesStaged":true}` |
| `three-batch-seal` / M06 / unit,realIDB,ordinaryChrome；PAGE3 | 1) P0=2行；P1三个2行批次依次ACK，seal前visible仍2。 2) seal请求含3个按序digest、6行与真实UTF8字节；一个事务完成后visible8/count8/pages2/checkpoint=P1。 | `{"visibleRows":8,"committedCount":8,"committedPages":2,"checkpoint":"P1","P1State":"sealed"}` |
| `stop-before-seal` / M06,M07 / unit,realIDB,ordinaryChrome；PAGE3 | 1) 三个批次ACK后保持seal屏障；stop事务先oncomplete；再尝试seal。 2) 拒绝E_CANCELLED并abort P1，仍visible2/count2/pages1/checkpoint=P0；open行不能导出。 | `{"P1State":"aborted","visibleRows":2,"committedCount":2,"checkpoint":"P0","sealError":"E_CANCELLED"}` |
| `seal-before-stop` / M06,M07 / unit,realIDB,ordinaryChrome；PAGE3 | 1) 三个批次ACK后先等待seal事务提交，再stop；不是只比较UI点击先后。 2) visible8/count8/pages2/checkpoint=P1保留，run stopping；完整页保存，取消后新页不准入。 | `{"visibleRows":8,"committedCount":8,"checkpoint":"P1","run":"stopping"}` |
| `stage-duplicate` / M06 / unit,realIDB,ordinaryChrome；PAGE3 | 准备覆盖：独立空run，初始committedCount0/checkpoint=null；用case指定索引和行数。 1) stage b0=2行，提交后测试通道丢ACK；重发相同batchId/digest/records。 2) 返回duplicate durable-staged；只2条staged、字节不累加、count0；记录索引唯一。 | `{"ACK":"duplicate durable-staged","stagedRows":2,"committedCount":0}` |
| `stage-digest-conflict` / M06 / unit,realIDB,ordinaryChrome；PAGE3 | 准备覆盖：独立空run，初始committedCount0/checkpoint=null；用case指定索引和行数。 1) stage b0后改第二行内容，保持相同batchId重算digest并再发。 2) E_BATCH_CONFLICT且整open页aborted；无可见行，已暂存字节计入预算。 | `{"error":"E_BATCH_CONFLICT","page":"aborted","committedCount":0}` |
| `seal-missing-batch` / M06 / unit,realIDB,ordinaryChrome；PAGE3 | 准备覆盖：独立空run，初始committedCount0/checkpoint=null；用case指定索引和行数。 1) 新空run page分别stage索引0与2，seal声明3批。 2) E_SEAL_INCOMPLETE、page保持open、count0/checkpoint原值；补正确b1后仅active状态允许成功seal。 | `{"error":"E_SEAL_INCOMPLETE","page":"open","committedCount":0,"checkpointUnchanged":true}` |
| `seal-duplicate` / M06 / unit,realIDB,ordinaryChrome；PAGE3 | 准备覆盖：P0不存在，新run空页，count初始0；6行seal一次count6，不能继承PAGE3的P0=2。 1) 新空run正确seal6行；丢ACK后原请求逐字节重发；另在stop改变runRevision后只替换该CAS字段重发历史请求。 2) 都返回同历史ACK，count6/pages1不增加；seal digest排除identity.runRevision；改其他字段必须拒绝且sealed页不变。 | `{"committedCount":6,"committedPages":1,"duplicate":true}` |
| `download-id-start` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) 调用返回原生downloadId后立即search({id})尚in_progress；保存callback及query原文。 2) ID只启动；UI显示delivering、browserDownloadComplete=false、diskHashVerified=false；Blob仍存活。 | `{"browserDownloadComplete":false,"attempt":"in_progress","diskHashVerified":false}` |
| `download-complete` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) 原生onChanged只是触发器；用search({id})确认complete，再写receipt。 2) 所有active卷均complete才delivery_complete；记录释放URL时间，下载前内容hash不是磁盘验证。 | `{"attempt":"complete","job":"delivery_complete-if-all-volumes","URLReleased":true,"diskHashVerified":false}` |
| `download-interrupted` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) unit/realIDB输入FILE_NO_SPACE观测；普通Chrome在可回滚隔离下载位置制造实际磁盘不足，记录真实query reason。 2) attempt interrupted、job delivery_failed、无浏览器完成声明；不能用受控错误代替native disk-full观测。 | `{"attempt":"interrupted","job":"delivery_failed","browserDownloadComplete":false}` |
| `download-zero` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) 在attempt dispatched提交后、Chrome调用前终止SW，形成真实未提交下载的0候选；恢复只search不download。 2) 60s内有限查找，截止mapping_unknown，URL释放；automatic重下0，总生产调用至多1。 | `{"attempt":"mapping_unknown","automaticDownloadCalls":0,"URLReleased":true}` |
| `download-one` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) 原生下载调用后、callback ID保存前终止SW；恢复查询完整URL+extension+时间窗。 2) 同id重复onCreated去重为1；唯一id绑定原attempt，总生产调用仍1、重下0。 | `{"boundId":7,"automaticDownloadCalls":0,"candidateCountAfterDedupe":1}` |
| `download-many` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) unit/realIDB放两个不同ID的完全匹配候选；普通Chrome测试构建可用独立probe生成同URL的两个原生候选，单列probe调用。 2) distinct候选2→conflict、boundId=null、重下0；不得称probe为生产attempt重复调用；无法制造native多候选则该层pending。 | `{"attempt":"conflict","boundId":null,"automaticDownloadCalls":0}` |
| `download-host-close-after-complete` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) 保存已complete receipt后关闭工具host；SW重新search同id。 2) complete与job完成状态保持，释放Blob不覆盖成功；原ID查询证据留下。 | `{"attempt":"complete","job":"delivery_complete","URLReleased":true}` |
| `download-host-close-before-terminal` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) id仍in_progress时关闭host；SW按原id查询真实结果。 2) 只有真实NETWORK_FAILED查询才能断言interrupted；若仍in_progress/无法查询，按deadline_unknown等准确分支记录，不能强制失败。 | `{"attempt":"interrupted","browserDownloadComplete":false}` |
| `download-deadline-late-complete` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) 保持id的10min查询未确证终态，写deadline_unknown/timedOutAt并释放URL；稍后取得该id真实complete证据。 2) receipt late=true、原超时和释放时间保留；只更新本attempt/job；普通Chrome无真实迟到完成则pending，unit可虚拟时间。 | `{"attempt":"complete","receiptLate":true,"timedOutAtRetained":true,"releaseTimestampRetained":true,"browserDownloadComplete":true}` |
| `download-reexport-isolation` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) A超时；用户明确再次导出生成jobB/attemptB/URLB/idB；保持B in_progress；输入/观测A的迟到complete。 2) A只完成旧job，B仍delivering；URL不同、activeAttemptIds隔离、idA不能完成B；UI并列旧新交付。 | `{"jobA":"delivery_complete-with-late-history","jobB":"delivering","attemptB":"in_progress","urlAEqualsB":false,"ACompletesB":false}` |
| `download-abandon-tombstone` / M08,M10 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) 明确abandon A并持久tombstone、释放资源；随后A查询complete。 2) projection固定abandoned；late只审计，job不复活；ID不能借给新attempt。 | `{"attemptProjection":"abandoned","auditContainsLateComplete":true,"jobResurrected":false}` |
| `download-multivolume` / M08 / unit,realIDB,ordinaryChrome；DOWNLOAD | 1) C-LARGE生产formatter分至少2卷且每卷<=8MiB；volume1真实complete，volume2 interrupted。 2) job delivery_partial、deliveredVolumes1，绝不delivery_complete；各卷row/hash与manifest相等。 | `{"job":"delivery_partial","deliveredVolumes":1,"delivery_complete":false}` |
| `template-reject` / M03,M09 / unit,realIDB,ordinaryChrome；TEMPLATE | 1) 分别施加未知major/字段/能力、非法CSS、重复field id、危险键、depth13、跨origin startUrl；每变体独立case记录。 2) 拒绝save/执行且模板head/count不变；公共code为E_VERSION/E_SCHEMA/E_CAPABILITY/E_SEMANTIC；数据字段合法跨域URL不属于此拒绝。 | `{"saveAllowed":false,"errors":["E_VERSION","E_SCHEMA","E_CAPABILITY","E_SEMANTIC"]}` |
| `template-falsy-long-notitle` / M03,M04 / unit,realIDB,ordinaryChrome；TEMPLATE | 1) 使用single-page输入保存关窗重开，比较完整revision/hash；production preview/run使用同compiler。 2) 逐field比较0、false、空串、null、150中文原文及列序；不筛没有title的行；仅显示可省略。 | `{"preserve":[0,false,"",null,"150\u4e2d\u6587\u5b57"],"filterByTitle":false,"columnOrder":"fixture exact","immutableRevision":true}` |
| `run-isolation-pagination` / M04,M05 / unit,ordinaryChrome；JOURNEY | 1) C2x3同模板跑run1，退役执行tab后再跑run2。 2) 每run恰6条、2页；记录keys与runId不串数据，source URL不变，run2从p1开始。 | `{"perRunCount":6,"mixedRuns":false,"sourcePageNavigated":false}` |
| `pagination-signature` / M05 / unit,ordinaryChrome；COMMAND | 1) C-SIGNATURE同URLbutton先保持前5行不变、只改第6；下一次完全相同。 2) 第一次完整signature变化识别换页；第二次failed E_SEMANTIC，不盲click重试，不标completed。 | `{"firstChangeRecognized":true,"secondRepeatedPage":"failed E_SEMANTIC, not completed","blindClickRetry":false}` |
| `budget-plus-one` / M05,M06 / unit,realIDB,ordinaryChrome；COMMAND | 1) C2x3分别设置maxPages1与maxPages2，再设置maxRecords5；每次新run。 2) pages1→count3 limit_reached，pages2且末页证据→count6 completed；records5→page2整页abort count3 limit_reached，不能截成5成功。 | `{"maxPagesRun":"limit_reached count3","maxRecordsRun":"limit_reached count3 (whole page2 aborted)","success":false}` |
| `permissions-senders` / M09 / unit,ordinaryChrome；COMMAND | 1) 真实网页发送自报host/run；只有source activeTab无origin执行授权；另在prepare后撤销grant；另导航跨origin。 2) 每个拒绝路径新dispatchChromeCalls=0，错误/暂停投影明确；原activeTab不转给执行tab，sender ID/URL/document取真实Chrome来源。 | `{"dispatchChromeCalls":0,"reject":true,"activeTabTransfers":false}` |
| `storage-delete-retention` / M10 / unit,realIDB,ordinaryChrome；COMMAND | 1) 真实测试DB做失败upgrade/备份；到第7天清理含active、open export、reader pin与未决journal；删除后送旧callback。 2) 失败库只读与原字节备份，无清库；受保护对象不自动删除；tombstone拒绝恢复旧run/记录/job。 | `{"failedMigration":"read-only with backup, no clean DB","activeOrPendingAutoDeleted":false,"lateCallbackResurrects":false}` |
| `entitlement-exports` / M10 / unit,realIDB,ordinaryChrome；COMMAND | 1) 以测试签名分别过期/无效许可开始新Pro run；免费能力正常；已存Pro-run数据到期后显式导出。 2) 新Pro降free并提示；预览/取回已确认数据/导出不扣留、不需网络；许可边界详见新增授权cases。 | `{"newProFeatures":false,"existingDataExportAllowed":true,"networkMandatory":false}` |
| `module-single-product` / M11 / unit,ordinaryChrome；JOURNEY | 1) 02A固定src/features/scraping/index.js静态槽先返回MODULE_NOT_INSTALLED；03只填域模块；核根只导入一次。 2) 用最终单manifest/单IDB连接完成真实旅程；占位或A-only/B-only单测不能填M11产品passed。 | `{"newOwnerOrDB":false,"finalExtensions":1,"placeholderCountsAsProductPassed":false}` |

PAGE3基准P0已seal2行；P1三批各2行：前2批ACK第3失败→visible/count2、pages1、checkpoint=P0，P1暂存4行计空间但不导出；三批正确seal→visible/count8、pages2、checkpoint=P1；stop先提交拒seal仍2，seal先提交再stop保留8。stage-duplicate/conflict、seal-missing/duplicate使用独立空run基准，不继承P0。重复seal在stop后只允许完全相同历史digest，排除runRevision，其余内容变化拒绝。

Download 0候选=60s有限对账后mapping_unknown；1=按完整URL/extension/time与去重ID唯一绑定；many=conflict不猜最近/filename。downloadId仅启动，60s仅映射，绑定后10min独立deadline。host close查询真实状态，已complete不退回失败。迟到complete/interrupted仅解原attempt的不确定态并保留超时/释放历史；abandoned只追加audit；新job/attempt/URL/activeAttemptIds不继承旧ID。native多候选、disk-full、真实迟到完成无法制造则该层pending，不让注入观测补成Chrome passed。

## 补充可执行工作包

### M01-source-readonly — M01

层：unit；setup：按步骤独立准备；状态planned/not-run。

1. 读取source-ledger及三来源snapshot，逐文件计算SHA256；先后只读git status/diff哈希，核dirty保留。
2. 比对许可清单和有效选区/UI/字段/分页/导出行为列表；无法确认许可单列pending；禁止重编译覆盖旧bundle。

观测断言：清单和快照hash一致；来源路径/dirty前后无变化；有可追溯保留/改造/不支持行为项；许可未解决不假称解决。
证据组：base, templates。

### M02-classic-selection — M02,M09

层：unit, ordinaryChrome；setup：JOURNEY；状态planned/not-run。

1. 检查生产包selection classic IIFE无顶层import/export、Node/动态代码fallback；核manifest资源路径。
2. 普通Chrome C-CSP上选表格/列表/字段/next，预览；取消与连续进入退出3次；页面预置同名class节点不能被误清理。

观测断言：选区真实可用；自己overlay/listener释放、页面自有DOM保持；两版Chrome实际API结果分别记录；无页面脚本执行模板文本。
证据组：base, identity, site, resources。

### M02-two-windows-race — M02

层：realIDB, ordinaryChrome；setup：按步骤独立准备；状态planned/not-run。

1. 两个浏览器窗口打开不同originA页，同时用户调用扩展入口；并行create工具请求。
2. 工具聚焦/重载后从另一source发选区，记录真实window/tab/document；并发claimRun。

观测断言：只有1工具窗口/active run/专用tab；不因windowId/activeTab漂移；第二claim拒绝，原run目标固定。
证据组：base, identity, transactions, commands。

### M03-revision-cas — M03

层：unit, realIDB, ordinaryChrome；setup：TEMPLATE；状态planned/not-run。

1. 保存revision1；两个编辑器从parent1提交不同revision2；重复发送相同请求。
2. 分别改变columns/transforms数组序、compilerVersion或能力，关窗重开读head。

观测断言：只有一个合法head2；另一个E_PARENT_CONFLICT；旧revision不变；hash由完整内容决定；name元数据CAS不篡改contentHash；RulePlan能力和compiler锁定。
证据组：base, templates, transactions。

### M03-css-missing-empty — M03,M05

层：unit, ordinaryChrome；setup：TEMPLATE；状态planned/not-run。

1. DOM分别缺容器、匹配2容器、字段匹配2节点、缺必填/可选属性；每变体独立输入。
2. 真实querySelector编译非法CSS；存在空文本string与无元素分别预览。

观测断言：非法/缺容器非成功0条；多匹配E_SEMANTIC；optional缺失null；required缺失失败；存在空string合法。
证据组：base, templates, pages。

### M05-end-empty-evidence — M05,M06

层：unit, realIDB, ordinaryChrome；setup：JOURNEY；状态planned/not-run。

1. C-END末页next缺失，分别有/无.end；错误next selector但没有.end。
2. C-EMPTY分别有empty marker、allowEmpty确认和都无；合法空页0batch/0rows/0bytes seal。

观测断言：明确末页证据才completed；错误selector失败E_SEMANTIC；合法零页需seal与emptyEvidence；无证据零条不算成功。
证据组：base, pages, transactions。

### M06-stress-10x100 — M04,M05,M06,M08

层：realIDB, ordinaryChrome；owner：02B（公共底座）/03（领域fixture）/04（实际验收）；planned/not-run。

1. 使用C10x100有效TEST_ONLY Pro签名，预确认10页/至少1000行预算；fixture目标精确10页×100行=1000条，总stage字节<20MiB。
2. 每页强制至少3批（例如34/33/33行），envelope<=256KiB；仅2个未ACK；连续10页seal后生成CSV/JSON；末页明确.end。
3. 用外部进程/浏览器任务管理器或受支持测量记录host/SW内存每秒样本/峰值，storage.estimate usage/quota、stage/profile占用与耗时；不把字节预算当内存。

观测断言：keys恰1000、无重复遗漏，10个sealed页、count1000；有明确末页.end且无未知命令才completed；10分钟内；readRecords cursor<=500、pendingACK<=2；计数=可见记录集合=导出1000行；超任一实际预算正确limit_reached/中断；内存峰值/方法有实测，无虚构阈值；10000行是产品硬上限的另行边界测试，不是本压力fixture。

### M06-backpressure-byte-limits — M05,M06

层：unit, realIDB, ordinaryChrome；setup：PAGE3；状态planned/not-run。

1. 保持b0/b1 ACK，观察producer尝试b2；释放一个ACK后才准入b2。
2. 按canonical UTF8构造batch恰262144字节及+1；run20MiB/profile200MiB恰阈值与+1；中文与raw+typed均计字节。
3. 真实quota单独隔离profile渐进写入，记录浏览器返回的quota和abort；不无限填盘。

观测断言：pendingACK峰值2；batch+1拒绝/limit_reached且无ACK/无当前页seal；run阈值+1当前页abort、既seal数据保留；profile/quota不足interrupted E_QUOTA；注入abort和native quota不混报。
证据组：base, pages, storage, transactions, resources。

### M06-seal-validation-watermark — M06,M08

层：unit, realIDB；setup：PAGE3；状态planned/not-run。

1. 分别改变batchCount,rowCount,byteCount,digest顺序、rowIndex连续性、pageSignature/跨origin checkpoint；每变体从独立DB重置。
2. 正确seal后beginExport固定水位，随后seal新页并并发cleanup；对未sealed页查询普通游标。

观测断言：错误seal E_SEAL_INCOMPLETE或E_SEMANTIC不更计数；重复冲突不改sealed页；watermark下导出集合稳定，reader pin阻止删除；暂存行不可见；stage/seal只增加eventSeq/commitSeq不改变控制runRevision。
证据组：base, transactions, pages, storage, exports。

### M07-host-loss-sw-reconnect — M07

层：realIDB, ordinaryChrome；setup：COMMAND；状态planned/not-run。

1. P0已seal后在无未知外部效果时关闭/重载/崩溃host；另在dispatched未对账时关闭；每支独立run。
2. host仍在时终止SW再启动，真实身份握手；另关DevTools静置观察自然终止再唤醒。

观测断言：无未知效果interrupted；有未知paused_unknown；不自动接管/重start core loop；host重载生成新instance/document，旧token围栏；已seal数据保留；恢复同run、单owner/单runner。
证据组：base, identity, transactions, commands, pages, resources。

### M07-completion-stop-order — M07

层：unit, realIDB, ordinaryChrome；setup：COMMAND；状态planned/not-run。

1. 完整seal与末页证据后在终态CAS屏障安排completed先提交再stop；另一run stop先提交再natural-end。
2. 还测达到预算与stopping并发，prepared/delayed reply不能覆盖先终态。

观测断言：completed先胜保持completed；stop先胜stopping→stopped/paused_unknown，不能被completed/limit覆盖；真实commit trace证明。
证据组：base, transactions, commands, pages。

### M07-source-target-retirement — M07,M09

层：ordinaryChrome；setup：JOURNEY；状态planned/not-run。

1. 正式run中关闭source tab，执行tab保持；另一run关闭执行tab；另原执行document刷新/导航后旧document发结果。
2. 正常completed/failed/stopped时检测retirementState，未持久化旧tab不存在前尝试新claim。

观测断言：source关闭不转移/中断专用tab采集；执行tab关闭准确失败/中断；新document同origin握手targetVersion递增、旧document仅对账；终态名不被retiring覆写，slot需围栏+旧tab不存在才释放。
证据组：base, identity, commands, transactions, site。

### M08-format-byte-volume — M08

层：unit, realIDB, ordinaryChrome；setup：DOWNLOAD；状态planned/not-run。

1. single-page与全部CSV公式向量跑真实formatter，逐字节比expected JSON/CSV；包括Unicode前导空白、表头、TAB/CR、typed负数。
2. raw模式须用户明确提示确认，值只在CSV保护模式改变，不改raw/JSON；C-LARGE生成超过8MiB且保持run<20MiB，逐卷下载。

观测断言：中文/150字/引号/CRLF/列序/0/false/null/空串正确；null与空string CSV同空cell、不声称类型无损；每卷<=8MiB且完整行、CSV头/JSON独立数组；manifest总行数/字节/hash与job一致；只有全部complete完成。
证据组：base, templates, pages, exports, downloads, resources。

### M08-download-dispatch-gap — M08

层：unit, realIDB, ordinaryChrome；setup：DOWNLOAD；状态planned/not-run。

1. 准备attempt后记录原生调用计数，分别在dispatch前、dispatch提交后调用前、调用后ID保存前终止SW。
2. 重启仅journal+search对账；再次调用同attempt的dispatch；更改同attempt payload。

观测断言：每attempt最多1次生产download调用；不确定gap不重发；prepared未dispatch可安全取消；不同payload冲突；新用户reexport另建job/attempt/URL。
证据组：base, transactions, downloads, resources。

### M08-mapping-identity-time — M08

层：unit, realIDB, ordinaryChrome；setup：DOWNLOAD；状态planned/not-run。

1. 候选逐一改变URL一字符、extensionId、startTime到dispatchAt-2001ms/截止+1；含filename相同、最新项、字段缺失、时钟回拨。
2. 边界dispatchAt-2000ms与mappingDeadline有效，重复同ID去重；callback ID与查询身份不合或候选不同。

观测断言：只完整URL+extension+原时间窗匹配；无可靠唯一证据不绑定；多distinct/ID冲突conflict；clock回拨不猜测；filename/最近结果不认领；普通层原生字段证据单列。
证据组：base, downloads, transactions。

### M08-known-id-deadline-late — M08

层：unit, realIDB, ordinaryChrome；setup：DOWNLOAD；状态planned/not-run。

1. 绑定id后下载持续超过60s，核不套映射deadline；10min处分别query complete/interrupted/in_progress/查询失败。
2. deadline_unknown后分别迟到complete/interrupted；mapping_unknown后补在原时间窗的唯一complete证据；abandoned/conflict再送同证据。

观测断言：60s只映射；10min仍未知deadline_unknown并释放，不能虚构interrupted；迟到唯一证据late=true且保留timedOutAt/resourceReleasedAt；abandoned只审计/conflict不自动解；只改原job。
证据组：base, downloads, resources, exports。

### M09-package-restricted — M09

层：unit, ordinaryChrome；setup：按步骤独立准备；状态planned/not-run。

1. 扫描最终pack/manifest/HTML，检查eval/new Function/AsyncFunction、远程script、代码字符串fallback、Node模块与非批准Chrome入口；人工审查命中，禁止仅字符串扫描当完成。
2. 尝试chrome://、file://、incognito、iframe/Shadow DOM/trusted interaction要求；origin拒绝/撤销/cross-origin redirect；文本中放HTML事件串。

观测断言：最小权限证据；无动态fallback/远程执行逻辑；限制范围明确unsupported；不注all_frames/WAR通配绕过；页面文本/label安全渲染；所有Chrome命令真实sender/精确target核验。
证据组：base, identity, commands, site。

### M10-free-boundaries — M10,M05

层：unit, realIDB, ordinaryChrome；setup：TEMPLATE；状态planned/not-run。

1. 无Pro缓存，保存第1模板后修改其revision；再保存不同模板第2；删除后重存。
2. 单页99/100/101行各独立run；设置分页模板或更大stored limits，claim返回min后的预算并展示确认。

观测断言：第1可保存，编辑revision不算新模板，第2拒绝；无许可不离线升Pro；100行有明确结束证据才completed；101整未seal页abort为limit_reached、不能静默变100成功；effectiveLimits免费1页/100行且template原limits保留；既有结果导出不锁Pro。
证据组：base, entitlement, templates, pages, transactions。

### M10-pro-template-limits — M10

层：unit, realIDB, ordinaryChrome；setup：TEMPLATE；状态planned/not-run。

1. 只用明确TEST_ONLY ECDSA许可，保存第49/50/51个不同templateId及并发第50/51保存；预算设置超过Pro硬上限。

观测断言：最多50模板，51拒绝且事务计数不越界；产品硬上限50页/10000行/10min/20MiB；签名验证通过不证明真实购买；编辑不可变revision不额外占模板数。
证据组：base, entitlement, templates, transactions。

### M10-signature-revocation — M10

层：unit, realIDB, ordinaryChrome；setup：按步骤独立准备；状态planned/not-run。

1. 包内测试公钥验证固定canonical payload；改issuer/subject/features/issuedAt/expiresAt/keyId/revocationVersion各字段或签名字节。
2. 未知key、过期、算法错误；签名撤销版本上升后再次开始Pro；送低版本/无签名撤销；本地时间回拨。

观测断言：仅可信key ECDSA P-256/SHA-256有效未过期声明准Pro；签名错误/过期/未知key降free并提示；撤销可信且版本单调，旧/无签名证据不能冒充有效更新；回拨冻结新Pro；无私钥/支付/远程执行逻辑入pack。
证据组：base, entitlement, transactions。

### M10-offline-72h — M10

层：unit, realIDB, ordinaryChrome；setup：按步骤独立准备；状态planned/not-run。

1. 测试许可证expiresAt在未来足够远；隔离clock距lastTrustedVerifiedAt分别71h59m59.999s、72h、72h+1ms且断网。
2. 另无许可缓存、有效缓存但expiresAt已过、签名无效、回拨；真实Chrome断网读取提前种入的带签名测试验证记录。

观测断言：未过期有效已知许可且离线<=259200000ms允许新Pro；+1ms降free；无缓存绝不变Pro；到期即降free，72h不延长expiresAt；真实墙钟与注入clock分别记录，不能假称等待72h实测；既有导出仍可用。
证据组：base, entitlement, transactions。

### M10-approved-run-snapshot — M10,M07,M08

层：unit, realIDB, ordinaryChrome；setup：JOURNEY；状态planned/not-run。

1. 有效Pro获批C2x3，claim保存授权snapshot/effectiveLimits/hash；运行中许可证到期或接收新撤销/断网超72h。
2. 继续已批run，随后尝试新Pro run与第2模板保存；已seal结果到期后导出/再次导出。

观测断言：本轮按已批准snapshot不被新许可状态改写；新任务降free/禁止新Pro；已获批采集/取回/导出不扣留，仍受stop、权限撤销及产品硬上限；授权快照不绕过origin权限。
证据组：base, entitlement, identity, transactions, pages, downloads。

### M10-delete-pins-retention — M10

层：realIDB, ordinaryChrome；setup：DOWNLOAD；状态planned/not-run。

1. 保留策略7天：active run、open export、read cursor pin、未决journal保护；正常终态无保护数据过期清理。
2. 用户删除有active目标/未决下载的run，先围栏/退役、释放读pin、未决attempt abandoned/tombstone，然后旧batch/seal/receipt到达。

观测断言：不能清active/未决；审计/tombstone至少7天；显式删除不复活，旧下载证据只审计；迁移失败只读+字节备份而非空新库；slot释放依据旧tab消失。
证据组：base, identity, storage, transactions, downloads。

### M11-authorized-real-list — M11,M02,M03,M04,M05,M07,M08,M09,M10

层：ordinaryChrome；setup：JOURNEY；状态planned/not-run。

1. 在04登记一个授权真实列表origin、起始URL、字段/分页/时间范围与授权证据ID；未提供即not-run。
2. 正常页面选区预览保存；同模板两次新run，人工冻结或记录每次可见DOM snapshot以核数据；停止第三次run再导出已seal部分。
3. 两个普通Chrome版本分别跑；记录站点变更/登录/动态数据差异，download实际query终态；不外推其他站点。

观测断言：原页面不被正式翻页、run隔离；每次记录集合与本次页面证据吻合，不能把动态站点两次条数必须相同作为通用断言；明确失败/停止/部分导出；无授权不执行；只对该站点/版本/时间范围给结论。
证据组：base, site, identity, templates, pages, downloads, entitlement。

### M11-production-pack-journey — M11

层：ordinaryChrome；setup：JOURNEY；状态planned/not-run。

1. 校核02B底座handoff与03 B-only领域结果；以最终production pack重复完整JOURNEY和stop/导出路径。
2. 核只有一个manifest/RunHost/IDB连接公共owner，根入口槽仅一次；测试专用fault/probe入口不在交付包。

观测断言：M02-M11适用门禁均有当前pack新证据；A-only/B-only/占位不能替代组合闭环；M12仍独立pending；真实Chrome缺口不冒称ready。
证据组：base, identity, transactions, pages, exports, downloads。

## 三类迁移与所有现有向量

| 迁移ID / 门禁 | 具体复现 | 断言 |
| --- | --- | --- |
| `confirmed-single-page` / M01,M03,M04,M08 | 在解析前逐字节保存legacy-config.json备份并核Base64/byteLength/SHA256；用真实迁移器读取vector input.dom/context和显式确认字段。 比较完整expected.templateRevision/draft/errors/operations；绝不能根据DOM或当前URL猜补缺字段。 可执行类通过统一compiler/save/关窗重开/preview/run，比较rawRecords/typedRecords/columns和JSON/CSV精确字节。 | single-page=3行，无title过滤，150中文字、0/false/空串/null、小数与列序精确；完整revision1/hash一致；完整预期见`contracts/fixtures/migration/single-page/vector.json#/expected` |
| `next-selector-was-memory-only` / M01,M03,M05 | 在解析前逐字节保存legacy-config.json备份并核Base64/byteLength/SHA256；用真实迁移器读取vector input.dom/context和显式确认字段。 比较完整expected.templateRevision/draft/errors/operations；绝不能根据DOM或当前URL猜补缺字段。 补全/非法类尝试save/run/export必须拒绝，expected-*-emitted.bin=0字节；不生成[]/表头/DownloadAttempt；核源备份未变。 | pagination-information-lost需要补URL/row/分页selector等与preview；不得猜成none，draft不能保存/运行；完整预期见`contracts/fixtures/migration/pagination-information-lost/vector.json#/expected` |
| `unsupported-config` / M01,M03,M09,M10 | 在解析前逐字节保存legacy-config.json备份并核Base64/byteLength/SHA256；用真实迁移器读取vector input.dom/context和显式确认字段。 比较完整expected.templateRevision/draft/errors/operations；绝不能根据DOM或当前URL猜补缺字段。 补全/非法类尝试save/run/export必须拒绝，expected-*-emitted.bin=0字节；不生成[]/表头/DownloadAttempt；核源备份未变。 | 非法code/javascript配置不执行，完整原字节备份保留，不清库、不覆盖；完整预期见`contracts/fixtures/migration/illegal-config-backup/vector.json#/expected` |

每类先备份原始字节而非parse/stringify替代；有效单页完整template/raw/typed/columns/JSON/CSV逐对象逐字节比对；缺分页信息与非法配置为不可执行draft/拒绝，零发出字节不是成功空导出。确认只属于合成fixture，不能称真实用户确认。

| 现有向量suite | 数量 | 全部ID |
| --- | --- | --- |
| strict-conversion | 29 | `number-0`, `number-1`, `number-2`, `number-3`, `number-4`, `number-5`, `number-6`, `number-7`, `number-8`, `number-9`, `number-10`, `number-11`, `number-12`, `boolean-0`, `boolean-1`, `boolean-2`, `boolean-3`, `boolean-4`, `boolean-5`, `boolean-6`, `boolean-7`, `number-safe-negative-boundary`, `number-unsafe-negative-integer`, `number-unsafe-integral-decimal`, `number-unsafe-negative-exponent`, `number-fractional-exponent`, `number-fractional-negative`, `number-integral-exponent`, `number-rounds-to-unsafe-integer` |
| strict-url | 19 | `relative-base-uri`, `unicode-trim-cross-https`, `cross-http`, `protocol-relative-cross`, `username-password`, `username-only`, `password-only`, `encoded-credentials`, `empty`, `unicode-only`, `javascript-scheme`, `ftp-scheme`, `invalid-host`, `optional-missing`, `execution-cross-origin`, `pagination-cross-origin`, `pagination-same-origin`, `execution-credentials`, `pagination-credentials` |
| csv-formula-safety | 45 | `ecma-0009`, `ecma-000b`, `ecma-000c`, `ecma-0020`, `ecma-00a0`, `ecma-1680`, `ecma-2000`, `ecma-2001`, `ecma-2002`, `ecma-2003`, `ecma-2004`, `ecma-2005`, `ecma-2006`, `ecma-2007`, `ecma-2008`, `ecma-2009`, `ecma-200a`, `ecma-202f`, `ecma-205f`, `ecma-3000`, `ecma-feff`, `ecma-000a`, `ecma-000d`, `ecma-2028`, `ecma-2029`, `unicode-plus`, `unicode-minus`, `unicode-at`, `mixed-prefix`, `tab-plain`, `cr-plain`, `tab-only`, `cr-only`, `lf-plain`, `unicode-plain`, `zero-width-space`, `mongolian-vowel-separator`, `next-line-not-ecma`, `negative-number`, `positive-number`, `number-zero`, `boolean-false`, `empty-string`, `null-string`, `unicode-formula-header` |
| template-rejection | 9 | `unknown-top`, `unknown--list`, `unknown--fields-0`, `unknown--pagination`, `unknown--limits`, `restricted-json-5`, `restricted-json-6`, `restricted-json-7`, `restricted-json-8` |

逐向量production compiler/formatter执行→真实DOM/CSS/baseURI→realIDB重开→原字节JSON/CSV核对；非法非空值拒绝整页seal，不默默丢行。type安全整数判断基于Number转换后的实际结果，包含负边界、小数写法/指数的整数结果与舍入成不安全整数；record小数digest用JS数值编码，不能从Python整数校验推断已验证小数。

## 新增40个类型/规范化向量

NV-T01–NV-T40直接嵌入test-plan.json，含输入field、完整DOM、context、mutation、expected与逐层复现步骤，未写新fixture文件。与现有29转换向量独立。合法字段值构造完整独立单field模板（fields=[value]、columns=[value]、pagination=none、所需capabilities/hash重算），必须核raw/typed分离、realIDB重开与JSON类型；配置mutation在完整单页模板/DOM副本执行，纯canonical向量直接用envelope；拒绝不得保存或seal。

| ID | 输入或mutation | 明确预期 |
| --- | --- | --- |
| `NV-T01` 可选缺元素为null | `{"type":"number","raw":null,"required":false,"transforms":[]}` | `{"raw":null,"typed":null,"pageSealable":true}` |
| `NV-T02` 可选已有空string保持空串 | `{"type":"string","raw":"","required":false,"transforms":[]}` | `{"raw":"","typed":"","pageSealable":true}` |
| `NV-T03` 必填已有空string合法 | `{"type":"string","raw":"","required":true,"transforms":[]}` | `{"raw":"","typed":"","pageSealable":true}` |
| `NV-T04` 必填缺元素失败 | `{"type":"string","raw":null,"required":true,"transforms":[]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T05` 可选缺属性为null | `{"type":"string","raw":null,"required":false,"transforms":[]}` | `{"raw":null,"typed":null,"pageSealable":true}` |
| `NV-T06` 必填缺属性失败 | `{"type":"string","raw":null,"required":true,"transforms":[]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T07` 可选非缺失空number失败 | `{"type":"number","raw":"","required":false,"transforms":[]}` | `{"error":"E_SEMANTIC","diagnostic":"number","pageSealable":false}` |
| `NV-T08` 可选非缺失空boolean失败 | `{"type":"boolean","raw":"","required":false,"transforms":[]}` | `{"error":"E_SEMANTIC","diagnostic":"boolean","pageSealable":false}` |
| `NV-T09` ECMAScript Unicode trim保留raw | `{"type":"string","raw":"\u00a0\ufeff x \u3000","required":false,"transforms":["trim"]}` | `{"raw":"\u00a0\ufeff x \u3000","typed":"x","pageSealable":true}` |
| `NV-T10` normalize-space保留原白字符 | `{"type":"string","raw":" a\u00a0\u3000b\t\nc ","required":false,"transforms":["normalize-space"]}` | `{"raw":" a\u00a0\u3000b\t\nc ","typed":"a b c","pageSealable":true}` |
| `NV-T11` 150中文不截断 | `{"type":"string","raw":"\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f","required":false,"transforms":[]}` | `{"raw":"\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f","typed":"\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f\u957f","characterCount":150,"utf8Bytes":450,"pageSealable":true}` |
| `NV-T12` HTML样式值安全文本渲染 | `{"type":"string","raw":"<img src=x onerror=alert(1)>","required":false,"transforms":[]}` | `{"typed":"<img src=x onerror=alert(1)>","scriptExecutions":0,"pageSealable":true}` |
| `NV-T13` 字段多匹配拒绝 | `{"type":"string","raw":"a","required":false,"transforms":[]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T14` 正安全整数边界 | `{"type":"number","raw":"9007199254740991","required":false,"transforms":["trim"]}` | `{"typed":9007199254740991,"pageSealable":true}` |
| `NV-T15` 负安全整数边界 | `{"type":"number","raw":"-9007199254740991","required":false,"transforms":[]}` | `{"typed":-9007199254740991,"pageSealable":true}` |
| `NV-T16` 负零的JSON数值编码 | `{"type":"number","raw":"-0","required":false,"transforms":[]}` | `{"raw":"-0","jsonNumberBytes":"0","pageSealable":true}` |
| `NV-T17` 有限小数指数 | `{"type":"number","raw":"1e-3","required":false,"transforms":[]}` | `{"typed":0.001,"jsonNumberBytes":"0.001","pageSealable":true}` |
| `NV-T18` 小数舍入到不安全整数拒绝 | `{"type":"number","raw":"9007199254740991.5","required":false,"transforms":[]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T19` metadata小数拒绝 | `{"path":"/limits/maxPages","value":1.5}` | `{"error":"E_SCHEMA","hashAllowed":false}` |
| `NV-T20` record小数canonical使用JS | `{"operation":"record-canonical","value":{"z":-0.0,"b":12.5,"a":0.001}}` | `{"canonicalUtf8":"{\"a\":0.001,\"b\":12.5,\"z\":0}","sha256Input":"UTF8 of canonicalUtf8"}` |
| `NV-T21` 孤立高代理字符拒绝 | `{"path":"/fields/0/label","value":"\ud800"}` | `{"error":"E_SCHEMA","hashAllowed":false}` |
| `NV-T22` 孤立低代理字符拒绝 | `{"path":"/fields/0/label","value":"\udc00"}` | `{"error":"E_SCHEMA","hashAllowed":false}` |
| `NV-T23` 不做Unicode NFC归一化 | `{"operation":"compare-label-canonical","values":["\u00e9","e\u0301"]}` | `{"precomposedUtf8Hex":"c3a9","decomposedUtf8Hex":"65cc81","hashesEqual":false}` |
| `NV-T24` ASCII对象键排序 | `{"operation":"canonical-fixture","fixture":"contracts/fixtures/canonical.json"}` | `{"canonicalUtf8":"{\"a\":false,\"empty\":\"\",\"none\":null,\"text\":\"\u4e2d\u6587\",\"z\":0}","sha256":"d34c01f2420389c80d3ef7413bec30f4ade538ba2805448f23ef50215eddefc5"}` |
| `NV-T25` columns数组序影响hash | `{"operation":"reverse-columns-in-copy"}` | `{"hashesEqual":false,"originalRevisionUnchanged":true}` |
| `NV-T26` 重复JSON对象键拒绝 | `{"operation":"parse-raw-json","bytes":"{\"a\":1,\"a\":2}"}` | `{"error":"E_SCHEMA","hashAllowed":false}` |
| `NV-T27` 数据跨origin URL合法 | `{"type":"string","raw":"\u00a0https://external.example/item?tag=\u4e2d\u6587\u3000","required":false,"transforms":["trim","resolve-url"]}` | `{"typed":"https://external.example/item?tag=%E4%B8%AD%E6%96%87","pageSealable":true,"networkActions":0}` |
| `NV-T28` URL凭据拒绝 | `{"type":"string","raw":"https://alice:secret@fixture.example/item","required":false,"transforms":["resolve-url"]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T29` 执行URL跨origin拒绝 | `{"path":"/startUrl","value":"https://external.example/list"}` | `{"error":"E_SEMANTIC","targetAllowed":false,"chromeCalls":0}` |
| `NV-T30` boolean大写拒绝 | `{"type":"boolean","raw":"FALSE","required":false,"transforms":["trim"]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T31` boolean精确token trim | `{"type":"boolean","raw":" true ","required":false,"transforms":["trim"]}` | `{"raw":" true ","typed":true,"pageSealable":true}` |
| `NV-T32` number前导零拒绝 | `{"type":"number","raw":"01","required":false,"transforms":[]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T33` 有限负小数 | `{"type":"number","raw":"-12.5","required":false,"transforms":[]}` | `{"typed":-12.5,"pageSealable":true}` |
| `NV-T34` 危险字段键拒绝 | `{"path":"/fields/0/id","value":"__proto__"}` | `{"error":"E_SCHEMA","hashAllowed":false}` |
| `NV-T35` 有序transforms不改raw | `{"type":"string","raw":"\u00a0 A\t B \u3000","required":false,"transforms":["trim","normalize-space"]}` | `{"raw":"\u00a0 A\t B \u3000","typed":"A B","pageSealable":true}` |
| `NV-T36` unknown transform拒绝 | `{"path":"/fields/0/transforms","value":["eval"]}` | `{"error":"E_SCHEMA","hashAllowed":false}` |
| `NV-T37` 已有空URL不可解析成base | `{"type":"string","raw":"","required":false,"transforms":["resolve-url"]}` | `{"error":"E_SEMANTIC","pageSealable":false}` |
| `NV-T38` 可选缺URL保持null | `{"type":"string","raw":null,"required":false,"transforms":["resolve-url"]}` | `{"raw":null,"typed":null,"pageSealable":true}` |
| `NV-T39` text分支attribute必须null | `{"path":"/fields/0/attribute","value":"href"}` | `{"error":"E_SCHEMA","hashAllowed":false}` |
| `NV-T40` 能力集合必须恰覆盖规则 | `{"operation":"remove-required-read-capability"}` | `{"error":"E_CAPABILITY","saveAllowed":false}` |

## 必填真实证据记录

JSON evidenceFields是执行报告字段合同；字段名不是已生成观测。每次报告先填base，按case.evidenceGroups增加字段；不适用填null+理由，不编造下载ID、时间、版本、截图、磁盘hash。所有observed目前为未执行，evidence=[]。

| 证据组 | 必填字段 |
| --- | --- |
| base | `testExecutionId`, `caseId`, `gateIds`, `layer`, `status`, `productResult`, `startedAt`, `endedAt`, `operator`, `runnerCommand`, `runnerVersion`, `exitCode`, `stdoutPath`, `stderrPath`, `osVersion`, `architecture`, `browserProfileId`, `actualBrowserVersion`, `channelEvidencePath`, `browserBinaryHash`, `profileIsolationId`, `extensionId`, `manifestHash`, `buildHash`, `sourceCommitOrTreeHash`, `lockfileHash`, `contractVersion`, `contractHash`, `inputSnapshotHashes`, `fixtureIdsAndHashes`, `faultInjectionKind`, `testBuildDiffHash`, `screenshotsOrVideoPaths`, `assertions[{id,expected,observed,verdict,evidencePath}]`, `errorOrPendingReason` |
| identity | `runId`, `templateId`, `templateRevision`, `templateHash`, `compilerVersion`, `planHash`, `hostInstanceId`, `hostDocumentId`, `ownerEpoch`, `runRevision`, `targetSessionId`, `sourceTabId`, `tabId`, `frameId`, `documentId`, `targetVersion`, `permissionGrantAndRevokeEvidence`, `slotOwnerBeforeAfter`, `retirementId`, `tabAbsenceEvidence` |
| transactions | `databaseName`, `dbVersion`, `storeNames`, `txId`, `operation`, `commitSeq`, `eventSeq`, `cancelSeq`, `transactionOncompleteAt`, `transactionAbortAt`, `beforeProjection`, `afterProjection`, `commitOrderingTracePath` |
| commands | `commandId`, `commandDigest`, `preparedAt`, `dispatchCommitAt`, `chromeInvocationAt`, `chromeInvocationCount`, `confirmedAt`, `authenticatedSenderEvidence`, `journalStateBeforeAfter`, `effectProofOrUnknownReason`, `newCommandCountAfterCancel` |
| pages | `snapshotId`, `pageSequence`, `pageIdentity`, `pageSignature`, `batchIds`, `batchIndexes`, `batchDigests`, `utf8BytesMeasured`, `utf8BytesReported`, `ackAt`, `sealDigest`, `sealCommitSeq`, `stagedRows`, `visibleRecordKeys`, `committedCount`, `committedPages`, `checkpoint`, `snapshotState`, `emptyOrEndEvidence`, `exportedRecordKeys` |
| storage | `storageEstimateUsageQuotaBeforeAfter`, `stagedBytesIncludingAbortedPages`, `profileBytes`, `pendingACKPeak`, `cursorPageSizePeak`, `readerPins`, `migrationBackupByteHash`, `quotaErrorNameAndTxAbort`, `activeOrPendingCleanupProtection`, `tombstoneId` |
| templates | `fullTemplateInputHash`, `fullTemplateOutputHash`, `canonicalBytesHash`, `requiredCapabilities`, `columns`, `rawRecordsDigest`, `typedRecordsDigest`, `previewPlanHash`, `runPlanHash`, `headRevisionBeforeAfter`, `parentConflict`, `nameRevision`, `diagnosticPointer` |
| exports | `exportJobId`, `sealWatermark`, `partialConfirmed`, `artifactId`, `volumeIndex`, `volumeCount`, `artifactHash`, `artifactBytes`, `artifactRowCount`, `format`, `csvMode`, `manifestPath`, `expectedBytesHash`, `observedBytesHash`, `contentValidation`, `jobActiveAttemptIds`, `jobState` |
| downloads | `attemptId`, `attemptState`, `blobUrlHashAndProtectedFullUrlEvidence`, `downloadId`, `callbackDownloadId`, `productionDownloadInvocationCount`, `probeDownloadInvocationCount`, `onCreatedIds`, `candidateDistinctIds`, `candidateRejectionReasons`, `queryStartedAt`, `queryCompletedAt`, `searchEvidencePath`, `byExtensionId`, `startTime`, `dispatchAt`, `mappingDeadline`, `downloadDeadline`, `timedOutAt`, `resourceReleasedAt`, `observedDownloadState`, `interruptReason`, `receiptLate`, `browserDownloadComplete`, `diskHashVerified=false`, `optionalIndependentDiskReadEvidencePath`, `jobBeforeAfter`, `oldAttemptTombstone` |
| resources | `heapOrProcessMemoryMeasurementMethod`, `hostPeakBytes`, `swPeakBytes`, `baselineBytes`, `samplesPath`, `recordCountAtPeak`, `blobCount`, `blobBytesPeak`, `releasedUrlCount`, `deadlineTimerActualElapsedMs`, `cleanupAfterTerminal` |
| entitlement | `testLicenseLabel`, `issuer`, `subjectHash`, `keyId`, `signatureAlgorithm`, `canonicalPayloadHash`, `verificationResult`, `issuedAt`, `expiresAt`, `lastTrustedVerifiedAt`, `offlineElapsedMs`, `wallClockBeforeAfter`, `revocationVersionBeforeAfter`, `tierAtClaim`, `templateLimits`, `effectiveLimits`, `approvedSnapshotHash`, `existingExportAllowed` |
| site | `fixtureServerSourceHash`, `seed`, `origin`, `pageRequestSequence`, `clickCount`, `sourcePageUrlBeforeAfter`, `siteAuthorizationEvidenceId`, `authorizedOriginAndFields`, `dataSnapshotHash`, `redactionPolicy`, `networkObservationPath` |

事务证据至少有DB/store/txId/oncomplete/commitSeq及前后投影；行集合证据用snapshot/rowIndex/recordKey与sealed水位关联，count=可见集合=导出集合。下载证据必须有attempt/job/artifact归属、原URL保护证据、原生search字段、候选拒绝原因与调用计数；扩展receipt的diskHashVerified永远false。测试者独立读磁盘核hash要另记testDiskHash/读取方法，不回填产品声明。真实站点只保授权范围内证据，日志脱敏，禁止cookie/token。

## M12独立商业pending与未完成依赖

M12由产品负责人单独收集：5名目标用户各用同模板至少跑两次，至少3名愿付费试用或实际购买（意愿/成交分开），逐人记录原工作与新闭环耗时，目标减少至少50%。保存授权、日期、口径、报价/购买证据及签发/支持运营政策。目前evidence=[]、pending；测试签名不代表交易。它不阻断阶段01设计或技术范围完成，也不能据此宣布可收费上线。

| 依赖 | owner | 精确缺口 |
| --- | --- | --- |
| DEP02A-02B-RUNNERS | ['02A', '02B'] | 02A提供真实build/pack/manifest/window/static-injection-slot与工程测试命令；02B提供可靠底座unit/realIDB、控制站点、故障屏障/Chrome harness及证据目录，不能由02A假通过。 |
| DEP02B-03-DIAGNOSTICS | ['02B', '03'] | 将fixture局部diagnostic映射到contract公共错误包，保持向量拒绝语义，不擅自新增公共error |
| DEP04-BROWSERS | 04 | 普通120完整版本、执行当日当前Stable完整版本与频道必须实测；本机plist只元数据 |
| DEP04-REAL-SITE | 04 | 一个明确授权真实列表URL/字段/范围与证据尚未登记 |
| DEP04-NATIVE-FAULTS | 04 | native quota/disk full/迟到下载/自然SW终止等须真实制造与观测；无法观测就精确pending，不用mock填passed |
| SNAPSHOT-RECHECK | 02A/02B at handoff | 其他01作者正在修URL规则；启动时重核合同/向量hash与本计划语义，设计可审查但不是产品ready |
| DEP05-CODEGRAPH | 05 via parent handoff | 第⑤阶段CodeGraph来源关系复用审计为新增阶段01 ready必要依赖；路径/hash待父交接；必须按真实finding补影响测试映射，当前phase01ReadyBlocked=true。 |

本阶段交付可审查且静态输入可验证；产品实现、unit/realIDB/普通Chrome全都not-run。下游依实际runner、pack和版本新证据逐case填报告，不修改此计划把旧mock产物升级为passed。

## 第⑤阶段CodeGraph审计：阶段01 ready外部新增依赖

`DEP05-CODEGRAPH: pending`；`requiredForPhase01Ready=true`；路径/hash由父交接提供，目前null，本作者未执行CodeGraph审计。此项是用户新增的ready必要条件，当前阶段01 ready依赖仍未闭合；本测试设计交付不能代替该审计，也不宣称产品测试执行。

父交接须给实际source关系图及复用清单artifact路径/hash、来源版本/hash、入口/依赖/复用行为/改造或弃用建议、复现命令及pending。收到后按每个真实finding补`finding→受影响模块→existing/new test ID→fixture/oracle变更→新hash`映射，产品状态仍not-run直至实际执行。候选影响范围如下，仅为后续追踪计划，不是审计发现：

| 候选来源关系范围 | 待核测试ID |
| --- | --- |
| source-relations | `M01-source-readonly`, `confirmed-single-page`, `next-selector-was-memory-only`, `unsupported-config` |
| selection-and-ui | `M02-classic-selection`, `M02-two-windows-race`, `M03-css-missing-empty` |
| compiler-field-reads | `template-falsy-long-notitle`, `M03-revision-cas`, `suite:strict-conversion`, `suite:strict-url`, `NV-T01..NV-T40` |
| pagination-core | `run-isolation-pagination`, `pagination-signature`, `budget-plus-one`, `M05-end-empty-evidence` |
| pipeline-storage-owner | `three-batch-last-fails`, `three-batch-seal`, `FX-PAGE-lastBatchFailure`, `FX-PAGE-allSealed`, `M06-seal-validation-watermark`, `M07-host-loss-sw-reconnect` |
| formatter-download | `M08-format-byte-volume`, `suite:csv-formula-safety`, `download-reexport-isolation`, `FX-DOWNLOAD-late-reexport` |
| single-product-boundary | `module-single-product`, `M11-production-pack-journey`, `M09-package-restricted` |

⑤真实handoff与17组件已收到，54复用/29动态边及232处引用已由主线验证；独立solution delta已关闭，设计ready。旧源码回归只作行为参考，新产品oracle以当前JSON assertions为准。

## 原测试作者历史静态校验记录（不代表当前放行状态）

JSON语法检查退出0；新增精确fixture模板/stage/pageSignature的canonical字节/hash、252×3=756字节及P0/P1 oracle关系检查退出0。计划映射检查确认36原ID/expected完全保留、118个独立case ID唯一、M01–M11引用闭合、14个精确fixture Pointer可解析、40新增类型向量与1000条压力目标一致、上游snapshot hash无变化。这些只证明设计文件/fixture内部一致，产品测试执行数0、普通Chrome验收数0、status=planned/productResult=not-run；⑤图与复用清单ready依赖仍pending。

## v5主审补充测试（均planned/not-run）

ENV-build-package、ENV-window-singleton、ENV-health-static-slot由02A建立实际工程证据；PORT-raw-frame-auth-backpressure、PORT-command-plan-binding、TEMPLATE-metadata-backup-cas和ENTITLEMENT-crypto-wire由02B/03负责相应公共/领域断言，04独立验收。具体输入、屏障、128/64/256KiB边界、sender/plan绑定、命名CAS/备份、P1363签名断言在test-plan.json。02A环境passed不替代这些公共可靠行为测试。

## 初审反例修订

22个PIC协议反例和4个SOURCE选区反例均已索引test-plan.json，具体输入见protocol-repair-vectors.json/source-selection.json；raw帧和稳定页签名分别见page-read-frames.json/page-signature.json。所有案例planned/not-run，初审关闭仍需独立最终复审。

PF-01/PF-02最终增量：pagination-signature重复内容/无末页依据与PIC06统一paused_unknown；complete+abandoned与abandoned+unknown的job固定delivery_failed，晚到只审计。全部planned/not-run。

## 复用回归oracle与v1合同统一

CORE-R01..R10、EXT-T01..T18保留⑤旧行为为sourceBaselineAssertions/sourceBaselineReproductionSteps，明确仅来源参考；新assertions遵循固定RulePlan/CSS、串行单目标、严格停止/整页seal、当前状态投影与Artifact/attempt回执。选区点击始终阻止源码页导航；XPath、通用callbacks/priority frontier、pause/resume、Node drain和旧结果/状态均不列为产品通过要求。候选UI循环与执行翻页区分。28个实际case已逐项补精确gates/ownerStages；CORE-R09含M08/02B、EXT-T01含02A并分开壳与来源权限、EXT-T09分开02A静态槽与03真选区。全数planned/not-run，独立最终delta已批准，产品执行仍待02B/03/04。

## 阶段01最终设计交接

⑤实际审计、两个独立final review和复用oracle/owner/gate已关闭设计依赖。35项静态设计校验与迁移向量参考核验通过；所有产品case仍planned/not-run，M01–M11产品门禁未执行，M12商用门禁未放行。⑥仅独立浏览器探针环境ready，installedBuild=null。后续02A环境、02B底座、03领域、04验收依次交接。
