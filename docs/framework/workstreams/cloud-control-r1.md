# Cloud Control R1.1 续接检查点（2026-10-11）

续接检查点于北京时间 2026-10-12 保存；文件名保留原任务日期 2026-10-11。

用户要求保存关键结论，转新对话继续，避免重复执行。状态 **HANDOFF_REQUESTED**，并非全部验收完成。精确机器记录：`cloud-control-r1.json`、`evidence/cloud-control-r1/handoff-20261011.json`；续接提示词：`../prompts/cloud-control-r1-continuation-20261011.md`。

保存时 main HEAD `030cc248de025e0434d38b188de93e941974f3e5`。开工 HEAD `60ed45f35499b6ab445c2284e862aa8b980ab009`、origin/main `27725032340c2cbffc9074f10bfb7be9342394d6`。并行对话已多次同步提交 main，多数云控源码已在混合提交中；这些提交不能视为本任务完整验收提交。其他 Agent 的工作区及暂存内容必须保留。

## 已实施及可复用证据

- **SOURCE_CONFIRMED**：`scripts/cloud-control/` 真实持久 HTTP/WebSocket 提供者及 CLI；`src/cloud-control/` 原生连接、授权、持久请求；固定 SW 云入口；原 controller-methods/authority/broker/client/RunHost 两阶段许可；原 runs/@slot、Result、commandJournal；受限取消、撤权、投影、补传与对账；我的任务托管入口。当前10个云控核心文件与原生候选字节相同，交接复核10/10，`native-source-parity.json`。该证据不认证最新main的其他产品差异。
- **COMPONENT_TESTED**：原 controller/recovery/task + cloud 119/119，`targeted-final-local.tap`；取消queued Job专项2/2，`provider-cancelled-queue.tap`；预算12/12，`budget-384-final.tap`；源码检查442文件，`check-final-local.log`。新中断观察器 `node --check tests/cloud-control/native-interrupt.mjs` 通过。
- **BUILD_VERIFIED**：独立 `.runtime/cloud-control-r1/candidate-security` 已通过 check、build、build:dev、verify。生产 packageHash `44c6cfa5b937f0a84b5226e82181357494a886a314b0f7eb21cdeb937955f7a1`，SW324237bytes；开发 `6d49dbc069e153a1a909cc3ec65a03e1f68c79a333f00aac58bf47cb1e690146`，SW324403bytes。日志：`build-security-production-corrected.log`、`build-security-development.log`、`verify-security.log`、`snapshot-security-inputs.json`。用户允许适当调整，预算现384KiB硬门槛/320KiB提醒线，此候选仍低于原320KiB，CSP/权限/固定入口合同保留。
- **NATIVE_VERIFIED**：Gate1–3真实Chrome通过；Gate4仅以下列明的部分通过。
- **NOT_TESTED**：当前副作用后中断的实际恢复终态；执行过程中UI停止处理；真实Chrome IDB准入回滚/容量不足；运行中网站权限和Task安装授权撤销。组件证据不能升级为这些原生PASS。
- **BLOCKED（可选远端对接）**：mac24dev旧Midway服务仅回环且使用Socket.IO，18001/18002本机LAN不可用，协议不符。未修改或部署远端；本地真实提供者已可用。

所有以下证据文件均位于 `docs/framework/workstreams/evidence/cloud-control-r1/`，不重写旧receipt。部分原始日志被Git忽略但仍在本地，不能删除。

## 最高优先级：当前副作用后中断

`native-effect-interrupt-1791733558986.json`：原Worker真实返回 **Typed** 原生回执、Run running后，原生AX按下Chrome扩展开关；驱动退出0，`native-handoff-extension-ui.txt` 随后确认开关“关闭”。中断前retirement为not-started。

