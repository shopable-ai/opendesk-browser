# OpenDeskSDK.browser API · 推荐短接口与原有高级操作

> **R8 统一规范（已建立分阶段实施工作流）**：[单一 `OpenDeskSDK.browser` / Host / Authority 架构](browser-sdk-architecture-r8.zh-CN.md)、[35 项旧接口兼容映射](browser-sdk-compatibility-map.json)、[上游复用决策](browser-sdk-open-source-reuse.zh-CN.md)、[官方 Native Catalog（目前只覆盖 8 组固定 JSON，不能称 Chrome 全量）](chrome-native-api-catalog.json)。R8 的 Catalog 发现层不授予执行权限。本页 R1.3 历史表格明确不是今日状态；`cookies.*` 尚未成为正式可信调用链。

> **框架能力四层总账**：[Chrome 原生 ↔ Driver/Host ↔ Browser SDK ↔ 验收证据](browser-framework-four-layer-ledger.zh-CN.md)；所有 27 组 114 项候选和 Cookie 10 项 P0 缺口都有逐项索引。此页保留当前开发者 API/历史设计，四层总账不构成额外授权。


> **更新：2026-10-12。** 对安装工具的开发者，优先使用易理解的高层写法；下方保留的 R1.3 `PLANNED` / `HOST_ONLY` 表是 **2026-10-11 历史快照，不能当作当前进度**。当前源码正式合同为 [35 项操作注册表](../../src/framework/sdk/browser-contract.js)，状态与原生证据见 [Browser SDK 工作流](../framework/workstreams/browser-sdk-status.md)。

## R5：查询、列出并关闭本工具的标签页

此处 R5 正式新增 **3 项源码接线接口**。原 32 项历史接口合同仍保留，按 R5 增量记账为 35 项，其中 26 项已接线。源码接线不等于 Mac Chrome 原生验收；当前新增功能原生仍 NOT_TESTED。

```js
const {browser} = OpenDeskSDK;
const {tabRef} = await browser.tabs.open({url:'https://example.org/page'});
const owned = await browser.tabs.getOwned({tabRef});
const {tabs} = await browser.tabs.listOwned();
await browser.tabs.closeOwned({tabRef});
```

- `getOwned({tabRef})` 返回本工具已打开、目前仍合法的 URL、Origin、引用到期时间及 TabRef。
- `listOwned()` 只列本工具最多 8 个当前合法引用与 Origin，不查询所有 Chrome 标签页。
- `closeOwned({tabRef})` 必须经受信侧边栏的明确单次点击，通过真实 Host 后才能关闭；原生结果未知时不重复执行。
- 工具包仍需声明 `browser.tabs` capability，且必须安装、启用并保持相同包 Hash / Install Epoch、Chrome 权限与网站授权。不能把原生 tabId 传入任何一个方法。
- 已导航、关闭、停用、卸载、更新及 Worker 重启后的旧引用不再有效；旧 `tabs.open/focus` 保持原来的方法签名。

实现包括 `src/framework/sdk/browser-contract.js`、`browser.js`、`browser-schemas.js`、`src/platform/chrome/browser-tabs.js`、`context-menus.js`、`src/ui/sidebar-tools.js` 与 `src/sidebar-tools/bridge.js`。验收见 [状态与测试账本](../framework/workstreams/browser-sdk-status.md)。

## 开发者优先：`browser.network.watch()`

```js
// 仅在已安装、已启用且具备 capability 的 Side Panel 工具沙箱中。
// OpenDeskSDK 是运行时提供的环境对象，不向 main() 传参数。
const {browser} = OpenDeskSDK;
const {tabRef} = await browser.tabs.open({url:'https://example.org/page'});

// 通过可信 UI 明确批准指定 TabRef + Origin，开启不超过 30 秒的元数据观察。
const watch = await browser.network.watch({
  tabRef,
  origin:'https://example.org'
});
const {events,nextCursor} = await watch.read({limit:25});
const status = await watch.status();
await watch.stop();
await watch.export();  // JSON Save As；需要另一次用户确认
await watch.close();
```

