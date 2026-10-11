# R3 应用市场内部合同

以下都是扩展拥有的源码内部 API，不是公网 API。

官方源码登记为仓库根 `official-tools/catalog.json`；扩展内同名路径是构建生成的发行清单。`src/sidebar-tools/official-catalog.js` 读取、校验固定发行资源；`src/marketplace/catalog.js` 的 `officialMarketApps` 派生展示，`OFFICIAL_COLLECTIONS`、`getOfficialCollection` 管理固定套装，不再重复维护当前工具版本。完整字段见 [官方 Catalog](official-tools-catalog.zh-CN.md)。市场数据不授予安装或网站权限。

安装共享服务：src/ui/sidebar-tools/installation.js，导出 admittedSidebarToolPackages、sameSidebarToolPackage、compareToolVersions、getInstalledSidebarTools、installReviewedSidebarTool、reconcileMarketOperation。安装调用需传入 api、lockManager、candidate、baseline、reviewApproved=true；市场另传 marketId、sha256、operationId。原工具 registry 仍是唯一的已安装事实，市场来源映射只是辅助审计记录。回执未知不能自动重放。

扩展页路由：ui/marketplace.html#/apps/opendesk/reading-toc/versions/1.0.2，以及 #/collections/reading-kit/revisions/1、#/my。安装审阅只获取随包 JSON，校验发布清单中的 SHA-256，并调用原工具能力验证及安装服务。

迁移格式：opendesk.market.transfer.v1，字段严格限定为 format 和 apps，每项只能有 marketId、version，版本须与扩展内官方发行一致。未知字段、网络脚本、Token、Cookie、站点授权、Note 正文、Native 配对和路径都拒绝。导入仅选择待审阅应用。

公网到扩展的 onMessageExternal 仍为 NOT_IMPLEMENTED，未配置明确 Origin 时不得通过 ANY URL 接受安装意图。

## 批次协调 API（R3.1）

`src/marketplace/batch.js` 定义 `MARKET_BATCH_STORE`、`readMarketBatch`、`createMarketBatch`、`marketBatchUnresolved`、`reconcileQueuedAfterInterruption`、`withMarketBatchLock`。它只解析和序列化官方固定成员的状态与 operationId，不导入或执行包、不分发权限、不接触笔记正文或 Cookie。

`withMarketBatchLock` 使用 `navigator.locks.request('opendesk.market:batch',{ifAvailable:true},...)`；无法取得独占锁必须返回 `E_BATCH_ACTIVE`，不得在别的市场标签页重复派发。批次存在未决状态时须先恢复核对；`queued` 中断后变为 `interrupted`，`committing` 或 `outcome-unknown` 只读真实安装记录，不能自动重试。确认失败项可由用户重新预检形成新的操作 ID。

R4.5 的 `createMarketBatch(collection, rows, {releases})` 接收已校验 Catalog 派生的当前发行；只有版本匹配的 `ready` / `skip` 成员可进入新批次。`blocked` 行保存原套装的固定版本。历史 journal 只校验受限字段及 `opendesk/<toolId>` 身份语法，以便候选移除后仍能读取旧记录；历史身份不提供资源地址或安装权，恢复和提交仍须核对当前可信固定发行。


## 固定版本、来源和恢复

审核保存固定 release；单装和批装在提交时再次复核同一原始包，不能将缓存候选当作仍可用的发行资源。提交期间禁用确认与取消，避免宣称取消后实际仍安装。缺少旧来源记录的升级需明确确认来源替换；已有冲突来源拒绝，新增能力继续审阅。

`reading-kit` revision 1 固定引用 quick-notes v1.1.1。当前源码发行已到 v1.1.5，因此这个固定成员显示“当前扩展未提供此固定版本”，不能完成该 revision 的全部安装；其他可用成员仍按逐项预检结果处理。不得原地修改旧 revision 或用当前版本确认旧事务。用户可单独安装当前版本；更新套装须新增明确 revision。

恢复结果必须绑定操作记录中的 toolId、marketId、version 与规范化包字节 SHA-256。不同版本、同版本不同内容或缺少固定发行包都不能把旧未知事务标成成功。未知结果不会自动重试。安装数据库继续只有原工具 registry，Catalog 不存用户状态。
