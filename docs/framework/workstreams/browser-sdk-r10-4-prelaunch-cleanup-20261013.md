# Browser SDK R10.4 · 预发布接口清理（2026-10-13）

执行来源：GitHub `main` 基线 `3c9a2de501926538827300617e363b9ce13adac4`。本环境无法查看 Mac 工作区 `git status`、未提交文件或真实 Chrome，不据此宣称原生通过。

## 本批已核查与变更
- Registry 48 项、矩阵批准 55 项，仍未注册 7 项；历史 35 项按旧名称为 KEEP 23 / RENAME 3 / DELETE 9。
- 修正 `tabs.create` 不必要的 Chrome `tabs` 权限；保留 OpenDesk 工具 capability、用户意图、Origin、TabRef。
- 将 `activateOwned`、`network.observe.start`、`screenshot.captureVisible` 的矩阵权限数组同步现有 Registry（没有扩大授权）。
- 将 48 个验收账本 Schema 引用改为现行 `browser-schemas.js`，消除 Tabs 三个废弃名称。
- 在既有一致性检查中增加运行时与矩阵的权限/Capability 对齐及旧 Schema 引用拒绝，增加负向测试。
- 修订唯一手册中过期的 Clipboard / Downloads 旧别名待迁移描述，记录 Cookie `get` 与 Chrome 的刻意安全差异。

## 验收
- SOURCE 静态交叉核对：PASS（GitHub 事务内，注册表/矩阵/账本一致）。
- Node / Build / Mac Chrome Native：NOT_TESTED，本环境无完整本地工作树/真实 Chrome；须按本批最终 commit SHA 复查独立 CI。
- 全部历史接口消费者审计：未完成，不能将本批算作 R10.4 全面关闭。

## R10.4 本轮第二批：原生 Download ID 公开泄露闭环
- 已确认实际 `browser.network.observe.export` Driver 将 `chrome.downloads.download()` 原生数字 `downloadId` 直接传回 installed-tool Browser SDK；不是仅 Schema 标注错误，属于安全公开合同缺口。
- 仅在可信 Driver 内校验非负原生下载 ID，不再将该 ID 穿过 Host 返回到不可信工具。保留 Chrome 原生下载执行一次、无盲目重放、原有授权和真实用户意图。
- `browser.screenshot.captureVisible` Driver 已不返回原生下载 ID，本批从其 Schema、批准矩阵删除不真实的公开字段。
- 原有 Node Driver/R2 Host/watch 测试迁移为禁止公开 `downloadId` 的负向断言，并保留原生调用次数、文件数据和其他原有保护检查。
- 修正当前执行手册计数为 Registry 48、批准 55、未注册 7，R10.1 旧 44 标为历史时点。
- 验证级别：源码与预期消费者静态交叉检查；Node/Build/Native 需按本批相同候选 SHA 取得真实 CI/Chrome 结果，本记录不将静态核查写成运行测试 PASS。

## R10.5 · 真实回执与 CI 证据（2026-10-13）

- `44f715a64f832ea2b6d3498e280a369bab8d222e`：修正 Network 虚假的 ResourceRef 与 Screenshot 原生 downloadId 公开泄露；使用单一既有 Host、临时内存资源、一次性下载请求和真正 `status:'started'` 回执。受信 Host 在 Network 原生执行后重新验证 Origin 与工具身份；撤权和未知 Chrome 副作用不重试。
- 更新 Network/Screenshot/R2 Host/Schema 回归断言：Chrome `tabs.create` 无需原生 `tabs` permission，失效 TabRef 或被撤销 Origin 可以在真实用户确认环节提前拒绝；不降低安全约束。
- 真实既有 CI：`97df746b` 的 Browser SDK R5 implementation contracts 为 101 PASS / 4 FAIL，构建因 Time Review 入口 provenance 禁止进入特权 bundle 而失败；两批 R10.4 提交的其他 CI 存在 FAILURE。新候选的 NODE/BUILD/NATIVE 状态必须依据新运行单独确认，不能将该源修复自动提升为 PASS。

## R10.5 · Host-only 矩阵事实与 SHA 核验（2026-10-14）

