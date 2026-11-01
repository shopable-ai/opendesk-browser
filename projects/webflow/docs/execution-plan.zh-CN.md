# Web Flow / AI Workflow Bridge · 连续任务执行计划

> **固定检索词：`OD-AI-WORKFLOW-BRIDGE`。** 本文件是 Web Flow 的唯一进度与执行入口，后续新对话从本文件恢复，不再按对话创建平行总计划。
>
> **当前项目入口：** [projects/webflow/README.md](../README.md)。2026-11-01 按用户要求将 Web Flow 归为独立业务扩展应用，完整产品合同与本执行记录迁入项目 `docs/`；旧路径仅保留跳转。目录调整记录见第 8 节，原始源码审计及验收边界保留。
>
> **状态：方案与源码核对；产品新增能力 `NOT_TESTED`。** 本轮只维护方案文档，没有执行真实浏览器动作、提交 AI 消息、启动任务队列或安装/发布扩展。
>
> **执行者：** 实施时按仓库现行 `.agents/workflows/extension-creation.md` 和对应 owner Skill 逐任务推进；可用时采用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`。同一文件及公共合同只有一个写入 owner，只读复核可以并行。

**目标：** 用户把研究/开发任务交给 OpenDesk 后，可以依次完成搜索、AI 输入输出、当前或新对话交接、仓库核验及有边界的连续执行；数日后能够找到并恢复准确断点。

**架构：** `projects/webflow/` 拥有新增 Web Flow 业务；OpenDesk Browser 提供通用框架，复用原 AI Send Queue、Task Catalog、Authority、RunHost、Controller、Page Session 和 Durable Result。各网站动作独立准入，外层交接引用持久结果；队列恢复扩展原持久化体系，不新增第二套运行器、权限或任务数据库。

**技术栈：** 现有 WXT/Vite、JavaScript、Chrome MV3、原 Task/Workflow 合同、原持久存储与调度；本轮不新增依赖。

**依据：** [唯一长期产品合同](product-contract.zh-CN.md)，特别是 BR-01–BR-12 和第 8–10 节；根 [AGENTS.md](../../../AGENTS.md) 与[目录归属合同](../../../docs/architecture/extension-project-layout.zh-CN.md)。

## 1. 首次方案核对记录与全局约束

| 项目 | 本轮核对结果 |
| --- | --- |
| 日期 | 2026-11-01，Asia/Shanghai |
| 仓库及默认分支 | `shopable-ai/opendesk-browser` / `main`，由 GitHub 仓库元数据核实 |
| 审计基线 | `151ebed67db293cd7ee4e1c9d2cc423c584fa059`；核心源文件按此 commit 复读 |
| 连接权限 | GitHub 元数据返回 `pull:true`、`push:true`；这证明连接能力，不代表产品中的目标对话已绑定仓库 |
| 本轮文档 owner | 当前方案会话 `/root`；源码审计和可靠性审查只读并行 |
| 首次方案写入范围（历史） | `docs/product/ai-workflow-bridge.zh-CN.md`、`docs/framework/workstreams/web-flow-20261101.md` |
| 原计划状态 | 审计开始时远端 `main` 的本文件路径返回 404；无法据此判断用户旧 Mac 工作区是否已有未提交版本。集成前如目标文件出现，先比较并协调，不覆盖 |
| 本地执行环境 | 没有访问用户 Mac 工作区、已登录 Chrome/Profile、既有 watcher 或原始 artifacts；未建立可运行的本地完整 checkout |
| 浏览器/构建资源 | 本轮不占用端口、Profile、dist、watcher、测试服务器或原生 UI |
| 代码与原生 owner | 尚未在本轮绑定；后续执行者须先登记其准确文件与共享资源范围 |

上述现场属于首次方案提交 `c0d2b4998c1ce8202019ccce3b31603ec1a60f47`；本次目录调整的写入范围见第 8 节，后续以最新实际记录为准。

写入前复核目标文件 blob 与最新 main。主分支已有无关变化时保留并继续；相关文件变化则重新读取合并。提交限定当前登记路径，不包含其他 owner 的源码，不创建分支/worktree/PR，不强推。

### 全局约束

- 原五字段 `opendesk.task.intent.v1` 不变；现有 Workflow v1 单站范围不变。
- Page、Sidebar、Controller 的安装与权限身份分别保留；一个产品入口不合并授权。
- 新增 Web Flow 应用业务、专属测试与文档归 `projects/webflow/`；框架只承接通用能力，目录与包身份不会授予权限。
- 现有 AI Send Queue 的业务目录为 `projects/ai-send-queue/`；不迁回旧目录、不创建同名副本。Sidebar 当前只提供提示，不恢复旧消息列表。
- 方案中的状态/接口是设计责任，不可当作已有公开 API；平台修改必须先证明公共 SDK 缺口。
- 不自动重放 UNKNOWN 的点击、提交或结果发送；取消不能撤销已发生的副作用。
- `SOURCE_IMPLEMENTED`、组件验证、真实 Chrome 验收、业务通过和正式发行分别记账。
- 按实际变化做最小相关验证；纯文档检查不启动产品构建、全仓测试或浏览器。正式发行、多 Profile 与全量压力验证留在原后续阶段。

### 优先复核的五类问题

1. 网站已收到消息但回执丢失：由任务 4/7 验证先对账，不自动补发。
2. 长回复、代码/引用/附件不完整：由任务 3 验证完整性状态与受控原文可读性。
3. 新对话能看见仓库名却没有仓库执行能力：由任务 5 验证真实绑定，不信任文字 ACK。
4. 刷新、Worker 重建或浏览器重启后旧 owner 仍回调：由任务 7 验证代次与持久状态。
5. 有草稿/附件/IME、用户切换对话或取消：由任务 2/4/6 的实际适配行为验证，不覆盖人工输入、不串聊天。

## 2. 已有能力与真实缺口

这里的“源码已见”仅表示读取了对应实现；没有在本轮运行它。

| 用户操作 | 已有实现/历史依据 | 当前缺口与证据等级 |
| --- | --- | --- |
| 同一 ChatGPT 页顺序发送消息 | [队列 README](../../../projects/ai-send-queue/README.zh-CN.md)、`src/page/main.js`、`engine.js`、`site.js`；诊断明确 `memory-only`。README 记录 Page `0.1.13/r13` 的 2026-10-29 两条 FIFO 实测 | 原始证据本机未取得；只有历史文档记录。单页内存队列不是刷新/跨日恢复 |
| A→新对话 B 的固定计算接力 | [计算接力 README](../../../examples/tasks/chatgpt-relay-calculator-r1.README.zh-CN.md) 和同目录 `.js`；Controller + 公开 AppStorage 保存两轮 prompt/answer/result/conversation 及副作用前检查点 | `SOURCE_IMPLEMENTED / CHROME_NOT_TESTED`；固定 active key、未完成记录报 `E_RELAY_RECONCILE`，无续跑或多任务档案。假 Page 测试没有执行真实 DOM；textarea 分支的 value setter / synthetic InputEvent 与现行输入约束需先对齐；New chat 后 document/route 变化未实测 |
| 固定协议触发已安装 Task 并回原聊天 | `src/native-agent/chatgpt-fixed-bridge-host.js`、`chatgpt-bridge-trigger-gate.js`、`chatgpt-bridge-site.js`；已有持久防重放与最终发送前复核 | 当前目标为已打开的 ChatGPT `/c/...` 原会话；新对话、Gemini 及目标仓库绑定没有取得本轮实现证据 |
| 本机可见搜索动作 | [Task README](../../../examples/tasks/README.zh-CN.md)、`visible-search-navigation.js` / `.opendesk-task.json`；有历史手动/自动及原聊天续答记录 | 原始本机证据未在本轮取得；只属于 `workflow.visible-search` 测试网页，不代表百度/Google 真实业务通过 |
| 百度前三条读取 | `examples/tasks/baidu-search-top3.js` 与对应任务包；[旧百度 MVP](../../../docs/framework/workstreams/ai-chat-bridge-r20-baidu-mvp.zh-CN.md) 直接进入 `/s?wd=` 后读取 | 尚需独立证明真实输入、搜索提交、导航和回传；不能用直接导航读取冒充输入点击验收 |
| 完整 AI 输出 | `workspace-chatgpt.js` 已有完成轮次/固定代码块检查；原回传有持久结果 | 尚非通用完整正文/引用/附件导出；Host 通用 JSON 上限 7000 bytes、最终消息 8192 bytes；超限拒绝，不能用 preview 代替原文 |
| 本地 AI 会话/工作流保存 | `src/ui/workflow/workflow-view.js`、`local-codex.js`；草稿 session、冻结定义 local、部分会话状态内存 | 恢复本窗口 planner 不等于恢复网页 AI 多步工作；`src/ui/conversation/session.js` 展示内容也有截短 |
| 持久调度基础 | `src/platform/storage/idb.js`；`src/platform/tasks/schedule-repository.js`、`schedule-service.js`；原 frameworkKV、原子 admission、WAITING_HOST/UNKNOWN 对账 | 可复用底座存在；Web Flow 多步 job、完整交接及运行时检索仍需消费者合同与验证 |
| 多网站动作 | `src/framework/workflow/contract.js` | 现有 v1 单 `siteOrigin`、1–32 步，明确拒绝跨 origin navigate；不能放宽旧合同来接 Gemini |
| 仓库绑定 | 本次 GitHub 读取已核实仓库、分支和基线 | 产品 request 中的 script/hash/installation 身份不是 Git 仓库绑定；需单独证明目标环境可读/可写/可执行 |

公开能力预检入口为 [Page USER_SCRIPT](../../../docs/api/page-userscript.zh-CN.md)、[Sidebar Tool API](../../../docs/api/sidebar-tools.zh-CN.md) 与 [Controller 运行时变量](../../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。计算接力已经使用公开 Controller `AppStorage`，应先核对其配额、授权、任务隔离、生命周期及跨 document 交接；不能把 Sidebar 的配额直接套给它。Sidebar 普通存储和可选 App Service 已有能力边界；App Service 首版后台只开放其存储及只读 capabilities，不能由此假定具备任意网页任务运行权。当前结论是“已发现可复用组件、公共缺口尚需证明”，不是批准修改整个 `src/`。

## 3. 五个可独立验收的交付阶段

保留原 P0–P4 的产品含义。下列是本次执行顺序；原 P4 多 Profile 继续延期，不因本次讨论自动进入实施。

| 执行阶段 | 对应需求/原阶段 | 交付物与退出条件 | 依赖 |
| --- | --- | --- | --- |
| A. 固定入口与契约 | BR-06/08/11/12 设计；不提前声称 P3 | 本合同、本记录、源码 owner、交接/结果/恢复语义和首项操作明确；可以仅靠固定关键词找回 | 仓库事实核对 |
| B. 一次真实搜索到 AI 续答 | BR-01–05，P0 | 百度与 Google 搜索分别完成输入、提交、导航、读取、持久结果、原聊天单次入站及对应 AI 续答。阻塞分别记录 | A；已安装任务/合法网站授权 |
| C. ChatGPT 当前/新对话接力 | BR-06/10/11，P1 | A→B→A 的单次完整交接；B 原文可读、仓库/执行能力实证，下一任务产生可核对结果 | B；完整结果与交接合同 |
| D. Gemini 输入输出与跨站接力 | BR-07/10，P2 | ChatGPT→Gemini→指定目标的两站链；每站独立授权，正确回复完整落盘，无串线 | C；Gemini 单站适配 |
| E. 持久队列与跨日恢复 | BR-08/12，P3 | 三步有依赖任务，受控中断后保留结果，重新核验环境，继续首项未完成步骤；按关键词找回。实际跨日证据单列 | C；含 Gemini 的用例再依赖 D |

持久 ID、完整结果和检查点的数据约束在 A 阶段先确定，避免后续重写；P3 完整调度与重启验证在 E 阶段实现。单次功能修复遵守“当前操作→具体失败→最小修复→对应验证”，不反复重写路线。

网站阻塞按依赖处理：百度或 Google 某一站因实际访问条件受阻时，保留该站 `BLOCKED`，不得宣称两站全过；已取得合法输入且没有这项依赖的完整回复/交接任务可以继续，不把单站阻塞扩大成全线停工。

## 4. 关键执行任务

任务编号 `AWB-*` 仅用于工程追踪，不是已安装 Task ID，也不能送入五字段任务协议。

### AWB-01 · 复用入口与执行合同

**涉及文件：** 本文件、产品合同、项目 README/AGENTS；只读 `projects/ai-send-queue/README.zh-CN.md`、公开 Page/Sidebar API、当前执行/存储模块。**依赖：** 无。

**接口责任：** 固定完整输出、交接、仓库证据和队列记录的字段语义；源码 API 名称由消费者与 owner 在同一合同内确定，不从文档凭空调用。

- [x] 核实默认分支、源码基线、当前队列 owner 与基本限制。
- [x] 对齐新增 BR-10–12，保留原 BR-01–09/P0–P4。
- [x] 固定本记录、检索词、下一步与阶段证据等级。
- [ ] 实施前通过公开 SDK 做最小能力探测：Controller AppStorage、Page 到可信持久状态、完整产物读写、已安装 Task 准入、目标对话创建/核验。失败须保留真实接口与返回，先标 `SDK_GAP_NOT_PROVEN`；证明通用缺口后再交平台 owner。
- [ ] 核实旧 Mac 工作区是否有未提交同名计划及其他 owner 正在编辑的相关文件；只处理实际重叠项。

**通过条件：** 下一执行者能定位唯一 owner 和当前未完成操作，知道已有能力与缺口。**证据：** commit/blob、读取结果、公开接口实际探测回执。**停止条件：** 有冲突的公共契约或无法核实的写入 owner，仅暂停受影响部分。

### AWB-02 · 百度与 Google 的真实动作闭环

**涉及文件：** 原 `examples/tasks/baidu-search-top3.js` 及同名任务包；`examples/tasks/README.zh-CN.md`；原 Bridge 文件仅在真实失败指向它时修改。Google 任务先发现现有 owner；若没有可复用任务，Web Flow 专属 Controller 源码与业务测试归 `projects/webflow/`，按项目 README 的 `src/tasks/` 归属约定建立，沿用原 Controller 候选/安装合同并单独审阅身份与网站。现有示例留原 owner，不把新增 Web Flow 业务写回 `examples/tasks/`。**依赖：** AWB-01。

**接口责任：** 继续消费固定五字段和现有 task schema；输出原 Durable Result 与输入/提交/导航/结果可核对证据，不扩大宿主特例。

- [ ] 在现有本机开发环境先跑最短百度真实输入→提交→原聊天链；失败在哪一步才修哪里。Google 单独记录。
- [ ] 源码缺口确认为“只导航读取”时，在原任务 owner 补真实输入和提交；固定新源码/版本，按原候选与安装流程处理，不篡改已冻结安装。
- [ ] 核对预批准后无额外“采用/执行”点击；“查看执行页面”只是观察。
- [ ] 保存关键词、前后 URL、动作顺序、同轮截图/页面证据、run/result、原聊天用户消息和对应 AI 回复。

**通过条件：** 两站分别有真实业务证据；验证码/网络受限如实阻塞，不靠后台 HTTP 替代所需网页动作。**停止条件：** UNKNOWN、登录/验证码、权限或安装身份不匹配。原 `workflow.visible-search` Demo 只复用作机制证据。

### AWB-03 · 完整 AI 回复持久化

**涉及文件：** 先复用 `projects/ai-send-queue/src/page/site.js` 和 `src/native-agent/workspace-chatgpt.js` 的对应轮次判断；完整产物通过既有 Durable Result/存储 owner；`chatgpt-fixed-bridge-host.js` 的小消息合同保持显式边界。**依赖：** AWB-01；可与 AWB-02 的独立任务文件并行。

**接口责任：** 产出 `artifactRef`、来源/轮次、byteLength、hash、completeness、citationRefs、attachmentRefs；摘要独立。字段为设计合同，实际实现前在唯一 owner 内定稿。

- [ ] 选择一条含长正文、代码、引用的自有测试回复，建立“对应轮次+站点终态+稳定内容”的完成判断；无法读取附件明确 PARTIAL。
- [ ] 完整原文持久化并读回核验，界面摘要不影响原文；超过 7000/8192 bytes 时使用受控原文引用或已批准分段能力，不截断成成功。
- [ ] 目标环境实际读取原文并核对 hash；没有可读通道则保持阻塞，不能只交本机路径。
- [ ] 定向验证中断流、超限与旧轮次，复用现有行为测试而非复制版本号测试。

**通过条件：** 完整性可核查，超限仍保留原文；传输/存储缺能力时留下具体缺口。**停止条件：** 捕获未完成、来源不明、内容变更或存储回执未知。

### AWB-04 · 当前对话/指定对话结果交付

**涉及文件：** `src/native-agent/chatgpt-bridge-site.js`、`chatgpt-fixed-bridge-host.js`、`chatgpt-bridge-trigger-gate.js` 的既有交付职责；队列侧复用 `src/page/engine.js`，不并建发送引擎。**依赖：** AWB-03；原聊天验证复用 AWB-02。

**接口责任：** 输入已持久化 artifact 与明确 destination；输出绑定目标 conversation/message 的交付回执，状态与来源任务完成分离。

- [ ] 发送前持久化意图、目标、内容 hash 和发送前会话位置。
- [ ] 重新核验草稿、附件、IME、原页面身份与取消状态，然后只提交一次。
- [ ] 核对新增用户消息，再观察对应 AI 回复；发送未知先只读对账，不用相同提示词 hash 冒充唯一回执。
- [ ] 向错目标/切换后的 document 发送、已有草稿、消息已入站但回执丢失三种直接风险分别验证。

**通过条件：** 结果准确进入指定当前/已有对话且有证据；未知状态不会自动重复。**停止条件：** 身份歧义、草稿冲突、UNKNOWN 或撤权。

### AWB-05 · 新对话交接与 GitHub 环境核验

**涉及文件：** 先核对 `examples/tasks/chatgpt-relay-calculator-r1.js`、同名 README 与 `tests/environment/chatgpt-relay-calculator-r1.test.mjs`；再核对原 Bridge 与当前 `src/ui/workflow/local-codex.js` 的真实消费边界。独立版本化 handoff 合同由同一 owner 协调。不得把 planner 内存恢复冒充新的后台执行环境。**依赖：** AWB-03/04。

**接口责任：** `opendesk.workflow.handoff.v1` 提供目标/证据/下一步与 repo checkpoint；目标接收回执必须链接实际资料读取、目标消息和可信仓库核验。

- [ ] 先对齐计算接力样例与当前原生输入合同，核实 New chat 的 document/route 转换；该样例内生成的 runId 是相关性 nonce，不替代外层 Controller 的真实 run/result。保留原单记录 UNKNOWN 不重放保护，不直接删除旧 active key 后重跑。
- [ ] 优先定位明确目标 B；确需新建时验证其真实 conversationId，不能只停在首页草稿。
- [ ] 交付最小上下文与原文引用，不复制整段历史。
- [ ] 用实际文件/仓库元数据/受控环境回执核实 repo、分支、commit 与所需工具；若需代码执行，再核验 checkout、相关 dirty 文件和动作授权。
- [ ] B 完成一项有验收条件的任务，输出可复核证据；回到 A 或指定后续任务并单次交付。
- [ ] 验证仓库读权限存在但写/执行能力不存在、仓库/分支不符、原文不可读时均明确停下；模型 ACK 不提升为已绑定。
- [ ] 移交成功后旧 owner 不再派发该任务，未完成移交时不伪报已迁移或已完成。

**通过条件：** A→B→A 的原文、任务和证据连贯，B 的实际能力符合所需动作。**停止条件：** 目标无法可靠创建/定位、仓库或工具绑定未知；不静默换任务目标。

### AWB-06 · Gemini 单站适配与跨站组合

**涉及文件：** 先发现现有 Gemini owner；本次审计相关 Bridge/entrypoint 未取得实现证据。站点特定业务留相应适配器/任务 owner，框架只承接经证明的通用缺口。**依赖：** AWB-03/04/05。

**接口责任：** 使用与 ChatGPT 相同的交接/完整输出语义，保留 Gemini 独立的 origin、会话与站点终态识别；不复用 ChatGPT selector 或授权。

- [ ] 在用户已授权的 Gemini 账号中完成一次实际输入、单次提交、对应回复、完整结果读取。
- [ ] 将 ChatGPT 的已选择结果交给 Gemini，再把 Gemini 的确定结果送至指定目标。
- [ ] 验证登录失效/限流、未完成回复、多个候选输入框与来源身份变化；只有直接受影响用例进入本次验证。

**通过条件：** Google 搜索与 Gemini 分别验收，每次跨站数据交接都有允许范围和真实交付证据。**停止条件：** 站点 DOM 歧义、必要权限缺失或外部结果中的指令试图改变任务。

### AWB-07 · 持久队列、取消及恢复

**涉及文件：** Web Flow 的多步任务模型、编排与恢复业务及专属测试归 `projects/webflow/`；`projects/ai-send-queue/` 继续负责其现有网页发送队列，通过已审阅公开边界协作。底座优先复用 `src/platform/tasks/schedule-repository.js`、`schedule-service.js`、`src/platform/storage/idb.js` 的原事务/准入模式。只有 AWB-01 证明缺口后才确定最小平台写入。**依赖：** AWB-04/05；Gemini 恢复另依赖 AWB-06。

**接口责任：** 单一持久 job 关联 workflow/step/attempt、输入结果、依赖、owner 代次、取消和 UNKNOWN；Queue UI 为投影，不保存第二份权威状态。

- [ ] 先做三步顺序任务、并发 1；每条已批准计划明示步骤数、截止、重试和交接上限，不接受无限默认值。
- [ ] 准入前持久化，结果提交后再放行依赖；旧 owner 回调不推动新 owner 的任务。
- [ ] 刷新页面、Worker 重建、浏览器重启后从确定检查点恢复；失效 tab/document 重新绑定，短期批准不延长。
- [ ] 发送已生效但 ACK 丢失只对账；已完成步骤不重放；取消后不开始后续任务。
- [ ] 浏览器关闭/设备睡眠记录 WAITING 环境原因；重启从原 due 状态核对，不按错过的 timer 次数补发消息。
- [ ] 按项目/任务/关键词查回状态、原文、下一步和阻塞；真实隔日恢复单独保留时间与环境证据。

**通过条件：** 不依赖旧聊天内容或常驻 Worker，即可准确续接一条已批准主线。**停止条件：** 持久回执未知、缺少授权、结果歧义、过期/预算用尽。不能声称用户电脑离线仍在操作网页。

### AWB-08 · 同一候选的整链复核与交接

**涉及文件：** 本记录、原 Task README 与各 owner 当前说明；代码只按实际缺陷回到原任务修复。**依赖：** 本轮选定核心阶段通过，不要求自动完成全部 P0–P4。

- [ ] 读取实际扩展加载目录、ID、serve/静态模式与对应源码/安装版本；只读证据核查，不默认重装或重建。
- [ ] 用一条固定目标验证本轮已选链路，记录各步骤与真实效果，不能拼接不同候选的局部成功。
- [ ] 更新本文件当前阶段、已通过范围、未测项、owner、下一条未完成操作和原始证据引用。
- [ ] 收尾当前 owner 的锁与资源，保留用户草稿和其他会话资源；源码通过、原生通过、正式发行分别报告。

**通过条件：** 新执行者只读本记录即可接续，不需要重新讲需求。**停止条件：** 相关源码/安装来源漂移、目标 owner 未确认或原始证据无法核实。

## 5. 证据记录与最小验证入口

每项证据至少记录：task/step、实际操作、预期/实际效果、代码 commit 与受影响文件 hash、安装 ID/版本/sourceHash、环境与日期、candidate/request/run/result（适用时）、源/目标 conversation 与实际 message 回执、正文 artifact/hash/completeness、前后 URL、结果/交付/AI 续答各自状态、资源释放、阻塞和下一步。

证据表中的值来自真实工具或界面观察；没有的字段写 `NOT_TESTED/UNKNOWN/不适用`，不得为了填满表生成 UUID、runId 或截图名称。正文与引用受控保存，默认不提交公开仓库。

| 待验证行为 | 原有最小入口（存在不代表本轮运行） |
| --- | --- |
| FIFO 和对应回复栅栏 | `node --test projects/ai-send-queue/tests/engine.test.mjs` |
| 输入恢复、草稿和用户入口 | `node --test projects/ai-send-queue/tests/main-recovery.test.mjs` |
| 唯一编辑器、一次点击、消息回读 | `node --test tests/environment/chatgpt-bridge-site-r13.test.mjs` |
| 持久一次性记录、撤权、document 身份 | `node --test tests/environment/chatgpt-fixed-bridge-r12.test.mjs` |
| 已安装 Task、参数及结果上限 | `node --test tests/environment/chatgpt-installed-task-host.test.mjs` |
| 固定 A→B 计算接力状态逻辑 | `node --test tests/environment/chatgpt-relay-calculator-r1.test.mjs`；fake Page 不执行真实 DOM callback，不能证明原生输入或跨 document 通过 |
| 调度持久状态 | `tests/environment/scheduled-tasks-r1.test.mjs`；执行前先读用例及依赖，只选择直接相关部分 |

新增行为测试应进入对应 owner，名称按行为命名，不按每轮日期复制。每次执行前说明该验证对应哪个实际变化或失败。以上命令不要求本轮全部运行，不替代真实网页验收，不触发全仓 CI、production、评分或长时间压力测试。

## 6. 当前断点与下次续接提示

**已完成的方案工作：** 独立应用目录与文档归属整理，以及仓库和连接能力核对、唯一队列 owner 发现、现有实现边界记录、架构建议、五阶段与八项执行任务、固定恢复入口。产品源码未修改，新增链路未在本轮实测。

**下一条用户操作：** 在用户现有 OpenDesk 开发环境中，使用已批准的百度任务从真实搜索页输入关键词并提交，检查结果是否准确回原 ChatGPT 对话且得到对应 AI 续答。先核对已有候选和原始证据；若没有运行环境，先完成 AWB-01 的公共接口/owner 核对，再针对 AWB-02 已证实的源码缺口实施，保持 `CHROME_NATIVE_VERIFIED: NOT_TESTED`。

**在进入跨对话前并行完成的技术项：** AWB-03 完整回复/产物合同与 AWB-05 仓库绑定合同。不可因为先做 P0 而丢失后续连续任务目标，也不可为写更多框架文档推迟已能执行的最短核心操作。

**仍待真实证明：** 当前安装候选真实搜索、ChatGPT 新对话交接、目标仓库执行、Gemini 输入输出、跨日恢复。历史 README 中已有成功只对其原候选与实际范围成立。

可复制的续接内容（普通说明，不是可执行 `opendesk-task` 命令）：

> 继续 shopable-ai/opendesk-browser 的 OD-AI-WORKFLOW-BRIDGE。先读取根 AGENTS.md、projects/webflow/AGENTS.md、projects/webflow/README.md、projects/webflow/docs/product-contract.zh-CN.md 和 projects/webflow/docs/execution-plan.zh-CN.md，再核对当前 main、相关改动、owner、授权及真实环境。先报告当前阶段、首项未完成操作和证据缺口，再执行依赖满足的最小任务。复用 projects/ai-send-queue 和原 Authority/RunHost/Durable Result；保持五字段协议、单站任务和 UNKNOWN 不重放。只有真实结果才能更新完成状态；无本机 Chrome 则保留 NOT_TESTED，不伪造浏览器行为。每次结束更新同一记录的断点，不另建总 GOAL，不自动进入已延期的发布或多 Profile 阶段。

## 7. 首次方案交付核对（历史）

- [x] 读取根规则及相关目录归属，核实文档父目录未出现额外 AGENTS。
- [x] 源码审计与可靠性审查独立进行，相关结论纳入两份文档。
- [x] 文档新增相对链接逐一对应已读取文件或本次新文档；BR-01–12、AWB-01–08、章节与冲突标记检查通过。仅文档验证，未运行产品测试。
- [x] 构建者只读审查完成：无影响实施计划的重要未决问题；公开能力和环境未知分别归入前置任务。
- [x] 提交前最新 main 仍为上述基线，产品合同 blob 未变，执行记录目标仍未存在；保留并行成果，只写本轮两条路径。

首次方案已以 `c0d2b4998c1ce8202019ccce3b31603ec1a60f47` 提交并读回核对，仅包含当时的两份文档。该证据不代表产品运行通过。

## 8. Web Flow 独立应用归档（2026-11-01）

**用户决定：** 创建 Web Flow 独立扩展应用目录，相关文档放在同一项目，为后续核心业务代码确定归属。

**本次变更：**

- 项目根为 `projects/webflow/`，增加 README 与仅针对本项目差异的 AGENTS。
- 完整产品合同迁为 `docs/product-contract.zh-CN.md`，本计划迁为 `docs/execution-plan.zh-CN.md`；各自只有一份正文，保留 BR-01–12、AWB-01–08、原始证据等级和待办。
- 原 `docs/product/ai-workflow-bridge.zh-CN.md`、`docs/framework/workstreams/web-flow-20261101.md` 改为短迁移入口；修复迁入文档的相对链接、当前续接提示及已发现的外部入链。
- 未来 Web Flow 新增业务代码与测试留本项目；现有 AI Send Queue、计算接力及框架模块保持原 owner，复用按公开合同接入，源码迁移须另核对真实消费者。
- 本次不创建空源码/测试目录或假安装配置。实际实现到达对应模块时再加入文件；当前状态为文档与项目归属已建立，尚无 Web Flow 可安装包。

**写入 owner 与范围：** 当前目录整理会话 `/root`；独立审查只读。仅写 `projects/webflow/README.md`、`projects/webflow/AGENTS.md`、本项目上述两份 docs，以及两个旧迁移入口和 `docs/product/conversation-first-browser-task-contract.zh-CN.md` 的入口链接。无浏览器、端口、watcher 或构建资源占用。

**验证与下一步：** 核对迁移前后稳定需求/任务编号、保留内容、新旧入口及相对链接；提交前复读 main 和目标文件，远端读回核对准确内容。这里只验证文档结构；产品测试与真实网页运行仍为 `NOT_TESTED`。下一步继续第 6 节首项未完成任务，应用新增实现落本项目，不再另建 Web Flow 总方案目录。

> **主分支合并说明（2026-11-01）：** 以下保留并行开发的 P0 技术细节与离线模块证据；项目统一为 `projects/webflow/`。当前断点仍从第 6 节进入，离线模块不代表真实队列或跨对话派发已接通。

## 9. 当前 P0 技术方案与执行计划（2026-11-01）

本节细化 BR-01 至 BR-05，不新增、替换或废止需求 ID，不恢复自然语言选脚本/生成脚本，也不提前进入 P1–P4。目标是让用户在原聊天中给出固定命令，已安装任务在明确预批准范围内自动完成公开搜索，再将同一次真实结果送回原聊天。执行记录继续使用本地 `docs/framework/workstreams/web-flow-20261101.md`，不另建产品目标或第二套任务系统；该记录当前未被 Git 跟踪，不假定远端已有，后续发布文档时需单独确认可交付的证据摘要。

### 9.1 当前事实与下一条操作

| 范围 | 已有证据与实现 | 尚缺的证明 |
| --- | --- | --- |
| 固定协议、发现与准入 | 五字段解析、完整回复发现、安装身份核验、一次预批准及持久防重放已有源码和定向组件证据。本轮修复了空壳/分批历史基线、同路由编辑器重挂载、无关 Task 安装变更误拒回传 | 这些时序修复的真实 Chrome 专项仍未全部验证；不因组件通过推定通过 |
| 本机网页演示 | 旧 QA `01a19702-a707-79d1-a8e5-ca3b1d4a09ba` 已记录 `workflow.visible-search@1.0.1` 的手动轮和一次预批准自动轮，包含填写、搜索、详情导航、持久结果及原聊天单次回传 | 仅证明 `http://127.0.0.1:43111` 演示；不代表百度、Google 或 production |
| 百度业务任务 | 原任务只有结果读取；当前 P0 owner 已补真实搜索动作，并报告百度/Google 的实际输入、点击、导航与读取链已跑通 | 新固定候选的安装、预批准自动触发和原聊天单次回传仍待同轮证据；本文档任务没有重演 |
| Google 业务任务 | 已有 `examples/tasks/google-search-top3.js`、`google.search.top3.v1.opendesk-task.json` 及定向测试；P0 owner 报告真实动作通过且固定任务已验证安装 | 预批准自动执行与原聊天回传正在验证，不能用单独动作链代替完整 Bridge 闭环 |

