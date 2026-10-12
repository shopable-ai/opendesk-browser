# Browser SDK 全接口扩展候选目录（R5+ / 2026-10-12）

> **定位：产品功能防遗漏清单，不是可调用 API 注册表，也不是新增权限许可。** 唯一已经批准的 Browser SDK 操作事实来源仍为 `src/framework/sdk/browser-contract.js`，其原 R1.3–R4 冻结 32 项不能被候选覆盖；正式注册表现含独立 R5 增量三项，共 35 项。本文初版共 114 项 R5+ 候选；当前 3 个自有 Tabs 方法已晋级并 SOURCE_WIRED，其余 111 项仍为 `PROPOSED_NOT_REGISTERED`。不改变此前 R1.3–R4 冻结 32 项的统计分母。

## 一、首先明确用户最终需要的能力

用户可安装浏览器工具、任务或内置插件，不必再次编译扩展。需要依照所处环境（Side Panel 已安装第三方工具、可信内置工具、Page USER_SCRIPT、Controller、Native）安全访问浏览器能力：打开自己获准的网页、查看当前页面、管理自己的下载、按需处理 Cookie 和书签/历史、运行定时任务、被动观察指定站点、截图和用户可见录制。**并非所有能力都应该开放给不可信工具。**

### 当前源码事实（本次核对）

- Browser SDK 当前正式登记操作：**35**（26 IMPLEMENTED、7 PLANNED、0 HOST_ONLY、2 NOT_EXPOSED），其中原冻结 32 项是 23/7/0/2，新增 R5 已接线三项独立计数。IMPLEMENTED 只是源码状态，不表示同候选原生 Mac Chrome 通过。
- 原能力生态审计：18 域、74 叶子；能力叶子不是接口数量。例如单一 Cookie 叶子包含 get/getAll/set/remove/getStores/partitionKey/事件等多个方法。
- `src/platform/chrome/cookies.js` 已有 Controller Cookie 驱动：getCookies/setCookies/deleteCookiesByUrl。**不等于普通工具拥有 cookies API**。
- `examples/sidebar-tools/cookie-editor/README.zh-CN.md` 表示 Cookie Editor 只支持临时内存 UI、JSON/Header/Netscape 导入导出，真实浏览器 Cookie 读写没有接入。
- 本仓 `manifest.json` 已含 cookies/notifications/alarms 等扩展权限及可选 bookmarks/history/webRequest；manifest 权限不等于用户工具的授权。不要擅自改变默认权限。

## 二、统一分类与冻结规则

| 目录状态 | 意义 |
| --- | --- |
| `EXISTING_CONTRACT` | 原冻结 32 项 + 本轮单列 R5 正式新增 3 项都以 `browser-contract.js` 为依据；仍须按 Host、授权、组件及原生测试分别验收 |
| `PROPOSED_NOT_REGISTERED` | 下表候选名称，不能调用，不属于目前的 PLANNED 分母 |
| `APPROVED_TOOL` | 未来满足用户安装能力审查、Origin、身份/代际和具体动作后才可能开放的候选 |
| `BUILTIN_TRUSTED` | 原则上只能由可信内置扩展 UI / Host 使用，不应直接向任意第三方沙箱开放 |
| `REUSE_EXISTING` | 应复用已有的 OpenDeskTool / Page / Controller / Task，不宜重复建设并发框架 |
| `CONTROLLER_ONLY` | 高特权 Page/Controller 范围，普通 Side Panel 工具不可跨越 |
| `NOT_EXPOSED` / `OUT_OF_SCOPE` | 设计明确不对普通工具开放，且不要求为了数字而实现 |

## 三、R5+ 候选（3 项已晋级正式合同，111 项仍未登记）

**以下是面向当前 OpenDesk 产品的覆盖性候选，不承诺穷尽 Chrome 未来新增 API。正式 R5 接口清单须经过逐项 Owner、安全和兼容审批。**

