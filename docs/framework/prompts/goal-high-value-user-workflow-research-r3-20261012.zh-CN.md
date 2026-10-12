# GOAL：OpenDesk Browser High-Value User Opportunities R3

## 跨行业高商业价值用户研究、创作者假设验证、数据资产与付费任务挖掘

日期：2026-10-12。默认中文。

**首要目标：在既有电商工具宇宙的基础上，研究“X 维度：高商业价值用户 × 高频数据工作流”是否真正提高商业机会发现质量。自媒体博主是用户提出的待验证假设，不是已证实最赚钱的方向，更不是默认要开发的首款产品。先用真实业务任务、免费/付费竞品、合法数据入口、买方和成本去证实或推翻。**

### 一、仓库、安全及本轮执行方式

- GitHub：https://github.com/shopable-ai/opendesk-browser
- 用户 Mac 本地：/Users/shopme/Documents/workspace/opendesk-browser
- 只允许向 main 写入；不得创建分支、Worktree、PR，不得强推或破坏性 reset/clean，不覆盖其他 Agent。
- 首先只读检查 AGENTS.md、最新 main HEAD、git status、其他 Agent 工作流和本次目标文档 SHA；远端检视不能证明本地目录没有未提交改动。并行冲突时停止写入并记录。
- 本轮优先真实研究、证据升级、去重、决策和文档增量落库；不是批量生成插件、假 UI、第二套 SDK 或商业化验收。授权、安全且通过文档检查后可提交并推送 main，列出真实 SHA。禁止在未经许可的第三方账户里取数或主动联系潜在客户。
- 保持 Page QA Inspector 退出商业首发的决定，不开展 Page QA/AdBlock 专项验收。

### 二、先读取既有研究，避免重做

至少读取：
- docs/product/browser-extension-ecosystem/README.zh-CN.md
- docs/product/browser-extension-ecosystem/ecommerce-tool-universe.zh-CN.md
- docs/product/browser-extension-ecosystem/high-value-audience-creator-analytics-x-dimension-r2-20261012.zh-CN.md
- docs/product/browser-extension-ecosystem/commercial-decision-ecommerce-20261012.zh-CN.md
- docs/product/browser-extension-ecosystem/opportunity-register.json
- docs/product/browser-extension-ecosystem/commercial-experiments.json
- docs/product/browser-extension-ecosystem/product-priorities.zh-CN.md
- docs/product/browser-extension-ecosystem/competitor-research.zh-CN.md
- docs/product/browser-extension-ecosystem/monetization-unit-economics.zh-CN.md
- docs/product/browser-extension-ecosystem/distribution-and-validation.zh-CN.md
- docs/product/browser-extension-ecosystem/research-process.zh-CN.md
- docs/product/browser-extension-ecosystem/product-ecosystem-r3-roadmap.zh-CN.md
- docs/framework/prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md
- docs/product/browser-automation-feature-catalog-r8.zh-CN.md
- docs/product/browser-automation-r8-implementation-plan.zh-CN.md
- docs/framework/workstreams/browser-sdk-status.md

保留 84 个 OPP、8 个 EXP、R8 188 能力和 E01–E40 的稳定身份。新增行业用例先关联已有 OPP，只有真实不同的独立用户任务才按既有规则分配新 ID。不要把新的“X 轴候选清单”做成第二套权威机会账本。

### 三、研究对象必须超越自媒体

覆盖并分别验证：专业创作者、主播/带货团队、MCN、多客户社媒代理商、品牌营销/广告采购、高 GMV 电商卖家、独立站品牌、B2B 采购和供应商、Newsletter/网站/播客媒体经营者、知识付费和会员运营、SaaS/专业服务企业，以及合理补充的高预算/高频用户群。

对每类用户明确：谁操作、谁付款、谁批准访问数据、用户控制的账号与数据、最常重复的动作、具体网站后台、现有替代、典型成本与错误、预算来源、获客渠道、可审计证据。不能仅按收入、粉丝或流量替代用户价值与支付意愿。所有无法证实的频率与收入记 HYPOTHESIS。

### 四、重点深入创作者后台的真实指标和操作

核查 YouTube Studio、TikTok Studio/TikTok Shop Creator Center、Shopify Collabs、小红书蒲公英、B站创作中心、Instagram/Meta、Twitch 及其他相关入口。对每个平台分别记录：

