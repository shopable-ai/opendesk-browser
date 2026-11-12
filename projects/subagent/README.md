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

- 当前候选为 **Subagent 0.2.0**。`src/main.js` 已接入正式安装时才提供的 `@opendesk/tasks` 客户端；`src/transport.js` 只提交待审批请求、恢复和查询原请求。未安装、开发预览或旧 Browser 无此能力时仍禁用，不使用网页事件兜底。
- Page 安装 scope 固定委托 **`chatgpt.conversation.create@0.2.0`**，同时绑定原不可变包的 manifest/source hash。原 Task 必须分别安装、启用并取得网站权限；这不是修改 WebFlow Sidebar Tool 的 delegatedTasks，也不是继承 R8 的发送授权。
- 原 TaskWorkbench 已支持来自 Page 的冻结参数审阅和独立 owned 目标；“保存并核对”之后，真实用户“确认执行一次”才进入原 Controller。原 Page 安装、授权代次、来源 A tab/frame/document/URL 在准备、提交和读取时复核。
- `trusted/page-task-result.js` 已注册到原 SW 的通用结果投影入口，调用 `trusted/result.js` 与既有 WebFlow Adapter，从原 Run/Result 取得完整 `replyText`。不使用 500 字预览，不调用向 A 官方聊天发送的交付路径。
- 单请求恢复、迟到 ACK、并发读取、SPA 退役、撤权后重新授权不能另建请求，以及原审批 UI 已有本轮 Node/React fixture 证据。公共能力合同见 [Page USER_SCRIPT API](../../docs/api/page-userscript.zh-CN.md)。**源码接线和模拟测试不等于真实 Chrome 业务成功。**
- 原 Browser production 构建及原包验证器已通过，131 个资源，packageHash `0b49abaabba5aa5a3d79f591dd31f331d316788f1fa0e392765e5f4d7e99cca0`，构建期间来源无漂移。Subagent 原 Page 构建仍为 `BUILT_UNVERIFIED / installable:false`，待原生验证和正式安装；不能把 Browser 包验证等同于 Page 已安装。
- 未完成：当前候选的正式安装、真实 B 创建及原生单次发送、真实完整回复、A 页面回显和链接核验。OpenDesk 本机 Browser Core / Code 通道复查仍为 `UNAVAILABLE / 429`，没有本轮安装版本或 A/B Run/Result。AC01–AC10 尚无本轮真实 Chrome PASS。

## 实现顺序（避免重复）

1. 先核对已存在的 Bridge、WebFlow 任务、安装者与当前共享工作区；不重复重建 Controller、Runner、Host、数据库，也不接管 WebFlow 原 R8 的 A 官方回填。
2. 若无受支持的通用 Page→Task 接口，由 Browser Framework owner 以证据驱动实现**最小通用委托和只读结果接口**，权限/安装身份/当前真实操作/来源 A 绑定在受信宿主，不在 Subagent 的普通 Page 代码中伪造能力。优先使用已有机制，必要时审阅最小可信 Content Script；不得加 `if (toolId === 'subagent')` 专属核心分支。
3. 原样复用已安装且审核后的 ChatGPT Task 及原 Controller；若旧版本不满足授权策略，新建并审批独立 Task 新版本，**不能静默改已冻结版本**。
4. 用同一 requestId + 原 A tab/document/URL + 原 B tab/document/URL + Run/Result ID 交叉验证；刷新、旧结果、权限撤销和任何发送 UNKNOWN 只能查原记录，不得补发、新建 B 或偷偷发 A 官方消息。
5. 离线模拟先测安全回归；必须另外取证真实 Chrome/Task 安装、真实 B 的单次原生发送、完整回答和原 A UI 展示，才能声明第一阶段完成。

## R2 起点差量核对（2026-11-12；保留历史）

