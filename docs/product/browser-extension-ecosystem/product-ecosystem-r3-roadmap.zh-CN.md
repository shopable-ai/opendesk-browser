# OpenDesk Browser Product Ecosystem R3 — 产品生态任务树与实施路线

> 日期：2026-10-12。状态：`PLANNED / EXECUTION_GUIDE`；这是**后续工程路线图**，不是已交付产品清单，不替代原有 R8 188 能力账本、E01–E40、84 项 OPP 或 EXP 商业实验台账。执行前必须重新核对最新 `main`、用户工作目录与对应 workstream。  
> 当前关键决策：**Page QA Inspector = `DEPRECATED / NO_RELEASE / SOURCE_REMOVED_FROM_MAIN`**；清理提交 [6d71854b](https://github.com/shopable-ai/opendesk-browser/commit/6d71854b49fc2fcbace0047b8703b9c2c154211b)，后续历史文档 [9122d8d8](https://github.com/shopable-ai/opendesk-browser/commit/9122d8d8c29b5f15e417d0d4fab39bae645d5c0a)。**通用跨产品 Extension Factory 尚未交付**，不得恢复仅支持 Page QA 的旧命令或专属模块。

## 一、产品形态：一个核心，四种交付方式

~~~text
OpenDesk Browser 核心（现有功能必须逐项核验）
├── Browser SDK / Host / Authority / Chrome Adapter
├── Controller / Page USER_SCRIPT / React-Vue 准备与执行
├── 公共第三方库、Storage、Task、安装更新、Marketplace
└── 权限、来源身份、持久结果、版本与审计边界
    │
    ├── A. OpenDesk 内置与安装型工具：Side Panel / 工具市场
    ├── C. UserScript / Website Tools：逐站匹配、注入 UI、按授权执行
    ├── B. 独立 Chrome 扩展：独立 Manifest / 入口 / 版本 / 发布
    └── D. 可选 SaaS / 官方 API：依法授权的数据源、账号和后台服务
~~~

**这是职责架构，不代表上述所有调用链已正式验收。** 独立扩展不能继承原 OpenDesk 的特权 Host 或全站权限；Page 脚本和 Controller Worker 不是一个 JavaScript 全局世界，所有运行时全局变量约定以 [正式矩阵](../../api/runtime-globals-and-preinstalled-libraries.zh-CN.md)为准。

| 用户需求特点 | 首选形态 | 不应混淆的边界 |
| --- | --- | --- |
| 通用、低维护、适合工具中心按需开启 | A OpenDesk 工具 | 既有工具 iframe 不能被视为拥有扩展特权 |
| 在具体购物/卖家网站上增强 UI 与交互 | C 网站脚本 | `@match`、执行世界、撤权、依赖锁和网站条款必须独立处理 |
| 单一明确目的、长期独立品牌/商店分发、确需自身权限 | B 独立扩展 | 需要单独的 Manifest、Chrome 身份、存储、测试与发布审核 |
| 需要价格历史/订单/广告/商家私有数据等真实服务 | D 官方 API/SaaS | 未获授权不接账号、不访问隐私数据、不宣称已有实时来源 |

选择顺序：**用户工作流 → 现有能力与许可 → 最小可用 A/C MVP → 真实使用和买方证据 → 必要时 B/D**。不是必须先造 Factory 才能做有价值的工具。

## 二、R3 唯一工程推进任务树（P0–P5）

状态解释：`COMPLETED`=有提交可追溯；`NEEDS_REVIEW`=需要按最新候选核对；`PLANNED`=尚未实施；`CONDITIONAL`=满足前置条件才启动；`NOT_TESTED`=缺少相应真实测试；`BLOCKED`=已知约束禁止继续。P0–P5 是**本路线图的展示标签，不是新的 R8 能力 ID/E 编号**。

~~~text
Product Ecosystem R3
├─ P0 清理与回归
│  ├─ Page QA 及其硬编码工厂代码从 main 清理：COMPLETED（历史提交）
│  ├─ 默认 npm build/pack 命令不变：静态核对完成
│  └─ 按最新构建输入与证据复核受影响测试：NEEDS_REVIEW
│
├─ P1 框架复用与产品入口
│  ├─ Browser SDK / Host / Authority 真正可用的方法与权限：NEEDS_REVIEW
│  ├─ Side Panel 工具、Program、Marketplace 安装与更新：NEEDS_REVIEW
│  ├─ Page JS/React/Vue、UserScript、公共库执行世界：NEEDS_REVIEW
│  └─ 真实消费者 → 代码入口 → 权限 → 结果 → 证据映射：PLANNED
│
├─ P2 电商业务最小闭环（先于正式独立插件）
│  ├─ EXP-005：卖家 Listing / SKU / 毛利只读辅助：PLANNED
│  ├─ EXP-007：消费者实际到手价 / 条件透明说明：PLANNED
│  └─ 授权站点/本地 Fixture + UI/脚本 + 错误反馈：PLANNED
│
├─ P3 通用 Extension Factory（以真实产品需求触发）
│  ├─ Product Registry / ProductConfig：CONDITIONAL
│  ├─ Feature Catalog / Resolver / 最少权限推导：CONDITIONAL
│  ├─ 独立 WXT Manifest / Build / Pack / Hash：CONDITIONAL
│  ├─ 两种非商业 Fixture 配置的跨产品隔离测试：CONDITIONAL
│  └─ 商店产品、版本和政策审核：CONDITIONAL
│
├─ P4 受影响验证与安全门
│  ├─ Node、源码检查、默认构建、ZIP 与哈希：NOT_TESTED（R3 同候选）
│  ├─ UserScript 授权/撤销/导航/更新/回滚：NOT_TESTED（R3 同候选）
│  ├─ 多产品 Manifest/资源/存储/权限隔离：NOT_TESTED
│  └─ Mac Chrome 原生、CWS、用户留存/付费：NOT_TESTED
│
└─ P5 文档、真实回执与下一轮规划
   ├─ R3 路线/GOAL/工作流入口：本轮文档创建
   ├─ 继续复用 R8/OPP/EXP 唯一权威记录：持续要求
   └─ 版本、改动、测试、阻断、下一 GOAL：每次实际迭代后更新
~~~

## 三、分阶段实施合同与验收门

| 优先阶段 | 要交付什么 | 依赖 / 入口 | 必须证明的通过条件 |
| --- | --- | --- | --- |
| P0 清理闭环 | QA 代码引用清点、受影响回归记录 | [R2 历史工作流](../../framework/workstreams/extension-factory-r2.md)、`package.json`、`scripts/build.mjs` | 无已删除脚本的活跃消费入口，默认构建/打包的有效证据绑定当前相关输入；未测不写 PASS |
| P1 真实能力地图 | 每条场景的“用户动作→实际 API→Host→权限→输出”追踪 | [Browser SDK 进度](../../framework/workstreams/browser-sdk-status.md)、现有 `src/`、[测试复用指南](../../framework/testing-guide.md) | 不凭 Schema/文档推定可调用；区分已接线、已测试、原生验证 |
| P2 业务 Demo | 至少一个可运行 A/C 工具，第二个场景的实现/限制结论 | EXP-005、EXP-007、已有工具/脚本运行时 | 有用户可见入口、确定性的结果、权限、异常消息和可复现测试；演示通过≠有人付费 |
| P3 通用工厂 | 条件满足后建立产品注册/选模块/最小权限/独立构建 | P2 的真实独立发行需求 + 经过评审的配置合同 | 至少两种不同的静态 Fixture 配置证明选择性打包；不假装产品上架 |
| P4 严格验证 | 同候选测试/包/原生证据与失败记录 | 已影响源码和许可范围 | 每个独立门单独记录 PASS/FAIL/BLOCKED/NOT_TESTED；不做综合分遮盖失败 |
| P5 交接 | 更新本路线图、工程 workstream 和下一 GOAL | 本次迭代的真实 Git SHA / Receipt | 文件、代码入口、测试证据、未完成任务、下一步明确且可追溯 |

### P2-A：卖家 Listing / SKU 辅助（EXP-005）

- **真实任务**：卖家在自己有权访问的商品编辑或管理页主动运行检查，得到标题、SKU/变体、必填字段与资料一致性提示；有明确许可才允许选择性导出资料。毛利只用可信费率或用户输入进行**估算**。
- **数据权限**：优先商家本人数据或经授权官方 API；在未确认平台条款前，用可审计本地 Fixture 展示结构与异常，不宣称已经对接卖家后台。
- **输出**：检查项、字段来源、缺失/冲突、建议动作、可选本地结果；第一版不自动发布、改价格、处理订单或发消息。
- **验收**：正常/缺失/重复/变体异常等可重复场景；授权撤销后失败应清晰，不跨 tab 偷读。

### P2-B：消费者到手价辅助（EXP-007）

- **真实任务**：用户查看商品，主动提供或确认售价、优惠、运费、税费、币种与限制条件，工具计算价格组成并说明缺失项。
- **数据规则**：价格历史、券可用性、汇率、物流等若无合法实时数据源必须标为未提供，不猜测、不伪装实时数据；不静默改联盟链接、Cookie 或优惠码。
- **输出**：计算依据、币种/口径、条件列表、可信度与可修正输入；真实付费和长期留存单独验证。

两条案例均优先最小侵入式的 A/C 产品形态；不要因为 P2 的 UI 能演示就自动决定开独立 CWS 产品。

## 四、P3 通用 Extension Factory 的实施顺序（仅在触发条件成立后）

~~~text
经证明适合独立安装的单用途产品需求
    → Product Registry（只发现已审查产品 ID；禁止硬编码某一产品）
    → ProductConfig（purpose/owner/version/UI/模块/权限/数据策略）
    → Feature Catalog + Resolver（静态依赖图、权限白名单、拒绝未知项）
    → Build Planner（按需静态打包，不带入全部 OpenDesk）
    → WXT Manifest / Chrome MV3 独立入口
    → 独立 build/pack/verify（SHA、许可、大小、文件清单、版本隔离）
    → Chrome 原生安装/撤权/升级/回滚与权限边界
    → 人工发布审核；仅有真实审批证据才可宣称 CWS_APPROVED
~~~

只有确认通用 CLI 与 **至少两种配置不同的非商业 Fixture**、严谨的错误路径测试后，才能引入 `npm run build:product -- --product <product-id>` / `npm run pack:product -- --product <product-id>`。两种 Fixture 只是工程检查样品，禁止命名包装为可售产品。复用现有 `wxt.config.mjs`、`scripts/build.mjs`、`scripts/pack.mjs` 的技术原理；若要剥离模块必须评审依赖与预算，不能复制特权内核或平移 `<all_urls>` 权限。

安全负面测试必须覆盖：未知 productId、循环与缺失依赖、权限冗余/膨胀、未声明功能、跨产品资源进入构建、存储命名空间误用、CSP/远程特权代码、包/哈希漂移、升级撤权和失败恢复。

## 五、实施限制与非目标

- **不恢复 Page QA**：历史提交、原始记录和废弃原因保留；不得因需要“第一款样品”而复活。
- **不强制做全行业插件**：电商工具宇宙是发现问题的研究分类，不是批量上架任务。
- **不造第二框架**：不得复制 Browser SDK、Host/Authority、Page Registry、Task Runner、Marketplace 或建第二套 R8/OPP/EXP 编号。
- **不虚报权限与证据**：`SOURCE_IMPLEMENTED`、`COMPONENT_TESTED`、`BUILD_VERIFIED`、`CHROME_NATIVE_VERIFIED`、`CWS_APPROVED`、`PAID_VALIDATED` 彼此独立。
- **不脱离真实 UI**：有 UI 修改时按 [跨页面布局规范](../../architecture/ui-layout-conventions-r27.zh-CN.md) 和现有设计 token、真实用户入口实施；不凭自评宣称 95+。
- **不擅自采集/登录/收款**：真实平台账号、敏感订单、自动下单/发消息、第三方 API 凭证需要单独授权与审计。
- **多 Agent 并行**：仅 `main` 允许写；不能创建分支/Worktree/PR 或覆盖其他任务；先查 AGENTS.md、当前 HEAD、当前编辑路径、`docs/framework/testing-guide.md` 与对应 owner/测试资源。

## 六、长期唯一入口与维护方法

- **本文件**：R3 任务树、依赖与优先级的唯一导航（不是新的成熟能力账本）。
- [可复制完整 R3 GOAL](../../framework/prompts/goal-product-ecosystem-r3.zh-CN.md)：下轮“做什么/怎么验收”。
- [R3 工程工作流](../../framework/workstreams/product-ecosystem-r3.md)：真实变更、候选 SHA、测试复用与阻断记录。
- [Extension Factory 设计](extension-factory-architecture.zh-CN.md)：技术拆分与权限/构建边界。
- [电商机会](ecommerce-tool-universe.zh-CN.md)与[商业实验](commercial-experiments.json)：市场方向、购买者和真实证据，仍以 OPP/EXP 正式台账为准。
- [原 R8 能力](../browser-automation-feature-catalog-r8.zh-CN.md)与[工程计划](../browser-automation-r8-implementation-plan.zh-CN.md)：既有稳定编号不可复制、覆盖或直接改“已完成”。

**下轮默认起步**：先 P0 受影响回归核对与 P1 已实现能力地图，再优先打通 P2 至少一个真实工具入口；只有证明独立发行必要性，才把 P3 从 `CONDITIONAL` 改成可执行工程任务。