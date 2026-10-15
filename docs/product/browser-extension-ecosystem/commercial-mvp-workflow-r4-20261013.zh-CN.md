> **R5 历史定位更正（2026-10-15）**：本文 R4 的“首先开发与验证”是当时 Seller Payout / CSV 对账方向的**工程候选计划**；它仍是 `RESEARCH / NOT_IMPLEMENTED / NOT_PAID_VALIDATED`，**不是全球浏览器脚本/工具市场默认第一产品**，不再自动触发工程开发。依照 [全球 24 领域研究宇宙](domain-relevance-universe-r5.zh-CN.md) 与 [独立双榜及合法转换](script-market-discovery-r5.zh-CN.md) 重新比选；原研发方案保留供追溯，不更改原 EXP-005 含义。


# OpenDesk Browser R4 商业工作流：插件功能、开发任务与首款付费闭环 MVP

> 日期 2026-10-13。状态：RESEARCH / PLAN / NOT_IMPLEMENTED / NOT_PAID_VALIDATED。
> 继承原 84 个 OPP、8 个 EXP、R8 188 项能力、E01–E40；不另建机会账本、SDK、任务运行器。原 EXP-005 是 Listing QA，不能偷换为本结算审计实验。Page QA Inspector 继续 DEPRECATED / NO_RELEASE。
> 本文为产品工程路线，并非实际运行的浏览器插件/客户收入证明。仅检视远端 main 的关键源码；未访问用户 Mac 本地工作区、真实账户或原生 Chrome。

## 结论与真正产品

选择 Seller Payout Exception Auditor（卖家结算异常核对）作为**首先开发和验证的一条浏览器内业务工作流**。针对能合法下载 Shopify Payments 自身流水的店主、财务负责人、记账服务商。购买者、预算、交易规模、每周频次、当前软件付费和真实付款均 UNKNOWN/NOT_MEASURED。

价值不是重做 Shopify Finance 结算报表，而是比其原生功能和 Excel/A2X 更便捷地解释跨账期/退款/手续费等不一致。任何用户任务需拿“真实错误或返工节省”说话；若原生足够，STOP。

来源参考：https://help.shopify.com/en/manual/payments/shopify-payments/payouts/view-details
注意：该导出针对适用 Shopify Payments 的账号/角色，不等于所有 Shopify 支付渠道。官方示例列包括 Transaction Date、Type、Order、Payout Status、Payout Date、Amount、Fee、Net；实际 CSV 必须按账号/文件版本校验。

## 一、产品使用闭环：以用户真实浏览器操作为起点

| 环节 | 用户点击/操作 | OpenDesk 实际功能和结果 |
|---|---|---|
| 发现与启动 | 浏览器侧边栏「工具」→「经营对账」→打开工作页 | 复用现有 Tool Tab，不做另一套 Sidebar |
| 获取数据 | 用户合法进入 Shopify Admin Finance/Payouts，主动点击官方 Export | 不代替用户登录、不偷取 Cookie、不自动抓内部 API |
| 输入 | 完整工作页选择/拖放一到两期 CSV 文件 | 本地 File API，检查格式、大小、SHA-256、时区/币种/来源 |
| 核对字段 | 映射 Transaction Date / Type / Order / Payout Status / Payout Date / Amount / Fee / Net | 显示映射与样本行，缺字段须 UNKNOWN，不虚构 payout ID |
| 规则处理 | 确认账期、符号、币种并点击「核对」 | 识别净额算术差异、退款、调整、pending、跨期、重复候选及未知资料 |
| 逐行解释 | 筛选异常，点击记录 | 显示原文件 SHA-256、行号、原字段、口径、计算式与人工复核说明 |
| 导出 | 点击「下载差异 CSV」「证据 JSON」 | 脱敏文件、本地下载；CSV formula injection 防护，不自动发送 |
| 人工处理 | 财务人员复核并与外部凭据对照 | 形成待处理清单而非宣称平台欠款 |
| 返回 | 下一个自然结算周期重新上传新 CSV | 可自愿保存非敏感字段模板；原始敏感行默认内存并可删除 |

结果分类：MATCHED / EXPECTED_TIMING / NEEDS_REVIEW / INSUFFICIENT_EVIDENCE。Shopify transaction Net 不是银行到账，GMV 不是利润；无银行/成本/归因证据时不能作银行对账已完成或真实 ROI 结论。

