# OpenDesk Browser 功能宇宙与实现状态矩阵（R1.3）

> 事实来源：`src/framework/sdk/registry.js`、`src/framework/sdk/browser-contract.js`、`src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`src/platform/chrome/context-menus.js`、现有 Controller/Chrome 驱动及 `manifest.json`。本矩阵描述**存量模块和本分支静态代码**，不表示已经过真实 Chrome 验收。

状态定义：`IMPLEMENTED` = 对所列环境有实际接线代码；`HOST_ONLY` = 可信扩展或 Controller 已有服务，未公开给普通工具；`NOT_EXPOSED` = 本期按安全策略不开放；`PLANNED` = 仅冻结后续设计/名称；`UNSUPPORTED` = 目标 Chrome 或上下文不支持。实施状态和 `callableNow` 不等价。

## 浏览器功能树

```text
OpenDesk Browser
├─ 用户入口：右键菜单 / Action / 命令快捷键 / omnibox / Side Panel
├─ 浏览：标签 / 窗口 / 导航 / 标签组 / Session
├─ 页面：DOM / 选区 / 文档绑定 / USER_SCRIPT / Locator
├─ 通信：HTTP / axiosx / fetch / 跨域 / WebSocket
├─ 网络：webRequest 观察 / DNR / 代理 / CDP 诊断
├─ 媒体：截图 / 区域 / 整页 / 录屏 / 桌面 / 麦克风 / 标签音频
├─ 语音：STT / TTS / 指令
├─ 数据：Storage / IndexedDB / Cookie / History / Bookmarks
├─ 输出：下载 / 剪贴板 / 文件 / Native 文件
├─ 生命周期：onInstalled / onStartup / onRemoved / alarms / MV3 恢复
├─ 开发者：沙箱 / 组件 / 工具安装更新 / 市场
└─ 云端：任务 Provider / 长连接 / 本机与浏览器执行器
```

下表的“位置”是既有源码或冻结拟新增路径，不得把“计划文件”算作现有源码。

| 功能域 / 叶子能力 | 底层 API / 权限 | 真实服务位置及调用环境 | 授权边界 / 风险 | 当前状态 | 阶段与测试 |
| --- | --- | --- | --- | --- | --- |
| 1. 右键菜单声明、创建、同步 | `chrome.contextMenus`, optional `contextMenus` | `src/platform/chrome/context-menus.js`；可信 MV3 | 站点 + 工具包摘要；高 | IMPLEMENTED（源码） | R1.3；Node/Chrome NOT_TESTED |
| 1. 右键点击 → Side Panel → 选区 | `contextMenus.onClicked`, `sidePanel.open`, `webNavigation.getFrame` | `src/sw.js` + `src/ui/tool-shell.js` + 菜单 Host；安装工具领取 | 60s/16KiB/实例+文档；高 | IMPLEMENTED（源码，极端导航身份仍待验证） | R1.3；Chrome NOT_TESTED |
| 1. 扩展 Action 入口 | `chrome.action.onClicked` | `src/sw.js` | 可信用户点击 | HOST_ONLY | 已有；R1.3 未重测 |
| 1. 快捷键 / 地址栏 | `chrome.commands` / `chrome.omnibox` | 无本轮新增入口 | 权限/手势；中 | PLANNED | 后续 |
| 2. 标签页创建/激活/分组 | `chrome.tabs` / `tabGroups` | `src/platform/chrome/tabs.js` 现有注入用途；普通工具公共引用尚缺 | 不允许任意 tabId；高 | HOST_ONLY / PLANNED | R2+ |
| 2. 选定 tab/document 跟踪 | `webNavigation.getAllFrames/getFrame` | `src/ui/current-page-target.js` / Controller | 实际 documentId, frameId；高 | HOST_ONLY（部分 getContext 复用） | 既有，R1.3组件待测 |
| 2. 会话恢复 / 窗口 | `chrome.windows` / `sessions` | 无统一工具接口 | 浏览历史隐私；高 | NOT_EXPOSED | 后续审核 |
| 3. 网页标题与地址 | 浏览器 Tab/WebNavigation | `src/ui/sidebar-tools.js` → `browser.page.getContext`；工具 | `currentPage.read`；低 | IMPLEMENTED | R1.3；NOT_TESTED |
| 3. DOM / Page USER_SCRIPT | `chrome.userScripts`, `chrome.scripting`, DOM | `src/scripting/user-scripts/`，`src/framework/ChromePage.js` | 按文档/脚本登记；高 | HOST_ONLY | 存量框架 |
| 3. Locator / 页面点击与选区 | Controller/Page APIs，`contextMenus.onClicked` | `src/framework/ChromePage.js` / `browser.launch.consume` | Controller 身份或一次性菜单上下文；高 | HOST_ONLY / IMPLEMENTED（受限选区） | R1.3；NOT_TESTED |
| 4. HTTP GET/POST/PUT/DELETE | `fetch`，既有 `axiosx` | `src/platform/chrome/network.js` / `src/framework/sdk/http.js` / `src/platform/host/sdk-broker.js` | Target Origin 与既有 SDK 授权；高 | IMPLEMENTED（原 Page SDK）；工具统一 network API HOST_ONLY | 原功能复用 |
| 4. WebSocket/外部 Provider | WebSocket / Native | 各自原服务（须再核实） | 授权服务器/执行身份；高 | NOT_EXPOSED | 云控专项 |
| 5. 被动请求生命周期 | `chrome.webRequest`, optional `webRequest` | 规划 `src/platform/chrome/network-observer.js` / `src/platform/host/network-observation.js` | 单标签、明确站点+Origin；高 | PLANNED | R2；**未实现** |
| 5. HAR / 请求或响应正文 / WebSocket 消息 | DevTools/CDP/webRequest 限制 | 无通用普通工具驱动 | 高敏内容；极高 | NOT_EXPOSED | R3+ |
| 6. 规则拦截 DNR | `declarativeNetRequestWithHostAccess` optional | 现有 Manifest 选项，未公开观察 API | 与观察授权分离；高 | NOT_EXPOSED | 独立规划 |
| 6. 浏览器代理 | `chrome.proxy`（当前 Manifest 未列） | 无统一 SDK 驱动 | 全局浏览器风险；极高 | UNSUPPORTED（当前打包配置） | 另行论证 |
| 7. 可见页面截图 | `chrome.tabs.captureVisibleTab` / Controller driver | `src/framework/control/native-driver.js` / Controller | 绑定实际目标；高 | HOST_ONLY | 已有 Controller；R1.3不公开 |
| 7. 区域、整页截图 | DOM/scroll 合成及目标会话 | 无普通工具接线 | 页面数据；高 | PLANNED | R3 |
| 8. 标签页 / 窗口 / 桌面录屏 | `tabCapture` / `desktopCapture` / `getDisplayMedia` | 未来受信任前台媒体服务 | 明确 UI 授权和前台录制会话；极高 | PLANNED | R3 |
| 9. 麦克风 / 标签页音频 | `getUserMedia` / `tabCapture` | 无统一工具媒体驱动 | 系统设备授权；极高 | NOT_EXPOSED | R3 |
| 9. 语音转写/朗读/指令 | STT / TTS | 无普通工具方法 | 音频和对话授权；高 | PLANNED（不在当前主线） | 独立规划 |
| 10. 工具本机存储 | `chrome.storage.local` | `src/ui/sidebar-tools.js` → `storage.get/set` | ID 命名空间、配额、WebLocks；中 | IMPLEMENTED（旧通道） | 既有 |
| 10. 原 SDK 持久/会话存储 | `chrome.storage` | `src/framework/sdk/storage.js`, broker | 原 SDK 文档授权；中 | IMPLEMENTED（原 SDK） | 既有 |
| 10. Cookie | `chrome.cookies` | `src/platform/chrome/cookies.js` + Controller | 网站与宿主身份；极高 | HOST_ONLY | 既有 |
| 10. 书签/历史 | optional `bookmarks/history` | 未开放普通工具服务 | 浏览记录隐私；高 | NOT_EXPOSED | R3+ |
| 11. Markdown 下载、复制 | `chrome.downloads`, navigator.clipboard | `src/ui/sidebar-tools.js` 既有 `file.download/clipboard.writeText` | `user.export`、用户确认；中 | IMPLEMENTED（便捷映射） | R1.3；NOT_TESTED |
| 11. Native 文件 | Native Messaging / 本机文件 provider | `src/native-agent/` 等 Native Host | 单独配对/目录授权；极高 | HOST_ONLY | Native 专项 |
| 12. 安装、升级、权限撤销 | `runtime.onInstalled`, `permissions.onAdded/onRemoved`, `tabs/webNavigation` | `src/sw.js` + `context-menus.js` | 撤权、冷启动；高 | IMPLEMENTED（源码） | R1.3；NOT_TESTED |
| 12. 定时任务 Alarms | `chrome.alarms` | 无本轮 SDK 暴露 | 后台生命周期；中 | PLANNED | R2+ |
| 13. Controller 任务执行 | 原 RunHost、Page/Locator、协议 | `src/framework/control/`、`src/run-host.js`、`src/platform/host/` | 严格 Run/Result 身份；高 | HOST_ONLY | 既有 |
| 14. DevTools/CDP 调试 | `chrome.debugger` 等（Manifest 当前无 `debugger`） | 受控测试驱动，不是工具公共服务 | CDP 暴露敏感内容；极高 | NOT_EXPOSED | 专项 |
| 14. 性能/诊断 | Host/RunHost metrics | `src/ui/resource-diagnostics.js`、相关脚本 | 只读；中 | HOST_ONLY | 既有 |
| 15. Native Messaging | optional `nativeMessaging` | `src/native-agent/`、SW Native port | 设备/进程身份；极高 | HOST_ONLY | Native 专项 |
| 16. 工具身份、网站范围、权限审批 | Chrome Permission + 工具清单 + WebLocks | `src/ui/sidebar-tools/installation.js`、`src/platform/host/authority.js` | 工具/站点/页面各独立；高 | IMPLEMENTED（部分） | R1.3；NOT_TESTED |
| 17. 安装、更新、预装/发现、市场 | 工具 Catalog、沙箱、签名/哈希 | `src/ui/sidebar-tools.js`、`src/sidebar-tools/official-catalog.js`、`scripts/build-sidebar-tool.mjs` | 审阅包身份后安装；高 | IMPLEMENTED（既有 + v2 源码） | R1.3；NOT_TESTED |
| 18. 云控任务/AI provider | WebSocket/受控长连接 | 云控专项，不合并 Browser SDK RPC | 身份、执行端、撤权隔离；极高 | NOT_EXPOSED | 专项 R2+ |

环境只支持 Chrome 138+ 是当前 `manifest.json` 的最低要求，不代表某项浏览器 API 在全部平台和用户权限下必然可用；运行状态需由实际 Chrome 能力探测。开发者不得把 `HOST_ONLY` 当作 `OpenDeskSDK.browser` 已授权。上述 Controller/Native 功能是现有源码位置映射，未逐个在当前 R1.3 SHA 执行真实回归。

## R2：被动网络观察冻结合同与文件职责

**不改写原 `axiosx` / Controller HTTP。**

```text
原主动请求
  Page SDK: src/framework/sdk/http.js / registry.js
    → src/platform/host/sdk-broker.js
      → src/platform/chrome/network.js
  Controller: src/platform/host/controller-network-scope.js

