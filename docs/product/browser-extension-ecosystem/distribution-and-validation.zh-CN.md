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

## 六、未来六周的商业研究工作树（历史规划，当前执行以末尾 R1.1 为准）

| 时间 | 工作 | 交付物 |
| --- | --- | --- |
| 第 1 周 | 历史方案：当时建议 EXP-001/002/003；现 EXP-002 已归档，不再执行；当前以末尾 R1.1 的 EXP-003/001/005 为准 | 三张问题/实验卡 |
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

## R1.1-WEB · 2026-10-20 商业决策快照与下一阶段执行清单

> **状态：DECISION_RECORDED / EXPERIMENTS_NOT_STARTED。** 本节将 [R1.0 商业机会判断](commercial-opportunity-framework.zh-CN.md)、[公开竞品与价格证据](competitor-research.zh-CN.md) 和本页[获客研究](#r10-web--2026-10-20-获客经济低成本实验和核验日志)收敛为下一轮操作计划。它是研究排期，不是已开始的实验；不改变已记录的 R5 全球方向研究和历史电商 EXP，也没有产生收入或开启广告。下一轮先读本节，再检查最新 main，最后在原 8 个 EXP 中补真实证据。

### 决策 0：商业目标与唯一权威记录

**长期产品目标不是扩展数量，而是「免费浏览器内单任务第一次成功 → 可信重复使用 → 专业/团队/企业服务付费 → 维护、更新、再购买」。** 谁花钱、为哪个结果买单，比能够用 React/UserScript/浏览器自动化实现什么更重要。浏览器能力复用仅降低内部实施成本，不能证明外部需求。

| 要保留的关键信息 | 存放与更新位置 | 当前证据等级 |
| --- | --- | --- |
| 24 个全球场景研究索引、15 类重点场景、30 个已有机会子集 | [R5 场景索引](domain-relevance-universe-r5.seed.json) + [商业机会判断](commercial-opportunity-framework.zh-CN.md)；84 OPP 唯一账本为 [opportunity-register.json](opportunity-register.json) | FACT（仓库记录），市场频次 MISSING |
| 22 家官方商业模式与收费例子、CWS 公开用户快照、主要反对理由 | [competitor-research.zh-CN.md](competitor-research.zh-CN.md)；旧 43/45 竞品研究入口仍保留 | FACT（官方页面/检索快照）；付费用户与评论统计 MISSING |
| 三方向独立定性评分（A 68.7，B 68.8，C 65.4/100）及评分权重、失败风险 | [商业机会判断](commercial-opportunity-framework.zh-CN.md) | ESTIMATE（专家先验）；不得伪装验证分或 95+ |
| 8 个唯一商业实验、负责人/指标/支付证据与历史废弃项 | [commercial-experiments.json](commercial-experiments.json)；EXP-002 继续归档 | FACT（研究状态），所有真实商业指标尚无数据 |
| 关键词意图/美国与日本两个市场/Google Ads 和 CWS 规则/预算开关 | 本文 [R1.0 获客经济与日志](#r10-web--2026-10-20-获客经济低成本实验和核验日志) | HYPOTHESIS（试验设计）；月搜索量/CPC/CAC 为 MISSING |
| 唯一 Browser SDK/Host 与已存在的工具代码 | [Browser SDK 文档](../../api/browser-sdk.zh-CN.md)与 [框架状态](../../framework/workstreams/browser-sdk-status.md) | SOURCE_REFERENCE；本产品原生测试 NOT_TESTED |

**别把三个不同字母混淆**：下文 A/B/C 是这次商业机会方向，不是既有 A 通用平台、B 独立扩展、C UserScript 的发行架构标签。商业目的和发行介质必须分别决策。

### 决策 1：先测 A 的产品激活，同时并行寻找 B 的付费买方

| 排序 | 真实业务问题 | 免费入口 → 付费假设 | 关键反证 | 现有实验及何时开始 |
| --- | --- | --- | --- | --- |
| A · 首个自助体验验证 | AI 对话中的文字、提示词、图片被收藏后能否完整、可追溯地交付？ | 免费「选择→本地保存→完整读回」；以后可选团队共享/特定业务系统投递 | Obsidian Web Clipper、Readwise 和现有 AI 平台提供强免费/付费替代；用户可能只想复制 | EXP-003：当前进入**准备**，产品运行和用户采样 NOT_TESTED |
| B · 并行买方验证 | 企业每天重复操作获授权网页，能否为可靠结果与后续维护付费？ | 单任务可撤销演示 → 明确范围的实施费/维护合同 | Automa/Axiom/UI.Vision 强竞争，定制和技术支持成本可能很高 | EXP-001：仅目标用户/有预算联系人明确且获得授权后试点 |
| C · 数据来源通过再启动 | 卖家是否愿为官方导出的 Listing/SKU/报表异常检查而支付费用？ | 本地合法 CSV 检查 → 团队核对、对账、维护 | 合法字段来源与质量责任不明；广域抓取/实时数据成本高 | EXP-005：得到真实允许使用的数据样本、购买方之后启动 |

此选择是**降低下一轮求证成本的试验次序**，不是宣布 AI 收藏已实现全球第一，也不是注销电商 EXP-005/007 的历史研究。B 可能是最早产生现金流的方向；A 可能是最容易发现用户的方向；先分别验证而不是把两种目标混成一个“通用 AI 浏览器”。

### 执行顺序：每一步都必须交出实证，不用开发数量代替需求

| 步骤（依赖关系） | 下一轮具体操作 | 必须有的验收材料 | 未达到时 |
| --- | --- | --- | --- |
| **S0 · 最新 main 源码/边界核查** | 检查 `examples/sidebar-tools/knowledge-inbox/`、`web-markdown-clipper/`、`prompt-shortcuts/` 及现有 Workflow 的正式实现；挑一个已接近需求的工具作为唯一落点；逐项区分现有能力和缺口；确认网站授权与图片来源 | 使用的源码路径与 SHA、已复用的 Host/SDK 能力、缺口、隐私和权限说明 | 不新建第二保存引擎、不开发大而全 AI 平台 |
| **S1 · A 的真实最小交付** | 在获授权 AI 页面由用户点击选择文字和至少一张生成图片，保存 Markdown + **真实图片文件** + 可追溯来源；关闭/重开读回；校验失败、重复写、图片 URL 过期与撤权；先网页源代码验收，后 Mac Chrome 原生验收 | 一份非敏感的真实测试产物、图片与 Markdown、写入回执、重开读回、失败/恢复证据；不得拿静态 HTML 预览冒充实际保存 | 无法可靠取得并持久化图像则 **BLOCKED**；退回文本/本地附件的明确范围，不扩大宣传 |
| **S2 · A 的无引导需求和重复使用** | 招募约 10 位符合任务画像且自愿参加的用户；记录他们现用替代、两次自然工作周期、保存成功、明确的额外交付需求与付费请求 | 实际人数、可复查的聚合结果及反例；首轮筛选线是至少 7/10 无引导成功、至少 5 位跨周期主动再次使用、至少 2 位说明具体付费场景（全部为预注册 HYPOTHESIS） | 未达到则缩窄用途/停止 SaaS；这不是统计显著性或产品 UX≥95 的证明 |
| **S2-B · 企业付款人并行发现** | 只向具有合法业务许可的潜在客户询问真实重复流程、当前成本、审批人、可接受部署边界及是否愿有预算做单项试点；先访谈再演示 | 匿名的合格机会数量、预算确认、真实任务、使用授权、实际报价/签约/付款字段；无订单写 MISSING | 只有口头好评或没有采购人时不做企业平台 |
| **S3 · 获客经济实验设计** | 先研究 US/en 与 JP/ja 的具体任务词、竞品替代词、CWS 自然词；有合适的真实产品落地页才研究 Google Ads 小额投放；从已授权账户取得 Keyword Planner 真实数据 | 逐关键词的地区/语言/期间/搜索量/竞争强度/报价来源；获得批准后另记广告曝光、点击、实际 CPC、可归因首次成功、订单及 CAC | 没有广告授权、合规落地页、预算或真实搜索数据时支出 **$0**，所有数值保持 MISSING |
| **S4 · GO / PIVOT / STOP 复核** | 综合 S1～S3 数据比较 A 的留存/询价、B 的采购/实施成本、C 的合法数据和付费信号；把结论写回原 EXP 与本日志 | 每一项选择的证据、反证、实际数据分母、Git SHA 与日期、下一阶段资源/项目取舍 | 缺数据时明确 NOT_DECIDED，不能按主观评分放行大规模开发或付费推广 |

**边界**：图片完整保存与任意本地目录静默写入不同。Chrome 普通扩展不能默认任意写用户文件夹；只能使用真实可用的浏览器下载、用户授权选择目录或既有受控 Native 机制。云端分析仅采最小化且明确告知的成功/失败事件，不收原始对话、图片、Cookie、浏览历史或企业订单原文；真实客户数据不入公开 GitHub。

### 度量/证据模板与决策门

1. **先锁证据类型**：每条新增记录必须有 `FACT / ESTIMATE / HYPOTHESIS / MISSING`、来源 URL 或仓库路径、核查日期、目标市场、场景/OPP/EXP、观察窗口与样本分母。指标不得以空值伪装 0，也不得用 CWS 安装替代活跃。
2. **三类领先指标**：`firstVerifiedCompletion = validSavedOutputsWithReadback / eligibleFirstRuns`；`naturalRepeat = activeUsersReusingInSecondNaturalCycle / activatedCohort`；`qualifiedBuyerRequests = documentedRequestsWithOwnerAndBudget`。这不是已收集的数据；没有同意及实际事件时记 MISSING。
3. **支付与获客硬指标**：广告每关键词 `actualCPC = actualSpend / validAdClicks`；渠道 `CAC = attributableSpend / attributableNewPayingCustomers`；`contribution = collectedRevenue − variableFees − directlyAttributableSupportAndMaintenance`。没有真实订单/点击/花费或合法归因就记 NOT_MEASURED，不用估算填实绩。
4. **三道否决**：未经授权的数据/网站操作、实际图片保存失败且无法恢复、付费工作流维护成本不可控，分别独立 BLOCKED；主观评分再高也不能覆盖。
5. **产品 95+ 与商业市场评分分离**：95+ 只可作为后续真实 UX/工程目标；需要逐项测试，不能把本轮 68–69 的研究分转写成市场/产品通过。

### 下一轮完成定义 / 交接给新的网页对话

下一轮的第一任务是 **S0：按最新 main 审计「现有保存/图片能力究竟有哪些，A 所需图片真实持久化和读回缺多少」**。这是建设之前的最小阻断核查，不是重做大范围研究。随后在同一现有工具真实源码上修好 S1，并交付有证据的 Mac Chrome 验收任务；B 的采购人访谈作为另一条低代码商业工作线并行。

下轮必须报告：完成项 / NOT_TESTED / BLOCKED、现有与新增代码路径、源码提交 SHA、可复现使用流程、产品本地验收缺口、实际实验参与人数/数据及渠道预算批准状态。**暂不投入**通用爬虫平台、重复 CWS 换壳商品、未验证团队订阅后台或新一套 SDK/Host/产品统计框架。以前的 84 OPP / 8 EXP / R5 24 领域仍为唯一权威记录，不再加第九个同义实验。

## R1.2-VALIDATION-FIRST · 2026-10-21 · 低成本获客 S0/S2/S3 证据矩阵与三个可证伪实验

> 本次基于 2026-10-21 GitHub main、官方 CWS/Google Ads 资料和公开竞品/社区内容；**没有连接 Google Ads Keyword Planner、商店开发者后台、真实付款/广告/归因和客户访谈**。本轮广告花费 **未执行**，不把前期曾写的预算 `$300` 示例视为授权。下表所有搜索量、CPC、竞争指数和真实转化仍为 `MISSING`。关键词仅为 **HYPOTHESIS**，语言与搜索意图需由真实美日用户确认。

### 获客优先判断（渠道技术可行性，不是 CAC 优胜证明）

1. **US/en 与 JP/ja 任务长尾 SEO / 真实教程**：优先级第一的**低现金支出实验**；免费文章/产品演示可以检验任务意图，但制作成本、流量、自然激活均未测，不能把“可能低成本”改写成“低 CAC 已证实”。
2. **CWS 单一用途自然发现**：仅在可用产品、真实审核页和合规权限证据具备后测试。Google 的[商店分析](https://developer.chrome.com/docs/webstore/metrics)和[搜索发现](https://developer.chrome.com/docs/webstore/discovery)只能支持聚合获客观察；安装数≠活跃数，来源不确定时不绑定到广告。
3. **竞品品牌词与替代词 Google Ads**：最后才测试；[Google 商标政策](https://support.google.com/adspolicy/answer/6118?hl=en)对竞品关键词与广告文案采取不同审查，不能误导官方关联；[Keyword Planner 官方说明](https://support.google.com/google-ads/answer/3022575)提供搜索量、竞争、页首竞价的账号指标，但**此任务没有账号数据**。无审批不创建付费活动。

### 预注册 13 个具体查询（不造假 CPC）

| 地区/语言 | 实验 | 待核查词（字面查询） | 推测用户意图 | 对应的诚实落地页 | 分类 | 真实月搜量 | 竞争 | 顶部出价低/高 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| US/en | A | save ChatGPT images locally | AI 生成图真实离线 | 知识产物交付页 | 任务长尾 | MISSING | MISSING | MISSING |
| US/en | A | export ChatGPT response markdown images | 图文一起交付 | 知识产物交付页 | 任务长尾 | MISSING | MISSING | MISSING |
| US/en | A | Obsidian Web Clipper image alternative | 找替代、可能只寻竞品 | 真实功能对比页 | 竞品替代 | MISSING | MISSING | MISSING |
| JP/ja | A | ChatGPT 画像 ローカル 保存 | AI 图片保存 | 日语交付页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |
| JP/ja | A | ChatGPT 回答 Markdown 画像 保存 | 回答与图片整体导出 | 日语交付页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |
| US/en | B | automate repetitive internal web forms | 企业内网定型输入 | 企业单任务演示页 | 任务长尾 | MISSING | MISSING | MISSING |
| US/en | B | Axiom browser automation alternative | 现有付费自动化替代 | 有实测才发布的对比页 | 竞品替代 | MISSING | MISSING | MISSING |
| JP/ja | B | 社内 Web フォーム 入力 自動化 | 企业授权的反复填表 | 日语企业服务页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |
| JP/ja | B | ブラウザ 定型業務 自動化 | 浏览器重复业务 | 日语企业服务页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |
| US/en | C | Shopify product CSV validation | 卖家提供文件校验 | 合法 CSV QA 页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |
| US/en | C | seller product listing audit checklist | Listing 字段/错误检查 | 卖家 Listing QA 页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |
| JP/ja | C | 商品 CSV 必須項目 チェック | 商品导入前字段核对 | 日语 CSV QA 页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |
| JP/ja | C | Shopify 商品 CSV エラー 確認 | Shopify 商品 CSV 错误 | 日语 CSV QA 页（未建立） | 任务长尾 | MISSING | MISSING | MISSING |

**取得数据的实际动作**：账户持有人在 Google Keyword Planner 分别选 United States/English 与 Japan/Japanese，指定同一完整月份，导出 CSV 的 keyword、avgMonthlySearches、competition、topOfPageBidLow/High、currency、timePeriod、location；保存**必要聚合指标与来源、截图/导出哈希**到本文，不上传账号密码/私人客户线索。若 Google 只返回区间，应保留区间，不能改成精确值。每个词先检查 SERP 是竞品官网、功能教程、软件下载还是采购意图；竞品替代词需事实完整的对比页才考虑广告。

### 三个旧 EXP 的可证伪预注册（以下都是未来目标，不是实测成绩）

| 原实验 | 实验对象/样本建议（HYPOTHESIS） | 第一结果与可核验回执 | 付费与退出门 | 当前状态 |
| --- | --- | --- | --- | --- |
| **EXP-003 / A** | 10 位自愿参与、确实需要 AI 图文交付的用户；记录现用 Obsidian/复制/下载替代 | 10 人无指导首次任务 ≥7 完整通过（Markdown+≥1 原图文件、下载 complete、重开读回），跨两个自然工作周期 ≥5 人主动再用；明确分母及失败原因 | ≥2 人提出具体付费交付用途和现有替代成本仅是 **买方线索**；无独立付款凭证不得 `PAID_VALIDATED`。原图无法实际持久化先 BLOCKED；无复用则缩窄/STOP 团队 SaaS | `SOURCE_AUDITED / CHROME_NOT_TESTED / USER_NOT_TESTED` |
| **EXP-001 / B** | 先定向 5 位有企业工作流与预算职责的采购候选，至少提供一项获准的非敏感测试任务 | 实际流程步骤、当前人工时间/错误、网站许可和审批/维护责任均被买方认可；模拟站点不等于生产交付 | 至少取得 1 份有范围/价格/维护条款的正式报价回执，**实际签约/到账**才证明付费；无预算买方不做大范围自动化平台 | `BUYER_MISSING / PERMISSION_MISSING / PAID_NOT_TESTED` |
| **EXP-005 / C** | 3 份经明确许可的不同卖家产品 CSV（不入公开 GitHub）及对应真实字段要求 | 逐项复核缺字段、格式、重复 SKU、异常/误报；输出能复查的差异报告 | 与有预算的卖家运营方验证报价；数据许可不足、正确性不可复核或支持成本失控即 STOP；不采集未经授权后台 | `DATA_MISSING / USER_NOT_TESTED / PAID_NOT_TESTED` |

**实验仪表口径**：`firstCompleteRate = confirmedCompleteAndReadback / eligibleFirstTasks`，`secondCycleUse = naturalSecondCycleUniqueUsers / firstActivatedUniqueUsers`，`paidRate = independentlyPaidCustomers / qualifiedBuyerLeads`，`CAC = attributableChannelSpend / attributedNewPayingCustomers`，`paybackMonths = CAC / positiveMonthlyContributionPerCustomer`。无真实分母或分母为 0 记 `MISSING/NOT_MEASURED`，**不能以 0 代替未知，也不能用商店显示安装量填 DAU**。记录每一步来源和授权；不收集原对话、敏感图、Cookie、企业文件正文和用户浏览历史。

### S0–S4 更新日志（2026-10-21）

| 阶段 | 本轮实际交付 | 当前门槛结论 | 下一位有条件的操作人 / 所需证据 |
| --- | --- | --- | --- |
| S0 源码核查 | [R1.2 技术复用矩阵](commercial-opportunity-framework.zh-CN.md)读 Knowledge、Clipper、Prompt Shortcuts、Downloads Host/Workflow，记具体阻断 | **SOURCE_AUDITED / PASS_FOR_DESK_RESEARCH**；正式图文交付还不具备 | Mac CodeX 按原源码及授权测试真实 Chrome，产出文件、状态、重开日志 |
| S0 竞品/政策 | 现有 [22 家官网与任务反例](competitor-research.zh-CN.md)增量复核，含 CWS 快照及社区自选样本 | **PARTIAL**：公开档位和产品定位可查；22 家同任务测试、逐家近期评论未通过 | 先取每方向 2 家真实操作比较、近期 CWS 评论带日期采样 |
| S1 A 产品 | 本轮**未修改任何正式工具代码** | **BLOCKED_BY_REAL_IMAGE_ASSET / CHROME_NOT_TESTED** | 有批准且先完成原图真实性门，再改现有 Knowledge 最小增量，不能以模拟预览通过 |
| S2 买方/用户 | 未进行访谈、招募、客户数据访问与报价 | **NOT_TESTED** | 自愿 10 位 A 用户和 B 预算买家、C 合法 CSV 样本 |
| S3 US/JP 获客 | 13 个意图查询预注册、官方政策核对，无 Google Ads 账户和预算 | **METRICS_MISSING / ADS_NOT_EXECUTED** | 账号持有人 US+JP Planner 导出、真实落地页、单独批准预算 |
| S4 投资决策 | 保留 A/B/C 不同检验目标，2026-10-21 复核技术风险 | **NOT_DECIDED / NO_GO_TO_SCALE** | 实际激活、两周期自然复用、首个付款、可靠可变成本后方可 GO |

### 退出条件与防止研究漂移

- **GO 产品深入**需要安全许可、真实 Chrome 结果+故障恢复、明确用户可复用；**GO 商业放大**另需真实付款人、收款/净贡献与可追溯渠道，两个 GO 不能相互代替。
- **PIVOT**：A 有自然复用但不愿为收藏付费，则改为单一企业文件投递；B 有明确预算但无法维护多个站点，则只做一种授权站点；C CSV 不够价值则验证团队异常核对服务，仍须许可。
- **STOP**：原图真实性/授权不成立、买家无实际替代成本、跨两周期不复用、负贡献、长期维护不可控、竞品免费体验已足够；不得以主观 95 分强行继续。
- **当前全部为 NOT_DECIDED**：R1.2 只收窄了产品和商业不确定性，没有新订单/DAU/CAC/留存，不能因“完成文档”宣布实验 GO。

## R1.2-RECHECK-2026-10-21 · US/JP 获客计量核查与低成本实验可执行交接

> **执行结论：RESEARCH_ONLY / ZERO_AUTHORIZED_SPEND / NO_NEW_USER_OR_ORDER_DATA**。本节只补齐已有 13 关键词和 EXP-003、EXP-001、EXP-005 的口径、反证优先级及下一操作人。未连接 Google Ads 账户、CWS 发布商后台、真实买方与 Mac Chrome；真实月搜索、竞价 CPC、CAC、支付与留存全部为 MISSING。不新增 EXP、OPP、广告预算或遥测基础设施。

### 1. 官方口径：Google Ads 的“页首出价”不是实际 CPC

- [Google Keyword Planner 官方](https://support.google.com/google-ads/answer/3022575?hl=en)：平均月搜为给定期间、位置、网络范围内**关键词及近似变体**的历史均值，默认约 12 个月；竞争等级是**广告客户竞拍竞争**而非 SEO 难度；页首低/高区间约为历史出价第 20/80 百分位，**不能当实际每次点击单价**。预测点击、消耗、平均 CPC 与历史指标分开记录。
- 查询历史值按**同一完整月份时间窗**、同币种独立导出美国/en 与日本/ja 的 13 个已登记词。必填：keyword literal、market location、language targeting、network、range、search volume（若仅区间留区间）、competition、top bid low/high、currency、exportedAt、official source、文件摘要/校验 SHA。Planner 的“地区”筛选并不保证搜索者用该语言；要由 SERP 和用户意图复查。
- [官方商标政策](https://support.google.com/adspolicy/answer/6118?hl=en)：**竞品品牌作为关键词**与把商标写入**广告正文**的审核不同；不得假扮官方、诱导误认关联、用竞争品牌进行误导落地。每个替代词页需具有真实同任务对比、正确品牌标识、价格与功能披露。未具实测不得做“比 X 更好”广告。
- [官方 CWS 统计](https://developer.chrome.com/docs/webstore/metrics/)允许按地区/语言查询商店曝光、安装等；其“Users”指标基于**安装**，不代表活跃使用。不能把商店搜索/浏览/直接访问汇总指标硬分到搜索广告；不能以安装数量计算自然复用。
- 第三方 SEO 工具、搜索结果趋势、竞品安装量只能为 HYPOTHESIS 或单独标注 ESTIMATE，不得覆写 Google 官方 Planner 栏位。当前已注册 13 词无一个完成官方数值核验。

### 2. 三类渠道的“低成本”须按订单而非点击独立证伪

| 渠道 | 当前先行判断（HYPOTHESIS） | 可直接实行的无广告费动作 | 真正证伪/准入门 |
| --- | --- | --- | --- |
| 工作任务长尾 SEO / 高意图教程（US+JP） | 现金投放开销可能低；但内容工时并非零 | 分别写 1 篇**真实功能**教学/限制说明并人工分发；用自愿同意的入口标记衡量首次成功 | 若无法带来合格安装→真实任务成功→自然复用，不因自然访问上涨就判成功 |
| CWS 自然搜索 / 行业专业推荐 | 单一用途在商店可发现，获客不依赖竞价；但需发布审核与持续维护 | 先把单任务完成、权限与失败恢复在真实 Chrome 跑通，再注册明确可审查的商品资料/服务说明 | 不能把总安装视为活跃；用真实首次任务读回与 2 周期复用独立验证 |
| 竞品品牌/替代词 Ads | 有高意图但 CPC、合规、竞争更不确定；应最后验证 | 仅在官方 Planner 取量后做合规 SERP、品牌词/文案分离审查；预算先报批 | 无广告账户、官方价量、落地页、真实合格转化基线及书面预算批准，**不得投放** |

**经济否决公式（模型而非收入实绩）**：由实际点击与付款同一 cohort 得出 paidPerClick = attributedNewPayingCustomers / validAdClicks；由**真实**财务明细计算 monthlyContributionPerPayer（到账价减可变云/支付/退款/支持、维护费用）。允许的最高实际 CPC = paidPerClick × monthlyContributionPerPayer × 允许回本月数；前提是月贡献严格为正、回本月数有经营批准。再用现实 CPC、非广告获客工时和实际订单算渠道 CAC；无分母时全部 NOT_MEASURED，不能代入假定 2%/5% 转化率生成“精确 CAC”。B 的销售拜访、售前测试与实施时间也须计入实际获客/贡献成本。对自然流量同样记录研究/内容/审核/维护工时，不能假定永久免费。

### 3. 不新造账本的最小化实验记录模板

记录位置：**唯一** commercial-experiments.json 的原 EXP 状态/真实指标及本文件下的脱敏聚合证据链接。每次研究日志含 experimentId、UTC 时间/市场语言、FACT/ESTIMATE/HYPOTHESIS/MISSING、实际样本分母、同意状态、工作任务与既有替代、可核回执摘要、成功失败、第二自然周期、支付**确认**状态、可变工时/成本、来源 URL 或非公开证据编号。公开 GitHub 仅存脱敏聚合，**不上传用户对话、图片、订单号原件、客户 CSV、姓名、Cookie、授权 Token**。真实合同/订单在获授权的私有系统保管，仅在公共账本写“原件存在并经授权核验”及不可逆摘要。不要因为缺遥测而建立第二套采集/Storage Host。

**三个原实验可直接交给执行人的任务与止损：**

- **EXP-003 / A，10 位真实合格参与者**：提供同一个获授权 AI 图文任务，分别记录现有做法与 OpenDesk 无指导“选择→Markdown+一张原生图片真实文件→下载 complete→关闭/重开离线打开→来源仍可辨认”。符合画像首次无指导成功目标 ≥7/10，第二自然工作周期主动再次使用目标 ≥5/10；两组数字均为预注册 HYPOTHESIS，不是统计显著性。另问 2 个愿意支付的**具体外部交付工作结果**以及当前付费替代和可被批准的预算，口头愿意≠订单。若免费 Obsidian 已可同样可靠快捷交付，则先 PIVOT 为垂直任务而非继续开发通用剪藏 SaaS。
- **EXP-001 / B，至少 5 位预算买家发现**：采购/运营/IT 能签字者、合法网站权限、可匿名描述的一个重复流程、月内真实次数、操作失败和人力成本、现有 Axiom/Automa/API-first 替代、审计/撤权与升级 SLA；先谈**范围固定的试点报价/实施费与维护费**，再决定是否演示。至少一条有书面范围+价格+批准人的记录才是合格商机；签署/到账后才可记 PAID_VALIDATED。若客户只求免费的泛用网页录制或风险不可控，STOP/缩窄。
- **EXP-005 / C，3 份有书面许可的 CSV 输入**：收真实授权的产品 Listing/SKU 标准及人工核实的正确答案，比较字段缺失、重复/变更、误报漏报与每 100 行人工复核时间；报价是持续质量检查、对账与维护而非“解析 CSV”。不合法来源/无业务买家/服务误报过高，维持 BLOCKED；不得代替客户采集第三方受限站点。

### 4. Mac Codex 的 S1 真实产品检验单（网页研究不能代替）

1. 在用户 Mac 原路径打开现有仓库，核实最新 main、AGENTS.md、当前并行改动；不切分支、不重置、不抢占运行中的 watcher。只读核查 Knowledge、Clipper、Prompt Shortcuts 图片 asset-host 和 Browser Downloads Host，确认**单一 Knowledge 业务 Owner** 的最小补丁及授权边界。
2. 用**测试者自主授权**的无敏感样本，录制保存一段 AI 答案和一张真实原图；报告原始 MIME、尺寸、hash、图片最终文件 hash、Markdown 引用/来源和下载状态转换。started / downloadId 仅是受理，不得当 complete。Chrome Worker 重启、网页关闭重开、断网读回必须逐项复验；不能读取用户任意文件夹，涉及 File System Access 必须真实授权。
3. 失败注入：过期图片 URL、403、下载 interrupted/unknown、权限撤销、重复点击、关闭期间、下载路径冲突、不同格式 WebP/JPEG、原图与缩略图不一致。发生结果未知时先查实际产物后重试，不创建重复资产、不吞错误。
4. 执行已有定向 tests/Node 及真实 Mac Chrome production 候选（固定扩展身份/版本）并记录命令、构建 SHA、错误日志、无敏感测试产物 hash。模拟 HTML 可以辅助 UX，但绝不宣称 CHROME_NATIVE_VERIFIED。不能运行则保留 NOT_TESTED；无真实样本/权限不开发更高层 SaaS 或跨工具文件存储。

### 5. 决策含义和完成程度

**本节新增：**官方量价统计解释和无法测量项、广告前法务/落地/预算门、真实 CAC 计算条件、三个旧 EXP 的执行交接与反证。**没有新增：**官方搜索量、实际 CPC、自然流量、Chrome Native PASS、用户、企业合同、合法 CSV、订单及续费。研究质量是继续降低决策的不确定性，不是把缺失指标改为 0 或为 95 分造证据。S0 已形成源码与竞品初审，S1/S2/S3 真实实施仍未开始，S4 仍 NOT_DECIDED。

## R1.3-NATIVE-AND-BUYER · 2026-10-21 · 真机阻断、买方报价准备与投资门

> 执行环境：已连接 GitHub，仅完成最新 main 文件/相邻提交只读核查、官方竞品资料复核和以下预注册材料；**没有连接用户 Mac 本地仓库/已加载 OpenDesk 的 Chrome 真实文档/Google Ads Keyword Planner/企业账户**。因此 `NATIVE_CHROME_NOT_TESTED` 是**未取得运行环境证据**，不等同已复现某项产品 FAIL。本节更新原验证日志而不是新建实验/第二套商业架构；正式产品修改仍受 [AI 交付同源预览审批门](../browser-extension-ecosystem/ai-artifact-delivery-r1.zh-CN.md) 约束。

### S0：与 R1.2 基线相比的实际源码和并行工作核查

- GitHub 主干本次初始 `9b29ebc94adccfdd64e3742bee271d837b258418`；再次刷新见 `d3f88693b98cd9fcb143b17bd1bb88ece13af08a`（都是**研究快照**，后续提交/测试必须重读 main）。从旧 R1.2 基线 `a5addc29f8f8e528a582eeae327c42909679612e` 到本轮初始快照发生 **96 次提交**，差异含 Prompt Shortcuts 图片可信存储和 Clipper UI，而 Knowledge/Downloads Host 的重要交付缺口未被同期间提交消除；本轮最新 6 次提交的匹配改动未见 Knowledge、Clipper、Prompt、Downloads、商业文件。后续并行提交可能继续发生，勿将此快照当作持续锁。
- Knowledge `examples/sidebar-tools/knowledge-inbox/` 配置为 **1.2.7**；`src/knowledge/page.js` 仍取 `image.currentSrc || image.src`，`src/knowledge/model.js` 以 `imageCount` 保存图片数量；`src/knowledge/service.js` 的 `capture.image` 直接调用 `chrome.downloads.download` 并返回 `downloadId`。源代码中**没有**为该图片写入可持久回读的原始 MIME/bytes/SHA-256、下载终态、Markdown 本地资源绑定与跨 Worker 业务交付回执。**SOURCE_GAP_PROVEN / REAL_DOWNLOAD_NOT_TESTED**。
- Web Markdown Clipper **1.2.3** 复用 `clipNotes.save/get` 的文本逐字段读回和结果未知防重试；该库没有原图二进制交付职责。Prompt Shortcuts **1.1.8** 的 `trusted/asset-host.js` 已在受控 Chrome local 保存经缩放或重新编码的 64 KiB 内 PNG/JPEG/WebP **按钮小图**，不能据此认定 Knowledge 可保留原图原始字节。不得混用两工具存储。
- `src/platform/chrome/browser-downloads.js` 现有受限 Host 提供 `download/getOwned/listOwned/cancelOwned`；`download` 回 `{status:"started"}`，`getOwned` 区分 `in_progress/complete/interrupted` 并可查询收取字节；下载引用由内存 Map 持有，**Worker 重启会丢**。这是能复用的公共状态查询能力，但不是本次 Knowledge 已经接入的证据。另一 `src/platform/downloads/index.js` 属 Controller 通用结果导出，不是 Knowledge 图片附件实现。
- [专项工作记录](../../framework/workstreams/ai-artifact-delivery-r1-20261020.md) 明确 `PREVIEW_PENDING_USER_CONFIRMATION / PRODUCT_IMPLEMENTATION_NOT_APPROVED`；本轮仅作只读验证、商业文件更新，**不改** `src/knowledge/*`、正式 Knowledge UI、Browser SDK/Host/Native、正式工具包。

### S1 / EXP-003：真实 Mac Chrome 验收准入和失败矩阵（未执行，不是 PASS）

**准入**：先由专项 Owner 确认现有同源预览（正式 Knowledge HTML/CSS/JS + 独立模拟 Host）是否获用户批准；没有批准不得为了 R1.3 直接重构正式产品。测试人员持有自选非敏感素材/合法 AI 会话及 Chrome/文件读回许可。可先**只读**验证现状；源码存在明确缺口不代表新实现自动获批。

| 实测点 | 必须保留的真实证据和负面判据 | 本轮结果 |
| --- | --- | --- |
| 正常图文交付 | 固定候选构建 SHA、扩展真实 ID、同一回答的 Markdown/source/时间、原图可信来源与 MIME/尺寸/bytes/SHA-256、落盘文件 SHA-256、Chrome 由 started→complete 的状态及 Markdown 图片引用实际存在 | `NOT_TESTED`；源码只有启动下载，无终态/原图文件回执 |
| 关闭重开和断网 | 重开 Knowledge 记录、**重新打开真正磁盘图片与 Markdown**；使用经过明确授权的文件读取，而非仅 Chrome 下载行或 HTML URL | `NOT_TESTED` |
| HTTP 403 / 过期 URL | 获取失败后可辨认的具体错误，不能显示“已保存原图”；若仅返回下载 ID，继续核查 Chrome terminal | `NOT_TESTED` |
| 下载 `interrupted` / `E_OUTCOME_UNKNOWN` | 终态与任务记录一致；未知时先核查已有文件/Chrome 记录，**不自动重试** | `NOT_TESTED`；现有 capture.image 不提供该任务级保证 |
| 网站或工具撤权 | 所有后续敏感操作拒绝；已经开始的 Chrome 任务只如实报告可能存在的结果，不能伪造“已撤销下载” | `NOT_TESTED` |
| 重复点击、路径冲突 | 同一业务交付至多一份经核实的资产；`conflictAction:uniquify` 不是业务幂等；多次点击不得无声生成重名副本 | `NOT_TESTED` |
| Worker 重启/来源图片切换 | 重启后重新关联记录与真实状态；`getOwned` 引用可失效须显式 UNKNOWN 并核查 Chrome 下载，不能将缩略图声称为原图 | `NOT_TESTED`；当前 Host 内存引用是已核的源码风险 |
| 回归/安全 | 原 Knowledge 搜索、编辑、未保存保护与来源、Clipper、Prompt Shortcuts 保持可用；拒绝非授权域名、越权本地文件写入 | `NOT_TESTED` |

本网页执行场所 **未获取**：Mac 上可执行的源码/Chrome profile、候选生产构建 SHA、真实下载文件、原图 hash、测试日志和具体本地命令退出码。因此**没有运行** `npm run build`、`node --test` 或原生 Chrome 测试，不填任何 PASS、FAIL 数量。现场 Codex 需先用 `git status --short`、`git rev-parse HEAD`、实际加载扩展路径/ID/权限和当前 watcher 做非破坏性核验；仅在实际审批和诊断允许后执行相关已有定向测试与真实 Chrome 手动下载读回，保留文件摘要与操作日志。任何业务缺陷先锁定来源、复现及责任 Owner，再判断是否需要最小源码修改。

### S2 / EXP-001：五位**真正有预算决策权**的买方访谈与固定范围报价卡（已准备、未联系）

先定一个可被客户合法授权的试点：**一个指定 Origin/企业站点、一条人工触发的重复网页流程、最多八个明确字段、一个终态读回、用户审核/确认后才执行任何有影响的动作**；由现有受控 Workflow 和许可门执行，回归包括撤权、Stop、误操作恢复与版本更新。原则上不采集真实生产凭证，不接受越权录制；客户明确拒绝站点使用权即 STOP。无需为访谈开发第二套自动化引擎。

| 访谈配额（仅角色候选，不是已找到真人） | 决定是否符合合格采购人的硬问题 |
| --- | --- |
| 1. 运营负责人 | 是否管理该重复任务、最近四周实际发生频次和可支配的流程改造预算？ |
| 2. IT/信息安全预算负责人 | 能否批准该 Origin、权限、日志保存、撤权和支持协议？审批后是否真的有采购责任？ |
| 3. 客服或销售运营负责人 | 上一次失败/返工时间和可验证的金额损失？是否有该工作流的席位或服务预算？ |
| 4. 电商/财务运营负责人 | 现有 API/官方导出/Automa、Axiom、Ui.Vision 是否已经足够？自己会因哪项失败恢复付费？ |
| 5. 采购/业务系统交付负责人 | 谁是最终签约人、采购流程/额度/法务约束、是否能签署试点及后续维护协议？ |

每位都问**同一组**可证伪问题：① 最近一次真实任务的输入/输出和频次；② 当前人力分钟数及返工；③ 最强免费/付费替代；④ 谁拥有站点授权；⑤ **谁可以签付款和审批的书面文件**；⑥ 针对固定范围是否愿意审核 SOW、实施费及每月维护费；⑦ 自己可批准的金额区间、采购周期、合规限制；⑧ 什么条件下直接拒绝。候选若**没有预算/购买影响力**应从“五位预算买家”分母剔除，不把普通产品用户凑数。

**统一 SOW/报价草案**（非正式报价，**未发送、未经买方批准**）：交付对象=上述 1 Origin/1 流程/≤8 字段/1 结果回读；包含权限审阅、审计与撤权测试、一次部署、一次现场验收及 30 天范围内缺陷处理；**不包含**绕过风控、客户系统账号共享、多个新站点、任意批量爬取、长期 24x7、支付/退款/不可逆自动提交。报价字段：实施费 `MISSING_PENDING_ESTIMATED_HOURS`；月维护费 `MISSING_PENDING_SUPPORT_COST`；含支持小时 `MISSING`；客户明确 SLA `MISSING`；第三方/API 成本 `MISSING`。先核实工程含成本工时和客户预算再冻结一个真实数字与币种；**未知价格不能算已报价验证**。每份真实回执仅在获得授权后以脱敏摘要和私有证据标识写回 EXP-001。

访谈完成判据：先争取 **5/5 合格预算采购人实际完成访问**；至少 **1 份带范围、实施/维护金额与具名公司授权批准角色的书面反馈/报价请求** 才升格为有效商机。口头“感兴趣”不是报价/收入；只有实际签约与可核付款才能记 `PAID_VALIDATED`。当前 `INTERVIEWS_0_DONE / BUYERS_MISSING / QUOTES_NOT_SENT`，这里的 0 是**本轮执行记录**，不是把长期未知业务分母写成 0。

### S3/S4：C 数据许可、13 关键词和获客经济硬门

- **C / EXP-005**：尚无经卖家书面许可的 CSV、字段正确答案、预算买方。等到最少三份合法导出/客户提交文件、授权用途及人工标准后，才核对字段缺失、重复 SKU、误报漏报和每 100 行人工时间；文件原件留在客户授权位置，不公开上传。当前 `BLOCKED_BY_AUTHORIZED_DATA`，不启用 Seller 私有站点爬虫。
- **Google US/en + JP/ja 13 词**：继续使用上节已列的 13 条 literal，**不翻译成别词、不另报新量价**；仅账户持有人在已授权 Keyword Planner 分别按地域、语言、同一完整月份、Google Search Network、官方币种导出 `avgMonthlySearches/competition/topOfPageBidLow/high`、导出时间和文件 SHA。Google 页首 bid percentile 是历史广告出价参考，**不是实际 CPC**；本轮 `13/13 OFFICIAL_METRICS_MISSING`，不接入广告账户、不建立 campaigns、`AD_SPEND_NOT_EXECUTED`。需另有合规比较落地页、预算书面批准及可归因的真实任务转化，才能测实际 CAC。
- **免费→付费要有两条独立证据链**：免费首次结果和两个自然周期复用（分母为真实自愿参与 cohort）；团队买家独立承认具体维护/集成价值、固定报价、实际采购付款。贡献应扣云/API、实施与持续维护、支持、退款/支付和自然渠道内容工时；缺订单/工时与可归因点击，`CAC/payback/monthlyContribution=NOT_MEASURED`。CWS 安装和竞品安装都不替代活跃、复用或订单。
- **当前决策（每方向独立）**：A=`NOT_DECIDED / BLOCKED_BY_PRODUCT_EVIDENCE`；B=`NOT_DECIDED / BUYER_MISSING`；C=`NOT_DECIDED / AUTHORIZED_CSV_MISSING`；付费渠道=`NOT_DECIDED / NO_ACCOUNT_OR_BUDGET`。没有真实付款、自然重复、可核 Mac Chrome 文件就不放大投入，也不发布“95 分已达标”。

## R1.4-EVIDENCE-EXECUTION-CLOSEOUT · 2026-10-21 · 实际执行结果与未跨过的证据门

> **保留原始商业目标 T1–T4 与 A/B/C、84 OPP / 30 候选 / 8 EXP；EXP-003 仍是 Research Clip & Cite，EXP-002 Page QA 继续商业 STOP。** 本轮**只执行** GitHub 最新 main / AGENTS.md / 三份权威商业文件 / 有关正式源码只读对照，以及官网证据复核；没有执行 Chrome 或企业购买实验。相对 R1.3 历史快照 `795429a47bdb9b2e19420ea80ffe7d225aa41c9a`，本轮该次主干快照 `c5506fd0993b1f94c726e645463b08649f67460a` 前进 72 次提交；compare 中匹配的 Prompt Shortcuts、Web Markdown Clipper、Knowledge / scoped Downloads 文件路径共 14 个（具体见 GitHub compare，主干随并行工作继续变化）。此处 SHA **只是源审计点，不是 Chrome 构建 SHA**。

### P1：单一真实任务、代码所能证明的边界

- **FACT_SOURCE**：`src/knowledge/page.js` 获取显示中图片的 `currentSrc || src`，操作后 UI 仅提示“已请求下载，请在 Chrome 确认保存”；`src/knowledge/service.js` 中 `capture.image` 直接调用 `api.downloads.download` 并仅回传 `downloadId`；`src/knowledge/model.js` 的 `imageCount` 只是计数。未看到 Knowledge 交付链把原图实际 MIME/bytes/hash、Markdown 本地附件引用、Chrome 下载 terminal 及离线重开读回做成同一持久回执。
- **FACT_SOURCE**：`src/platform/chrome/browser-downloads.js` 已有 `getOwned/listOwned` 查 `in_progress/complete/interrupted`，但 Knowledge `capture.image` **尚未通过该状态回执完成交付**，且 Host 使用 Worker 内存 owned-ref，重启可能无法恢复引用。通用服务存在不等于此正式功能已接线；Prompt Shortcuts 的 ≤64 KiB 压缩按钮图也不证明保存 AI 原图。
- **BLOCKED_BY_APPROVAL_FOR_PRODUCT_CHANGES**：专项目录 [原版 UI 同源模拟预览](../../../examples/sidebar-tools/knowledge-inbox/preview/index.html)仍待用户确认；既有工作记录状态 `PREVIEW_PENDING_USER_CONFIRMATION`。本商业任务不得未经批准改 Knowledge、Host、SDK、Native 或独立工具正式包。只读源核查和经授权的现有产品手动点击不需要此产品修改批准。
- **真实产品验证 `NOT_TESTED`**：本执行环境没有用户本机已安装 OpenDesk 的 Chrome 控制、Profile/真实扩展 ID、文件落盘访问与授权样本。未运行 Mac `git`、`npm`、Node、真实 Chrome，未取得候选 build SHA、原始/最终文件哈希、Chrome started→complete/interrupted 状态、PNG/JPEG/WebP 读回、网络中断/403/撤权/重启/双击回归结果。**源码阻断不是已复现的 Chrome FAIL**。
- **本地下一条最短操作**：Mac Codex 先只读核实 `git status --short`、`git rev-parse HEAD`、`dist/development` 的真实加载状态/extension ID、Profile、现存 watcher；用户授权的无敏感 AI 原文+一张原生图，按正式功能“保存回答/Markdown/下载图片”分别执行，再查 Chrome 下载终态、本地文件 MIME/bytes/SHA-256、Markdown 来源与图片引用，关闭/重开并断网读回。只评价原正式产品**实际上达到哪步**，不能把分别落盘的文件当成已经业务绑定的交付。无批准不修改正式源码；失败保留精确动作/截图/错误及现有数据未退化证据。
- **公平竞品基准**：同一素材给 Obsidian、Readwise；Obsidian 的“Download attachments for current file”、Readwise 的注释 MD/全库 ZIP/带标注 PDF 必须区分交付形态。没有可运行账号和文件的项目仍 `OFFICIAL_DOCUMENTED / NATIVE_NOT_TESTED`。

### P2–P6：真实预算、合法数据和获客经济

| 工作 | 本轮新增/核对的事实 | 真实商业结果 / 阻断 |
| --- | --- | --- |
| EXP-001 有预算买家 | 五位合格采购人角色、固定范围试点 SOW 仍按 R1.3：一个获准站点 / 一条明确任务 / ≤8 字段 / 一次结果读回 / 人审 / 撤权恢复；新核 [Power Automate 官方许可](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq) Premium 15 USD/用户/月有人值守与 Process 150 USD/机器人/月无人值守，作为强成熟替代。 | 本轮合格访谈 **0**、真实报价反馈 **0**、付款 **0**；尚无用户授予的联系对象/对外沟通授权，客户现有 RPA 授权、预算、实施/支持小时、维护 SLA **MISSING**。不外联、不造数字。 |
| EXP-005 卖家 CSV | [Shopify 已有 CSV 导入校验](https://help.shopify.com/en/manual/products/import-export/common-import-issues)，[Google Sheets 已支持按列去重](https://support.google.com/docs/answer/6325535?hl=en)；基础格式/重复检查付费差异进一步变弱。 | 卖家授权 CSV、字段正确答案、真实误报/漏报、每百行人工核对、买方预算均 **MISSING**；不访问后台、不开发通用爬虫或新产品。 |
| US/en + JP/ja 13 词 | **严格保留 R1.2 的 13 条 literal**、两个目标市场和同一个完整月份；[Google 官方帮助](https://support.google.com/google-ads/answer/6325025?hl=en-en)说明 Planner 账号与账单资料准入及地区/语言/网络筛选。 | **13/13 官方月搜量/竞争/低高 bid MISSING**，没有账号授权；真实 CPC、渠道激活/自然复用、获客净成本、订单、CAC、回本 **NOT_MEASURED**，本轮花费广告费 **0**。 |
| 实际代码复用经济 | 现有 Knowledge/Clipper/Prompt、SDK/Host/Workflow 和发行能力真实存在。 | 只成立 `SOURCE_EXISTS`；新增代码、开发/验收/安装权限/兼容/售前/客服/站点维护工时与净贡献还没有同一候选实测，不可把框架复用直接计作盈利。 |

### 现实决策与最小下一动作

| 方向 | 决策 | 核心不足与下一证据 |
| --- | --- | --- |
| A · EXP-003 | `NOT_DECIDED` | **完整原图+MD+离线重开未测**；先让真实 Mac 的现有产品跑单次任务并同步用 Obsidian 作强免费反证；专项源码需预览审批后才能修。 |
| B · EXP-001 | `NOT_DECIDED` | **有预算人/真实 SOW 金额/采购反馈缺失**；授权后先完成一位真正有预算采购人的访谈，特别核对客户已有 Microsoft/Axiom 替代和支持责任。 |
| C · EXP-005 | `NOT_DECIDED` | **无合法 CSV/业务真值/买家**；只有证明超出 Shopify/Sheets 原生检查的具体复核结果才值得做。 |
| 付费获客 | `NOT_DECIDED` | 13 词真实量价、真实购买归因与所有维护成本均缺；先取授权 Planner 导出而非投钱测假想转化。 |

**最低成本最能缩小不确定性的单步**：在现有 Mac Chrome 不改代码，用一个自己有授权的非敏感图文样本获取可重开的实际 MD/图片文件及下载终态、原图/最终文件哈希，必要时同一素材运行 Obsidian。若已暴露产品链缺口，就锁定 `NOT_COMPLETE` 的具体环节并走现有审批；继续写规划文档不能替代真实产品结果。B 合格买家联系授权可独立并行。
