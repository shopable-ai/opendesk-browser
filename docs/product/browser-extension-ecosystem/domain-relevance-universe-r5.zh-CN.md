# OpenDesk Browser Domain & Relevance Universe R5

> 原研究目标日期 2026-10-13；当前核查日期 **2026-10-15**。状态：**RESEARCH_ONLY / NOT_RANKED / NOT_IMPLEMENTED / NOT_PAID_VALIDATED**。本文件不批准开发任何特定插件或迁移任何第三方代码。
>
> 权威账本保持：84 `OPP`（`opportunity-register.json`），8 `EXP`（`commercial-experiments.json`），188 项能力（R8），E01–E40 工程任务。本页 D01–D24 和 Dxx-T1 只是领域、网页任务**检索键**，不是新的 OPP 或 EXP。

## 一、定位纠偏

OpenDesk Browser 的市场研究对象应是 **“特定用户 × 地区 × 网站 × 页面类型 × 具体操作任务 × 现有 UserScript × 竞品 × 能力适配 × 证据”**，而不是先决定做 CSV 或 Shopify 插件。

- [R4 Seller Payout](commercial-mvp-workflow-r4-20261013.zh-CN.md) 曾被推荐为“先开发”的工程候选，但从未有实际付费或真实用户频次证据；R5 将其归为 **D24 历史候选**，不再作为全球工具市场的默认开发方向。
- Shopify Listing Assistant、EXP-005 亦是历史待验证候选，不能未经跨领域研究直接当成唯一优胜者。
- R1 TOP30、R3 TOP10、Global First TOP20 与 R5 双榜不同：前者为历史内部研究顺序，**均不是按实际活跃、留存或收入验证的市场排名**。
- 保留而不重编号已有 84 OPP / 8 EXP；各 D 行可以指向多个原机会。同一业务操作跨领域出现，只新增关联，不新增同义 OPP。

## 二、结构化关系宇宙

~~~text
DOMAIN → REGION / LOCALE → USER ROLE → WEBSITE → PAGE TYPE → TASK (action,input,output)
                                               │
                    ┌──────────────────────────┴──────────────────────────┐
                    ▼                                                     ▼
    Script(sourceId, permanentId, version, license, hash, grants)  Competitor(storeId, version, permissions)
                    └──────────────────────────┬──────────────────────────┘
                                               ▼
                             Evidence(url, observedAt, method, uncertainty)
                                               │
                     OpenDesk P / T / C / SDK capability candidate + hard gates
                                               │
                                EXISTING OPP / EXP (if related)
                                               ▼
                           consumer utility rank ≠ professional workflow rank
~~~

关系不是以行业名作为产品实体。程序需使用 `domainId`、`sitePageKey`、`taskKey`、`sourceId+externalScriptId`、`store+extensionId`、`evidenceId` 建索引。多站脚本关联多个站点页；一个网站任务可有多个脚本/扩展和反证。重复网站、重复语言、脚本改名不能生成第二个商机。研究 JSON 文件 [domain-relevance-universe-r5.seed.json](domain-relevance-universe-r5.seed.json) 保留本表**唯一结构化种子**，无需再次解析 Markdown。

### 24 领域 × 全球/中国/日本 × 网站页面操作

下表中的网站是**代表性研究候选，不是访问量排行榜**；具体任务也是需求假设，未经站点授权和真实页面验收。UserScript 若写“列表发现”，仅证明列表出现同名脚本，不代表许可证、永久脚本 ID、源码哈希、`@grant` 或 OpenDesk GM 方法已核查；其他均为 **TO_DISCOVER**。