以上为方案落地时的快照；以工作记录后续同候选证据更新阶段事实。唯一 P0 真实业务实现 owner 为本机 Codex 对话 `01a19720-f02d-7490-a696-8ad4f8a54221`（“Web Flow · 百度与 Google 自动执行及动作轨迹”），使用用户指定的 `openai/gpt-6.1-sol` / `xhigh`。该任务当前实际权限是 managed / workspace-write / on-request，不能从全局配置推定继承完全访问。本轮文档工作不并发修改其产品源码、任务包、浏览器或 watcher。

**下一条用户操作：** 在既有 ChatGPT 对话与已连接的持续开发环境中，选择经验证安装的搜索任务、核对目标和参数、预批准一次，再发送固定命令。当前下一步是固定安装后的预批准自动执行与原聊天回传同轮验证；并非缺少另一套桥接平台。开发继续复用 `dist/development` 和现有单一 watcher；站点任务先使用公开 Controller / Locator，当前 Profile 不允许 `page.evaluate` 时不得打开安全开关来迁就实现。

### 9.2 单一技术链与文件职责

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
| 站点业务 | `examples/tasks/` 中既有 Controller 项目、对应 `.opendesk-task.json`，使用[公开 Controller API](../../../docs/api/controller.zh-CN.md) | 百度/Google 各自单 Origin 任务；搜索选择器、填入/点击/提取与轨迹归任务，不写入通用 Host 的站点分支 |
| 结果与证据 | 原 RunHost / Durable Result、原聊天回传；本地 `artifacts/web-flow-20261101/` | 不建第二数据库。记录同一安装、candidate/request/run/result 及截图/动作证据；本地忽略产物不等于远端交付 |

