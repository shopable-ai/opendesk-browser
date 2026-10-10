# OpenDesk Browser R16：工作流 AI Provider 路由、本机 Codex App Server 与远程 Agent 架构合同

> 日期：2026-10-10。状态：DESIGN_ACCEPTED / SOURCE_IMPLEMENTED / COMPONENT_VERIFIED / REAL_CODEX_PARTIAL。Sidebar → 原 Native → Go Codex App Server 的真实会话代码已实现；受审计 Codex 0.159.2 的 Linux 实际登录、同线程多轮、流式取消与 Workflow JSON 已验证。当前版本不支持安全冷恢复。**macOS / 原生 Chrome / Browser 工具往返 / 保存后关闭 AI 重复运行仍为 NOT_TESTED，未宣布整体 95+ 验收通过。** 见 [本轮实现、证据和独立验收记录](../../framework/workstreams/r16-local-codex-20261010.md)。以下第 2 节保留实施前设计基线；实际能力以本轮记录和相同候选测试为准。

## 1. 核心决策

采用 **单一 Browser Core + 多 Provider Agent 创作入口 + 冻结的 JS Task**。

- Browser Sidebar：只负责对话/编辑/确认、真实 CurrentPageTarget、既有 Controller / RunHost / Task / Durable Result。不要引入第二套 DOM 执行器、特权浏览器代理或新的版本数据库。
- OpenDesk Go（现有原生伴随进程）：优先实现本地 Codex 的诊断和受限进程会话管理；本地用户安装/登录 Codex 后才可作为工作流创作 Provider。原有 Chrome Native Host 命名、Browser sender、私有 IPC、Node/Go migration fence 保持。
- Codex App Server：推荐作为持久 Agent loop / thread / turn / tool-call / progress / approval 的主集成层。一次性辅助 CLI 可使用 codex exec --json；不以已废弃的 codex mcp-server 作为新系统依赖。官方 Codex SDK 可作经过比较后的备选，不应同时实现三套适配器。
- 自定义 HTTPS API：保留现在的手动 Provider 和权限/发送许可。若只有 Chat Completions 文本返回，只能宣称**一步计划生成**，不能把它当持续执行型 Agent。
- 未来 OpenDesk 官方 AI：后端 Agent Orchestrator 维护长期任务、会话和工具调度，HTTPS/SSE 是客户端传输层，不等于“只调用一次模型”；使用服务端 API 计费或正式授权的第三方账号服务，不能共享任意个人 CLI 登录凭据。
- 脱离 AI 后的正常运行：冻结 WorkflowDefinition + compiled JavaScript / sourceHash / Revision → 原 Task v1 发布和安装门槛 → 用户手动 Run；不需 Native、Codex、MCP 或在线模型。Task v1 仍只允许单个精确 HTTP(S) origin。

## 2. 设计基线：实施前仓库能力与缺口

**已经存在（仅源码确认，不等于整链 Native PASS）：**

1. Browser：src/ui/workflow/{ai-plan,workflow-view,view-state}.js，src/framework/workflow/{contract,compiler}.js；当前 AI 使用显式 HTTPS Chat Completions endpoint、模型、Session-only API Key、一次手势许可和结构化提议审核。
2. Browser：src/native-agent/{service-worker,host-adapter,protocol}.js，native-agent/local-dev/mcp.mjs；本地 Codex/MCP 现有链路方向是 Codex → MCP 工具 → Native IPC → Browser Controller，不是 Sidebar 主动开启 Codex Agent 会话。
3. OpenDesk：internal/browserbridge、internal/browsercli 提供 Go Native Host / CLI 和有界授权通信；其 cmd/opendesk-mcp 与 opendesk ai 主要服务既有桌面自动化，不是 Sidebar 的模型 Provider。单文件 Go Project Provider 与复杂 Node ESM/npm MCP 不可混同。
4. Chrome 扩展需要已安装并绑定真实 extensionId 的 Native Messaging Host、明确的 nativeMessaging 授权、存活的 Sidebar Host 和目标网站权限；Go Host 的存在不等于首次零配置已经完成。

**设计时缺失（本轮实现状态见上方记录）：**真正的本机 Codex 安装/授权探测、App Server process owner、受控 Agent session 协议、Sidebar → Native Host → Codex 的反向请求、Agent progress/approval events、Browser MCP tools 按原 Authority 转发、取消与 thread 恢复证据。没有这些功能时 UI 不得显示“本机 Codex 已连接/可用”。

## 3. 推荐的数据流

~~~text
Sidebar [纯 UI:需求、步骤、权限提示]
   │   明确生成/审批 + 最小必需数据
   ▼
