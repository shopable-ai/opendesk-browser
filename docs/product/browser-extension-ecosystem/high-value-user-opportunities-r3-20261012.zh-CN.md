# OpenDesk Browser 高商业价值用户 R3：跨行业工作流与创作者数据事实核查

> 日期：2026-10-12；状态 **RESEARCH_ONLY / NOT_VALIDATED / NO_CODE_CHANGES**。远端 GitHub main 源码与公开资料研究；无法访问用户 Mac 工作区，因此本轮不声称本地 git status、并行编辑与真实 Chrome 状态已验收。
>
> **本篇是 R2 的证据补充和研究排序，不是第二个机会账本。** 唯一 84 OPP、8 EXP、R8 188 项能力及 E01–E40 不增删重编号；本文 W01–W30 是微任务检索序号，不是新 OPP 或 30 款插件。Page QA Inspector 继续 DEPRECATED / NO_RELEASE。
>
> 结论：**X 维度有效，自媒体“优先商业方向”尚不成立。** 首先验证商家结算/退款/费用差异复核（链接 EXP-005、OPP-016/018/078/081），创作者佣金核对与商单结案为并行备选。均没有已付款客户、访谈、真实样本、合法商用 API 授权或原生 Chrome 验收。

## 1. 研究方法和证据等级

- **H** = 平台/服务商第一方公开资料明确陈述其自有功能、导出或定价；仅证明公开描述，不证明当前任意账号实际有权限；**M** = 第一方旧资料、需角色/版本验证；**L/UNKNOWN** = 未取得足够官方资料或登录才可确认。
- “后台可见”≠“官方可导出”≠“官方 OAuth API 可读取”≠“平台允许商业性自动化/二次分发”。每条标注地区、角色和最窄可证实能力；官方帮助页面可因产品更新、角色和 A/B 灰度变化而失效。
- 排名是研究假设。用户群规模、真实营收规模、每周次数、实际 SaaS 花费、获客成本、付款意愿全标 **NOT_MEASURED**，不得用粉丝数、产品官网客户数或价格页面替代。本轮没有进入任何第三方私人后台；合规审核仍是逐平台硬门。
- 评分 0–5 是“当前研究优先级的主观预估”：5 有利，0 不利，? 证据不足；不算平均值，数据许可/安全/真实需求单项 BLOCKED 即停。不把它转成“95 分产品验收”。

## 2. 12 类用户 × 买方 × 后台 × 任务与证据缺口

以下每组**用户规模、经营额、实际当前软件支出均 NOT_MEASURED**，表内产品只表示可能已有的免费/付费替代，不等于该用户已经购买。每日/每周频次是**访谈需要核实的问题**，不是已观测次数。

| 候选序 | 用户与可能付款人 | 工作流起点 / 备选后台 | 数据及重复劳动 | 现有替代 / 当前成本调查 | 第一风险 |
|---:|---|---|---|---|---|
| 1 | 多渠道电商卖家；店主/财务主管 | Shopify Finance、Amazon Seller Central、银行自有流水 | 结算、退款、手续费、税费、SKU、账期；按单核对例外 | Shopify 原生 CSV、Excel、A2X、Link My Books；采购金额待问 | 跨源映射、隐私、既有成熟会计产品 |
| 2 | Shopify DTC 品牌；电商/增长负责人 | Shopify Admin、Collabs、广告后台 | 商家/博主佣金、退款、合同成本、订单利润 | Collabs 免费安装、Shopify Reports、GA4；实付待问 | 归因不可加总 |
| 3 | B2B 采购团队；采购经理/CFO | 供应商门户、ERP、邮箱 RFQ、PO 表 | 报价版本、交期、币种、合同与发票不一致 | ERP、Excel、企业采购系统；支出待问 | 客户数据保密、文件结构差异 |
| 4 | 批发商/供应商；销售运营负责人 | 自有订单门户、ERP、经授权客户 PO | PO—出货—开票的价格数量差异 | ERP、Excel、会计系统；支出待问 | 对方数据没有授权 |
| 5 | 专业内容创作者；工作室主理人 | YouTube Studio、TikTok Studio、B站创作中心 | 视频增长与真实收入、品牌合作交付 | 官方导出、Excel、Metricool；实付待问 | 单纯分析需求已被满足 |
| 6 | 直播带货团队；直播/财务负责人 | TikTok Shop Creator Center、直播后台 | 场次货盘、退款、预估佣金/已结算 | Creator Center、平台下载；实付待问 | 国别规则变动、数据口径 |
| 7 | MCN/多账号机构；财务总监/机构主 | 各账号获授权导出、合同和佣金表 | 分佣、费用、应收及客户交付证据 | Metricool、Excel、CRM；实付待问 | 多账号授权和委托边界 |
| 8 | 品牌内容营销；品牌经理/采购 | Collabs、蒲公英、YouTube 报告、合同 | 交付验收、增量成本、商单与付款 | HypeAuditor、原生报表；实付待问 | 不能把曝光当 GMV/ROI |
| 9 | 社媒/广告代理；Account Director | Google Ads MCC、Meta Business Suite、Metricool | 多客户报表、广告账单、合同 SLA | Metricool Advanced、Google Ads 下载；实付待问 | 免费/成熟竞品极强 |
| 10 | Newsletter/网站/播客；出版方负责人 | GA4、广告平台、自有 Sponsor 表 | 赞助素材/期次/点击证据与应收款 | GA4、邮件服务商报表；实付待问 | 可比性及赞助合同条款 |
| 11 | 课程/会员经营者；内容业务主 | Shopify/Stripe/课程平台自有账单 | 续费、退款、优惠、分销佣金对账 | 平台原生支付导出、表格；实付待问 | 会员 PII 与财务权限 |
| 12 | SaaS/专业服务机构；运营/CFO | CRM、工时系统、支付/发票后台 | 已交付里程碑、工时、应收和退款 | CRM/会计/工时软件；实付待问 | 已有 ERP/PSA 协作壁垒 |

