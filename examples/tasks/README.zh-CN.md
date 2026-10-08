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
| HTTP GET | `#api-url`、`#api-send`、`#api-status`、`#api-http-status`、`#api-response` | 真实返回状态码、耗时、响应类型和正文；错误、取消、超时分状态 |

- **真实网络请求**：成功场景通过 `fetch('./demo-form.html?test-response=1')` 读取当前 HTML；错误场景访问固定不存在的路径，Python 静态服务应返回 HTTP 404。
- **延迟为客户端可控等待**（300ms、1.2s、3s），不是服务器真实变慢。超时按钮使用 700ms 客户端期限；所有异步结果均由实际 DOM 表达，不依赖伪造测试 PASS。
- 取消、新请求覆盖旧请求、重置均通过 `AbortController` 清理；不能出现已取消请求稍后将旧成功写回页面。
- 旧版任务包不自动清空 `#name`（它的 `page.type` 是追加输入）。重跑前可以点击顶部“重置页面”或刷新。
- 通过 `file://` 打开时真实同源 `fetch` 不受支持，必须使用上述本地 HTTP 地址。扩展侧 RunHost、权限和原生回执需要在真实 Chrome 单独验收。

定向静态/兼容契约检查：`node --test tests/environment/basic-browser-page.test.mjs`。

## R7.1 HTTP API 验证与唯一人工测试入口

**人工操作、Sidebar 草稿、Page API 和 HTTP 演示只使用 `http://127.0.0.1:43111/demo-form.html`。** 上方 HTTP 启动命令保持不变，不需要启动其他测试服务。旧的临时测试服务器路由（例如 `/fixture`）是专项原生验收的内部资源，不能作为人工演示网页地址；相关目录 `tests/prototypes/**/fixture/` 不随人工入口统一而删除，它们由独立测试运行器引用。

在页面第 06 组，保持默认 `./demo-form.html?test-response=1`，点击「发送 GET」：应看到 `#api-status[data-state="success"]`、实际 `#api-http-status` 为 200、响应类型含 `text/html`，且 `#api-response` 可读取页面 HTML 前段。改填 `./__opendesk_expected_404__.json` 再发送，应看到 404、`data-state="error"` 及服务器返回正文。切换示例地址只填入，不自动发请求。

需要验证外部真实 JSON 时，在下拉框选择「公网 IP JSON」，明确点击发送：成功时响应正文会显示 `ip` 字段；该示例会访问第三方服务，受网络与 CORS 条件影响，失败不能直接归因于 OpenDesk Page API。也可以手工输入自己的 HTTP(S) URL，页面只发 GET、不携带 Cookie，最多显示前 4096 字节；不支持在这个单页里假装静态 Python 服务能够处理 POST。8 秒超时会中止请求；取消、重新发送、修改 URL、页面重置都不能让旧响应覆盖新状态。

可通过以下 **现代 Page API 草稿**验证真实页面 DOM 回执（不需要新增脚本文件）：

```javascript
async function main() {
  await page.getByLabel('请求 URL', {exact:true}).fill('./demo-form.html?test-response=1');
  await page.getByRole('button', {name:'发送 GET', exact:true}).click();
  await page.locator('#api-status[data-state="success"]').waitFor({state:'visible',timeout:10000});
  return {
    status:await page.locator('#api-http-status').textContent(),
    contentType:await page.locator('#api-content-type').textContent(),
    preview:await page.getByTestId('api-response').textContent()
  };
}
```

表单和现代搜索依旧分别使用 `#name/#submit/#done`、`#keyword/#search-submit/#results`，旧版任务包及 SHA 不变。运行 `node --test tests/environment/basic-browser-page.test.mjs` 验证页面契约和轻量 DOM 行为；该检查 **不等于** 完整 Chrome MV3 → RunHost → Controller → Durable Result 原生验收。真正的 Chrome 结果需由 Sidebar 记录运行 ID、结果 ID 和操作回执；没有时记 `NATIVE_NOT_VERIFIED`。


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

**另一个端口的 `locator-acceptance.html`**：该文件不在当前仓库 `main` 的 Git 树中；它可能是用户本机专项运行器生成的临时页面。尚未取得源文件或其引用关系时，不要擅自删除相关服务、测试产物或脚本。等在本地核对真实依赖后再确认是否取消重复人工入口。

## R7.2 集成说明：第 06 组已升级为 axiosx / Fetch 双通道

> **以本节为准。** 上文 R7.1 的「只能发送 GET、默认 HTML 地址、8 秒固定超时」是历史阶段说明；现行第 06 组默认使用 `OpenDeskSDK.axiosx`，支持 GET/POST、显式通道选择和自定义超时。原始 Fetch 可通过下拉切换作为 CORS 对照，取消语义不能与 SDK 混淆。第 07 组 Locator 实验室、页面单入口、原任务包的源码与 SHA 均保留。

## R7.1 / R7.2：OpenDesk axiosx 优先的单页 HTTP 测试

**唯一人工浏览器测试入口**：`http://127.0.0.1:43111/demo-form.html`。保持一个 HTML；已有历史测试运行器的内部 fixture 不能当作人工入口，但也不能擅自删除。原签名 `form-fill.v1.opendesk-task.json` 不变。

### 1. 稳定本地测试接口（无需公网）

从仓库根目录执行：

```bash
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

必须保证本地 checkout 存在 `examples/tasks/request-sample.json`。默认 URL 为 `./request-sample.json`，真实目标：

- `GET http://127.0.0.1:43111/request-sample.json` → 200 JSON，正文包含 `"source":"opendesk-browser-local-fixture"`。
- `GET ./__opendesk_expected_404__.json` → 真实 404。
- `GET ./demo-form.html` → 200 HTML 文本，仅文本展示，不作为页面代码执行。