**为什么不再推荐把 `network.observe.start` 写进普通示例？** 因为 `network.observe.start`、`events.read`、`operations.cancel` 属于内部按能力领域拆分的**精确 Host 操作合同**，用户不应为一次短时观察自行维护 `observationId/sessionRef/operationId`。推荐 `watch` 作为**仅存在于工具沙箱的轻量便捷句柄**；其 `read/status/stop/export/close/cancel` 仍分别调用原已批准的 Host RPC，没有第二套权限、Driver 或持久观察系统。旧写法完全保留兼容，不改变 32 项合同分母、错误码和能力体系。

| 用户操作 | 推荐方式 | 复用的可信底层操作 |
| --- | --- | --- |
| 开始网络观察 | `browser.network.watch({tabRef,origin})` | `browser.network.observe.start({tabRef,origins:[origin]})` |
| 读取有界 HTTP 元数据 | `watch.read({limit:25})` | `browser.events.read({sessionRef,cursor,limit})` |
| 查看会话状态 | `watch.status()` | `browser.network.observe.getStatus({observationId})` |
| 停止观察 | `watch.stop()` | `browser.network.observe.stop({observationId})` |
| 导出 JSON | `watch.export()` | `browser.network.observe.export({observationId,format:'json'})` |
| 取消本工具操作 | `watch.cancel()` | `browser.operations.cancel({operationId})` |
| 关闭读取会话 | `watch.close()` | `browser.events.close({sessionRef})` |

**权限边界不变**：`tabRef` 必须是该工具此前获准拥有的标签页；`origin` 必须是精确 HTTP(S) Origin；开始/导出操作必须经过可信界面单次批准；请求只收集单 Tab / 单 Origin 的有界 HTTP 元数据，默认不含 Cookie、Token、Body、完整 URL。安装包至少声明 `browser.network.observe` 和 `browser.events`；`watch.cancel()` 另外需要 `browser.operations`。普通 HTTP(S) Page SDK 和只读开发预览不暴露这些特权方法。

`watch` 对象含函数，不是可跨 Worker、工具实例或页面序列化的授权凭据；工具重新打开时必须重新获取合法引用。该便利封装本身不代表 Mac Chrome 原生验收。参见 [可导入真实功能验证工具](../../examples/sidebar-tools/browser-sdk-r2/README.zh-CN.md)。

---

## R1.3 历史设计与合同参考（以下统计与 PLANNED 状态已过期）

> 日期 2026-10-11；开发隔离分支 `agent/browser-sdk-r13-20261011`。本页按实际新增源文件和现存服务区分 **IMPLEMENTED（已有源码）/ HOST_ONLY / NOT_EXPOSED / PLANNED / UNSUPPORTED**。**IMPLEMENTED 不表示真实 Chrome 已验收**，当前原生完整菜单路径尚为 NOT_TESTED。运行环境最低按现有 `manifest.json` 的 Chrome 138 记录。

## 一、公开入口与运行环境

```text
OpenDeskSDK
├── ready() / axiosx / AppStorage / AppLocal / 旧 service（保持现有行为）
└── browser (apiVersion 1.0.0)
    ├── capabilities.list / getStatus
    ├── contextMenu.getStatus / register / unregister
    ├── launch.consume
    ├── page.getContext / getSelection
    ├── clipboard.writeText / downloads.text
    ├── tabs.* / sidePanel.* (规划)
    ├── network.request / observe.* (原 Host 能力/规划)
    ├── screenshot.captureVisible (原 Controller Host 复用点)
    ├── media.recording.* / speech.* (规划)
    └── events.* / operations.* / notifications.* (规划或未向工具公开)
```

| 环境 | 可执行 Browser SDK | 身份/能力边界 |
| --- | --- | --- |
| 扩展可信背景与 Side Panel Host | 操作落在 `src/platform/chrome/context-menus.js`，并由 SW 提供消息入口 | 可信 `sender.id`、`tool.html`、`hostInstanceId`；再次核对工具、撤销代际和包摘要 |
| 已安装的 Side Panel 工具沙箱 | `OpenDeskSDK.browser` 便捷层 + 原 `OpenDeskTool.request()` | opaque iframe `postMessage` 实际实例 token/来源检查；无 `chrome.*` |
| 普通 HTTP(S) Page SDK / USER_SCRIPT | 仅本地只读 `browser.capabilities.*`；菜单注册被明确拒绝 | **不增加** Page RPC `ADMITTED_METHODS`；不能获得跨标签、Native/右键授权 |
| Controller / RunHost | 原 `page` / Locator / 下载与截图方法保持不变 | 不通过 Browser SDK 假借已存在的 Controller 操作身份 |

