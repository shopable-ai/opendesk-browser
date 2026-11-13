# Subagent — 独立网页增强产品（开发中）

**正式产品名：Subagent**。正式目录 `projects/subagent/`，项目身份 `opendesk.subagent`。`Mini Chat` 只是第一阶段验证 A→B→A 可行性的轻量 Demo，不是扩展产品名、未来功能边界或 WebFlow 核心功能。用户要求将原 `projects/subagent-mini-chat/` 迁到本目录，历史名称及提交可在 Git 历史中回查。

## 原始产品目标

**R2.8 最新实测（2026-11-13）：** 原安装器已成功安装 0.2.0/r1，随后按用户授权的专家判断，将 Subagent 更新为 **0.2.1/r2，精确委托已安装 WebFlow Task 0.2.2**；安装身份不变、授权 generation=2、注册有效。原 A Mini Chat 已创建真实请求，原工作台已保存并读回 `{prompt:"请介绍 WebFlow 的三个主要优势。",send:true}`。用户已批准这一次发送，但开发服务重载后，原准备投影为 `unknown`、`approvalAllowed:false`，因此未点击执行；`runId/resultId` 均为 null，B 未创建，全文尚未回 A，业务仍 **BLOCKED**。保留原请求，不补发或另建请求。定向 48/48 + 6/6 + 来源 pin 1/1 PASS。[R2.8 当前证据](evidence/r2.8-20261113/README.md)取代 [R2.7 安装失败观察](evidence/r2.7-20261113/README.md)作为当前状态；历史记录不改写。

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

- 当前候选及已安装 Page 为 **Subagent 0.2.1/r2**。`src/main.js` 已接入正式安装时才提供的 `@opendesk/tasks` 客户端；`src/transport.js` 只提交待审批请求、恢复和查询原请求。未安装、开发预览或旧 Browser 无此能力时仍禁用，不使用网页事件兜底。
- Page 安装 scope 固定委托 **`chatgpt.conversation.create@0.2.2`**，同时绑定原不可变包的 manifest/source hash，可信结果消费者也只接受该版本。原 Task 必须分别安装、启用并取得网站权限；这不是修改 WebFlow Sidebar Tool 的 delegatedTasks，也不是继承 R8/R11 的发送授权。0.2.2 已由原工作台解析为 installation `aa3663d9-8f52-4008-8092-b66aa5489027` / generation=3；下文 R2.3 的 0.2.0 调用图与 pin 仅保留历史。
- 原 TaskWorkbench 已支持来自 Page 的冻结参数审阅和独立 owned 目标；“保存并核对”之后，真实用户“确认执行一次”才进入原 Controller。原 Page 安装、授权代次、来源 A tab/frame/document/URL 在准备、提交和读取时复核。
- `trusted/page-task-result.js` 已注册到原 SW 的通用结果投影入口，调用 `trusted/result.js` 与既有 WebFlow Adapter，从原 Run/Result 取得完整 `replyText`。不使用 500 字预览，不调用向 A 官方聊天发送的交付路径。
- 单请求恢复、迟到 ACK、并发读取、SPA 退役、撤权后重新授权不能另建请求，以及原审批 UI 已有本轮 Node/React fixture 证据。公共能力合同见 [Page USER_SCRIPT API](../../docs/api/page-userscript.zh-CN.md)。**源码接线和模拟测试不等于真实 Chrome 业务成功。**
- 原 Browser production 构建及原包验证器的 131 资源 / packageHash `0b49abaabba5aa5a3d79f591dd31f331d316788f1fa0e392765e5f4d7e99cca0` 是历史证据。R2.8 复用原持续开发 watcher 和 `dist/development`，原构建器与 Page 打包器生成 0.2.1/r2 后，通过原安装器安装并读回；draft 仍保留 `BUILT_UNVERIFIED / installable:false`，未伪改生命周期。真实 Page 安装与 production 验收分别报告。
- 未完成：原请求安全恢复后的真实 B 创建及单次发送、真实完整回复、A 页面回显和链接核验。当前阻断是原准备在浏览器会话变化后只读，而非 R2.7 的安装失败；用户的单次发送批准已取得，未消耗，也不能绕过原请求栅栏。未复测 connector 的历史 429，不将其作为当前浏览器阻断。AC01–AC10 无整体业务 PASS。

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

## R2.3 · 真实双入口调用图与最后一公里验收（2026-11-13；`OD-SUBAGENT-A2B2A-SCRIPT-WIRING-R2-3`）

