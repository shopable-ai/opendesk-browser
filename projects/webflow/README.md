# Web Flow

OpenDesk Browser 中的独立业务扩展应用：把网页操作、AI 对话输入输出、跨对话交接和任务恢复组织成可追溯的连续工作。

**唯一项目根：`projects/webflow/`。固定检索词：`OD-AI-WORKFLOW-BRIDGE`。**

## 当前状态

当前核心是 **ChatGPT 新完整回复 → 严格五字段协议 → 已批准的固定脚本 → 持久结果与原聊天反馈**。已安装百度脚本的两次自动执行、结果回读及关闭/防重复证据保留在执行计划第 12.11.3 节，继续直接复用。

v0.3.5 修正概览中的旧“未接入”信息，并说明自动入口、手动记录与原聊天反馈的实际位置。当前 Browser 的可信“任务范围与授权”先展示已有批准，可从有效批准直接生成并复制本次 ChatGPT 指令；每次生成新 candidateId，复用原任务、精确地址及参数，不运行任务、不改变批准或开关。该可信组件随 Browser 固定编译，单独升级工具 JSON 不会更新它；最新原生验证等级见执行计划。

2026-11-02，V0.3.3 正式 Sidebar Tool v2 应用源码已进入 `src/ui/`，配置为 `tool.config.json`（应用 ID `webflow`）。正式信息架构为概览 / 脚本 / 记录，帮助和设置位于标题栏。已实现固定任务核对、派发前保存原步骤、手动委托执行、关闭重开后按原请求查询/停止、结果与资源释放分开显示，以及仅属于本应用的持久摘要；v0.3.3 使用原打包器的候选、定向验证和晋升链；React DOM 交互与隔离 SDK 夹具不等于真实安装或 Task 执行，当前证据见原执行计划 AWB-07。实际 Chrome 安装、运行和可信 Side Panel UI 仍待本机验收。原交接校验与单 owner 离线队列模块保留，详见[离线模块说明](docs/offline-modules.zh-CN.md)，**它们仍未接实际派发或原 ChatGPT 交付**。

现有发送队列、计算接力样例和 Bridge 各有源码及不同范围的证据，详见执行计划的事实表。目录存在不代表这些组件已经接成完整产品。

## 从这里继续

| 要了解什么 | 唯一入口 |
| --- | --- |
| 产品目标、BR-01–12、架构与验收边界 | [产品合同](docs/product-contract.zh-CN.md) |
| 当前断点、五阶段、AWB-01–08、依赖与证据 | [执行计划](docs/execution-plan.zh-CN.md) |
| 本项目的代码与文档维护边界 | [AGENTS.md](AGENTS.md)，同时继承[仓库规则](../../AGENTS.md) |
| 公开 SDK、程序类型和安装流程 | [扩展创建工作流](../../.agents/workflows/extension-creation.md)、[项目目录合同](../../docs/architecture/extension-project-layout.zh-CN.md) |

旧的 `docs/product/ai-workflow-bridge.zh-CN.md` 和 `docs/framework/workstreams/web-flow-20261101.md` 仅保留迁移入口，不再维护第二份正文或进度。后续更新本项目内文档，不按聊天新建总 GOAL。

## 应用与框架的分工

**Web Flow 是框架的业务消费者。** 本项目承载工作流的业务规则、任务衔接、上下文交接与结果展示；OpenDesk Browser 保持通用浏览器能力、执行授权、生命周期、安装和存储职责。

| 所属 | 负责内容 | 边界 |
| --- | --- | --- |
| 本项目 Web Flow | 工作流定义与参数、步骤依赖、结果整理、交接包、恢复决策、应用界面与业务测试 | 新增业务实现归本目录；经公开 API 调用执行能力 |
| Browser Framework / SDK | 站点与安装权限、Task Catalog、Authority、RunHost、Controller、Page Session、Durable Result、通用存储/调度 | 不加入仅服务于 Web Flow 的站点选择或业务判断；公共缺口按原流程证明后最小补齐 |
| AI Send Queue | 既有 ChatGPT 单页面消息 FIFO 与发送状态机 | 保留原 owner 和安装身份，不复制一份到本项目 |
| 计算接力与既有 Bridge | 已有可行性样例、原聊天可信交付接线 | 先复用和核验；实际提取业务源码时同步消费者、构建来源与测试，不能只搬文件 |

现有复用入口：

