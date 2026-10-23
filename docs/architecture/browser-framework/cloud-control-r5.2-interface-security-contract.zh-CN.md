# Cloud Control R5.2 · 唯一接口、身份、权限和状态机合同

日期：2026-10-13。**本文件只冻结现有实现的接口/安全边界，不批准第二套架构**。源实现：`scripts/cloud-control/provider.mjs`、`src/cloud-control/{service,connection,history-index}.js`、`src/platform/host/{authority,broker,client}.js`。上位产品功能树 [完整目录](cloud-control-r5.2-complete-function-tree.zh-CN.md)，实施规则 [唯一执行手册](../../framework/cloud-control-r5.2-execution-manual.zh-CN.md)。

## R20.1-LOCAL 增量实施合同（2026-10-24）

目标仍为一个模块化单体 Provider：`catalog-access` 管固定 Task/Client/Executor/授权，`jobs` 管 Submit/Claim/Admit/Cancel/Settle/Reconcile，`delivery` 管认证会话及通知。采用 PostgreSQL 事务 Job Ledger + Transactional Outbox；原 Browser Authority/Controller/RunHost/IndexedDB 是唯一执行和本机证据入口。扩展包含原 v1 的存储适配，以及新 Job 显式固定的 `controlProtocol:2`；已有 Job 不升级协议，已有 Task 冻结源码不修改，不宣称已具备 R20 全部执行协议。

- **Submit / Claim**：原 requestKey + canonical digest 幂等；同键异内容拒绝。数据库内 Job、Request、唯一 Assignment 与唯一 Executor DispatchSlot 同事务。未结算 Assignment 持续占槽，租约到期、Stop、断线或重启均不释放未知效果，也不回到 queued。空 Claim 重试仍返回原空答复。登录主体/租户到 Client 的映射必须来自真实 BFF，不能信任表单自报；本轮使用独立 loopback 测试业务站，登录主体由 BFF 服务端账号映射；不是 `shopable-station`，也不视为外部生产登录集成。原生本地 Portal 登录、目录、提交及同键重试已实际完成，边界见下方证据。
- **Admit / Authorize / Run**：admission permit 绑定原 RunRef/Grant/配对，renew 只续有效租约。新 Job 可固定 `controlProtocol:2`，只由上报该能力的 Executor 领取；Assignment/permit 固定 `controlGeneration`。原 Authority 在首次 owned target 前请求独立 StartTicket，并在 `tabs.create`、首次导航及原 driver 每个实际副作用提交窗口请求独立 ControlFence；Locator 的 scroll/fill 是两个提交窗口，只读等待不取票。远端网络在 IDB 事务外，本地在原 create/operation Journal 事务内复核授权、安装代次、取消、目标和时效并记录单次消费；不新增执行体系。未获得新协议原生证据前，只能报告 SOURCE_WIRED/定向测试，不能把旧 permit、Worker completed 或 Receipt ACK 当作新保障。
- **Settle / Receipt**：原 ResultId/RunRef/正文及 digest 幂等。浏览器只有在 ACK digest 等于实际发送正文的 canonical SHA-256 时才保存 confirmed。Receipt 仅表示接收，不证明业务成功；无独立读取时 verifier 为 NOT_RUN/INCONCLUSIVE。
- **Cancel / Reconcile**：Stop 接受、本机 fence、Worker 退休及业务效果分别记录。原 UNKNOWN 只读核验，不重放。新协议的控制代次用于当前 Grant/暂停/撤权围栏，不等于已完成灾难恢复 authority generation 或历史迁移。当前 v1 撤权后不开放新 Claim/核验/结果读取；受限迟到证据结算须有明确后续协议，不能放宽原鉴权。已发出的网页异步写入无法由后续取消撤回；远端授权点和业务 PG 提交不是全局原子事务。
- **数据库事务**：固定表名与参数化 SQL；先 schema 迁移锁，再 ledger 事务级 advisory lock，再按固定顺序写 Job/Assignment/Receipt/Request/Slot/Audit/Outbox。一次事务使用同一数据库连接，`synchronous_commit=on`，异常全部回滚；原 IndexedDB 的 runs/results/commandJournal/frameworkKV 写事务请求并核对 `durability:"strict"`（不支持则拒绝，不能静默降级）；不得自动重新执行可能含副作用的回调。每个 ledger 的写入串行化是首批实现的正确性选择，尚不宣称高吞吐。
- **通知**：Job/Stop/Receipt 变化与 Outbox 同事务；各实例重放定向提示，通知只含身份、序号与种类，重复提示无执行权。HTTPS Pull 不依赖 WSS；跨实例传输会话必须从同一账本取当前配对事实，不能以进程内缓存越过撤权。
- **历史与回滚**：默认 JSON 后端保留；PostgreSQL 只在显式配置的新目录启用。发现已有 state.json 时拒绝隐式导入；写入过数据库的目录不能自动退回 JSON。旧 JSON、24 个已观察历史 Job、Run/Result/Receipt/UNKNOWN 不修改。正式迁移仍需备份、只读导入核对、LEGACY_HOLD/VERIFY_ONLY、single-writer cutover 与恢复代际合同；本次扩展不等于迁移已验收。

