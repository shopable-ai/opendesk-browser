# Web Flow / AI Workflow Bridge · 连续任务执行计划

> **固定检索词：`OD-AI-WORKFLOW-BRIDGE`。** 本文件是 Web Flow 的唯一进度与执行入口，后续新对话从本文件恢复，不再按对话创建平行总计划。
>
> **当前项目入口：** [projects/webflow/README.md](../README.md)。2026-11-01 按用户要求将 Web Flow 归为独立业务扩展应用，完整产品合同与本执行记录迁入项目 `docs/`；旧路径仅保留跳转。目录调整记录见第 8 节，原始源码审计及验收边界保留。
>
> **最新状态：第一阶段自动运行 UI 与原触发接线，见第 12.11 节；v0.3.4 源码/组件已验证，真实 ChatGPT→百度尚未验证。** 下列方案、历史搜索、离线队列与 V0.3.1 包级记录保留各自证据等级，不转记为本轮 Chrome 通过。
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

- 原五字段 `opendesk.task.intent.v1` 保留手动/五分钟功能；2026-11-02 V0.1-R2 新增 `webflow.task.intent.v1` 专用于持续自动准入，仍为严格五字段，见第 12 节；现有 Workflow v1 单站范围不变。
- Page、Sidebar、Controller 的安装与权限身份分别保留；一个产品入口不合并授权。
- 新增 Web Flow 应用业务、专属测试与文档归 `projects/webflow/`；框架只承接通用能力，目录与包身份不会授予权限。
- 现有 AI Send Queue 的业务目录为 `examples/sidebar-tools/ai-send-queue/`；不迁回旧目录、不创建同名副本。Sidebar 当前只提供提示，不恢复旧消息列表。
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
| 同一 ChatGPT 页顺序发送消息 | [队列 README](../../../examples/sidebar-tools/ai-send-queue/README.zh-CN.md)、`src/page/main.js`、`engine.js`、`site.js`；诊断明确 `memory-only`。README 记录 Page `0.1.13/r13` 的 2026-10-29 两条 FIFO 实测 | 原始证据本机未取得；只有历史文档记录。单页内存队列不是刷新/跨日恢复 |
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

**涉及文件：** 本文件、产品合同、项目 README/AGENTS；只读 `examples/sidebar-tools/ai-send-queue/README.zh-CN.md`、公开 Page/Sidebar API、当前执行/存储模块。**依赖：** 无。

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

**涉及文件：** 先复用 `examples/sidebar-tools/ai-send-queue/src/page/site.js` 和 `src/native-agent/workspace-chatgpt.js` 的对应轮次判断；完整产物通过既有 Durable Result/存储 owner；`chatgpt-fixed-bridge-host.js` 的小消息合同保持显式边界。**依赖：** AWB-01；可与 AWB-02 的独立任务文件并行。

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

**涉及文件：** Web Flow 的多步任务模型、编排与恢复业务及专属测试归 `projects/webflow/`；`examples/sidebar-tools/ai-send-queue/` 继续负责其现有网页发送队列，通过已审阅公开边界协作。底座优先复用 `src/platform/tasks/schedule-repository.js`、`schedule-service.js`、`src/platform/storage/idb.js` 的原事务/准入模式。只有 AWB-01 证明缺口后才确定最小平台写入。**依赖：** AWB-04/05；Gemini 恢复另依赖 AWB-06。

**接口责任：** 单一持久 job 关联 workflow/step/attempt、输入结果、依赖、owner 代次、取消和 UNKNOWN；Queue UI 为投影，不保存第二份权威状态。

- [ ] 先做三步顺序任务、并发 1；每条已批准计划明示步骤数、截止、重试和交接上限，不接受无限默认值。
- [ ] 准入前持久化，结果提交后再放行依赖；旧 owner 回调不推动新 owner 的任务。
- [ ] 刷新页面、Worker 重建、浏览器重启后从确定检查点恢复；失效 tab/document 重新绑定，短期批准不延长。
- [ ] 发送已生效但 ACK 丢失只对账；已完成步骤不重放；取消后不开始后续任务。
- [ ] 浏览器关闭/设备睡眠记录 WAITING 环境原因；重启从原 due 状态核对，不按错过的 timer 次数补发消息。
- [ ] 按项目/任务/关键词查回状态、原文、下一步和阻塞；真实隔日恢复单独保留时间与环境证据。

**通过条件：** 不依赖旧聊天内容或常驻 Worker，即可准确续接一条已批准主线。**停止条件：** 持久回执未知、缺少授权、结果歧义、过期/预算用尽。不能声称用户电脑离线仍在操作网页。

**J06 / AWB-07 · 2026-11-02 本地定向验证增量（OD-AI-WORKFLOW-BRIDGE）**

本轮只处理原 Controller 委托恢复。普通用户的“运行 A → 关闭侧栏/重建 iframe → 查回原结果”在真实 Chrome 仍为 `BLOCKED / NOT_TESTED`；Node 中实际调用原 Authority、Task 安装验证、Repository 和 RunHost，证明两个 Host 的同一步骤只关联一个 Run，新 Host 按四字段/六字段 pin 读取原 Result，未知状态不启动替代执行，取消或 Slot/Worker/Retirement 未释放不放行 B。事务替身不是 Chrome IDB，模拟安装的 Task 不是用户 Chrome 的安装证据。

- 已复现并最小修复：取消接口无 Worker 存活证明却返回 `FOUND_RUNNING`；重复手动 start 返回缓存 Result 绕过后续 Task 撤权；替代 iframe 关闭后交付迟到恢复结果；通用 snapshot 未与 App 停用写入者共享 lifecycle 锁。snapshot 仅锁本次待披露 Result 对应的 App，避免单 Run 查询重入其他历史 App 的非重入锁。
- 原 `tasks.start/read/stop` 请求 Schema 与五字段 `opendesk.task.intent.v1` 保持兼容；J06 手动入口仍要求可信用户手势，`continuationApproved:false`。本轮未开放 J06 M2 后台提交、B 自动续跑，未统一 MCP B 与 Bridge C 身份。
- 证据：六个相关文件 `node --check` 通过；恢复/包/委托 61 项、原历史读取 11 项、原 Authority 定向回归 17 项、旧 Intent 3 项，共 92 项 PASS（不累加重复运行）。最初指定两组为 10 项 PASS；旧委托夹具失配和四项产品失败均保留修复前日志。测试代码在 `tests/environment/task-delegation-recovery.test.mjs`、`task-delegation.test.mjs`；实际命令、退出码、输入 SHA、关联记录及原生未测项见本机 `artifacts/j06-recovery-20261102/verification.json` 和同目录日志。
- 撤权证据限于 Node：实际 `setInstalledSidebarToolEnabled` 写入者与 SUBMIT、INSPECT、snapshot 共享原 App Web Lock，并核对 Task 的原 IDB 授权。真实 MV3 跨上下文 Web Locks、Chrome storage/IDB 竞态与安装/升级/重装/卸载仍为 `NOT_TESTED`，不能宣称已证明最终撤权保证。
- 环境：本机实际仓库 `/Users/mac/Documents/workspace/opendesk-browser`，`main` 基线及 GitHub 只读核验远端均为 `1e9b4324cd97674c0aa24a29b92a2da93ebc3fad`。既有 `dist/development` 是旧磁盘开发包；锁中 PID 40544 已不存在，serve 连接未证实；Chrome 工具拒绝接管现有 `chrome://extensions`。本轮未启动 watcher、构建、重装或替换扩展，真实启用路径/ID/Native 配对未核实。
- 边界：Worker 无可信存活证据保持 `UNKNOWN`；稳定 `clientRequestId` 丢失后没有已发布的历史枚举/分页 SDK；保留 Run 时丢步骤 journal、丢 admission/Result、tombstone、过期、时钟回退、容量上限及事务失败已定向验证不会补跑，完整 GC/任意历史清除后的保证仍为 `NOT_TESTED`。未授权查询拒绝；单帧大 Result 拒绝，不新增传输通道。
- 原 `opendesk-webflow-j06-framework-capabilities.pending.md`、`opendesk-webflow-j06-execution-plan.delta.pending.md` 未在可访问文件中取得，差量核对为 `BLOCKED_SOURCE_UNAVAILABLE`；未重建同职责文档。X15、X19、X20、X33、X34、X35、X36、X37、X39 及 X21、X22、X24、X40 的原定义未取得，逐项映射 `NOT_TESTED`，不能把相似测试猜配为原编号 PASS；各编号独立保留在 verification.json。
- 所有权：`broker.js` 与本文件已有其他任务改动，预存改动仍为 `LOCAL_OWNER_UNVERIFIED`；只新增本 AWB-07 段，不接管其余内容及 J08。独立只读复审的结论与限制另存本机回执。正式 SDK 文档发布条件尚不具备，保留内部候选状态。

**唯一下一条未完成操作：** 原环境 owner 提供可合法控制且可核验身份的同候选可信 Side Panel；使用用户已有安装/授权 Task A，运行并核对 PREPARE 后关闭重开，用原 `clientRequestId` 查回同一 Run/Result，再做同候选真实 IDB 取消/撤权交错。本轮没有把 J06 实测前置为重做 Bridge、UI、J03–J05、J07 或 J08。

**J06 核心 UI · 2026-11-02 本地续接结果（当前阶段，覆盖上段下一动作）：`SOURCE_IMPLEMENTED / UI_COMPONENT_PASS / PACKAGE_READY_INSTALL_NOT_TESTED`。真实核心链仍为 `BLOCKED / NOT_TESTED`，没有宣称 PRODUCT_DONE。** 当前任务 `01a19ba3-c341-7b00-84a8-18f14c13950c` 在现有 `main`、基线 `7581a5710934282baf238f4333ec5be595aa6baf` 继续；唯一业务 owner 为 `projects/webflow/`。本轮未改 Framework 源码、产品合同、自动触发、Bridge、MCP、Task Shop 或第 11/12 节；这些预存 dirty 原字节保留。

| 普通用户操作 / 实际入口 | 当前真实安装 Chrome | 本轮 UI / 组件证据（不能升级为原生 PASS） |
| --- | --- | --- |
| 打开已安装固定 Task A，核对可执行状态 | BLOCKED | 实际 React root 首次渲染的 `PINN` ReferenceError 已红绿修复；脚本/详情按原六字段安装 pin 展示，Chrome 夹具真实点击可用 |
| 保存步骤、确认手动运行 | NOT_TESTED | 原 storage CAS 写后读回稳定 ID、原 Task pin/参数；确认点击内同步 start；实际组件页派发计数从 0 到 1，重复点击定向检查不补跑 |
| 关闭侧栏 | NOT_TESTED | 真实关闭独立组件页、卸载原 React 上下文；没有操作可信 Side Panel |
| 重开 Web Flow | NOT_TESTED | 新建页面与 React 上下文，从持久 locator 恢复同一原步骤；不复用旧 UI 内存 |
| 记录 → 原步骤 → 查询原请求 | NOT_TESTED | 实际点击查回同一模拟 clientRequestId/runId/resultId 和正文，计数仍 1；查询前摘要不作为结果正文；Host/Authority 的原 92 项组件证据另复用 |
| 取消 / Stop（含 ACK 在途） | NOT_TESTED | 可见 Stop 清除旧正文；DOM 事件覆盖 ACK 未到、迟到 start/read/stop、保存/清理 ACK 丢失；本实例确定从未 start 的步骤可取消/重试取消，绝不恢复运行确认 |
| 应用 / Task 撤权、身份变化 | NOT_TESTED | 模拟 E_PERMISSION 后正文和旧成功提示立即清除；六字段安装变化拒绝旧确认；没有证明真实 Chrome 撤权竞态 |
| 结果完成但未释放，阻止后续 B | NOT_TESTED；J06 M2 / B 仍 DISABLED | completed、retiring/released 分开展示；UNKNOWN/未释放保留原步骤屏障，不自动继续；仅匹配持久 Result+released 或确定未提交栅栏可结清 |

**实际修改与复用：** `src/ui/main.js`、`model.js`、`style.css`、原 UI 测试与新增 `tests/webflow-recovery-ui.test.mjs`、独立 `tests/webflow-ui-server.mjs`、`tool.config.json`、唯一正式 JSON、README/项目 AGENTS、App CI 和原 Web Flow 包 workflow。复用既有 tasks.start/read/stop、五字段 opendesk.task.intent.v1、唯一 Task Authority/RunHost/Result/安装器；没有第二 Runner 或业务数据库。AppStorage 只保存导航 locator、输入及摘要，不持久化 Controller Result/value。

**已复现并关闭的 UI 缺口：** 首次渲染崩溃、查询条件错误/丢 taskId、start 前丢稳定 ID、旧记录无查询入口、UNKNOWN 或 Result 完成时提前解除屏障、迟到回调覆盖 Stop/新步骤、旧摘要存储倒退、清理 ACK 丢失后无法对账、Stop 打断 locator 恢复后冲突、未提交步骤查询/取消/保存失败后丢入口、确定未提交栅栏重开复活、历史恢复读取失败时放行新准入、未读旧历史被覆盖，以及撤权错误与旧成功提示并存。只在原 UI 上修复这些核心阻塞，没有整套重设计。

**验证与包：** 最终相关输入下 38 项不同定向检查 PASS：29 项实际 React/DOM 事件行为、6 项原模型/包消费者、3 项原委托包合同；原 `final-checks-r3.log` 37 项加 `history-merge.log` 1 项，版本提升后仅复验 9 项相关模型/包门禁，不重复累加。四个相关 JS 语法检查、diff 检查和原包校验通过；旧框架六个输入 SHA 全与 `artifacts/j06-recovery-20261102/verification.json` 相同，复用其 92 项原组件结果，不重复运行。事务/SDK 替身不是真实 Chrome IDB。

最终唯一包 `projects/webflow/webflow.opendesk-tool.json`：**v0.3.3，51,599 bytes，SHA-256 `a4e19613ed022e43cf43e6a4e6783b9729b9a8c320893aef14d18001638d1d21`**；原打包器 candidate → 相关门禁 → promote-from → check-project，已确认正式包与源码同源，`installed:false`。本地最后修复改变字节，遵守同版本不可替换规则递增版本；没有保留第二份正式 JSON。Chrome 页面加载的真实 UI 输入为 main `331be5278875…`、model `dee959d35a73…`、CSS `25618bf6a84b…`，与包中的源输入相同；HTML 壳/SDK/安装身份为明确隔离夹具，不是原 Host。

**原始证据：** `artifacts/j06-ui-20261102/verification.json`、`final-inputs.json`、`ui-browser-final.json` 及 `final-{held-result,reopened-result,revoked-query}.png`。最终组件夹具的 ID 为 `webflow:edf7dce8-e89e-4325-a663-a5588e5c93ce`，run/result 为明确 `fixture-` 标识，模拟派发始终 1；真实 App generation/clientRequestId/runId/resultId/Worker/Retirement/@slot 均未取得。中间候选及红灯日志另留原文件，不冒充最终输入。独立只读审查 Bohr `01a19ba6-5435-7883-9892-3ffd933cbc6b` 已复核并关闭本轮已报项；最后三项定向复验通过，不重复累加，不能代替原生验收。