**为何还会看到点击：** 首次安装/升级的权限审阅、缺少真实网站权限，以及没有匹配执行许可时，仍需要准确的用户操作。当前“预批准一次 · 5 分钟”只允许下一条完全匹配的命令运行一次，不是所有搜索的永久许可。匹配后应自动发现、准备并执行，不再点“采用/执行”。“查看执行页面”只是观察已存在的目标，不是启动动作；验收应证明即使不点它任务仍已开始，不能用该按钮补开网页或补执行。许可已用、过期、参数/目标/安装变化时停止并明确说明原因，不静默扩大范围。长期多次免点击计划属于后续独立设计和明确授权，不冒称本轮已实现。

### 9.3 搜索任务与动作轨迹

百度和 Google 都从其经批准的公开搜索入口开始，使用中性查询 `OpenDesk Browser` 或 `browser automation documentation`，不得包含账号、订单或其他个人资料。Task ID、固定版本、目标 URL 和参数必须取自实际安装及 Schema；新任务的最终身份以实现 owner 核验后的清单为准，不用尚未安装的示意 ID 发命令。提示词只要求 AI 输出一个 `opendesk-task` 代码块、一个完整 JSON、恰好第 4 节五字段；每轮使用新 `candidateId`，不带源码或授权字段。

任务核心步骤为：读取入口 URL 和唯一可操作控件 → 记录输入前值 → `fill` 中性查询 → `inputValue` 回读确认 → 点击当前真实提交控件 → 等待结果文档/URL 并核对查询 → 读取有限自然结果。百度若发生局部更新，应如实记录 URL/文档是否变化，不能将局部更新冒称新文档。需要额外验证受控文档导航时，只在同一批准 Origin 内导航至实际结果页；不打开会跨站的结果链接，不为凑步骤合成导航。