- Job `584bcbd1-eefa-4f78-8c52-8761a004dd4e`
- request `cloud:ed794251-e8b3-4345-8dfc-6e98e15181ab`
- Run `afd37543-f456-45f6-9e12-ea3548e65d4d`
- 预留resultId `0b388df6-783c-47b0-a8f9-3e9fd2df20a3`；不能作为完成Result的证据。
- 提供者交接时admitted；重新启用后的真实Run/Result尚未读取，**NOT_TESTED_RECOVERY**，不能宣称OUTCOME_UNKNOWN验收通过。

扩展当前停用，无新领取。保留Chrome/profile，禁止发送native-session的`stop`，它会删除profile。先读保存事实、复核恢复保护，再以真实Chrome UI启用扩展并观察原对账。禁止重投此Job、换键重跑、手写IDB、伪造许可/退休或手工释放原槽。中断前running观察不足以证明实际恢复终态。

首轮观察器误用`typed`，实际返回`Typed`，错过中断且原任务completed；失败日志`native-effect-interrupt-driver.log`保留。修正后本轮才记录到停用动作。不得把首轮算unknown PASS。

## 已通过的真实主执行关联

Gate1：原生WebSocket认证、提供者重启和same-profile Browser重启恢复，稳定Executor不变，先对账。
Gate2：固定已安装/启用/批准Task；原IDB创建原Run并占原槽、绑定请求；持久许可后才创建目标和派发原Worker。
Gate3：原RunHost/Worker真实填写姓名并提交；原Result持久化、原退休released、提供者receipt持久确认。

| 事实 | 身份 |
| --- | --- |
| Job | `c26f0334-2c0b-4a7a-85bd-a6150a2fa185` |
| assignment | `b53ca56b-ce35-48ba-a425-09ba109e67f9` |
| request | `cloud:b53ca56b-ce35-48ba-a425-09ba109e67f9` |
| Run | `4d333436-2002-4a79-9a30-b589a8602d2f` |
| Result | `bb5674f2-3fb6-462f-ad19-49691da22e75` |
| permit | `1617dd8f-4701-417c-8b79-c88829ed9964` |
| receipt | `1269df30-d16f-4c3b-9116-20b127403d5b` |

completed/released；4个原commandJournal controller-operation各submissionCount=1，带真实nativeReceipts。业务动作由原Worker完成，CDP只观察。Result源码摘要在`result.revision.sourceHash`。

Browser/提供者重启、同键`cloud-r1-final-restart-proof-20261011`重试，仍同一Run/Result/receipt，无新执行。证据：`native-final-before-restart.json`、`native-final-restart-ui.json`、`native-final-provider-persisted.json`、`native-final-repeat-after-restart.json`、`native-1791731899096/`。

更早首云Run `ec58d4ca-4808-48cb-94bc-fd8bcda6a3f4`、Result `767a9ff2-c229-47ff-8732-5331e3454336`，证据`native-1791729265752/`；旧profile已清理，证据保留，不重新执行这个已完成请求。

固定Task `sample.form-fill@1.0.0`，原包版本和摘要未改：manifestHash `57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a`；sourceHash `1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63`。

## Gate4真实范围、失败与缺口

- 同claim重放和异内容409：`native-real-claim-replay.json`。
- 许可响应丢失：Run `065b2116-379f-4984-b211-620570306e37`，只有一个原Run。故障路径必须`/v1/admission`；早期`admission`被E_SCHEMA拒绝，不计故障验收。
- 服务端运行中取消：`native-running-cancel-1791731723494.json`，Run `cb2e113b-65e5-4590-a1ca-1977d5e3314b`，原取消栅栏，stopped/released、持久receipt。
- 回执响应丢失：Run `29f748e8-c3d5-4bc4-be02-d04566fb23f7`，completed/released，仅补传同Result且一个receipt；`native-receipt-fault.json`、`native-final-receipt-loss-seed.json`及当前原生目录。
- 已取消未领取Job `cf5725fe-28ab-43d6-80a7-b24358374700`无assignment，provider现过滤`queued && !cancelled`，消费者专项通过。
- UI停止两轮在按钮实际处理前已经completed，不能标运行中取消PASS。保留`native-running-cancel-1791732794595.json`、`native-running-cancel-1791733129737.json`；它们证明托管撤销后停连接、已保存结果不再上传。中间一轮未勾当前页授权，未启用托管，失败亦保留。
- 已知显示问题：completed/released/receipt confirmed请求在云lease后续过期时，reconcile可能写`E_CLOUD_CANCELLED` reason。未观察到重跑，但UI容易误导，尚未修复，不能写“零已知问题”。