**环境与生命周期：** 本次 Chrome skill 连接成功，但对现有 OpenDesk 内部页返回 `Chrome internal tab 759148481 cannot be claimed`，仅列出 viewport 能力，没有可信 Side Panel 控制入口；没有 raw CDP、替代通道、Profile/存储读取或安装绕路。日常路径仍 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`，仅有旧磁盘开发包；PID 40544 不存活，serve/实际启用路径与 ID/Go doctor/Native allowed_origins 配对未核实，没有新 Browser writer 或 dist 覆盖。Cookie account-share 审查 pin `6124420696da31472805467c9a09ef9640b5d388` 与当前磁盘 blob `6aa681f2c82299471f55586e9783d21dee95128e` 仍不匹配，未跳过来源门禁或改该 owner 的 pin。独立组件页上的阅读目录悬浮层曾遮住鼠标 Tab 目标，按原 UI 键盘导航正常切换，分类为夹具环境干扰，未修改阅读目录。所有本任务组件页已 finalize，独占 fixture 服务已停止；未运行真实 Task、修改授权、安装/卸载或清用户记录。当前 `get_goal=null`，未创建/迁移/暂停/完成其他目标。

**七项评分：** 产品 UX、MV3/SDK、身份兼容、安全、可靠性、测试交接、跨领域综合均 `NOT_SCORED`，平均 `NOT_SCORED`；核心真实链尚未通过，不把源码复审或组件测试抬成 95 分。真实核心通过后再逐项独立审查，平均仅按七项和除以 7。完整 production、原编号原文缺失项、GC/任意历史清理、Worker 存活证明、M2/B 自动续跑继续保留原 NOT_TESTED/延期边界。

**唯一下一条未完成操作：** 在现有、配对已核实且包含 J06 Framework 的持续开发 Chrome，通过原可信 UI 同 ID 审阅更新上述唯一包，再打开 Web Flow；已有 UNKNOWN 先查询原步骤，不能新 Run。随后用已有安装授权 A 完成真实 Run → 关侧栏 → 重开 → 记录查询同一 Run/Result，并只验证受影响取消/撤权/释放保护。当前工具不能代操作该可信入口，需由该正常 UI 提供合法入口；更新 JSON 不会把旧 Browser 的固定 Host 一并更新。先处理对应原来源门禁/serve/配对的实际阻塞，不重复已有效 Node 检查，不以本轮提交冒充核心原生完成。

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
| FIFO 和对应回复栅栏 | `node --test examples/sidebar-tools/ai-send-queue/tests/engine.test.mjs` |
| 输入恢复、草稿和用户入口 | `node --test examples/sidebar-tools/ai-send-queue/tests/main-recovery.test.mjs` |
| 唯一编辑器、一次点击、消息回读 | `node --test tests/environment/chatgpt-bridge-site-r13.test.mjs` |
| 持久一次性记录、撤权、document 身份 | `node --test tests/environment/chatgpt-fixed-bridge-r12.test.mjs` |
| 已安装 Task、参数及结果上限 | `node --test tests/environment/chatgpt-installed-task-host.test.mjs` |
| 固定 A→B 计算接力状态逻辑 | `node --test tests/environment/chatgpt-relay-calculator-r1.test.mjs`；fake Page 不执行真实 DOM callback，不能证明原生输入或跨 document 通过 |
| 调度持久状态 | `tests/environment/scheduled-tasks-r1.test.mjs`；执行前先读用例及依赖，只选择直接相关部分 |

新增行为测试应进入对应 owner，名称按行为命名，不按每轮日期复制。每次执行前说明该验证对应哪个实际变化或失败。以上命令不要求本轮全部运行，不替代真实网页验收，不触发全仓 CI、production、评分或长时间压力测试。

## 6. 当前断点与下次续接提示

**历史方案工作：** 独立应用目录、需求、五阶段与八项执行任务保持原记录。**当前 V0.1-R2 已有源码及组件增量，准确输入、测试与剩余阻塞见第 12 节**，不能继续把“产品源码未修改”的旧结论用于本轮。

**下一条用户操作（当前第一阶段）：** 在来源审查通过且加载/Native 配对已核实的持续开发环境中，打开「扩展 → Web Flow」，审阅百度精确范围并开启页头下的自动运行滑块；在已建立完整轮次并加载监听器的 ChatGPT 对话中发送新测试文本，取得唯一完整协议回复后观察自动执行百度、前三条真实结果及原 Durable 状态。无需逐条手动采用/Run。关闭、重复及撤权拒绝继续验证；原回传保留，多步骤、跨对话、MCP、完整 AI 续答验收与 production/评分不作本阶段前置。来源门禁和工具不能控制可信 Side Panel 的现场限制见第 12.11 节。

**在进入跨对话前并行完成的技术项：** AWB-03 完整回复/产物合同与 AWB-05 仓库绑定合同。不可因为先做 P0 而丢失后续连续任务目标，也不可为写更多框架文档推迟已能执行的最短核心操作。

**仍待真实证明：** 当前安装候选真实搜索、ChatGPT 新对话交接、目标仓库执行、Gemini 输入输出、跨日恢复。历史 README 中已有成功只对其原候选与实际范围成立。

可复制的续接内容（普通说明，不是可执行 `opendesk-task` 命令）：

> 继续 shopable-ai/opendesk-browser 的 OD-AI-WORKFLOW-BRIDGE。先读取根 AGENTS.md、projects/webflow/AGENTS.md、projects/webflow/README.md、projects/webflow/docs/product-contract.zh-CN.md 和 projects/webflow/docs/execution-plan.zh-CN.md，再核对当前 main、相关改动、owner、授权及真实环境。先报告当前阶段、首项未完成操作和证据缺口，再执行依赖满足的最小任务。复用 examples/sidebar-tools/ai-send-queue 和原 Authority/RunHost/Durable Result；保持五字段协议、单站任务和 UNKNOWN 不重放。只有真实结果才能更新完成状态；无本机 Chrome 则保留 NOT_TESTED，不伪造浏览器行为。每次结束更新同一记录的断点，不另建总 GOAL，不自动进入已延期的发布或多 Profile 阶段。

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

**为何还会看到点击：** 首次安装/升级的权限审阅、缺少真实网站权限，以及没有匹配执行许可时，仍需要准确的用户操作。旧“预批准一次 · 5 分钟”仅允许下一条完全匹配的命令运行一次；2026-11-02 用户已批准第 10.8 节的当前聊天有界多次许可，参数可按安装 Schema 变化。匹配后自动发现、准备并执行，不再点“采用/执行”。“查看执行页面”只观察已存在的目标，不能用于补开或补执行。许可用尽、过期、目标/安装变化时停止，不静默扩大范围。

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

计算接力的当前 [README](../../../examples/programs/chatgpt-calculation-relay/README.zh-CN.md)、[输入输出合同](../../../examples/programs/chatgpt-calculation-relay/CONTRACT.zh-CN.md) 和 [EVIDENCE.json](../../../examples/programs/chatgpt-calculation-relay/EVIDENCE.json) 与历史相互印证。本轮只读核对其构建索引中七个源码/配置文件，SHA 均与记录一致；这证明当前文件仍对应历史来源，**不证明今天 Chrome 的安装/登录仍相同**。发送队列以[当前 README](../../../examples/sidebar-tools/ai-send-queue/README.zh-CN.md)和现有 `src/page/engine.js` 为准，不恢复已被取代的侧栏同步目标。

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

### 10.8 当前聊天授权体验优化（2026-11-02）

用户同意优化并要求设置目标，当前目标为：发送约定命令，识别后一次确认；连续命令可先「允许本聊天」，减少与实际授权无关的条件。此授权覆盖 BR-05 的本节有界多次许可，不启动 P1/P3、自然语言脚本选择或用户消息直接触发。原生 goal 仅覆盖本次实现与最小验证。

**已实现的下一条用户操作：** 同一窗口保持 OpenDesk 侧栏打开，在正式 ChatGPT 聊天发送五字段命令；自动识别后点击「执行」或「允许本聊天」。也可先选择已安装脚本、核对自动填入的首页或填写精确目标后点「允许本聊天」，无需预先填齐参数、清空草稿、移除附件、结束 IME 或等待旧回答。实际执行仍要求完整合法候选。许可固定当前 tab/document/chat、安装快照与精确 targetUrl，30 分钟内最多 10 次，参数逐次按已安装 Schema 校验；识别后批准当前命令会执行并占一次。单独撤销与停止均阻断后续自动许可，旧单次预批准放在「更多请求方式」。

**边界与复用：** 归属为既有第一方可信 Bridge；Page 的 ISOLATED 按钮 → 可信 Side Panel Host → SW 原 trigger-ledger → 原 Authority/RunHost/Controller → durable result → 原聊天。未新建授权存储、Runner、SDK 或业务脚本。平台改动限 `chatgpt-fixed-bridge-{page,host}.js`、`chatgpt-bridge-trigger-gate.js` 和 `tool-shell.js` 原消息路由，对应测试归根环境合同；百度/Google Task 及 WebFlow 离线模块未改。保留并行 ScrapyJS 改动、现有 main、PID14813 watcher 与 `dist/development`，未提交、推送、重装或发布。

**必要保护：** 高级入口手动采用历史回复不会消费聊天许可或自动执行；仅 discovery 确认的新完整命令可自动匹配。批准等待期间保留新发现，空闲后复核原聊天、精确节点/文本和完整状态再采用一次。采用 ACK 未知或次数失配停止后续分配与自动执行，明确撤销回执后才恢复授权；不重放原候选。真实结果交付形成的 user turn 明确排除，AI 对该结果的续答即使带合法任务块也不自动执行。草稿/附件/IME 的结果发送保护、安装与来源核验、防重放、撤权和 UNKNOWN 均保留。

**当前证据：** 169/169 定向 Node 测试、四个改动 JS 语法检查和本次 diff 格式检查通过。独立只读复核提出的五处问题已补复现回归并修复，最终未发现新增可操作缺陷；因审查环境没有 LSP diagnostics，仅返回 COMMENT，未冒称正式 APPROVE。

持续开发环境真实 Chrome 扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 已显示 serve 连接、指纹 `31571ba55e65`：输入自建草稿且参数缺 query 时授权成功，草稿原样保留。随后同一许可分别搜索 `OpenDesk Browser` 和 `browser automation documentation`，均返回 3 条真实结果，各向原聊天交付一次并完成 AI 续答，资源释放，次数 10→9→8；观察到目标搜索页自动显示及原聊天自动返回，临时许可已明确撤销。对应 run/result 为：

| 查询 | runId | resultId |
| --- | --- | --- |
| OpenDesk Browser | `9903a3ff-1b10-47b2-9b43-84aae6aa17e1` | `9bee37db-cc92-4887-85ed-87b033dbc33e` |
| browser automation documentation | `99f8facb-22c4-4b40-8096-439d2ba83ba1` | `bf6ef3e2-651e-4c02-8631-47fda055d460` |

本机补证：[摘要与源码指纹](../../../artifacts/webflow-approval-20261102/summary.json)、[定向检查日志](../../../artifacts/webflow-approval-20261102/targeted-tests.log)，均为本机临时证据。两轮原生搜索发生在最后 UNKNOWN 入口与结果 turn 保护补丁之前；这两处最终补丁由定向组件回归验证，随后在空闲聊天刷新加载，未将其完整原生异常复验标为 PASS。production、Google 新许可原生复测、完整异常矩阵及评分均为 NOT_TESTED，不阻塞本次核心开发收尾。

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
| 五字段候选 | [chatgpt-task-request.js](../../../src/native-agent/chatgpt-task-request.js)，旧 `validateChatGPTTaskIntent` / 新 `validateWebFlowTaskIntent` | 原审计对应旧手动/五分钟路径：严格接受 `opendesk.task.intent.v1`，仍拒绝将 Web Flow 名称作为它的别名。**后续 V0.1-R2 已批准单独的持续自动路径**：`WEBFLOW_TASK_INTENT_PROTOCOL` / `validateWebFlowTaskIntent` 接受 `webflow.task.intent.v1`，不是旧协议改名或兼容别名。两者同为 protocol/candidateId/taskId/targetUrl/args 五字段；旧任务安装 pin 不变。当前自动样例见第 12.11 节；旧入口回归仍为 `tests/environment/chatgpt-task-request-r1.test.mjs`。结果格式保持 `opendesk.task.result.v1`。 |
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

## 12. V0.1-R2 持久授权与自动准入（2026-11-02）

**当前阶段：本地增量实施与定向验证。源码/组件证据已取得；真实 Chrome E1–E3 `BLOCKED / NOT_TESTED`，未达 `PRODUCT_DONE`。** 本节由任务 `01a19870-e952-79a0-a5f2-989b1d7270f7` 写入；完成本轮证据登记后将此文件后续写入权交回 V0.3.1-R2。BR-01–12、AWB-01–08、历史原生证据、131 项离线队列及延期事项均保留原范围，不转为本轮结果。

### 12.1 实际现场、所有权与差量

- 实际 cwd `/Users/mac/Documents/workspace/opendesk-browser`；不是提示词中的 `/Users/shopme/...`。分支 `main`，基线/本轮结束前 HEAD 为 `cf552718107898eea76890f6c755ecf654a0b948`。未新建分支/worktree/PR，未 stage、commit、push、release。
- `git ls-remote origin refs/heads/main` 因 SSH `Permission denied (publickey)` 失败；本轮远端 main 未核实，不修改认证。原工作区 Cookie Editor、ScrapyJS、云控等 dirty 保留；本轮新增或修改文件详见 12.3。当前正式 Sidebar JSON 仍是 v0.3.0，未修改它或 V0.3.1 Owner 保留的 UI/config/package 文件。
- 本机没有找到 `opendesk-webflow-v0.1-incremental-kit.zip`；跳过旧包，直接依据当前源码实施。`artifacts/web-flow-20261101/public-search-evidence.md` 缺失；历史 13/13 没有本机源码/原始报告可配对，记 `NOT_VERIFIED`，未重建、未转记。
- 当前模型 `gpt-6.1-sol`；独立审查使用独立子 Agent，同仓只读审阅。没有修改系统模型、权限、provider 或认证配置。
- 日常产物目录现存 `dist/development`，磁盘 Manifest `OpenDesk Browser Developer@0.1.0`，原开发指纹 `fc8a5a144c80c721c0054780365810d9f1f471c57b029401ddfd1ed5b76dcbb1`；锁文件登记 PID `40544` 实读已不存活，未证明 serve 客户端连接。**磁盘产物不能证明真实已加载路径或运行身份。** 本轮没有启动/替换 watcher 或写入该目录。
- Chrome 只读列页成功；已有详情页 URL 含 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`，它只是可见 URL，不当作实际启用 ID/Native 配对证明。浏览器工具拒绝访问 `chrome://extensions/` 并明确禁止绕路，故不能完成真实加载路径、ID、Go doctor/allowed_origins 与可信 Side Panel 的配对核验；未抢占其他 owner 的 Profile/DevTools/Side Panel 或测试页。

| 能力 | 恢复时差量 | 本轮结果 |
| --- | --- | --- |
| 已安装 Task 解析、安装 pin、Schema/Origin/网站权限、Authority/RunHost/Controller、Durable 与原聊天发送 | `ALREADY_DONE` | 复用原链，新增路径再次核验 |
| 旧 `opendesk.task.intent.v1`、手动采用和五分钟批准 | `ALREADY_DONE` | 保留；与新持续路径分离 |
| 新 `webflow.task.intent.v1` 及严格最新唯一完整候选 | `MISSING / NOT_WIRED` | `SOURCE_IMPLEMENTED / COMPONENT_TESTED` |
| 持久逐任务批准、默认关总开关、撤销、重启恢复 | `MISSING` | `SOURCE_IMPLEMENTED / COMPONENT_TESTED` |
| 可信设置 UI、自动发现到原执行链 | `NOT_WIRED` | 固定编译的可信设置接线；沙箱无私有授权 API |
| 撤权与实际 Controller 提交原子排序 | 旧允许回执竞态由独立诊断证实 | 最小 Foundation 可注入守卫，持有原账本序列到原 Authority 准入返回 |
| 同候选真实 Chrome 首次/再次自动执行及撤权拒绝 | `NOT_VERIFIED` | E1/E2/E3 `BLOCKED / NOT_TESTED` |

### 12.2 安全合同与独立审查修复

批准在 `storage.local` 的 `opendesk.webflow.auto-trigger-grants.v1` 持久保存，由既有单 SW Ledger 队列唯一写入；它是**自动提交许可**，不是第二执行 Authority。绑定 `taskId/version/manifestHash/contentHash/scriptId/revision/installationId/generation`、精确 `targetUrl` 与 Schema 归一化的完整 `args`。`contentHash` 就是原 Manifest `program.sourceHash` 对应源码身份，不创建两份新哈希语义。任务/权限/来源变化仍经原 Resolver 与 Authority 拒绝。

可信入口是现有 Side Panel 设置 sheet 内的固定组件。准备审阅不授予权限，批准/开关/撤销须原生可信事件；SW 再按真实 `MessageSender` 和 `runtime.getContexts(SIDE_PANEL)` 核验。批准适用于保持可信侧栏打开的窗口中、匹配范围的 ChatGPT 官方对话；结果自动发送到触发的原聊天，界面明确披露。沙箱项目没有获得 `chrome.*`、私有存储、内部模块或秘密 RPC。

