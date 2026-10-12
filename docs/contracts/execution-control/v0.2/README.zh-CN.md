# Execution Control v0.2 — Browser R1.4 消费边界

正式总体设计与合同治理以只读 [OpenDesk R0.2](/Users/shopme/Documents/workspace/opendesk/docs/architecture/execution-control-r02.zh-CN.md)为上位基线。本目录是 Browser 首个合同阅读位置；当前仅有本 README，**没有已发布的跨端 JSON Schema/OpenAPI/向量包**。R0.2 建议的 `opendesk.execution-control/0.2` 不能被当作现有请求必须附带的新字段。正式机器合同落地时选定一个规范源，各端消费固定版本；不复制第二套协议。

完整功能/字段所有权/分离状态机/恢复和正式 Provider 计划集中在[架构实施文档](../../../architecture/browser-framework/cloud-control-r1.zh-CN.md)。本页只说明当前 Browser/开发 Provider 消费约束；Desktop/Mobile 是独立原生 Executor 的后续计划，不消费 Browser Task v1、RunHost、IDB 或 @slot。

## 1. 受限任务与身份

Browser 只执行本机已安装且已授权的固定 Task v1、规范化参数及已批准网站的 owned 目标，经原 Authority→RunHost/Worker/ChromePage、原 runs/results/commandJournal/@slot。frameworkKV 只保存 config/Grant/claim/云请求/permit/delivery/revoke 关联；不新增 Run、Result、Scheduler 或 store schema。草稿、USER_SCRIPT、Desktop Flow、远端源码、Shell、路径、CDP、远程安装授权与 Grant 扩权不属于该消费面。Browser 本地运行不依赖 Desktop/Native Agent/Node Provider。

[service.js](../../../../src/cloud-control/service.js) 的稳定绑定包括 providerId、executorId、pairingId/pairingGeneration、jobId、claimId、assignmentId、attemptEpoch；现代 attemptEpoch 严格为正整数。公开 requestId 保留 `cloud:<assignmentId>`，内部 storageKey 按 provider/executor/pairing + requestId 摘要分域；namespace/Grant 另经可信本机校验。Host registration、connectionGeneration/epoch 不进入稳定请求键。

请求摘要冻结尝试身份、固定 Task/hash、规范化参数及目标；同键同内容返回原事实，同键异内容拒绝。Provider canonical UTF-8 SHA-256 与本机各层摘要分别校验，不混用。[provider.mjs](../../../../scripts/cloud-control/provider.mjs) 定义现有绑定字段和严格 runRef：

- runRef 六字段全部必填、非空：runId、resultId、requestId、sourceHash、manifestHash、grantId。
- requestId 必须对应 assignment；source/manifest 必须匹配固定 Task；后续许可/回执保持同一 runRef。
- admission/renew/cancellation/receipt 可提供现有完整 binding 或匹配的顶层身份字段；未显式提供时 Provider 从已认证 executor 与持久 assignment 推导。不得为了文档给现有调用新增必填 envelope。
- legacy executor 补配对映射；旧 claim/assignment、安装、Run/Result 保留，不清库、不改 Browser store schema、不把旧尝试迁成新配对执行权。

## 1.1 TaskRef、本机安装身份与 legacy 映射

上位 TaskRef 表示 surface/runtime、artifactType 和不可变 version/hash，由 Browser/Desktop/Mobile 各自解释。现有开发 ProviderJob.task/Assignment.task 为 `taskId/version/manifestHash/sourceHash`；Browser 原安装与 Revision/资源 owner 另复核 installationId/generation/builtin/dependency identity。云端 taskId/hash 引用不等于本机授权，不能新增 wire 必填 envelope 或第二套 Run/Result 协议。

原 credential 的 /v1/auth 回应经 [connection.start](../../../../src/cloud-control/connection.js) 与 [service.adoptPairing](../../../../src/cloud-control/service.js)验证 Provider/Executor、ticket、epoch、当前 enabled 配置及 grant/namespace 后，仅添加原 legacyPairing/requestKeys 映射。旧 rows/digest/缓存网络 body/lease 和 native Run/Result/Receipt 不改；不同 grant/namespace/pair 不串用。现代请求使用其完整 identity；legacy 只能访问映射内原事实。reconcile 已知远端 runRef 而本机无关联时，cloudNext 拒绝第二 Run（E_RUN_REF），只查原运行。

