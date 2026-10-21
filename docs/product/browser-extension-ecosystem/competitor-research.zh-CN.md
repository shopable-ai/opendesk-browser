> **R5 跨市场竞品研究入口（2026-10-15）**：[24 领域网站任务](domain-relevance-universe-r5.zh-CN.md) · [两榜独立评分、许可证、时点证据与竞品反证](script-market-discovery-r5.zh-CN.md)。以下原有 43 个参照对象保留为种子；未经官方最新版、商店权限、功能体验、日期快照核实，不能称为 2026-10-15 市场排名。商店安装用户、Greasy Fork 累计安装、GitHub Star 不等于实际活跃、留存或收入。

# 竞品与公开证据台账（2026-10-12）

> 共 43 个**代表性参照对象**，横跨脚本、自动化、开发者、购物、运营、研究、SEO、客服、学习等方向。证据等级明确标出；`FOLLOWUP_VERIFY` / `CATEGORY_REPORT` 只说明候选名称/官网入口，未逐产品读取当日完整版本及评论；不能用此表证明下载量、市场规模、留存或真实使用频率。R8 的深度脚本研究请见[原报告](../../architecture/browser-framework/userscript-competitor-research-r8-20261008.zh-CN.md)。

## 1. 平台政策直接决定发行架构

| 问题 | 原始权威 | 设计结论 |
| --- | --- | --- |
| 单一用途 | [CWS 质量 FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq) | 单一狭窄主题可以有相关功能；不能打包无关能力 |
| 重复内容 | [Spam FAQ](https://developer.chrome.com/docs/webstore/program-policies/spam-faq) | 换皮/同体验重复上架不允许；特定 Host/企业有限例外须符合明示条件 |
| 最低效用 | [Minimum Functionality](https://developer.chrome.com/docs/webstore/program-policies/minimum-functionality) | 仅打开其他页面/软件的壳或无效功能有拒审风险 |
| MV3 远程代码 | [MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) | 仅允许文档列明的 User Scripts/Debugger 等受限例外 |
| 隐私与数据 | [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) | 不得收集与目的无关的浏览行为或做个性化广告 |
| 联盟返利 | [Affiliate Ads](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads) | 相关用户动作 + 当下真实利益 + 多处披露 |
| 权限 | [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) | 默认最小权限、能选则用 optional，并展示原因 |
| 用户脚本开关 | [Chrome 138 change](https://developer.chrome.com/blog/chrome-userscript) | 逐扩展开关，安装后不默认开放 |
| 商店上传 | [CWS API](https://developer.chrome.com/docs/webstore/using-api) | 可自动上传/送审，但审核通过不能自动声称 |

## 2. 代表性竞品与可借鉴的“行为”，不是可复制的代码

| 竞品 | 类别 | 观察到或待进一步核验的用户价值 | 来源 | 证据级别 |
| --- | --- | --- | --- | --- |
| Tampermonkey | UserScript | 元数据、GM、更新与备份 | [官方/原始入口](https://www.tampermonkey.net/documentation.php) | R8_AND_LIVE |
| Violentmonkey | UserScript | 开放代码、编辑与脚本管理 | [官方/原始入口](https://github.com/violentmonkey/violentmonkey) | R8_AND_LIVE |
| ScriptCat | UserScript | 后台脚本、Cron、订阅与脚本开发 | [官方/原始入口](https://github.com/scriptscat/scriptcat) | R8_AND_LIVE |
| Greasemonkey | UserScript | Firefox Promise GM 参照 | [官方/原始入口](https://github.com/greasemonkey/greasemonkey) | R8_REFERENCE |
| Greasy Fork | ScriptCommunity | 脚本发布、查找与社区审核 | [官方/原始入口](https://greasyfork.org/en) | LIVE_2026_10_12 |
| Stylus | UserCSS | UserCSS 样式配置和自动更新 | [官方/原始入口](https://github.com/openstyles/stylus) | R8_AND_LIVE |
| FireMonkey | UserScript | Firefox JS/CSS 混合脚本管理 | [官方/原始入口](https://github.com/erosman/firemonkey) | R8_REFERENCE |
| OrangeMonkey | UserScript | 轻量脚本安装与导出 | [官方/原始入口](https://chromewebstore.google.com/detail/orangemonkey/ekmeppjgajofkpiofbebgcbohbmfldaf) | R8_REFERENCE |
| Safari Userscripts | UserScript | Safari 脚本适配 | [官方/原始入口](https://github.com/quoid/userscripts) | R8_REFERENCE |
| Automa | Automation | 流程块、定时和独立扩展构建器 | [官方/原始入口](https://github.com/AutomaApp/automa) | R8_AND_LIVE |
| Ui.Vision | Automation | RPA 录制回放与桌面扩展 | [官方/原始入口](https://ui.vision/rpa/docs) | R8_REFERENCE |
| Axiom.ai | Automation | 低代码流程与可选云运行 | [官方/原始入口](https://axiom.ai/docs/no-code-tool/reference/settings/run-options/) | R8_REFERENCE |
| Bardeen | Automation | 自动化快捷入口与云工作流 | [官方/原始入口](https://www.bardeen.ai/) | R8_REFERENCE |
| Browserflow | Automation | 网页流程编辑 | [官方/原始入口](https://docs.browserflow.app/) | R8_REFERENCE |
| Selenium IDE | QA | 录制测试与选择器调试 | [官方/原始入口](https://www.selenium.dev/selenium-ide/) | R8_REFERENCE |
| Requestly | QA | 网络请求修改、Mock 与重放 | [官方/原始入口](https://requestly.com/products/http-interceptor/) | LIVE_2026_10_12 |
| Wappalyzer | Developer | 识别站点技术栈 | [官方/原始入口](https://www.wappalyzer.com/) | FOLLOWUP_VERIFY |
| OneTab | Tab | 标签收纳 | [官方/原始入口](https://www.one-tab.com/) | CATEGORY_REPORT |
| Session Buddy | Tab | 会话备份与恢复 | [官方/原始入口](https://sessionbuddy.com/) | CATEGORY_REPORT |
| Workona | Tab | 按项目组织浏览器工作区 | [官方/原始入口](https://workona.com/) | LIVE_CWS_PUBLISHER |
| Toby | Tab | 视觉化标签集合 | [官方/原始入口](https://www.gettoby.com/) | CATEGORY_REPORT |
| Tab Session Manager | Tab | 开源浏览器会话管理 | [官方/原始入口](https://github.com/sienori/Tab-Session-Manager) | FOLLOWUP_VERIFY |
| Keepa | Shopping | 历史价格与降价提醒 | [官方/原始入口](https://chromewebstore.google.com/detail/keepa-amazon-price-tracke/neebplgakaahbhdphmkckjjcegoiijjo) | LIVE_2026_10_12 |
| Honey | Shopping | 结算页优惠码使用 | [官方/原始入口](https://www.joinhoney.com/) | FOLLOWUP_VERIFY |
| Rakuten | Shopping | 购物返现与优惠发现 | [官方/原始入口](https://www.rakuten.com/) | FOLLOWUP_VERIFY |
| Capital One Shopping | Shopping | 购物优惠与价格辅助 | [官方/原始入口](https://capitaloneshopping.com/) | FOLLOWUP_VERIFY |
| Helium 10 | Seller | Amazon 产品研究、卖家指标 | [官方/原始入口](https://www.helium10.com/tools/product-research/chrome-extension/) | LIVE_2026_10_12 |
| Jungle Scout | Seller | Amazon 选品与卖家研究 | [官方/原始入口](https://www.junglescout.com/) | FOLLOWUP_VERIFY |
| Readwise Reader | Research | 网页保存、标注与知识库 | [官方/原始入口](https://docs.readwise.io/reader/docs/saving-content) | LIVE_2026_10_12 |
| Glasp | Research | 网页高亮与知识分享 | [官方/原始入口](https://glasp.co/) | FOLLOWUP_VERIFY |
| Ahrefs SEO Toolbar | SEO | 站点 SEO、Header、链接分析 | [官方/原始入口](https://help.ahrefs.com/en/articles/79085-ahrefs-seo-toolbar-installation-and-usage) | LIVE_2026_10_12 |
| SEOquake | SEO | 页面 SEO 审计与 SERP 工具 | [官方/原始入口](https://chromewebstore.google.com/detail/seoquake-on-page-seo-chec/akdgnmcogleenhbclghghlkkdndkjdjc) | LIVE_2026_10_12 |
| Apollo | Sales | CRM 上下文、线索与活动记录 | [官方/原始入口](https://knowledge.apollo.io/hc/en-us/articles/4409226637453-Apollo-Chrome-Extension-Overview) | LIVE_2026_10_12 |
| HubSpot Sales | Sales | 邮件追踪、CRM 工作流 | [官方/原始入口](https://www.hubspot.com/products/sales/email-tracking) | FOLLOWUP_VERIFY |
| Text Blaze | Writing | 网页快捷短语与模板 | [官方/原始入口](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj) | LIVE_2026_10_12 |
| Grammarly | Writing | 写作校对辅助 | [官方/原始入口](https://www.grammarly.com/) | FOLLOWUP_VERIFY |
| Language Reactor | Education | 双语字幕、词典与视频学习 | [官方/原始入口](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm) | LIVE_2026_10_12 |
| Readlang | Education | 阅读翻译与生词卡片 | [官方/原始入口](https://chromewebstore.google.com/detail/readlang-web-reader/odpdkefpnfejbfnmdilmfhephfffmfoh) | LIVE_2026_10_12 |
| GoFullPage | Capture | 全页截图导出 | [官方/原始入口](https://chromewebstore.google.com/detail/gofullpage-full-page-scre/fdpohaocaechififmbbbbbknoalclacl) | LIVE_2026_10_12 |
| uBlock Origin Lite | Privacy | MV3 隐私规则与广告过滤 | [官方/原始入口](https://github.com/gorhill/uBlock) | FOLLOWUP_VERIFY |
| AdGuard | Privacy | 站点广告过滤与隐私保护 | [官方/原始入口](https://adguard.com/en/adguard-browser-extension/overview.html) | FOLLOWUP_VERIFY |
| Loom | Content | 网页与屏幕录制、分享 | [官方/原始入口](https://www.loom.com/) | FOLLOWUP_VERIFY |
| Magical | Writing | 工作流字段填充和快捷短语 | [官方/原始入口](https://www.getmagical.com/) | FOLLOWUP_VERIFY |

级别说明：`LIVE_2026_10_12` 为本轮公开网页/商店实际检索；`R8_AND_LIVE` 同时有原 R8 与本轮公开资料；`R8_REFERENCE` 来自仓库现有 2026-10-09 R8 研究；`FOLLOWUP_VERIFY`、`CATEGORY_REPORT` 为本轮列入参照名单或多产品对比入口，细节须在下次验证，不能视为更新到最新版本。审计/检索日期：2026-10-12；时间敏感的促销、版本、安装量、价格未录入。

## 3. 有用的交叉信号

- **UserScript 与网页样式有成熟基准**：Tampermonkey/Violentmonkey/ScriptCat 强调元数据、更新与隔离；Stylus 独立维护 UserCSS；Greasemonkey 的 API 不能被直接假定和 Chrome 一致（详情见原 R8 源码级研究）。
- **自动化生态证实独立打包是一种真实产品路径**：Automa 的公开仓库描述了从 workflow 生成 standalone Chrome extension 的 Builder，但其许可组合包括 AGPL/商业授权，**不可直接搬入 OpenDesk**（[源码](https://github.com/AutomaApp/automa)）。
- **真正的高价值单用途往往很窄**：Keepa 直接在商品页呈现历史价和降价提醒；Ahrefs Toolbar 和 SEOquake 做 SEO 页面辅助；GoFullPage 做全页截图。存在“产品”不等于 OpenDesk 已获得竞争优势。
- **用户反馈提示浏览器工具的信任成本**：公开讨论中出现购物插件隐私与优惠码真实性担忧（[Reddit 讨论](https://www.reddit.com/r/chrome_extensions/comments/1plnasa/what_chrome_extensions_do_you_trust_for_finding/)），也有开发者抱怨 MV3 网络响应体观测受限（[Reddit 开发讨论](https://www.reddit.com/r/webdev/comments/1erd9bt)）。均为低样本社区证据，不可代替统计调查。
- **跨行业协同 SaaS 是额外能力，不是 SDK 免费附带**：Apollo 官方描述了 CRM/Gmail/企业网站的受控集成；Readwise Reader 解释了网页摘录/高亮的同步方案。需要账号、隐私和接口维护预算。

## 4. 下一阶段证据升级

对 TOP30 每条至少补：指定竞品的准确 CWS 页面/版本、商店权限快照、3 个以上独立用户痛点原话（注意脱敏）、明确测试网站、竞品关键体验录像或操作描述、开发和维护工时实测。当前很多条只有“这个需求有产品在解决”的**存在性证据**，不能以假设高频自动立项。

## R1.0-WEB · 2026-10-20 公开竞品/价格证据增量（22 家，非真实收入或全量评论研究）

> 检索时间：2026-10-20；将本轮证据**增量放到原竞品文档**，而不是创建第二份 CSV 作为竞争事实源。本表是每家公司官网或官方渠道的 **FACT：产品功能/公布的定价**，不是公司财务或购买者付费证明；没有独立产品安装/抽样评论/实际购买，标明 MISSING。价目币种默认 USD；年付折算与月付不可直接横比；价格会变，未来广告前需重查。

| 机会簇 | 竞品 | 官网当日公开能力/收费样例（非 OpenDesk 收入） | 核查结论/缺口 | 一手来源 |
| --- | --- | --- | --- | --- |
| AI 保存 | Obsidian Web Clipper | 免费开源；本地 Markdown 剪藏；图片需在笔记中另行下载附件 | FACT：官方有图文工作流；有单步摩擦；2026 社区样本 | [官方链接](https://obsidian.md/help/web-clipper) |
| AI 保存 | Readwise Reader | 含 Reader $9.99/月（年付），导出与长期复习 | FACT：订阅价；用户留存 MISSING | [官方链接](https://readwise.io/pricing/reader) |
| AI 保存 | Glasp | Pro $15/月，2026-05-01 官方调价通知 | FACT：价格公告；未做 CWS 体验 | [官方链接](https://blog.glasp.co/price-update-2026-05-01/) |
| AI 保存 | Raindrop.io | 免费书签/高亮；Pro 搜索、备份、AI；动态结算价格 MISSING | FACT：免费/专业区分 | [官方链接](https://raindrop.io/pro/buy) |
| AI 浏览器 | HARPA AI | $12/月（年付的一个个人档）；AI 网页工作流与连接 | FACT：公开档位，模型费与使用限制因方案而异 | [官方链接](https://harpa.ai/pricing) |
| 客服短语 | Text Blaze | 免费，Pro $2.99/月年付，Business $6.99/席/月年付 | FACT：清晰个人→团队付费路径 | [官方链接](https://blaze.today/plans/) |
| 网页自动化 | Axiom.ai | 免费试用；Starter $15/月，Pro $50/月；按运行小时分层 | FACT：任务可靠执行+持续运行收费 | [官方链接](https://axiom.ai/pricing/) |
| 网页自动化 | Bardeen | Basic $10/月、Premium $50/月（官网示例档），按 credits 收费 | FACT：销售与获客自动化信用额度 | [官方链接](https://www.bardeen.ai/pricing) |
| 网页自动化 | Automa | 开源浏览器工作流/录制与独立扩展构建；商业报价 MISSING | FACT：免费技术替代/强竞争 | [官方链接](https://github.com/AutomaApp/automa) |
| 网页自动化 | UI.Vision RPA | 核心本地工具免费开源；Pro $299/年、企业支持 | FACT：开源核心+支持收费 | [官方链接](https://ui.vision/rpa/x/pricing) |
| 数据采集 | Browse AI | Free 50 credits/月；Personal $19/月（年付），Professional $69/月（年付） | FACT：采集、监控、托管及服务付费 | [官方链接](https://www.browse.ai/pricing) |
| 数据采集 | Data Miner | 免费 500 页/月（有条件）；Solo $19.99/月 | FACT：页面量与域名限制 | [官方链接](https://dataminer.io/pricing) |
| 数据采集 | Apify | Free 起；Starter $19/月加按量；Actor 分成/计费 | FACT：运行/市场化执行模式 | [官方链接](https://apify.com/pricing) |
| 销售数据 | Clay | 免费 credits/actions；Launch/Growth 用量层级，动态当前价 MISSING | FACT：数据来源+执行成本双计量 | [官方链接](https://www.clay.com/pricing) |
| 销售数据 | Hunter | 免费额度；Starter $34/月（官网年付展示） | FACT：线索查询和邮件工作流 | [官方链接](https://hunter.io/pricing/) |
| 电商卖家 | Helium 10 | Platinum $129/月（月付），Diamond $359/月（月付） | FACT：卖家岗位具有高价专业替代 | [官方链接](https://www.helium10.com/pricing/) |
| 电商卖家 | Jungle Scout | 卖家 Catalyst/品牌 Cobalt 两类；当日可比价格 MISSING | FACT：专业卖家付费分层 | [官方链接](https://www.junglescout.com/pricing/) |
| 技术识别 | Wappalyzer | 免费技术查询，Pro $250/月、Business $450/月 | FACT：免费技术标签→B2B 线索卖点 | [官方链接](https://www.wappalyzer.com/pricing/) |
| SEO | Keywords Everywhere | 插件免费安装，搜索量/CPC 按年 credits 付费；当前精确价 MISSING | FACT：浏览器即场数据→付费积分 | [官方链接](https://keywordseverywhere.com/how-to-purchase.html) |
| 写作 | Grammarly | Pro $30/月月付或 $12/席/月年付 | FACT：免费/付费写作辅助 | [官方链接](https://support.grammarly.com/hc/en-us/articles/115000090011-How-much-does-Grammarly-Pro-cost) |
| 企业工作流 | Zapier | Free 100 tasks/月；Professional 起 $19.99/月 | FACT：SaaS 自动化与平台集成强替代 | [官方链接](https://zapier.com/pricing) |
| 企业工作流 | Make | Free 1,000 credits/月；Core $12/月（10k credits/月月付示例） | FACT：场景执行与工作流收费 | [官方链接](https://www.make.com/en/pricing) |

### Chrome Web Store 搜索的可核查基准

以下数字是访问商店公开页面时返回的**约数/快照**，不是月活、留存、销售、独立用户意图或 OpenDesk 可争取的实际流量；动态页面与搜索缓存可能有延迟。

| 官方 CWS 商品 | 商店公开显示的用户量级 | 2026-10-20 检索链接 | 不可作出的结论 |
| --- | ---: | --- | --- |
| Text Blaze | 800,000 用户 | [CWS](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj) | 不等于付费席位 |
| Obsidian Web Clipper | 1,000,000 用户 | [CWS](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf) | 不等于付费剪藏需求 |
| Axiom.ai | 100,000 用户 | [CWS](https://chromewebstore.google.com/detail/axiom-ai-browser-automati/cpgamigjcbffkaiciiepndmonbfdimbb) | 不等于稳定运行成功率 |
| Bardeen | 200,000 用户 | [CWS](https://chromewebstore.google.com/detail/bardeen-automate-browser/ihhkmalpkhkoedlmcnilbbhhbhnicjga) | 不等于用户平均工作时间节省（卖家自述） |

### 正反证据与待补作业

- **正例 FACT**：Text Blaze（个人→团队）、Axiom（运行小时）、Browse AI（抓取/监控 credits）、Wappalyzer（免费查询→付费线索/API）都公开展示了浏览器入口或简单任务如何连接收费层。事实仅说明该收费模式存在，不意味着 OpenDesk 用同一模式就能盈利。
- **针对 A 的强反例 FACT**：Obsidian Web Clipper 官方说明已经支持选区、模板、图片高亮和 Markdown 保存，而且免费开源；[官方图片下载说明](https://obsidian.md/help/web-clipper/capture)目前要求先保存，再在 Obsidian 运行“Download attachments for current file”才能将远程图片转成离线附件。此处可能有更短的「一键图文产物完成交付」任务缝隙，但必须进行真实同任务比较。
- **负面样本仅供线索**：[2026-04-15 图片入库讨论](https://www.reddit.com/r/ObsidianMD/comments/1smjzer/use_webclipper_to_grab_an_image/)希望选图后直接生成本地图片笔记；[2026-04-15 抽取不完整反馈](https://www.reddit.com/r/ObsidianMD/comments/1sm7cvk/web_clipper_does_not_save_full_article/)报告个别站点只剪到部分文章。这是少量自选帖子，非代表性投诉率、当前版本缺陷复现或用户付费证据。
- **针对 B 的强反例 FACT**：[Automa](https://github.com/AutomaApp/automa)免费可执行网页流程；[UI.Vision](https://ui.vision/rpa/x/pricing)提供免费核心和付费支持；[Axiom](https://axiom.ai/pricing/)已支持本地/云运行。不能宣传“首次实现自然语言网页自动化”。
- **针对 C 的强反例 FACT**：Browse AI、Apify、Clay 等已经具备监控、数据、API 和价格梯度。未经具体行业独有的许可数据或完成率优势，不进入通用采集 SaaS。
- **MISSING（22 家深访与评论）**：每家最新版/权限声明、最近 30 条独立真实评论的正负主题、可靠安装活跃、流量来源、关键词/月搜索量、国家 CPC、实际营收、交叉卖货/付费转化及真实使用成功率均未通过产品级审计；禁止把本表视为这些指标已核验。

### 复查流程

先在 3 个候选方向各选不超过 3 家核心竞品，进行同任务（开始→结果→回执→失败重试）对照；对每家再记录商店永久 ID/语言地区/商店权限/最新版本/近期评论时间戳与评论 URL，采样时区分赞扬、投诉、重复评论、发行商答复。只在采样完成后把评价字段从 MISSING 升级为 FACT。竞品研究日不是产品真实验收日。

## R1.2-VALIDATION-FIRST · 2026-10-21 · 官方收费边界、同任务反例与真实性检查

> 研究窗口：2026-10-21；市场观察：US/en、JP/ja 候选，**本次直接读取的是公开官网默认地区/币种快照，并未按美日地区分别完成购买结算**。来源类别 OFFICIAL_SITE/OFFICIAL_CWS/COMMUNITY_REPORT；官方功能、价格为 FACT（可能随时间改变），OpenDesk 竞争切口为 HYPOTHESIS。22 家官网基础证据≠22 家完成产品实操/评论深度验收；与 R1.0 既有 22 家表同一事实源，此处是同任务、付费理由与强反例的增量，不建另一账本。

### 22 家竞品的真实任务与付费边界（研究矩阵，产品实操未完成）

| 商业方向 | 竞品 | 官网可验证的现有工作结果/收费边界 | 反方审查：OpenDesk 不能简单复制的理由 | 一手 URL | 证据状态 |
| --- | --- | --- | --- | --- | --- |
| A | Obsidian Web Clipper | 免费开源，Markdown/选区/模板/AI Interpret；图片默认引用远程 URL，需另行下载附件 | 免费替代极强；只能以已验证的原图+来源+附件交付竞争 | [官网/官方资料](https://obsidian.md/help/web-clipper/capture) | FACT_OFFICIAL |
| A | Readwise Reader | Reader 年付折算 USD 9.99/月；标注、笔记同步与 Markdown 导出 | 已经解决大量阅读复用和导出；团队内容交付的额外付款意愿未知 | [官网/官方资料](https://readwise.io/pricing/reader) | FACT_OFFICIAL |
| A | Raindrop.io | Free 无限书签与基础导出；Pro 全文搜索、归档、AI 与备份；动态地区成交价未核 | 通用收藏不是空白市场，不能以“可收藏”作为差异 | [官网/官方资料](https://raindrop.io/pro/buy) | FACT_OFFICIAL |
| A | Glasp | 免费公开高亮；Pro 付费私密高亮和更高 AI 用量，网页展示月付 USD 15/年付折算 12.50 | 专业付费来自私密性/用量，而不是简单高亮本身 | [官网/官方资料](https://glasp.co/pricing) | FACT_OFFICIAL |
| A | HARPA AI | 官网展示 AI 网页操作、复用命令与付费模型；当前 EUR 14.3/月（年付示例），与 R1.0 旧 USD 样例不同 | AI+网页工作流不是独有差异；地区/币种/税前价格不可混算 | [官网/官方资料](https://harpa.ai/pricing) | FACT_OFFICIAL |
| A/B | Text Blaze | Free 模板；Pro USD 2.99/月、Business USD 6.99/人/月（均年付折算）；团队共享、图片/表单片段 | 提示词和短语模板已有强替代，不能只卖快捷输入 | [官网/官方资料](https://blaze.today/plans/) | FACT_OFFICIAL |
| A/B | Magical | CWS 仍为文字扩展/表单自动填充；官网当前突出医疗行业运营 AI Agents，价格页跳回首页 | 说明竞品可能向行业采购工作流定位；价格、企业合同与成效 MISSING | [官网/官方资料](https://www.getmagical.com/) | FACT_OFFICIAL_POSITIONING_PRICE_MISSING |
| B | Axiom.ai | 免费试用 2 小时；Starter USD 15/月（5 小时/月）；No-code/代码/AI、云与桌面执行 | 不能以浏览器录制/AI 生成自称独有；需比较失败恢复和实施总成本 | [官网/官方资料](https://axiom.ai/pricing/) | FACT_OFFICIAL |
| B | Bardeen | Basic/Premium 与 credits；Premium USD 50/月的动态方案样例；CWS 有浏览器动作与集成 | 销售与数据工作流已有成熟竞品；信用额度使用成本须按实际任务核算 | [官网/官方资料](https://www.bardeen.ai/pricing) | FACT_OFFICIAL |
| B | Automa | 开源浏览器块状自动化，无需按月购买通用录制功能 | 最强免费竞争；OpenDesk 需证明部署审计/站点维护价值 | [官网/官方资料](https://github.com/AutomaApp/automa) | FACT_OFFICIAL |
| B | UI.Vision RPA | 免费开源可商用；付费价值在更新管理和优先支持/企业服务 | 印证支持合同可卖，但客户采购与利润未证 | [官网/官方资料](https://ui.vision/rpa/x/pricing) | FACT_OFFICIAL |
| B | Zapier | 跨 SaaS 集成及按任务付费的现成 SaaS 工作流 | 能用稳定官方 API 的任务不应优先强行 DOM 自动化 | [官网/官方资料](https://zapier.com/pricing) | FACT_OFFICIAL |
| B | Make | 免费/按 credits 执行；官网注明 credits 为动作成本单位 | API-first 集成替代很强；仅浏览器才可完成的授权任务值得进一步验证 | [官网/官方资料](https://www.make.com/pricing) | FACT_OFFICIAL_PRICE_DAILY_NOT_CAPTURED |
| C | Browse AI | Free 与 Personal USD 19/月（年付），托管采集/监控/额度 | 无持续合法数据源和可靠校验时不做通用抓取竞争 | [官网/官方资料](https://www.browse.ai/pricing) | FACT_OFFICIAL |
| C | Data Miner | 免费有限域名/每月 500 页；Solo USD 19.99/月且开放更多域名及自动化 | 已经覆盖网页表格采集；扩大量仅增加许可和维护风险 | [官网/官方资料](https://dataminer.io/pricing) | FACT_OFFICIAL |
| C | Apify | Free USD 5 使用额度，Starter USD 19/月 + pay-as-you-go，运行/Actor 市场 | 泛化云采集先天劣势；应定位已授权领域的结果校验 | [官网/官方资料](https://apify.com/pricing) | FACT_OFFICIAL |
| C | Clay | 免费 actions/data credits，Launch/Growth 按 actions 和数据计价；多来源 enrich | 付费价值来自多源数据与持续交付，非 CSV 解析按钮 | [官网/官方资料](https://www.clay.com/pricing) | FACT_OFFICIAL_DYNAMIC_PRICE |
| C | Hunter | Free 50 credits/月；Starter USD 34/月（年付折算）与 B2B 验证/邮件业务 | 线索服务依赖来源许可和有效性；OpenDesk 不宜卖未经授权个人数据 | [官网/官方资料](https://hunter.io/pricing) | FACT_OFFICIAL |
| C | Helium 10 | Platinum USD 129/月、Diamond USD 359/月（月付）；卖家产品/Listing/运营服务 | 证明行业存在高价商业产品，不能推导用户会付费买单一 CSV 校验 | [官网/官方资料](https://www.helium10.com/pricing/) | FACT_OFFICIAL |
| C | Jungle Scout | Catalyst 面向卖家、Cobalt 面向品牌；本轮官网具体跨方案可比报价缺失 | 卖家研究与报告强替代，数据价值/许可不对称 | [官网/官方资料](https://www.junglescout.com/pricing/) | FACT_OFFICIAL_EXACT_PRICE_MISSING |
| C | Wappalyzer | 免费技术研究入口；Pro USD 250/月、Business USD 450/月（官网月付档） | 昂贵的是合法 B2B 线索/API/更新；非识别单次技术栈 | [官网/官方资料](https://www.wappalyzer.com/pricing/) | FACT_OFFICIAL |
| C | Keywords Everywhere | 浏览器插件免费安装；年付积分解锁搜索量/CPC 等关键词数据 | 关键词商业数据需要授权采集/供应商；OpenDesk 不拥有独家搜索数据 | [官网/官方资料](https://keywordseverywhere.com/how-to-purchase.html) | FACT_OFFICIAL |

**证据解释**：以上 22 行逐一有官网/官方仓库来源，确认的是公开定位、功能和某些收费样例。没有真实付款人数、被争取的品牌词流量、首次任务完成率、实际支持时长。用户体验直接对照 **0/22**；每家最近 30 条带日期的独立 CWS 评论抽样 **0/22**；用户来源和自然留存 **MISSING**。此矩阵可用于筛选 3×2 个同任务基准，但**不能宣布“20 家深度研究已经全部通过”**。

### CWS 身份与量级补核（2026-10-21，公开截图式文字快照，非活跃）

| 商品 | 官方 CWS 永久 URL | 本轮公开显示 | 解释限制 |
| --- | --- | --- | --- |
| Text Blaze | [idgadaccgipmpannjkmfddolnnhmeklj](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj) | 约 800,000 用户；4.8 / 约 1.9K 评分 | 不等于付费或 US/JP 安装份额 |
| Obsidian Web Clipper | [cnjifjpddelmedmihgijeibhnjfabmlf](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf) | 约 1,000,000 用户；4.8 / 581 评分 | 免费装机不能换算收入 |
| Axiom | [cpgamigjcbffkaiciiepndmonbfdimbb](https://chromewebstore.google.com/detail/axiom-ai-browser-automati/cpgamigjcbffkaiciiepndmonbfdimbb) | 约 100,000 用户；4.1 / 245 评分 | 不证明自动化成功率 |
| Bardeen | [ihhkmalpkhkoedlmcnilbbhhbhnicjga](https://chromewebstore.google.com/detail/bardeen-automate-browser/ihhkmalpkhkoedlmcnilbbhhbhnicjga) | 约 200,000 用户；4.2 / 452 评分 | 商店自述节省工时不可当实测 |
| Magical | [iibninhmiggehlcdolcilmhacighjamp](https://chromewebstore.google.com/detail/magical-text-expander-aut/iibninhmiggehlcdolcilmhacighjamp) | 约 300,000 用户；本次英文页面出现 3.1 / 约 3.5K 评分 | 搜索缓存/JP 语言页曾显示 4.4；**存在时点/地区显示不一致**，禁止拿评分差量做趋势推断 |

### 能改变竞争假设的三组反方材料

1. **A 的功能缝隙很窄，不是新赛道**：Obsidian 官方明确说明图片默认为远程 URL，须另执行「Download attachments for current file」，但它也已经有 Markdown、本地知识库、模板/选区、Interpret 等能力（[官方截图/附件说明](https://obsidian.md/help/web-clipper/capture)、[官方 CWS](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf)）。2026-03-13 的[用户讨论](https://www.reddit.com/r/ObsidianMD/comments/1rsjnxw/obsidian_clipper_and_pictures/)询问一键图片保存，2026-09-19 的[论坛报告](https://forum.obsidian.md/t/could-webclipper-clip-download-the-images/98532)指出登录后附件获取可能失败；均为个人报告，不代表频率。**对照门**：同一获授权 AI 图文任务，同时让 Obsidian 与 OpenDesk 做「选择→最终本地图片→断网读回」，用产物及失败回执量差异；不证明优于免费竞品则不做收费 Pro。
2. **B 已有大量成熟实现**：[Axiom CWS](https://chromewebstore.google.com/detail/axiom-ai-browser-automati/cpgamigjcbffkaiciiepndmonbfdimbb)描述 AI/no-code/code + 云/本地、调度与 Sheet 连接；[UI.Vision](https://ui.vision/rpa/x/pricing)免费核心收费维护支持；[Magical 当前官网](https://www.getmagical.com/)突出医疗运营垂直 Agent，且其旧 `/pricing` 当前跳回首页。**对照门**：真实授权企业网页同任务执行成功、取消/撤权、维护小时、合同责任及报价；不以“也能自动填表”决胜。
3. **C 高价仅证明卖家存在高价值整套解决方案**：[Helium 10](https://www.helium10.com/pricing/)卖家工具 USD 129/359 月付，[Jungle Scout](https://www.junglescout.com/pricing/)卖家/品牌分层，[Apify](https://apify.com/pricing)与 [Clay](https://www.clay.com/pricing) 已有数据与服务层。单一文件缺失字段校验不等于付费需求；买家和许可都需实证。

### 下一轮竞品“深度通过”的明确证据门

每个核心方向先挑 2 家（A：Obsidian+Readwise；B：Axiom+UI.Vision；C：Helium 10+Jungle Scout）；**当前只完成公开资料初审**，剩余逐家记录：CWS 商品 ID/当前版本/权限、同一预注册任务输入、成功/失败录像及产物、免费与付费差异、真实费率和国家口径、最近 30 条带 URL/时间/独立账号的评论主题（不可人为计算总体投诉率）、5 个可核查反例与 OpenDesk 实测结果。不能合法进入账号或无法提供真实素材时填 `NOT_TESTED`，不得编造体验。

## R1.2-RECHECK-2026-10-21 · 公开商店身份、计费单位与反方任务（增量）

> **证据边界**：2026-10-21 检索官方 CWS 商品及官网，来源类别 OFFICIAL_CWS/OFFICIAL_SITE；显示的用户数和评分为**索引检索时可见的快照**，其网页缓存/不同语言版本时点不一致，不能作为今天同一秒的同步数据、地区安装量或增长率。商店显示“用户”不是 US/JP 可触达搜索流量、DAU、留存或订单。绝不从当前页额定评分倒推独立评论的正负比例。本节增量复用既有 22 竞品池，不新增第二个竞品台账。

### 额外 11 家官方 Chrome Web Store 身份/安装量级交叉核对

| 方向 | 官方商品（永久 ID 链接） | 索引公开用户量级 | 评分/评价数公开快照（可能过期） | 直接可见的任务与不能证明的事实 |
| --- | --- | ---: | --- | --- |
| A | [Obsidian Web Clipper](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf) | 1,000,000 | 约 4.8 / 572 | 本地 Markdown、网页选区；不能证明 AI 原图已一键离线 |
| A | [Readwise Highlighter（官方）](https://chromewebstore.google.com/detail/readwise-highlighter/jjhefcfhmnkfeepcpnilbbkaadhngkbi) | 100,000 | 约 4.1 / 63 | 保存网页到 Reader、划线跨平台同步；不等于买付费订阅的用户 |
| A | [Raindrop.io](https://chromewebstore.google.com/detail/raindropio/ldgfbffkinooeloadekpmfoklnobpien) | 500,000 | 约 4.1 / 783 | 多设备书签/标注/内容归档；非原图一致性交付验证 |
| A/B | [Text Blaze](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj) | 800,000 | 约 4.9 / 1,890 | 文字模板、表单；并非团队付费席位数量 |
| A/B | [Magical](https://chromewebstore.google.com/detail/magical-text-expander-aut/iibninhmiggehlcdolcilmhacighjamp) | 300,000 | 约 4.4 / 3,500 | 快捷输入/表单自动填充；其旧 R1.2 快照有 3.1，不能据此推断短期评分回升 |
| B | [Axiom](https://chromewebstore.google.com/detail/axiom-ai-browser-automati/cpgamigjcbffkaiciiepndmonbfdimbb) | 100,000 | 约 4.5 / 245 | no-code/code/AI、云/本机、记录与集成；旧快照约 4.1，不能推断趋势 |
| B | [Bardeen](https://chromewebstore.google.com/detail/bardeen-automate-browser/ihhkmalpkhkoedlmcnilbbhhbhnicjga) | 200,000 | 约 4.4 / 451 | 网页动作和销售集成；网页宣称节省工时非经审计实绩 |
| B | [Automa](https://chromewebstore.google.com/detail/automa/infppggnoaenmfagbfknfkancpbljcca) | 200,000 | 约 4.3 / 288 | 免费可视化页面自动化/定时；收费差异不能靠功能数证明 |
| B | [UI.Vision](https://chromewebstore.google.com/detail/uivision/gcbalfbdmfieckjlnblleoemohcganoc) | 200,000 | 约 3.9 / 239 | 本地宏、OCR/桌面/网页任务；稳定性/维护成本仍待操作 |
| C | [Helium 10](https://chromewebstore.google.com/detail/helium-10-for-amazon-sell/njmehopjdpcckochcggncklnlmikcbnb) | 1,000,000 | 约 4.1 / 771 | 卖家商品/关键词/利润研究；不是单个 CSV 校验的购买证据 |
| C | [Jungle Scout](https://chromewebstore.google.com/detail/jungle-scout/bckjlihkmgolmgkchbpiponapgjenaoa) | 300,000 | 约 3.8 / 368 | Amazon 产品/销售研究；与卖家导入文件质量审核不是同一工作结果 |

**样本质量结论**：身份与大致安装档可公开独立交叉核查；22/22 官网任务/公开付费边界仍属于桌面研究，额外 11 家 CWS 信息并不升级为 22/22 产品实操。**同任务手测仍为 0，近 30 条逐家可追溯独立评论审计仍为 0，US/JP 活跃付费份额 MISSING**。官方商城索引有时返回不同版本/评分缓存，需要正式取证时保存页面日期、版号、语言参数与截图/存档；不能将语言切换当作地区收入样本。

### 公开定价信号：收费的是持续结果、用量与管理，而不是简单插件安装

| 官方最新可见边界 | 事实（默认显示 USD，月份/年付口径不可混合） | 对 OpenDesk 的投资含义 | 来源/置信度 |
| --- | --- | --- | --- |
| Text Blaze | Free 有模板额度；Pro 2.99 美元/年付折算月，开放图片/表格与完整表单；Business 6.99 美元/人/月（年付），包含管理、协作与报表 | 快捷输入本身已经免费；单纯 Prompt 模板无法形成独特高价产品 | [官方价格](https://blaze.today/plans/) · FACT_HIGH |
| Readwise | Reader 30 天试用后 9.99 美元/月（按年计）或 12.99 美元/月（月付） | 用户为跨来源阅读、同步和回顾服务付费，不是仅为“导出 Markdown” | [官方价格](https://readwise.io/pricing/reader) · FACT_HIGH |
| Axiom | Starter 15 美元/月含 5 小时运行；Pro 50 美元/月含 30 小时；API/webhook、云任务受档位限制 | B 必须估算每次有效结果的小时、失败重跑/售后成本；价格不是本产品 CAC | [官方价格](https://axiom.ai/pricing/) · FACT_HIGH |
| UI.Vision | 自动化核心个人/商用免费；Pro 299 美元/年，Enterprise 999 美元起/年，突出更新管理和支持 | B 有潜在服务式付费边界，但需企业同意承担明确部署及持续维护责任 | [官方价格](https://ui.vision/rpa/x/pricing) · FACT_HIGH |
| Bardeen | Basic 10 美元/月 100 credits；Premium 50 美元/月 1000 credits；每采集行和数据 enrich 分别计费 | 大量网页自动化按行计费已存在，不能凭“会自动抓”竞争 | [官方价格](https://www.bardeen.ai/pricing) · FACT_HIGH |
| Browse AI | 免费 50 credits/月；Personal 19 美元/月、Professional 69 美元/月（官网按年计）；以页数/行数计价 | C 通用抓取与监控产品的功能和价格已充分成熟，避免烧钱竞争 | [官方价格](https://www.browse.ai/pricing) · FACT_HIGH |
| Clay | 2026 年分离 Actions 与 Data Credits；默认月付 Launch 起 185 美元/月、Growth 起 495 美元/月，年付切换会变化 | 行业数据价值在数据源、更新和 CRM 结果，不在免费 CSV UI；口径不一致时禁止混算 | [官方 FAQ](https://www.clay.com/faq/what-features-are-included-in-the-new-plans-how-do-i-pick-the-right-plan) · FACT_HIGH |
| Helium 10 | Platinum 129 美元/月、Diamond 359 美元/月（月付）；完整研究/运营/广告套件 | 仅证明“卖家套件可以标高价”，不能直接给单项 SKU QA 按相同价格收费 | [官方报价](https://pages.helium10.com/lp-pricing) · FACT_HIGH |
| Jungle Scout | 当前官方报价页分 Catalyst 与面向品牌的 Cobalt 询价；历史帮助中心仍显示旧套餐价格，存在时点/版本冲突 | 在真实报价前保持当前可比套餐价格 MISSING；不得将旧帮助中心价格写作当日 Catalyst 成交价 | [当前官网](https://www.junglescout.com/pricing/) · [旧帮助](https://support.junglescout.com/hc/en-us/articles/27245557182359-Jungle-Scout-Subscriptions) · CONFLICT_NEEDS_CHECK |

### 六家优先“同任务反证”实验，不把公开网页视为实操 PASS

| 场景 | 对照竞品 | 同任务必须留下的可复查产物 | 重要反面假设 / 尚缺的证据 |
| --- | --- | --- | --- |
| A | Obsidian、Readwise | 经授权 AI 回答含 Markdown+原生图片，直接保存与离线断网读回；检查图片真实字节、来源 URL、文件名、点击数、失败提示及是否需另用软件 | Obsidian 官方支持单独“Download attachments for current file”，若该流程已足够简单可靠，OpenDesk 的差异可能消失；两款实操均 NOT_TESTED |
| B | Axiom、UI.Vision | 授权测试站点完成固定的 8 字段→提交/确认→取消/撤权；记录 10 次重复中的真实失败、恢复、耗时与人工维护工时 | 成熟竞品已有宏/云执行和商业支持；若总工时不低于现有流程则 B 服务难盈利；未访问客户/未测试 |
| C | Helium 10、Jungle Scout | 买家允许使用的导出 CSV，与业务规则比对丢失字段、重复 SKU、误报/漏报、人工复核时间，并对比既有卖家套件可得结果 | 竞品付费的核心是合法数据、市场洞察与持续报表，不是 CSV 基础校验；无授权数据与买家故 NOT_TESTED |

**反方优先级**：先证伪 “A 很容易被 Obsidian 免费流程取代”、“B 维护成本超过受控实施收入”、“C 缺合法数据/现有表格功能已满足需求”，再考虑大规模功能开发。每家评论如未核到带日期的个体评论链接仍为 MISSING；不得根据 CWS 总评分杜撰缺陷主题、满意度或付费意愿。
