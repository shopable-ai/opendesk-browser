# OpenDesk Browser · Agent → JavaScript Task 最小闭环合同 R1

> 2026-10-08。**实施候选 / 不代表原生验收或正式发布**。依赖现有 `main` 的 Modern Page API R5.1/R5.2、RunHost/Controller Authority、不可变 Task v1 和 PR #11 的可选 Native Agent Bridge。源码合同可独立执行，真实 Mac Chrome / Codex E2E 仍需同一最终候选实证。本文是唯一 Agent→Task 生命周期合同；不另造 Browser MCP、发布器、Controller 或任务数据库。

## 1. 边界与明确选择

```text
用户明确启用 Native / 网站 grant
  → Codex CLI → Native Host / 受认证 Socket → Chrome Native Messaging
  → SW 固定 Native Transport → 已登记 Sidebar Host → 同一 RunHost/Authority
  → Controller Worker 中的 page.observe / Locator / 持久 Run+Result
  → Agent 修订 JavaScript（仅在确认上一次效果后再次执行）
  → 冻结 sourceUtf8 / sourceHash + Task Package v1
  → 独立完整任务目录：Candidate → Verification → Available
  → 用户明确安装 + 配置 params → Sidebar 我的任务运行
  → 不启动 Codex / Native Host 仍可重复 Run/Stop/Result
```

- Native 是**可选制作入口**，不参与普通已安装 Task 的日常执行。MCP/CLI/模型原生 tool 仅是外层调用格式，不替换现有浏览器 Core。
- **不是 Playwright 全接口**。当前 `page.getByRole/getByLabel/getByText/locator/observe` 是受限现代子集；`fill` 和 `click` 使用 ISOLATED DOM 合成事件，不等于 `isTrusted` 鼠标键盘输入。权限校验、观察截断、重绘、离屏及未知效果语义以 [现代 Page API](../../framework/modern-page-api.zh-CN.md) 为准。
- **Task v1 严格单一 HTTP(S) origin**，声明唯一 `page.automation`，入口 `async function main()`。多文件 ESM 源码须先编译、固定最终执行字节，不能把源码目录当成直接安装的 Task。
- 把网页 DOM / 页面文字视为**不可信数据**。不得将 `observe()` 返回的网页指令升级成系统指令或授权，不把敏感数据发送给未经批准的模型或外部服务。高风险支付/删除/提交行为单独取得用户批准；不能通过自动重试掩盖页面已生效。

## 2. 现行桥接 API，只有六种方法

| CLI 方法 | 入参/返回 | 权限与真实含义 |
| --- | --- | --- |
| `bridge.status` | `{}` → extensionId、状态、hostRegistrations | Native 权限且扩展明确启用；不表示网站已授权 |
| `target.current` | `{registrationId?}` → `{registrationId,target}` | 返回当前存活 Side Panel 所属窗口的精确文档快照；**不证明网站 grant** |
| `script.save` | `{registrationId?,scriptId,expectedRevision,sourceUtf8}` → 已保存 Revision | 调用旧 Controller Revision CAS；这**不是** Task Candidate/Available |
| `run.start` | `{registrationId?,source,params,target,deadlineMs?}` → runId / PENDING | 来源 `draft/sourceUtf8` 或 `saved/scriptId/revision/contentHash`；必须相同 Host、完整 target、真实网站 grant、空闲运行槽 |
| `run.get` | `{registrationId?,runId}` → Controller durable snapshot | 只读已被 Native 起动且属于**同一 Host 注册**的 runId；PENDING/未知不是业务成功 |
| `run.stop` | `{registrationId?,runId}` → Stop 请求回执 | 仅已归属同一 Host 的 runId；取消不能撤销已派发副作用 |

具体协议字段以 `src/native-agent/protocol.js`、`service-worker.js`、`host-adapter.js` 和 `native-agent/cli.mjs` 为准；上表不是新增接口承诺。CLI 的 `--file` 读取**完整参数对象**，可在其中提供 `requestId`；也可传 `--request-id`。每次具有可能副作用的新尝试必须使用新 ID；对 `OUTCOME_UNKNOWN` **绝不**用新 ID 补一次执行。

真实目标由 `target.current` 获取的 `windowId/tabId/frameId=0/documentId/url/origin` 原样带入 `run.start`。`registrationId` 要匹配该次返回；Host 在执行前再刷新和重校验精确页面。外部 Agent 不允许传入任意 tabId 让扩展擅自执行，也不能绕过 Authority 调用 `chrome.scripting.executeScript`。网站授权由用户在原 Sidebar/Chrome 确认；Native Settings 的单独授权不能代替网站授权。