当前源码分类：

| 决策 | 范围与原因 |
|---|---|
| KEEP | 原 Authority、Controller、RunHost、Host Owner、Sandbox Worker、`@slot`、Journal、UNKNOWN、原 Run/Result/Receipt 身份及 JSON 历史；不复制引擎。 |
| REFACTOR | Provider 的串行事务/持久化入口与会话存储接到显式 ledger 适配器；通知仍通过原通道。Browser 加强 ACK 核对、原 IDB 持久事务及原 Authority/driver 实际副作用边界。 |
| ADD | 隔离的 server-only pg 依赖、PostgreSQL 关系/约束、定向 Outbox、真实 PG 集成、本地测试业务站和两个固定 Task；新 Job opt-in 的 StartTicket/ControlFence，独立只读业务 verifier。 |
| REPLACE / REMOVE | 本轮无历史数据、安装身份或执行引擎被替换/删除；正式 JSON cutover 未执行。 |

PostgreSQL 运行入口（只用于新的显式目录；数据库 URL 从环境读取，不写进命令行）：

```sh
npm ci --prefix scripts/cloud-control --ignore-scripts
node scripts/cloud-control/cli.mjs provider --postgres --ledger-id <stable-id> \
  --directory <new-private-directory> --port <local-admin-port> \
  --public-port <https-port> --tls-key <private-key> --tls-cert <certificate>
```

依赖变量为 `CLOUD_CONTROL_DATABASE_URL`；HTTPS 证书必须由客户端正常信任。进程启动成功不等于生产可用。两个实例使用相同 ledger-id/数据库、不同私有目录/监听端口。已有 PostgreSQL 标记缺账本或身份不符时拒绝启动；禁止删标记或改接 JSON 作为恢复办法。测试业务站入口是 `examples/cloud-control/local-business/run.mjs`，配置与账号保留仓库忽略的私有目录，不能发到浏览器前端。

验证顺序为真实业务入口→具体阻断→可独立实施的最小修复。首批数据库证据必须使用真实 PostgreSQL 的双 Provider/双连接、回滚、重启、幂等冲突与同事务 Outbox；协议测试不能记为 T00/T01/T02 或 Chrome Native PASS。正式生产安装、跨设备和评分在具备对应候选与真实业务证据前保持 NOT_TESTED/NOT_SCORED。

### 本次本地核心结果（2026-10-24，Asia/Shanghai）

持续开发环境：原 watcher 的 `dist/development`，CFT `154.0.8037.92`，扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`。Provider `2c22ce6f-4651-466d-808e-ca31167d5824` 与 ledger `local-r201-session-20261024` 保持原身份。Portal `http://127.0.0.1:43162/`，Records `http://127.0.0.1:43163/`；两站分别通过真实页面登录专用本地账号。两个固定 Task 经原目录导入、原 Run 验证、标为可用并安装 `1.0.1`，冻结源码未变；`1.0.0` 旧 pin 和历史保留。

