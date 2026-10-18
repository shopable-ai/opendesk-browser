# AdBlock · 个人开发使用

2026-10-17 权限合同：扩展以必选 `declarativeNetRequestWithHostAccess` 提供过滤能力（从原 optional 移动同一项，未新增其他 DNR 权限，未扩大 host_permissions）。权限存在不表示工具已安装或开启；安装、更新、工具授权和全局开启仍分别经过原入口。工具默认关闭，点击全局开启后才配置规则。必选 DNR 不再弹出 optional 授权框；能力缺失时保持关闭，提示先保存工作并重载/启用扩展。

关闭和卸载只清理 AdBlock 自己的规则，并读回确认；无法确认时保留清理状态，不报告已关闭。Chrome 网站权限仍由 Chrome 原生机制控制；停用/卸载整个扩展按 Chrome 原生机制生效。Stay Focus 共享该必选权限，不能通过移除它来表达某个工具停用。

当前网站按可信工具文档所属的 Chrome 窗口识别，不跟随其他窗口或独立 DevTools 的焦点。导航尚未提交时，当前网站操作保持不可用；导航完成、切换标签页后自动重读。页面状态分别显示导航中、隐身页、非普通 HTTP(S) 页面和身份读取失败，不把未知状态统一解释为网站不受支持。全局 DNR 规则与当前网站识别分别核实：域名显示正确不等于广告请求已经被拦截，页面状态暂不可用也不证明全局规则已经失效。

本次页面上下文修复的个人 Chrome 现场及新请求开启阻断/关闭恢复仍待实测，见 [当前工作记录](../../../docs/framework/workstreams/adblock-context-20261018.md)。现有 67 个离线域名不承诺覆盖所有广告；新增规则须有实际请求依据。

个人开发升级使用本轮受影响的定向 Node、包身份与实际 Chrome 开关网络检查，不以完整 production/Native/release 矩阵为前置。历史 Native 撤销 optional DNR 后 70 次新请求仍阻断的 FAIL 保留，不改网络失败断言，不宣称正式发布通过；本轮产物须由当前源码重新打包并走原审阅、身份校验及安装更新链。

以下为此前实现和证据记录；旧 optional 授权合同由上文替代。

# OpenDesk Browser · 广告拦截 R1.2

**2026-10-15：正式代码已接入 main；实际 Chrome 网络级验收以独立原生证据为准。** 不能把原型模拟数据或单元测试当作真正的广告拦截通过。

## 正式安装及使用

在 OpenDesk Browser 的「扩展」统一列表搜索 **广告拦截**，点击安装、审阅权限，再打开工具。工具的全局开关和「当前网站」开关由浏览器固定、可信的 Side Panel 宿主创建；首次开启调用 Chrome 原生 declarativeNetRequestWithHostAccess 授权。沙箱工具仅能读取实际状态和展示「已停用的网站」列表，恢复例外要在外层可信宿主再次确认。本站规则更改后需刷新网页，以便更新主框架和子框架过滤。

