# OpenDesk Browser · 广告拦截 R1.2

**2026-10-15：正式代码已接入 main；实际 Chrome 网络级验收以独立原生证据为准。** 不能把原型模拟数据或单元测试当作真正的广告拦截通过。

## 正式安装及使用

在 OpenDesk Browser 的「扩展」统一列表搜索 **广告拦截**，点击安装、审阅权限，再打开工具。工具的全局开关和「当前网站」开关由浏览器固定、可信的 Side Panel 宿主创建；首次开启调用 Chrome 原生 declarativeNetRequestWithHostAccess 授权。沙箱工具仅能读取实际状态和展示「已停用的网站」列表，恢复例外要在外层可信宿主再次确认。本站规则更改后需刷新网页，以便更新主框架和子框架过滤。

Chrome 首次授予可选 DNR 权限存在[已确认的初始化缺陷](https://issues.chromium.org/issues/551296620)：读规则可用，但写规则可能永久等待。本工具因此保持过滤关闭并提示完整退出、重新打开 Chrome；重启后仍须手动开启。Service Worker 单独恢复不会解除这个提示。不将权限改为强制权限，不自动重载扩展或重放操作。

工具类型为 optional，可通过正式安装器停用、启用、卸载；没有附带另一套 Service Worker、安装器或工具路由。未安装、未获批准及已停用时不应有本工具的 Chrome 过滤副作用。

## 离线广告过滤规则和来源

- 独立第一方人工整理的固定名单，共 **67 个域名**（47 广告投放域名 + 20 跟踪域名），不使用第三方订阅源，也不下载可执行脚本。
- 源文件 rules/domains.js，规则版本 2026-10-15.1；原始 UTF-8 文件 SHA-256 为 ac9f0766958a06c81e27e0d2cf292a200b6bcec8f50ddf34ce03b49d4da543ec。元信息保存在 rules/manifest.json，许可描述为仓库维护的原创数据编集（未复制受第三方许可约束的过滤规则集）；遵循本仓库原创代码的许可安排。
- 过滤第三方的 script、image、xmlhttprequest、sub_frame、ping、media 和 other 资源，不拦截正常 main_frame。保守避免主站登录、支付和正常导航被域名黑名单屏蔽。
- Chrome Manifest V3 唯一过滤引擎为 dynamic DNR。专属 ID 为 741000–741199，block 优先级 1，例外优先级 2；Stay Focus 使用 730000–730199，其重定向优先级高于 20，故本工具例外不得覆盖 Stay Focus 的限制。
- 例外只匹配精确 HTTP(S) hostname，不会把 example.com.evil.test 误作 example.com；在 Chrome DNR 主框架和子框架上配置 allowAllRequests，以传播到站内第三方资源。最多 100 个例外。
- 扩展启动和状态变更必须回读 Chrome DNR；已有规则清理仅限 AdBlock ID，不能清空别人的规则。检测到其他工具低优先级 dynamic/session 拦截规则、已启用 static 规则集或无法核对优先级时，安全拒绝例外、持久停用并清理本工具规则，防止覆盖；冲突消失不会自动恢复过滤。
- 首次用户操作明确获批后，才存储固定官方工具包摘要和安装 Epoch。状态及例外使用 opendesk.adblock.state.v1，仅保留规范化域名，不保存 URL、查询参数、浏览历史或模拟计数。
- 不依赖 Chrome 145 的 topDomains/excludedTopDomains，仓库要求最低 Chrome 138。其能力不等同 AdGuard / uBlock Origin Lite 的全部规则引擎或页面元素隐藏功能。

## 可信源码和构建

可信宿主的 AdBlock 固定业务源码位于 trusted/；离线数据位于 rules/；沙箱界面在 src/。既有 SW 和 Side Panel 通过预编译 import 静态链接固定模块，动态安装包不能替换 JS 提权。scripts/bundle-provenance.mjs 将七个审核过的特权 AdBlock 源文件按 Git Blob SHA-1 逐个锁定，源文件变更必须重新做代码审查及更新对应指纹。

构建/测试命令：

    npm run build:sidebar-tool -- examples/sidebar-tools/adblock
    node --test tests/environment/adblock-r12.test.mjs
    npm run check
    npm run build
    npm run build:dev
    node scripts/verify-package.mjs dist/production
    npm run verify
    sha256sum examples/sidebar-tools/adblock/rules/domains.js

正式工具项目版本：1.0.0。独立工具包由现有 build:sidebar-tool 生成到 artifacts/sidebar-tools/adblock/1.0.0/；官方发行包经 Catalog 生成到 dist/production/official-tools/adblock/，不得把构建输出手工写回 examples。用户使用正式发行版，不需要自行下载源码或安装 Node。

## 实际验收边界

测试包括工具包结构、身份防伪、授权撤销、启停、域名规范化、DNR 所有权与跨工具优先级、状态失败回读、并发、浏览器恢复和卸载。**这些自动化测试是工程证据，不是 Mac 原生请求结果。** 原生验收须使用隔离 Profile、Chrome for Testing、真实请求和可信用户输入，并保存 DNR 回读与网络请求两套证据。Mac 未运行时标记 NOT_TESTED，不可虚构 95+ 评分。

## 两种预览：交互设计 vs 正式验收

- **AdBlock 交互设计**：[`preview/index.html`](preview/index.html)，独立、可直接打开的 Mock 页面。2026-10-16 按用户要求由旧预览文件重命名并规范顶部标题栏（盾牌图标、「广告拦截」标题、34px 设置图标），保留已确认的交互流程。原件 SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7` 与 Git blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a` 仅用于历史追溯，不作为当前文件校验值；详见 [`preview/README.md`](preview/README.md)。
- **生产源码驱动的离线验收 HTML**：[`adblock-r1-interactive-preview.html`](adblock-r1-interactive-preview.html)，由 `scripts/preview/build-preview.mjs` 生成，不复制或覆盖上述设计基准。
- 两者均非已安装的真实 Chrome 界面，不产生真实 Chrome DNR/网络效果。正式产品应将当前设计稿作为信息架构基准，与同源预览及原生安装结果逐项对照并分别验收。
