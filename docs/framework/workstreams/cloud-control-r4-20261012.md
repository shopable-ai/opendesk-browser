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


## R4.1 · 同提交 Cloud CI 真实回执（2026-10-12）

- 源码与组件验证候选：`9bf50e73a2780402da81cac14466b85ffe36c980`。
- [GitHub Actions Cloud R3 compatible workflow #38258950806](https://github.com/shopable-ai/opendesk-browser/actions/runs/38258950806)：`cloud-r3-component=success`，合计 **212 PASS / 0 FAIL**；`cloud-r3-package=success`，`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 全部实际成功。
- Production `packageHash=3d2f3031376e1fc7c136bb4e60182824b377f933b395a4f412f73fe5b239fdfd`。
- Development `packageHash=23ed7262d092e29c903e175c837d669ced84aa0be06ac55780131549d35d3e0b`。
- 首次源码提交 `eeb6b43bf498` 的 CI #38258751196 曾出现 **1 个新增测试断言 FAIL**：100 条数据只有 85 条 waiting，测试从 offset=80 却错误要求完整 20 条；随后 `9bf50e7` 修正测试偏移并通过，**失败和修复事实均保留**。
- 以上仅证明当时打包源码、组件和构建；不证明 IndexedDB 真正 Chrome 原生分页或用户 Mac Gate 4。

下一步新增只跑隔离 Linux Chrome for Testing 的 `.github/workflows/cloud-control-r4-idb.yml` 与 `tests/cloud-control/native-idb-index-r4.mjs`：实际 IndexedDB v2 游标、三种数据量、事务中断回滚、耗时与响应字节。该测试使用临时合成记录，只能作为 **NATIVE_IDB_COMPONENT**，不能提升为用户 Mac 的正式 Chrome 云控执行验收。此段添加时该工作流还未产生实际结果，保持 `NATIVE_PENDING`。

## R4.2 · 原结果缺失与历史恢复补充（2026-10-12）

- [提交 a565b1b9](https://github.com/shopable-ai/opendesk-browser/commit/a565b1b9f0c485ee1e1e3125bf168445b8868128) 首次把原 Run、Result、源码摘要和资源释放身份联合核验接入 Cloud fence。该 SHA 的 [CI #38263397120](https://github.com/shopable-ai/opendesk-browser/actions/runs/38263397120) Cloud 组件 **217 PASS / 0 FAIL**；production build **FAIL**：`native-agent/workspace.html` 的 Unsafe HTML attributes；development build 和 verify 跳过。其父提交同一构建门禁也失败；不把代码组件 PASS 升级为包验收。
- [真实 Linux Chrome IndexedDB CI #38260781397](https://github.com/shopable-ai/opendesk-browser/actions/runs/38260781397)，固定源码 `658269e38ad20b879d2f7efccbfab8de901aebb9`，Chrome 155，IDB v2。原生 100/1,000/10,000 条迁移耗时依次 93.5/470.3/5103.2ms；分页 12.5/5/5.2ms；每页 20 条、2.1 KiB 左右；原生 scan 调用各一次、全量 clone 调用均为 0，真实事务回滚均 PASS。仅 `NATIVE_IDB_COMPONENT_VERIFIED`，不是已安装扩展 Gate 4，不代表 Mac Chrome 或 24/72h 挂机 PASS。
- 第二次 P0 增量：`fence` 的原 cloud request 具有 runId 但原 Run 缺失，或已释放 Run 无匹配 Result 时，统一保留 `OUTCOME_UNKNOWN`；旧的 `paused_unknown` 不被 Stop 降级；只有没有 Run 关联的 waiting 请求可以取消。保留原 requestId/RunId，不重放任何副作用。对应新增 5 个组件测试，最终测试等级须等固定提交的 CI 核实。
- `HostOwnerLease` 仍 dormant；可见云 Runner、Cloud/local 计划跨来源 FireId 单源持久 CAS、原生 Stop/撤权/副作用后恢复和 1h/24h/72h 验收仍 `NOT_IMPLEMENTED` 或 `NATIVE_PENDING`，不得开放持续云控开关。
