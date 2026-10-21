# OpenDesk 后续 GOAL：Product Ecosystem R3 工程、电商 R2 商业研究与已废弃历史方案

> 仅供下一轮执行，当前 R1 **不实现**以下代码、不新增分支/Worktree/PR。开始时必须重新阅读最新 `AGENTS.md` 和 main HEAD；若发现并行写入冲突，保持只读并提醒，不强推、不修改其他 Agent 的工作。

> **2026-10-12 商业方向调整：**原 GOAL 1 Page QA / GOAL 3 EXP-002 的“首款商业产品”建议属于历史计划。现有 Page QA 实验源码已从 main 移除，历史设计仅供追溯。电商业务研究按 [电商 R2 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md)，需要编写真实工具代码的工程工作按下方 Product Ecosystem R3 GOAL；勿影响其他 Agent 的独立任务。

## 当前商业战略续接 GOAL（R1.2，2026-10-21）

> **此节覆盖本文历史“默认仅研究电商”的跨行业商业研究续接入口，不废弃电商实验或独立工程 GOAL。** 先按最新 main 读取 [长期商业目标与七项结论](commercial-opportunity-framework.zh-CN.md)、[S0–S4 实际验证计划](distribution-and-validation.zh-CN.md)、[唯一 OPP](opportunity-register.json)、[唯一 EXP](commercial-experiments.json) 和 [竞品依据](competitor-research.zh-CN.md)。A 是低成本首个验证，不得把原始商业目标收缩为“开发 AI 图文剪藏”。

~~~text
# GOAL：OpenDesk Browser Commercial Strategy R1.2-VALIDATION-FIRST
# 继承原始商业机会目标 · 关键任务防漂移 · 真实竞品/获客/买方证据
默认中文｜LATEST MAIN｜BUSINESS FIRST｜EVIDENCE FIRST｜SAFE MAIN
NO SECOND LEDGER｜NO FAKE BUSINESS METRICS｜MINIMAL DIFF

仓库：shopable-ai/opendesk-browser；唯一可修改/提交/推送分支 main。
不创建分支/Worktree/PR，不强推，不覆盖其他 Agent 提交。

【原始最高目标】
利用 OpenDesk 已有浏览器增强、自动化、UserScript、React/Vue/HTML
工具和 Browser SDK，以免费单任务获得用户；
通过 SaaS、专业数据、工作流、企业集成/维护产生可持续实际收入。
不是多造扩展；不要预设 AI 图文保存就是 OpenDesk 最赚钱产品。

【原始五问】
1 Chrome Web Store 哪些产品具有真正可核查的商业模式？
2 哪些竞品有可以合法争取的客户需求与搜索流量？
3 竞品/替代词、任务长尾词、CWS 自然流量何者获取客户更经济？
4 什么免费入口能带来真实高价值服务订单？
5 现有 OpenDesk 代码能否切实降低开发与持续维护成本？

【四项原始关键任务，不能删减】
T1 核验 ≥15 个业务场景、约 30 个既有 OPP 候选、
   约 20 家重点竞品的实际功能/价格/最近评论/反例/来源日期。
T2 分别研究 A AI 图文/提示词交付，B 授权企业网页工作流，
   C 卖家/行业合法数据核查；独立评估购买方、渠道、复用、
   真实留存、收入潜力和维护合规风险，不抬高研究评分。
T3 复用现有商业框架、竞品文件、唯一 84 OPP/8 EXP、
   获客验证日志和 README；不建第二套账本或 Browser SDK/Host。
T4 研究 Google 竞品品牌/替代词、明确任务长尾词、
   CWS 自然搜索、SEO，US/en 与 JP/ja 分开；
   用真实数据测首次完成、重复使用、实际付款、CPC/CAC/贡献；
   未授权广告账户或预算时不投放，缺的指标记 MISSING。

【本轮实施次序】
S0 先确认最新 main 和既有 knowledge-inbox、
   web-markdown-clipper、prompt-shortcuts、Workflow 的真实源码能力；
   找到 A 图文附件完整保存、读回和可信回执的最小缺口，
   不另造通用 AI 平台，正式 Chrome 未运行写 NOT_TESTED。
S1 只在确有真实差异和最小可实施缺口时做 A 的单任务验证；
   EXP-003 的 Research Clip & Cite 原身份保持不变。
