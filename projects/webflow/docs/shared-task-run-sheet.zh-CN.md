# Web Flow「运行」复用「我的」抽屉 · 专项实现附录（2026-11-11）

> 固定检索词：OD-AI-WORKFLOW-BRIDGE。本文是实施附录，唯一需求源仍是 [product-contract.zh-CN.md](product-contract.zh-CN.md)、唯一进度源仍是 [execution-plan.zh-CN.md](execution-plan.zh-CN.md)。**当前 DESIGN_ONLY / NOT_IMPLEMENTED / NOT_TESTED**。可点击演示见 [script-run-shared-sheet.html](../preview/script-run-shared-sheet.html)。

## 1. 最终用户操作（最高优先级）

用户在 Web Flow →「脚本」看到百度/Google 等已安装脚本。点击列表右侧 ▶ **不直接执行**，而是像「我的 → 已安装任务 → ▶」一样，在**右侧打开相同的可信参数运行抽屉**；使用同一 Task Schema、表单/JSON、参数校验、安装身份、网站权限、RunHost 与结果链。不创建第二套外观相似、业务逻辑不同的 Web Flow 运行弹窗。

保留现有脚本列表、收藏/▶/更多和 hover/focus 布局，不再重新设计整个列表。脚本列表只显示异常提示，运行记录负责状态与高级诊断。Side Panel 和 app.html 都应生效，不以切换去「我的」替代最终体验。

## 2. 真实源码与缺口

- 「我的」：`src/ui/react/tabs/tasks.tsx` 的 `openParameters()`；`src/ui/react/tabs/my-page.tsx` 的 `MyTaskWorkspace` 使用 `<dialog id="task-parameters-sheet" class="task-params-sheet">`，包含表单/JSON、关闭保留草稿、焦点和 IME；`my-sections.tsx` 的 `MyTaskParams` 渲染真实 Schema 字段。
- 可信运行控制器：`src/ui/task-workbench.js` 的 `taskRunClick → run()` 校验 `paramsSchema`、version / manifestHash / installationId / generation / 真实网页 / Chrome 权限，调用**唯一原 RunHost**。不复制这个执行方法。
- Web Flow：`projects/webflow/src/ui/main.js` 的 ▶ 当前展开沙箱行内参数，`prepare()` 持久化并读回旧原请求，`run()` 用受审 `tasks.start`。旧 `webflow.pending.v1` 需要继续安全恢复；新可信运行路径不能同时再调用 `tasks.start`。
- 公开 SDK 的 `tasks.open({taskId})` **仅做任务管理/安装审阅导航**，`src/ui/sidebar-tools.js` 严格仅接受 taskId 并可暂停工具，不会打开「我的」运行抽屉。不要冒充已有可复用运行入口。
- `projects/webflow/tool.config.json` 当前是 0.3.27，百度 1.1.5、Google 1.0.3；所查根正式 JSON 仍为 0.3.26。源码、正式包和当前已安装页面必须分别核对。
- 两个搜索 Task 当前真实 Schema 均为：`query` 必填 1–120 字；`limit` 整数固定枚举 3；`showExecutionTab` 可选布尔，默认 true。**通用组件应从 Task Authority/manifest 取得参数，不在框架硬编码百度字段。**

## 3. 正确的双阶段交互

~~~text
Web Flow 脚本列表：[收藏] [▶] [⋯]
  ▶ 真正点击（只打开右侧共享可信抽屉，不启动脚本）
抽屉：与「我的」一致的标题、参数表单 / JSON、目标网站、授权状态
  阶段一：[保存并核对] → 可信来源冻结唯一准备身份、参数、版本、目标，持久化后读回；RunHost 仍未执行
  阶段二：[确认执行一次] → 第二次真实可信用户点击 → 再验同一来源/参数/版本/网站/权限 → **同一 TaskWorkbench / RunHost 至多一次启动**
记录：真实 Run / Result / 资源释放与网页业务结果分开展示
  UNKNOWN：仅只读查询或尝试停止，不创建第二请求
~~~

- 「我的」原直接点击“运行任务”的正常链不能回归。共享的是**同一抽屉组件、参数组件、TaskWorkbench 和 RunHost**；Web Flow 来源使用同一组件的“保存并核对 → 确认执行”配置，不额外调用第二条 RunHost。不得把“从 Web Flow 提交 `tasks.start`”与“调用「我的」`taskRunClick`”都当成最终提交。
- 第一阶段保存前关闭：只保留编辑草稿，不创建执行；保存后关闭：保留同一准备记录，允许继续确认/安全取消；不能重新生成另一个待执行请求。
- 从「我的」或 Web Flow 打开相同任务时须共用运行占用/冲突判断，不允许靠当前 Tab 的局部 state 来防重。旧 Web Flow pending/UNKNOWN 必须与新入口共用冲突保护，防止绕路重复操作。

## 4. 推荐组件与能力边界

