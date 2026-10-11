# OpenDesk Browser R3 应用市场实施说明

2026-10-11。此处记录源码范围，不代表生产 Chrome 或 Mac Native 验收通过。

扩展内入口：Side Panel「工具」→「应用市场」，独立页面 ui/marketplace.html。详情支持固定版本、发布者、主要功能、权限、适用网站与运行位置。媒体现为明确标注的界面结构示意，不是正式截图或视频。

官方发行数据为 src/marketplace/catalog.js。真实包位于 src/sidebar-tools，版本分别为 reading-toc 1.0.2、web-markdown-clipper 1.0.0、quick-notes 1.1.1、markdown-workbench 1.0.0、knowledge-inbox 1.0.0。网页笔记和 Markdown 工作台包从已经存在的 examples/sidebar-tools 的同版本编译产物纳入发布；它们的真实 Chrome 验收必须另做。

scripts/prepare-public.mjs 计算所有官方 JSON 的 SHA-256，输出 market/catalog.json；构建验证器再校验包身份、标题、版本、能力和 SHA-256。页面安装前也检查固定哈希及 validateSidebarToolPackage。绝不从公网目录下载和执行脚本。

Side Panel 既有导入和市场使用同一个 src/ui/sidebar-tools/installation.js 安装路径：原来的工具存储、同一 Web Lock、原能力与网站授权隔离、已有工具运行宿主。必须显式安装审阅，安装后不自动运行、无自动网页授权。市场额外存储最小来源记录和事务结果以核对来源冲突与断线未知，不能充当新的安装数据库或权限授予。

内置套装 reading-kit revision 1 固定三个工具版本；我的应用可多选并创建不覆盖旧 revision 的个人本地套装。预检后确认逐项安装，成功不回滚，取消只停止剩余项，未知结果先核对真实工具存储。纯数据迁移格式 opendesk.market.transfer.v1 只接收官方 marketId 和固定 version，绝不包含正文、站点授权、Cookie、Token、凭证、Native 配对、绝对路径或代码；导入只选择，不自动安装。

现阶段公网市场是可部署的静态详情/固定版本/套装/安装指导路径。未有正式 HTTPS 域名、稳定扩展 ID 和信任白名单之前，不启用 externally_connectable 或 onMessageExternal，不假装安装成功。网页的安装按钮指向正确的扩展内部安装指导而非浏览器特权操作。

尚需的内容：真实媒体；公网安装意图安全桥；跨设备用户自建套装持久托管；受支持的暂停底层合同；安装内容备份；真实 Chrome/ZIP/Mac 验收。以上不因设计评分而自动通过。
