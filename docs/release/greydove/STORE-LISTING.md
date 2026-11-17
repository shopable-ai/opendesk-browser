# GreyDove（灰鸽）：品牌与 Chrome Web Store 发布资料

本文件是 GreyDove 唯一的 Chrome Web Store 商品文案来源，维护对外品牌、中英文商店文案、功能声明依据和域名选择记录。它不新增品牌配置、安装器或发布流程，也不替代隐私政策、权限申报和真实 Chrome 验收。

本轮核查日期：2026-11-17（Asia/Shanghai）。功能源码核查基线：`ec8766088b4f290386cf05d5848b56f767ce6d06`；已吸收最新 `main@5926662a802ea76babadf6b8d6837c872eb21448` 新增的发布文档并合并到本文件。品牌修改在独立分支实施。构建、ZIP 与本轮最终验证状态见[品牌实施记录](../../framework/workstreams/greydove-brand.md)。下列文案是待提交资料，保存文案不表示商店已上传、审核通过或正式上架。

## 1. 固定品牌与唯一配置来源

| 项目 | 确定内容 |
| --- | --- |
| 英文品牌 | GreyDove |
| 中文品牌 | 灰鸽 |
| 产品类型 | Chrome 浏览器扩展 |
| 英文定位 | Browser Automation & Scripts |
| 中文定位 | 浏览器自动化与脚本工作台 |
| Standard 安装名称 | GreyDove |
| Developer 安装名称 | GreyDove Developer |
| 两版 `short_name` | GreyDove |
| 中文正文首次展示 | GreyDove（灰鸽） |

`Grey Dove`、`GrayDove`、`Grey Pigeon` 不是本产品名称。英文和中文商店的安装名称都保持 **GreyDove**；“灰鸽”是中文品牌表达，用于中文介绍，不另建不同安装身份。Developer 只是现有发行版本，不能因品牌调整而另建运行框架或承诺第二个公开商店条目。

根 [`manifest.json`](../../../manifest.json) 是扩展名称的唯一可编辑来源；[`scripts/browser-editions-r245.mjs`](../../../scripts/browser-editions-r245.mjs) 从其派生 Developer 名称。简介使用现有构建收录的 `_locales/en` 与 `_locales/zh_CN` 消息。这里的文案供维护者审阅，不作为第二套运行时配置。

保留 GitHub 仓库 `shopable-ai/opendesk-browser`、工程包名、OpenDesk SDK/API、Native Messaging 协议、Storage 键、内部产品 ID 和历史证据中的技术名称。官网域名不参与这些技术标识的重命名。

## 2. 可以填写的简要资料

### 英文

| 用途 | 文案 |
| --- | --- |
| Product name / 安装名称 | GreyDove |
| Marketing subtitle / 营销副标题 | Browser Automation & Scripts |
| Manifest description / 商店简要说明 | A workspace for browser automation, JavaScript scripts, and web tools. |

### 中文

| 用途 | 文案 |
| --- | --- |
| Product name / 安装名称 | GreyDove |
| 中文品牌 | 灰鸽 |
| Marketing subtitle / 营销副标题 | 浏览器自动化与脚本工作台 |
| Manifest description / 商店简要说明 | 用于创建、运行和管理浏览器自动化任务、JavaScript 脚本与网页工具的工作台。 |

