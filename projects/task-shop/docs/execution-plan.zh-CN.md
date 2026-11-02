# OpenDesk Task Shop · 唯一执行计划（2026-11-02）

> **状态：D0 已完成；D1.1 `SOURCE_IMPLEMENTED / COMPONENT_TESTED / PACKAGE_VERIFIED / CHROME_BLOCKED / CHROME_NATIVE_NOT_TESTED / MARKET_LOCAL_DEMO / PAYMENTS_NOT_LIVE`。**
>
> 固定检索词 `OD-TASK-SHOP`。长期需求：[产品合同](product-contract.zh-CN.md)；职责与状态：[架构](architecture.zh-CN.md)；经济假设：[商业模式](business-model.zh-CN.md)。本文件唯一维护真实进度、责任和下一条操作。

## 1. 本轮确定的 owner 与写入边界

| 事项 | 归属和事实 |
| --- | --- |
| 仓库/主分支 | `shopable-ai/opendesk-browser` / `main` |
| Task Shop 产品 owner | `projects/task-shop/`：已有源码、配置、组件测试和原 builder 晋升的唯一正式包；真实安装未验收 |
| Web Flow owner | `projects/webflow/`，本轮只读；保留既有 BR/AWB 和历史证据 |
| 执行内核 owner | Browser Framework / Native / Controller / Authority / RunHost，沿用原权限与安装合同 |
| 本轮新增文件 | 本项目内 src/、tool.config.json、tests/、README 和唯一执行计划；不触碰 Web Flow/Native |
| 共享环境 | D1.1 仅本机 Node、项目独立 artifacts 和只读 Chrome 连接；扩展页面被策略阻断；不修改 Profile/Native/dist/watcher 或已有真实任务记录 |
| 当前证据 | 历史 V8 49/49 保留；D1.1 核心 14/14、UI 8/8 与同源正式包 PASS；Chrome/Native 未测，远程市场服务不存在 |

任务市场后端部署位置与身份系统尚未决定；Sidebar v2 正式包已确认。**不要为建立目录而预建空项目源码或冒充真实配置**。

## 2. 五个阶段及完成标准

| 阶段 | 最小交付 | 退出标准 | 状态 |
| --- | --- | --- | --- |
| D0：文档基线 | 独立项目、产品/商业/架构/SEO/执行文件 | 文件真实可读、相互引用与职责清晰 | **已完成：DOCS_ONLY**（commit db5908f42） |
| D1：V0.1 单任务闭环 | 模拟市场发布、手动领取、已安装本地脚本、结果对账、模拟验收 | 一条用户可观察的真实授权操作及原 run/result 验收；负例不越权/不重跑 | **COMPONENT_TESTED / PACKAGE_VERIFIED / CHROME_BLOCKED** |
| D2：V0.2 受限托管 | 自动接单规则、限额、可撤销许可、有限 Pull、断网恢复 | 无 AI 对话也可按明确规则接单；超范围必拒绝 | NOT_STARTED |
| D3：V0.3 B2B 试点 | 合法企业工单、发布者/节点审核、收费意愿实验 | 真实可验证的需求、质量与成本；无资金业务时仍模拟结算 | NOT_STARTED |
| D4：V1.0 多节点商业化候选 | 稳定节点调度、Push、支付/争议/风控/合规 | 多节点原生及资金证据、适用市场审查完成 | NOT_STARTED |

## 3. 核心技术任务（TS-P01–10）

