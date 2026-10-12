# Cloud Control R4 · 历史索引、可见宿主边界与可靠性收敛

日期：2026-10-12。起始远端源码审计：`ede684f63b9576b7dc6afd1377a744b5204220e2`。本文件是实施记录，**不等于 Mac Chrome 正式验收**。

## 一、沿用的唯一可信运行链

- Provider 只提交固定的已安装 Controller Task 指派，不提交源码、Shell 或 CDP。
- Side Panel 仍是唯一拥有云控管理和领取 RPC 权限的真实 Chrome Side Panel。
- 原 Authority → Controller Methods → RunHost / Worker → 原 `runs`、`results`、`commandJournal`、`runs/@slot`。
- 独立云控控制台严格 `cloudObserve` 只读；不能 `claim`、`start`、`approve` 或 `stop`。
- `tool.html?scheduledRunner=1` 已是本地计划的真实可见宿主，但**未获得云控执行权**。
- `src/cloud-control/host-owner-lease.js` 是未接入的 CAS 基础设施。R4 本次增量**没有开启持续云任务 Runner 或第二执行器**。

## 二、P1：在原 IndexedDB v2 实现真正的有限查询

原问题：`cloudStatus({includeRequests:true})` 与 `cloudObserve` 使用 `tx.all('frameworkKV')`，即使只返回 20 行，也需要克隆所有云历史记录和其他 KV 项。

本次采用**不升级 DB Schema、不建立第二数据库**的方案：
1. `src/platform/storage/idb.js` 的现有事务 API 新增 `keys`（原生 `openKeyCursor`）和 `scan`（原生 `openCursor`）；二者要求固定 prefix、整数 offset、数量上限、明确升降序。底层使用 `IDBKeyRange.bound` 和 `cursor.advance`，返回当前页对象，绝不先调用 `getAll()`。
2. `src/cloud-control/history-index.js` 在原 `frameworkKV` 写派生索引：
   - `cloud:history:v1:time:<namespace>:<createdAt>:<requestId>`
   - `cloud:history:v1:state:<namespace>:<state>:<createdAt>:<requestId>`
   - `cloud:history:v1:meta:<namespace>` 记录按状态分项计数。
   索引对象只保留 namespace、requestId、createdAt、状态；不复制凭据、目标 URL、参数、结果或 Task 源码。
3. 原 Cloud request 的所有创建/变更采用 `history.put(tx,row)`，在**同一个原事务**更新请求、索引及计数。事务 Quota、异常或中断将同时回滚，不出现“新状态、旧索引”。
4. 老版本实例由**已鉴权的 Side Panel** 首次详细状态读取触发一次 `ensure()`，在一个原 IDB 事务中增量遍历旧 request 主键、构建索引，最后写入 metadata 才视为成功；重复尝试读取 metadata 后直接结束。Observer 永远不写入或触发迁移。
5. metadata 尚未准备、原版本只读恢复或测试注入库不支持原生 cursor 时允许回退旧只读扫描；实际 v2 已成功迁移时必须走 `scan`，测试阻止退化为 `getAll`。
6. 原 `cloudStatus({includeRequests:false})` 和主键提示 `pendingRequestId` 的 2 秒热路径不增加索引扫描。
7. `offset` 通过原生 cursor.advance 跳过，**不是 O(1) 随机定位**；非常深的分页可在未来用 afterKey 游标替换。计数通过同事务维护，不全表计算。
8. 迁移容量安全上限：最多遍历 1,000,001 个原请求键，大于 1,000,000 时 fail closed；不自动删除任何历史数据、不清空 DB。大量旧数据仍需真实 Chrome 的 Quota、升级中断及内存验收。

## 三、P0 与本次修复边界

对已收到 Provider 回执且原 Run 资源释放的请求，取消/过期保护除 `state==='finished'` 外，亦接受真实持久 `delivery.state==='confirmed'`，避免陈旧投影误改确认结果。

**仍未关闭的 Gate 4 真实证据：** 原副作用后中断时保持同一 Run 并进入 `OUTCOME_UNKNOWN`；执行过程中的真实 Stop/cancelSeq/Worker/slot 释放；撤销网站许可、Task 禁用、托管停止、解除配对；许可回应丢失、Quota/IDB rollback、Provider receipt 丢失与重启。参考既有 `docs/framework/workstreams/cloud-control-r1.json`、R3 原生测试 GOAL。历史的已通过案例与未通过案例不被本次修改覆盖。

## 四、P2/P3 的安全结论

- 可见 Runner 与 Side Panel 的 `HostOwnerLease` 尚**未连接原云任务 claim→admission→Worker 的全链路 fence**，禁止打开持续云控模式，也没有扩展 Runner 管理权限。
- 原 Scheduled Tasks 的 FireId、Chrome alarms、持久发生记录、`scheduledRunner=1` 保持不变；云/本地计划的同源 generation/FireId 原子协调还没有完成，不能声称跨云单源幂等。
- 未来完成前必须同时核验 Chrome TAB / documentId 身份、CAS 原子性、原 Run slot、Task authorization、Provider permit、迟到 Host fence、Host 消失以及未知副作用不重放。

## 五、证据等级与发布门禁

- 本次新增组件用例包括 100/1,000/10,000 条历史的 key-range API 调用数量、响应体边界、状态计数、迁移中断及 Quota rollback，**这些是假事务组件验证，不是真实 Chrome 性能测试**。
- GitHub CI 需按本次提交 SHA 核对 `npm run test:cloud`、受影响 Controller 回归、`npm run check`、`build`、`build:dev`、`verify`。
- 真正 IDB 的 `100/1,000/10,000` 扫描量、耗时、内存、响应体、迁移 Quota/rollback，以及 300/360/420/520 px 与 125%/200% 的 UI 证据仍需原生 Chrome。
- 1h/24h/72h 连续性、真正的 visible Cloud Runner、跨云调度不能在缺少证据时给 PASS / ≥95 分。完整追踪见 `docs/framework/workstreams/cloud-control-r4-20261012.md`。
