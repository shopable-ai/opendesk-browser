# Cookie Import · 75 项 Browser SDK 跨世界核对（2026-10-17）

> 静态证据与现场证据分离。本表不是新 Registry、Host、SDK 或权限来源；它只整理现有审定 Catalog。基线源码包含本轮 `src/ui/sidebar-tools.js` 的请求预算修复，回归测试文件另列。活动 Mac Chrome 在本次执行环境中不可访问。

## 摘要

- 当前 GitHub 公开接口 75 个，一级 namespace 19 个，深层方法分组 22 个。现有 Registry→Facade 动态生成，静态缺失 0；另一个 `browser.network.watch` 是复用现有接口的便利方法，不是新的 RPC。
- 既有绑定 Catalog 共 77 项；Host-only `browser.history.searchTrusted`、`browser.permissions.requestForTool` 为独立可信服务，不应计为公开 SDK 缺失。
- 新版 `src/sidebar-tools/bridge.js` 静态安装 `OpenDeskSDK.browser`，可信 `src/ui/sidebar-tools.js` 进行工具身份、权限、文档和 Host 转发，MV3 `src/platform/chrome/context-menus.js` 经 `src/framework/sdk/browser-bindings.js` 使用审定绑定；这 **不能** 证明用户旧 iframe 加载了相同文件、Chrome 已允许或原生动作成功。
- **历史运行时已证实 1 项方法缺失**：某个活动沙箱中的 `browser.cookies.setMany`。源代码存在该方法，前次开发 CFT 的批量操作也曾成功；不能由此推断用户眼前的 Chrome 同 ID 更新或已安装 2.0.23 运行成功。
- **本轮静态核对新证实 1 项共性输入不一致（并已提交修复）**：Registry 使用 payload JSON UTF-8 字节上限，旧 Side Panel 用整条消息 UTF-16 字符长度上限且超限静默丢弃。合成 11,900-byte 合法 Cookie 批量请求会因封套多于 12,000 字符静默超时。新代码对每条已注册操作按 Registry 参数字节上限 + 512-byte 有界封套验收；超限必须有 `E_LIMIT` 回执。不改授权或 Host 语义。
- 所有工具 `requires.browserSdk:1.0.0` 声明是包级版本条件，并不证明现场 75 个方法都存在；六个工具不能据此计成六个故障。Cookie Editor 唯一正式包版本仍为 **2.0.23**，原有 `set` 逐条可信确认 fallback 不变。

## 75 项静态路由和现场诊断矩阵

代码 `S`：源码按同一 Registry/桥接路由接线（`SOURCE_WIRED`）；`C`：审定绑定 Catalog 中存在 Host 映射（不是实测）；`D`：声明输入/回执 Schema 和最大字节；`NT`：当前活动沙箱、Mac Chrome、权限、真实 Side Panel/Host 回执均 `NOT_TESTED`；`HM`：已有历史活动 iframe 缺方法的回报，**不是**当前现场 PASS/FAIL。请求/响应预算单位 byte。