- [AI Send Queue](../../examples/sidebar-tools/ai-send-queue/README.zh-CN.md)：唯一 owner 为 `examples/sidebar-tools/ai-send-queue/`。
- [ChatGPT 计算接力](../../examples/tasks/chatgpt-relay-calculator-r1.README.zh-CN.md)：已有 Controller + AppStorage 的固定 A→新对话 B 源码样例，真实 Chrome 仍按该 README 的证据等级。
- [公开 Sidebar API](../../docs/api/sidebar-tools.zh-CN.md)、[Page API](../../docs/api/page-userscript.zh-CN.md)、[Controller](../../docs/api/controller.zh-CN.md)：接入以真实公开能力与目标执行世界为准。

## 扩展类型与执行世界

本项目的产品形态为**组合式应用（Combined Application）**。一个产品入口可以组合多种执行职责，每种职责仍遵守自己的合同。

| 架构项 | 当前决定 |
| --- | --- |
| 产品/源码归属 | `projects/webflow/`；属于业务应用，不新增一个 Browser Framework |
| 应用界面 | 实现时按 Sidebar Tool 沙箱合同接入；不因目录归属取得可信 Host 权限 |
| 网页执行 | 使用原 Controller Task / 必要的 Page 程序；各自站点与安装身份独立 |
| 后台与恢复 | 使用已批准的持久化及调度能力；先完成能力探测，不预设任意后台 JS 可安装 |
| 当前主流程 | v0.3.4 沙箱保留手动委托/原步骤恢复；可信宿主显示自动运行滑块及精确范围审核，接原 ChatGPT Bridge；本沙箱不取得自动授权或全局目录 |
| 框架改动 | 当前未证明需要；不足先记 `SDK_GAP_NOT_PROVEN`，保留可复现缺口后交原 owner |
| 安装包 | `tool.config.json` 为真实工具输入；正式包 `webflow.opendesk-tool.json` 已经由原 `build-sidebar-tool.mjs` 生成、验证、晋升并提交（Git `8a1cf108`）；仍须在「扩展」手动审阅安装 |
| 验收 | 文档结构、源码/组件、真实 Chrome、业务通过与正式发行分别记录 |

## 后续核心代码放在哪里

以下为**归属约定**，对应模块开始实现时再创建目录和文件；目前没有占位代码或空目录。

| 项目内路径 | 后续职责 |
| --- | --- |
| `src/workflow/` | 业务步骤、依赖、参数与推进规则；不实现第二套 RunHost 或执行权限 |
| `src/tasks/` | 确无现成任务可复用时的 Web Flow 专属 Controller 源码；仍走独立的原 Task 安装合同 |
| `src/handoff/` | 最小上下文交接、结果引用、目标仓库证据检查及接收状态 |
| `src/adapters/` | 通过已批准公开能力对接站点任务与产物；不直接导入宿主私有特权模块 |
| `src/ui/`（已实现） | 独立沙箱中的 React UI、固定委托投影及 UI 数据摘要；不直接读宿主 IDB |
| `tests/` | 本应用的业务与边界测试、必要 fixture；框架公共合同测试留原 owner |
| `docs/` | 本项目唯一产品合同、执行计划及确有需要的技术说明 |

`tool.config.json`、构建文件和正式包随实际运行入口及安装需求加入。当前无需预装依赖或先构造一个空的可安装应用。

## 下一步