业务规模和成本字段访谈表：地区/客户数量/单月单量/最近两次任务耗时/差异金额/实际在付工具及账单/购买审批者/访问方式/授权范围/所需留存期。缺一个不填猜测值。

## 3. 创作者平台数据地图：来源、角色、地区、出口和权限

记号：**UI**=官方说明可在界面看；**Export**=官方明确可下载；**API**=官方明确的可申请端点；**?**=尚未确认。指标为平台实际已证实的子集，不是许诺全部数据字段。

| 平台（地区/角色） | 流量与粉丝 UI；商业/财务 UI | Export；API 的证据等级 | 不得越界的事实与反证 |
|---|---|---|---|
| **YouTube Studio**（多国；账号所有者） | 视频、观看、受众、收入（角色/营利状态受限），高级模式比较；H [S01] | 高级模式导出 H [S01]；Analytics reports.query OAuth、报告维度与 monetary scope H [S02] | 内容所有者跨频道报告需合格 Content Partner；不能把粉丝画像当粉丝明细；2026-07 起 UI 渐变 [S01] |
| **TikTok Studio**（可用地区；登录创作者） | Overview/Content/Viewers/Followers、观看、受众画像和活跃时间 H [S03] | 本轮没有核实常规 Studio CSV/商业收益导出 ?；Display API 仅资料和视频，特定 stats scope，不是私有收入 API H [S04] | 网页/APP 功能及地区条件不同，开发者 scope 审批加用户 OAuth |
| **TikTok Shop Creator Center**（**美国**；符合资格创作者） | Earnings、Affiliate Orders、佣金预估与结算、退款状态 H [S05] | 美国 2026-09-21 官方公告支持每次最多 15,000 条 Affiliate Orders 下载，路径 Earnings → Affiliate Orders → Download Center；H [S05]；对应 Shop Creator 私有佣金 API **未确认** | Data Compass 更新后单一 paid-orders GMV，旧 Commission tab 已移除；免费导出竞争更强；其它国家必须单独重新核验 |
| **Instagram/Meta**（商业/专业帐号；授权角色） | Meta Page insights/广告访问受任务角色控制 H [S06]；Instagram 受众及内容特定指标需要帐号与 API 实测 | Meta developer 原始 Insights API 页本轮返回访问限制；**字段、CSV 与 app review 状态均 UNKNOWN [S07]** | 不能以第三方 SDK 清单代替官方最新字段；用户需提供获许可的原生导出 |
| **Bilibili 创作中心**（中国；UP 主） | 创作中心官方内容说明涵盖粉丝活跃时段、单稿涨粉、留存、弹幕和观众画像 M [S08] | 官网创作中心账号 2022 文章称 Web 数据中心支持导出；**当前字段/格式/限制须账号复核** M [S08]；官方创作者商业 API ? | 老公告不保证 2026 权限；未核实所有充电收入/商单都可导出 |
| **小红书蒲公英**（中国；达准入条件的创作者/品牌） | 品牌可见多维笔记、直播转化、投后复盘 H [S09]；2026 官方博主指南说明合作订单、结算和笔记数据查看 H [S10] | 当前每种角色的 CSV/Excel 导出与 API 不予声称，**UNKNOWN** | 已有闭环种草/结案工具，不能做重复看板；品牌与博主看到的内容不相同 |
| **Shopify Collabs 创作者**（既有合作用户；地区与方案限制） | Visits、Conversion、Sales、Earned；退款/取消可调整佣金 H [S11]；付款历史 H [S12] | 此页面没有证明创作者明细 CSV 及私有收益 API，**UNKNOWN** | **当前不接受全新创作者自行注册**（既有合作和商家定向邀请仍可用）[S11]；普通数据看板无差异 |
| **Shopify Collabs 商家**（有权限店铺工作人员） | 单创作者 Visits/Orders/Sales/Conversions、整体销售/佣金、礼品记录 H [S13] | 详情跳 Sales Report H [S13]；应结合 Shopify 通用报表导出 [S14]，但**不得推断每种 Collabs 明细均能导出同一字段**；Admin API 订单权限另核实 | Collabs 免费安装，并可能收取自动佣金支付处理费 [S15]；店铺账单与合同成本才是潜在新增价值 |
| **Twitch**（主播 vs 游戏/扩展开发者需分开） | 开发者 API 包括游戏和扩展报表 H [S16] | developer console 的 CSV 和 Game/Extension Analytics API 只证实**游戏/扩展开发者**可下载 H [S16]；主播收入 CSV/官方收益 API 本轮 **UNKNOWN** | 不得把游戏开发者 Analytics 冒充直播主播实际收入明细 |