**核心源码**：`src/framework/sdk/browser.js`、`browser-contract.js`；旧全局 SDK 创建见 `src/framework/sdk/entry.js`；工具注入见 `src/sidebar-tools/bridge.js`；实例与能力复核见 `src/ui/sidebar-tools.js`；原生菜单服务见 `src/platform/chrome/context-menus.js`；同步事件注册见 `src/sw.js`。合同是声明与参数边界，**不是另一份授权数据库**。

## 二、已经编写的 SDK 包装方法

| `OpenDeskSDK.browser.` 方法 | 参数 | 返回数据 | 底层服务及条件 |
| --- | --- | --- | --- |
| `capabilities.list` | `{}` | `Array<BrowserCapabilityStatus>` | 普通网页只读本地目录；工具由可信宿主返回状态 |
| `capabilities.getStatus` | `{operation:string}` | `BrowserCapabilityStatus` | 不请求权限，声明不等于授权 |
| `contextMenu.getStatus` | `{}` | `{enabled,approvedOrigins,activeActions,browserPermission}` | v2 菜单工具 |
| `contextMenu.register` | `{actionIds:string[]}` | `{registered,actionIds}` | 只激活已声明的 actionIds，先在详情批准当前网站 |
| `contextMenu.unregister` | `{}` | `{registered:false,actionIds:[]}` | 只停用该工具菜单 |
| `launch.consume` | `{}` | `{ticketId,toolId,actionId,source,selection,linkUrl,expiresAt}` | 60 秒、单次、安装包/实例/文档校验 |
| `page.getContext` | `{}` | `currentPage.info 同形结果` | 复用现有 currentPage.read |
| `page.getSelection` | `{}` | `同 launch.consume` | 从一次性右键上下文读取；消耗同一 ticket |
| `clipboard.writeText` | `text:string` | `{copied:true}` | 映射旧 clipboard.writeText；需要前台 Clipboard API |
| `downloads.text` | `{text:string,filename:string}` | `{downloadId:number}` | 映射旧 file.download；Markdown 文件名必须 .md |

上述方法的 R1.3 实现阶段标记为 **IMPLEMENTED（源码层）**。身份复核失败必须拒绝，不得返回伪成功。每个操作均在 `browser-contract.js` 声明 apiVersion、支持上下文、工具能力、Chrome 权限、网站范围、风险、效果类型、超时和限额。当前某些数据格式仍由既有服务定义（例如复制与 Markdown 下载），不能把工具包装层理解成完整 Chrome downloads/clipboard API。

### 工具调用示例

```js
// 在已安装的 v2 Side Panel 工具内使用；不需要另一套扩展。
const menu = await OpenDeskSDK.browser.capabilities.getStatus({
  operation: 'browser.contextMenu.register'
});
if (!menu.callableNow) {
  // 在工具详情页由用户亲自开启菜单及网站范围
  OpenDeskTool.root.querySelector('#status').textContent = menu.reasonCode;
} else {
  await OpenDeskSDK.browser.contextMenu.register({actionIds:['capture-selection']});
}
const clicked = await OpenDeskSDK.browser.launch.consume(); // 只有当次菜单打开的工具可领取
// 此处展示 clicked.selection；是否持久保存仍由用户点击确认
```

```js
// 兼容旧层：不改变底层请求协议
await OpenDeskTool.request('browser.contextMenu.register',{actionIds:['capture-selection']});
await OpenDeskTool.request('storage.get',{key:'notes'});
// 旧 axiosx / AppStorage / AppLocal API 不应改变签名或错误合同。
```

### 已编写但不可执行的后续方法