- 已查实 `browser.history.searchTrusted` 在 `src/platform/chrome/history.js` 和唯一 `context-menus.js` Host 受信入口有真实代码，`browser.permissions.requestForTool` 在现有 `permission-gate.js` 具备可信 UI 点击路径，相关 R10.6 Host / Trusted / History UI Node 定向测试已编写。两者没有安装工具 SDK 暴露；目前只能写 `SOURCE_WIRED_NATIVE_NOT_TESTED`，不能凭代码写 Chrome NATIVE_PASS。
- 官方矩阵原先将两者标为 `BUILTIN_HOST_ONLY_IMPLEMENTED`，同时状态却仍为 `DESIGN_APPROVED_NOT_IMPLEMENTED`；已与当前 Registry/Schema Git Blob SHA 一并纠正并加机器校验。53 公开 SDK + 2 可信 Host-only、共 55 项批准保持不变；真实 Mac Chrome 仍 `NOT_TESTED`。

## R10.5 · 历史 35 接口逐项源码核对（2026-10-14）

下列条目从历史 35 项映射、当前 Registry 和唯一 Chrome 接口矩阵逐项交叉核对，结论为 **KEEP 23 / RENAME 3 / DELETE 9**。它不是对旧 35 项重新建立永久兼容要求。每项签名、Origin/Document/Owner 的更详细字段仍以唯一矩阵为准。列出的消费者是已辨认的具体路径，**不是完整全仓 grep 结果**；不能仅凭这里的路径认定全部消费者已经迁移。Node/Build 的候选级 PASS 不等于各接口 Native PASS。

1. **KEEP** `browser.capabilities.list`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = 无额外；Scope = none；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.capabilities.list()` → `Promise<CapabilityRecord[]>`；已定位消费者样例 = 未查得独立于 SDK Wrapper 的产品消费者；单项 Native 状态 = NOT_TESTED。

2. **KEEP** `browser.capabilities.getStatus`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = 无额外；Scope = none；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.capabilities.getStatus({operation: string})` → `Promise<CapabilityStatus>`；已定位消费者样例 = 未查得独立于 SDK Wrapper 的产品消费者；单项 Native 状态 = NOT_TESTED。

3. **KEEP** `browser.contextMenu.getStatus`：Native = chrome.contextMenus.onClicked；Chrome permissions = contextMenus；工具 Capability = browser.contextMenu；Scope = approved-origin；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.contextMenu.getStatus()` → `Promise<{enabled,approvedOrigins,activeActions,browserPermission}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

4. **KEEP** `browser.contextMenu.register`：Native = chrome.contextMenus.create, chrome.contextMenus.update；Chrome permissions = contextMenus；工具 Capability = browser.contextMenu；Scope = approved-origin；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.contextMenu.register({actionIds: string[1..3]})` → `Promise<{registered,actionIds}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

5. **KEEP** `browser.contextMenu.unregister`：Native = chrome.contextMenus.remove；Chrome permissions = 无；工具 Capability = browser.contextMenu；Scope = approved-origin；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.contextMenu.unregister()` → `Promise<{registered,actionIds}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

6. **KEEP** `browser.launch.consume`：Native = chrome.contextMenus.onClicked, chrome.webNavigation.getFrame；Chrome permissions = 无；工具 Capability = browser.contextMenu；Scope = clicked-document；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.launch.consume()` → `Promise<{ticketId,toolId,actionId,selection,source,expiresAt,...}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

7. **KEEP** `browser.page.getContext`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = currentPage.read；Scope = current-page；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.page.getContext()` → `Promise<{status,title?,url?,message?}>`；已定位消费者样例 = 未查得独立于 SDK Wrapper 的产品消费者；单项 Native 状态 = NOT_TESTED。

8. **KEEP** `browser.page.getSelection`：Native = chrome.contextMenus.onClicked；Chrome permissions = 无；工具 Capability = browser.contextMenu；Scope = clicked-document；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.page.getSelection()` → `Promise<{ticketId,selection}>`；已定位消费者样例 = 未查得独立于 SDK Wrapper 的产品消费者；单项 Native 状态 = NOT_TESTED。