### 五种核心口径及标记

1. 视频播放/曝光/触达/独立观众各有不同分母和采集限制。缺失时标 **NOT_COMPARABLE**。
2. TikTok paid-order GMV、Shopify 归因销售均不等于净回款，跨平台可能重复归因。
3. 创作者**预估佣金、审核/结算佣金、提现到账、实际银行入账**需要分别有金额、币种、状态、对应时间；没有流水证据就不推断拖欠。
4. 内容契约“曝光达到”是交付条件，非实际可归因销售；合同没有归因窗与成本时不得声称 ROI。
5. 授权数据包须保留平台、国家、角色、时间范围、时区、导出时间、文件哈希、字段含义、消歧键与保留/删除策略。原始订单、粉丝/顾客 PII 不进入默认报告。

## 4. 付费竞品与“平台原生已解决”反证

| 参照对象 | 官方已覆盖/截至 2026-10-12 的公开商业信息 | OpenDesk 不应复制；证据 |
|---|---|---|
| YouTube Studio | 高级模式多报告对比与免费导出；2026 年界面迭代 | 仅数据导出无付费价值 [S01] |
| TikTok Shop US | 每次最多 15,000 条下载及统一 paid-order GMV | 仅佣金列表与“转 CSV”非常弱 [S05] |
| Shopify Finance | 每笔结算 CSV（Amount/Fee/Net/Order/Payout Date 等）；资金活动报告支持账期核对 | 商家同一个 payout 报表工具无需再造 [S17] |
| Shopify Collabs | 免费安装，自动佣金付款有可能产生 2.9% 处理费 | 招募、转化、佣金看板天然竞争 [S15] |
| Metricool | 官方价目页（当前可见美元年付选项）Free $0；Starter **起 $25/月**；Advanced **起 $67/月**；可做 PDF/PPT 月报、团队/客户管理和 API（Advanced） | 代理商普通跨平台汇总/PDF 已被成熟付费产品覆盖；币种、计费周期与附加税需再核实 [S18] |
| HypeAuditor | 官网 Pricing 需销售演示报价，官方 2025 博客称 Basic **年付起 $299/月**，不能当本日保证报价；包括达人搜索、受众质量、CRM 和媒体计划 | 不开发“另一套达人发现和报告” [S19] |
| Google Ads | 统计表已可 CSV、XLSX、PDF、Google Sheet 下载，可设定计划发送 | 代理商单纯广告报表出口缺商业壁垒 [S20] |
| Shopify 商品/SKU | 支持 CSV 导出、批量编辑 SKU 和 variants | 仅“读出 SKU”无收费理由 [S21] |
| Amazon SP-API | 官方提供财务/结算报告类型、Seller Reports，需 developer + seller 权限、角色、速率合规 | 不能依赖登录页面批量提取代替 SP-API 授权；成熟账务软件已存在 [S22] |
| A2X / Link My Books | 针对电商平台与会计系统的结算对账，按订单/销售渠道等因素定价 | 店铺对账并非蓝海；首选 MVP 必须证明独立例外处理更快/更清晰 [S23] |