| 拟议名称 | 参数/输入形态 | 当前阶段 | 原因 |
| --- | --- | --- | --- |
| `browser.tabs.open` | {url} | **PLANNED** | 禁止任意 tabId, 计划受控 tabRef |
| `browser.tabs.focus` | {tabRef} | **PLANNED** | 需要不可伪造引用 |
| `browser.sidePanel.openSelf` | {} | **PLANNED** | 真实用户手势可信前台 |
| `browser.network.request` | HTTP 请求合同 | **HOST_ONLY** | 已有 axiosx/Controller 主动请求，未对工具重映射 |
| `browser.network.observe.start` | {tabRef,origins,durationMs,...} | **PLANNED** | R2 被动 HTTP(S) 元数据 |
| `browser.network.observe.getStatus` | {observationId} | **PLANNED** | R2 |
| `browser.network.observe.stop` | {observationId} | **PLANNED** | R2 |
| `browser.network.observe.export` | {observationId,format} | **PLANNED** | R2 |
| `browser.events.read` | {sessionRef,cursor,limit} | **PLANNED** | R2 |
| `browser.events.close` | {sessionRef} | **PLANNED** | R2 |
| `browser.screenshot.captureVisible` | {tabRef} | **HOST_ONLY** | 现有 Controller 截图，未公开给工具 |
| `browser.media.recording.prepare` | 录屏显式选择 | **PLANNED** | R3 |
| `browser.media.recording.getStatus` | {recordingId} | **PLANNED** | R3 |
| `browser.media.recording.stop` | {recordingId} | **PLANNED** | R3 |
| `browser.media.recording.discard` | {recordingId} | **PLANNED** | R3 |
| `browser.speech.transcribe` | 音频资源引用 | **PLANNED** | R3 以上 |
| `browser.speech.speak` | {text,voiceRef} | **PLANNED** | R3 以上 |
| `browser.speech.stop` | {sessionRef} | **PLANNED** | R3 以上 |
| `browser.notifications.create` | 旧通知合同 | **NOT_EXPOSED** | 原 Page SDK createNotify，未对通用工具授权 |
| `browser.notifications.clear` | {notificationRef} | **NOT_EXPOSED** | 无通用工具实现 |
| `browser.operations.getStatus` | {operationId} | **PLANNED** | 仅有持久真实记录才开放 |
| `browser.operations.cancel` | {operationId} | **PLANNED** | 不得伪造取消成功 |

未实现项目只在目录中出现，不会作为可运行方法注册；未知执行请求必须返回 `E_SERVICE_UNSUPPORTED`。

## 三、能力状态合同

`getStatus({operation})` 为**只读**操作，不弹授权窗，也不在后台静默请求 Chrome 权限。典型字段：

```json
{
  "operation": "browser.contextMenu.register",
  "apiVersion": "1.0.0",
  "implementation": "implemented",
  "exposure": "allowed",
  "platform": "supported",
  "authorization": {"tool":"granted","browser":"missing","site":"granted"},
  "callableNow": false,
  "nextAction": "enable-in-tool-details",
  "reasonCode": "E_CHROME_PERMISSION_REQUIRED"
}
```

状态反映**当前可信调用身份**；`launch.consume` 没有待领票据时返回 `E_LAUNCH_UNAVAILABLE`，普通网页返回 `E_CONTEXT`。剪贴板属于前台浏览器 API，即便源代码有包装，也不在 SW 单独判定为 `callableNow=true`。权限可能在状态查询和调用之间变化，因此真正执行仍重复复核。

主要拒绝代码：`E_TOOL_DISABLED`、`E_SERVICE_UNSUPPORTED`、`E_SCHEMA`、`E_CONTEXT`、`E_TOOL_CAPABILITY_REQUIRED`、`E_CHROME_PERMISSION_REQUIRED`、`E_SITE_GRANT_REQUIRED`、`E_CHROME_UNSUPPORTED`、`E_LAUNCH_UNAVAILABLE`、`E_LAUNCH_EXPIRED`、`E_DOCUMENT_CHANGED`、`E_TOOL_CHANGED`、`E_OWNER`、`E_OUTCOME_UNKNOWN`、`E_LIMIT`。底层旧操作的原错误语义保持不变。

## 四、v2 菜单格式

v1 `opendesk.sidebar-tool.v1` 继续使用原严格字段；不会暗中开放新字段。`opendesk.sidebar-tool.v2` 新增 `requires.browserSdk` 和 `contributes.contextMenus`。菜单动作最多三项，contexts 仅 `page/selection/link`，handler 仅 `open-self`；当前实现接受明确 HTTP(S) host 的 `/*` 网站规则，不能包含通配 host、任意 JS 回调或后台代码。工具仍须包含原 id/version/title/description/capabilities/html/css/js。

