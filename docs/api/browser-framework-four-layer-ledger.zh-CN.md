> **现行废止公告（2026-10-13）**：旧「35 项 API 名称/签名/数量必须长期兼容」政策已正式 **ABOLISHED**。本文件下方 35/26/7/2、Cookie 0/10 与旧 114 候选是 R6 历史审计快照，既非当前公开 Registry，也非验收事实。当前逐接口合同以 [唯一执行手册](browser-sdk-execution-manual.zh-CN.md)、[唯一接口矩阵](browser-sdk-interface-matrix.json) 和实际 `src/framework/sdk/browser-contract.js` 为准；历史兼容映射中 ACTIVE 标记不再生效。

> **R9 当前四层合同（2026-10-13）**：本页及下方旧表保留 R6/R8 原始审计快照，原 35/26/7/2 不再是当前接口分母。R9 正式注册表保留 **29 项正式已接线操作**（原 9 项占位已删除，旧记录位于 JSON 的 `legacyR8RemovedFormal`）；Cookie 可信 Host 与安装工具公开 SDK 的能力继续分开。当前原生 Chrome 验收仍 NOT_TESTED；正式机读状态请以当前 `browser-contract.js` + `browser-sdk-acceptance.json` + 四层 JSON `formal` 为准。

# 浏览器框架四层总账（R6，2026-10-13）

> **R8 新阶段提示（保留 R6 快照）**：本页及原四层 JSON 记录旧候选与正式合同，**不是 Chromium 原生 API 的自动全量目录**；35/26/7/2、原 114 项与 Cookie 0/10 均是原账本历史范围，不因 R8 自动目录出现而改变。新的 [R8 单一 SDK/Host 架构](browser-sdk-architecture-r8.zh-CN.md)、[35 项迁移映射](browser-sdk-compatibility-map.json) 和 [首批部分官方 Native Catalog](chrome-native-api-catalog.json) 分别承担新职责。Cookie 额外事件读取候选不改变下方“Cookies 全部 10 项”历史统计。

> **这是框架接口总账，不是 UI 列表或第二套运行时 Registry。** 基准 SHA `74c11918e327ac8f0c6a05cb78c9de13dadb8e6d`。机器索引 `docs/framework/workstreams/browser-framework-four-layer-ledger.json` 包含全部 35 正式方法、114 原始候选（含 3 个晋级）、以及 32 个增补 Chrome API 审计域。

## 四层含义