**竞品定价证明已有采购市场，不证明 OpenDesk 能赢。** 用户社区投诉/商店评论不等于有代表性样本；对比实验必须用同一组真实许可数据、相同任务、同一操作者的原生后台/Excel/竞品时间与差错率。对于 GitHub/Chrome 安装量和评分不做无出处推断。

## 5. 去重后的 TOP30 微任务（W 仅为本文序号）

来源是上述官方出口和待访谈场景，不代表以下每条已经可取到数据或获付费验证；**先确认输入许可和角色**。

| 序 | 用户从哪里开始 → 动作 → 可交付结果 | 主要免费替代 | 原 OPP 归并/形态 |
|---:|---|---|---|
| W01 | Shopify Finance 导出两期 Payout CSV → 识别重叠/缺口 → 差异账单 | Finance/Excel | OPP-081；A |
| W02 | Shopify Payout CSV + 人工录入银行到账 → 币种/账期匹配 → 未解释差额 | Excel/会计 | OPP-078/081；A |
| W03 | Shopify Refund + Transaction CSV → 退款与手续费反算 → 例外清单 | 原生报告 | OPP-081；A |
| W04 | Amazon 自有 Settlement report → 对照已授权订单/费率 → 调整差异 | SP-API/会计工具 | OPP-081；A/D |
| W05 | 卖家 SKU CSV → 检查重复/缺失/变体联动 → 只读 QA 清单 | Shopify Bulk Editor | OPP-015/016；A |
| W06 | 卖家自有成本表 + 订单净额 → 单品成本完整性核验 → 标记利润未知 | Excel | OPP-018；A |
| W07 | 多平台店铺各自 CSV → 统一时间与币种 → 不混算的月结表 | Excel/A2X | OPP-080/081；A/D |
| W08 | Shopify Collabs 创作者销售表 + 合同 → 佣金异常/待付项 | Collabs | OPP-081；A |
| W09 | TikTok Shop US Affiliate Orders → 结算/退款标识 → 佣金异常 | Creator Center | OPP-081；A |
| W10 | TikTok Shop 两个账期导出 → 订单日期和结算日期对齐 → 过账说明 | Creator Center/Excel | OPP-080/081；A |
| W11 | B站创作中心获准收入明细 → 比较平台账期 → 待解释差异 | 原生收益中心 | OPP-081；A，前提核实 |
| W12 | MCN 各客户授权 CSV → 创作者/客户归属检查 → 防混账报表 | Excel/Metricool | OPP-078/081；A |
| W13 | MCN 商单合同 + 视频平台报表 → 交付阈值检查 → 缺失项 | Excel/代理工具 | OPP-083；A |
| W14 | MCN 视频 URL/截止日/哈希 → 单客户可追溯结案证据包 | Metricool PDF | OPP-080/083；A |
| W15 | MCN 分成规则 + 已到账佣金 → 机构/主播分润校核 | Excel/ERP | OPP-081；A |
| W16 | 品牌 Collabs 报表 + 合同及赠品成本 → 合作费用合并 | Collabs/Excel | OPP-081；A |
| W17 | 品牌蒲公英商业合作订单 → 对照合同内容链接 → 交付缺口 | 蒲公英投后分析 | OPP-083；A，出口待核 |
| W18 | 品牌 Google Ads 费用报表 + 发票 → 预算/账单差额说明 | Ads 免费导出 | OPP-081；A |
| W19 | 广告代理多个授权 Google Ads 客户报表 → 时间窗对齐 → 报告差错检查 | Ads/Metricool | OPP-083；A |
| W20 | 代理客户合同与报表 → 追踪 SLA 指标是否可证明 → 验收单 | Metricool | OPP-083；A |
| W21 | B2B 采购用户上传 RFQ 版本 1/2 → 价格/币种/交期差异 | Excel/采购软件 | OPP-078/081；A |
| W22 | B2B 自有 PO 和发票 CSV → 数量×单价×税核对 → 例外清单 | ERP/Excel | OPP-081；A |
| W23 | 批发商客户 PO 和出库记录 → SKU/数量匹配 → 交付待办 | ERP | OPP-078/081；A |
| W24 | 批发商采购合同/报价单 → 比较更新后的条款 → 变更证据 | Excel | OPP-083；A |
| W25 | 知识付费用户自有支付 CSV → 退款/续费核对 → 账期报告 | 支付平台/Excel | OPP-081；A |
| W26 | 会员/课程销售表与分销合同 → 佣金核对 → 待付记录 | 课程平台 | OPP-081；A |
| W27 | Newsletter 广告点击统计 + Sponsor 合同 → 实际交付证据 | GA4/邮件后台 | OPP-083；A |
| W28 | 播客/网站自有数据导出 → 统一口径并标不一致 → 赞助月报 | GA4/表格 | OPP-080/083；A |
| W29 | SaaS CRM 工时/合同里程碑 → 检查待开票和漏账 | CRM/PSA | OPP-081/083；A |
| W30 | 服务公司开票/收款表 → 发票状态与收款期对齐 → 异常应收款 | 会计/Excel | OPP-081；A |