Browser Authenticated Host / Native Transport
   │   仅本扩展的可信窗口/实例；独立协议版本、额度、超时
   ▼
OpenDesk Go Local AI Adapter [受限进程、App Server thread/turn 生命周期]
   │   通过当前 OS 用户安装的 codex app-server；本地鉴权材料不回传
   ▼
Codex Agent loop [模型云端推理，工具、持续规划、流事件]
   │   只允许已注册且受限的 OpenDesk Browser 工具
   ▼
原有 Native Bridge / Browser Authority → Controller / ChromePage
   │   同一窗口/精确 document/明确站点授权 + request ledger
   ▼
真实观察/原生动作结果 → Codex Agent → 人可读 WorkflowDefinition proposal
                                              ↓ 用户明确采用
                              原编译器 → 原 RunHost 真机验证
                                              ↓ 用户明确 Save/发布
                               冻结 JavaScript Task（AI 不再需要）
~~~

**设计时需要补齐的反向通路**：当时已有“外部 Codex 调 Browser”的 MCP/CLI，但没有 Browser 主动调本机 Codex 的 Host→Agent 交互；不能通过在网页加载 Codex JS、改写 localhost HTTP 端口或用 chrome.scripting.executeScript 绕开这个缺口。

## 4. 四类 Provider / 状态设计

Provider 是**来源**，与 workflow 的 Draft / Saved / Running、当前网站权限、模型推理状态相互正交。建议 Provider keys：local_codex、opendesk_cloud、custom_https、manual；具体 id 用正式版本化合同固定。

| 来源 | 能力检查 | 常见状态 | 可执行条件 |
| --- | --- | --- | --- |
| local_codex | Go Native 安装和 handshake、精确 caller、Codex 可执行文件、登录、app-server initialize、可用 turn、Browser 工具集 | HOST_UNAVAILABLE / CLI_MISSING / LOGIN_REQUIRED / INITIALIZING / READY / RATE_LIMITED / INCOMPATIBLE / UNKNOWN | 用户已同意模型推理和本次数据边界，真实 App Server 已就绪，Bridge 可信 |
| opendesk_cloud | 正式服务账号、订阅/余额、服务健康、Agent 允许的 Browser tool connection | SIGN_IN_REQUIRED / PLAN_REQUIRED / CONNECTING / READY / RATE_LIMITED / OFFLINE | OAuth/OIDC/PKCE、用户明确连接和数据共享授权；实际任务调用成功，不以列表声称套餐支持 |
| custom_https | 明确 HTTPS endpoint、模型、API key、站点请求许可、schema/protocol | CONFIG_REQUIRED / CONSENT_REQUIRED / READY_FOR_REQUEST / INVALID_RESPONSE / PROVIDER_ERROR | 仅用户真实触发时调用；最小数据发送，不伪装为可继续使用工具的 Agent |
| manual | 无 Provider | READY | 不需模型或账户，通过既有手工步骤编辑与 RunHost |

**重要：READY_FOR_REQUEST ≠ 模型额度可用。** 一次实际受限请求/turn 完成才证明该次能力；Native-connected、Codex-installed、Codex-logged-in 和 Agent-turn-usable 是不同事实。App Server 的 model/list 也不能证明模型账户可用。

**路由规则**：
- 用户明确选择的来源优先。只有“自动选择”时才推荐真实 READY 的 local_codex，其次用户主动授权的 cloud/custom；无可用来源则显示手动入口。
- Provider 错误不得未经确认静默转向其它模型/地域/云服务；尤其不得把本地 Codex 自动转为上传更广数据的远程服务。
- 无模型或 Native 未连接时正常打开工作流，历史、手动编译、已保存 Task 仍可用。状态说明只出现在齿轮设置区或用户点击发送后，不能把连接诊断重新堆在 Side Panel 首屏。
- “本机 Codex”不是离线本地模型：进程在本机，模型推理一般仍需访问模型服务。说明**本机 Codex（可能使用在线推理）**，不可写“完全本地、不会上传”。

## 5. 同意/授权分层：不能合并成一个开关

