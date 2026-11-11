> **历史设计提示词，不可直接作为新一轮执行目标**：本文旧版“右侧抽屉”是假设，现以「我的」历史正确版恢复**底部上滑抽屉**。2026-11-11 已提交共享 UI 源码回归修复，真实 Chromium/已安装版本仍待验收。请依照 `OD-WEBFLOW-MY-RUN-SHEET-UI-REGRESSION-R1` 和执行计划最新卡继续，不重复旧组件提取。

# GOAL：OpenDesk Browser · Web Flow「脚本」运行按钮直接打开并复用「我的」可信任务运行抽屉

固定检索词：OD-AI-WORKFLOW-BRIDGE

## 原始产品目标（不可漂移）

仓库：https://github.com/shopable-ai/opendesk-browser
唯一开发分支：main；业务目录：projects/webflow/

用户在 Web Flow「脚本」列表看到已安装的百度/Google 等脚本，点击右侧 ▶，应当**像「我的 → 已安装脚本 → ▶」一样，在当前界面底部上滑打开同一套任务参数运行抽屉**，使用相同的 Task Schema 表单/JSON、同一个 TaskWorkbench/RunHost、真实安装/权限/网页目标校验和持久结果链。不要重设计已有的脚本列表、复制一套表面类似却互不兼容的弹窗，不要跳去「我的」作为最终体验。

Web Flow 来源保留明确的两阶段确认：「保存并核对」只冻结同一个准备身份并持久化读回，不执行网页操作；第二次真实点击「确认执行一次」时重新校验身份/目标/权限，再由**原唯一可信 TaskWorkbench/RunHost**至多派发一次。原「我的」运行按钮保持现有行为不回归。关闭/刷新/未知/停止/撤权/切换容器不能补跑旧请求。

## 开始前必须核对的真实代码与文档

1. `projects/webflow/docs/product-contract.zh-CN.md`、`projects/webflow/docs/execution-plan.zh-CN.md` 是唯一权威需求与执行进度；专项附录 `projects/webflow/docs/shared-task-run-sheet.zh-CN.md`；交互设计预览 `projects/webflow/preview/index.html`。旧版聊天里独立居中弹窗原型已废弃，不能当实现依据。
2. 「我的」真实入口 `src/ui/react/tabs/tasks.tsx` 的 `openParameters()`、`src/ui/react/tabs/my-page.tsx` 的 `MyTaskWorkspace` 与 `task-parameters-sheet`、`src/ui/react/tabs/my-sections.tsx` 的 `MyTaskParams`；可信控制器 `src/ui/task-workbench.js` 的 `taskRunClick→run()`。
3. Web Flow 现有 `projects/webflow/src/ui/main.js`：▶ 当前展开行内参数；`prepare/run/read/stop` 旧链及 `webflow.pending.v1` 遗留恢复仍要兼容。
4. 原 `OpenDeskTool.request('tasks.open',{taskId})` 在 `src/ui/sidebar-tools.js` 只是“我的管理/安装审阅导航”，可能 suspendTool；不是打开参数抽屉，更不是运行。先检查公开 SDK 是否已有更合适的受控 UI-only 接口；没有则在平台原 owner 最小增加通用打开能力，并同步唯一 API 文档，不能直接改成宽权限运行。
5. `projects/webflow/tool.config.json` 当前配置 0.3.27 / 百度 1.1.5 / Google 1.0.3，而历史已生成正式工具 JSON 可能还是 0.3.26。实现前重新读 main 与实际安装来源，不按旧版或猜测覆盖。
6. 百度真实参数来自当前 `paramsSchema`：query 非空 1–120 字、limit 固定 3、showExecutionTab 可选严格布尔（默认 true）；通用抽屉不得硬编码这三项。保留自动候选五字段协议与独立授权，不改 ChatGPT/V2/Markdown/队列功能。

## 本轮要实际完成的工作

- **P0 复用抽屉：** 抽出「我的」现成的 TaskRunSheet + 原表单/JSON/键盘/IME/草稿体验为可信共享组件，仍使用唯一 React Root、一个 MyView/TaskWorkbench、原 tokens。My 与 Web Flow 复用同一个组件，不把特权 React/工作台注入沙箱 iframe。
- **P0 可信打开：** Web Flow ▶ 在真实用户点击期间发起仅“打开抽屉”的受审调用；Host 验证工具实例、安装 pin、权限、目标和授权代次，可信 React overlay 在当前 Side Panel 或 app.html 底部上滑展示，Web Flow 不被导航、销毁或重载；不在打开时创建 Run。
- **P0 两阶段运行：** Web Flow 来源“保存并核对 → 确认执行一次”保持冻结身份/Schema/参数/页面和原持久读回；第二次点击由真实可信手势触发唯一 TaskWorkbench/RunHost。不得同时运行 Web Flow 的 tasks.start 和 My 的 taskRunClick。需要最小可信 prepare adapter 时实现并测试，不写第二套 Runner、Host、任务数据库。
- **P0 历史安全：** 旧 Web Flow 原请求恢复、UNKNOWN 禁重跑、停止之后资源未释放不能解锁；与「我的」已运行/待确认冲突要相互阻塞。运行结果展示必须指向同一原 Run/Result，业务成功和 Controller completed 分开判定。
- **P1 界面整理：** 脚本列表保留 ☆ / ▶ / ⋯ 和 hover/focus，收起重复行内运行配置；“原步骤/保存时任务身份/资源释放”等工程词从脚本 Tab 移至「记录 → 高级诊断」，普通列表只留简洁待核对提示。
- **测试：** 先执行最短真实用户链，再仅针对修改范围运行相关组件/SDK/恢复测试。至少验证 My 与 Web Flow 共用抽屉、表单与 JSON/boolean、双阶段只派发一次、双击、任务身份变化、网页更换、撤权、旧 UNKNOWN、取消/停止/只读查询、Side Panel 与 app.html 及历史 My 行为。不得为了通过测试放松原 Authority 安全规则。
- **交付：** 若代码与测试达到当前阶段门槛，用既有打包器生成候选并按 repo 规则晋升唯一正式 Web Flow JSON；真正的安装 Chrome 验收需有独立证据，不能用 Node/预览冒充。更新产品合同/执行计划的事实状态，保留并行开发的改动。

## 回答要求（语义优先）

先回答：用户点 Web Flow 的 ▶ 是否已经可以从**当前页面底部**上滑打开与「我的」同一可信 TaskRunSheet？能否从参数配置完成一次真实任务执行？哪些步骤已验证，哪些仍未完成？

再给出文件级修改、commit、定向测试与真实运行证据。**不要因为源码已写而宣布真实 Chrome 成功；不要复跑已 UNKNOWN 的旧百度请求**（特别注意历史 `webflow:fcd2a5b4-c77e-430e-ae7b-1cd2b5e68caa`）。若缺口阻塞，仅报告最小受影响部分，继续其他已授权工作。

安排至少五个独立专家维度（产品交互、React 组件边界、Task/权限/信任安全、状态恢复与幂等、测试/部署），每项 0–100 分，再按**算术平均值**计算综合分（不是累加），说明独立反方审计的否决项；设计目标 ≥95 分。分数只表示方案评审，不可充当运行验收或安装证据。