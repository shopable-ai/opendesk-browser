# OpenDesk Browser 网页 UI、跨运行世界通信与旧版迁移核查

> **审计/产品合同草案（2026-10-14）**。下文明确区分 `SOURCE_CONFIRMED`（存在源码链路）、`HISTORICAL_CHROME_PASS`（只对原验收候选成立）、`NOT_PUBLIC`（没有当前公开通用入口）、`PROPOSED`（设计建议）。本文件**不是**新的 Runtime、Event Bus、SDK Registry 或已批准的特权 API。所有正式方法仍以 `src/framework/sdk/browser-contract.js`、`src/framework/sdk/registry.js` 和实际 Host/Authority 为准。

图解：[旧版调用链](diagrams/legacy-src-bex-calls.svg) · [新版执行世界](diagrams/current-execution-worlds.svg) · [职责迁移](diagrams/legacy-current-mapping.svg) · [**跨世界通信图**](diagrams/cross-world-messaging.svg)。

## 1. 先区分四种“发送”

| 行为 | 使用者要做什么 | 实际传输与边界 | 当前状态 |
| --- | --- | --- | --- |
| 网页 MAIN → 扩展服务 | 在已批准网页里调用 HTTP、持久存储、通知等 | `OpenDeskSDK` → `CustomEvent` → ISOLATED `page-relay` → `chrome.runtime.sendMessage` → SW/Broker → 原文档返回 | SOURCE_CONFIRMED |
| Controller Worker → 目标页 | 脚本用 `page` 自动填表、点击、读取 | Worker 私有 `MessagePort` → RunHost / Broker / Authority → Native Driver / Page Session；非网页可直接调用 | SOURCE_CONFIRMED |
| 安装工具沙箱 → 可信 Side Panel | 工具读取当前页信息、存数据、请求已批准浏览器能力 | `OpenDeskTool.request()` / `OpenDeskSDK.browser` → `postMessage` → Side Panel Host/授权服务 | SOURCE_CONFIRMED |
| Page USER_SCRIPT → SW 安装启动回执 | 已安装 Page 在获准文档被启动、核对本次身份 | `chrome.runtime.onUserScriptMessage` 仅处理 `PAGE_BOOT_PROTOCOL` 专用消息 | SOURCE_CONFIRMED；不等于任意用户事件总线 |
| 网页 MAIN / Page 用户脚本 → Sidebar Tool 任意业务数据 | 网页按钮把选中条目送进某个已安装工具并等待返回 | 当前无统一、公开、适用于所有 Page Program/Tool 的点对点命令合同 | NOT_PUBLIC |
| 网页 UI → Controller Task 立即执行 | 网页按钮带参数启动已安装、固定 Revision 的 Controller，并拿到运行 ID 和结果 | 旧 raw `executeInBg` 明确被 SDK 拒绝；当前已实现 RunHost，但旧网页侧直达触发用途没有通用正向闭环 | NOT_PUBLIC |

**核心：已有消息传输机制 ≠ 有任意跨世界权限。** `CustomEvent` 能在同文档内被网站脚本发出或伪造，不能成为批准 Controller/Chrome API 动作的安全身份凭证。各运行环境的普通 JS `window`、`document`、`globalThis` 不共享同一个对象。

## 2. 旧 src-bex 机制与现在的准确对应

旧版 `assets/js/core/brige.js`：

- `executeInBg(script)` 发出 `CHROME_PAGE_EXECUTE`，由 `custom_event.js` 转发到 `background.ts`，最终 `wrapAsync` + `eval` 执行任意代码。
- `axiosx` / `AppStorage` / `AppLocal` 发出有相关 eventId 的请求，Background 执行后经 `ChromeBridgeOperationCompleted` 完成网页 Promise。
- `my-content-script.ts` 还会把多个独立资源注入网页 MAIN（与它自己的 ISOLATED 世界不同）。

新版源码：