| 公共方法 | Registry→Facade | Sandbox→Side Panel | Host 映射 | 参数/回执 | 当前 Chrome |
| --- | --- | --- | --- | --- | --- |
| `browser.bookmarks.create` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.createOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.get` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.getTree` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.move` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.observe.read` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.observe.start` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.observe.stop` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.prepareRemoveTree` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.remove` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.removeOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.removeTree` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.search` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.bookmarks.update` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.capabilities.getStatus` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.capabilities.list` | S | S | C:`CUSTOM` | D:12000/32000 | NT |
| `browser.clipboard.writeText` | S | S | C:`CUSTOM` | D:170000/12000 | NT |
| `browser.contextMenu.getStatus` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.contextMenu.register` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.contextMenu.unregister` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.clearSite` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.get` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.getAll` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.getAllPage` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.getCurrentStore` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.getPartitionKey` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.observe.getStatus` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.observe.read` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.observe.start` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.observe.stop` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.remove` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.set` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.cookies.setMany` | S | S | C:`CUSTOM` | D:12000/12000 | HM / NT |
| `browser.downloads.cancelOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.downloads.download` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.downloads.getOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.downloads.listOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.downloads.text` | S | S | C:`SCOPED` | D:170000/12000 | NT |
| `browser.events.close` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.events.read` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.i18n.detectLanguage` | S | S | C:`DIRECT` | D:12000/12000 | NT |
| `browser.i18n.getAcceptLanguages` | S | S | C:`DIRECT` | D:1024/8192 | NT |
| `browser.launch.consume` | S | S | C:`CUSTOM` | D:12000/65536 | NT |
| `browser.network.observe.export` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.network.observe.getStatus` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.network.observe.start` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.network.observe.stop` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.network.request` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.operations.cancel` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.operations.getStatus` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.page.getContext` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.page.getSelection` | S | S | C:`CUSTOM` | D:12000/65536 | NT |
| `browser.proxy.managed.getStatus` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.proxy.managed.requestDisable` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.proxy.managed.requestEnable` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.runtime.getPlatformInfo` | S | S | C:`DIRECT` | D:1024/1024 | NT |
| `browser.scheduler.cancelOwn` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.scheduler.create` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.scheduler.listOwn` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.screenshot.captureVisible` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.sidePanel.openSelf` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.storage.local.clear` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.storage.local.get` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.storage.local.getQuota` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.storage.local.keys` | S | S | C:`CUSTOM` | D:12000/12000 | NT |
| `browser.storage.local.remove` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.storage.local.set` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.activateOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.create` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.getOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.listOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.navigateOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.pinOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.reloadOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |
| `browser.tabs.removeOwned` | S | S | C:`SCOPED` | D:12000/12000 | NT |

## 身份与残余验收

1. 本次无用户 Mac Chrome 文件系统和 CFT/Profile 访问，不能读取实际已加载扩展 ID/路径、dev watcher、`dist/development` 构建指纹、installed record 的 2.0.23、Host documentId/instance 或活动 iframe 的方法类型。这些分别保持 `NOT_TESTED`；不能用源码或 GitHub HEAD 推断。
2. 用户 Mac 仅只读核对实际加载扩展目录、ID、Host instance、Sandbox frame、已安装 ID/version/packageHash/epoch，复用同 ID 更新，不卸载不清数据不改 Native 配对。先读活动 iframe `typeof OpenDeskSDK.browser.cookies.setMany` 和 `typeof ...cookies.set`。
3. 逐项采用无副作用的 `typeof` 与 `browser.capabilities.getStatus({operation})`，将运行时缺失、许可不足、site/document 上下文不匹配分开；不通过 75 次副作用 API 调用制造假通过。
4. 仅明确授权后使用虚构数据，完成一次 Cookie 文件/粘贴预览、单次确认、原生回读和拒绝路径。对 unknown/部分结果停止，绝不盲目重放；真实本地 Cookie 样本不得被读取或上传给本审计。
5. 本轮回归 `tests/environment/sidebar-tools-host.test.mjs` 新增合法 11,900-byte 消息、12 KB 超额、额外字段、UTF-8 多字节输入场景；独立合成预算判断已测试，仓库定向 Node/构建/原生 Mac Chrome 只有实际跑完才可写 PASS。之前已有的 249/249 是旧 2.0.23 业务修复结果，不能自动复用到本轮 Side Panel 源码变更。

证据链接：`src/ui/sidebar-tools.js`；`src/sidebar-tools/bridge.js`；`src/framework/sdk/browser.js`；`src/framework/sdk/browser-contract.js`；`src/framework/sdk/browser-bindings.js`；`src/platform/chrome/context-menus.js`；`docs/api/browser-sdk-binding-catalog.generated.json`；`docs/framework/workstreams/cookie-import-system-chrome-20261017.md`。