原 512 项 candidate 墓碑继续持久保留；新持续路径拒绝跨对话重复 candidateId，旧手动路径保留原范围。requestId 由 Host/SW 生成。新自动准入、reserve、check-consumed、实际 Controller 提交、Durable 与最终发送均按原身份核验；写入/ACK 不明、UNKNOWN、取消或已提交 Controller 不自动重放。关闭/撤销只阻止后续准入，不承诺回滚既有动作。local 或 session 单点故障有各自恢复拒绝证据；两处同时不可持久写入只能报 UNKNOWN，不能声称撤权已持久成功。

独立复审定位并已定向修复：

1. session get/set 失败不能跳过仍可用的 local 撤权保存；恢复标记不可读时保守关闭并撤销旧批准。
2. 延迟的旧允许回执不能越过已经完成的撤权：原 `createFoundationBroker` 认证后 `startControllerRun` 注入通用可选 guard，业务判断仍在原 Bridge Ledger；提交按原 requestId 找到 consumed row，检查实际源码/参数/目标/安装，先持久标记 `controllerSubmitted`，与撤权在同一序列内执行原 Authority 准入。没有新增 Runner、安装器、任务库或用户可选的绕过字段。
3. 自动设置代次与旧手动/五分钟的权限代次分离；自动配置变化不会误伤合法手动交付。
4. 忙碌期间仅保留一个尚未准入的最新发现引用；前轮确定收尾且 DOM/source 仍匹配时重核，不建跨对话队列，UNKNOWN 不继续。
5. 已知无关 Controller 请求先按持久记录判定归属，不读取 Bridge 专用 session 恢复标记；归属未知仍拒绝。最终提交前无条件检查同来源/请求的撤权标记，覆盖 ledger 读取及保存期间撤销。权限撤销代次在首个异步上下文查询之前捕获，拒绝迟到 enable/grant；存储键序变化按规范化数据比较。
6. BFCache 返回重建观察基线，dispose 同步取消旧 owner 并使在途准入回执失效；暂存观察绑定用户/回答字节，改动后即使恢复原文也不复活；旧候选不恢复执行；设置读失败/挂起仍可显式关闭未来准入，保留上次已知项供撤销。安装 pin 变化说明需重新批准，目录缓存失效时显示待核验；IME Escape 保留编辑。真实 Host 的 taskId 投影和空 ID 拒绝经实际组件接线验证，目录挂起仍可逐任务撤销。

### 12.3 修改文件与职责

| 文件 | 必要职责 |
| --- | --- |
| `src/native-agent/chatgpt-task-request.js`、`workspace-chatgpt.js`、`chatgpt-task-discovery.js` | 新旧协议分离；完整、最新、唯一候选及引用/混合/重复字段拒绝 |
| `projects/webflow/src/auto-grants.js` | 独立纯数据策略与精确安装/范围规范化，固定可信消费者使用 |
| `src/native-agent/chatgpt-bridge-trigger-gate.js` | 原 SW Ledger 内持久设置、撤权恢复、自动准入和 Controller 提交围栏 |
| `src/native-agent/chatgpt-fixed-bridge-host.js`、`chatgpt-fixed-bridge-page.js` | 当前安装解析、自动观察接线、执行前/发送前核验；复用原执行/交付及生命周期 |
| `src/platform/host/broker.js`、`src/sw.js` | 已证实旧 ACK 竞态的最小通用提交 guard 接线；原认证与权限不变 |
| `projects/webflow/trusted/AutoSettings.tsx` | 真实可信设置审阅、总开关、撤销及诊断；不在沙箱 `src/ui/` |
| `src/ui/tool-shell.js`、`src/ui/react/main.tsx`、`app-shell.tsx`、`components/provider-settings.tsx` | 唯一 React 根与现有设置 sheet 的窄 controller 传递，以及受影响 IME Escape 修复 |
| `scripts/bundle-provenance.mjs` | 仅上述纯策略/可信组件两个精确 blob 及既定输出目标允许；沙箱源码继续拒绝 |
| `projects/webflow/tests/auto-{grants,host,settings-ui}.test.mjs` | 授权/撤销/重启/失配、原路由→Host→Durable→交付组件测试和真实组件交互 |
| `tests/environment/chatgpt-independent-task-intent.test.mjs`、`chatgpt-task-discovery-p0.test.mjs`、`chatgpt-installed-task-host.test.mjs`、`webflow-fixed-source.test.mjs` | 协议/DOM 接线、延迟回执/BFCache、旧手动兼容和固定来源边界回归 |
| 本文件、`product-contract.zh-CN.md` | 唯一进度与现行协议/批准范围同步，保留所有稳定需求编号及历史 |

V0.3.1 Owner 的 `src/ui/main.js`、`model.js`、`style.css`、`tool.config.json`、`webflow.opendesk-tool.json` 均未修改。未运行 131 项离线队列、根 npm test、历史搜索实验、安装/打包晋升或视觉矩阵。

### 12.4 定向验证与证据入口

本轮变更后的 Bridge/权限/旧入口、设置及来源检查共 **217 项 PASS，0 FAIL，退出码 0**。源码版本为基线 HEAD 加未提交增量，28 项具体源码/测试 SHA-256 见 `artifacts/web-flow-20261102/v01-r2/source-inputs.json`；测试后输入复核未变化。每项行为名称与结果保留在对应原始日志，未执行的真实网站动作不包含在此分母。

| 命令 | 退出码 | 结果 / 原始日志 |
| --- | --- | --- |
| 下方 Bridge 定向组 | 0 | 191 PASS；`artifacts/web-flow-20261102/v01-r2/bridge-tests.log` |
| `node --test projects/webflow/tests/auto-grants.test.mjs projects/webflow/tests/auto-host.test.mjs projects/webflow/tests/auto-settings-ui.test.mjs` | 0 | 26 PASS；`artifacts/web-flow-20261102/v01-r2/authorization-tests.log` |
| `node --check src/native-agent/chatgpt-fixed-bridge-host.js`、`chatgpt-fixed-bridge-page.js`、`chatgpt-bridge-trigger-gate.js`（分别完整路径）以及 `node --check src/sw.js`、`node --check src/platform/host/broker.js` | 0 | 受影响 JS 语法 PASS；TSX 由真实组件测试和定向构建编译 |
| `git diff --check -- <本轮源码、测试与两份文档的实际路径>` | 0 | 差异格式 PASS；未运行产品环境 |

Bridge 定向组的完整可执行命令：

```sh
node --test \
  tests/environment/chatgpt-independent-task-intent.test.mjs \
  tests/environment/chatgpt-task-discovery-p0.test.mjs \
  tests/environment/chatgpt-installed-task-host.test.mjs \
  tests/environment/chatgpt-installed-task-scope.test.mjs \
  tests/environment/chatgpt-fixed-bridge-r12.test.mjs \
  tests/environment/chatgpt-fixed-bridge-r13.test.mjs \
  tests/environment/chatgpt-bridge-site-r13.test.mjs \
  tests/environment/chatgpt-bridge-cancel-page-r21.test.mjs \
  tests/environment/webflow-fixed-source.test.mjs \
  tests/environment/scoped-schema.test.mjs
```

验证原因：新增协议和自动发现需要确认只有当前新回复会触发；持久准入/撤权需要确认单点存储故障、异步旧 ACK、权限移除、安装变化、重复及 Worker 恢复不重放；Host/设置接线影响旧手动交付、原聊天草稿/IME/取消、来源和固定编译边界，故执行对应既有测试。没有重跑无关队列、历史网站实验、全仓 CI 或缩放矩阵。

初始 RED 为缺少 `auto-grants.js`（exit 1）；集成过程中修正了测试 fixture 缺少 Schema title、同步拒绝断言和 macOS 临时目录真实路径问题，并按独立复审补充真实缺陷负例，没有放宽安全校验。临时构建驱动的未初始化 Rollup 配置、未调用 unlisted main、virtual entry 解析问题归类为验证驱动故障，保留日志；这些早期输出不算最终运行入口产物。

### 12.5 真实 Chrome 场景与剩余阻塞

| 场景 | 本轮真实结果 | candidate / request / run / result / 原聊天 |
| --- | --- | --- |
| E1 首次在可信 UI 批准百度任务，再自动执行 | `BLOCKED / NOT_TESTED` | 未生成，未发送测试消息，未取得网页动作或 AI 续答证据 |
| E2 同批准下全新 candidate 再运行，无重新批准 | `BLOCKED / NOT_TESTED` | 未生成；组件中两个独立 request/run/result 不冒充 Chrome 身份 |
| E3 撤权/关闭后新候选拒绝 | `BLOCKED / NOT_TESTED` | 只有组件拒绝证据，未取得同 Chrome 候选证据 |
| Google 独立真实闭环 | `NOT_TESTED` | 安装、站点和测试资源未核实；未重做历史实验 |

仓库内百度包为 `baidu.search.top3@1.1.1`：manifestHash `adf0cc21e1aa498b169846256f92cf65da42f3c9d27011b29205e164f26bea4b`，program.sourceHash `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8`。Google 包为 `google.search.top3@1.0.0`：manifestHash `c66250e9e7002f0968a9f38935bcbe565fe37f9109cfa04e6005ff3058c04261`，program.sourceHash `f3d3e21b8d9467366708745b6207a9d70d2b6fc7a401d71798bbb2ef823fd7ad`。**这只是仓库包事实，当前 Chrome 实际安装版本、installationId/generation、网站权限均未知；不安装覆盖、不申请网站权限、不清除账本。**

准确阻塞为：

- SW 固定构建的 Cookie Owner 文件 `examples/sidebar-tools/cookie-editor/trusted/account-share.js` 与其现行审查 pin 不符；原构建门禁真实拒绝。本轮不修改该业务或其 pin，不以跳过来源检查制造完整包 PASS。
- `chrome://extensions/` 被浏览器工具 URL 安全策略拒绝且禁止绕路，实际加载/Native 配对/可信 Side Panel 与原安装无法核验；磁盘旧产物与过期锁文件不能代替连接。没有同候选的 E1/E2/E3 原生证据。
- SSH 远端只读核验失败只影响远端观察，不阻塞本地增量源码与组件工作；未修复系统认证。

**唯一下一条产品操作仍是 E1 的可信设置首次批准。** 由有权使用现有开发资源的本机 owner 先恢复并核对同候选的持续开发入口，完成上述来源审查与加载配对，再走 E1→E2→E3；不得靠新 Profile、重装/改 ID、重发历史候选或清空 UNKNOWN 绕过。上述阻塞不扩展成重新研究全架构或完成 V0.3.1 UI 的条件。

### 12.6 给 V0.3.1-R2 的交接

- 复用本轮新协议 parser、固定可信设置、原 Ledger/Controller 提交 guard 和定向测试，不重写持久许可、Runner、Authority 或安装器；用户操作入口为现有可信设置 sheet 内「Web Flow 自动准入」。沙箱工具继续只走既有公开 SDK，不导入 `trusted/AutoSettings.tsx` 或私有 Host。
- V0.3.1 保留的五个 UI/config/package 文件未写入；正式包、安装与视觉验收仍归原 Owner。这里的可信源码随 Browser 固定入口编译，不靠升级沙箱 JSON 获得权限。
- 本轮产物仅在 `artifacts/web-flow-20261102/v01-r2/`；无 watcher、监听端口、Profile、Native 请求或真实任务运行由本轮长期持有。原有他人服务未停止；本轮临时编译/测试结束后确认进程退出，浏览器只释放本轮会话及临时空白页，不关闭他人页面。
- 当前没有创建 GOAL，也未改写其他任务目标；完成的是本轮安全可实施的源码与组件部分。跨对话编排、Gemini、持久队列/跨日恢复、正式沙箱包安装及 production 验收继续延期；本轮不声称暂停、迁移或完成其他 GOAL。

### 12.7 新版五字段手测提示词

前提：同候选真实可信设置中审阅并批准百度任务，精确地址 `https://www.baidu.com/`、参数 `{"query":"OpenDesk Browser","limit":3}`，开启总开关，并保持同窗口可信侧栏打开。当前原生入口尚被阻塞，下列文字只供恢复后手测，粘贴本身不批准权限。

````text
请使用 OpenDesk 已安装的百度前三条任务搜索 OpenDesk Browser。
本次先只输出一个完整的 opendesk-task 代码块，不使用其他工具或自行搜索，不加说明，不输出安装身份或其他字段：
```opendesk-task
{"protocol":"webflow.task.intent.v1","candidateId":"wf-r2-manual-20261102-001","taskId":"baidu.search.top3","targetUrl":"https://www.baidu.com/","args":{"query":"OpenDesk Browser","limit":3}}
```
收到 OpenDesk 的 opendesk.task.result.v1 真实回传后，根据 data 的实际状态、结果和链接用中文回答；搜索受阻或无结果就明确说明，不编造，也不要再次输出任务候选。
````

每次试验须使用从未提交过的新 candidateId；E2 仅改为 `wf-r2-manual-20261102-002` 等新值，任务/地址/参数保持审阅范围。E3 先在可信设置撤销或关闭，再使用另一个全新 ID 验证拒绝。以上样例 ID 若曾使用，不可再次使用；历史或 UNKNOWN 候选绝不重发。

### 12.8 最终固定入口构建、独立评分与交接状态

**本轮最终状态：`SOURCE_IMPLEMENTED / COMPONENT_TESTED`；下表两项定向入口 `BUILD_VERIFIED`。完整 SW/可安装 Browser 包未验证，`CHROME_NATIVE_VERIFIED` 与 `PRODUCT_DONE` 均未取得。** 这里的临时静态编译不切换日常开发模式，不替换扩展加载目录。

| 最终命令 | 退出码 | 真实产物 / 结果 |
| --- | --- | --- |
| `node artifacts/web-flow-20261102/v01-r2/verify-fixed-build.mjs chatgpt-fixed-bridge` | 0 | `fixed-build-yUFz0a/agents/chatgpt-fixed-bridge.js`，61,650 bytes，SHA-256 `51e7ff1bf757851402bd08fc4c30ff12d3fe9100dc33224c482d84eaad461507` |
| `node artifacts/web-flow-20261102/v01-r2/verify-fixed-build.mjs tool-shell` | 0 | `fixed-build-INphur/ui/tool-shell.js`，2,723,317 bytes，SHA-256 `e3199a3819f5e1957aba479c252e5e747338663cfe8a601f46fabae44163e5ff` |
| 两产物的原 `assertClassicIIFE`、`inspectScript` 与 emitted feature 检查 | 0 | `fixed-code-checks.json`：classic IIFE、原 CSP AST、实际输出包含自动路径/可信设置均 PASS |
| 原固定 SW 来源门禁 | 1 | `build-2.log` / `fixed-build-L3Btlz/report.json` 中 Cookie `account-share.js` 未审 pin 拒绝；`BLOCKED`，未覆盖它或放宽门禁 |

以上输出目录均在 `artifacts/web-flow-20261102/v01-r2/`。驱动复用实际 `src/entrypoints/`、WXT 固定构建钩子、版本/来源/体积检查；显式执行 unlisted main 并保留定义导出，避免临时库入口裁掉业务接线。只证明受影响入口可编译及输出检查，不是完整 WXT 包、Chrome 加载或正式发布证据。可信组件精确 Git blob 为 `70340abbd23b41a9e3c09f85b900e6c45bca042a`，纯策略为 `c3ad731585e6aa55755185242e47e7c8a32f7b11`；除此两个输入没有新增项目源码泛许可。

五份评审均来自独立上下文、只读子 Agent，完成复审后记录下列最终评分；它们是**源码与 Node 组件层**评分，原生产品层没有证据就不评分。

| 独立视角 / Agent | 最终分数 | 已报缺陷的复核结论 |
| --- | --- | --- |
| 产品与 UX / Ampere `01a19881-90b7-7bb1-a96f-686e5c78648e` | 94/100 | taskId 真接线、紧急关闭/撤销、缓存诊断、来源/自动回传披露及 IME 已修；限定范围无剩余确证源码阻塞 |
| Chrome MV3 与生命周期 / Hilbert `01a19881-9251-7123-97af-cfd975e81681` | 95/100 | 实际 gate 读取期间取消复现变为 Authority 0 次，含 final-save、BFCache 和延迟启用围栏 |
| 安全授权、撤权与防重放 / Maxwell `01a1987e-ba7a-7602-80f8-ea7b8d2cab71` | 97/100 | source/request 读取及保存期间取消均拒绝；UNKNOWN 与持久围栏保留，最新已报 P1 关闭 |
| Controller/Bridge 架构复用 / Heisenberg `01a19882-a254-7110-9e98-c4d3c129787f` | 97/100 | 原执行权威复用；无关 Controller 不依赖 Bridge 坏 session；在途旧页面不重发 |
| 测试、可靠性与证据 / Singer `01a19881-9497-7040-b9b0-d095c64c26a4` | 93/100 | 生命周期及暂存内容版本负例已通过，限定范围无新确凿缺陷；原生证据不足仍保留 |
| **五项算术平均** | **95.2/100** | 不能替代 E1–E3，也不能据此标 PRODUCT_DONE |