| 层 | 建议 | 明确禁止 |
| --- | --- | --- |
| 共享可信 UI | 从 `MyTaskWorkspace` 提取 `TaskRunSheet`（如 `src/ui/react/tabs/task-run-sheet.tsx`），仍在唯一 `SidebarAppShell` React root，用同一个 `MyTaskParams` / MyControl / Tokens；「我的」和 Web Flow 两处消费 | 在 Web Flow iframe 内复制 My 的 JSX/DOM，或创建第二 React 根 |
| 唯一控制器 | 原 `TaskWorkbench` 提供可信任务选择、Schema 校验、保存/读回准备、再次检查身份、一次性执行。冻结参数摘要/固定安装 pin/可信网页目标/source epoch | 复制 RunHost、另造执行账本、仅用按钮 disabled 防重 |
| UI-only 打开动作 | 先核对公开 SDK 是否已有适用入口；若确实缺口，公共 owner 最小增加类似 `tasks.configure({taskId})`（**拟议 API，尚未实现**），经原 `tasks.open` 能力范围、已安装精确 pin、真实用户手势、工具身份与撤权检查后，Host 开共享抽屉，**不执行** | 改写现有 `tasks.open` 管理语义、沙箱传 JS/任意 URL/tabId、虚构受信任点击 |
| 呈现宿主 | 抽屉覆盖在现有侧栏/PC 工具 Host 右侧，不销毁、导航或重复挂载 Web Flow；`app.html` 也能挂同一可信 overlay | 强制跳「我的」作为最终方案；依赖隐藏的 My Tab dialog 可见 |
| Web Flow UI | 只调用可信抽屉打开入口，复用普通脚本列表；遗留请求保留只读核对/安全取消 | 二次派发已改走 My 的请求、丢弃旧 pending、把原请求 ID/Hash 常驻脚本 Tab |

**关键实现细节：** 执行第二阶段必须仍由可信真实用户激活进入现有 Workbench.run，且每次确认只消费一个准备身份；同次参数/版本/页面/授权发生变更时拒绝启动。不能把 React 中点击后的合成事件传给沙箱模拟 `isTrusted`；不能把“已经打开抽屉”冒充执行许可。新增入口属于跨应用通用 UI-only 需求，须按根仓库 Extension Type & Ownership Gate 检查并同步唯一公开 API 文档；不得把固定 Web Flow 特例硬编码进 Host。

## 5. 状态 / 恢复合同

| 情形 | 用户动作 | 禁止 |
| --- | --- | --- |
| 无待确认请求 | ▶ 打开抽屉，参数/JSON，保存准备 | 打开即运行 |
| PREPARED 已核对 | 继续确认 / 安全取消；第二次点击时核对准备身份 | 参数悄悄变动、重建新请求 |
| RUNNING / SETTLING | 查看同次进度；尝试停止 | 双击创建第二 Run |
| UNKNOWN / 缺结果 / 未确认释放 | 查询同一原请求 / 尝试停止 | 超时自动重试、人工点新运行绕过 |
| 同次持久结果 + released | 本次结束，后续重新运行需新意图 | 只凭 completed 或停止 ACK 解锁 |
| 结果业务 blocked / no_results | 准确呈现实际业务状态 | 把控制器 completed 写成“搜索成功” |

旧手动 Web Flow 的 `webflow.pending.v1`、`recent.v1` 是**恢复定位，不是新共享执行器的事实来源**。新来源若归「我的」工作台所有，Web Flow 记录页只呈现原可信只读视图/链接，不复制一份“已成功”账本。权限、Task 更新、框架重启、目标文档变化、旧失联实例与新操作必须分别围栏。

## 6. 最小验收

1. 在「我的」点 ▶ 和 Web Flow 点 ▶，都由相同共享 TaskRunSheet 展示当前真实百度 Schema（含 Boolean 和 JSON 模式）；Web Flow 本身不被销毁；PC 与 Side Panel 可达。
2. 首次点击不产生 Run；阶段一持久保存并读回也不产生 Run；第二次明确可信点击最多提交**一个**原 Run，双击/重复回包不能多派发。
3. 任务在保存到确认之间被更新/撤权，或者百度页面/目标文档发生变化，拒绝启动且保留可读原因。
4. 旧 Web Flow 原请求 UNKNOWN（例如真实 `webflow:fcd2a5b4-…`）不能被新入口绕过；刷新后恢复同一请求，只读核对、不补跑；停止 ACK 不当成资源释放。
5. 「我的」原有脚本运行功能、表单草稿、焦点/IME、历史和 Web Flow 自动五字段候选均无回归。
6. 先做单元/组件与最短真实入口的相关测试，再在用户要求的阶段核对固定编译、正式包、Side Panel/PC 已安装结果；分开报告源码完成、安装状态、真实业务成功。

## 7. 当前完成状态

仅完成架构发现、设计以及离线交互演示；**共享 TaskRunSheet 抽取、可信 Host 打开入口、准备持久化、RunHost 真实接线、浏览器和安装验证均未实施**。与并行开发有冲突时只停止冲突部分，不重复执行历史 Web Flow 任务或其他 owner 的改动。