S2 B（EXP-001）并行找具有授权、明确流程、采购人和预算的客户；
   C（EXP-005）必须先有合法数据样本；EXP-002 继续 ARCHIVED。
S3 对竞品评论、关键词搜索量/CPC、用户激活、自然复用、
   真实订单和成本逐项记录 FACT/ESTIMATE/HYPOTHESIS/MISSING。
S4 独立安全/授权、首次成功、重复使用、付款、
   单位经济否决门；GO/PIVOT/STOP/NOT_DECIDED 由实证决定。

【交付】
先写语义化关键结论、当前完成与未完成；
随后给源码复用证据、三方向独立判断与反面理由、
获客/采购实证缺口、S0–S4 进度、变更路径及提交 SHA。
商业研究质量目标 95+ 不等于方向成功率；
无真实产品/用户/广告数据不得宣称 PASS。
~~~

此 GOAL 是商业研究和证据优先级，**不自动授权广告花费、大规模产品重构或客户数据访问**。涉及实际新产品工程时另按对应工具所有权与真实验收执行。

## 当前工程任务（R3）：真实工具与通用架构

> **新的工程执行入口**：[Product Ecosystem R3 GOAL](../../framework/prompts/goal-product-ecosystem-r3.zh-CN.md)，任务树与验收门见 [R3 Roadmap](product-ecosystem-r3-roadmap.zh-CN.md)。依序完成 P0 清理影响验证、P1 复用能力映射、P2 实际电商工具/UserScript 闭环；只有真实独立发行必要时才启动 P3 Extension Factory 通用化。当前并没有已交付的跨产品通用 Factory，也不应重新建立 Page QA。
>
> 本 GOAL 用于**真实工程实现**；下面 R2 GOAL 用于**商业研究**，两条线互相提供证据，但不能互相冒充完成或对方的发布授权。工程状态写 [R3 工作流](../../framework/workstreams/product-ecosystem-r3.md)。

## 并行的商业研究任务（R2）：电商需求与商业验证

请直接复制 [电商工具宇宙 R2 正式 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md)，本轮首先对齐已保存的研究文件、分析卖家与购物者真实任务、筛选有买方和合法数据源的 MVP，而不是进一步实现 Page QA。

## 历史 GOAL 1（DEPRECATED / 禁止继续执行）— Page QA 独立插件

> 此提示词仅作历史留档；不再复制到新对话继续构建、Mac Chrome 验收或发布 Page QA。通用 Extension Factory 的下轮工程需求需要另行确认真实产品价值与权限。

```text
# GOAL：OpenDesk Browser Extension Factory R2
## 目标：在不复制整套源码、不打破现有 OpenDesk 构建的前提下，
##       真正生成第一款可独立安装的 Page QA Inspector。

仓库：https://github.com/shopable-ai/opendesk-browser
只修改 main；不创建分支、Worktree 或 PR；不 force push/reset/clean。
先读 AGENTS.md 和 docs/product/browser-extension-ecosystem/
  README.zh-CN.md、extension-factory-architecture.zh-CN.md、
  product-priorities.zh-CN.md。

任务一：只读盘点实际 Manifest/WXT/Build/Pack/权限/SDK；
确认最新代码和未提交/并行改动，再制定最小受控修改范围。
任务二：实现 ProductConfig + Feature/Permission Resolver；
拒绝未知 feature、重复 ID、无用权限和运行时加载远程特权 JS。
任务三：保留原 npm run build 默认行为，新增 --product 显式构建；
独立的 Page QA Inspector 只做用户点击后当前页 DOM/a11y 检查和报告。
任务四：按产品构建独立 Manifest、静态资源图、ZIP、存储与扩展 ID；
真实双扩展并装，确保相互隔离且不继承 OpenDesk 的 <all_urls>/cookies。
任务五：Node/Check/Build/Pack、Mac 真实 Chrome 点击/撤权/重启/
异常页面/升级、发布包 hash 一致性及 CWS 政策人工审核材料。
任务六：安全回写实现状态、原始 CI/浏览器证据、README/计划和下一步缺口。
只在通过影响范围验证、安全且 main 无冲突时提交推送。
严禁只写抽象接口不接使用流程；未获 CWS 审核不能称已发布。
```

## GOAL 2 — UserScript Ecosystem R2 · 安装→更新→回滚→精选脚本市场闭环

