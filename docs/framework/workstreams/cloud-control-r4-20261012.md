# Cloud Control R4 · GitHub 源码增量与可信验收记录

日期：2026-10-12。本轮基线：`ede684f63b9576b7dc6afd1377a744b5204220e2`（项目仍有其他 Agent 持续推送 main；最终集成 SHA 请以 GitHub 记录和 workflow 绑定为准）。

## 本轮已发现的确切缺陷与变更

| 事项 | 原因 | R4 源码处理 | 当前验证等级 |
|---|---|---|---|
| 详细历史全表扫描 | 只返回少量 JSON，却先 `tx.all(frameworkKV)` | 同库派生时间/状态索引，原生有界 cursor | SOURCE_IMPLEMENTED，CI 待绑定 |
| Observer 过滤全表 | 状态过滤与计数发生在全量 `getAll` 后 | 持久按状态计数和页查询，不复制私密字段 | SOURCE_IMPLEMENTED，CI 待绑定 |
| 历史索引一致性 | request 状态多处分散写入 | `history.put(tx,row)` 同事务更新与回滚 | SOURCE_IMPLEMENTED，CI 待绑定 |
| 老历史迁移 | v2 无 Cloud 二级索引 | 已授权 Side Panel 原事务保护下懒迁移，Observer 不写 | SOURCE_IMPLEMENTED，NATIVE_PENDING |
| 已确认结果误撤销 | 历史状态字段可能不一致 | 确认 receipt + released Run 的 fence 扩展保护 | SOURCE_IMPLEMENTED，NATIVE_PENDING |
| Side Panel 关后长期执行 | CAS 模块 dormant，未在派发和 Run admission 检查 | 不开启、不能宣称已完成 | NOT_IMPLEMENTED |
| Cloud/local 计划单源幂等 | 当前 FireId 属本地计划 | 不重复实现调度器，不在本轮开云端计划 | NOT_IMPLEMENTED |

完整设计与限制：`docs/architecture/browser-framework/cloud-control-r4.zh-CN.md`。

## 不得覆盖的旧证据

- Cloud R1 `docs/framework/workstreams/cloud-control-r1.json` 的 pendingUnknownCase、真实 Run、Result、receipt 和历史失败事实全部保留。
- Cloud R3 的原组件 **201 PASS/0 FAIL** 仅绑定当时对应提交和包；例如 [R3 CI #38251928449](https://github.com/shopable-ai/opendesk-browser/actions/runs/38251928449)。并不等同于本次最新构建。
- Scheduled Tasks R1 已有 Linux CFT 成功、macOS 原生失败与待验收项继续引用原记录，不改旧判定。
- `src/cloud-control/host-owner-lease.js` 仍 dormant。不能因为该文件有单元测试，就声称 Side Panel/Runner handoff 或挂机验收成功。

## 本轮新增测试入口

- `node --test tests/cloud-control/history-index.test.mjs`：迁移、隐私投影、计数、原子回滚、Quota 故障、100/1000/10000 条受限查询。
- `npm run test:cloud`：包含 Provider HTTP/WebSocket、HostOwnerLease 和新增测试。
- `node --test tests/framework/k3-controller-authority.test.mjs`：Cloud Authority/Run/Result/Stop 以及其他 Controller 回归。
- `node --test tests/environment/cloud-control-console-r3.test.mjs` / `cloud-hosting-r3.test.mjs`：Observer 只读与 Side Panel。
- `npm run check && npm run build && npm run build:dev && npm run verify`：真正包身份与构建。

测试输出、通过/失败数量、精确生产和开发 packageHash，**只在真实对应提交 workflow 运行结束后补录**；不预写 PASS。

## 专家十项验收状态

| 独立维度 | 状态 |
|---|---|
| 1 总体架构/职责边界 | SOURCE_CONFIRMED，NOT_VERIFIED |
| 2 权限/数据安全 | COMPONENT_TESTED 待 CI，NATIVE_PENDING |
| 3 云任务可靠性/幂等 | Gate 4 NATIVE_PENDING |
| 4 Side Panel UI/UX | R3 旧证据，R4 NATIVE_PENDING |
| 5 独立控制台 UI/UX | R3 旧证据，R4 NATIVE_PENDING |
| 6 响应式/无障碍 | NATIVE_PENDING |
| 7 性能/资源 | 组件只验证 bounded cursor API，真实 10k NATIVE_PENDING |
| 8 自动化覆盖 | CI 待验 |
| 9 Chrome 验收证据 | NATIVE_PENDING |
| 10 长期运行/恢复 | NOT_IMPLEMENTED / NATIVE_PENDING |

所有项目以 **≥95/100** 为正式验收目标；没有原生/安全证据就标记 `NOT_VERIFIED`，不造分数。

## 后续安全顺序

1. 逐项查看同 SHA GitHub Actions，修复失败，记录包哈希；不可用旧通过结果顶替。
2. 在可访问 Mac 的独占 Chrome Profile 中执行 Gate 4 的副作用未知场景、真实运行中 Stop、撤权、Provider 掉线/回复/重启、IDB Quota 和 10k 计数/内存。
3. 实现经过 native Chrome sender 验证的单一 HostOwnerLease，在 cloudNext/Resolve、Run admission、Worker 前真正 fence，原 Slot/Authority/permit 仍必需；未完成严禁เปิด启。
4. 协调 Scheduled FireId 的 source/generation CAS，并在真实 local alarm 与 cloud notification 并发时证明不双执行。
5. 仅在 1h/24h/72h 真实连续性、独立控制台 UI/UX 和包验收后考虑发布。

