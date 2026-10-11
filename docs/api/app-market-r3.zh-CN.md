# R3 应用市场内部合同

以下都是扩展拥有的源码内部 API，不是公网 API。

发行目录：src/marketplace/catalog.js，导出 OFFICIAL_APPS、OFFICIAL_COLLECTIONS、getOfficialApp、getOfficialCollection、officialPackagePath。市场数据不授予权限，包身份由原工具包校验器再次确认。

安装共享服务：src/ui/sidebar-tools/installation.js，导出 admittedSidebarToolPackages、sameSidebarToolPackage、compareToolVersions、getInstalledSidebarTools、installReviewedSidebarTool、reconcileMarketOperation。安装调用需传入 api、lockManager、candidate、baseline、reviewApproved=true；市场另传 marketId、sha256、operationId。原工具 registry 仍是唯一的已安装事实，市场来源映射只是辅助审计记录。回执未知不能自动重放。

扩展页路由：ui/marketplace.html#/apps/opendesk/reading-toc/versions/1.0.2，以及 #/collections/reading-kit/revisions/1、#/my。安装审阅只获取随包 JSON，校验发布清单中的 SHA-256，并调用原工具能力验证及安装服务。

迁移格式：opendesk.market.transfer.v1，字段严格限定为 format 和 apps，每项只能有 marketId、version，版本须与扩展内官方发行一致。未知字段、网络脚本、Token、Cookie、站点授权、Note 正文、Native 配对和路径都拒绝。导入仅选择待审阅应用。

公网到扩展的 onMessageExternal 仍为 NOT_IMPLEMENTED，未配置明确 Origin 时不得通过 ANY URL 接受安装意图。

## 批次协调 API（R3.1）

`src/marketplace/batch.js` 定义 `MARKET_BATCH_STORE`、`readMarketBatch`、`createMarketBatch`、`marketBatchUnresolved`、`reconcileQueuedAfterInterruption`、`withMarketBatchLock`。它只解析和序列化官方固定成员的状态与 operationId，不导入或执行包、不分发权限、不接触笔记正文或 Cookie。

`withMarketBatchLock` 使用 `navigator.locks.request('opendesk.market:batch',{ifAvailable:true},...)`；无法取得独占锁必须返回 `E_BATCH_ACTIVE`，不得在别的市场标签页重复派发。批次存在未决状态时须先恢复核对；`queued` 中断后变为 `interrupted`，`committing` 或 `outcome-unknown` 只读真实安装记录，不能自动重试。确认失败项可由用户重新预检形成新的操作 ID。
