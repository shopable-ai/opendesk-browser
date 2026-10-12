# 商业产品选择决策：Page QA 商业优先级下调、优先探索电商工具宇宙

- 日期：2026-10-12
- 状态：**产品战略决策（DECIDED）**；用户需求、收入与市场份额仍为 **NOT_VALIDATED**。
- 适用范围：OpenDesk Browser Product Ecosystem A（通用工具）/ B（独立行业扩展）/ C（UserScript）。
- 与旧文档关系：本决策**覆盖** R1 TOP30 / TOP5 / MVP 1 中“Page QA 是首款商业重点”的推荐；**不修改**历史 R8 功能 ID、已有技术提交和实际验收事实。

## 一、为什么修改方向

此前推荐 Page QA Inspector，主要因为页面检查范围小、适合验证共享 Core → ProductConfig → 独立 Manifest/ZIP → Chrome 并装的技术可行性。**容易实现 ≠ 有市场差异化 ≠ 有人愿付费**。

- Lighthouse / Chrome DevTools 已提供性能、无障碍、SEO 等基础审计。资料：[Chrome 官方](https://developer.chrome.com/docs/devtools/lighthouse/)（核查 2026-10-12）。
- [WAVE](https://wave.webaim.org/extension/) 提供成熟的网页可访问性浏览器检查。其存在说明替代方案成熟，**不等于**新的小型 QA 插件没有用户。
- [axe DevTools](https://www.deque.com/axe/devtools/pricing/) 有免费基础检查和付费 Pro/团队功能；这证明专业工作流有付费产品，**不证明**“图片 alt/标题/表单标签检查”就有足够的新付费需求。
- 尚未获得本项目 Page QA 的真实试用留存、付款订单、潜在客户采访或不同于免费竞品的独立优势证据；不使用任何未经重核的商店安装量或价格推断转化。

**产品决定**：Page QA Inspector **不再作为首款商业主推产品、商业获客或优先上架对象**；保留已有源码、验证记录和独立产品样品作为 Extension Factory 的内部技术验收材料。不得因此删除已有 QA 代码、历史验收或阻断其他 Agent 已授权的技术交付；若将来获得独立付费价值证据，可重新评审恢复商业候选。

## 二、调整“先建工厂，再找产品”的顺序

旧假设：先造 Extension Factory → 选简单插件 → 继续上架更多行业版本。

新原则：**发现有支付主体的真实重复问题 → 用现有 OpenDesk 工具/脚本制作可逆 MVP → 验证使用与支付 → 再决定独立发行与产品工厂投资**。

Extension Factory 仍是长期基础设施，但属于**被真实需求拉动的生产能力**，不是产品数量 KPI。早期无需开发几十款换壳扩展，也不把“可编译 ZIP”当作商业化成功。

第一轮重点领域调整为 **电商工具宇宙的需求研究**（详见 [电商工具宇宙](ecommerce-tool-universe.zh-CN.md)），保留企业自动化与知识研究作为并行的原有候选，而非宣告已被市场淘汰。

## 三、首批需要验证的付费问题，不是直接确认的产品

| 研究假设 | 具体用户/付费方 | 首个可测试任务 | 交付候选 | 已有关联 |
| --- | --- | --- | --- | --- |
| Seller Operations：卖家运营效率 | 电商运营、店主、服务商、团队采购人 | 商品 Listing 字段校验 + 授权 SKU 表格辅助导出 + 费用毛利试算 | OpenDesk 工具或站点脚本验证；成熟后行业扩展 | OPP-015 / OPP-016 / OPP-018 / OPP-020 / OPP-021；EXP-005 |
| Web Data Workflow：网页数据工作流 | 电商运营、研究/销售岗位 | 对用户有合法访问权的数据表进行字段选择、整理与导出 | 通用工具或授权脚本 | OPP-016 / OPP-078 / OPP-080；进一步查重 |
| Smart Form Assistant：高频表单/模板 | 电商客服、售后运营、卖家助理 | 用户确认后填入重复字段、回复模板、提取订单相关自有资料 | 脚本或工具，必要时官方 API | OPP-019 / OPP-020；与其他领域 OPP 交叉复用 |
| Shopping Value：消费端购物决策 | 价格敏感消费者 | 当前商品到手价计算、规格比对与购物清单 | 脚本 + 可选数据服务 | OPP-008 至 OPP-014；EXP-007 |
| Coupon/Affiliate：优惠与合作 | 消费者、商家/联盟伙伴 | 透明说明真实优惠，用户主动操作后使用优惠码 | 高合规门：调查为先 | OPP-011；需核查联盟营销政策 |

**该表中的高频、付费潜力、转化和排名仍是 HYPOTHESIS。** 首轮研究优先卖家 B2B 工作流，同时不能忽略消费者购物省钱工具的流量价值与不同商业模型。新的市场研究聚焦 ≠ 在证据缺席时直接启动源码实施。

## 四、商业评审硬门与可复用实验

先验证（建议门槛，不是假装完成）：
1. 每条重点业务线从可联系到的目标用户中争取 10–15 次实际任务访谈，记录角色、重复频次、现用替代产品、最讨厌的步骤。
2. 针对 1–2 个真实授权网站做单任务 demo，观察至少 5 位真实用户完成与重复使用；禁止用团队内部点击替代真实留存。
3. 报价/预算审批/实际付款分开记账；只有可核实的订单或付款才记作已变现。
4. 成本模型必须计算站点适配、支持、数据 API、第三方费用、商店合规、误操作赔付风险。
5. 每个方向分别给出 GO / PIVOT / STOP；不以多个未经验证分数的平均值代替付款或安全证据。

- 商业追踪仍以 [commercial-experiments.json](commercial-experiments.json) 的 EXP 为准；本决定将 EXP-002 视为 LATER / 暂缓商业化，EXP-005 与 EXP-007 提升为优先**研究**候选。旧 EXP 已有 metrics、gates 为 null / NOT_TESTED，不得填入推测值。
- 产品机会唯一账本为 [opportunity-register.json](opportunity-register.json)。既有 OPP-008 至 OPP-021 优先复用，新增条目须去重、增量 ID、证据来源齐备。
- Browser SDK、Page 能力的真实实施与验收按各自 workstream 维护，本决策不改变工程状态。
- 不联系真实客户、不获取商家账号凭证、不启动收款或大规模网页抓取，除非后续获得具体授权。

## 五、电商专项的技术/分发与合规原则

- **先官方 API，后经授权的网站内用户操作**。例如 Shopify Admin GraphQL、Amazon Selling Partner API、eBay Sell APIs 均有各自身份、角色、配额和条款；不能因为扩展能看到网页 DOM 就认为可以无限量读取后台数据。
- 优先构建只读校验和用户明确动作的工具；发布商品、修改价格、提交退款、发营销消息等高影响操作必须单独授权、预览、确认与审计。
- 购物优惠码及联盟：Chrome Web Store 的 [Affiliate Ads 政策](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads) 要求明确披露、真实用户利益和每次相关用户操作；禁止静默替换链接、Cookie 或优惠码。
- 独立扩展必须满足单一用途、最小权限、非重复内容：[CWS Spam FAQ](https://developer.chrome.com/docs/webstore/program-policies/spam-faq/)。
- 永久区分 RESEARCH / HYPOTHESIS、BUILD_VERIFIED、CHROME_NATIVE_VERIFIED、CWS_APPROVED 与 PAID_VALIDATED。

## 六、后续入口

- [电商工具宇宙](ecommerce-tool-universe.zh-CN.md)：覆盖买家、卖家、供应链、品牌、运营服务和软件集成的机会树。
- [独立可执行 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r1.zh-CN.md)：下一轮专注电商研究、机会去重、竞品/政策和 3 个付费验证 MVP。
- 历史 R1 排名见 [product-priorities.zh-CN.md](product-priorities.zh-CN.md)，只保留作当时的研究记录；商业产品选择以本日期决策为准。
