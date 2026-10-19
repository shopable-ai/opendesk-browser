# Playwright 远控 R1.0：当前源码事实与下一步验收（2026-10-19）

**边界：只记录经当前 main 源码核查的能力，不声称已完成真实 Chrome / 原版 Playwright 协议验收。**

## 结论

1. **A · 远程触发已安装 Task：已经有实际链路，缺真实 Chrome 端到端证据。** 服务端 Provider /v1/submit → WebSocket 通知和云端 claim → `src/ui/cloud-hosting.js` 的 `dispatchNext` → `cloudNext/cloudResolve` → 现有 `RunHost.start` → `controllerMethods` 的安装身份/网站授权/原结果/释放 → Provider receipt。不可将 Provider 单测等同真实浏览器闭环；当前执行发起依赖已挂载的 Cloud Hosting UI，侧边栏关闭后不能承诺继续领取新任务。
2. **B · 远程高级自动化命令：未确认独立接入。** 可复用现有 `ChromePage` / Locator、已安装 Task 参数与现有权限栅栏，但不能把含固定参数的 Task 调用伪装为开放式远控指令。先给出明确的网站与操作范围、入口、取消和结果身份，再决定最小适配。
3. **C · 原版 Playwright 客户端连接：未实现。** 扩展 Controller、Native Messaging、Chrome DevTools Protocol、Playwright Browser Server 是不同的运行与会话边界。`browserType.connect()` 需要 Playwright Browser Server；`connectOverCDP()` 依赖可连接的 Chromium 调试端点且功能保真度较低。不能以方法同名或 Playwright 风格 Locator 声称协议兼容。

## 已有 Controller 与 Playwright 行为差距（源码级）

| 能力 | OpenDesk 当前实现 | 与原版关系 |
|---|---|---|
| 导航 | `ChromePage.goto/reload`，目标及授权栅栏 | 部分：仅声明的 waitUntil，运行所有权受限制 |
| 选择器 | CSS、角色、文本、label、testId 等语义子集；`first/last/nth` | 部分：不支持 Playwright selector engine / XPath 等 |
| 操作 | Locator click/fill/check/uncheck/selectOption，分 prepare/commit 避免错误重放 | 部分：事件、可信输入和高级操作未等价 |
| 等待 | Locator.waitFor、部分 page.waitFor*，有 Stop / 授权 / 截止时间 | 部分：没有完整 Playwright 自动等待与全套超时层级 |
| 结果与运行 | 原 Controller Result、不可重放意图、宿主关闭和目标释放 | 本产品能力；并非 Playwright BrowserContext |
| 事件/多页面 | 目标绑定与导航交接已存在 | 不支持原版完整 Context、Page 事件与多页面会话协议 |
| 外部 Client | Provider 的限定 Task API | **不支持** Playwright 原版 WS 协议 |

## 本次真实源码修复

- `src/framework/control/native-driver.js`：修正显式 Locator `timeout:0` 被误判为立即过期，且阻止 `setTimeout(Infinity)` 意外被宿主夹成短定时器。始终保留 Controller 的有限总截止时间、Stop/撤权约束。
- `tests/framework/k3-native-driver.test.mjs`：补回归测试，覆盖 `timeout:0` 的已满足等待立即成功，以及未满足等待最终仍被 Controller 截止时间取消。
- 这是**已实施的源码修复**；没有真实执行环境的测试不能登记为 PASS。

## 后续真实验收（不得省略）

1. 用构建出的当前主分支扩展和原始 Controller，在真实 Chrome 中安装两个不同 Task；配对同一 Provider，从独立客户端各提交一次请求，验证真实 DOM 更改、`runId`、`resultId`、`sourceHash`、目标释放和服务端 receipt 的一致性。
2. 运行中的远程请求分别验证手动 Stop、撤销网站授权、禁用/卸载 Task、断线、浏览器重启、过期 permit；具有不明页面副作用的请求必须保持 `OUTCOME_UNKNOWN`，不可自动重放。
3. 同网页同动作建立**原版 Playwright 作为对照驱动**（不是 mock），至少比对 navigation、Locator、click、fill、waitFor 的实际结果及差异；新接入 C 之前须先证明受控 Chrome 调试通道的会话隔离、安全与用户准入。

**验收状态（本文件编写时）**：`SOURCE_FIX_IMPLEMENTED`；`UNIT_PASS_NOT_VERIFIED`；`CHROME_E2E_NOT_TESTED`；`PLAYWRIGHT_PROTOCOL_NOT_SUPPORTED`；`MAC_NATIVE_NOT_TESTED`。不提供虚构的 ≥95 分。

## 官方差异依据

- https://playwright.dev/docs/api/class-browsertype
- https://playwright.dev/docs/api/class-locator
- https://playwright.dev/mcp/configuration/browser-extension