其余早期 R2 创作者 36 项仍是备选微工作流，不因此成为新的工程量或新增独立产品。高流量跨平台看板/粉丝详细资料批量提取因免费替代与权限问题排后。

## 6. TOP10 可能形成独立产品的“工作流包”（非独立扩展批准）

| 研究顺序 | 产品概念/微任务组合 | 买方 | 区别于免费替代的**待验证**增量 | 交付 |
|---:|---|---|---|---|
| 1 | Seller Payout Exception Auditor（W01–W04/W07） | 多渠道卖家财务负责人 | 跨报表差异逐行解释、来源可追溯 | A，必要时 D |
| 2 | Seller SKU & Cost Consistency（W05/W06） | 店主/运营负责人 | 商品变体、费用遗漏的只读 QA | A；按需 C |
| 3 | Creator Commission Exceptions（W09–W11） | 带货工作室/MCN 财务 | 预计/已结算/退款跨期解释 | A |
| 4 | Sponsored Content Proof Pack（W13/W14/W17） | MCN/代理商主管 | 合同逐条验收而非 PDF 看板 | A |
| 5 | Brand Affiliate Cost Audit（W08/W16） | 品牌增长与财务负责人 | 归因销售与合同现金支出并表 | A |
| 6 | Purchase Quote Change Review（W21/W24） | 企业采购经理 | 供应商报价版本、交期、税/汇率异常 | A |
| 7 | PO–Invoice Three-Way Check（W22/W23） | 采购/批发财务 | 订单/交付/开票三源核对 | A，后期企业 D |
| 8 | Agency Client Evidence Review（W19/W20） | 广告代理 Account Director | 同一客户报告的合同 SLA 例外 | A，不与 Metricool 正面复制 |
| 9 | Membership Revenue Exceptions（W25/W26） | 课程/订阅运营负责人 | 支付/退款/分销跨账期例外 | A |
| 10 | Services Billing Completeness（W29/W30） | SaaS/服务商财务 | 交付→工时→开票→收款漏项 | A |

**先证明用户真实工时和错误成本，之后才研究订阅定价。** TOP10 是产品概念而非 10 个 Chrome Web Store 包；单独 B 产品必须再经单一用途、最少权限、付费/重复使用、支持成本和差异化审查。

## 7. 逐维主观预评分：不允许平均值抵消红线

评分仅供安排**研究先后**，5=研究条件相对有利、1=明显薄弱、?=无数据。所有行的真实客户频率/付费意愿为 ?；全部 MVP 的 OAuth/商业数据许可也不能凭本表解除硬门。

| 独立研究维度（越高越好） | 卖家结算审计 M1 | 创作者佣金 M2 | 商单结案证据 M3 | 依据 |
|---|---:|---:|---:|---|
| 经济错误可解释性 | 4 | 4 | 3 | 已公开金融口径/商单交付字段，实际损失未测 |
| 可观察触发任务 | 4 | 4 | 3 | 结算周期或结案事件；真实频次未知 |
| 数据由买方控制 | 4 | 3 | 3 | 自有商家 CSV 强；MCN 须逐人书面授权 |
| 第一方合法导出可验证 | 5 | 4 | 3 | Shopify CSV H、TikTok US H、合同私人数据 |
| 免费替代的差异化空间 | 2 | 2 | 2 | Shopify Finance、TikTok Export、Metricool 强 |
| 已存在付费竞品证明“预算类别” | 4 | 3 | 4 | A2X/Metricool/HypeAuditor；非本产品订单 |
| 付款决策人可识别 | 4 | 3 | 4 | 店主/机构财务/品牌采购；未访谈 |
| 线下低权限原型容易实施 | 5 | 5 | 5 | 用户主动上传本地 CSV 和合同字段 |
| 具体场景获客可定位 | 3 | 3 | 3 | 垂直社群/卖家/MCN；获客成本未知 |
| 长期维护可控 | 4 | 3 | 3 | 离线解析优于网页抓取，平台字段仍变 |
| 隐私最小化可实现 | 4 | 3 | 3 | 可脱敏本地处理；仍需保密审查 |
| 付费意愿的**真实证据** | ? | ? | ? | 访谈 0、付款 0、没有脱敏用户样本 |
| 真正商用授权/合同审查 | ? | ? | ? | CSV 自用不自动等于二次商用许可 |
| 当前原生 Chrome/框架交付 | ? | ? | ? | 此轮未运行 Mac Chrome；SDK R5 旧记录无法自动升级 |

