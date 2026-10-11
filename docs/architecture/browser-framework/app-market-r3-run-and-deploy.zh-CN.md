# R3 市场运行、构建和部署

## 扩展内安装（用户不运行 localhost）

在仓库根目录执行：npm ci --ignore-scripts --no-audit --no-fund；npm run check；npm test；npm run build；npm run build:dev；npm run verify；npm run pack。构建并安装 dist/production：chrome://extensions → 开发者模式 → 加载已解压的扩展程序。记录实际扩展 ID，再从 Side Panel「工具」点击「应用市场」，打开已随包交付的固定版本详情、审阅能力、确认安装、我的应用并主动打开使用。

扩展入口为 chrome-extension://<实际扩展 ID>/ui/marketplace.html 。不用 localhost，也不会加载远程 JavaScript。源码变更后须使用新 dist/ZIP 候选与新包哈希，旧 Chrome receipt 不自动适用。

## 原型预览（不是安装）

python3 -m http.server 43131 --bind 127.0.0.1 --directory prototypes/marketplace

浏览 http://127.0.0.1:43131/app-market-r2.html 只能评审演示原型，不验证真实 Chrome 安装、权限或站点运行。

## 公网静态站（展示和分享）

npm run build:market-site
python3 -m http.server 43132 --bind 127.0.0.1 --directory dist/app-market-public

可访问 /、/apps/opendesk/reading-toc/、/apps/opendesk/reading-toc/versions/1.0.2/、/install/opendesk/reading-toc/versions/1.0.2/、/collections/reading-kit/revisions/1/ 等路径。每个目录独立拥有 index.html，支持 HTTPS CDN/静态站直接访问与刷新，网站不需要常驻本地服务器。

域名确定后，使用环境变量 OPENDESK_MARKET_SITE_ORIGIN=https://<正式域名> 执行 npm run build:market-site，将产生 canonical/OG URL 与 sitemap。此变量只属于展示部署配置，不会自动修改扩展 manifest、开放信任 Origin 或创建已上线链接。域名、证书与正式 Chrome Web Store 地址尚未提供，不能编造。

公网安装按钮目前转到明确的扩展内安装指导，不会通过网页直接触发安装。要实现外部意图必须经过受信任 HTTPS Origin、正式扩展 ID、manifest allowlist、sender 验证、严格定长数据协议、仅打开扩展自己的审核页以及已有安装器。域名未定时有意不添加 externally_connectable。

本任务不抢占 Mac Chrome Profile/固定端口/原生设备。新候选需定向验收正常和坏包、重复/版本差异、更新数据、卸载/权限撤销、批量部分失败、丢回执恢复，并记录 source SHA、packageHash、Chrome 版本/ID。

## 批量安装与恢复验证（R3.1）

单个 batch 通过 `opendesk.market:batch` Web Lock 在同一 Chrome 扩展 Origin 下排斥并发安装/恢复。进度仍存于原市场已有的 `opendesk.market.batch.v1`，成员执行仍只使用既有 `installReviewedSidebarTool`。重载中断时不重放：已派发/结果未知先比对持久 operation 与原实际安装 registry；未派发标记中断并重新预检。所有数据都限制为安装元数据，不包含代码、网站授权或用户内容。

Node 定向检查：`node --test tests/environment/app-market-r3.test.mjs tests/environment/app-market-batch-r3.test.mjs`。真实生产 Chrome：`node --test tests/framework/app-market-r3-native.test.mjs`，前提是当前候选 dist/production 与独立 Chrome for Testing 环境；此测试覆盖固定官方套装“已安装跳过 + 两项新增”，持久批次及页面重载核对。取消中途、网络中断和恶意持久记录仍需要专门负向浏览器验收；不能把组件测试升级为原生通过。
