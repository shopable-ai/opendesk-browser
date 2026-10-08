# OpenDesk Browser · Browser Test Lab R8

> 状态：已在 main 实施单页面的导航与 Locator Fixture。本文是**测试场景/验收规格**，不是原生 Chrome PASS 回执。
> 更新时间：2026-10-09。

## 决策：一个人工入口，多个专项自动化 Fixture

- **唯一日常人工入口**：`examples/tasks/demo-form.html`，端口 43111、URL `http://127.0.0.1:43111/demo-form.html`。
- **专项测试资源**：`tests/prototypes/**/fixture/`、`contracts/fixtures/` 及由运行器生成的 HTML，可独立存在。它们不是需要删除的重复人工入口。
- 用户现场的 `127.0.0.1:43113/locator-acceptance.html` 无法从本执行环境访问，而且当前 main Git 树中没有该文件。**不要猜测其内容，也不要在未知脚本依赖下删除它**。本地审查该服务进程、生成器、引用与历史报告后，才允许下线、改为专项入口或建立 301/302 兼容链接。
- 页面自身不包含浏览器扩展运行时。页面负责**真实、稳定、可复现的 DOM/HTTP 被测条件**；Sidebar、Page API、RunHost、GM/USER_SCRIPT 运行证据来自实际扩展。

## 页面信息架构与视觉原则

从本地普通网页升级为轻量实验室页面，但不能伪装成统计后台；左栏按编号定位场景，右栏始终展示真实表单与控件，不用默认收起的 tab/accordion 包裹被测 DOM（避免 Locator 意外不可见）。

1. Sticky 顶栏：产品识别、LOCAL FIXTURE 标志、`#reset-all`。
2. Intro / 快捷能力标签：明确这是测试环境，不把 DOM 状态称为通过。
3. 左侧场景导航：01–07，可键盘访问，锚点链接；窄屏退化为横向导航。
4. 六组核心场景：文本/列表、点击/显隐、异步请求、旧版表单、现代动态搜索、真实 HTTP GET。
5. 第七组 Locator 专项：四张可操作卡片、实测结果位置、Sidebar 草稿样例和能力边界。

不依赖在线字体、图片、CDN、第三方 JavaScript、框架 CSS 或联网 API；保留唯一原生 inline script。尊重 reduced-motion、原生 label、aria-live、focus-visible 与小屏布局。

## 契约矩阵

| 场景 | DOM 目标 | 可以断言的事实 | 失败/负例 |
| --- | --- | --- | --- |
| 文本读取 | `#sample-title`, `#sample-text`, `#sample-list` | 文本固定、ID 与 testid 唯一 | 找不到、重复或文案改变 |
| 点击与显隐 | `#click-button`, `#click-count`, `#toggle-button`, `#extra-text` | 真实计数自增；`aria-expanded` 与 `hidden` 同步 | 计数重复、不可见却被定位为 visible |
| 异步请求 | `#request-success/failure/timeout/cancel`, `#async-status` | 发出同源 GET，状态包括 success/error/timeout/cancelled | 404、超时、取消后迟到响应 |
| 旧版 Task Package | `#name` → `#submit` → `#done` | 源脚本与任务 SHA 不变；提交文案正确 | required 与旧结果残留 |
| 现代 Locator | `#keyword`, `#search-submit`, `#results` | `fill` 替换预填值、按钮重绘/暂禁、唯一提交 | detached、disabled、重复提交 |
| 原生 HTTP | `#api-url`, `#api-send`, `#api-http-status`, `#api-response` | 真实 HTTP 200/404、耗时、类型与正文；无 Cookie | 网络/CORS/URL 无效/取消/超时 |
| Locator：同名 | `#locator-confirm-a/b`、`#locator-duplicate-result` | 同名按钮 count=2，按 testid 可精确点击 A/B | 不唯一定位不可直接提交 |
| Locator：可操作性 | `#locator-readonly-field`、`#locator-disabled-button`、`#locator-aria-disabled` | 原生 readonly/disabled/ARIA 属性存在 | 禁用或只读被绕过 |
| Locator：遮挡 | `#locator-cover-shield`, `#locator-covered-target`, `#locator-cover-toggle` | 默认覆盖按钮；解除后用户真实点击增加计数 | 被遮挡时产生错误提交 |
| Locator：延迟 DOM | `#locator-late-launch`, `#locator-late-result`, 动态 testid=`locator-late-target` | 700ms 后真实挂载、waitFor visible 成功 | reset/新请求后旧定时器复活 |