| ID | 工作与目标行为 | 依赖 | 状态 |
| --- | --- | --- | --- |
| TS-P01 | 只读核实真实已安装 Task 与 Native/Controller 可调用入口和脚本 pin | 现有公开 SDK、Native 文档 | **SDK_CONTRACT_REVIEWED（原生未测）** |
| TS-P02 | 定义市场任务 schema、领取 ID、权限/数据分类和验收合同 | 产品合同、TS-P01 的真实接口 | **SOURCE_IMPLEMENTED** |
| TS-P03 | 做一个本地测试任务服务/fixture，实现领取、幂等和租约（模拟金额） | TS-P02 | **SOURCE_IMPLEMENTED（同安装 CAS）** |
| TS-P04 | 把订单映射到已安装的**固定脚本**，经原 Authority/RunHost 执行 | TS-P01–03，真实授权 | **ADAPTER_SOURCE_IMPLEMENTED（原生未测）** |
| TS-P05 | 将原 runId/resultId 与业务订单 ID 对账，显示独立验收状态 | TS-P04 | **LOCAL_DEMO_SOURCE_IMPLEMENTED** |
| TS-P06 | 校验重复领取、取消、断线、脚本升级、站点变更、UNKNOWN 无重放 | TS-P03–05 | **COMPONENT_TESTED（core 14 / UI 8，Chrome 未测）** |
| TS-P07 | 普通用户任务列表、详情、领取、运行及验收 UI；按执行世界选择正式形态 | TS-P02–06，原 UI/安装合同 | **PACKAGE_VERIFIED（实际安装未测）** |
| TS-P08 | 自动接单规则与有限 Pull（不得默认启用） | D1 完成、风险评审 | NOT_STARTED |
| TS-P09 | 商业试点：验证真实需求、支付意愿、每单成本和平台利润 | D1 可用、明确任务类目 | NOT_STARTED |
| TS-P10 | 真实支付、AML/KYC/税务、申诉、跨节点公平调度、Push | D3 实证与合规评审 | DEFERRED |

### 当前唯一下一条动作

**下一步唯一操作：由可直接操作扩展 UI 的验收者在原可信安装器审阅并安装 `task-shop@0.1.1`，读取固定 Task 的实际安装/启用/pin、百度授权及已有 Claim/Run 状态。** 本轮 Browser Use 明确拒绝扩展 URL，不能绕过；Node 和包门禁已通过，输入未变时不重复。条件满足后只执行一次授权链，不重放 UNKNOWN，不接管公共内核开发文件。

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
| 2026-11-02 | D0 项目文档建立 | 已核验 GitHub 8 个新文件可读；提交 `db5908f42c8363a732187c91aeec6f2b0224023f`；仅 `DOCS_ONLY` | 从 TS-P01 开始，无已实现接单 UI、节点服务或支付 |


## 8. D1 基础代码增量（2026-11-02）

| 事项 | 最新证据 | 限制 |
| --- | --- | --- |
| SDK 复用 | 已读 Sidebar `tasks.read/start/stop` 和 storage ETag CAS 实际合同/源码 | 本轮没在 Chrome/Native 实测 |
| 市场订单和领取 | `src/core.js` 定义固定单任务、15 分钟租约、同安装 CAS 防重、leaseId fencing | 无跨设备原子调度、认证市场 |
| 固定执行与证据 | `src/main.js` 仅用户点击 tasks.start，保存原 runId/resultId 与脱敏投影 | 原 iframe 销毁后无法直接跨会话查回 |
| 商业验收/结算 | 原持久结果及业务规则与模拟验收独立；结算为 DEMO_POINTS | 非需求方实际签收、非真实资金 |
| 核心检查 | V8 对当前 GitHub 源码 49 项断言 PASS；Node 测试/原 builder 检查文件已编写 | Node runner、原 build、Chrome、Native **NOT_TESTED** |
| 可安装发布 | 已有 v2 `tool.config.json`，无多余 tasks.open 权限 | **PACKAGE_NOT_PROMOTED** |

代码提交：`3a75dec7`（核心）、`9094579f`（UI/SDK 适配/测试）、`f3da5bc0`（绑定返回请求 ID 与原 builder 门禁）。文档与最小权限修改以本次最终 GitHub SHA 为准。

Owner 与交接：Task Shop D1 Owner 完成源码阶段；本地原仓库 Node/build/安装包验证尚缺，**目前不满足原生 Chrome 最终验收移交条件**。后续仅在该门禁通过后交给本地 Codex Chrome/Native Owner 运行授权测试；并行 Web Flow 与 Native Owner 不变。


## 9. D1.1 本地增量验收（2026-11-02）