- `src/framework/sdk/registry.js` 保留了 `CHROME_BRIDGE_INTERFACE`、`OPEN_DESK_SDK_RESULT` 等固定事件名；`transport.js` 真正分发 `CustomEvent`；`agents/page-relay.js` 做协议和响应关联；`sdk-methods.js` 执行 Host 身份与文档/Grant 校验。
- `src/framework/sdk/entry.js` 提供 `OpenDeskSDK`、`axiosx`、`AppStorage`、`AppLocal` 等受控服务外观；`executeInBg` 和 `executeScript` 被实现为明确拒绝 `E_CAPABILITY` 的旧名字，不允许恢复 raw eval。
- `src/ui/sidebar-tools.js` 中 `tasks.open` 只切换到已安装任务 UI（`{opened:true}`），不运行任务。工具 `browser.scheduler.create` 允许在合同与 Host 审核下建立固定版本计划，**不等于任意网页按钮的即时执行 API**。
- `src/framework/sdk/browser.js` 在 `page-sdk` context 中只提供浏览器能力的本地状态发现，工具的 `browser.events.read` 是**工具持有的网络观察会话读取**，不应当作通用跨环境订阅机制。

参考历史归档：`docs/contracts/source-snapshots/todo-src-bex/src-bex/`、`docs/architecture/browser-framework/legacy-to-target-map.md` 场景 05、12、13。

## 3. 页面注入 UI 真实用户场景（冻结最小分母）

| ID | 用户行为 | 正确执行路线 | 最小可验收效果 | 本轮判断 |
| --- | --- | --- | --- | --- |
| C01 | 在网页自定义 UI 点击“查询”，请求受控 HTTP | **获准网站 MAIN** 的 Page SDK → Relay → Broker | 原按钮点击后 Promise 成功/拒绝；错误与 documentId 对得上 | 源码有，需绑定新候选 Chrome 复核 |
| C02 | 网页 UI 点击后读取/写入自己获准的持久设置 | Page SDK 的 AppStorage / AppLocal | 同文档正常、跨站/撤权/刷新按授权隔离 | 源码有，按业务独立验收 |
| C03 | Controller 在外部通过 `page` 点击目标网站按钮 | Controller Worker → PageProxy → Host/Driver | 只改准入目标网页，runId/resultId 持久；不执行网页原始 JS 传入的 raw payload | 历史限定 Chrome PASS，当前同包仍需确认 |
| C04 | Sidebar Tool 按点击读取当前网页标题/URL | Tool sandbox → `currentPage.info` | 已授权站点返回 `available`；失权明确 unavailable | 源码有 |
| C05 | 工具点击“打开已安装任务” | Tool sandbox → `tasks.open` | Side Panel 聚焦已启用任务，**不直接启动** | 源码有 |
| C06 | 网页内受管 UI 点击，直接启动事先安装、固定的 Controller | 未来经 Program 身份、Host 确认 → **原** RunHost | 真正执行固定 Revision、返回 runId、结果可查，拒绝任意代码 | **核心遗留用途缺口** |
| C07 | 网页按钮把有限数据送到正在打开的某个安装工具 | 未来经 Page Program + Host 的定向数据路由 | 只到已授权工具实例，关闭后无残留、不误送其他工具 | **可选产品缺口** |
| C08 | 网页监听一次运行的进度与最终结果 | 未来在现有运行记录上 subscribe/read | 丢连接后按 runId 查询真实终态，不重放运行 | **可选产品缺口** |

测试需分别保存：实际 `sourceHash`、Program/Task Revision、扩展包 hash、Tab/Frame/Document、安装/工具身份、权限授权与撤权、操作/结果 ID、真正 DOM 或 Side Panel UI 变化、失败阶段。不能仅用 `CustomEvent` 发出或 `postMessage` 收到判定任务成功。

## 4. 专家建议：统一使用模型，复用不同传输，不开发第二套 Event Bus

优先实施**三类有界消息语义**，而不是开放 `sendMessage(anything)`：

1. **Command / request-response（P0）**：已安装、获授权的 Page Program 可以请求启动**固定任务引用**与批准的有界参数；Host 重新核验原网页 `origin/documentId`、Program/Task 身份/版本、用户同意、Chrome 权限和执行一次性身份。请求不能携带任意用户源码，更不能直接解释为 `chrome.runtime` 的任意权限。
2. **Targeted delivery（P1）**：只在明确工具 ID 和活动 sandbox instance 下，把允许的消息交给**已打开的工具**；不自动授予来源页面读取工具私有数据的权利。不存在活动工具时明确 `unavailable` 或由可信界面请求打开，不静默建立后台任务。
3. **Status / subscription（P1）**：订阅框架产生的 `accepted/running/completed/failed` 等进度；断开、Side Panel 关闭、SW suspend 时通过原有 RunId/Durable Result 查询补齐。避免无界全局事件队列与跨用户/网站广播。