## 2. 当前开发端点

以下均是[现有 provider.mjs:72–146](../../../../scripts/cloud-control/provider.mjs)实现，非正式远端已上线承诺。除 pair 使用 pairingCode 外，Executor HTTP 使用独立 Bearer credential；管理 API 使用独立 adminToken。HTTP 全部为 POST；未知字段、残缺结构与非法身份拒绝。

| 路径 | 输入/作用与持久边界 |
| --- | --- |
| /v1/pair | executorId、pairingCode；持久轮换 credential/pairingId/generation；提交后退旧 ticket/socket |
| /v1/auth | 空对象；签发短期一次 ticket（内存），绑定当前 pairing；不是执行许可 |
| /v1/capabilities | tasks 列表；固定 taskId/manifestHash/sourceHash 能力摘要，不授予本机权限 |
| /v1/claim | claimId、tasks；当前配对内幂等，空 assignment 也保存；有活动认证连接才首次领取 |
| /v1/admission | assignmentId、完整 runRef；持久绑定原 Run 并返回同尝试 Permit |
| /v1/renew | assignmentId、permitId；必须已有有效 Permit 及完整持久 runRef；assignment/current permit lease 同次 save；不是新增 Run |
| /v1/cancellation | assignmentId；查询当前取消/租约，不替原生 Stop/退休 |
| /v1/receipt | assignmentId、receiptKey=原 resultId、同 runRef、受限 result；同键/摘要幂等持久接收 |
| /v1/reconcile | 空对象；投影当前 pairing 的原 assignment/runRef/permit/取消/租约/receipt |
| /v1/revoke | revocationId，可带匹配 pairingId/generation；持久 revoke 回执；旧凭据只可重取同撤销，不再消费执行端点 |
| /v1/events（WS） | 首帧 authenticate+ticket；之后 ping/pong/notify；不携带源码或可直接执行任务 |
| /admin/state、/seed、/cancel、/fault | 管理认证；查询脱敏状态、固定示例投递、取消、持久提交后丢响应的故障入口；seed 不接受任意源码/文件路径 |

## 3. 准入、执行、结算顺序

1. 可信可见 Host 就绪；领取前持久 claimId，校验固定任务/参数/目标/尝试身份。无 Host 留在队列。
2. 原 Controller 在同一 IDB 事务检查安装/授权/源码/参数，创建原 Run、Revision pin、占原 @slot、写 KV 云绑定（prepared）。事务失败零 target/Worker 副作用。
3. 事务外 admission；Provider 持久同 runRef/Permit 后回应；本机事务重验 connection epoch、pairing、Grant、Run preparing/cancelSeq、安装权限及 lease，再存 Permit（permitted）。
4. 原 Authority 每次实际 dispatch 复核本机授权和有效 Permit，再走原 owned 创建/RunHost/Worker。旧 claim/permit 回程不能 commit；网络在线不等于 Host/槽/目标/执行授权。
5. 原 Result 与原 Run 终态同事务结算；独立原退休证实 Worker/target 回收才 released/@slot available。Receipt 不能释放槽。
6. 重读原 controller-result，核对 result 自身 revision.sourceHash、runId/resultId；退休 released 后投影。KV delivery.pending 提交后，发送前再次核对网站、Task/output 授权，才传同 receiptKey。丢响应只补回执，不重执行。

详见 [controller-methods.js](../../../../src/platform/host/controller-methods.js)、[service.js](../../../../src/cloud-control/service.js)。Request、Permit、Run、Result、Retirement、Receipt 分离；完整非法转换表只维护在架构文档。未知副作用/旧 owner/document/incarnation 不恢复执行权；completed+released 后的 lease 不改取消 reason，真实取消终态保留。

## 4. 撤销与恢复的可见事实