## 活资源

- Provider 127.0.0.1:43112，PID5208，session11122；目录`.local/cloud-control`，providerId `6854f350-a976-4ef0-87ab-95cd6e4674fa`。state.json/admin.json/provider.lock；凭据0600，不粘贴或提交。新对话先核实进程，不重复启动或删除数据。
- Demo 127.0.0.1:43111，PID48261，其他任务已有标准服务，复用且不关闭。
- CFT155.0.8059.39，PID97044，profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-eyauw4w0`，endpoint `ws://127.0.0.1:55972/devtools/browser/15518018-2340-4b3e-8e7a-5615ae808ae0`。
- 扩展`bldkfieeffncnmjgnmlkmdmimicflfen`当前停用；稳定Executor `cae55e61-ff22-411d-8684-cfd97e3a93d3`。
- Candidate `.runtime/cloud-control-r1/candidate-security/dist/production`；runner session84245，证据`native-1791731899096/`。PID90753→97044的same-profile restart额度已用一次，不再直接发送restart。跨对话session不可用时，连接现有CDP做只读观察，不另起浏览器掩盖未知运行。
- 原生输入工具`.runtime/cloud-control-r1/native-input`，源码`tests/cloud-control/native-input.swift`；只操作受控CFT真实AX/CG，先核实PID/profile与foreground，再做依赖动作。native-session历史`input`分支不要用于业务动作。
- root dist由Time Review协调，本任务只用独立candidate。用户已授权向Time Review对话`01a12b0d-92a1-7cf0-a883-0381f0567e09`发送资源交接消息。

## 下一步与复用规则

先收当前副作用后中断的恢复事实；补必要原生Gate4；修复终态reason；更新合同、架构、工作流、示例README；只对实际新增差异做必要定向验证，完成真实证据归档和安全本地提交。不推送main。

成功且相关输入/合同/环境未变的结果直接引用；不因换对话重复开工fetch、全量测试、双构建、安装、配对、重启链或completed请求。新产品输入缺少对应证据才重做必要构建。原始ENOSPC（targeted-final-security.tap，后targeted-capacity-retry.tap通过）、误root dist构建、旧profile误清理、错误故障路径和观察器失败均保留。旧工作流PID47253、profile8k3m3gr2和Gate1–4全部NOT_TESTED已过期，原文保存在`handoff-prior-workstream.md`，不作为当前结论。

## r14Final — 正式文档收敛（2026-10-12）

负责人：本轮 bounded writer；旧 writer 已关闭。唯一写入文件为本工作流 MD/JSON、[架构](../../architecture/browser-framework/cloud-control-r1.zh-CN.md)、[合同 README](../../contracts/execution-control/v0.2/README.zh-CN.md)、[示例 README](../../../examples/cloud-control/README.zh-CN.md)。只读复核当前源码、现有文档/交接差异和原始证据；不操作 Git/Chrome、不测试构建、不修改源码或其他工作流、不派代理。依赖为 leader 的源码/组件证据及后续候选冻结；本 writer 不占 Profile、端口、dist/ZIP。原工作流、JSON 的 status/evidence/receipt/identity 及历史资源描述均保留；以下追加内容记录本轮事实，不重写旧交接。

### 已确认的实现与组件边界

