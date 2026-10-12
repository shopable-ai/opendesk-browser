# OpenDesk Browser Product Ecosystem R1–R3（决策、任务树与长期导航）

> 2026-10-12。本目录是**产品机会研究与产品架构提案**，并非已发布软件、正式验收或市场规模证明。仅基于远端 GitHub `main` 的抽样源码、既有 R8 账本/工作记录及公开产品和政策资料；**未能访问用户 Mac 本地工作区，不能证明其 git status、真实 Chrome、最终构建或本地并行写入情况**。新研究不得覆盖现有 R8 188 条稳定 ID 与 E01–E40。
>
> 每个新增 `OPP-xxx` 是**产品机会 ID**，不是新的工程任务、R8 功能 ID 或已经实现的产品。

> 首次合入审计基线：`main@8ccec441898bc3a175b20105d7116850de9f5be0`，研究首轮提交 [`6463b7098bc9`](https://github.com/shopable-ai/opendesk-browser/commit/6463b7098bc968b12097c48f754a102cd4390312)。后续工作不得将此 SHA 的源码审计状态提升成更新后主线的原生验收。任何状态声明都要按最新 HEAD 再核对。

## 当前工程推进入口：Product Ecosystem R3

- **[R3 完整任务树与状态](product-ecosystem-r3-roadmap.zh-CN.md)**：P0 清理回归 → P1 框架能力复用 → P2 真实电商 A/C MVP → P3 条件性独立插件工厂 → P4 验收 → P5 工程交接。
- **[R3 可复制完整实施 GOAL](../../framework/prompts/goal-product-ecosystem-r3.zh-CN.md)**：供下一次需要修改真实源码、实现可用工具的工程对话直接使用。
- **[R3 工程工作流](../../framework/workstreams/product-ecosystem-r3.md)**：本轮文档落库与下次代码/测试证据记录，不代替原 Browser SDK、Cloud Control 等工作流。
- 商业研究仍按[电商工具宇宙 R2](../../framework/prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md)推进，研究结论不能直接当作功能完成或付费事实。

> 本次新增的是**文档导航和下一阶段执行计划**，不是新插件、SDK 接口或 Factory 代码；不要将 R3 GOAL 的任务当作已完成。Page QA 仍是 DEPRECATED / SOURCE_REMOVED_FROM_MAIN。

## 当前有效产品决策（2026-10-12，覆盖旧 R1 排名）
**停止将 Page QA Inspector 当成商业产品或首款独立 Chrome 扩展。** `DEPRECATED / NO_RELEASE / SOURCE_REMOVED_FROM_MAIN`：原 `products/page-qa-inspector/`、QA 专用 feature、专用实验工厂脚本/测试/CI 已从当前 `main` 源码树移除，根产品构建命令也已清理。历史设计、源码提交、决策与证据仍可追溯；本仓库当前**没有已交付的跨产品通用 Extension Factory**。商业实验 `EXP-002` 已归档，不得根据旧 TOP5、MVP1、GOAL 恢复 Page QA 开发或上架。

当前优先研究 **电商卖家 B2B 的 Listing/SKU/毛利工作流（EXP-005）** 与 **消费者 B2C 的实际到手价/购物决策（EXP-007）**；两者仍是 `HYPOTHESIS / NOT_VALIDATED`，不是已经核实的付费项目。保留企业工作流/研究剪藏等其他方向作为独立备选。请以[商业纠偏决策](commercial-decision-ecommerce-20261012.zh-CN.md)和[电商工具宇宙](ecommerce-tool-universe.zh-CN.md)为准，**不要把旧 TOP30 技术机会排序当商业立项排序**。

下一轮工程实施优先参考 [R3 GOAL](../../framework/prompts/goal-product-ecosystem-r3.zh-CN.md)（真实工具与框架复用）；商业研究继续参考 [电商 R2 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md)。两条工作线独立维护证据，不再执行旧 Page QA 专项验收。

## 一句话结论

**A 做通用能力和受信内核，C 做多网站功能试验和开发者生态，B 把通过验证的独立用途做成独立商业产品。** 不能把克隆换壳扩展的数量作为目标；不为了“全网覆盖”无价值地上架。


```text
OpenDesk Product Ecosystem
├─ A 通用平台：工具 / 开发 / 工作流 / 安装更新
│  ├─ Browser SDK / Host / 权限 / 任务 / Page UI
│  ├─ 工具目录：阅读 / Cookie / 标签 / 截图 / 备份 / 隐私
│  ├─ 本地开发：零参数 Controller / JS / JSX / SFC
│  └─ 市场交接、版本管理、诊断与质量治理
├─ B Extension Factory：按单一用途独立发行
│  ├─ ProductConfig / FeatureModules / ManifestPlan
│  ├─ ProductBuild / TestEvidence / StoreReview
│  ├─ 独立身份、版本、存储、最少权限、发行通道
│  └─ 行业产品：QA、SEO、卖家、研究、企业等
└─ C UserScript / Website Tools
   ├─ 元数据、@match、@grant、更新审核、依赖锁
   ├─ Page USER_SCRIPT、React/Vue 编译、脚本数据分区
   ├─ GM G0→G1→G2 分级（绝不等同 Chrome 全权限）
   └─ 网站脚本目录、作者、安全审核、安装与撤销
```


## 文档索引

- [R3 任务树与阶段验收](product-ecosystem-r3-roadmap.zh-CN.md) — 当前工程推进顺序、产品形态、依赖、状态和实际验收门
- [R3 实施 GOAL](../../framework/prompts/goal-product-ecosystem-r3.zh-CN.md) — 新对话复制执行的完整工程任务
- [R3 工程记录](../../framework/workstreams/product-ecosystem-r3.md) — 候选身份、实际修改、测试证据和阻断交接

- [整体产品战略](product-strategy.zh-CN.md) — 三路线业务边界、商业模式和发行方式判断
- [Extension Factory](extension-factory-architecture.zh-CN.md) — 基于最新源码的可复用性审计、建议分层与构建/发布闭环
- [UserScript 生态](userscript-ecosystem.zh-CN.md) — 用户脚本执行、GM 分级、脚本发布和购物脚本限制
- [行业候选目录](vertical-product-catalog.zh-CN.md) — 12 行业、84 个具体功能与网站/付费/维护风险
- [通用浏览器工具](common-browser-tools.zh-CN.md) — 平台内置工具及受信 Host 的边界
- [竞品与证据](competitor-research.zh-CN.md) — 代表性竞品、风险与来源置信度
- [机器可读机会库](opportunity-register.json) — 84 条稳定机会 ID，TOP30 标记，证据强弱明确
- [研究优先级](product-priorities.zh-CN.md) — R1 历史 TOP30/TOP5 与当前商业决策区分
- [24 个月候选路线](roadmap-24-months.zh-CN.md) — 0–3/3–6/6–12/12–24 月里程碑与否决门
- [持续研究办法](research-process.zh-CN.md) — 去重、证据升级、周/月/季节奏与手工执行说明
- [商业机会发现框架](commercial-opportunity-framework.zh-CN.md) — 14 个机会视角、五层漏斗与八类跨行业商业方向（R2）
- [盈利模式与单位经济](monetization-unit-economics.zh-CN.md) — 十二种收费方式、支付/权限分离及成本公式（R2）
- [获客与商业验证](distribution-and-validation.zh-CN.md) — 渠道、合作伙伴、付费试点与六周实验方法（R2）
- [商业实验台账](commercial-experiments.json) — 8 个 EXP、无虚构订单和访谈、不复制 84 个 OPP（R2）
- [下一轮 GOAL](next-goals.zh-CN.md) — 当前电商验证 GOAL 与历史已废弃提案
- [商业方向调整：电商优先](commercial-decision-ecommerce-20261012.zh-CN.md) — Page QA 已退出商业路线且实验源码已从 main 移除；先验证电商问题与付费方
- [电商工具宇宙](ecommerce-tool-universe.zh-CN.md) — 消费者/卖家/品牌/供应链/生态共 20 个研究领域
- [电商研究 R1 历史 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r1.zh-CN.md) — 原始研究范围
- [电商商业验证 R2 当前 GOAL](../../framework/prompts/goal-ecommerce-tool-universe-r2-commercial-validation.zh-CN.md) — 文档收敛、真实买方与三个 MVP 决策

## 权威文档边界

- **唯一 188 功能账本**：[`browser-automation-feature-catalog-r8.zh-CN.md`](../browser-automation-feature-catalog-r8.zh-CN.md)，只能在该处更新成熟功能的状态。
- **唯一 E01–E40 工程任务**：[`browser-automation-r8-implementation-plan.zh-CN.md`](../browser-automation-r8-implementation-plan.zh-CN.md)；本目录不重新编号。
- **GM 逐方法行为**：[`userscript-compatibility-matrix-r8.zh-CN.md`](../../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md)。
- **安全边界与执行世界**：[`plugin-capability-architecture-r8-adr.zh-CN.md`](../../architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md)。
- **实际 Browser SDK 实现进度**：[`browser-sdk-status.md`](../../framework/workstreams/browser-sdk-status.md)；该工作流独立更新，不在本目录谎报完成。
- R8 的“三页签”段落属于历史设计：当前 `src/ui/tool.html` 已有「我的、发现、工作流、开发、工具」以及条件展示的「云控、调试」，不得回退到旧结构。

## 状态和证据口径

`RESEARCH` / `HYPOTHESIS` ≠ `SOURCE_IMPLEMENTED` ≠ `COMPONENT_TESTED` ≠ `BUILD_VERIFIED` ≠ `CHROME_NATIVE_VERIFIED` ≠ `CWS_APPROVED`。产品机会的“高频”只是待验证假设；本轮**没有完成用户访谈、授权页面真实使用、Mac 浏览器商店审核或支付转化测量**。

安全/隐私、合规、真实可运行性为独立硬门，不因其他评分高而豁免。