对 P1 研究先后：**M1 卖家结算审计 > M2 创作者佣金 > M3 交付证据**。Listing QA 与 SKU/利润（OPP-015/016/018）紧随其后，可作为 M1 的同一类卖家访谈对照。**这不是“市场已经赢”或产品开发批准**。B2B 采购在访谈出现更显著采购错误成本时允许上升至第一。

## 8. 三个可运行的最小 MVP：使用动作/对照/付费假设/终止条件

### M1（首选验证）Seller Payout Exception Auditor

1. 用户（Shopify 店主或明确授权财务）进入 Shopify Admin → Finance → Payouts / View transactions → **手动导出官方 CSV** [S17]。只读导入：本地「文件导入」→ 上传单期/双期资金流水，可选手工输入银行净入账金额（不直接连接网银）。
2. 工具展示文件来源、时区、币种、行数和导出时间 → 让用户确定对账键（Order、Payout ID、Date）和规则 → 对交易金额、Fees、Net、Refund、Adjustments、期初期末做可解释差异分类。
3. 输出：每笔对齐/跨期/状态未定/字段缺失/未知差额，显示公式、原行、输入文件哈希，导出**脱敏**差异 CSV；有缺字段则 UNKNOWN，不承诺真正银行已入账。
4. 免费对照：Shopify 原生 Finance/Activity + Excel Pivot + 现用 A2X（若用户已有许可）。记录用户完成步骤/用时、人工返工、解释差异、对照错误率。不能只拿“新 UI 更好看”算成功。
5. 付款假设：商家店主或财务主管为**每次可解释的异常与持续适配**付费，方式可先一次性试点或席位；金额待报价和真实收款，不预写市场价格。
6. 技术边界：A 离线工具、用户主动 CSV，首版不要求账户、Cookie、Host、云端同步、银行授权。GO/PIVOT/STOP 依下文统一门槛；若原生 Finance 已解释所有差异且不省时，STOP。

### M2 Creator Commission Exceptions（严格限定 US 验证样本）

1. 美国地区符合条件的 TikTok Shop 创作者本人登录 Creator Center → Earnings → Affiliate Orders → Download icon → Download Center，主动导出 [S05]；表内所有订单/账号归创作者自己，MCN 必须另取得明示委托。
2. 选择两个结算期 CSV → 字段映射/确认币种与日期 → 对齐 Not Settled / Settled / Refunded / 其他平台公开定义的状态；明确 Paid-order GMV 的最新官方口径，不引用旧 Commission Tab。
3. 输出按订单状态、退款调整、跨期和未匹配原因分组；缺失订单 ID 或付款凭据仍标 UNKNOWN。不读取私有 API，不触发提现，不自动爬账号。
4. 对照 Creator Center 官方下载 + Excel；若平台已经满足 95% 操作且差异无法由买方确认，则 STOP；优先考虑并入 M1 通用核对引擎而非开新扩展。

### M3 Sponsored Delivery Proof Pack

1. MCN 或品牌人员从获授权的 YouTube Studio Advanced Mode 导出报告 [S01]；从小红书蒲公英只能在官方实际可导出、合规许可被确认后接入其文件，否则先使用客户提供的手动合同字段。
2. 上传合同条目（承诺视频 URL、发布时间、窗口、KPI、收费/结算规则） → 用户映射报告数据和内容链接 → 工具按合同逐项显示 VERIFIED / NOT_MET / NOT_AVAILABLE。
3. 生成可人工复核的交付 PDF/CSV，附时间窗、字段/分母、公开内容 URL 和文件哈希；**用户亲自发送**，不自动采集第三方粉丝数据。
4. 对照 Metricool/客户已有 PPT 和 Excel；若无法明显减少漏项/客户追问或没有真实愿意购买的代理商主管，则 STOP，不做“通用社媒仪表盘”。

## 9. 合规、安全和技术交付选择

