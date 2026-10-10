# OpenDesk Task Package v1：本地表单演示

> R10.1 当前中文使用入口：[快速入门](../../docs/api/quickstart.zh-CN.md)，[七个 MCP 工具](../../docs/api/mcp-local-development.zh-CN.md)。复用原候选证据，按相关输入判断是否需要重测；不以示例运行代替安装/F3。

这个目录提供 **真实源码、清单 SHA-256 和 HTML 演示页**。JSON 导入后的初始状态必须是 **待验证**，不是自动审核通过或直接安装。

## 在本地 Chrome 验证

1. 在本仓库执行 `npm ci` 和 `npm run build:dev`，在 `chrome://extensions` 打开开发者模式，并加载 `dist/development`（解压扩展）。建议使用独立测试浏览器配置。
2. 在项目根目录执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，用普通 HTTP 标签页打开 `http://127.0.0.1:43111/demo-form.html`。
3. 点击 Sidebar「发现」旁的「导入」，在打开的独立完整扩展页面导入 `examples/tasks/form-fill.v1.opendesk-task.json`。Candidate 应显示 `sample.form-fill@1.0.0`、本地来源、准确网站、权限和 **待验证**。Sidebar「发现」只搜索已安装任务。
4. 返回演示网页，在 Sidebar「开发」编辑器中粘贴任务包的 `sourceUtf8`。也可在同窗口已打开 Sidebar 时，从独立任务目录导入 `.js` 草稿；源码会交给 Sidebar 编辑器，目录页保留原视图。把参数设置为 `{"name":"Alice"}`，明确运行草稿并批准当前网站，确认输入/提交与网页 `#done` 已出现，查看持久完成结果并记录本次 `runId`。无需先保存草稿。
5. 返回独立任务目录，选中 Candidate，**填写刚才的精确 `runId`**，点击「核对运行证据」。Sidebar 的最近运行 ID 不会自动填入另一个页面。只有后台确认 **相同源码哈希、相同网站、已释放执行资源、已持久结果和原生页面操作回执** 才能达到 Verified（本机验证通过）。
6. 明确点击「设为本地可用」达到 Available，再点击「安装确定版本」。返回演示网页，在 Sidebar「我的任务」填写姓名，点击「运行任务」，检查网页、运行状态和持久结果。示例使用 `page.type`，会在现有输入后键入；再次验证可先重新加载演示网页。
7. 停用任务后再尝试运行，必须被禁止；重新启用可运行。卸载后底层已保存 Task Script 也不得绕过安装直接运行。
8. 关闭并重新打开 Side Panel，确认已安装任务与历史仍存在。再完全退出和重启 Chrome，核实任务可再次使用。必要时先让上一次运行完成资源退休。

## 状态含义与边界

- 本地验证是由现有 Controller 持久运行结果支持的**本机事实**，不等于第三方安全审计、代码签名或云市场审核。
- 此示例只申请一个明确的 HTTP origin 和 `page.automation` 任务权限；浏览器站点权限仍必须独立批准。导入文件绝不能直接声明自己是 Verified / Available。
- 无需 Codex、MCP、Native Messaging 或外部运行服务；以上 `python3` 仅用于启动演示页面。
- 在没有实际 Chrome 原生运行回执的环境里，请标记 `NATIVE_NOT_VERIFIED`，不要把 Node 组件测试当作真正的网页验收。

## R5.1 接口 / R5.2 可靠性：现代 Page API 草稿（不用安装任务）

同一个 `demo-form.html` 现在有第二个简洁搜索表单（不会影响旧的姓名表单）。

打开开发版扩展 Sidebar「开发」，粘贴 `modern-search-draft.js`，参数为 `{"keyword":"OpenDesk"}`，直接运行草稿：

运行前用浏览器正常滚动，让搜索输入和按钮都位于视区。当前页面包含多组演示，窗口较小时搜索区域可能离屏；现代 Locator 不自动滚动，离屏会等待到 `E_TIMEOUT`。不要为测试成功修改 HTML 或让外部自动化代替 OpenDesk 填写、点击。

先核对服务返回的是当前仓库的 `demo-form.html`。2026-10-09 独立验收发现已有 43111 服务指向历史快照，因此保留该服务，改用空闲 43112 启动当前 `examples/tasks`；这只是隔离验收端口，正式人工入口仍是 43111。完整启动命令可使用 `--directory /Users/shopme/Documents/workspace/opendesk-browser/examples/tasks`，并在证据中记录实际 URL 与 HTML 哈希。

