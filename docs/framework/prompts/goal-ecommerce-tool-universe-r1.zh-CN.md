# GOAL：OpenDesk Browser E-commerce Tool Universe R1

## 电商浏览器工具宇宙：全业务角色、购物优惠脚本、卖家运营插件、跨平台工作流、商业机会研究与首批付费 MVP 决策

日期：2026-10-12。默认中文。

### 一、最重要的用户需求

**不是为了批量生产扩展而找一个容易做的插件。必须先找到有明确用户、真实重复问题、有可能产生付费或可持续流量的电商产品。**

本轮研究的范围不是一个购物优惠按钮，而是整个电商浏览器工具宇宙：

- 对消费者：搜商品、比较规格和实际到手价、优惠券、价格历史、清单、送达和售后。
- 对平台卖家：选品、Listing、SKU/变体、毛利、库存、订单、物流、客服、营销。
- 对品牌和代运营：多店管理、广告分析、SEO、报表、客户关系和团队协作。
- 对采购/供应链：B2B 报价、供应商、履约、跨境、税费、风控、对账。
- 对联盟/内容作者/ISV：透明推广、商品资料卡、渠道分析、网站适配器、授权 API。
- 对不同平台和地区分别研究：Shopify、Amazon、eBay、Etsy、WooCommerce、Walmart、TikTok Shop、Shopee、Lazada、Rakuten、Mercado Libre、AliExpress、Temu、淘宝/天猫、京东、拼多多等，仅作为候选，不默认已有支持。

**核心要求：研究 20 个以上电商功能领域、发现有意义的真实使用场景、识别付费者，逐条判断应该交付为 OpenDesk 工具、UserScript、独立 Chrome 扩展还是需要 SaaS。研究后只选择值得先验证的 3 个 MVP，不批量开发和上架。**

上次 Page QA Inspector 的问题已经明确：**容易编译和技术可行，不代表有市场价值**。不再将它作为本轮商业首发；保留既有技术验证样品，不做 AdBlock 或 Page QA 专项验收。

### 二、仓库、权限和冲突保护

仓库：https://github.com/shopable-ai/opendesk-browser

用户 Mac 本地目录：/Users/shopme/Documents/workspace/opendesk-browser

唯一可写分支：main；不创建分支、Worktree、PR，不强推，不执行破坏性 reset/clean，不覆盖其他 Agent 修改或历史证据。

本轮以**全量机会研究、已有框架复用核查、证据、产品目录和商业验证规划**为主。可以增量修改研究文档并在用户已有授权及 Git 安全、无并行冲突的情况下直接提交推送 main。未经具体授权不得代用户联系客户、登录商家账号、处理订单、获取 Cookie、申请外部 API 凭据或收款。

启动时核查 AGENTS.md、最新 main HEAD、Git 状态、并行任务、现有产品目录及相关资料；发生重叠写入风险就先只读审计并报告，不能用覆盖提交解决冲突。远端只读不足以证明用户 Mac 本地无脏工作区。

### 三、先继承现有商业结论和唯一账本

首先读取并继承以下真实仓库文件：

- AGENTS.md、docs/framework/testing-guide.md
- docs/product/browser-extension-ecosystem/README.zh-CN.md
- docs/product/browser-extension-ecosystem/commercial-decision-ecommerce-20261012.zh-CN.md
- docs/product/browser-extension-ecosystem/ecommerce-tool-universe.zh-CN.md
- docs/product/browser-extension-ecosystem/vertical-product-catalog.zh-CN.md
- docs/product/browser-extension-ecosystem/opportunity-register.json
- docs/product/browser-extension-ecosystem/commercial-experiments.json
- docs/product/browser-extension-ecosystem/product-priorities.zh-CN.md
- docs/product/browser-extension-ecosystem/commercial-opportunity-framework.zh-CN.md
- docs/product/browser-extension-ecosystem/monetization-unit-economics.zh-CN.md
- docs/product/browser-extension-ecosystem/distribution-and-validation.zh-CN.md
- docs/product/browser-extension-ecosystem/research-process.zh-CN.md
- docs/product/browser-extension-ecosystem/extension-factory-architecture.zh-CN.md
- docs/product/browser-extension-ecosystem/userscript-ecosystem.zh-CN.md
- docs/product/browser-automation-feature-catalog-r8.zh-CN.md
- docs/product/browser-automation-r8-implementation-plan.zh-CN.md