最终测试日志为 **191+26=217 PASS / 0 FAIL**，对应源码输入与完整命令、退出码、产物引用、独立评分在 `verification.json`；早期 187+21 与旧源码输入另保留 `.initial.*` 文件，不能冒充最终输入。原生 conversation/tab/document、candidateId/requestId/runId/resultId 均没有生成新测试证据，保持空值与 `BLOCKED`。

本轮临时编译与测试进程均已退出；浏览器会话已 finalize，临时页面关闭，用户原有页面保留。没有停止或接管他人服务，没有持有新的 Profile、端口、DevTools 或运行请求。**此文件本轮写入到此交回 V0.3.1-R2；后续以同一文档登记 E1 起点和真实证据，不重做已通过的离线队列/历史搜索/源码模块。**

### 12.9 本任务恢复与真实入口核对（2026-11-02）

**当前操作仍停在 A/E1：打开同候选可信设置，首次审阅批准百度精确范围。尚无新增真实 UI、Controller、Durable、原聊天交付或 AI 续答通过。** 恢复任务为 `01a198b5-f4a2-7690-819b-e24490e15f20`；按用户授权先实读 `get_goal = null`，随后建立本任务唯一目标，不设 token_budget。首轮与第二轮保持 `active`；同一来源门禁及可信入口阻塞已连续三个目标回合，第三轮实读输入和 HEAD 均未变化，无新增原生证据或可安全独立实施的剩余修复，因此按工具合同调用 `update_goal(status="blocked")`，返回状态为 `blocked`。目标完整保留，未标 `complete` 或 `PRODUCT_DONE`，没有改写原任务或应用数据库。

本次开始的本地 main 为 `d13c975754532cfb6d145c2652f838f4b8a927d2`，证据写入时为 `5ac7718382fcbae15f8b09b94ecd5614ca0e96da`；期间另有 Git 集成任务工作。未 checkout、pull、stage、commit、push 或修改索引；实读仍有 106 个 dirty 文件、staged 为空。原交接任务已 idle；未发现当前本机另一个 Web Flow 写入任务。本文件自恢复读取至写入前 SHA 一致（`d1028ecb57f2d52df37d0edd55874e59b0276b6761ecbb799ba97321ebb8748f`），仅追加本节，不覆盖 V0.3.1 或其他历史内容。沙箱 UI/config/正式包和其他业务源码均未修改。

恢复证据：`artifacts/web-flow-20261102/v01-r2/resume-01a198b5/recovery.json`。它是本次只读诊断与证据复用记录，不是新 Chrome PASS。

后续阻塞审计及目标真实回执：同目录 `blocked-audit-turn02.json`、`blocked-audit-turn03.json`。第三轮再次确认 Cookie 审查 pin/磁盘 blob 不匹配，未重跑测试、构建或被拒绝的浏览器接管。需外部来源审查及合法可信入口发生变化后再恢复；不继续用重复查询、测试或文档改写维持自动续跑。

| 当前核对 | 实际结果与处理 |
| --- | --- |
| 28 项已记录源码/测试输入 | SHA-256 全部一致；复用 191+26=217 项原定向结果，包含可信 UI 10 项组件证据；未重跑测试。没有确证新产品缺陷，不为制造工作改源码。 |
| 两个最终固定入口产物 | 重新读取字节及 SHA，与 12.8 原报告一致；复用原定向 `BUILD_VERIFIED`，不是完整 Browser 包或 serve 连接证明；未重新编译。 |
| 原 SW 来源检查 | 使用原 `describeBundle` 对当前 `sw.js` 的 `account-share.js` 输入只读诊断，仍真实 `REJECTED`。审查 blob 为 `6124420696da31472805467c9a09ef9640b5d388`，磁盘 blob 为 `6aa681f2c82299471f55586e9783d21dee95128e`。Cookie Owner 负责来源审查；本任务不改该业务或 pin、不重复失败构建。 |
| 日常开发模式 | 要求仍为持续开发，目录 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`。磁盘为 Developer@0.1.0，锁 PID 40544 已退出，serve 未证实；当前仅能确认有开发产物，不能声称已连接。未启动 writer/watcher 或写入该目录。 |
| 真实 Chrome 入口 | Chrome 连接成功；对当前列页返回的原 OpenDesk 详情页尝试接管，工具明确返回 `Chrome internal tab 759148481 cannot be claimed`。当前仅公开 viewport 能力，没有可信 Side Panel 控制能力。实际启用 ID、加载目录、Native/Go 配对与 Task 安装身份仍未知；未换控制通道或间接绕路。 |
| A、E1、E2、E3 | `BLOCKED / NOT_TESTED`；未生成或发送新候选，candidateId/requestId/runId/resultId 与原生关联保持空值；组件撤销拒绝不能代替真实 E3。Google 保持 `NOT_TESTED`。 |
| 资源与副作用 | 浏览器会话已 finalize，没有取得用户标签页控制权或新建测试页；未触发 Controller、修改授权、申请网站权限、覆盖安装或清账本，没有持有 Profile/DevTools/Side Panel/端口/watcher。 |

**唯一下一步：由原开发环境 owner 恢复并核实同候选可信设置入口。** 先完成上述 Cookie 输入的原来源审查，在原 `dist/development` 恢复合法 serve 与加载/Native 配对核验；受当前工具限制的 Chrome 内部页和 Side Panel 必须由正常可信界面完成，不能另换自动化通道。入口恢复后直接审阅 `baidu.search.top3@1.1.1`、`https://www.baidu.com/`、`{"query":"OpenDesk Browser","limit":3}`，再执行 A→E1→E2→E3；后续新 candidateId 仍须从未提交，沿用 12.7 提示词但不得重用其中已用 ID。保持 BR-01–12、AWB-01–08、131 项离线队列、跨对话、Gemini、production、完整矩阵及评分延期边界。

### 12.11 当前第一阶段：正式自动运行入口与基础触发接线（2026-11-02）

**最新用户范围优先：** 核心是监听 ChatGPT 新对话内容中的固定协议，自动触发已安装脚本。当前先完成产品 UI 和基础接线；手动恢复不是本轮主线。多步骤 B、跨对话、持久队列、MCP、完整回传/AI 续答、production 和 95 分矩阵延期，已有回传保留。第 12.9 的阻塞是历史恢复结果，不代表本轮没有可独立实施的 UI 工作；第 12.10 的 MCP 工作不成为本轮前置。

**已接通的产品入口：** 「扩展 → Web Flow」宿主页头下直接显示共享 React Aria **自动运行滑块**，默认读持久总开关；“任务范围与授权”展开后使用原可信 Controller 审阅已安装任务的精确地址/参数/安装身份。全局可信设置保留同一个组件。可见开关、准备、批准、撤销均沿原 `createChatGPTFixedBridgeHost` → SW Ledger；每次实际执行仍由 Resolver/Authority/RunHost/Controller/Durable 负责。沙箱只更新操作说明，没有授权 API、第二 Bridge/Runner 或数据库。

| 修改归属 | 本次差量与复用 |
| --- | --- |
| `projects/webflow/trusted/AutoSettings.tsx` | 真实共享 Switch、原生事件转发、可见状态与失败紧急关闭、精确范围折叠审核；产品入口准入判断留项目，其他工具、预览、停用、宿主设置和非当前 Tab 不显示该入口 |
| `src/ui/sidebar-tools.js` / React `app-shell.tsx` / `tabs/tool-host.tsx` | 现有安装 owner 仅投影 toolId/启停/预览/设置展示事实；固定可信组合经可选 slot 放在原 frame 上方；单 React 根、原 iframe 不变，包中 JS 不进入可信页面 |
| 原 `src/native-agent/chatgpt-*.js` / `workspace-chatgpt.js` / Broker / SW | 接续原 owner 已完成的持久自动路径，不复制或重写；保留原 final-submit 撤权与 UNKNOWN 围栏 |
| `projects/webflow/src/ui/main.js` / `tool.config.json` / 唯一正式 JSON | 更新自动入口说明，版本 `0.3.3 → 0.3.4`；仍为同 ID、同能力及固定 Task pins；JSON 不包含可信组件，旧 Browser 必须另有同源固定代码 |
| 项目 `tests/auto-settings-ui.test.mjs` / `auto-trigger-ui-server.mjs` | 增量检查真实 slider/入口隐藏与重开；独立夹具使用真实 Shell、ToolHost、Switch、Host 和 Ledger，安装/Chrome 权限/存储为注入边界，明确禁止 Task start |

**真实鼠标诊断与修复：** 初版只转发 input 点击，React Aria 可见 label 消费鼠标按压，导致点击不保存。已在实际 Chrome 组件页复现并修成转发原始 label/input 可信点击，原同步 lock 防止同次激活写两次；不伪造生产事件。组件夹具确认鼠标 `isTrusted=true` 一次写入、空格键关闭、关重开回读、保存失败不假开、紧急关闭、准备不授权、精确批准及逐任务撤销；无 Console error。此处 **不是安装版可信 Side Panel PASS**。

**本次有效证据：** `artifacts/webflow-auto-20261102/verification.json`、`reuse-audit.json`、`auto-switch.png`、`approved-ui.txt`、`revoked-ui.txt`。原 28 个输入中 23 个 SHA 未变；复用对应原 217 项证据，不重新累加为本次总成绩。以下实际运行于 Node 24.15.0，独立编译不写 `dist/development`：

| 当前行为与命令 | 结果与证据等级 |
| --- | --- |
| `node --test projects/webflow/tests/auto-settings-ui.test.mjs projects/webflow/tests/auto-host.test.mjs tests/environment/webflow-fixed-source.test.mjs tests/environment/chatgpt-task-request-r1.test.mjs` | 22 PASS；滑块回执、Host/Ledger 防重放/撤权/UNKNOWN、真实事件限制、严格来源与旧协议保持，`COMPONENT_TESTED` |
| `node --test --test-name-pattern='Web Flow' tests/environment/chatgpt-task-discovery-p0.test.mjs` | 9 PASS；新完整候选自动提交、无批准拒绝、迟到 ACK / BFCache / 内容变化 / UNKNOWN 不重放；组件证据，非真实聊天 |
| `node --test --test-name-pattern='app declares\|original builder' projects/webflow/tests/webflow-ui.test.mjs` | 2 PASS；v2 包与固定 pins / 仅沙箱源码；没有重做 J06 恢复全组 |
| `node artifacts/web-flow-20261102/v01-r2/verify-fixed-build.mjs tool-shell` | `BUILD_VERIFIED`；`fixed-build-zAIhGg/ui/tool-shell.js` 为 2,724,186 bytes，SHA-256 `8ff0ee9d3dfdf0e075664c8cf243085578666cb37e255947512977c78b5a587c`；原固定来源门禁保持，仅重新审查并 pin 自有 AutoSettings blob `d159b5485315a6cef01fc68967f66d7a016cdf22` |
| 原 packer `--out` → 上述定向门禁 → `--promote-from` → `--check-project` | 唯一包 v0.3.4，51,803 bytes，SHA-256 `5a69f22c3fca72d39cefce7359119230caceeddd3ff86489af44add0a0052298`；同源通过，`installed:false` |
| `node --check`（UI main、原 sidebar-tools 与新增 fixture）/ 范围内 `git diff --check` | PASS；源码语法/差异检查，不替代真实产品操作 |

**谁的文本能触发：** 保持可信 OpenDesk 侧栏打开，同窗口 ChatGPT 官方网页的已有对话已建立完整轮次且监听器已附着后，发送一条新用户消息；只读取随后最新、完整、唯一助手回复的 `opendesk-task` 代码块。候选必须是 `webflow.task.intent.v1` 严格五字段并精确匹配批准范围。用户消息中的 JSON、首次挂载的历史、引用、流式回复、重复 candidate、旧 `opendesk.task.intent.v1` 均不进入此持久自动路径。初次历史建立期间不采用候选；不能将挂载/恢复/历史扫描当成新的执行许可。

**现场测试文本（已按实际 parser 校验，NOT_SUBMITTED）：** 仅在真实安装与范围审核、开关回执完成后使用。下列 ID 本轮未发送；若此后已使用或状态 UNKNOWN，禁止复用或换 ID 补跑。

````text
请只原样输出下面唯一的 opendesk-task 代码块，不自行搜索，不加其他字段或授权声明：
```opendesk-task
{"protocol":"webflow.task.intent.v1","candidateId":"wf-auto-20261102-f7a8d9e1-04e4-4a08-b7be-8ae1f113d440","taskId":"baidu.search.top3","targetUrl":"https://www.baidu.com/","args":{"query":"OpenDesk Browser","limit":3}}
```
````

**真实链尚未完成：** Chrome skill 连接成功，但实测仍拒绝 `Chrome internal tab 759148481 cannot be claimed`，当前能力没有可信 Side Panel 控制。普通 ChatGPT 标签页的接管/快照还发生一次超时，未发送任何测试消息。没有 raw CDP、替代浏览器通道、Profile/存储读取或内部 API 绕路。原 SW 的 `account-share.js` 来源单项诊断仍拒绝，未修改 Cookie 源码或 pin、未启动失败的全量构建。日常仍是原路径 `/Users/mac/Documents/workspace/opendesk-browser/dist/development` 的旧磁盘开发包；无在跑 dev writer，serve 未证明，实际扩展 ID、加载路径与 Go/Native 配对未知；本轮未启动 watcher、覆盖 dist 或替换扩展。两个历史自动 owner 实读 `notLoaded`，本轮接手自动主线；没有接管其他工作资源。

| 普通用户核心链 | 当前事实 |
| --- | --- |
| 打开 Web Flow → 可发现滑块 → 精确审核/开启 → 重开回显 | `SOURCE_IMPLEMENTED / COMPONENT_TESTED / BUILD_VERIFIED`；真实 Chrome 组件页通过，安装版 `NOT_TESTED` |
| ChatGPT 新完整协议 → 无手动 Run 自动执行 | 复用原监听器与 Host，当前 Node 组件通过；真实链 `BLOCKED / NOT_TESTED` |
| 百度真实输入/搜索 → 三条实际结果 → 原 Durable 状态 | `NOT_TESTED`；没有本轮原生 candidate/request/run/result 关联，不以 fixture 填写 |
| 关闭 / 重复 / 未批准 / 撤权 / UNKNOWN 拒绝 | 受影响组件与账本检查 PASS；真实网站级 `NOT_TESTED` |

**唯一下一条未完成操作：** 来源 owner 审查当前 Cookie 固定输入并恢复同源持续开发候选，通过正常 Chrome 可信 UI 核实固定加载/Native 配对后，在「扩展 → Web Flow」审阅 `baidu.search.top3@1.1.1`、`https://www.baidu.com/`、`{"query":"OpenDesk Browser","limit":3}` 并开启滑块，立即执行上述真实新消息自动链。工具不能操作的可信界面需用户正常 UI 完成；不再重做 UI 原型、J06 或已有效的组件检查。此时 `get_goal=null`；没有新建、暂停、迁移、完成其他目标，未标 `PRODUCT_DONE`。

#### 12.11.1 本任务接手、关键条件与真实入口诊断（2026-11-02）

**用户操作结果：尚未完成安装版范围审核/开启，也未发送真实测试消息。** 新 owner 为 `01a19c17-85e6-7643-a203-c2c58be57e24`；先实读 `get_goal=null`，再按交接原文创建唯一目标、不设 token_budget，工具回执及收尾实读均为 `active`。这是本任务第一个目标回合，不沿用其他任务的阻塞次数，不标 `blocked`、`complete` 或 `PRODUCT_DONE`。

实际入口与复用仍为本节的 Web Flow 可信控件和原监听器/Resolver/Ledger/Authority/RunHost；没有新增业务 API、Runner 或安装器。当前本地 `main` 为 `1bb7f1efb8d8a3fc9669ac8007b7ee91228ac1bd`。原记录的 11 个相关输入 SHA-256 全部一致，正式包仍为 v0.3.4 / 51,803 bytes / `5a69f22c3fca72d39cefce7359119230caceeddd3ff86489af44add0a0052298`；复用本节已有源码、组件与定向编译证据，不重复测试或累计成绩。第 12.10 节预存 MCP 改动完整保留、不归本任务提交。

