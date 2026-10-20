# OpenDesk 获客、合作伙伴和商业实验 R2

> **2026-10-12 商业决策更新：**下文 EXP-002 Page QA 的商业首发与六周计划为旧候选，现仅保留技术实验价值、商业验证暂缓。新增长期研究重点为[电商工具宇宙](ecommerce-tool-universe.zh-CN.md)，优先调查 EXP-005 卖家工作流与 EXP-007 消费购物价值；真实访谈、数据权限与付费证据尚未取得。[查看决策](commercial-decision-ecommerce-20261012.zh-CN.md)。

> 2026-10-12。本文件是推广与实验的执行方案，**没有真实获客、合作合同、CWS 付费转化或自然留存数据**。实验状态以 [commercial-experiments.json](commercial-experiments.json) 为准。

## 一、商店不是唯一获客渠道

| 获客模式 | 商品与目标用户 | 第一项小实验 | 不能误判的指标 |
| --- | --- | --- | --- |
| Chrome Web Store 搜索 | B 单一用途 QA/SEO | 独立清楚的功能演示及权限说明 | 商店曝光/安装 ≠ 真正活跃 |
| 官网 SEO / 问题教程 | A 工具/B 产品/C 脚本 | 一篇解决真实页面问题的教程 | 有效激活，不是单纯访问 |
| GitHub 和开发者社区 | C 作者、Factory | 可运行示例+真实发行/回滚文档 | Star ≠ 商业需求 |
| Greasy Fork / 脚本目录 | C 小工具 | 精选 5–10 个真实脚本与失效报告 | 下载 ≠ 可信更新或付费 |
| 行业社群 | QA/卖家/客服/研究 | 邀请用户演示真实工作流 | 用户留言 ≠ 下单 |
| 企业定向试点 | 私有流程和维护服务 | 找预算负责人做一项范围明确的试点 | 无签署采购或付款不计收入 |
| 实施商/ISV 联合交付 | 行业扩展/私有工具 | 一个合法客户项目按贡献分工 | 不能公开复制白标商品刷商店 |