- **SOURCE_CONFIRMED**：R0.2 为上位设计；Browser/Desktop/Mobile 平级。开发 NodeProvider 非生产。TaskRef 的 surface/runtime、artifactType、不可变 version/hash 由各执行端解释；当前 ProviderJob.task 只引用固定 Browser Task，installationId/generation/builtin/dependency identity 仍由本机原安装/Revision/资源 owner 判定，不新增 wire 必填字段或第二套 Run/Result。
- [service.js](../../../src/cloud-control/service.js) 的 adoptPairing 经原 credential 的 auth 回应，在当前 epoch、Provider/Executor、grant/namespace 和原配置重验后补 legacyPairing 映射；不改旧 rows/digest/缓存网络 body/lease 或原 Run/Result/Receipt。现代 pairing 与获准 legacy requestKeys 分域；不同 grant/namespace/pair 不得串用。远端已有 runRef、本机无关联时拒绝第二 Run，只查原事实。
- [connection.js](../../../src/cloud-control/connection.js) 先原 auth/adoptPairing 再 WS 认证与对账。网络必须在 IDB 事务外；[idb.js 的 transact](../../../src/platform/storage/idb.js) 保留 keepalive 成功事件中的请求队列，支持 SHA-256 digest await，原准入/绑定/回滚事务合同不删。
- siteAuthorization 经真实 Chrome Grant 的只读 requireGrant 查询，granted/revoked/unknown/none 不构成新授权；slotState/pendingResources 独立于连接。paused_unknown，或 interrupted 且原 controller-operation/controller-navigation 为 dispatched/effect_unknown，才诊断未知效果；retirement fenced 独自不等于未知。产品仍为五 productTabs + 开发 sixthDebug，生产隐藏并阻止进入；原 Observer 控制台只读，不注册 Host，不领取、执行、授权或停止。
- **COMPONENT_TESTED**：[156 项首次日志](evidence/cloud-control-r14-final-20261012/targeted-r14-migration-ui.tap)为 155 通过/1 断言失败（cloudResolve 的扫描断言错误地挡住原 Task 授权查询）；leader 按授权基准修正后，[补验](evidence/cloud-control-r14-final-20261012/direct-query-followup.tap)该用例 1/1。不是一次 156/156 全量重跑；[Provider/connection](evidence/cloud-control-r14-final-20261012/connection-provider-current.tap) 11/11。旧 122/122、119/119、UI 19/19/38/38 等只按其输入身份复用，不相加为产品覆盖率。
- 当前候选 **BUILD_VERIFIED**：候选 C 的双构建、严格包验证与 ZIP 逐文件一致性已通过；原始回执见下方分账。真实 Chrome、独立 F3、ZIP 安装仍 NOT_TESTED，六维独立评分不能替代 native。component tested 不等于全面验收。

### 最高优先级历史现场与资源收尾

[恢复摘要](evidence/cloud-control-r14-final-20261012/historical-recovery-summary.json)、[稳定性复查](evidence/cloud-control-r14-final-20261012/historical-stability-1791799143631.json)、[关闭资源观察](evidence/cloud-control-r14-final-20261012/historical-resource-stop-observed.json)均保留原记录。旧生产 packageHash=`44c6cfa5b937f0a84b5226e82181357494a886a314b0f7eb21cdeb937955f7a1`，扩展 bldkfieeffncnmjgnmlkmdmimicflfen；Job 584bcbd1-eefa-4f78-8c52-8761a004dd4e，Request cloud:ed794251-e8b3-4345-8dfc-6e98e15181ab。原 Run afd37543-f456-45f6-9e12-ea3548e65d4d、Result 0b388df6-783c-47b0-a8f9-3e9fd2df20a3，singleRun=true：1 Run/1 Result，interrupted/fenced，workerRetired=true，@slot held/releaseCount=0，Receipt=null；两个原 operation 各 submissionCount=1，dispatchAt 均早于原中断，没有新 dispatch。

