# OpenDesk Task Shop · 唯一执行计划（2026-11-02）

> **状态：D0 文档初始化；`IMPLEMENTATION_NOT_STARTED / CHROME_NOT_TESTED / MARKET_NOT_DEPLOYED / PAYMENTS_NOT_LIVE`。**
>
> 固定检索词 `OD-TASK-SHOP`。长期需求：[产品合同](product-contract.zh-CN.md)；职责与状态：[架构](architecture.zh-CN.md)；经济假设：[商业模式](business-model.zh-CN.md)。本文件唯一维护真实进度、责任和下一条操作。

## 1. 本轮确定的 owner 与写入边界

| 事项 | 归属和事实 |
| --- | --- |
| 仓库/主分支 | `shopable-ai/opendesk-browser` / `main` |
| Task Shop 产品 owner | `projects/task-shop/`，本轮仅文档；无应用源码、配置或正式包 |
| Web Flow owner | `projects/webflow/`，本轮只读；保留既有 BR/AWB 和历史证据 |
| 执行内核 owner | Browser Framework / Native / Controller / Authority / RunHost，沿用原权限与安装合同 |
| 本轮新增文件 | 本项目 README、AGENTS、五份 `docs/` 文档及新的独立 Task Shop 工作流记录 |
| 共享环境 | 不使用用户 Mac、Chrome/Profile、端口、Native、dist、已有任务数据库、凭据或 watcher |
| 当前证据 | GitHub 文档存在可核查时只记 `DOCS_ONLY`；没有真实产品执行或市场服务 |

任务市场后端部署位置、身份系统和正式可安装 Sidebar 包均尚未决定；**不要为建立目录而预建空项目源码或冒充真实配置**。

## 2. 五个阶段及完成标准

| 阶段 | 最小交付 | 退出标准 | 状态 |
| --- | --- | --- | --- |
| D0：文档基线 | 独立项目、产品/商业/架构/SEO/执行文件 | 文件真实可读、相互引用与职责清晰 | 待 GitHub 提交后核对 |
| D1：V0.1 单任务闭环 | 模拟市场发布、手动领取、已安装本地脚本、结果对账、模拟验收 | 一条用户可观察的真实授权操作及原 run/result 验收；负例不越权/不重跑 | NOT_STARTED |
| D2：V0.2 受限托管 | 自动接单规则、限额、可撤销许可、有限 Pull、断网恢复 | 无 AI 对话也可按明确规则接单；超范围必拒绝 | NOT_STARTED |
| D3：V0.3 B2B 试点 | 合法企业工单、发布者/节点审核、收费意愿实验 | 真实可验证的需求、质量与成本；无资金业务时仍模拟结算 | NOT_STARTED |
| D4：V1.0 多节点商业化候选 | 稳定节点调度、Push、支付/争议/风控/合规 | 多节点原生及资金证据、适用市场审查完成 | NOT_STARTED |

## 3. 核心技术任务（TS-P01–10）

| ID | 工作与目标行为 | 依赖 | 状态 |
| --- | --- | --- | --- |
| TS-P01 | 只读核实真实已安装 Task 与 Native/Controller 可调用入口和脚本 pin | 现有公开 SDK、Native 文档 | NOT_STARTED |
| TS-P02 | 定义市场任务 schema、领取 ID、权限/数据分类和验收合同 | 产品合同、TS-P01 的真实接口 | NOT_STARTED |
| TS-P03 | 做一个本地测试任务服务/fixture，实现领取、幂等和租约（模拟金额） | TS-P02 | NOT_STARTED |
| TS-P04 | 把订单映射到已安装的**固定脚本**，经原 Authority/RunHost 执行 | TS-P01–03，真实授权 | NOT_STARTED |
| TS-P05 | 将原 runId/resultId 与业务订单 ID 对账，显示独立验收状态 | TS-P04 | NOT_STARTED |
| TS-P06 | 校验重复领取、取消、断线、脚本升级、站点变更、UNKNOWN 无重放 | TS-P03–05 | NOT_STARTED |
| TS-P07 | 普通用户任务列表、详情、领取、运行及验收 UI；按执行世界选择正式形态 | TS-P02–06，原 UI/安装合同 | NOT_STARTED |
| TS-P08 | 自动接单规则与有限 Pull（不得默认启用） | D1 完成、风险评审 | NOT_STARTED |
| TS-P09 | 商业试点：验证真实需求、支付意愿、每单成本和平台利润 | D1 可用、明确任务类目 | NOT_STARTED |
| TS-P10 | 真实支付、AML/KYC/税务、申诉、跨节点公平调度、Push | D3 实证与合规评审 | DEFERRED |