| 能力领域 | 优先级 | 权限/环境提议 | 候选数量 | 用户语义目标 |
| --- | --- | --- | ---: | --- |
| Cookie 核心读写与事件 | P0 | BUILTIN_TRUSTED | 10 | 让内置 Cookie Editor 在明确网站授权后读取、编辑、删除、观察 Cookie；支持分区键和存储区，敏感值默认遮挡 |
| 标签页扩展操作 | P0 | APPROVED_TOOL | 8 | 使用不可伪造的 tabRef 仅访问自身获准标签页；不传原始 tabId |
| 浏览器窗口 | P1 | APPROVED_TOOL | 5 | 窗口句柄与工具安装代际绑定，禁止操作用户无关窗口 |
| 标签分组 | P1 | APPROVED_TOOL | 5 | 仅管理当前工具拥有、用户允许的标签页 |
| 会话恢复 | P2 | BUILTIN_TRUSTED | 2 | 恢复浏览器会话可能泄露历史数据，需前台用户选择 |
| 书签管理 | P1 | BUILTIN_TRUSTED | 7 | 实现查找、添加、编辑、整理；批量修改需要预览，避免静默搜集全部书签 |
| 浏览历史 | P1 | BUILTIN_TRUSTED | 4 | 读取和删除都属于敏感操作，权限确认、分页上限和删除审计独立 |
| 工具隔离存储 | P0 | REUSE_EXISTING | 6 | 优先复用 OpenDeskTool.request(storage.*) 和现有 Authority，不复制新的全局 chrome.storage 权限 |
| 下载管理 | P1 | APPROVED_TOOL | 6 | 仅对本工具发起并确认的下载有效；禁止枚举其他用户下载记录 |
| 网站数据清理 | P2 | BUILTIN_TRUSTED | 2 | 只允许用户主动选择精确站点及数据类型，删除不可逆前显式预览 |
| 权限与站点授权 | P0 | BUILTIN_TRUSTED | 6 | 读状态不申请权限；新增或删除授权只允许可信前台用户操作 |
| 网页导航和框架 | P1 | APPROVED_TOOL | 4 | 绑定活动 tab/document/frame，不泄露其他域名框架或任意浏览轨迹 |
| 脚本/CSS 注入 | P2 | CONTROLLER_ONLY | 4 | 继续复用 Page/Controller 已授权执行器；不为普通工具暴露任意 JS 注入 |
| 声明式网络规则 | P1 | BUILTIN_TRUSTED | 5 | AdBlock 等内置模块复用 DNR，经审批的规则集和配额，不开放任意请求重写 |
| 剪贴板扩展 | P2 | BUILTIN_TRUSTED | 3 | 读取剪贴板只在真实用户动作后执行，不能静默长期监听 |
| 截图拓展 | P2 | BUILTIN_TRUSTED | 2 | 每次绑定目标文档；像素/文件大小/滚动副作用受控 |
| 临时资源/导出 | P0 | APPROVED_TOOL | 4 | 统一截图、网络观察导出和录制产物的有期限 resourceRef；按工具隔离 |
| 定时任务服务 | P0 | REUSE_EXISTING | 6 | 复用既有 Controller Task / Chrome Alarms 正式服务，不另起第二套任务引擎 |
| 浏览器空闲状态 | P2 | BUILTIN_TRUSTED | 3 | 只为已批准的本地任务调度使用，禁止第三方跟踪用户活动习惯 |
| 通知自管理 | P2 | BUILTIN_TRUSTED | 3 | 仅用于本扩展拥有的通知；现有 create/clear 仍遵循 NOT_EXPOSED 决策 |
| 快捷键 | P2 | BUILTIN_TRUSTED | 2 | 仅查询 manifest 已注册的命令；不承诺运行时动态注册任意快捷键 |
| 地址栏集成 | P2 | BUILTIN_TRUSTED | 2 | 必须经过固定 manifest keyword 和可信事件驱动，普通工具不能声明任意 omnibox |
| 阅读列表 | P2 | BUILTIN_TRUSTED | 4 | 以 Chrome 能力和可选权限为条件，未支持则记录 UNSUPPORTED |
| 页面性能观测 | P2 | CONTROLLER_ONLY | 3 | 复用 Page/Controller 的文档范围性能数据，不全局监听其他网页 |
| 页面语义封装 | P1 | REUSE_EXISTING | 4 | 优先复用已存在 Page/Controller 和 USER_SCRIPT，避免第二套 DOM 执行 |
| 右键菜单拓展 | P1 | APPROVED_TOOL | 2 | 仅更新自己已声明且已批准的菜单，不允许动态添加无限动作 |
| 诊断/日志 | P1 | BUILTIN_TRUSTED | 2 | 有界脱敏的 SDK/Worker/权限诊断，不泄露 Cookie、授权令牌或用户网页正文 |