已经真 Chrome UI 恢复并复查，旧 incarnation 的 owned target creation-unknown 未解决，状态 **BLOCKED**。旧 Provider/CFT 已关闭，43112 已不监听；Profile、Provider state、IDB 保留，dataDeletion=false、nativeResourceReleaseAsserted=false。关闭进程不能替代原退休 released，也不能把此场景升为 PASS；不得重新 seed、伪造 ack、删库或手改槽释放。

### 五 Gate 分账

Gate 状态仅用 SOURCE_CONFIRMED、COMPONENT_TESTED、BUILD_VERIFIED、NATIVE_VERIFIED、BLOCKED、NOT_TESTED。历史旧账的其他词保留原文，不作为本段 Gate 状态；当前候选 C 已 BUILD_VERIFIED，原生 NOT_TESTED；旧未知现场仍 BLOCKED。

| Gate | 历史复用 | 已有 component 子场景 | 当前候选/未测 native | blocking | 本轮状态 |
| --- | --- | --- | --- | --- | --- |
| CONNECTION_VERIFIED | [旧交接](evidence/cloud-control-r1/handoff-20261011.json) Gate1 认证、Provider/同 Profile 重启，仅旧包 NATIVE_VERIFIED | 11/11：原 credential 配对迁移、轮换/撤销与旧 ticket/socket、WS 连接代次和对账 | C；新包配对、重连、SW/Host 重启及真实授权拒绝 NOT_TESTED | 缺当前同身份原生证据 | COMPONENT_TESTED |
| ADMISSION_VERIFIED | 旧 Gate2 原 IDB Run+pin+@slot、持久 Permit | 156 首轮+单例补验：固定安装/参数/owned 目标、grant/pair 域、缺本机关联的远端 runRef 拒绝第二 Run；原事务/Permit 回滚组件 | C；Chrome IDB rollback/quota、Task/网站撤权、许可拒绝时零 target/Worker NOT_TESTED | 缺真实 IDB 故障与准入负向证据 | COMPONENT_TESTED |
| EXECUTION_VERIFIED | 旧 Gate3 固定表单→原 Worker→Result/released/Receipt | 原 Run/Result 身份、输出投影、发送前权限、Receipt 幂等/补传组件 | C；新包真实填写提交、Result 自身 revision/sourceHash、released/Receipt 完整链 NOT_TESTED | 缺同候选真实执行闭环 | COMPONENT_TESTED |
| RECOVERY_VERIFIED | 旧 Gate4 仅已列子场景；本轮旧包恢复/稳定性复查为 BLOCKED | 取消/lease/旧 epoch、撤销、补传撤权、未知诊断、legacy 不重派组件 | C；运行中 UI Stop、撤权、Host 关闭、断连/重启、原 IDB 故障与未知资源合法释放 NOT_TESTED | 原 singleRun interrupted/fenced/@slot held、无 Receipt，旧 incarnation target 未证实释放 | BLOCKED |
| PRODUCT_VERIFIED | 旧本地/预算及 UI 组件按原身份复用，无完整产品 native | 五 Tab/开发第六调试、生产隔离、siteAuthorization/slotState/pendingResources、Observer 只读组件 | C；构建/包安全已验证；本地独立模式、窄宽度/缩放/键盘、刷新/关闭零执行仍 NOT_TESTED；六维已独立评审；F3/ZIP 安装 NOT_TESTED | 缺真实产品/原生交付证据 | BUILD_VERIFIED |

### 文档任务树与关闭条件

