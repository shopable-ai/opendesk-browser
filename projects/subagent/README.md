# Subagent — 独立网页增强产品（开发中）

**正式产品名：Subagent**。正式目录 `projects/subagent/`，项目身份 `opendesk.subagent`。`Mini Chat` 只是第一阶段验证 A→B→A 可行性的轻量 Demo，不是扩展产品名、未来功能边界或 WebFlow 核心功能。用户要求将原 `projects/subagent-mini-chat/` 迁到本目录，历史名称及提交可在 Git 历史中回查。

## 原始产品目标

在 AI 网页当前对话 A 展示一个极简 Subagent 入口；用户输入任务、点击创建 → 经可信任务委托使用**现有 WebFlow 已审阅 Controller Task** 在独立 ChatGPT B 填写并按原授权发送一次 → 等待 B 完整真实回答 → 在 A 的 Subagent Mini Chat 中显示正文及“打开原始对话 B”链接。**不向 A 官方对话框自动发送任何消息。**

第一阶段只做单 A、单 B、一条任务、一个完成结果；未来才可能增加多 AI、子代理并发、管理 UI 等，不能为这些假设改造当前核心。

## 产品所有权（不得混淆）

| 部分 | 真实归属 | 责任 |
| --- | --- | --- |
| `projects/subagent/` | **Subagent 独立产品** | 页面增强、请求状态与结果展示；`src/mini-chat/` 为第一阶段 Demo |
| `projects/webflow/src/tasks/`、`projects/webflow/tasks/` | **WebFlow 既有独立任务/脚本** | ChatGPT B 的 DOM、填写、单次发送与回答采集；不复制、不改原不可变包 |
| Browser Framework / Host / Authority | **通用可信能力** | 权限、固定安装身份、精确 A/B 文档、审阅、Run/Result、只读恢复、撤权与 UNKNOWN 防重放 |

本项目目前是 OpenDesk 管理的 **Page USER_SCRIPT / 网页增强项目**，不是另一个独立 Chrome Extension，也不是另一个 Sidebar Tool。若未来需要专属 PC/Side Panel 设置，应证明必要性后独立评审，不为名称而提前增加空 UI。

## 当前确切进度

- 已有：独立 Page UI 入口、`src/mini-chat/` 的 Shadow DOM/输入/状态/回答展示，`src/contract.js` 受限的 `subagent.task.request.v1` 业务意图，单请求防重复、UNKNOWN 只读、结果身份校验及定向 Node 测试。**这些只是源码与隔离测试，不是业务通过。**
- 正在等待：合法、通用的 Page→固定 Controller Task 委托与原 Run/Result 只读传递能力。现有 Page USER_SCRIPT 不具备 `tasks.run` 授权，网页自定义事件或 `postMessage` 不得作为可信用户触发。缺少真实受信 Bridge 时 UI 必须显示不可用，不能发送或展示虚构结果。
- 未完成：B 的真实创建、输入、授权单发、完整回复、真实 A 页面结果展示；正式构建、安装与 Chrome 端到端验证均未通过。**不得宣布 AC01–AC10 已验收。**

## 实现顺序（避免重复）

1. 先核对已存在的 Bridge、WebFlow 任务、安装者与当前共享工作区；不重复重建 Controller、Runner、Host、数据库，也不接管 WebFlow 原 R8 的 A 官方回填。
2. 若无受支持的通用 Page→Task 接口，由 Browser Framework owner 以证据驱动实现**最小通用委托和只读结果接口**，权限/安装身份/当前真实操作/来源 A 绑定在受信宿主，不在 Subagent 的普通 Page 代码中伪造能力。优先使用已有机制，必要时审阅最小可信 Content Script；不得加 `if (toolId === 'subagent')` 专属核心分支。
3. 原样复用已安装且审核后的 ChatGPT Task 及原 Controller；若旧版本不满足授权策略，新建并审批独立 Task 新版本，**不能静默改已冻结版本**。
4. 用同一 requestId + 原 A tab/document/URL + 原 B tab/document/URL + Run/Result ID 交叉验证；刷新、旧结果、权限撤销和任何发送 UNKNOWN 只能查原记录，不得补发、新建 B 或偷偷发 A 官方消息。
5. 离线模拟先测安全回归；必须另外取证真实 Chrome/Task 安装、真实 B 的单次原生发送、完整回答和原 A UI 展示，才能声明第一阶段完成。

## 测试与验收

在仓库根目录运行：`node --test projects/subagent/tests/*.test.mjs`。此命令只测试纯本地合同/状态，**没有**真实 WebFlow 调用和 Chrome 证据。

AC01～AC10 仍以最初 `OD-WEBFLOW-SUBAGENT-MINICHAT-A-R1` 的业务验收条件为准；分别报告 SOURCE / NODE / BUILD / PACKAGE / CHROME_NATIVE / BUSINESS，未测必须标记 `NOT_TESTED`。

**迁移提示：** 如本机曾手动安装旧 ID `opendesk.subagent-mini-chat`，需先在可信安装器内核对/明确卸载旧实验实例，再安装新 ID，避免同一 A 页面重复悬浮 UI；本轮不进行自动迁移或猜测本机安装状态。

参考既有设计记录：[WebFlow Subagent 技术研究](../webflow/docs/subagent-technical-options.zh-CN.md)（早期命名描述保留历史，不再作为正式产品目录依据）。
