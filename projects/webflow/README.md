# Web Flow

OpenDesk Browser 中的独立业务扩展应用：把网页操作、AI 对话输入输出、跨对话交接和任务恢复组织成可追溯的连续工作。

**唯一项目根：`projects/webflow/`。固定检索词：`OD-AI-WORKFLOW-BRIDGE`。**

**页签风格统一（2026-11-04）：** “运行与授权”三个页签已改用主页面的蓝色选中文字与下划线，去掉胶囊外框和按钮底色，保留等宽 40px、键盘切换和草稿。25 项相关检查通过，本轮独立 AI 组件复核 99/100；日常开发产物 `5e9966bf46e8` 已发布，真实侧栏应用及 Native 业务仍分别核验。见[最新样式复核](docs/webflow-v0.3-ui-ux-review.zh-CN.md#151-页签沿用主页面导航风格2026-11-04)。

**运行面板间距与页签（2026-11-03）：** 实际可信组件已调整为等宽 40px 页签、独立的自动运行状态组、同行的任务状态与刷新操作；长网址和提示正文分组阅读，短地址保持标签 / 值对应，授权时间与撤销就近排列。方向键 / Home / End / Escape、焦点归还、跨页签和开合后的授权草稿保留均已在真实 Chromium 组件夹具验证，相关既有检查 **23/23 PASS**。独立 AI UI 评审 **99/100**，限定本轮冻结布局；随后参数授权逻辑的变更及真实侧栏新混合候选不继承该分数。来源、完整图证、扣分与未测边界见[评审第 15 节](docs/webflow-v0.3-ui-ux-review.zh-CN.md#15-运行面板间距与等宽导航2026-11-03)和[本轮证据](evidence/ui-runtime-spacing-20261103.json)。

**运行与授权布局（2026-11-03）：** 打开[原路径单文件 HTML](preview/webflow-v0.3-preview.html)，点“对照运行与授权”。右侧新方案将**参数 JSON 固定为标题在上、完整正文在下**，不再把整个字段塞进第二栏，也不按字符数改变排版；地址等短信息用标签 / 值横向行。批准时间与撤销同行，原蓝色控件、底部 Sheet 及其他业务区保留。左侧明确是固定 654 参考；两侧仍为历史 **0.3.6 应用（246fd012a）+ 9418a5d1a 可信组件**，不冒称当前 0.3.8 或实时安装。

唯一生成入口仍为 `node projects/webflow/preview/build-design.mjs`；候选只保留一条 ScopeSummary 布局 hook 和原七项表现修复，不复制组件、改生产权限或手改生成 HTML。manifest/context 固定来源和字节，本轮 SHA 为 **`4e083d101d2be4e10228e89d0f7296f98e3f51b4ba08f81373635232a8942114`**。冻结来源及三项表现回归通过，完整字段 / 指令 / 长审核 / 焦点图与操作依据见[原评审第 14.6 节](docs/webflow-v0.3-ui-ux-review.zh-CN.md#146-参数-json-作为完整阅读块2026-11-03)。

本轮独立 AI UI 评审按[明确量表](preview/runtime-review-rubric.md)评分 **99/100**，来源 / 安全静态复核限定 PASS；未发现本轮新增产品缺陷。扣 1 分为首个 Tab 落点的可见焦点图证不足，不等于产品焦点不可见。旧双业务列方案已被用户否定，推荐撤回，旧分数不继承。本预览仅模拟边界，不运行真实任务或写系统剪贴板；Chrome 安装 / Native / production / 原生 IME / 读屏仍为 **NOT_TESTED**。正常聊天当前证据以下文为准，布局评分不代替用户验收。

**2026-11-03 UI 排版增量（v0.3.7）：** 首页仅保留紧凑的自动运行开关、状态摘要和“运行与授权”入口。独立面板分为当前任务 / 任务授权 / 使用说明；原始结果、运行身份和诊断默认折叠。沙箱三项主导航与帮助/设置合为一行，移除重复产品标题和大号统计卡。开合保持应用与授权草稿，导航不执行任务。源码、组件截图和独立评审见[现有 UI 评审第 12 节](docs/webflow-v0.3-ui-ux-review.zh-CN.md#12-v037-运行面板与应用布局修复2026-11-03)。此增量尚未在真实扩展安装/更新；下文 v0.3.6 实测与自动双轮证据仍只属于各自候选。可信组件随 Browser 编译，工具 JSON 单独更新不能替换它。

## 当前状态

**2026-11-04 当前执行断点（恢复授权后）：** 用户已允许恢复原开发服务。唯一 writer **49560** 在固定 `dist/development` 完成首次编译；真实侧栏确认原扩展 ID、开发服务已连接及指纹 `321cf9f4ea14…`，三处新路由源码映射逐字一致。同一项目聊天的新文档中，普通需求“OpenDesk Browser SDK”产生全新 Run `34e46e3b…`，三条真实网页结果、同 Run 持久值、退休 / released、原聊天单次回传和完整 AI 续答已核对。加入同窗口第二个真实 Host 后，普通“时间清单”也路由到同一正确 Host，但 Run `9c700548…` 在已安装 Task 1.1.3 的 **60 秒期限**到期，未交付结果；该失败已留证，不重放。

当前 Task 候选 **1.1.4** 仅将清单期限调整至现有合同支持的 **120 秒**，源码仍为 `14b8dd8d…`，权限、网站和参数不变。新 120 秒草稿 Run **`56321c09-4c89-46aa-b95d-145e7247ab1c`** / Result `6ffbd5d5…` 已真实 `success/count3`、Worker 退休和 released。Task 包检查 18、应用相关检查 36 均通过；WebFlow **0.3.10** 已由原打包器晋升并同源核对，唯一正式包 SHA `01433fba…`。Task 1.1.4 已导入本地目录，仍是**待验证**；两项新版本尚未安装，不把草稿成功记为安装后自动通过。

**下一条操作：** 在已打开的本地任务目录，以以上原 Run ID 核对运行证据 → 设为本地可用 → 安装确定版本 1.1.4；再经原安装器原位更新 WebFlow 0.3.10，并为新安装身份重新审阅关键词规则一次。然后用两条全新普通需求完成不同关键词自动执行与独立整体 ≥95。原 A/B/C/D 候选全部保留且不重放，旧组件 99 分不继承。当前浏览器工具的 URL 安全策略拒绝 `chrome-extension://` 页面，并禁止换控制方式完成同一操作；本任务已停止受影响的浏览器控制，没有尝试绕过。开发服务继续运行，目标未完成（当前状态以本任务目标记录为准），**整体 NOT_SCORED**；production、全矩阵和 MCP 延期。详情继续沿用[执行计划 12.11.20](docs/execution-plan.zh-CN.md#121120-任务范围授权与换关键词免重复批准2026-11-04)和[原生证据](evidence/authorization-runtime-20261104.json)。

**自动运行授权调整（2026-11-04，源码、定向组件及开发产物磁盘发布通过，真实新授权待核验）：** 已定位“自动运行开启但换关键词仍待批准”的原因：旧批准将 `args.query` 与安装身份一并逐字固定。百度搜索现在可在可信审核时一次选择“允许更换搜索关键词”：关键词按该安装版本 Schema 的 1–120 字约束变化，结果数量仍固定为批准的 3，目标地址和安装身份继续固定。高级入口仍可只允许一组精确输入；历史精确授权不静默扩权，可在“任务授权”点击“改为允许更换关键词…”重新审阅一次，或在当前待批准卡片选择“允许更换关键词并执行”。之后合法换词不再重复批准。85 项授权/执行围栏/界面定向测试和 1 项固定源码准入测试通过；开发产物 `97b1997586d5` 已在 `dist/development` 发布，相关输出 SHA 与 10 项源码映射逐字核对一致，实际侧栏加载和客户端连接仍未验证。不代表已修改本机授权或实际执行了用户当前候选。可信源码随 Browser 持续开发更新，单独更新工具 JSON 不会应用此改动。细节及剩余验证见[执行计划 12.11.20](docs/execution-plan.zh-CN.md#121120-任务范围授权与换关键词免重复批准2026-11-04)。下文 11 月 3 日“新精确范围”记录保留为当时固定输入模式的证据。

**普通新范围（2026-11-03，dev 核心已验证）：** 一次可见能力说明现在区分真实已安装 Task Schema 与已批准精确范围。在普通聊天请求搜索“OpenDesk Browser SDK / 前三条”，AI 自行产生五字段新候选，先显示待批准且零执行；在可信“当前任务”审阅并批准后，同候选沿原 Task 执行并单次回传。后续普通消息自动产生新候选、新 Run，无需再次接入或审批。两轮独立百度 DOM、同 Run 完整持久数据、released、单次交付及 AI 完整续答均在开发候选 `d623f73025c1` 核对。新批准按现行合同**替换**该 Task 原精确范围；旧关键词不继承，取消待批准、原生 Stop 和五条不支持请求均未执行。Task 仍为 1.1.2，应用仍为已安装 0.3.8，均未升级。见[本轮证据](evidence/normal-new-scope-20261103.json)及[执行计划 12.11.17](docs/execution-plan.zh-CN.md#121117-普通新范围待批准与同候选执行2026-11-03)。历史固定范围证据继续有效，不能合并为不同构建的同候选验收。

**正常聊天入口（2026-11-03，dev 核心已验证）：** 当前 ChatGPT 项目已完成一次能力说明接入。保持 Web Flow 侧栏打开，正常发送需求即可；AI 每次生成新候选，无需每轮生成/复制 JSON 或重新批准。真实连续两轮百度任务、同 Run 持久结果、资源释放及原聊天单次回传已通过；无关聊天、五条越范围请求与停止回复均明确未执行。普通项目外聊天也已验证“一次可见说明 → 普通需求 → 原 Task/结果”，接入仅限该聊天，不代表全局或 MCP 已连接。应用说明包 **0.3.8 已原位安装**，原 Task/精确批准未变化。[本轮证据](evidence/normal-chat-20261103.json)及[执行计划 12.11.16](docs/execution-plan.zh-CN.md#121116-用户纠偏正常-chatgpt-消息主入口与可见执行状态2026-11-03)记录候选与未测边界。下面的双轮/生成器记录是历史辅助输入证据，不能替代本轮正常消息。

当前核心是 **ChatGPT 新完整回复 → 严格五字段协议 → 已批准的固定脚本 → 持久结果与原聊天反馈**。2026-11-03，当前持续开发环境已完成百度任务 1.1.2 的真实验证与原位升级，并在同一精确批准及开关不变下完成两个空白 ChatGPT 对话的首发自动执行。每轮真实百度 DOM、同 Run 持久结果、资源释放、侧栏及原聊天完整数据的单次交付均已核对，见[本轮实测证据](evidence/authorized-two-rounds-20261103.json)及执行计划第 12.11.13 节。

v0.3.6 同步沙箱中的百度固定任务为已验证的 1.1.2，解决升级后仍显示旧版本不可用的问题；唯一正式包已经原位更新到本机。当前 Browser 的可信“当前任务”展示自动进度、同次持久结果、资源释放和原聊天交付；“任务范围与授权”可从有效批准生成每次新 candidateId 的 ChatGPT 指令，生成本身不运行任务、不改变批准或开关。指令采用单段文本及 JSON Unicode 网址转义，保护精确发送见证。可信组件随 Browser 固定编译，工具 JSON 不替换它；本轮未修改该组件或运行时身份校验。

历史首发反例及修复见[执行计划第 12.11.9 节](docs/execution-plan.zh-CN.md#12119-首条发送临时路由与结果隔离修复真实首发发现已证明执行被运行时身份阻止2026-11-03)及[当时实测记录](evidence/new-conversation-20261103.json)。旧任务的运行时拒绝已沿原 Candidate → Verification → Available → Installed 链解除；1.1.2 与 1.1.1 源码逐字相同，未改 SHA/ABI 校验。原 installationId 保留，generation 升至 2，再经可信原生审核恢复同一百度首页及固定参数批准；本轮两次首发均先绑定正式 `/c/` 再自动准入。

前一候选的单次成功保留在[历史实测结论](evidence/core-auto-20261103.json)。[提示词 A](tests/manual-auto-baidu-a.prompt.txt) 已在用户现场观察到发送，禁止重放；[提示词 B](tests/manual-auto-baidu-b.prompt.txt) 的历史准备状态未重新核实。以后使用新 candidateId；运行时阻塞解除前不要把发送新候选当作补跑。正式 MCP 链仍未验证。

2026-11-02，V0.3.3 正式 Sidebar Tool v2 应用源码已进入 `src/ui/`，配置为 `tool.config.json`（应用 ID `webflow`）。正式信息架构为概览 / 脚本 / 记录，帮助和设置位于标题栏。已实现固定任务核对、派发前保存原步骤、手动委托执行、关闭重开后按原请求查询/停止、结果与资源释放分开显示，以及仅属于本应用的持久摘要；v0.3.3 使用原打包器的候选、定向验证和晋升链；React DOM 交互与隔离 SDK 夹具不等于真实安装或 Task 执行，当前证据见原执行计划 AWB-07。该段为 v0.3.3 初始阶段记录；后续真实安装与自动核心链以执行计划第 12.11.4–12.11.6 节为准，其余手动恢复专项不因此宣称通过。原交接校验与单 owner 离线队列模块保留，详见[离线模块说明](docs/offline-modules.zh-CN.md)，**它们仍未接实际派发或原 ChatGPT 交付**。

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

## V0.3.6 正式 UI / 安装与验证

- 入口：在 OpenDesk Browser「扩展」使用原安装器审阅 `projects/webflow/webflow.opendesk-tool.json`，安装后打开 Web Flow；本项目不安装第二个 Chrome 扩展，不插入新的宿主 React Root。版本与 SHA 以本次同源包及执行计划 AWB-07 回执为准；升级沿用同一 ID、原安装审阅和原数据，HTML 预览不是安装入口。
- 固定委托：仅 `baidu.search.top3@1.1.2` 与 `google.search.top3@1.0.0`（确切 manifest/content Hash 随工具包冻结）。这不是“所有已安装脚本”的列表；安装变动或权限缺失只给出不可用状态，不尝试回退到同名任务。本机百度已可用；Google 安装/授权不可用，未纳入本轮通过结论。
- 手动运行：在「脚本 → 运行」填写参数，点击「保存运行步骤」后，先通过原 AppStorage 的 CAS 写入并读回稳定 `clientRequestId`、六字段 Task 安装身份和输入；再点击「确认手动运行」，该点击内同步调用 `tasks.start({clientRequestId,task,params})`。这两个动作分别保存步骤和执行网页操作，不增加依赖或权限批准。保存失败不派发，连续点击不会重复派发。本实例尚未提交时，“查询”保留确认入口，“取消未运行步骤”只取消本地步骤且不调用 Task；取消保存失败可重试取消同一步骤，永不恢复运行确认；已重开的未知步骤继续仅查询/停止。
- 恢复与停止：关闭重开后在「记录 → 原步骤 → 查询原请求」使用保存的原 ID 调用 `tasks.read({clientRequestId})`；「停止原请求」调用 `tasks.stop({clientRequestId})`，start ACK 未到时仍可停止。旧摘要也可从原记录查询，但摘要不是权威结果，结果正文仅来自本次通过授权的 SDK 回包。查询超时、无记录、UNKNOWN 和未释放均不生成新 ID 补跑。
- 阶段与边界：同一 Run/Result 的持久结果和 `retirementState === 'released'` 分开显示；未释放时不放开新的步骤，不自动续跑 B。仅保存、未确认运行就关闭的步骤也按未确认状态保留，只允许查询/停止，不把重开当成运行许可。需要包含 J06 恢复实现的 Browser 候选；更新工具 JSON 不会把旧 Browser 的固定 Host/Authority 一并更新。本轮已核实持续开发路径、serve、任务及应用安装；手动恢复的真实 Chrome 专项仍为 NOT_TESTED。
- 自动运行：在 Web Flow 宿主页头下操作可信滑块；展开“任务范围与授权”，先复用已有有效批准，例如 `baidu.search.top3@1.1.2`、`https://www.baidu.com/`、`{"query":"OpenDesk Browser","limit":3}`。点击“生成 ChatGPT 指令”→“复制指令”，确认上方自动运行已开启后，在原 ChatGPT 对话粘贴并发送。每次新任务先生成新指令，不重复用旧候选。只有随后唯一完整助手回复的 `opendesk-task` 代码块内 `webflow.task.intent.v1`（严格 protocol/candidateId/taskId/targetUrl/args）可触发；用户消息、历史、引用和流式内容不触发。批准和开关即时保存，关闭只阻止未来准入；已开始的任务在上方可信“当前任务”停止；手动/一次批准也可从该区操作。进度、同次持久结果、资源释放和原聊天交付分别显示在“当前任务”，结果仍回原聊天，本应用“记录”只显示手动请求。旧 `opendesk.task.intent.v1` 的手动/五分钟路径保留。固定可信组件随 Browser 更新，单独安装此 JSON 不会更新旧 Browser 的监听器/授权控制器。
- 非当前阶段：全局脚本枚举、跨 App/Bridge 的完整历史、多步骤流程与跨对话。原回传保留；本次自动核心链及单次聊天交付已有同一开发候选证据，手动/一次批准/停止的新增侧栏入口原生实测仍为 NOT_TESTED。旧网页浮层暂保留，本次操作未使用它。
- 测试：`node --check projects/webflow/src/ui/{model,main}.js`（shell 不支持括号扩展时分开运行）；`node --test projects/webflow/tests/webflow-ui.test.mjs projects/webflow/tests/webflow-recovery-ui.test.mjs`；`node scripts/build-sidebar-tool.mjs projects/webflow --out artifacts/sidebar-tools/webflow/candidate.opendesk-tool.json`；成功后按打包 Skill 晋升及 `--check-project` 核对。隔离 UI 点击夹具：`node projects/webflow/tests/webflow-ui-server.mjs`，打印独占本地端口、输入 SHA；只加载本项目真实源码与 React，模拟 SDK 不使用真实 Task/用户记录。GitHub `.github/workflows/webflow-package.yml` 在项目 UI 源码变更后执行原打包器和测试，仅在显式 `workflow_dispatch` 时才把通过门禁的 JSON 写回 main；普通推送不自动发布包。既有 CI `41336225689` 已经完成包级写入与读回。
- 真实 Chrome 验收：安装包、安装审阅、固定 Task 已安装、目标网页授权、实际提交/结果/用户手势/关闭恢复、Bridge 交付，须在用户本机 Development Side Panel 使用本仓库真实版本逐项测，不能由 HTML 或 Node 自动通过代替。

具体状态与本轮代码提交以[执行计划](docs/execution-plan.zh-CN.md)的最新增量为准。