### 推荐界面

Side Panel 既有「工具」页面中只增加可信「经营对账」启动卡（先受邀试点，不强制预装），不将几万行交易塞入侧栏。受信第一方完整浏览器标签页显示四步导航：① 导入 → ② 确认字段 → ③ 查看异常 → ④ 导出与删除。下方是来源/账期/币种标签、异常摘要、带搜索和筛选的交易明细、点击行展开的依据抽屉、脱敏 CSV/JSON 下载及一键清除。遵守现有 design-tokens 与 UI 布局规范，支持窄屏、200% 缩放与键盘操作。

## 二、插件功能模块与开发优先级

| 优先级 | 具体功能 | 当前判断 |
|---|---|---|
| P0 | 工具 Tab 可信入口/启动 full-tab | 待开发，复用现有 UI  |
| P0 | 用户手动 CSV 导入及格式/大小/编码/BOM/引号/换行检查 | 待开发 |
| P0 | Shopify Payments 导出 profile/字段预览与人工确认 | 待开发 |
| P0 | 货币最小单位/精确十进制、正负、币种、时区、类型/状态规范化 | 待开发 |
| P0 | 逐行交易、手续费/退款/adjustment、账期及疑似重复差异引擎 | 待开发 |
| P0 | 来源 SHA-256/行号/规则版本、UNKNOWN 说明与清单筛选 | 待开发 |
| P0 | 真正 .csv 差异导出、.json 证据导出、安全脱敏与清除 | 待开发 |
| P0 | 合成样本单测、固定 WXT 构建、真实 Chrome 导入/下载 | 未验证 |
| P1 | 跨期与多数据源、字段模板、审计历史（仅用户许可） | 待用户复用证据 |
| P1 | SKU/成本与利润规则适配器、本人 TikTok Shop US 佣金 CSV 适配器 | 分别待数据/买方核实 |
| P2 | MCN 商单合同验收、B2B 报价/发票核对 | 待业务验证 |
| P2 | 订阅支付、API OAuth、团队审计、SaaS/后端 | 获得客户实付和合规许可后 |
| P3 | 独立单一用途 Chrome 扩展或工具市场商品上架 | 取得真实复用与差异化后 |

首版数据规则必须确定性解释，AI 文字说明只能在规则正确后可选加入，不能参与金额计算。

## 三、重要源码限制与对应架构决策

已阅读 src/ui/tool.html、src/ui/tool-shell.js、src/ui/sidebar-tools.js、src/ui/sidebar-tools/package.js、src/sidebar-tools/bridge.js、src/platform/storage/idb.js、src/platform/entitlement/index.js、wxt.config.mjs、scripts/build-contract.mjs。

当前普通可安装 Side Panel 工具每工具本地数据限制约 32 KB（单项 8 KB），通过 user.export/file.download 只可下载不超过 150 KB 文本且仅有 .md/.txt/.json 后缀，**不能直接提供数万行 .csv 结果下载**。因此：

- P0 正式版本：Side Panel 只负责入口；受信任扩展完整工作页负责本地文件读取、确定性计算和用户触发的真正 CSV/JSON 导出。轻量工具包可以独立做样例原型，但不能把不支持的 CSV 能力说成已有。
- 新工作页需要按 wxt.config.mjs 固定 entry、scripts/build-contract.mjs 的 PACKAGE_ENTRIES/FIXED_OUTPUTS、Manifest/CSP、资源验证与体积预算增量接线。不能往 Service Worker、首屏 Side Panel 打入所有解析代码。
- 财务原始行默认仅在内存中，明确删除，不误用已有受限 Sidebar Tool Storage 或 IndexedDB 模板业务 store；字段映射模板 opt-in 可存少量非敏感数据。
- 不能因 src/platform/entitlement/index.js 名称包含 entitlement，就当它已有通用付费 SaaS 账号/订阅。不能新造浏览器 SDK、运行器、权限中心、工具市场。
- 首版无需 hostPermissions、Cookies、Network Observe、后台定时抓取或 Shopify 账号授权。最少权限和第三方数据许可分别独立审查。

### 候选源码位置（计划，尚未创建）