本任务的真实完成条件固定如下；结果回传/AI 续答、多步骤 B 与生产验收继续延期：

| 条件 | 当前阶段必须观察到的事实 | 本轮状态 |
| --- | --- | --- |
| A：实际产品入口 | 同候选安装版「扩展 → Web Flow」真实共享 Switch 可由鼠标/键盘操作；准备不授权、明确批准才保存，关闭重开读回；可核对已安装任务的版本、哈希、代际、精确目标及参数 | `NOT_TESTED`；已有组件证据保留 |
| B：自动触发 | 监听器附着并建立完整历史轮次后，ChatGPT 新用户轮次产生唯一完整五字段助手候选；无需采用/Run/再次批准进入原 Host；保留 conversation/tab/document 与 candidate/request/run/result 关联 | `BLOCKED / NOT_TESTED` |
| C：网页和后续调用 | 同一原 Controller 真实输入/搜索，前三条自然结果与网页及同 Run 的 Durable 数据吻合；同一批准范围的第二个全新合法候选产生独立运行和结果，无需重新批准 | `NOT_TESTED`；验证码或不足三条按事实报告 |
| D：关闭与拒绝 | 真实关闭或逐任务撤销后，新合法候选不产生 Controller 动作；重复 candidate/DOM 不二次执行；范围、参数、地址、安装代际、权限、UNKNOWN/迟到 ACK 的受影响保护保持拒绝 | 网站级 `NOT_TESTED`；同输入的既有定向拒绝证据复用 |

**本轮只读诊断找到了更精确的入口阻塞，未修改其他 owner 源码或 pin：**

- Chrome 连接及列页成功；对新列页中的原扩展详情尝试接管，仍明确拒绝 `Chrome internal tab 759148481 cannot be claimed`。现有能力仅有 viewport，没有可信 Side Panel 控制。对原 ChatGPT 测试对话的一次接管/快照调用超时，未发送消息；随后只按原技能恢复会话并 `tabs.finalize({keep:[]})`，回执 `sessionEnded=true`。用户原页面保留，没有改用其他浏览器、CDP、OS 自动化或私有 API。
- 原来源表目前有**两处** Cookie 输入不一致：`trusted/account-share.js` 的 pin 为 `6124420696da31472805467c9a09ef9640b5d388`、磁盘 blob 为 `6aa681f2c82299471f55586e9783d21dee95128e`；`trusted/account-service.js` 的 pin 为 `f5addf371f529393004d7f9c35c55d7d5cf04a4e`、磁盘 blob 为 `ec2750e5945198d87a60606a40875ffe3f1f3482`。后者 SHA-256 为 `60538f4914922fd111d2c4a052a3c3350d96ecff23fcbb5faf753042b2bf1f2e`。仅 share 当前字节能匹配原 owner 的独立 review `artifacts/cookie-editor-r31/native-control-01a1930d/server-recovery-upgrade-order-final-review-20261101.json` 及对应 provenance 回执；在原唯一证据 JSON 中未找到 service 当前字节的匹配审查。保留拒绝，由原来源 owner 核对并完成最小来源登记；不重新运行相同失败构建。
- 日常模式仍是原 `dist/development` 的旧磁盘开发包，没有运行中的 dev writer，锁中 PID 40544 已退出。未写入 dist、未启动 watcher，serve、真实启用路径/ID/指纹仍未知。`opendesk browser doctor` 真实返回 `connected:false`、默认 `local.installed:false`，原因为 `/Users/mac/.opendesk-browser/native-agent-r1` 不存在；源码指定的默认 Chrome Native manifest `com.shopable.opendesk_browser.agent.json` 也不存在。此事实只说明默认安装，不能替代其他实例/当前启用扩展的现场核对，未擅自 setup/cleanup 或改配对。

原始诊断摘要、输入身份及目标回执保存在 `artifacts/webflow-auto-20261102/resume-01a19c17/entry-audit.json`。本轮没有新增源码缺陷证据，没有修改业务、工具包、来源锁、授权或账本；没有产生 candidate/request/run/result 身份。浏览器已释放，无新增端口、Profile、watcher、DevTools 或在途真实请求。

**下一条可恢复的操作仍是 A。** 先由来源 owner 完成上述两个固定输入的原审查/登记，恢复唯一原开发 watcher；Chrome 控制连接须通过应用插件界面恢复，受限可信界面由用户从正常工具栏打开 OpenDesk。取得真实加载/serve 与所属 Native 的配对证据后，立即在 Web Flow 审阅百度精确范围并开启滑块，再按 B→C→D 验证。旧样例仅保留 `NOT_SUBMITTED` 历史事实；正式试验须先核对账本，任何已提交或 UNKNOWN 候选只对账、不换入口补跑。

#### 12.11.2 本任务第三轮阻塞审计（2026-11-02）

原始回合及两次目标续跑共三个连续回合，来源 pin/字节不一致、可信 Chrome 入口和 Native 配对阻塞均未恢复。第二轮已精确检查 service 的 14 行新增/2 行删除差量，并检索原 Cookie 的 review/provenance/source/verification/result/receipt JSON，未找到当前 blob 的匹配回执；第三轮再次实读上述两个 pin/blob 与上一轮完全一致，默认 Native manifest 仍不存在，也未收到用户的可信入口恢复事实。因此实际调用 `update_goal(status="blocked")`，工具返回 **`blocked`**；完整 objective 保留，未标完成或 `PRODUCT_DONE`。回执在 `artifacts/webflow-auto-20261102/resume-01a19c17/goal-blocked-turn03.json`，第二/三轮诊断在同目录 `blocked-audit-turn02.json`、`blocked-audit-turn03.json`。

A–D 仍为第 12.11.1 节的 `NOT_TESTED` 状态，无真实 candidate/request/run/result。两次续跑均未重试浏览器、测试、构建、打包或 Native 请求，未改业务、来源 pin、安装与授权；原浏览器会话已释放，未持有共享运行资源。需要原来源 owner 完成审查/登记及可信 Chrome/Native 入口恢复后，再直接继续 A→B→C→D；不以重复巡检或另建任务维持续跑。

#### 12.11.3 用户授权桌面操作后的最新现场与交接（2026-11-02）

**最新优先级：** 用户明确授权 Computer Use 直接操作，不再让用户代开侧栏；随后要求创建新任务继续，并建议优先评估「开发 → 本地项目 → 在侧栏调试」及热更新，原安装更合适时可继续。独立专家方案评审争取 ≥95，未审为 `NOT_SCORED`，源码/组件评分不能替代真实核心链。原目标收尾实读为 **`paused`**；这是实际工具状态，未因交接标完成或修改应用数据库。

桌面工具 `mcp__opendesk__tm_*` 实际可用，Accessibility / Screen Capture / Input Monitoring 均获准。原 Chrome skill 的内部页/侧栏控制限制不再是桌面入口不可用的证明。正常坐标点击、网页输入和截图已成功；`tm_focus_window` 的 AppleEvents 激活超时、PID 定向 Unicode 输入失败，以及原生文件框/IME/动画驱动问题与产品故障分开处理，未改产品迎合驱动。最终通过正常系统键盘事件发送 Return 的命令已结束，退出码 0，无该命令在途。没有真实任务消息或 Controller 请求被提交。

**现场证据：** 同目录 `artifacts/webflow-auto-20261102/resume-01a19c17/` 下 `extension-loaded-details.png`、`extension-path-details-02.png`、`sidebar-webflow-search-03.png`、`handoff-sidebar-current.png`。真实启用扩展 ID 为 `ljclbnojkhhgdpoaaggiihlmidgcoihi`，Developer@0.1.0，加载来源确认为本仓库 `dist/development`。最初搜索 Web Flow 无匹配；经原「导入扩展 → 选择文件」进入原生选择器，期间用户中断。**最终只读核对已看到真实 Web Flow 宿主页和「脚本」列表**，选择器已关闭；没有把未观察到的安装确认归为本任务成功，实际安装版本/包 SHA 仍待核对。当前没有可信自动滑块；百度 1.1.1、Google 1.0.0 均显示 `E_PERMISSION: Task is disabled or not installed`，运行按钮不可用。优先查百度原安装/启停，不切回手动 Run 作为主线。

**来源阻塞已有新进展：** 独立只读审查者 Noether `01a19c32-dd16-7550-82b5-53431f59699b` 已完成两份精确源码审核，回执 `source-review.json`：service blob `ec2750e5945198d87a60606a40875ffe3f1f3482` 的损坏 Vault 例外仅允许查看/撤销，账号仍未核实，写入/提交/代际/UNKNOWN 围栏保留；share blob `6aa681f2c82299471f55586e9783d21dee95128e` 与原独立审查完全匹配，不复用已变化 React UI 的旧通过结论。已据此**仅修改**原 `scripts/bundle-provenance.mjs` 的两条精确 SW 来源登记及 `tests/environment/cookie-account-provenance-r134.test.mjs` 的对应固定输入；没有修改 Cookie 业务源码或扩大允许目标。两文件当前未提交，保留其他 owner 业务 dirty，不单独提交会让 HEAD 与来源字节不一致的 pin。

- 原来源/目标/字节漂移/符号链接门禁：`node --test tests/environment/cookie-account-provenance-r134.test.mjs`，10 PASS / 0 FAIL，日志 `source-admission.log`。
- 原损坏账号查看/撤销、来源/安装/权限/会话代际/UNKNOWN 定向检查：`source-review.json` 所列 `--test-name-pattern` 与三个原 service 测试文件，10 PASS / 0 FAIL，日志 `source-behavior.log`。两条命令串行进程最终退出码 0；输入未变可复用，不扩为 Cookie 产品验收。

日常模式仍是旧静态开发包；尚未启动 `npm run dev`、写 dist、重载扩展或建立 serve 连接。原 Native 默认 doctor/manifest 缺失证据仅适用于默认安装，实际扩展 ID 现在已可通过可信界面核对；Native 只在下一操作确实依赖时处理，不能盲目 cleanup/setup 或换 ID。当前唯一正式 Web Flow 包仍 v0.3.4 / SHA `5a69f22c3fca72d39cefce7359119230caceeddd3ff86489af44add0a0052298`；包字节没有改变。

**接收方下一步：** 先恢复本节最新现场，评估项目本地调试 watcher 与 Browser 固定可信代码的原 `npm run dev` 各自职责；预览不能授予持续自动许可，也不能把整份包 JS 提权。优先复用已有入口，检查单 writer 后恢复 `dist/development`，核对新指纹/serve；在原 Task 安装/启停链解决百度的 `E_PERMISSION`，让真实滑块出现并完成精确范围审核。再执行两次全新合法候选与真实关闭拒绝的 A→B→C→D 证据，按当前范围做独立专家评审。多步骤 B、跨对话、MCP、完整回传/AI续答、production、宽度缩放与压力矩阵仍延期。第 12.10 预存 MCP 段落和所有并行 dirty/索引均保留。

新任务接手后，原 owner 停止 Web Flow 主线源码、Chrome 桌面输入、开发端口和输出目录操作。没有 dev/fixture 服务或真实 Task 请求需要接管；本轮定向测试和系统键盘命令均已结束，浏览器页面留给新 owner 从正常入口继续。

**接手实读（任务 `01a19c45-de3d-7c01-b026-2d706899350c`）：** 本任务 `get_goal` 为 null，已按上文当前阶段创建唯一 active 目标，原任务 paused 不变。现有 main / HEAD `a8b26c13a913ddff6a73904ad76887deda44db66`，并行改动保留。桌面实读确认 Web Flow 脚本页仍打开、无自动滑块、百度显示原 `E_PERMISSION`。发现与复用判断：业务 owner 仍是本项目；可信滑块沿 `trusted/AutoSettings.tsx` → 原可信 React 工作台与 Bridge；本地项目调试只更新沙箱 UI，不能更新固定可信代码或继承正式自动许可。因此本次先沿原正式安装入口继续，核对 43119/43120 无 writer 后启动唯一 `npm run dev`，输出仍是原 `dist/development`。本任务接管该 dev writer 和 Chrome 桌面输入；下一操作为待 serve 首次编译完成后，经正常 Chrome 入口安全重载并核对连接/指纹，再处理原百度 Task 安装。未提交任何候选或 Task 请求。新证据目录 `artifacts/webflow-auto-20261102/resume-01a19c45/`。

**2026-11-02 20:53 最新调整与移交：** 用户明确要求创建新任务继续，指出大量截图方式有严重问题，要求优先浏览器 MCP、Computer Use、AppleScript / OpenDesk AI CLI 等有效控制方式。本任务停止浏览器输入，不再截图巡检。`get_goal` 实读为 **paused**（用户本次调整后的真实状态），未标完成。开发环境已恢复：唯一 writer PID **64855**，exec session **56726**，43119/43120，原 `dist/development` 与真实 ID 不变；首次编译完成，Chrome 经正常详情页重载；真实「调试 → 本地开发服务」明确显示已连接，指纹 `e589f1a1e01f`，证据 `actual-serve-connection.png` / `serve-identity.json`。不是仅依据 RUNNING 判连接。

实际 Web Flow 页头已出现可信“自动运行”区域，但回读失败，显示 `自动授权仅允许真实可信 Side Panel`；尚未出现可操作的状态滑块。错误来自 `src/native-agent/chatgpt-bridge-trigger-gate.js` 的 `actualSidepanel` 首条检查，而非 UI 的 verifiedSidePanel 前置。原 `src/environment.js::resolveToolSender` 已处理 Chrome Side Panel MessageSender 缺少 documentId 的唯一原生上下文恢复；gate 当前未复用。**缺少 documentId 是待确认假设，不能写成已证实根因。** 本任务只给该拒绝增加了无身份值的分类文案（宿主路由未匹配 / Chrome 未提供 documentId / 缺少原生上下文查询），无授权规则变化；增量编译已完成并经原安全检查输出 ready **9035cf03221b**，尚未在真实 UI 读取该分类。下一 owner 应先用结构化诊断确认具体失败条件，再复用已有 resolver 最小修复并验证真实侧栏通过、伪造/普通 tab/歧义 context 拒绝。诊断源码改动未提交。

真实「我的」显示自动化任务 **0**；百度不是仅 Web Flow 展示失步，需按原「我的 → 添加任务 → 浏览任务目录」验证并安装固定 `baidu.search.top3@1.1.1`，原包与哈希不变。没有发送 ChatGPT 消息、提交 candidate/request/run/result、运行草稿或安装 Task；原聊天项目页上有用户既有长草稿，**不得覆盖或发送它**，正式试验选已附着完整轮次的独立对话。截图默认 activeWindow 会裁掉屏幕顶部 25px，导致早期坐标偏移；已用 target=screen 分类为驱动问题，不能据 ACK 判点击成功。

独立只读评审者 James `01a19c4a-619c-7982-8cf8-739baca41db7` 已启动，限定源码/方案与现有证据，禁止编辑和占用运行资源；已通知移交并请求结论。当前仍 `NOT_SCORED`，真实 A–D 未完成。新任务接管上述 writer、Chrome 输入与 gate 诊断源码；原 owner 不再重复控制、编译或停止该服务。既有 Cookie 来源审查与定向通过直接复用，pin 仍不得脱离其他 owner 的对应业务字节单独提交；第 12.10 MCP 预存正文与全部 dirty 保留。

**创建回执与独立评审补充：** 已创建 local / 原保存项目任务 `01a19c55-9718-7662-ae6b-259757ad1a9d`（host `local`），没有 worktree 或新分支。已发送最新方法纠偏、准确现场、资源与未提交差量。James 随后完成只读静态评审：方案 **90/100，尚未达到 ≥95**，真实产品仍 `NOT_SCORED`。两项 P1 源码推演为：`chatgpt-task-discovery.js:34–70` 完整首批历史后追加的完整历史可能被误判新轮次；`chatgpt-fixed-bridge-host.js:704` 最终回答核验至 gate 最后持久守卫/submit 之间回答失效的时序窗口。均未新增运行复现，不将推演当原生事实；已连同唯一原生上下文恢复的严格拒绝要求发送新 owner 核实和最小修复。旧 owner 至此停止实施与共享资源操作。

