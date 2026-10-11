# 复制到新对话：继续 Cloud Control R1.1

续接检查点于北京时间 2026-10-12 保存；文件名保留原任务日期 2026-10-11。

默认中文。请直接在 `/Users/shopme/Documents/workspace/opendesk-browser` 的本地 main 继续已经实施的 Cloud Control R1.1。用户主动要求保存检查点转新对话，任务尚未全部完成。继续真实实施、修复、必要验证、文档更新和安全本地Git提交，不重新设计或停在计划。

先阅读 AGENTS.md、docs/framework/testing-guide.md、docs/framework/parallel-development.md，并读：
- docs/framework/workstreams/cloud-control-r1.md
- docs/framework/workstreams/cloud-control-r1.json
- docs/framework/workstreams/evidence/cloud-control-r1/handoff-20261011.json
- docs/architecture/browser-framework/cloud-control-r1.zh-CN.md
- docs/contracts/execution-control/v0.2/README.zh-CN.md
- examples/cloud-control/README.zh-CN.md

然后仅做当前身份/资源核对：pwd、git status --short --branch、git rev-parse HEAD，检查进程、持久目录及相关源码身份。不要重复初次fetch、全量测试、双构建、Task安装配对、成功重启链或completed请求。保护其他Agent的差异和暂存内容，不reset/clean，不新建分支/worktree/PR，不推送main。

最高优先级是当前已经产生副作用后被停用的Run：读取保存事实、复核恢复保护，然后真实Chrome UI启用扩展，观察原对账与IDB。不得重复投递/换键重跑这个请求，不手写IDB或伪造退休。当前扩展停用，runner的stop会删除profile，禁止发送。详细身份在下方检查点。

随后补必要原生Gate4：运行中的UI停止、网站/安装撤权、真实Chrome IDB准入回滚与容量不足；修复terminal lease过期后误显示E_CLOUD_CANCELLED的reason。组件证据不能升级为原生PASS。相同输入已通过的结果直接复用，新增差异只做受影响验证；产品输入变化才补必要构建和原生验收。

可用真实命令已实现：npm run cloud:provider、cloud:seed:form、cloud:inspect、cloud:pairing、cloud:cancel、cloud:fault、test:cloud，参数以现有README为准。当前不要再seed新任务，先收未知运行。故障path需完整/v1/admission、/v1/receipt或/v1/claim。

普通用户和开发者文档必须与实际代码一致。最终分别报告SOURCE_CONFIRMED、COMPONENT_TESTED、BUILD_VERIFIED、NATIVE_VERIFIED、BLOCKED、NOT_TESTED，包含真实构建身份、命令输出、数据位置、request/runId/resultId、Chrome证据、未测项和真正本任务本地commit SHA。Gate1–3已通过、Gate4尚未关闭；不能宣称全完成。几个混合main提交已包含云控源码，不等于独立Cloud Control完成提交。提交必须只包含本任务明确路径，保留其他Agent工作。

下面是自包含交接事实；以工作流JSON和当前实际源码/资源为最终依据。继续实施直到完成或确实阻塞，保留全部失败，不虚构证据。

# Cloud Control R1.1 续接检查点（2026-10-11）

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
