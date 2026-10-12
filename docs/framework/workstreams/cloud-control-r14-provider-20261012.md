# Cloud Control R1.4 Provider 安全补齐 — 2026-10-12

负责人：本任务 executor；契约协调：主代理（Browser service / connection）。状态：COMPLETE（Provider 实施与定向组件验证）。

写入仅 `scripts/cloud-control/provider.mjs`、`tests/cloud-control/provider.test.mjs`、本记录。当前分支 main；不 branch/worktree/PR/commit，不访问 `.local`、现有服务或 Chrome。已读取 executor prompt、AGENTS.md、testing-guide 及主代理 R14 工作流；目标文件初始无 diff，其他 Agent 改动保留。

计划：
1. 配对身份补齐只迁移 legacy executor，不清空 credential、jobs、requests；为 assignment / permit / reconcile 添加完整配对和 attempt 绑定。
2. serial 内认证；持久 revoke 成功后撤销 tickets / sockets；重配对轮换 credential，拒绝旧配对消费。
3. 严格必填 body / runRef、requestId / hash / receiptKey 校验；renew 要求已签发 permit，assignment 与 current permit 同事务更新，历史 admission 快照保留。
4. HTTP / WebSocket / disk 负向测试及原 Provider 回归；仅独立系统临时目录、port 0，不占固定端口 / dist / profile。既有旧候选证据不提升为本修改 PASS。

通过条件：撤销/重配对/旧 attempt 不可绕过；残缺 runRef 和无许可续租均拒绝；持久化失败零已发布撤销效果；成功续租磁盘与 reconcile 同步；旧持久历史保留；原测试通过。

## 已实施 API

- `pair` 返回 `{providerId, executorId, pairingId, pairingGeneration, credential}`；每次成功显式配对均轮换 credential / pairing UUID，generation 从 1 起递增。`auth` 返回 `{providerId, executorId, pairingId, pairingGeneration, ticket, expiresAt}`；同一当前配对跨 auth / restart 保持身份。
- 新 assignment、permit 和 reconcile 的每个 assignment 均有完整 `{providerId, executorId, pairingId, pairingGeneration, attemptEpoch, claimId, jobId, assignmentId}`，每 Job 仅 attemptEpoch=1，不重新分配。reconcile 顶层还带当前配对身份；permit 保留 permitId / runRef / leaseUntil。
- `POST /v1/revoke` body `{revocationId, pairingId?, pairingGeneration?}`，返回 `{providerId, pairingId, pairingGeneration, revocationId, revoked:true}`。serial 内验证当前 credential；持久化后才清除 tickets / sockets；被撤销 token 仅能重试同 revocation，其余受认证端点拒绝。重配对后旧 token 连同其撤销重试资格失效。
- admission / renew / cancellation / receipt 保持原必填字段，额外支持上述身份字段逐项可选，或完整 `binding` 对象；attemptEpoch 的 0、2、字符串及残缺现代持久身份均拒绝。body 不带 binding 时，仍通过 credential + 当前 assignment 校验配对，不能跨 generation。renew 返回结构保持 `{leaseUntil}`。
- runRef 六字段必填非空字符串，requestId 必须 `cloud:<assignmentId>`，两项任务 hash 必须匹配，receiptKey 必须等于 resultId。renew 要求存在对应 permit；assignment/current permit lease 同事务落盘。admission 的 once 历史快照保持原签发 lease；reconcile 返回 current permit。已完成结果允许在租约过期后 receipt，不增加新的执行许可。
- legacy executor 只补配对身份和 legacy 身份标记，credential / jobs / requests 保留；旧 assignment、permit 与 claim / admission 幂等历史只供原 legacy 配对消费，重配对后继续保留但不可消费。
- 校验错误包括 E_SCHEMA / E_RUN_REF / E_TASK / E_BINDING / E_PAIRING / E_ATTEMPT / E_LEASE / E_ASSIGNMENT。认证为 HTTP 401，幂等冲突 409，其余拒绝 400。`admin/fault` 增加 revoke 回应丢失注入以验证落盘后的同撤销重试。

## 新鲜验证

`node --check scripts/cloud-control/provider.mjs`、`node --check tests/cloud-control/provider.test.mjs`、指定三文件 `git diff --check` 均 PASS。

`node --test tests/cloud-control/provider.test.mjs tests/cloud-control/connection.test.mjs`：11/11 PASS（Provider 9，connection 2；0 fail / cancelled / skipped）。包含原 Provider 2 项回归、必填 runRef 与 forged binding / old epoch / cross-executor 拒绝、renew 磁盘失败回滚和双 lease 一致性、revoke 磁盘失败及回应丢失、票据/socket 撤销时序、重启与重配对、legacy 完整历史保留、磁盘残缺现代 assignment / permit 及旧 epoch / 错误 runRef、同一真实 HTTP pipeline 排队期间的撤销拒绝。

验证输出直接由 Node 测试运行器读取；仅 `os.tmpdir()` 创建的独立系统临时目录与 port 0，清理由测试自身负责，无固定端口、现有服务、Chrome、dist、`.local` 访问。本轮不重复原生验收，不声称 Native / Browser 集成 / F3 / ZIP PASS。主代理可在 Browser 请求增加 pairing / attemptEpoch 后执行自己的集成验证；本任务未写 Browser 文件、共享 Git 状态或其他 Agent 文件。

验证绑定 SHA-256：

| 输入 | SHA-256 |
| --- | --- |
| scripts/cloud-control/provider.mjs | 76484917249810a36e96d5a00b85af4658354474ee60d937b472ad5b99f8209d |
| tests/cloud-control/provider.test.mjs | 99a4a6fe208e111ebc924284a79859705b0ce26be3bebfd520d29361daf8aeb4 |
| src/cloud-control/connection.js | 628f0a0127251f7d3943acf5619c11d89ea2e99c2e4bb8275dda82675b6b019e |
| src/platform/tasks/contract.js | d523c6313e963e7a7f618a49d1ce3412dc37290e38676fa75c7e57780fe293e9 |
| src/platform/protocol.js | be91db624627180e21e2a8b4d2ebe9f7ec3f1da8048d4aa236a23f56b552ad94 |
| examples/tasks/form-fill.v1.opendesk-task.json | 9e683a92be1285dbc86cd143e107e01a63ed8850faffe729dd9af281a1eb2df0 |