“副标题”用于官网、截图或宣传标题，**不是本轮核实到的独立 Chrome Web Store 后台字段**。安装名称和简要说明来自 Manifest 元数据，完整介绍按后台支持的语言填写。官方说明列出的字段、限制与本地化规则见[商店资料](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)、[Manifest name](https://developer.chrome.com/docs/extensions/reference/manifest/name)、[short_name](https://developer.chrome.com/docs/extensions/reference/manifest/short-name)和[description](https://developer.chrome.com/docs/extensions/reference/manifest/description)：名称最多 75 个字符，短名称最多 12 个字符，简介最多 132 个字符。上述固定文案在限制内；不要把营销副标题拼进名称堆关键词。

## 3. 英文完整介绍

以下为 Standard 版本的商店详情正文。正式提交前，应以同一候选包完成第 8 节列出的产品验收。

---

GreyDove is a Chrome extension that brings browser automation, JavaScript scripts, and web tools into one workspace.

Turn repeated page operations into scripts you can review and reuse. Write or import JavaScript, try it on the page you are working with, and manage saved versions and installed tools from the browser.

What you can do

- Create and try JavaScript scripts for page tasks and website customization.
- Build browser tasks that locate page elements, fill fields, click controls, and wait for page changes within the websites you authorize.
- Install compatible page scripts for matching websites, and pause or remove them when you no longer need them.
- Use installed web tools from the side panel or their full-page views, where provided.
- Review task status, returned results, and errors, and stop active work through the workspace.

Review before reuse

Saving a draft and installing a script are separate actions. Review the script version and requested website access before installation. A task result belongs to its recorded run; an error or unknown outcome should be checked before you try the action again.

Compatibility and setup

Page-script features require Chrome's Allow User Scripts setting and access to the relevant websites. GreyDove supports a defined subset of user-script metadata; not all script-manager APIs, metadata directives, or existing scripts are supported. Websites and Chrome-restricted pages can also limit what a script can do.

GreyDove is intended for people who want to create, understand, and reuse browser scripts and tools. Use scripts from sources you trust and review the access they request. Some optional integrations require separate setup and authorization.

---

## 4. 中文完整介绍

以下为同一 Standard 版本的中文详情正文，与英文介绍保持相同功能范围。

---

GreyDove（灰鸽）是一款 Chrome 浏览器扩展，将浏览器自动化任务、JavaScript 脚本和网页工具集中在一个工作台中。

把重复的网页操作整理成可以检查、保存和重复使用的脚本。你可以编写或导入 JavaScript，在当前网页试运行，并在浏览器内管理固定版本和已安装工具。

你可以做什么

- 创建并试运行 JavaScript 脚本，处理网页任务或调整页面体验。
- 编写自动化任务，在已授权的网站定位元素、填写表单、点击控件并等待页面变化。
- 安装符合支持范围的页面脚本，让它们在匹配网站运行；需要时停用或卸载。
- 从侧栏使用已安装的网页工具；提供完整页面的工具也可以在对应页面中打开。
- 查看任务状态、返回结果和错误，通过工作台停止正在进行的任务。

先核对，再重复使用

保存草稿与安装脚本是两个独立操作。安装前请核对脚本版本和申请的网站访问范围。每个任务结果对应一次实际运行；出现错误或结果未知时，应先确认网页的实际状态，再决定是否重试。

兼容范围与准备事项

页面脚本功能需要开启 Chrome 的“允许用户脚本”，并授权访问相关网站。GreyDove 支持有明确范围的用户脚本元数据，并不支持所有脚本管理器 API、元数据指令或现成脚本。网站自身及 Chrome 受限页面也可能限制脚本操作。

GreyDove 适合希望创建、理解和重复使用浏览器脚本与工具的用户。请使用可信来源的脚本，检查它们申请的权限。部分可选集成需要单独配置和授权。

---

## 5. 与油猴类扩展的关系：基于当前仓库描述

**网页用户脚本是 GreyDove 与 Tampermonkey（油猴）等产品直接重合的能力。** 两者都面向通过脚本增强网站、减少重复操作的需求。油猴也能执行自动化逻辑，不能将“它只能修改页面、不能自动化”作为差异化依据。

GreyDove 的当前定位还包括 Controller 自动化任务和可安装的侧栏工具；其产品方向是把编写/导入、试运行、固定版本、授权安装及运行结果放在同一工作台中。这样的结构是本仓库可定位的实现方向，**不是已经证明比竞品更强、更快或更容易使用的结论**。

| 对照维度 | GreyDove 当前依据 | 对外可以怎样表述 |
| --- | --- | --- |
| 网页用户脚本 | 元数据解析、页面试运行、固定候选、安装、匹配规则、启停、卸载已有源码 | “创建和管理支持范围内的页面脚本” |
| 类油猴兼容范围 | `@grant` 非 `none`、`@resource`、传统 `@include/@exclude` 等在准入层仍明确拒绝 | 不写“完全兼容油猴”“所有脚本直接运行” |
| 浏览器自动化任务 | 独立 Controller Task、任务版本、安装身份、运行状态及结果展示 | “创建、运行和管理浏览器自动化任务” |
| 网页工具 | 侧栏工具安装与相应完整页面入口 | “脚本与网页工具工作台”；不宣称已上线公开应用市场 |
| AI 相关方向 | 仓库有 AI/Workflow 等实现和历史证据，但本轮不完成其整体验收 | 当前商店主文案不承诺“一句话全自动完成任何网站任务” |
| 云、会员、支付和作者市场 | 存在提案、部分接入或独立项目，不构成本轮交付证明 | 不写云同步、会员权益、支付或成熟在线市场已经可用 |

资料阅读顺序：

1. [Browser Framework 总览](../../architecture/browser-framework/README.md)：Controller 与 Page 两种运行方式，共享宿主服务。
2. [UserScript 生态](../../product/browser-extension-ecosystem/userscript-ecosystem.zh-CN.md)：安装、原生注册及对账的后续源码记录。
3. [R8 逐项兼容矩阵](../../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md)：用于追溯元数据与 GM 的边界；其早期“安装缺失”状态不能覆盖最新源码。
4. [R8 竞品研究](../../architecture/browser-framework/userscript-competitor-research-r8-20261008.zh-CN.md)与[生态研究目录](../../product/browser-extension-ecosystem/README.zh-CN.md)：历史市场研究、路线与假设，不直接变成商店功能承诺。
5. [Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php)：用户脚本头部、GM API 等行为的参考，不代表 GreyDove 已兼容。

## 6. 本轮功能声明依据与验证边界

| 声明 | 本轮实际读取的源码 | 证据级别与边界 |
| --- | --- | --- |
| JavaScript 页面试运行 | [`page-preview-flow.js`](../../../src/ui/page-preview-flow.js)、[`preview.js`](../../../src/scripting/user-scripts/preview.js) | 源码存在；本轮 Chrome 场景未验收 |
| 页面脚本固定版本、验证和安装 | [`page-program-library.js`](../../../src/ui/page-program-library.js)、[`installed-programs.js`](../../../src/scripting/user-scripts/installed-programs.js) | `verifyPageCandidate`、`makePageAvailable`、`installPageProgram` 等已接通；保存不自动安装 |
| 匹配运行、启停、卸载与对账 | [`installed-programs.js`](../../../src/scripting/user-scripts/installed-programs.js)、[`installed-page-tools.js`](../../../src/ui/installed-page-tools.js) | 有 `register/getScripts/unregister`、`reconcile` 和管理入口；仍须同候选验证注册读回、导航、重启及撤权 |
| 任务安装与版本身份 | [`src/platform/tasks/service.js`](../../../src/platform/tasks/service.js) | 有任务安装、启停、卸载及安装授权校验；不等于全部业务脚本均成功 |
| 任务结果和停止入口 | [`task-workbench.js`](../../../src/ui/task-workbench.js) | 有运行历史、结果、失败/未知状态和 stop；不承诺停止可回滚已完成的网页副作用 |
| 自动化页面操作 | [`ChromePage.js`](../../../src/framework/ChromePage.js) | 受限 Page/Locator API；不写完整 Playwright/Puppeteer 兼容 |
| 用户脚本兼容边界 | [`dependency-metadata.js`](../../../src/scripting/user-scripts/dependency-metadata.js) | 明确 `E_GRANT_UNSUPPORTED`、`E_RESOURCE_UNSUPPORTED`、`E_MATCH_SEMANTICS_UNSUPPORTED`；`@grant none` 不授予 `unsafeWindow` |
| Standard / Developer | [`browser-editions-r245.mjs`](../../../scripts/browser-editions-r245.mjs) | 复用同一源码派生；Developer 追加浏览器组件编译资源，Standard 不宣传这些资源默认存在 |

本轮仅修订品牌与发布资料，不借此重开兼容层、云服务或产品功能开发。旧候选的 Node、Chrome 或 CI 结果只证明其对应候选；本轮最终状态以[品牌实施记录](../../framework/workstreams/greydove-brand.md)为准。

## 7. 域名已被注册时怎样继续

**保留 GreyDove 品牌，把域名选择作为独立发布准备。** 产品名称、官网地址和内部仓库名没有必须逐字相同的要求。本轮未购买域名，也未联系域名持有人。

2026-11-17 通过注册局官方 RDAP 接口进行实际只读查询：

| 候选 | 实际查询结果 | 判断与顺序 |
| --- | --- | --- |
| `greydove.com` | HTTP 200；创建于 `2007-08-14T18:06:05Z`，当前记录到期于 `2027-08-14T18:06:05Z` | 已注册；是否出售及价格未知。收购作为预算内可选项，不等待它才完成品牌落地 |
| `greydove.app` | HTTP 404，无注册记录返回 | 优先去注册商核实可注册状态及首年/续费价格；适合产品官网 |
| `getgreydove.com` | HTTP 404，无注册记录返回 | 第二选择，适合安装与下载入口；“get”只属于网址，产品仍名 GreyDove |
| `usegreydove.com` | HTTP 404，无注册记录返回 | 第三选择，保持完整品牌拼写 |

原始查询入口：[Verisign `greydove.com`](https://rdap.verisign.com/com/v1/domain/greydove.com)、[Google Registry `greydove.app`](https://pubapi.registry.google/rdap/domain/greydove.app)、[Verisign `getgreydove.com`](https://rdap.verisign.com/com/v1/domain/getgreydove.com)、[Verisign `usegreydove.com`](https://rdap.verisign.com/com/v1/domain/usegreydove.com)。`greydove.com` 返回的注册局数据更新时间为 `2026-11-17T08:40:54Z`。这些接口的后续响应可能变化。

**RDAP 404 只说明本次未取得注册记录，不等于注册商已确认可以购买。** 查询无记录、DNS 无记录和网站打不开都不能替代注册商的实时可注册状态。ICANN 的 [Lookup](https://lookup.icann.org/)和[RDAP 说明](https://www.icann.org/en/announcements/details/icann-update-launching-rdap-sunsetting-whois-27-01-2025-en)可用于复核注册信息。

推进顺序：

1. 核查 GreyDove、灰鸽及近似名称在目标市场的商标情况；先查 [WIPO Global Brand Database](https://www.wipo.int/en/web/global-brand-database/index)，再补目标国家或地区数据库。本轮没有完成商标清查，不能声称无冲突。
2. 向注册商核实一两个候选的可注册状态、首年费用、续费费用、是否溢价及转移费用；按多年总成本比较，不只看首年促销价。参考 [ICANN 续费说明](https://www.icann.org/resources/pages/domain-name-renewal-expiration-faqs-2018-12-07-en)。
3. 由有权负责人选择并注册主域名。当前阶段一个主域名足够，是否增加跳转域名按预算决定；本轮不自动购买。
4. 注册及归属确认后部署官网、支持与隐私政策页面。`.app` 全域要求 HTTPS，配置有效 TLS 后才能作为正常浏览入口，见 [Google Registry](https://www.registry.google/domains/app/)。
5. 再更新既有官网/支持/隐私链接配置和商店资料；没有实际拥有的候选域名不写入 `homepage_url`、运行配置、发布下载地址或正式隐私政策 URL。不得因域名改变已有 Origin 授权范围。

## 8. 正式提交前待办

品牌修改完成、ZIP 验证通过、真实 Chrome 验收和商店审核通过是四个独立结果。以下项目由对应负责人据实关闭：

| 项目 | 本文件记录的状态 / 必须取得的结果 |
| --- | --- |
| 源码、构建和 ZIP | 跟随[本轮实施记录](../../framework/workstreams/greydove-brand.md)，不能由本文件预填通过 |
| 正式品牌图标 | 待补齐/核验灰色鸽子正式素材；需要 16、32、48、128 px 资源和 128 px 商店图标，检查 Manifest、复制清单、固定哈希与最终 ZIP。不用通知图标或随意占位图代替 |
| Chrome 同候选检查 | 未在本文件执行；须确认扩展管理名称、工具栏标题、设置/侧栏品牌、脚本运行与原权限流程，区分 Standard 与 Developer |
| 商店截图 | 待制作真实候选截图；当前官方要求 1–5 张，1280×800 或 640×400；不能用预览图冒充功能实测 |
| 中英文资料填写 | 待在开发者后台填写；副标题用于营销素材，完整介绍按包内支持语言提交；两语言的功能承诺保持一致 |
| 隐私政策与数据披露 | 待核实真实数据流、可选外部服务和权限用途，完成公开可访问的隐私政策 URL 与后台披露。不写“绝不联网”或“全部数据永不离开本机”等未经核实承诺 |
| 权限与政策审查 | 原权限不因改名而变化；需要说明现有广泛网站权限及敏感 API 的必要性，独立检查单一用途、最小权限和 MV3 用户脚本边界 |
| Standard / Developer 分发 | 继续现有派生机制；优先审查 Standard 正式条目，Developer 是否单独分发/上架另行决定，不能默认创建重复商品或共用未核实正式身份 |
| 域名与商标 | 域名候选只完成上述只读查询；未注册、未完成商标清查 |
| 正式提交审核 | 未执行上传、发布或申请审核；须由有权发布者完成商店后台和最终提交 |

### 素材交付核对

- [ ] 128×128 商店图标，符合当前商店要求。
- [ ] 扩展内部所需的 16×16、32×32、48×48 等图标资源。
- [ ] 至少一张真实产品截图；建议准备最多五张能展示核心流程的高质量截图。
- [ ] 截图来自实际候选包和真实 UI，不得使用概念图冒充产品截图。
- [ ] 如使用宣传图/视频，检查当前后台要求、尺寸和内容政策。
- [ ] 英文和中文素材分别校对。
- [ ] 截图中的名称、版本、UI 和商店描述一致。

## 9. 开发者后台字段准备

- 商品名称和简短描述
- 完整描述
- 商品类别
- 支持语言
- 商店图标
- 截图和可选宣传素材
- 开发者/发布者名称
- 支持网站和支持邮箱
- 隐私政策 URL
- 单一主要用途声明
- 数据收集、使用和共享声明
- 权限用途披露
- Distribution：国家/地区、可见范围和发布方式
- 适用时的 Trader / Non-Trader 声明及联系资料

字段名称和强制性以实际 Developer Dashboard 为准。不要将个人地址、电话、支付信息或身份文件写入本仓库。

## 10. 单一主要用途与权限说明

建议围绕“浏览器自动化与 JavaScript 脚本工作台”描述核心用途。不能把扩展变成若干互不相关功能的关键词集合。

需要特别解释：

- 为什么需要访问用户当前网页或多个网站。
- 为什么需要脚本执行和自动化控制能力。
- 何时访问 Cookie、标签页、下载或其他浏览器 API。
- 用户如何发起操作、批准权限、停止功能和撤销授权。
- 用户脚本、网页内容和第三方服务之间的数据边界。

最终权限说明必须引用代码调用点和用户功能，不能只复制 Manifest 权限名称。

## 11. 发布前文案检查

- [ ] 所有功能在提交 ZIP 中存在。
- [ ] 所有重要权限在描述或界面中清楚解释。
- [ ] 不暗示 Google 是商品卖方或支付方。
- [ ] 不宣传尚未实现的会员、支付、广告或云服务。
- [ ] 不使用无关关键词堆砌。
- [ ] 不使用未获授权的商标、Logo、截图或用户评价。
- [ ] 隐私字段与隐私政策、界面和真实代码行为一致。
- [ ] 语言、截图和实际 UI 一致。
- [ ] 最终商品资料由发布负责人批准。

## 12. 官方资料

Chrome 官方发布参考（本轮于 2026-11-17 核查，正式上传时再次按后台与最新政策确认）：

- [填写商店资料与本地化](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [商店图片规范](https://developer.chrome.com/docs/webstore/images)
- [隐私披露](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [质量、元数据与重复内容政策](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines)
- [MV3 要求与远程代码边界](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [用户脚本 API 与 Chrome 开关](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)

本轮商店文案不包含会员、支付、云同步、成熟在线应用市场、全量 GM 兼容或通用 AI 全自动能力的销售承诺。后续新增声明必须先更新对应源码/验收依据，再修改本文件和实际商店介绍。
