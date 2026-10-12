# GOAL：OpenDesk Browser E-commerce Tool Universe R2

## Page QA 错误优先级纠偏、已保存研究文档收敛、电商全行业机会挖掘与商业验证 MVP 筛选

日期：2026-10-12；默认中文。首要目标：**用现有 OpenDesk Browser 的真实技术能力，为电商买家、卖家和运营者找到值得长期使用、有合法数据来源和明确商业价值的产品机会；不是为了批量生产扩展而寻找容易写的插件。**

### 一、仓库与工作约束

GitHub：https://github.com/shopable-ai/opendesk-browser

本地：/Users/shopme/Documents/workspace/opendesk-browser

仅允许写入 main；禁止创建其他分支、Worktree、PR，禁止 force push、reset/clean 和覆盖其他 Agent 的工作。先读取 AGENTS.md、最新 HEAD、仓库并行工作/本地未提交变更、相关 workstream 和 testing-guide；远端只读状态不能证明 Mac 本地干净。写入前复核目标文件及最新 HEAD；只有无冲突、文档校验通过和授权满足，才提交推送 main。

本轮**主要任务是研究、统一已保存的 Markdown/JSON、修复误导性产品优先级和形成明确的后续开发路线**；不批量生成插件、不修改核心运行代码、不做 AdBlock 或 Page QA 专项验收。未经额外授权不主动联系商家、收款、登录账号、读取 Cookie/私人订单或大量采集网页。

### 二、优先读取的真实材料（不能创建第二套台账）

首先读取：
- docs/product/browser-extension-ecosystem/README.zh-CN.md
- commercial-decision-ecommerce-20261012.zh-CN.md
- ecommerce-tool-universe.zh-CN.md
- product-priorities.zh-CN.md
- vertical-product-catalog.zh-CN.md
- opportunity-register.json
- commercial-experiments.json
- commercial-opportunity-framework.zh-CN.md
- monetization-unit-economics.zh-CN.md
- distribution-and-validation.zh-CN.md
- research-process.zh-CN.md
- roadmap-24-months.zh-CN.md
- extension-factory-architecture.zh-CN.md
- userscript-ecosystem.zh-CN.md
- next-goals.zh-CN.md
- docs/framework/prompts/goal-ecommerce-tool-universe-r1.zh-CN.md
- docs/product/browser-automation-feature-catalog-r8.zh-CN.md
- docs/product/browser-automation-r8-implementation-plan.zh-CN.md

R8 的 188 项能力和 E01–E40 不重编号。84 条 OPP 与 8 个 EXP 均有稳定 ID，先更新/去重、补证据；不得只改产品名或网站名就创造新机会。

### 三、必须执行的错误纠偏

Page QA Inspector 已不再是首款商业产品。**历史** `products/page-qa-inspector/`、`packages/features/page-qa/`、`scripts/product-build.mjs` / `product-pack.mjs` 只组成硬编码 Page QA 的旧实验工厂，**这些源码、专用测试和 CI 已从当前 main 实际移除**（旧 Git 提交可追溯），并非当前可构建的通用工厂。状态：STOP / ARCHIVED / NO_RELEASE / SOURCE_REMOVED_FROM_MAIN。

原 TOP5/MVP1、历史 GOAL 中推荐 Page QA 商业首发是错误选择：技术容易实现不代表存在与 Lighthouse/DevTools/axe/WAVE 不同的真实需求、买方、留存和付费。保留旧记录与 Git 提交证据，避免覆盖其他 Agent 的独立工作；不重启 Page QA 研发、Mac 20 次验收、定价、获客或 CWS 上架。继续推进它须未来单独拿出全新证据与明确批准。本轮要扫描并纠正任何残留的“Page QA 是当前首款产品”表述。

### 四、重点研究整个电商工具宇宙，不只优惠券