### 当前唯一下一条动作

**执行 TS-P01 的只读复用核查**：从 [Native installed tasks](../../../docs/api/native-installed-tasks.zh-CN.md)、[Web Flow README](../../webflow/README.md)、原安装的 Controller Task 和目标网站许可中核实“已安装脚本 → 单次执行 → 原持久结果”的真实可用接口。若无法取得本机 Chrome/已安装脚本，明确记录未测和最小适配缺口，再准备 TS-P02/P03，**绝不重做 Native/RunHost**。

## 4. D1 最低验收清单

- 用户不需要 ChatGPT，也能查看并手动领取一次示意任务。
- 市场只发任务**数据**，本地只执行当前确实已安装且授权的固定脚本。
- 同一个业务订单/执行请求不会因重复点击、刷新或网络超时盲目重复提交。
- 未安装、不同哈希/版本、错误站点、撤权、离线或参数不符必须可靠拒绝。
- 用户可以 Stop/撤销，UNKNOWN 则只读对账；已发生的外部副作用不伪称回滚。
- 原 `runId`/`resultId`/`sourceHash` 与市场订单关联；业务验收与 `completed`、模拟结算明确分开。
- 任务描述、网页、AI 输出无权安装脚本、增加 Origin/Native 权限或写入凭据。
- V0.1 验证只读商品整理/内部场景，不进行任何陌生人群发营销、真实付款或收集好友信息。

**证据分级**：`DOCS_ONLY`、`SOURCE_IMPLEMENTED`、`COMPONENT_TESTED`、`CHROME_NATIVE_VERIFIED`、`BUSINESS_ACCEPTED`、`PAYMENT_VERIFIED`。需要每层对应的原始证明；源码/模拟测试不能自动提升为真实浏览器或营收成功。

## 5. 风险、依赖与延期

- 市场服务的认证与存储：尚未设计、未部署。
- 现有 Web Flow 离线队列没有多节点 CAS；后续需要服务端原子租约，不在本阶段声称生产级调度。
- Native `task.list` 曾有缺口，不能从一个历史 `run.start` 的成功推断全部发现接口已稳定。
- MV3 后台不常驻；7×24 托管需要独立的原生代理设计与用户授权。
- 自动获取脚本/AI 自生成脚本、批量社交广告、账号出租、真钱钱包和提现、全球多节点市场均不在 D1。
- 项目命名采用 `OpenDesk Task Shop` / `projects/task-shop/`，外部商标、域名、搜索流量未通过独立验证；见[命名与 SEO](naming-and-seo.zh-CN.md)。

## 6. 持续更新制度

每次实施前只读核对最新 `main` 与项目所有权，在这里登记当前任务 owner、具体文件、依赖、复现问题、原始验证、已阻塞与下一动作。并行任务只改不重叠文件；根代码、Web Flow、Native 与共享资源的任何更改需要其 owner 按现有规则推进。

纯文档只检查内容/链接/提交事实；不触发全仓构建、真实浏览器、原生环境或假市场验收。

## 7. 初始化记录

| 日期 | 操作 | 实际证明 | 后续 |
| --- | --- | --- | --- |
| 2026-11-02 | D0 项目文档建立 | 提交后核查 GitHub 8 个新文件可读，仅 `DOCS_ONLY` | 从 TS-P01 开始，无已实现接单 UI、节点服务或支付 |