**2026-11-02 本任务结构化控制与核心链收尾（owner `01a19c55-9718-7662-ae6b-259757ad1a9d`）：** 接手实读 `get_goal=null` 后按当前 A–D 创建唯一 active 目标；旧任务的 paused 状态不代表完成。沿用 main、原唯一 dev writer PID 64855 / 43119、43120 / `dist/development`，没有第二个 dev/build、分支、worktree、PR 或 Native 配对变更。最终真实「调试 → 本地开发服务」显示已连接，扩展 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`，指纹 **`868d392260b8`**；这是持续开发证据，production 仍 `NOT_TESTED`。

控制方法实际改为浏览器 MCP 优先尝试、macOS Accessibility 结构化读取/定位、Computer Use 原生点击与 AppleScript 只读 DOM。MCP 新页控制超时后未循环重试；确认 AppleScript 的真实 `execute javascript` 可用后，以有界 DOM 投影读取完整候选、结果与百度自然结果，不把一种插件的限制当成浏览器不可控。桌面输入先激活 Chrome，再以实际窗口标题守卫；AXPress 与部分长文本输入的 ACK 不代表网页生效，源码逐字节回读曾发现输入丢字并阻止 Run，最终通过原生 Accessibility 设置相同文本并核实 SHA。全程只用一张屏幕截图校准控制坐标，不做逐步截图循环。原项目页既有草稿未覆盖或发送，最终只读确认仍在（`original-draft-preserved.json`，173 字符）；主页及临时聊天复制了旧草稿，因此实际测试使用独立的既有 Web Flow 测试对话，不在含旧草稿的输入框继续。

**本次最小修复与归属：**

- 真实 Web Flow 首先读到分类错误 `Chrome 未提供 documentId`。原 gate 在调用通用 resolver 前拒绝了合法 Side Panel；现在复用 `environment.js::resolveToolSender` 和唯一 URL 合同，仅允许无 tab、顶层、同扩展、精确 URL 的唯一非隐身 `SIDE_PANEL` 原生 context 恢复缺失 ID。显式陈旧 ID不替换，恢复身份固定，普通网页/扩展 tab/沙箱/tool/preview/scheduled/嵌套/歧义 context 继续拒绝。
- 独立评审指出的分批历史误触发已用定向用例复现：原 `chatgpt-task-discovery.js` 仅凭 DOM 追加会把首批完整 U0/A0 后的历史 U1/A1 当新轮次。现在只在真实发送按钮点击或原生 Enter 见证下，匹配精确新用户文本/身份及唯一完整回答；合成提交、历史、重新生成、重挂载和重复内容不自行产生许可，监听器按原生命周期清理。
- 原最终提交 guard 的回答失效竞态亦先复现 RED。现在在原 ledger 的 `controllerSubmitted` 持久写入与批准检查之后，再通过 `workspace-chatgpt.js::assertWebFlowReplyCandidate` 读取最新唯一完整回答，逐项核对原 candidateId/turnKey/answerKey/字节；后面只有同步自动撤权代次、来源/请求/权限围栏和原 Authority submit。读取期间关闭、逐任务撤销、导航、请求取消或移除权限均阻止提交，没有新增 Runner、授权层或消息通道。
- 写入仅为上述四个原 `src/native-agent/` 文件、原发现测试、项目 `auto-host.test.mjs` 与新增 `reply-admission.test.mjs`，以及本节。Web Flow UI/任务源码及正式 v0.3.4 JSON 字节未变，不重复打包。Cookie pin/业务、ScrapyJS、云控及预存第 12.10 节全部保留，不归本次提交。

**真实安装与 A–D 证据：** 原「我的 → 添加任务 → 浏览任务目录」导入 `baidu.search.top3@1.1.1`；直接导入按钮未打开选择器时沿原目录文件入口继续。安装验证在百度首页使用与包相同的源码 SHA `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8`、参数 `{"query":"OpenDesk Browser","limit":3}`，验证 Run `3657af47-8a6f-4747-b2e3-77ef4e02d079` / Result `518170b6-bac9-4356-a561-cae82b7fb8f4` 为 completed/released 且 success/3。随后原核对运行证据 → 设为本地可用 → 安装通过；这是安装验证，不冒充自动触发。真实安装 ID **`da7b0581-5788-45c5-8316-ea7c03130d51`**、generation **1**、revision 1、manifestHash `adf0cc21e1aa498b169846256f92cf65da42f3c9d27011b29205e164f26bea4b` 已由可信审核界面读出。

在可信 Web Flow 宿主页审阅并批准上述固定安装、首页及精确参数，原生点击开启滑块。官方测试对话的准备轮次收到 `READY-WF-20261102` 后，以下两个新用户轮次产生唯一完整 `webflow.task.intent.v1` 助手代码块；没有点击采用/手动 Run，也没有第二次批准：

| candidateId | 原 requestId | 原 Run | 原 Result | 当前核心结果 |
| --- | --- | --- | --- | --- |
| `wf-20261102-01a19c55-a2` | `d24809aa-6974-4235-ad2b-10e1eb61dfcf` | `dc89512a-7f09-4b41-923f-502379f37837` | `8903feb2-ea64-483b-813e-519ff141a718` | saved 固定版本，completed/released，success，3 条 |
| `wf-20261102-01a19c55-a3` | `7ebb32da-b160-48a0-bfd1-3bb7ce1f6d45` | `7ce41ab8-9ad0-47f0-b1f5-4dcc4bcfbb69` | `1fa794a3-dfb2-4d4a-ac8b-ccc7a602d7c2` | 同批准的第二次独立执行，completed/released，success，3 条 |

两次原 trace 均含真实首页输入回读 `OpenDesk Browser`、一次搜索点击、目标导航及三条结果读取；输入世界是原 Controller 的 **ISOLATED DOM**，不是操作系统键鼠事件。结果已由原 Bridge 回到同一测试聊天，现有 AI 也已回复；这只是沿用的实际观察，不据此补做或宣称完整长结果/AI 续答合同验收。

再发同 candidate a3 的完整合法回复，真实显示 **`E_BRIDGE_REPLAY`**；原生关闭总开关后，新 candidate **a4** 的完整合法回复真实显示 **`E_WEBFLOW_AUTO_DENIED`**，均未自动重试。关闭并重开真实 Side Panel 后，新 host `722bed3c-7b50-4d30-8be9-fa7acb250b28` 仍读回关闭。最终通过原「开发 → 运行结果 → 运行记录与技术信息 → 刷新运行历史 → 完整历史与版本身份」读取持久记录：**恰好 3 Run / 3 Result**（一次安装验证、两次自动执行），没有重复/关闭后的新 Run；两个 saved Run 的原结果投影 `results[].value` 与各自返回正文逐字段 `deepEqual` 通过，Run/Result/源码 hash/完成及释放状态相符。原可见百度同查询页面的前三条自然结果标题和 directUrl 与两次结果一致；百度转链 token 为响应相关值，不冒称相同。首次 a1 回复把协议加转义并将目标写成 Markdown，未准入，保留为格式拒绝证据，不计作成功或 UNKNOWN 重放。

原始证据统一在 `artifacts/webflow-auto-20261102/resume-01a19c55/`：`core-proof.json`、`installed-task-identity.json`、`bridge-result-a2.json` / `bridge-result-a3.json`、`final-durable-history.json`、`visible-baidu.json`、`replay-a3-status.txt` / `off-a4-status.txt`、`off-reopened.txt`、`dev-final-connected.txt` 及有界 DOM/Accessibility 回读。它们是本机开发证据，不把 ignored 生成物成堆提交。

**最小验证：** `node --test projects/webflow/tests/auto-host.test.mjs projects/webflow/tests/auto-grants.test.mjs projects/webflow/tests/reply-admission.test.mjs tests/environment/chatgpt-task-discovery-p0.test.mjs`，**77 PASS / 0 FAIL**（`targeted-safety.log`）；覆盖实际修复的真实 sender 恢复/拒绝、初始完整分批历史、真实发送见证、最终回答替换/流式/冲突、同步关闭/撤权与 UNKNOWN 不重放。源码语法及本范围 `git diff --check` 通过，沿原 watcher 增量生效；没有全仓测试、production 构建或重新打包。

本轮 **A–D 核心开发链已取得真实开发候选证据**；独立复审结论以随后实际回执补记，未审不写 95。下一阶段只有用户明确要求才开展：多步骤 B、跨对话、持久队列、MCP 产品接入、完整回传/AI 续答、production、宽度缩放或压力矩阵。总开关最终保持关闭，百度固定安装与精确授权保留；原 dev writer 保持服务，不停止他人进程。

**独立复审实读：** James（`01a19c4a-619c-7982-8cf8-739baca41db7`）已只读核对本次差量、`core-proof.json` 及原公开 Durable 历史，结论为 **96/100，第一阶段 development 核心链可接受收尾，原两项 P1 已关闭，本范围未发现剩余 P1**。他确认两次 saved Task 的独立身份、完整公开持久结果与回包一致、三条结果、输入/单次点击、重复与关闭拒绝，以及新 Side Panel host 的关闭读回；这是对提交材料的独立复审，不冒充专家另行操作 Chrome。其他安全负例仍仅为组件证据；production、完整矩阵、MCP 产品与完整 AI 回传继续延期。当前任务完成不改变旧任务 paused 状态。

### 12.11.4 核心使用入口：复用批准、生成指令与结果指引（2026-11-02）

**当前操作与复现：** 用户要求复用已有脚本和自动执行证据，直接完善核心。真实侧栏的可信页头显示“自动运行：已关闭”，沙箱概览却显示“自动触发 未接入”“没有公开的逐任务自动授权与总开关状态读写合同”，页脚仍写“无自动授权或后台执行”。本轮完成“打开现有应用 → 找到已有脚本批准 → 生成并复制有效指令 → 知道原聊天结果/失败在哪里”，不重新安装/运行百度 Task，不建立总 GOAL。

**发现与复用：** owner 仍为 `projects/webflow/`。公开 `sidebar-tools.zh-CN.md` 的 `tasks.read({taskId})` 只返回固定安装元数据，`tasks.read({clientRequestId})` 只读取本 App 原请求，不能读取 Bridge 自动批准或任意聊天结果。真实可信消费者 `trusted/AutoSettings.tsx` 已经从原 `webflowAuto.readAutoSettings` 获得批准/安装投影，直接复用。沙箱只修正引导，不自报实时开关，不新增 SDK/RPC、数据库、Runner、授权或安装层。

- 概览移除矛盾状态，接上原可信滑块、精确批准与原聊天任务卡的进度/结果/失败路径；明确本界面“记录”只保存手动请求。旧手动、一次批准、持续自动、取消/恢复路径保留。
- 可信授权区先显示已有批准，再显示新增/更改范围。有效批准新增“生成 ChatGPT 指令”与复制：精确复用 taskId、targetUrl、args，每次生成新 UUID candidateId，保持原 `webflow.task.intent.v1` 严格五字段及 `opendesk-task` 代码块。参数反引号采用 JSON Unicode 转义，不能结束代码块。
- 生成/复制不批准、不开关、不提交任务。关闭时提示先开启；安装改变、撤销、目录未核验、读取失败或刷新时不提供生成入口，刷新/关闭丢弃旧文本。复制失败仍保留只读文本及手动复制入口。实际执行与防重放仍经原 Bridge 逐次核验。
- 固定组件仅更新 `scripts/bundle-provenance.mjs` 的 Web Flow 精确来源 pin；原第 12.10 节 35 行及 Cookie pin/业务、ScrapyJS、云控 dirty 保留，不混入本轮提交。

**对应最小验证：** 新增生成/复制行为触发原 `auto-settings-ui.test.mjs` 的相关控件检查及三项新行为测试：严格五字段/新 ID/原批准范围、无有效批准不生成、复制与失败保留。原 13 项及后加复制项分别通过；原包/模型 6 项、概览→脚本/帮助导航 1 项、固定来源准入/拒绝 2 项通过，共 23 项。未重跑原 77 项、整组恢复、真实 Task 或模型。首次新挂载只读 textarea 的夹具失败来自 Linkedom 缺少 `defaultValue` 浏览器反射及属性大小写差异，仅修夹具。`node --check`、同源包和差异格式检查通过。

**真实 Chrome UI：** 原扩展 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`，通过原安装器同 ID 导入 v0.3.5，新概览/可信控件已出现，无卸载。原百度批准仍有效，精确参数 `{"limit":3,"query":"OpenDesk Browser"}`、首页 `https://www.baidu.com/` 保留。原生点击生成、复制、再次生成：实际 AX Unicode 与剪贴板逐字一致，两次 candidateId 不同，均通过原严格解析器；未发送 ChatGPT，模型请求 0，Task start 0，开关保持关闭。原生证据仅覆盖入口/生成/复制；真实自动执行与 Durable/原聊天反馈复用 12.11.3，不冒报本次新字节重跑通过。

控制中 Chrome 标签悬浮提示被 Computer Use 窗口元数据误认成前台，部分 AXPress/瞬时鼠标 ACK 无效果；使用真实 AX 主窗口标题/控件定位、带指针移动的原生 CGEvent 后，按回读确认生效，未用网页合成事件。仅留两张必要诊断截图。`pbpaste` 中文导出实际为 GB18030，正确解码后与 AX 完全一致，属于导出编码差异，没有修改产品规避。

**包与持续开发：** 唯一 `webflow.opendesk-tool.json` **v0.3.5 / 53,597 bytes / SHA-256 `c64b7e7e4a968078af581dce05730e5845e4dfab4de084162c5262f405b36e19`**。原 candidate → 定向门禁 → `--promote-from` → `--check-project` 同源通过，四项 capability、两个 Task pin 未扩展。交接 PID 64855 已退出、两端口无监听，恢复原唯一 `npm run dev`：新 writer **85861**、43119/43120、原 `dist/development`。真实调试页显示“开发服务已连接”，指纹 **`105c832e5cf9`**（完整 `105c832e5cf9aa25ffcd84d1f2717f4fdc4984df9d2ab539cfee5dc695459388`）；未换扩展 ID/路径/Native 配对，没有第二个 writer。

证据在 `artifacts/webflow-auto-20261102/core-entry-01a19caf/`：`approved-scope.ax.txt`、两份 `generated-prompt-*.txt`、`copied-prompt.ax.txt`、`copied-prompt.utf8.txt`、`native-prompt-proof.json`、`dev-final.ax.txt`、`dev-serve.log`。最终留在 Web Flow，开关关闭、原批准保留。下一条正常使用动作是从已有批准生成并复制新指令，用户准备执行时再开自动运行并在原聊天发送；无需重新创建或安装脚本。多步骤 B、跨对话、持久队列、MCP 产品、完整长结果/AI 续答、production、宽度缩放/压力和新评分继续延期。

### 12.11.5 用户最新纠偏：在侧栏完成真实核心链路测试（2026-11-02，核心实测结果见 12.11.6）

用户要求创建新任务继续，指出看不出核心测试已完成。当前明确的完成标准是：固定提示词在真实 ChatGPT 发送 → 完整回复为严格脚本协议 → 触发原已安装脚本 → 实际百度等网页自动化 → 在侧栏 Web Flow 看见同一次执行的结果或具体失败。12.11.4 只验证生成/复制，不等于此链已在新版本通过；12.11.3 的历史真实执行可复用为参考，不能代替本轮改动后的最终核心操作。

用户同时指出网页注入的“OpenDesk · 浏览器任务”严重遮挡、干扰访问，要求过渡到侧栏扩展。下一 owner 直接检查并迁移必要的执行状态、结果/错误、停止与手动/一次批准交互到已有 Web Flow/可信控件，移除该侵入式网页悬浮面板。不能仅隐藏 CSS 或直接删除承载监听、严格解析、原聊天送回与来源/草稿保护的整个模块；复用原 Bridge/Authority/RunHost/持久结果，沙箱不提权，不新建第二条执行链。

本次已明确授权按修改后的正常产品入口完成一条真实端到端核心链；不再以“之前跑过”或“只复制成功”跳过本次发送、完整回复、自动执行与侧栏结果核对。用户以百度搜索相关人物为代表场景；复用现有固定搜索脚本，实际关键词如改变，必须按原可信审核绑定精确参数，不扩大旧批准或编造旧人物测试证据。继续保护已有用户草稿、UNKNOWN 不补跑及真实来源/安装/权限/撤权；完整矩阵、production、跨对话/多步骤、MCP 产品和新评分仍延期。