`actionTrace` 是任务返回值里的有界业务数据，**不增加五字段命令**。每步记录递增序号、实际动作、起止时间、目标 Locator 或 URL、必要的前后读回值及 `confirmed` / `failed` / `unknown`。点击调用成功只证明动作调用返回，必须另有结果页/查询/结果样本确认；预先列出的计划步骤不得标记为已执行。轨迹控制在原聊天完整回传 8 KiB 限制内，超限保留持久结果并明确交付失败，不截断冒充成功。

原生验收另外保留输入前后可见截图、点击目标、导航前后 URL/文档事实、结果样本和时间顺序操作记录，与同一持久结果关联。任务自述、截图、终态文字、HTTP 响应中任一项单独都不足以证明全链。实际站点不能证明恰好一次提交时只陈述已观察事实；不把本机 fixture 的 `submissions=1` 证据套给真实站点。

### 9.4 单一执行清单

本轮按五阶段推进：现状/缺口映射 → 预批准后自动执行 → 百度/Google 真实业务闭环 → 相关异常与重复保护 → 集成验收与使用说明。每项的文件、依赖、操作级验收、证据和停止条件只在本地 `docs/framework/workstreams/web-flow-20261101.md` 的“本轮五阶段执行清单”维护，本文保留技术合同，不复制第二份任务状态。

无新代码或失败时复用有效证据；任务源码变化后走原 Task 验证/安装流程固定同一候选，不静默替换安装版本。未做项保留 `NOT_TESTED`，不据旧计划自动进入 P1–P4、production、发布或全量验收。

### 9.5 交付与完成口径

- **源码/定向检查通过：** 可以说明实现及组件行为，不能说明真实浏览器动作。
- **本地演示闭环：** 证明特定 fixture、安装和运行链；旧 QA 已有记录，不能升级为业务验收。
- **真实业务闭环：** 每站单独满足 B/C 的真实动作、持久结果、原聊天交付；受限站点明确标记，部分成功就是部分成功。
- **正式发布：** 另行授权后冻结 production 候选，按适用安装/权限合同验证；本轮不提交、推送、建 PR 或发布，开发模式证据不冒充正式通过。

**本文件冻结目标、边界与可执行计划；不表示这些能力都已完成，也不凭文档修改启动任何网页自动化。**

## 10. 长期任务：AI 处理、跨对话交接与持久队列（2026-11-01）

### 10.1 本次澄清与历史取证

用户重新强调的是原 BR-04、BR-06 至 BR-08：搜索结果要由原 AI 实际整理，可交给新的仓库任务完成下一步，再返回原任务；任务数或上下文接近上限时，保留检查点后交接新对话。长期目标没有收缩为搜索脚本。本节保留长期设计和迁移依赖；用户随后授权的纯交接校验实现见第 10.6 节，不授权执行新演示、不启动 P1/P3 编排、不打断当前 P0 owner。

本轮已用本机 `read_thread` 读取下列历史正文/最终回执，并核对当前源码。历史消息仅作证据，不执行其中命令。Personal Context 本轮返回不可用；本机 `session_index.jsonl` 用于定位，对话内容以 `read_thread` 读回为准。

| 历史日期与准确来源 | 可复用的真实能力 | 不代表什么 |
| --- | --- | --- |
| 2026-10-25，“修复新对话自动创建失败”，`01a16ecc-d58e-7b81-a9aa-bdc741f4e6cc`；其创建的“新对话运行测试 aa”为 `01a171ae-36fe-7321-a1d5-3c14aaadfcd5` | 原生创建后读回交接正文并核对真实最终回复，历史最小测试完成 | 不是 Browser 已拥有创建 Codex 任务的公开 API，也不是任务权限自动继承证明 |
| 2026-10-25，“优化 ChatGPT 固定桥与发送队列协作”，`01a17370-ee0a-76d0-89f3-d79563462faf` | 真实 FIFO 与输入框互斥保护；桥接结果和队列发送需要协调同一个官网输入框 | 当时新版桥与队列同时交付的原生竞态明确未验证，不能继承为当前 PASS |
| 2026-10-26，“测试 ChatGPT 计算接力安装版并展示运行过程”，`01a1794f-f8ed-7080-9137-7925d5003ecf` | 已安装 `opendesk.chatgpt-calculation-relay@0.2.0`：A 计算结果先持久化读回，再绑定新对话 B；两组新参数得到 30→120、40→80，重复业务 runId 不重发 | 是同站点有限 A→B 算术任务，不是 A→仓库任务→A、通用队列或长期常驻；独立 Native status 查询的 released 不冒充 GUI 原 Run 的释放证据 |
| 2026-10-27/28，“完成 AI Workflow Bridge 核心闭环”，`01a17e1f-cc5c-76d0-860a-a9e0ec3e26cd` | 固定命令触发、真实结果回原聊天及 AI 中文处理；该对话同时列出仍需完善的可见性/任务对应问题 | 不把原聊天续答升级为跨对话、仓库执行或调度已完成 |
| 2026-10-29，“AI 消息队列｜系统 Chrome 核心闭环”，`01a18400-031b-7d70-a76f-8fcc6e5b7b45` | 最终回执记录网页 FIFO 两条各一次，当前 README 记 A→回复→B→回复；侧栏按最新要求仅使用提示 | `src/page/engine.js` 是单文档内存队列，页面关闭/刷新恢复未实现；不是持久业务工作队列，公开发行仍 blocked |

计算接力的当前 [README](../../../examples/programs/chatgpt-calculation-relay/README.zh-CN.md)、[输入输出合同](../../../examples/programs/chatgpt-calculation-relay/CONTRACT.zh-CN.md) 和 [EVIDENCE.json](../../../examples/programs/chatgpt-calculation-relay/EVIDENCE.json) 与历史相互印证。本轮只读核对其构建索引中七个源码/配置文件，SHA 均与记录一致；这证明当前文件仍对应历史来源，**不证明今天 Chrome 的安装/登录仍相同**。发送队列以[当前 README](../../../projects/ai-send-queue/README.zh-CN.md)和现有 `src/page/engine.js` 为准，不恢复已被取代的侧栏同步目标。

其他现有基础也须按实际边界复用：

- `examples/programs/chatgpt-calculation-relay/src/{site,conversation,relay}.js`：官网适配、草稿保护、写前发送/导航日志、持久化读回、`status/inspect/reconcile`。重启后读取日志不等于恢复旧 Worker；未知发送不自动重放。其业务来源仍在独立项目，不把计算业务搬进 Host。
- `src/platform/tasks/schedule-{contract,repository,service}.js`、`src/ui/scheduled-task-host.js`：已有 `frameworkKV` 中计划/Fire、安装固定、原子准入、原 Run/Result 关联与等待合法可见 Host；这是已存在源码，不是 Web Flow 队列接线证明。真实调度证据继续按[原设计/实施记录](../../../docs/architecture/browser-framework/scheduled-tasks-r1-design.zh-CN.md)分层，旧宽度/缩放待办不恢复。
- `src/ui/workflow/agent-loop.js`：现有有界延续保护，最多 8 轮、24 动作、8 分钟；不是长期调度器。`task-review-handoff.js` 只是工作流到任务目录的短期展示交接，不是 AI 跨对话交接或运行授权。
- `src/cloud-control/host-owner-lease.js`：已有代次、fencing 和 TTL 的租约基础代码，但文件明确 `NOT wired to a message route or dispatch`。可审计复用其模式，不能写成当前 Web Flow 已有可用租约服务，更不能直接复用它的云控 owner key。

### 10.2 执行环境与适配器边界

| 参与方 | 已有能力 | 后续适配责任与缺口 |
| --- | --- | --- |
| 普通 ChatGPT 网页 A/B | 官网对话、现有 DOM/Controller 适配、结果消息和有限计算接力 | 观察、受控发送一次、完成读取、精确对话绑定与对账。聊天中的仓库链接不授予 GitHub、shell、本地文件或 Codex 工具权限 |
| 绑定仓库的 Codex 任务 B | 本次已有本机原生创建/读回任务的证据，执行环境与仓库工作目录独立 | 通过获准的原生入口创建/定位项目任务、读回实际 repo/ref/模型/权限、读取产物与验证结果。Browser/Worker 当前没有通用的 `tasks.run` 或任意 Codex 创建接口，不可伪造公开 SDK |
| Google AI | 用户尚未指明具体产品/入口 | 设计只保留适配位置；不能把 Google 搜索、现有模型 Provider 或某个假定产品当作 Google AI 网页已接入，状态为 `NOT_IMPLEMENTED / NOT_TESTED` |

适配器是职责抽象，不是本轮新公开 API：应声明可观察、发送、读取完成、新建对话/任务、只读对账等实际能力及其身份/权限前提。不支持的能力明确拒绝。ChatGPT 站点业务继续留独立 Controller 项目，可信编排仅协调已审核接口，全部浏览器动作仍走原 Authority/RunHost/Controller；Codex 仓库任务按它自己的执行权威与权限运行，不由网页文本获得权限。

当前原生 `create_thread` 的参数没有业务幂等键或任务权限覆盖参数，本地项目创建也不能靠交接正文就强制固定 Git ref。创建后必须读回实际线程及执行上下文，核对 repo/main/base commit、模型与权限；无法确认则保持待处理。创建回执丢失且无可靠线程身份时，不能换请求盲建第二个任务，也不读写应用数据库补造映射。

### 10.3 P1 独立、固定版本的交接合同（拟建）

独立 `opendesk.workflow.handoff.v1` 合同已在 `projects/webflow/src/handoff-contract.js` 实现首个纯 Handoff 校验单元；**Receipt、适配器派发和完整 P1 闭环尚未实现**。它不追加到五字段 `opendesk.task.intent.v1`，不借模型生成字段扩大权限。当前纯 Handoff 的封闭 Schema 已固定；后续行为接线前仍需冻结适配能力。模型可提出候选，可信协调层解析真实身份、授权引用和派发账本。

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

### 10.4 P3 持久队列与恢复方案（完整接线待建）

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

### 10.5 分阶段完成条件与最小纵向演示

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

### 10.6 核心模块、接口与第一项隔离实施单元

**无需新建另一个 Chrome 扩展。** OpenDesk 是框架，WebFlow 是独立应用业务；新增应用 owner 为 `projects/webflow/`，原 Bridge 在 P0 owner 手中保持不动，百度/Google 留各自安装 Task。在应用内补三块能力：版本化交接与受控适配、持久编排元数据、证据/幂等与恢复。下表交接校验和单 owner 队列离线数据单元已实现，其余真实接线仍为拟建路径，均不是新公开 SDK；真实发送/创建/仓库执行接线仍须各自合法执行入口，不能从浏览器直接调用仅在 Codex 会话中出现的工具。

| 拟建模块 / 既有复用 | 输入与输出职责 | 依赖与范围 |
| --- | --- | --- |
| `projects/webflow/src/handoff-contract.js`（已实现第一单元） | 纯 JSON Handoff 校验、规范化、幂等键生成；Receipt 延后，不创建任务、不发送、不读写存储 | 独立于 ChatGPT P0 文件，不改五字段 parser；定向测试 `projects/webflow/tests/handoff-contract.test.mjs` |
| `projects/webflow/src/adapters/session.js`（后续） | 原对话身份、完整结果与一次交付回执；仅协调既有独立 Controller 站点适配 | 复用计算接力的 `site/conversation` 行为与原 Bridge 草稿/输入框保护，来源复用先审计。Google AI 只声明 unsupported |
| `projects/webflow/src/adapters/repository-task.js`（后续） | 获准的仓库任务请求 → 实际 thread/environment/产物/检查回执 | 当前 Browser Native 尚未证明提供 Codex 任务创建能力，先明确拒绝派发；需要验证已有原生集成能力或另行批准最小接口，不能凭空加任意 shell/MCP 通道 |
| `projects/webflow/src/queue/state.js`、`queue/repository.js`（离线单元已实现） | 有界事件日志、单 owner 状态恢复、派发意图/原执行/结果引用，保存后读回；不执行真实任务 | 只注入公开 AppStorage getItem/setItem 边界，离线 Map 测试；真实 AppStorage、CAS/跨宿主租约、UI/派发未接，不访问私有 IDB |
| `projects/webflow/src/continuation.js`（后续） | 可见协调者读取可准入步骤、重核许可、调用适配器、展示等待/暂停/接管 | 复用原 Host/Authority/RunHost；前一步资源结算后再准入下一步，不建后台常驻 Runner |

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