记录 A 的唯一业务键为 `r201-cloud-A-20261024`。所有操作从真实 Portal 表单提交，由原 Browser Authority/Controller 执行；未通过 CDP、直接写 IDB 或管理接口冒充用户操作。

| 本地真实操作 | Provider Job | 原始本地 Run | 独立 Records 读回 |
|---|---|---|---|
| 创建 A | `8b193528-bb8e-413a-a2c8-5bec7591f67a` | `96210b8a-29c2-46c1-bd00-b4dcf107ef81` | `cloud record A initial / created`，`2026-10-23T20:36:54.701Z`；当时 verifier VERIFIED |
| 更新同一 A | `ddb42677-5e24-4c7f-b179-23fb88472c23` | `cd65197d-a94b-4195-9013-604a7c14f578` | `cloud record A updated / updated`，`2026-10-23T20:38:21.694Z`；当时 verifier VERIFIED |
| 最后连接代次修复后的正常更新 | `0e295108-2f84-455e-b75d-f25f7af60a8c` | `5271f85f-e53c-4c19-aab6-95c6f5d2449b` | `cloud record A final / verified`，`2026-10-23T20:42:12.708Z`；verifier VERIFIED |

三次均在 UI 显示结果已保存、资源已释放、回执已确认；原 PG 只读投影确认 `controlProtocol:2`、原 RunRef/StartTicket、每个 Job 的 6 个不同 Fence、`retirementState:released`，且无结果正文。创建请求重复点击同 requestKey `5c6e5064-e48e-4135-aa73-680b667da254` 返回原 Job，未新增执行。

独立 verifier 仅以当前 Records 登录 cookie 顺序 GET 原 BFF intent、批准 execution 与实际 PG 记录，要求固定 Task pin/操作/参数/唯一记录一致；默认只返回状态及 pin。`VERIFIED` 始终伴随 `causation:NOT_PROVEN`：当前状态吻合不证明唯一 Run 因果，A 后续变化也不会改写早先验证的观察时间。verifier 不结算 Receipt、不更新 Run、不重新执行。

审查发现并修复了：IDB 提交等待跨过 Fence TTL；校验期间变化的连接 epoch 被重新捕获；无变化 Job 的 Executor suspend/revoke 缺定向 Outbox。最终同步提交检查保留原获取 epoch、时效及已消费证据；过期/断线拒绝副作用，不自动换票重放。针对这些窗口、原 Authority/driver、ACK/隐私和真实 PG 事务的定向检查通过。没有运行生产全量构建或断电持久性试验。

本机原始证据在忽略目录 `.local/cloud-r201/native-20261024/`：`cloud-{create,update,final}.{ax.txt,png}`、`cloud-ledger-projection.json`（8 个关键模块 SHA-256），以及先前手工 Run 的 `core-observations.json`。最后候选 `src/cloud-control/service.js` SHA-256 为 `fd67f830256f13e7852cd5e453d7596ddc124f3e3ce66861f385875b217c5b2d`。凭据、数据库连接串、业务 cookie 和执行 token 不提交。

**证据边界**：Browser 本次显式选择原固定 HTTP/WS loopback 开发通道；BFF→Provider 使用验证专用 CA 的 HTTPS。Chrome 对该专用证书尚无正常信任，因此严格的 **T01 HTTPS Pull / T02 WSS Native 均为 NOT_TESTED**，不能用本地创建/更新替代。生产、跨设备、灾难恢复 authority generation、历史 single-writer cutover 与受限迟到证据结算尚未验收或未实现，分别保持未完成；不放宽撤权鉴权。三层专家正式评分均为 **NOT_SCORED（已评分 0 层 / 目标 3 层）**，本次代码审查不折算分数。本段交付本地核心开发结果，不宣称 R20 全部完成或 production 95+ PASS。

