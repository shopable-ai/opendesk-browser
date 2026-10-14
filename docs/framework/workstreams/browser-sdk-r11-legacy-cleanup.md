# Browser SDK R11.1 — Legacy Route Cleanup / Evidence (2026-10-14)

**Owner:** R11.1；唯一写入分支 `main`。本次通过连接的 GitHub 直接写入仓库；无法读取用户 Mac 本地未提交工作区、Chrome Profile 或本机 watcher。其他 Agent 并行提交不属于此清理范围。

## 基线与实际提交

- 清理前直接父 SHA：`4b8ab986ed8cea2a194194ffadde117f04ff2639`。
- 生产源码改动 SHA：`1ab1aec36c5799ed328f5c55bbfbd0cbb712469f`（[`context-menus.js` Diff](https://github.com/shopable-ai/opendesk-browser/commit/1ab1aec36c5799ed328f5c55bbfbd0cbb712469f)）。
- 本记录所在的最新 `main` 提交以 GitHub 当前历史为准；本记录不声称远端 HEAD 不会被其他并行 Agent 更新。
- 修改源码：`src/platform/chrome/context-menus.js`，仅这一处生产文件。
- 已删除文件：**0**。没有创建 `legacy/`、`backup/` 或第二套 SDK。保留的 `docs/api/browser-sdk-compatibility-map.json`、`browser-sdk-native-mapping.json` 当前仍被 `tests/environment/browser-sdk-r7-mapping.test.mjs` 与现行执行手册引用；尚不能认定为无消费者的可删除文件。

## 可量化清理

- 原来直接进入有限 Binding 表：**10** 项；此次新增 **8** 项 Owned Tabs/Downloads 读取与本工具 Storage 操作，现为 **18** 项。
- 替代了原 Host 中 **4 处**分散路由判定/调用块：Storage clear、Storage get/set/remove、Downloads get/list、Tabs get/list；合并到现有 `createApprovedBrowserBindings` 和单个 `dispatchScoped` 入口，不添加新的 Registry 或 Host Router。
- GitHub `compare_commits(4b8ab986ed8cea2a194194ffadde117f04ff2639...1ab1aec36c5799ed328f5c55bbfbd0cbb712469f)`：生产源码 **新增 25 行、删除 30 行、净减少 5 行**；被删除的 30 行不全是重复代码，因此不得把它们全部称为“30 行重复代码”。
- 测试源码：**+0 / -0 / 净 0 行**；现有回归测试保留。文档：新增本报告 **119 行**，不混入生产代码净减量。
- Catalog `SCOPED=37`、`CUSTOM=16`、`DENIED=2` 是声明性分类，而**不是**实际 Binding 命中数。18 个 Binding + 19 个保留的 SCOPED_SPECIAL + 16 个 CUSTOM + 2 个 HOST_ONLY = 55 项。
- 公开 Registry 53 项、Host-only 2 项，与生成目录一致；**数量吻合不代表 55 项全部真实 Chrome 验收。**

## 55 项合同逐项路由检查

`BINDING` 为已接入有限可信表；`SCOPED_SPECIAL` / `CUSTOM` 为仍需特定运行语义的唯一现存业务路径，**不声称已改成通用 Binding**；`HOST_ONLY` 不能从安装工具 SDK 调用。所有 SOURCE 级判断都不替代 Chrome Native PASS。

| Operation | Catalog mode | 目前可信路由分类 | 既有服务 / Driver |
| --- | --- | --- | --- |
| `browser.bookmarks.create` | SCOPED | BINDING | `chrome/bookmarks.js` |
| `browser.bookmarks.removeOwned` | SCOPED | BINDING | `chrome/bookmarks.js` |
| `browser.capabilities.getStatus` | CUSTOM | CUSTOM | `Browser Host discovery` |
| `browser.capabilities.list` | CUSTOM | CUSTOM | `Browser Host discovery` |
| `browser.clipboard.writeText` | CUSTOM | CUSTOM | `trusted tool UI export` |
| `browser.contextMenu.getStatus` | SCOPED | SCOPED_SPECIAL | `chrome/context-menus.js` |
| `browser.contextMenu.register` | SCOPED | SCOPED_SPECIAL | `chrome/context-menus.js` |
| `browser.contextMenu.unregister` | SCOPED | SCOPED_SPECIAL | `chrome/context-menus.js` |
| `browser.cookies.clearSite` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.get` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.getAll` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.getCurrentStore` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.getPartitionKey` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.observe.getStatus` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.observe.read` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.observe.start` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.observe.stop` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.remove` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.cookies.set` | SCOPED | SCOPED_SPECIAL | `chrome/browser-cookie-host.js` |
| `browser.downloads.cancelOwned` | SCOPED | BINDING | `chrome/browser-downloads.js` |
| `browser.downloads.download` | SCOPED | BINDING | `chrome/browser-downloads.js` |
| `browser.downloads.getOwned` | SCOPED | BINDING | `chrome/browser-downloads.js` |
| `browser.downloads.listOwned` | SCOPED | BINDING | `chrome/browser-downloads.js` |
| `browser.downloads.text` | SCOPED | SCOPED_SPECIAL | `ui/sidebar-tools.js` |
| `browser.events.close` | CUSTOM | CUSTOM | `chrome/browser-network-observe.js` |
| `browser.events.read` | CUSTOM | CUSTOM | `chrome/browser-network-observe.js` |
| `browser.history.searchTrusted` | DENIED | HOST_ONLY | `chrome/history.js (trusted only)` |
| `browser.launch.consume` | CUSTOM | CUSTOM | `chrome/context-menus.js` |
| `browser.network.observe.export` | CUSTOM | CUSTOM | `chrome/browser-network-observe.js` |
| `browser.network.observe.getStatus` | CUSTOM | CUSTOM | `chrome/browser-network-observe.js` |
| `browser.network.observe.start` | CUSTOM | CUSTOM | `chrome/browser-network-observe.js` |
| `browser.network.observe.stop` | CUSTOM | CUSTOM | `chrome/browser-network-observe.js` |
| `browser.network.request` | CUSTOM | CUSTOM | `existing createNetworkService` |
| `browser.operations.cancel` | SCOPED | SCOPED_SPECIAL | `chrome/browser-network-observe.js` |
| `browser.operations.getStatus` | SCOPED | SCOPED_SPECIAL | `chrome/browser-network-observe.js` |
| `browser.page.getContext` | CUSTOM | CUSTOM | `trusted UI current-page bridge` |
| `browser.page.getSelection` | CUSTOM | CUSTOM | `chrome/context-menus.js` |
| `browser.permissions.requestForTool` | DENIED | HOST_ONLY | `chrome/permission-gate.js (trusted only)` |
| `browser.scheduler.cancelOwn` | CUSTOM | CUSTOM | `existing scheduleService` |
| `browser.scheduler.create` | CUSTOM | CUSTOM | `existing scheduleService` |
| `browser.scheduler.listOwn` | CUSTOM | CUSTOM | `existing scheduleService` |
| `browser.screenshot.captureVisible` | SCOPED | SCOPED_SPECIAL | `chrome/browser-screenshot*.js` |
| `browser.sidePanel.openSelf` | SCOPED | SCOPED_SPECIAL | `chrome/browser-side-panel.js` |
| `browser.storage.local.clear` | SCOPED | BINDING | `ui/sidebar-tools/storage-state.js` |
| `browser.storage.local.get` | SCOPED | BINDING | `ui/sidebar-tools/storage-state.js` |
| `browser.storage.local.remove` | SCOPED | BINDING | `ui/sidebar-tools/storage-state.js` |
| `browser.storage.local.set` | SCOPED | BINDING | `ui/sidebar-tools/storage-state.js` |
| `browser.tabs.activateOwned` | SCOPED | BINDING | `chrome/browser-tabs.js` |
| `browser.tabs.create` | SCOPED | BINDING | `chrome/browser-tabs.js` |
| `browser.tabs.getOwned` | SCOPED | BINDING | `chrome/browser-tabs.js` |
| `browser.tabs.listOwned` | SCOPED | BINDING | `chrome/browser-tabs.js` |
| `browser.tabs.navigateOwned` | SCOPED | BINDING | `chrome/browser-tabs.js` |
| `browser.tabs.pinOwned` | SCOPED | BINDING | `chrome/browser-tabs.js` |
| `browser.tabs.reloadOwned` | SCOPED | BINDING | `chrome/browser-tabs.js` |
| `browser.tabs.removeOwned` | SCOPED | BINDING | `chrome/browser-tabs.js` |

## KEEP：不可删除的授权与 Driver

- `src/framework/sdk/browser.js`：唯一 Registry 派生的公开 Facade；`browser-contract.js`、`browser-schemas.js`：权限/参数合同；`browser-bindings.js`：有限受控 Binding。
- `context-menus.js`：Chrome Sender/Document/Origin、安装身份、`packageHash`、`installEpoch`、Web Lock、一次性意图及撤权检查均保留；新增未获可信点击的 `requiresUserGesture` Binding 明确拒绝。
- `browser-tabs.js`、`browser-downloads.js`、`bookmarks.js`、`sidebar-tools/storage-state.js`：持有的 TabRef/DownloadRef/BookmarkRef、命名空间隔离、Driver 级 Origin 二次校验/持久化确认保留。
- `browser-cookie-host.js`：Cookie Store、Partition、Values 单独授权；`browser-network-observe.js`：观察会话所有权和撤销；`browser-screenshot*.js`：真实文档和资源交接；History、Scheduler 和 `permission-gate.js` 保留专用入口。
- 本次没有做破坏性迁移：既有多段授权校验绝不能仅为减少代码行数而删去。

## 可复核验证结果及限制

- **GitHub CI SOURCE/Node:** [Browser SDK R5 implementation contracts](https://github.com/shopable-ai/opendesk-browser/actions/runs/38591222894) 在源码 SHA `1ab1aec36c5799ed328f5c55bbfbd0cbb712469f` 上成功；涵盖公开 SDK、Host/Schema/接口矩阵、源码检查。
- **GitHub CI SOURCE/Node:** [Browser SDK targeted main verification](https://github.com/shopable-ai/opendesk-browser/actions/runs/38591222899) 在相同源码 SHA 上成功；涵盖 R11 Binding、Facade、Catalog、授权、SDK/工具回归。
- **GitHub CI Build:** R5 与 targeted 的 jobs 含 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 等步骤，已按对应 workflow SUCCESS 标记通过。
- **本地独立全量 `npm test`: NOT_TESTED。** CI 执行了其声明的定向 Node suites，但没有在用户 Mac 环境执行完整 `npm test` 命令。
- **真实 Mac Chrome/工具安装/拒绝/卸载/撤权/Worker 重启：NOT_TESTED。** GitHub mock、源码审查和 Linux build 均不得冒充真实 Chrome PASS。
- 本次只验证一个实际变更文件的 diff 与相关自动化，**未证明其他原有 CUSTOM/SCOPED_SPECIAL 路由可以安全删除**。

## 逐维专家初评（证据性、非正式 95+ 验收）

| 维度 | 当前初评分 /100 | 缺口 |
| --- | ---: | --- |
| 架构一致性 | 85 | Registry 唯一；仍有合理专用 Host 路由需长期约束 |
| 重复代码清理 | 70 | 8 项路径收敛，仅生产净减 5 行；尚未证明其余死代码 |
| SDK 声明式程度 | 79 | 53 项 Facade 声明式，18/37 SCOPED 使用 Binding |
| Host 安全隔离 | 87 | 静态安全栅栏和 Node 回归保持；缺少同候选 Chrome 恶意输入实测 |
| API 兼容与消费者迁移 | 83 | 53/2 合同无漂移；独立工具真实调用未复验 |
| 测试覆盖 | 76 | 两项 SDK CI 成功；缺少本地全量 npm test、Mac 原生与断电恢复 |
| 可维护性与扩展成本 | 81 | Storage 复用单个静态方法表，其他专用路由仍多 |
| 真实产品完成度 | 55 | 无用户 Mac 同候选安装与 Chrome 原生接受证据 |

以上是**保守的源码/CI 初评**，不是 95+ 产品验收证明。不得凭平均分关闭本轮；在 Mac 实机、完整回归及例外路由审计前，R11.1 仍为 `PARTIAL / NATIVE_NOT_TESTED`。

## 下一步验收门槛

以生产源码 SHA `1ab1aec36c5799ed328f5c55bbfbd0cbb712469f` 为对象，在用户正常 `dist/development` + 已存在 watcher 环境执行完整 `npm test`，隔离候选完成 Chrome 用户真实点击授权/拒绝/撤权/卸载/Worker 重启及副作用 UNKNOWN 验证；如有缺陷仅改相应文件并重新绑定新的源码/构建 SHA。没有真实消费者和安全等效证据前，不删除 Cookie、History、Scheduler、网络观察或 R7 历史映射资料。
