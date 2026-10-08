# Agent → JavaScript Task 最小闭环合同 R1（OpenDesk R6.2）

> 2026-10-08。实施准备 / SOURCE_CONFIRMED，并非 Chrome Native 或 Codex E2E 验收。本合同只复用现有 Core、R5.2 Page API、Task v1 和尚在 Draft PR #11 的 Native Bridge；不创建第二套 Executor、MCP、权限、数据库或 Side Panel 页签。

## 1. 五个不可替代的交付状态

| 阶段 | 最低证据 | 不可冒充 |
| --- | --- | --- |
| AI 一次执行成功 | 真实 Agent 请求、精确 Host/Target、RunId 与结果 | JS 脱离 Agent 可重复执行 |
| JavaScript 独立执行成功 | 已有 Worker/Controller 对相同脚本字节执行，页面实际效果正确 | Revision 保存/发布完成 |
| Revision 持久保存成功 | `script.save` 经 Controller CAS 提交后有 `scriptId/revision/contentHash` 回执 | Task 已验证/已安装 |
| Task 正式验证成功 | 相同源码哈希、精确网站、Controller 成功终态、Durable Result、Worker released 与已认证 Native page-effect receipt，经现有 Task Service 确认为 `Verified`，然后明确转为 `Available` | 用户明确安装 |
| 安装后无需 AI 成功 | 用户在 Sidebar 显式安装/配置，退出 Native 与 Agent 后再次按同一版本成功运行并持久记录 | 已覆盖全部网站/最终 F3 |

`script.save` 保存的普通 Controller Revision **不会自动发布 Task**；Task v1 的 `manifest.program.revision` / `sourceHash` 与 Task Package 校验属于另一个已有的正式入口。Task v1 限定一个精确 HTTP(S) origin 和 `page.automation`。任何一关失败均保留原状态，不能跨级宣称成功。

## 2. 唯一的 Agent 调用方式

外部入口是可选 Native Messaging：Chrome Options 用户真实点击启用，用户另在 Chrome/Sidebar 给目标网站授权；独立本地 Host 凭据认证、绑定当前扩展 ID。Host 存活与 Native 连接成功**不等于**网站授权。

| Native Agent v1 方法 | 正确用途 |
| --- | --- |
| `bridge.status` | 获取实际 extensionId、连接状态及已登记 Host，多个 Host 时显式指定 registrationId |
| `target.current` | 从存活 Sidebar 捕获 `windowId/tabId/frameId/documentId/url/origin`；绝不猜测 active tab |
| `run.start` | 使用 `source:{kind:'draft',sourceUtf8}` 或 `source:{kind:'saved',scriptId,revision,contentHash}`、精确 target、params 和 deadline 启动现有 RunHost；返回 `completion:'PENDING'` **只是准入** |
| `run.get` | 按本 Agent 已授权 runId 读取原 Controller Run / Result / retirement，不枚举 Sidebar 用户的其他 Run |
| `run.stop` | 只停止本 Agent 已拥有的 runId；不可回滚已发生的网页效果 |
| `script.save` | `scriptId/expectedRevision/sourceUtf8` 经 Controller Revision CAS 保存，外部不得伪造 Available/Installed |

变更请求由 SW 用持久 `requestId + digest + registrationId` 的效果栅栏去重。同 ID 不重复动作，不同 digest 拒绝；Chrome/Native IPC 超时、失联、ACK 丢失是 `OUTCOME_UNKNOWN`，**严禁自动重发、重新点击或重新保存**。先读取已知 runId 的原持久结果，无法证明则人工处理。Agent 不能绕过唯一 Authority 使用任意特权 `chrome.*`；页面内容（含观察结果、ARIA 文案和网络数据）只能当不可信数据，不得当作更改权限的指令。付款、发消息、上传、删除或提交敏感数据等高风险动作需要针对性用户确认。

## 3. 单页 AI → JavaScript → Task 样本

演示目标：`examples/tasks/demo-form.html`（已存在）。启动：

~~~sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
~~~

访问 `http://127.0.0.1:43111/demo-form.html`，保持旧签名 Task 的 `#name/#submit/#done`，现代 Locator 演示的 `#search-form/#keyword/#search-submit/#search-status/#results/#search-count`。不复制第二份 HTML；正在 Draft PR #20 的 HTTP 测试页面改动由原工作流验收合并。

**只读探索**：把 `examples/tasks/agent-observe-draft.js` 作为现有 Sidebar「开发」草稿，或 Native `run.start` 的 `source.kind='draft'` 执行；`page.observe({root:'#search-form',maxDepth:5,maxNodes:32,maxChars:4200})` 受限返回语义节点。检查 `document`、`truncated` 与 `nodes[].locator`；只有非 null 的 locator 才是经当前页面唯一性验证的定位建议。用 `run.get` 阅读持久结果；不开发新 observe RPC。