交接前实读 main HEAD `d36e69d01`、dev writer PID 85861 仍在；本任务 `get_goal=null`，无活动目标需暂停，未改变其他任务目标状态。新任务创建成功后由新 owner 接管源码、Chrome、watcher 与原输出，旧 owner 停止操作这些资源。


### 12.11.6 侧栏核心自动链已真实跑通（承接 2026-11-02 授权）

**最新阶段与入口：** 用户随后明确“先完成核心功能”，旧网页大浮层的删除可以延期，并要求优先 Accessibility / AppleScript / DOM 等准确、低截图消耗的方法。本次保留旧浮层，实际采用“扩展 → Web Flow → 任务范围与授权 → 生成 ChatGPT 指令 → 官方原对话原生发送”；旧浮层采用、执行、批准等点击 **0 次**。未创建新任务、Goal、分支、worktree 或 PR。

**发现与复用/写入归属：** 继续复用已安装 `baidu.search.top3@1.1.1`、原精确批准 `https://www.baidu.com/` / `{"query":"OpenDesk Browser","limit":3}`，未创作或重装脚本、未扩为任意人物参数。`projects/webflow/trusted/CurrentTask.tsx` 是固定编译的可信视图，业务组件及专属测试归本项目；原 `chatgpt-fixed-bridge-host.js` 只投影既有运行/持久结果/资源释放/聊天交付，沿原协议对精确 document 派发侧栏操作，原 `tool-shell.js` 仅固定接线。沙箱及 JSON 未获得控制器、chrome.* 或动态可信代码。原页面监听/解析/发送见证/交付与草稿围栏保留；手动、一次批准、五分钟批准、查看执行页、取消均复用原请求动作。控制必须来自真实可信点击，原 tab/document/url/window/request 不匹配即拒绝；UNKNOWN 不生成新请求或补跑。新候选拒绝前清除上次结果，当前投影不会把其他 request 的结果接到新请求上。

**实际失败与最小修复：** 首个富格式生成提示词在官网编辑器把网址变成富链接，发送前读回发现换行，未发送该份变形草稿。网址标准转义后，候选 `wf-a1c9e10b-6822-4343-b14c-ba8d3a10817b` 已真实发送并取得合法五字段完整回复，但官网把用户消息中的 Markdown 围栏渲染掉，原精确发送见证拒绝，未启动 Task。这不是 Host 执行失败，也没有放宽见证或重用该候选。生成器最终输出单段文字加精确 JSON，网址采用 `\u002f`、参数反引号采用 `\u0060`；解码后的 Task/目标/参数不变，输入不含代码围栏，模型回复仍必须是唯一 `opendesk-task` 完整五字段代码块。新提示词经原生 AX 写入并逐字读回一致后才发送。

**本次同一开发候选的真实核心结果：**

| 阶段 | 本次证据与结果 |
| --- | --- |
| 实际发送与协议 | 新 candidate `wf-8a241436-4ea3-40ee-b6b2-6275e76cca3b`；实际新增用户消息与生成指令一致；随后唯一完整助手代码块与原五字段逐项相同 |
| 原固定脚本 | request `21e1ce7d-591c-4c9a-a18a-db253e0d2562`；Run `594b0d98-c05b-427b-bc5e-067699d80caf`；Result `08be9873-9fa5-4f44-83d7-7929b108abf6`；saved `task:baidu.search.top3:1.1.1` / r1 / source SHA `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8` |
| 真实网页业务 | 自动打开百度、原 Controller ISOLATED DOM 填词并单次搜索；独立 AppleScript 只读 DOM 在真实搜索页捕获 3 条，标题与 slot `1/2/5` 和同次脚本结果完全一致；不是只凭 completed |
| 持久结果与释放 | 原 Host 的既有 Controller snapshot/Codec 校验同一 Run/Result 后，可信“当前任务”分别显示 completed、持久结果已核实、released；原 trace 含 input before/started/returned、click started/returned、navigation observed、results read |
| 原聊天交付 | 同一原对话新增结果消息恰好 1 条，request/Run/Result、revision/sourceHash 与侧栏相同，完整 data 逐字段等于侧栏结果；官网已完成后续回复；未扩为长结果/AI 续答正式验收 |
| 可见侧栏 | “当前任务”显示同次结果和明确状态；切到调试后从“扩展”重开仍显示该次完成回执；最终停留 Web Flow，自动开关已恢复关闭、原批准保留、测试输入为空，原项目页 173 字符草稿仍在 |

本次三条标题为 `OpenDesk | OpenDesk`、`openDesk - OpenProject brings open source project management to openDesk`、`OpenProject 13.1: Share work packages, dynamic meetings and much more`。原始输出时间为 `2026-11-02T16:17:03.804Z`（北京时间 11 月 3 日 00:17），证据目录沿用本次任务开始日期。

**验证与运行环境：** 原 Host/授权负例、可信组件、页面取消/交付围栏和新增侧栏 document/request 控制检查共 52 项相关检查通过；提示词最终改成单段后单独重跑其 15 项组件检查通过。固定来源精确 blob 及禁止进入 SW/其他宿主/Worker 的负向检查通过。Linkedom 的 select.value 仅 getter 导致的新增夹具失败已补真实反射，不改产品迁就夹具。旧取消测试的异步挂起由新增回调意外返回整个执行 Promise 引起，修回原“提交后立即返回”，24 项原生命周期检查通过。未跑根 npm test、完整矩阵或评分。

日常仍为 Developer 持续开发、同一扩展 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`、原 `dist/development`、43119/43120。新增可信来源/提示词字节要求固定来源 pin 同步，经本任务接管的原 writer 顺序重启加载，始终只有一个 writer；最终 PID `94203`。真实调试页显示“开发服务已连接”，完整 revision `243ae9d3b96cfca9df566502f02a482a9cb7e61e3de7597225bfbe6dab9689a5`，不是仅凭 RUNNING。正式 v0.3.5 JSON/source 文件未变，保留原 SHA `c64b7e7e4a968078af581dce05730e5845e4dfab4de084162c5262f405b36e19`，没有无意义重打包。Cookie/ScrapyJS/云控、Cookie pin 与预存 12.10 MCP 内容保留，不混入本次提交。

**证据：** `artifacts/webflow-auto-20261102/core-migration-01a19ce9/core-proof.json`、`core-prompt.txt`、`core-filled.json`、`core-protocol.json`、`visible-baidu.json`、`sidebar-result.json`、`sidebar-identity.json`、`chat-delivery.json`、`core-final-sidebar.ax.txt`、`reopened-result.ax.txt`、`final-visible.ax.txt`、`dev-connected-open.ax.txt`、`final-chat.json`、`dev-core.log` 及定向检查日志。仅一张图片用于定位最初被滚动容器裁切的按钮；主验证为 AX 及只读 DOM，原生操作后均回读，不将点击 ACK 当成功。

**当前完成边界：** 当前核心自动链 `CORE_AUTO_E2E=PASS`。新增侧栏手动/一次批准/停止有源码和 Node 行为证据，单独真实 Native 测试仍 `NOT_TESTED`；旧网页浮层删除按用户最新指示延期。跨对话、多步骤 B、持久队列、MCP 产品、完整长结果/AI 续答、production、宽度缩放/压力、完整矩阵和评分仍不属于当前阶段。没有借此宣称整个长期产品已完成。

### 12.11.7 保存阶段结论、澄清持续自动触发与用户亲测（2026-11-03）

用户要求把阶段性测试/结论保存在扩展项目，并希望亲自复制提示词观察真实效果，避免只相信 AI 声称完成。本节仅整理已有证据和准备输入；没有重新调用模型、运行 Task、启动构建/产品环境或扩大 MCP 实施。

**结论分开记录：** 当前候选已证明的是“官方 ChatGPT 网页完整协议 → 原 Bridge/Host/Authority/Native 执行链 → 已安装 Task → 同次持久结果 → 侧栏与原聊天交付”。触发模式是已持久保存的精确范围持续批准，发送提示词后没有再点击采用、执行或五分钟批准。本次没有正式 MCP 工具调用；单凭模型的结果解说或把这些 Run/Result ID 填进另一份 MCP 报告，不能认定 MCP 链通过。正式 MCP 真实调用和与原 Task/交付身份的关联仍为 NOT_TESTED。12.11.3 有旧候选同批准两轮历史；最新候选在 12.11.6 只实际验证一轮成功，不冒报最新候选两轮或长期无人值守通过。

**已保存在唯一项目：** [精简原生实测结论](../evidence/core-auto-20261103.json) 固定引用源码提交、构建指纹、精确范围、原 candidate/request/Run/Result、三条网页结果及独立观察匹配，注明自动触发与 MCP 的不同结论。[第一轮提示词 A](../tests/manual-auto-baidu-a.prompt.txt) 与[第二轮提示词 B](../tests/manual-auto-baidu-b.prompt.txt) 均使用全新 candidateId，状态 PREPARED_NOT_SENT。只保存可审阅的精简证据及人工测试输入，不把整份网页、用户草稿、Cookie、截图或生成日志装入正式工具 JSON；原始细节仍留 12.11.6 的本机 artifacts。

**用户亲测顺序：**

1. 在真正 Chrome 同一窗口打开“扩展 → Web Flow”，保持侧栏打开；核对 `baidu.search.top3@1.1.1` 已安装且已有批准有效，地址 `https://www.baidu.com/`、参数 `{"query":"OpenDesk Browser","limit":3}`。上轮收尾时总开关已关闭，测试前亲自开启“自动运行”；不需要重新批准相同有效范围，也不要操作旧网页浮层。
2. 将 A 文件中的整条单段文字复制到官方 ChatGPT 已有对话，确认没有旧草稿/附件/输入法编辑后亲自发送。仅复制提示词内容，不把展示提示词的 Markdown 围栏一起贴入输入框。模型应回复唯一 `opendesk-task` 五字段代码块；随后不要点击任何采用、执行或 Run。
3. 人工观察百度页是否自动打开、填写 `OpenDesk Browser` 并搜索；运行结束页面可能很快自动关闭，实际没看见就记“未观察到”，不能让 AI 的叙述代替这项人工观察。查看侧栏“当前任务”的任务/参数、新 request/Run/Result、真实三条结果、持久结果核实和资源 released；原聊天结果消息必须使用同一组身份。结果排名可能随网站变化，不要求复刻历史标题。
4. 第一轮完成且 released 后，不更改开关或批准，发送 B 文件。第二轮也应自动执行，无再次采用/执行/批准，产生不同的新 request/Run/Result。两轮全部由用户实际看见后，才将最新候选两轮持续自动验证补记为通过；本轮准备文件没有代替用户运行。
5. A/B 候选各只使用一次。以后每次点击已有批准中的“生成下一次指令”，取得新 candidateId；参数改变须审阅新的精确范围。UNKNOWN/停止未确认时只查询或停止原请求，不发送另一条候选补跑。测试完可关闭自动运行，保留原批准。

**“持续”的准确含义：** 同一精确有效批准下，未来每条合法的新完整协议回复均可自动准入；用户负责发送新指令，原权限/安装身份仍逐次核验。它不是关闭侧栏后仍会循环运行的承诺，也不等于已经完成跨对话持久队列。原始结果、触发方式、人工网页观察、资源释放和聊天交付须分别判断。

**验证范围：** 仅核对新增 JSON、两个提示词经原严格五字段解析器解码后的范围/新 ID、项目相对链接与差异格式；未再次运行产品或模型。测试文件和证据不进入 `tool.config.json.files`，原唯一 v0.3.5 正式安装包未变。


### 12.11.8 用户实测反例：新 ChatGPT 对话未自动触发，旧结果混入（2026-11-03，待修复）

用户明确要求创建新 Codex 任务继续完善和测试。用户在新 ChatGPT 对话发送提示词，自动运行显示“已开启/仅限已批准的精确范围”，但没有看见自动触发。现场对话为 `https://chatgpt.com/g/g-p-6ae779125890819197fcee27dd51d25e-opendesk-browser/c/6ae8bcfb-cee0-83ee-9d6b-be0cb9985ce3`。当前任务仍提示“先选择任务并建立请求”“可手动执行或批准一次”；选择显示 `installed:baidu.search.top3`，目标描述却是 `https://httpbingo.org/html`；结果区仍显示旧时间 `2026-11-02T16:17:03.804Z` 的三条数据。这些旧数据属于 12.11.6，不能认定新对话执行通过。用户发送的是哪条 candidateId、是否存在新 request/Run/Result 仍未实读，不推断未提交或擅自重放。

**当前完成条件重新限定：** 保留 12.11.6 的原对话单次真实成功事实；新对话首条发送和两轮连续自动触发尚未通过。下一 owner 先保全这次用户现场、实际输入/完整协议、真实路由/发送见证及原请求准入记录，再最小修复；新对话切换不得显示上次结果为本次结果，也不得用“建立请求/手动执行”误导已批准自动路径。修复后按正常用户入口验证新对话首条消息及同批准第二个新候选，真实百度、同次持久结果、资源释放、侧栏及原聊天交付分别核对。

**仅为只读线索，尚非本机根因结论：** `chatgpt-fixed-bridge-page.js` 的 SPA 会话切换分支清空 state 并 reset discovery，却未调用 clearReceipt；selection 的 installed 选项缺失 Map 元数据时会落到示例网页描述。`onComposerSubmission` 要求 `site.inspect().ok`，而 site 的 route 要求已有正式 /c/ 身份；新对话首次发送及首次建路由是否丢失真实发送见证，须用用户这次实际入口复现。不得为修复而接受历史完整回复、合成发送或放宽来源/身份/权限围栏。

本次旧 owner 仅记现场与移交，不在创建后重复操作源码、Chrome、Profile、writer/端口或 dist。交接时 main HEAD `9e8c2ccbd`；唯一既有 dev writer PID `94203`、Chrome PID `516` 仍在；`get_goal=null`，无活动目标需暂停。预存 12.10 MCP、Cookie pin 及其他 owner dirty 保留。当前阶段仍是核心修复，MCP、production、跨对话编排、多步骤 B、持久队列、完整矩阵、宽度缩放/压力与评分延期；旧网页浮层删除不作为当前前置。

**本任务接管与现场保全（01a19d27，2026-11-03）：** 当前阶段为核心修复；下一操作是空白 ChatGPT 首条原生发送及同批准第二轮。已实读 `get_goal=null`。接管原 Chrome 窗口 759148456 / 标签 759148515、原唯一 writer PID94203 和 `dist/development`，不派给后续任务。现场 A（`wf-0356793b-9a2a-416f-81df-9fa7ffdbe7b8`）已发送，DOM 中有两个不同真实消息 ID，不能再标未发送或重发；最新完整五字段解码地址正确。侧栏当前无 requestId/Run/Result，却有旧结果；原始输入、完整助手代码/消息标识、空草稿及侧栏 AX 已保存在 `artifacts/webflow-auto-20261103/new-chat-01a19d27/user-failure-{chat,full}.json` 和 `user-failure.ax.txt`。旧 receipt 的显示不构成新执行。只写原 `chatgpt-{bridge-site,task-discovery,fixed-bridge-page}.js`、必要的 fixed Host 投影、项目可信 CurrentTask/相关测试及 WebFlow 来源 pin；原 12.10、Cookie pin 及其他 dirty 均保留。确定的显示缺陷和首发路由缺口先做定向复现，再沿原 watcher 验证；真实双轮、同Run持久结果/释放/交付尚未完成。

### 12.11.9 首条发送临时路由与结果隔离修复：真实首发发现已证明，执行被运行时身份阻止（2026-11-03）

**当前真实结论：** 空白 ChatGPT 首条原生发送已经自动发现唯一完整五字段协议并进入原 Host；没有点击采用、执行或批准。当前任务目录随后明确拒绝原 Task 的内置运行时身份，故本构建 **百度 DOM → 持久结果 → released → 原聊天交付以及同批准连续两轮仍为 BLOCKED / NOT_TESTED**，不能用 12.11.6 的旧结果补充。本任务没有创建后续 Codex 任务代替修复，没有活动 GOAL（实读 null）。精简身份见 [本轮实测记录](../evidence/new-conversation-20261103.json)。

**按用户操作定位与修复：**