- Owner：本地 Codex Task Shop D1.1；唯一业务 owner 仍是 `projects/task-shop/`，Sidebar Tool v2 / opaque iframe，公开 `OpenDeskTool.request`；不修改公共 Host/Controller/Authority/Native。
- 本轮写入范围：`src/`、`tests/`（仅复现缺陷）、`tool.config.json`（仅必要版本调整）、README、本执行计划、builder 晋升的唯一正式 JSON；不写其他 Agent 文件。
- 基线 HEAD：`c5627c80ac57c2ef1b7b0b4be9ff65719550d894` / main；本项目起始无未提交差异、无正式包。历史 49 项 V8 为独立证据，未找到当前源码 Node/包/Chrome 可复用 PASS。
- 复用入口：本项目现有状态机/UI/SDK adapter、原 builder 和原可信安装器。下一操作为指定 Node 定向测试；通过后候选→验证→晋升→正式安装→固定 Task/权限核对→单次领取/执行/结果/独立模拟验收与结算。
- 资源：独立 `artifacts/sidebar-tools/task-shop/d11-20261102/` 保存原始日志与输入身份；候选用既定路径。Chrome 仅 Task Shop 验收页面；不接管其他任务/记录，不修改用户 Profile、Native 配置、已有 dist 或 watcher。当前无本地 dev watcher 进程；实际扩展加载路径/serve 连接待 UI 核对。
- SSH fetch 因 publickey 失败，已以公开 HTTPS fetch 获取 main；继续核对远端与本地差异，不覆盖并行工作。

### 9.1 实际失败、最小修复与回归

初测指定 core 命令：Node `v24.15.0`，退出 1，7 PASS / 2 FAIL。运行中 fixture 缺少公开快照必须携带的 clientRequestId；包测试匹配了未使用的 CSS 类。已修正 fixture 与逐字节源码断言，保留请求/身份/权限保护。

隔离失败用例复现并修复：

1. PREPARE 缺少安装身份/代次仍成功：要求公开 metadata 的完整 pin，不自造安装凭据。
2. 结果未核对自身源码修订与业务查询，且 UI 只展示数量：核对固定 Task manifest 的 scriptId/revision=1/sourceHash、原 runId/resultId、kind/version/query/count/标题/摘要/安全 URL；投影最多 3 条纯文本，并显示结果修订/源码摘要。
3. start 等待 ACK 时 busy 禁用 Stop：单独保留在途提交状态，允许独立 Stop；不把回包当作副作用回滚。
4. 结果与 MARK_UNKNOWN 两次持久化均失败后重新出现执行按钮：提交前同步设单次派发栅栏，迟到/失败不重置。
5. 旧投影只有 persisted/businessMatch 布尔值仍可验收：缺少结果自身固定 sourceHash/revision 时拒绝本次模拟验收；不清除真实历史数据。
6. 只读复审提出 Stop 与 ACK 并发 CAS 可能丢失停止请求。已用暂停 storage.get 的确定性交错复现：Stop 先读、ACK 先写后，原逻辑发送了 0 次 tasks.stop。改为同 iframe 事务串行化，两个先后顺序均保持 1 次原请求停止；跨实例仍由原 ETag 服务裁决，不重试失败写入。失败记录为 `stop-race-red.log`。

失败和成功日志均保留在本机忽略目录，未提交 artifacts。UI 测试使用 Node 内组件 fixture 和 SDK 边界替身；不证明真实手势、Chrome 锁、Authority、Native 或 IDB 成功。

### 9.2 门禁与证据

