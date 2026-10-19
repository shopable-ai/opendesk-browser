# React UI R35.4 · 正式页面所有权迁移账本（2026-10-19）

> **证据等级：PARTIAL，不是产品 PASS。** 本账本依据真实 GitHub `main` 的源码和 CI 输出。原始基线 `ad7002abfbe1112b98d434a8c2b80457f56a6d77`；本次账本核查快照 `580bee6bceaba4dfe9231e5814d5c635f997f2e1`。后续提交若改变文件，须重新取数、测试并更新本账本。它不替代 `react-ui-shared-components-r33.zh-CN.md`。

## 不可改变的产品合同

`src/entrypoints/tool-shell.js` → `src/ui/tool.html` → `src/ui/tool-shell.js` → `src/ui/react/main.tsx` 唯一可信 Side Panel React Root → `src/ui/react/app-shell.tsx` 五个正式页面 → **既有** Controller / Host / SDK / Runner。不得从 UI 层建立 Installer、Compiler、Cloud 权限和运行任务的第二套权威。独立 `examples/sidebar-tools/` 动态业务只通过原隔离 Runtime/SDK 运行。

## 五个页面的真实迁移状态

| 正式 Tab | 现行 React 页面 | 业务权威仍在 | 当前已观察到的缺口 | 结论 |
| --- | --- | --- | --- | --- |
| 我的 | `tabs/my-page.tsx`，任务行 `tabs/tasks.tsx`，定时 `tabs/schedule.tsx` | TaskWorkbench / Scheduler / RunHost | 合同目标要求 `tasks.tsx` 为正式页面，但正式容器目前仍在 `my-page.tsx`；`tool.html` 仍有旧完整任务面板；快速切换、计划持久化和 Mac 实装未全部验收 | PARTIAL |
| 扩展 | `tabs/tools.tsx` 和 `tabs/tool-host.tsx` | ExtensionCenter / SidebarTools / Installer | React 已渲染列表/筛选/详情/菜单，旧 HTML 业务结构仍存于静态源；部分原 HTML 交互测试仍未迁至 React 挂载后验证；独立工具安装升级须做真实回归 | PARTIAL |
| 工作流 | `tabs/workflow.tsx` | WorkflowView / Workflow Host | React 页面已实现，但 `tool.html` 仍有旧 workflow 面板；旧 `workflow-ui-states.test.mjs` 对 Controller 直接 DOM 赋值的断言已不适用，需用实际 React 交互和操作回执取代 | PARTIAL |
| 开发 | `tabs/develop.tsx` + `develop-controls.tsx` / `develop-dependencies.tsx` | ScriptEditor / Compiler / RunHost | 旧 `developer-layout.test.mjs` 仍检查已退出的静态 HTML；`script-editor.test.mjs` Page/Controller 选择与编译期间切换有 2 个实际失败测试，必须查明运行环境和竞态原因，禁止改断言掩盖执行回归 | FAIL / PARTIAL |
| 云控 | `tabs/cloud.tsx` + `cloud-authorization.tsx` / `cloud-settings.tsx` | CloudHosting / Cloud Host | 已收敛 React 页头两个按钮的重复 native 监听；授权拒绝/未知结果/控制台刷新在最终打包 Side Panel 仍待完整验收 | PARTIAL |

## 旧 UI 与 Portal 实测差异

| 文件/指标 | 基线 | 核查快照 | 含义 |
| --- | ---: | ---: | --- |
| `src/ui/tool.html` 行数 | 1,062 | 454 | -608 行；**仍含** `#workbench-tasks` 旧完整区域及 `#workbench-workflow` 旧面板，不能判定旧 HTML 全部退出 |
| `src/ui/react/main.tsx` 行数 | 648 | 151 | -497 行；业务 JSX 接线显著缩减 |
| `main.tsx` `createPortal(` 调用位置 | 27 | 2 | 仅为固定 Bookmark Manager 可信试点与 DebugDiagnosticText，不是五 Tab 主业务 Portal |
| `src/ui/react/app-shell.tsx` 行数 | 122 | 128 | `scaffold.beforeTools/afterTools` 仍把非五 Tab 的目录/调试面板接入 React 树；逐消费者判定后方可移除 |
| `tabs/tools.tsx` 独立 Portal | 0 | 1 | `ExtensionRowMenu` 弹层 Portal，属已登记的有限 UI 例外；不得衍生为主业务 Portal |

