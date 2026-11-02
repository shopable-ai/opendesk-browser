# OpenDesk Task Shop

> **状态（2026-11-02）：SOURCE_IMPLEMENTED / COMPONENT_TESTED / PACKAGE_VERIFIED / CHROME_BLOCKED / MARKET_LOCAL_DEMO / PAYMENTS_NOT_LIVE。**
>
> 固定检索词：`OD-TASK-SHOP`。已有 D1 源码和原打包器验证、晋升的正式包；Node 核心 14/14、UI 适配 8/8 通过。Chrome 安装入口被浏览器控制工具的扩展 URL 安全策略阻断，尚无真实安装/运行证据。没有远程市场 API 或真实收益。

## 一屏读懂

- **谁需要**：有可重复、授权的浏览器业务任务的商家，以及愿意使用自己的设备和已安装脚本承接工作的用户。
- **用户得到什么**：安装 OpenDesk 后，不依赖 ChatGPT，就可查看任务、手动领取，或设定明确范围的自动领取规则；使用经批准的本地脚本执行，并查看证明与结算状态。
- **商业方得到什么**：按定义清楚、可验收的工作结果付费，而不是按“脚本 completed”付费。
- **已有源码与组件证据**：最小任务 UI、测试工单、领取租约、固定脚本委托、最多三条原结果投影、模拟验收和虚拟积分。**未实现/未验证**：远程市场服务、跨节点调度、真实发布者签收、资金系统及 Chrome 真实执行。
- **最短下一步**：由可操作真实扩展 UI 的验收者从原可信安装器安装下列正式包，读取固定 Task 的实际安装/授权身份及已有 Claim/Run，再完成一次手动接单；按[执行计划](docs/execution-plan.zh-CN.md)推进。

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

D1 使用 Sidebar Tool v2 沙箱；源代码位于 `src/`，唯一配置为 `tool.config.json`，定向测试位于 `tests/`。通过公开 SDK 实现业务，不修改 Browser/Native/Controller 特权模块。正式包已晋升为唯一 `task-shop.opendesk-tool.json`，版本 `0.1.1`；晋升不等于实际安装。`projects/task-shop/` 是业务 owner，不会因此获得 Native、Chrome 或账号特权。

首个演示只做**用户自有/明确授权的商品数据整理**，禁止借试点进行未经请求的社交营销、批量群发或不透明账号出租。

**D0 为方案基线；D1 已完成组件与正式包验证，真实 Chrome/Native 闭环仍未通过，远程市场和商业运营未实现。**

## D1 开发与验收入口（OD-TASK-SHOP）

- 单条固定的本机测试任务是“公开商品关键词搜索”；不是商家后台商品导出，也不是平台远程订单。模拟奖励为虚拟积分，不提供真实付款。
- 在同一工具安装/Profile 内，以公开 SDK 的 storage.get(withEtag)/storage.set(ifMatch) 防重复领取；租约 15 分钟，到期不自动重领。跨节点市场 CAS、发布者认证均未实现。
- 手动点击领取 → 核验已安装 baidu.search.top3@1.1.1 的固定版本/哈希和当前百度 Origin → 保存原 clientRequestId → 再点击确认执行；只在真实用户点击时调用 tasks.start，原 Host 负责最终权限核验。
- 仅通过 tasks.read({clientRequestId}) 在原 iframe 读取 Controller 持久 result，核对 runId/resultId、结果自身 revision/sourceHash 与业务查询，保存最多三条标题/摘要/URL 纯文本投影；单独进行本机模拟规则验收与积分结算。completed 不等于验收通过。
- 关闭/重开后不具备跨旧 iframe 查询能力，UNKNOWN 时不自动重跑，只提示去可信原执行记录人工对账。未持久保存的 Task Shop 记录不能被模拟结果替代。

定向验证（2026-11-02，Node v24.15.0，核心 14/14、UI 8/8，退出码均为 0）：

    node --test projects/task-shop/tests/task-shop-core.test.mjs
    node --test projects/task-shop/tests/task-shop-ui.test.mjs
    node scripts/build-sidebar-tool.mjs projects/task-shop --out artifacts/sidebar-tools/task-shop/candidate.opendesk-tool.json

原 builder 的候选构建、内容/能力/pin 校验、--promote-from 和 --check-project 已成功；没有手工修改生成包。能力仍仅为 storage.local、currentPage.read、tasks.run，固定委托身份不变。

历史独立 V8 49 项检查保留为历史证据，不替代本轮 Node、包或 Chrome 结果。缺陷修复、输入 SHA、原始日志、安全负例与当前阻塞只维护在[唯一执行计划第 9 节](docs/execution-plan.zh-CN.md#9-d11-本地增量验收2026-11-02)。

## 正式安装交付（D1.1）

- 文件：[task-shop.opendesk-tool.json](task-shop.opendesk-tool.json)，`task-shop@0.1.1`，32,681 bytes。
- SHA-256：`d9fd8a342606128a0b708f84d5e8e340e09a60d1ed236d11c931c12cf8204c67`。
- 通过 OpenDesk「扩展 → 更多操作 → 导入本地工具包」审阅并确认安装；已装同 ID 时走原升级机制，不先卸载或清数据。App 安装不替代固定 Task 的独立安装与百度授权。
- 当前停止在进入可信安装器之前。实际 App/Task 身份、百度许可、Native 配对、加载路径/serve 连接均未知；未领取、未运行，没有真实 clientRequestId/runId/resultId。
- 下一位验收者先读取已有状态；如有 UNKNOWN/已运行记录只对账，不为演示重复执行。此包可供审阅安装，不能据此宣布 D1 真实闭环完成。