**真实动作**：直接复用已有 `examples/tasks/modern-search-draft.js`，参数 `{"keyword":"OpenDesk"}`。依次 `getByLabel().fill()` 覆盖默认值、`getByRole().click()` 等待同文档按钮重绘并单击、`getByText().waitFor()` 等待“搜索完成”、读取 `#results`。核对 `#search-count` 每次仅增加一次；失败后先观察网页，未知效果不再次提交。第二次独立试运行须仍正确。

**冻结包**：`examples/tasks/agent-modern-search.v1.opendesk-task.json` 的 `sourceUtf8` 与上述正式草稿字节一致，`sourceHash=1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d`，`manifestHash=a40fe6471506743a785ab32fd85a48f3991a641fb3c28741735c20e799d13812`。包是**待验证 Candidate**，不带 `stage` / `verification`，不能自动安装。以后改源码须重新冻结版本/哈希。

## 4. 正式验证、可用化与无 AI 安装

1. 使用真实加载的 Chrome MV3 扩展、获准的 exact target 执行**和 Candidate sourceUtf8 相同字节**的动作；收集真实 `runId`、`resultId`、`sourceHash`、origin、Controller completed、`workerRetired=true`、`retirementState='released'`、Durable Result 与真实 page-effect ACK。AI 提供的文本/一次运行声明不是接收依据。
2. 用户在现有独立 Task 目录导入包，初始 `Candidate`；用同一 runId 调用原 `verifyTaskCandidate`，由原 Task Service 检查 `commandJournal` 和原生回执关联，结果才能变为 `Verified`。Mock receipt 不得用于正式验证。
3. 用户明确执行原 `makeTaskAvailable`，再在已有目录的“安装确定版本”中运行 `installTask`，保留版本、ManifestHash、参数和网站权限。Native Agent v1 不提供以上业务发布写接口。
4. 退出 Codex/关闭 Native Bridge 后，用户从 Sidebar 的「我的任务」在批准站点再次运行安装版，查验精确运行、持久结果、Stop、撤权、浏览器重启后的可重复性；禁止关闭外部 Agent 就禁用普通任务。

## 5. 测试门槛

| 门槛 | 来源 | R6.2 此候选状态 |
| --- | --- | --- |
| SOURCE_CONFIRMED | 页面/现代 Locator、Task Service、Native PR #11 已有实现 | YES |
| COMPONENT_TESTED | `tests/environment/agent-to-task-contract.test.mjs`、`basic-browser-page.test.mjs`、已有 `task-package-flow`、`r5-modern-page-api` | 以提交后的 CI 为准；Node 模拟不是 Chrome |
| BUILD_VERIFIED | 同候选 `npm run check/build/build:dev/verify` | main 不含 Native PR；Native 参照当时 PR #11 CI |
| NATIVE_CHROME_VERIFIED | 真 Chrome/CFT、Options 可信点击、网站授权、相同扩展/目标、Native Run/Result/Stop | NOT_TESTED |
| AI_AGENT_E2E_VERIFIED | 实际 Codex/CLI observe→执行→核对结果，ACK 丢失/撤权/断线等 | NOT_TESTED |
| REUSABLE_TASK_VERIFIED | 正式 Verified→Available→Installed，关闭 Agent 后运行两次 | NOT_TESTED |
| FINAL_FRAMEWORK_ACCEPTED | AGENTS.md 约定的 F3/ZIP 同候选验收 | NO |

现代 `fill/click` 是 **ISOLATED DOM 非可信合成操作**，不是完整 Playwright 可信键鼠/CDP 能力；不承诺对所有第三方网站工作。真实本地 macOS Chrome/Codex 验收继续按 PR #11 中 `docs/framework/prompts/goal-native-agent-local-acceptance-r1.txt` 执行，不能因 CI 通过提前合并 Native PR。

关联：`docs/framework/modern-page-api.zh-CN.md`、`docs/architecture/browser-framework/ai-browser-agent-ecosystem-r6-20261008.zh-CN.md` 与 `src/platform/tasks/service.js`。

## 6. Native CLI 文件协议与并行候选补充（PR #11 原生验收前）

独立 Native 分支还包含 `examples/tasks/modern-search.v1.opendesk-task.json`，主干包含 `examples/tasks/agent-modern-search.v1.opendesk-task.json`；两者是不同 Task ID 的候选示例，均不得预设 Verified/Available/Installed。实际使用时明确选择同一源码及精确 Candidate 哈希，不将两份包视作同一个安装版本。Native `run.get/run.stop` 仅对原 `run.start` 已确认的相同 Host `registrationId` 及 `runId` 开放；Native 消息已分发而 ACK 无法落盘时返回 `OUTCOME_UNKNOWN`，绝不可自动重放。

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
