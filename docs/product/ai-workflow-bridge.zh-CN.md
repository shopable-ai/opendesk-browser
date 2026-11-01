# OpenDesk Browser · AI Workflow Bridge — 产品目标、技术方案与执行计划

> **文档性质：长期产品目标（PRODUCT GOAL）及当前 P0 技术方案、执行计划，不是功能完成报告或本轮执行授权。**
> 初版：2026-10-27。适用项目：`shopable-ai/opendesk-browser`。  
> 本文为官方 ChatGPT 网页与 OpenDesk Browser 之间 AI 任务桥接的**唯一长期产品目标入口**；阶段事实和真实验收仍以当期源码、工作记录及绑定证据为准。

> **用户范围纠偏（2026-10-28）：** 当前需求是 Web 工作流检测固定格式、解析约定命令并触发已安装脚本。自然语言自动选择脚本或自动创建脚本不属于本需求，也不作为未完成项或完成门槛。该纠偏约束 BR-02/BR-03 的命令匹配语义，不新增或删除其他稳定需求 ID。

> **本轮完成标准补充（2026-10-28）：** 手动触发和预批准自动触发必须分别验证。每轮都要观察已安装 Controller 操作真实网页、填写/搜索及受控访问另一文档，并核对网页效果、同轮持久结果与原聊天单次回传。仅返回 JSON、后台请求成功或显示 completed 不足以证明这条可见操作链完成；本机测试网页证据也不代表真实业务网站已通过。

## 1. 原始最高目标：不能被 Demo 替代

建立一个可信、可复用、可持续扩展的 **AI 决策 ↔ 浏览器自动化执行 ↔ 结果交接** 基础系统。

用户通过官方 ChatGPT 网页表达需求，AI 返回约定的结构化任务候选。OpenDesk Browser 在用户允许的对话中**自动发现**完整候选，核验任务来源、安装版本、参数、网站及执行授权，然后复用现有浏览器自动化框架完成真实操作；实际结果经可信持久记录送回**正确的原聊天**，供 AI 继续判断后续任务。

长期目标是：同一协议与可信执行链可以扩展到 **跨 ChatGPT 对话、跨标签页/网站、多个已保存 Workflow、持久任务调度以及多个隔离浏览器 Profile**。用户不必把所有工作都塞进一次 AI 回答，也不应为每一步重复发明浏览器脚本。

**关键边界：**
- 搜索输入框 Demo 是 P0 技术验证夹具，**不是**最终产品，不以截图、nonce 或 runId 数量衡量产品价值。
- 手动“建立请求 / 采用 / 执行”是有效调试与必要授权路径，**不是**理想的已授权自动触发体验。
- AI 文本是待核验的指令**候选**，绝不是权限授予、真实网页效果或完成证明。
- 当前方案属于**官方 ChatGPT 网站的 DOM/扩展桥接**，并非声称 OpenAI 官方已将 OpenDesk 注册为原生工具或 MCP。
- 长期目标不代表现有版本已经可以跨对话、跨站或 24 小时无人值守运行。

### 一个贯穿阶段的代表性场景

ChatGPT 对话 A 提出研究需求 → AI 输出受限任务候选 → OpenDesk 识别、核验并调用已安装脚本读取已授权 GitHub 或其他网站 → 真实结果持久化、送回 A。随后 A 可要求把特定结果和步骤提示词交给对话 B；OpenDesk 通过后续版本化交接合同创建/定位 B、提交必要输入并读取结果，再把结果引用交回 A 或下一步。若某一轮 AI 无法继续，持久调度层保留状态，在满足环境与授权条件后恢复。

该场景解释**为何**需要 Bridge；它不是 P0 当前必须一次性实现的全部功能。

## 2. 长期不可丢失的能力（稳定需求 ID）

| ID | 长期能力 | 用户可观察结果 | 首要阶段 |
| --- | --- | --- | --- |
| **BR-01** | 完整 AI 回复自动发现 | 官方 ChatGPT 回复结束后，OpenDesk 在已启用会话中识别唯一合法候选，无需点“采用”才能被发现 | P0 |
| **BR-02** | 固定协议与可信候选校验 | 确认候选格式、轮次/来源、目标、Task ID、参数，拒绝旧回复、引用、流式片段和冲突候选 | P0 |
| **BR-03** | 已安装 Task 可信触发与可复用执行 | 用户批准范围内触发原安装脚本，使用冻结源码/版本与现有 Authority、RunHost、Controller，不因替换参数重新生成业务代码 | P0 |
| **BR-04** | 持久结果回原聊天，AI 继续处理 | 绑定真实 run/result 与原对话，只回传一次，不凭模型文本或 completed 声称网页效果成功 | P0 |
| **BR-05** | 手动、一次批准、受限自动模式 | 调试可手动；尚未批准时待确认；在已明确批准的范围内无需再点“采用/执行”即可自动触发 | P0 |
| **BR-06** | 跨对话任务、上下文与结果交接 | 对话 A 的明确输出被转换为 B 的指定输入；B 的结果可准确返回 A 或下一步骤 | P1 |
| **BR-07** | 跨标签页、跨网站的多 Task 工作流 | 在各自已授权的网站会话中读取、填写、点击、提取，步骤间交接结果与引用 | P2 |
| **BR-08** | 持久任务队列与恢复 | 保存步骤状态、截止时间、停止/失败/UNKNOWN 和结果；断开单轮对话也不丢任务进度 | P3 |
| **BR-09** | 多浏览器 Profile 与账号隔离执行 | 不同已登录账号独立授权、独立任务/会话/结果，可按可信节点分配任务 | P4 |

命令通过明确的 Task / Workflow 身份和参数复用已安装程序。没有匹配的已安装程序时应明确拒绝；不从自然语言自行选择或创建脚本。

## 3. 用户流程与授权语义

### P0 调试路径（允许保留）

AI 输出候选 → 用户手动“采用”或建立请求 → 查看真实 Task / 目标 / 参数 → 用户执行 → 网页操作 → 持久结果 → 原聊天。

### P0 目标路径 A：自动发现 + 必要的一次批准

AI 完整回复 → **OpenDesk 自动发现并准备候选** → 未获本次执行许可时显示准确任务、网站及参数 → 用户点击一次必要的批准/执行 → 原有可信执行与结果回传。

不能把发现候选的按钮点击当作产品的正常必要步骤。采用候选不代表已经运行。

### P0 目标路径 B：已预批准后的自动触发

用户先通过**可信 UI**批准明确的一次请求或受限执行计划（包括 Task/目标/参数和有效范围）。AI 完整回复并匹配该许可后，OpenDesk 自动核验和触发，无须再次点击“采用/执行”；成功之后仅一次向原聊天交付。