| 领域 | 细分用户 | 全球 / 中国 / 日本差异 | 代表网站 + 页面 + 操作 + 输出 | UserScript 线索 / 扩展竞品参照 | OpenDesk 候选 | 技术/合规风险及既有 OPP |
| --- | --- | --- | --- | --- | --- | --- |
| D01 网页体验 | 网页读者/重度标签用户 | 全球 Wikipedia/Medium；中国 知乎/公众号；日本 note/Qiita | wikipedia.org 长文章→提取目录跳转→目录；zhihu.com 问答→折叠干扰内容→阅读布局 | 关键词待检 reading mode / table of contents；竞品 Stylus、OneTab | P/T | DOM与无障碍兼容；OPP-054,OPP-023 |
| D02 搜索增强 | 研究者/搜索用户/SEO人员 | 全球 Google/Bing；中国 百度/必应；日本 Google/Yahoo Japan | google.com 搜索结果→标注来源及去重→结果清单；baidu.com 搜索结果→本地过滤无关条目→结果清单 | 关键词待检 search filter / SERP enhancement；竞品 SEOquake、Ahrefs SEO Toolbar | P/T | 搜索平台政策/结果准确性；OPP-075,OPP-077 |
| D03 AI 网站 | AI用户/提示词团队 | 全球 ChatGPT/Claude/Gemini；中国 DeepSeek/豆包；日本 ChatGPT/Gemini | chatgpt.com 输入框→点击模板填入→待发送草稿；claude.ai 对话页→手动选区复制→本地记录 | 列表发现 My Prompt；竞品 Text Blaze、Magical | P/T | AI对话隐私/编辑器频繁变化；OPP-027,OPP-034 |
| D04 视频播放 | 视频观众/语言学习者 | 全球 YouTube/Twitch；中国 Bilibili/腾讯视频；日本 Niconico/YouTube | youtube.com 播放页→使用倍速与热键→播放状态；bilibili.com 播放页→跳转字幕章节→定位信息 | 列表发现 HTML5 Video Playing Tools；竞品 Language Reactor | P | 媒体版权/播放器版本；OPP-050,OPP-056 |
| D05 多媒体音频 | 播客用户/音频工作者 | 全球 Spotify/SoundCloud；中国 喜马拉雅；日本 radiko | open.spotify.com 播放页→调整播放快捷键→播放状态；soundcloud.com 音轨页→添加时间书签→来源笔记 | 关键词待检 audio controls / media shortcuts；竞品 Loom、Stylus | P/T | DRM/音频授权；OPP-022,OPP-024 |
| D06 图片与设计 | 设计师/素材管理者 | 全球 Pinterest/Canva；中国 站酷/花瓣；日本 pixiv/Canva | pinterest.com 作品页→保存素材来源→出处卡；canva.com 编辑页→检查alt与出处→发布清单 | 关键词待检 image metadata / image tools；竞品 GoFullPage、Loom | P/T | 著作权/水印/平台条款；OPP-031,OPP-033 |
| D07 阅读与翻译 | 学生/外语读者/工程师 | 全球 Wikipedia/GitHub；中国 英文论文/GitHub；日本 英文技术文档/Qiita | github.com 项目页→翻译导航标签→术语提示；wikipedia.org 文章页→划词翻译→原文对照 | 列表发现 GitHub Internationalization；竞品 Readlang、Language Reactor | P/T | 文本数据隐私/译文误导；OPP-051,OPP-068 |
| D08 购物与消费 | 比价者/个人采购 | 全球 Amazon/eBay；中国 淘宝/京东；日本 Rakuten/Amazon JP | amazon.com 商品页→比对公开规格→商品卡；rakuten.co.jp 商品页→手动计算到手价→价格清单 | 关键词待检 shopping price / product comparison；竞品 Keepa、Honey、Rakuten | P/T | 价格准确性/联盟披露；OPP-010,OPP-013 |
| D09 电商卖家 | 商家/运营专员 | 全球 Shopify/Seller Central；中国 千牛/抖店；日本 Rakuten RMS/Shopify | admin.shopify.com 产品编辑→Listing字段清单→待核对字段；sellercentral.amazon.com 商品列表→人工SKU核对→异常清单 | 关键词待检 seller listing / sku export；竞品 Helium 10、Jungle Scout | P/T/C | 私有卖家数据/网站协议/维护高；OPP-015,OPP-016,OPP-020 |
| D10 社交媒体 | 社群管理员/重度用户 | 全球 X/Reddit；中国 微博/小红书；日本 X/LINE | x.com 时间线→本地关键词过滤→简化列表；reddit.com 帖子页→保存引用链接→来源笔记 | 关键词待检 feed filter / Better X；竞品 Stylus、Glasp | P/T | 反自动化/账户风控/个人信息；OPP-023,OPP-034 |
| D11 内容创作者 | 博主/编辑团队 | 全球 YouTube Studio/TikTok；中国 B站创作中心/小红书；日本 YouTube/note | studio.youtube.com 发布页→检查版权字段和描述→发布清单；note.com 编辑页→核验引文链接→来源记录 | 关键词待检 creator checklist / studio helper；竞品 Loom、Grammarly | P/T | 版权/私有数据/公开发布；OPP-031,OPP-032 |
| D12 广告营销 | 广告代理/增长负责人 | 全球 Google Ads/Meta；中国 巨量/腾讯广告；日本 LINE Ads/Google Ads | ads.google.com 广告编辑→校验UTM字段→链接草稿；business.facebook.com 报表页→标注归因口径→审核说明 | 关键词待检 utm builder / marketing helper；竞品 Ahrefs SEO Toolbar、SEOquake | P/T | 预算隐私/归因误解/平台条款；OPP-030,OPP-083 |
| D13 开发者与测试 | 程序员/测试工程师 | 全球 GitHub/GitLab；中国 Gitee/GitHub；日本 GitHub/Qiita | github.com PR页→保存变更定位→问题笔记；localhost 授权测试页→DOM定位→选择器线索 | 列表发现 Github Enhancement - High Speed Download；竞品 Requestly、Wappalyzer、Selenium IDE | P/T/C | 源码机密/测试授权/网络修改；OPP-001,OPP-003,OPP-005 |
| D14 办公与表单 | 行政/流程操作员 | 全球 Google Forms/M365；中国 飞书/钉钉；日本 kintone/M365 | forms.google.com 表单→填充可审阅模板→草稿字段；office.com 文档页→插入短语→文本草稿 | 关键词待检 form filler / text snippets；竞品 Text Blaze、Magical | P/T/C | 误提交/敏感字段/授权；OPP-057,OPP-059 |
| D15 CRM与客服 | 销售/客服/客户成功 | 全球 Salesforce/HubSpot；中国 企微/纷享销客；日本 Zoho/Salesforce | salesforce.com 联系人页→关联备注模板→待审核笔记；hubspot.com 工单页→客服回复草稿→待发送文本 | 关键词待检 crm snippets / support templates；竞品 Apollo、HubSpot Sales、Text Blaze | P/T/C | 客户PII/权限/高维护；OPP-036,OPP-038,OPP-041 |
| D16 企业采购 | 采购与供应商管理 | 全球 SAP Ariba/Coupa；中国 企业ERP/京东慧采；日本 Ariba/采购门户 | ariba.com 询价流程→人工报价比较→核对单；coupa.com 审批页面→检查填报字段→审核提示 | 关键词待检 procurement quote / approval forms；竞品 Text Blaze、Magical | P/T/C | 保密合同/主体许可/误审批；OPP-057,OPP-060 |
| D17 数据报表 | 分析师/部门负责人 | 全球 GA4/Looker；中国 飞书表格/腾讯文档；日本 GA4/kintone | analytics.google.com 报表→标记日期口径→快照备注；lookerstudio.google.com 看板→检查字段解释→说明卡 | 关键词待检 dashboard snapshot / table export；竞品 Glasp、Workona | T/C | 指标口径/隐私/数据所有权；OPP-078,OPP-080,OPP-081 |
| D18 教育学习 | 学生/线上课程老师 | 全球 Coursera/Udemy；中国 Bilibili/MOOC；日本 Schoo/YouTube | coursera.org 课程页→提取章节笔记→学习卡；udemy.com 视频页→双语划词→生词单 | 关键词待检 study subtitles / vocabulary helper；竞品 Language Reactor、Readlang | P/T | 课程版权/账号规则；OPP-050,OPP-051,OPP-053 |
| D19 招聘求职 | 招聘顾问/求职者 | 全球 LinkedIn/Indeed；中国 BOSS直聘/猎聘；日本 リクナビ/Indeed | linkedin.com 职位页→记录JD字段→职位卡；indeed.com 职位页→手动版本对照→差异提示 | 关键词待检 job description / recruitment snippets；竞品 Text Blaze、Magical | P/T | 简历PII/平台自动化条款；OPP-043,OPP-049 |
| D20 隐私与调试 | 授权安全测试者 | 全球 DevTools/OWASP练习站；中国 企业测试站；日本 企业测试站 | localhost 自有测试站→查看Storage字段→脱敏报告；example.com 示例页面→说明安全请求头→演示记录 | 关键词待检 cookie debug / network inspect；竞品 uBlock Origin Lite、AdGuard、Requestly | T/C | 凭据/越权/高危网络改写；OPP-002,OPP-005,OPP-007 |
| D21 跨站自动化 | 运营团队/企业流程负责人 | 全球 Gmail/Sheets/CRM；中国 飞书/企业微信；日本 Gmail/kintone | mail.google.com 草稿→人工审阅动作→草稿确认；docs.google.com 授权表格→字段准备→待导入数据 | 关键词待检 workflow automation / form automation；竞品 Automa、Ui.Vision、Axiom.ai | P/T/C | 跨源权限/不可逆动作/审计；OPP-059,OPP-060,OPP-083 |
| D22 研究与知识管理 | 研究员/学生/PM | 全球 Scholar/Notion；中国 知网/语雀；日本 CiNii/Notion | scholar.google.com 文章页→剪藏出处→引用卡；notion.so 笔记页→引用字段核对→待修复引用 | 关键词待检 web clipping / citation helper；竞品 Readwise Reader、Glasp | P/T | 私有全文/引文与版权；OPP-022,OPP-025 |
| D23 旅行与生活 | 游客/差旅管理员 | 全球 Booking/Maps；中国 携程/高德；日本 乐天旅游/じゃらん | booking.com 酒店页→保存可见取消条款→条款卡；travel.rakuten.co.jp 房型页→比较入住条件→对比清单 | 关键词待检 travel clip / hotel compare；竞品 Readwise Reader、OneTab | P/T | 价格时效/用户行程/条款；OPP-064,OPP-065,OPP-066 |
| D24 财务与结算 | 卖家财务/经营会计 | 全球 Shopify Finance/Stripe；中国 支付宝商家/电商账单；日本 Shopify/商户支付后台 | admin.shopify.com 结算页→用户手动导出CSV→本地文件；dashboard.stripe.com 报表页→导出后核对费用字段→异常清单 | 关键词待检 payout audit / csv reconciliation；竞品 Excel、A2X、Shopify 原生 | T | 财务数据/金钱准确性/原生替代强；OPP-078,OPP-081 |