**R8 188 项能力 ID、E01–E40 工程任务、现有 OPP-xxx、EXP-xxx 均是单一账本。**

先梳理 OPP-008 至 OPP-021（购物/卖家）、OPP-078/080/081（报表/导出）和 EXP-005、EXP-007，再对照其他跨行业功能去重。不要因为某个网站名、行业标签或功能组合变化，就伪造新的 OPP ID 或已验证付费证据。不能把过时的主观 R1 TOP30 当成当前商业结论。

### 四、输出完整、容易阅读的电商工具宇宙功能树

逐层研究以下 20 大方向，每个方向至少整理 5–10 个**有具体用户动作**的功能候选；数量不足时说明原因，不凑数、不把细微按钮包装成独立需求：

1. 商品发现、搜索和选品。
2. 历史价格、跨平台同款比价。
3. 优惠券、活动、返利与会员权益。
4. 到手价、购物清单、预算和购买决策。
5. 订单收货、退换货与消费者售后。
6. 卖家选品、竞品 Listing 与价格跟踪。
7. 商品上架 QA、标题、类目、图片和属性。
8. SKU、SPU、变体、商品资料、批量字段校验。
9. 供应商、采购、RFQ、B2B 和批发报价。
10. 成本、佣金、汇率、税费、毛利与促销盈利。
11. 库存、补货、断货、库龄、多仓。
12. 订单履约、物流、仓储、退货与对账。
13. 客服话术、评价、工单、售后响应。
14. 广告、关键词、归因、预算、ROAS/ROI。
15. SEO、详情页、图片素材、A/B、内容本地化。
16. 多店铺、多渠道与团队权限管理。
17. 会员、CRM、再营销、复购。
18. 数据提取、表格导出、数据质量、报表和财务口径。
19. 风控、政策、税务、隐私与合规辅助。
20. 联盟营销、商品内容创作者、服务商、第三方软件与开发者 API。

要求先提供树形结构概览，再使用表格：**业务领域 → 子场景 → 用户痛点 → 触发页面 → 原子功能 → 适用平台 → 角色/付款方 → 数据要求 → 分发形式 → 维护成本 → 来源/验证状态**。

明确区分“一个完整电商独立扩展内的功能”和“应该放在已有扩展中的站点脚本”，禁止把 100 个微功能当作 100 款公开 Chrome 扩展。

### 五、研究市场规模之外的真实付费路径

至少按以下角色分开判断，不能只按工具流行度排序：

- B2C 购物者、家庭采购者、跨境消费者。
- 个人卖家、小团队店主、电商运营助理。
- 品牌及中大型卖家运营主管、代运营公司。
- 采购、供应链、仓储、客服、财务人员。
- SEO/内容/广告代理商、KOL/联盟作者。
- Shopify/WooCommerce 独立站商家、第三方 ISV。

每个方向都要回答：

1. 谁每天/每周执行什么具体网页任务？
2. 任务痛点是浪费时间、损失利润、错误率、延迟还是监管风险？
3. 现在通过哪个竞品、平台自带功能或人工 Excel 解决？
4. 为什么现有免费方案不够？
5. 谁有预算且有权购买？消费者流量如何合法商业化？
6. 是否需要持续服务或数据订阅，而非一次性的脚本？
7. 用户愿意为“工具本身”付费，还是仅为稳定 API、数据、团队工作流和节约工时付费？
8. 维护成本和数据许可费用是否可能高于收入？
9. 有没有明显的买方/卖方利益冲突，是否会破坏用户信任？
10. 为什么该任务适合浏览器扩展而不是平台官方 App、网页服务或已有 SaaS？