```text
# GOAL：OpenDesk Browser UserScript Ecosystem R2
## 目标：基于已有真实 Page Installed 与可信市场 Intent，
##       完成 .user.js 安装/启停/更新差异/回滚和小规模精选脚本发行。

仓库：https://github.com/shopable-ai/opendesk-browser
只修改 main；不创建分支、Worktree 或 PR；不 force push/reset/clean。
先读 AGENTS.md、docs/product/browser-extension-ecosystem/
  userscript-ecosystem.zh-CN.md、product-priorities.zh-CN.md，
  R8 188 功能账本及 GM 方法矩阵。

任务一：审计 src/scripting/user-scripts/installed-programs.js 的 register/
getScripts/unregister/reconcile/boot，禁止重造 Page Registry。
任务二：用户选择 .user.js/React/Vue 项目，本地可信自动准备并锁
sourceHash/依赖，按网站授权安装；保留普通 JS 和零参数 Controller 边界。
任务三：来源、作者/许可证、@match/@grant/@require 与第三方依赖 UI 审核；
不同版本显示源码/权限/依赖 diff，确认后原子升级，失败回滚。
任务四：选 5-10 个实际可维护脚本做网站 Fixture + SPA/iframe/撤权/
刷新/Chrome 重启/Chrome138+ Allow User Scripts 验收；
不承诺目前尚未验证的 GM_* 完整兼容。
任务五：从现有 marketplace/intent 设计脚本发行交接，
网页只能提出有限安装意图，不得提供扩展授权或远程代码特权通道。
任务六：登记版本、失效网站、撤销和错误日志；
更新 R8 原有 ID/E01-E40 状态，不增第二执行器或第二账本。
在安全无并行冲突与同候选真实 Chrome 测试满足后提交到 main；
未通过的流程逐项写 NOT_TESTED/BLOCKED，禁止宣称全面 95+。
```

## 历史 GOAL 3（DEPRECATED / 禁止按旧优先级执行）— Commercial Discovery R2

> 下方旧 GOAL 曾把 EXP-002 Page QA 作为当前付费验证对象，现已废弃。其余领域需求需与当前电商 R2 和 EXP 台账对齐，严禁从此历史文本恢复 QA 商业立项。

~~~text
# GOAL：OpenDesk Browser Commercial Discovery R2
## 首要目标：不重复整理 188 功能和 84 个机会，直接把前三个商业假设验证成真实用户与付费/留存证据。

仓库：https://github.com/shopable-ai/opendesk-browser
只在 main 修改研究文档，不创建分支、Worktree、PR，不强推，不覆盖并行修改。
先读取 AGENTS.md 和 docs/product/browser-extension-ecosystem/ 下的
README.zh-CN.md、commercial-opportunity-framework.zh-CN.md、
monetization-unit-economics.zh-CN.md、distribution-and-validation.zh-CN.md、
commercial-experiments.json；同时继承 R8 188 功能账本与 E01–E40。

先核对最新 main 和相关工作流；不重新开发 Browser SDK 或第二执行器。
优先验证 EXP-001 企业重复工作流付费试点、
EXP-002 Page QA Inspector 自主使用及独立产品价值、
EXP-003 Research Clip & Cite 在真实任务中的重复使用。
脚本作者市场 EXP-004 先验证安装/更新/回滚安全，不预设收入。
针对买方、实际工作步骤、频次、替代方案、渠道、付款单位与维护工时，
记录可验证事实，未收款不得宣称收入，未访谈不得编造需求。
所有外部客户联系、收款或隐私数据处理需另获明确授权。
CWS 单一用途、重复内容、白标、最小权限和合法数据来源为独立否决项。
交付 GO/PIVOT/STOP、真实/缺失证据、各项 Gate 结果和下一轮产品建议；
仅在安全无并行冲突时将研究文档保存 main。
~~~

## 新增：R4 商业闭环 MVP 实施入口（2026-10-13）

- [一个真正在浏览器插件内可用的卖家结算审计 MVP 工作流和任务树](commercial-mvp-workflow-r4-20261013.zh-CN.md)
- [复制到下一源码对话的 R4 完整 GOAL](../../framework/prompts/goal-commercial-mvp-seller-payout-r4-20261013.zh-CN.md)

仅 P0 使用手动 CSV 和本地解释规则，不重建 SDK/Task/工具市场，不提前创造支付/用户统计。Page QA Inspector 仍 DEPRECATED。