- 用户现场的 A 已发送，当前 DOM 中两个不同真实消息 ID 共用 `fallback-turn-0:0:user` 键；候选解析后的地址及参数正确。A 已改记 `OBSERVED_SENT_DO_NOT_REPLAY`，B 的旧准备标签不再被视为本轮未发送的证明。原对话及旧成功事实保留。
- 原生空白首发首次仍失败，原始证据 `first-native-sent.json` / `first-complete-chat.json` 保留；一次点击后的即时回读尚未看到用户节点，后续确认唯一用户消息，未二次点击。增加不含提示词/结果字节的只读发现阶段轨迹后，`diagnostic-first-observations.json` 直接观察到：`/` → `/c/local-chatgpt%3Af752096a-83bd-41d1-a13a-476092e6aea8` → 正式 `/c/6ae8c962-6ee0-83ee-b8a8-f2b6224235d9`。原见证已捕获，却在不识别临时路由时以 `route-unavailable-before-binding` 清空。
- 修复仅给原 Site/Discovery 增加空白/精确 local-chatgpt UUID 的观察路由；原生见证后的空基线只允许进入一个临时路由，核对精确新增用户后，绑定同一用户到一个正式对话。MutationObserver 捕获两次轮询之间的新增用户；DOM 回调不建立许可、不执行任务。临时路由没有 Host/Authority 准入，未见证历史、任意已存对话、改写用户、多临时路由、第二次导航、流式和合成发送仍拒绝。
- 采用真实消息 ID（`data-chatgpt-search-message-ids`）区分共享 fallback 键的不同消息；旧 fallback 键不再证明两个节点是同一消息。
- SPA 更换及新原生发送清除上轮结果；可信 CurrentTask 只显示 Host 核实且与当前来源/request 匹配的回执，不显示页面 `resultPreview` 残留。空白活动标签不再回退旧对话。自动采用时补齐已安装脚本展示元数据，不再把 installed:baidu 回退成 httpbingo；准入失败的候选也保留本次 candidateId、地址/参数和明确错误，没有请求/Run 时不冒称“本次结果”。所有失败/结果仍经原精确 tab/document/url/request 围栏。

**最终真实首发：** 当前 build `9f65055fc225541414267fc9aa74365783ad0453105f0b4c28f64ba530c87506`；新空白标签 `759148534` 首条原生点击一次，candidate `wf-c7fb6754-56d5-48d0-8c43-6d9529544f1b`，唯一新 user `a75511f2-611b-4df7-b49d-532e875e142e`，唯一完整 assistant `a0fd5741-de92-5785-9869-b65b34982d8e`；正式对话 `https://chatgpt.com/c/6ae8ca72-af90-83e8-91dc-65152136aebd`。轨迹明确为 `native-submission-witnessed` → `exact-new-user-observed`（pending/235b8c47-d8a0-44a7-ab5e-f7b24322f2f5）→ `unique-complete-reply-observed`（正式对话）。原聊天与可信侧栏都显示该候选及 `E_BUILTIN_VERSION_UNAVAILABLE`，没有旧时间/数据或示例地址；输入框为空，未重试。Host 在 `resolveSelection` 阶段拒绝，尚未调用持久 `auto-admit`，没有新的 request/Run/Result，未发送虚构的脚本结果给聊天。

**新的实际阻塞与安全边界：** 本轮并行主分支同步 owner 在收到真实重叠协调后独占合并，提交 `efd63d580` / `f8f6c9e0c`，明确交回页面/Host 后本任务才继续写；最后索引/HEAD 亦已交还。其 146 项合并检查不覆盖本轮新修复。合并带入的 `src/framework/sdk/browser-schemas.js` 变化确实出现在新 Worker source map 的输入中；任务目录原 resolver 报内置运行时身份不可用，旧 bundle digest 未实读，不伪造旧值。没有放宽 `assertBuiltinIdentity`、替换内置字节、回退源码或静默重锁已安装 Revision。原 grant installation scope 逐字回读仍与原证据一致：installationId `da7b0581-5788-45c5-8316-ea7c03130d51`、generation 1、version 1.1.1、manifestHash `adf0cc21e1aa498b169846256f92cf65da42f3c9d27011b29205e164f26bea4b`、contentHash `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8`。总开关仍开启，原批准时间保留，没有重新批准/安装。

**具体可审阅的后续动作：** 已按原 Task 打包函数准备 `artifacts/webflow-auto-20261103/new-chat-01a19d27/baidu.search.top3-1.1.2.candidate.opendesk-task.json`，只将 manifest version 从 1.1.1 改为 1.1.2；源码逐字相同、sourceHash、权限 `page.automation`、网站、参数 Schema 和期限均不变。新 manifestHash `6e73df2f70377ec2cc65761416344945d22a7c7e59c6e9aa3aae922d71490cd5`。状态为 `PREPARED_NOT_IMPORTED_NOT_VERIFIED_NOT_INSTALLED`，不是可直接安装的已验证版本。用户本轮要求保留原安装/原批准，因此没有自行导入、运行验证、升级或改变其绑定；需用户明确允许原安装链的新版本验证/升级及同一精确范围恢复批准后，才能继续百度双轮。若未获允许，保留本次明确拒绝，不发送新候选补跑。

**对应最小验证与开发环境：** 新首发/临时路由、重复消息键、跨对话结果清空、原生第二次发送、失败候选范围、空白投影及旧防重放/撤权/取消/回答替换共 **138 PASS / 0 FAIL**；另选原同 Run UI 回归 1 PASS。先保留各 RED 日志再修复。旧程序交付夹具改为真实的非原生 click 语义，原生用户新发送另有独立断言；旧引导文案断言更新为未触发/自动路径，不改权限校验。受影响 JS 语法通过，固定来源编译门禁通过，没有根 npm test、production、评分或完整矩阵。

日常仍是原 `dist/development` / 扩展 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`。实读 Chrome 已启用路径为该目录，调试页确认 serve 连接。原唯一 writer PID94203 因缓存旧 CurrentTask pin 被来源门禁拒绝，已在接管权限内顺序停止、确认两端口释放后启动唯一新 writer PID3682（43119/43120）；没有并行 writer、隔离替换或 Native 配对修改。重启构建 148 秒，后续只有相关增量。最终相关源码与 `input-bindings.json` 指纹一致；正式 Web Flow v0.3.5 JSON 未变，不重打包。Cookie/ScrapyJS/云控及 Cookie pin、预存 12.10 段继续保留，不混入本次提交。

**原始证据：** `artifacts/webflow-auto-20261103/new-chat-01a19d27/` 中 `user-failure-{chat,full}.json`、`user-failure.ax.txt`、各 RED/GREEN 日志、`diagnostic-first-observations.json`、`fixed-first-{filled,observations}.json`、`fixed-first-result.ax.txt`、`final-grant-identity.json`、`final-original-grant.ax.txt`、`extension-details.ax.txt`、`dev-connected-new.ax.txt` / `final-dev-connected.ax.txt`、`input-bindings.json`、`task-upgrade-review.json`、`final-targeted.log` 和 `dev-core.log`。本轮没有截图，没有操作旧网页浮层。MCP、跨对话编排/多步骤 B、持久队列、production、长结果完整回传、宽度缩放/压力和评分仍延期。

### 12.11.10 用户要求新任务继续、设置目标与关键测试条件（2026-11-03）

用户最新原话：“创建新对话，继续完善。设置目标，和关键测试条件；”。本轮按保存项目直接创建 local 新任务，仍在现有 `main` 工作，不创建分支/worktree/PR。新任务启动先实读目标状态，再用 `create_goal` 设置唯一核心目标（无用户指定 token budget）；当前旧任务实读 `get_goal=null`，无旧目标需要暂停、迁移或伪报完成。

**唯一核心目标：** 查实并安全解除当前 `E_BUILTIN_VERSION_UNAVAILABLE` 阻塞，完善 Web Flow 正常产品入口，使空白 ChatGPT 首条原生发送触发原已安装百度任务；同一精确有效批准及开关不变，连续两轮各自完成真实百度 DOM、同 Run 持久结果、资源 released、可信侧栏和原聊天交付，身份一致且结果不串线。当前阶段仍为核心开发，不恢复延期矩阵或另建总计划文件。

**关键完成条件：**

1. 先核对实际原 Task/批准及当前运行时身份；旧 bundle digest 仍未实读，不能把源文件有变化当成全部原因已证明。已准备的同源码 1.1.2 候选未导入、未验证、未安装；上一轮针对升级/恢复批准的询问尚无明确答复，本次“创建新对话”不能自动视为该特定动作的批准。继续不依赖该批准的必要诊断/修复；确需改变冻结安装时，保留原审阅链和用户授权边界，不改 SHA/ABI 校验制造通过。
2. 真实空白 ChatGPT 对话（无历史/草稿/附件/IME）首条原生发送，完整严格五字段协议；临时 local-chatgpt 路由只观察，同一新增用户绑定正式对话后才准入；没有采用/执行/逐次批准点击。
3. 每轮全新 candidateId，独立 requestId/Run/Result。真实百度填写 `OpenDesk Browser` 并搜索，读取三条自然结果；独立 DOM 与同 Run 原始 data 对照。第一轮持久结果核实且 released 后，再在同批准/开关不变下完成第二轮。
4. 侧栏与原聊天使用同一 Run/Result 和完整本次 data，交付一次；没有 Run 明确未运行，换对话或下一次原生发送不把旧结果叫本次；百度任务不显示 httpbingo 范围。
5. 保留本轮相关历史/合成发送/流式/回答替换、精确来源/文档/安装代次、撤权/取消/UNKNOWN 不重放保护。异常只查/停止原请求，不用新候选补跑未知效果。按实际变化选择定向检查，复用 138 项及原生首发已有证据，不重复无关全套测试。
6. 只以同候选真实证据记录各步骤；MCP、production、跨对话编排、多步骤 B、持久队列、完整矩阵、宽度缩放/压力与评分继续延期。旧网页浮层不作为入口或删除前置，优先 AX/原生输入/只读 DOM，不逐步截图。

**资源与生命周期交接：** 创建成功后，新任务接管 `projects/webflow/` 本轮源码、Chrome 和唯一 writer/dist/端口；旧任务停止这些资源的重复操作。交接实读 main HEAD `982596cb6`（仅本地提交，未推送）；Chrome PID516、dev writer PID3682（43119/43120）仍在，固定 `dist/development`，最近真实连接指纹 `9f65055fc225541414267fc9aa74365783ad0453105f0b4c28f64ba530c87506`。原失败标签759148515保留；最终首发/运行时拒绝标签759148534，对话 c/6ae8ca72-af90-83e8-91dc-65152136aebd。新任务先核对实际加载/连接/运行状态，不能凭 PID 证明连接；未获移交的其他 owner 资源不接管。预存 12.10 MCP 段、Cookie pin 和其他 dirty 保留；当前这段交接尚未提交，由新 owner 与其后续结果安全分离处理。

### 12.11.11 冻结运行时差异已实读，恢复指引修复；升级仍待特定授权（2026-11-03）

**目标与当前操作：** 任务 `01a19ded-cc6a-7b13-a5c8-366d4a025585` 启动实读 `get_goal=null`，已按 12.11.10 建立唯一核心目标，无 token budget，状态 active。主分支接手基线 `982596cb6`；不创建后续任务。下一条尚未完成的真实操作仍是解除原任务运行时拒绝后，新空白 ChatGPT 首发及同批准第二轮百度全链；当前未发送任何新候选、没有新增 request/Run/Result。当前目标没有完成，MCP、production、完整矩阵及评分继续延期。

**具体根因（补足 12.11.9 的未知项）：** 从真实 Chrome 的原 Service Worker DevTools，只读打开已有 `opendesk-browser`，仅在 readonly 事务读取百度 1.1.1 的候选、安装、Revision 三条记录并投影 verification；没有读浏览器 Profile、Cookie、凭据或写库。四处 `builtinIdentity` 都为 ABI `opendesk-builtins.v10`、catalog `085e98aaa50e60a734671ec3e99b16cd909bc5336dd6f7585a8be9ae0e394c0f`、bundle `1bb6a0d29f888160af0e3ea8d4197ac47f1ce6ef5b54703bbcd0b894ed88e23a`。verification 绑定原 Run `3657af47-8a6f-4747-b2e3-77ef4e02d079` / Result `518170b6-bac9-4356-a561-cae82b7fb8f4`，原生效果回执 59 条。安装仍为 generation 1、原 installationId、enabled，源码和 manifest Hash 与交接一致。

同一真实扩展的打包资源按原 loader 的顺序及 `\n;\n` 拼接计算，当前 ABI、catalog 相同，bundle 为 `78012cedf6b9711a6bbb719914ce80e36c6e536ed13139dd1b1b3b4979b12db0`，与磁盘上经原 loader 校验的摘要相同。由此证明当前 `assertBuiltinIdentity` 是对真实 bundle 变化的正确拒绝；不是旧结果、参数错误、安装丢失或只看版本号作出的推断。`browser-schemas.js` 仍只是已证实变化的 Worker 输入，不宣称它是唯一变化原因。没有放宽校验、改 SHA/ABI、静默重锁冻结版本或回退其他 owner 源码。

**独立可完成的最小修复：** 真实授权区在此错误下仅显示“安装已变化或不可用，需重新批准”，会把升级前置误导成单纯重复批准。现有固定 Host 的可信设置投影保留原错误 `code`；项目 `trusted/AutoSettings.tsx` 按 `E_BUILTIN_VERSION_UNAVAILABLE` 明确提示先验证、升级 Task，原批准保留，升级后审阅同一精确范围。继续只从原解析器核实的可用任务生成指令，未新增运行/安装/授权 API、持久层或自动修复逻辑；固定来源 pin 仅更新本组件，Cookie pin 不属于本次提交。正式 Web Flow JSON 未变。

**对应定向证据：** 新测试先 RED 于 Host 丢失错误码，再 GREEN；使用原 Host、原 ledger 与真实 `assertBuiltinIdentity`，确认 bundle 变化时 task 不可用、原批准/开关/精确 scope 不变、无新指令、准备不可用、仍可撤销、零 Run。设置 UI 与受影响 Host 共 29 PASS，未重新运行上轮 138 项及无关矩阵。原生侧栏已实读“需先验证并升级任务。原批准保留”，原批准时间 `2026/11/2 21:37:33`、完整七字段安装 scope、百度精确地址及参数不变，总开关仍开启；当前已发送候选明确“尚无任务请求”，无新结果或回传。仅恢复指引为 `PASS_NATIVE`，不是百度双轮通过。

**当前持续开发环境：** 原唯一 writer PID3682 因旧 Web Flow pin 缓存被构建来源门禁拒绝；先正常停止并确认进程/43119/43120 释放后，才启动唯一 writer PID15593（本任务 exec session48473）。没有并行 dev/build、替换加载目录或修改 Native 配对。固定 `dist/development` 与原扩展 ID 保持；Chrome 调试页实读“开发服务已连接”，完整 revision `6bd1298cb1b9465398979e2400de90484ef15e620cfc3c1afacaac7d8e2d5ea2`。新构建中原 loader 仍算得相同 `78012ced…` 当前 bundle；未通过重建回到旧 digest。日志 `runtime-01a19ded/dev-core.log`，保持该服务供后续使用；停留原标签759148534、可信 Web Flow 侧栏打开，没有发送消息。

**可审阅的升级范围：** 已复核原 1.1.2 候选与正式 1.1.1 的源码逐字相同，manifest 除 version 外完全一致；源码 Hash `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8`、新 manifest Hash `6e73df2f70377ec2cc65761416344945d22a7c7e59c6e9aa3aae922d71490cd5`。仅 `page.automation`、`https://www.baidu.com`、原参数 Schema、60 秒期限。仍为 `PREPARED_NOT_IMPORTED_NOT_VERIFIED_NOT_INSTALLED`，不能用格式校验替代真实验证。用户尚未明确批准重新验证、升级安装及恢复 `https://www.baidu.com/` / `{"query":"OpenDesk Browser","limit":3}` 的精确批准；原安装及批准先保留。获此特定授权后才沿 Candidate → 真实验证 → Available → Installed → 精确范围审阅，再完成同批准/开关不变的两个全新候选，不逐次批准/采用/执行。

精简身份与状态见 [运行时差异证据](../evidence/runtime-identity-20261103.json)，原始定向记录在 `artifacts/webflow-auto-20261103/runtime-01a19ded/`。原用户失败对话及全部已发送 candidate 保留、不重放；只保留本任务必要的脱敏摘要到 Git。
