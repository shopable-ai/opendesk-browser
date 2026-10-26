# ChatGPT Controller Task 合同 · 0.2.0

本项目是 Controller Task，正式任务由「我的」管理。`src/site.js` 适配 `https://chatgpt.com` 官网 DOM；`src/conversation.js` 提供绑定、新建对话、写前日志、一次点击、真实用户消息确认及稳定完成读取；`src/relay.js` 组合 A 加法与 B 乘法。`src/main.js` 是零参数 ESM 入口，使用 Worker 词法 `page`、`params` 和公开 `AppStorage`。没有 ChatGPT 专用 Host 或第二个执行器。

## 输入

输入必须为闭合对象；未知字段、非整数、越界数、错误 operation 和非法业务 runId 在网页副作用前拒绝。

| 参数 | 类型与限制 | 默认值 |
| --- | --- | --- |
| `operation` | `run`、`status`、`inspect`、`reconcile` | `run` |
| `addend` | 安全整数，-1000000 至 1000000 | 17 |
| `secondAddend` | 同上 | 25 |
| `multiplier` | 同上 | 3 |
| `runId` | 8–80 位 ASCII 字母、数字、`_`、`-` | 新业务标识；status 缺省查当前指针 |

A 计算 `addend + secondAddend`，B 在另一个新对话计算 `A × multiplier`；最大结果绝对值 2×10¹²，仍在安全整数范围。结构化回复须为唯一的 `runId/step/value` 三字段、单行 JSON，值同时经过本地独立算术核验。官网回复不是计算真值的唯一来源。

```json
{"operation":"run","addend":23,"secondAddend":7,"multiplier":4,"runId":"relay-order-0001"}
```

相同业务 runId 与相同输入再次 `run` 只读原记录；不同输入拒绝。新的业务操作用新的业务 runId；网络回执未知时不能换 requestId 或 runId 来重发。

## 返回与身份

业务成功返回 `format:opendesk.chatgpt-calculation-relay.v1`、业务 `runId`、三项输入、`status:completed`、`steps.A/B`、`handoff`、`journalKey` 和时间。每步 `result` 含：

| 字段 | 含义 |
| --- | --- |
| `raw` | 实际助手回复原文 |
| `runId/step/value` | 经结构与算术核验的计算数据 |
| `conversation/url/documentId` | 观察到的对话路由、完整 URL、受控文档身份 |
| `userMessageId/assistantMessageId` | 实际新增消息身份 |
| `completionSignal/completedAt` | 官网完成、无流式且两次稳定观察的证据描述及观察时间 |

业务 `runId` 是请求去重键，不是宿主运行 ID。RunHost 另行生成的 `runId`、`resultId`、`revision.sourceHash`、执行状态和资源退役状态只能来自宿主原回执。调用方保存两套身份并关联；脚本没有生成或认证宿主回执的权限。值的线上编码/解码沿用原 RunHost `valueWire`，不要从提示词或预期值伪造结果。

## 状态与恢复

持久业务状态为 `queued/running/unknown/completed`；步骤为 `queued/sending/sent/waiting_reply/unknown/completed`。`sending` 与 `clickIntent` 在填入和点击前分别写入并读回；导航 handoff 在导航前落账，并记录原、新 documentId。宿主 `stopped/timeout/paused_unknown` 等是另一层执行状态，不能改成业务成功。

`status` 只读日志，不调用官网；返回的状态是**最后持久化的状态**。Chrome 退出或 Worker 被终止时，日志可能停在 `running/sending`，这不证明它仍在运行，也不证明没有发送。先查看「我的」原运行历史和宿主回执，再核对日志。重启后在同一安装任务下发起 `status` 可以读取原任务日志；不恢复旧 Worker，不自动重放步骤。

```json
{"operation":"status","runId":"relay-order-0001"}
```

`inspect` 只读当前文档和有限 DOM 诊断；未知步骤要求绑定原 documentId。`reconcile` 必须显式给出原业务 runId 和相同三项输入，只观察已有未知点击；没有匹配发送与完成证据就继续保留 unknown。只有 A 证据已落账且 B 尚未发送时，才允许后续正常的新 B 操作。浏览器重启改变 documentId 后不会把相似 URL 当作原文档继续发送。

## 权限、期限与占用

候选声明精确 Origin `https://chatgpt.com`、`page.automation`、`storage.persistent`、`deadlineMs:120000`；正式安装审阅绑定全部元数据和源码哈希。Task 存储只开放 AppStorage 四个方法，不因此开放 Chrome local、HTTP、Cookie、Native 或 Browser app API。

安装后 AppStorage 按 namespace + 稳定 taskId 隔离，同一身份的不同版本共享日志；开发草稿旧日志仍在原开发存储区，不自动迁移。更换安装身份不会继承旧 journal，旧未知请求仍须独立处理，不能用新身份绕过去重。

RunHost 复用单执行槽，其他运行占用时立即拒绝，不排队，也不允许父 Task 占槽等待子 Task。外部客户端应在当前 Task 之外发起调用。业务总预算 105 秒，预留末尾落账时间；120 秒是宿主有限上限，不能保证官网在限期内完成。Chrome 关闭后不会继续网页操作。

## 兼容范围

官网适配支持本项目历史 author-role 和 2026-10-26 实测 search-unit 结构；没有多网站兼容声明。0.2.0 保留 v1 journal key，读取旧记录时缺少的 secondAddend/multiplier 按历史 25/3 解释。官网变化、登录失效、限流、模型拒绝或非预期结构均可能终止任务；维护流程见 [MAINTENANCE.zh-CN.md](MAINTENANCE.zh-CN.md)。本文件定义合同，不代替新候选的真实 Chrome 安装验收。