9. **KEEP** `browser.clipboard.writeText`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = user.export；Scope = none；Gesture = 需用户意图；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.clipboard.writeText(text: string)` → `Promise<{copied}>`；已定位消费者样例 = src/ui/sidebar-tools.js；单项 Native 状态 = NOT_TESTED。

10. **KEEP** `browser.downloads.text`：Native = chrome.downloads.download；Chrome permissions = downloads；工具 Capability = user.export；Scope = none；Gesture = 需用户意图；Driver = src/platform/downloads/index.js。当前签名 `OpenDeskSDK.browser.downloads.text({text:string,filename:string})` → `Promise<{started:true}>`；已定位消费者样例 = src/ui/sidebar-tools.js；单项 Native 状态 = NOT_TESTED。

11. **RENAME** `browser.tabs.open` → `browser.tabs.create`：Native = chrome.tabs.create；Chrome permissions = 无；工具 Capability = browser.tabs；Scope = explicit-url；Gesture = 需用户意图；Driver = src/platform/chrome/browser-tabs.js。当前签名 `OpenDeskSDK.browser.tabs.create({url: HTTP_URL})` → `Promise<{tabRef:OpaqueTabRef}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

12. **RENAME** `browser.tabs.focus` → `browser.tabs.activateOwned`：Native = chrome.tabs.get, chrome.tabs.update, chrome.windows.update；Chrome permissions = tabs, webNavigation；工具 Capability = browser.tabs；Scope = tab-ref；Gesture = 需用户意图；Driver = src/platform/chrome/browser-tabs.js。当前签名 `OpenDeskSDK.browser.tabs.activateOwned({tabRef:OpaqueTabRef})` → `Promise<{focused:boolean}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

13. **KEEP** `browser.tabs.getOwned`：Native = chrome.tabs.get, chrome.webNavigation.getFrame；Chrome permissions = tabs, webNavigation；工具 Capability = browser.tabs；Scope = tab-ref；Gesture = 非单独手势类；Driver = src/platform/chrome/browser-tabs.js。当前签名 `OpenDeskSDK.browser.tabs.getOwned({tabRef:OpaqueTabRef})` → `Promise<{tabRef,url,origin,expiresAt}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

14. **KEEP** `browser.tabs.listOwned`：Native = chrome.tabs.get, chrome.webNavigation.getFrame；Chrome permissions = tabs, webNavigation；工具 Capability = browser.tabs；Scope = owned-tabs；Gesture = 非单独手势类；Driver = src/platform/chrome/browser-tabs.js。当前签名 `OpenDeskSDK.browser.tabs.listOwned()` → `Promise<{tabs:Array<{tabRef,origin}>}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

15. **RENAME** `browser.tabs.closeOwned` → `browser.tabs.removeOwned`：Native = chrome.tabs.get, chrome.tabs.remove, chrome.webNavigation.getFrame；Chrome permissions = tabs, webNavigation；工具 Capability = browser.tabs；Scope = tab-ref；Gesture = 需用户意图；Driver = src/platform/chrome/browser-tabs.js。当前签名 `OpenDeskSDK.browser.tabs.removeOwned({tabRef:OpaqueTabRef})` → `Promise<{closed:boolean}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

16. **KEEP** `browser.sidePanel.openSelf`：Native = chrome.sidePanel.open；Chrome permissions = sidePanel；工具 Capability = browser.sidePanel；Scope = user-gesture；Gesture = 需用户意图；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.sidePanel.openSelf()` → `Promise<{opened:boolean}>`；已定位消费者样例 = 未查得独立于 SDK Wrapper 的产品消费者；单项 Native 状态 = NOT_TESTED。

17. **KEEP** `browser.network.request`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = network；Scope = target-origin；Gesture = 需用户意图；Driver = src/platform/chrome/browser-network-observe.js / src/platform/chrome/network.js。当前签名 `OpenDeskSDK.browser.network.request({method:'GET'|'POST'|'PUT'|'DELETE',url:HTTP_URL,data?,config?})` → `Promise<{status:number,data:any}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

