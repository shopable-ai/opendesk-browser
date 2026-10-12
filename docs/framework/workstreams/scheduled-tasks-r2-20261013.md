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
