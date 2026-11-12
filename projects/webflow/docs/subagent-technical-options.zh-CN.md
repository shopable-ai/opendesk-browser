# R3 · 正式命名纠偏（2026-11-12，最新用户要求）

**最终产品名称改为 Subagent，正式业务目录改为 `projects/subagent/`，稳定项目 ID 为 `opendesk.subagent`。**
前期的 **Mini Chat** 仅是 `src/mini-chat/` 内的单次 A→B→A 可行性 Demo，不能再用 `subagent-mini-chat` 命名整个扩展或未来产品。
原 `projects/subagent-mini-chat/` 的开发底座已按用户要求原位迁移，不保留第二套副本；WebFlow 独立任务源码、Host/Controller 权限系统保持各自 owner，不被 Subagent 接管。
本次只是产品命名、目录/源码身份迁移与定向 Node 验证，**不代表 WebFlow 可信连接、正式安装或真实 Chrome A→B→A 已完成**。以下 R2/R1 记录保留历史，不再作为当前目录和正式产品名称依据。

---

# R2 补充结论：Subagent 独立产品 + 已安装 WebFlow/Controller Task + 最小公共 Framework（2026-11-12）

> **本节是最新的架构纠偏，优先于下方 R1 中不准确的“WebFlow Subagent”产品归属用语；下方 R1 作为研究历史保留。** 它不构成方案 A 已完成或跨职责接口已支持的声明。
>
> 任务：OD-WEBFLOW-SUBAGENT-ARCHITECTURE-BOUNDARY-R2。此前方案 A 已在另一对话实施，禁止本节触发重复开发。

## 产品身份与部署选择

- **产品身份：Subagent Mini Chat**，优先作为 OpenDesk Browser 内独立、可管理的组合式扩展业务（不是在 WebFlow Side Panel 中加一个大型 Subagent 面板，也不默认另造独立 Chrome Extension）。新建正式业务目录时建议 `projects/subagent-mini-chat/`，须先核对当前仓库是否已有等价项目、ID、已安装包或 owner，避免冲突。
- **网页 UI 运行面：Page USER_SCRIPT / 受管网页增强**，用于用户在 AI 对话 A 中输入任务、查看简短状态与最终结果；不直接获得 Controller/Chrome 特权。必要的设置未来才增独立 Sidebar/PC 管理 UI，**不能**仅为“应用”命名创建空 Sidebar Tool。
- **执行面：已有独立安装、已审核的 Controller Task**。可由 WebFlow 业务提供与维护 ChatGPT 等 Task/Provider Adapter，但 Subagent 不应导入 WebFlow 私有 UI、Runner、内部 Ledger 或仓库中某个固定网页脚本的私有函数。运行经共享 Host/Authority/RunHost/持久 Result。WebFlow 是现有业务消费者/脚本使用方，不是必须常驻的第二个“脚本服务器”。
- **基础设施：OpenDesk Browser Framework** 仅负责通用安装身份、权限、用户激活、文档/目标校验、任务委派、结果读取/订阅、生命周期和恢复；无 Subagent 业务模型、网站 DOM 选择器、Mini Chat 状态卡片、模型提示词。

源码事实（2026-11-12 `main` 静态文档与配置核对）：
1. `docs/api/extension-development-selection.zh-CN.md` 将网页增强归 Page、自动化归 Controller、两者组合归 Combined Application；**当前无跨职责原子组合安装包**。
2. `docs/api/page-userscript.zh-CN.md` 的普通 Page v1 主要是 `page.dom`，没有 Controller `page`、`runId/resultId`；**不得假设 Page 能直接调用 tasks.run**。
3. `docs/api/sidebar-tools.zh-CN.md` 允许经审阅 `delegatedTasks` 的 v2 Sidebar Tool 按固定 pin 委派，但沙箱 iframe 不能直接注入普通网页。 `tasks.configure` 是 UI-only，不代表 Task 已运行。
4. `projects/webflow/tool.config.json` 读取时的固定 `delegatedTasks` 为 Baidu / Google 两个搜索任务；**不能把 ChatGPT 创建对话任务已在 WebFlow 工具包中获准委派当成已证事实**。其它固定桥、Controller 的批准状态需逐项实证。
5. 普通网页自己给出的 JSON、DOM 文本、`postMessage` 均是非可信输入，不能伪造安装身份、任务审批、Run/Result。

## 方案优先级与何时允许改 Framework