R2 新增被动观察（尚未创建）
  src/platform/chrome/network-observer.js
    Chrome webRequest: onBeforeRequest/onCompleted/onErrorOccurred 等
  src/platform/host/network-observation.js
    工具身份、站点/Origin 校验、Web Locks、观察会话和事件缓冲
      → src/framework/sdk/browser.js
        browser.network.observe.start/getStatus/stop/export
        browser.events.read/close
```

### 首期参数及结果合同

```js
// 示意：仅 R2 冻结；R1.3 调用必须返回不支持，禁止假成功
const observation = await OpenDeskSDK.browser.network.observe.start({
  tabRef: 'trusted-tab-ref',
  targetOrigins: ['https://example.com'],
  durationMs: 30000,
  maxEvents: 500,
  maxBufferedBytes: 524288
});
// → {observationId, startedAt, expiresAt, sourceTabRef,
//    policy:{...}, cursor, droppedCount, gapCount}
const page = await OpenDeskSDK.browser.events.read({observationId,cursor,limit:100});
// → {events:[{seq,method,urlOrOrigin,resourceType,statusCode,durationMs,
//             outcome}], nextCursor, droppedCount, gapCount}
```

默认仅用户主动批准的**单个普通 HTTP(S) tab**，限制最多 30 秒、500 事件、512 KiB 缓冲；收集 `method`、脱敏 URL/Origin、资源类型、状态码、时长、完成或失败、事件序号、缺口。禁止默认采集 Cookie、Authorization、Header、POST Body、Response Body、其他标签、WebSocket payload。

Chrome 可选权限使用 `webRequest`，并且每个允许的网站还需相应 host origin；**权限许可不等于工具本人已获数据授权**。校验两个时点：监听会话创建前与每次事件写入前；权限撤销时停止、清空敏感缓存。观察数据属于可信后台，不属于 Page/USER_SCRIPT JS。MV3 Worker 休眠、监听事件间断应保留真实 `gapCount/droppedCount`，不能制造无缺口的 HAR。

### R2 最小真实验收

1. 安装扩展，明确授予 `webRequest` + 单网站 host 权限；未经用户同意不创建监听器。
2. 在允许标签中发出多条 GET；观察仅允许 tab/Origin 的完成/失败元数据。
3. 验证其他 tab/Origin、Cookie/Headers/Body 永远不出结果。
4. 30 秒到期/明确 Stop/撤销网站或 Chrome 权限均关闭并清理会话。
5. 真实 Chrome Worker 关闭/恢复后显式报告遗漏和剩余容量，绝不把无事件说成 PASS。
6. 将观察与已有主动 `axiosx`、DNR、网络代理、CDP 分开测试，避免对外宣称 HAR 保真或全站抓包。

**R2/R3 不是 R1.3 实施完成数**。