**原始目标仍是：** 在 ChatGPT 原对话 A 的 Subagent Mini Chat 输入任务 → 可信安装和一次明确审批 → 复用 WebFlow 已冻结的 `chatgpt.conversation.create@0.2.0` 和原 Controller 创建独立 B → 官方 B 填写、读回、单次发送、等待完整回答 → 校验原 Durable Result → 在 **A 的 Subagent 自有区域**只读展示全文及真实 B 链接；不向 A 官方 ChatGPT 自动发消息。WebFlow 的“官方 AI 回复 JSON 候选 → 固定 Task → 原独立授权交付”属于另一入口与交付合同，不能假扮成 Subagent 的点击，也不能因 Subagent 运行而自动授权 A 官方发送。

**本段证据等级：** 以 GitHub `main@90938be4bc87983c8f245c269bb1a7a04c28b01c` 的源码和原 R2 证据静态核查为准。CodexPro 本机工作区不可连接，OpenDesk 本机 Code/Browser Core 返回 429；不代表本机工作树、安装状态或真实 Chrome 已核对。未修改冻结 Task 源码、通用 Runner 或另一条 WebFlow 交付逻辑。

### 双入口映射（同一安装任务、不同授权与交付）

```text
入口一：WebFlow 原官方 AI JSON 候选（独立保留，当前无原生 PASS）
  ChatGPT A 官方助手完整回复中的 webflow.task.intent.v1 五字段 JSON
  → projects/webflow/src/task-intent-contract.js#validateWebFlowTaskIntent
  → src/native-agent/chatgpt-fixed-bridge-host.js#assertIntent
     / src/native-agent/chatgpt-bridge-trigger-gate.js（真实来源、候选/授权 Ledger）
  → src/page-events/web-task-ingress.js#createWebTaskIngress（原可信准入）
  → 原已安装 Task pin / Authority / Controller / Durable Result
  → 原 WebFlow 交付器（A 官方输入/发送须走该路径自身独立批准；未由本轮授权）

入口二：Subagent 原 A Mini Chat 的真实点击（R2 源码已接线）
  projects/subagent/src/mini-chat/view.js#renderMiniChat
  → projects/subagent/src/mini-chat/model.js#createSession.create
     （subagent.task.request.v1：protocol/requestId/prompt，单 requestId）
  → projects/subagent/src/transport.js#createMiniChatTransport.start
     （映射到 taskId=chatgpt.conversation.create，params={prompt,send:true}）
  → src/scripting/user-scripts/page-tasks.js#createPageTaskClient
  → src/scripting/user-scripts/page-task-runtime.js#installPageTaskRuntime.request
  → src/scripting/user-scripts/installed-programs.js#handlePageTaskBridge
     （实证 sender、已安装 Page、nonce/world、A tab/frame/document/URL、权限）
  → src/platform/host/broker.js#createFoundationBroker
  → src/platform/host/controller-methods.js#handlePageTaskRequest
     （校验固定 pin 与真实已安装 Task；原 commandJournal 持久 pending 审批）
  → src/ui/task-workbench.js#refreshPageTaskRequests / openPageTaskRequest
     （原 TaskRunSheet 冻结参数；用户「保存并核对」「确认执行一次」）
  → src/platform/host/controller-methods.js#prepareTaskRun / startControllerRun
     → #createOwned（原 Controller 一次性建 inactive 独立 B）
  → projects/webflow/tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json
     → projects/webflow/src/tasks/chatgpt-conversation-create-v0.2.js#main
        （B 根页无旧草稿 → fill → readback → send:true 独立批准后 click 一次
         → 真实 /c/ URL → 用户/助手消息身份 → 完整回复与稳定终态）
  → 原 Controller Run/Result/Codec/commandJournal（不新建另一份结果）
  → src/platform/host/controller-methods.js#handlePageTaskRequest(read)
     → #pageRequestStatus / #snapshotControllerRunInScope
  → src/sw.js 注册 projects/subagent/trusted/page-task-result.js
     #projectSubagentPageTaskResult
  → projects/subagent/trusted/result.js#createSubagentResultReader.read
     → src/native-agent/chatgpt-fixed-bridge-host.js#verifyChatGPTTaskDurableResult
        → projects/webflow/trusted/chatgpt-result-adapter.js（0.2.0 业务结果核验）
  → projects/subagent/src/transport.js#createMiniChatTransport.read
  → projects/subagent/src/mini-chat/model.js#createSession.read
  → projects/subagent/src/mini-chat/view.js#paint
     （只向 A 的 Shadow DOM answer.textContent 写全文，展示真实 B URL）
```