## 四、逐组接口名称（无隐含实现声明）

### Cookie 核心读写与事件 · P0 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.cookies.get()`
- `OpenDeskSDK.browser.cookies.getAll()`
- `OpenDeskSDK.browser.cookies.set()`
- `OpenDeskSDK.browser.cookies.remove()`
- `OpenDeskSDK.browser.cookies.clearSite()`
- `OpenDeskSDK.browser.cookies.getStores()`
- `OpenDeskSDK.browser.cookies.getPartitionKey()`
- `OpenDeskSDK.browser.cookies.observe.start()`
- `OpenDeskSDK.browser.cookies.observe.getStatus()`
- `OpenDeskSDK.browser.cookies.observe.stop()`

### 标签页扩展操作 · P0 · APPROVED_TOOL

- `OpenDeskSDK.browser.tabs.getActive()`
- `OpenDeskSDK.browser.tabs.getOwned()` — **R5 APPROVED / SOURCE_WIRED；原生 Chrome NOT_TESTED**
- `OpenDeskSDK.browser.tabs.listOwned()` — **R5 APPROVED / SOURCE_WIRED；原生 Chrome NOT_TESTED**
- `OpenDeskSDK.browser.tabs.closeOwned()` — **R5 APPROVED / SOURCE_WIRED；原生 Chrome NOT_TESTED**
- `OpenDeskSDK.browser.tabs.reloadOwned()`
- `OpenDeskSDK.browser.tabs.navigateOwned()`
- `OpenDeskSDK.browser.tabs.duplicateOwned()`
- `OpenDeskSDK.browser.tabs.pinOwned()`

### 浏览器窗口 · P1 · APPROVED_TOOL

- `OpenDeskSDK.browser.windows.getCurrent()`
- `OpenDeskSDK.browser.windows.openOwned()`
- `OpenDeskSDK.browser.windows.focusOwned()`
- `OpenDeskSDK.browser.windows.closeOwned()`
- `OpenDeskSDK.browser.windows.listOwned()`

### 标签分组 · P1 · APPROVED_TOOL

- `OpenDeskSDK.browser.tabGroups.listOwned()`
- `OpenDeskSDK.browser.tabGroups.groupOwned()`
- `OpenDeskSDK.browser.tabGroups.updateOwned()`
- `OpenDeskSDK.browser.tabGroups.moveOwned()`
- `OpenDeskSDK.browser.tabGroups.ungroupOwned()`

### 会话恢复 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.sessions.listRecentlyClosed()`
- `OpenDeskSDK.browser.sessions.restoreExplicit()`

### 书签管理 · P1 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.bookmarks.search()`
- `OpenDeskSDK.browser.bookmarks.getTree()`
- `OpenDeskSDK.browser.bookmarks.get()`
- `OpenDeskSDK.browser.bookmarks.create()`
- `OpenDeskSDK.browser.bookmarks.update()`
- `OpenDeskSDK.browser.bookmarks.move()`
- `OpenDeskSDK.browser.bookmarks.remove()`