最小实施与验收：先写有效交接、额外授权字段、Google/错误目标、过期、幂等键篡改、跨仓库/跨原聊天交接、缺摘要/停止条件、路径穿越和超过大小上限的定向回归，再实现上述纯函数。Receipt 的未知退出码误报 completed 等回归留在其后续单元。运行 `node --test projects/webflow/tests/handoff-contract.test.mjs` 与该文件语法检查；不加载浏览器、不调用 Native、不执行命令字符串、不申请队列租约。第一单元交付的是可校验的数据合同，**不是 P1 外部闭环已完成**。

该纯合同单元已确认无既有应用/同职责路径，单独落在 WebFlow 应用并完成 120/120 定向测试与语法检查；不覆盖 P0 owner 的代码或资源。P0 owner `01a19720-f02d-7490-a696-8ad4f8a54221` 继续现有真实业务验证，不接管或重启其资源。本轮先红后绿完成纯 Handoff 校验与项目内测试，使用已完成的本地 HR‑6.1 Sol/xhigh 输出并经协调者审查；不接 Receipt、UI、队列或外部发送。用户随后明确“不强制 HR”，后续由当前任务直接推进，HR 可选，不改全局配置；Dot 额度归属未知，不声称免费。真实完成状态以项目 README 和工作记录为准。后续行为接线只在 P0 完成及明确确认 P1/P3 范围后推进。


### 10.7 当前单 owner 队列增量与可用边界

[WebFlow 应用 README](offline-modules.zh-CN.md)维护本轮具体 API、状态和最小计划，执行记录继续沿用原 workstream，不创建平行队列体系。数据单元已实现：单工作流至多两项、64 个有界事件；保存后读回才返回成功，存储不明封锁后续写；重启把已领取/派发意图/运行中的记录标 UNKNOWN，不自动执行。已知原执行身份可显式记入同一结果并确认；无映射则保持停止。相同幂等交接不再入队，同一项不得再次领取，其他项不能占用原执行/resultId。待执行取消与执行后取消请求分开。

离线验收得到 11 个队列用例通过，加交接校验共 131/131；测试包括保存→中断→恢复→拒绝重领→原结果对账→唯一完成、依赖、失败/取消、写入后丢 ACK、读回不一致、陈旧写和单实例重入。它们证明应用数据行为，不证明真实 AppStorage、跨宿主并发、运行时安装、浏览器动作或队列派发。LEASED 仅单 owner 的逻辑状态，没有原子租约/TTL/fencing；busy 与读前检查不是多宿主锁。真实结果引用的真伪仍由后续原执行权威/适配器核验。

用户要求“提示词触发后续队列”的最终手测目标已保留，但当前聊天只接已安装单任务；不把这两个离线模块冒称队列入口。P0 dev 复测完成后交付可复制的真实单任务提示词、安装审阅/一次预批准、预期动作/单次回传与故障排查。队列的两步集成仍需独立接线与有界验收，不在本轮暗中派发新 AI/仓库任务。最新指定 HR‑6.1 Sol/xhigh 的 dev 复测由既有 native owner 负责，不改全局配置、不编译 production。

---

## 11. Web Flow V0.3.1 正式应用代码与测试增量（2026-11-02）

本节只记录本轮生产代码实施与证据，原 BR-01–12、AWB-01–08 和离线队列进度不重置。设计以并行线程已合入的 V0.3.1 为准：正式主导航为「概览 / 脚本 / 记录」，帮助和设置由顶部图标进入；流程不冒充已落地。当前 GitHub main 可读写，但不能查看用户 Mac 本地未提交改动，也未访问其 Chrome Development Tab。

### 11.1 原型功能 → 可信接口 → 目标代码 → 状态

| 用户交互 | 真实来源与映射 | 本轮实际状态 |
| --- | --- | --- |
| 在扩展中心打开应用 | 原 Sidebar Tool v2 沙箱、既有安装器；projects/webflow/tool.config.json + src/ui/index.html/main.js/style.css | SOURCE_IMPLEMENTED；需正式 JSON 经原安装器审阅安装才能打开 |
| 概览统计 | 两个应用配置已审阅固定 pin，tasks.read 安装核验 | 固定 pin 子集的真实可用性统计，明确不是全部已安装脚本 |
| 脚本管理列表 | 原 Task 安装身份 taskId/version/manifestHash/contentHash 与 installationId/generation；model.js + main.js | 两项固定 Task 实际读取状态；搜索、状态筛选、收藏、详情；未开放任意任务枚举 |
| 手动运行 | tasks.read({taskId})、tasks.start({clientRequestId,task,params})；宿主验证用户手势、Origin、安装身份和 Authority | 正式调用已编码，不模拟网页成功；Chrome 实运行仍 NOT_TESTED |
| 停止与对账 | tasks.read({clientRequestId}) / tasks.stop({clientRequestId}) / 原 RunHost | 绑定同 iframe 同请求，区分 running、unknown、result 和资源释放；UNKNOWN 不自动重试 |
| 记录 | Controller result/outcome/value 由原委托快照投影；本工具 storage.local 写后读回最近 12 条摘要 | 区分运行完成、网页业务状态、持久结果与原聊天/AI 续答未观察；不冒充全局历史 |
| 设置 | storage.get/set 仅持久化本应用收藏与主题 | 真实已接入；总自动授权/逐任务 Web Flow auto-grant 暂无合法公开 API，不展示假开关 |
| 流程与原聊天交付 | 既有离线 queue/handoff 与 ChatGPT Bridge 分别保持唯一 owner | 未接真实多步骤执行与跨 iframe / AI 原聊天交付；未更改五字段 intent v1 |

不复制 Task Catalog、Installer、Runner、Authority、Bridge、任务数据库，也不向沙箱引入宿主私有存储/React 代码。依赖仓库固定共享 React 19.2.0 Sandbox Runtime，工具自身根挂载于安全 iframe。

### 11.2 文件与 Git commit 记录

| 变更 | 直接提交到 main 的 commit |
| --- | --- |
| projects/webflow/tool.config.json：沙箱 v2 和百度/Google 两个固定任务 pin | 75b4a0309abce4e220a6cefd856023efd3153421 |
| projects/webflow/src/ui/model.js：运行与结果纯投影 | f414bc25550650d30ae2c3396c25d158e9c20aef |
| projects/webflow/src/ui/index.html：安全 UI 挂载 | b2c0eae6557cb016fe94984f40b1543b74b7669e |
| projects/webflow/src/ui/style.css：窄侧栏、明暗主题、焦点 | 8d6ac942baff2e800cd38cbdcde52def96800163 |
| projects/webflow/src/ui/main.js：主 UI 与业务委托 | 02dea96a4c9b091f7e6c2712c4703b410a33e1a3；修复语法 ab5ab463fc4cb845c4127ee084eb6da97f6d678a |
| projects/webflow/tests/webflow-ui.test.mjs：pin/结果/筛选/原打包器测试 | d0314578e46cf7988ff5bc21dcca6f5c6938c956 |
| projects/webflow/app.ci.json：接现有 App CI | 40f58b52cd48c10407e28ac0bcaa6058f3aed63a |
| .github/workflows/webflow-package.yml：原打包器 + 受控生成；手动发布才可写正式包 | 21ee043a96adb1406c429505c49ffe06ba5559d5；并发 CAS afebc899fe33271d739b6d20c899d6b722f7f3e5；显式晋升 79b37c79de55ebdab07153ccb9203e769a3cb771 |
| projects/webflow/README.md：更新实际入口和功能限制 | 4fb89e39c25cda682ea80dd8035fe3539f30f744 |

仅 Web Flow 自身与一份专属 CI 门禁发生修改；其他并行项目和原 V0.3.1 预览未覆盖。

### 11.3 实测门禁、证据等级与剩余任务

- 2026-11-02 项目 CI 第一次运行 41335824089 失败：node --check projects/webflow/src/ui/main.js 在第 342 行报 SyntaxError，exit 1；源码随即修复。
- 第二次运行 41335988853：node --check model.js/main.js PASS；node --test projects/webflow/tests/webflow-ui.test.mjs tests/environment/task-delegation-package.test.mjs 实际 9/9 PASS、exit 0；原 build-sidebar-tool.mjs 生成 37,986 bytes candidate，原 --promote-from 与 --check-project 在 CI 工作区通过，SHA-256 为 869cd4bfd1986ed61dc519252c939d79d4be983835a9c9acdd13d7fff08e9411；但 GitHub main 被另一线程更新，非快进 git push 被拒，避免覆盖并行成果。第三次运行 41336225689 使用文件级条件写入，完成全部测试、晋升及远程读回，success，正式文件 projects/webflow/webflow.opendesk-tool.json 已提交到 main，Git commit 8a1cf108a6d0a2538f64eb58a10cfc0a0705090c，内容 SHA 保持不变。之后门禁变更为仅 workflow_dispatch 显式发布，普通 push 仍可验证候选。
- 原 OpenDesk App CI 在 commit ab5ab463fc4cb845c4127ee084eb6da97f6d678a 的 workflow 41335988885 为 success；它不构成真实 Chrome 安装、授权、网页或原聊天交付证据。
- SOURCE_IMPLEMENTED = 已完成（本轮代码已入 main）；COMPONENT_TESTED = 专属 Node 及原委托包 9/9 PASS，主线 App CI success；BUILD_VERIFIED = 原唯一 builder 生成候选、晋升、check-project 及 GitHub 正式包读回均已通过（仅包级）；CHROME_TESTED = NOT_TESTED；BUSINESS_VERIFIED = NOT_TESTED；RELEASED = NOT_RELEASED（提交可安装 JSON 不等于用户安装或生产发布）。
- 下一步在本机 npm run dev + Development Extension Center 审阅/安装/打开 Web Flow；安装对应固定 Task，在真实网站授权并手动运行，核对原 RunHost runId/resultId/结果与 UNKNOWN；实测键盘、320/360/440/580px、暗色/浅色、重载、权限撤销、两次快速点击；原 ChatGPT Bridge 的聊天交付独立取证。没有这些，不应给 95+ 实测验收分。
- 后续才针对全局 Task 枚举、跨实例持久历史、逐任务自动授权和持久工作流补最小公共 SDK 能力评审，不复做 UI 原型或并行 Owner 的 Bridge 协议。

## 12. ChatGPT 网页触发本地脚本：入口路线审计与最小增量（2026-11-02）

> **性质：触发机制研究、已读源码事实与条件设计；不是新增入口已交付。** 本节继续使用 `OD-AI-WORKFLOW-BRIDGE`，不替换第 6 节当前产品断点，不接管 V0.1 持续授权、V0.2 编排恢复、V0.3 UI 或本地验收。审计基线为 GitHub `main@9b91ebb6a9ed54bad8ce9ca24382ed4fc3a858c4`；本轮未访问用户 Mac、Chrome、实际 Tunnel 或二进制。本节外链在 2026-11-02（Asia/Shanghai）检索并打开。

### 12.1 结论与原始目标

**可以触发。** 正确的关系是：ChatGPT 提出结构化请求，经已允许的入口交给 OpenDesk；OpenDesk 核对已安装任务、当前授权与参数，再执行并返回真实结果。打开 URL 只建立导航，不能直接赋予网页本地执行权。Native Messaging 与 MCP 是通信路径，不能替代 Task 授权。

目标仍是“官方 ChatGPT 原对话 → 明确触发请求 → 已安装、已验证、已授权脚本 → 持久真实结果 → 正确的原对话”。当前可直接引用的执行类型是已安装 **Controller Task**；不能把“存在 Native Messaging”推成所有本机 .sh/.py、任意可执行文件、文件系统或桌面动作都已开放。另有受限 [localTasks](../../../docs/api/local-task-bridge.zh-CN.md) 合同，但不是通用 shell，也没有据此证明它已接到本轮 ChatGPT 入口。

