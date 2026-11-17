# GreyDove：Chrome 权限、用户数据与商店合规审计

> 本文件记录当前 Manifest 声明和必须完成的审计工作。**权限声明不等于实际收集数据；没有查到数据流也不等于证明没有数据处理。** 最终结论必须来自源码调用点、运行行为、服务端和第三方数据流。

## 1. 当前审计基线

审计参考：远端 `main`，本轮基线 `ec8766088b4f290386cf05d5848b56f767ce6d06`。

当前 `manifest.json`：
- Manifest V3
- version：`0.1.0`
- name：`OpenDesk Browser`
- short_name：`OD`
- minimum_chrome_version：`138`
- host_permissions：`<all_urls>`

### Required API permissions（当前声明）

- `storage`
- `scripting`
- `sidePanel`
- `activeTab`
- `downloads`
- `tabs`
- `webNavigation`
- `debugger`
- `userScripts`
- `cookies`
- `notifications`
- `unlimitedStorage`
- `alarms`
- `offscreen`
- `proxy`
- `declarativeNetRequestWithHostAccess`

### Optional API permissions（当前声明）

- `bookmarks`
- `history`
- `contextMenus`
- `clipboardRead`
- `clipboardWrite`
- `tabGroups`
- `webRequest`
- `nativeMessaging`
- `idle`

这些值与 `src/platform/chrome/permission-gate.js` 中的权限目录存在明确对应关系；`scripts/verify-package.mjs` 会检查两者的一致性。

## 2. 权限审计要求

对每项权限建立以下记录：

| 字段 | 必须回答的问题 |
|---|---|
| Permission | Manifest 中的精确名称 |
| Call sites | 哪些文件实际调用相关 Chrome API |
| User feature | 对应哪个用户可见功能 |
| Trigger | 自动触发还是用户明确操作 |
| Scope | 访问哪些网站、标签页或数据 |
| Data | 读取、写入、传输哪些数据 |
| Alternative | 是否能用更窄权限实现 |
| Disclosure | 用户界面和商店如何解释 |
| Decision | 保留、缩小、改 optional 或删除 |
| Evidence | 测试、运行证据和审核结论 |

重点审查：
- `<all_urls>` 是否有明确且不可替代的核心用途，是否能缩小范围或按需授权。
- `debugger`、`cookies`、`proxy`、`userScripts` 的实际调用、触发和用户披露。
- `declarativeNetRequestWithHostAccess` 的规则范围和用户可见行为。
- `tabs`、`webNavigation`、`webRequest` 等是否存在可替代或可选化空间。
- 额外权限是否仅在用户明确操作时请求。
- 是否存在仅为未来功能预先申请权限的情况。

Chrome 要求请求实现产品功能所必需的最窄权限；不能为了未来可能实现的功能提前申请权限。

**不得只为了降低审核风险而删除产品核心能力。** 每项缩权都要检查用户故事、消费者、执行链、撤权和回归行为。

## 3. 用户数据流审计

逐项检查并记录：

| 数据类别 | 需检查的来源/位置 | 当前状态 |
|---|---|---|
| 网页 URL、域名和浏览活动 | tabs、webNavigation、任务与统计模块 | 待代码级审计 |
| 网页 DOM、文本和页面内容 | Controller、Page USER_SCRIPT、网页工具 | 待代码级审计 |
| Cookie 和站点数据 | cookies API、相关工具和用户授权 | 待代码级审计 |
| 用户编写的脚本和依赖 | 编辑器、草稿、项目目录、导入/导出 | 待代码级审计 |
| 自动化任务、执行结果和日志 | RunHost、Storage、任务结果 | 待代码级审计 |
| 账号、令牌和凭证 | Native、外部 Provider、配置与本地凭证 | 待代码级审计 |
| 云端请求和配对信息 | `src/cloud-control/` 及 Provider | 待代码级审计 |
| AI 请求和输入输出 | AI Provider、代理服务和网络请求 | 待代码级审计 |
| 诊断、崩溃和统计 | 日志、遥测、错误报告 | 待代码级审计 |
| 支付和商业化信息 | 未来支付系统（本轮不开发） | 未发现已验证的完整支付闭环；需全仓库审计确认 |

