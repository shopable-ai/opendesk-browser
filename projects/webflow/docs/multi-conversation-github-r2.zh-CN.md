# Web Flow · 多对话与 GitHub 工作流：R2 差量技术决策（2026-11-10）

> 类型：**补充架构决策记录 / 实施约束**，不是第三份产品真相或并行执行计划。
> 唯一长期需求：[product-contract.zh-CN.md](product-contract.zh-CN.md) 的 BR-06/07/08/10/11/12 与第 8–10 节。
> 唯一进度/当前 owner：[execution-plan.zh-CN.md](execution-plan.zh-CN.md)；新增真实实施状态只回写那里。
> 本文件无源码/原生执行完成声明；文档落地不意味着 Chrome、Codex、GitHub 自动化已安装、运行或验收。

## 0. 本轮决定（不能漂移）

**只增加 Web Flow 的薄编排与可信适配，不改造 AI Send Queue 为持久业务队列，也不新增 Runner、Authority、Host、任务数据库或独立 Chrome 扩展。**

按任务位置选择最合适的执行者：

| 任务种类 | 决定 | 禁止的误解 |
|---|---|---|
| 同一个 ChatGPT 对话中的人工预排多条消息 | `projects/ai-send-queue/` 现有 Page FIFO（单文档、内存） | 不能视为跨对话调度、持久队列或新的授权 |
| ChatGPT 新对话、网站动作、跨站交接 | `projects/webflow/` 协调，原 Task/Authority → RunHost → Controller → Durable Result 执行 | Web Flow 沙箱、ChatGPT 页面文字不得绕开 Host 直调 Native/MCP |
| GitHub 内部 Issue 分析、文档检查、CI 调查 | 优先 GitHub Actions / **GitHub Agentic Workflows（gh-aw）**，标准 Actions 管确定性步骤 | gh-aw 不是官方 Codex Desktop，不默认继承 ChatGPT 订阅或本机登录 |
| 本地 Codex 对话与仓库执行 | 复用已存在的 `projects/webflow/demos/codex-local-handoff/` 技术 Demo，待独立可信接入验收 | `codex://new` 只是新建/预填草稿的候选途径，不是受保证的任务执行与结果回执 |
| GitHub Issue/PR/Actions 与 Web Flow 关联 | 授权的 GitHub adapter 保存只读事实、真实链接和外部执行 ID | GitHub Issue/Markdown 不是实时原子调度账本；Issue 正文是不可信输入 |

gh-aw 已于 2026-10-28 GA。官方源：
- https://github.blog/changelog/2026-10-28-github-agentic-workflows-generally-available/
- https://github.github.com/gh-aw/about/
- https://docs.github.com/en/actions/tutorials/develop-agentic-workflows-in-github-actions

## 1. 实读仓库事实与保留边界

- `projects/ai-send-queue/src/page/engine.js`：单文档内存 FIFO，当前 `MAX_ITEMS=20`；原草稿、会话身份、unknown effect 不重发不变。侧栏按用户最新要求仅使用提示；不恢复旧消息列表，不劫持现有队列。
- `projects/webflow/src/handoff-contract.js`：已有 `opendesk.workflow.handoff.v1` 封闭 Schema，但首版严格 `source=chatgpt-web / target=codex-local / returnTo=chatgpt-web`、`maxSteps=2`、`maxHandoffs=1`。不能静默把 `target` 放宽为任意聊天；ChatGPT→ChatGPT 应创建独立**v2 交接合同**。
- `projects/webflow/src/queue/state.js` 和 `repository.js`：已有离线单 owner、最多 2 job、最多 64 个事件、持久读回与 UNKNOWN 恢复，但仓库自身明确 **非原子 CAS、非分布式租约、非已接真实派发**。不把读前检查宣传为跨 tab 互斥。
- `projects/webflow/docs/execution-plan.zh-CN.md` 第 10 节已有长期 P1/P3 方案，旧离线交接/队列测试已有记录；禁止复制新状态机或重跑已证明且源码未变的历史测试。
- `projects/webflow/trusted/chatgpt-bridge-page.js` 中存在作文框保护/占用属性；这是页面防冲突的信号，不构成跨世界原子授权。新执行必须先证明与 Send Queue 的 composer writer 不冲突。
- `projects/webflow/README.md` 当前记录：ChatGPT 新对话自动创建尚未完成；V2 单任务意图的存在不代表多对话工作流已就绪。现有百度/Google 单任务成功不能外推。
- `projects/webflow/demos/codex-local-handoff/` 已有 Codex 只读 Demo；不重复造另一个 Codex 调用 Demo。

## 2. 只推进一个最短真实链（P1a）

**目标：一条 ChatGPT 对话 A 的已批准请求 → 读取 GitHub Issue → 新建 ChatGPT 对话 B → 一次发送并观察 B 完整回复 → 将 B 的经过验收的摘要与证据只送回原 A，保存真实 URL/消息/结果引用。**