如果默认 JSON 404，先核对当前检出是否包含本轮 PR 新增的文件，不要错误归因于 axiosx。

### 2. 网页注入 SDK axiosx（**本轮主要验收对象**）

第 06 组 `#api-channel` 默认是 `axiosx`，网页 Fetch 仅用于 CORS 对照。安装扩展后，在扩展的「独立网页 SDK」区域选择当前真实 tab/frame/documentId，勾选 `network`，使用可信用户点击授权并安装。跨源 HTTP 还须明确批准目标 Origin，不可仅依据扩展全站权限推断应用层已经批准。

授权完成后，从实际网页 MAIN 中调用：

```javascript
const sdk = window.OpenDeskSDK;
await sdk.ready();
const response = await sdk.axiosx.get(
  new URL('./request-sample.json', location.href).href,
  {timeout:5000}
);
console.log(response.status, response.data, response.headers);
```

SDK 是本仓库 `src/framework/sdk/http.js` 定义的 Axios 风格 facade，不是 npm Axios。调用链必须经过 MAIN → ISOLATED Relay → SDK Broker/Authority → 扩展后台 Network Driver → 真实 HTTP。若未注入，网页显示 `E_SDK_UNAVAILABLE`，拒权/缺能力必须显示实际错误码；**绝不静默回退为普通 Fetch**。默认不会请求公网 API，公网 IP 选项仅用户明确发送后才调用，并会向第三方共享出口 IP。

支持 GET/POST、5 秒默认超时、HTTP status/耗时/响应体/错误提示。POST 文本首先解析为 JSON；无效 JSON 不发送。HTTP 非 2xx 时 SDK 通常拒绝 `E_HTTP`；若返回对象包含 status 和 data，原样展示。SDK HTTP driver 默认不携带 Cookie，不跟随跳转，不支持完整 Axios 配置。

**取消语义必须区分**：Fetch 的取消通过 AbortController 中止；SDK axiosx 当前不提供单次调用级 AbortSignal，`#api-cancel` 对 SDK 只停止展示迟到结果，不声称后台网络请求已被取消。真实 SDK timeout/导航/撤权另需独立验收。

### 3. 可选本地 Node 服务：POST、真实延迟、精确状态、CORS

需要以上场景时，先停止 Python 服务，再运行零 npm 依赖的 Node 服务（不要抢占已有的 43111 端口）：

```bash
node examples/tasks/http-test-server.mjs 43111
```

| HTTP 场景 | URL 与操作 | 预期 |
| --- | --- | --- |
| JSON | GET `./request-sample.json` | HTTP 200 JSON |
| 不存在资源 | GET `./__opendesk_expected_404__.json` | HTTP 404 |
| 限流样例 | GET `./__test__/status?code=429` | HTTP 429 |
| 服务端错误 | GET `./__test__/status?code=500` | HTTP 500 |
| 真实延迟 | GET `./__test__/delay?ms=2000` | 服务端等待约 2 秒 |
| 文本 | GET `./__test__/text` | 200 text/plain |
| POST | POST `./__test__/echo` | 200 JSON，回显 received |

Python 静态服务器并没有 JSON POST echo 功能，不能将其 POST 返回的 501 当作成功。

**跨源对照**：第二终端运行 `node examples/tasks/http-test-server.mjs 43112`，从 43111 页面请求 `http://127.0.0.1:43112/request-sample.json`。该服务刻意不添加 Access-Control-Allow-Origin：

1. 网页 Fetch：应被 Chrome CORS 阻止读取；DevTools Network 可核对 HTTP 端点确实返回了数据。
2. axiosx 未批准 43112 目标 Origin：必须由扩展 Authority 拒绝，不能借由 Host Permission 跳过应用级限制。
3. axiosx 用户明确批准 43112 目标 Origin 和 Chrome Host Permission 后：后台请求预期可读取 JSON 200，不再受到来源网页 CORS 读取限制（以真实 Chrome 证据为准）。
4. 再验证撤权、导航、超时、再次执行与旧请求迟到结果不回写。

Node 本身的 fetch 不执行浏览器 CORS，不能用 Node 成功替代浏览器验收。

### 4. 两条 axiosx 通道必须分开验收

- **网页 MAIN SDK**：上述 HTML 第 06 组直接使用 `window.OpenDeskSDK.axiosx`。
- **Controller Worker**：Sidebar「开发」运行 `examples/tasks/http-worker-axiosx-draft.js`，使用 Worker 注入的 `axiosx.get`；与网页 SDK 不是同一授权身份。
- **OpenDesk Page API 操作 HTML**：Sidebar「开发」运行 `examples/tasks/http-axiosx-page-draft.js`，用 `page.getByLabel().fill` 和 `getByRole().click` 操作按钮、等候 DOM 响应。它不能代替后台 SDK 的原生回执。

关键选择器固定：

| 作用 | 选择器 |
| --- | --- |
| 通道、URL、Method | `#api-channel`、`#api-url`、`#api-method` |
| 超时、POST 正文 | `#api-timeout`、`#api-post-body` |
| 发送、停止/取消 | `#api-send`、`#api-cancel` |
| 真实 HTTP、耗时、类型 | `#api-http-status`、`#api-duration`、`#api-content-type` |
| 响应、错误、状态 | `#api-response`、`#api-error`、`#api-status[data-state="..."]` |

DOM 响应只写入 textContent，最多显示 4096 字符，不执行不可信 HTML。完整验收命令和本机真实 Chrome/SDK/CDP 回执步骤见 `docs/framework/prompts/goal-r7-axiosx-local-http-acceptance.txt`。没有真实 Chrome 原生证据时分别标记 `NOT_TESTED`，不要以静态/组件测试伪称原生 PASS。