### 防止错测的规则

- `getByRole/getByLabel/getByTestId/locator/observe` 是 OpenDesk **有限实现**，不能默认照搬 Playwright 所有方法。现代接口能力版本及边界见 `types/opendesk-page.d.ts`、`docs/framework/modern-page-api.zh-CN.md`。
- 本页通过 `fetch` 可验证**浏览器原生 HTTP 与 CORS**，**不能据此证明**扩展提供的 `axiosx`/GM 请求桥具有跨源能力。如果未来需要验证这两种 API，应先核对实际 SDK 注入 Realm、调用签名与安全策略，使用明确的扩展脚本及扩展回执，**不能在网页 window 中制造同名 mock**。
- “模拟超时”表示客户端等待被限时中止，**不是 Python HTTP 服务器真实延迟**。
- 真实 IP 示例需用户点击 GET；跨域失败可能为服务端 CORS，不能假装为插件问题。响应正文始终写入 textContent，不执行第三方 HTML。
- 改造页面不得改变 `examples/tasks/form-fill.v1.opendesk-task.json`，尤其 sourceHash、siteOrigins 和已发布任务约束。
- 人工页面的绿色状态、测试按钮结果、Node 组件测试与 GitHub CI 均不得伪装为 OpenDesk 扩展**真实 Chrome Native PASS**。

## 最小验收流程

```bash
# 仓库根目录
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
# 另一个终端（无需更改 main 或创建新分支）
node --test tests/environment/basic-browser-page.test.mjs
```

浏览器打开 `http://127.0.0.1:43111/demo-form.html`：

- 首先人工确认 7 个锚点跳转、reset、窄屏布局、键盘焦点、DOM ID 唯一性。
- 核对旧 `form-fill.v1.opendesk-task.json` 和现代 `modern-search-draft.js` 的正常提交与重跑。
- 复制第 07 组中的 `async function main()` 到 Sidebar「开发」；确认 sameNameCount=2、可精确点击 A、延迟目标等待可见。
- 再对非唯一点击、disabled/readonly、遮挡超时做**预期失败**测试，检查没有副作用或盲重放。
- 检查 GET 同源 200 / 404、CORS 失败、取消和重置后不恢复旧结果。
- 如声称扩展原生验收，须记录最新源码 HEAD、extension dist SHA、浏览器/扩展版本、runId、resultId、revision/sourceHash、native ack、Controller durable result。缺任何关键证据标 `NATIVE_NOT_VERIFIED`。

## 专家评分门槛（单项独立，不做平均遮蔽）

每项以 100 分制独立判断；只有**每项至少 95 分且真实性验收合格**才能声明整体达到 95+。未实测的不评分或标待验收。

| 维度 | 95+ 的客观准入条件 |
| --- | --- |
| 视觉和信息架构 | 桌面/窄屏实际截图验收，导航明确、阅读顺序清晰、控件一致、不出现无意义装饰 |
| 可测能力覆盖 | 各核心目标有固定输入、明确预期 DOM、正例和负例、重置可重复执行 |
| 兼容性与稳定性 | 现有 DOM ID/旧任务哈希/现代搜索重绘行为不破坏，新增 Node 契约回归通过 |
| 无障碍与易用性 | 原生 label、role、状态播报、键盘焦点、缩放和小屏浏览完成真实人工验收 |
| 安全与结果真实性 | 无自动外部请求、无凭据上传、无 HTML 注入、无假 PASS、原生证据可溯源 |

截至本文件创建时：**静态目标已经实现，但真实 Chrome 逐项验收及视觉截图还未完成；不声称 95+ 已被证明。**

## 维护规则

- 人工入口只维护 `examples/tasks/demo-form.html`，契约在 `tests/environment/basic-browser-page.test.mjs`。
- 每增加一个场景，同步更新 README/矩阵、稳定选择器、reset 行为、Node 回归及原生可执行示例；避免把观测控件画成摆设。
- 不删除私有本地 `43113` 服务或独立原生测试 Fixture，除非在实际机器验证其用途和全部引用。