| 门禁 | 结果 | 实际证据 / 下一步 |
| --- | --- | --- |
| Node 核心 | PASS / COMPONENT_TESTED | `node --test projects/task-shop/tests/task-shop-core.test.mjs`，14/14，退出 0；`node-core-final.log` |
| UI 适配与故障边界 | PASS / COMPONENT_TESTED | `node --test projects/task-shop/tests/task-shop-ui.test.mjs`，8/8，退出 0；`node-ui-final.log`；main.js 语法退出 0 |
| 候选包 | PASS / PACKAGE_VERIFIED | 原 builder --out 退出 0；v2 / task-shop / 0.1.1；HTML/CSS/JS/core 与配置逐字节一致，依赖 SHA 正确、可重现，无额外能力/后台/网络依赖 |
| 正式包晋升 | PASS / PACKAGE_VERIFIED | 原 --promote-from、--check-project 均退出 0；唯一 `task-shop.opendesk-tool.json`，32,681 bytes |
| Chrome 安装 | BLOCKED | Chrome 连接可列出页面，但内部页不可接管、扩展 URL 被 Browser Use 安全策略明确拒绝；未进入安装器 |
| 固定 Task 身份与权限 | BLOCKED | 配置 pin 不证明实际安装；实际 installationId/generation、启用和百度许可未读取 |
| 手动领取 | NOT_TESTED（Chrome） | Node 证明唯一 Claim/Lease、ETag 冲突；未触碰真实记录 |
| 真实执行 | NOT_TESTED | 未启动真实 Controller，无真实 clientRequestId/runId/resultId |
| 原持久结果 | NOT_TESTED（Chrome/Native） | Node 验证结果身份、修订/源码、释放及业务输出；无真实 Run/Result |
| 独立模拟验收 | NOT_TESTED（Chrome） | Node 证明 REVIEW_PENDING → 独立 ACCEPT；未产生真实演示验收记录 |
| 模拟结算 | NOT_TESTED（Chrome） | Node 证明 ACCEPT 之后才能登记 18 DEMO_POINTS；没有真实积分/付款记录 |
| 安全负例 | PASS（Node fixture）；NOT_TESTED（Chrome/Native） | 见下表，禁止提升等级 |

正式包 SHA-256（亦为 Host canonical hash）：`d9fd8a342606128a0b708f84d5e8e340e09a60d1ed236d11c931c12cf8204c67`。本轮先晋升过 0.1.0；复审发现并修复 Stop 竞态后，依原版本门禁提升到 0.1.1，重新测试/构建/校验/晋升。0.1.0 的原始日志以 `v010` 标记保留，不充当最终候选证据。固定 delegatedTasks 双哈希与三个能力未变。

| 必要安全行为 | 本轮组件证据 | 原生状态 |
| --- | --- | --- |
| 错站、版本/hash、缺少安装代次、过期/错误 Lease 拒绝 | core / UI PASS | NOT_TESTED |
| 撤权错误/断连转 UNKNOWN，不新建执行 | UI 的 E_PERMISSION / E_DISCONNECTED fixture PASS | 实际撤权/断连 NOT_TESTED |
| 重复领取、双实例 CAS 冲突、重复点击不重复派发 | core / UI PASS | Chrome 原子存储与 Run 数 NOT_TESTED |
| Stop 在 ACK 前可请求，提示不保证副作用撤销 | UI PASS | 实际 Native Stop NOT_TESTED |
| UNKNOWN 与存储失败不重跑 | core / UI PASS | NOT_TESTED |
| 重开不声称能沿旧 iframe 查询或重发 | UI PASS | 实际关闭/重开 NOT_TESTED |
| 未验收不能结算；失败/错 Run/错 Result/错源码/错查询/无释放不算业务成功 | core / UI PASS | NOT_TESTED |

本机原始证据：[d11-20261102](../../../artifacts/sidebar-tools/task-shop/d11-20261102/)；`node-final.json` 保存测试前后输入哈希、命令/退出码；`candidate-verification.json`、`promotion.json` 保存包证据；`chrome-blocked.json` 保存明确策略拒绝和全空真实身份；`evidence-manifest.json` 保存文件摘要。

关键原始摘要：core log `c046e0b293507535c6fb2016e699e1f6437d78d8fd1b34c93bf1a490e1cd855a`；UI log `e435f40e085188a198fbb3e5f3bbf33500a17a9cf6e060f7b8fb1d86d252db44`；node-final.json `c4a9caf414b22cff8ebaf4302611afb11daa459d1092a43c3a433f281cfb032d`。