停止托管先持久 disabled、原取消栅栏，等待原退休；不假报安全停止或回滚。解除配对先本机停止，再持久 config.unpairing。Provider offline 时 `cloudStatus.revocation={state:'pending'}`，旧 credential 留 IDB 仅供同 revocationId 重试，禁止新配对；**本机停止不等于服务器确认凭据失效**。收到并校验持久 revoke 回执后，本机同事务写 confirmed、删除 config。Provider serial 内重新认证，save 后才撤旧 tickets/sockets，rotation 后旧配对不可消费。

[service.js](../../../../src/cloud-control/service.js)、[provider.mjs](../../../../scripts/cloud-control/provider.mjs)是当前实现定位。生产地址要求 HTTPS/WSS；开发例外仅显式允许固定 127.0.0.1:43112 HTTP/WS，长期凭据不放 URL/脚本/日志，WS ticket 首帧使用。

## 4.1 原事务与只读诊断

网络必须在事务外；原 [idb.transact](../../../../src/platform/storage/idb.js) 的 keepalive 成功事件/请求队列允许 SHA-256 digest await，保留 Run/pin/@slot/云绑定同事务提交与失败回滚合同。

siteAuthorization 通过原 requireGrant 查询真实 Chrome Grant，返回 granted/revoked/unknown/none，不申请权限；配置网站范围不替代真实授权。slotState/pendingResources 投影原槽及未退资源，与连接/对账独立。未知效果由 paused_unknown，或 interrupted 加原 controller-operation/controller-navigation 的 dispatched/effect_unknown 事实判断；fenced 独自不等于 unknown。以上是本机诊断，不新增跨端 wire 状态或执行许可。

原 cloudObserve/Observer 控制台受真实扩展 tab/document sender 验证，只读分页脱敏、不注册 Host，没有 claim/start/授权/停止能力。五 productTabs + 开发 sixthDebug 保留，生产隐藏并阻止进入。源码定位：[service](../../../../src/cloud-control/service.js)、[状态投影](../../../../src/ui/cloud-status-presentation.js)、[Observer](../../../../src/ui/cloud-control-console.js)。

## 5. 证据与正式交付限制

[历史 Gate1–3](../../../framework/workstreams/evidence/cloud-control-r1/handoff-20261011.json)属于原 SHA/packageHash，本轮 SW/UI/协议输入改变，不能升为当前 native。[原现场恢复](../../../framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-recovery-summary.json)实际为 1 Run/1 Result、无中断后 dispatch，但 target creation-unknown、slot held、无 Receipt，仍 BLOCKED。

[主工作流](../../../framework/workstreams/cloud-control-r14-final-20261012.md)负责最终组件数量、双构建与五 Gate；组件不替原生。正式 Provider 的认证、持久队列、数据库事务 unique、outbox/inbox、lease/revoke/audit/reconcile 仍是后续计划；开发文件 save/serial 不提升为正式分布式能力。操作见[示例 README](../../../../examples/cloud-control/README.zh-CN.md)。

正式五 Gate 分账见[工作流 r14Final](../../../framework/workstreams/cloud-control-r1.md)及 [JSON](../../../framework/workstreams/cloud-control-r1.json)：CONNECTION_VERIFIED / ADMISSION_VERIFIED / EXECUTION_VERIFIED / RECOVERY_VERIFIED / PRODUCT_VERIFIED；每项保留历史复用、组件子场景、未测 native、blocking 与六枚举状态。当前 currentCandidate=C，生产/开发构建、严格包验证和 ZIP 与 dist 字节一致性为 BUILD_VERIFIED；真实 Chrome、独立最终 F3、ZIP 安装仍 NOT_TESTED，原恢复现场 BLOCKED。六维评分是独立质量评价，不能提升 Gate 状态。156 项首轮 155 通过/1 断言缺陷与 leader 单例补验 1/1 分别保留，Provider/connection 11/11 仅 COMPONENT_TESTED。旧现场经真 UI 恢复和稳定性复查仍 BLOCKED；旧 Provider/CFT 关闭但 Profile/state/IDB 保留，进程退出不等于原退休释放。
