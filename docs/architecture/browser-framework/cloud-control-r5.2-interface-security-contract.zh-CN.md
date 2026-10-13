# Cloud Control R5.2 · 唯一接口、身份、权限和状态机合同

日期：2026-10-13。**本文件只冻结现有实现的接口/安全边界，不批准第二套架构**。源实现：`scripts/cloud-control/provider.mjs`、`src/cloud-control/{service,connection,history-index}.js`、`src/platform/host/{authority,broker,client}.js`。上位产品功能树 [完整目录](cloud-control-r5.2-complete-function-tree.zh-CN.md)，实施规则 [唯一执行手册](../../framework/cloud-control-r5.2-execution-manual.zh-CN.md)。

## 1. 四种主体不是一回事

1. **Browser Executor**：用户自己的 Chrome 扩展安装；身份受 `ProviderId / ExecutorId / PairingId / PairingGeneration` 约束。失效配对不能靠相同 Task 身份认领旧 Job。
2. **Cloud Grant**：用户 Side Panel 对一批**本地已验证、已安装、当前启用** Task 的附加远程执行授权；`GrantId` 每次重新批准变化。固定 `TaskId / Version / ManifestHash / SourceHash / InstallationId / Generation / SiteOrigins / paramsSchema`；Chrome Site Permission 与原 Authority 仍在准入前后检查。
3. **External Client**：用户或受信服务管理者委托给外部应用的独立 `ClientId + credential`；只绑定当前 Executor/Pairing/Grant 下已批准的 TaskPin。结果正文读取 `allowResult` 和 Browser 的逐 Task `resultAllowed` 必须同时成立。
4. **Provider Admin**：仅运行于 Provider 自己的 `127.0.0.1` 的受信维护者操作；持有独立 `adminToken`，不能借 Browser 或外部 Client token 获得 Admin 权限。

**信任链**：`External Client→HTTPS Provider(固定 ClientScope)→目标 Executor/Pairing/Grant→Browser Task Resolver→Chrome Origin/Installer→唯一 RunHost/Authority/Worker→原 Run/Result/retirement→Provider receipt`。Provider 绝不存储、下发任意 Task 可执行源码或运行外部 Shell/CDP。

## 2. Provider 实际 27 条 HTTP 接口矩阵

以下由当前 `scripts/cloud-control/provider.mjs` 的 `case` 路由抽取；均为 POST，`READ` 表示不能产生新的 Job/许可/持久副作用。原 WebSocket `/v1/events` 是独立升级路由（不计入 27 条 HTTP）。

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
