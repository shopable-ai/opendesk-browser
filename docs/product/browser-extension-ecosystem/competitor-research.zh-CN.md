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