```text
Cloud Control R1.4 文档与正式验收
  P0 原未知副作用恢复：实施 SOURCE_CONFIRMED；旧包原生证据 BLOCKED
    源：原 Authority/controller-methods、RunHost、service.reconcile
    证据：historical-recovery-summary / historical-stability / historical-resource-stop-observed
    关闭：单原 Run/Result、无二次派发、可信 target/Worker 退休与原槽 released；按当前授权处理原 Receipt
  P0 安全准入与执行：实施 SOURCE_CONFIRMED；定向组件 COMPONENT_TESTED
    源：service / connection / provider / idb.transact / 原 Task service
    证据：targeted-r14-migration-ui + direct-query-followup + connection-provider-current
    关闭：当前同身份 CONNECTION/ADMISSION/EXECUTION/RECOVERY native，真实零副作用负向完整
  P1 产品与交付：实施 SOURCE_CONFIRMED；状态/导航/Observer 组件 COMPONENT_TESTED
    源：cloud-status-presentation / cloud-hosting / debug-workbench / cloud-control-console / sidebar-tab-memory
    证据：UI 工作流及上述定向日志；当前 C 构建 BUILD_VERIFIED；产品 native NOT_TESTED
    关闭：五 Tab/开发调试隔离、真实 Grant/槽/未知诊断、只读 Observer 零执行、同包宽度/缩放/键盘与本地模式
    关闭：五 Gate 各自证据齐全、六维独立评审、独立 F3 与一致 ZIP 安装证据
  P2 正式 Provider 与 Desktop/Mobile：NOT_TESTED；仅后续计划
    源：上位 R0.2 与本仓库 v0.2 README，当前 NodeProvider 仅开发实现
    关闭：唯一版本合同/认证/事务 unique/outbox/inbox/audit 与各端原 owner/权限；分别平台原生验收
```

六维独立评分：架构 **94**、安全 **94**、持久可靠性 **90**、UI/UX **87**、可维护性 **93**、测试证据 **83**。评分是质量评价，不是完成百分比或原生 PASS；具体扣分、相关文件与关闭条件见下面分账。

文档静态检查：五份文件的 144 个本地链接/锚点及证据引用存在，空白/文件末尾换行无问题，JSON 可解析；本 MD 原文逐字前缀保留，JSON 删除新增 r14Final 后与原对象完全一致。本轮只修改授权五文件；未运行 Git、Chrome、测试或构建，历史 BLOCKED 与当前候选 NOT_TESTED 不变。



### Leader 当前候选 C 与独立评审分账

候选 C 冻结于本地 HEAD `e859cf1942d2fc3dd70c4658052eecf51d60c68f` 加当时真实工作区输入；不是该提交的纯净构建。410 个构建输入逐项 SHA-256 已绑定，最终检查与当前输入无差异；同期并行任务的输入保留在 receipt，未混入本轮 Git 提交。根 `dist/development` 及已有 watcher 未被本轮构建覆盖。A/B 被 C 取代，保留原 receipt 与失败日志，不能作为 C 原生证据。

[当前候选身份](evidence/cloud-control-r14-final-20261012/candidate-c-build-identity.json)、[生产原始回执](evidence/cloud-control-r14-final-20261012/build-c-production-receipt.json)、[开发最终原始回执](evidence/cloud-control-r14-final-20261012/build-c-development-final-receipt.json)与原始 build/verify/pack 日志分别留存。

| 产物 | Package SHA-256 | ZIP SHA-256 | 身份及验证范围 |
| --- | --- | --- | --- |
| 生产 | `7d8058874fdc727a9ec21c41d8a176fdab092fdb4dbbfe284fb13a957d73257b` | `12085ae5ad3b269c84be30130536c97d349cbe37ab48e2279a6882a810cba230` | 90 文件；SW 334555 B；tool-shell 455595 B；BUILD_VERIFIED |
| 开发 | `9e2262ecda958200eb0c42eef901085909a318af34d48239fde2226dbfb7a93c` | `8d1613c683efb03d26a073c184ae175330e42e9d26695782e448f8c1ae6452e5` | 124 文件；SW 334721 B；tool-shell 455835 B；BUILD_VERIFIED |

