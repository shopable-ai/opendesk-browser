# OpenDesk Task Shop

> **状态（2026-11-02）：DOCUMENTATION_ONLY / IMPLEMENTATION_NOT_STARTED / CHROME_NOT_TESTED / PAYMENTS_NOT_LIVE。**
>
> 固定检索词：`OD-TASK-SHOP`。本项目为**任务发布、领取、授权托管、验收与结算**的商业产品设计，不是已上线的任务交易平台。目录成立不代表有可安装包、市场 API、真实任务派发或真实收益。

## 一屏读懂

- **谁需要**：有可重复、授权的浏览器业务任务的商家，以及愿意使用自己的设备和已安装脚本承接工作的用户。
- **用户得到什么**：安装 OpenDesk 后，不依赖 ChatGPT，就可查看任务、手动领取，或设定明确范围的自动领取规则；使用经批准的本地脚本执行，并查看证明与结算状态。
- **商业方得到什么**：按定义清楚、可验收的工作结果付费，而不是按“脚本 completed”付费。
- **尚未实现**：Task Shop 的产品 UI、服务端市场、节点调度、市场收付款、真实跨节点验收与发行。现有 Web Flow/Native/Controller 仅提供可复用的部分技术基础。
- **最短下一步**：验证现有已安装任务在本机的读取与执行接口，给出一个不涉及真实支付的“测试任务 → 手动领取 → 本地脚本 → 结果对账”最小闭环方案；按[执行计划](docs/execution-plan.zh-CN.md)推进。

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

当前只有文档，不创建空的 `src/`、`tests/`、`tool.config.json`、`dist/` 或任务包。实际实现前依据 Extension Type & Ownership Gate 决定前端形态、公开 SDK 能力和服务端仓库边界。`projects/task-shop/` 是产品业务 owner，不会因为目录名获得任何 Native、Chrome 或账号特权。

首个演示只做**用户自有/明确授权的商品数据整理**，禁止借试点进行未经请求的社交营销、批量群发或不透明账号出租。

**本轮文档集为方案基线，不是代码实施、部署、支付上线或真实用户验证。**