## 1. 四种主体不是一回事

1. **Browser Executor**：用户自己的 Chrome 扩展安装；身份受 `ProviderId / ExecutorId / PairingId / PairingGeneration` 约束。失效配对不能靠相同 Task 身份认领旧 Job。
2. **Cloud Grant**：用户 Side Panel 对一批**本地已验证、已安装、当前启用** Task 的附加远程执行授权；`GrantId` 每次重新批准变化。固定 `TaskId / Version / ManifestHash / SourceHash / InstallationId / Generation / SiteOrigins / paramsSchema`；Chrome Site Permission 与原 Authority 仍在准入前后检查。
3. **External Client**：用户或受信服务管理者委托给外部应用的独立 `ClientId + credential`；只绑定当前 Executor/Pairing/Grant 下已批准的 TaskPin。结果正文读取 `allowResult` 和 Browser 的逐 Task `resultAllowed` 必须同时成立。
4. **Provider Admin**：仅运行于 Provider 自己的 `127.0.0.1` 的受信维护者操作；持有独立 `adminToken`，不能借 Browser 或外部 Client token 获得 Admin 权限。

**信任链**：`External Client→HTTPS Provider(固定 ClientScope)→目标 Executor/Pairing/Grant→Browser Task Resolver→Chrome Origin/Installer→唯一 RunHost/Authority/Worker→原 Run/Result/retirement→Provider receipt`。Provider 绝不存储、下发任意 Task 可执行源码或运行外部 Shell/CDP。

## 2. Provider HTTP 接口矩阵

以下对应 `scripts/cloud-control/provider.mjs` 的主干路由；均为 POST，`READ` 表示不能产生新的 Job/许可/持久副作用。原 WebSocket `/v1/events` 是独立升级路由，不计入 HTTP。