同一个 `requestId` 在 SW 中绑定规范输入摘要与 Host 注册，持久账本保留 `OUTCOME_UNKNOWN` 栅栏。已 dispatch 但无可信 ACK、Native 断线、Host 回执丢失、写入 ACK 到 storage.local 失败，均不得断言 `FAILED_CONFIRMED` 或自动重放。真正结果以 Controller 的 durable Run / Result / worker retirement 为准。未取得已确认 runId 时只能人工对账与停止，不允许盲重放。

## 3. 最小样本和真实用户动作

固定本地页面：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，浏览器打开 `http://127.0.0.1:43111/demo-form.html`。

1. **只读观察草稿**：`examples/tasks/agent-observe-draft.js`。在 Sidebar「开发」直接粘贴，或由 Codex 读取该 UTF-8 文件，用 `run.start` 的 `source:{kind:'draft',sourceUtf8}` 执行。其 `page.observe({root:'#search-form',maxNodes:32,maxDepth:4,maxChars:4000})` 仅返回有限语义摘要，不触发页面写操作。检查 `truncated` 和 `observation.nodes`，不要虚构不可见元素。**此步有 durable read result ≠ 真实页面动作/Task 验证。**
2. **生成/修订可独立运行的 JS**：参考 `examples/tasks/modern-search-draft.js`，参数 `{"keyword":"OpenDesk"}`，先 `getByLabel('搜索关键词',{exact:true}).fill(...)`，再 `getByRole('button',{name:'搜索',exact:true}).click()`，等待 `getByText('搜索完成')`，读 `#results`。查看页面提交次数；每轮应仅增加一次。失败后先分类 `E_STRICT_MODE_VIOLATION`、权限/导航、`E_EFFECT_UNKNOWN`，不得无条件再次点击。
3. **使用旧 RunHost 实际执行**：Native CLI 新请求包含刚取的 `registrationId`/完整 `target`/`sourceUtf8`/`params`；记录 `run.start` 的 runId，随后用 `run.get` 查询终态、结果、原执行回执与资源释放。若 Chrome/Native 不可用，代码仅为准备状态，不能臆造真实 runId/resultId。
4. **冻结 Revision**：若用 `script.save`，必须提供 `expectedRevision`，使用返回的准确 revision/contentHash；下轮 `run.start` 可明确选择该 `saved` 来源。更新源码产生新 Revision，不得把不同源字节伪装为同一版本。此 Save **不会**自动创建 Task。
5. **导入真正 Task Candidate**：`examples/tasks/modern-search.v1.opendesk-task.json` 是已计算准确 `sourceHash`/`manifestHash` 的**未验证示例包**，其 `sourceUtf8` 必须等于 `modern-search-draft.js` 的全部原始字节。完整目录「导入」后是 Candidate，不是已验证或已安装；用户/Agent 更改源码、参数 Schema、origin 或标题，须重新计算 hashes 并形成**新的不可变 taskId/version**，不能覆写已经存在的版本。
6. **正式验证和安装**：完整任务目录输入与 Candidate **完全相同源码哈希及站点**的真实 runId，调用现有 `verifyTaskCandidate`。后台必须校验持久 completed、结果成功、worker retired/released、相同源哈希/目标、真实原生 page-effect receipt；没有这些就不得 `Verified`。随后用户显式设为 `Available` 并**明确安装**确切版本；在「我的任务」输入参数重新运行。Agent 没有 `makeTaskAvailable/installTask` Native RPC，不能绕过目录。
7. **独立复用**：关闭 Codex 和 Native Host，禁用 Native Bridge；普通 Sidebar 仍能读取已安装版本、参数、Stop/Result 并重复执行。验证关闭 Chrome/重开及相同 ZIP 安装，保留真实证据。若站点权限被撤销或文档变更应拒绝而不是借旧授权重放。

### Native CLI 请求文件生成

`node native-agent/cli.mjs bridge.status`、`node native-agent/cli.mjs target.current` 取得真实返回后，由 Codex **在本地**以 UTF-8 JSON 写入请求文件。下面只是字段形状，**不可拿示意 ID 当真实 target**：

```json
{
  "requestId": "fresh-unique-attempt-id",
  "registrationId": "FROM-target.current",
  "target": {
    "windowId": 1,
    "tabId": 2,
    "frameId": 0,
    "documentId": "FROM-current-Chrome-document",
    "url": "http://127.0.0.1:43111/demo-form.html",
    "origin": "http://127.0.0.1:43111"
  },
  "source": {
    "kind": "draft",
    "sourceUtf8": "FULL-SOURCE-FROM-UTF8-FILE"
  },
  "params": {"keyword": "OpenDesk"},
  "deadlineMs": 30000
}
```