### 浏览历史 · P1 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.history.search()`
- `OpenDeskSDK.browser.history.getVisits()`
- `OpenDeskSDK.browser.history.deleteUrl()`
- `OpenDeskSDK.browser.history.deleteRange()`

### 工具隔离存储 · P0 · REUSE_EXISTING

- `OpenDeskSDK.browser.storage.get()`
- `OpenDeskSDK.browser.storage.set()`
- `OpenDeskSDK.browser.storage.remove()`
- `OpenDeskSDK.browser.storage.keys()`
- `OpenDeskSDK.browser.storage.clear()`
- `OpenDeskSDK.browser.storage.getQuota()`

### 下载管理 · P1 · APPROVED_TOOL

- `OpenDeskSDK.browser.downloads.getOwn()`
- `OpenDeskSDK.browser.downloads.listOwn()`
- `OpenDeskSDK.browser.downloads.cancelOwn()`
- `OpenDeskSDK.browser.downloads.openOwn()`
- `OpenDeskSDK.browser.downloads.revealOwn()`
- `OpenDeskSDK.browser.downloads.eraseOwnHistory()`

### 网站数据清理 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.browsingData.previewSite()`
- `OpenDeskSDK.browser.browsingData.removeSiteData()`

### 权限与站点授权 · P0 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.permissions.getStatus()`
- `OpenDeskSDK.browser.permissions.listApprovedSites()`
- `OpenDeskSDK.browser.permissions.requestSite()`
- `OpenDeskSDK.browser.permissions.revokeSite()`
- `OpenDeskSDK.browser.permissions.requestCapability()`
- `OpenDeskSDK.browser.permissions.revokeCapability()`

### 网页导航和框架 · P1 · APPROVED_TOOL

- `OpenDeskSDK.browser.webNavigation.getCurrentFrame()`
- `OpenDeskSDK.browser.webNavigation.getApprovedFrames()`
- `OpenDeskSDK.browser.webNavigation.observe.start()`
- `OpenDeskSDK.browser.webNavigation.observe.stop()`

### 脚本/CSS 注入 · P2 · CONTROLLER_ONLY

- `OpenDeskSDK.browser.scripting.runApproved()`
- `OpenDeskSDK.browser.scripting.insertApprovedCss()`
- `OpenDeskSDK.browser.scripting.removeApprovedCss()`
- `OpenDeskSDK.browser.scripting.listManaged()`

### 声明式网络规则 · P1 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.network.rules.listOwn()`
- `OpenDeskSDK.browser.network.rules.enableOwn()`
- `OpenDeskSDK.browser.network.rules.disableOwn()`
- `OpenDeskSDK.browser.network.rules.getStatus()`
- `OpenDeskSDK.browser.network.rules.updateOwn()`

### 剪贴板扩展 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.clipboard.readText()`
- `OpenDeskSDK.browser.clipboard.writeHtml()`
- `OpenDeskSDK.browser.clipboard.readImage()`

### 截图拓展 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.screenshot.captureRegion()`
- `OpenDeskSDK.browser.screenshot.captureFullPage()`

### 临时资源/导出 · P0 · APPROVED_TOOL

- `OpenDeskSDK.browser.resources.getInfo()`
- `OpenDeskSDK.browser.resources.readChunk()`
- `OpenDeskSDK.browser.resources.release()`
- `OpenDeskSDK.browser.resources.saveAs()`

### 定时任务服务 · P0 · REUSE_EXISTING

- `OpenDeskSDK.browser.scheduler.list()`
- `OpenDeskSDK.browser.scheduler.get()`
- `OpenDeskSDK.browser.scheduler.create()`
- `OpenDeskSDK.browser.scheduler.update()`
- `OpenDeskSDK.browser.scheduler.remove()`
- `OpenDeskSDK.browser.scheduler.runNow()`

### 浏览器空闲状态 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.idle.getState()`
- `OpenDeskSDK.browser.idle.observe.start()`
- `OpenDeskSDK.browser.idle.observe.stop()`