| Provider 路由 | 调用主体 | 类型 | 边界、回执和效果 |
|---|---|---|---|
| `/v1/pair` | 尚未配对的 Browser + 一次性配对码 | WRITE | 签发 ProviderId + Executor 凭据；不得覆盖活跃配对 |
| `/v1/revoke` | 已配对 Executor 的撤权恢复身份 | WRITE | 必须核对 revocationId；失效旧配对，不丢历史 |
| `/v1/unpair` | 已配对 Executor | WRITE | 撤销 Provider 配对与对应外部客户端 |
| `/v1/auth` | 已认证 Executor | WRITE | 短时 WSS ticket；不传 Task 内容 |
| `/v1/capabilities` | 已认证 Executor | WRITE | 上报当前 grantId + 固定 TaskPin 列表；拒绝旧 grant |
| `/v1/suspend` | 已认证 Executor | WRITE | 暂停本 grant 的新领取及新投递；保存 ACK |
| `/v1/claim` | 已认证 Executor | WRITE | 只领取 targetExecutor+Pairing+Grant+Task 匹配的 Job |
| `/v1/admission` | 已认证 Executor | WRITE | 绑定 Assignment、原 RunRef、Grant，签发有限 permit |
| `/v1/start-ticket` | 已认证 Executor，显式 v2 Job | WRITE | 原 Run 的唯一启动身份；challenge/原答复幂等，最多 5 秒首次窗口，不发第二张启动票 |
| `/v1/control-fence` | 已认证 Executor，显式 v2 Job | WRITE | 当前配对/Grant/代次/Cancel/租约重新核权；每 effect 独立 challenge，最多 2 秒，原 Journal 单次消费 |
| `/v1/renew` | 已认证 Executor | WRITE | 仅续当前有效授权租约，不复活旧 permit |
| `/v1/cancellation` | 已认证 Executor | READ | 只读本 Assignment 的取消/lease 状态 |
| `/v1/receipt` | 已认证 Executor | WRITE | 原 ResultId 作为 receiptKey，双模式隐私与幂等校验 |
| `/v1/reconcile` | 已认证 Executor | READ | 只返回当前配对归属 Assignment/receipt，不给网页正文 |
| `/v1/client-list` | 已认证 Executor（可信 Side Panel 代理） | READ | 当前 Executor/Pairing/Grant 的分页外部应用，不返回 Token |
| `/v1/client-grant` | 已认证 Executor（可信 Side Panel 代理） | WRITE | 固定 TaskPin、label、allowResult；单次返回 Token |
| `/v1/client-revoke` | 已认证 Executor（可信 Side Panel 代理） | WRITE | 仅撤销本 Executor/Pairing/Grant 下的 Client |
| `/v1/submit` | 受限外部 Client Token，仅 HTTPS | WRITE | 唯一 Job/归属、闭合参数、Origin、请求幂等、Client Task 白名单 |
| `/v1/job-status` | 受限外部 Client Token，仅 HTTPS | READ | 只能查自己 Job，默认仅状态与 receiptConfirmed，正文双授权 |
| `/admin/register` | 本机管理员 token，仅 127.0.0.1 | WRITE | 只登记校验过的 Manifest/固定摘要，不收源码 |
| `/admin/executors` | 本机管理员 token，仅 127.0.0.1 | READ | 列出已配对 Executor 受限元数据 |
| `/admin/client-grant` | 本机管理员 token，仅 127.0.0.1 | WRITE | 为指定 Executor grant 精确 TaskPin Client |
| `/admin/client-revoke` | 本机管理员 token，仅 127.0.0.1 | WRITE | 按 ClientId 撤销 |
| `/admin/clients` | 本机管理员 token，仅 127.0.0.1 | READ | 后台只读 Client 状态，不能向 Browser 普通 UI 暴露 Admin token |
| `/admin/tasks` | 本机管理员 token，仅 127.0.0.1 | READ | 返回固定 Task Registry 摘要 |
| `/admin/seed` | 本机管理员 token，仅 127.0.0.1 | WRITE | 本机演示 Job，目标 Executor 显式绑定；无默认任意浏览器 |
| `/admin/cancel` | 本机管理员 token，仅 127.0.0.1 | WRITE | 取消指定 Job；已执行副作用不能伪装未发生 |
| `/admin/fault` | 本机管理员 token，仅 127.0.0.1 | WRITE | 仅有限测试故障注入，生产部署须明确隔离 |
| `/admin/state` | 本机管理员 token，仅 127.0.0.1 | READ | 受信运维完整状态，禁止经公开 HTTPS 转发 |

**重要**：浏览器用户每天使用的是 Side Panel UI，并不被要求执行这些 URL 或输入管理员 token。外部 Client 只能访问经授权的 HTTPS `/v1/submit` 与 `/v1/job-status`，不能从 Admin 或 Browser Executor 路由绕过约束。可选 TLS listener 仍是同一个 Provider；Admin 在公开 listener 上统一拒绝。

## 3. 原 Host/Side Panel RPC：10 项 + 一个 Observer-only

`src/platform/host/{authority,broker,client}.js` 已定义真实可信 Side Panel 方法：

- 01. `cloudStatus`：当前配对、授权、连接、槽与少量可信历史状态；不提供 Provider credential
- 02. `cloudPair`：用户明确输入 URL、Provider 身份和一次性配对码
- 03. `cloudApprove`：固定多个本地已安装 Task 身份与逐任务结果正文许可
- 04. `cloudStop`：本地即时 revoke/fence，远端 suspend ACK 可能 pending
- 05. `cloudUnpair`：保持本地 Stop，必须完成 Provider 配对撤销或保留待恢复状态
- 06. `cloudClients`：分页列出当前配对与 Cloud Grant 下的受限外部 Client
- 07. `cloudClientGrant`：为指定已批准 Task 颁发一次性外部 Client token
- 08. `cloudClientRevoke`：由受信 Side Panel 撤销已批准 Client
- 09. `cloudNext`：唯一受信 RunHost 所属的任务领取；手动状态刷新不可调用
- 10. `cloudResolve`：安装版本、Generation、SiteOrigin 与原 Run 的固定准入复核