- **A 内置 OpenDesk 工具先行**：本地文件选择、CSV/有限 Excel 解析、确定性公式、结果导出；如果现有 Sidebar Tool 的资源/存储限额不足，不把超大订单塞入 Sidebar Tool Data Store，改用**在现有授权运行边界内的专门导入计算模块**（未实现，需定向源码设计）。
- **C 站点 UserScript 仅在有平台许可且自动化许可核实后**：负责用户触发的只读提示、打开官方导出入口，而不是旁路内部 API、复用站点令牌或绕过 CAPTCHA。改变页面 DOM/数据下载条件时必须独立审查。
- **B 独立扩展**：等候自然重复使用、单一用途、独立买方/获客、权限和 CWS 评审通过；不因为 Factory 代码可用就批量上架。
- **D 官方 API/SaaS**：只有用户确需持续多账户授权、协作/定时和官方商业开发许可才考虑 OAuth 与服务器；多国权限与数据字段均重新审核，不要求客户交账号或 Cookie。
- 禁止混用 Chrome 自有 Host、Side Panel、Page 世界的权限；遵守最小 Manifest、Purpose Limitation、数据保存/删除和人工审批。保留现有 Controller/RunHost/Authority；参考已查看的 src/ui/sidebar-tools/package.js、src/platform/host/broker.js、src/framework/sdk/browser-contract.js。**源码有合同不等于某接口获得真实 Mac Chrome 原生 PASS。**
- 当前仅测试文档和公开官网；不包含真实账号、脱敏样本、运行中插件、收费系统或产品上线。任何利润/ROI 必须有全部费用、退款、可比较归因的证据，否则不能算。

## 10. 6 周验证、3/6/12 月路线及硬门

| 时段 | 可执行工作 | 必须保存的真实结果 |
|---|---|---|
| 第 1–2 周 | 招募跨 M1/M2/M3 至少 10–15 位合资格候选、取得访谈同意；记录上一次真实任务及原生/Excel/竞品对照，询问买方、预算和限制 | 访谈录音/脱敏笔记；用户/利润/频率 NOT_MEASURED 直到得到数据 |
| 第 3–4 周 | 用 3 个任务的**合法脱敏**样例测试最小本地分析；固定口径与 expected fixtures；与同用户现用流程对照 | 成功/失败样例、字段映射、准确性、权限审查、不触网说明 |
| 第 5–6 周 | 争取 5–10 位真实试用者，观察**至少两个自然业务周期**；向真实付款决策人提出清晰报价和试点范围 | 自然复用、真实工时、差错、订阅/采购证据，未发生即 null |
| 3 个月 | 仅对通过门槛的单一工作流投入产品实现，失败则回到行业/用户筛选 | 按实证重新排序 OPP 和 EXP，不新增账本 |
| 6 个月 | 真实复用付费已成立才考虑独立 B、OAuth、团队协作 | 续费和维护成本，不把试点当规模化 |
| 12 个月 | 可复制的多行业对账/验收核心与单独行业适配器 | 有真实续费单元经济才扩展更多垂直产品 |

**建议的试验 GO（阈值是未来实验设计，不是已完成数据）：** 数据来源经书面或平台认可的合法权限审查；原生/Excel 对照达到无重大金额错误；至少 5/10 试用者在两个自然周期中自发再次使用；至少 2 个真正拥有预算的买方愿明确报价试点，且出现可核验的付费/签约里程碑；长期维护/获客/隐私成本可控。**PIVOT**：主要客户价值在商单/采购而非卖家对账，或成本收益需要重新拆分用户；调整一个核心工作流，不扩展插件数量。**STOP**：平台原生已经能完成、数据来源不可合法商用、金融结果无法核实/隐私不能满足、无人自然重复或付款决策者拒绝采购。所有阈值在真实招募前可经审查调整，但不可追溯修改去凑 PASS。

## 11. 第一方证据 URLs（全部于 2026-10-12 核查）

证据仅支持相应平台/地区/角色的公开能力；作者类历史页面按 M 标识。未知处不引用泛化网页冒充许可。