**网页层面不是全域授权。** 用户操作可进一步拆为 `inputFields`、`trigger`、`outputArtifact`、`document/frame`、`userGesture` 和 `originScope`。明确区分公开页/登录后本人页/企业授权页；对企业采购、CRM、财务等不得假设用户拥有导出或抓取许可。优先复用官方 CSV/API、用户显式操作和可撤回授权，未知字段写 `UNKNOWN`。

## 三、实际脚本存在性（只有四个列表线索）

本轮公开脚本列表抽样确认可检索： [My Prompt](https://greasyfork.org/en/scripts/by-site/github.com)、[HTML5 Video Playing Tools](https://greasyfork.org/en/scripts/by-site/bilibili.com)、[GitHub Internationalization](https://greasyfork.org/en/scripts/by-site/github.com)、[Github Enhancement - High Speed Download](https://greasyfork.org/en/scripts/by-site/github.com)。所引为**站点列表页**而非具体脚本永久链接。下一阶段需要逐条展开脚本详情、作者、原始版本、SHA、许可证、依赖及权限后才能称为可转换候选。其余领域的“关键词”都不是已发现脚本。

脚本来源矩阵： [Greasy Fork](https://greasyfork.org/en/search)、[ScriptCat](https://docs.scriptcat.org/)、OpenUserJS（须核查访问状态）、作者公开仓库；扩展竞品来源：[Chrome Web Store](https://chromewebstore.google.com/)、Edge Add-ons、Firefox AMO 和 [原 43 个竞品参照](competitor-research.zh-CN.md)。站点运营条款、地区商店可见性与用户语言必须单独核对。

## 四、OpenDesk 适配，不建第二套运行时

| 标记 | 优先考虑的现有能力 | 必须另行检查的限制 |
| --- | --- | --- |
| `P` | Page USER_SCRIPT / 站点匹配 / 安装身份 / Source SHA / Page UI | Chrome `userScripts` 开关、隔离世界、`GM_*` 逐方法矩阵、`@match/@grant`、SPA |
| `T` | Tool Tab/独立工作页/本地数据/授权导入导出 | 存储与下载限制、来源身份、隐私清除、交互验收 |
| `C` | Controller / Workflow / Task/ RunHost / Authority | 跨网站权限、停止与幂等、人工提交/不可逆业务动作 |
| `SDK` | [Browser SDK 唯一执行手册](../../api/browser-sdk-execution-manual.zh-CN.md) / Registry + Host | SOURCE_WIRED、NODE_PASS、BUILD_PASS、NATIVE_PASS 各自独立；未通过则 NOT_TESTED |

四条运行路径均复用**现有**安装管理、源码哈希、依赖锁、站点授权、Page UI、Controller、Marketplace。不能把历史 [GM G0–G3 计划](userscript-ecosystem.zh-CN.md) 写成全部原生可用，不创建第二套 Browser SDK、GM 执行器、Factory 或机会账本。

## 五、独立硬门和双榜

- **LEGAL**：作者版权/`@license`、外部依赖许可、再分发与商用授权缺失，源码移植 `BLOCKED`。
- **PLATFORM**：站点政策、DRM、绕过付费、联盟链接透明性、Chrome MV3/CWS 单一用途/远程代码审查失败，相关路径 `BLOCKED`。
- **PRIVACY**：未经授权的身份、Cookie、候选人、CRM、财务等敏感数据不能跨站处理。
- **SECURITY / REAL CHROME**：尚未按实际 GM/Authority/权限作本机验收不能称已交付。
- **PAYMENT**：没有真买方、任务复用、时间节约与付款证据，不能称“商业热门”。

**大众热门实用榜**看用户直接可用性、近期采用迹象、体验/维护；**专业商业工作流榜**看同岗位重复性、节约工时、决策者/预算与维护成本。两个榜单分别保留独立维度证据，缺数据填 null，否决门不能靠平均分覆盖。Greasy Fork 的累计/每日安装、CWS 公开显示用户和 GitHub 星标**均不等于 DAU、留存或收入**。字段/算法详见 [R5 市场脚本发现](script-market-discovery-r5.zh-CN.md)。

## 六、研究优先批次（不是产品市场排名）

| 批次 | 领域顺序 | 研究动作 | 进入下批条件 |
| --- | --- | --- | --- |
| W1：轻量公共页 | D03、D01、D04、D07、D13、D14、D22 | 发现真实脚本永久链接、竞品页面和低权限页面动作 | 初步证据、版权与脚本权利 |
| W2：大众需求 | D02、D08、D10、D18、D06、D05 | 中日英搜索、本地化差异和页面/政策变化 | 原生与插件对照能复现 |
| W3：专业场景 | D09、D11、D12、D15、D17、D19、D23 | 真岗位/官方API/许可/竞品流程/买方访谈 | 数据合法 + 可衡量业务流程 |
| W4：高风险 | D16、D20、D21、D24 | 角色与Authority审计、不可逆动作、成本核对 | 所有硬门可审计通过 |

~~~text
R5.0 只读基线 → AGENTS / main HEAD / 84 OPP / 8 EXP / GM / SDK
R5.1 24 领域 + 3 地区 + 每域≥2 网站页面任务 → JSON 种子
R5.2 逐领域发现脚本/竞品永久 ID、版本、许可与页面行为
R5.3 去重与 EXISTING OPP 映射；无证据填 null
R5.4 两份独立榜单与数据/安全/权利硬门
R5.5 合法直接运行 / 授权源码适配 / 独立重新实现 / 拒绝转化
R5.6 先做真实对照和买方实证，再单独决定开发
~~~

目前无真实用户访谈、支付数据、脚本全面许可证审查、Mac 本地 `git status` 或同候选真实 Chrome 验收。以上均为 NOT_TESTED/NOT_MEASURED，不得自行升级状态。来源规则：[Greasy Fork Code Rules](https://greasyfork.org/en/help/code-rules)、[Chrome UserScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)、[CWS Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)。
