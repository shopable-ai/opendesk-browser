# OpenDesk Browser 云控 R19.4 — 统一架构、真实进展与 R19.5 续做基准

> 日期：2026-10-22。仓库：shopable-ai/opendesk-browser；唯一允许修改/提交/推送的分支：main。
> **这是一份产品目标、实施边界、源码事实和验收门槛的续做文档，不是生产交付 PASS 报告。**
> 每次执行前以实时 main HEAD、相应提交与 CI 为准。保留此前 R1–R19 历史工作、用户数据、Run/Result/Receipt，不建立第二套引擎。

## 0. 先给出关键结论

1. 最高产品目标不是“远程发送 Chrome 指令”，而是**用户在独立业务网页填写任务 → 业务后端向 Provider 提交 → 服务器持久保存 Job → Browser 采用 Pull 或 Push 交付 → 唯一 Controller 在真实 Chrome 操作 → Result/Receipt 回到服务器 → 用户查询与 Stop**。
2. **两种交付方式必须共享同一个 Job、Claim、Assignment、Permit、RunHost、Controller、Run/Result、Receipt、授权代际及持久执行槽。** Push 只是已认证 WSS 连接上的目标 Executor 通知/Offer，不能把“通知到达”计为“任务已执行”。
3. 既有 Node Provider、固定版本 Task Registry、Client/Executor/Pairing/Grant、Offscreen Runner、Controller Authority、Result/Receipt 已存在。R19.4 源码提交 **ed0bfa301c7b0e4fe6abb40fc218480b8e173ca5** 增加了受认证 HTTPS Pull 会话、无 WSS Claim 降级、有限 Push Offer 和协议回归，**已合入 main，但没有得到完整原生产品验收**。
4. 截至本次仓库检查，**没有在该仓库找到已经验收的普通用户业务表单 + BFF 真实入口**。现有 /v1/submit 是面向受信服务端的 HTTPS Client API；不能因 CLI 可以提交就认定浏览器普通跨域表单可以提交。若业务表单位于其他系统，应定位真实仓库/服务，不重复搭建 Provider。
5. 当前 Provider 以 Node 单进程串行操作 + 本地 state.json 临时文件、fsync/rename 保存；它具备开发环境 Job 持久化和幂等基础，**不是已经证明满足正式多租户、数据库事务、HA/灾备的生产队列**。
6. Cloud R5.2/R3 的 R19.4 提交关联 Actions 整体有失败。R5.2 的 Provider 协议测试与 Controller Authority 步骤通过，失败的是 Side Panel 旧 UI 断言；R3 的 production/development 构建及包校验步骤通过，组件作业在另一个共享 Pin 检查阶段失败。**不要把 CI 总体失败等同于协议全部失败，也不能用组件/构建通过伪造用户 T00–T10 PASS**。

## 1. 原始产品目标（不得删改方向）

远程用户在**独立任务表单页面**选择已登记且已获批准的任务类型、目标、业务参数，点击“提交任务”。表单不上传可执行 JS，也不要求用户填写 manifestHash/sourceHash。

数据先经过业务后端：校验网页登录身份、请求权、目标浏览器、Task Schema 和幂等 requestKey；业务后端安全保管 Provider Client Token，并通过 HTTPS 提交到唯一 Provider。Provider 先持久化 Job 和目标 Executor/Pairing/Grant/Task pin，再返回稳定 jobId，用户刷新页面后仍能查询任务。

服务器支持：
- **模式 A · Pull**：已配对并授权的 Browser 即使 WSS 不可用、HTTPS 仍可用，仍按有界策略在后台完成身份认证、能力/代际同步、对账和主动 Claim。
- **模式 B · Push**：服务器选择指定 Executor，对其已认证 WSS 发出有界、可关联的 Offer/notify；Browser 收到通知后仍通过同一 Claim/Permit 合同获得任务和执行许可。离线时 Job 留在队列，可按安全策略退回 Pull。

Browser 经 Service Worker 与固定 Offscreen RunHost，使用唯一 Controller 对真实 Chrome 目标页面填表、点击、保存/核验数据；可信原始 Run/Result 持久化后，Provider 收到状态或用户明确同意的结果正文 Receipt。用户可在原业务页面查询状态、失败原因和请求 Stop。

**Side Panel 是管理入口，不是任务领取与执行的前置条件；关闭 Side Panel 后，在 Chrome 和必要后台环境可用的条件下，合法新任务仍要能执行。** Chrome 完全退出不承诺继续操作；再次启动应对账，不盲目重放有可能已经发生的副作用。

必须清楚区分三个页面：
1. **业务任务提交页面**：真实用户的 Task 选择、参数输入、提交、查询、Stop。
2. **OpenDesk Browser 云控授权页面**：配对 Provider、审核固定 Task/版本/目标站点、同意/撤回结果正文权限。
3. **被操作的最终网页**：Chrome 实际创建或更新业务记录的目标，不是前两个页面。

## 2. 六项关键任务（R19.5 仍按此顺序）

### K1 · 真实用户表单 → 服务端入队
查明外部业务页面、登录态、BFF、表单 Schema、提交/查询/取消 API 的真实位置；复用 /v1/submit、/v1/job-status、/v1/job-cancel；后台安全保存限定 Client Token，禁止前端暴露；持久化后返回 jobId；同 requestKey 同内容去重，不同内容报冲突。**验收：真实网页登录提交，刷新后仍能查询同一 Job。**