要分别调查购物端广告/联盟变现、卖家端席位/店铺订阅、B2B 服务、授权数据 API、企业私有交付等商业模式。不要把竞品“提供付费套餐”等同于已证明本产品有人付款，也不要创造不存在的转化率。

### 六、进行系统的竞品与证据研究

按独立站卖家、平台卖家、消费者购物、跨境/供应链、内容/联盟、自动化五组查找产品，原则上研究不少于 30 个有代表性的竞品或开源项目，覆盖免费与付费替代；信息不足如实列出。

优先来源：

- Chrome Web Store、Shopify App Store、Edge Add-ons、Firefox Add-ons。
- Amazon Selling Partner API、Shopify Admin API、eBay Sell API 等官方平台技术文档。
- Keepa、Rakuten、PayPal Honey 等购物/优惠竞品的官方功能与条款（逐一核验）。
- Helium 10、Jungle Scout、SellerAmp、sellerboard 等卖家工具（逐一核验）。
- 电商卖家工作流讨论、产品更新日志、GitHub Issues 和 Reddit 真实经验（注意样本偏差）。
- TikTok Shop、Temu、Shopee、Lazada 等平台相关开发/合作政策及其地区限制（可查到才记录）。
- Chrome Web Store 单一用途、重复内容、隐私、权限及 Affiliate Ads 政策。

逐条保存：官方网址、收费页/金额/币种/计费周期及核查日期、目标岗位、核心功能、免费替代、关键差异、可验证用户反馈、是否有官方 API、政策风险、证据等级。

不使用虚构或过期的 CWS 用户数、插件下载量、销售额和价格；资料不存在标 UNKNOWN。付费能力存在 ≠ 本项目用户愿付费。

### 七、按照真实用户工作流选择架构

研究后必须给出决策矩阵：

- **OpenDesk Tool**：通用、用户手动操作、可在现有 Side Panel 使用，例如毛利试算、授权 CSV 导出。
- **UserScript**：针对特定平台网页的局部按钮/交互增强，例如 Listing 校验、客服模板；适用页面和许可必须明确。
- **Extension Factory 独立扩展**：拥有明确单一目的、差异化和持续使用理由的行业产品，例如经验证的卖家运营助手；不能换壳重复上架。
- **Cloud/SaaS + 官方 API**：可靠历史价格、跨店同步、多人权限、真正后台提醒和持续报表等需要服务器能力的功能。
- **服务/交付**：特殊平台适配、咨询、私有部署，与软件订阅区分。

每条机会判断是否复用现有 Browser SDK / Page UI / RunHost / Storage / Scheduled Tasks / 工具市场 / React-Vue / WXT。必须核对真实源码与当前实施状态，不得直接宣布接口可用，也不得重新开发第二套浏览器 SDK 或 Page 执行器。

### 八、电商领域必须单独检查的风险

- 官方 API OAuth、授权角色、配额、付费门槛、平台区域差异。
- 商品数据的版权、许可、更新频率及“实时价格”的事实来源。
- 买家 PII、订单/支付数据、卖家账号、Cookie、商业机密。
- 价格/佣金/税费/汇率变化，库存预测和资金相关误判。
- 不允许绕过 CAPTCHA、反爬策略、限流、付费墙或其他访问限制。
- 不允许默认自动发布商品、改价、下单、支付、退款或营销群发。
- 所有影响业务的数据写入需明确用户授权、预览确认、审计与错误恢复。
- 联盟链接/优惠码/Cookie 必须遵守 Chrome Web Store 的显著披露、直接用户利益和相关用户操作要求；不得无优惠静默替换。
- Chrome Web Store 反重复发布、单一用途、最小权限和远程代码安全。
- 网站 DOM 变化、SPA、国际化、多个账号、后端 API 版本带来的维护成本。

**任一安全/数据合法性/平台政策硬门不通过，产品不进入实际发布排期**。

### 九、产品机会优先级和 MVP 选择