| 层次 | 判断问题 | 权威文件 | 禁止误判 |
| --- | --- | --- | --- |
| ① Chrome 原生 | Chrome 是否提供 API，版本、manifest 和网站权限是什么 | [Chrome 官方文档](https://developer.chrome.com/docs/extensions/reference/api)、`manifest.json` | 声明了 Chrome 权限 ≠ 工具已授权 |
| ② 框架 Driver/Host | 底层服务是否已实现、是否真实接线 | `src/platform/chrome/**`、Controller/RunHost/Authority | 有 Driver ≠ 已公开 SDK |
| ③ Browser SDK 开放 | 可调用方法、执行环境、权限、拒绝路径 | **`src/framework/sdk/browser-contract.js`** | 候选 Schema ≠ 注册接口 |
| ④ 验收证据 | Node 正反测试、Worker、Chrome 原生能否验证 | **`browser-sdk-acceptance.json`**、原始日志 | CI PASS ≠ Mac 原生 PASS |

## R6 历史数字（兼容政策已废止；非当前接口总数）

- **35** 个正式接口，26 已源码接线、7 规划、2 不开放；冻结的 R1.3–R4 32 项 + R5 Tabs 3 项。
- **27 组 114 个原始候选**，其中 3 晋级、111 未登记；与正式合同去重后共 146 个已命名方法。
- **Cookie：0/10 正式接口**；Chrome `cookies` 原生 API 已有、基础 Driver 只有部分代码，尚无完整受信 Host/SDK。
- **0/35** 同候选 Mac Chrome 正式 Native PASS；不把任意组件验证升级为原生。
- 另有 **32 个增补 Chrome Namespace/事件域**需要审计，**不是**新 SDK 已实现或新授予的权限。

## R6 历史 Cookie 10 项计划（已被后续设计迭代替代）

`src/platform/chrome/cookies.js` 已有 `getCookies`、`setCookies`、`deleteCookiesByUrl`，但 `browser.cookies.*` 正式合同 0 项、真实调用链尚未形成。它不是 Cookie Editor UI 任务。

| # | 候选 SDK 接口 | 对应原生 API / 组合 | 框架层 | SDK 层 |
| ---: | --- | --- | --- | --- |
| 1 | `browser.cookies.get` | `chrome.cookies.get` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 2 | `browser.cookies.getAll` | `chrome.cookies.getAll` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 3 | `browser.cookies.set` | `chrome.cookies.set` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 4 | `browser.cookies.remove` | `chrome.cookies.remove` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 5 | `browser.cookies.clearSite` | `chrome.cookies.getAll + chrome.cookies.remove` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 6 | `browser.cookies.getStores` | `chrome.cookies.getAllCookieStores` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 7 | `browser.cookies.getPartitionKey` | `chrome.cookies.getPartitionKey (Chrome 132+)` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 8 | `browser.cookies.observe.start` | `chrome.cookies.onChanged` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 9 | `browser.cookies.observe.getStatus` | `Host event queue` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |
| 10 | `browser.cookies.observe.stop` | `chrome.cookies.onChanged / session cleanup` | PARTIAL_DRIVER_ONLY | PROPOSED_NOT_REGISTERED |

实施顺序：`get/getAll/set/remove/clearSite` → `getStores/getPartitionKey` → `observe.start/getStatus/stop`。Cookie Value/HttpOnly 不进入普通工具沙箱、日志、自动导出；必须由真实可信 Host 限定 Origin、TabRef、Document、权限与用户批准，不能由工具 ID 或 `trusted: true` 获得高权限。
PartitionKey Chrome 119+、`hasCrossSiteAncestor` 130+、`getPartitionKey` 132+，`publicSuffix` 153+（必须兼容本项目 Chrome 138）。同名不同 Path、HostOnly/Domain/StoreId/Partition、权限撤销、Worker 中断、部分失败和未知原生回执都必须单独测试。
Cookie 详细实施与验收任务：[browser-cookies-r6.md](../framework/workstreams/browser-cookies-r6.md)。

## R6 历史 35 项接口快照（已废止为兼容基准）

| # | 操作 | SDK 状态 | 框架层 | Node 正向 / 拒绝 | Mac Chrome |
| ---: | --- | --- | --- | --- | --- |
| 1 | `browser.capabilities.list` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 2 | `browser.capabilities.getStatus` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 3 | `browser.contextMenu.getStatus` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 4 | `browser.contextMenu.register` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 5 | `browser.contextMenu.unregister` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 6 | `browser.launch.consume` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 7 | `browser.page.getContext` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 8 | `browser.page.getSelection` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 9 | `browser.clipboard.writeText` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 10 | `browser.downloads.text` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 11 | `browser.tabs.open` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 12 | `browser.tabs.focus` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 13 | `browser.tabs.getOwned` | IMPLEMENTED | SOURCE_WIRED | PASS / PASS | NOT_TESTED |
| 14 | `browser.tabs.listOwned` | IMPLEMENTED | SOURCE_WIRED | PASS / PASS | NOT_TESTED |
| 15 | `browser.tabs.closeOwned` | IMPLEMENTED | SOURCE_WIRED | PASS / PASS | NOT_TESTED |
| 16 | `browser.sidePanel.openSelf` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 17 | `browser.network.request` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 18 | `browser.network.observe.start` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 19 | `browser.network.observe.getStatus` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 20 | `browser.network.observe.stop` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 21 | `browser.network.observe.export` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 22 | `browser.events.read` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 23 | `browser.events.close` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 24 | `browser.screenshot.captureVisible` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 25 | `browser.media.recording.prepare` | PLANNED | NOT_IMPLEMENTED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 26 | `browser.media.recording.getStatus` | PLANNED | NOT_IMPLEMENTED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 27 | `browser.media.recording.stop` | PLANNED | NOT_IMPLEMENTED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 28 | `browser.media.recording.discard` | PLANNED | NOT_IMPLEMENTED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 29 | `browser.speech.transcribe` | PLANNED | NOT_IMPLEMENTED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 30 | `browser.speech.speak` | PLANNED | NOT_IMPLEMENTED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 31 | `browser.speech.stop` | PLANNED | NOT_IMPLEMENTED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 32 | `browser.notifications.create` | NOT_EXPOSED | RESTRICTED_EXPOSURE | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 33 | `browser.notifications.clear` | NOT_EXPOSED | RESTRICTED_EXPOSURE | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 34 | `browser.operations.getStatus` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |
| 35 | `browser.operations.cancel` | IMPLEMENTED | SOURCE_WIRED | NOT_TESTED / NOT_TESTED | NOT_TESTED |

状态直接追踪 [正式 Browser SDK 验收账本](../framework/workstreams/browser-sdk-acceptance.json)，不擅自覆盖原始证据。

## 原始 27 组、114 项候选（保留全部名字）

| # | 功能组 | 优先级 / 可信等级 | 原始候选 | 已晋级 | 待登记 |
| ---: | --- | --- | ---: | ---: | ---: |
| 1 | Cookie 核心读写与事件 | P0 / BUILTIN_TRUSTED | 10 | 0 | 10 |
| 2 | 标签页扩展操作 | P0 / APPROVED_TOOL | 8 | 3 | 5 |
| 3 | 浏览器窗口 | P1 / APPROVED_TOOL | 5 | 0 | 5 |
| 4 | 标签分组 | P1 / APPROVED_TOOL | 5 | 0 | 5 |
| 5 | 会话恢复 | P2 / BUILTIN_TRUSTED | 2 | 0 | 2 |
| 6 | 书签管理 | P1 / BUILTIN_TRUSTED | 7 | 0 | 7 |
| 7 | 浏览历史 | P1 / BUILTIN_TRUSTED | 4 | 0 | 4 |
| 8 | 工具隔离存储 | P0 / REUSE_EXISTING | 6 | 0 | 6 |
| 9 | 下载管理 | P1 / APPROVED_TOOL | 6 | 0 | 6 |
| 10 | 网站数据清理 | P2 / BUILTIN_TRUSTED | 2 | 0 | 2 |
| 11 | 权限与站点授权 | P0 / BUILTIN_TRUSTED | 6 | 0 | 6 |
| 12 | 网页导航和框架 | P1 / APPROVED_TOOL | 4 | 0 | 4 |
| 13 | 脚本/CSS 注入 | P2 / CONTROLLER_ONLY | 4 | 0 | 4 |
| 14 | 声明式网络规则 | P1 / BUILTIN_TRUSTED | 5 | 0 | 5 |
| 15 | 剪贴板扩展 | P2 / BUILTIN_TRUSTED | 3 | 0 | 3 |
| 16 | 截图拓展 | P2 / BUILTIN_TRUSTED | 2 | 0 | 2 |
| 17 | 临时资源/导出 | P0 / APPROVED_TOOL | 4 | 0 | 4 |
| 18 | 定时任务服务 | P0 / REUSE_EXISTING | 6 | 0 | 6 |
| 19 | 浏览器空闲状态 | P2 / BUILTIN_TRUSTED | 3 | 0 | 3 |
| 20 | 通知自管理 | P2 / BUILTIN_TRUSTED | 3 | 0 | 3 |
| 21 | 快捷键 | P2 / BUILTIN_TRUSTED | 2 | 0 | 2 |
| 22 | 地址栏集成 | P2 / BUILTIN_TRUSTED | 2 | 0 | 2 |
| 23 | 阅读列表 | P2 / BUILTIN_TRUSTED | 4 | 0 | 4 |
| 24 | 页面性能观测 | P2 / CONTROLLER_ONLY | 3 | 0 | 3 |
| 25 | 页面语义封装 | P1 / REUSE_EXISTING | 4 | 0 | 4 |
| 26 | 右键菜单拓展 | P1 / APPROVED_TOOL | 2 | 0 | 2 |
| 27 | 诊断/日志 | P1 / BUILTIN_TRUSTED | 2 | 0 | 2 |

**114 个方法逐项名字**保存在既有 [完整候选清单](browser-sdk-full-interface-inventory.zh-CN.md) 和机器总账 `candidateCatalog`，其中包含已晋级的 3 项并标记 PROMOTED_TO_FORMAL。这样避免复制出第三份名称清单后产生漂移。底层源码 `NEEDS_AUDIT` 不可误报未实现或已完成。

## 现有目录外的 Chrome API 补充审计

| # | Chrome API / 事件域 | 代表方法或事件 | 优先级 | 可信边界 |
| ---: | --- | --- | --- | --- |
| 1 | `chrome.action` (action) | `onClicked/getTitle/setBadgeText/setIcon` | P1 | BUILTIN_TRUSTED |
| 2 | `chrome.runtime` (runtime) | `onInstalled/onStartup/onMessage/connect` | P0 | BUILTIN_TRUSTED |
| 3 | `chrome.offscreen` (offscreen) | `createDocument/hasDocument/closeDocument` | P2 | BUILTIN_TRUSTED |
| 4 | `chrome.contentSettings` (contentSettings) | `get/set/clear` | P2 | BUILTIN_TRUSTED |
| 5 | `chrome.declarativeContent` (declarativeContent) | `onPageChanged` | P2 | BUILTIN_TRUSTED |
| 6 | `chrome.tabCapture` (tabCapture) | `capture/getMediaStreamId` | P2 | BUILTIN_TRUSTED |
| 7 | `chrome.desktopCapture` (desktopCapture) | `chooseDesktopMedia` | P2 | BUILTIN_TRUSTED |
| 8 | `chrome.pageCapture` (pageCapture) | `saveAsMHTML` | P2 | BUILTIN_TRUSTED |
| 9 | `chrome.search` (search) | `query` | P2 | APPROVED_TOOL |
| 10 | `chrome.topSites` (topSites) | `get` | RESTRICTED | NOT_EXPOSED |
| 11 | `chrome.identity` (identity) | `getAuthToken/launchWebAuthFlow` | RESTRICTED | BUILTIN_TRUSTED |
| 12 | `chrome.devtools.*` (devtools) | `network/panels/recorder/performance` | OUT_OF_SCOPE | DEVTOOLS_ONLY |
| 13 | `chrome.i18n` (i18n) | `getMessage/getUILanguage` | P2 | REUSE_EXISTING |
| 14 | `chrome.publicSuffix` (publicSuffix) | `getDomain/getKnownSuffix/isKnownSuffix` | P1 | BUILTIN_TRUSTED |
| 15 | `chrome.fontSettings` (fontSettings) | `getFont/setFont` | P2 | BUILTIN_TRUSTED |
| 16 | `chrome.management` (management) | `getAll/setEnabled/uninstall` | RESTRICTED | NOT_EXPOSED |
| 17 | `chrome.privacy` (privacy) | `network/services/websites` | RESTRICTED | NOT_EXPOSED |
| 18 | `chrome.proxy` (proxy) | `settings.get/settings.set` | RESTRICTED | NOT_EXPOSED |
| 19 | `chrome.system.*` (system) | `cpu/memory/storage` | OUT_OF_SCOPE | NOT_EXPOSED |
| 20 | `chrome.power` (power) | `requestKeepAwake/releaseKeepAwake` | RESTRICTED | BUILTIN_TRUSTED |
| 21 | `chrome.runtime` (nativeMessaging) | `runtime.connectNative/sendNativeMessage` | RESTRICTED | BUILTIN_TRUSTED |
| 22 | `chrome.tabs` (tabsEvents) | `tabs.onUpdated/onRemoved/onActivated` | P0 | REUSE_EXISTING |
| 23 | `chrome.downloads` (downloadsEvents) | `downloads.onCreated/onChanged` | P1 | REUSE_EXISTING |
| 24 | `chrome.storage` (storageEvents) | `storage.onChanged` | P1 | REUSE_EXISTING |
| 25 | `chrome.userScripts` (userScriptsLifecycle) | `userScripts.register/update/unregister` | P1 | CONTROLLER_ONLY |
| 26 | `chrome.sidePanel` (sidePanelExtended) | `sidePanel.setOptions/getOptions/setPanelBehavior` | P1 | BUILTIN_TRUSTED |
| 27 | `chrome.webRequest` (webRequestEvents) | `webRequest.onBeforeRequest/onCompleted` | P1 | REUSE_EXISTING |
| 28 | `chrome.debugger` (debugger) | `attach/sendCommand/detach` | RESTRICTED | NOT_EXPOSED |
| 29 | `chrome.notifications` (notificationsEvents) | `notifications.onClicked/onClosed` | P2 | BUILTIN_TRUSTED |
| 30 | `chrome.alarms` (alarms) | `create/getAll/onAlarm` | P0 | REUSE_EXISTING |
| 31 | `chrome.webAuthenticationProxy` (webAuthenticationProxy) | `attach/completeCreateRequest` | OUT_OF_SCOPE | NOT_EXPOSED |
| 32 | `chrome.webNavigation` (webNavigationEvents) | `onCommitted/onHistoryStateUpdated` | P0 | REUSE_EXISTING |

这些域要逐项比较真实框架已有源文件和 Chrome 版本，不能只凭 Candidate 缺席断言其未实现；Global Proxy、Debugger、Identity Token、DevTools/ChromeOS/Enterprise 等需保持 NOT_EXPOSED 或 OUT_OF_SCOPE。Chrome 148+ 的浏览器原生命名空间 `browser` 也不应与 `OpenDeskSDK.browser` 混淆。

## 维护规则与权威文件

- 正式可执行方法：`src/framework/sdk/browser-contract.js`（唯一真相），对应 Schema/Host 必须真实存在。
- 27 组/114 候选：`docs/api/browser-sdk-full-interface-inventory.zh-CN.md`（候选，不授权）。
- 18 域/74 能力叶子：`docs/api/browser-capability-universe.zh-CN.md`（历史核查补充，非接口数）。
- 验收：`docs/framework/workstreams/browser-sdk-acceptance.json`（原始证据 SHA 和真实级别不随本文件提升）。
- 本四层机器总账：`docs/framework/workstreams/browser-framework-four-layer-ledger.json`（非运行时授权表）。
- Cookie 优先任务：`docs/framework/workstreams/browser-cookies-r6.md`（只列真实实现与测试）。
- 后续源码实现或候选晋级必须同步更新对应总账、运行校验，不允许修改 JSON 来伪造 IMPLEMENTED / PASS；原 603＋19、B05、F3、ZIP 不变。