- src/features/commercial-audit/import-csv.js：纯函数 CSV 解析、失败提示。
- src/features/commercial-audit/money.js：币种精度/小数/符号。
- src/features/commercial-audit/source-profiles/shopify-payout.js：官方字段映射。
- src/features/commercial-audit/reconcile.js：按业务口径识别差异。
- src/features/commercial-audit/evidence.js / export.js：来源和安全导出。
- src/ui/tool.html、src/ui/tool-shell.js：现有「工具」入口增量。
- src/ui/commercial-audit.html / commercial-audit.js：新的受信完整工作页。
- src/entrypoints/、wxt.config.mjs、scripts/build-contract.mjs：如需要新增固定打包入口，先查重并按冻结资源合同注册。
- tests/environment/commercial-audit*.test.mjs、tests/fixtures/commercial-audit/：金额、解析、隐私、恶意公式和逆向测试。
- docs/framework/workstreams/：代码/Chrome 来源 SHA、测试与真实产物证据。

## 四、按依赖顺序执行的工程任务树

1. 需求冻结：采访有自己 Shopify Payments 导出权限的店主/财务人员，收集许可脱敏样例；没有样例先用明确标记的合成 fixture。记录原生报表+Excel/A2X 对照。
2. 环境与冲突核查：AGENTS.md、最新 main、Mac git status、并行 Agent 与共享 WXT/Chrome 资源；预审固定入口及侧栏连接点。不允许新增分支/Worktree/PR，不覆盖其他人改动。
3. 纯业务逻辑：CSV 解析 → 来源字段/日期/币种规范化 → 金额精确对齐 → 异常规则 → 逐行证据 → 安全 CSV/JSON。包含正常、退款、负手续费、跨期、文件重叠、同金额不同交易、未知字段的全部反例。
4. 真实工作页：Side Panel 工具点击→full-tab 导入→确认字段→核对→明细证据→实际下载/删除。既有 UI 规范，按需加载与包大小审核，不做静态效果替代。
5. 定向测试：业务固定预期数据金额逐项零偏差；CSV BOM/引号/嵌入换行与公式注入安全处理；样例 1k/10k/15k 行的正确性、UI 响应、内存和产物字节真实测试。
6. 构建与 Chrome：适用时执行 node --test、npm run check、npm run build、npm run build:dev、npm run verify，并在 Mac Chrome 对同一明确包做真实点击、下载落盘、刷新/清除、权限/错误回归；不能把 Node PASS 当 Native PASS。
7. 产品反馈：至少两个自然结算周期中的客户自发重复操作，比较原生+Excel 与本工具的工时/差错，再向预算负责人提出清晰报价与付费试点范围。
8. 商业审查：符合 GO 才实现 P1 adapter 和付费服务，不达标 PIVOT 到 SKU/创作者/采购业务或 STOP；避免研发无付费价值的几十个插件。

## 五、商业闭环及验收硬门

**使用闭环**：合法官方下载 CSV → 插件处理 → 可追溯异常 → 用户人工解决 → 导出证据 → 下一自然周期再次使用。

**获客付费闭环**：行业问题教程/卖家社群/记账伙伴 → 安装/首次成功 → 与原生/Excel 对照证明确有价值 → 预算方试点报价 → 实际付款/合同 → 使用和续费/维护。第一笔付费可人工开票确认，不需要为了尚未发生的购买提前创建账号 SaaS。收费假设：Free 单期核查；Pro 跨期、多来源、规则模板和高级证据；Team 审核及协作。安全、金额正确性、数据删除不可设为勒索性付费门槛。

未来验证目标：10–15 位目标用户访谈、5–10 人试用、至少两个自然业务周期。金额正确性、合法数据权、隐私、真实 Chrome 下载任何一项失败即 BLOCKED。对照 Excel 无明显优势、买方不愿付款、自然不复用、平台已解决或成本不可控即 STOP。改走有合法数据及真实价值的 SKU 毛利/创作者佣金/采购 PO 发票为 PIVOT。即使有两位真实早期付费者也不能称为已达到 PMF。

关联：原 OPP-081 报表字段口径核对、OPP-083 多平台指标对账、OPP-018 平台费用与毛利；EXP-005 仍是 Listing QA，不虚构本项目已纳入已执行或已付费实验。下一轮按 R4 GOAL 实施：../..//framework/prompts/goal-commercial-mvp-seller-payout-r4-20261013.zh-CN.md。