1. **本机发现**：允许只读检查已连接的 OpenDesk 与可用 Codex 可执行文件；不得偷读 ~/.codex 凭据内容、复制账户 token、扫描所有用户进程或读取无关目录。
2. **模型数据发送**：至少区分用户输入、工作流步骤/参数/站点 origin、网页观察摘要、截图、账号身份。默认只发送最小创作必要字段；读取私人网页/上传截图时单独明确同意。
3. **Browser nativeMessaging**：在真实点击许可下仅连可信 Chrome Native Host、已安装程序和绑定的 extensionId。首次安装注册是另外一个受控步骤。
4. **网站/文档授权**：正式动作由 Browser 当前 RunHost/Authority 逐操作验证 exact tab/frame/document/origin；Provider 的“允许”不等于网站权限。
5. **高风险动作**：付款、发消息、删除、上传、提交敏感信息需要针对性确认，不能与“同意模型规划”合并。
6. **本机工具与文件系统**：Codex App Server process 不应该默认拥有真实用户完整 HOME、任意项目修改、危险 shell、网络或所有 MCP 工具。为工作流设定专用受限 workspace 和最小可用 Tool Registry，按官方 sandbox / approvals 配置，浏览器动作仍交给 Browser。
7. **服务端账号/计费**：OpenDesk 官方 SaaS 的账号 OAuth、Billing、模型供应商 key、租户数据/工具权限分开；不得代理或复用某个用户个人 CLI 的 ChatGPT 订阅为所有远端用户提供后端模型。

## 6. Provider Adapter 兼容合同（推荐，需实现及测试）

不要直接更改现有 Native Agent v1 十个入口或其 mutation ledger。新建版本化独立的 **opendesk.workflow-ai.v1** 子协议，在已有受认证 Chrome ↔ Go 传输中扩展并严格限制 source/owner。所有请求必须由可信扩展 Sidebar 发起；明确防护恶意网页、其他扩展、其他本地用户和旧的 Node Host。

建议最小业务抽象（可根据现有传输实际约束调整名字，但必须保持职责）：

~~~text
ai.capabilities.read 只读：sourceKey、transport、nativeState、codexInstalled、authState、
                     agentCompatibility、supportedTools、usableForTurn、reason
ai.session.open     明确建立或恢复本用户工作流 session + model policy
ai.plan.start       用户明确发起一个 turn；输入冻结、数据分类及审批范围
ai.events.read      有 cursor 的限额事件读取；顺序、背压、保密、size budget
ai.approval.answer  精确 pending approvalId，用户真实手势，同步核对目标与 capabilities
ai.plan.cancel      显式中止当前 turn；不能推断已发起的网页副作用未发生
ai.session.close    释放当次进程/thread 资源；不删除用户冻结的 Workflow Revision
~~~

每条消息包含协议版本、sessionId、requestId、owner/registrationId、client generation、消息序号、能力域和大小预算。一个 requestId 的未知效果不得换 ID 自动重复提交。引用的终态必须有可信回执；Batched events 在 Native 60KiB 帧约束下限额截断并可续读，不把任意模型文本透传给 SW 执行。Native Messaging STDIO 与 Codex App Server STDIO 是不同进程/协议，不允许彼此混用 stdout。

本机初期只开放计划生成与**只读** browser.observe；browser.click/fill/goto 必须确认和真实 Native/Controller 结果以后逐项开放。工具方法应与现有 ChromePage / Agent Bridge 的签名对齐，不在 Go 中增加另一个 DOM Driver。AI 输出只给 Workspace schema proposal，无法编译的跨 origin 计划保持只读草稿，不伪装 Task v1 安装成功。

## 7. 如何复用现有 Codex CLI 账户

先在用户真正的 macOS 当前账号下手工核对 codex 是否在 PATH、版本、官方 CLI 登录状态和一次 read-only turn 是否成功。身份信息保留在 Codex 本地授权存储，OpenDesk Go 只观察不会读取/输出/日志化 token。

优先实验 codex app-server 的已登录会话，可维持 thread/start → turn/start → 事件流 → turn/completed、thread/resume 和审批；如果本地 CLI 版本不支持所需协议，明确显示 INCOMPATIBLE，引导用户更新，不自行伪装成功或把 CLI stdout 文本猜成 JSON RPC。

若仅需一次批量生成和离线解析可使用 codex exec --json，**但它不替代交互式多轮会话/逐动作审批**。现有 Node MCP 用作 Codex→Browser 工具的过渡能力；不因 Go Host 迁移就删掉 ESM/npm 开发工具。若实现 Go 受限 Tool Adapter，先对照现有 MCP schema 和 Native ledger，确保不会注册两个互相竞争的 Browser执行器。

## 8. OpenDesk 官方 AI 服务（独立阶段）

云服务与本机 Codex 共享一份抽象 AI Session / Proposal / Events / Approval 合同，但**认证和执行环境不同**：

