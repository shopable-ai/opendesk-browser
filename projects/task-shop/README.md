# OpenDesk Task Shop

> **状态（2026-11-02）：D1_SOURCE_IMPLEMENTED / CORE_V8_SMOKE_PASS / NODE_AND_PACKAGE_NOT_TESTED / CHROME_NOT_TESTED / MARKET_LOCAL_DEMO / PAYMENTS_NOT_LIVE。**
>
> 固定检索词：`OD-TASK-SHOP`。本项目为**任务发布、领取、授权托管、验收与结算**的商业产品设计，不是已上线的任务交易平台。本项目已有 D1 业务源码，但还没有经原打包器验证的正式安装包、远程市场 API、Chrome 实测或真实收益。

## 一屏读懂

- **谁需要**：有可重复、授权的浏览器业务任务的商家，以及愿意使用自己的设备和已安装脚本承接工作的用户。
- **用户得到什么**：安装 OpenDesk 后，不依赖 ChatGPT，就可查看任务、手动领取，或设定明确范围的自动领取规则；使用经批准的本地脚本执行，并查看证明与结算状态。
- **商业方得到什么**：按定义清楚、可验收的工作结果付费，而不是按“脚本 completed”付费。
- **本轮已写源码**：最小任务 UI、测试工单、领取租约、已安装脚本委托、原结果投影、模拟验收和模拟积分。**未实现/未验证**：正式安装包、远程市场服务、跨节点调度、真实发布者签收、资金系统及 Chrome 真实执行。
- **最短下一步**：在本地仓库运行 Task Shop 定向 Node 测试与原打包器，成功后晋升正式 JSON，再用真实 Chrome/已安装授权脚本独立验收手动接单；按[执行计划](docs/execution-plan.zh-CN.md)推进。

## 长期定位

**OpenDesk Task Shop = 自动化任务市场（Marketplace）**。AI 是可选的生产力助手，**不是接单、执行或获得收益的必需入口**。

三类入口：用户自用任务；任务市场手动接单；用户设定能力/账号/网站/金额及风险预算后的受限自动接单。任务来源可为人工发布、企业事件或 AI 建议；任何来源都不自行取得执行授权。

定位边界：
- `projects/task-shop/` 管理商业任务发布、投标/接单、自动接单规则、节点能力匹配、服务验收及结算策略。
- [Web Flow](../webflow/README.md) 管理工作流步骤、依赖、交接和执行恢复。Task Shop **不假设** Web Flow 已正式安装，也不把其纯离线队列当成生产调度器。
- OpenDesk Browser Framework / Native / Controller 保持唯一执行/安装/权限/RunHost/持久结果权威；本项目不得再建一套旁路执行引擎。
- 脚本市场与任务市场是两种商品：脚本是可复用执行能力，任务是一次需要验收的业务交付；平台收费和开发者分成可并存，但身份、交付与账本分别管理。

## 唯一文档导航

| 想了解什么 | 权威文件 |
| --- | --- |
| 需求、范围、角色、用户操作、准入规则、完成标准 | [产品合同](docs/product-contract.zh-CN.md) |
| 收费路径、双边供需、结算经济模型、风险与试点 | [商业模式](docs/business-model.zh-CN.md) |
| 前后端边界、任务状态、Pull/Push、幂等、权限、节点 | [技术架构](docs/architecture.zh-CN.md) |
| 版本阶段、任务分解、责任、未测状态、下一操作 | [执行计划](docs/execution-plan.zh-CN.md) |
| 名称决策、SEO 页面、竞品与验证门槛 | [命名与 SEO](docs/naming-and-seo.zh-CN.md) |
| 项目独有开发约束 | [项目 AGENTS](AGENTS.md) |

外部既有事实来源：[Web Flow 产品合同](../webflow/docs/product-contract.zh-CN.md)、[Web Flow 执行记录](../webflow/docs/execution-plan.zh-CN.md)、[已安装 Task 的 Native 调用合同](../../docs/api/native-installed-tasks.zh-CN.md)、[本地任务桥](../../docs/api/local-task-bridge.zh-CN.md)、[项目目录合同](../../docs/architecture/extension-project-layout.zh-CN.md)。

## 代码归属与阶段

D1 已确定 Sidebar Tool v2 沙箱应用形态；源代码位于本项目的 `src/`，唯一工具配置为 `tool.config.json`，定向测试位于 `tests/`。通过公开 SDK 实现业务，不修改 Browser/Native/Controller 特权模块。正式工具包尚未晋升。`projects/task-shop/` 是产品业务 owner，不会因为目录名获得任何 Native、Chrome 或账号特权。

首个演示只做**用户自有/明确授权的商品数据整理**，禁止借试点进行未经请求的社交营销、批量群发或不透明账号出租。

**D0 为方案基线；D1 已提交源码，但尚未完成正式包、真实 Chrome/Native 测试、远程市场部署或商业运营。**

## D1 开发与验收入口（OD-TASK-SHOP）

- 单条固定的本机测试任务是“公开商品关键词搜索”；不是商家后台商品导出，也不是平台远程订单。模拟奖励为虚拟积分，不提供真实付款。
- 在同一工具安装/Profile 内，以公开 SDK 的 storage.get(withEtag)/storage.set(ifMatch) 防重复领取；租约 15 分钟，到期不自动重领。跨节点市场 CAS、发布者认证均未实现。
- 手动点击领取 → 核验已安装 baidu.search.top3@1.1.1 的固定版本/哈希和当前百度 Origin → 保存原 clientRequestId → 再点击确认执行；只在真实用户点击时调用 tasks.start，原 Host 负责最终权限核验。
- 仅通过 tasks.read({clientRequestId}) 在原 iframe 读取 Controller 持久 result，保存 runId/resultId、匹配标志及结果数量；单独进行本机模拟规则验收与模拟积分结算。completed 不等于验收通过。
- 关闭/重开后不具备跨旧 iframe 查询能力，UNKNOWN 时不自动重跑，只提示去可信原执行记录人工对账。未持久保存的 Task Shop 记录不能被模拟结果替代。

定向测试（尚未在本轮通过真实仓库 Node 执行）：

    node --test projects/task-shop/tests/task-shop-core.test.mjs
    node scripts/build-sidebar-tool.mjs projects/task-shop --out artifacts/sidebar-tools/task-shop/candidate.opendesk-tool.json

两项成功后依原仓库打包 Skill 使用 --promote-from 与 --check-project 晋升唯一 task-shop.opendesk-tool.json；不得手写伪造正式包。

本轮从 GitHub 已提交源码在独立 V8 JS 执行环境完成 49 项核心检查（PASS），包括语法、版本/Origin/租约/防重/UNKNOWN/业务验收；Node runner、原构建器、真实 Chrome 与 Native 仍为 NOT_TESTED。
