# Cloud Control R1.4 Final — Browser 实施与多端边界

日期：2026-10-12。本文记录实现、证据等级和剩余工作，**不是最终验收通过声明**。本轮正式分账见[工作流 r14Final](../../framework/workstreams/cloud-control-r1.md#r14final--正式文档收敛2026-10-12)及其 JSON；[leader 工作流](../../framework/workstreams/cloud-control-r14-final-20261012.md)提供实施与原始证据。当前候选 C 已完成双构建、严格包验证与 ZIP 字节一致性（BUILD_VERIFIED）；真实 Chrome、独立最终 F3、ZIP 安装仍 NOT_TESTED。六维独立评分及低于 95 的原因见本轮工作流，当前并未正式验收通过。源码引用以当前文件及函数名复核，不把历史行号作为当前候选证据。

正式上位基线只有 [OpenDesk Execution Control R0.2](/Users/shopme/Documents/workspace/opendesk/docs/architecture/execution-control-r02.zh-CN.md)（只读；[仓库文件](https://github.com/shopable-ai/opendesk/blob/master/docs/architecture/execution-control-r02.zh-CN.md)）。它冻结多端职责和合同治理；本仓库 [v0.2 阅读入口](../../contracts/execution-control/v0.2/README.zh-CN.md)解释现有 Browser 消费边界，不建立竞争协议。R0.2 的归档时 NOT_IMPLEMENTED 不代表今天 Browser 未实施，也不能由 Browser 进展反推 Desktop/Mobile 已完成。[本轮 GOAL](../../framework/prompts/goal-cloud-control-r14-final.zh-CN.md)保留任务范围。

## 1. Task Provider + 三类独立 Executor

```text
Task Provider
  配对/认证、Job/Claim/Assignment、持久 Permit、租约/取消、Receipt/对账
  HTTPS 持久操作；WSS 只做认证、心跳、通知
    Browser Executor → 原 Authority → RunHost/Controller/Worker/ChromePage
      原 IDB runs/results/commandJournal/@slot；frameworkKV 仅保存云关联
    Desktop Executor（后续）→ 原 Execution/Recipe/Flow、Scheduler/Runtime owner
      原桌面 OS 权限、结果与证据；不消费 Browser Task v1 或单槽
    Mobile Executor（后续）→ Android/iOS App 与平台允许的原生授权/运行能力
      前台/后台/系统权限与证据分别定义、分别真机验收
```

| 边界 | 唯一职责 | 当前实施界限 |
| --- | --- | --- |
| Task Provider | 保存业务请求/尝试、绑定原 runRef、签发许可、租约/撤销/回执；不替本机授权 | `scripts/cloud-control/provider.mjs` 是回环开发提供者；正式 Provider 待实施 |
| Browser Adapter | `service.js` 把固定已安装 Task/参数/owned 目标绑定原事实；`connection.js` 的单一 SW owner 管网络 | 已实施；连接、对账、Host、目标、槽分别判断 |
| Browser Authority | `src/platform/host/authority.js`、`controller-methods.js` 校验可信 sender、安装/授权、owner/epoch、源码、资源及取消栅栏 | 原 Run/Result/journal/退休是最终事实；云消息不得跳过 |
| Browser Runtime | 原 `src/run-host.js`、Worker、ChromePage 实际执行；本地与托管共用原 `runs/@slot` | 不新增 Run/Result 数据库或 Scheduler；无合法可见 Host 不创建隐藏执行入口 |
| Desktop Executor | 与 Browser 平级，适配原 Recipe/Flow/Execution/Scheduler/Runtime ownership | **PLANNED / NOT_TESTED**；本轮无桌面云控实现/验收 |
| Mobile Executor | 与两者平级，保留平台 App/OS 授权、生命周期和运行能力 | **PLANNED / NOT_TESTED**；不假设持续后台或任意设备自动化 |

统一外层身份、领取尝试、许可、取消、回执和对账语义；各端解释自己的 artifactType/runtime/version/hash。Browser Task v1、RunHost、ChromePage、IDB 不是跨端通用运行模型。**Browser 本地运行不依赖 Desktop App、Native Agent 或 Node Provider**；开发 Node Provider 仅用于本地云控演示。

TaskRef 是 R0.2 的跨端产物引用语义：明确 surface/runtime、artifactType、不可变 version/hash，各 Executor 解释自己的产物；不把 Browser Task v1 设为 Desktop/Mobile 的执行格式。当前 NodeProvider 的 ProviderJob.task/Assignment.task 实际只含固定 `taskId/version/manifestHash/sourceHash`（[provider.mjs](../../../scripts/cloud-control/provider.mjs)）；这是现有 Browser 消费形状，不能为了文档新增 wire 必填字段。Browser 另由原安装、Revision pin 和资源 owner 复核 `installationId/generation/builtin/dependency identity`（[Task service](../../../src/platform/tasks/service.js)、[Controller Authority](../../../src/platform/host/controller-methods.js)），Provider 引用与 taskId/hash 都不替代本机安装授权或执行 owner。

固定包入口见 [build-contract.mjs](../../../scripts/build-contract.mjs)、[cloud-host.js](../../../src/entrypoints/cloud-host.js)，保持包内 classic 代码，不加载远端 JS。[build-contract.mjs](../../../scripts/build-contract.mjs) 的当前工程预算：生产 SW **1 MiB**、非阻塞提醒 **512 KiB**，开发 SW **1.5 MiB**，其他固定生成 JS **512 KiB**。这不是 Chrome/MV3 安全豁免；旧 384/320 KiB SW 数字只属于历史候选。

## 2. 功能树与完成矩阵

```text
多端统一云控
  Provider：开发持久服务已实施/有组件；正式认证与数据库事务待实施
  Browser 独立 Executor
    身份与连接：配对分域/epoch/撤销已实施；当前原生待主工作流
    固定任务与授权：安装/网站/输出分别复核；组件已记录
    原生执行：原事务绑定 Run/slot → 持久 Permit → 原 Authority → 原 Runtime
    结果与生命周期：Result/退休/Receipt 分离；原未知现场仍 BLOCKED
    产品与诊断：状态投影有组件；当前布局/包的真实交互待验
  Desktop：原 owner/Runtime 适配计划；未实施、未验收
  Mobile：平台授权/运行器适配计划；未实施、未验收
```

矩阵证据简称：**C**＝[156 项首次定向日志](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/targeted-r14-migration-ui.tap)（155 通过/1 断言失败；原 Task 授权查询基准修正后，[单例补验](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/direct-query-followup.tap) 1/1，不写成一次全量 156/156），[Provider/connection](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/connection-provider-current.tap) 11/11；此前[定向安全日志](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/targeted-security-final.tap)（读取时 122/122；[targeted-current](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/targeted-current.tap) 的 121/121 为中间轮）；**U**＝[UI 工作流](../../framework/workstreams/cloud-control-r14-ui-20261012.md)的 19/19 与输入哈希；**H**＝[历史交接](../../framework/workstreams/evidence/cloud-control-r1/handoff-20261011.json)的原 Gate1–3；**R**＝[历史恢复摘要](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-recovery-summary.json)。C/U 不相加冒充唯一总数，不提升为当前原生 PASS。“当前待验”均指主工作流的最终同身份验收。

| 功能 | 负责模块 | 源码定位 | 唯一事实 | 用户/消费者入口 | 组件 | 原生证据 | 状态 | 缺口 | 下一步 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Executor/配对/rotation | service、Provider | [service.js](../../../src/cloud-control/service.js)；[provider.mjs](../../../scripts/cloud-control/provider.mjs) | KV executor/config；Provider pairing | 我的→云端托管 | C | H Gate1；当前待验 | SOURCE_CONFIRMED / COMPONENT_TESTED | 新配对当前原生 | 旧凭据/配对拒绝实测 | P0 |
| HTTPS/WSS/能力/就绪 | SW connection、可信 Host | [connection.js](../../../src/cloud-control/connection.js)；[service.js](../../../src/cloud-control/service.js) | config；临时 socket/epoch；原 Host/slot | 托管状态、调试只读 | C/U | H Gate1；当前待验 | COMPONENT_TESTED | 连接/Host 独立状态 | 同包重连/Host 消失 | P0 |
| Job/Claim/Assignment 幂等 | Provider、service | [provider.mjs](../../../scripts/cloud-control/provider.mjs)；[service.js](../../../src/cloud-control/service.js) | Provider requests/jobs；KV claim/请求 | seed、原 cloudNext | C | H；当前待验 | COMPONENT_TESTED | 空 claim/旧回程/分域 | 同键重取、异内容拒绝 | P0 |
| 固定 Task/安装授权/参数 | 原 Task service、Authority | [tasks/service.js](../../../src/platform/tasks/service.js)；[service.js](../../../src/cloud-control/service.js) | 原 installation/generation、hash/授权 | 我的→安装/批准托管 | C | H Gate2；当前待验 | COMPONENT_TESTED | 撤权/升级真实负向 | 零 target/Worker 派发验证 | P0 |
| 网站/结果输出授权 | 原 Grant、Task service | [service.js](../../../src/cloud-control/service.js) | 当前网站/安装/output 许可 | 批准/撤回回传 | C，含 delivery 回归 | H Gate3；当前待验 | COMPONENT_TESTED | pending→send 撤权 | 新包补传与撤权实测 | P0 |
| 请求摘要/attempt/配对域 | service、Provider | [service.js](../../../src/cloud-control/service.js)；[provider.mjs](../../../scripts/cloud-control/provider.mjs) | pairing/requestId key、identity/digest | 领取/准入 | C | 当前待验 | COMPONENT_TESTED | 现代身份负向 | 旧 attempt/配对拒绝 | P0 |
| 原 Run/Revision pin/@slot | 原 Controller Authority | [controller-methods.js](../../../src/platform/host/controller-methods.js)；[service.js](../../../src/cloud-control/service.js) | 原 runs/journal/slot；KV runRef | 原 RunHost start | C | H Gate2；当前待验 | COMPONENT_TESTED | IDB 回滚/共享槽实测 | 证明失败零目标副作用 | P0 |
| StartPermit/同步续租 | Provider、service | [provider.mjs](../../../scripts/cloud-control/provider.mjs)；[service.js](../../../src/cloud-control/service.js) | Provider permit+assignment lease；KV permit | admission/renew、原 dispatch | C | H Gate2；当前待验 | COMPONENT_TESTED | 缺 runRef/无许可 renew | 丢响应/旧 epoch 验证 | P0 |
| Worker/ChromePage 原执行 | RunHost/Controller | [run-host.js](../../../src/run-host.js)；[controller-methods.js](../../../src/platform/host/controller-methods.js) | 原 operation/journal/native ack | 可见 Host、标准 demo | C | H Gate3 | 历史 NATIVE_VERIFIED；当前 NOT_TESTED | SW/UI 已变 | 最终固定表单真运行 | P0 |
| Result/退休/槽释放 | 原 Authority | [controller-methods.js](../../../src/platform/host/controller-methods.js) | 原 Result、retirement、@slot | 原运行记录/Stop | C | H Gate3；R | 历史闭环；R BLOCKED | 原 creation-unknown | 原证据满足才释放 | P0 |
| Receipt/对账/补传 | service、Provider | [service.js](../../../src/cloud-control/service.js)；[provider.mjs](../../../scripts/cloud-control/provider.mjs) | 原 Result→投影；Provider receipt | 托管回执、inspect | C | H Gate3；R 无 receipt | COMPONENT_TESTED；R BLOCKED | 新包补传/撤权 | 只补交结果、不重跑 | P0 |
| cancel/lease/unknown 恢复 | 原 Authority、service | [service.js](../../../src/cloud-control/service.js)；[controller-methods.js](../../../src/platform/host/controller-methods.js) | cancelSeq/ownerEpoch/journal | 停止托管/Stop/admin cancel | C | H Gate4 部分；R | COMPONENT_TESTED；R BLOCKED | 原 incarnation 不明 | 禁重派；完成后不改取消 reason | P0 |
| 解除配对/持久 revoke | service、Provider | [service.js](../../../src/cloud-control/service.js)；[provider.mjs](../../../scripts/cloud-control/provider.mjs) | 本机 pending、Provider receipt | 解除配对/恢复重试 | C/U | 当前待验 | COMPONENT_TESTED | offline→confirmed 原生 | 同 revoke 重取、旧 socket 拒绝 | P0 |
| 产品状态/调试隔离 | cloud-hosting/status、tool shell | [cloud-status-presentation.js](../../../src/ui/cloud-status-presentation.js)；[tool.html](../../../src/ui/tool.html)；[debug-workbench.js](../../../src/ui/debug-workbench.js) | cloudStatus 只读投影/原 Host | 我的→云端托管、开发第六调试 | U；新布局以主流程为准 | 当前待验 | COMPONENT_TESTED；布局 SOURCE_CONFIRMED | Cloud Tab 已移除、cloud 偏好映射 tasks；当前包窄屏/缩放/键盘待验 | 真实交互、刷新零执行 | P1 |
| 真网站 Grant/槽/未知诊断 | service、状态投影 | [service.js](../../../src/cloud-control/service.js) siteAuthorization/slotFacts/unknownOutcome | Chrome Grant；原 @slot/Run/operation journal | 我的托管状态、只读调试 | C；仅组件子场景 | 当前 NOT_TESTED；R BLOCKED | SOURCE_CONFIRMED / COMPONENT_TESTED | 真 Chrome 撤权/槽变化；fenced 独自不能判未知 | 同候选只读诊断与原事实核对 | P1 |
| Observer 只读控制台 | cloudObserve、可信 sender route | [cloud-observer.js](../../../src/platform/host/cloud-observer.js)；[cloud-control-console.js](../../../src/ui/cloud-control-console.js) | 真实 TAB/document sender；脱敏分页投影 | 我的→新标签页只读控制台 | C；只读/入口隔离子场景 | 当前 NOT_TESTED | SOURCE_CONFIRMED / COMPONENT_TESTED | 当前包刷新/关闭零执行实测 | 不注册 Host、不授执行权 | P1 |
| 包预算/独立本地模式 | 固定构建/原本地入口 | [build-contract.mjs](../../../scripts/build-contract.mjs)；[sw.js](../../../src/sw.js) | 同候选 source/packageHash | 开发/生产、本地 Task | 预算策略有定向测试 | H 旧包；当前待验 | 当前 BUILD/NATIVE 见主流程 | 新双构建/安全/本地运行 | 冻结后验 Gate5 | P1 |
| 正式 Provider | 后续服务端 owner | R0.2 §5–7；开发 [provider.mjs](../../../scripts/cloud-control/provider.mjs) | 后续正式事务数据库 | 默认/高级自定义服务 | 开发 C 不代替 | NOT_TESTED | PLANNED | 认证/队列/unique/outbox/inbox/audit | 按 §7 独立交付 | P2 |
| Desktop/Mobile Adapter | 各端原生 owner | R0.2 §2/4/6/7 | 各端原事实、非 Browser IDB | 后续各端入口 | NOT_TESTED | NOT_TESTED | PLANNED | 产物/授权/runtime/原生证据 | 各端独立实现/验收 | P2 |

## 3. 字段所有权与事务矩阵

云关联只进入原 `frameworkKV`；[idb.js](../../../src/platform/storage/idb.js) 已含原 results/frameworkKV，本轮不改 store schema。[service.js](../../../src/cloud-control/service.js) 复用 KV/runs/commandJournal/results 事务。“Provider 事务”在开发版指单进程 serial→save，正式数据库要求见 §7。

| 字段/事实 | 生成者 | 持久位置 | 谁读/谁写 | 稳定/临时 | 事务边界 |
| --- | --- | --- | --- | --- | --- |
| providerId | Provider 初始化 | state.json；KV config 引用 | 双方读；Provider 写 | Provider 稳定身份 | 初始化持久提交；响应同身份核对 |
| executorId | Browser 首次配对流程 | KV cloud:executor；Provider executors | Browser 建立；Provider 登记 | 安装实例稳定，非 WS session | 本机先持久身份，再配对网络；重试不换 ID |
| pairingId/pairingGeneration/credential | Provider pair/rotation | Provider executor；本机 config | Provider 轮换；可信本机保存；UI 不读秘密 | 配对内稳定，重配对变更 | save 成功才退旧 ticket/socket；本机验证后提交 |
| namespace/Grant/grantId | 原 Host namespace；用户批准触发 service 新 grantId | 原权限、KV config/tasks/请求快照 | 本机 Authority 写/检；Provider 只见受限引用 | 授权内稳定，批准/撤回改变 | IDB 检 enabled、namespace、grantId 与请求一致 |
| jobId | Provider seed | Provider jobs | Provider 写；管理/Executor 受限读 | 业务请求稳定 | requestKey 幂等与 Job 同 save |
| claimId | Browser 领取前 | KV config.claim；Provider requests | Browser 生成；Provider 缓存答案 | 同领取稳定，含空答案 | IDB 先存；网络事务外；回程 epoch+Grant 检后提交 |
| assignmentId/attemptEpoch | Provider claim | Job.assignment；KV assignment/identity | Provider 写；Browser 检 | 一次尝试稳定；现代 epoch 正整数，开发当前为 1 | 分配与 claim 答案同事务；lease 到期不重排可能有副作用的尝试 |
| requestId/storageKey | Browser 按 assignment 派生 | KV cloud-request-v1；原 Run 引用 | Browser 写；原 Controller 消费 | 公开 `cloud:<assignmentId>` 稳定；内部配对域 key | storageKey 为 `cloud:request:`+pairing/requestId 摘要；namespace/Grant 另检；无 Host/connection epoch |
| requestDigest/digest | 各 owner canonical/hash | Provider requests；KV digest；原 Run.requestDigest | 各 owner 写/比对 | 同键内容不可变；各层摘要范围不同 | 同键异内容拒绝；不同层摘要不得混用 |
| taskRef/version/manifestHash/sourceHash | 固定 Task 包；Provider 引用 | 原安装/revision；Job.task；KV task | 原安装 owner 写；云只引用 | 版本/哈希固定 | 原准入事务核对参数、目标、安装授权和源码 |
| installationId/generation/builtin/dependency identity | 原 Task/Revision/资源 owner | 原安装授权、revision pin/固定包 | 原 Authority 读写；云只检引用 | 安装代次/资源身份 | taskId 不替代安装授权；沿用原 pin 校验，不新造云 builtin 身份 |
| 网站/output permission | 用户经可信 UI/原权限系统 | 原授权、KV task.resultAllowed、Run.resultDeliveryRevoked | 本机写；Provider 不扩权 | 可撤回，非连接永久授权 | dispatch 复核；receipt pending 后发送前再检 Task/网站/output |
| runId/resultId/runRef | 原 Authority 建 Run/预留 resultId；service 投影 | 原 runs/results；KV runRef；Provider 引用 | Authority 写原事实；Provider 写自身引用 | 原运行/结果稳定；预留≠保存 | 同 IDB 事务 Run+pin+@slot+云绑定；admission 在事务外 |
| revision/commandJournal | 原 Authority/operation 路由 | 原 pin/journal/Result.revision | 原 owner 写；service 读结果身份 | revision/sourceHash 固定；operation 状态推进 | 原 intent/native ack/结算；unknown effect 不重放 |
| StartPermit/permitId/leaseUntil | Provider admission/renew | Provider permit+assignment；KV permit | Provider 签发/续租；Authority 检 | permitId/绑定稳定；lease 可变 | Provider 当前 permit/assignment lease 同事务；本机事务重验 epoch/Grant/Run |
| @slot/ownerEpoch/cancelSeq | 原 Authority | runs/@slot、Run/pin | 原 owner 写；service 按原取消栅栏协调 | 原生命周期事实 | 准入占槽；原退休证实才释放；云 lease/receipt 不释放槽 |
| retirementId/state/workerRetired | 原 Authority/可信 Runtime 证明 | 原 Run、target intent、@slot | 原 owner 写；云只读 | 独立生命周期 | 终态+Result 同事务先 fenced；Worker/target 证据满足才 released |
| receiptKey/Receipt/delivery | Browser 用原 resultId；Provider 签回执 | KV delivery/receipt；Provider requests/Job.receipt | Authority 投影；Provider 持久接收 | 同结果回执稳定；delivery 可 pending | KV pending 先提交；网络外执行；当前授权检查后确认 |
| revocationId/receipt | 本机 unpair；Provider 确认 | config.unpairing→KV cloud-revocation-v1；Provider revocation | 双方各写自己的事实 | 同次撤销稳定 | 先 disable/fence；save 后服务端确认；IDB 存 confirmed+删 config |
| connectionGeneration/connectionEpoch/ticket | SW/Provider auth | 运行内存；不进业务稳定键 | 网络 owner | 临时，断连/rotation 失效 | 旧 claim/permit 回程不得 commit；一次 ticket 首帧消费 |
| Host registration/browserSessionIncarnation | 原 Host/浏览器会话 owner | 原 Run/pin/target intent、注册 | 原 Authority 读写 | 生命周期临时身份 | 旧 owner/document/incarnation 不恢复执行权；目标不明保守退休 |

本机 IDB 与 Provider 没有跨网原子事务。采用“本机提交原 Run→Provider 持久绑定回 Permit→本机重验提交→原执行”及固定键对账。网络必须在 IDB 事务外。[idb.js 的 transact](../../../src/platform/storage/idb.js) 明确保留 SHA-256 digest await：keepalive 请求成功事件驱动 get/put/delete/all 请求队列，保证 digest 完成后仍在 active IDB 事件中发起存储请求；不能把支持的 digest await 误写为禁用，也不能删除原准入、Run/pin/@slot/云绑定及失败回滚事务合同。Provider 成功但响应丢失只能重取原事实；本机提交失败不补造 Run/目标。

现代 pairing/attempt 严格校验。原 credential 的 `/v1/auth` 回应后，[connection.start](../../../src/cloud-control/connection.js) 调用 [service.adoptPairing](../../../src/cloud-control/service.js)：核对 Provider/Executor、ticket 有效期、当前 epoch/配置、enabled、grantId/namespace，再仅为同域 legacy requestKeys 保存 legacyPairing 映射。旧 rows/digest/缓存网络 body/lease、原 Run/Result/Receipt 不改，不清空 Provider jobs/requests；不得把旧尝试转为新配对执行权，不同 grant/namespace/pair 不能串用。reconcile 记录远端已有 runRef；本机没有关联时 cloudNext 以 E_RUN_REF 拒绝第二 Run，只允许查询/对账原事实。

## 4. Request/Permit/Run/Result/Retirement/Receipt 分离状态机

以下为现有字段与受限语义，不新增统一 status/wire enum。Provider Job 的 `queued→assigned→admitted→received` 是业务投影，不能替代原 Run/Result。

| 对象 | 合法推进/证据 | 保守支路与重试 | 非法转换/拒绝 |
| --- | --- | --- | --- |
| Request（KV） | `waiting→prepared` 同事务绑定原 Run；`prepared→permitted` 已持久并复核 Permit；按原生命周期/回执更新 finished | 未建 Run 可 cancelled；已建 Run cancellation-pending；未知恢复 OUTCOME_UNKNOWN；只查原事实 | prepared/unknown 回 waiting 再建 Run；同键改内容 E_REQUEST_CONFLICT；Host/连接代次生成新公开请求 |
| Permit | 无许可→Provider 持久绑定同 runRef/签发→本机存许可→每次 dispatch 检；有效活动许可可 renew | 丢响应同键重取；过期/撤销/旧 pairing/epoch 栅栏；无 permit 不 renew | 未提交先建 target/Worker；缺 runRef/绑定变更；旧回程恢复权限：E_RUN_REF/E_PERMIT/E_CLOUD_FENCED/E_BINDING/E_ATTEMPT |
| Run | 原 preparing→running；取消 stopping；原结算 completed/failed/stopped/interrupted | 原恢复可 paused_unknown；不重派 Worker；查询、原 Stop/退休继续 | 云 Job/Receipt 改 Run 成功；失效许可继续执行；终态回 running；completed+released 被事后 lease 改取消 reason |
| Result | 原预留 resultId→controller-result 持久化；与 Run 终态同事务 | 上传失败保留原 Result；当前授权允许才补投影 | 预留 ID 当保存；伪造/换 runId/sourceHash；因上传失败重做网页动作 |
| Retirement | 原 not-started→fenced→released；Worker 退出、target 归属/回收证明及原槽事务齐全 | pending 是原退休返回值；creation-unknown/Worker 未退保持 fenced/held | 终态、workerRetired、lease、Receipt 任一项单独推 released；伪 ack/手改 IDB 释放 |
| Receipt | 无→本机 delivery.pending→受限发送→Provider 持久 receipt→本机 confirmed | 丢响应同 receiptKey 重取；补传重验网站/Task/output；撤权停止发送 | 未 released 上传；pending 作为永久发送权；Receipt 代替退休、网页效果或来源回写 |

Result 终态≠资源已退，Worker 已退≠target 已证实回收，Receipt≠来源业务结算；finished 不能单独证明 completed/released/receipt 齐全。UI 分别投影请求、Run、结果保存、退休和回执。旧 E_CLOUD_CANCELLED 只在 finished+completed+released+receipt 全部齐全时隐藏历史噪声，不改原输入、不掩盖真实 stopped/failed/interrupted。

只读诊断由 [service.cloudStatus/siteAuthorization/slotFacts/unknownOutcome](../../../src/cloud-control/service.js) 与 [状态投影](../../../src/ui/cloud-status-presentation.js)提供。siteAuthorization 调用原 requireGrant，只读实际 Chrome Grant，值为 granted/revoked/unknown/none；配对和配置内网站列表不替代真实授权，读取不申请权限。slotState 区分 available/preview/local-running/cloud-running/stopping/retirement-pending/outcome-unknown/unknown，pendingResources 表示原槽/资源仍待核对或退休。paused_unknown，或 interrupted 且原 controller-operation/controller-navigation 为 dispatched/effect_unknown，才诊断未知结果；仅 fenced 不足以推 unknown，原 Result 的 interrupted 与资源退休 pending 分别展示，不把任一诊断当作释放证明。

原 [Observer 控制台](../../../src/ui/cloud-control-console.js)及 [cloudObserve](../../../src/cloud-control/service.js)保留：可信扩展 tab/document sender 校验、分页脱敏只读，不注册 Host，不领取、执行、授权或停止。正式五 productTabs（我的/发现/工作流/开发/工具），开发 sixthDebug 第六调试，生产隐藏并阻止进入；Observer 是独立只读控制台，不增加产品执行 Tab 或执行权。

## 5. 可信授权与故障恢复

配对认证、固定 Task 安装授权、网站许可、托管 Grant、输出许可独立。配对不启用执行；远端不得传源码、草稿/USER_SCRIPT、Desktop Flow、任意 Shell/CDP/native path、远程安装授权或扩权。[service.js](../../../src/cloud-control/service.js) 检查参数、owned 目标、安装/generation/manifest/source、原授权快照与无额外 networkOrigins；原 Authority 继续 sender/owner/operation 复核。

| 故障/边界 | 保守处理 | 恢复依据/禁止行为 |
| --- | --- | --- |
| 无 Host/槽忙/目标不就绪 | 云队列等待，就绪分别展示 | 不开隐藏 Host、不伪 sender、不建第二槽 |
| claim/admission 持久后丢响应 | 原 claimId/assignmentId/runRef 幂等重取；空 claim 固定答案 | 旧 connection epoch 回程不提交；不发新执行尝试 |
| IDB 准入/Permit 提交失败 | 原事务回滚，target/Worker 不派发 | Provider 引用不替本机准入证明 |
| 重连/SW/Host 重启 | 新临时代次、对账原身份；原 Authority 暂停未知 Run | 旧 owner/许可不复活；只查/结算原事实 |
| cancel/lease/revoke | 停新领取、原 cancelSeq/ownerEpoch 栅栏、待原退休 | 不称效果回滚；completed+released 事后 lease 不改 reason，真实取消保留 |
| offline 解除配对 | 先本机停止；config.unpairing 持久 pending，旧 credential 仅供同 revoke 重试 | cloudStatus.revocation 为 pending；禁止新配对；不称服务端凭据已失效 |
| Provider revoke/rotation | serial 内认证；save 后撤旧 tickets/sockets，返回持久确认 | 本机校验后同事务存 confirmed+删 config；旧凭据只可重取同 revoke |
| Result 已存/Receipt 丢失 | 重读原结果、检自身 revision.sourceHash/runId/resultId、released，补传同键 | pending 后发送前再检网站/Task/output；撤权中断发送、旧回程不确认 |
| effect_unknown/creation-unknown | 原 journal/Result/退休栅栏/slot 保留 | 不 reseed、不重放、不改 IDB、不伪 native ack/释放 |

生产 HTTPS/WSS；[service.js](../../../src/cloud-control/service.js) 只接受无用户信息/query/fragment 的基础 HTTPS URL，开发例外显式允许固定 `http://127.0.0.1:43112`。长期 credential 走 Authorization，不放 URL/网页消息/脚本/日志；一次短 ticket 走 WS 首帧；管理与 Executor 认证分离。认证成功不等于本机执行授权。

## 6. 历史原生、原恢复现场与当前候选

[历史交接](../../framework/workstreams/evidence/cloud-control-r1/handoff-20261011.json)保留 `sourceShaAtHandoff=030cc248de025e0434d38b188de93e941974f3e5`、生产 `packageHash=44c6cfa5b937f0a84b5226e82181357494a886a314b0f7eb21cdeb937955f7a1`、开发 `packageHash=6d49dbc069e153a1a909cc3ec65a03e1f68c79a333f00aac58bf47cb1e690146`。其 Gate1–3 原生闭环成立，Gate4 部分场景/INCOMPLETE；旧字节/预算/身份永久保留。本轮 SW/service/Provider/UI 已变，不能登记为当前 native。

[恢复摘要](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-recovery-summary.json)及[原始记录](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-recovery-1791796461814.json)已实际观测：

- Job `584bcbd1-eefa-4f78-8c52-8761a004dd4e`；Request `cloud:ed794251-e8b3-4345-8dfc-6e98e15181ab`。
- Run `afd37543-f456-45f6-9e12-ea3548e65d4d`、Result `0b388df6-783c-47b0-a8f9-3e9fd2df20a3`；**1 Run / 1 Result**，interrupted、retirement fenced、workerRetired=true；effect_unknown 有原生副作用回执。
- 两个原 operation dispatchAt 为 `1791733558980`、`1791733558916`，均≤原中断 `1791733558986`；submissionCount 均为 1，noDispatchAfterInterruption=true。恢复后读到第二条原 operation 不等于新 dispatch。
- browserSessionIncarnation 已变，owned 创建属于旧 incarnation，原退休拒绝 creation-unknown；@slot held/releaseCount=0，Provider Job admitted，Receipt=null。**现场 BLOCKED**；Worker 已退不能替代 target 释放证明。

本轮还保留[稳定性复查](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-stability-1791799143631.json)与[资源关闭观察](../../framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-resource-stop-observed.json)：真 Chrome UI 恢复后仍 singleRun、interrupted/fenced/@slot held、无 Receipt；没有新 dispatch。旧 Provider/CFT 已关闭且 43112 不再监听，Profile/state/IDB 保留，dataDeletion=false、nativeResourceReleaseAsserted=false。关闭进程没有解决原退休 BLOCKED，也不能升级旧 package44c6cfa… 为当前候选 PASS。

当前 C/U 为组件快照；新双构建、原生和五 Gate 由 leader 完成，writer 不预写 PASS。五 Gate 完整名称为 CONNECTION_VERIFIED、ADMISSION_VERIFIED、EXECUTION_VERIFIED、RECOVERY_VERIFIED、PRODUCT_VERIFIED；[正式 r14Final 工作流](../../framework/workstreams/cloud-control-r1.md)及 [JSON](../../framework/workstreams/cloud-control-r1.json)分别记录历史复用、currentCandidate=C（BUILD_VERIFIED，原生 NOT_TESTED）、组件子场景、未测 native、blocking 和六枚举状态。旧候选、文档、组件、构建或单项恢复观察不等于最终 F3/ZIP/专家 95+。

## 7. 正式 Provider 与跨端后续计划

以下为 R0.2 的后续要求，**不是开发 state.json 已具备的正式能力**。开发版有 serial 内认证、文件 fsync→rename、目录单进程锁、requests 幂等、pair rotation/revoke、permit/assignment 同步；没有正式多租户认证、数据库队列/unique、outbox/inbox 或完整 audit。

| 后续工作 | 正式边界/通过条件 | 优先级与依赖 |
| --- | --- | --- |
| 正式认证/默认服务 | 发布时可信默认配置；自定义仍独立配对；租户/主体/设备隔离、credential 轮换/撤销、短 ticket；配置不自动托管 | P2；先冻结唯一 v0.2 消费版本/负向向量 |
| 持久队列/事务 unique | 定义 source request、pairing+claim、assignment attempt、run binding、permit、receiptKey 唯一范围；同键异 digest 拒绝，空 claim 持久；claim/cancel/revoke/renew 同事务；unknown 不自动重派 | P2；正式数据库并发/崩溃验证 |
| outbox/inbox | 业务事实+outbox 同事务；通知可重复/丢失，HTTPS 对账；inbox 唯一键/摘要拦重复，先 durable 再确认；消息恰好一次不等于副作用恰好一次 | P2；事务 unique；丢响应/重启测试 |
| lease/revoke | 同事务同步 assignment/current permit；旧 attempt/pairing 不续租；持久 revoke 回执、rotation 后旧 ticket/socket/请求拒绝；跨进程缓存不恢复旧权 | P2；认证/事务；失联端保守本机栅栏 |
| audit/reconcile/来源回写 | 记录主体/scope/binding/digest/代次/授权决定/取消撤销/投影时间；不记秘密或超授权结果；Run/Result/退休/Receipt 分离；来源回写失败只重试回写 | P2；保留/查询边界与原始证据验收 |
| Desktop Adapter | 原 Recipe/Flow/Execution/Scheduler owner、本端 taskRef、OS 权限、原取消/结果/资源证据；不引 Browser Task/IDB | P2；独立实现、真桌面验收 |
| Mobile Adapter | Android/iOS 能力表、用户/系统授权、前后台限制、原生执行/结果/退休证据 | P2；独立平台计划、真机验证 |

当前 P0 是保留原 BLOCKED 事实及验证新身份/授权/恢复；P1 是同候选布局、双构建与 Gate5。跨端 DAG、多 Provider、无人值守另行计划，不成为 Browser 本地依赖。操作见[本地示例](../../../examples/cloud-control/README.zh-CN.md)；文档核对见[writer 工作流](../../framework/workstreams/cloud-control-r14-docs-20261012.md)。

## 8. 文档任务树与六维待审

```text
Cloud Control R1.4
  P0 原未知副作用恢复：源码 SOURCE_CONFIRMED；旧包原生现场 BLOCKED
    源：原 Authority/controller-methods、RunHost、service.reconcile
    证据：恢复摘要/稳定性复查/资源关闭观察；1 Run/1 Result、无新 dispatch
    关闭：可信 target/Worker 退休、原槽 released、原结果/回执按授权处理；不重派
  P0 安全准入与执行：源码 SOURCE_CONFIRMED；组件 COMPONENT_TESTED
    源：service、connection、provider、idb.transact、原 Task service
    证据：156 首轮 155/1 + 单例补验 1/1；Provider/connection 11/11
    关闭：当前同身份连接/准入/执行/恢复 native，真实撤权与 IDB 故障负向完整
  P1 产品与交付：SOURCE_CONFIRMED / COMPONENT_TESTED；当前 C 构建 BUILD_VERIFIED；native NOT_TESTED
    源：cloud-hosting、cloud-status-presentation、debug-workbench、cloud-control-console、sidebar-tab-memory
    关闭：五 Tab/开发调试隔离、Grant/槽/未知诊断、Observer 零执行、本地模式与宽度/缩放/键盘
    关闭：五 Gate 分账、六维独立评审、独立 F3 与同包 ZIP 安装证据
  P2 正式 Provider/Desktop/Mobile：NOT_TESTED；仅后续计划
    源：上位 R0.2、唯一 v0.2 阅读入口；NodeProvider 仍是开发实现
    关闭：唯一版本合同、正式认证/事务 unique/outbox/inbox/audit，各端原 owner/权限及平台原生验收
```

六维独立评审已给出分数与具体缺口，详见工作流的评审分账；评分不是 native PASS 或产品完成百分比。架构、安全、持久可靠性、UI/UX、可维护性、测试证据分别评定，未宣称任何维度已达 95。详账见[正式工作流 r14Final](../../framework/workstreams/cloud-control-r1.md)；不自评全面 95+，不推导任意完成百分比。
