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
| HTTP GET | `#api-url`、`#api-send`、`#api-status`、`#api-http-status` | 页面只有输入框和 GET 按钮；真实响应在 DevTools Network 查看；隐藏 `#api-response` 保留脚本断言兼容 |

- **真实网络请求**：成功场景通过 `fetch('./demo-form.html?test-response=1')` 读取当前 HTML；错误场景访问固定不存在的路径，Python 静态服务应返回 HTTP 404。
- **延迟为客户端可控等待**（300ms、1.2s、3s），不是服务器真实变慢。超时按钮使用 700ms 客户端期限；所有异步结果均由实际 DOM 表达，不依赖伪造测试 PASS。
- 取消、新请求覆盖旧请求、重置均通过 `AbortController` 清理；不能出现已取消请求稍后将旧成功写回页面。
- 旧版任务包不自动清空 `#name`（它的 `page.type` 是追加输入）。重跑前可以点击顶部“重置页面”或刷新。
- 通过 `file://` 打开时真实同源 `fetch` 不受支持，必须使用上述本地 HTTP 地址。扩展侧 RunHost、权限和原生回执需要在真实 Chrome 单独验收。

定向静态/兼容契约检查：`node --test tests/environment/basic-browser-page.test.mjs`。

## R8.1 HTTP GET 极简验收（取代 R7.1 旧操作步骤）

**唯一人工入口仍是 `http://127.0.0.1:43111/demo-form.html`。** 第 06 组不再是接口调试面板，只有一个 URL 输入框和一个「发送 GET」按钮；页面不再展示预设选择、取消按钮、HTTP 元数据表或响应正文。也不新增 POST 控件。

默认 URL 为 `./demo-form.html?test-response=1`。点击 GET 后，可见 `#api-status[data-state="success"]` 和真实 `#api-http-status` 为 200；打开 Chrome DevTools → **Network → Fetch/XHR** 可查看请求 URL、Headers、HTTP 状态码及 Response。需验证 404 时，将输入框改成 `./__opendesk_expected_404__.json` 后点击一次 GET。只有用户点击按钮时才发送请求，绝不自动连外网。修改 URL 或重置会中止旧请求并清理状态；8 秒超时依然有效，不允许旧请求迟到覆盖新结果。请求不带 Cookie、不接受 URL 中账号密码，且严格限制 HTTP(S)。

为兼容旧的 **Sidebar Page API 草稿读取**，`#api-duration`、`#api-content-type` 和 `#api-response` 依然存在于隐藏的 `#api-debug-data` 内；可以用 `textContent()` 读取，但它们**不再绘制为调试面板**。正文仅记录前 4096 字节，不执行响应 HTML。

### CORS、axiosx 和网络调试的界限

SDK 的完整非 2xx 响应仍以 `E_HTTP` 拒绝，并在错误顶层提供 `status` / `response`。受信 HTTP Driver 已完整读取、校验的响应会保存为持久错误结果；重复或恢复同一请求只读取该结果，并重新核对授权，不再发送 HTTP。超时、传输失败、无效 JSON 和没有完整原生回执的错误仍保守保留未知效果。完整 R7.2 HTTP 页面候选与当前极简 GET 页存在产品合同差异，分候选证据见 [本轮记录](../../docs/framework/workstreams/r72-http-resume-20261009.md)。

- 本页发出的是**网页原生 fetch**，受浏览器 CORS 限制。一次同源 200 只能证明这个 GET 发生并成功，**不能证明跨域被解决**。
- OpenDesk SDK `axiosx` 走受信宿主的 `NetworkService`，有独立的目标来源授权和执行回执。其专项测试应复用 `tests/framework/fixtures/sdk-target-origins/server.mjs` 的 A/B/C 受控服务及扩展 Controller 测试链；不要在 `window` 上造假的同名 axiosx。
- 页面请求在当前标签 DevTools Network 查看；由**扩展后台**发出的 SDK 请求可能需要在扩展 Service Worker 的 DevTools Network、Fixture 服务请求记录及 Controller 回执中查看，不能仅用网页标签的 Network 面板判定没有请求。
- 自行输入外部 URL 可以检验对应目标服务器的 CORS 行为，但失败可能是外网故障、服务端拒绝或 CORS，不能直接判定 SDK 故障。

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
