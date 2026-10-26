# OpenDesk Browser R6.1 — 网页发现安装入口

本文件是网页发现合同和用户操作说明，不是新的安装协议或远程包仓库。只允许在 **main** 的真实正式业务源码中实施；外部网站永远不能批准应用权限。

## 一、开发用户路径

1. 按现有 R5 开发通道构建扩展与网站，以真正生成的 `dist/app-market-public/catalog.json` 核对 Markdown 工作台发行版本和包摘要（源码 `examples/sidebar-tools/markdown-workbench/tool.config.json` 当前写有 `1.0.5`，但实际以本次构建的发行目录为准）。
2. 打开 `http://127.0.0.1:43132/`，首页真实官方卡片有「安装到 OpenDesk」按钮。点击后，网页以已有 `opendesk.market.intent.v1` 的 `OPEN_INSTALL_REVIEW` 请求固定 `marketId + version`。
3. OpenDesk 在已有后台路径校验受控 origin、tab/document/sender；在 `ui/marketplace.html?intent=...` 打开可信审阅。**网页“已打开审阅”不表示安装成功**。
4. 用户在扩展可信页核对固定发行和所需能力、确认安装。**真正安装仍由 `installReviewedSidebarTool` 和原有 Installed Authority 负责**；然后从「扩展」中心看到已安装工具，打开 Markdown 工作台编辑/预览，复制或下载。
5. 取消审阅或连接失败时不会偷偷安装；重复点击保留同一固定应用的交接身份，不创建第二套 installer。

## 二、唯一网页发现声明 v1

发现合同：`opendesk.market.discovery.v1`。当前只支持顶层 HTML 的**一条** link 声明：

```html
<link rel="opendesk-install" href="http://127.0.0.1:43132/install/opendesk/markdown-workbench/versions/1.0.5/">
```

这是开发通道示例 URL，部署时必须替换为**当前正式构建通道中实际允许的 HTTPS Origin 和固定发行版本**；即使声明存在，仍以扩展内完整官方发行 Catalog 核验为准。普通网页本身不会获得 OpenDesk 外部消息特权。

用户在普通网页保持顶层活动标签，打开 OpenDesk 侧边栏「扩展」→ 更多 →「检测当前网页可安装应用」；扩展在**用户主动点击时**使用现有 `currentPageTarget.capture/revalidate` 锁定所属窗口活动 tab/document，通过 `chrome.scripting.executeScript` 的 `ISOLATED` 世界只读 `link` 的 `rel`/`href`。若唯一声明指向**当前通道配置允许的**固定官方 Sidebar App 发行，则展示应用和版本，点击「打开可信审阅」进入扩展自己的固定版本详情，再由用户选择审阅安装。发现时没有安装、下载或授权。

声明不支持 Page Program 自动转换、第三方任意包、脚本源、参数批准、安装清单读取、后台全站扫描、系统 URI handler。生产通道不完整时明确拒绝启用；开发 HTTP 仅受控 Loopback Origin（含端口）。

## 三、安全边界与故障恢复

- 外部 HTTP(S) link 只能是一个线索。校验真实 `Origin`、固定发行路径、精确 `marketId + semver` 和内置 Catalog；不接收可执行代码、查询参数、片段或网站批准标志。
- 在扫描后重新验证 top frame `tabId/documentId/url`；导航、换页或多声明后需主动重新检测，不能依旧结果操作。
- R5 外部消息只允许受控市场站点直接使用，普通网页调用扩展自己的主动只读发现能力。
- 任意安装、更新、卸载及来源校验继续归属现有 Host/Installer/Authority；不会因网页声明扩大原 SDK 权限或自动授予网站权限。
- 若版本不存在、来源不符、权限拒绝、连接失败或安装结果未知，保留可观察的失败状态并允许用户重新核对，不能宣称成功或直接盲目重放。

## 四、验证与证据

- 组件：`node --test tests/environment/market-page-discovery-r61.test.mjs tests/environment/market-site-client-r5.test.mjs tests/environment/app-market-r5.test.mjs`
- 真正的构建：`npm run build:dev`、`npm run build:market-site`、`npm run check`。
- 已有端到端：`.github/workflows/app-market-r3.yml` 的真实 HTTP 网站 + 扩展内审阅 + 真实安装 + Markdown 工具验证；已在原 `tests/helpers/app-market-r5-native.mjs` 增加**首页按钮首次安装路径**，不重新建设浏览器测试。
- 交互 HTML：公网页面由 `scripts/build-market-site.mjs` 直接从 `src/market-site/templates.mjs` 和 `src/market-site/client.js` 生成 `dist/app-market-public/index.html`。扩展中心 React 页面仍由既有预览 `scripts/preview/build-sidebar-six-react-preview.mjs` 和现有源码驱动，不存在新的假交互 HTML。
- 组件测试仅是组件证据，GitHub CI 的构建/真 Chrome 才能提升验证等级；用户本机的 Mac Chrome 安装启停与打开使用，**未真正运行时必须记为 LOCAL_CHROME_NOT_TESTED**。

## 五、后续（非 R6.1）

正式第三方发行和无需更新 OpenDesk Browser 即安装全新远程扩展，需要单独设计发行包获取、签名/来源证明、准入审查、审阅、回滚和隔离，不得借这次 HTTP 市场入口假称已完成开放式远程分发。
