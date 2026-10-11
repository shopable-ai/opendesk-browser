# OpenDesk 应用市场 R2.1 —— 运行位置、域名部署、本地预览和可信安装决策

日期：2026-10-11。状态：**已确认设计与文档，不代表公网市场、跨页面安装桥或正式市场安装代码已经上线**。

本决策延续 [R2 市场需求](../../product/app-market-r2.zh-CN.md)、[R2 交互原型](../../../prototypes/marketplace/app-market-r2.html)及现有 [工具市场安装合同](../../product/sidebar-tool-market-compat-r41.zh-CN.md)。实施前以最新 main 源码、AGENTS.md、testing-guide 和相关工作流为准；原有 Sidebar 工具、Page Program、Task、RunHost 与权限边界均保留。

## 1. 结论：双入口市场，不增加用户常驻本地服务器

**正式用户不需运行 localhost HTTP 服务。**

| 模式 | URL / 交付位置 | 核心责任 | 是否可以直接安装工具 |
| --- | --- | --- | --- |
| 交互原型 | http://127.0.0.1:43131/app-market-r2.html#/apps/opendesk/reading-toc | 设计预览、分享/安装状态模拟 | 否。只改演示内存 |
| 扩展内市场（P0） | chrome-extension://<安装后的实际扩展ID>/ui/marketplace.html | 浏览内置目录、审查能力、安装、版本及套装管理 | **可以**，但仅经已有可信安装器、用户确认；此入口尚待实施 |
| 公网市场（P1） | 用户最终确认的 HTTPS 域名，例如 https://market.opendesk.example（**保留示例域名，未部署**） | 公开详情、图片/短演示、搜索、SEO、分享、作者说明 | 不能静默安装；只向扩展提交有限的“打开安装确认”意图 |
| Native 工作区（按需） | 已连接且授权的本地 OpenDesk 程序 | 指定目录保存、文件读写等特权能力 | 与市场安装无直接依赖；非本地内容工具不需要它 |

用户所谓的“本地虚拟服务器”只用于 **HTML 开发预览**；它不是服务插件安装、信任校验或正式运行的后台。扩展自有页面与 service worker 自己在 Chrome 中运行，不依赖 Python、Node 或 127.0.0.1 常驻进程。不要用 localhost 网关当作默认分发或授权通道。

## 2. 三条用户流程

### A. 本机开发者看原型（现在可操作）

在仓库根目录：

~~~sh
python3 -m http.server 43131 --bind 127.0.0.1 --directory prototypes/marketplace
~~~

Chrome 打开 http://127.0.0.1:43131/app-market-r2.html#/apps/opendesk/reading-toc 。
可试详情、媒体示意、链接/套装、预检、部分成功、恢复以及“运行与部署”帮助。修改原型 HTML 后刷新即可；不需 WXT 构建或 Chrome 扩展安装。若端口被使用，换一个未占用的本地端口；不占用已有 43111 演示页面或 43119 WXT 开发服务。

**这个预览不能验证 Chrome 权限对话框、真实扩展包、安全交接、Native 和磁盘实际结果。** 页面内的 market.opendesk.example URL 也是占位示例，不能拿它进行真实网页安装验收。

### B. 已装主扩展：在 OpenDesk 内安装工具（P0 第一闭环）

OpenDesk Side Panel「工具」→「应用市场」→ 选择指定 app/release → 详情 → 安装 → 宿主读取本扩展版本内的已登记工具包 → validateSidebarToolPackage → reviewCandidate → 用户确认 → install → 从真实安装记录读取结果 → 主动使用/按站点授权。

- 目录元数据、可执行包、安装事实必须分开。**应用介绍和市场来源不能直接授予能力**。
- 不新建第二套 RunHost、包验证器或权限数据库。安装不自动运行，站点授权要按已有精确 Origin 合同。
- R2 原型里演示的安装按钮目前不是产品功能；正式入口尚未接线，不可直接宣称可用。
- 首版先接当前已存在且确认发行资源的 Sidebar 工具；Task/Page 仍走自身 Verification → Available 准入及结果合同。
- “已安装但无目标网站授权”“本地包未包含指定版本”“超额”“结果未知”均应显示准确原因与下一步。

### C. 分享到微信/博客/公司网站：公网直接到指定应用（P1）

用户打开 HTTPS 公网详情，例如（**均为路由示例，不是已部署网址**）：

