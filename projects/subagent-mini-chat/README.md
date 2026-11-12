# Subagent Mini Chat — 独立页面扩展（首阶段业务底座）

任务：`OD-WEBFLOW-SUBAGENT-MINICHAT-A-R1`。核心目标：用户在 ChatGPT A 页面输入一句话，受信 Host 借 WebFlow 已审阅 Controller Task 创建独立 B、发送一次、核对持久完整回复并回显 A。**本次尚未实现 A→B→A；禁止发布为可用完整功能。**

## 所有权和技术边界

- **Subagent Mini Chat**：本目录独立 `page-userscript`，只拥有 Shadow DOM 页面 UI、用户输入、一次请求状态、回答及 B 链接；UI 仅发送与运行时安装版本无关的业务意图 `subagent.minichat.request.v1`，由可信适配器解析已审阅脚本身份；不能替代 WebFlow 或 Controller。其代码按 OpenDesk Page Program 标准开发，不直接进入 `projects/webflow/src/ui` 或框架 Host。
- **WebFlow 脚本**：复用 `projects/webflow/src/tasks/chatgpt-conversation-create-v0.2.js` 与已冻结的 `projects/webflow/tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json`。`send:true` 在一个经单独审核的 Controller Run 内完成 B 原生发送和回答提取；不复制脚本，不修改旧固定版本或独立授权。
- **可信执行**：现有 Controller / Host / Authority 负责固定安装版本、权限、原生副作用、Run/Result、UNKNOWN 不重放。不能在 Page USER_SCRIPT 中通过 `postMessage`、CustomEvent、DOM、网站 global、Cookie 或模拟 `chrome.runtime` 冒充可信任务入口。

## 已证实的跨组件缺口

当前 `docs/api/page-userscript.zh-CN.md` 明确 Page world 只有 DOM/UI，没有 Controller page、runId/resultId 或直接调用权。`docs/api/sidebar-tools.zh-CN.md` 的 `tasks.start/read` 是隔离 Sidebar Tool 在固定委托清单和真实宿主身份下的 API，**不是 Page USER_SCRIPT API**。Mini Chat 在当前 public SDK 下不能独立安全触发 WebFlow `chatgpt.conversation.create`，也不能可信地拿到同一持久结果。因此 `src/main.js` 只展示页面 UI，并明确标记 `bridge-unavailable`、禁用「创建任务」；**不会用伪回执/演示回答冒充真实功能**。

下一步由 Browser Framework owner 评估 **通用、安装身份绑定的 Page→受审 Controller Task 委托/只读结果通道**，而不是 `if(toolId==='subagent')` 的特例；先复用现有 Task 权限、命令账本、同一 Run/Result、Host 来源 tab/document/epoch 及现有 UNKNOWN 策略。新公共接口需要有固定 Task pin、真实来源 UI 信任、独立发送审批、原结果只读核查、严格 A 与 B 身份映射，并对停用、卸载、权限撤销、刷新、跨站消息伪造和重复点击进行独立测试。未经实现和证明，不允许在 Page 脚本中注入任何模拟 host transport。

## 当前测试和验收范围

`node --test projects/subagent-mini-chat/tests/*.test.mjs` 可验证纯合同：参数长度、任务固定 ID、单次调用、UNKNOWN 不重放、结果证明与 URL 检查。这**不证明**正式 Chrome 注入、可信授权、B 创建、发送或 A 的真实结果展示。

验收依旧需要 AC01–AC10，分别出具 SOURCE / NODE / BUILD / PACKAGE / CHROME_NATIVE / BUSINESS 证据。缺少可信桥且本机 Host 未就绪时状态应保持 `BLOCKED`/`NOT_TESTED`，不能以模型 JSON completed、DOM 文本稳定或自动化 mock 替代真实成功。
