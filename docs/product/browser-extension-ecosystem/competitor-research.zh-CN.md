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