- `getByLabel('搜索关键词')` 的 `fill` 必须覆盖预填的「旧的预填内容」。
- 页面收到 input 后同文档重绘「搜索」按钮，并短暂禁用，`getByRole('button',{name:'搜索',exact:true}).click()` 应自动重新定位和等待。
- 等待「搜索完成」，`#results` 返回「结果：OpenDesk」，页面「提交次数」只增加 1。
- 再次直接运行相同草稿，检查第二次仅增加 1，并确认 Sidebar 最终持久结果。无需先候选/发布/安装，也无需外部 Playwright 或 MCP 做页面动作。
- 如果使用 AI，可先运行 `await page.observe({root:'#search-form'})` 读取表单角色/名称；其输出是有限预算的语义 DOM 摘要，而非浏览器原生 AX 树。

**R5.2 补充验收**：`page.observe({root:'#search-form'})` 应返回有限节点和 `budget.visited/locatorChecks` 等计算量信息；定位建议仅在 `locator` 不为 null 时表示通过相同查询规则的一次唯一性验证。额外检查遮挡、disabled/aria-disabled、readOnly/aria-readonly、按钮动画、Locator 单次超时，以及动作回执缺失时 **不可再次提交**。组件模拟通过不等于 Chrome 实测；只有 Sidebar 原有 Controller 运行链返回真实 `runId/resultId`、提交回执和 Durable Result，才可对本机标记通过。修复细节和已有 CI 见 [R5.2 验收记录](../../docs/framework/workstreams/r5-2-modern-page-api-acceptance.md)。

本机受控 CFT 155 已按上述入口完成两轮相同文件字节的搜索，每轮恰好提交一次，结果都是「结果：OpenDesk」。无需 AI 重写；两个 Durable Result 分别带自己的 runId/resultId 和相同 sourceHash。证据及动画亚像素移动修复见同一验收记录；AI 生成任务的端到端流程另记 NOT_TESTED。

旧版 `form-fill.v1.opendesk-task.json` 的已发布源码、sourceHash 和 manifestHash **保持不变**：它仍然使用旧 `page.type` 追加输入；本轮不破坏已经发行任务。现代 API 具体边界见 `docs/framework/modern-page-api.zh-CN.md`。

## R7 基础交互测试：一个 HTML 即可

主入口仍是 `http://127.0.0.1:43111/demo-form.html`。页面是一张简单的内容/表单网页，**不是测试管理后台**。只需 Python 静态 HTTP 服务，不新增服务器依赖、API 或 HTML：

| 能力 | 页面选择器 | 可断言的结果 |
| --- | --- | --- |
| 读取标题和段落 | `#sample-title`、`#sample-text`、`#sample-list` | 固定中文内容 |
| 点击计数 | `#click-button` | `#click-count` 每次加一 |
| 展开文本 | `#toggle-button` | `#extra-text` 显隐以及 `aria-expanded` |
| 请求成功 | `#delay`、`#request-success` | `#async-status[data-state="loading"]` → `#async-done` |
| HTTP 错误 | `#request-failure` | 真实本地 HTTP 404 → `#async-error` |
| 取消/超时 | `#request-cancel`、`#request-timeout` | `data-state="cancelled"` 或 `"timeout"`，无迟到的成功结果 |
| 老版任务 | `#name`、`#submit`、`#done` | 填写姓名后出现“已提交：…” |
| 现代 Locator | `#keyword`、`#search-submit`、`#search-status`、`#results` | 搜索按钮重建且等待后结果正确 |
| HTTP 通道 | `#api-url`、`#api-channel`、`#api-method`、`#api-send`、`#api-status`、`#api-http-status` | 默认公网 `https://httpbingo.org/get?source=opendesk` + SDK `axiosx`；网页 Fetch 仅为显式对照，未安装 SDK 不回退 Fetch |

- **第 03 组异步 DOM 场景**：成功场景读取同源 `./request-sample.json`，错误场景访问固定不存在的路径。这是页面回归测试的可重复本地 Fixture，不是独立浏览器扩展的 API 前置条件。
- **延迟为客户端可控等待**（300ms、1.2s、3s），不是服务器真实变慢。超时按钮使用 700ms 客户端期限；所有异步结果均由实际 DOM 表达，不依赖伪造测试 PASS。
- 取消、新请求覆盖旧请求、重置均通过 `AbortController` 清理；不能出现已取消请求稍后将旧成功写回页面。
- 旧版任务包不自动清空 `#name`（它的 `page.type` 是追加输入）。重跑前可以点击顶部“重置页面”或刷新。
- 通过 `file://` 打开时真实同源 `fetch` 不受支持，必须使用上述本地 HTTP 地址。扩展侧 RunHost、权限和原生回执需要在真实 Chrome 单独验收。