### 通知自管理 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.notifications.getStatus()`
- `OpenDeskSDK.browser.notifications.listOwn()`
- `OpenDeskSDK.browser.notifications.closeOwn()`

### 快捷键 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.commands.listConfigured()`
- `OpenDeskSDK.browser.commands.getShortcut()`

### 地址栏集成 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.omnibox.getStatus()`
- `OpenDeskSDK.browser.omnibox.getSuggestions()`

### 阅读列表 · P2 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.readingList.list()`
- `OpenDeskSDK.browser.readingList.add()`
- `OpenDeskSDK.browser.readingList.update()`
- `OpenDeskSDK.browser.readingList.remove()`

### 页面性能观测 · P2 · CONTROLLER_ONLY

- `OpenDeskSDK.browser.performance.getNavigation()`
- `OpenDeskSDK.browser.performance.getEntries()`
- `OpenDeskSDK.browser.performance.observe()`

### 页面语义封装 · P1 · REUSE_EXISTING

- `OpenDeskSDK.browser.page.getMetadata()`
- `OpenDeskSDK.browser.page.getLinks()`
- `OpenDeskSDK.browser.page.getApprovedFrames()`
- `OpenDeskSDK.browser.page.getDomSnapshot()`

### 右键菜单拓展 · P1 · APPROVED_TOOL

- `OpenDeskSDK.browser.contextMenu.listOwned()`
- `OpenDeskSDK.browser.contextMenu.updateOwned()`

### 诊断/日志 · P1 · BUILTIN_TRUSTED

- `OpenDeskSDK.browser.diagnostics.getSdkStatus()`
- `OpenDeskSDK.browser.diagnostics.exportRedactedReport()`

## 五、Cookie Editor 首批真正必须闭环的需求

1. **作用域和选站**：由用户在可信 UI 选择实际普通 HTTP(S) 当前网站及精确 Origin；Chrome `cookies` + Host 权限 + 工具安装身份 + 用户意图三重校验。对只在 Cookie Editor 内访问 Cookie 的方案，优先保留内置受信运行环境，而非直接向第三方 iframe 返回敏感 Cookie。
2. **读取**：`get/getAll` 返回当前授权网站的有界列表；在可信 UI 内默认遮挡 value、HttpOnly 内容，严格限定 storeId/partitionKey，禁止未授权跨域枚举、全量导出或输出到日志。
3. **编辑**：`set/remove` 严格处理 domain、hostOnly、path、secure、httpOnly、sameSite、session、expirationDate、storeId、partitionKey，保留 Cookie 前缀语义；整个批次先验证后产生效果，部分失败准确汇报。
4. **站点清空**：`clearSite` 须精确匹配目标 Origin/Domain、路径、storeId、partitionKey；用户明确确认，不允许默认全域清空。要处理同时有同名不同路径/分区 Cookie 的情况。
5. **导入导出**：复用已有 JSON、Cookie Header、Netscape UI 解析器；注明 Header 丢属性、Netscape 不完整支持分区 Cookie；预览新增/覆盖/失败、显式提交。敏感导出仅可信用户动作，不自动上传。
6. **变化观察**：复用已有事件会话模型（或经审查新增事件适配），有界订阅 Cookie changed，不把所有网站 Cookie 事件泄露给工具。
7. **撤权与生命周期**：站点切换、同 URL 新 document、工具禁用/卸载、宿主重启、Chrome 权限撤销、导入中断需失效；无身份/来源凭据时拒绝。
8. **原生证明**：真实 Mac Chrome 验证设置/修改/删除/重新读取、撤权拒绝、权限拒绝、Partitioned、HttpOnly、session、sameSite、文件导入/导出，证据绑定最终包 SHA。

### Cookie 官方能力约束