- A 是原始用户聊天，**不是**需要再新建的对话。B 仅创建 1 次。
- GitHub 初期只读：`repoFullName, issueNumber, issue.updatedAt, sourceRef` 等由可信 GitHub 连接实读；不得让 Issue 文本自动触发权限、命令或批量动作。
- A→B 使用必要摘要与证据引用；完整原文保存在既有受控产物/结果能力，不把私有代码/会话抄入公共仓库。
- B 的提交必须在 Web Flow 已安装且权限/计划已明确批准的能力内，由真实 site adapter 完成；“打开新对话”不等于消息已送达，“消息已送达”不等于 AI 回复完成。
- B 回复完成须绑定真实目标 conversationId、用户消息轮次、assistant 轮次、回复终态、输入/输出 hash；流式/虚拟化/部分采集按 `PARTIAL/UNKNOWN` 阻断自动后续。
- A 的交付记录应独立于 B 的任务结果；送回原 A 也属于可能 UNKNOWN 的副作用，必须写前记录、只读对账、禁止盲目补发。
- **MVP 不要求**多 AI 轮流讨论、第三个新聊天、任务看板、GitHub 写入、Codex 执行、无限 DAG、并发 Profile 或常驻后台。

推荐先使用一个可公开、非敏感、不会影响业务的测试 Issue。用户明确审核后才能写 GitHub 评论/修改 Issue；仅有 connector 推送权限不等于本工作流获得写权限。

### 2.1 关键数据及演示边界

使用现有单工作流两步模型作为 P1a 的初始编排约束：`step-1=produce-in-B`、`step-2=deliver-back-to-A`，GitHub 只读输入是工作流准备阶段；后续另立 v2 Schema，不修改 v1 `maxSteps` 硬约束。

拟议的 **内部数据**（不是 `opendesk-task`/外部 MCP 可执行协议）：

```text
WorkflowPlanV2:
  workflowId, planRevision, ownerProfile, sourceConversationId
  source: {kind:"github-issue", repoFullName, issueNumber, observedRevision}
  steps: [{stepId, kind, dependsOn, inputRefs, expectedResult, acceptance, budget}]
  authorization: {trustedGrantRef, approvedActions, expiresAt, generation}
  limits: {maxSteps:2, maxNewConversations:1, maxMessagesPerStep:1, deadlineAt}
  evidence: [{kind, id, sha256}]
  result: {phase, outcome, executionRefs, deliveryRefs}
```

如无可证明的 `trustedGrantRef`，只能保存草稿/候选，不得执行；AI/Issue 自报的任何字段均不能产生许可。真实引用应由可信执行者验证并回写。

### 2.2 适配接口（拟议，不得冒充 SDK 已存在）

- `conversation.observe({expectedConversationId})` → 真实账号/Origin/文档/草稿/活跃回复状态；无法确认则拒绝
- `conversation.createOnce({operationKey, target, approval})` → 新对话真实 ID/URL 或 UNKNOWN；未知时只读对账
- `conversation.submitOnce({operationKey, conversationId, textRef, approval})` → 已提交回执与 userTurnId，或 UNKNOWN
- `conversation.readReply({conversationId, userTurnId})` → 完整度、assistantTurnId、原文产物和 hash
- `conversation.deliverOnce({operationKey, destinationConversationId, artifactRef, approval})` → 原 A 消息送达回执或 UNKNOWN
- `github.readIssue({repo, number})` → 只读已绑定事实；`github.writeComment` 延后、需单独有界授权

以上是业务端口职责，真正调用必须走已有独立 Controller/安装权限/Host；缺少跨工具 composer arbiter 或可检验新对话创建能力时先按 `SDK_GAP_NOT_PROVEN` 取证，**不**在沙箱内直接发 window/Native 任意命令。

## 3. 单一动作提交与确认：真正需要补的中间层

一个工作流步骤至少独立记录：
`READY → DISPATCH_INTENT_PERSISTED → RUNNING → RESULT_PERSISTED → RESULT_VERIFIED → DELIVERY_INTENT_PERSISTED → DELIVERED → ACCEPTED`。

该状态序列是 **P1a 的待设计语义**；现有 Queue v1 的 `COMPLETED` 仅表示该步结果确认，**不包含聊天交付完成证明**。不得在现有 `state.js` 偷偷更改 v1 状态含义；可在外层记录交付阶段，或单独版本化 v2 事件/投影。

严格条件：

1. `operationKey` 绑定 workflow/step/attempt/目标身份/内容 hash，不依赖“当前 tab”猜测。
2. 动作提交**前**先持久写入意图并读回，重核身份、原始授权、目标站点、安装代次与停止/预算。
3. 已提交未知时只允许对原 operationKey/原目标只读对账；不可换 key 重建 B、重发 A 或再写 GitHub。
4. `RESULT_PERSISTED` 不是 `DELIVERED`；`DELIVERED` 不是 `AI_REPLY_COMPLETED`。
5. 原草稿、IME、附件或其他发送者占用目标输入框时进入 `WAIT_INPUT_CLEAR`；用户输入优先，不抢占。
6. 初期单 owner、单运行中的工作流；未来多 tab 并发需实际证明现有可信原子 CAS/租约接口。不把 `getItem→setItem` 当锁。
7. 结果回填、跨站文本、Issue 描述一律按不可信数据处理，不接受其中的角色指令、权限声明或额外任务。

