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

## R2.7 正式 UI 生产同步（2026-10-13）

### 目标和实际变更

本轮直接更改 `main` 生产文件，不另建页面/调度器/Runner。参考唯一原型 `examples/ui/scheduled-tasks-r2.5-preview.html`，处理先前 R2.5 视觉预览与真正 `src/ui/tool.html` 页面不一致的问题。原设计中已存在的四部分表单、Task 固定身份、IANA 时区、内联字段错误、二阶段保存、计划列表/历史分页、已有可见 Host 都保留。发现 R1/R2.5/R2.6 在同一 `tool-shell.css` 叠加：原 `.schedule-form .od-field` 同时命中作为输入组件的 `input.od-field` / `select.od-field`，导致字体、布局和垂直排列相互干扰。修复为仅作用于 `label.od-field` 的容器布局，并恢复使用 R27/R20 的颜色及输入边框 Token。

真实更改：
- `src/ui/tool.html`：计划列表标题旁的唯一主操作「新建」，运行页为次要入口；创建表单增加目标 URL 帮助、没有可用安装任务时可执行的开发入口、执行时区摘要及按需展开的搜索/选择、醒目的下次执行区域、第五步检查提示；独立运行页将重点任务/时间提前，宿主与最近结果压缩为两项摘要，完整当前/下次状态折叠。
- `src/ui/scheduled-task-workbench.js`：运行视图和新建按钮随二级页面联动；在不修改已固定时区和任务身份的前提下，支持搜索折叠、时区名称摘要、编辑时保留原选择、下次执行时间动态提示、异常焦点定位、Escape 退回及无可用 Task 提示；`NEEDS_ATTENTION` 提供真实任务管理入口，原 `host.stop` / `saveSchedule` / `changeSchedule` 继续复用。
- `src/ui/tool-shell.css`：表单字段、输入/标签节奏、任务选择栏和 320px 窄宽度、时区摘要、时间重点框、运行页主次布局及折叠详情，全部作用域限定到原 Scheduled Tasks 页面，不新增第二套 Token。
- `examples/ui/scheduled-tasks-r2.5-preview.html`：**只更新原来的唯一 HTML**，同步可折叠时区选择和交互；该文件仍是固定样例/模拟，不是真正的安装或执行。
- `tests/environment/scheduled-task-ui-r1.test.mjs` 与 `tests/framework/scheduled-tasks-r23-native-zoom.test.mjs`：增加生产/原型一致性断言，并让现有 Chrome 真正 `tabs.setZoom` 测试通过真实点击展开时区再输入搜索，验证收起后值不变；不将 CDP viewport 误报为真实 Side Panel 宽度。

### R2.5 原型 / R2.7 生产 / 真正 Chrome 验收矩阵

| 页面或交互 | R2.5/R2.7 唯一原型 | R2.7 生产源码 | 最新提交真实 Chrome |
| --- | --- | --- | --- |
| 计划列表与主操作 | UI 模拟 | SOURCE_UPDATED：列表主动作移至标题，运行页次要化 | NATIVE_PENDING |
| 创建计划 | UI 模拟 | SOURCE_UPDATED：五段阅读节奏、字段与下一次执行卡 | NATIVE_PENDING |
| 编辑计划 | UI 模拟 | SOURCE_PRESERVED：原固定任务、时区、离开确认 | NATIVE_PENDING |
| 时区选择 | UI 模拟 | SOURCE_UPDATED：设备默认摘要、更改后才展开搜索与选择 | NATIVE_PENDING |
| 检查确认保存 | UI 模拟 | SOURCE_PRESERVED：两阶段、固定位置信息与修正焦点 | NATIVE_PENDING |
| 已安装任务管理 | UI 模拟 | SOURCE_UPDATED：无任务入口、NEEDS_ATTENTION 恢复入口 | NATIVE_PENDING |
| 历史记录 | UI 模拟 | SOURCE_PRESERVED：按需展开，每次20条分页与审计身份 | NATIVE_PENDING |
| 独立运行页 | UI 模拟 | SOURCE_UPDATED：单焦点优先，两项摘要、其他状态可展开 | NATIVE_PENDING |

### 本轮验证等级及明确未完成项

- **SOURCE_UPDATED**：代码经 GitHub 连接器直接写入 `main`，每次使用目标文件当前 blob SHA 写入；并行 Agent 的其他文件改动未重置、覆盖或强推。HTML 的 ID 唯一性、预览与生产 JavaScript 语法已在连接器返回源码中逐项检查通过；**语法检查不是 Node/Build/Chrome 验收。**
- **CI_PENDING / NATIVE_PENDING**：应基于最新固定 SHA 的 `Scheduled Tasks R1 component and package` 与 `Scheduled Tasks R2.3 genuine Chrome zoom & focus` GitHub Actions 检查 `npm run check` / `build` / `build:dev` / `verify`、R2.7 新断言以及 linux+macOS 浏览器执行。不能继承旧 SHA 的 PASS 来替代新修改。
- **用户 Mac Profile NOT_TESTED**：本会话无权访问用户本地 `/Users/shopme/Documents/workspace/opendesk-browser`，亦不能检查正在加载的扩展目录、旧缓存/重新加载状态；用户本机 Side Panel 320/360/420 CSS px、物理 Side Panel 与 125/150/200% Chrome 缩放矩阵仍须单独验收。真实 runner TAB `tabs.setZoom` 不等于实体 Side Panel 证据。
- **视觉截图 NOT_VERIFIED**：本轮未取得同场景“修改前真实 Chrome”“修改后原型”和“修改后真实 Mac Chrome 扩展”三套可核对的截图；若 CI 上传 `scheduled-r23-real-zoom` 也必须检查 SHA、Chrome version、包 fingerprint 与报告，不能只凭 artifact 名称写 PASS。
- **质量评分：NOT_SCORED**：没有完整实际浏览器视觉、可访问性、权限和安全回归证据之前，视觉设计、排版间距、信息层级、交互效率、表单体验、功能完整性、响应式、可访问性、安全正确性、Chrome 原生交付均不得填充人为的 95+ 分。
- **原底层安全不变**：没有触碰 `Chrome Alarms`、ScheduleService、FireId、Controller Authority、RunHost、共享槽、Run/Result、授权生命周期、历史存储与 `UNKNOWN` 不重放规则。

## R2.8 实际实施与分级验收（2026-10-13）

> **本节是本轮真实写入 GitHub `main` 的新增记录，不替换 R2.7 的结果，也不把源码合同测试等同于 Chrome Side Panel 视觉验收。** 多 Agent 正在写入同一分支；以下提交是本轮连续增量，最终 HEAD 必须另行核对。

### 直接修改的生产文件及回归