推荐分两层：

1. **现有产品主线继续选 C。** 已有发现、安装核验、一次触发、防重和原聊天交付接线；持续授权缺口由 V0.1 owner 完成。本轮不复制调度/授权/执行系统。
2. **新的工具调用入口优先验证 B。** 官方 Secure MCP Tunnel 可接本地 stdio/HTTP MCP，减少依赖 ChatGPT 回复 DOM 的发现与回填。但必须补齐/验证“仅调用已安装任务”的工具投影，以及调用者、会话与恢复边界。
3. **A 仅作为可选的明确点击入口。** 复用现有候选和 gate。没有必要为它增加 URL 即执行、本地 HTTP 命令服务或新 Native host；当前也不新增 UI。

### 12.2 真实仓库事实

下面的“源码已核对”只代表当前基线存在该逻辑；不代表本轮运行成功。

| 能力 | 实际文件与符号 | 已见事实与限制 |
| --- | --- | --- |
| 五字段候选 | [chatgpt-task-request.js](../../../src/native-agent/chatgpt-task-request.js)，`CHATGPT_TASK_INTENT_PROTOCOL`、`validateChatGPTTaskIntent` | 实际接受 `opendesk.task.intent.v1`，恰好 protocol/candidateId/taskId/targetUrl/args。没有 `webflow.task.intent.v1` 别名。后者是本轮用户提示中的称呼，不能直接用它测试当前 parser；如要迁移由 V0.1 契约 owner 决定，本轮不改。结果格式仍为 `opendesk.task.result.v1`。 |
| 新回复发现 | [chatgpt-task-discovery.js](../../../src/native-agent/chatgpt-task-discovery.js)，`createChatGPTTaskDiscovery`；[chatgpt-bridge-site.js](../../../src/native-agent/chatgpt-bridge-site.js)；[workspace-chatgpt.js](../../../src/native-agent/workspace-chatgpt.js) | 核对新用户轮次、完整/空闲回答与 DOM 身份；历史加载、流式片段、重生成及错误上下文不直接准入。DOM 仍是不可信候选来源。 |
| 网页入口 | [chatgpt-fixed-bridge-page.js](../../../src/native-agent/chatgpt-fixed-bridge-page.js)、[manifest.json](../../../manifest.json) | 已有手动/一次预批准与自动发现；manifest 在 chatgpt.com 主 frame 声明 ISOLATED Bridge 产物。构建可按市场渠道生成 externally_connectable，不能只看根 manifest 推断最终产物。 |
| 已安装任务核验与执行 | [chatgpt-fixed-bridge-host.js](../../../src/native-agent/chatgpt-fixed-bridge-host.js)，`resolveSelection`、`normalizeSelection`、`handle` | 实读 Task Catalog/resolveInstalledTask、版本/hash/安装代次、单 Origin 和 paramsSchema；复用原 host.start。通用已安装任务路径不是仅限两项硬编码任务，也不天然等于只读。 |
| 一次触发与撤销 | [chatgpt-bridge-trigger-gate.js](../../../src/native-agent/chatgpt-bridge-trigger-gate.js)，`preapproveNext`、`reserve`、`assertConsumed` | chrome.storage 持久触发账本，执行前标 consumed；下一候选预批准期限为 300000ms，绑定确切参数、目标、安装与回答基线。持久账本不是长期 auto-grant。新候选墓碑有上限，不能承诺无限后台工作。 |
| 结果回原对话 | host 的 `verifyChatGPTTaskDurableResult`、`checkDelivery` 与 page 的 deliver 处理 | 核对 run/result/revision/hash、原 tab/document/会话与回答；发送未知不补发。结果持久化、用户消息送达、AI 续答各自有状态；completed 不证明业务成功。 |
| Native 已安装任务入口 | [host-adapter.js](../../../src/native-agent/host-adapter.js) 的 `run.start` installed-task 分支；[native-installed-tasks](../../../docs/api/native-installed-tasks.zh-CN.md) | 已有 `source:{kind:'installed-task',taskId,version,sourceHash}`。可信端 resolve 后传原 expectedTaskGeneration/expectedTaskInstallationId 与 Authority；远端不得自报这两项取得权限。目标必须匹配该 Side Panel Host 当前真实文档，使用 borrowed target；不自动继承 Bridge 的 owned 新标签页行为。 |
| 共同执行与安装授权 | [run-host.js](../../../src/run-host.js)、[authority.js](../../../src/platform/host/authority.js)、[Task service](../../../src/platform/tasks/service.js) | RunHost 转交安装预期身份；Authority 聚合原 Controller/Task 方法；Task service 已有安装、停用、撤销、代际与运行授权核验。这些是共同底座，不新增对应系统。 |
| Native 防重与查询 | [service-worker.js](../../../src/native-agent/service-worker.js) 的 reserve/readAdmission/assertRun；[cli.mjs](../../../native-agent/cli.mjs) 的 `requestAgent` | 现有请求摘要、派发前 OUTCOME_UNKNOWN 记录、`request.get`/`run.get`、同注册 Host 归属。不是按 ChatGPT 用户/对话隔离的完整 MCP 账本。 |
| 当前 MCP | [mcp.mjs](../../../native-agent/local-dev/mcp.mjs)，`serveMcp`、`MCP_TOOLS` | 七项 opendesk.dev.* 面向显式授权的本地开发源码；不等于已安装 Task 的远端产品入口。可注入 tools/dispatch 复用 stdio 包装，但自定义 dispatch 路径跳过内置 validateArgs，业务投影必须自行严格验证。 |
| 已有 Tunnel Demo | [feasibility.mjs](../../../native-agent/local-dev/feasibility.mjs)、[MCP 文档 R1](../../../docs/api/mcp-local-development.zh-CN.md#r1面向-chatgpt-的受控投影开发候选) | 已有 probe/result/write_field 窄投影与 Tunnel 配置说明。它运行固定开发 Controller，不是已安装百度任务；状态文档仍把真实 Tunnel 闭环记为 NOT_TESTED，不能重复开发或提升证据等级。 |
| 本机差异 | native-installed-tasks 文档中的 Go 实测记录 | 历史 installed-task run.start/run.get 有原生记录；历史 Go task.list 有 allowlist/连接关闭缺口。当前用户二进制是否已修复，本轮未知。不能把 Node 源码能力等同于已安装 Go 版本。 |

**特别缺口：** `serveMcp` 目前只调用 `dispatch(name,args)`，未向投影传入工具请求的可信 caller/session 上下文；共享 stdio、JSON-RPC id、clientInfo.name、进程内 Map 和“约定只打开一个聊天”都不能证明用户/对话隔离。现有 feasibility.result 的进程内归属检查也不能充当多用户授权。独立投影不能通过模型自报 conversationId、approved 或 Host registration 来补这个缺口。

### 12.3 三条路径比较

| 维度 | A：网页交互/链接 | B：MCP + Secure MCP Tunnel | C：现有 Web Flow |
| --- | --- | --- | --- |
| 技术可行性 | 点击请求可行；URL 本身不能调用任意 Extension/本地脚本 | 官方接入路径可行；本仓库 installed-task 工具投影与身份接线待补 | 已有源码、历史脚本/Bridge 证据；当前候选仍按原 owner 验收 |
| 复用 | 必须落回现有候选/gate/执行链 | 复用 serveMcp、requestAgent、Native installed-task、Authority/RunHost | 直接复用已有闭环 |
| 是否需要点击 | 手动入口需要；链接展示/加载不算执行批准 | 安装/连接及适用确认需要；后续由工具权限/上下文决定 | 手动需要；当前一次预批准后的匹配候选可自动 |
| 自动触发 | 需要扩展观察器和已批准触发范围，实质接近 C | 模型可发工具调用；不保证永远免确认或持续后台执行 | 已有新回复自动发现；持续 auto-grant 不在此快照完成 |
| 安全授权 | 导航、isTrusted、origin 都不能替代 Authority | Tunnel 控制面、应用调用身份、Task 授权分别校验 | 原来源锁、安装 pin、一次消费及现有 Authority |
| 实现复杂度 | 复用已有按钮低；自建 URL/localhost 服务反而增加范围 | 传输可复用；身份隔离、持久关联与本机差异是实质工作 | 新触发入口无需新增；V0.1 缺口归原任务 |
| 维护成本 | 回复/页面交互和 DOM 变化；自定义协议还涉及 OS/浏览器 | 维护 MCP schema、账户政策、Tunnel 进程与版本；减少 ChatGPT DOM 接线 | 主要是 ChatGPT DOM、当前 Host 生命周期与原回填 |
| 推荐程度 | 可选人工入口，不单独建执行通道 | 最值得独立验证的新入口；前置条件未满足时不派发 | 当前产品首选主线，不重复开发 |

A 的边界依据：[Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)、[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。普通 ChatGPT 回复/Markdown 不具备任意 JavaScript 或 chrome.* 执行权；宿主注册的交互组件只能使用宿主支持的能力，不能把某次浏览器工具动作推广为任意网页权限。Native Messaging 只在扩展页/service worker 可用，需注册 host 与精确 allowed_origins；没有“每次 Native 调用必需点击”的通用保证，是否自动执行由现有授权与 gate 决定。

更具体地，[官方组件 API](https://developers.openai.com/plugins/reference) 提供 `window.openai.openExternal` 打开经审查的外部链接，也提供 `window.openai.callTool` 从已注册组件调用 MCP 工具；它们属于插件组件的宿主桥接能力，不能粘进普通 Markdown 就获得。若将来需要“ChatGPT 卡片按钮”，应优先让按钮调用同一个受限 MCP 工具，这只是 B 的交互入口，不新增第四条执行链；本轮不实现该 UI。

**A 的参数传输建议：** 候选仍使用原结构化内容，入口只引用扩展已识别候选，不在 URL 放密钥、源码、授权标记或完整敏感参数。不使用 GET /run?command=...。GET 仅打开说明/候选预览，执行仍由现有受控消息和授权链完成；[HTTP safe method](https://developer.mozilla.org/en-US/docs/Glossary/Safe/HTTP) 的预取/爬虫语义不能当执行意图。没有官方产品合同证明普通回复支持任意自定义 URL scheme、自动导航或直接 Extension API，故不以此作为产品前提。

B 的官方依据与条件：

- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) 支持本机出站 HTTPS，转发本地 stdio/HTTP MCP；不要求把现有 stdio 改成公网 HTTP。需要目标 Platform 组织与 ChatGPT workspace 关联及相应 Read/Use/Manage 权限。Tunnel 不授予任务权限，不等于公共插件分发方案。
- [Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server) 支持网页接入读/写工具，无需把每个工具伪装为 search/fetch；写动作默认确认，记住批准受会话、刷新、账户与工作区策略影响。不得通过 readOnlyHint 虚报或 API 的 require_approval 配置规避网页确认。
- [当前帮助页](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) 区分完整 MCP 的 Business/Enterprise/Edu 与 Pro read/fetch；具体账号/灰度未验证。新 Plugins 流程不要求先开旧 Developer Mode；不要仅按过时 UI 路径承诺可用。
- 默认 Tunnel 请求总预算为 120 秒（排队也计入），进度通知不续期；包络 10 MiB 不改变现有 Bridge 结果上限。必须以实际路径最小上限处理结果，不静默截断。
- [Plugins reference](https://developers.openai.com/plugins/reference) 公开 openai/session 等关联 metadata；它不是权限凭据，也不是任意聊天写入地址。身份须来自已验证传输/应用认证，按 [认证文档](https://developers.openai.com/plugins/build/auth) 核查。网页不支持拿任意自定义 API key 直接替代 app 认证；Tunnel runtime key 不得进聊天或工具参数。

### 12.4 推荐调用链与复用边界

C 保持：原对话完整候选 → discovery/严格 parser → Bridge 安装核对与原一次触发账本 → 原 Authority/RunHost/Controller → 原 Durable Result → 原 conversation/document/answer 核对 → 单次交付 → 观察 AI 续答。

B 的**条件设计**：原对话 MCP tools/call → 官方 Tunnel → 本机受限 MCP 投影 → 现有 Native requestAgent → 已登记 Side Panel Host → installed-task run.start → 原 Authority/RunHost/Controller → 原持久结果 → 原 MCP 响应。

这两条路径共享任务与执行底座，现有入口账本仍不同；不能声称目前跨入口已有统一去重。**同一业务操作只选一个入口和一个交付通道。** 这目前是实施/验收前置，不是已存在的跨入口锁。B 演示前须在原可信 Bridge 入口撤销该测试对话中匹配的待执行/一次预批准请求并确认撤销回执；存在已准入、运行中或 UNKNOWN 的同一业务操作时先对账，不能启动 B。整个受协调 Demo 窗口不得重新批准匹配的 C 请求，B 运行中或结果未知时继续保持隔离，直到原操作终止并完成对账。只告诉模型不输出候选不算排他证据，也不能把一次撤销快照升级成产品级并发保证。不同时发可执行 Web Flow 候选和 MCP start；MCP 超时后不切到 C 再跑。未来跨入口接力需要原 owner 统一稳定操作身份与持久关联，本轮不另外建一套。

B 的新增价值是官方工具发现、结构化参数和工具响应，无需把结果再次填入 ChatGPT composer。同步响应由原 MCP 调用返回；后续查询仍须验证调用者及会话。不能用 Responses API 的 conversation_id/previous_response_id 推断可以写入用户既有网页对话。MCP Events 等异步唤醒能力不进入本轮最小 Demo。

### 12.5 最小 Demo、最少文件与前置缺口

**第一步不写新代码：** 核对本机既有 MCP/Tunnel 配置与 tools/list、实际 Chrome/Native 版本、固定百度任务的安装回执及本轮目标。已有 feasibility Demo 只用于理解/复用传输结构，不能重新开发 probe/write_field，也不把其开发源码运行当成本轮 installed-task 验证。

**最小新业务：** 一个窄 MCP 入口调用已有 `baidu.search.top3`，另一个只读入口读取它自己准入的原请求/结果。名称如 `opendesk.webflow.start`、`opendesk.webflow.result` 仅为拟定名称，当前不存在。首版 taskId 固定为此百度任务、limit 固定 3；query 使用该受审版本的窄参数 schema，最终仍由原 Host/Authority 按真实安装 manifest 校验。注意 Native task.list 不返回 paramsSchema：投影只能读取已核对 manifestHash 的正式任务包/安装审阅产物，或使用已被证明存在的公开 schema 接口；不能读宿主私有库、猜参数范围或把 task.list 说成已有该字段。包的版本/sourceHash/manifestHash 不匹配即拒绝，更新后需重新核验。版本/sourceHash/manifestHash/安装身份、registrationId、目标 tab/document 来自本机可信读取，模型不传源码、路径、Host、授权标记、任意 taskId 或 arbitrary native method。

**审计包实例：** 当前仓库 [baidu.search.top3.v1.opendesk-task.json](../../../examples/tasks/baidu.search.top3.v1.opendesk-task.json) 声明 taskId=baidu.search.top3、version=1.1.1、query 的 minLength=1/maxLength=120、limit enum=[3]、deadlineMs=60000。它提供可核对的窄 schema 来源；不能把仓库包版本当作用户本机已经安装的版本，现场仍须核对真实 manifestHash/sourceHash。

**拟定工具参数和操作键：** start 只接受 `{operationKey,query}`，result 只接受 `{operationKey}`；operationKey 是一次有意操作的关联键，不是授权凭据，首次调用前确定，原 tools/call 转录保留它；同一次重试/查询必须复用，只有明确的新任务才产生新键。拟定 operationKey 为 16–80 位 ASCII，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]{15,79}$`，不作隐式裁剪或大小写转换。服务端对结构 `{projection:'webflow-installed-baidu.v1',principal:可信主体,conversation:可信原会话,operationKey}` 复用 `agentCanonical/agentDigest` 求 SHA-256，生成 `wf-mcp-v1:<64位摘要>` 的稳定 requestId，不能用含糊字符串拼接或模型自报会话。请求摘要继续按原 Native 合同计算，不以操作键摘要替代。派发前须在原获准元数据中原子保存完整规范化封套、摘要、Host/目标和交付归属，不能使用 requestAgent 的默认随机 UUID。相同键不同 query/封套拒绝；result 不接受任意 runId，而是从当前可信身份命名空间找到原封套，再 request.get/run.get。第一次 ACK 丢失仍以原 operationKey 查询；若该映射无法持久存储/恢复，则真实执行保持 BLOCKED，不能每次重新读取当前 target 重建请求。

**本次许可上限：** 本机可信配置固定中性公开 query（示例“OpenDesk 浏览器自动化”）、任务/来源/目标、`expiresAt` 和 `maxAdmissions=1`；有效期建议为批准后 5 分钟，这是新 Demo 的拟定准入范围，不冒充现有 MCP grant。准入名额与原请求映射在获准元数据中原子消费后才派发；新 operationKey 不续期、不加名额。期限或名额用尽后，只允许仍具查询权限的原请求结果查询；后续执行需新的明确批准。若原有接口不能落实该原子预算，则实际派发保持 BLOCKED，不另建 Authority/授权库。query 不自动夹带聊天中的私密资料。

**Native 响应到 MCP 的最小合同：** requestAgent 解析传输，并可能正常 resolve 一个含 error 的封套；Promise resolve 不代表准入或业务成功。投影先校验 v/kind/requestId 与 result/error 恰有一个，再分派正常值或受控错误。result 在披露前检查原调用归属、`resultDeliveryDenied`、原 run/revision/sourceHash、Authority 目标与受控导航身份、唯一 controller-result/resultId 和实际 outcome；复用原 Codec 解码，并按百度结果字段白名单和字节上限投影，不直接转发 snapshot、日志、路径或诊断。可参考既有 session.mjs 的校验模式，但不能复制其要求 sourceKind=draft 的开发会话来冒充 installed-task。

| 返回类别 | 应表达的事实 | 禁止混淆 |
| --- | --- | --- |
| start 正常受理 | operationKey、原 requestId、已知 runId、准入状态与 PENDING/UNKNOWN | PENDING 不是业务完成或结果交付 |
| result 正常读取 | 原准入状态、实际 run/outcome、校验后的有限业务值、结果是否完整和释放状态 | completed 不等于 outcome.ok，更不替代业务字段 |
| 工具/Native 错误 | 受控 code/message/phase、原请求身份和诚实的 outcome；经原 serveMcp 错误通道标 isError:true | 不把含 error 的封套作为成功数据，也不透出本机诊断 |
| 查询失败 | 本次查询失败；原操作状态按已有证据保留，未知则 OUTCOME_UNKNOWN | 查询的 NOT_DISPATCHED 不是原 run.start 未派发；无故障证据不得改写旧运行 |

适配器须先将原始异常映射为安全的错误再交 serveMcp；其现有通用 catch 会输出 message/location，不能直接抛带路径的原始诊断。若共用包装不能表达必要状态，由原 MCP owner 审查最小投影接口，不复制一套 server。

不改其他 owner 时，**预先在对应 Side Panel Host 选择已授权的真实百度页面**。Native 当前借用该精确文档，不能把该需求偷偷变成自动新建标签页/自动跨文档绑定。结果经 MCP 回原调用，不再调用 Bridge composer。

| 拟定文件 | 最小职责 | 条件 |
| --- | --- | --- |
| `projects/webflow/src/adapters/installed-task-mcp.mjs` | 固定工具 schema、严格参数校验、MCP 结果投影，复用 serveMcp | 独立本机进程入口；不打包进沙箱 UI，不新增 MCP 传输实现 |
| `projects/webflow/src/adapters/native-installed-task.mjs` | 仅封装原 requestAgent 的必要固定方法、可信任务/目标核验、原请求查询及安全结果/错误投影 | 不是 Runner、授权库、任务目录或原始数据库访问器 |
| `projects/webflow/tests/installed-task-mcp.test.mjs` | 新入口的拒绝、重复、未知、归属与结果投影回归 | 只覆盖新边界，不重复 V0.1 核心测试 |
| 现有本执行计划第 12 节 | 接线状态、依赖、证据、下一步 | 不按聊天再建总方案 |

上述三项源码/测试路径仅为建议；实施时先查当前 main 是否已有同职责文件。**不能承诺只改这三文件就完成生产接入。** 下列缺口必须先证明满足；需要公共接口增量时由对应 owner 处理：

1. **可信调用上下文。** 现有 serveMcp 未传 caller/session；如需要共享多对话入口，复用其唯一包装，由 MCP owner 审查最小的带上下文 dispatch 接口及定向测试，不能把模型参数作为补丁。必须证明实际传输/应用认证得到的主体、该主体到本机允许任务的绑定、宿主提供的原会话关联，以及缺失/伪造/冲突上下文拒绝执行和披露；单纯透传 _meta 不是完成证据。只有已验证传输来源的 metadata 才能用于关联；应用身份和原 Authority 继续独立。无法证明则拒绝执行/跨调用结果读取，不以“单用户约定”冒充隔离。
2. **持久关联。** 原 Native ledger 已有 method/摘要/Host/run，但没有完整的 MCP principal/conversation/原请求封套映射。需要的少量关联数据应进入原有经批准持久元数据设施，只引用原 Run/Result；没有合法接口就记录能力缺口，不能另建任务数据库。进程内 Map 不证明重启恢复。
3. **安装与撤销。** Native trusted resolver + Authority 负责最终准入；入口只能收窄范围，不能扩大。长期投影必须对原批准的安装代际变化失效。这里还有明确的原子性缺口：现有 installed-task RPC 只接受 taskId/version/sourceHash；先 task.list 比对旧代际再 run.start，不能封住中间同版本/同 hash 卸载重装的窗口。Host 会解析当前代际，Authority 保护的是这次解析之后的竞态，不能代表 MCP 的旧安装批准。若本次许可要求冻结原 generation/installationId 到最终准入，需要 Native/Authority owner 的最小原子比较合同；不能通过第二次读取或增加模型参数宣称解决，也不由本项目绕过。最小单次 Demo 只能按原 Native 当前合法安装授权和本次确认测试，不宣称跨会话持续 grant；严格冻结原安装代际的验收在该缺口解决前保持 BLOCKED。旧 Go task.list 不可用时，历史安装回执只证明历史 pin；无法可信复核当前身份则不开放长期自动执行。
4. **实际账户/宿主。** Tunnel app 写调用资格、原 Native 配对与网站授权、真实 Host 存活和目标身份都要现场核对；不能通过更换扩展 ID、重装 Go、宽化来源或伪造 Bridge sender 来绕过。

只有前置条件满足，才执行一次搜索；否则只交付工具发现/离线适配与准确缺口，不说闭环通过。**默认采用短 start 准入响应 + 原会话有限次 result 查询**，不等待整个脚本完成，也不承诺 ChatGPT 会持续后台轮询。每次本机调用设置显式短等待预算；例如准入 10 秒仍是待现场核验的配置，不是排队后还剩完整 120 秒的保证。Native requestAgent 默认 145 秒、service-worker 派发等待 135 秒均不能直接沿用作 Tunnel 的成功保证；本机等待超时且可能已派发时保留 UNKNOWN，后续只查原请求。同步最终结果若恰好在原 start 的预算内返回，才记为“原 start 最终交付”；默认异步路径的最终结果返回原会话内携带原 operationKey 的后续 result 调用，两者证据分开。当前 Native 消息上限 60 KiB，浏览器 Native admission ledger 上限 256 条（满额拒绝，没有在该入口自动清理）；MCP stdio 单请求上限 64 KiB。均来自原 protocol/wire/serveMcp，不能按 Tunnel 的 10 MiB 扩张既有边界；最小 Demo 不自动删除旧账本腾空间。

### 12.6 安全、失败恢复与验收证据

| 情形 | 要求/复用处理 | 不能声称 |
| --- | --- | --- |
| 伪造或篡改输入 | 入口严格 schema、上限、固定任务/站点；可信端重新解析安装与 paramsSchema | origin、clientInfo、nonce、runId 或 JSON 中 approved=true 本身是授权 |
| 双击、重复 tools/call | 业务 requestId 与规范化原封套稳定；原 ledger 确定重复或冲突；并发不得第二次入场 | MCP JSON-RPC id 就是永久业务幂等键 |
| 参数或目标变化 | 同操作键内容不同拒绝；首次派发前固定原 target/document/Host | 重试时重读“当前页面”后换 target 再提交仍是同一次操作 |
| 丢启动 ACK/超时 | 保留原 requestId、requestDigest、registrationId；request.get 对账，拿原 runId 后 run.get | 超时表示没执行、NOT_FOUND 表示没副作用 |
| MCP 断连或进程重启 | 从获准的持久关联读原请求；映射缺失则停止并人工核对，不创建新 ID 重跑 | 旧 Map、TTL 到期或 MCP 重启自动安全恢复 |
| Side Panel/Chrome 重建 | request.get 可只读返回原 admission 与 hostAvailable；run.get 仍依赖原活 registrationId，原 Host 消失时交原恢复 owner 处理 | 查到 admission 就能让新 Host 接管旧运行或读回原结果 |
| 撤权/停用/升级 | 原安装/Authority 与入口绑定再次检查；阻止后续准入及不允许的结果披露 | 已发生的点击/提交因撤权自动回滚 |
| 原聊天变化 | C 重核 conversation+tab+document+answer；B 从可信请求上下文关联，结果只返回匹配原调用/查询 | tabId、同源或“最后打开聊天”可代替会话 |
| 多入口 | 一操作只选 C 或 B，未知时不切换另一入口执行 | 两个现有独立账本已经跨入口 exactly-once |
| 结果完成 | 真实 run/result/revision/hash + 原任务 value/业务证据；交付和 AI 续答另记 | completed、HTTP 200、工具无异常或 resultPreview 等于搜索业务成功 |
| 结果里的网页文字 | 视为不可信数据、限定返回字段及长度；不执行其指令 | 回传内容可自动变成下一条授权任务 |

防重目标是受控一次准入/一次交付及未知时停止，不承诺任意外部网站可提供数学意义的 exactly-once。重试必须查询原身份；停止请求也不能代替真实 retirement/released 证据。设备休眠、浏览器关闭或 Side Panel Host 消失会影响运行能力，MCP/Tunnel 不使原 Host 永驻。

### 12.7 阶段任务与独立退出证据

这些是本节新入口的阶段，**不是**重复接管 AWB-01–08。

| 阶段 | 本节 owner 做什么 | 退出证据 |
| --- | --- | --- |
| 触发路线核验（本轮） | 固定 main、读实际源码和官方文档、明确 A/B/C 与责任边界 | 本节、准确源码链接、官方来源、独立 AI 评审；仅文档证据 |
| 本机接入预检 | 本地 Codex 先核对已存在配置、当前工具和本机版本；不重装/重建/重复跑旧有效测试 | 实际 app/Tunnel 可见性、工具 schema、Native 状态、已安装百度 pin/目标；缺项明确 BLOCKED/NOT_TESTED |
| 安全窄投影 | 只有必要时实现上表最小项目文件，公共 context/存储缺口交对应 owner | 严格 schema、错误 task/来源/权限拒绝、同键不同参数、跨会话拒绝、未知不重放的定向证据；无实际调用者隔离不能越级 |
| 一次真实搜索 | 一份已授权候选从 MCP 入场，同安装任务操作百度 | MCP 调用、Native requestId、runId/resultId、实际 query/结果和业务状态；同步 final 回原 start 或异步 final 回原会话的 result 调用分别留证，另证资源释放；PENDING 与模型复述不算业务交付 |
| 入口可靠性 | 只测新入口新增风险：重复调用、撤权、丢 ACK、错误会话、原目标漂移 | 原 run 查询、无第二次准入、错误会话无结果、原生拒绝回执；测试变化只复验受影响项 |
| 交接 | 更新本节而非全局替换其他 owner 进度 | 明确 SOURCE/COMPONENT/CHROME/BUSINESS/DELIVERY 状态、仍有风险和唯一下一步 |

本轮状态：SOURCE_REVIEWED；OFFICIAL_DOCS_REVIEWED；新增 MCP 投影 NOT_IMPLEMENTED；账号/Tunnel/本机 Native/百度新入口/跨会话隔离 CHROME_NOT_TESTED。既有用户提供的百度/Google 成功返回作为历史线索保留，不冒充本轮同候选闭环证据。

### 12.8 给本地 Codex 的独立实施提示词（仅选择 B 的新入口时使用）

> 原始目标：用户在官方 ChatGPT 对话调用 OpenDesk，本机只执行已经安装、验证并授权的自动化 Task，真实结果回同一工具调用/正确原对话。项目 shopable-ai/opendesk-browser；本机 /Users/shopme/Documents/workspace/opendesk-browser；唯一业务目录 projects/webflow/；检索词 OD-AI-WORKFLOW-BRIDGE。
>
> 本任务只做“已安装百度 Task 的受限 MCP 入口”。不要接管 Web Flow V0.1 持续授权、V0.2 工作流恢复、V0.3 UI/安装，也不要重做百度脚本、Controller、Authority、RunHost、Native host 或已有 Tunnel feasibility Demo。
>
> 先读根和项目 AGENTS、README、产品合同、本执行计划第 12 节，以及 docs/api/native-installed-tasks.zh-CN.md、docs/api/mcp-local-development.zh-CN.md。重新核对当前 main 与本机相关 diff/owner；9b91ebb6 只是历史审计基线，不能覆盖后续实现。按现行主分支规则工作，保留其他改动，不自行建分支/worktree/PR。
>
> 只读检查现有 Native/Go/MCP/Tunnel 与真实工具：native-agent/local-dev/mcp.mjs、feasibility.mjs、native-agent/cli.mjs、src/native-agent/host-adapter.js、service-worker.js、原 Task/Authority 入口。已有同职责投影就验证并复用。官方资料以 secure-mcp-tunnels 与 custom-mcp-server 当前正文为准；不假定用户账户有完整 MCP 写权限，不读出/复制密钥。
>
> 首先回答三个前置问题：是否已有安全 installed-task 工具？是否能可信绑定调用者和原对话？原 Native/持久接口是否能保存并恢复同一请求关联？现有 serveMcp 自定义 dispatch 不自动 validateArgs，也没有 caller/_meta 参数；不能以模型传 conversationId/approved 或共用内存 Map 代替。如果缺公共接口，提交准确文件/符号/可复现缺口给原 owner，仅继续无依赖的离线适配工作，禁止绕过或擅改核心。
>
> 确认确需新增后，将业务限制到 projects/webflow/src/adapters/installed-task-mcp.mjs、native-installed-task.mjs 与一个专属测试（实际已有路径优先）；复用 serveMcp 和 requestAgent，不复制传输。只暴露固定 baidu.search.top3 的 start({operationKey,query}) 与 result({operationKey})；limit 固定3。operationKey不是授权，由首次工具请求固定；服务端在可信主体/原会话命名空间派生稳定Native requestId，写入原获准关联记录，绝不使用requestAgent默认随机ID。query遵守已验证manifestHash的受审任务包窄schema及最终Authority校验；task.list不返回paramsSchema，不得猜测该能力；URL、版本/hash/安装代际、Host/tab/document由可信本机读取，不由模型指定。不得公开 dev.attach/dev.run、任意 shell/源码/路径、script.save、任意 Native method或批量任务目录。
>
> B启动前通过原可信入口撤销该测试对话匹配的C待执行/预批准并核对回执；同业务仍running/UNKNOWN则先对账，不能只靠提示词避免双入口。使用已有 Native run.start(source.kind=installed-task)，复用 Authority/RunHost/持久结果。Native当前要求borrowed精确目标：在原Host先选中已授权百度页面，不重做Bridge owned-tab逻辑。读取实际已安装身份，不能硬编码历史SHA；当前task.list不可用且无等价可信核验时，准确标阻塞，不更换配对/Host冒充修通。现Native source不接受旧generation/installationId，task.list后再run.start存在重装窗口；严格锁定原批准代际需要原owner最小原子合同，不能靠第二次读取修饰为已解决。一次Demo不等于跨会话持续grant。
>
> 业务请求在派发前固定操作键、规范化原封套、原Host/目标、身份和交付通道，并通过原获准持久设施关联；不建第二任务/权限/结果数据库。operationKey和稳定ID按12.5的有界ASCII/版本化结构/agentCanonical与agentDigest合同实现。本机许可固定中性公开query、expiresAt、maxAdmissions=1，名额与映射原子消费；接口缺失则BLOCKED。重复调用只读原请求；同键不同参数拒绝，新键不扩批准范围。超时、丢ACK、UNKNOWN、NOT_FOUND都不能换ID重跑；原request.get/run.get恢复，不用新的当前页面重建旧请求。原Host已销毁时，即使request.get返回admission，run.get仍可能因原registrationId不活跃而不可用；不让新Host接管。缺可信会话归属则拒绝执行/结果披露。B调用后不再发C候选或回填composer；整个受协调窗口及UNKNOWN期间不重新批准匹配C入口，不跨入口重试。
>
> 严格实现12.5的Native响应和安全结果投影：requestAgent可能resolve含error封套，核对身份后再解释；resultDeliveryDenied、revision/hash/目标/唯一result身份和outcome都要核验，复用Codec，业务字段白名单与字节上限，错误受控映射，不透出原始snapshot/路径。工具错误用isError，查询失败不得把原运行降级为NOT_DISPATCHED。默认短start加同会话原operationKey的有限result查询，不继承145秒默认等待，不承诺后台轮询；原start的PENDING不等于最终交付。
>
> 先运行新入口相关的离线边界检查；真实Chrome只占用已协调资源，复用现有dist/development和watcher，不启动全量测试、宽度矩阵、构建或重装。只有账户、授权、调用者隔离与原生前置均满足才从真实ChatGPT调用一次现有百度任务。写工具如实标注并遵守平台确认。
>
> 最后分别报告：实际工具调用与参数、原request/run/result身份、任务pin、网页实际结果、同步final回原start或异步final回原会话result调用的确切证据、AI是否基于真实结果续答、资源释放、重复/撤权/错误会话/未知回执检查。没有证据就标NOT_TESTED。只更新本计划第12节的本入口状态，不改其他owner完成度；不得以评分代替验收。

### 12.9 独立评审与评分口径

本轮以三个独立 AI 子评审覆盖六个专业视角；不是六位真人专家或外部认证。分数仅评价本节技术判断、复用边界与实施/验收设计。评审提出修改后分别只读复核当前稿，并各自给出下列实际分数；没有用评分代替产品验收。

| 专业视角 | 证据准确 /20 | 边界安全 /20 | 复用最小增量 /20 | 实施可执行 /20 | 验收诚实 /20 | 总分 /100 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chrome Extension / MV3 架构 | 20 | 20 | 20 | 17 | 20 | 97 |
| Native Messaging | 20 | 20 | 20 | 17 | 20 | 97 |
| MCP / AI Agent 集成 | 20 | 20 | 20 | 16 | 20 | 96 |
| 浏览器自动化 | 20 | 20 | 20 | 16 | 20 | 96 |
| 应用安全 | 20 | 19 | 20 | 17 | 20 | 96 |
| 开发者工具产品架构 | 20 | 20 | 20 | 17 | 20 | 97 |

算术平均：`(97 + 97 + 96 + 96 + 96 + 97) / 6 = 96.5 / 100`。这是文档设计分，达到本轮研究目标；不代表新增入口已实施、已通过 Chrome 或可上线。

剩余扣分集中在尚未冻结的真实 caller/session dispatch、获准的原子持久关联/单次预算、严格安装代际比较，以及原会话交付接线与有限查询次数/间隔的实施配置。应用安全另保留一点：跨入口排他仍依赖受协调 Demo，不是产品内已实现的互斥合同。这些缺口继续保持相应 BLOCKED/NOT_IMPLEMENTED/NOT_TESTED，不能为提高分数改写为已完成。

