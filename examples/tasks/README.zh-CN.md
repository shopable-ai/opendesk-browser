# OpenDesk Task Package v1：本地表单演示

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

- `getByLabel('搜索关键词')` 的 `fill` 必须覆盖预填的「旧的预填内容」。
- 页面收到 input 后同文档重绘「搜索」按钮，并短暂禁用，`getByRole('button',{name:'搜索',exact:true}).click()` 应自动重新定位和等待。
- 等待「搜索完成」，`#results` 返回「结果：OpenDesk」，页面「提交次数」只增加 1。
- 再次直接运行相同草稿，检查第二次仅增加 1，并确认 Sidebar 最终持久结果。无需先候选/发布/安装，也无需外部 Playwright 或 MCP 做页面动作。
- 如果使用 AI，可先运行 `await page.observe({root:'#search-form'})` 读取表单角色/名称；其输出是有限预算的语义 DOM 摘要，而非浏览器原生 AX 树。

**R5.2 补充验收**：`page.observe({root:'#search-form'})` 应返回有限节点和 `budget.visited/locatorChecks` 等计算量信息；定位建议仅在 `locator` 不为 null 时表示通过相同查询规则的一次唯一性验证。额外检查遮挡、disabled/aria-disabled、readOnly/aria-readonly、按钮动画、Locator 单次超时，以及动作回执缺失时 **不可再次提交**。组件模拟通过不等于 Chrome 实测；只有 Sidebar 原有 Controller 运行链返回真实 `runId/resultId`、提交回执和 Durable Result，才可对本机标记通过。修复细节和已有 CI 见 [R5.2 验收记录](../../docs/framework/workstreams/r5-2-modern-page-api-acceptance.md)。

旧版 `form-fill.v1.opendesk-task.json` 的已发布源码、sourceHash 和 manifestHash **保持不变**：它仍然使用旧 `page.type` 追加输入；本轮不破坏已经发行任务。现代 API 具体边界见 `docs/framework/modern-page-api.zh-CN.md`。

## R7 基础交互测试：一个 HTML 即可

主入口仍是 `http://127.0.0.1:43111/demo-form.html`。页面是一张简单的内容/表单网页，**不是测试管理后台**。默认只需 Python 静态 HTTP 服务；R7.1 增加了一个同源 JSON 夹具和可选的 Node 测试服务，主 HTML 仍只有一个：

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

- **真实网络请求**：成功场景通过 `fetch('./demo-form.html?test-response=1')` 读取当前 HTML；错误场景访问固定不存在的路径，Python 静态服务应返回 HTTP 404。
- **延迟为客户端可控等待**（300ms、1.2s、3s），不是服务器真实变慢。超时按钮使用 700ms 客户端期限；所有异步结果均由实际 DOM 表达，不依赖伪造测试 PASS。
- 取消、新请求覆盖旧请求、重置均通过 `AbortController` 清理；不能出现已取消请求稍后将旧成功写回页面。
- 旧版任务包不自动清空 `#name`（它的 `page.type` 是追加输入）。重跑前可以点击顶部“重置页面”或刷新。
- 通过 `file://` 打开时真实同源 `fetch` 不受支持，必须使用上述本地 HTTP 地址。扩展侧 RunHost、权限和原生回执需要在真实 Chrome 单独验收。

定向静态/兼容契约检查：`node --test tests/environment/basic-browser-page.test.mjs`。


## R7.1：在同一页面发送真实 HTTP 请求

默认运行方式（仅 Python 标准库，保持旧入口不变）：

```bash
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
# 打开 http://127.0.0.1:43111/demo-form.html
```

「HTTP 与异步请求」区域的**真实 HTTP 请求**表单默认使用 `GET ./request-sample.json`。点击「发送请求」后，浏览器直接调用原生 `fetch()`，显示真实 HTTP 状态码、响应耗时、Content-Type、JSON（或原始文本）及错误。响应区域使用可折叠 `<details><pre>` 与 `textContent`，不执行返回的 HTML/脚本。预览超过 60,000 个字符截断。`http-example` 只填入示例 URL，**切换选项不会自动访问第三方**。输入自定义 URL 后切换为「自定义 URL」。

| 实际操作 | 稳定 DOM 目标 | 行为及断言 |
| --- | --- | --- |
| 选择 URL 样例 | `#http-example` | 只填充 `#http-url`；不发请求 |
| 编辑方法和地址 | `#http-method`、`#http-url` | GET 默认为 `./request-sample.json`；POST 出现 `#http-body` |
| 设置客户端超时 | `#http-timeout` | 100–30000 ms（默认 5000） |
| 发起请求 | `#http-send`（提交 `#http-form`） | `#http-status[data-state="loading"]`，然后进入终态 |
| 查看状态/耗时/类型 | `#http-code`、`#http-duration`、`#http-content-type` | 显示服务器真实状态码和页面测量的毫秒数 |
| 查看响应 | `#http-response-details`、`#http-response` | 展开后显示 JSON 格式化文本或非 JSON 原文 |
| 查看错误 | `#http-error`、`#http-status` | HTTP 非 2xx、网络失败、JSON 解析失败、超时均可区分；CORS 与离线不能可靠区分 |
| 取消 | `#http-cancel` | 取消当前请求，`data-state="cancelled"`；禁用取消按钮 |
| 覆盖或重置 | 连续提交 `#http-send`，或 `#reset-all` | 前一次请求中止；旧响应不能覆盖新结果，重置回本地 JSON |

上述关键元素同时带有与 ID 同名的 `data-testid`，可由项目已支持的 `page.locator('#http-url')`、`page.click('#http-send')`、`page.waitForSelector('#http-response')` 等 API 访问；具体可用方法必须以当前 SDK 为准。**直接测试网页 DOM、Node HTTP 服务或 Playwright 独立浏览器，不等于扩展内 ChromePage 的原生回执验证。**