### K2 · 真正独立的 Pull
验证 R19.4 的 HTTPS /v1/pull-open + /v1/claim、grant/capability/pairing 绑定、短会话过期/更新、WSS 故障降级、SW Alarm/Offscreen 恢复、有界领取和旧 Claim 重读。防止新的 transport session 抹掉原 Claim 身份或旧 UNKNOWN。**验收：WSS 不可用而 HTTPS 可用，任务 A 真实 Chrome 执行并产生唯一 Run/Result/Receipt。**

### K3 · 服务器定向 Push
验证 WSS 已认证通知只送给目标 Executor；Offer 内仅可含相关 Job 引用，不含执行源码；Browser 同步原 Claim/Permit，发送/确认/执行/回执状态分离。断线时保留 Job 并允许安全 Pull 接替。**验收：关闭 Side Panel 后才提交任务 B，Provider 通知正确 Browser，真实 Chrome 更新 A 的记录，收到最终 Receipt。**

### K4 · 两种传输统一 Chrome Authority
原装 Task 版本/Hash/InstallationId/Generation、网站授权、Grant/Pairing、Permit/Lease、@slot、Host Owner 都必须由原 Trusted Authority 重验。**不创建第二 Provider、Controller、RunHost、SDK、权限数据库或调度器。** 服务器派发权不等于 Chrome 执行许可。

### K5 · Job 状态、Stop、Receipt 和恢复
冻结 requestKey → jobId → assignmentId/claimId → cloudRequestId → runId/resultId → receiptId。证明 Stop 受理 != Controller 真实停止；Permit ACK 丢失只对账；原生网页效果未知时置 UNKNOWN、不重放；Result/Receipt ACK 丢失只重发同一结果。区分排队、Offer、Claim、Permit、运行、结果保存、回执确认和最后终态；最小权限结果披露。

### K6 · Mac Chrome、HTTPS、跨设备完整验收
从真实业务 Web 表单开始，执行 T00–T10 和 G0–G5，保留真实网页记录、Job/Assignment/Run/Result/Receipt、源码/包指纹、CI 与截图/日志。Mac 本地工作目录：/Users/shopme/Documents/workspace/opendesk-browser。仅 main，无新分支、Worktree、PR、强推；保留共享 Profile、数据和并行 Agent 改动。无法访问外部页面/证书/两台物理设备须诚实标 BLOCKED 或 NOT_TESTED。

## 3. 唯一统一架构（冻结职责）

~~~mermaid
flowchart TD
  A[独立任务表单<br/>Task 类型 / 参数 / requestKey] -->|用户登录 HTTPS| B[业务后端 BFF<br/>会话、Schema、权限、Token 保管]
  B -->|限定的 Client Token| C[唯一 Provider<br/>提交 API / 身份与任务授权]
  C --> D[(持久 Job / 幂等键 / 队列 / Receipt)]
  D --> E{同一 Job 的交付方式}
  E -->|Pull: HTTPS 认证 / 对账 / 领取| F[指定 Browser Executor]
  E -->|Push: 认证 WSS Offer / notify| F
  F -->|原始 Claim + Assignment + Permit| G[Chrome Service Worker / Cloud Service]
  G --> H[固定 Offscreen RunHost<br/>独立于 Side Panel]
  H --> I[唯一 Trusted Controller / Authority / @slot]
  I --> J[真实 Chrome 被操作网页]
  J --> K[(原始 Run / Result / Retirement)]
  K -->|受限 Receipt / 对账| C
  C -->|Job 状态 / 有权限的结果 / Stop 回执| B
  B --> A
~~~

| 组件 | 只做什么 | 不允许做什么 | 已有源码 |
| --- | --- | --- | --- |
| 业务表单 | 显示 Task、目标、参数、任务进度 | 存长期 Client Token、上传 JS、直接调用 Chrome | 本仓库尚未定位到真实交付入口 |
| 业务 BFF | 用户登录、授权、Schema 映射、请求幂等、密钥保管 | 私下另建 Executor/Provider、伪造运行成功 | 需定位外部服务 |
| Provider | 固定 Task pin、Job 入队、Executor 选择、Claim/Permit/Receipt/Stop 和客户端隔离 | 替代 Chrome 本地权限、执行任意来源代码 | scripts/cloud-control/provider.mjs |
| Cloud Connection | WSS 通知与 HTTPS Pull 降级/对账 | 直接执行脚本、另建队列或 RunHost | src/cloud-control/connection.js |
| Cloud Service | Claim、身份/任务/目标校验、Permit、结果对账 | 绕开 Task 安装和本机 Grant | src/cloud-control/service.js |
| SW + Offscreen | 关闭 Side Panel 后维持正确宿主/唤醒和任务循环 | 第二个 Controller；在 SW 中跑远程 JS | src/sw.js；src/cloud-control/runner-lifecycle.js；src/cloud-control/runner.js；src/entrypoints/cloud-runner.js |
| Controller | 原生操作、幂等、记录、停止/退休 | 基于 Push 或网络成功绕过原生 Effect ACK | src/run-host.js；src/platform/host/controller-methods.js 等 |
| 用户状态页 | 根据最小持久事实投影状态 | 把 notify、cancel accepted 或连接在线显示成 Completed | 尚需业务表单集成 |

原则：**服务器负责调度，Browser Authority 负责执行许可，Controller 的 Run/Result 是实际执行事实，Provider Receipt 是回传确认事实。**

## 4. Pull / Push 现状与关键风险