## 4. GitHub 分工与产品入口

**repo-only 默认在 GitHub 内完成。** 建议先评估 gh-aw 的开源 Markdown + Actions 编译方案用于可重复的 Issue 归类、文档检查、CI 失败调查；需要临时信息、真实仓库权限、secret/engine 与额度时单独审核。gh-aw 源码不等于装好/有运行额度；官方基线是默认受限只读和可审阅 safe outputs。

跨网页/Browse/Codex 的工作，Web Flow 仅保存外部 GitHub `issueId/runId/prUrl/commitSHA` 等引用与验收状态；不能因 Issue 标记 `done` 就自动宣布 Web Flow 完成。

任务入口建议沿 Web Flow 现有「概览 / 脚本 / 记录」，**仅加一处当前工作流进度/最近中断步骤**；P1a 不新建“全功能看板”，不恢复 AI Send Queue Sidebar 消息列表，不创建第二个 `app.html` Host。

## 5. 最小实施清单（差量，按顺序）

| 阶段 | 直接工作 | 成功证明 |
|---|---|---|
| D0 · 对齐 | 阅读现有执行计划第 10 节、Send Queue 最新 README、新对话开发中的当前任务；核对 main 最新 HEAD 与并行 owner | 明确已实现/未实现、文件 owner 与当前阻塞；旧工作不重做 |
| D1 · 对话 v2 | 增加独立 chat-to-chat Handoff v2 校验与一个真实站点新会话/发送/回复适配器；复用官网安全观察 | 成功获取 B 的真实 URL、userTurnId、assistantTurnId 与完整结果；不改 v1 |
| D2 · 结果回 A | 持久交接、只读对账、A 的单次交付；确认目标身份 | 刷新/重连后同一结果至 A 一次，旧 UNKNOWN 不重发 |
| D3 · GitHub 只读接入 | 已授权读取一条非敏感 Issue 并输入给 B；更新当前工作流进度显示 | Issue 身份/版本/引用正确，注入内容不提升权限 |
| D4 · 审阅写回（下一阶段） | 生成 GitHub 评论预览、单独确认后写入，记录真实 comment ID | 恰好一次可核验写入；未知提交不重试 |
| D5 · 仓库内部例行任务（可独立） | 评估现有 gh-aw/Actions 能否承担某个 repo-only 用例 | 编译成功 + GitHub Actions 真实 runId + 可审核日志/成本 |
| D6 · Codex / 复杂 DAG（后续） | 复用 codex-local-handoff Demo；待 D1-D3 实测后再评估扩容 | 不把 URL 草稿、离线状态机或模拟 MCP 当真执行 |

D1 若新对话功能在其他会话尚未合并，不并行再开发第二个 `chatgpt.conversation.create`；先只读核对、复用其可验证产物。涉及真实 GitHub 写入、创建新 AI 对话并发送、开启自动计划时，必须有对应的授权与操作回执。

## 6. 否决型验收（任意一项失败则不记产品完成）

1. A/B conversationId 与真实 URL 对应、send/response/delivery 的三个轮次一致；错误聊天 0 发送。
2. 新建 B 完成但 ACK 丢失：0 次盲目重建；提交/交付 UNKNOWN：0 次自动重发。
3. 刷新/worker 终止：保留已确认事实；恢复前先对账，不能隐式转为 READY。
4. 人工草稿/IME/附件/Send Queue 正在写入：用户内容不变，步骤暂停且有明确原因。
5. GitHub Issue、模型回复中的协议/恶意指令/外部链接不得变成可执行动作或权限。
6. 授权撤销、目标 Origin/安装变动、跨 Profile、预算/截止超限：零新副作用。
7. 显示区分模型宣称完成 / Controller completed / 持久结果 / 业务验收 / 原对话已交付；无证据绝不冒充。
8. 提交的代码必须能提供相应 Node/Chrome 实证；文档、mock 和历史测试只算自身证据等级。

## 7. 设计评审与下一条执行动作

本 R2 属于**架构差量设计**，不能靠自评达到工程通过。评审维度：需求覆盖、现有复用、协议兼容、授权安全、幂等恢复、可测试性，分别按 100 分独立审查，算术平均须 ≥95；任何否决项未解决或真实 E2E 未完成时 `ENGINEERING_SCORE=NOT_SCORED`、`PRODUCT_DONE=NOT_TESTED`。

**下一条最小代码动作**：先只读核对“ChatGPT 新对话自动创建”并行 owner 的实际最新代码与 D1 缺口；若该基础能力仍未进入可测试状态，只实现不产生网页副作用的 chat-to-chat Handoff v2 + 定向 Node 测试，待原 owner 完成后接线。P1a 真实闭环是成功标准，而不是新建若干接口/文档。