### 同源请求场景和可选的真实延迟服务

Python 静态服务即可测试：`./request-sample.json`（200 JSON）、`./demo-form.html`（200 HTML 文本）、`./__opendesk_expected_404__.json`（404）、重复请求、新请求覆盖旧请求、`http://127.0.0.1:43112/request-sample.json`（若没有服务监听，即连接失败）。`file://` 不是正式测试入口。HTTP POST 对 Python 静态服务可能得到 `501`，这是实际服务行为，不应标记为测试失败。

如需可重现的**服务端**响应延迟、状态码、POST 和浏览器 CORS 场景，可改用本仓库自带且无 npm 依赖的辅助服务（不要让两个服务同时占用 43111）：

```bash
node examples/tasks/http-test-server.mjs 43111
# 页面：http://127.0.0.1:43111/demo-form.html
# 真实延迟：GET ./__test__/delay?ms=1500
# 真实 429：GET ./__test__/status?code=429
# 真实 500：GET ./__test__/status?code=500
# 纯文本：GET ./__test__/text
# POST JSON 回显：POST ./__test__/echo
```

服务仅监听 `127.0.0.1`，只开放已列出的资源与测试端点，`ms` 上限为 5000。若要验证 CORS，另起一个 `node examples/tasks/http-test-server.mjs 43112`，从 43111 页面请求 `http://127.0.0.1:43112/request-sample.json`。43112 确实有响应但**未提供 `Access-Control-Allow-Origin`**，浏览器应在页面 Fetch 层报网络型错误；DevTools Network 中可确认 CORS 详情。不同端口就是不同 origin；Node `fetch()` 不实施浏览器的 CORS 限制，不能把其结果视为 CORS 浏览器验收。测试真正的超时：选择 `GET ./__test__/delay?ms=2000`、超时 `300`；测试取消：超时 `5000`，发起延迟请求后立刻点击取消；完成后的耗时记录包含请求与响应体读取时间。

### 公网示例：只有用户点击后发送

- **城市查询**：Open-Meteo Geocoding API，`name=Beijing`，无需 API Key；响应字段如 `results` 可能随地区、匹配条件和供应方数据变化。
- **天气查询**：Open-Meteo Forecast API，北京坐标，返回当前天气数据；不读取浏览器地理位置。官方说明浏览器 CORS、无须密钥，免费接口仅用于非商业用途，有公开配额与不保证 SLA 的限制。
- **公网 IP**：`https://ipwho.is/`，主动访问会让提供商获得请求源的公网 IP（代理/VPN 下为出口 IP），同时可获取推断位置。IP 提供商有配额及 CORS 的域名计数规则，请勿高频自动请求。

官方说明：[Open-Meteo / API 与 CORS](https://github.com/open-meteo/open-meteo)、[Open-Meteo / 许可与限制](https://open-meteo.com/en/terms)、[ipwho.is / 免费接口与限额](https://ipwhois.io/documentation)。外部服务可能因网络、地域、限速、CORS 策略或服务变化失败；**外部成功必须由当前真实浏览器响应验证，不能由 README 示例推定**。

### OpenDesk Page API 一键验收草稿

在 Sidebar「开发」中粘贴本目录新增的 `http-fetch-draft.js`，输入参数 `{"url":"./request-sample.json","expected":"success"}`，运行前确保演示页为当前目标、网站已授权。它用已存在的 `getByLabel().fill()` 填写 URL、`getByRole().click()` 点击发送、`locator(...).waitFor()` 等待 `#http-status[data-state="success"]`，最后读取实际 DOM 的 HTTP 状态、耗时、Content-Type、响应内容与错误信息。结果应含 `httpStatus: "HTTP 200"` 和本地夹具内容（由本机真实返回决定，而非脚本模拟）。

要验证真实 404：输入 `{"url":"./__opendesk_expected_404__.json","expected":"error"}`，检查结果 `httpStatus: "HTTP 404"` 和服务器原始响应。重复执行 2 次，核对运行序号、目标身份、结果持久化和回执。对后续耗时和取消仍需浏览器原生手动点击或特定任务草稿，并不能仅靠这一简单成功/错误草稿宣称全覆盖。**当前仅提供源码和静态契约，OpenDesk 扩展真实运行尚未在此环境验收。**

### 自动化验证等级（必须分开记录）

| 层级 | 验收方式 | 证明范围 |
| --- | --- | --- |
| 源码契约 | `node --test tests/environment/basic-browser-page.test.mjs` | 旧签名表单任务、现代搜索 DOM 和 HTTP 控件存在，内联 JS 可解析 |
| 本地真实 HTTP | `node --test tests/environment/basic-browser-http.test.mjs` | Node HTTP 实际 200/404/429、HTML、纯文本、POST 和 abort；非浏览器验收 |
| 独立 Chromium | 真实浏览器打开上述本地页面，实际点击并检查 DOM、Network 和窄屏截图 | 网页 Fetch、浏览器 CORS、交互与布局；非扩展 Page API |
| OpenDesk MV3 原生链 | 真实 Chrome 安装扩展、可信手势授权、Sidebar 草稿与原签名任务、持久 Run/Result 回执 | Page API 和任务链本机验收；未执行时标记 `NOT_TESTED` |

本轮没有引入 Axios/`axiosx`：仓库当前 `package.json` 不包含 Axios，默认分支代码搜索也未发现这两个符号。原生 `fetch()` 已足够验证页面 HTTP 行为；扩展自己的跨源权限、RunHost、Native Agent 仍需独立验证，不受测试页面通过与否影响。