定向静态/兼容契约检查：`node --test tests/environment/basic-browser-page.test.mjs`。

## R7.2 HTTP 通道与独立 Worker

第 06 组保留 `#api-*` 元素，**默认选中 OpenDesk SDK axiosx + 第三方 HTTPS GET `https://httpbingo.org/get?source=opendesk`**，而不是原生网页 Fetch 或本地 HTML。网页 Fetch 只作为用户显式切换的对照。第三方示例同时包含 GET、POST、429、500、延迟；选择 POST 预设会自动切换 HTTP Method。页面打开、选择示例、切换选项和重置都不会发送请求；只有点击「发送」才真正访问目标 URL。URL 解析为绝对 HTTP(S) 地址，POST 正文必须是 JSON；响应最多展示 4096 UTF-8 字节，以文本显示，headers 单独展示。网络驱动不携带 Cookie；第三方可观察请求和来源公网 IP。

先用 Python 静态服务检查 `/request-sample.json` 200 JSON、`/demo-form.html` 200 HTML 和缺失文件 404。需要 POST、真实延迟和精确状态码时，用本目录无依赖辅助服务替换同端口的自有 Python 服务：

```sh
node examples/tasks/http-test-server.mjs 43111
```

辅助路由：`POST /__test__/echo`、`GET /__test__/status?code=429` 或 `500`、`GET /__test__/delay?ms=1200`、`GET /__test__/text`。Python 不提供这些动态路由。

**SDK 安装（首次必做）**：打开已加载 OpenDesk 扩展的独立工具页「开发 → 高级/诊断 → 独立网页 SDK」，刷新文档列表并选择 `http://127.0.0.1:43111/demo-form.html` 的精确 tab/document；勾选 network，在“额外目标 Origin”填写 **`https://httpbingo.org`**（不含 `/get?...` 路径），真实点击「批准并安装」。回到网页点击「发送 GET」。缺少注入时网页在 HTTP 发送前显示 `E_SDK_NOT_INSTALLED`、目标 Origin 和操作引导，同时保持 HTTP/耗时空白；绝不静默回退 Fetch。导航到新 document / Worker 重启后的跨源授权可能需要重新批准；安装由扩展受信 UI 完成，网页绝不自动提权或制造假 SDK。MAIN `OpenDeskSDK.ready()` 和 `axiosx.get/post()` 负责请求。非 2xx 的 `E_HTTP` 响应来自 SDK error.response（兼容 cause.response），页面保留真实 status/data/headers；权限、超时、网络错误保留原码。若只需验证 Controller Worker 自己的 `axiosx`，在 Sidebar「开发」直接运行 `http-worker-axiosx-draft.js`（参数可选），无需网页 SDK 安装，但 Worker 执行权限仍须按产品流程批准。

Fetch 的取消使用 AbortController。SDK 公共 facade 没有此页面所用的 AbortSignal 接口，因此 SDK 通道禁用取消按钮。更改输入或重置仅让旧响应失去显示资格，不宣称底层 SDK 请求已停止。

跨源测试用另一端口的同一辅助服务。服务不提供 Access-Control-Allow-Origin；普通网页 Fetch 应因 CORS 失败，未批准 SDK 应拒绝。SDK 额外目标 Origin 必须在精确批准快照中明确列出。跨源授权在扩展 Worker 重启后须重新批准；页面导航需要选择新 document。

`http-fetch-draft.js` 用正式 Page API 驱动同一 DOM 表单；`worker-http-draft.js` 在 Sidebar 草稿 Runtime 内使用注入的 axiosx，与网页 MAIN SDK 的授权身份独立。原表单和现代搜索的 ID、签名任务包不变。

```sh
node --test tests/environment/basic-browser-page.test.mjs tests/environment/basic-browser-axiosx.test.mjs tests/environment/basic-browser-http.test.mjs
node --test tests/framework/k4-sdk.test.mjs tests/framework/k2-sdk-cross-origin-broker.test.mjs tests/framework/k4-network.test.mjs tests/framework/k3-context.test.mjs
```

本分支保留独立 CFT 的网页 SDK 与 Worker 真实证据；正式关闭情况见 `docs/framework/workstreams/r72-axiosx-01a11c27.json`。组件测试、浏览器 HTTP、原生持久回执分别记账；尚未完成的原生 Page API、撤权、390px 及最终 PR20 候选验收均为 `NOT_TESTED`，不将本分支回执冒充 PR20 最终 PASS。