每个数据类别还要记录：
- 本地处理还是传到服务器。
- 传输目的和触发时机。
- 第三方接收方及其角色。
- 用户是否知情并明确同意。
- 保存位置、保存期限、删除方式。
- 是否用于分析、广告或其他二次用途。
- 数据泄露和权限撤销后的处理。

不得把权限列表直接当成数据收集声明，也不得在没有检查网络调用和服务端的情况下填写“不会收集/不会共享”。

## 4. Chrome Web Store 关键政策

提交前必须重新核对 Google 官方最新政策：

### 4.1 单一主要用途

商品描述、界面、权限和实际功能应围绕清楚的主要用途。GreyDove 的建议主线是浏览器自动化与脚本工作台。

### 4.2 Privacy Policy 与 Disclosure

如果扩展处理用户数据，需要提供准确、可访问且持续更新的隐私政策，并在商店指定字段提交链接。安装前披露、商店 Privacy 字段、隐私政策和真实行为必须一致。

### 4.3 Limited Use

- 数据使用必须限制在已披露的用途。
- 仅收集、使用和传输实现单一用途所必需的数据。
- 浏览活动的收集和使用受到严格限制；只有为用户可见、在商店页面和界面中突出说明的功能所必需时，才可能适用例外。
- 不得把受限用户数据用于个性化广告，也不得出售给广告平台、数据经纪商或信息转售商。
- 数据转给第三方必须符合政策允许的必要情形。

### 4.4 用户脚本与 Manifest V3

审查用户脚本的来源、执行世界、动态代码、远程内容、依赖固定、权限和撤销边界。不能把用户编写脚本的能力误写为扩展可以绕过 MV3 限制任意下载并执行远程代码。

### 4.5 付费功能

如果未来收费：
- 明确说明出售的是谁的商品/服务，开发者而不是 Google 是卖方。
- 清楚说明商品、价格、续费、取消和退款条款。
- 如果基本功能需要付费，必须在用户决定安装时明确披露。
- 敏感支付信息必须安全收集、存储和传输，并遵守适用法律及支付卡行业规则。
- Chrome Web Store 不是 GreyDove 的支付结算主体；实际收款架构需另行设计和审核。

### 4.6 广告和联盟推广

- 广告属于扩展产品体验的一部分，必须符合商店内容和开发者政策。
- Google AdSense 当前不得用于在扩展产品中投放广告。
- 广告需有上下文或清楚说明其所属产品，容易移除，不得伪装系统通知或强迫点击。
- 不得干扰第三方网站原有广告或功能。
- 联盟链接、代码和 Cookie 必须提前披露；每次加入都需要相关用户操作，并提供直接、透明的用户利益。
- 不得使用浏览活动等受限用户数据进行个性化广告定向。

## 5. 开发者身份和地区要求

需要在真实 Developer Dashboard 核对：
- 开发者账号注册和付款状态。
- 邮箱验证与两步验证。
- 个人/组织发布者资料。
- Trader / Non-Trader 声明。
- 公开联系信息、地址或其他地区性要求。
- 支持邮箱、网站和隐私政策。
- 目标国家/地区的消费者保护、隐私、税务和支付规则。

不要把账号类型、Google Payments 付款资料类型和 Chrome 商店 Trader 声明混为一谈。

个人资料、地址、付款凭证、身份证件、银行资料和密钥不能提交到 Git。

## 6. 最终审计交付物

- [ ] 单一主要用途说明
- [ ] Required / Optional 权限逐项映射
- [ ] Host 权限和网站访问范围说明
- [ ] 用户数据流图或数据清单
- [ ] 第三方服务及接收方清单
- [ ] 隐私政策
- [ ] 安装前数据披露
- [ ] Chrome Web Store Privacy 字段
- [ ] 用户脚本执行边界审查
- [ ] 第三方许可证清单
- [ ] 开发者身份/地区要求核对
- [ ] 最终生产 ZIP 与披露内容一致性复核

## 7. 官方政策来源

- [Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Accepting Payment From Users](https://developer.chrome.com/docs/webstore/program-policies/accepting-payment)
- [Ads](https://developer.chrome.com/docs/webstore/program-policies/ads)
- [Affiliate Ads](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads)