**明确登记的独立 UI 所有权例外：** `main.tsx` 可信固定 Bookmark Manager 试点（须保留固定来源、准入及隔离边界）；DebugDiagnosticText 只读诊断 Portal；`tools.tsx` 扩展行操作菜单弹层 Portal；已安装 Sidebar 工具 iframe/Host 由独立工具沙箱所有。例外均不授权动态用户脚本进入可信 React 树。

**不能盲删的结构：** `tool.html` 内与目录、调试、独立工具宿主、权限/隔离有关的节点，以及 `app-shell.tsx` 明确登记的非五 Tab `scaffold` 消费者。旧任务/工作流完整面板不属于永久例外：应先修复旧直接操作 HTML 的测试、完成 React 行为验收，再从正式 HTML 物理删除。隐藏、运行时移走或加 CSS 隐藏都不算删除。

## 生产代码净变化（范围说明）

相较基线，**选取 27 个 R35 相关正式源码文件**（`src/ui/react/tabs/`、主要视图/Controller/HTML/React 接线），GitHub compare 报告新增 5,646 行、删除 1,618 行；由于 compare 对 `tool.html` 的合并统计未返回有效行数，结合直接文件读取补记旧 HTML 删除 608 行，故该明确子集净约 **+3,420 行**。新增 **16 个正式源码文件**，该子集没有物理删除文件。此数 **不是整个仓库净变化**，也不是重复实现减少的证明；迁移后的状态字段、React 页面和旧结构并存仍须单独清理。

## CI 与证据红线

- 旧基线附近的 R35.2/Extension Center CI 失败，包括旧 `react-sidebar-r333.test.mjs` 对过时 Script Editor 监听器写法的断言；R35.4 追加了 `react-sidebar-ownership-r354.test.mjs` 和 Cloud Header 动作回归，并把 R33.3 扩展结构断言改为检查真实 React 列表、原 Controller 投影与销毁顺序。
- 在 `bd2d92a` 快照，`React Sidebar R35.2 App Shell Chromium`、`Extension Center R4`、`Sidebar R1 P0`、`Sidebar R21` 有 **FAIL**。日志可见旧 `tool.html` 静态布局断言不再匹配；此外 ScriptEditor Page/Controller 运行语义的两项回归未通过，不得统称为“仅测试过时”。
- 之后的测试修正提交为 `c31b498`、`db94fb8`、`580bee6`；不能把源码核对视为 CI PASS。当前提交的运行结果应从 Actions 按精确 SHA 查询；任一未完成为 `PENDING/NOT_TESTED`。
- **真实 macOS Chrome Side Panel：NOT_TESTED。** 当前没有本地安装版点击、授权、刷新、快切、卸载更新验收记录。Linux/CI Chromium 的结论必须按各运行的具体 workflow、commit、job 和日志记录，不可推断为 Mac。
- 严禁用创建组件文件、行数或静态字符串门禁替代真实 Task / Scheduler / Extension / Workflow / Script / Cloud 的持久化、权限、失败关闭和生命周期测试。

## 最小风险后续执行顺序（防漂移）

1. **先清理真失败，不先大面积删代码。** 优先复现并修复 ScriptEditor Page/Controller 世界切换与编译中取消的真实回归；在 Android/Chrome 执行模型中拒绝错误环境执行。
2. **将旧 HTML DOM fixture 迁至真正 React 挂载 + 原 Controller/Host 交互测试。** 保留原行为断言、拒绝/未知结果/取消回归，不得删除旧功能测试。
3. **按已完成度逐页删除旧 HTML 业务内容。** 先确认具体业务完整性，再删对应静态节点、旧 DOM 写入、事件双绑定及失效样式；每删一次立即构建+Chromium+安装版回归。旧 `#workbench-tasks` 和 `#workbench-workflow` 尚属未完成项。
4. **锁定正式文件职责。** 将 `tabs/tasks.tsx` 与 `my-page.tsx` 的职责整理回合同要求的单一任务正式页面，不增加 v2/final 并存入口；审查非主 Tab `scaffold` 和固定试点 Portal 消费者。
5. **汇集最终门禁。** 只能在精确 SHA 上每个 Tab 的交互/权限/恢复/快切、SDK/Host、JS/React/Vue 独立扩展、真正生产/开发 MV3 包、Chromium 及 Mac Chrome 全部有 PASS 证据后声明 ≥95 分；现在整体结论为 **NOT ACCEPTED**。

本账本记录的是阶段成果和未解决冲突，不能写为“R35.4 已完成”。