真实配置与可导入 JSON：`examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json`。工具详情页在真实用户点击时请求可选 `contextMenus` 权限，批准**当前网站**后写入独立菜单偏好（非授权事实来源）；SW 依据已安装工具的实际完整包摘要、撤销状态、Chrome 可选权限及网站批准同步菜单。Chrome `contextMenus.onClicked` 不含 `documentId`。现在复用已存在的 `agents/page-relay.js` 可信 Content Script，只在浏览器产生的真实 `contextmenu` 事件里向可信 SW 发送**无正文、无选区、无 URL 参数的身份通知**；SW 读取 Chrome 提供的 `sender.tab.id/frameId/documentId/url`，在用户真正选择 OpenDesk 菜单后才核对这份提前观测的文档身份，并再次与 `webNavigation.getFrame` 的真实文档比较。Worker 恢复、来源信息缺失、同 URL 换文档、权限或启停撤销时一律不交付选区；启动工具 JavaScript 也会等待 `launch.bind` 回执后才执行。此机制仍需完整 Mac 原生菜单及竞争验收，不能把组件测试当作产品级 PASS。

## 五、待验收与源码合同的差异

- `node --test tests/environment/browser-sdk-r13.test.mjs` 提供合成 Chrome API 定向回归，**不能**证明 Chrome 真正渲染菜单、Service Worker 恢复或用户批准。
- `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 必须在同一最终源码候选上运行；项目主分支已批准 1 MiB 生产 SW 上限，安全扫描、固定入口/CSP/包完整性检查仍然必须通过。旧 320 KiB 构建失败属于历史 SHA，不再描述现行预算。
- 真实 Mac Chrome 的右键选区→Side Panel→自动打开工具→`launch.consume()`→用户保存、权限撤销、导航竞态、重启恢复均为验收门槛；未执行时标记 **NOT_TESTED**。
- R2 网络监听合同见 [后续网络观察方案](../framework/workstreams/browser-sdk-r13-20261011.md#r2-网络观察冻结合同)，全功能领域见 [Browser Capability Universe](browser-capability-universe.zh-CN.md)。


## 六、MV3 真实凭据与后续实际验收

菜单来源识别顺序：可信 ISOLATED Content Script 的真实 DOM `contextmenu`（**只发空内容身份事件**）→ Chrome `MessageSender.documentId` → SW 内存中不超过 60 秒的临时凭据 → 用户实际 Chrome `contextMenus.onClicked` → 首尾原生 `webNavigation.getFrame` 文档校验 → `chrome.storage.session` 单次票据 → Side Panel 可信绑定 → iframe 执行 → 用户自行点击保存。

这条预观察事件不保存正文、Cookie、请求、URL 查询参数或选区。新的页面访问不自动获得工具网站权限；仅 Chrome 菜单真实点击可以领取 16 KiB 内的选区。单工具最多一个待领上下文、有效期 60 秒；首次绑定之前不执行不可信工具 JS。主菜单开放但来源证据缺失时，仅能打开 OpenDesk 外壳，不能交付敏感文本。

开发者手动启动 [可导入的选区笔记示例](../../examples/sidebar-tools/browser-sdk-r13/README.zh-CN.md)，必须使用 HTTP(S) 测试页。真实 Mac Chrome GUI 菜单点击及权限弹窗仍需独立原始截图/日志；当前自动化真实 Chrome 证据仅覆盖 MV3 启动、事件注册和 Worker 停止/恢复，不得宣传为 native context-menu PASS。


### Chrome 网站访问与工具网站批准分别校验

菜单的实际可用性同时要求：

1. 已安装且**已启用**的 v2 工具、菜单动作声明和 SHA-256 包身份不变；
2. OpenDesk 工具内部保存的当前 Origin 范围明确批准；
3. Chrome 当前仍具有 `contextMenus` **和**目标 HTTP(S) Origin 的实际主机访问权限；
4. 用户真正点击 Chrome 原生菜单，且点击前已获得该同一文档的可信 documentId 来源证明；
5. Side Panel 当前工具实例、撤销代际、60 秒单次票据及原生文档校验均匹配。

网站 Chrome 权限被撤销时，既有菜单权限缓存不能代替真实 `chrome.permissions.contains({origins:[...]})`；即使工具仍保留旧站点设置，菜单同步与敏感选区绑定/领取也都要保守拒绝。预点击来源文档观察仅对当前已有生效菜单的已批准 Origin 进行，绝不记录选区、正文或完整 URL。