- Chrome `chrome.cookies` 需要 `cookies` 权限和目标网站的 host 权限。
- 默认 get/getAll 只查非分区 Cookie；Partitioned 需明确 `partitionKey`（Chrome 119+）；`getPartitionKey` 是 Chrome 132+ 功能；处理 Chrome 130+ 的 `hasCrossSiteAncestor`。
- `getAllCookieStores` 返回不同 Cookie store；本扩展的 manifest 声明 `incognito: not_allowed`，不可用隐身 Session 作为常规测试代替。
- 官方参考：<https://developer.chrome.com/docs/extensions/reference/api/cookies>。

## 六、不能遗漏、但不得默认公开的能力

- **账号凭据和安全**：身份认证 Token、系统密钥、跨站 Cookie 批量获取、任意 Cookie/header 注入、录屏和麦克风静默启动，普通工具不得默认访问。
- **浏览器全局控制**：`chrome.debugger` 任意 CDP、`chrome.proxy` 全局代理、`chrome.management` 控制其他扩展、Native 任意 shell，不纳入通用公开 SDK。
- **数据隐私**：history/bookmarks/browsingData、downloads 列表、clipboardRead、idle、topSites、identity、privacy、contentSettings、webAuthenticationProxy 等需独立审查；无批准维持受限或 OUT_OF_SCOPE。
- **浏览器其他平台特性**：ChromeOS/kiosk、enterprise/MDM、accessibility、printing、system.*、VPN、device 级接口与本产品普通 Chrome MV3 目标不同，按支持矩阵明确排除或 Host-only。
- **用户脚本/自动化**：原 Page SDK/Controller/ChromePage/RunHost 已有自己的权限和资源合同，不能仅为统一名字将高权限接口复制到 `OpenDeskSDK.browser`。
- **新 Chrome API**：维护与 <https://developer.chrome.com/docs/extensions/reference/api> 的定期差异核查（新增/弃用/权限变动），不把此刻目录冒充永久全部覆盖。

## 七、怎样从目录正式晋级为 SDK 实现

对候选接口依次完成：用户需求/场景 → 平台 API 与 Chrome 最低版本 → 确认已存在可复用 Host → 明确允许的运行环境 → 风险与 capability 审核 → 参数 Schema（包括路径、批量限制和资源字节限额） → Host + 权限校验 → SDK 包装 → 安装 UI → 正向/拒绝/撤权/Worker 原生测试 → 文档与证据 → 归入 `browser-contract.js` 并同步唯一验收账本。

**禁止**把本候选文件转换成运行时 API Registry，或者只修改 JSON 将 `PROPOSED_NOT_REGISTERED` 改为 `IMPLEMENTED`。`browser-sdk-status.md` 首屏要同时显示“已批准 SDK 32 项范围”与“候选扩展域的覆盖情况”，避免只显示一个错误的百分比。

## 八、建议阶段

- P0：恢复并验证已登记 10 项 + Tabs / Side Panel / HTTP Request 的全链路；**Cookie Editor 真实读写列为独立 P0 产品缺口**。
- P1：Cookie 管理剩余功能、网络观察、截图、书签/历史、工具资源引用、下载与浏览器权限的受控可用性。
- P2：Session/Windows/Tab Groups/Reading List/录屏/剪贴板读取/浏览数据清理与可选诊断（安全范围内）。
- 未批准：Debugger、Proxy、任意 Native Shell、任意跨站 Cookie 收集、隐式用户监控、语音控制产品等不加入实现分母。

## 九、审计核查快照

- 当前现有注册接口数量：32。
- R5 初始 114 项候选，已批准并实现真实接线 3 个自有 Tabs 方法，剩余 111 项仍未登记；不会因 Schema 而自动成为实施功能。
- 候选曝光分类计数：BUILTIN_TRUSTED=57、APPROVED_TOOL=34、REUSE_EXISTING=16、CONTROLLER_ONLY=7。
- 此清单下一次修改必须检查 Chrome 官方 API 变更及本仓最新代码，避免重叠已有 API 或构造第二套权限存储。