`node native-agent/cli.mjs run.start --file /absolute/path/run-start.json`。该文件是本地草稿，请勿提交带真实站点私有数据、凭据或 session 的请求/回执。读取得到的真实 runId 后，用独立请求文件 `{"registrationId":"SAME-HOST","runId":"ACTUAL-RUN-ID"}` 执行 `node native-agent/cli.mjs run.get --file /absolute/path/run-get.json`；停止同理 `run.stop`。不得使用外部 Playwright 去模拟 OpenDesk 的真实操作回执。

## 4. 五个相互独立的交付状态

| 状态 | 必要证据 | 不能替代 |
| --- | --- | --- |
| AI_AGENT_E2E_VERIFIED | 实际 Codex → CLI → Native → Chrome 的调用日志、授权、精确 target、真实页面变化 | 仅 Codex 生成了 JS 文本 |
| JAVASCRIPT_RUN_VERIFIED | 现有 RunHost/Authority 驱动的真实网页动作、业务断言、durable runId/resultId/retirement | Node mock 或 DOM 手工赋值 |
| REVISION_PERSISTED | `script.save` CAS 返回 revision/contentHash，重读一致，源码不可变 | JS 运行一次 |
| TASK_VERIFIED_AVAILABLE | Candidate 准确 hash、Controller 的原生效果 receipt、Verified → Available | 复制一份 JSON 并自称 verified |
| INSTALLED_REUSABLE_VERIFIED | 用户明确安装和配置，同一源码在关闭 Agent/Native 后可再执行，重启仍有身份一致的结果 | AI 第一次运行成功 |

这些状态不构成总进度百分比。本合同本身属于 `SOURCE_CONFIRMED` 和组件准备；未取得真实 Chrome/Codex 原始证据时，后三项均 `NOT_TESTED`，`FINAL_FRAMEWORK_ACCEPTED=NO`。仓库最终 F3、603+19、1000 mixed / reconnect、ZIP 同一候选合同不因本演示而降低。

## 5. 可靠性、回退与不扩张清单

- `run.start` 仅 Admission，`completion:'PENDING'` 不是业务成功。超时/断线造成副作用不确定，先查已知 runId 的 durable state，不新发同操作；没有 runId 时保留 `OUTCOME_UNKNOWN` 等人工调查。
- `run.stop` 要求已授权 runId 和同一 Host，停止后仍需观察 terminal state 与资源 release；Stop 并不回滚先前 click/form submit。
- 保存代码不意味着发布；Task v1 验证过程依据准确哈希、持久运行与原生网页效果，而非模型回答或任意 `success: true`。
- 真实 UI 保留「我的任务 / 发现 / 开发」三个一级页签；发现只做已安装本地搜索，完整目录另开。单文件直接运行，多文件 ESM 先编译到已有运行链。
- 本轮不追加 `observe` RPC、不自建 Browser MCP/HTTP server、不增加 `debugger`/`all_urls` 权限、不添加第二 Task DB、不接入桌面控制或云浏览器。
- 组件例测：`node --test tests/environment/agent-to-task-fixtures.test.mjs tests/environment/native-agent-bridge.test.mjs tests/environment/native-agent-host.test.mjs tests/environment/task-package-flow.test.mjs tests/framework/r5-modern-page-api.test.mjs`。真实 Chrome / Codex 脚本步骤见 [现有 Native 本地接管提示词](../../framework/prompts/goal-native-agent-local-acceptance-r1.txt)。

## 6. 与现有文档关系

- [R6 全球架构研究 ADR](ai-browser-agent-ecosystem-r6-20261008.zh-CN.md)：研究和长期路线，不是当前状态判定。
- [Native Agent Bridge R1](native-agent-bridge-r1.zh-CN.md)：已实现传输、身份、协议和 CI/Native 本地验收边界。
- [Modern Page API R5.1/R5.2](../../framework/modern-page-api.zh-CN.md)：Locator 具体语义。
- [任务示例 README](../../../examples/tasks/README.zh-CN.md)：真实页面、草稿和 Candidate 的用户操作。
- [R6 双格式/Sidebar 约束](../../product/program-development-dual-format-and-sidebar.zh-CN.md)：多文件编译和三页签。

## 7. 最新 main 合并边界（本地候选）

保留 main 的 `agent-modern-search.v1.opendesk-task.json` 及其独立 Candidate 身份；本轮按 `modern-search.v1.opendesk-task.json` 验收，两包源码相同，taskId / manifestHash 不同，不互换验证记录。观察草稿保留 `kind/url/observation` 返回结构，将预算对齐 main 的 maxDepth:5 / maxNodes:32 / maxChars:4200。页面已包含 R7.1 HTTP API 验证，保留其 URL、取消、状态和旧 fixture 约束。

现代 Locator `fill/click` 当前使用 ISOLATED DOM 合成操作；页面效果成功不能单独证明可信原生输入。若正式 Native/Task 合同要求可信输入或额外 native receipt，必须取得该证据，不能用 synthetic events、外部 Playwright 动作或伪造 ACK 补足门槛。