从[执行计划第 6 节](docs/execution-plan.zh-CN.md#6-当前断点与下次续接提示)读取唯一下一条未完成操作。先验证原有能力与真实阻塞，再完成一项可核对的用户操作；新增 Web Flow 业务实现归本项目，既有模块的修复仍由原 owner 负责。

本轮正式 UI 已在项目内实装；工作流/Bridge 的真实恢复等级仍以原记录为准，不要把离线单元成绩转记到正式应用。

## V0.3.5 正式 UI / 安装与验证

- 入口：在 OpenDesk Browser「扩展」使用原安装器审阅 `projects/webflow/webflow.opendesk-tool.json`，安装后打开 Web Flow；本项目不安装第二个 Chrome 扩展，不插入新的宿主 React Root。版本与 SHA 以本次同源包及执行计划 AWB-07 回执为准；升级沿用同一 ID、原安装审阅和原数据，HTML 预览不是安装入口。
- 固定委托：仅 `baidu.search.top3@1.1.1` 与 `google.search.top3@1.0.0`（确切 manifest/content Hash 随工具包冻结）。这不是“所有已安装脚本”的列表；安装变动或权限缺失只给出不可用状态，不尝试回退到同名任务。
- 手动运行：在「脚本 → 运行」填写参数，点击「保存运行步骤」后，先通过原 AppStorage 的 CAS 写入并读回稳定 `clientRequestId`、六字段 Task 安装身份和输入；再点击「确认手动运行」，该点击内同步调用 `tasks.start({clientRequestId,task,params})`。这两个动作分别保存步骤和执行网页操作，不增加依赖或权限批准。保存失败不派发，连续点击不会重复派发。本实例尚未提交时，“查询”保留确认入口，“取消未运行步骤”只取消本地步骤且不调用 Task；取消保存失败可重试取消同一步骤，永不恢复运行确认；已重开的未知步骤继续仅查询/停止。
- 恢复与停止：关闭重开后在「记录 → 原步骤 → 查询原请求」使用保存的原 ID 调用 `tasks.read({clientRequestId})`；「停止原请求」调用 `tasks.stop({clientRequestId})`，start ACK 未到时仍可停止。旧摘要也可从原记录查询，但摘要不是权威结果，结果正文仅来自本次通过授权的 SDK 回包。查询超时、无记录、UNKNOWN 和未释放均不生成新 ID 补跑。
- 阶段与边界：同一 Run/Result 的持久结果和 `retirementState === 'released'` 分开显示；未释放时不放开新的步骤，不自动续跑 B。仅保存、未确认运行就关闭的步骤也按未确认状态保留，只允许查询/停止，不把重开当成运行许可。需要包含 J06 恢复实现的 Browser 候选；更新工具 JSON 不会把旧 Browser 的固定 Host/Authority 一并更新。当前真实加载路径、serve 和候选安装身份未核实，不能声称已在用户 Chrome 生效。
- 自动运行：在 Web Flow 宿主页头下操作可信滑块；展开“任务范围与授权”，先复用已有有效批准，例如 `baidu.search.top3@1.1.1`、`https://www.baidu.com/`、`{"query":"OpenDesk Browser","limit":3}`。点击“生成 ChatGPT 指令”→“复制指令”，确认上方自动运行已开启后，在原 ChatGPT 对话粘贴并发送。每次新任务先生成新指令，不重复用旧候选。只有随后唯一完整助手回复的 `opendesk-task` 代码块内 `webflow.task.intent.v1`（严格 protocol/candidateId/taskId/targetUrl/args）可触发；用户消息、历史、引用和流式内容不触发。批准和开关即时保存，关闭只阻止未来准入；已开始的任务在原聊天任务卡停止。进度、持久结果和具体失败在原聊天查看，本应用“记录”只显示手动请求。旧 `opendesk.task.intent.v1` 的手动/五分钟路径保留。固定可信组件随 Browser 更新，单独安装此 JSON 不会更新旧 Browser 的监听器/授权控制器。
- 非当前阶段：全局脚本枚举、跨 App/Bridge 的完整历史、多步骤流程与跨对话。原回传保留但不作为本阶段自动触发的前置；真实网页、结果和自动触发仍须同一安装候选证明。
- 测试：`node --check projects/webflow/src/ui/{model,main}.js`（shell 不支持括号扩展时分开运行）；`node --test projects/webflow/tests/webflow-ui.test.mjs projects/webflow/tests/webflow-recovery-ui.test.mjs`；`node scripts/build-sidebar-tool.mjs projects/webflow --out artifacts/sidebar-tools/webflow/candidate.opendesk-tool.json`；成功后按打包 Skill 晋升及 `--check-project` 核对。隔离 UI 点击夹具：`node projects/webflow/tests/webflow-ui-server.mjs`，打印独占本地端口、输入 SHA；只加载本项目真实源码与 React，模拟 SDK 不使用真实 Task/用户记录。GitHub `.github/workflows/webflow-package.yml` 在项目 UI 源码变更后执行原打包器和测试，仅在显式 `workflow_dispatch` 时才把通过门禁的 JSON 写回 main；普通推送不自动发布包。既有 CI `41336225689` 已经完成包级写入与读回。
- 真实 Chrome 验收：安装包、安装审阅、固定 Task 已安装、目标网页授权、实际提交/结果/用户手势/关闭恢复、Bridge 交付，须在用户本机 Development Side Panel 使用本仓库真实版本逐项测，不能由 HTML 或 Node 自动通过代替。

具体状态与本轮代码提交以[执行计划](docs/execution-plan.zh-CN.md)的最新增量为准。