ZIP 逐文件内容与对应 dist 原始 manifest SHA-256 相同，**ZIP 安装仍 NOT_TESTED**。tool-shell 超过非阻塞 320 KiB 提醒线但低于固定入口 512 KiB；本轮没有增加预算、权限、CSP 例外或远程执行代码。候选 C 的扩展 ID/Profile 尚未建立；空候选 A 的独立 Profile 已停止并保留，其 inventory 不构成 C 运行证据。

本轮新增 [Browser/Provider 11/11](evidence/cloud-control-r14-final-20261012/browser-provider-integration.tap)使用真实 HTTP/持久磁盘和 Browser doubles；[test:cloud 22/22](evidence/cloud-control-r14-final-20261012/test-cloud-final.tap)、[Authority Cloud 16/16](evidence/cloud-control-r14-final-20261012/authority-cloud-final.tap)、[UI 修复 50/50](evidence/cloud-control-r14-final-20261012/ui-review-fixes.tap)均 COMPONENT_TESTED。资源合同首轮 [62 项 59 PASS/3 FAIL](evidence/cloud-control-r14-final-20261012/ui-assets-final.tap)的原记录保留：新 CSS 未加入旧 fixture/旧 HTML 资源断言；修正后仅 [受影响 17/17](evidence/cloud-control-r14-final-20261012/ui-assets-followup.tap)补验。原 156 项首轮仍为 155 PASS/1 FAIL，加原失败用例补验 1/1，未改写为一次 156/156。

[独立架构/安全评审](evidence/cloud-control-r14-final-20261012/expert-architecture-security-review.md)与 [UI/证据复审](evidence/cloud-control-r14-final-20261012/expert-ui-followup-review.json)未发现新可证实 P0/P1 源码 bug。两处已证实 UI 源码缺口已经关闭：Debug 固定 `E_DIAGNOSTICS` 不显示原始 code/message；专用 `cloud-hosting.css` 在真实 My 容器恢复六条控件规则，避免接管其他任务正在修改的共享样式。专用 CSS 已登记固定离线资源、必需文件与原严格 CSS 扫描；原布局驱动同步引用。

| 维度 | 独立评分 | 未达到 95 的具体原因与关闭任务 |
| --- | --- | --- |
| 架构 | 94 | `service.js` / `connection.js` / 唯一 R0.2 外层合同：当前包各原生 gate 未闭合；Desktop/Mobile/生产 Provider 是明确后续计划，不用缺席的实现假充已验 |
| 安全 | 94 | `service.js` / 原 Authority：尚无 C 的运行中撤权、真实 IDB rollback 与零目标/Worker 副作用证据；解锁后定向负向验收 |
| 持久可靠性 | 90 | 原 Authority / `controller-methods.js`：原历史 target creation-unknown、@slot held、Receipt 缺失；保守保存原结果，不重跑；需要可信退休/释放证据 |
| UI/UX | 87 | `tool.html` / `cloud-hosting.css` / Debug：缺真实 300/320px、200%、键盘/焦点/a11y 和运行中停止；组件断言不补这类缺口 |
| 可维护性 | 93 | 当前文档/单一原生 owner 已收敛；最终集成、当前原生和独立正式交付缺失，需稳定相关输入再闭合 |
| 测试证据 | 83 | `candidate-c-build-identity.json`、正式五 Gate：真实 Chrome/F3/ZIP 安装仍未测；不能把旧包 Gate1–3 或组件升级为 C 原生 |

目前 Mac 锁定，原生 UI 工具明确报告不能自动解锁，已向用户请求本机解锁；等待期间未模拟用户动作、seed 新 Job 或更改历史 IDB。解除该外部阻塞后，使用 C 专属受控 CFT/Profile/Provider state 继续真实固定 Task→原 Worker→Result→Retirement→Receipt，运行中 UI 停止、IDB 原生准入中断/回滚、网站/Task/输出授权撤销及同包宽度/键盘验收；原历史 Job 只查询/合法原生恢复，禁止新建或重跑。正式交付状态仍 **BLOCKED**，独立最终 F3 与 ZIP 安装 **NOT_TESTED**。