~~~text
https://market.opendesk.example/apps/opendesk/reading-toc
https://market.opendesk.example/apps/opendesk/reading-toc/versions/1.0.2
https://market.opendesk.example/install/opendesk/reading-toc?version=1.0.2
https://market.opendesk.example/collections/reading-kit/revisions/1
https://market.opendesk.example/install/collections/reading-kit/revisions/1
~~~

公网“在 OpenDesk 中安装”按钮只向已授权的主扩展申请**打开扩展自有的确认界面**，绝不在网站内触发沙箱脚本、宿主 API、权限提升或实际安装。扩展不存在/不能通信时只展示无法确认连接的原因和官方安装主扩展引导；不能把超时直接断言为“未安装”。

Chrome 旧的 chrome.webstore.install() 网页内安装主扩展 API 已弃用；真正安装 OpenDesk 浏览器扩展请使用**核对后的官方 Chrome Web Store 条目**，开发时在 chrome://extensions 手工“加载已解压的扩展程序”。未核实 Web Store 发布页前不要编造具体地址。

## 3. 两种市场部署的代码分工

~~~text
同一份规范化的官方应用目录 / 固定版本与媒体元数据
  ├── OpenDesk 扩展内市场（可信执行端）
  │    ├── 本地离线可浏览内置目录与已装应用
  │    ├── 查找安装包、版本差异、权限审查
  │    └── 现有安装/授权/运行/卸载服务
  │
  └── 公网静态 HTTPS 市场（展示与发现端）
       ├── 应用与套装永久链接、社交分享、媒体与说明
       ├── 静态 JSON / HTML / 图片；不提供插件特权
       └── 仅发起 OPEN_INSTALL_REVIEW 意图
                    ↓ 可信通信与用户确认
             OpenDesk 扩展自有安装确认页
~~~

**P0** 不依赖域名和后台服务：扩展自有页面、离线官方目录、现有安装通道就能先用起来。

**P1** 可使用任意符合 HTTPS、安全头和静态路由支持的托管（静态站、CDN、反向代理均可）；本轮未指定生产域名、DNS/证书、云服务或运营团队，因此**不自动部署**。预先设计好可独立访问的路径与版本快照；与本地 R2 原型的 #/ Hash 路由区分。服务器需使直接访问 /apps/... /install/... /collections/... 返回页面，返回正确的 metadata/OG 标签（需要 SEO/社交预览时采用构建期静态生成或预渲染），并保留固定 revision。建议无数据库起步：不可变 catalog/release JSON + 官方审核资源 + 静态媒体；用户投稿、付费、信誉和远程发行后置。

生产网页代码可以正常运行在公网网页上下文，但**不要把公网脚本 URL 作为 Chrome 扩展特权执行入口**。当前 MV3 限制远程执行代码；沙箱、userScripts 等限定政策例外必须按场景单独审查，绝不以网络 JSON 解释复杂命令绕开。首版采用“代码随扩展包发行、服务端只给展示信息”的可验收路线。

## 4. 公网 → 扩展安装意图的可信边界

目标方案（并非当前代码已经支持）：

1. 经授权的公网来源才可以通信。扩展 manifest 在**已核对正式域名后**将其加入 externally_connectable.matches；不能为任意网页开放。生产环境只接受固定 HTTPS Origin。开发环境若需要 localhost，仅在独立开发构建中有限允许，不扩大正式生产白名单。
2. 公网页面需要已发布且稳定的 Chrome Extension ID（开发态加载 ID 不应假设等于发行 ID）。页面可通过 chrome.runtime.sendMessage(extensionId, payload) 发起有限请求；无扩展/不支持时用正确回退。
3. onMessageExternal 必须检查 sender.url / sender.origin 与 allowlist；不信任页面提供的 publisher、releaseHash、capabilities、packageUrl 或“已授权”标志。请求只包含经过长度/格式校验的 appKey、版本或 collection/revision、一次性请求标识以及固定协议版本。
4. 扩展按自身可信目录解析唯一来源与包，检查 publisher→toolId、固定版本/哈希、所需宿主与权限差异。**市场 ID 与工具本地 ID 不同，不能因为同 ID 静默覆盖别的作者的安装或数据**。发现冲突即拒绝普通安装。
5. 外部消息处理最多回“确认页面请求已接受/无法处理”，并打开扩展自有的安装审查页；**不直接调用安装写入**。宿主必须重新审查并获得用户明确确认；安装以后自行读取真实安装状态。
6. 没有得到回执、页面关闭或超时不等于失败。对已提交事务根据 idempotency / 持久 receipt 核对状态；结果未知不能重复提交。
7. 公开网页不应收到用户浏览历史、当前网址、笔记正文、Token、企业连接器密钥或完整已装应用清单。