| 对照 | Pull | Push |
| --- | --- | --- |
| 触发 | Browser 通过有界循环主动查询/Claim | Provider 对正确 Executor 的已认证 WSS 发 notify / Offer |
| 传输 | HTTPS；R19.4 新增 /v1/pull-open，短期 session 与认证配对绑定 | WSS /v1/events；R19.4 Offer 是 Job 引用、非代码 |
| Job | Provider 原 queued Job | 完全同一 queued Job |
| Claim | /v1/claim 原幂等 Claim，可带 pullSessionId | /v1/claim 原幂等 Claim |
| 权限 | Executor credential、Pairing、Grant、Task pin、Permit | 与 Pull 完全一致 |
| 最终执行 | 原 Offscreen RunHost / Controller | 原 Offscreen RunHost / Controller |
| 主要未证实项 | WSS 真断线 + HTTPS 可用时持久稳定接单、会话轮换与重启安全 | 关闭 Panel 后新提交 B、定向通知→真实执行、与 Pull 竞争无重复 |
| 禁忌 | 删掉服务端原来在线检查以绕过认证 | 将 notify 当作已受理 Assignment 或直接下发 JS |

### Pull 关键时序

~~~mermaid
sequenceDiagram
  participant B as Browser SW/Offscreen
  participant P as Provider HTTPS
  participant H as 原 Controller
  B->>P: Executor Bearer /v1/auth
  B->>P: /v1/capabilities 当前 Grant 与 Task pins
  B->>P: /v1/pull-open
  P-->>B: 限时且绑定 Pairing/Grant 的 session
  B->>P: /v1/reconcile 原 Job/Assignment/Run
  B->>P: /v1/claim 原 ClaimId + session
  P-->>B: 唯一 Assignment 或空
  B->>H: cloudResolve / bind 原 Run
  H->>P: /v1/admission 原 RunRef
  P-->>H: Permit 与租约
  H->>H: 原生网页动作 + durable Result
  H->>P: /v1/receipt 原 ResultId
  P-->>H: 原 ReceiptId / digest
~~~

### Push 关键时序

~~~mermaid
sequenceDiagram
  participant U as 业务 BFF
  participant P as Provider
  participant B as Browser SW/Offscreen
  participant H as 原 Controller
  U->>P: /v1/submit requestKey/Task/参数
  P->>P: 持久 queued Job + 目标 Executor
  P-->>U: 原 jobId
  P-->>B: 认证 WSS notify + 有界 Job 引用
  B->>P: /v1/reconcile + /v1/claim
  P-->>B: 同一 Assignment
  B->>H: 原 RunHost / Controller / Permit
  H->>H: Chrome 真实执行 + Result
  H->>P: /v1/receipt
  U->>P: /v1/job-status
  P-->>U: 有权查询的状态/有限结果
~~~

**实现审计提醒**：/v1/pull-open 会话是 Provider 内存态，服务重启后可以重新认证获取新会话；已持久 Claim/Job 必须仍返回原身份。WSS 重新连接和 Pull 降级竞争时应保证单一 connection generation/Claim，不因重连重新运行。对响应丢失的 Claim 必须使用原 ClaimId 和同键对账，不能生成新 Job/Run。

## 5. 身份与服务器状态（先认事实，再做投影）

身份合同：

~~~text
登录用户 + 客户端权限
  └─ requestKey（同一业务提交的稳定幂等键）
      └─ jobId（Provider 的唯一持久 Job）
          ├─ TaskId / version / manifestHash / sourceHash / validated params / target
          ├─ targetExecutorId / targetPairingId / targetGrantId
          └─ ClaimId → AssignmentId / attemptEpoch / leaseUntil
                └─ cloudRequestId = "cloud:" + AssignmentId
                    └─ RunRef(runId, resultId, requestId, sourceHash, manifestHash, grantId)
                        └─ 原 Controller Run / Result / retirement
                            └─ Provider receiptKey=resultId → receiptId / digest
~~~

| 用户能看懂的状态 | 后端应依据的事实 | 注意 |
| --- | --- | --- |
| 已提交 / 排队 | Job 持久化且尚未 Claim | 不是发送成功即运行 |
| 等待浏览器 | Executor 离线或不可领取 | 离线不删除 Job |
| 已通知 / Offer 待领取 | WSS 交付事件/确认事实（若有） | 当前不能无证声称持久 Offer 状态已完整实现 |
| 已领取 | 绑定有效 Assignment 与 Claim | 不代表 Permit 已批准 |
| 正在执行 | 原 Controller Run 与有效 Permit | 仍可能 Stop 或结果未知 |
| 结果已保存 | 原 Result 持久化，Run 已退休 | 不代表 Provider 已收到 |
| 回执待确认 | 原 Result 存在，原 Receipt 发送/ACK 未确认 | 只重试同 Result |
| 已完成 / 失败 / 停止 | 可信终态 Result + 必要确认 | Stop 请求受理≠真实停止 |
| UNKNOWN | 网页动作可能有效但无法确认 | 禁止自动重做原副作用 |

实现方法：从现有 Provider jobs/requests/receipts、Cloud History Index、原 Run/Result/retirement 做**只读最小状态投影**，不要为了界面添加一份独立执行状态机或覆盖历史。除用户明确授权外不回传网页正文；外部客户端仅能查看自己获准的 Job；最小 status-only receipt 不泄露页面数据、Cookie 或内部 Run 指针。

## 6. 生命周期、Stop 与故障安全