设计入口名称如 `OpenDeskProgram.commands.requestRun({taskRef,params})` **仅为拟议，不是当前可运行 API**。推荐在框架拥有和管理的 Page UI / USER_SCRIPT 作用域中提供能力，不把发起固定任务的高权限操作直接暴露给所有网页 MAIN 脚本。

**严格不做：**`window.dispatchEvent(new CustomEvent('executeInBg',{detail:{script}}))` 直接启动任务；网页向 SW 传 raw JS、把随机 origin/null 作为可信身份、靠页面 `isTrusted` 自己证明授权、把 Controller 移入 SW、为消息新增独立 Authority 或反向复制 RunHost。

## 5. 重点安全与生命周期条件

- **身份**：用户手势/程序安装同意与 Host 授权分别核对；仅凭网页 JS 事件不可授予新 Chrome 权限。
- **来源**：真实 Chrome sender、`tabId/frameId/documentId`、Origin、Program Revision、Tool installation/instance 全部由可信服务绑定，不信任传入自报 ID。
- **数据**：固定 schema、大小/深度预算、类型化编解码，不在事件通道发送 Cookie 值、Token、完整页面 HTML、未授权选区或大 Blob。
- **执行**：请求到达不等于已执行；`claim` 不等于 completed；未知提交状态严禁重复点火。由现有 RunHost 生成并持久化 `runId/resultId`。
- **资源**：页面导航、SPA、Tool 关闭、撤权、Host 重启、SW suspend、订阅过期须各有明确取消/失效状态。
- **降级**：旧 raw executeInBg 继续拒绝；不存在合法 TaskRef、URL 非法、权限缺失应显式失败，不能自动退回任意执行。

## 6. 文档是否已经“完整列出框架功能”？

**没有单独一份能够证明“旧需求无遗漏 + 新版正式可调用 + 同候选 Chrome 验收”的完整文档。** 目前多份文件各自覆盖了不同维度：

- `framework-feature-progress-tree-20261013.zh-CN.md`：F01–F18 子系统与历史阶段状态；**不是最新接口清单**。
- `legacy-to-target-map.md`：14 类旧版用户场景；网页启动自动化见场景 13，仍不足以具体说明 Page UI 与 Tool 的定向数据回程。
- `src/framework/sdk/browser-contract.js`：**当前** Browser SDK 正式方法、使用环境和权限（技术权威）。
- `src/framework/sdk/registry.js`：页面 SDK 固定服务的另一份**现有**合同；它不是新增的 Browser SDK 权限清单。
- `docs/api/browser-sdk-full-interface-inventory.zh-CN.md`：功能候选和历史数量，不能据此推断已经公开和验收。
- `docs/api/sidebar-tools.zh-CN.md`：工具沙箱协议和安装能力，不涵盖所有注入 Page UI 自定义消息。
- `docs/api/page-userscript.zh-CN.md` 与 `controller.zh-CN.md`：各运行世界使用手册。

建议把**跨环境通信**作为 F02/F03/F04/F05/F16 交叉的一个专题与迁移检查项，并在旧场景 13 下补 C06/C07/C08 证据，**不要**为了统计再建 F19、重复 Registry 或第二套“全功能总表”。正式验收报告只引用唯一源码合同和原始证据，避免旧数字覆盖新接口。

## 7. 下一步实施与停止条件

- **P0**：先用真实 Chrome 验证 C01/C04/C05 已有链，不重建。P0 新增工作只针对 C06：网页内受管按钮 → 已安装固定 Task → 原 RunHost → Result，至少一次成功和网站撤权/目标变化/重复点击等负例。
- **P1**：用户确有“网页传数据给侧栏工具”的真实业务后再补 C07，优先定向数据桥，不做任意总线；需要显示运行进度再补 C08。
- **P2**：跨窗口、多实例、离线重启、长期触发和异常恢复按相同候选审查；不提前为了理论完整性全面重构框架。

做到 **用户能复制示例 → 页面主动点击 → 返回真实可查的结果 → 关闭/撤权安全 → 图、用法、测试同版一致** 才视为产品闭环。静态审计与文档不会提升任何 Chrome PASS。