源码输入 SHA-256：core.js `1b12170cedd84e95bcc0dbf5a178eae51c448d65db18cbcb9dcf0e109918e261`；main.js `db514c2b71426786584ac9f077679ecce4ab013e9c3a41829ea4e9bcaf5ab067`；HTML `fc3c3d955878b65c6eb95027367ecb17d21578c486d2cd82fe363e6213832064`；CSS `0537f52133d3341f22ad8abfb15ef8703211591662b0413e6473d2d5afe1d513`。同 HEAD 下未提交输入也已绑定；后续只读文档变更不触发重跑。

### 9.3 当前唯一阻塞与交接

- 状态：`SOURCE_IMPLEMENTED / COMPONENT_TESTED / PACKAGE_VERIFIED / CHROME_BLOCKED / CHROME_NATIVE_NOT_TESTED`。D1 未完成；`BUSINESS_ACCEPTED` 未取得，本机模拟规则也不能代替真实商业签收。
- 停止操作：进入原可信安装器之前。扩展管理页 URL 含 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`，只证明页面上下文，不能证明当前启用、加载路径/构建指纹/开发 serve 或 Native allowed_origins 配对。
- 当前环境：本机无 dev watcher 进程；持续开发/静态开发/production 实际模式未知，未切换模式、构建 Browser 或改动 dist。Chrome 版本、实际固定 Task、权限及原记录均未知。
- Owner：可操作真实扩展 UI 的本地验收者；如需自动控制，由 Browser 控制策略 owner 提供受支持入口。Task Shop 不自行修 Framework 或搭建旁路执行器。
- 唯一下一步：手动在现有可信安装器审阅并安装正式包，读取固定 Task 安装/启用/双哈希、百度授权和已有 Claim/Run；条件满足才领取且只执行一次，记录原 clientRequestId/runId/resultId/retirement，再分别模拟验收和结算。无需重做 D1 开发或重复未变 Node/包门禁。
- 没有真实 clientRequestId、runId、resultId；fixture ID 不可填入真实验收表。Chrome 连接已 finalize，无本轮遗留浏览器占用。

### 9.4 本轮证据自评分

每项按当前证据评分，未测部分不按预期成功给分；这是阶段性自评，非独立生产认证。

| 维度 | /100 | 依据与扣分 |
| --- | ---: | --- |
| 产品 | 45 | 组件闭环与结果展示通过，普通用户 Chrome 全链仍缺 |
| 架构 | 85 | 单业务 owner、原 SDK/执行链/打包器，无公共代码或能力扩张；原生接入未核实 |
| 安全 | 75 | 身份/源码/Origin/租约/UNKNOWN/失败结果组件负例通过；实际撤权和 Native 未测 |
| 测试 | 75 | 22 项定向、失败→通过日志与输入/包 SHA 完整；Chrome/真实 IDB 未测 |
| 执行可靠性 | 60 | 防重、Stop-before-ACK、存储失败栅栏、断连重开组件通过；无真实 Run/Result/释放证据 |
| 可维护性 | 85 | 无新依赖/引擎/安装器，唯一正式包与计划；仍受原 iframe 生命周期限制 |

算术平均：`(45+85+75+75+60+85)/6 = 70.83`。

### 9.5 提交范围与并行工作保护

本轮仅发布本项目 README、执行计划、四个 src 文件、两份测试、tool.config.json 和原 builder 生成的唯一正式包，共十个文件；临时 artifacts 不提交。实际提交 SHA 以本轮最终回执为准，源码和包身份以上述摘要为准。

接力时本地 main 含另一任务未推送提交 `c5627c80ac57c2ef1b7b0b4be9ff65719550d894`，远端 main 为 `1e9b4324cd97674c0aa24a29b92a2da93ebc3fad`。本轮发布只针对 Task Shop 增量，采用远端当前树和 expected SHA 防止覆盖并行提交；本地保留 J06 提交及其他工作区差异，不替另一任务推送其提交，不创建分支/worktree/PR。