- **关闭 Side Panel**：只能移除管理 UI，不可删除固定 Offscreen Runner、已批准 Cloud 配置、原 Host Owner、@slot；用 src/sw.js + runner-lifecycle.js 的既有唤醒、Context 身份和资源退休机制。T02 必须先关闭面板，再提交新 B，不能提前放入队列。
- **SW 休眠 / Offscreen 重建**：先重建原宿主，再从持久事实对账，不能认内存在线标记是持久事实；一个 Worker/slot 有执行权，另一个不能抢占未知 Run。
- **WSS 故障**：HTTPS Pull 的短时授权仍要匹配 Executor/Pairing/Grant/Task；到期不能继续 Claim；重连不得扩大权限。
- **Claim / Permit ACK 丢失**：只查询原 Job/Assignment/RunRef；不重新生成会触发网页效果的新请求。
- **原生效果未知**：保留 OUTCOME_UNKNOWN、operation journal、原 @slot/资源退休事实，禁止凭“执行失败”重放可能已成功的点击或表单提交。
- **Receipt ACK 丢失**：取回原 Result 与同 receiptKey 原地重发；原终态 Result 不允许覆盖。
- **Stop**：分别记录 Provider cancellation accepted、Browser 本地 Fence、Controller 已停止/已退休、网页副作用是否已发生，不把任一中间状态标为“已经停止”。
- **授权撤销**：新的 Task 版本、安装代际、网站权限、Client、Pairing 或 Grant 撤销后，不可用旧凭据/旧 Task pin 恢复执行或泄露结果。

## 7. 已提交代码与已查证的 CI 证据

### 已合入 R19.4

