# OpenDesk Browser Scheduled Tasks R2 · 产品化与验收记录

日期：2026-10-13。目标仓库 `shopable-ai/opendesk-browser`，唯一写入分支 `main`。

> 本文件是 R2 增量追踪，不取代 R1 历史证据。GitHub Actions 的某个过去 SHA PASS 不等于未来候选或用户真实 Mac Profile PASS。仓库可以经 GitHub 连接器操作，本会话无法访问用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser` 目录。

## 继承的 R1 可信候选

- 固定 SHA `7bd735259379478200b896223ecd5212b72ee163`
- Linux CFT baseline + lifecycle PASS：[38269870084](https://github.com/shopable-ai/opendesk-browser/actions/runs/38269870084)
- macOS CFT baseline PASS：[38269870147](https://github.com/shopable-ai/opendesk-browser/actions/runs/38269870147)
- 两个可见 Host 同 FireId 唯一领取、无 Host 进入 WAITING_HOST、重新打开 Side Panel 执行原 FireId、原 Run/Result 实际 DOM 效果与 `retirementState=released` 是已有真实证据。用户 Mac Profile 仍 NOT_TESTED。

## R2 任务树和提交

| 优先级 | 功能 | SHA | 源码/验收状态 |
| --- | --- | --- | --- |
| P0 | 独立运行页运行概览、中文优先、RunId 高级详情、现有侧栏不新增 Tab | `db579429` | SOURCE_IMPLEMENTED；Linux/macOS CFT baseline PASS，Linux lifecycle PASS |
| P0 | 已安装版本权限状态、URL/JSON/时间内联错误、固定版本保存前确认 | `e5b7c261` | SOURCE_IMPLEMENTED；Linux/macOS CFT PASS；新增组件测试曾有错误 |
| P0 | 修正组件断言、编辑过程防止异步竞态、表单取消浏览器原生校验提示 | `eff2406e` | SOURCE_IMPLEMENTED；组件/package + Linux/macOS CFT PASS |
| P1 | IDB 前缀游标、每计划初始最近20条、受鉴权历史分页 API | `7d64df4b` | SOURCE_IMPLEMENTED |
| P1 | 历史按需加载、135 条 Fire 定向回归和 API UI 合同 | `f75fddf3` | SOURCE_IMPLEMENTED；组件/package + Linux/macOS CFT PASS |
| P1 | 完整 Chrome 关闭及受控同一 Profile 重启原生测试入口 | `6d7957ba` | TEST_IMPLEMENTED；测试通过前不得写 PASS |
| P1 | UNKNOWN、副作用防重放、授权身份及 Alarm 重建专项单元测试 | `cc6aff21` | TEST_IMPLEMENTED，待对应 CI 确认 |
| P2 | 用户本人 Mac Chrome Profile、多缩放、多屏宽/键盘和真实网站撤权 | — | NOT_TESTED |
| P1 | Fire 历史按审计策略压缩或安全清理、长期大量记录响应时延基准 | — | NOT_IMPLEMENTED |

## 源码影响范围

- UI：`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/tool-shell.js`、`src/ui/scheduled-task-workbench.js`。
- 调度数据与受限 RPC：`src/platform/tasks/schedule-repository.js`、`schedule-service.js`；仅向原 `src/platform/host/authority.js`、`broker.js` 增加 `listScheduleHistory` 白名单路由。
- 测试：`tests/environment/scheduled-task-ui-r1.test.mjs`、`scheduled-tasks-r1.test.mjs`、`tests/framework/scheduled-tasks-r1-native-mac.test.mjs`，以及独立新增 `.github/workflows/scheduled-tasks-r2.yml`。
- 本次不重建 Controller、Cloud Control、Time Review、Task 作者验证、RunHost/Worker 或原 `runs/@slot`。

## 已知证据 URL

- [`db579429` 组件、生产/开发构建及包验证 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38276990569)
- [`db579429` Linux CFT baseline + lifecycle PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38276990574)
- [`db579429` macOS CFT baseline PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38276990893)
- [`eff2406e` 组件与包验证 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38278206008)
- [`eff2406e` Linux CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38278206091)
- [`eff2406e` macOS CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38278206077)
- [`f75fddf3` 组件/package PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279057885)
- [`f75fddf3` Linux CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279057784)
- [`f75fddf3` macOS CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279057771)
- [`6d7957ba` 独立 Chrome 整进程重启验收](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279452373)（仅通过后才可视为 PASS）
- [`e5b7c261` 组件断言失败历史，不能抹除](https://github.com/shopable-ai/opendesk-browser/actions/runs/38277470519)

## 未完成及验收闸门

1. 独立 Chrome 完整重启测试必须严格确认进程 PID 变化、同一临时 Profile、持久计划与 Alarm、重新打开真实合法可见 RunHost、新网页 DOM 原生效果、原/新 FireId 与 Run/Result 幂等、释放资源；其中任一步失败则结果 FAIL，不得更改为 SUCCESS。
2. 真实 Chrome 网站访问权限撤销、Task 安装更新和 generation/hash 修改尚需专用原生案例；Node fake 测试不能替代。
3. `frameworkKV` 中 Fire 历史仍可能长年增长，R2 首先实现索引式读取与分页，**没有执行自动删除**，不得因此宣称数据保留策略完成。
4. 320/360/420 宽度及 Chrome 125/150/200% 实际缩放、中文长名称/长 URL、键盘与可访问性专项截图尚需验收，不得给虚构的独立 95 分。
5. 用户本人 macOS Chrome Profile 不可访问；与 GitHub runner 的全新临时 Profile 是不同安全和功能验收项。
6. 不使用 `--no-sandbox` 作为 Chrome 沙盒安全合格证据；Linux CFT 的 AppArmor 沙盒例外仅适用于隔离 CI。

## R2 独立质量评定（保守）

视觉、信息架构、交互、功能完整性、长期可靠性、异常与恢复、可访问性、规模性能、权限安全和用户 Mac 原生验收都不能因一次 CI PASS 自动评分 95。缺专项证据时保持 `NOT_TESTED` 或 `PARTIALLY_TESTED`；不计算平均分绕过某一项未达标。

## R2.1 继续实施：已提交源码与候选证据（2026-10-13）

本节为当前进度增量，旧 R1/R2 SHA 的 PASS、FAIL、CANCELLED 原样保留；不能以新的候选替换旧的截图或原始证据。

| 范围 | SHA | 当前独立结论 |
| --- | --- | --- |
| 整 Chrome 关闭、同受控 Profile 重启、恢复 Alarm 与网页真实操作 | `ced30ab3` | Linux + macOS CFT **PASS**，[CI 38280457204](https://github.com/shopable-ai/opendesk-browser/actions/runs/38280457204) |
| 原生 Host 完成回执丢失：保留原 Run 归属并清除过期 Stop UI | `25eed755` | SOURCE_IMPLEMENTED；组件/package [PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38284962462)，Linux 基础 [PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38284962402)，macOS 基础 [PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38284962233)；同候选整 Chrome 重启另外核验 |
| 待处理 Fire 派生索引：长期历史从调度热路径中剥离 | `594a089e` | SOURCE_IMPLEMENTED；组件/package [PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38285360759)，Linux 基础 [PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38285360696)；重启候选 [FAIL](https://github.com/shopable-ai/opendesk-browser/actions/runs/38285360764)，失败点在目录页 CDP 重定向，尚不能计 PASS |
| Chrome 网站权限在目标网页探测前明确预检并标记需要处理 | `c6b36e12` | SOURCE_IMPLEMENTED，运行/原生证据随对应 CI 核对 |
| 修正重启原生测试的 Chrome 扩展目录 URL 重定向竞态 | `30f304a7` | TEST_IMPLEMENTED，不能将修复提交视为重启已 PASS；[CI 38285912024](https://github.com/shopable-ai/opendesk-browser/actions/runs/38285912024) |
| 真实 Chrome 设置 Site Access 撤销与恢复，网页无副作用 | `04d29694` | TEST_IMPLEMENTED，Linux/macOS 独立新工作流 [CI 38286386885](https://github.com/shopable-ai/opendesk-browser/actions/runs/38286386885)；通过前 **NOT_VERIFIED** |

### 待处理 Fire 索引合同

- 原 Fire 记录继续保存在 `frameworkKV` 的 `schedule:fire:v1:` 命名空间，保留历史分页和原 Run/Result 审计身份；不移动数据到第二套数据库。
- 新增同一 KV 内的轻量 `schedule:pending:v1:` 指针及 `schedule:pending-index:v1:` 迁移标记：首次对账重建已有未结算、未准入的 WAITING/READY 指针，之后 `reconcile/ready` 只对待处理指针做精确 Fire 读取。计划编辑代次变化、宿主关闭、到期、取消、`UNKNOWN`、`ADMITTED` 均按原状态机结算并去掉已不能准入的指针。原 `FireId`、安装授权、`runs/@slot` 原子准入保持不变。
- 原有历史仍通过 `schedule:fire:v1:` 分页读取；不会为了缩减数据量自动删除 `UNKNOWN`、`ADMITTED`、含 Run/Result 的 Fire、尚未退休任务。**历史安全删除/墓碑/合规保留期限仍 NOT_IMPLEMENTED**，不能宣称存储容量问题完全关闭。
- 一次性迁移需要扫描旧 Fire 记录；这是受控迁移成本，不是周期性对账成本。已增加千条旧历史及遗留 `WAITING_HOST` 的单元测试，尚需更大规模真实 IDB 用时证据。

### 真实权限撤销验证合同

- `SCHEDULE_NATIVE_PERMISSIONS=1` 的测试只使用 Chrome 扩展设置自己的 Site Access 控件，通过 CDP 真实指针和 Mac PID 绑定键盘/Windows 模式下键盘操作；不在网页或扩展 Console 赋值 DOM，不直接调用 `permissions.remove/request` 作弊，不伪造 FireId/Run/Result。
- 在真实网页清空历史效果、原计划恢复待执行之后撤销站点访问，检查 Chrome 的真实授权状态、计划「需要处理」UI、下一 Fire 无 Controller Run、目标网页仍无提交；随后通过同一 Chrome 设置恢复。任何权限设置不生效或 UI 控件不可操作均记为 FAIL/BLOCKED，而不是伪造 PASS。
- 这项专项的原生 CI 与用户自己 Mac Profile 是两种独立验收，后者仍 NOT_TESTED。

### 剩余风险与后续优先级

1. 等待最新候选的 Linux/macOS restart + 网站撤权 CI 真正完成，检查候选 SHA 与 package hash 一致；修复真实缺陷而不是重试同样环境。
2. 任务版本更新、停用、卸载及安装 generation 变化有组件覆盖，真实 Chrome UI/Authority 测试仍需扩展；不可将组件证据升级为原生 PASS。
3. Chrome 125%/150%/200% 真正浏览器缩放、实体 Side Panel 320/360/420px 宽度、键盘焦点、长 URL、超大历史性能和未知外部副作用故障注入仍未完成完整逐项 95 分正式验收。
4. 若多 Agent 修改 `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`，提交前必须重新核对文件 SHA、原始 HEAD 与其他 Agent 的改动；本轮不覆盖并行测试驱动。

## R2.2 增量证据与功能状态

| 项目 | 提交 / CI | 结论 |
| --- | --- | --- |
| 浏览器整进程重启、同一隔离 Profile 恢复及真实网页效果复验 | `30f304a7` / [38285912024](https://github.com/shopable-ai/opendesk-browser/actions/runs/38285912024) | Linux/macOS Chrome **PASS** |
| 待处理 Fire 索引与千条历史迁移/原 FireId 复用 | `594a089e` / [38285360759](https://github.com/shopable-ai/opendesk-browser/actions/runs/38285360759) | 组件和构建 PASS；原生单独核验，不借旧包升级结论 |
| 原生 Chrome 站点访问撤销、拒绝运行与恢复 | `04d29694` / [38286386885](https://github.com/shopable-ai/opendesk-browser/actions/runs/38286386885) | Linux CFT **PASS**：Chrome WebUI ON_ALL_SITES→ON_CLICK，下一 Fire NEEDS_ATTENTION、Run=0、网页无动作，原成功 Run=1，手动恢复后旧 Fire 不重放；macOS CI 独立待核对 |
| 原 Host 已启动但完成回执丢失 | `25eed755` / [38284962462](https://github.com/shopable-ai/opendesk-browser/actions/runs/38284962462) | 组件 PASS，保留原 Run/Result，清除不再有效的 Stop UI；原生故障注入尚缺 |
| 当前授权正常但历史最近一次 NEEDS_ATTENTION 时状态误报 | `b59d897b`、`a77b121c` | 已修源码和 UI 合同测试；历史详情仍保留失败事实，等待同候选 CI |
| Task 经真实 UI 停用、启用、授权 generation 旋转和卸载，旧计划不自动重绑 | `802c30de` / [R2 Task Identity 工作流](https://github.com/shopable-ai/opendesk-browser/actions/workflows/scheduled-tasks-r2-task-identity.yml) | TEST_IMPLEMENTED，Linux/macOS CFT **NOT_YET_VERIFIED** |

保留原始失败记录：`594a089e` 的整 Chrome 重启 CI [38285360764](https://github.com/shopable-ai/opendesk-browser/actions/runs/38285360764) 是 **FAIL**，重启后扩展目录页 canonical URL 重定向期间只读 DevTools 会话失效。测试驱动在 `30f304a7` 明确增加等待，并由新的双平台真实 Chrome PASS 关闭该具体测试竞态，**没有因此宣称其他权限/浏览器 Profile 场景都 PASS**。

当前 R2 仍有独立未关闭项：长期历史按审计约束的合规保留/清理策略、数万 Fire 真实 IndexedDB 持续使用时延、用户自己的 macOS Chrome Profile、浏览器真实 200% 缩放（不同于 CDP viewport emulation）、真实 Worker 故障时的未知网页副作用判定，以及全部体验维度分别达到 95 分。上述没有完整证据的维度继续 **NOT_TESTED / NOT_SCORED**。

## R2.3 最新证据校正（2026-10-13，后于上方历史快照）

> 本段仅更新已经获得的结果；保留上文原来的待测、失败和已关闭前的阶段记录，不改写旧 CI。下一轮以这份证据校正及现场的最新 HEAD 为准。

- **最近一次完整定时任务回归候选：** `bc6dc46aa17f56006010ac27af8484a6eaf96f70`。同 SHA 的组件及生产/开发构建 [38352072072](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072072) **PASS**，Linux Chrome baseline + lifecycle [38352072052](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072052) **PASS**，macOS Chrome baseline [38352071965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352071965) **PASS**，完整 Chrome 进程退出/同一隔离 Profile 重启 Linux+macOS [38352072059](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072059) **PASS**。
- **真实 Chrome 网站访问权限撤销与恢复：** `743a67bd01404490aa6e1ba4c35ab60eba8806ea` 的 [38287719781](https://github.com/shopable-ai/opendesk-browser/actions/runs/38287719781)，**Linux PASS / macOS PASS**。Chrome WebUI 本身调整网站访问，旧 Fire 不重放，原审计保留。
- **固定 Task 身份变化：** 同候选 [38287719921](https://github.com/shopable-ai/opendesk-browser/actions/runs/38287719921)，**Linux PASS / macOS PASS**：真实 UI 停用、重新启用、generation 旋转、卸载；计划不会自动换绑新身份，旧 Run/Result 保留。
- **真实 UI 尺寸：** 存在受控 Chrome viewport 模拟验证入口（`SCHEDULE_NATIVE_VIEWPORT=1`），但它不是 Chrome 真正 200% 缩放，也不能替代用户自己 Mac 的实际 Side Panel 尺寸与辅助功能验收；这些仍 **NOT_TESTED**。
- **尚未正式关闭：** 大规模历史下的真实 IDB 延时与安全保留/清理，Worker/Host/网页副作用不确定时的原生故障注入全矩阵、同名新版 Task 哈希变化及多产品共用槽回归、完整可访问性与高倍率视觉、用户 Mac 独立 Profile。
- 本次核查 `main` 为 `bd3c476ed09e6ddca7b5b78fffd8e50fd63a99ad`；它比上述定时任务候选更新，最新差异未涉及 scheduled tasks 主要文件，但**不能把旧候选原生 PASS 无条件写成新 HEAD 的整体 Final PASS**。
- 下一轮执行提示词：[`goal-scheduled-tasks-r2.3-final-20261013.zh-CN.md`](../prompts/goal-scheduled-tasks-r2.3-final-20261013.zh-CN.md)。

### R2.3 本轮源码加固与证据边界（2026-10-13）

- `schedule-repository.js` 统一在 `ready/admit/reconcile/recordWait` 排除已含 RunId 或 ResultId 的待执行 Fire；首次索引迁移及持续对账发现遗留的 `READY` + 已绑定身份时保留原身份并标记 `UNKNOWN`，禁止重新准入。`NEEDS_ATTENTION` 等终态不能被旧回调回退。
- `scheduled-task-host.js` 对已经发起 `host.start()` 但没有获得可信 RunId 的非 `E_OWNER` 错误执行保守 `E_EFFECT_UNKNOWN` 路径；Authority 若已绑定原 RunId 则不会被覆盖。没有生成第二个 Run 或伪造 Result。
- 第一次 pending index 迁移将历史扫描改为单页最多 256 条，避免一次在 JS 内物化所有历史；所有改动继续在原 `frameworkKV` 事务与 KV 索引内，且仍没有自动删除审计历史。**未取得 1000/10000/100000 真实 IndexedDB P50/P95 或迁移事务时延证据**，性能与保留期限均未正式关闭。
- 新增组件回归用例覆盖终态不可回退、遗留 Run 身份防重放、Host 发起后不确定应答。需核对对应固定提交的 GitHub CI 后才可升级到 `COMPONENT_TESTED`。
- 本轮**未**取得隔离 Chrome 原生故障注入、200% 真实缩放与用户 Mac Profile、Cloud Control/Time Review 共享槽矩阵的新证据；这些仍 `NOT_TESTED`，十项专家验收 `NOT_SCORED`，R2 暂不可标记 Final。

### R2.3 本地存储提示与可重复大规模性能专项

- **可见 UI：** 定时计划列表新增折叠的「本地运行记录与存储」，通过原扩展文档的 `navigator.storage.estimate()` *只读*读取浏览器给出的**整个 OpenDesk 扩展来源**使用量和配额（非 Scheduled Tasks 专属计量）。占用率 ≥80% 显示提醒，不提供可能破坏 UNKNOWN/Run/Result 审计证据的自动清理。若 Chrome 不支持估算，明确告知而不虚构数字。
- **压力原生专项：** `tests/framework/scheduled-tasks-r23-scale-browser.js`、`tests/framework/scheduled-tasks-r23-scale-native.test.mjs`、`.github/workflows/scheduled-tasks-r23-scale.yml`。在与生产扩展数据完全隔离的 HTTP origin + 临时 Chrome Profile 内，导入产品原 `createStorage` 和 `createScheduleRepository` 模块，写入 1k、10k、100k 条合成 `MISSED` 历史，并保留 5 个从未绑定 Run 的 `WAITING_HOST` Fire。测试重新构建派生索引、测迁移时间、深页历史和常规 list/history/reconcile/ready p50/p95，同时验证页面重新加载后原 pending FireId 没有变化。**这不是生产扩展原生的真实 Task 执行，不会合成 RunId/ResultId/网页副作用。**
- **第一次压力工作流 FAIL（保留记录）：** `86311c39` 的 [CI 38356321392](https://github.com/shopable-ai/opendesk-browser/actions/runs/38356321392)，Linux/macOS 在测试加载前因缺少 native launcher 依赖 `acorn` 失败；不能用于评价 IDB 性能。随后 `6b7bbb1a` 补充锁定依赖 `npm ci --ignore-scripts --no-audit --no-fund`，候选 [CI 38356507738](https://github.com/shopable-ai/opendesk-browser/actions/runs/38356507738) 需以实际结果核查。
- **回归：** `5a497985` 的 [Scheduled Tasks 组件/构建 CI 38355091731](https://github.com/shopable-ai/opendesk-browser/actions/runs/38355091731) PASS、[Linux Chrome 基础/生命周期 38355091653](https://github.com/shopable-ai/opendesk-browser/actions/runs/38355091653) PASS、[Cloud Control 组件与包 CI 38355091660](https://github.com/shopable-ai/opendesk-browser/actions/runs/38355091660) PASS；其他双平台及高倍率视觉以原生专项单独判定。
- **R2 Final 闸门：** 未验证用户 Mac Profile、Chrome 真正 125/150/200% 缩放、真实 Worker/Host 副作用竞态故障注入全矩阵和十项质量维度独立 ≥95；不得标记 Final。