**边界说明：** 原 WebFlow `attestChatHandoffBReply()` 是另一条 chat-handoff 工作流的只读凭据生成器；Subagent **没有直接调用它**，而是共享 `verifyChatGPTTaskDurableResult()` 和已审阅 WebFlow 0.2.0 Result Adapter。两个入口不共用“候选来源”或“A 交付权限”，但都依赖原 Task Registry/Authority/Controller/Run/Result。0.2.0 以原 Controller `owned` 新标签打开根 URL，不直接点击官网“新对话”，应按独立会话结果验收而非强制改变冻结脚本。0.3.0 PREPARE/SUBMIT 另有合同，不得自动替换。

### 源码复用、安装身份及实测边界

| 链路 | 现存真实消费者 / owner | 当前判定及验证 |
| --- | --- | --- |
| Mini Chat 请求、恢复、回显 | `projects/subagent/src/{main,transport,contract}.js`、`src/mini-chat/{model,view}.js` | **REUSE / SOURCE_WIRED**；R2 原记录 Subagent Node 48/48；真实 A 点击/显示 **NOT_TESTED** |
| 已安装 Page 委派与批准 | `src/scripting/user-scripts/{page-tasks,page-task-runtime,installed-programs}.js`、`src/platform/host/{broker,controller-methods}.js`、`src/ui/task-workbench.js` | **REUSE / SOURCE_WIRED**；不能把 `accepted` 当 Run 成功；本机真实安装/审批 **NOT_TESTED** |
| 固定 Task 与独立 B | `projects/subagent/package.json` 声明 pin；原 WebFlow 0.2.0 manifest + 源码；`controller-methods.js#createOwned` | **REUSE / SOURCE_WIRED**；实际已安装 Task 版本、B tab、send 次数 **UNKNOWN / NOT_TESTED** |
| 原持久结果与结果消费者 | `src/sw.js` 固定注册 Subagent projection；`projects/subagent/trusted/{page-task-result,result}.js`；原 Result verifier/Codec | **REUSE / SOURCE_WIRED**；返回 `replyText` 而非 500 字预览；真实完整 B 回答及 A 显示 **NOT_TESTED** |
| WebFlow JSON 老入口与原交付 | `projects/webflow/src/task-intent-contract.js`、原 `chatgpt-fixed-bridge-host`/trigger gate、`web-task-ingress` | **REUSE / VERIFY**；本轮未改/未执行原生回归；不能据此宣称旧 WebFlow 业务 PASS |

安装 pin：`chatgpt.conversation.create@0.2.0`，`manifestHash=0402cbea8284f87bd3cc63c73b453530be1338cd511c30671957a919678ab146`，`contentHash=90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c`，目标 `https://chatgpt.com/`，请求 `{prompt,send:true}`；**pin 仅是候选声明，不是本机已安装或发送批准**。

原 R2 历史证据：Subagent Node **48/48 PASS**；Browser production BUILD/package verify **PASS**（131 资源、`packageHash=0b49abaabba5aa5a3d79f591dd31f331d316788f1fa0e392765e5f4d7e99cca0`）；Subagent Page **BUILT_UNVERIFIED / installable:false**；真实安装与 Chrome A→B→A 全部 **NOT_TESTED**。这些回执对应原候选，**不是本段新运行**。本轮远端 HEAD 的宽范围 CI 仍有其他失败，须逐条区分原有回归与本任务差量，不能称“全仓通过”。

**唯一后续关键步骤（先验安装，再真实业务）：** 本机通道恢复 → 只读核对 `main`、dirty/owner、实际 Chrome 扩展 ID、原 Page/Task 安装身份及授权 → 通过原安装器提升/安装 Subagent 0.2.0 和固定 Task 0.2.0，取得真实 `installationId/generation/hash` → A 真实点击、原审批明确同意 `send:true` 一次 → 记录 B tab/document、真实消息身份、原 Run/Result、完整 `replyText`、B URL 与 A Mini Chat 显示 → 验刷新/撤权/丢 ACK/错 A/B 和 WebFlow 独立路径。任何发送或结果 UNKNOWN **只读核对原请求，不重新点击发送，不创建 B2**。AC01–AC10 仍全部 `NOT_TESTED`，不能因本调用图升级为完成。