**本阶段已有“一轮自动批准”的历史技术实现，不等于已实现长期全局自动授权。** 不得为了减少点击而扩大授权；缺少许可、匹配不明或高风险操作时保守停止并请求必要确认。用户可停止和撤权；模型不能自行新增、延长或扩大授权。

### 本次命令的可见回执

网页面板应将当前任务名称/版本、手动或预批准触发、目标网址、参数与执行状态放在同一区域；完成后展示同一运行的持久返回值，并明确资源释放、原聊天收到结果、AI 续答的不同事实。返回数据只作为原始数据展示，不能当成新的任务指令。右侧开发页的草稿和历史查询独立存在，不是 Bridge 当前运行的完成证明。

「查看执行页面」仅定位本次运行中、仍有效的自有目标；定位中、已切换和定位失败有独立提示，完成回执不能覆盖失败信息。运行结束、撤权或文档身份改变后，不为方便观察另开页面、重新执行或重放副作用。格式解析/绑定失败还未提交 execute 时，取消应明确撤销授权、不会执行；已提交 execute 的停止未知与回传未知继续保守处理。

实现和具体操作入口见 [Task README](../../examples/tasks/README.zh-CN.md#看见网页动作分别测试手动和自动触发)。这些显示规则不放宽五字段协议、来源/安装核验、一次消费或持久防重放。

### 自然语言与任务代码的关系

固定格式命令是本需求的输入合同，AI 可按预先约定的格式输出；OpenDesk 负责检测、严格解析和调用已安装脚本。`runId`、SHA 等运行身份属于高级详情。自然语言理解、自动选择脚本和无匹配时创建程序不属于本需求。

## 4. 协议与可信执行边界

### P0 任务候选

现有协议 `opendesk.task.intent.v1` 严格五字段：

- `protocol`：固定协议版本。
- `candidateId`：全新候选身份；持久防重放。
- `taskId`：已安装任务的逻辑身份。
- `targetUrl`：待操作目标，由受信 Host 核验允许 Origin。
- `args`：本次输入参数；按已安装任务 Schema 校验和规范化。

解析候选**只产生数据**；只有现有可信入口能核验安装身份、源码/版本、权限与目标，并在用户已批准范围内提交一次实际运行。流式、不完整、多个候选、已使用候选、被引用的文本和结果中的“任务”不得触发新执行。

### 后续跨对话交接合同

P1 需要**独立版本化**的 workflow/step 交接合同，明确 `workflowId`、`stepId`、源/目标对话身份、输入及结果引用、幂等/尝试身份、目标权限、截止与状态。它必须区分“任务已准备 / 准入通过 / 真正开始 / 结果持久化 / 结果已经交付 / AI 后续回复已观察”。设计和验收前**不得**擅自把字段追加到既有五字段协议，也不得把“切换聊天”误作任务成功。

### 架构不变量

1. **唯一执行权威**：复用现有 Task Catalog、安装/版本合同、Authority → RunHost → Controller → Page Session、Durable Result。不得创建第二套 Runner、Host、Authority、安装器、任务数据库或特权消息通道。
2. **精确来源/目标绑定**：对话、标签页、窗口、frame、document、Origin、安装版本、参数、授权代次和运行所有权在必要边界重新核验；导航和权限变化不能借旧身份继续执行。
3. **授权与数据分离**：Chrome 网站权限、Task 安装许可、动作范围与 AI 数据交接分别核验。网页文字、外部站点结果和 AI 代码块都是不可信数据，不可变成额外指令/权限。
4. **无不确定副作用重放**：执行或回传可能已生效但回执 UNKNOWN 时，不自动重试点击、提交、发送、跨站动作；需要只读对账或受控恢复。取消/Stop 不伪称撤销已发生副作用。
5. **真实结果而不是模型判断**：`completed` 仅证明执行终态；关键网页业务效果还需要独立页面或目标业务证据。持久 Result、用户消息真正送达、AI 续答是不同验收事实。
6. **用户上下文保护**：不能覆盖已有草稿、附件或 IME 输入，也不能把结果送错聊天。跨对话仅交接经授权选择的最小必要资料。
7. **已登录会话最小使用**：跨网站操作可以利用目标 Profile 已获授权的登录态，但不能通过导出、复制或共享 Cookie、Token、密码绕过会话隔离。
8. **资源与运行条件真实报告**：Chrome MV3 Worker 不保证永驻；P3 必须依靠持久状态、检查点和合适调度载体。单次 ChatGPT 回复不是 24 小时保证；浏览器关闭、电脑睡眠、网络故障、模型限制须明确处理或标记不可用。
9. **无无限自主循环**：未来多步运行需明确范围、停止机制、预算/次数上限、可观察状态和人工接管路径；新 AI 回复不能无限隐式扩大任务。

## 5. 阶段路线与出阶段门槛

**P0 — 单对话技术桥接与自动触发。** 继承现有手动模式和一次批准模式的有效记录；补齐独立任务自动发现、自动准备、按许可自动触发、同次网页效果与原聊天单次回传，并观察原 AI 基于实际数据整理结果，覆盖直接相关的取消、撤权、防重放和 UNKNOWN。只有真实 Chrome 闭环取得同一候选/运行/结果及网页效果证据才为 P0 PRODUCT_DONE。搜索 Demo 只是验收用例；不扩展为多轮编排，也不代表第 9 节长期产品闭环已完成。

**P1 — 两个 ChatGPT 对话的最小交接。** 先固定独立交接合同，完成 A → B → A 单次真实链路，精确核查来源对话、目标对话、消息提交及结果引用。不能把网页自动发送冒充 AI 真正完成任务。

**P2 — 跨网页/跨站与 Workflow 复用。** 通过多个分别授权的 Task/Workflow 完成两个网站的数据交换；每一步继续通过固定格式和明确身份调用已安装程序，已有单 Origin Task v1 不因“工作流”名义被放宽。

**P3 — 持久队列与长期恢复。** 保存调度状态、幂等身份、步骤结果、停止/取消、UNKNOWN 对账；验证浏览器/Host/系统可用性边界。目标是条件满足时持续推进，而非承诺 ChatGPT 单轮无限回答、设备离线仍运行。

**P4 — 多 Profile / 多账号执行节点。** 独立的登录态、授权、任务及结果存储范围；节点选择、故障隔离和恢复均需新的真实证据，不以一个 Profile 成功代替全部。

每个阶段**独立授权、独立验收**。P0 验证通过后记录下一阶段接口约束，但不自动开发 P1–P4、production、全量压力和多浏览器矩阵。

## 6. 开发、测试与防漂移

### 每轮开始的阅读顺序

1. 本文件：原始最高目标、稳定需求 ID、架构不可变原则、长期路线。
2. 当前阶段的**唯一**工作流记录：最新成果、代码 owner、差量缺口和下一条操作。
3. 最新 `main` 实际源码、安装状态及可继承的真实证据；先核对是否有尚未提交的本地修改。
4. 涉及某项模块时才读取对应子系统安全/版本/Workflow 合同。

### 责任划分

- **网页版/仓库代码阶段**：优先完成当前阶段真正缺失的核心代码、审查和直接相关定向测试。不能凭静态实现声称 Chrome 真实通过。
- **本地 Codex / Mac Chrome 阶段**：沿原有开发安装环境确认真实 DOM 操作、权限、生命周期、结果和原聊天续答；遇真实失败最小修复，再定向复测。
- **阶段工作记录**：保存最近 HEAD/源码指纹、测试端口与 PID、Chrome Profile、candidate/request/run/result、截图/日志和阻塞。以上都是会变化的证据，**不得覆盖长期产品目标**。

### 状态必须分层

`SOURCE_IMPLEMENTED`、`COMPONENT_TESTED`、`BUILD_VERIFIED`、`CHROME_NATIVE_VERIFIED`、`PRODUCT_DONE`、`PARTIAL`、`FAILED`、`UNKNOWN`、`NOT_TESTED`、`NOT_SCORED` 各自只表达真实证据。历史成功仅对其实际代码/安装候选有效；新代码不得自动继承旧原生 PASS。测试数量、单次搜索成功、专家自评和完成态文本不得互相替代。

### 防止在相似对话之间重复工作

- 将多个相似聊天视为**同一产品的不同阶段/测试**，每次先做跨对话差量核对，不重放封存 candidate/run。
- 当前操作 → 具体阻塞 → 最小修复 → 对应验证 → 可见结果。已有有效 PASS 不重跑，无新失败不扩成全量 CI。
- 主线只在 `main`；禁止新分支、worktree、PR、强推、破坏性重置或覆盖其他并行 owner。涉及文件冲突时精确暂停冲突项。
- 用户最新明确需求可以更新本文，但必须说明新增/替换/废止的需求 ID 和理由；不得默默将技术 Demo 升级为最高 Goal，也不得因为本轮 P0 完成删掉 P1–P4。

## 7. 与现有权威文档的关系

- [对话执行与工作流保存合同](conversation-first-browser-task-contract.zh-CN.md)：本地 Codex 对话式浏览器操作及按需保存工作流；与**官方 ChatGPT 网站 Bridge**是相关但不同的产品入口。
- [Workflow 语义与版本合同](../architecture/workflow-r15-contract.zh-CN.md)：现有 WorkflowDefinition、编译、版本、Origin 与可信 RunHost；本文不覆盖其当前安全限制。
- [AI Chat Bridge R1.3 真实闭环记录](../framework/workstreams/ai-chat-bridge-r13-20261025.md)：历史手动和一次批准后自动执行的真实成功证据，**不代表**独立 AI 五字段任务的自动采用已经验收。
- [AI Chat Bridge R2.0 百度 MVP](../framework/workstreams/ai-chat-bridge-r20-baidu-mvp.zh-CN.md)：具体搜索任务与验收口径，不能替代产品路线。
- 本地如有 `docs/framework/workstreams/chatgpt-installed-task-core-20261026.zh-CN.md`，先核实其文件归属和最新记录；它不在本次远端 `main` 中确认存在，不能凭路径假设已提交。

## 8. 当前 P0 技术方案与执行计划（2026-11-01）

本节细化 BR-01 至 BR-05，不新增、替换或废止需求 ID，不恢复自然语言选脚本/生成脚本，也不提前进入 P1–P4。目标是让用户在原聊天中给出固定命令，已安装任务在明确预批准范围内自动完成公开搜索，再将同一次真实结果送回原聊天。执行记录继续使用本地 `docs/framework/workstreams/web-flow-20261101.md`，不另建产品目标或第二套任务系统；该记录当前未被 Git 跟踪，不假定远端已有，后续发布文档时需单独确认可交付的证据摘要。

### 8.1 当前事实与下一条操作

| 范围 | 已有证据与实现 | 尚缺的证明 |
| --- | --- | --- |
| 固定协议、发现与准入 | 五字段解析、完整回复发现、安装身份核验、一次预批准及持久防重放已有源码和定向组件证据。本轮修复了空壳/分批历史基线、同路由编辑器重挂载、无关 Task 安装变更误拒回传 | 这些时序修复的真实 Chrome 专项仍未全部验证；不因组件通过推定通过 |
| 本机网页演示 | 旧 QA `01a19702-a707-79d1-a8e5-ca3b1d4a09ba` 已记录 `workflow.visible-search@1.0.1` 的手动轮和一次预批准自动轮，包含填写、搜索、详情导航、持久结果及原聊天单次回传 | 仅证明 `http://127.0.0.1:43111` 演示；不代表百度、Google 或 production |
| 百度业务任务 | 原任务只有结果读取；当前 P0 owner 已补真实搜索动作，并报告百度/Google 的实际输入、点击、导航与读取链已跑通 | 新固定候选的安装、预批准自动触发和原聊天单次回传仍待同轮证据；本文档任务没有重演 |
| Google 业务任务 | 已有 `examples/tasks/google-search-top3.js`、`google.search.top3.v1.opendesk-task.json` 及定向测试；P0 owner 报告真实动作通过且固定任务已验证安装 | 预批准自动执行与原聊天回传正在验证，不能用单独动作链代替完整 Bridge 闭环 |

以上为方案落地时的快照；以工作记录后续同候选证据更新阶段事实。唯一 P0 真实业务实现 owner 为本机 Codex 对话 `01a19720-f02d-7490-a696-8ad4f8a54221`（“Web Flow · 百度与 Google 自动执行及动作轨迹”），使用用户指定的 `openai/gpt-6.1-sol` / `xhigh`。该任务当前实际权限是 managed / workspace-write / on-request，不能从全局配置推定继承完全访问。本轮文档工作不并发修改其产品源码、任务包、浏览器或 watcher。

**下一条用户操作：** 在既有 ChatGPT 对话与已连接的持续开发环境中，选择经验证安装的搜索任务、核对目标和参数、预批准一次，再发送固定命令。当前下一步是固定安装后的预批准自动执行与原聊天回传同轮验证；并非缺少另一套桥接平台。开发继续复用 `dist/development` 和现有单一 watcher；站点任务先使用公开 Controller / Locator，当前 Profile 不允许 `page.evaluate` 时不得打开安全开关来迁就实现。

### 8.2 单一技术链与文件职责

```text
ChatGPT 新的完整回复：opendesk-task 代码块，恰好五字段
  → Site / Discovery：当前原对话、新轮次、唯一完整候选
  → Intent Parser：protocol / candidateId / taskId / targetUrl / args
  → Trusted Host：解析当前安装、冻结版本、参数和精确目标
  → Trigger Gate：匹配明确预批准或等待必要批准，消费一次
  → 原 Authority / RunHost / Controller：操作自有目标文档
  → Task 返回有限结果及 actionTrace，原 Durable Result 持久化
  → Host 再核对安装、运行、结果与原聊天资格
  → Page / Site：保护草稿并单次交付原聊天，分别确认用户消息与 AI 续答
```

| 责任 | 现有 owner 文件/入口 | 本轮处理原则 |
| --- | --- | --- |
| 固定数据合同 | `src/native-agent/chatgpt-task-request.js` | 保持五字段；安装快照由可信 Host 解析，模型不得提供授权或源码 |
| 发现与页面状态 | `src/native-agent/chatgpt-task-discovery.js`、`chatgpt-bridge-site.js`、`chatgpt-fixed-bridge-page.js` | 完整新回复自动准备；历史、引用、流式片段、重生成和结果数据不触发。仅在真实复现新缺陷时最小修复 |
| 预批准与执行/回传核验 | `src/native-agent/chatgpt-bridge-trigger-gate.js`、`chatgpt-fixed-bridge-host.js` | 复用原账本与 Authority，核对当前安装及精确范围，一次消费；撤权、安装身份变化、断开及 UNKNOWN 继续拦截 |
| 站点业务 | `examples/tasks/` 中既有 Controller 项目、对应 `.opendesk-task.json`，使用[公开 Controller API](../api/controller.zh-CN.md) | 百度/Google 各自单 Origin 任务；搜索选择器、填入/点击/提取与轨迹归任务，不写入通用 Host 的站点分支 |
| 结果与证据 | 原 RunHost / Durable Result、原聊天回传；本地 `artifacts/web-flow-20261101/` | 不建第二数据库。记录同一安装、candidate/request/run/result 及截图/动作证据；本地忽略产物不等于远端交付 |

**为何还会看到点击：** 首次安装/升级的权限审阅、缺少真实网站权限，以及没有匹配执行许可时，仍需要准确的用户操作。当前“预批准一次 · 5 分钟”只允许下一条完全匹配的命令运行一次，不是所有搜索的永久许可。匹配后应自动发现、准备并执行，不再点“采用/执行”。“查看执行页面”只是观察已存在的目标，不是启动动作；验收应证明即使不点它任务仍已开始，不能用该按钮补开网页或补执行。许可已用、过期、参数/目标/安装变化时停止并明确说明原因，不静默扩大范围。长期多次免点击计划属于后续独立设计和明确授权，不冒称本轮已实现。

### 8.3 搜索任务与动作轨迹

百度和 Google 都从其经批准的公开搜索入口开始，使用中性查询 `OpenDesk Browser` 或 `browser automation documentation`，不得包含账号、订单或其他个人资料。Task ID、固定版本、目标 URL 和参数必须取自实际安装及 Schema；新任务的最终身份以实现 owner 核验后的清单为准，不用尚未安装的示意 ID 发命令。提示词只要求 AI 输出一个 `opendesk-task` 代码块、一个完整 JSON、恰好第 4 节五字段；每轮使用新 `candidateId`，不带源码或授权字段。

任务核心步骤为：读取入口 URL 和唯一可操作控件 → 记录输入前值 → `fill` 中性查询 → `inputValue` 回读确认 → 点击当前真实提交控件 → 等待结果文档/URL 并核对查询 → 读取有限自然结果。百度若发生局部更新，应如实记录 URL/文档是否变化，不能将局部更新冒称新文档。需要额外验证受控文档导航时，只在同一批准 Origin 内导航至实际结果页；不打开会跨站的结果链接，不为凑步骤合成导航。

`actionTrace` 是任务返回值里的有界业务数据，**不增加五字段命令**。每步记录递增序号、实际动作、起止时间、目标 Locator 或 URL、必要的前后读回值及 `confirmed` / `failed` / `unknown`。点击调用成功只证明动作调用返回，必须另有结果页/查询/结果样本确认；预先列出的计划步骤不得标记为已执行。轨迹控制在原聊天完整回传 8 KiB 限制内，超限保留持久结果并明确交付失败，不截断冒充成功。

原生验收另外保留输入前后可见截图、点击目标、导航前后 URL/文档事实、结果样本和时间顺序操作记录，与同一持久结果关联。任务自述、截图、终态文字、HTTP 响应中任一项单独都不足以证明全链。实际站点不能证明恰好一次提交时只陈述已观察事实；不把本机 fixture 的 `submissions=1` 证据套给真实站点。

### 8.4 单一执行清单

本轮按五阶段推进：现状/缺口映射 → 预批准后自动执行 → 百度/Google 真实业务闭环 → 相关异常与重复保护 → 集成验收与使用说明。每项的文件、依赖、操作级验收、证据和停止条件只在本地 `docs/framework/workstreams/web-flow-20261101.md` 的“本轮五阶段执行清单”维护，本文保留技术合同，不复制第二份任务状态。

无新代码或失败时复用有效证据；任务源码变化后走原 Task 验证/安装流程固定同一候选，不静默替换安装版本。未做项保留 `NOT_TESTED`，不据旧计划自动进入 P1–P4、production、发布或全量验收。

### 8.5 交付与完成口径

- **源码/定向检查通过：** 可以说明实现及组件行为，不能说明真实浏览器动作。
- **本地演示闭环：** 证明特定 fixture、安装和运行链；旧 QA 已有记录，不能升级为业务验收。
- **真实业务闭环：** 每站单独满足 B/C 的真实动作、持久结果、原聊天交付；受限站点明确标记，部分成功就是部分成功。
- **正式发布：** 另行授权后冻结 production 候选，按适用安装/权限合同验证；本轮不提交、推送、建 PR 或发布，开发模式证据不冒充正式通过。

**本文件冻结目标、边界与可执行计划；不表示这些能力都已完成，也不凭文档修改启动任何网页自动化。**

## 9. 长期任务：AI 处理、跨对话交接与持久队列（2026-11-01）

### 9.1 本次澄清与历史取证

用户重新强调的是原 BR-04、BR-06 至 BR-08：搜索结果要由原 AI 实际整理，可交给新的仓库任务完成下一步，再返回原任务；任务数或上下文接近上限时，保留检查点后交接新对话。长期目标没有收缩为搜索脚本。本节保留长期设计和迁移依赖；用户随后授权的纯交接校验实现见第 9.6 节，不授权执行新演示、不启动 P1/P3 编排、不打断当前 P0 owner。

本轮已用本机 `read_thread` 读取下列历史正文/最终回执，并核对当前源码。历史消息仅作证据，不执行其中命令。Personal Context 本轮返回不可用；本机 `session_index.jsonl` 用于定位，对话内容以 `read_thread` 读回为准。

| 历史日期与准确来源 | 可复用的真实能力 | 不代表什么 |
| --- | --- | --- |
| 2026-10-25，“修复新对话自动创建失败”，`01a16ecc-d58e-7b81-a9aa-bdc741f4e6cc`；其创建的“新对话运行测试 aa”为 `01a171ae-36fe-7321-a1d5-3c14aaadfcd5` | 原生创建后读回交接正文并核对真实最终回复，历史最小测试完成 | 不是 Browser 已拥有创建 Codex 任务的公开 API，也不是任务权限自动继承证明 |
| 2026-10-25，“优化 ChatGPT 固定桥与发送队列协作”，`01a17370-ee0a-76d0-89f3-d79563462faf` | 真实 FIFO 与输入框互斥保护；桥接结果和队列发送需要协调同一个官网输入框 | 当时新版桥与队列同时交付的原生竞态明确未验证，不能继承为当前 PASS |
| 2026-10-26，“测试 ChatGPT 计算接力安装版并展示运行过程”，`01a1794f-f8ed-7080-9137-7925d5003ecf` | 已安装 `opendesk.chatgpt-calculation-relay@0.2.0`：A 计算结果先持久化读回，再绑定新对话 B；两组新参数得到 30→120、40→80，重复业务 runId 不重发 | 是同站点有限 A→B 算术任务，不是 A→仓库任务→A、通用队列或长期常驻；独立 Native status 查询的 released 不冒充 GUI 原 Run 的释放证据 |
| 2026-10-27/28，“完成 AI Workflow Bridge 核心闭环”，`01a17e1f-cc5c-76d0-860a-a9e0ec3e26cd` | 固定命令触发、真实结果回原聊天及 AI 中文处理；该对话同时列出仍需完善的可见性/任务对应问题 | 不把原聊天续答升级为跨对话、仓库执行或调度已完成 |
| 2026-10-29，“AI 消息队列｜系统 Chrome 核心闭环”，`01a18400-031b-7d70-a76f-8fcc6e5b7b45` | 最终回执记录网页 FIFO 两条各一次，当前 README 记 A→回复→B→回复；侧栏按最新要求仅使用提示 | `src/page/engine.js` 是单文档内存队列，页面关闭/刷新恢复未实现；不是持久业务工作队列，公开发行仍 blocked |

计算接力的当前 [README](../../examples/programs/chatgpt-calculation-relay/README.zh-CN.md)、[输入输出合同](../../examples/programs/chatgpt-calculation-relay/CONTRACT.zh-CN.md) 和 [EVIDENCE.json](../../examples/programs/chatgpt-calculation-relay/EVIDENCE.json) 与历史相互印证。本轮只读核对其构建索引中七个源码/配置文件，SHA 均与记录一致；这证明当前文件仍对应历史来源，**不证明今天 Chrome 的安装/登录仍相同**。发送队列以[当前 README](../../examples/sidebar-tools/ai-send-queue/README.zh-CN.md)和现有 `src/page/engine.js` 为准，不恢复已被取代的侧栏同步目标。

其他现有基础也须按实际边界复用：

- `examples/programs/chatgpt-calculation-relay/src/{site,conversation,relay}.js`：官网适配、草稿保护、写前发送/导航日志、持久化读回、`status/inspect/reconcile`。重启后读取日志不等于恢复旧 Worker；未知发送不自动重放。其业务来源仍在独立项目，不把计算业务搬进 Host。
- `src/platform/tasks/schedule-{contract,repository,service}.js`、`src/ui/scheduled-task-host.js`：已有 `frameworkKV` 中计划/Fire、安装固定、原子准入、原 Run/Result 关联与等待合法可见 Host；这是已存在源码，不是 Web Flow 队列接线证明。真实调度证据继续按[原设计/实施记录](../architecture/browser-framework/scheduled-tasks-r1-design.zh-CN.md)分层，旧宽度/缩放待办不恢复。
- `src/ui/workflow/agent-loop.js`：现有有界延续保护，最多 8 轮、24 动作、8 分钟；不是长期调度器。`task-review-handoff.js` 只是工作流到任务目录的短期展示交接，不是 AI 跨对话交接或运行授权。
- `src/cloud-control/host-owner-lease.js`：已有代次、fencing 和 TTL 的租约基础代码，但文件明确 `NOT wired to a message route or dispatch`。可审计复用其模式，不能写成当前 Web Flow 已有可用租约服务，更不能直接复用它的云控 owner key。

### 9.2 执行环境与适配器边界

| 参与方 | 已有能力 | 后续适配责任与缺口 |
| --- | --- | --- |
| 普通 ChatGPT 网页 A/B | 官网对话、现有 DOM/Controller 适配、结果消息和有限计算接力 | 观察、受控发送一次、完成读取、精确对话绑定与对账。聊天中的仓库链接不授予 GitHub、shell、本地文件或 Codex 工具权限 |
| 绑定仓库的 Codex 任务 B | 本次已有本机原生创建/读回任务的证据，执行环境与仓库工作目录独立 | 通过获准的原生入口创建/定位项目任务、读回实际 repo/ref/模型/权限、读取产物与验证结果。Browser/Worker 当前没有通用的 `tasks.run` 或任意 Codex 创建接口，不可伪造公开 SDK |
| Google AI | 用户尚未指明具体产品/入口 | 设计只保留适配位置；不能把 Google 搜索、现有模型 Provider 或某个假定产品当作 Google AI 网页已接入，状态为 `NOT_IMPLEMENTED / NOT_TESTED` |

适配器是职责抽象，不是本轮新公开 API：应声明可观察、发送、读取完成、新建对话/任务、只读对账等实际能力及其身份/权限前提。不支持的能力明确拒绝。ChatGPT 站点业务继续留独立 Controller 项目，可信编排仅协调已审核接口，全部浏览器动作仍走原 Authority/RunHost/Controller；Codex 仓库任务按它自己的执行权威与权限运行，不由网页文本获得权限。

当前原生 `create_thread` 的参数没有业务幂等键或任务权限覆盖参数，本地项目创建也不能靠交接正文就强制固定 Git ref。创建后必须读回实际线程及执行上下文，核对 repo/main/base commit、模型与权限；无法确认则保持待处理。创建回执丢失且无可靠线程身份时，不能换请求盲建第二个任务，也不读写应用数据库补造映射。

### 9.3 P1 独立、固定版本的交接合同（拟建）

独立 `opendesk.workflow.handoff.v1` 合同已在 `projects/web-flow/src/handoff-contract.js` 实现首个纯 Handoff 校验单元；**Receipt、适配器派发和完整 P1 闭环尚未实现**。它不追加到五字段 `opendesk.task.intent.v1`，不借模型生成字段扩大权限。当前纯 Handoff 的封闭 Schema 已固定；后续行为接线前仍需冻结适配能力。模型可提出候选，可信协调层解析真实身份、授权引用和派发账本。

| 合同部分 | 必须固定的内容与验收 |
| --- | --- |
| 身份与幂等 | 协议版本、workflowId、stepId、handoffId、attemptId、idempotencyKey；区分业务步骤、创建/发送尝试、真实 thread/run/result。重复输入只返回原映射，不新增任务/消息 |
| 来源与返回目标 | 原执行环境/Host、conversation/thread/turn、原结果引用、returnTo 的原聊天/原任务及授权接收范围；导航后不能按“当前页”猜原接收方 |
| 目标执行环境与仓库 | 实际适配器、local/cloud 类型、project/host/thread 身份、repo 规范 URL、ref 和 base commit、允许写入文件及验证命令。当前仓库仅现有 main，禁止新分支/worktree/PR；旧版本只读核查，不强制 reset 到旧 commit |
| 输入与必要摘要 | 本次目标、已确认事实/决策、未完成项、失败/UNKNOWN、最小必要上下文；原证据和 artifact refs 含来源、路径/URL、哈希、类型、归属及访问范围。摘要不替代原证据，不携带 Cookie/Token/密钥 |
| 交付与完成条件 | 期望产物、可观察验收、验证命令/结果引用、允许变化范围；仅凭 B 的“完成”文本不能过关，必须读取对应产物/测试事实 |
| 授权与停止 | 可信 authorizationRef 绑定目标、数据、动作、次数/期限/预算和撤权代次；引用不能由模型自签。验证码、认证失效、超范围、证据不全、冲突或未知效果时暂停/接管 |
| 输出回执 | 同 handoffId/stepId 的真实目标身份、完成/部分/失败/未知状态、输入/输出摘要哈希、artifact refs、验证事实、剩余问题与下一步；结果持久化、送达、原 AI 处理三项分别记录 |

新对话压缩上下文是减少重复材料的策略，不保证更精准。摘要必须保留来源、反例、未确认假设、停止原因和证据引用；B 应核对必要原证据。交接失败、产物与摘要矛盾或原任务无法辨认时不继续下一轮，不能以多建聊天修补准确性。

P1 最小目标是一次 A→B→A：先交接一个有限任务，确认 B 产物并返回原 A，不做无限“继续”链。P1 先需要一份可持久读回的交接记录与未知效果栅栏，不以完整 P3 调度器作为它的前置；完整队列在独立确认后推进。

### 9.4 P3 持久队列与恢复方案（完整接线待建）

持久队列是跨步骤协调元数据，**不是第二执行器、第二权限中心或第二 Run/Result 库**。它不能运行在父 Controller 占住单执行槽等待子 Task 的循环里；当前 Worker 无嵌套 Task 调用接口。先结束/释放当前步骤，再由合法协调入口申请下一次准入。

| 存储/运行载体 | 能力与限制 | 本设计选择 |
| --- | --- | --- |
| 现有 Page 内存 FIFO | 支持单文档排队发送，刷新/关闭会失去队列，无持久跨任务准入 | 不改造成全局工作队列；不把历史待发文本直接迁移为获授权任务 |
| 已有任务 AppStorage | 计算接力已用于稳定 Task 身份下的业务日志与读回；公开 CRUD 不等于多 owner 原子 claim | 保留业务检查点/证据，不能仅用读后写模拟跨宿主租约 |
| 既有 frameworkKV 与原事务能力 | 计划/Fire 和原 Controller 已有事务、代次、运行关联；受可信 Host/Authority 限制 | 仅作框架已有能力参考，应用不直接访问私有 IDB。当前先设计单 owner AppStorage 检查点；若多 owner 原子 claim 需求无法由公开 SDK 满足，先记 `SDK_GAP_NOT_PROVEN`，补真实失败与最小通用能力提案后交 Runtime owner，不把 WebFlow 队列塞进核心 |
| 原生仓库执行环境 | 可在自身已授权范围保存产物/检查点并继续独立仓库步骤；浏览器离线时无法替它操作网页 | 由各任务自己的持久产物与回执关联；若未来用桌面/云服务承接调度，必须显式启用和验证身份/触发所有权，不假定已常驻 |

队列记录需要 workflow/step 定义版本、依赖、准入范围、尝试/幂等映射、检查点与 artifact refs、deadline/次数/预算、暂停/取消原因；结果只引用原 Run/Result，不复制出另一个权威结果。租约记录 owner/document、generation/fencingEpoch、leaseUntil，在原子事务内领取/续租并在派发前重核权威；租约本身不是许可。已有云控租约代码仅提供参考，Web Flow 的接线与冲突域尚未实现。

步骤状态区分待办/可准入/已租用/派发意图/运行/等待结果/完成/失败/取消，以及 `WAITING_HOST`、`WAITING_AUTH`、`NEEDS_ATTENTION`、`UNKNOWN`；结果持久化和对话交付另记阶段。派发、点击、发送和创建前落账意图，拿到真实身份后再关联检查点。租约过期只允许重新领取**确定尚未派发**的工作；已有派发意图、Run/thread 身份或未知副作用时先查询原身份，绝不因 TTL 到期再次执行。

自动重试只适用于确定未派发的准入等待、只读状态查询，或被实际执行接口证明幂等且仍在原授权/预算内的操作。未知创建/发送/点击/仓库写入一律暂停，只读对账；无法确定则人工接管，保留旧记录，不能换候选/线程/安装身份绕过去重。恢复登录、授权或宿主后重新核查当前版本、来源和额度，不自动续旧许可。

长时间执行不等于 MV3 后台永驻：浏览器关闭、电脑休眠、无合法可见 Host、认证过期或网络不可用时保存检查点并等待；恢复时先对账。外部原生任务若独立仍在运行，Browser 队列只能标记等待并在恢复后核查，不能凭网页断开宣布任务失败、已停止或启动替代任务。每个计划必须设有限步数、交接次数、截止时间/预算和用户停止入口。

迁移只新增有版本的编排元数据与索引：保留旧接力日志、Schedule Fire、Run/Result、UNKNOWN 和各自 owner；不自动转换内存队列、不静默搬账号/Profile、不迁移凭据。首轮先支持单 owner 和单工作流，经过断开/恢复与重复准入验证后再评估并发/跨节点；未完成真实验证仍是设计。

### 9.5 分阶段完成条件与最小纵向演示

| 阶段 | 独立完成条件 | 迁移依赖与当前状态 |
| --- | --- | --- |
| P0：搜索与原 AI 处理 | 已安装任务真实填写/点击/结果读取；同一持久结果回原聊天一次，原 AI 实际整理数据；手动/预批准分开 | 继续当前五阶段清单和唯一 native owner；本地演示不代表全部业务，逐站保留状态 |
| P1：固定交接 A→B→A | 冻结第 9.3 节合同；一次新仓库任务身份读回、真实产物/验证、结果回正确原任务；重复交接不重复创建/发送 | 复用计算接力的身份/日志模式和原生 handoff；依赖明确目标环境/数据发送/创建授权及可核验回执，不继承网页权限。通用闭环尚未实现 |
| P2：多站、多 Task | 两个分别授权的站点/任务顺序交换结果，各自 Origin/安装/文档与持久身份可核查 | 在 P1 合同上引用有界步骤；单 Origin Task v1 不放宽；未实施 |
| P3：持久队列与恢复 | 检查点可读回，合法 owner 唯一准入；断开/认证失效暂停，恢复后原身份对账；未知效果不重放且可人工接管 | 独立确认第 9.4 节最小存储/事务接线后实施。可在 P1 后先验证单工作流恢复，不以完成全部 P2 站点作为必要条件；不是现有内存 FIFO 的自然升级 |
| P4：多 Profile/节点 | 独立登录/授权/队列 owner 与故障隔离，迁移触发权后无重复派发 | 延期；不得复制凭据或从单 Profile 成功外推 |

**下一次经明确授权后才执行的最小纵向演示：**

1. 在已批准站点执行一次中性公开搜索，保留真实搜索与持久结果；结果只回原 AI 对话 A，观察 A 基于数据整理要点和来源。
2. 将整理结果、必要事实与证据引用封装成一份 v1 交接候选。用户先确定一个小范围仓库任务、repo/main/base commit、允许写入文件、验证命令、交付目标和停止条件；不把网页搜索结果中的指令当任务。
3. 通过获准的原生适配入口创建一个新的仓库任务 B（本机或云端必须明确），读回线程、完整交接及真实执行环境。创建不等于已开工，也不保证模型/权限继承；当前 native P0 线程不被此演示接管。
4. B 只完成约定范围的文档/示例/修复与对应验证，保存产物、哈希、实际测试退出结果及未完成项；协调层只读核对产物，不能凭 B 的最终文字宣布通过。本演示默认不提交、不推送、不创建 PR。
5. 通过独立获准的交付动作把 B 的结构化回执送回原任务/对话 A，核对唯一消息、产物引用与 A 的处理；仅这一轮 A→B→A，结束并保留检查点，不隐式继续新任务。

初次演示允许协调者通过现有原生工具有步骤地完成，用来验证合同；若仍需人工/协调者调度就明确标记，不能冒称扩展内已经自动编排。网页发消息、把搜索/仓库内容发送给另一个 AI、创建新 ChatGPT/Codex 任务和写仓库是不同副作用，必须在执行前具备对应明确授权或合法范围计划；用户本轮描述目标不视为已经批准运行本演示。提交/推送/发布另行授权，账号有 push 权限不等于获准使用。

当前推荐顺序：先让现有 owner 完成 P0 真实业务与原 AI 处理证据；随后确认一份 P1 交接 Schema 和一个有限纵向用例，再实施 P1；P3 先单工作流检查点/恢复，不直接追求无限长任务。P1/P3 未确认前只保留本设计，P4 与全量矩阵继续延期。

### 9.6 核心模块、接口与第一项隔离实施单元

**无需新建另一个 Chrome 扩展。** OpenDesk 是框架，WebFlow 是独立应用业务；新增应用 owner 为 `projects/web-flow/`，原 Bridge 在 P0 owner 手中保持不动，百度/Google 留各自安装 Task。在应用内补三块能力：版本化交接与受控适配、持久编排元数据、证据/幂等与恢复。下表交接校验和单 owner 队列离线数据单元已实现，其余真实接线仍为拟建路径，均不是新公开 SDK；真实发送/创建/仓库执行接线仍须各自合法执行入口，不能从浏览器直接调用仅在 Codex 会话中出现的工具。

| 拟建模块 / 既有复用 | 输入与输出职责 | 依赖与范围 |
| --- | --- | --- |
| `projects/web-flow/src/handoff-contract.js`（已实现第一单元） | 纯 JSON Handoff 校验、规范化、幂等键生成；Receipt 延后，不创建任务、不发送、不读写存储 | 独立于 ChatGPT P0 文件，不改五字段 parser；定向测试 `projects/web-flow/tests/handoff-contract.test.mjs` |
| `projects/web-flow/src/adapters/session.js`（后续） | 原对话身份、完整结果与一次交付回执；仅协调既有独立 Controller 站点适配 | 复用计算接力的 `site/conversation` 行为与原 Bridge 草稿/输入框保护，来源复用先审计。Google AI 只声明 unsupported |
| `projects/web-flow/src/adapters/repository-task.js`（后续） | 获准的仓库任务请求 → 实际 thread/environment/产物/检查回执 | 当前 Browser Native 尚未证明提供 Codex 任务创建能力，先明确拒绝派发；需要验证已有原生集成能力或另行批准最小接口，不能凭空加任意 shell/MCP 通道 |
| `projects/web-flow/src/queue/state.js`、`queue/repository.js`（离线单元已实现） | 有界事件日志、单 owner 状态恢复、派发意图/原执行/结果引用，保存后读回；不执行真实任务 | 只注入公开 AppStorage getItem/setItem 边界，离线 Map 测试；真实 AppStorage、CAS/跨宿主租约、UI/派发未接，不访问私有 IDB |
| `projects/web-flow/src/continuation.js`（后续） | 可见协调者读取可准入步骤、重核许可、调用适配器、展示等待/暂停/接管 | 复用原 Host/Authority/RunHost；前一步资源结算后再准入下一步，不建后台常驻 Runner |

后续多 owner/CAS 设计草案的接口是 `claimReadyStep({workflowId,stepId,ownerToken,expectedRevision})`、`appendCheckpoint({workflowId,stepId,attemptId,expectedRevision,phase,evidenceRefs})` 和 `bindExecution({workflowId,stepId,attemptId,executionRef})`。它们只更新原存储里的编排元数据，不授予执行许可；事务必须拒绝旧 revision/fencing token。这些草案不是本轮已经实现的公开 SDK；本轮单 owner 的实际 createQueueJournal/appendQueueEvent/replayQueueJournal/createSingleOwnerQueue 接口只在应用 README 维护。多 owner 签名须在 P3 接线前随 owner 合同冻结。状态按“READY → LEASED → DISPATCH_INTENT → RUNNING → RESULT_PERSISTED → DELIVERY_INTENT → DELIVERED → COMPLETED”记录阶段；暂停/等待/FAILED/CANCELLED/UNKNOWN 是独立分支，不能把投影状态当派发依据。

第一单元接口：

```text
parseWorkflowHandoff(json, {now, expectedSource, expectedTarget}) → 深冻结的规范化 Handoff
createWorkflowHandoffKey({protocol,workflowId,stepId,handoffId}) → 上述四项的确定性 JSON 数组字符串
```

第一版只覆盖本轮有限纵向用例。Handoff 已实现，Receipt 为后续设计；封闭对象形状如下：新增适配器/字段必须显式升级或修订版本合同，不能接受任意额外字段：

```text
Handoff = {
  protocol: "opendesk.workflow.handoff.v1",
  workflowId, stepId, handoffId, attemptId, idempotencyKey,
  source: {adapter:"chatgpt-web", conversationId, turnId},
  target: {adapter:"codex-local", hostId, projectId, repoUrl, ref, baseCommit, threadId:null},
  returnTo: {adapter:"chatgpt-web", conversationId, turnId},
  objective, summary,
  evidenceRefs: [{kind, id, sha256}],
  allowedFiles, verificationCommands, expectedArtifacts,
  authorizationRef,
  limits: {maxSteps, maxHandoffs, deadlineAt},
  stopConditions,
  createdAt, expiresAt
}
Receipt = {
  protocol: "opendesk.workflow.handoff-result.v1",
  workflowId, stepId, handoffId, attemptId,
  execution: {adapter:"codex-local", hostId, threadId, projectId, repoUrl, ref, baseCommit},
  status: "completed" | "partial" | "failed" | "unknown",
  artifacts: [{kind, id, sha256}],
  checks: [{command, exitCode, logRef}],
  summary, remainingIssues, completedAt
}
```

第一单元校验值（字符串需非空且 trim 后不变，无控制字符；同一数组不接受重复项）：输入 JSON 不超过 32 KiB；身份 token 为 8–128 位 ASCII 字母/数字/`._:-`；其他标识为非空、无控制字符且最多 256 字符。文本 objective/summary 每项最多 4096 字符，remainingIssues 最多 16 项、每项 512 字符；引用最多 16 项，kind 仅 `durable-result/artifact/conversation-turn`、id 最多 512 字符、sha256 为 64 位小写十六进制。文件/产物路径各最多 32 项（产物至少一项且必须在 allowedFiles 内），单项最多 512 字符、仅相对 POSIX 路径，拒绝绝对路径、反斜杠、冒号、空/`.`/`..` 段；命令最多 8 项、单项 512 字符且不含控制字符，只作数据校验，不执行或插入 shell。

repoUrl 使用无凭据/查询/fragment 的规范 GitHub 仓库 HTTPS 地址，与 expectedTarget 完全一致；ref/baseCommit 与可信调用者提供的预期值一致（本仓库为 `refs/heads/main`，commit 为实际 40 位 SHA），不从模型输入决定 checkout。returnTo 必须等于 source；idempotencyKey 必须等于 `createWorkflowHandoffKey`，其本身不是授权。limits 为正安全整数，第一单元固定 `maxSteps=2/maxHandoffs=1`；时间为 UTC 毫秒安全整数，`createdAt ≤ now < expiresAt ≤ deadlineAt`，expiresAt 是交接准入期限，不代表任务期限或许可续期。authorizationRef 仅非空引用，权限有效性由后续可信层重新核验，解析通过不表示获准。

Receipt 必须匹配同一 workflow/step/handoff/attempt、预期 Host/project/repo/ref/baseCommit，threadId 必须为非空真实身份字段；完成时间不晚于 now/deadlineAt。checks 的 command 必须来自交接声明，exitCode 为整数或 null（未知），logRef 必须引用本次 artifacts 中的一项。`completed` 至少提供一项产物引用、所有声明检查且 exitCode 全为 0；这只是回执的结构一致性，仍须后续适配器独立核对实际线程、文件哈希、日志与退出结果。未知字段、错误协议/类型/范围/期限分别拒绝为 `E_HANDOFF_SCHEMA / E_HANDOFF_SCOPE / E_HANDOFF_EXPIRED`，绝不能由 completed 文本生成可信完成证明。

最小实施与验收：先写有效交接、额外授权字段、Google/错误目标、过期、幂等键篡改、跨仓库/跨原聊天交接、缺摘要/停止条件、路径穿越和超过大小上限的定向回归，再实现上述纯函数。Receipt 的未知退出码误报 completed 等回归留在其后续单元。运行 `node --test projects/web-flow/tests/handoff-contract.test.mjs` 与该文件语法检查；不加载浏览器、不调用 Native、不执行命令字符串、不申请队列租约。第一单元交付的是可校验的数据合同，**不是 P1 外部闭环已完成**。

该纯合同单元已确认无既有应用/同职责路径，单独落在 WebFlow 应用并完成 120/120 定向测试与语法检查；不覆盖 P0 owner 的代码或资源。P0 owner `01a19720-f02d-7490-a696-8ad4f8a54221` 继续现有真实业务验证，不接管或重启其资源。本轮先红后绿完成纯 Handoff 校验与项目内测试，使用已完成的本地 HR‑6.1 Sol/xhigh 输出并经协调者审查；不接 Receipt、UI、队列或外部发送。用户随后明确“不强制 HR”，后续由当前任务直接推进，HR 可选，不改全局配置；Dot 额度归属未知，不声称免费。真实完成状态以项目 README 和工作记录为准。后续行为接线只在 P0 完成及明确确认 P1/P3 范围后推进。


### 9.7 当前单 owner 队列增量与可用边界

[WebFlow 应用 README](../../projects/web-flow/README.zh-CN.md)维护本轮具体 API、状态和最小计划，执行记录继续沿用原 workstream，不创建平行队列体系。数据单元已实现：单工作流至多两项、64 个有界事件；保存后读回才返回成功，存储不明封锁后续写；重启把已领取/派发意图/运行中的记录标 UNKNOWN，不自动执行。已知原执行身份可显式记入同一结果并确认；无映射则保持停止。相同幂等交接不再入队，同一项不得再次领取，其他项不能占用原执行/resultId。待执行取消与执行后取消请求分开。

离线验收得到 11 个队列用例通过，加交接校验共 131/131；测试包括保存→中断→恢复→拒绝重领→原结果对账→唯一完成、依赖、失败/取消、写入后丢 ACK、读回不一致、陈旧写和单实例重入。它们证明应用数据行为，不证明真实 AppStorage、跨宿主并发、运行时安装、浏览器动作或队列派发。LEASED 仅单 owner 的逻辑状态，没有原子租约/TTL/fencing；busy 与读前检查不是多宿主锁。真实结果引用的真伪仍由后续原执行权威/适配器核验。

用户要求“提示词触发后续队列”的最终手测目标已保留，但当前聊天只接已安装单任务；不把这两个离线模块冒称队列入口。P0 dev 复测完成后交付可复制的真实单任务提示词、安装审阅/一次预批准、预期动作/单次回传与故障排查。队列的两步集成仍需独立接线与有界验收，不在本轮暗中派发新 AI/仓库任务。最新指定 HR‑6.1 Sol/xhigh 的 dev 复测由既有 native owner 负责，不改全局配置、不编译 production。