- **S01 H** YouTube Studio（已登录渠道所有者，多国）：https://support.google.com/youtube/answer/9717005 ；2026-07 起界面灰度。
- **S02 H** YouTube Analytics 报告/OAuth scope（渠道所有者）：https://developers.google.com/youtube/analytics/reference/reports/query ；https://developers.google.com/youtube/analytics/content_owner_reports
- **S03 H** TikTok Studio（适用地区/账号）：https://support.tiktok.com/en/using-tiktok/creating-videos/tiktok-studio
- **S04 H** TikTok Display API（开发者 app 审核 + 用户 OAuth，非 Shop 私有收益）：https://developers.tiktok.com/docs/en/display-api-overview ；https://developers.tiktok.com/docs/en/tiktok-api-scopes
- **S05 H** TikTok Shop 美国 Creator Center，官方 2026-09-21 Earnings 更新（US 创作者）：https://seller-us.tiktok.com/university/essay?knowledge_id=5381191961282317 ；退款差异说明 https://seller-us.tiktok.com/university/essay?knowledge_id=2467877215749930
- **S06 H** Meta Page Insights role access（具有 Page 任务权限的用户）：https://www.facebook.com/help/289207354498410/
- **S07 UNKNOWN** Meta Instagram Insights 第一方 docs 在本次查询遇到 429，不能据此确认导出字段：https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights/
- **S08 M** Bilibili 官方创作中心（2022 文章；UP 主数据导出需 2026 登录复核）：https://www.bilibili.com/opus/640637304779571202 ；https://ir.bilibili.com/media/nvgnk1hk/cn-2021.pdf
- **S09 H** 小红书蒲公英商业平台介绍（中国品牌、买手与博主）：https://pgy.xiaohongshu.com/solar/to-home
- **S10 H** 小红书蒲公英官方帮助 2026-10-09（博主准入、商单、数据查看）：https://pgy.xiaohongshu.com/help/detail?id=22aa451e5f92647735efb60001b704d2&userType=6
- **S11 H** Shopify Collabs 创作者指标与暂停新自助注册（现有伙伴）：https://help.shopify.com/en/manual/promoting-marketing/collabs/creators/payments
- **S12 H** Shopify Collabs App 创作者 payout history：https://help.shopify.com/en/manual/promoting-marketing/collabs/creators/app
- **S13 H** Shopify Collabs merchant 访问/订单/佣金与 Sales Report（店铺授权角色）：https://help.shopify.com/en/manual/promoting-marketing/collabs/merchants/affiliates
- **S14 H** Shopify 通用报表导出格式与权限：https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/custom-reports/export-reports
- **S15 H** Shopify Collabs 公开价格 / 商家免费安装+佣金付款处理费：https://apps.shopify.com/collabs
- **S16 H** Twitch Developer Game/Extension CSV/API（开发者而非主播）：https://dev.twitch.tv/docs/insights/
- **S17 H** Shopify Payments 交易 CSV（店主/有授权员工；受付款国家及页面版本限制）：https://help.shopify.com/en/manual/payments/shopify-payments/payouts/view-details ；https://help.shopify.com/en/manual/payments/shopify-payments/payouts/payouts-activity-report
- **S18 H** Metricool 当前 USD/EUR 套餐页面与 Advanced API ：https://metricool.com/pricing/ ；https://help.metricool.com/plans-add-ons-and-api-access-explained-xux1u
- **S19 H/M** HypeAuditor 官网当前“申请演示”，历史 2025 官方博客起价；不视为即时成交报价：https://hypeauditor.com/pricing/ ；https://blog.hypeauditor.com/how-much-does-hypeauditor-cost-/
- **S20 H** Google Ads 报告格式及计划邮件（授权账户）：https://support.google.com/google-ads/answer/2404176
- **S21 H** Shopify 商品 CSV/批量编辑及 SKU 风险：https://help.shopify.com/en/manual/products/import-export/export-products ；https://help.shopify.com/en/manual/products/details/sku
- **S22 H** Amazon 卖家财务/结算 SP-API 文档：https://developer-docs.amazon.com/sp-api/docs/onboarding-overview ；https://developer-docs.amazon.com/sp-api/lang-es_ES/docs/sp-api-seller-use-cases
- **S23 H** 竞争平台/价格结构存在，不证明用户采用：https://support.a2xaccounting.com/en/articles/5937286-individual-plans-and-pricing ；https://linkmybooks.com/pricing

## 12. 与现有总账的关系

- 唯一机会源：opportunity-register.json（84）；唯一商业实验源：commercial-experiments.json（8）。本次只加入**研究排序与证据跳转**，不改 84 个 ID、历史 TOP30 与 8 个实验的执行/付款状态。
- EXP-005 卖家 Listing QA 保持原名和原假设；增加“卖家结算审计”的**研究比较**，并不宣称 EXP-005 已变成新付款实验。EXP-007 B2C 购物继续作为竞争对照，但不因高潜在流量上升为付费首选。
- R2 的创作者 36 项属于候选场景补充；R3 的 W01–W30 为跨行业分析切片，不在 JSON 伪装成 30 条新机会或再次计算 “Top30 已验证”。
- 保留 Page QA Inspector 从商业首发退出的决定，Browser SDK、Controller、原生 Cloud/任务基础设施状态由其各自 workstream 决定。

**当前研究结论：首个应验证而不是首个应开发的产品 = Seller Payout Exception Auditor。下一步不是造功能，而是找到拥有真实结算 CSV、确实需要 Excel/人工核账的店主及财务负责人，并用两期数据证明它解决了官方没有解决的异常。**
