# OpenDesk Browser SDK R1.3：公开接口与真实边界

> 2026-10-11；实现位置 `src/framework/sdk/browser.js`、`browser-contract.js`、`src/platform/chrome/context-menus.js`。**本页区分代码已接线与实机已验证：R1.3 Mac Chrome 当前为 NOT_TESTED。**

## 入口与四种运行环境

```text
OpenDeskSDK
├── ready / axiosx / AppStorage / AppLocal（原 Page SDK，保持兼容）
└── browser
    ├── capabilities.list / getStatus
    ├── contextMenu.getStatus / register / unregister
    ├── launch.consume
    ├── page.getContext / getSelection
    ├── clipboard.writeText / downloads.text
    └── tabs / sidePanel / network / screenshot / media / speech / events / operations（部分规划，禁止假调用）
```

- **Side Panel 的安装工具沙箱**：`OpenDeskTool.request(operation,args)` 为既有底层通道。新 `OpenDeskSDK.browser` 只做请求便捷封装，权限最终在可信 Side Panel 与 MV3 后台复核。
- **可信扩展模块**：使用既有安装器、Chrome Host 与原生 API；菜单用户开关通过固定 `BROWSER_HOST_PROTOCOL` 传递，并且核验实际 `ui/tool.html` 发送者。
- **普通 HTTP(S) 网页的 Page SDK**：可调用 `browser.capabilities.list/getStatus` 获取描述性的能力目录；菜单注册会以 `E_CONTEXT` 拒绝。不把菜单、网络观察或 Native 特权加入原 `ADMITTED_METHODS`。
- **Controller / RunHost**：继续使用既有 `page`、Locator、截图、网络、Cookie、HTTP 能力；**不是** Side Panel 工具的授权身份。

旧 `SDK_VERSION='1.0.0'`、生命周期 Symbol、`OpenDeskTool.root/request/setState`、`axiosx`、`AppStorage`、`AppLocal` 均未重命名。Browser API 的独立版本为 `1.0.0`。

## R1.3 公开接口合同（实际状态）

| 方法 | 参数 → 实际返回 | 权限与来源 | 状态/源码 |
| --- | --- | --- | --- |
| `browser.capabilities.list()` | 无 → 能力合同数组、每项可信状态（工具）/静态不可调用状态（网页） | 安装工具或 Page SDK 只读 | IMPLEMENTED；`browser.js` / Chrome Host |
| `browser.capabilities.getStatus({operation})` | 合法 `browser.*` 操作名 → `callableNow`、`authorization`、`nextAction`、`reasonCode` | 只读；**不触发** Chrome 权限申请 | IMPLEMENTED；同上 |
| `browser.contextMenu.getStatus()` | 无 → 已启用网站、动作、Chrome 授权状态 | 已安装 v2、`browser.contextMenu` | IMPLEMENTED；菜单 Host |
| `browser.contextMenu.register({actionIds})` | 1–3 个包内声明动作 → `registered,actionIds` | v2 菜单声明、当前网站已在工具详情明确批准、Chrome `contextMenus` 可选权限 | IMPLEMENTED；菜单 Host |
| `browser.contextMenu.unregister()` | 无 → `registered:false` | 已安装 v2 菜单工具 | IMPLEMENTED；菜单 Host |
| `browser.launch.consume()` | 无 → 一次性 `ticketId,toolId,actionId,source,selection,linkUrl,expiresAt` | 本次菜单指定工具实例、包摘要、撤销代际、有效期、原文档仍有效 | IMPLEMENTED；一次领取 |
| `browser.page.getSelection()` | 无 → 领取同一个一次性菜单上下文；**不能**读取任意页面选区 | 与 `launch.consume` 相同 | IMPLEMENTED（受限语义） |
| `browser.page.getContext()` | 无 → `{status,title,url}` 或不可用原因 | `currentPage.read`，原 `currentPage.info` | IMPLEMENTED；复用 Side Panel |
| `browser.clipboard.writeText(text)` | 文本 → `{copied:true}` | `user.export` + 原可信宿主 `clipboard.writeText` | IMPLEMENTED 便捷封装 |
| `browser.downloads.text({text,filename})` | Markdown 文本及安全文件名 → `{downloadId}` | `user.export` + 原 `file.download` | IMPLEMENTED 便捷封装 |

**以下不作为可调用接口交付**：`browser.tabs.open/focus`、`browser.sidePanel.openSelf`、`browser.notifications.create/clear`、`browser.downloads.getStatus`、`browser.operations.*`、`browser.network.observe.*`、`browser.events.*`、`browser.media.*`、`browser.speech.*`。它们只是能力宇宙/后续合同；Controller 已有能力不等于普通工具已开放。完整目录见 [能力矩阵](browser-capability-universe.zh-CN.md)。

## 状态及错误语义

```javascript
const status = await OpenDeskSDK.browser.capabilities.getStatus({
  operation: 'browser.contextMenu.register'
});
// status = {
//   operation, apiVersion, implementation, exposure, platform,
//   authorization:{tool,browser,site}, callableNow, reasonCode, nextAction
// }
if (!status.callableNow) console.log(status.reasonCode, status.nextAction);
```

不应自行拼写 `chrome.*` 或向浏览器后台发送伪造消息。常见拒绝：