- **T01 = SDK_GAP_CONFIRMED（当前公开 Page v1）**：`docs/api/page-userscript.zh-CN.md` 未开放 Task 启动或 Durable Result 读取；`src/main.js` 调用 `renderMiniChat(ui)` 而未传入 transport；`src/page-events/content-bridge.js` 的网页 `CustomEvent` 仅可传受限查询/候选数据，不能证明安装者身份、用户审批或授予 `tasks.run`。不能通过让 Page 伪造事件来修复。
- **T02/T03 = 脚本已有、执行入口未接线**：`projects/webflow/src/tasks/chatgpt-conversation-create-v0.2.js` 实现新 B、原生草稿核对和一次 `send:true`；但 `projects/webflow/tool.config.json` 当前委派任务只有百度/Google，不能宣称这个 ChatGPT Task 已获 Subagent 委派或当前 Chrome 已安装。脚本 0.3.0 是另一条受审 PREPARE/SUBMIT 路线，未经授权不得替换。
- **T04/T05 = 完整业务回填未接通**：`projects/webflow/src/chatgpt-conversation-result.js` 的 `replyPreview` 最多 500 字；真正完整的 `replyText` 在原 Durable Result，Subagent 只能经受信 Host 读取后显示。Subagent `verifiedResult` 已补齐标准 UUID 形式 B 链接、不同原生消息身份、64 KiB **UTF-8 字节**上限的校验与定向回归（提交 `6cefbe14`、`501682ab`），**未证明真实结果投递**。
- 以上是本轮开始前的源码缺口，不是当前 transport 状态；后续实施见前面的“当前确切进度”。正式安装、原生发送及 A 回显仍是 `NOT_TESTED`，不得把历史或 Node 证据提升成业务通过。

## 已接线的执行边界

1. 同一 A 的 Mini Chat 在真实点击中生成一个逻辑 UUID；固定加载器在唯一 USER_SCRIPT world 中提供请求能力，普通网页不能选择 Host、安装或执行 nonce。
2. 原 `commandJournal` 保存来源与固定 Task/参数/目标。消息 ACK 或 UI 提示丢失后只读取原记录，不另建数据库、Runner 或 Controller。
3. 原可信 TaskRunSheet 显示来源、固定版本、只读输入和新建独立网页目标，执行依然经过原 Task 准备与一次性准入。
4. 固定 SW 项目适配器验证原 preparation/request/run/result、Task 安装、owned B 保留身份、真实消息 ID、完成及释放状态，向合法原来源投影完整回复。
5. 新合法 A 文档只能恢复同一请求；旧审批来源不会被新 document 替换。原来源槽在撤权、重新授权、升级和重装后仍保留；新授权不能读取旧结果，也不能自动分配替代请求。

本阶段没有“重试发送”或“再建一个任务”按钮。完成或取消也不自动清空来源槽。结果只以纯文本显示在 Subagent Shadow DOM 中。

## 测试与验收

在仓库根目录运行：`node --test projects/subagent/tests/*.test.mjs`。当前 48 项覆盖模型、结果消费、生产投影、transport 与紧凑 UI；此命令仍是 Node/DOM fixture，**没有**真实 ChatGPT 调用和 Chrome 证据。

AC01～AC10 以当前 `OD-SUBAGENT-CHAT-A2B2A-R2-TRUSTED-CLOSURE` 的业务验收条件为准；分别报告 SOURCE / NODE / BUILD / PACKAGE / INSTALL / CHROME_NATIVE / BUSINESS，未测必须标记 `NOT_TESTED`。构建日志、回归失败、基线对比与完整本轮结论见 `evidence/trusted-closure-r2-20261112/`。

**迁移提示：** 如本机曾手动安装旧 ID `opendesk.subagent-mini-chat`，需先在可信安装器内核对/明确卸载旧实验实例，再安装新 ID，避免同一 A 页面重复悬浮 UI；本轮不进行自动迁移或猜测本机安装状态。

参考既有设计记录：[WebFlow Subagent 技术研究](../webflow/docs/subagent-technical-options.zh-CN.md)（早期命名描述保留历史，不再作为正式产品目录依据）。