18. **KEEP** `browser.network.observe.start`：Native = chrome.webRequest.onBeforeRequest, chrome.webRequest.onCompleted, chrome.webRequest.onErrorOccurred；Chrome permissions = tabs, webNavigation, webRequest；工具 Capability = browser.network.observe；Scope = approved-tab；Gesture = 需用户意图；Driver = src/platform/chrome/browser-network-observe.js / src/platform/chrome/network.js。当前签名 `OpenDeskSDK.browser.network.observe.start({tabRef,origins:[ExactOrigin],durationMs?,maxEvents?,maxBufferedBytes?})` → `Promise<{observationId,operationId,expiresAt,status}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

19. **KEEP** `browser.network.observe.getStatus`：Native = chrome.webRequest.onBeforeRequest；Chrome permissions = webRequest；工具 Capability = browser.network.observe；Scope = approved-tab；Gesture = 非单独手势类；Driver = src/platform/chrome/browser-network-observe.js / src/platform/chrome/network.js。当前签名 `OpenDeskSDK.browser.network.observe.getStatus({observationId})` → `Promise<{state,observedCount,droppedCount,gapCount,expiresAt}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

20. **KEEP** `browser.network.observe.stop`：Native = chrome.webRequest.onBeforeRequest；Chrome permissions = webRequest；工具 Capability = browser.network.observe；Scope = approved-tab；Gesture = 非单独手势类；Driver = src/platform/chrome/browser-network-observe.js / src/platform/chrome/network.js。当前签名 `OpenDeskSDK.browser.network.observe.stop({observationId})` → `Promise<{state,stoppedAt}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

21. **KEEP** `browser.network.observe.export`：Native = chrome.downloads.download；Chrome permissions = webRequest, downloads；工具 Capability = browser.network.observe；Scope = approved-tab；Gesture = 需用户意图；Driver = src/platform/chrome/browser-network-observe.js / src/platform/chrome/network.js。当前签名 `OpenDeskSDK.browser.network.observe.export({observationId,format:'json'})` → `Promise<{status:'started',bytes,truncated}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

22. **KEEP** `browser.events.read`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = browser.events；Scope = owned-session；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.events.read({sessionRef,cursor?,limit?})` → `Promise<{events,nextCursor?,droppedCount,gapCount}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

23. **KEEP** `browser.events.close`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = browser.events；Scope = owned-session；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.events.close({sessionRef})` → `Promise<{closed:boolean}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

24. **KEEP** `browser.screenshot.captureVisible`：Native = chrome.tabs.captureVisibleTab, chrome.downloads.download；Chrome permissions = tabs, webNavigation, activeTab, downloads；工具 Capability = browser.screenshot；Scope = selected-tab；Gesture = 需用户意图；Driver = src/platform/chrome/browser-screenshot.js。当前签名 `OpenDeskSDK.browser.screenshot.captureVisible({tabRef})` → `Promise<{status:'started',bytes,width,height}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

25. **DELETE** `browser.media.recording.prepare`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

26. **DELETE** `browser.media.recording.getStatus`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

27. **DELETE** `browser.media.recording.stop`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

28. **DELETE** `browser.media.recording.discard`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

29. **DELETE** `browser.speech.transcribe`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

30. **DELETE** `browser.speech.speak`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

31. **DELETE** `browser.speech.stop`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

32. **DELETE** `browser.notifications.create`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

33. **DELETE** `browser.notifications.clear`：开发期占位不在现行 Registry/Schema/SDK；无当前接口可调用。未对其他当前业务路径进行全仓逐文件检索，历史资料不得复活接口。

34. **KEEP** `browser.operations.getStatus`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = browser.operations；Scope = owned-operation；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.operations.getStatus({operationId})` → `Promise<{state}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

35. **KEEP** `browser.operations.cancel`：Native = 既有 Web/Host 服务；Chrome permissions = 无；工具 Capability = browser.operations；Scope = owned-operation；Gesture = 非单独手势类；Driver = src/platform/chrome/context-menus.js。当前签名 `OpenDeskSDK.browser.operations.cancel({operationId})` → `Promise<{state,cancelRequested}>`；已定位消费者样例 = examples/sidebar-tools/browser-sdk-r2/browser-operations.opendesk-tool.json；单项 Native 状态 = NOT_TESTED。

当前已核对 CI：SDK R5 run 38535246273 和 targeted run 38535246318，均绑定 ea92aef0dd89a2e4ddc1f72f0b10e4c7db9eb94a；后续代码修改须重新判定可复用范围。**未关闭**：全仓消费者逐文件穷举、Cookies get 与 Chrome 最长 Path 语义差异的最终命名决定、同候选真实 Chrome 的页面/撤权/Worker 重启与资源回执，Native 仍 NOT_TESTED。