| 错误码 | 解释 | 恢复 |
| --- | --- | --- |
| `E_CONTEXT` | 网页/当前环境不是安装工具的安全调用者 | 使用工具沙箱，不在网页权限范围内重试 |
| `E_SERVICE_UNSUPPORTED` | 未执行合同的方法、未知操作 | 检查能力状态；等待后续实现 |
| `E_SCHEMA` / `E_TOOL_SCHEMA` | 动作、参数、工具声明不合法 | 检查已安装包格式 |
| `E_TOOL_CAPABILITY_REQUIRED` | 未声明所需能力 | 更新工具包并重新批准 |
| `E_CHROME_PERMISSION_REQUIRED` | Chrome 可选菜单权限未批准或撤销 | 在工具详情由真实用户点击开启 |
| `E_SITE_GRANT_REQUIRED` | 尚未批准当前网站 | 在工具详情为当前网站启用 |
| `E_OWNER` | 非可信宿主、别的工具、错误窗口/实例 | 重新打开已安装工具 |
| `E_TOOL_CHANGED` | 版本/安装摘要/撤销代际不一致 | 重新审阅安装并主动开启 |
| `E_LAUNCH_EXPIRED` / `E_DOCUMENT_CHANGED` | 菜单上下文已领取、超时或文档更换 | 回目标网页重新右键 |
| `E_OUTCOME_UNKNOWN` | 持久化写入结果不能确认 | 只读检查原状态，不盲目重试有副作用操作 |

## v1 / v2 菜单声明

v1 工具包字段及严格校验不变。v2 新增 `requires.browserSdk='1.0.0'` 与 `contributes.contextMenus`。使用 `browser.contextMenu` 能力时必须声明 1–3 项，每项只允许 `actionId/title/contexts/documentUrlPatterns/handler`，上下文仅 `page/selection/link`，模式仅明确 HTTP(S) 主机根路径匹配（例如 `https://example.com/*`），handler 固定 `open-self`。禁止任意 JS 后台执行、宽泛 URL wildcard、跨工具动作和替换 Chrome 菜单。

```json
{
  "format": "opendesk.sidebar-tool.v2",
  "id": "selection-notes",
  "version": "1.0.0",
  "title": "选区笔记（Browser SDK R1.3）",
  "description": "用户确认后保存选区",
  "capabilities": ["storage.local","browser.contextMenu"],
  "html": "<main>...</main>",
  "css": "",
  "js": "/* classic JS ... */",
  "requires": {"browserSdk": "1.0.0"},
  "contributes": {"contextMenus": [{
    "actionId":"capture-selection",
    "title":"保存到选区笔记",
    "contexts":["selection"],
    "documentUrlPatterns":["https://example.com/*"],
    "handler":"open-self"
  }]}
}
```

此代码段中 `html/js` 为占位内容，**请直接导入真实完整文件** [selection-notes.opendesk-tool.json](../../examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json)。已有统一构建器 `scripts/build-sidebar-tool.mjs` 识别 v2 的 `tool.config.json` 及两个新增字段，官方 Catalog 继续验证真实发行包哈希与实际菜单声明；不可假定 v1 可以使用新增能力。

## 菜单生命周期及限制

- 仅在批准 Chrome `contextMenus` 后创建根 `opendesk.browser.root`、`opendesk.browser.open`，及满足每工具获准网站/动作的 `opendesk.tool.<toolId>.<actionId>`。
- 同一可信同步器重放期望菜单。不存在 Chrome 官方通用查询菜单 API；同步采用确定 ID、create 重复时报错再 update、移除旧的已知 ID；**禁止 Worker 每次启动 `removeAll()`**。
- 菜单点击的 `sidePanel.open()` 在真实用户手势回调内同步启动。后台再核验工具、菜单声明、站点、安装包摘要、撤销代际和 Chrome 实际帧文档。
- 启动上下文暂存于 `chrome.storage.session`，60 秒 TTL，最多 16 KiB 选区/64 KiB 完整记录，工具实例先绑定再消费；返回前先记录 `consumed`、清除选区，不默默保存任何数据。
- 工具卸载、升级、移除能力，清理该工具本机菜单授权；Chrome 撤权、标签导航、标签关闭使菜单失效或关闭正在等待的敏感上下文。**重复领取不等于重复执行。**
- **重要待关闭缺口**：Chrome `contextMenus.onClicked` 不附带点击瞬间的可信 `documentId`。目前二次帧核验 + 导航代际阻断常见竞争，但尚不能形式化证明同 URL、Worker 重启等极端竞争中必然绑定点击时文档。因此不可给 R1.3 安全和 Native 体验打“已验收 95 分”，应以真实 Chrome 和专门竞争测试核对。

## 开发者快速测试

```javascript
const menus = await OpenDeskSDK.browser.contextMenu.getStatus();
const launch = await OpenDeskSDK.browser.launch.consume();
if (launch.selection) {
  // 展示选区，并在用户主动点保存时调用原 OpenDeskTool.request('storage.set',...)
}
```

演示、Page SDK 拒绝示例及最短安装步骤见 [Browser SDK R1.3 完整样例](../../examples/sidebar-tools/browser-sdk-r13/README.zh-CN.md)。

本工作流的源代码与组件测试尚未在真实 Mac 本地构建/安装；对应结果为 **NOT_TESTED**，不是 PASS。