## R6.2 Agent → Task：两个草稿，一个未验证 Candidate

新增两个可复用阶段样本，**无需更改**本页面、R6 Sidebar 三页签或已有旧版 Task 包：

- `agent-observe-draft.js`：只读 `page.observe({root:'#search-form'})`；可由 Sidebar「开发」直接运行，也可由现有 Native Agent `run.start` 以 `source.kind='draft'` 执行。返回有限的语义观察结果，**不会**自动点击、申请权限或发布任务。观察文本均按不可信页面内容处理。
- `modern-search-draft.js`：既有的 Label/Role Locator 表单自动化；真实 Chrome 运行需使用同一 RunHost、正确网站 grant 和当前 `documentId`，并记录唯一提交效果及 Durable Result。
- `modern-search.v1.opendesk-task.json`：使用上面**完整相同** `modern-search-draft.js` 执行源码字节和 SHA-256 的 Task v1 **Candidate**。在完整任务目录「导入」后必须仍为待验证；只有同源码、同 origin 的真实 `runId/resultId`、原生页面效果回执和 released Worker 才能 Verified → Available → 明确安装。不能把只读观察运行当作这项验证。
- `tests/environment/agent-to-task-fixtures.test.mjs`：验证观察草稿可独立执行但无页面操作，以及现代 Task 包哈希确实对应现有 JS；**仅组件层证据**。

本地端到端的顺序：打开本 HTTP 页面并取得权限 → 运行只读观察 → 编写/试运行现代 JS → 检查真实原生页面与持久结果 → 保存不可变版本 → 在完整目录导入 Candidate 并人工核对 → 用户设为 Available、安装 → 关闭 Codex/Native 再由 Sidebar「我的任务」重复运行。完整协议、安全与失败边界以 [Agent → Task R1 唯一合同](../../docs/architecture/browser-framework/agent-to-task-contract-r1.zh-CN.md) 为准；Native 原生验收前不得声明整个流程 PASS。

**并行候选说明：** 主干的 `agent-modern-search.v1.opendesk-task.json` 与 Native 候选的 `modern-search.v1.opendesk-task.json` 为不同 Task ID 的待验证包；均不得自动设为 Available/Installed。网页 Fetch、网页 SDK `axiosx` 和 Worker `axiosx` 的浏览器网络效果必须分别验收。

## R8 Browser Test Lab：七组场景，同一个人工入口

当前 `demo-form.html` 已增强为轻量 **Browser Test Lab**，通过单页导航显示 01–06 原有场景及 **07 Locator 专项验收**。仍然是普通 HTML 页面，不是独立测试管理平台，也不要求额外构建产物或外部依赖。启动与访问 URL 完全不变。

新场景提供四项可观察 Fixture：

| 能力 | 控件或观察位置 | 预期 |
| --- | --- | --- |
| 同名元素 | `#locator-confirm-a` / `#locator-confirm-b` | 精确名称匹配返回 2 个；按 testid 只点击对应分区，结果写入 `#locator-duplicate-result` |
| 禁用与只读 | `#locator-disabled-button` / `#locator-aria-disabled` / `#locator-readonly-field` | 禁用按钮不得被自动化提交；readonly 不允许 fill 覆盖 |
| 遮挡 | `#locator-covered-target` / `#locator-cover-toggle` / `#locator-cover-count` | 默认有覆盖层、解除后点击数真实增加 |
| 延迟 DOM | `#locator-late-launch` / 动态 `[data-testid="locator-late-target"]` | 点击后约 700 毫秒生成目标；重置或再次启动取消旧定时任务 |

第 07 组包含可以复制到 Sidebar「开发」的现代 `async function main()` 草稿。**页面仅表现可观察 DOM 事实**，不能代替 Sidebar → RunHost → 原生 Chrome → Controller Durable Result 的真实操作与身份回执。新测试回归与旧契约共同执行：

```sh
node --test tests/environment/basic-browser-page.test.mjs
```

完整的合并策略、场景矩阵、失败用例和独立专家质量评分门槛参阅 [Browser Test Lab R8 规格](../../docs/framework/browser-test-lab-r8.zh-CN.md)。

**历史临时入口**：`locator-acceptance.html` 与本机 64687 端口的 `/next` 均不属于当前仓库 `main` 受管理的人工测试页面。它们可能由本地专项运行器或遗留开发服务器提供。禁止将它们当成标准测试首页，也不要未确认调用者便删除资源；具体排查步骤见 [Browser Test Lab R8 规格](../../docs/framework/browser-test-lab-r8.zh-CN.md)。
