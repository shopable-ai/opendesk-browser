# Web Flow「运行」复用「我的」抽屉 · 专项实现附录（2026-11-11）

> 固定检索词：OD-AI-WORKFLOW-BRIDGE。本文是实施附录，唯一需求源仍是 [product-contract.zh-CN.md](product-contract.zh-CN.md)、唯一进度源仍是 [execution-plan.zh-CN.md](execution-plan.zh-CN.md)。**当前 SOURCE_IMPLEMENTED / TARGETED_NODE_NOT_TESTED / INSTALLED_CHROME_NOT_TESTED；底部布局恢复见执行计划顶部最新卡**（以本节第 7 条为准）。可点击演示见 [preview/index.html](../preview/index.html)。 公开 API 仅在[原 Sidebar Tool 文档](../../../docs/api/sidebar-tools.zh-CN.md#固定已安装-controller-task-委托v2)维护；本文不另立规格。已有实现和测试覆盖不代表最新合并候选已通过定向 Node、浏览器或业务验收，95+ 未验证。

## 1. 最终用户操作（最高优先级）

用户在 Web Flow →「脚本」看到百度/Google 等已安装脚本。点击列表右侧 ▶ **不直接执行**，而是像「我的 → 已安装任务 → ▶」一样，从**底部上滑打开相同的可信参数运行抽屉**；使用同一 Task Schema、表单/JSON、参数校验、安装身份、网站权限、RunHost 与结果链。不创建第二套外观相似、业务逻辑不同的 Web Flow 运行弹窗。

保留现有脚本列表、收藏/▶/更多和 hover/focus 布局，不再重新设计整个列表。脚本列表只显示异常提示，运行记录负责状态与高级诊断。Side Panel 和 app.html 都应生效，不以切换去「我的」替代最终体验。

## 2. 当前真实源码与消费入口

以下记录当前源码消费入口；历史抽取与底部布局修正见第 7、8 节。公开 `tasks.configure` 使用完整 `task` 安装 pin 和可选 `preparationId`；下文历史接线说明中的 `{taskId}` 简写不替代原公开 API 合同。

- 共享可信 UI：`src/ui/react/tabs/task-run-sheet.tsx` 已提供 `TaskRunSheet`，复用 `MyTaskParams`、MyControl 与 Tokens；`app-shell.tsx` 在唯一 React 根挂载，位于隐藏 Tab/工具容器之外。「我的」与工具来源共用组件，保留原手动运行链。
- 唯一控制器：`src/ui/task-workbench.js` 已提供共享抽屉的打开、保存/读回、确认、查询与取消；原 `run()` 和 RunHost 继续持有执行权限，不复制执行器。`src/platform/host/controller-methods.js` 在原 commandJournal 保存准备身份并原子消费，关联原 Run/Result。
- Web Flow：`projects/webflow/src/ui/main.js` 的 ▶ 和更多菜单同步调用公开 UI-only 入口；「记录」从 metadata 发现原准备定位并打开同一可信抽屉。`model.js` 仅保留有效、精确 pin 匹配且去重的定位投影，不将参数/结果写成第二账本。新共享路径不调用 `tasks.start`；旧 `webflow.pending.v1` / `webflow.recent.v1` 仍保留原 read/stop 恢复。
- Bridge/Host：`src/sidebar-tools/bridge.js` 与 `src/ui/sidebar-tools.js` 已接入 `tasks.configure` 私有真实手势通道，打开当前宿主可信抽屉，不导航、不卸载 iframe、不创建 Run。`tasks.open` 仍仅做任务管理/安装审阅导航，不替代共享抽屉。
- 工具源码、候选/正式 JSON、当前已安装包及固定编译 Host 分别核对，不以旧版本号或某个包已生成推定当前运行代码已生效；实际交付进度由 leader 记录。
- 两个搜索 Task 当前真实 Schema 均为：`query` 必填 1–120 字；`limit` 整数固定枚举 3；`showExecutionTab` 可选布尔，默认 true。**通用组件应从 Task Authority/manifest 取得参数，不在框架硬编码百度字段。**

**当前 main 已有的源码接线：** `src/ui/react/tabs/task-run-sheet.tsx` 是唯一可信抽屉；`SidebarAppShell` 在 Side Panel 与 app.html 的唯一 React Root 统一挂载；`src/ui/sidebar-tools.js` 的 `tasks.configure({taskId})` 仅在可信宿主核对真实点击、已安装 App、包 hash、撤权代次、固定 delegatedTask 和当前 session 后打开抽屉，不发送 Run。它冻结来源应用 `toolId/version/packageHash/revocationEpoch`；`src/ui/task-workbench.js` 从 Task Authority 读取真实 Task Schema/安装身份，保存准备到可信存储并读回，同一准备经第二次确认进入原 `run() → RunHost`，不存在第二 Runner。旧沙箱内 `prepare()/run()/tasks.start` 新执行路径已移除，旧 `webflow.pending.v1` 与历史记录仍只读查询/停止。**实现不等于已安装 Chrome 验收。**

## 3. 正确的双阶段交互

~~~text
Web Flow 脚本列表：[收藏] [▶] [⋯]
  ▶ 真正点击（只打开底部共享可信抽屉，不启动脚本）
抽屉：与「我的」一致的标题、参数表单 / JSON、目标网站、授权状态
  阶段一：[保存并核对] → 可信来源冻结唯一准备身份、参数、版本、目标，持久化后读回；RunHost 仍未执行
  阶段二：[确认执行一次] → 第二次真实可信用户点击 → 再验同一来源/参数/版本/网站/权限 → **同一 TaskWorkbench / RunHost 至多一次启动**
记录：真实 Run / Result / 资源释放与网页业务结果分开展示
  UNKNOWN：仅只读查询或尝试停止，不创建第二请求
~~~

- 「我的」原直接点击“运行任务”的正常链不能回归。共享的是**同一抽屉组件、参数组件、TaskWorkbench 和 RunHost**；Web Flow 来源使用同一组件的“保存并核对 → 确认执行”配置，不额外调用第二条 RunHost。不得把“从 Web Flow 提交 `tasks.start`”与“调用「我的」`taskRunClick`”都当成最终提交。
- 第一阶段保存前关闭：只保留编辑草稿，不创建执行；保存后关闭：保留同一准备记录，允许继续确认/安全取消；不能重新生成另一个待执行请求。
- 从「我的」或 Web Flow 打开相同任务时须共用运行占用/冲突判断，不允许靠当前 Tab 的局部 state 来防重。旧 Web Flow pending/UNKNOWN 必须与新入口共用冲突保护，防止绕路重复操作。

## 4. 已实现的组件与能力边界

| 层 | 当前实现 | 明确禁止 |
| --- | --- | --- |
| 共享可信 UI | 已提取 `TaskRunSheet`（`src/ui/react/tabs/task-run-sheet.tsx`），在唯一 `SidebarAppShell` React root，用同一个 `MyTaskParams` / MyControl / Tokens；「我的」和 Web Flow 两处消费 | 在 Web Flow iframe 内复制 My 的 JSX/DOM，或创建第二 React 根 |
| 唯一控制器 | 原 `TaskWorkbench` 提供可信任务选择、Schema 校验、保存/读回准备、再次检查身份、一次性执行。冻结参数摘要/固定安装 pin/可信网页目标/source epoch | 复制 RunHost、另造执行账本、仅用按钮 disabled 防重 |
| UI-only 打开动作 | 已由原 Bridge/Host 接入 `tasks.configure`，完整签名及准备记录投影见原公开 API；核对已审阅能力、精确安装 pin、真实用户手势、工具身份与撤权后打开共享抽屉，**不执行** | 改写现有 `tasks.open` 管理语义、沙箱传 JS/任意 URL/tabId、虚构受信任点击 |
| 呈现宿主 | 抽屉从现有侧栏/PC 工具 Host 底部上滑，不销毁、导航或重复挂载 Web Flow；`app.html` 也能挂同一可信 overlay | 强制跳「我的」作为最终方案；依赖隐藏的 My Tab dialog 可见 |
| Web Flow UI | 只调用可信抽屉打开入口，复用普通脚本列表；遗留请求保留只读核对/安全取消 | 二次派发已改走 My 的请求、丢弃旧 pending、把原请求 ID/Hash 常驻脚本 Tab |

**关键实现细节：** 执行第二阶段必须仍由可信真实用户激活进入现有 Workbench.run，且每次确认只消费一个准备身份；同次参数/版本/页面/授权发生变更时拒绝启动。不能把 React 中点击后的合成事件传给沙箱模拟 `isTrusted`；不能把“已经打开抽屉”冒充执行许可。该入口是跨应用通用 UI-only 能力，签名与字段只维护在唯一公开 API 文档；不得把固定 Web Flow 特例硬编码进 Host。

## 5. 状态 / 恢复合同

| 情形 | 用户动作 | 禁止 |
| --- | --- | --- |
| 无待确认请求 | ▶ 打开抽屉，参数/JSON，保存准备 | 打开即运行 |
| PREPARED 已核对 | 继续确认 / 安全取消；第二次点击时核对准备身份 | 参数悄悄变动、重建新请求 |
| RUNNING / SETTLING | 查看同次进度；尝试停止 | 双击创建第二 Run |
| UNKNOWN / 缺结果 / 未确认释放 | 查询同一原请求 / 尝试停止 | 超时自动重试、人工点新运行绕过 |
| Authority 明确 settled | 原记录只读；结果不可见时明确提示，后续运行须关闭并打开新配置 | 用结果可见性、全局 slot 或停止 ACK 推断结算 |
| 结果业务 blocked / no_results | 准确呈现实际业务状态 | 把控制器 completed 写成“搜索成功” |

旧手动 Web Flow 的 `webflow.pending.v1`、`recent.v1` 是**恢复定位，不是新共享执行器的事实来源**。新准备归原可信工作台与 Authority 所有，Web Flow 记录页只消费原只读定位投影并打开可信视图，不复制一份“已成功”账本。权限、Task 更新、框架重启、目标文档变化、旧失联实例与新操作必须分别围栏。

**结算与披露分离：** `settled` 来自 Authority 对原准备、匹配持久 Run/Result 和资源释放的核对，或未提交准备的明确取消；它不证明网页业务成功。结果披露仍独立经过原权限/文档检查，可能已结算而结果不可见；未取得结果也不能反推仍占用。新准入仍由原 Authority 围栏决定，不由 UI 或缓存解锁。

**精确身份与只读恢复：** metadata 仅返回当前 App 包/撤权代次和精确 Task 安装 pin 下的原定位；重新挂载可重新发现，不能从 storage 伪造。打开指定原记录时查找不到或身份不匹配即拒绝，不降级成新配置；异步读取前后复核工具安装、启用与授权。可信工作台已持有的原记录在 Task 卸载/停用/Schema 不可用时仍保留原身份及只读参数，只核对或取消/停止原请求，不继承新安装权限。结果拒绝披露不删除原记录，也不触发重放。旧 pending/recent 的缓存释放标记必须回到原 Authority 核对，查找失败继续拒绝新准入；UI-only 打开本身可用，不等于解除执行围栏。

## 6. 最小验收

1. 在「我的」点 ▶ 和 Web Flow 点 ▶，都由相同共享 TaskRunSheet 展示当前真实百度 Schema（含 Boolean 和 JSON 模式）；Web Flow 本身不被销毁；PC 与 Side Panel 可达。
2. 首次点击不产生 Run；阶段一持久保存并读回也不产生 Run；第二次明确可信点击最多提交**一个**原 Run，双击/重复回包不能多派发。
3. 任务在保存到确认之间被更新/撤权，或者百度页面/目标文档发生变化，拒绝启动且保留可读原因。
4. 旧 Web Flow 原请求 UNKNOWN（例如真实 `webflow:fcd2a5b4-…`）不能被新入口绕过；刷新后恢复同一请求，只读核对、不补跑；停止 ACK 不当成资源释放。
5. 「我的」原有脚本运行功能、表单草稿、焦点/IME、历史和 Web Flow 自动五字段候选均无回归。
6. 先做单元/组件与最短真实入口的相关测试，再在用户要求的阶段核对固定编译、正式包、Side Panel/PC 已安装结果；分开报告源码完成、安装状态、真实业务成功。

## 7. 当前完成状态

- **SOURCE_IMPLEMENTED：** 已提交正式 `main` 代码，共享可信抽屉、Host UI-only 打开、工作台两阶段持久准备、精确 Task + 来源应用包/撤权代次快照、二次授权核对与唯一原 RunHost。防重复、My 入口占用、历史 UNKNOWN/无 pending 的旧摘要围栏已增加相应定向测试。参考提交 `38a9aea`、`83231f81`、`ed28c04c`、`e32bcad8`、`eee5e410`、`9cd70776`。
- **SOURCE_PARSED：** 核对过当时的 Web Flow `main.js/model.js`、可信 `task-workbench.js/sidebar-tools.js` 的 V8 语法。静态解析并不证明 Runtime 业务成功。
- **CI_PENDING：** `.github/workflows/webflow-package.yml` 已加入 `my-react-workbench.test.mjs`、Web Flow UI 与 Chromium 模拟 SDK 的新入口断言；新版本仍以 GitHub Actions 实际结束结果为准。旧版 CI 的 `wf-query` 测试确实失败过，不能混报为通过。
- **PACKAGE_READY=NOT_VERIFIED：** Web Flow `tool.config.json` 与正式 `webflow.opendesk-tool.json` 当前已保持 0.3.30 同源 JS/CSS/HTML/依赖代码，但尚无该版本通过原 build/promote 流程的最终 CI 回执。
- **CHROME_TESTED=NOT_TESTED / BUSINESS_ACCEPTED=NO：** 本轮无法核对真实已安装扩展的版本、授权代次和 Side Panel/PC 像素交互；未实际运行百度脚本，不提供虚构 Run/Result/业务成功。禁止自动重放历史 `webflow:fcd2a5b4-c77e-430e-ae7b-1cd2b5e68caa`。
- **最小剩余操作：** 得到并修复 Web Flow 定向 CI 失败（若有）；经原 packager 校验正式同源包；明确核对 Chrome 实际安装版本；用户在真实百度页面点击 Web Flow ▶，验证仅打开与「我的」同一个底部 Sheet，保存不运行、确认一次仅产生一个原 Run，并独立读回 Result/释放状态。离线 Chromium 模拟 SDK 不代替安装验收。


源码已接入共享 TaskRunSheet、Bridge/Host UI-only 入口、原 Authority 准备持久化与一次性 RunHost 准入；metadata 原定位发现、指定记录恢复、结算与结果披露分离均已有定向测试覆盖，不能继续记为仅设计或未实施。

本地补充的可复核覆盖入口（仅记录覆盖范围，本次冲突合并不运行测试，不据此声明最新候选 PASS）：

- [Host 测试](../../../tests/environment/sidebar-tools-host.test.mjs)：私有手势、不重挂载/不执行、精确原定位、非法/越权字段、异步查询中撤权/停用/卸载拒绝。
- [Authority 准备测试](../../../tests/environment/task-run-preparation.test.mjs)：持久准备不执行、一次性准入、身份/文档变化、UNKNOWN 不重放、匹配持久结果与释放、结算不依赖结果披露、精确 App/Task 定位投影。
- [可信工作台测试](../../../tests/environment/task-workbench.test.mjs)：同一原记录恢复、缺失/错误 ID 拒绝、安装失效只读、显式结算与不可见结果、关闭/取消和晚到回包围栏。
- [Web Flow 消费测试](../tests/shared-task-run-sheet.test.mjs)与[旧记录恢复测试](../tests/task-run-recovery.test.mjs)：同步打开、metadata 定位/去重/清除、旧 UNKNOWN 原 read/stop、缓存不当结算回执与共用恢复锁。

**浏览器验证尚未确认完成。** 以上源码和测试覆盖不证明当前固定编译已生效、工具已安装更新、真实 Side Panel/app.html 行为或网页业务成功；本附录不声明 Chrome PASS 或 95+。最小验收清单保留为浏览器核验目标，实际执行结果及剩余项由 leader 在原 execution-plan 统一记录，本次不改该文件。不重放历史请求，不接管并行 owner 的浏览器、watcher 或产物。

## 8. 底部抽屉回归后的架构边界审计（OD-WEBFLOW-MY-RUN-SHEET-UI-REGRESSION-R1）

- **已确认的好处：** 两个入口复用唯一 `TaskRunSheet`、`MyTaskParams` 与原 `TaskWorkbench / RunHost`；本轮仅恢复 UI，不增加第二 Runner、权限数据库或 `tasks.start` 执行通道。
- **尚未解耦的历史耦合：** `src/ui/react/tabs/task-run-sheet.tsx` 仍以 `sheet.source==='webflow'` 决定双阶段按钮；`src/ui/task-workbench.js` 仍包含 `SHEET_KEY/SHEET_LOCK='opendesk.shared-task-run-sheet.webflow.*'`、`source==='webflow'` 条件及 `sidebarToolStorageKey('webflow')` / `webflow.pending.v1` 遗留请求栅栏。这些在本轮恢复前已存在，**不能把未新增耦合说成已经彻底解耦**。
- **安全处理建议：** 保留当前未知结果、旧准备/未释放与跨来源阻断；后续独立通用化为受信执行策略描述和 Web Flow adapter，采取双读/版本化迁移与精确任务身份对账，先测试拒绝路径及并行状态，再删除旧业务标识。绝不能直接删旧 pending 检测、重建准备 ID、重放 UNKNOWN 或把策略提交改造成第二 Runner。此为后续架构债，不混入本轮窄范围视觉恢复。
- **验收否决：** 未取得真实 Chromium/安装版本与新源码定向 Node 绿灯，本轮仅 `SOURCE_COMMITTED`，`UI_CHROME=NOT_TESTED`；涉及完整框架解耦的目标仍为 `PARTIAL`，不得给架构维度虚报 95 分。


与并行开发发生文件冲突时，只处理本目标的独立增量，不覆盖其他 owner、日常 watcher、dist 与历史请求。