`cloudObserve` 为**只读扩展控制台**，只通过 `requireCloudConsoleSender` 的脱敏通道运行；绝对不能拥有 `cloudClientGrant`、`cloudApprove`、`cloudNext`、`cloudResolve` 等执行/审批能力。真实 Side Panel 路由通过 `requireCloudSidePanelSender` 限制；一般页面/远端客户端不能伪造 Chrome Sender。

## 4. Provider 与 Browser 原状态机

```text
外部 submit（Client scope + TaskPin + Params + Origin + ExecutorGrant 全合法）
  -> Provider queued（原 requestKey/digest 幂等）
  -> Executor claim => assigned（固定 Assignment + Executor/Pairing/Grant）
  -> Browser Task Resolver / Installer / Chrome Site Grant 再校验
  -> 原 RunHost 绑定原 RunId/ResultId
  -> Provider admission => admitted + 固定 permit
  -> 原 Worker 执行网页操作
  -> 原 Run/Result durable + retirement released
  -> Browser reconcile => Provider receipt（status-only 或双重同意 full）
  -> Provider received / Browser finished
```

异常只有保守变化：`cancelled`、`cancellation-pending`、`OUTCOME_UNKNOWN`、`suspended`、`revoked`。**不确定网页副作用时绝不因为租约、重启、重复 requestKey、回执丢失或新的 Browser Client 登录而自动重新投递**。已持久确认的原 Result/receipt 不被晚到 Stop 覆盖。

## 5. 身份与结果正文最小化合同

- Job 接收归属：`ProviderId + targetExecutorId + targetPairingId + pairingGeneration + targetGrantId + immutable TaskPin`，再由 `JobId/AssignmentId/attemptEpoch/claimId` 唯一绑定原 Run。历史旧 Job 未知归属时隔离，不自动分派给安装同 Task 的另一个浏览器。
- 同 `requestKey` 同规范化入参返回原 JobId；相同 Key 的不同 Task/参数/Origin 冲突。外部 Client 的 Key 空间与浏览器主体隔离。
- Provider `/v1/receipt`：`receiptKey===原 ResultId`，`runRef` 和原固定源摘要一致；恶意尝试替换确认过的回执必须拒绝。
- `status-only`：只传 `{visibility:'status-only',state,retirementState:'released'}`，不传 `valueWire`、Cookie、URL、页面正文或错误正文；不会因此扩张用户 Cloud Grant。
- `full`：需要用户 Task 的 `resultAllowed=true`；外部 Client 查原结果还需它自己的 `allowResult=true`，两者均同意且原 Worker/Result/receipt 一致才能返回。
- Stop 的两阶段语义：浏览器本地 Stop 首先阻止新 Run；远端 `suspend` 成功才显示 Provider 已确认。离线 Stop 不等于远端已撤权。Unpair 需要额外远端凭据失效确认。

## 6. 合同和证据的优先顺序

1. **唯一执行事实**：实际源码 + 相同输入 SHA 的测试、CI、原始 Chrome/Provider 收据。
2. **接口/产品约束**：本文件、完整功能树及已有 R5.2 UI 39 项合同。
3. **实施路径**：[`cloud-control-r5.2-execution-manual.zh-CN.md`](../../framework/cloud-control-r5.2-execution-manual.zh-CN.md) 的 Gate 0–6，不重新选择 Provider/Host/SDK 架构。
4. **历史材料**：R1–R5.1 的原工作流、早期固定表单示例只能作为历史证据，不得覆盖其失败、把旧 PASS 当当前 Native PASS。

**最终质量**：最新 R5.2.4 Cloud 45/45 组件通过，但 Authority 105 项后 OOM，完整 CI FAIL、Package CI CANCELLED；更晚 Mock 修复须拿到新 SHA 的真实 CI。两独立 Task 原生 Chrome/远程公网/完整 Side Panel 原生仍 `NATIVE_PENDING` / `REMOTE_NATIVE_PENDING`。**不要填写虚假的 95 分或真实访问成功**。