1. 普通创作者、品牌、机构、MCN 各自真实可见的页面与指标。
2. 播放/曝光、留存/互动、粉丝/受众、商品点击、订单/GMV、预估佣金、退款/取消、最终结算、商单合同、成本与回款的具体字段与计算口径。
3. 是否官方免费提供，以及能否由用户主动下载 CSV/Excel；导出限制、日期范围与账号地区差异。
4. 是否有公开官方 API、OAuth、特殊准入、费用、速率与存储限制；不可把 Display API 当作私有 Shop 收益 API。
5. 每项功能在何网站、由何角色点击哪个入口、导出何种文件、在 OpenDesk 中点击何按钮、最终产生何报告，以及合法性与隐私风险。
6. 原生后台、Excel、Metricool、HypeAuditor、其他成熟替代为何不够；有些场景应当明确 STOP。

务必注明准确来源 URL、产品和地区、核查日期、可信度。官方文档说明 ≠ 私有账户实测。任何粉丝/订单/客户敏感数据严禁未授权批量导出。

### 五、构建“高价值数据工作流机会矩阵”

以“人群 × 平台 × 实际操作 × 数据 × 购买者 × 免费替代 × 商业结果 × 交付形态”为共同矩阵，识别不少于 30 个具体微任务；若无法去重或没有依据，应宁缺毋滥。按跨职业复用程度归并产品概念，不把 30 个按钮当 30 款独立扩展。

对 TOP10 逐维评估用户价值、频率、减少工时/资金误差、购买预算、差异化、免费替代、获客、OpenDesk 真实源码复用、合法数据源、权限/隐私、站点适配维护、开发成本和证据可信度。各项独立评分并给理由，安全/数据来源为不可被平均分抵消的 BLOCKED 门。再与原电商三个候选（卖家 SKU/对账、Listing QA、利润定价）做公平比较，不能在没有证据时宣布创作者方向获胜。

### 六、选择三种实际 MVP，而不是演示看板

优先评估：A 创作者预估/已结算佣金与退款差异对账；B 品牌商单交付证明与客户报告；C 品牌多创作者合同成本/归因核对。同时允许真实竞品/客户证据推翻前三名。

每个 MVP 必须给完整流程：用户打开官方后台的哪一页、自己导出什么、OpenDesk 的 Tool/Side Panel/网站脚本在哪里出现、用户点击什么、程序计算什么、输出哪些可核验差异、与 Excel/官方后台完成同样任务的差别、最小权限和数据留存、收费主体、第一版不做什么、GO/PIVOT/STOP。

优先交付 A 本地合法文件工具；只在站点规则及用户许可成立时考虑 C UserScript；独立 B 扩展须有明确独立付费价值及商店审核条件；需要持续多账号 OAuth 时才考虑 D SaaS。不可先假定最新 SDK 接口已全量真实 Chrome 验收。

### 七、验证、路线与真正落库

- 争取 10–15 位目标用户访谈、5–10 位真实试用，至少两个自然结算/报告周期；它们是未来目标，未经执行仍填 NOT_TESTED。
- 同一授权数据集对比平台内建工具、Excel/Sheets、至少两款付费竞品的工时、漏项、准确率、自然复用和报价/支付反馈。
- 商业判定分别记录实际付款、可核验采购意向、口头兴趣、免费试用，不相互替代。
- 给 0–6 周研究/试验以及 3/6/12 个月条件性实施路线，明确停止无价值产品的条件。
- 已核查事实增量写入原 docs/product/browser-extension-ecosystem/，优先更新 X 研究文档、相关索引、商业机会记录的证据字段；不得无真实实验就把 EXP 的 paidOrders、revenue 或用户统计填数值。
- 最终报告先给一个可读结论：自媒体假设哪些成立/哪些被反证；真正有价值的人群排名；每个后台究竟可查看/导出什么；首选 MVP 与原卖家首选孰优；最小版本应该怎样操作、谁愿意买单；本轮实际更改文件、测试、真实 commit SHA 和仍然未知的事项。

**成功标准：不是多找到几十款插件，而是找到至少一个拥有合法数据源、明确重复任务、能与免费竞品区分、值得被真实客户验证付款的方向。**