- [`acb114c`](https://github.com/shopable-ai/opendesk-browser/commit/acb114cb3c47bf9f81c12bc07d7969c7cbc41f17)：`src/ui/scheduled-task-workbench.js`，解决定时 Host 轮询期间计划列表反复整体重建导致已展开历史、手动分页、当前焦点与删除确认重置的问题。仅在计划/目录数据真的改变时更新卡片；按原 `FireId` 保留已加载分页、用新快照覆盖旧状态；恢复详情展开和键盘焦点；不创建其他 Run/Result。
- [`9039555`](https://github.com/shopable-ai/opendesk-browser/commit/9039555bbd0c57984b321abf9074ecf6d124e5cb)：`tests/environment/scheduled-task-ui-r1.test.mjs`，新增缓存 Fire 合并、状态更新、焦点与展开/分页回归，原期望无条件重渲染的旧断言被替换为刷新条件的严格断言。
- [`c6bc9db`](https://github.com/shopable-ai/opendesk-browser/commit/c6bc9dbc132b6c0182c09b587b78a365ecc17b44)：扩展历史加载的安全性；如果第一页与已缓存历史没有任何共同 Fire，认定出现翻页空洞并重置分页基线，禁止跳过中间记录。定时轮询不得清除当前的表单保存/权限错误。
- [`9da7516`](https://github.com/shopable-ai/opendesk-browser/commit/9da75164ae0ffc271aa9027e8257b69e8c28776d)：对应非重叠历史与持续可见表单错误的回归断言。
- [`025c951`](https://github.com/shopable-ai/opendesk-browser/commit/025c951651c72039ef9dd71cb1fc023b1c68e921) 和 [`f12ad4b`](https://github.com/shopable-ai/opendesk-browser/commit/f12ad4b93457fd0ecafdbea4528ec1aefc979e86)：`scripts/bundle-provenance.mjs` 针对实际上被 Time Review Native 静态源码使用的**仅两个**已审核第一方源码，限制其**仅能**进入现有 `ui/sidebar-tool-host.js`；同时用 Git Blob SHA-1 冻结 HTML 与 JS，源码变化、其他 examples/vendor 目录或其他目标 Bundle 仍拒绝，未禁用 WXT 模块扫描、npm 归属或固定 Bundle 大小限制。
- [`7b29f5f`](https://github.com/shopable-ai/opendesk-browser/commit/7b29f5f36398bf9f9872515919ce831635e62d5c)：`tests/environment/bundle-provenance.test.mjs` 新增严格固定来源的正反向安全测试。

冻结 Git Blob：`examples/sidebar-tools/time-review/src/index.html` = `fcaec7808b606c8f4484e20bd4c82a7d66e66fa5`；`examples/sidebar-tools/time-review/src/main.js` = `c0d8dc0ce6d42a0ff08ce8012dec3e66a2840ed0`。**这两个是 Git 对象哈希，不是 R2.8 最终构建产物的 SHA-256，也不是已加载 Chrome 扩展的 ID。** 变更这些源码时必须重新做受信任代码审核与显式更新 Pin；官方发布版本和运行时身份检查仍独立必需。

### 源码到正式 UI 的核对矩阵

| 功能 | R2.7 生产基线 | R2.8 验证或修复 | 原生 Chrome 实测 |
| --- | --- | --- | --- |
| 创建计划 5 段表单、R27/R20 间距、任务选择与 Icon 管理 | 有生产 HTML/CSS/JS 实现 | 读取最新主分支并确认代码存在；未重新制造原型 | `NATIVE_PENDING` |
| 设备时区摘要、更改后展开、搜索不自动变更、编辑保持原值 | 有生产实现 | 保留单一 IANA 调度函数及原授权保存链 | `NATIVE_PENDING` |
| 次执行预览、确认保存、错误定位及取消保护 | 有生产实现 | 修复周期性刷新清掉可见表单错误 | `NATIVE_PENDING` |
| 计划列表及历史分页 | 有原始分页、状态与更多操作 | 修复轮询丢失已展开页面、历史记录和焦点；无重叠分页不跳页 | `NATIVE_PENDING` |
| 独立运行页、当前/下次单焦点、合法 RunId 停止 | 有正式单一 Host | 原 Host、停止接口、Fire/Run/Result 均未修改 | `NATIVE_PENDING` |
| 正式 Bundle 来源 | R2.7 后跨工作流 Time Review 源码导致旧 CI 构建 FAIL | 精确两文件、唯一目标与源 Blob SHA 限定的来源修复 | `BUILD_PENDING` |
| 唯一原型 R2.5 与正式页面对照 | 唯一 `examples/ui/scheduled-tasks-r2.5-preview.html` | 本轮未制造第二份原型，不能用其截图代替正式 UI | `NOT_SCORED` |

### 真实 CI 与本地环境证据边界

- [`9039555` 的 Scheduled Tasks CI 38427348223](https://github.com/shopable-ai/opendesk-browser/actions/runs/38427348223)：`scheduled-components` 的 **Schedule UTC/DST 单元测试 PASS**、**定时计划与宿主 UI 源码合同 PASS**；`scheduled-package` 的 `npm ci`、`npm run check` **PASS**。但其完整工作流为 **FAIL**：跨产品 `task-workbench.test.mjs` 的 R6 read-only source 案例失败；当时 `npm run build` 因固定 Bundle 来源检查失败、`build:dev` 和 `verify` 未运行。
- 历史 CI [38414821298](https://github.com/shopable-ai/opendesk-browser/actions/runs/38414821298)、[38414821888](https://github.com/shopable-ai/opendesk-browser/actions/runs/38414821888)、[38414821739](https://github.com/shopable-ai/opendesk-browser/actions/runs/38414821739) 不能以之前 QUEUED 状态代替实际运行结果；已有 Linux Job 均被真实构建失败阻断。必须按 SHA 再核对最新 CFT 重试及时间缩放工作流。
- 本会话通过 GitHub 连接器提交源文件，**无法访问用户 Mac 本地目录、`dist/development`、本机 Chrome Profile、实际扩展 ID 与 Side Panel 实体窗口**，因此本机 `npm run build`、`npm run build:dev`、`npm run verify` 不能标记已运行。CI 是另一隔离机器，不能代表用户机器的扩展加载身份。
- 320/360/420 CSS px、100/125/150/200% **真实 Chrome 页面缩放**、浅/深主题、真实焦点序列与长 URL/JSON 溢出矩阵、Chrome/截图版本及正式界面截图：`NATIVE_PENDING`。旧 R2.5 HTML 原型不能充当这些证据，CDP viewport 也不等于 Chrome 原生缩放。
- **专家十维评分：`NOT_SCORED`。** 本轮没有足够真实 Chrome、构建 hash 和生产 Profile 截图，不能填写或宣称 95/100。

### 尚未关闭的闸门

1. 以最新 `main` 的**同一 Git SHA**再跑 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 和 Scheduled Tasks 完整组件回归；如果仍失败必须保留真实日志并定位其归属。
2. 让最新真实 CFT Chrome 测试跑到页面交互及真正 `tabs.setZoom`，逐项核对视频/截图、`manifest`、产物 SHA 与运行环境，并确保原生 Case 没被旧构建掩盖。
3. 在用户 Mac 本地通过项目受控流程核验 `dist/development` 的新旧哈希、`chrome://extensions` 扩展 ID 和路径、`runtime.id` 与 Side Panel 身份，不覆盖用户 Profile、旧配对或其他 Agent watcher。
4. 创建/编辑/取消/安全权限、空状态、长输入、暗色与 320/360/420 × 真正缩放 100/125/150/200% 均需实际 Chrome 截图，才能对视觉与 Chrome Native 交付判定 95+。

### R2.8 生产构建实际转绿及 Chrome CI 脚本修复

- [Chrome 缩放候选 38428794161](https://github.com/shopable-ai/opendesk-browser/actions/runs/38428794161) 在 SHA `721e9f4d04719a5d358f1ea4e39559108350a874` 的 Linux 日志中，**实际 `npm run build` 输出 `"status":"passed"`**，`packageHash` = `b248ec7409318c61010da94494197a2ecdcf0d01ad4521385bdb4d0ef4caf677`，产物 95 个文件，生产总计约 3.58 MB。
- 该候选的 `ui/tool-shell.js` = **519,463 B**，硬限额 **524,288 B**，余量 **4,825 B**。这是需要持续监测的包大小风险，不应通过放宽硬限制掩盖；SW = 559,479 B，超过软性复核线但低于 1 MiB 硬限。
- 该 Linux Job 随后在 Chrome 阶段之前失败，**不是构建失败**，而是工作流调用不存在的 `npm run verify:package`。本轮 [`e259747`](https://github.com/shopable-ai/opendesk-browser/commit/e2597478c4d94bf8bfddf9b5d1b7a914d55440f5) 已将 `.github/workflows/scheduled-tasks-r23-native-zoom.yml` 的单生产包校验改为项目现有真实命令 `node scripts/verify-package.mjs dist/production`；Linux 之后的 `build:dev` 和双包 `verify` 保持原样。
- 修复后同 SHA 的**真实 Chrome** 与 macOS Matrix 尚需看完成结论及截图证据；上面成功的生产 `packageHash` 仅证明该 GitHub Linux 工作目录的生产包，**不是用户 Mac `dist/development` 的 hash，也不是实际 `chrome://extensions` 加载 ID**。

### R2.8 首次真实 Chrome 运行页失败定位（证据不代表通过）

- [真实 Chrome CI 38429089170](https://github.com/shopable-ai/opendesk-browser/actions/runs/38429089170) 在 `e2597478c4d94bf8bfddf9b5d1b7a914d55440f5`：Linux 的生产构建/单包校验 **PASS**、R2.6 源码与时区/布局 34/34 **PASS**、开发构建 **PASS**、`npm run verify` **PASS**。
- 随后的 **真正 Chrome 运行页初始化测试 FAIL**：`actual dedicated scheduled runner displays its product dashboard not observed`，35 秒内未观察到 `data-opendesk-surface="scheduled-runner"` 与可见 `#scheduled-panel/#schedule-runner-view` 同时成立。由于初始化失败，未进行缩放和交互断言，**不得标记 Chrome 原生验收通过**。
- 本次 Linux CFT 真正启动的是 Chrome **155.0.8059.39**，独立临时 Profile 的扩展 ID **`jhajepcnohiplmafaiokjlcagcfjgaap`**；其生产包 `packageHash` **`b444f34994855c10abaa086d797249165a64c316301717ca1a9e0ae960155e26`**。这些身份来自 [CI 诊断 Artifact 11829643574](https://github.com/shopable-ai/opendesk-browser/actions/runs/38429089170/artifacts/11829643574)，不能冒充用户 Mac 正在加载的扩展 ID 或 `dist/development`。
- 失败 Artifact 中 **`screenshots=[]`、`zoom=[]`**，只有真实运行头信息和构建文件指纹；因此不存在可展示的“修改后 Chrome UI 截图”。
- [`ce51639`](https://github.com/shopable-ai/opendesk-browser/commit/ce51639f3c242284a9b51b6ab1dfdf09abfeb85b) 已为原始 Chrome 验收脚本追加**失败时的 CDP Console/异常、最终文档状态、真实截图**采集，不放宽最终断言、不用 DOM 注入点击代替用户操作。需读取后续 CI Artifact 明确故障是渲染入口、Tab/Side Panel 识别、Host 初始化还是浏览器环境；未取得诊断前不推测根因。

### R2.8 新版 CFT 已完成的局部证据与原生驱动故障定位

以下为 **`e64af0b8a42fd4ae02eeeedf50da5f23a52802ae` 同一候选** 的两个隔离 Linux Chrome CI Artifact；同 SHA + 同生产包指纹，但两条工作流最后均为 FAIL，不可升级为全量 PASS。

- 实际扩展：Chrome/155.0.8059.39，临时 CFT 扩展 ID `jhajepcnohiplmafaiokjlcagcfjgaap`；同候选生产 packageHash `438c690cd986d25283ba838718764c0dea6520a81128af74e5f7e8d3593be577`。这些都不是用户 Mac 的 `dist/development` 载入身份。
- [真实缩放及截图 Artifact 11831810584](https://github.com/shopable-ai/opendesk-browser/actions/runs/38431272799/artifacts/11831810584)：实际 `chrome.tabs.setZoom/getZoom` **1 / 1.25 / 1.5 / 2** 均取得原生数值；对应可见扩展运行页 CSS 视口宽度 **840 / 672 / 560 / 420px**，各 `scrollWidth` 对应 **840 / 672 / 560 / 420px**（无页面整体水平溢出），原始 PNG 共 4 张，原生日志确认键盘 Tab 从计划名称移向任务选择。此为 **局部 NATIVE_PASS**，不是实体 Side Panel 调整或全部视觉 95 分。
- 缩放 CI 最后 FAIL 的明确原因是 `tests/framework/scheduled-tasks-r23-native-zoom.test.mjs` 第 221 行 CDP 几何观察字符串有多余 `}`，在后续 220/300/320/360/420/... CSS viewport 模拟环节触发 `SyntaxError`，不是前四种真实 Chrome 缩放失败。[源码修复 `6f4839a`](https://github.com/shopable-ai/opendesk-browser/commit/6f4839ab55691c5f2a2a198bfdad0b51f63ce069)，后续整组 CSS viewport/交互仍须看新的原生 CI。
- [真实运行及截图 Artifact 11831920485](https://github.com/shopable-ai/opendesk-browser/actions/runs/38431272843/artifacts/11831920485)：已由**真实原生 Side Panel** 创建固定已安装 Controller Task 计划、实际注册 Chrome Alarm、打开独立 Runner、关闭 Side Panel，随后合法可见 Runner 驱动网页输入并得到 **真实完成且释放的 Run/Result**；网页实效回执 `{name:"Scheduled Native",done:true}`，保留原 FireId/RunId/ResultId。组件报告显示 `manualTaskVerification`、`verifiedInstallation`、`nativeScheduleCreation`、`chromeAlarmRegistered`、`dedicatedRunnerLayout`、`sidePanelClosedRunnerLive`、`actualScheduledNativeEffect` 均为 PASS。**但整进程重启恢复尚未到达，CI 最后仍 FAIL**。
- 上述运行 CI 后续失败于原生驱动的“暂停计划”步骤：生产代码 `renderPlans` 的第一枚按钮是“暂停/恢复”，第二枚是“编辑”，旧测试误点击 `button:nth-child(2)` 并等待 paused 状态。[`46f39b4`](https://github.com/shopable-ai/opendesk-browser/commit/46f39b4db9497d9df902f61c753652ab9357d27e) 已精准调整 **12 处计划卡片选择器**到 `.schedule-plan-actions button:first-child`，保留“已安装 Task 启停”管理区的第二按钮语义；[`bb57e3b`](https://github.com/shopable-ai/opendesk-browser/commit/bb57e3b2bb56d0a997aa08e123c4c51ad130b5af) 简化 Native Pause 文案核验。
- Linux 截图中缺少中文字体，出现方框，不属于 CSS 横向溢出证据；[`527e328`](https://github.com/shopable-ai/opendesk-browser/commit/527e328c0333947a7c8d5eb9c3e2c899cf414b8d) 与 [`349a64b`](https://github.com/shopable-ai/opendesk-browser/commit/349a64be5a36419a78770a1154a30db16a871fb0) 在两条原生 CI 添加 Linux Noto CJK 字体，用于真实中文视觉截图；[`be54027`](https://github.com/shopable-ai/opendesk-browser/commit/be540276b3d669daf213bbcd11a541fbea18e4d7) 与 [`594b35c`](https://github.com/shopable-ai/opendesk-browser/commit/594b35cb7aad6b07913f4176639f7a2d1913a259) 修正 fontconfig 断言命令。必须再次确认字体安装与截图真实可读。
- [Scheduled Tasks 组件/包 CI 38431272718](https://github.com/shopable-ai/opendesk-browser/actions/runs/38431272718) 的 `scheduled-package` **完整 PASS（check/build/build:dev/verify）**，`scheduled-components` 中定时专项 PASS 但跨域 `sidebar-product-contract` 的 Developer 面板旧 DOM class 断言 FAIL；不得归因于 Scheduled Tasks 的运行逻辑，也不得把整体 CI 填成 PASS。
- 因本轮还未得到 **最新修复同 SHA 的完整 Chrome CI**，目前生产真实 Mac Profile、Chrome 实体 Side Panel 320/360/420、跨倍数真实视觉、最后完整整进程重启和十项 `95+` 均保持 `NOT_TESTED` / `NOT_SCORED`。不要改动受信任 RunHost、Authority、FireId/RunId/ResultId 合同或降低测试标准来凑 PASS。

### R2.8 真实 Chrome 专项 PASS 的原始证据

下列 PASS **仅绑定各自 SHA 与唯一生产 WXT packageHash**；不把单个平台或旧候选结果转移为新 HEAD、用户 Mac 或全项目发布验收：

| 隔离 Chrome 专项 | Git SHA / packageHash | 验证事实 | 限制 |
| --- | --- | --- | --- |
| [真实缩放/焦点 Linux PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38432611404) | `6f4839ab55691c5f2a2a198bfdad0b51f63ce069` / `438c690cd986d25283ba838718764c0dea6520a81128af74e5f7e8d3593be577` | Chrome 155 `tabs.setZoom/getZoom` 100/125/150/200% 对应 CSS Width 840/672/560/420px，`scrollWidth` 同值；同一真实扩展 Tab 的 CSS viewport 模拟 220/300/320/360/420/520/594/760/980px 全部无整体溢出、10px label/input 测量间距、任务来源双 Icon 不重叠；原生输入 Tab、时区搜索/折叠、无安装任务的错误焦点和禁止确认、未保存草稿保护、浅/深色截图。原报告 `status=PASS`，[Artifact 11831827086](https://github.com/shopable-ai/opendesk-browser/actions/runs/38432611404/artifacts/11831827086)，17 张截图。 | Chrome **Tab** 真实缩放，Side Panel 宽度是 **CDP viewport 模拟**，不可冒充实体 Side Panel。旧 Linux 截图缺 CJK 字形。 |
| [整 Chrome 进程重启 Linux PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38432801913) | `bb57e3b2bb56d0a997aa08e123c4c51ad130b5af` / **同上 packageHash** | 独立临时 Chrome Profile 内真实创建安装 Task、核对 Run/Result、注册 Alarms、Side Panel 关闭后 Runner 驱动网页、暂停/恢复；原始整个 Chrome 进程退出并在相同临时 Profile 重启，恢复原计划和 Alarm，又获得新的正式 Run/Result 与网页真实效果；报告逐项 `wholeChromeProcessExited`、`sameControlledProfileRestarted`、`scheduleStateAndAlarmRecovered`、`newActualNativeEffectAfterRestart` 均 `PASS`。[Artifact 11831028944](https://github.com/shopable-ai/opendesk-browser/actions/runs/38432801913/artifacts/11831028944) 记录 6 张原生截图。 | 独立 Linux CFT 证据，不等于用户 Mac Profile、macOS Job 或所有权限矩阵。 |
| [中文字体可读的缩放 Linux PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433079659) | `075a1ab277c71033c6a3ec1dbfeca01ae6159fc8` / `a9446b093ed923ddf7522c4356b5170aff5d5567f8afd4e72baca3d14c6621b9` | [Artifact 11831213547](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433079659/artifacts/11831213547) 的 17 张同场景截图中文正常显示，360px 深色/浅色、320px 表单、原生 200% 都可审阅；独立报告 `status=PASS`。 | 仍为 Linux CFT，截图之外的人工专家 95 分和用户实际 Side Panel 均需单独验收。 |

**后续实际页面发现（不是模拟 UX）：** 字体可读的独立运行页深色截图 `runner-color-scheme-dark-360.png` 显示从无效表单取消返回 Runner 后，顶部仍残留「请先修正上方标记的字段」。这是消息跨二级视图污染，而不是执行/授权异常。[修复 `8a335ca`](https://github.com/shopable-ai/opendesk-browser/commit/8a335cab4ce7e4d1a02577c7b994a483506810f0) 仅在 **真正改变二级视图** 时清空旧通知，保留正在编辑表单期间 15s Host 轮询不得自动隐藏错误的旧修复；[回归断言 `f6de1d7`](https://github.com/shopable-ai/opendesk-browser/commit/f6de1d733294c602c788aa4f909f997be7028536) 已写入主分支。**该最新 UI 修改尚需同 SHA Chrome/Node CI 复验，不能借此前截图直接称已验收。**

**结论分层：** Linux Zoom/Resize/Keyboard 的受控测试 `NATIVE_PASS`；Linux 整 Chrome 重启/第二次真实网页效果 `NATIVE_PASS`；用户 Mac 日常 `dist/development` 的扩展 ID、Profile、Side Panel 实体物理尺寸 `NATIVE_PENDING`；双平台和完整质量 95+ `NOT_SCORED`。

### R2.8 跨视图残留提示修复后的真实 CFT 截图回执

- [`f6de1d7` 真实缩放 CI 38433892190](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433892190) 的 Linux Chrome Job **SUCCESS**，原始 [Artifact 11831538884](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433892190/artifacts/11831538884) 内 `native-zoom-report.json` 标明 `status=PASS`、Git `f6de1d733294c602c788aa4f909f997be7028536`、`packageHash=cd44f5219e4d04dacb74bee44466e0a9d4ce0d563508cfadff419fd5df0b7f6e`、Chrome/155.0.8059.39 与隔离扩展 ID `jhajepcnohiplmafaiokjlcagcfjgaap`。
- 同证据包中最新 `runner-color-scheme-dark-360.png` 截图确认，在“无安装任务表单验证失败 → 显式取消/丢弃 → 独立 Runner”之后，**顶部已经不再显示之前的表单错误**。保留 100/125/150/200% 真正 Chrome Zoom、9 种 CDP viewport 模拟、17 张截图与原生 Tab/焦点、时区、错误保护的测试证据。
- CI 的 `macos-15` Matrix 截至本记录仍在 GitHub 队列或等待独立状态确认；用户 Mac 本机 `dist/development`、实体 Side Panel 与原生 Native 配对仍 `NATIVE_PENDING`。
- [`80c94f1`](https://github.com/shopable-ai/opendesk-browser/commit/80c94f12ef02818f9607ba66d42504c16ef211cc)、[`23462e1`](https://github.com/shopable-ai/opendesk-browser/commit/23462e112f78f45bac202c5f3fd7575f07cdac4e)、[`94b6e9c`](https://github.com/shopable-ai/opendesk-browser/commit/94b6e9c4f47d9c132b4455679bbe5b5de1586ac1)、[`d8abc7b`](https://github.com/shopable-ai/opendesk-browser/commit/d8abc7bbc7c36f44ea463ba4ca01043b57d2570d) 同步修正 **Scheduled Tasks 工作流真正执行的共享 Sidebar 测试**，改为验证当前实际 `od-disclosure`/共享按钮 36px 与折叠标题 40px，而不是要求旧 CSS 无附加 Class 或已退役的局部几何值；保留原测试的操作可见性、权限诊断和焦点合同，不删除测试。[工作流路径校准 `0c0b2d0`](https://github.com/shopable-ai/opendesk-browser/commit/0c0b2d0972c1143d12866b42d2190e243110adf9) 保证被执行的共享组件测试更新时能触发 Scheduled Tasks 回归。
- 这些共享测试修正的 **新主分支组件全 PASS 尚需实际 CI 完成**；不得用旧 commit 的绿色 Build Job 替代新 SHA 的总体验收。

### R2.8 核心定向 CI 最终回绿（不等于全平台 Final）

- [定向组件与完整双模式打包 CI 38434969755](https://github.com/shopable-ai/opendesk-browser/actions/runs/38434969755)，候选 `df6eca06b47e6a9b97c1e2bebc2473d66b5da96a`：**两个 Job 均 SUCCESS**，`scheduled-components` 包含 Schedule UTC/DST 与 FireId/授权、计划正式 UI 合同、共享原 Task/Sidebar 测试；`scheduled-package` 的 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 每一步都完成 **SUCCESS**。不能将旧失败工作流改写为 PASS，只引用新候选原始结果。
- WXT 原始成功回执：production `packageHash=d82038f2c733991279102d960814fb6433c8ac73e0b7cab79e85612a21d501a2`（95 项）；development `packageHash=ad83539ea141a5f657ca432e5f4b0156ca413fce2c8bd94fc7be2fa484632a39`（133 项）。**上述两个哈希是 GitHub runner 的对应 Git SHA 打包结果，不是 Mac 上现有 `dist/development` 的真实字节身份。**
- **新的必须关注的构建余量风险：** `ui/tool-shell.js` production **523445 / 524288 B**，仅余 **843 B**；development **523685 / 524288 B**，仅余 **603 B**。虽同候选硬门槛 PASS，但随时可能被并行的小功能改动触发新的 build FAIL；后续需要在**不放宽 512 KiB Hard Gate、不改 Native Authority、不增加重复运行时**的前提下由打包/Sidebar Owner 定向减重。未取得可审计减重余量之前不能把长期 Build 稳定性评为 95 分。
- 真实 Linux 浏览器组合：`f6de1d7` [Zoom+焦点+UI 截图 SUCCESS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433892190)；`594b35c` [整 Chrome 重启和二次 Native 网页效果 SUCCESS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433152806)；二者成功于独立隔离候选，**不等于在 `df6eca06` 同一固定包上统一复验全部组合**。Linux 物理 Side Panel 320/360/420、用户 Mac/Profile/Native 配对、macOS 队列及所有十维专家分数仍待独立实证。


## R2.9 Mac 本地正式产品验收（2026-10-14）

- 追加测试写入范围：`tests/environment/scheduled-task-ui-r1.test.mjs`、`tests/environment/sidebar-product-contract.test.mjs`（修改前无差异）。首轮 66 项中 60 PASS / 6 FAIL / 0 SKIP；失败对应并行 R30 公共折叠类迁移，保留语义、焦点、危险操作隔离与尺寸检查，只迁移旧类名/局部 CSS 断言。共享生产 UI 源码继续由原负责人写入。
- 追加原生测试驱动写入范围：`tests/framework/scheduled-tasks-r1-native-mac.test.mjs`（修改前无差异）。首次启用真实测试因既有标准 fixture 43111 被占用而在启动 Chrome 前失败。增加显式 `SCHEDULE_NATIVE_REUSE_FIXTURE=1`：只读复用已运行的标准页面，先拒绝重定向并核对 URL、HTTP 200 和与仓库 demo-form.html 完全相同的字节；不停止已有服务、不更改 Chrome 权限/执行/Run/Result 断言。原 CI 默认自建 fixture 路径保持。
- 构建减重写入范围：`wxt.config.mjs`（写入前当前无 diff）。本轮只为既有 tool-shell entry 增加 Terser `format.wrap_func_args:false`，保留六轮压缩、所有安全/资源预算及固定 Entry。研究 lane 使用实际 Terser 5.34.1、同一 production 输入 SHA `356082d54ddcb466c0692623d5fc51f12cf30c5e9deb0e70597da7264c1e46c8`，仅重打印减少 1698 B；Acorn 复解析后忽略源码位置和字面量原始拼写的 AST 完全一致。研究记录 `/tmp/opendesk-terser-print-BcuLVl/report.json`，官方依据 https://terser.org/docs/options/#format-options；在线新版默认值与本机固定版本不同，以固定版本与实验为准。正式双包仍须重新构建验证；不采用无收益的 semicolons 改动。

- 状态：IN_PROGRESS；负责人：Codex `01a1364e-28c4-77c3-b7ab-7cbfc65ac673`；仅 main。
- 写入范围：本工作记录、`docs/framework/workstreams/evidence/scheduled-tasks-r29-mac-20261014/`；真实缺陷需要修改的源码先核对 diff 与当前负责人再扩展范围。
- 资源：日常 Chrome Default / 扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 只操作本轮空计划/测试页面；已有 watcher PID 67794 独占 `dist/development`、`.wxt/public`、43119/43120，本轮不另起覆盖构建。其他 CFT/云控 Profile 不使用。
- 初始 HEAD `89c3b298dc3cf8927b227b041b101770780ce58a`；fetch 后 origin/main `c29f35fa4ea1a465b144e0a1f7751d774bd1ab24`，并行集成已前进本地 main。保留其他工作区修改。
- P0 现场：Chrome Details 与 Secure Preferences 均确认加载 `dist/development`；runtime.id/doctor.local.extensionId/allowed_origins 同 ID，doctor nativeConnected=true。
- 实际 Side Panel CSS width=363，DPR=2。列表缺新建按钮；DevTools 显示旧运行脚本 `Cannot set properties of null (setting hidden)` 和开发热更新因未释放活动延后，另有旧 time-review.css 缺失。保留 before-console.png，先通过既有关闭/重开生命周期核对文档版本，不解除未知副作用保护。
- 通过条件：main→源码/构建→实际扩展资源身份一致，正式创建/列表/Runner 原生交互与截图，必要 Node/双包校验；CI macOS 与本机/模拟证据分别记。95+ 无证据保持 NOT_SCORED。
- 独立只读 lane：CI 实时核查与 Bundle 模块归因；不操作共享资源。

- 共享资源后续观察：原 watcher PID 67794 已退出，其他 Page Edition 构建也已结束，development 重新生成。此前关于停止旧 watcher 的问题已不再阻塞：本轮不会停止该已退出进程。正式 build/build:dev 使用既有输出锁串行占用 `dist/{production,development}`、`.wxt/public`、43120；先核对无活动构建，遇锁冲突不覆盖。
- 正常关闭/重开同一 Side Panel 后，`我的 → 定时计划 → ＋ 新建` 恢复，正式创建表单出现；新 hostInstanceId `998627fc-a2d5-424a-bac9-f3e36aa9ece9`。无已安装任务，不写入真实计划。发现 URL 无效提示直接暴露英文原生异常，记录为待修复产品缺陷。
- 最新 origin/main 为 `ddbadf6dd0277a00dfe51a6025b601c0bce1fdc6`；只读核查后尝试 ff-only，Git 因并行 `src/ui/workflow/local-codex.js`、`src/ui/workflow/workflow-view.js` 的本地改动拒绝，本地 HEAD 保持 c29。未 stash/reset/覆盖；集成与本轮提交继续待相应文件负责人协调。

- 本轮 fresh production：PASS，packageHash `6df33e2cdb85a9f8aa60f5d7166649d0e55183a9638f4e09a96152cac1e9ee4b`，tool-shell=522262 B。随后 fresh development FAIL：524715 > 524288（超427 B），原始失败 receipt 与日志保留，不将此前 peer 双包 Verify 冒充本轮双包关闭。
- 独立原生 Zoom 资源：既有 R2.3 驱动、CFT `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` 149.0.7827.55、驱动自己创建 `opendesk-r23-native-zoom-*` Profile，输出 `evidence/scheduled-tasks-r29-mac-20261014/native-zoom-attempt-1`。使用已有输出 guard 防止 production 验证期间漂移；这是原生 Runner Tab zoom / CDP CSS viewport，不是实体 Side Panel 或 Mac CGEvent 全产品验收。

- R2.9 扩展独立写入范围：`tests/environment/sidebar-tool-multiscript-r72.test.mjs`（当前 diff 为空）。最新 Shared Sidebar CI 38454580327 / job 115493894185 的 second asset onerror 用例未观察到 terminal status；本地原用例 4/4 PASS。待验证原因是测试用 80 次 setImmediate 计数等待真实 WebCrypto，并非固定时长或 terminal 事件。先加入真实 SHA 延迟回归复现，再改为等待 terminal 事件并保留有界超时及原安全断言；不改 Sandbox 运行时。

### R2.9 当前实测与尚未闭合的交付（2026-10-14）

- 本轮独立源码：`wxt.config.mjs` 仅让既有 Terser printer 使用 `wrap_func_args:false`，不更改压缩逻辑、Authority 或 512 KiB 上限；固定 Terser 5.34.1 的源码重打印 AST 等价证据及实验保存在本轮 evidence。原超限开发包 524715 bytes，修复后双包构建及 Verify 曾通过：production `c82572054e1fec52f3bd782f00b506fab80f5863ec834c0967b59357833f9543` / 522963 bytes，development `af6392026b08a3acf827566109ed912e55adc917fbfc8b36e7b533162849462b` / 523203 bytes。这是历史本地候选，不是其后共享 main 的最终包。
- 最新共享 main 的 `fef1f9e` 已由另一个负责人将既有 Cloud factory 放入既有固定预编译 UI entry；本轮没有新增 Host。当前 watcher 输出 tool-shell=500078 bytes，余量24210 bytes。生产盘上仍522982 bytes，不能用 watcher 数字代替最新双包构建。
- 本轮 Native 驱动支持 `SCHEDULE_NATIVE_REUSE_FIXTURE=1`：只读核对既有 43111 页面 HTTP 状态、精确 URL 及全部规范源码字节；不结束别人的服务，默认仍使用本测试拥有的 server。原生输入助手失败诊断同时保留 stdout/stderr/error，没有放松前台 PID 和可信 CFT 检查。
- Shared Sidebar CI 38454580327 / 115493894185：原 onerror 失败为等待真实 WebCrypto 的测试用 80 次事件循环计数；本轮先用真实 SHA 的 30ms 延迟复现失败，再改为 terminal 事件加2秒超时。原顺序、坏 SHA、不加载后续脚本的断言保留；5/5 PASS。最终定向5文件71/71 PASS、0 SKIP；`npm run check` 668文件及构建合同 PASS。
- 日常 Chrome 155.0.8059.40：ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，实际路径仍 `dist/development`；runtime ID、Go doctor `local.extensionId`、Native `allowed_origins` 相符。正式列表恢复新建，真实创建表单已打开；实测363 CSS px、857高、DPR2、scale1、主要输入高36px、无整页水平溢出。截图与 AX 在 `evidence/scheduled-tasks-r29-mac-20261014/`，索引 `regular-chrome-screenshot-index.json`；后续共享 Profile 截图没有冻结最终候选，不把它们登记为身份闭合 PASS。
- 原生 Chrome 快捷键100/125/150/200在测试网页生效，已恢复100%；200%时 Side Panel 仍363px、DPR2、scale1、输入36px。这证实普通 Tab 缩放未改变 Side Panel，不计为实体 Side Panel Zoom PASS。320/360/420实体宽度：NOT_TESTED，原生手柄操作未成功改变宽度。
- Mac CFT149 Runner Tab Zoom 原生驱动 PASS，仅绑定 `6df33e…` 历史生产包；不是实体 Side Panel 或完整 Mac RunHost PASS。Mac Task attempt-1 被43111占用拦截；attempt-2实测安装、Run/Result和网页效果，但错误地同时启用互斥验收阶段导致整体FAIL；后续 lifecycle 在另一个真实盘上包 `bdabe544…` 的前台输入 PID 检查失败。原始失败均保留，未重写为 PASS。
- 新复测被 PID25173 `npm run dev` 的43120输出锁拦截，未抢占/停止。最终双包、Mac lifecycle/identity/permissions/restart、列表管理和正式执行矩阵需要共享资源交接；已通过结构化问题请求交接。
- 真实创建表单仍有 URL 文案缺陷：Chrome155 的 TypeError 文本为 `Failed to construct 'URL': Invalid URL`，现有 startsWith 未匹配。准备的一行修复见 `proposed-url-validation.patch`，同文件已有另一个负责人3项R30 class修改；按同文件单负责人规则等待交接，未覆盖其源码。R30 生产 class 和两项静态测试同步现已由共享 main 的85de6add / 8ac00038集成；本轮不重复纳入提交。
- 最新历史 CI 两个 macOS Job（Zoom 38433892190 / restart 38433152806）仍queued，Linux success；最新main的对应任务也queued。不存在可替代本机证据的macOS PASS。
- 当前总状态：IN_PROGRESS；最终身份链未闭合，尚不具备95+产品交付条件。十个维度（视觉、排版、层级、效率、表单、完整性、响应式、可访问性、安全、Chrome原生交付）均NOT_SCORED；详见本轮 `closure-status.json`。
- Git串行写入范围：仅本轮工作记录、wxt printer配置、Native fixture驱动和Shared Sidebar异步等待测试。提交前核对main、暂存为空、无活动git/index.lock；不纳入其他人的源码或依赖未提交R30 class的两项静态测试。

### R2.9 本轮提交及 clean-main 构建确认

- 本轮4文件提交 `22abce369312e385f35dc240bd93b8635d125464` 已非强制推送main；只包含工作记录、WXT printer、Native fixture复用/诊断、Shared Sidebar异步等待测试。其他暂存内容没有混入。
- [同SHA Shared Sidebar CI 38458199861](https://github.com/shopable-ai/opendesk-browser/actions/runs/38458199861)，job115506257027 **SUCCESS**；R14隔离与全部五组Sidebar回归、离线工具打包、React/Vue固定编译、WXT production/development及Verify均SUCCESS。
- clean worker生产包 `b5020c3343c2ef8404a285601e7f11cf6c1564267ca5e63f7b427a4c0e26d77f`，tool-shell=494692 bytes，余量29596；开发包 `45db176ed4c7db72df1eac882a3725485f365153bd32f8784fd2cba7978553db`，tool-shell=494932 bytes，余量29356。两包在同一512KiB限制下超过16KiB余量目标；证据 `ci-clean-build-proof.json`。不得将这两个CI hash冒充本机盘上或实际运行中的扩展hash。
- Mac最终身份链、实体320/360/420、Side Panel原生Zoom、完整生命周期矩阵及URL文案修复仍未闭合；现有dev PID25173保持运行。上述CI成功不改变十维NOT_SCORED和IN_PROGRESS结论。

### R2.9 续接：实际执行资源与独立验收输出

- 负责人：本 R2.9 对话；新增资源仅为 `artifacts/scheduled-tasks-r29-mac-20261014/main-8321bc8e-build-input/`、专属输出守卫端口55129、独立一次性CFT/Profile。从main提交8321bc8e只读归档构建输入，源码不在快照中编辑，不创建Git分支/worktree，不替换日常扩展。现有dev PID25173及43120、日常dist/.wxt继续由原负责人使用。
- DevTools Sources关闭pretty print后通过Save as导出原Host实际执行JS：523203 bytes，SHA256=`1ac24348eafb9dcd2f16a5faa5efc7cc6710b695fce048abbd613c86afb87f18`，与当前磁盘500130 bytes不符。正常关闭已释放的Side Panel，再从同一扩展按钮打开，新Host `04b9e8a8-ab75-4905-8cc5-a33d8dfbba98`显示正式创建表单；新导出JS与磁盘均为500130 bytes、SHA256=`bb7af631837eff79c0ad8d7b955ddbbad4e089818247e9a05cb6cf6be9a5d380`。仅此UI入口资源一致；整扩展/SW候选一致性尚未证明。
- 只读诊断：Native ledger 3条均ACKNOWLEDGED；执行槽无currentRun/preview；commandJournal 273条中13条effect_unknown。自动扩展刷新因此被原安全守卫延后，保留审计记录，不删除、不重放、不绕过。原始AX及前后JS见本轮证据目录的`reload-*-readonly.ax.txt`、`executing-resource-parity.json`。
- 同22abce36的构建体积审计CI 38458199871/job115506257441已SUCCESS；Mac Native job115506257439仍queued。后续以隔离构建/验收输出继续可独立工作，结果只绑定其真实源码输入与packageHash，不冒充日常Chrome最终PASS。
- Linux重启CI 38458199882/job115506258161出现新FAIL：原scheduleId/generation和Alarm已恢复，尚未观察到Sidebar计划卡片。只读子Agent确认测试缺少重启Sidebar规范导航/初始化同步及失败诊断，产品缺陷仍未证实。原生测试负责人仅修复既有驱动：等待真实文档初始化，真实点击“我的”，确认面板打开及精确原scheduleId卡片；失败保留URL/documentId、Tab/Host/错误文本与截图，不重放点击，不删除原Run/Result或第二次真实执行断言。
- 隔离main8321双包本地构建、Verify、Check与71项定向Node已PASS，sourceDrift=[]。Production packageHash `8de5cf8ca372796d35079ec4cd5f1dc4542571b1716b02ec45ef6593add04294`，tool-shell494692 bytes；Development `9ebac4a51d9632a2c00f0482b8107ca28c82d5cadab4670687eeb152e5a8ad00`，tool-shell494932 bytes，安全余量29356 bytes。首次快照构建因node_modules外部路径正确被拒，保留失败；改为APFS复制既有固定依赖后通过，未放宽来源门禁。
- Mac CFT149/隔离扩展`paklopgdcgingekbnjaeeicbgimoikel`：生命周期及viewport、安装身份两个阶段PASS；网站撤权阶段的Home键被前台PID守卫拒绝，保留FAIL_OR_BLOCKED。重启第二次观察已恢复真实Sidebar卡片，并取得新completed/released Run/Result及native receipt，但驱动新建第二个相同URL标签页后观察到了未执行的页面，FAIL保留。Host按首个精确URL借用现存页；下一轮仅修复观察器，真实导航重置已恢复的唯一fixture Tab，并增加Run.tabId/documentId精确绑定断言，不更改产品或安全门禁。
- 修复后Mac整进程重启阶段PASS（`native-main8321-restart-r3-bound-target/native-report.json`）：原PID1461→1575，同Profile恢复同scheduleId/generation3与Alarm；真实UI卡片、第二次网页效果及唯一Fire→Run→Result通过。新Run `ea0124ff-47d2-40ed-90a1-d05f755ac749` / Result `948d1a85-9b97-4f6c-bf24-8fd38a80ac4c`，tabId1994879098/documentId`7988A04826B80541CF28FB1F654D350B`与原Run记录逐项一致、retirement released。产品输入仍是8321的隔离production；驱动工作区SHA另记harness-inputs.json，不冒充最新Cloud Tab改动后的最终候选。
- 新main e220的Sidebar/Site Access组件CI失败定位至他人正在修改的`script-editor.test.mjs`依赖检查合同；Cookie组件失败定位至既有market immutable release冲突。保留具体Job115537323968/115537326193/115537325196，不覆盖并行修改、不将这些全局回归记PASS。本轮独立Scheduled/Native范围继续。
- 驱动修复后的当前工作区定向Node71 PASS / 0 FAIL / 0 SKIP；`npm run check` PASS；diff whitespace与driver语法PASS。日志`artifacts/scheduled-tasks-r29-mac-20261014/{node,check}-main-current-observer.log`。本次只暂存本工作记录和原生驱动；其他dirty源文件、Swift助手、共享构建receipt不属于本轮提交。
- 重启观察器提交`27c82fbcfffd6b296232485f319e5af27262fba9`已非强推至main，远端branch API确认同SHA。其Linux整浏览器重启CI38468396412/job115540885422、Linux baseline/lifecycle CI38468396031/jobs115540884671及115540885141、Linux网站撤权CI38468396261/job115540886330均SUCCESS；对应Mac jobs仍queued。本机Mac PASS独立按实际CFT/候选绑定，不用Linux或排队结果代替。
- 新增冻结输入仅`artifacts/scheduled-tasks-r29-mac-20261014/main-27c82fbc-build-input/`，沿用独立55129输出guard；已包含最新Cloud Tab源码。网站撤权后续仅在本轮Native驱动加入失败时`lsappinfo front/info`只读诊断，识别抢走前台的实际PID/App；不发送额外输入、不重新激活、不放宽CGEvent守卫。
- 新main27冻结本地双包Build/Verify/Check和Node71全部PASS，输入漂移=[]。production packageHash`8c0be923642df6313ae89334b66c4be2e8a0ad9ebf5cd2c947b296a537a0e6b9`/494720 bytes；development`6c6957bdeffa2b8c1165bab423a0d808e7ad5cd81fd6461f17f23482628d1f01`/494960 bytes，余量29328 bytes（28.64KiB）。证据`local-main27-build-proof.json`及两份独立build-main27 receipt；未写入或覆盖日常dist。
- main27 Mac真实网站撤权阶段PASS：Chrome Site Access由ON_ALL_SITES改为ON_CLICK；下一原Fire为NEEDS_ATTENTION、无Run、无网页效果；恢复ON_ALL_SITES不重放旧Fire，原Run/Result审计保留。首轮前台守卫失败仍保留，未因后续PASS删除。main27原R2.3 Native Zoom驱动也PASS，是真实Runner Tab zoom与CDP viewport，实体Side Panel尺寸/Zoom继续NOT_TESTED。
- 本轮原Native驱动新增受控`SCHEDULE_NATIVE_FORM_MATRIX=1`验收阶段（同文件负责人）：仅编辑/管理本阶段自己安装Task及隔离计划，保持全部计划暂停；真实UI覆盖once/daily/weekly/interval、JSON修复、明确时区选择与编辑保持、返回修改、两个计划及删除确认/保留审计。只读截图增加真实URL/CSS宽高/DPR/scale，CDP emulation显式标注；不添加第二Host/Storage或伪造网页/权限效果。
- 表单矩阵首轮FAIL保留：将原interval编辑为once却未填写必需的日期字段，确认区未出现。下一轮校正测试操作：通过真实“新建”创建带正式未来默认日期的once；对原暂停计划编辑daily/weekly/interval，保留所有真实持久值断言。新增失败时只读字段/错误/焦点和原生截图。R2.3缩放驱动实际使用Mac CFT headless渲染；Chrome tabZoom是真的，但不是实体Side Panel/native hardware keyboard验收。
- 矩阵第二轮FAIL保留：Mac IANA select在Home导航后仍停在原Asia/Shanghai，未假报选择成功。驱动改为依据真实selectedIndex与未禁用options发送相对Up/Down，再断言实际value；不赋值或派发change。独立只读review同时发现本轮误写`expand` helper引用，已改用既有`details`。补齐返回修改的全字段保持、删除审阅/取消的两个精确ID保持、全阶段Run/Result/已准入Fire/native receipt及网页效果不增长断言。
- 矩阵R4通过真实纽约IANA选择、JSON修复及daily保存，随后因独立运行页保存后回到概览而未找到列表编辑按钮。R5改从同CFT真实Sidebar入口做完整表单矩阵，保留R4失败与已通过子项。菜单选择采用实际Target激活及原AX助手按观测label选择唯一菜单项。追加可选`SCHEDULE_NATIVE_PHYSICAL_WIDTH=1`：同一无viewport emulation的真实Sidebar等待本轮CUA原生拖动，读取实际CSS宽度及截图；尝试文件只是测试编排，不是Native ack。未达请求宽度记录LIMITATION，不造PASS。该阶段独占本测试CFT前台，日常Chrome/扩展不受替换。


### R2.9 本地原生表单、实体宽度与 Zoom 续接

- 定向回归最新工作区输入：四文件 Node **66 PASS / 0 FAIL / 0 SKIP**，`npm run check` **668 文件 PASS**；日志 `node-form-r8-harness.log`、`check-form-r8-harness.log`。先前 main27 隔离候选的 71 条证据保留，各自绑定输入，不合并分母。
- main27 正式生产包上，真实 headed Mac CFT／原生输入已执行实际 Side Panel：未保存草稿的取消/继续/放弃，非法 JSON 焦点及修复，固定 Task 身份、编辑保留时区、明确选 America/New_York、确认返回修改/保存、每天/每周多天/间隔/新建一次、两个暂停计划、旧 Run/Result 历史。`native-main27-form-matrix-r7-physical/native-report.json` 中这些子项 PASS；**整轮 FAIL_OR_BLOCKED**，原因是删除成功后测试错误地等待物理行减少。真实仓库保留删除墓碑；驱动已改为检查 deleted、代次递增、暂停/nextDueAt、原计划不变和真实列表移除，审阅/取消改为完整计划投影保持，尚待最终复测，不伪报整轮 PASS。
- 可选实体宽度编排只等待模型的原生操作记录，记录绑定本轮 UUID、Chrome PID、documentId 与 requestedWidth，不是 Native ack，不调用 Emulation。R5/R6 是本轮未及时操作造成的超时，保留失败，不归因 Chrome 不支持。R7 原生 CUA 拖动/AX 手柄尝试未改变宽度：**360 CSSpx 实测**，320/420 `LIMITATION`；未证明 Chrome 最小宽度。截图及准确动作见 `mac-physical-and-native-zoom-index.json`。
- R7 headed CFT 原生 Cmd+plus/Cmd+0：Chrome AX 显示 **100/125/150/200%**，同一扩展 Origin 的实际 Side Panel 分别 **360/288/240/180 CSSpx**、DPR **2/2.5/3/4**、scale=1、scrollWidth 等于 CSS 宽度；已保存原始 AX、完整窗口 PNG 和 SHA256。该证据是同 Origin 原生缩放实际影响 Side Panel，不宣称 Side Panel 独立缩放控制；与 R2.3 的 headless Chrome Tab zoom、CDP viewport、实体拖动分别登记。日常 Chrome 的 localhost Tab zoom 不影响扩展 Side Panel，既有观察保留。
- R8 在不做实体测宽的独立复测中被**真实前台 owner guard**拒绝：本轮期望 Chrome PID45448，实际前台是另一 Time Review R19 CFT PID45540，路径 `.runtime/time-review-r19-local-01a1364f/OpenDesk Time Review R19 CFT.app`。没有自动抢回前台、放宽守卫或继续 Return；原始诊断保留 `native-main27-form-matrix-r8-tombstone/native-report.json`。仅受影响原生阶段等待资源释放，其他回归/证据继续。
- Mac 网站权限主阶段已在 `native-main27-permissions-owner-diagnostic` PASS，旧失败仍保留。27c82fbc CI 最新读取：Linux Chrome 整进程重启、Task 安装身份及网站权限均 SUCCESS；对应 macOS Jobs 及 `scheduled-native-macos` 仍 QUEUED，不提升为 Mac CI PASS。
- `scheduled-task-workbench.js` 的 URL TypeError 文案补丁仍未落盘，原 R32 对同一文件的所有权未获明确交接。main 当前已推进至 ac7d7aa1，production 输入较 main27 在 bookmarks、script-editor、page-component-remote 有变化；现有 Mac 证据仍精确标记 main27 packageHash，不冒充当前整包。日常扩展整体/SW 身份链和十维95+正式评价仍未关闭，继续 `IN_PROGRESS / NOT_SCORED`。

- 当前 main 的追加只读构建快照提取遇到 `ENOSPC`：Data 卷剩125MiB；只清理本轮刚生成、尚未成功/未含独有工作的 `artifacts/scheduled-tasks-r29-mac-20261014/main-ac7d7aa1-build-input`，恢复至917MiB，保留所有旧候选及原始证据。该尝试没有构建结果，标记 `BLOCKED_STORAGE`，不覆盖 main27 双包 PASS。原生前台时段已向用户提出协调请求；没有将沉默当作释放。