用独立维度评价：用户痛点、真实任务频次、买方预算、可量化省时或利润、免费替代竞争、差异化、获客渠道、OpenDesk 复用、数据源质量、地区/API 合规、开发成本、每月站点维护成本、隐私/误操作风险、数据证据可信度。

不能把 12 个评分平均到 95 来掩盖合规 BLOCKED，也不能给未经证实的商业潜力“专家 98 分”。

交付：

1. **全领域候选功能树**：至少 20 个领域，清楚标明功能词、独立用户问题及可组合的完整产品。
2. **电商 TOP30 候选**：逐条说明用户、付费方、使用频率证据、免费替代、付费依据、实现形态、网站权限、政策、维护和来源。
3. **TOP10 完整产品概念**：每个含 5–15 个配套功能，不能仅换名字/图标。
4. **最终 TOP3 MVP**：各自限定一个高频具体用户任务、目标网页/平台、合理开发范围、用户操作动线、必要权限、单项核心验收和 GO/PIVOT/STOP 门槛。
5. **单一首选产品**：给出为何先做它而不是 QA、优惠券、采集器或另一个行业工具的可复核证据；证据不足则明确推荐先访谈，不为了交付结论而假装有获客证据。
6. **MVP 真实验证方案**：建议每个优先方向 10–15 个目标用户访谈、5–10 位试用、至少两个任务周期观察；真实报价/订单/付款与口头意愿分别记录，均是目标不是完成事实。
7. **0–6 周研究/验证排期 + 3/6/12 个月机会路线**：先研究、再有限 MVP、再决定独立扩展，不承诺一次覆盖全网。

### 十、实际保存和工作要求

优先扩充既有 docs/product/browser-extension-ecosystem/ 文档，不创建另一套“电商权威总账本”。具体保存：

- 电商功能树：ecommerce-tool-universe.zh-CN.md 的深入研究和变更日志。
- 竞品证据：沿用 competitor-research.zh-CN.md 或在该目录增加明确分层的 ecommerce-competitors.zh-CN.md（已有等价文件则不新建）。
- 已有机会：只在 opportunity-register.json 按稳定 ID 增量补充，经过去重和证据核对才新增 OPP。
- 真实商业试验：沿用 commercial-experiments.json，不制造访谈、收入、用户量等样本。
- 电商优先级/路线图：新增专题视图时须链接唯一 OPP/EXP 记录，不另维护冲突排名。
- 产品选择理由与阻断：参照 commercial-decision-ecommerce-20261012.zh-CN.md，并说明本轮发现是否改变先前判断。

全程以可靠资料为依据，标明各条证据的日期和来源；已经完成、仅有实现代码、组件验收、原生 Chrome 验收、商店批准、真实商业成功，必须各自分级。

本轮主任务是研究和规划，不要求新建虚假的 UI 原型、不要求批量实现多款插件，也不以 AdBlock 或 Page QA 验收充数。若发现已有现成工具可完成一个明确工作流，可以给出**精确的下一轮小范围实施清单**，不要未经验证直接开发数十款。

如主分支存在并行文件冲突，只读收敛并明确阻断；如符合仓库规则和用户授权则安全提交并推送 main，报告 Git SHA。不可使用 force push。

### 十一、最终回复要便于用户阅读

优先顺序：

- 一段话结论：电商工具宇宙中哪类用户、哪类问题当前值得先验证。
- 一张看得懂的产业/产品功能树（消费者/卖家/品牌/供应链/生态）。
- TOP30 电商机会的清楚可复核表格与研究证据。
- 3 个实际 MVP 的**真实使用流程**（用户打开哪个网页、看见哪个入口、点击后得到什么）。
- 对商业价值的独立分项判定、现有免费替代、付款验证缺口。
- 工具 vs UserScript vs 独立扩展 vs SaaS 的选择结果。
- 修改的文档路径、Git 提交、未通过硬门与下一步最小验证动作。

**最终目标是从 OpenDesk 既有技术中发现可能长期有人使用和愿意付费的电商浏览器产品，而不是继续为了技术验证制作没有市场依据的独立插件。**