Chrome Web Store [统计指南](https://developer.chrome.com/docs/webstore/metrics)明确指出 Users 指标只表示安装，并不代表产品实际使用。真正的漏斗是：**发现 → 安装 → 第一次自主完成任务 → 第二次自然使用 → 实际付费 → 续费/扩张**。若收集必要统计，应先满足明示用途、最小化与隐私披露，不暗中采集浏览历史。

## 二、四种主要购买者需要不同说明

- 普通用户：在当前网站点一下可以解决哪件具体事？可随时停用吗？
- 职业用户：比原有流程准确多少、少多少重复操作？可导出结果吗？
- 团队主管 / 企业采购：角色、审计、权限、撤回、维护合同、售后是什么？
- 开发者和代理商：能否用相同代码安全打包和维护不同客户产品，而不是自己做 MV3/审核？

产品说明首先讲**场景与结果**，而非 Browser SDK、WXT、GM、React 等内部技术名词。

## 三、企业白标与独立商品的特别边界

[Chrome Web Store 重复内容 FAQ](https://developer.chrome.com/docs/webstore/program-policies/spam-faq/)要求高度相似的体验不得批量公开上架；某些特定 Host、企业受限发布或 B2B/B2B2C 白标例外有前提。其中企业白标的例外明确要求 **unlisted 且直接向客户分发**，并按说明交代用途；不是“有白标二字就能无限上架”。若开发企业私有包，先确认客户 Host 限制/授权及具体发行渠道，不能规避 CWS 的单一用途审查。

建议合作顺序：网页开发/SEO 代理商（QA 检查）；企业 SaaS 实施商（私有按钮和表单）；卖家运营服务商（Listing 完整性检查）；研究团队（溯源和笔记）；SaaS 产品厂商（有授权的网页侧扩展）。各合同必须定明数据权、故障支持、更新/撤销和谁负责商店审核。

## 四、三组当前优先研究的商业实验（未执行）

| 实验 | 用户故事 | 用户与买方 | 应测量什么 | 主要阻断 |
| --- | --- | --- | --- | --- |
| 企业工作流付费试点（EXP-001） | 在获批准的内部测试页面执行有审计的重复任务 | 一线运营 / IT 或运营预算负责人 | 真实任务成功、报价、实际采购/付款 | 客户数据权限、网站变化、支持承诺 |
| 卖家 Listing/SKU（EXP-005） | 在授权的卖家后台只读检查 Listing/SKU 字段，生成问题报告 | 店主/卖家运营主管 | 真实频次、合法数据、付费方、适配成本 | 平台条款、数据授权、后台变化 |
| 消费购物到手价（EXP-007） | 用户主动估算并比较到手价和商品规格 | 消费者/付款者待验证 | 数据准确性、自然回访、获客经济 | 价格/税费许可、联盟营销和信任 |

研究剪藏 EXP-003 和脚本作者发行 EXP-004 仍是独立候选；作者脚本应先验证安全更新/回滚。**EXP-002 Page QA 商业验证已归档，不再进入当前六周计划**。未经额外授权不联系用户、访问商家账户或收款。

## 五、标准证据门与样本设计（仅为预注册实验建议）

| Gate | 进入要求 | 必须记录为不通过的情况 |
| --- | --- | --- |
| G0 合规与授权 | 确认网站、隐私、商店政策和数据权 | 不合法或无法最小权限 |
| G1 需求 | 大约 8–12 位符合目标岗位的访谈者、真实任务观察 | 只有假设或诱导式问卷 |
| G2 核心使用 | 5–10 位非开发者指导的测试者完成核心流程 | 无真实 Chrome 核验、反复失败 |
| G3 重复/付费 | 至少两个自然工作周期的真实回访，另记报价/订单 | 只使用一次、只有口头购买意愿 |
| G4 单位经济 | 真实支持、适配、上架与销售成本/贡献 | 成本不可控或维护长期亏损 |

以上样本是**可执行研究起点，不是行业统一统计阈值**；每个实验应预先登记通过条件、观察周期和失败时措施，不能做完后随意改线。

访谈问题优先用：“上次做这个任务是什么时候？能演示吗？现有替代是什么？是谁批准工具和预算？”而不是“你愿意每月花 X 元购买这个吗？”真实支付与有预算采购要独立记录。

## 六、未来六周的商业研究工作树

| 时间 | 工作 | 交付物 |
| --- | --- | --- |
| 第 1 周 | 确认 EXP-001/002/003 的买方、网站、真实任务与授权 | 三张问题/实验卡 |
| 第 2 周 | 实际访谈、记录频次和已付费替代品 | 匿名来源证据和明确的反例 |
| 第 3 周 | 用现有工具/受控原型执行最小任务 | 一项可重复的真实使用结果 |
| 第 4 周 | 分析失败、操作时间、自然重复使用 | G1/G2 证据及改进/淘汰 |
| 第 5 周 | 有购买人群才测试报价/试点，其他测试留存 | 真实商业证据，不能虚报收入 |
| 第 6 周 | 复核安全、合规、毛利和维护，决定去留 | GO / PIVOT / STOP 与下一步工程建议 |

**按周推进不等于自动运行**：本次未建立真正的周度提醒、定时监控、CRM 联系或收款系统。

## 七、商业渠道停止线

不得出售浏览历史、未授权抓取网站数据、刷 CWS 安装或评价、未经用户相关动作自动放联盟代码、把同一插件公开换壳泛滥上架。CWS 的 [Spam 规则](https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse)、[有限用途](https://developer.chrome.com/docs/webstore/program-policies/limited-use)、[Affiliate 规则](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads)均应在每次商业化评审重新确认。

## R1.0-WEB · 2026-10-20 获客经济、低成本实验和核验日志

> 本节增量于原 R2 渠道文档；**没有广告账户授权、账户查询、KeyWord Planner 导出、投放预算批准、真实 CWS 发布效果或付费用户**。本日状态：DESK_RESEARCH_ONLY；CPC、搜索量、竞价强度、CAC、LTV、转化、留存一律 MISSING。不把一个试验计划当作投放 PASS。

### 渠道选择：三种要分开归因

| 渠道 | 搜索意图 | 优先投放/分发的产品 | 经济性风险 | 明确的验证动作 |
| --- | --- | --- | --- | --- |
| 竞品品牌词/替代词 Google Search | 替换现有方案；部分纯找官网 | A 仅针对有实际比较页的剪藏/交付；B 只在已解决具体任务时 | 可能昂贵，品牌词并不必然低竞争；有商标广告文案限制 | 用 Keyword Planner US/en 和 JP/ja 分区读取月搜索量/Competition/页首竞价，再审批小额测试 |
| 任务长尾词 Google Search / 内容 SEO | 用户已描述具体要做的工作 | A 图文交付，B 表单自动化，C 卖家文件对账 | 搜索量可能很低，但首次任务完成意图更接近产品价值 | 落地页演示单任务，分析任务完成与合格线索，不只数点击 |
| Chrome Web Store 自然发现 / 教程 / 推荐 | 搜索浏览器里可马上解决的问题 | 明确单一用途的 A；C 视是否适合发行 | CWS 曝光和安装不代表活跃，平台规则和编辑推荐不可购买 | 真实店铺元数据+可访问 UI+正式分析后台，和官网 UTM 访问分开统计 |

政策 FACT：[Google 商标广告政策](https://support.google.com/adspolicy/answer/6118?hl=en)说明商标**仅作为关键词**通常不会受到该商标投诉限制；竞争对手在广告正文使用商标或误导性表达可能受限。不是商标可自由使用在文案、域名、店铺名中的授权。[Google 关键词规划工具](https://support.google.com/google-ads/answer/3022575)提供地区/网络条件下的平均月搜索量、Competition 与页首出价范围，但**未读取 OpenDesk 广告账号**。[CWS 搜索发现](https://developer.chrome.com/docs/webstore/discovery)依赖 Listing 质量、评分与使用等因素；[CWS Spam FAQ](https://developer.chrome.com/docs/webstore/program-policies/spam-faq/)禁止高度重复的换壳扩展、伪造评论/诱导安装。[CWS 隐私披露](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements/)要求对用户数据用途透明并取得必要同意。

### 首轮市场与关键词预注册（尚无实际量价）

- 市场一：美国 US，英语 en；只研究英语网页任务和 Google Search/CWS，不把用户量视为全球平均。
- 市场二：日本 JP，日语 ja；单独翻译和核查本地查询意图，不直接用英文的搜索量推日语 CPC。
- A：`save ChatGPT generated images locally`；`export ChatGPT prompt and images`；`ChatGPT to Obsidian image attachments`；`save AI responses as markdown`；日语 `ChatGPT 画像 保存 フォルダ`。
- B：`automate repetitive web forms`；`internal website form automation`；`browser based data entry workflow`；`Axiom alternative`（仅关键词候选，广告正文不能暗示关联）。
- C：`shopify listing audit CSV`；`check product listing missing fields`；`seller product CSV validation`；`browse ai alternative`（同上）。
- 对每个关键词必须先补：`keyword`、`country`、`language`、`intent`、`period`、`avgMonthlySearch`、`competition`、`topPageBidLow`、`topPageBidHigh`、`actualCpc`、`actualConversions`、`sourceURL`、`checkedAt`。目前数值全部 **MISSING**，不能由常识估计“低 CPC”。
- 广告落地页目标：A 只承诺「主动将 AI 图文工作产物保存/导出」，B 只承诺「一个获授权的企业重复操作」，C 只承诺「用户提供的合法卖家文件核查」。不能借竞品商标伪装官网，不默认自动上传用户网页内容。

### 第一次成功与付费漏斗（低数据版本）

`landing_visit → cws_listing_visit(聚合) → install(聚合) → first_verified_save_or_task → user_initiated_second_work_cycle → qualified_team_request → paid_order → renewal`

- 统计口径：落地页 UTM campaign/keyword、CTA、隐私披露后的可选匿名产品事件（首次成功/失败类、时间区间、无原文）、付款订单系统的已付款状态。CWS 商店安装是聚合量，**不能未经证据逐人归因为同一广告点击**。
- **North Star：实际完成一个自主任务且用户拿到结果/写入回执**，不选「浏览器安装数」。随后按 cohort 跟踪至少两个自然使用周期；B2B 记有预算决策者、试点约定与到账，不把邮件回复算订单。
- 原始 AI 提示词、网页正文、图像、Cookie、浏览记录、企业财务数据不应写入公开研究账本或默认分析事件；数据上报必须最小化、明确说明、允许拒绝。
- `activationRate=verifiedFirstSuccess / eligibleFirstRuns`，`repeatRate=repeatIndependentUsers / eligibleActivatedCohort`，`paidRate=paidCustomers / qualifiedLeads`，`CAC=approvedChannelSpend / newAttributablePaidCustomers`（分母为 0 时 MISSING，而不是 0）；`contributionPerCustomer = collectedRevenue - variableCloudCost - refunds - paymentFees - directlyAttributableSupportAndMaintenance`；`payback = CAC / monthlyContribution` 只对真实贡献计算。
- **竞价上限决策**：在真实用户得到初始漏斗后，`maxBreakEvenCPC = P(paidCustomer | adClick) × riskAdjustedExpectedContributionPerPaidCustomer`，实际愿付 CPC 应低于该值并留有支持/归因误差余量。公式不是当前可用 CPC 报价。
- 预注册试验建议：先自然流量/定向访谈 10 位用户取得一次成功与两次自然周期；再申请单渠道限定预算的付费试验。**示例预算上限 $300、14 天只是供批准的 HYPOTHESIS，不表示用户已批准、平台已扣款或 CPC 已知**；未获批准即保持 $0 支出。不要平摊三个渠道稀释信号，优先 A 一个高意图词组。

### 与唯一 EXP 实验账本对齐

| 实验 | 最初业务目的 | 新增渠道可验证问题 | 缺口/停止条件 |
| --- | --- | --- | --- |
| EXP-003（A） | 研究剪藏及跨工作周期复用 | AI 图文完整交付后能否吸引自然搜索/CWS 用户且有重复使用？ | 两自然周期不复用、图片不能可靠读回、无实际付费请求即不升级 SaaS |
| EXP-001（B） | 企业授权网页流程试点 | 能否直接找到愿为单任务部署与维护付款的买方？ | 无真实授权/买方/签约证据就不做多站点自动化销售 |
| EXP-005（C） | 卖家 Listing QA | 卖家是否愿为合法数据的异常对账而付费？ | 缺官方文件/许可或无法复核异常则停止拓站 |

### 2026-10-20 核验日志（原文档持续追加，不建第二工作流表）

| 日期 | 事件 | 状态 | 证据/数字 | 后续动作 |
| --- | --- | --- | --- | --- |
| 2026-10-20 | GitHub main 原有 84 OPP、8 EXP、R5 24 场景索引核查 | FACT_FOR_REPO_SNAPSHOT | [OPP](opportunity-register.json)、[EXP](commercial-experiments.json)、[R5](domain-relevance-universe-r5.seed.json) | 仅挑既有 ID 试点，不加新功能账本 |
| 2026-10-20 | 22 家官网价格/商店公开渠道参考 | FACT_FOR_PUBLIC_PRODUCT_AND_PRICE | [竞品增量](competitor-research.zh-CN.md)；非真实收入 | 补逐家 30 条近期评论和同任务复现 |
| 2026-10-20 | Google Ads 搜索量/CPC/投放后台验证 | **MISSING / NOT_EXECUTED** | 账户、预算、查询导出、真实广告结果均无 | 获授权后读 Keyword Planner，未授权不付费 |
| 2026-10-20 | 三项 OpenDesk 自有商业实验 | **NOT_TESTED** | 客户数/安装激活/成交/留存/收入均 MISSING | 优先 EXP-003 首次结果；并行寻找 EXP-001 的有预算买家 |

验收定义：下一次迭代先把每一个 MISSING 对应到可访问的数据源、操作人及实际输出回执；不得将“创建实验卡”“写文档”“竞品有收费”当作用户转化或产品 UX 95+ 的证据。