**优先 P0 — 完整复用现有公开能力：**
先由源码和原生 Chrome 核对已有用户手势、Page UI、已安装 Task 授权、result 读取和回填入口。能用现有正式接口的全部留在 `projects/subagent-mini-chat/` 与已安装 Task，**不改 Framework**、不新增 C“网页事件桥”。

**仅在出现实际 SDK 缺口时 P1 — 提议最小通用能力：**
如果确实没有一个可授权的 Page→已安装 Task 调用/结果读取通道，独立记录 `SDK_GAP_CONFIRMED` 的证据：实际调用者、缺失接口、报错/行为、现有 API 无法满足的原因。公共能力若需要开发，应为通用的“由受信任用户操作驱动的 Page/工具→固定已安装 Controller Task 委派 + 同一请求只读结果查询/订阅”，不能是 `subagent.runChatGPT` 或 `webflow.sendToPanel`。须具备白名单任务 pin（ID、version、manifest/content SHA、installationId、generation）、来源 tool/program/Origin/tab/document、真实用户动作、原 Authority 审批、目标核验、Run/Result 关联、ACK UNKNOWN 不重放、撤权/禁用/关闭与升级后的恢复、跨应用负例。SDK 规范、测试和业务代码分离；不能跳过既有审阅体系。

**最后 P2 — 必须使用固定可信适配器时：**
如果公开 Page Runtime 技术上无法完成该类受控动作，而立刻建设通用 SDK 又不合适，可建议一个**固定受审、最薄的可信 Content/Host 接入适配器**，放在 Subagent 业务目录或其固定审阅入口，Framework 核心仅注册加载、身份校验与通用生命周期钩子；不得把 Mini Chat DOM、AI 网页选择器、结果解析等搬进通用 `src/framework/`、`src/sw.js`、全局 ToolHost。要注明它与纯 Page Program 部署合同的差异、被安装批准和升级路径，定义将来迁回公开 SDK 的触发条件与退出计划。**P2 不等于给网页脚本特权；不能借内部方法、共享私有 storage 或伪造 chrome.runtime 消息绕过权限。**

若实证无法安全实现，明确 `BLOCKED`，而不是为了“做出来”假装现有接口支持。

## 与方案 A 和研究 R2 的关系

- 方案 A 的业务闭环保持：A 的极简 Mini Chat 输入 → 经过可信授权让唯一 B 发送一次 → 原持久结果 / 原目标页证据读回 → A 页面显示结果与 B 链接。**不自动向 A 官方对话发送消息**。
- 架构研究优先补充**部署/安装组合决策、Page→Task 公开接口存在性审计、C 消息去重、替代路径 P0/P1/P2 的选择依据**。D/E 网络流与官方 API 研究继续保留，但不得抢占 A 的代码实施。
- 先给正在执行 A 的对话**纠偏补丁**，只更正“Subagent 产品归属 / UI 运行时与 Task 的真实权限边界”；不让其推倒重做已完成代码。
- 验收分源代码、单测、包、真实 Chrome、业务与多任务/多站点权限负例，按独立证据报告。架构评审均值 95+ 只表达设计论证质量，不能替代接口和产品验证。

相关正式规范：
- `docs/api/extension-development-selection.zh-CN.md`
- `docs/api/page-userscript.zh-CN.md`
- `docs/api/sidebar-tools.zh-CN.md`
- `docs/api/controller.zh-CN.md`
- `projects/webflow/tool.config.json`

---

# WebFlow Subagent · 技术路线、协议边界与后续阶段（设计记录 R1）

- 日期：2026-11-12
- 仓库：shopable-ai/opendesk-browser（唯一分支 main）
- 位置：projects/webflow/docs/subagent-technical-options.zh-CN.md
- 产品名称：WebFlow Subagent；页面组件：Subagent Mini Chat / Subagent Panel
- 性质：设计与后续研究范围记录，**不是**已实现功能、通过验收的证据或另一次实施授权。
- 并行事项：方案 A 的真实开发提示词已被用户复制到另一对话执行。本记录**不接管、不重复开发**正在进行的方案 A，也不修改共享执行计划、产品合同或正式包。

## 1. 用户真实目标与当前最小闭环

用户在来源 AI 网页 A 的轻量悬浮 Mini Chat 输入一句任务 → WebFlow 基于已有审阅的 Task/Controller 新建独立 ChatGPT 对话 B → 在已有授权约束下填写并只发送一次 → 读取 B 的完整真实回答 → 在 A 网页的 Subagent Panel 中显示回答和真实 B 链接。