一个只用于设计审查的意图结构（不是现有 API）：

~~~json
{
  "protocol": "opendesk.market.intent.v1",
  "action": "OPEN_INSTALL_REVIEW",
  "intentId": "由页面生成的有界随机标识",
  "subject": {
    "kind": "app",
    "marketId": "opendesk/reading-toc",
    "version": "1.0.2"
  }
}
~~~

注：不强制使用固定 HTTP API / 本地端口来桥接安装，不在网页注入任意 Chrome API；真实实现应按浏览器文档设计消息响应与浏览器自有用户交互。

## 5. 套装与迁移的生产边界

套装链接固定 collectionId + revision + 成员身份/版本，服务器应稳定返回旧 revision，不得用“最新”覆盖分享过的内容。浏览页面先进行逐项预检：已经安装、版本差异、包缺失、来源冲突、需要授权、超过 12 个工具上限等，并展示各项可否完成。

批量安装必须使用每个应用已有的审核/安装合同和统一事务协调；中途取消只阻止尚未开始的项目，已成功的不删除，在途和结果未知的先查询原事务，**只重试明确失败项**。不能声称跨多个应用存在未实现的原子事务。

“分享套装”不包含网站授权、个人笔记、Cookie、密钥等。“换设备迁移”先导出应用/固定版本及明确白名单的非敏感偏好；笔记等用户数据由具体应用自己的备份恢复功能处理，导入前预检，新设备的权限、Native 配对和本机验证要重新取得。

## 6. 本地验证路径（按证据分层）

### 原型静态验证（本轮可做）

- 启动上述 43131 本地静态服务，打开 TOC 详情 Hash 路由。核对首页、独立详情、媒体示意、分享、安装模拟、套装、多状态和帮助。
- 直接复制浏览器里的 #/apps 或 #/collections 路由到另一个标签页，仍定位到相同原型页面。
- 网络断开后本地原型仍可渲染（不等于真实扩展离线安装）。
- 本轮源文件只进行静态修订/结构检查，不得标记真实 Native PASS。

### 真正扩展安装验证（P0 实施后）

~~~sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
npm run build:dev
npm run verify
npm run pack
~~~

在受控 Chrome 加载项目实际构建的 dist/production，再打开 Side Panel → 工具 → 应用市场，完成四个已有应用的真实选择/安装/使用/授权/卸载；记录源码 SHA、packageHash、Chrome 版本、扩展 ID、截图、安装/结果记录。构建 PASS != Chrome Native PASS。

### 公网交接验证（P1 实施且正式域名确定后）

- 公开详情直达、分享 SEO 与版本固定快照。
- 已安装扩展：合法 Origin → OPEN_INSTALL_REVIEW → 扩展自己确认 → 安装成功。
- 没有扩展/ID 不同/无接收端/跨域恶意页面/重放/非法版本/坏签名/同 ID 不同发行者/离线：全部有明确负向行为，不能静默安装。
- 批量：混合已安装、缺包、容量、失败和未知；保存每项真实 receipt，反复打开不会重复安装。
- 同样核对新版本能力差异、应用数据、权限撤销、Chrome 重启/Worker 恢复及用户真实网页使用。

## 7. 本次修订与待做事项

- 已有 R2 HTML 在 prototypes/marketplace/app-market-r2.html，本轮只增加“运行与部署”说明入口；**没有创建第二套正式市场或远程服务器**。
- 已有 R2 方案和状态/套装合同保留；此文件追加关于运行位置、托管及跨界安装的权威决策。
- 下一轮按 [市场 R3 实施 GOAL](../../framework/prompts/goal-app-market-r3-implementation.zh-CN.md) 改真实代码。没有用户最终生产域名之前，先实现可用的扩展内市场；公网静态站可先构建可部署产物，但不声称已经上线。
- 官方依据：[外部网页与扩展消息](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[MV3 远程执行限制](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)、[Chrome 扩展本地解压加载](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)、[旧 inline install 弃用](https://developer.chrome.com/docs/extensions/mv2/inline-faq)。
