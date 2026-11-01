# OpenDesk Task Shop · 技术架构与可信执行合同（V0.1 方案）

> PROPOSED_REMOTE_ARCHITECTURE / LOCAL_DEMO_SOURCE_IMPLEMENTED / NO_DEPLOYED_MARKET_SERVICE / CHROME_NOT_TESTED。2026-11-02。远程 Market API、Node Agent、Scheduler 仍属拟建，不是现有公开 SDK。
>
> 当前可复用事实：[Web Flow README](../../webflow/README.md)、[Web Flow 离线模块](../../webflow/docs/offline-modules.zh-CN.md)、[已安装 Controller Task 的 Native 调用](../../../docs/api/native-installed-tasks.zh-CN.md)、[受限本地任务桥](../../../docs/api/local-task-bridge.zh-CN.md)。

## 1. 四个责任边界

`任务发布者/市场门户` → `Task Shop 市场服务（拟建）` → `本地 Task Shop 适配器（拟建）` → `OpenDesk 原 Controller / RunHost / Authority / Native（现有）`。

可选接入 Web Flow 以编排多步骤任务。Task Shop 不新建第二套执行引擎，不绕过安装/站点许可，不把 Web Flow 的离线单 owner 队列冒充成生产级分布式调度器。

| 层 | 管什么 | 不做什么 |
| --- | --- | --- |
| 市场服务（拟建） | 任务发布、候选、市场租约、运营治理、业务验收/结算 | 任意 shell/JS 远程执行或拿取用户 Cookie |
| Task Shop 客户端（拟建） | 任务市场、手动/自动接单规则、节点状态、用户许可展示 | 在动态沙箱脚本中直接调用特权 Host |
| Web Flow（可选） | 工作流步骤、依赖与交接 | 任务商业资金账本、跨节点事务 |
| 现有 Browser / Native | 已安装脚本身份、网页/设备权限、原 run/result 与撤权 | 商家定价、佣金、市场匹配 |

商业账本与原执行账本要**独立存储、用引用对账**；不重复建立 Browser Framework 的权限、安装器、Task Registry、Runner 和持久原执行库。

## 2. 双重接单方式

### Pull（V0.1 优先）

1. 用户打开任务市场或主动刷新，节点只上报最小必要的能力声明（任务类型、许可脚本 pin、可用状态），不上传登录态或好友列表。
2. 用户手动点击领取；或在**先前单独同意**的自动接单政策内由节点受限领取。
3. 服务端原子创建领取租约；本地再次检查脚本安装/站点/参数/授权，才允许进入执行器。
4. 原执行器返回 runId/resultId；本地对账、上传受限证据，等待独立业务验收。

### Push（后续阶段）

市场仅通知“有新任务”，节点通过已认证的**出站**连接再拉取任务并做同一套本地校验。Push 不是向扩展推送任意代码或开启本机入站 HTTP 端口。断网、浏览器关闭、休眠需显式表现离线；Chrome MV3 Service Worker 不保证常驻。若未来需要长期后台服务，需另行审查与用户同意的本地原生节点代理，不能假设安装扩展后自动获得系统常驻和任意命令能力。

## 3. 市场订单与已安装脚本身份不可混用

| 字段（拟建） | 所在层 | 定义 |
| --- | --- | --- |
| `marketJobId` | 商业市场 | 一次需求方发布的订单，不是可执行脚本 ID |
| `taskTypeId` | 商业目录 | 任务能力分类，不授予任何权限 |
| `claimId` / `leaseId` | 领取服务 | 唯一领取及租约 ID |
| `nodeId` / `accountScopeId` | 本地映射 | 节点/权限范围的最小映射，不包含 Cookie |
| `taskId + version + sourceHash` | 原框架 | 精确的已安装 Controller Task 身份 |
| `manifestHash` / `generation` | 原框架 | 安装与权限代次，必须来自原权威核验 |
| `runId` / `resultId` | 原框架 | 实际执行与持久化结果，不能当商业成功 |
| `acceptanceId` / `settlementId` | 市场 | 需求方验收与模拟/真实结算身份 |

显示名称只是 UI 标签，不能作为主键或触发权限。服务端声称脚本版本、权限或任务完成均不能替代客户端及原 Authority 的核验。

现有 `opendesk.task.intent.v1`、Web Flow 后续考虑的 `webflow.task.intent.v1` 等协议和源码，由对应 owner 管理；Task Shop 需要市场级数据合同时**另行命名、版本化且不冒充任何现有执行协议**。

## 4. 状态机与异常

建议业务状态：

`DRAFT → PUBLISHED → AVAILABLE → CLAIM_PENDING → LEASED → DISPATCH_PREPARED → RUNNING → RESULT_RECORDED → REVIEW_PENDING → ACCEPTED → SETTLEMENT_PENDING → SETTLED`。

独立分支：`DECLINED`、`EXPIRED`、`CANCELLED`、`REJECTED`、`DISPUTED`、`UNKNOWN`、`NEEDS_ATTENTION`。其中 `SETTLED` 在 V0.1 只作为**模拟状态**，必须标注 DEMO，不代表真实转账。