第一阶段：仅单 A、单 B、一条任务和一条最终结果。**不向 A 官方聊天窗口自动发送结果消息**。UI 仅标题、输入、创建、简短状态、最终回答与链接；暂不做阶段进度、关键结果面板、多任务展开收起、SSE、模型/平台切换、DAG、复杂任务管理。

核心验收必须是真实浏览器业务证据；模拟网页、HTML 预览、代码存在、Node 通过均不能替代真实 A→B→A 页面展示验证。

## 2. 技术概念必须拆开，避免将 C 误当一条产品方案

按职责区分四层：

1. **触发与执行**：Mini Chat 的用户动作或已审阅的 AI 任务意图 → 可信 Host/Controller → 目标 B 创建、填写、发送。
2. **获取与解释结果**：目标 B 的已安装 Task 原持久 Result 优先；不足时由 Provider Adapter 在已批准页面观察可见回答，尝试解析 AI 输出格式；可降级普通 DOM 文本，但标注非结构化结果。
3. **可信事件/消息路由**：把关联真实 source/target/run/result 身份的数据，使用 WebFlow/扩展**已有**跨组件消息与回读机制送到 A；不自行新建通用 EventBus、Runner 或“网页事件桥”系统。
4. **展示**：A 的 Subagent Panel 只读呈现本次请求的进度/结果。展示不产生隐式发送、运行、二次授权或重试。

特别区分：
- WebFlow task.intent.v1/v2：**AI/用户提出任务意图**，不是完成证据，也不是结果协议；
- AI 输出的结果格式（将来可设计 subagent.result.v1）：**内容提取约定**，由目标 B 观察/Task 解析，并不让网页 JSON 自带执行权限；
- Chrome runtime/tabs 消息、Port、Host 原生回执：**扩展内部传输和路由**，是基础设施，不是与方案 A 并列的一个实现目标；
- 网页原生 postMessage/CustomEvent：如果目标站点或自控网页主动向扩展投递事件，才构成独立的网页事件观察选项，涉及来源校验、隔离环境与权限，不作为本轮默认方案。

**结论：C「网页事件桥」从独立 A/B/C/D/E 方案中撤销，归类为现有通用消息基础设施的复用/缺口检查；若已有 WebFlow 消息路由可以覆盖，不新增 C 模块。** 跨标签路由可能仍有接线工作，但不是重新设计另一套 Bridge。

## 3. 技术路线决策矩阵（阶段而非五选一）

| 代号 | 方案 | 适用价值 | 处理决定 |
| --- | --- | --- | --- |
| A | 已审核 UI 自动化创建 B、输入/发送、读取最终回答；可选固定结果格式 | 最接近已有 WebFlow/浏览器扩展能力；能直接验证真实闭环 | **正在另一对话实施，P0** |
| B | 普通 DOM 回答观察与非结构化文本提取 | AI 不遵循固定格式、Task 尚未持久化完整回答时的有限补救 | **并入 A 的适配器/降级，不独立立项** |
| C | 扩展组件之间消息转交与来源路由 | A→B→A 任何方案都可能用到的通信基础 | **尽量复用原 Host/消息通道，不新造“网页事件桥”** |
| D | 直接观察目标 AI 网站 SSE/Fetch/WebSocket 流 | 更早取得流式内容，但依赖第三方网站内部协议、可能受隔离/安全/变更影响 | **后续只读专项可行性研究；不抢 A** |
| E | 官方 API/受支持的流式接口直接提交并读取回答 | 独立于网页 DOM，通常可提供稳定的结构化流；账号/计费/模型能力可能不同 | **后续可选 Provider，非 A 的默认替代** |

A 的成功不依赖先实现 D、E；A 的失败也不能自动证明 D、E 优于 A。需要基于实证比较。

## 4. 第一阶段已有工程边界（以实时 main 和原合同为准）