- Browser 用户使用 OpenDesk SaaS 的独立账号登录（OAuth/OIDC PKCE）。服务器验证用户、套餐/用量和具体 session 的 tool grants。
- HTTP 端点负责启动/继续/取消 Agent session；SSE/WebSocket 负责事件流。服务器 Agent orchestrator 管理上下文、工具调用、审批、长期任务、重试与限额，HTTP 不是一次性模型答复的限制。
- 可选 Responses API + Agents SDK 自建 Agent loop；需要 Codex harness 的 thread/tool/approval 时，将 Codex App Server 放在**按租户隔离、严格限权**的 worker 中，不让不同用户共享某个人的 ~/.codex 登录态。
- 使用 OpenDesk 官方模型供应商 API key/计费，或未来平台正式授权的 Sign-in with ChatGPT 第三方接入；不能从普通用户 CLI 复制 OAuth session/token 来给 SaaS 用户统一复用。
- 若 Agent 要操作用户当前真实 Chrome，仍必须通过**用户已明确授权的 Browser Bridge** 的受限出站连接/中继来调原 Controller/Authority，服务器本身无法通过单纯 HTTP 直接接管用户本地标签页。
- 云端和本机运行中任意网络中断/ACK 丢失都只能查询既有可信结果；未知网页副作用不做自动“重新点击”。

## 9. 建议实施切片

R16.0：先做独立 Provider 状态模型和设置 UX；不对未实现的 local_codex 显示 READY。保留原 custom_https 真正可用链；默认 Sidebar 仍干净。

R16.1：Go 本机只读探测 Codex CLI/App Server 可用性、版本、登录指示、Native trusted connection；跨仓协议双实现及失败/撤权测试，真实状态只供 UI 查看。

R16.2：本机 Codex App Server 的 plan/session/events/approval，沿用 Browser 的 WorkflowDefinition schema 和用户明确采用流程。首个真实演示只做规划，不执行网页变化。

R16.3：由 Codex 使用已授权的 Browser 只读观察 Tool，完成单 origin 观察→规划→编译→用户运行→Result→Save→无 AI 重复运行。再有限开放自动修复，任何 effect_unknown 停止自动重试。

R16.4：官方 OpenDesk 云服务独立设计与开发，复用 Provider 合同但不要求 Codex CLI 常驻服务器，也不削弱用户本地 Chrome 的授权。

## 10. 独立验收 / 反方阻断

以下项目分别独立百分制评审；不足 95、无证据或存在阻断缺口时，不能用平均数宣布已完成：

- Sidebar 单页简洁性：默认只呈现创作与运行所需，设置图标按需展开。
- 可用性与降级：CLI 缺失/未登录/Native 断线/限额/网络故障/无账号仍能手动编辑与执行已保存的 JS。
- Bridge 身份与并发：仅源于可信已批准 Sidebar；请求严格相关、跨窗口及扩展权限不得混淆。
- 令牌/网络/隐私：没有凭据回传或调试日志泄露，清楚区分本机进程与云推理。
- Agent 连续能力：真实 thread/turn、progress、工具和人工审批，不将模型一次响应冒充 Agent。
- 浏览器工具 Authority：真实 DOM 动作依旧经过 CurrentPageTarget、Controller/RunHost，撤权/导航/Host close fail closed。
- Durable JS 复用：退出 Codex/停止 Native 后，同 revision 可以在有效权限下独立完成相同任务。
- 生命周期与错误：断连、取消、超时、未知效果、配对迁移、CLI 多版本差异均有原始证据和回滚方案。
- 服务端隔离：未开放阶段 NOT_TESTED；不能基于本地 Provider 设计声称 SaaS 已具备。
- 原生与发布：macOS 真实 Chrome（匹配当前 commit、extension、Go 二进制、CLI 版本）和 Node/Go 兼容性; UI 320/360/420/520px 与 200% 缩放。

安全关键项 FAIL 直接 NOT_ACCEPTED。旧历史组件或不同 SHA 的绿灯不能冒充本轮原生通过。

## 11. 官方参考与设计来源（2026-10-10 核对）

- Codex 平台 Agent Harness 与 codex exec / SDK / app-server 选型：https://developers.openai.com/blog/codex-as-a-platform
- Codex app-server、stdio、thread、turn、events 与官方 ChatGPT sign-in 接口：https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- Codex CLI 使用 ChatGPT 账号：https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Agent sandbox 与持久工具运行隔离：https://developers.openai.com/api/docs/guides/agents/sandboxes
- Browser 既有接管边界：native-convergence-compatibility-r3.zh-CN.md、native-zero-config-pairing-r2.zh-CN.md、agent-to-task-contract-r1.zh-CN.md。