Chrome 首次授予可选 DNR 权限时，更新队列可能尚未初始化，写规则可能永久等待（[上游报告](https://issues.chromium.org/issues/551296620)）。本工具因此保持过滤关闭；保存工作并安全重新加载 OpenDesk Browser 扩展后，再手动开启，也可完整退出并重新打开 Chrome。Service Worker 单独恢复不会解除这个围栏。该段为此前 optional 合同的历史说明；本轮已获授权改为必选权限，不自动重放开启操作。

上游 [RulesMonitorService](https://github.com/chromium/chromium/blob/0a9bfccf49c3cbca9e368acf7f6a9c60f74f96ba/extensions/browser/api/declarative_net_request/rules_monitor_service.cc#L521-L528) 在无有效 DNR 权限加载时跳过初始化；后续权限变化缺少对应队列和 matcher 生命周期处理。该源码属于 Chromium 158，不能冒充现场 Chrome 155/156 精确 revision 验证。外部撤权后 API 不可用不等于已有 matcher 已移除；现有 Native 的 70 次新请求继续被阻断仍为 FAIL，扩展重载不能据此宣称修复撤权。旧候选未通过原 Native/release 门禁；本轮个人开发升级另以明确授权的定向准入验证。

开发修复（2026-10-17）：停用/卸载与后台共用首次授权围栏，未初始化时不会提交清理请求。已观察到的撤权清理不确定性写入本机记录，扩展重载或完整浏览器重启均不会自动把它当作规则清空；规则 API 读回确认后才解除。清理未确认时保留原卸载恢复日志和 AdBlock 状态。概览提供可信的「重新授权并清理残留规则」按钮，只申请原 DNR 权限并执行关闭，不自动开启过滤；取消授权保持未确认，重新授权后若会话未初始化仍需先保存工作并重载扩展。这是主动恢复路径，不是外部撤权立即停止过滤的修复，也不补造旧候选证据；最新按钮及恢复路径真实 Chrome 仍为 NOT_TESTED。

现行权限仍为 optional。最小必选 DNR 合同候选、共享 Stay Focus 的影响及验证条件见[本轮工作记录](../../../docs/framework/workstreams/adblock-development-20261017-01a14968.md)；未获具体合同决定前，不将该候选写入 manifest 或个人 Chrome。

工具已卸载时，扩展管理的「恢复清理」仍可使用：原日志确认后，由固定可信 AdBlock 回调显示“重新授权并清理”审阅，再从该确认点击同步请求 Chrome 原生权限，继续原有带锁清理。拒绝、取消或未初始化会话保留恢复记录；不会重新安装工具或开启过滤。此入口的 Node 回归通过，真实 Chrome 尚未执行。

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

正式工具项目版本：**1.1.1**（相对已安装的 1.1.0 修复 iframe 首次焦点导致恢复按钮点击丢失的问题，包字节已改变，不能沿用同版本不同包升级）。使用原有 `scripts/build-sidebar-tool.mjs` 生成 `artifacts/sidebar-tools/adblock/candidate.opendesk-tool.json` 临时候选，来源与测试门禁通过后由 `--promote-from` 显式晋升到唯一正式 `examples/sidebar-tools/adblock/adblock.opendesk-tool.json`；`--check-project` 校验身份及字节。官方发行由 Catalog 生成到 `dist/production/official-tools/adblock/`。不得手工编辑正式 JSON，实际用户仍须经过原安装器的权限和版本审阅。

## 实际验收边界

测试包括工具包结构、身份防伪、授权撤销、启停、域名规范化、DNR 所有权与跨工具优先级、状态失败回读、并发、浏览器恢复和卸载。**这些自动化测试是工程证据，不是 Mac 原生请求结果。** 原生验收须使用隔离 Profile、Chrome for Testing、真实请求和可信用户输入，并保存 DNR 回读与网络请求两套证据。Mac 未运行时标记 NOT_TESTED，不可虚构 95+ 评分。

## 三个不同技术与来源的 HTML 预览入口

- **R1 早期纯 HTML 单文件原型**：[`preview/index.html`](preview/index.html)。内联 CSS + 原生 JavaScript，不依赖 React，也不依赖构建；原始 SHA-256 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`，Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`，字节不可修改。
- **当前 React 19.2.0 + HTM 零构建原型**：[`preview/index-react.html`](preview/index-react.html)。直接使用 `file://` 打开；日常编辑 `preview/app.js` 与 `preview/style.css`，保存刷新即可见，不运行 npm build，也不加载远程代码。使用 OpenDesk 已有 CSS Tokens/Primitives；模拟数据仅供设计验收。
- **正式产品源码同源预览**：[`adblock-r1-interactive-preview.html`](adblock-r1-interactive-preview.html)。由 `scripts/preview/build-preview.mjs` 生成，使用正式 Host/工具业务源代码与安全 Mock；它既不是早期独立 HTML，也不是 React 设计样例，禁止手工修改生成快照。

上述三个入口都不能代表已安装的真实 Chrome DNR/网络拦截已通过。历史曾使用 `preview/adblock-r1-interactive-preview.html` 和 `preview/index-r1.html` 存放 R1 原件，现仅将它原样映射为 `preview/index.html`，新名称不再依赖版本猜测实现技术。