以已有五大产业域、20 个功能领域为基础，覆盖：
- 消费者：找商品、规格比较、价格历史、含税运费到手价、优惠透明度、清单、物流和售后。
- 卖家：Listing、SKU/SPU/变体、成本毛利、库存、订单、客服、运营合规。
- 品牌和代运营：跨店工作流、SEO、内容、广告、产品资料、授权分析报表。
- 供应链与跨境：采购/RFQ、交付、税费、风险、供应商、财务对账。
- 开发者/生态服务商：Shopify、Amazon、eBay、WooCommerce 等官方或经许可接口、企业部署、网站适配器维护。

每条机会从**真实人物及重复动作**开始，写明：目标用户/买方、痛点频次、现有免费/付费替代、数据及网站许可、OpenDesk 真实源码复用、A 工具/C 脚本/B 独立扩展/云 SaaS/定制服务的选择、获客、维护、付费与否决条件。优先对照 OPP-008～OPP-021、OPP-078/080/081、EXP-005/007；将已有功能分拆为“工具内模块”和“真正独立产品”，不把数百个小按钮算独立上架产品。

### 五、证据、商业模式与独立评分

核查至少 30 个代表性电商竞品或开源方案（资料不足如实说明），包括 Keepa、Honey/Rakuten、Helium 10、Jungle Scout、卖家后台原生功能、Shopify/Amazon/eBay 官方 API、真实用户社区及 CWS 政策。记录来源 URL、检索时间、目标用户、价格币种与周期、竞争差异、数据合法来源和免费替代。不能编造下载量、收入、留存或客户付款。

分别研究 B2B 卖家席位/企业维护、B2C 购物工具/非侵入合法推广、云端授权价格数据、代理商交付和脚本作者服务。必须解释付款人是谁、为什么持续付费、是否存在合法数据源和长期维护预算；只使用真实合同/订单记录证明已经付款。

CWS 单一用途、重复内容、最少权限、MV3 远程代码与 Affiliate Ads 用户利益/主动操作是独立硬门；卖家登录、订单 PII、数据抓取、自动发布/改价/退款须额外严格审查。所有安全、商业证据、可运行性、维护成本维度分别评分并列反证，禁止没有证据就声称 95 分。

### 六、三个最适合先验证的电商 MVP（研究结论，不立即开发）

第一条优先研究 **卖家 Listing/SKU 校验**（EXP-005）：一个获授权的卖家页面、只读问题检查和导出，验证任务价值、平台限制、买方预算和 DOM 维护成本。

第二条研究 **消费者实际到手价/购物决策**（EXP-007）：当前商品价格、运费/税费、折扣条件和商品比较，数据来源不可靠时明确不能输出精确报价，不默认联盟链接/购物佣金。

第三条在 **卖家客服话术、毛利试算、授权后台表格/报表、企业内部工作流** 中根据竞品、需求和维护证据择优，不预先指定哪款产品。

每条 MVP 输出完整用户故事、实际操作流程、需要的权限/数据、A/C/B/SaaS 分发、已有代码消费者、关键验收指标、商业验证方法、风险、GO/PIVOT/STOP 条件和必要时的后续源码 GOAL。没有真实访谈、订单或原生证据就明确 NOT_VALIDATED/NOT_TESTED。

### 七、真实文档落库与最终报告

实际增量维护 README、commercial-decision、ecommerce-tool-universe、product-priorities、opportunity-register.json、commercial-experiments.json、monetization、distribution、roadmap、research-process、next-goals。旧排名保留历史身份；只在新事实支持时调整当前商业优先级，不创建平行功能总账和虚假技术完成率。

最终报告最上方先用普通语言说明：Page QA 错误纠正到哪里；电商 TOP30 高价值研究机会及 TOP10 用户工作流；哪些有人可能付费、为什么、证据程度；三个 MVP 的真实用户操作流程、复用点、数据/许可风险、付费和维护路径；哪些应该做脚本、工具、独立插件、云服务；文档变更清单、提交 SHA、未验证事项以及下一轮能安全实施的真实用户需求 GOAL。

**核心判断：先找真痛点和买方，再选择最轻的可运行交付形态，最后决定是否生产独立 Chrome 扩展。**
