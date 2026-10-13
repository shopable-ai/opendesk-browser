# OpenDesk Browser SDK R7.0 架构与兼容补充合同

> 2026-10-13。本页只补 R8 已有合同之外的 Cookie 可信 Host 改动，避免第二套 Browser SDK/Host/权限目录。源码事实以最终 main SHA 为准。

## 单一公开规范：继承 R8，不重复实施

- 开发者公开入口唯一：'OpenDeskSDK.browser'；Operation ID 唯一：'browser.<namespace>.<method>'。
- 正式 SDK 注册表：'src/framework/sdk/browser-contract.js'，原有 **35 项不变**；API 版本 '1.0.0'，Host 协议 'opendesk.browser.v1'。
- Chromium 自动发现目录只负责构建期数据，不授予权限：'docs/api/chrome-native-api-catalog.json'。
- R8 已保存旧 35 项兼容映射：'docs/api/browser-sdk-compatibility-map.json'。
- R7 机器补充映射：'docs/api/browser-sdk-native-mapping.json'，通过引用继承旧 35 项，只详细登记 Cookie 10 项 Host-only 候选。
- R8 架构依据：'docs/api/browser-sdk-architecture-r8.zh-CN.md'；开源采用依据：'docs/api/browser-sdk-open-source-reuse.zh-CN.md'。
- 不引入 webext-core 的额外 RPC、Storage、Scheduler；不为发现到的 Native API 自动生成运行时权限。

## 真实执行链与沙箱边界

~~~text
Installed Sidebar Tool (untrusted)
  -> existing src/sidebar-tools/bridge.js
  -> src/ui/sidebar-tools.js (existing install/epoch/capability)
  -> opendesk.browser.v1 kind:tool
  -> existing src/platform/chrome/context-menus.js
  -> approved Driver -> Chrome
  [Cookie Host-only operations NOT admitted]

Trusted packaged tool.html UI (Chrome authenticates sender)
  -> src/ui/trusted-cookie-workbench.js (genuine user click)
  -> src/ui/current-page-target.js (selected exact document)
  -> opendesk.browser.v1 kind:host (existing listener and protocol)
  -> context-menus.js/checkedSender (Chrome sender documentId)
  -> src/platform/chrome/browser-cookie-host.js (one use; 15s)
  -> src/platform/chrome/cookies.js (existing R8 Cookie Driver)
  -> chrome.cookies (Chrome permissions + Origin + exact document)
~~~

- 不能由 Controller、RunHost、Page USER_SCRIPT、任意官方目录的沙箱代码自行声明 'trusted'、'installEpoch'、'documentId' 或 'packageHash' 取得 Cookie 权限。
- Trust 来自 Chrome 提供的实际 sender、打包受信扩展界面以及用户真实点击，不是请求字段。
- R7 扩展 Host 走现存 'handleHost'，未引入第二个 RPC 监听器或 Cookie 授权持久化表。
- Page SDK 与普通安装工具未暴露 '.cookies'。此限制是安全设计，不是遗漏或运行失败。

## Cookie 十项实施差异

| Native 候选操作 | 受信 Host | 公开 SDK | 真实 Chrome 验收 |
| --- | --- | --- | --- |
| get / getAll | 已接线（当前 URL 匹配、当前 Store） | 尚未开放 | NOT_TESTED |
| set / remove | 已接线（复用 R8 原生回读） | 尚未开放 | NOT_TESTED |
| clearSite | 已接线（有限范围，不宣称全站清除） | 尚未开放 | NOT_TESTED |
| getStores / getPartitionKey | 已接线（当前 Tab / Document 限制） | 尚未开放 | NOT_TESTED |
| observe.start / getStatus / stop | 已接线（内存 Session / Cookie 元数据） | 尚未开放 | NOT_TESTED |

当前私有 Host handler 十项，不等于 'OpenDeskSDK.browser.cookies.*' 十项正式实现，**公开 SDK 仍 0/10**。正式注册表仍为 35，旧 SDK 接口、返回值与错误码均未改动。新增能力同时复用原有 'src/platform/chrome/cookies.js#createCookieService'，保留 Controller 旧 'getCookies/setCookies/deleteCookiesByUrl'。

### 授权与运行生命周期

- 敏感值只进入受信 Side Panel 界面内存；用户必须手动点击读取，默认遮罩显示，用户主动显示才暂时暴露在此受信 DOM。
- 原生写入/删除在用户再次点击明确确认后派发，无未知结果的隐式重试；R8 Cookie Driver 原生回读判定异常。
- 严格比对当前 window/tab/documentId/URL/Origin，并在操作前后检查 Chrome cookies 与站点授权；任何换页、撤权和 Worker 生命周期中断使旧意图失效。
- 'getAll' 不等于全部站点 Cookies；未提供 partitionKey 时 Chrome 默认按非分区 Cookie 返回。分区必须匹配当前文档的真实顶层 PartitionKey。
- Store 只能是当前活动 Tab 对应的 Store，不提供其他 Tab ID 或 Store 枚举。
- Cookie 观察元数据不复用现有 Network 事件的 Schema；私有事件的值一律不包含 Cookie 原值，最多 30 秒，50 条/会话，Worker 重启丢失，撤权/导航作废。
- 'browser.cookies.observe.read' 是独立第 11 个候选，未批准公开注册/Schema，不伪装成既有 'browser.events.read'。

## 兼容与测试参考

- 公开 SDK 正反用例：'tests/environment/browser-sdk-contract-compat.test.mjs' 与 'browser-sdk-r2-host.test.mjs'。
- R8 原生驱动单元：'tests/environment/browser-sdk-r8-cookies.test.mjs'。
- R7 受信 Host 集成、拒绝和事件：'tests/environment/browser-sdk-r7-trusted-cookies.test.mjs'。
- R8 自动 Schema：'tests/environment/browser-sdk-r8-catalog.test.mjs'。
- 工作台：'src/ui/trusted-cookie-workbench.js' + 'src/ui/tool.html' + 'src/ui/tool-shell.js'，不会加载到第三方工具 iframe。
- 必须执行 Node 全量兼容检查、npm run check、build、build:dev、verify、旧 v2 工具回归，再经真实 Chrome 138+ 正反验收。**仅新增代码、Schema 或 Mock 不得标记产品级 PASS。**

## R7 下一阶段与故障处理

P0 优先进行 Cookie 原生测试（跨 Origin 拒绝、Cookie 名称及前缀、不同 Store/Partition、导航后旧票据、撤权、SW restart、原生写入未知效果）。然后填充 Cookies 结果观察读取规范与真实 UI 验收。确认安全/产品约束后再审批公开 SDK 方法、Adapter 与独立能力等级，最后推进 Tabs、Downloads、Permissions/Storage 等新接口。R8 的完整 Chrome API 目录补齐由 R8 并行工作继续承担，不在 R7 再建一套。
