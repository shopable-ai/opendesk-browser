# OpenDesk Browser R3 应用市场实施说明

2026-10-11。此处记录源码范围，不代表生产 Chrome 或 Mac Native 验收通过。

扩展内入口：Side Panel「工具」→「应用市场」，独立页面 ui/marketplace.html。详情支持固定版本、发布者、主要功能、权限、适用网站与运行位置。媒体现为明确标注的界面结构示意，不是正式截图或视频。

R4.5 的官方源码登记位于 `official-tools/catalog.json`，包含 reading-toc、web-markdown-clipper、quick-notes、markdown-workbench、knowledge-inbox 五个可选候选。版本、能力与代码来自 `examples/sidebar-tools/<id>/` 的经过校验配置及源码；`src/marketplace/catalog.js` 仅保留展示文案与不可变套装定义，不再重复维护发行版本或包路径。

`scripts/prepare-public.mjs` 调用统一官方构建器，复用现有打包器确定性生成 `dist/{production,development}/official-tools/catalog.json` 和 `official-tools/<id>/<id>.opendesk-tool.json`。构建验证器重新生成并逐字节核对；运行时使用同一可信 Catalog 校验包身份、标题、版本、能力、字节数和 SHA-256，提交审核时再次验证固定资源。详细合同见 [官方 Catalog 与发行资源](../api/official-tools-catalog.zh-CN.md)。不从公网目录下载或执行脚本。

Side Panel 既有导入和市场使用同一个 src/ui/sidebar-tools/installation.js 安装路径：原来的工具存储、同一 Web Lock、原能力与网站授权隔离、已有工具运行宿主。必须显式安装审阅，安装后不自动运行、无自动网页授权。市场额外存储最小来源记录和事务结果以核对来源冲突与断线未知，不能充当新的安装数据库或权限授予。

内置套装 reading-kit revision 1 固定三个工具版本；我的应用可多选并创建不覆盖旧 revision 的个人本地套装。预检后确认逐项安装，成功不回滚，取消只停止剩余项，未知结果先核对真实工具存储。纯数据迁移格式 opendesk.market.transfer.v1 只接收官方 marketId 和固定 version，绝不包含正文、站点授权、Cookie、Token、凭证、Native 配对、绝对路径或代码；导入只选择，不自动安装。

现阶段公网市场是可部署的静态详情/固定版本/套装/安装指导路径。未有正式 HTTPS 域名、稳定扩展 ID 和信任白名单之前，不启用 externally_connectable 或 onMessageExternal，不假装安装成功。网页的安装按钮指向正确的扩展内部安装指导而非浏览器特权操作。

尚需的内容：真实媒体；公网安装意图安全桥；跨设备用户自建套装持久托管；受支持的暂停底层合同；安装内容备份；真实 Chrome/ZIP/Mac 验收。以上不因设计评分而自动通过。

## R3.1：批次恢复可靠性补丁（待新候选验收）

新增 `src/marketplace/batch.js` 作为既有市场安装服务的轻量协调层，不增设 Runner、安装数据库或新权限。受限批次记录包含不可变 collection/revision、各成员版本、独立 operationId、状态与非敏感原因文本；未知、重复或包含脚本/授权的历史记录拒绝覆盖。

批量确认后使用同源 Web Lock `opendesk.market:batch`，同时只允许一个市场窗口提交或恢复。已有 queued / committing / outcome-unknown 批次必须先恢复，不能直接被新安装计划覆盖。断线后 queued 被标记 interrupted（从未派发，不自动安装），committing 与未知状态只通过原市场 operation journal + 实际安装 registry 核对；不能以没有回执推断失败，也不能自动重复执行。部分成功不会卸载已成功的工具，取消只处理剩余待派发成员。

新增 Node 边界测试和同一实际 Chrome Side Panel 场景中的固定 reading-kit（TOC 已装跳过、剪藏和笔记安装、重载后查询真实存储）。这些新增场景须以新 CI 候选日志为准，不能借用之前五款单独安装的 Chrome 回执。