- 现有代码有 WebFlow V1/V2 通用意图解析（projects/webflow/src/task-intent-contract.js）、任务控制、安装与权限、Run/Result、ChatGPT 新对话 Task 等相关能力。
- 原合同与执行计划包含 PREPARE、独立发送授权、账号/Profile/DOM 草稿核对、借用保留标签页、UNKNOWN 禁止重放等要求。不得因 Mini Chat 简化界面而绕过。
- 与现有项目文件浮窗退役、WebFlow 页面辅助显示设置兼容；避免重复悬浮面板或复活已退役 UI。
- 若 B 的回答未被已有 Result 保存，不得仅以 AI 文本中“完成”、某个 JSON 字段或静默时间来宣称任务成功。
- 一切任务调用需绑定真实用户批准、安装身份、来源 A 的 tab/document、目标 B 的 tab/document、原 runId/resultId；避免多个标签串线，重复消息去重。
- A 页面刷新、B 导航/关闭、Chrome MV3 Worker 休眠、授权撤销、已发送但回执 UNKNOWN，都必须能够真实显示“待核对”，不能重复发送。
- 无法访问的第三方内部推理内容不在范围内；将来阶段汇报只可基于模型显式输出的可见文本/结构化数据，而非声称读取隐藏思维。

## 5. 后续独立研究路线（不要与正在运行的 A 混成同一个实施任务）

**R1 / 方案 A（当前）：** A Mini Chat → 创建真正 B → 输入并按原审批发送 → 等完整回复 → A Panel 展示真实回答和 B 链接；真实 Chrome 验收。只修真正缺口。

**R2 / 基于 A 的可观测性审计：** 先读取 A 实际开发与验收证据，找出内容识别、错误恢复、跨标签回传到底复用了哪些代码。将 B 的普通 DOM 获取归类为 fallback，C 的内部消息机制归类为 infrastructure；如果无实际缺口，保留现状不修改。

**R3 / 方案 D 专项 PoC：** 只在明确需要更低延迟/更高完整性时，比较 DOM/固定报告与网络层观察；确认 MV3 隔离、第三方协议变动、权限合规、是否可读取到所需数据；不得默认注入 MAIN world 或抓取敏感鉴权数据。

**R4 / 方案 E 专项 PoC：** 研究官方 API 能力与成本、独立授权、返回格式、模型/账户差异，基于统一 Provider 结果接口展示于同一 Mini Chat；不能假定网页版会员等价于 API 权益。

**R5 / 多 AI Provider：** 一个平台一个受控 ProviderAdapter/Task，不把 ChatGPT 的 DOM/参数写入 WebFlow 通用 Controller；主 UI 共享，分别验收 ChatGPT/Claude/Gemini/Grok/DeepSeek 的站点变化及授权约束。

**R6 / 阶段性报告（只有用户要求时）：** 单独设计显式可见的阶段消息报告契约，区分 AI 自报与可验证 Controller 结果。阶段子任务、Todo List、展开收起、并行子 Agent 不应提前污染 R1 UI。

## 6. 后续研究必须回答的问题（调查与对照，而不是重做 A）

1. 目前源码究竟在哪个入口监听 AI 网页协议？固定代码块识别与普通网页 DOM 观察分别在哪里实现？
2. 监听之后到 Host/Controller/持久 Result/来源 A 页面，真实经过哪些模块、消息类型和身份字段？现有跨标签路由是否足够？如果不足，唯一缺口是什么？
3. B 的完整回复通过已安装 Task Durable Result 能否拿到？AI 固定输出协议的结果与可信运行状态如何分离？
4. D 的网络事件与 A 的 DOM/Task 观察，在延迟、完整性、稳定性、权限/风险方面有没有可量化提升？
5. E 官方 API 与浏览器网页自动化在模型、能力、费用与身份方面的差异是什么？
6. 各方案如何复用同一个 Mini Chat 展示结构，但不共用不该共用的授权和 Provider 适配逻辑？
7. 在哪些条件下才值得新增接口或文件，而不是继续使用现有 WebFlow 功能？

禁止把代码已提交、测试文件存在、隔离 Demo 通过当作完整真实 Chrome PASS。不同任务只评自己的实证完成度。

## 7. 本文的修改边界与追踪

本文是独立新设计文档，不修改 projects/webflow/docs/execution-plan.zh-CN.md、product-contract.zh-CN.md、共享生产源码、版本号、安装包或其他并行 owner 的开发文件。方案 A 的实际状态由它正在执行的对话和对应真实代码/回执确定。后续技术研究先读此文档和方案 A 的最新证据；不得按旧提示词重新造一遍 A→B→A。

相关入口：
- [产品合同](product-contract.zh-CN.md)
- [执行计划](execution-plan.zh-CN.md)
- [WebFlow README](../README.md)