- 主要实现提交：[ed0bfa301c7b0e4fe6abb40fc218480b8e173ca5](https://github.com/shopable-ai/opendesk-browser/commit/ed0bfa301c7b0e4fe6abb40fc218480b8e173ca5)。
- 修改：scripts/cloud-control/provider.mjs、src/cloud-control/connection.js、src/cloud-control/service.js、src/ui/cloud-hosting.js、src/ui/cloud-status-presentation.js。
- 测试：tests/cloud-control/dual-delivery-r194.test.mjs、tests/cloud-control/https-pull-r194.test.mjs。
- 该提交的实际 Blob：Provider b65d573d1e176d1f3ddcb57ca462a04615b2a5e9；Connection 5eecde77535e2dc5bf06a9bad6918a1cbbb189f0；Cloud Service 57eae006e52050f3b4b4b38b6981c5412b4b266c。
- 2026-10-22 检查时 main 已有大量其他 Agent 并发提交；此文档固定实现提交而不是冒称它永远是最新 HEAD。

### 对应提交的 CI 解读（不是 Mac 原生验证）

- [Cloud Control R5.2 #39795859397](https://github.com/shopable-ai/opendesk-browser/actions/runs/39795859397)：Provider HTTP/WSS/TLS、多 Executor、隐私/恢复测试步骤 **PASS**；Controller Authority 步骤 **PASS**；Trusted Side Panel UI 步骤 **FAIL**，其中 cloud-control-sidebar-r28 测试 22 项 21 PASS/1 FAIL，失败是“Cloud 为独立 Tab / 开发 Debug 顺序”的旧断言。整个 Workflow 仍 FAIL。
- [Cloud Control R3 #39795859388](https://github.com/shopable-ai/opendesk-browser/actions/runs/39795859388)：component 作业在 privileged bundle source pins 检查 FAIL（其中 Trusted background 固定 Blob 断言不一致）；后续组件未执行。**package 作业 PASS**，包括 check、production/development build、strict package/CSP verification。但未在本报告中独立读出正式包 Hash，不能填造。
- 以上结论限定于 **ed0bfa3** 精确提交。新 main 必须重新关联 SHA 读取最新 Actions，不能自动继承旧 PASS/FAIL。
- 历史原生证据见 docs/framework/workstreams/evidence/cloud-control-r18-20261020/report.json：曾有固定 Task Chrome Worker + Result/Receipt、UNKNOWN 不重放等场景。它们不能替代本次新的 T00–T10 Pull/Push/表单/跨设备验收。

## 8. T00—T10 产品验收矩阵（当前真实等级）

| 测试 | 用户可理解的达标事件 | 2026-10-22 已核实状态 |
| --- | --- | --- |
| T00 | 真实登录 Web 表单提交、刷新同一 Job、重复提交只 1 条 | **NOT_TESTED**（本仓库未定位到 BFF/真实表单） |
| T01 | HTTPS Pull 领取新 A；Chrome 建一条可持久读回的记录；Result/Receipt | **COMPONENT_TESTED**（相关协议步骤 PASS）；**NATIVE_NOT_TESTED** |
| T02 | 关闭 Side Panel 后提交 B；WSS 定向 Offer；Chrome 更新 A 的记录 | **SOURCE_IMPLEMENTED / NATIVE_NOT_TESTED** |
| T03 | Pull/Push 并发及重复通知只执行一次，不重复写 | **PARTIAL_COMPONENT_TESTED / NATIVE_NOT_TESTED** |
| T04 | 错 Executor/Client/Pairing/Task/授权均拒绝 | **COMPONENT_TESTED**；完整真实 Chrome 矩阵待验 |
| T05 | Receipt ACK 丢失只重发原 Result | 历史协议/组件有证据；本轮真实链路 **NOT_TESTED** |
| T06 | 网页副作用可能成功而 ACK 丢失 → UNKNOWN，不重做 | R18 历史原生有证据；R19.4 全链路 **NOT_TESTED** |
| T07 | WSS 断线、SW 休眠、Offscreen/Chrome 重启后安全 Pull 恢复 | **PARTIAL_COMPONENT_TESTED / NATIVE_NOT_TESTED** |
| T08 | 服务端取消、本地 Fence、Controller 停止、业务副作用分别对账 | 协议存在；完整端到端 **NOT_TESTED** |
| T09 | 不用 CLI，仅 HTTPS 登录 Web 页面提交、查询、取消 | **NOT_TESTED**（BFF/表单依赖未定位） |
| T10 | 两台物理设备间真实任务交付、Chrome 执行、Result 回传 | **NOT_TESTED**（未取得双设备证据） |

Gate 不得冒称最终关闭：**G0 BLOCKED（真实表单/生产队列未验收）；G1 部分组件已实现，原生待验；G2 部分源码已实现，Side Panel 关闭后的 B 待验；G3 部分安全组件已验，完整故障矩阵待验；G4 BLOCKED（独立 Web BFF 未验）；G5 NOT_TESTED（跨设备、安装升级和正式部署）。**

## 9. 剩余 P0 / 真实实施优先级

### P0-A · 业务入口缺失或外部依赖未定位
先找现有业务表单/BFF/API，确定用户在哪里提交、如何登录、Token 怎样服务端保管。可接入现有服务；没有真实外部服务权限则登记 BLOCKED。**禁止为了“完成演示”把 Admin API、长期 Client Token 或 JS 上传塞进前端。**

### P0-B · R19.4 Pull/Push 的原生闭环与恢复证据
针对已合入实现重新跑当前 HEAD 精确测试，修复真实失败；用同一固定 Task 持久记录做“Pull 创建 A、关面板后 Push 修改 B”，再做 WSS 真断、HTTP 重认证/renew、重启、Claim ACK 丢失、Stop/UNKNOWN。特别核查短 Pull session 到期、WSS 重试状态转换时是否导致新 Claim 被阻止；确认没有第二执行槽。

### P0-C · CI 回归基线
R19.4 对应 Cloud R5.2 Side Panel Tab 断言、Cloud R3 shared privileged Blob Pin 不一致必须先定责：若是并行 UI/共享背景改动，复用当前 UI/构建合同按最小差异修复，不要为了让测试绿而削弱 Authority、安全验证或篡改固定源码 Pin。新 main 精确 SHA 重新跑 targeted tests 与构建校验。

### P0-D · 服务端可交付性
Node state.json 现状与生产需求明确分开；正式环境必须核对多租户归属、存储事务/唯一索引、崩溃持久性、任务出站/回执、TLS/ACL、服务监控与灾备。未经认证和数据库/生产证据不得写“Production PASS”。

### 交付流程
1. 固定最新 main 和并行修改范围；只读核对外部表单依赖。
2. 先修 P0 的真实产品错误；小范围提交，每次保留旧 Job/Run/Result。
3. 完成 T00→T01→T02（最有说服力的用户路径）；随后 T03–T10 安全、故障、跨设备。
4. 复查构建正式包来源及 Hash、CI、Mac 原生 CDP/网页记录、真实用户状态页。
5. 十维独立专家评估（原始需求、表单、服务器队列、Pull、Push、统一执行、安全、防重复恢复、结果、交付）；所有维度目标 ≥95，**无实际证据不得打 95 或声称 PASS**。

## 10. 新对话的不可偏移原则

- **原始业务需求 + K1–K6 始终置顶**，先解释产品状态，再讲接口和测试。
- 只在最新 main 改代码；不建分支/Worktree/PR，不强推；不清理旧 UNKNOWN/@slot、旧 Job/Run/Receipt。
- 现有 Provider、Task Registry、SW、Offscreen、Controller、SDK、Authority、Host 是唯一机制，不能因 Pull/Push 重命名再建一套。
- 优先真正业务任务表单和 Chrome 可验证副作用，不把示例数据、单元测试或 Mock 冒充真实执行。
- 中文回答应固定顺序：产品结论 → 统一架构 → Pull/Push 对照 → 最新源码/提交/测试 → 数据状态 → 时序与恢复 → T00–T10 → G0–G5 → 剩余 P0 → 十维证据评分。
- 明确保留 **T00（真实表单）、T01（Pull A）、T02（关 Panel 后 Push B）** 作为下一轮优先顺序；外部资源无法访问时说明阻断，继续做当前可验证的代码修复与测试，不反复询问已给出的仓库/分支/用户目标。


## 11. R19.5 最新实现与集成边界（2026-10-22 增量）

> 本段是在原始目标、K1–K6、T00–T10 与 G0–G5 基准之上的**已提交增量**；不把协议/组件测试冒充真实业务验收。本节需要随最新 main 和真实 CI 重新核对。

### 11.1 已提交源码

- [9d95de52d868bd5915aaf6ab44db9a83fcd8ece8](https://github.com/shopable-ai/opendesk-browser/commit/9d95de52d868bd5915aaf6ab44db9a83fcd8ece8)：仅修改 `src/cloud-control/connection.js` 与 `tests/cloud-control/connection.test.mjs`。HTTPS Pull session 仍有效时，WSS 重探测和短暂续期故障不主动摧毁原 Pull-ready；切换到 WSS 的 authenticated-ready 之前必须通过 capabilities ACK 和 reconcile。新增两个独立回归。
- [e800ea2ff3d06873f38338f498ad0418879e26ba](https://github.com/shopable-ai/opendesk-browser/commit/e800ea2ff3d06873f38338f498ad0418879e26ba)：仅修改 `scripts/cloud-control/provider.mjs` 与 `tests/cloud-control/remote-https-r52.test.mjs`。已有 Client-scoped HTTPS `/v1/client-scope` 可选择读取批准 Task 的安全表单元数据；`/v1/submit` 拒绝空白/超长 requestKey。保留原 Client Token、Job、Claim、Permit、Run/Result、Receipt 边界，不新增 Provider。
- [d5026e2f73b7c795a5796bd25a60b2df8e098eaa](https://github.com/shopable-ai/opendesk-browser/commit/d5026e2f73b7c795a5796bd25a60b2df8e098eaa)：把仅产生临时 WSS Ticket 的 `/v1/auth` 纳入不触碰 durable state.json 的读路径，并在认证时清除过期、失效 Pairing 的内存 Ticket；增加 `state.json.tmp` 被占用仍可完成受信 HTTPS 认证的回归。该提交对应的 CI [#39804576987](https://github.com/shopable-ai/opendesk-browser/actions/runs/39804576987) 本次写入时仍未取得最终结果，不能继承之前提交的 PASS。
- [b430ae408268b4c9d3d0fee63652e1c389d3efad](https://github.com/shopable-ai/opendesk-browser/commit/b430ae408268b4c9d3d0fee63652e1c389d3efad)：定位 Side Panel R28 失败 **不是仅有旧断言**，而是正式 `src/ui/react/tabs/tool-host.tsx` 在 Cookie 非首用模式中重复渲染 `sidebar-tool-enable` 和 `sidebar-tool-enable-hint` 两个 DOM ID。调整 Cookie 专用开关与通用设置的单一渲染边界，增强原来 `609!==611` 的严谨 ID 唯一性测试，而不是删除断言。精确 CI [#39805534269](https://github.com/shopable-ai/opendesk-browser/actions/runs/39805534269) 已确认 Side Panel R28 **22/22 PASS**，但 Cloud workflow 因另一个源码差异预览多行样例问题整体 FAIL。
- [2ca91b117193abc45d49abc33bdcf1515911494d](https://github.com/shopable-ai/opendesk-browser/commit/2ca91b117193abc45d49abc33bdcf1515911494d)：修正 `tests/environment/cloud-program-inbox-react.test.mjs` 的多行差异样例，把源字符串中的文字 `\\n` 改为真正换行转义 `\n`，并额外断言示例确有三行。不改变产品 diff 算法，不降低保留前后文及按行显示 `- old` / `+ new` 的产品验收要求。目标 CI [#39805918963](https://github.com/shopable-ai/opendesk-browser/actions/runs/39805918963) 本次写入时还未结束。
- 并行 Agent 仍可能更新 main；提交 SHA 是证据定位，不代表永远是 HEAD。

### 11.2 Web 表单与现有业务 BFF 的**接口约定，不是已实现的 Web 页面**

已有 Provider 接口 `POST /v1/client-scope` 的可选请求体为：

~~~json
{"includeTaskSchemas": true}
~~~

必须在**持有受限 Client Credential 的受信 BFF**发起 HTTPS 请求；普通用户页面不得持有该 Credential。原先空请求体 `{}` 的完整响应形状保持向后兼容。可选返回 `taskCatalog` 只包括该 Client **已获批准的 Task pin**、`title`、`paramsSchema`、`siteOrigins`；不包含 `sourceUtf8`、manifest/program 执行体、Provider Admin 或 Executor 凭据。

计划接线方式（**尚未发现真实 BFF/业务页面部署证据，以下路径仅示意，不是新增 Provider 路由**）：

1. 用户登录现有业务网站 → BFF 校验会话、用户权限和任务归属。
2. 业务前端向**本业务 BFF**读取安全 Task 选项和参数 Schema；BFF 调用现有 `/v1/client-scope` 且只向用户暴露必要展示字段。
3. 用户填写已批准类型、目标与参数；Web/BFF 持有稳定 requestKey（页面重试不得换键）；BFF 二次校验 Task、站点、用户-Client 授权后，把批准的 pin 和经校验的参数传给现有 HTTPS `/v1/submit`。
4. Provider **先写入现有持久 Job**再返回稳定 jobId。同键同内容仅返回原 jobId、同键不同内容应 `E_REQUEST_CONFLICT`。
5. BFF 对原用户拥有的 jobId 转发 `/v1/job-status`；Stop 只调用 `/v1/job-cancel` 并区分“取消请求已受理”与“Controller 已真实停止”。
6. Pull/Push 后续共享 Claim → Assignment → Permit → 原 Offscreen/Controller → Run/Result → Receipt；不允许业务表单上传 JS/Shell/CDP。

接口元数据已完成源码/组件级补强；**业务 Web 表单、真实用户登录系统、BFF 部署、页面刷新后查看状态/Stop 均仍 BLOCKED/NOT_TESTED**，不可称 T00/T09 完成。

### 11.3 R19.5 精确 CI 证据与限制

- [Cloud Control R5.2 · e800ea2 测试运行 #39803624112](https://github.com/shopable-ai/opendesk-browser/actions/runs/39803624112)：`npm run test:cloud`（含新增 Pull 及 Client Schema 合同）**PASS**，Controller Authority 组件步骤 **PASS**；Trusted Side Panel 组件步骤 **FAIL**，故**整体 CI FAIL**。精确日志 `609 !== 611` 是真实 DOM ID 重复，已在 b430ae4 修复并通过 R28 22/22；随后独立 Cloud 源码对比多行样例出现 `\\n` 字面量导致的 `- old` 缺失，已在 2ca91b1 更正输入测试，等待当前 CI；不能因单项协议与 UI 测试通过而填总体 PASS。
- [Cloud Control R3 · e800ea2 测试运行 #39803624095](https://github.com/shopable-ai/opendesk-browser/actions/runs/39803624095)：component 作业因共享源码 Pin 验证 **FAIL**，后续组件被跳过；package 作业现已 **PASS**（源码安全检查、production/development 构建、严格包与 CSP 验证均 PASS）。整体工作流仍 FAIL，不能用修改安全 Pin 的断言来假造通过。
- 以上均为 GitHub Linux Node/构建证据；**不是 Mac 物理 Chrome、真实 BFF、真正的网页数据写入或两设备实测**。
- 只根据最新 HEAD 精确 Run ID 和步骤结论更新证据；其他 Agent 改动导致的共享 UI/Pin 失败应先定责，不得为过绿削弱 Authority。

### 11.4 仍需要实际完成的交付

- **T00/T09：BLOCKED** — 定位现有独立业务页面/BFF、登录系统以及其真实生产地址；不新建第二个 Provider，不将受限 Client Token 放入页面，不把 CLI 或表单演示当作真实用户入口。
- **T01：COMPONENT_TESTED，NATIVE_NOT_TESTED** — HTTPS Pull 稳定性回归已绿；仍要在无 WSS 但 HTTPS 正常的 Mac Chrome 上由真实固定 Task 创建 A，并读回网页记录、Result、Receipt。
- **T02：SOURCE_IMPLEMENTED，NATIVE_NOT_TESTED** — 先关闭 Side Panel 再提交 B，通过授权 WSS 向目标 Executor 通知，必须修改 A 并读回，不得提前排队。
- **T03–T08：PARTIAL/NOT_TESTED** — Pull/Push 竞争、重复通知、错误 Executor、Receipt ACK 丢失、原生 UNKNOWN、重启、Stop/本地 Fence 与撤权。
- **T10：NOT_TESTED** — 两台物理设备及跨设备证据。
- **G0/G4 BLOCKED；G1/G2/G3 部分组件；G5 NOT_TESTED**。Node state.json 仍不能称数据库事务/HA 生产队列；需另行验证正式部署、故障恢复、运维与灾备。

**R19.5 下一执行顺序不变：先确认真实 BFF 并完成 T00，然后无 WSS 的真实 T01，随后关 Side Panel 的真实 T02，再以 T03–T10 和 G0–G5 收尾。**

## 12. R19.6 实测核查、最小 CI 修复与未关闭产品门槛（2026-10-23）

> 本节是对第 1–11 节的追加，**不替换原始目标、六项关键任务、身份/安全合同和历史证据**。此处 GitHub Action 证据只对各自记录的精确提交生效。并行 Agent 持续在 `main` 提交，所以文中 SHA 不是永久 HEAD。不得把 Linux CI 当作 Mac Chrome / 独立业务 BFF / 两设备实际结果。

### 12.1 保留的执行主线和源码事实

- 唯一传输/执行链：业务 Web → 受信业务 BFF（用户会话与授权）→ 既有 Provider `/v1/submit` 持久 Job → 认证 Executor 经 HTTPS Pull / WSS 通知 → 同一个 `/v1/claim` → Assignment → `/v1/admission` Permit → 既有 Offscreen RunHost → Trusted Controller/Authority → 原 Run/Result → 原 Receipt → `/v1/job-status` → BFF → Web。
- `scripts/cloud-control/provider.mjs` 提供 Client-scoped HTTPS `/v1/client-scope`（可选 `includeTaskSchemas`）、`/v1/submit`、`/v1/job-status`、`/v1/job-cancel`，经认证和 Task pin/target/params/requestKey 检查。远端 WSS `/v1/events` 只发送特定 Executor 的 Job 引用；`/v1/pull-open` 是受绑定的 90 秒短会话，不是执行许可。
- `src/cloud-control/connection.js`（Pull/WSS 复用状态与 ACK）、`src/cloud-control/service.js`（原 Task 安装、权限、Claim/Permit、Result/Receipt、UNKNOWN）、`src/cloud-control/runner-lifecycle.js`（SW 所属唯一 Offscreen 生命周期）、`src/cloud-control/runner.js`（通过既有 `host.start` 启动 Controller）保留统一权威和旧 `@slot`。**这是源码/组件事实，非 R19.6 真实 Chrome 合格证明。**
- Node Provider `state.json` 单进程串行、`state.json.tmp` 写入/同步/rename，已有相同 requestKey 的持久幂等和 Receipt 对账。没有关系数据库事务唯一索引、HA、备份/灾备、负载/真实生产部署证据，**不可标为生产级队列**。
- `examples/tasks/form-fill.v1.opendesk-task.json` 只授权 `http://127.0.0.1:43111` 的本地演示表单，`modern-search` 是搜索示例。两者不能冒充“真实业务记录 A 创建后由 B 更新 A”；更新能力必须先作为固定版本/Hash 的 Task 正式安装、授权、验证。

### 12.2 业务 BFF/表单发现结果与真实 P0

- 检查了本仓库 `examples/cloud-control/`（只有说明文档）、Provider/CLI/云控源目录，并逐层核对关联仓库 `shopable-station` 的 `apps/web/src/app/api`、`apps/api/src/routes`，以及 `todo-admin-midway/src/modules/cloud/controller/app/func.ts`。在可读取的入口中**未确认本协议可用的正式 Web 表单、登录态到 Client 授权映射、BFF API 或实际部署地址**；旧 Midway `AppCloudFuncController.invoke` 是空函数，并不是云控 BFF 的实现。代码搜索无匹配不能证明其他外部服务不存在。
- **T00/T09 仍 BLOCKED**：需要已有业务 Web 的真实 URL、用户登录/授权和受信 BFF 的源码或服务访问、Provider TLS/有限 Client Credential 在服务端的保管、用户↔Job 归属映射与页面刷新恢复。不使用演示/CLI 代替真实 Web，也不在普通浏览器脚本保存长期 Client Token。
- 若现有 BFF 在外部，则接入现有登录校验并只代理已批准的 Task Schema / Submit / Status / Cancel；严格保留同次请求 `requestKey`、相同正文返回原 `jobId`、同键不同正文返回冲突，结果和 Stop 事实分开显示。缺访问权时不新建第二 Provider 或假 BFF。

### 12.3 本轮真实修复和精确 GitHub Actions

1. [`45aa7614fe0c44fe1f49e09b3468b33a84d6a2ef`](https://github.com/shopable-ai/opendesk-browser/commit/45aa7614fe0c44fe1f49e09b3468b33a84d6a2ef)：只更正 `tests/environment/cloud-program-inbox-react.test.mjs` 中真正多行差异的新增行正则，由错误字面反斜线匹配改为 `/^\+ new$/m`，并把删除行严格锚定为 `/^- old$/m`；不改变差异算法、源码安全或授权规则。
   - [Cloud R5.2 #39810699408](https://github.com/shopable-ai/opendesk-browser/actions/runs/39810699408) 绑定该精确提交：**工作流 SUCCESS**。`npm run test:cloud`、Controller Authority/Run/Result、Trusted Side Panel Cloud 均 PASS；只证明 Linux 组件和测试合同。
2. [`af8f8f624a0c39fd819b4895b31156deb1c8190f`](https://github.com/shopable-ai/opendesk-browser/commit/af8f8f624a0c39fd819b4895b31156deb1c8190f)：仅修正 `tests/environment/bundle-provenance.test.mjs` 中过期 Time Review Git Blob 期望值 `1b4dfe90…` → `3dfd773f…`。**当前正式源码 Blob 与已有 `scripts/bundle-provenance.mjs` 独立审核过的生产 allowlist 均精确为 `3dfd773fa8cf38deeb23a5d5f9f56d0b27e11ff6`**；不调整白名单、不允许未知输入、不扩大固定输出目标。
   - [Cloud R3 #39811501437](https://github.com/shopable-ai/opendesk-browser/actions/runs/39811501437) 的 component 中“Privileged bundle source pins”已 **PASS**，Sidebar 导航/Task 等此前步骤也 PASS；但 `tests/environment/sidebar-ui-preview.test.mjs` **3 项共享 UI 检查 FAIL**（Developer 头部控件位置、Workflow 控件圆角、官方动态行表面样式），故 component 与总体不可宣称 PASS。正式 `cloud-r3-package` 精确作业已 **SUCCESS**，包含源码检查、Production/Development MV3 构建和严格包/CSP 校验；尚未独立读取最终包 Hash，不能凭作业通过编造哈希。
- 旧 R19.5 中的 Cloud R5.2 多行样例和 Side Panel 重复 ID 的前序问题已由此轮及 R19.5 连续修复闭环，但 Cloud R3 的共享 UI 红灯和其他不相关 Workflow 的红灯不能被 Cloud R5.2 的 PASS 覆盖。
- 当前对话无 Mac 主机文件系统、实际运行中的 Chrome/业务 BFF/证书及两台设备控制权；没有执行 T00、T01/T02 Mac 原生、跨设备现场，不制造原生 PASS，也不操作历史未知 Run。

### 12.4 R19.6 产品场景和 Gate 的保守状态

| 项 | 截至上述核查的证据等级 | 原因/仍需完成 |
| --- | --- | --- |
| T00 真实登录 Web 提交、去重、刷新 | **BLOCKED** | 业务 BFF/登录/页面 URL 未确认；Provider API 组件 PASS 不够 |
| T01 关闭 WSS 的 HTTPS Pull 真 Chrome 创建 A | **PARTIAL** | Pull/Claim/Permit/Receipt 协议组件 PASS，原生业务数据读回 **NOT_TESTED** |
| T02 关 Panel 后 WSS Push 更新 A | **PARTIAL** | WSS/Runner 源码与组件存在，正式更新 Task 和真实 A→B 执行 **NOT_TESTED** |
| T03 并发/重复通知不重复副作用 | **PARTIAL** | 组件覆盖部分 Claim 幂等，原生竞争 **NOT_TESTED** |
| T04 错 Executor/Client/Pairing/Task/Grant 拒绝 | **PARTIAL** | 安全协议组件 PASS，原生全部矩阵 **NOT_TESTED** |
| T05 Receipt ACK 丢失 | **PARTIAL** | Provider/组件同键原地重发 PASS，当前原生 **NOT_TESTED** |
| T06 未知网页效果不自动重做 | **PARTIAL** | R18 历史原生 + 当前组件；R19.6 全链路 **NOT_TESTED** |
| T07 WSS/SW/Offscreen/Provider 重启恢复 | **PARTIAL** | 组件部分覆盖，组合真实场景 **NOT_TESTED** |
| T08 Server Cancel/本地 Fence/Controller Stop/副作用 | **PARTIAL** | 合同/部分组件存在，当前端到端 **NOT_TESTED** |
| T09 不借助 CLI 的 Web 提交/查询/取消 | **BLOCKED** | 同 T00，未定位授权正式业务页面 |
| T10 两台物理设备 | **NOT_TESTED** | 未提供实际双设备、部署、TLS 与页面证据 |
| G0 / G4 | **BLOCKED** | Web/BFF/业务入队与展示未完成 |
| G1 / G2 / G3 | **PARTIAL** | Pull/Push/安全恢复通过部分组件，原生 Chrome 产品门槛未关闭 |
| G5 | **NOT_TESTED** | 正式安装/升级/物理跨设备和运维交付未闭环 |

### 12.5 下一步唯一优先顺序

先取得**真实业务 Web 与 BFF 身份/授权/部署入口**，跑通 T00（固定 Task、持久 jobId、刷新/重复/Cancel）；紧接着准备真实可新增/更新持久业务记录的**经审阅固定 Task**，在授权 Mac Chrome + Provider HTTPS/WSS 环境按 T01（真正 WSS 断线创建 A）→T02（关面板后新 Web B 更新 A）执行并记录网页读回、唯一 Run/Result/Receipt。再关 T03–T08、T10/灾备/正式发行和 Cloud R3 shared UI CI。所有记录必须绑定精确代码 SHA、Chrome extension ID/Task pin、Provider Job/Assignment、原 Run/Result/Receipt 和原生网页副作用。