**并发防重**：市场使用数据库原子租约、幂等请求、到期和 fencing token，避免陈旧节点对已被另一节点接管的任务提交；租约超时不证明外部副作用未发生。Web Flow 的离线队列没有跨节点 CAS，不得直接借用来保证市场独占。

**执行防重**：开始前记录 dispatch intent，关联固定的本地 executionRequestId 与原 runId。断连、无返回或撤销产生 UNKNOWN 时**只读对账**；不自动重放可能已经发生的购买、填写提交、发送信息或站点更改。完成只是执行器状态；结果、业务验收、账款结算各自有独立权威记录。

**取消语义**：取消请求不能撤销已发生的外部操作；已完成的站点动作不因市场显示 CANCELLED 而自动回滚。

## 5. 自动接单的四层授权

1. **市场计划许可**：用户本人明确选任务类型、允许的任务来源、最低净额/预算、脚本和站点白名单、每天上限、并发、最长时限及到期时间；
2. **脚本安装许可**：精确匹配已安装、已启用的 `taskId/version/sourceHash` 和原 manifest/代次；
3. **网站/设备权限**：权限随真实目标 Origin、浏览器 Profile、Native 配对、Chrome 可用状态重新检查；
4. **高风险副作用审阅**：对外发送、资金/购买、账号设置、隐私数据外传等需独立的业务与网站合规许可，不能通过自动接单绕过。

平台、AI、任务描述、页面内容都属于不可信数据。用户可暂停接单、停运行或撤销；撤销后停止新接单/新派发，对在途作业保留真实结果和 UNKNOWN，不编造成功或撤回。

## 6. 订单数据合同（概念，不是可执行 JSON）

基础字段：`marketJobId`、`revision`、`publisherId`、`taskTypeId`、`description`、`requiredScriptPin`、`allowedOrigins`、`allowedDataCategories`、`inputReference`、`expectedOutputs`、`acceptanceCriteria`、`deadline`、`riskTier`、`grossReward`、`currency`、`estimatedFees`、`netRewardDisclosure`、`disputePolicy`、`maxAttempts`、`idempotencyKey`。

每个字段还需明确类型、字符/字节上限、操作风险、最小保留期、敏感数据处理、谁有写权限。输入数据优先用受控引用而不是公开显示原文；在订单详情中不出现任何执行者凭据、好友名单或隐私信息。

## 7. 未来市场接口（仅设计）

| 市场动作 | 预期返回 | 核心保护 |
| --- | --- | --- |
| Publish / Revise Job | 业务订单及 revision | 发布者资质、任务审核、幂等 |
| List Eligible Jobs | 分页候选和适配提示 | 隐私过滤、反爬滥用与限流 |
| Claim Job | 原子租约及到期时间 | 有效节点、单租约、政策和幂等 |
| Report Capability | 有限范围能力与可用性 | 真实性、定期过期与撤销 |
| Attach Run Evidence | 关联原 run/result 的有限证明 | 归属、授权、摘要与脱敏 |
| Accept / Reject / Dispute | 验收及原因 | 双方可审计、申诉期限 |
| Simulate Settlement（V0.1） | 演示结算状态 | 不接真金白银或提现 |

这些是推荐的业务接口语义，并非现有 `OpenDeskTool.request` 或 Native `run.start` 的声明。实现前必须对照现有 SDK 文档确认是否支持、在哪个执行世界支持；如果不支持，记 `SDK_GAP_NOT_PROVEN`，先由框架 owner 评审最小通用缺口。

## 8. 威胁模型与禁止类别

- **任务/网页提示注入**：把任何不可信网页/聊天文本都当数据；不从描述直接下载执行任意远程 JS、Shell、扩展更新或授权命令。
- **账号外泄**：市场不收集 Cookie/密码/完整账号列表/好友群成员；节点能力只上传最小必要信息。
- **未经同意营销/欺诈**：拒绝陌生人群发、批量私信、虚假点击与评论、伪造业绩、绕过网站验证码/访问限制；允许的客户通知必须有合法接收者许可和渠道规则。
- **节点作弊**：租约签名/鉴权、事件顺序、冲突拒绝、异常频率及证据核查；不能因为存在结果 ID 就直接付款。
- **权限降级/网站切换**：重新评估实际页面、Profile、脚本版本与撤权代次；对不可核验操作进入 NEEDS_ATTENTION。
- **支付与监管**：真实结算前必须落实合规支付渠道、反欺诈、税务、数据保护和纠纷处理。

## 9. 已知事实与下一技术动作

既有源码/文档记录 Native `run.start/run.get` 对已安装 Task 的部分真实验证，但 `task.list` 有独立历史缺口；现有 Web Flow 的 handoff/单 owner queue 已完成离线组件测试，不表示正式安装、后台市场调度或多节点可用。

D1 已在 `../src/core.js` 与 `../src/main.js` 实施本机单任务演示：SDK ETag 领取租约、固定 pin 委托、原持久结果引用及独立的本地模拟验收状态。无部署的远程市场、跨节点 CAS、真实用户认证或资金系统；Chrome/Native 仍未验收。下一步按照[唯一执行计划](execution-plan.zh-CN.md)运行原仓库 Node/打包门禁。