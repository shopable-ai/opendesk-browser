## 自动运行控件稳定性（2026-11-11；核心 UI 修复）

**当前操作与原因：** 打开 Web Flow 时，`AutoSettings.tsx` 在首轮异步读取及写入期间临时插入“关闭未来自动准入”，完成后又移除；未知状态文字还会被开关替换。真实组件的 ego 慢读取复现中，首页控制区从 102.5px 缩为 61px。该控制归本项目固定编译的可信 UI，不在应用 JSON 内。

**设计与实现：** 复用原共享 Switch、原控制器和唯一 React 根；固定 44px 控制槽，读取期间以中性占位和明确状态表示未知，不冒充关闭，不自动修改授权。正常开关在原位更新且等待 Host 回执；“运行与授权 → 应急关闭自动运行”始终保留原 deny-only 操作，不随读取/保存插入首页。失败原因持续显示，UNKNOWN 同时显示原具体错误。已开始的任务继续由“当前任务”停止，不回滚或重放。

**写入与验证：** 本次只改 `trusted/AutoSettings.tsx`、原 `tests/auto-settings-ui.test.mjs` 和该组件在 `scripts/bundle-provenance.mjs` 的精确审阅 pin，以及本段和产品合同。新增首读/保存/刷新稳定性回归；现有手势、撤销、迟到回包及反馈等定向检查 56/56 PASS。ego TaskSpace 72 的真实组件/模拟数据复测中，首读前后控制区恒为 61px，首页关闭按钮出现帧数为 0；这不是实际 Chrome 安装通过。并行 main 同步保留本修复并增加独立文件管理入口后，当前源码再次通过 56/56。未改应用包、版本、权限或用户自动运行状态。

**当前生效边界：** 复用已有 `dist/development` writer PID 76922，未停止/重启它或覆写输出。现有固定工作台构建被并行 AI Proxy 来源 pin 失配（当前检查 `projects/ai-proxy/src/Settings.tsx`）阻断；旧 watcher hooks 也曾报告本组件旧 pin。当前组件 pin 与源码一致，但新固定产物及已安装 Side Panel 生效仍 **NOT_TESTED**；不得以工具 JSON 更新替代。下一步仅在相关 owner 恢复来源审阅/原配置 hooks 后，由原 watcher 编译，沿安全刷新入口核对打开 Web Flow 的实际控件。保留其他任务、草稿和 UNKNOWN，不重复真实 Task、不进入 production/全量验收。证据见 [control-stability-20261111.json](../evidence/control-stability-20261111.json)。

## Codex 本地 MCP Demo · 源码完善与 Mac 交接（2026-11-11，OD-AI-WORKFLOW-BRIDGE）

**原始目标：** 已批准的 WebFlow 浏览器任务完成后，依托现有 OpenDesk 可信 Native/MCP 桥接，唤起官方 Codex 本地桌面并创建未发送草稿，或经 Codex App Server 创建新 Thread、提交一次只读 Turn、取得真实回答和持久身份，最终将可信回执展示于原 WebFlow。**当前这条真实 WebFlow→Native→Codex 入口尚未接线。**

**本轮增量（仅独立 Demo，main）：** 复用 `projects/webflow/demos/codex-local-handoff/` 原源码，不重建项目。Codex App Server 结果优先收集最终 `item/completed agentMessage.text`，允许 `turn/completed` 完整快照回退，delta-only 明确标成非权威；`turn.status=completed` 不再直接得到 `businessSuccess=true`，改为 `businessSuccess:null`、`taskVerified:false`。超时、子进程异常、权限请求或 RPC 拒绝的错误回执包含已取得的 `threadId`、`turnId`、`submissionState`，UNKNOWN 不重试。保留原 MCP 初始化门禁与同服务 single-flight，CLI 拒绝未知 flag。新增针对 final/stream/empty/failed/approval/timeout/crash/error-envelope/并发等回归。Codex 原生执行提示词写入 [CODEX-LOCAL-ACCEPTANCE.prompt.md](../demos/codex-local-handoff/CODEX-LOCAL-ACCEPTANCE.prompt.md)。

**实际证据与限制：** NODE = 独立 Linux Node v22.16.0 `node --test projects/webflow/demos/codex-local-handoff/demo.test.mjs` **16/16 PASS**（按提交的业务逻辑本地同源测试），GitHub main 六个源码/文档文件逐个读回身份核对。**不是当前 main 工作区在真实 Mac 的构建/执行证据。** MAC_DRAFT、MAC_TURN、DESKTOP_THREAD = NOT_TESTED；BROWSER_NATIVE / WEBFLOW_E2E = NOT_IMPLEMENTED / NOT_TESTED。旧百度/Google Task、其它 Markdown/A→B 链路与正式 WebFlow 包均未修改或重放；未调用真实 Codex、Native、Chrome，也不宣称本轮完成业务闭环。

**下一条最小用户操作：** 在真实 Mac 的现有 `main` 工作区打开上述仓库内 Codex 提示词，先做只读 deep link 草稿和 App Server Thread/Turn/真实回答/桌面同会话核验，按实际结果最小修复；实测可证后再由可信 Browser/Native owner 补固定受审阅入口并完成原 WebFlow 单次结果回填，UNKNOWN 保留原身份只读对账。禁止把本机模拟 MCP CLI 触发器当已安装 WebFlow 执行权。

---

## Markdown 双聊天执行纵切 · 本轮实际源码与未接线边界（2026-11-11，OD-AI-WORKFLOW-BRIDGE）

**唯一产品目标：** WebFlow 读取并冻结真实 GitHub Markdown T01/T02 → 用户一次明确批准 → 原 ChatGPT Task 0.2.0 在两个不同的普通 ChatGPT 新聊天中各发送一次 → 以原 Controller 持久回执、消息身份和完整回复独立验收 → Native Workspace 写入并独立读回 T01/T02，T02 只接收已读回的 T01 完整 JSON → 重启/刷新只恢复原身份，不能重新发送。

**本轮已提交的真实增量：** `src/md-run-contract.js` 修复“发送前必须存在 /c/ URL”的错误状态顺序，增加不可重放的 `TASK_DISPATCHED` 和 `WRITE_DISPATCHED`；`trusted/md-workflow-engine.js` 负责同一 run 的串行 T01/T02 编排与已安装 Task 精确 pin 检查（非新的 Runner/Authority）；`trusted/md-run-receipt.js` 从原 Controller 的定向快照、保留页与已审阅 0.2.0 结果校验身份；`trusted/md-run-ledger.js` 在原 `frameworkKV` CAS 上接入只读回复恢复；`trusted/md-native-artifacts.js` 在既有 Native Files Port 上实现写意图冻结、一次派发、真实 ACK 和完整字节/SHA/版本读回。原 `src/platform/host/controller-methods.js` 只读快照增加 `requestId` 精确选择、安装 pin 的有限投影；并行开发和旧不可变 Task 均未覆盖。定向测试已放入原 Bridge CI，未造第二个 Demo/账本。

**实际证据：** Bridge 定向 Node 在 Run 42876850458 为 **103/103 PASS**（纯代码合同与模拟副作用，不是浏览器）。其后新编排器初次测试出现 Schema fixture 缺失 `title`，已在后续提交修正；此项最新绿灯仍须绑定对应 HEAD 和真实 CI 日志核对。与此无关的百度/GitHub 最新并行来源验证或 V2 Schema 测试失败不能冒称 Markdown 两聊天失败/成功。Mac CodexPro 连接 `UNAVAILABLE`，OpenDesk Desktop MCP 返回 Session terminated；**无真实 ChatGPT 聊天、真实 Native 文件、正式包或整链验收证据。**

**仍然阻塞点击一次开始：** (1) 原可信 Side Panel/Host 尚未针对冻结的来源 SHA、账号、安装身份、文件作用域创建一次性双任务 Authority 审阅，`md-run-ledger.js` 和 `md-workflow-engine.js` 尚未装入真实宿主；(2) 实际登录账号身份验证尚无安全可调用接口（`verifyAccount` 为受信注入要求，不能从模型文字/未验证页面猜测）；(3) 原 Native Files service 仅向可信文件设置页/已验证连接开放，未把经过 workflow grant 的 T01/T02 精确文件作用域委托给本 Host；(4) `src/ui/main.js` 的「开始」仍禁用，未展示运行/两条链接/成果；(5) Package/Chrome/真实 80/160 与 81/162 双运行均 NOT_TESTED。**绝不可借 sandbox.tasks.start 假手势或直接跨信任域调用 files.request。**

**状态：** `SOURCE_COMPLETE=PARTIAL`；`NODE_TESTED=PARTIAL`（最新专项必须按 commit 验证）；`PACKAGE_READY=NO`；`CHROME_TESTED=NO`；`BUSINESS_ACCEPTED=NO`。

**唯一下一步：** 在原可信 Host 与 Native 文件服务完成 workflow 授权入口及真实账号身份栅栏，接入现有 ledger/engine，再启用原 MD 页并执行实际 Chrome T01→文件读回→T02，随后才打包晋升。不要重新编写已完成的 Task、解析器、Native adapter 或独立 Runner。

---

## 2026-11-11 · Web Flow R2 任务通知 P0 当前执行卡（OD-AI-WORKFLOW-BRIDGE）

**原始问题与目标：** 用户手动/自动/按原批准计划触发浏览器脚本后，希望在 Side Panel/PC 已打开工具宿主清楚看到开始、进行、脚本完成、实际结果回传、失败和 UNKNOWN；同一原请求只更新已有通知，并能通过原任务页面恢复查看 Run/Result。通知只消费可信状态，不授予新权限、不重放任何脚本。不可见宿主的跨窗口通知和网页注入不是 P0。

| 任务 | 已实现源码/证据 | 未完成与验收边界 |
| --- | --- | --- |
| T01 事实与边界 | 复核 AGENTS/README/合同/计划、R1.2 唯一 API 与 Toast Store、Bridge/Host、手动 tasks.start/read 及可信 CurrentTask 的原 receipt；确认无现有 Web Flow 任务 Toast 接线。 | 不重建 Controller/Scheduler/Authority 或其它并行 A→B、MD 链。 |
| T02 权威文档 | 本卡只记开发/测试进度；product-contract 保存业务语义与阶段；框架 confirmation-and-feedback 只保存跨工具边界；公共 API 签名保持 docs/api/sidebar-tools 不变。 | 不建平行合同。 |
| T03 手动任务通知 | src/ui/model.js 新增 taskNotice/createTaskNoticePublisher；src/ui/main.js 在原已读取 Run/Result 后调用 notify.open/update，按同一 clientRequestId 去重、最多 12 次更新、卸载 dismiss；UNKNOWN 不重放、completed 不等于业务成功，block/no_results 等报告警告；拒绝与接口缺失保持原记录。 | 只针对已打开手动沙箱宿主。 |
| T03 可信自动任务通知 | trusted/CurrentTask.tsx 从同一原 receipt 核验 requestId、persistence、release、delivery，采用已有 view.addToolToast/updateToolToast，处理完成/失败/UNKNOWN 与单条更新；trusted/AutoSettings.tsx 和 src/ui/react/app-shell.tsx 仅传递原可信 Host Toast Store。 | 依附原可信「当前任务」及可见宿主，非跨窗口分发；不改变网页侧或调度。 |
| T04 最小交互 | Toast 纯文本；原手动「记录 → 查询原请求」、自动「运行与授权 → 当前任务」保持详情入口。关闭通知不删 Run/Result；只有 delivery=confirmed 说回传确认。 | 不新增公开 notify 回调/URL。 |
| T05 定向测试 | tests/task-notice.test.mjs、tests/current-task.test.mjs、tests/webflow-recovery-ui.test.mjs 增加投影、同句柄更新、旧 Host、UNKNOWN、恢复、不执行重放检查；app.ci.json 登记纯状态测试；独立 V8 对项目 model.js 真实加载并执行 8 个烟雾断言通过。 | GitHub Node 完整定向 CI 还须以最终 HEAD 运行结果确认；Chrome 安装/目视/原网站 Task 未验证。 |

**源码变更提交（main，按文件）：** model 22a2a5b24fe8 / 9f80e6f621cd；手动 main a2a3f508ec2f；自动 CurrentTask 1b2cdc4b3694 / d0eea683e177；AutoSettings 3b707abd68d7；app-shell e83ef2cc113e；测试 task-notice 66ab37ff5b3a / 58411eaf4ce5、current-task e3688a9cb9ca、recovery b94c90f3cde6、app.ci ec9a170609d9；修复旧包测试依赖计数断言 26bb940509ad。以上都是源码提交，非安装验证。

**首次 CI 阻塞及处理：** Web Flow 包工作流 [42877403405](https://github.com/shopable-ai/opendesk-browser/actions/runs/42877403405) 的实际 Node 步骤 **63/64**，一项是原 tests/webflow-ui.test.mjs 中固定断言 `scripts.length===1` 与现行构建器从两个已声明依赖产生两项 Script 的事实不符；与通知运行行为无关。已最小改为与正式 tool.config.json 的固定依赖数量及路径逐项比对（26bb940509ad），需等新一轮同源 CI 核对，不能提前写 PASS。

**当前分级：** SOURCE_IMPLEMENTED=main 已提交；SOURCE_SMOKE=项目 model.js 的直接 V8 验证 PASS；NODE_TESTED=最终代码定向 GitHub CI 待证据；PACKAGE_READY=未通过当前候选同源构建/晋升（正式 webflow.opendesk-tool.json 尚未证明包含新增通知）；CHROME_TESTED=NOT_TESTED；BUSINESS_ACCEPTED=NOT_TESTED。共享 dist/development、watcher、并行未提交工作及原运行记录未触碰。

**2026-11-11 反方审计与最终源码增量：** 严格约束手动终态必须与持久 Result.state 匹配（避免单凭 completed/stop 导致成功或已停止误报）；可信自动回传追加 submitted/unknown/confirmed 三级提示；页面切换后旧终态不重新弹出；读回权限失败时把既有成功 Toast 降为“结果未确认”且不生成 Run；可信 Host Toast 限定每实例每分钟三次创建、十二次更新、三十分钟句柄有效，旧实例销毁即清理。关键后续提交：model `e0fa70ce9f5c`、手动入口 `6bd075c32c3a`、CurrentTask `e53ac9f57f50`、相关回归测试 `d5acc7c398b8`、`3f8ace1fcf17`、`73a4a0b84207`。根据 GitHub 最新读取，完整 Web Flow 包及 App CI 尚无最终同 HEAD PASS；6/6 个项目 task-notice.test 真实逻辑在隔离 V8 中逐条执行通过，**不是 Node/Chrome 通过**。原 63/64 失败已核因并修复旧脚本数量断言，但修复后必须重新获取完整 CI 通过证据。Scheduler 自身的独立 Fire→Run 通知是否进入本 Web Flow 消费者尚未独立核验；不能靠本次手动/自动源码替它做成功声明。

**下一步唯一动作：** 取得最新提交的定向 CI 最终结果并只修确切失败；之后交本地 Codex 对唯一正式包按原 packager 候选→同源验证→用户批准下安装，真实 Chrome 最短验证手动 RUNNING→completed、可信自动同次结果/回传与 UNKNOWN、关闭侧栏/刷新恢复，不改旧权限、不重放任何未知任务。P1/P2 延期。

---
## A→B 单次回填 · 源码补缺接续（2026-11-11，OD-AI-WORKFLOW-BRIDGE）

**原始目标：** 用户在 ChatGPT 对话 A 发出指令，Web Flow 用原 V2 单候选审批与原 Controller 在新标签 B 准备草稿（默认 send:false），只有明确批准 send:true 才单次原生发送。仅当 B 出现匹配的用户消息、完整助手回复与真实持久 /c/ 链接后，原受控 delivery 才把可点击 B 链接、Run/Result 和必要状态回填给来源 A；ACK 不明时按原身份查询，严禁补发。GPT-6/High 指定值不可核验时必须停止。

**已有成果（不计本轮新增）：** 0.2.0 固定包和审阅保护、V2 固定解析/来源/独立批准、原 Controller owned-tab retention、原 Run/Result 读取、原来源 tab/document 定向交付与 UNKNOWN 围栏。0.2.0 对 model/effort/thinking 显式要求仍是安全拒绝；`src/chat-handoff-contract.js` 仍只含纯数据合同。

**本轮差量源码：** `src/chatgpt-conversation-result.js` 为原 0.2.0 结果提供严格校验和有界回填：未发送草稿不得有 /c/ 身份；已发送结果须匹配审批 prompt 长度、固定来源、原生消息引用、完整回复和确切 `https://chatgpt.com/c/UUID`。原完整回复留在同一个原 Controller Durable Result（可至 64 KiB）；送 A 的文本含真实可点击 URL、原 Run/Result 身份和明确标为预览的短摘录，仍遵守 8192 字节回传上限。接入 `chatgpt-fixed-bridge-host.js` 的原 durable 验证/formatter，不新建 Runner、Host、Ledger 或安装器。新 `chatgpt-create-result.test.mjs` 已接入原 Bridge CI，测试仅代表 Node 层，不能证明 Chrome 发送。

**验收状态（本轮实读 CI）：** SOURCE = main 已提交（`c431b256` 与安全修复 `f9ee003e`）；NODE_TEST = [GitHub Actions Run 42862131792](https://github.com/shopable-ai/opendesk-browser/actions/runs/42862131792) 语法通过，专项 Node **61/61 PASS**，综合 **166/167**（唯一失败为并行 AI Proxy `projects/ai-proxy/src/QuickPanel.tsx` 固定来源锁）；PACKAGE = NOT_TESTED（该 CI 构建步骤因综合检查失败跳过）；CHROME = NOT_TESTED；BUSINESS = NOT_TESTED。不能继承专项通过到整体构建或实站。GitHub 只可查已提交分支，不可查本机未提交工作树。未经 Chrome 现场核验不得向用户宣称 A→B 已经可用。

**依然未完成：** GPT-6/High/Thinking 真实选择与读回；账号一致性；发送中断后不重发的只读续查；长提示词 SHA-256/owner/TTL 安全引用；真正 Chrome B 回复完整与 A 一次回填/草稿保护。启动前 activateTab 属独立 P3，不阻碍本轮回填修复，但尚未核验。

**唯一下一步：** 先核本轮精准 Node CI；之后在真实已安装 Chrome 以安全测试聊天实证来源 A → B 单次发送 → 原生 URL/回复 → A 单次链接回填。仅按真实失败修复，不清理任何历史 UNKNOWN 或并行项目。

---

## 2026-11-11 · 增量修正：Markdown ChatGPT 0.2 实际发送生命周期（OD-AI-WORKFLOW-BRIDGE）

**真实用户目标保持不变：** 点击一次开始，T01 使用第一个新 ChatGPT 聊天取得完整回复并授权写文件、读回，T02 在第二个不同聊天中只读取 T01 完整 JSON 正文并再次保存读回；中断不重复发信。

**本次源码增量（不能视为业务整链完成）：** 纠正 `src/md-run-contract.js` 与不可变的 0.2 ChatGPT Task 的逻辑冲突：新 Task 是**一次受审的原生提交，之后取得真实 /c/ URL**，不能预先假设已创建持久聊天。现在合同先冻结安装 pin、授权、提示词 SHA 和原请求身份，再允许记录原 Controller Run 身份；在原请求的可信持久结果真正读到后才一次性记录聊天、文档、账号、用户消息、助手消息及完整回复。ACK 丢失可对原请求只读对账并结算，UNKNOWN 不生成新请求；暂停后的已发结果和文件读回可结算。新增唯一确定性 T01/T02 提示词生成器，T02 使用 `steps[0].readback.text` 完整正文，提示词不注入计算期望值。对应定向 Node 测试改为真实 0.2 事件顺序并覆盖 35→36、未知/暂停/身份伪造。此处修改的是**数据合同**，没有修改已发行 Task 0.2.0 的固定源码。

**尚未完成且绝不冒充：** 原可信 Host 尚未把 `trusted/md-run-ledger.js` 接入实际用户授权及 Controller Task 调度，账号身份核验、原持久 Run 只读恢复、Native Workspace 的真实写入/独立读回、沙箱 MD UI 启动/状态展示、正式包同源晋升及 Chrome 两聊天业务验收均未完成。**MD 页面“开始”保持禁用。** 后续首要工作仍是可信 Host 执行纵切，不应回头开发已有的解析器、账本、0.2 Task 或另建 runner。

---

## 百度固定脚本核心 UI 目标与关键条件（2026-11-10）

**最新阶段（20:10）：首页真实手动请求遇到验证码，核心链未完成。** 当前对话 01a1c556 在自有 ego TaskSpace **61** 从百度首页进入真实 WebFlow **0.3.26**，核对百度 **1.1.5 / generation 4** 及原双 hash 后保存 `MDN Web API MutationObserver`；请求 **webflow:fcd2a5b4-c77e-430e-ae7b-1cd2b5e68caa** 明确确认一次。实际页面跳到 `https://wappass.baidu.com/static/captcha/tuxing_v2.html`，回跳参数为本次关键词结果页；原生页面显示“百度安全验证／请完成下方验证后继续操作”。未取得三条结果，未重试、解验证或重放。WebFlow 显示“原请求仍未确定”、阶段“执行中”、资源释放 `not-started`，**不能据此认定底层未执行或已释放**；Run/Result、输入读回、实际准入次数和持久终态均待只读核对。

开发环境仍为原 `dist/development`，writer **PID 1475 / 43119** 在本轮只读核对时存活；真实调试页显示服务已连接、extension ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、applied revision **4fbac865a7b7d5ad4419f3436de5dc5e55e31e75bab596a04cf899e535c9d006**，执行前槽空闲。磁盘加载目录没有访问内部页重验。随后 ego 明确报告 Space 已交给用户控制，本轮立即停止浏览器操作，未创建控制页／CDP 会话，也未调用 finish 或再次接管；原 UI 租约已释放。只更新百度文档与原证据，未改产品源码、包或 pin，不继承其他候选的原生成功。

**唯一接续动作：** 用户完成页面验证并明确继续后，恢复同一 Space，先只读查询上述原请求和匹配 Run/Result、已发生效果及真实释放状态。旧 UNKNOWN、ACK 缺失和未释放记录不补跑。此前首页 `E_DOCUMENT_REPLACED` 仍是历史待修；公开 Controller 的 `click({waitUntil:'load'|'domcontentloaded'})` 已声明同 Origin 整页导航交接，但本轮验证码跳到不同 Origin，不能用放宽文档／Origin 保护修复，也不能在验证码阻塞下宣称该 API 修复已验证。首页成功后才核对成功结果的刷新／退出重开不重跑；ChatGPT、V2、Google、production、评分与全量矩阵继续延期。原证据新增 `continuation.homepageCoreAttempt`，历史字段保留。

**以下是 18:56 历史范围：限定手动请求条件已实测，不代表首页搜索全链或正式验收。** 源对话 01a1c483 的目标维持原暂停交接说明；接收对话 01a1c4e4 的窄目标仅包含失效状态与原链恢复、新手动请求三条结果、刷新和退出重开不重复。用户恢复目标后，继续沿原入口完成；原 18:11 blocked 是历史状态。成功 Run 走固定脚本已声明的“精确关键词结果页只读”分支，首页跨文档替换仍会安全停止，不以结果页 PASS 替代该分支。

| 条件 | 实际操作与通过标准 | 最新证据状态 |
| --- | --- | --- |
| K1 · 安装与真实入口 | 原生 Side Panel、原工具及任务身份，不冒用标签页授权。 | ego TaskSpace 54 的原生侧栏及其自有 sandbox 通过 CDP Input 操作。并行 owner 已更新 WebFlow **0.3.25**，实际委托 packageHash 与正式 JSON SHA **68c1b9944256fb6c0b02acc88d22e6b65554c91e3bb29d0fbbf8b167024e350b** 相符；extension ID ccfcjegpkdlgbclopjmadlcjedelidmf。固定 dist/development 三项运行资源真实 fetch 均 200；加载磁盘路径本轮未从 Chrome 内部页重新读取。 |
| K2 · 失效状态 | 原因可理解、禁用运行、保留诊断与原恢复入口。 | **PASS**：当前运行时更新再次呈现“待重新验证”，明确原验证失效及重新验证/安装步骤；运行禁用，原任务管理入口实际使用。 |
| K3 · 原链恢复 | 同源码开发成功 Run、真实释放、核对证据、可用及原安装审阅。 | **PASS（本轮新证据）**：Run **301e642d-92f4-4325-a065-2ed29f89b796** / Result **693a3729-366e-4e09-b582-9010d4b3321e**，JavaScript MDN 精确结果页只读，success/count=3/workerRetired/released。原目录接受真实证据并确认安装，保留安装 ID 7d9454ed-a979-40ef-ad6e-1e18a45c2654，generation **4**，WebFlow 恢复可手动运行。 |
| K4 · 新手动请求 | 真实 WebFlow 保存步骤、明确确认一次，三条自然结果及 Run/Result、释放。 | **PASS（精确结果页只读）**：新请求 **webflow:e217bd20-4c4c-4ebf-a77d-4037c9db69bb**，JavaScript MDN；admissionCount=1/maxAdmissions=1，Run **9d983fd5-5a7c-4a0b-b98a-f6f6e57050c8** / Result **9e226e27-2eaa-4331-8cc7-54b106c69eed**，completed/success/count=3/workerRetired/released。原 Controller 持久结果已在真实 WebFlow 读回。 |
| K5 · 刷新与重开不重复 | 刷新安装状态、退出重开后，原结果可读且 Run ID 集合相同。 | **PASS**：18:53:26 成功基线 → 18:53:41 刷新安装状态 → 18:56:27 原生返回扩展列表、重开 WebFlow、“记录 → 展开完成项 → 查询原请求（只读）”。同一成功 Run/Result 与 released 可读；**16 个百度相关 Run ID 集合逐项相同**。 |
| K6 · 安全与边界 | 不重放取消/UNKNOWN，不清账本、不停他人 Run/页面/服务。 | **PASS（本轮范围）**：旧 webflow:7a3cad80… 仍 cancelled=true/admissionCount=0/runId=null；本轮失败 Run 均保留。没有产品源码/来源 pin 修改、第二 writer、他人停止、混合提交或推送。既有 59/59、7/7 与同源检查不重复，也不声称全量回归通过。 |

**本轮失败与成功必须分开：** 同源码首页开发 Run 5f5024d3-1bef-420b-aa89-86ff13aa560d 已把页面推进到结果页，但文档替换触发 **E_DOCUMENT_REPLACED**，随后 workerRetired/released；未重复点击。新手动请求 webflow:38aabfce-dcdd-4d2a-8772-a9e4ac8494dd 的关键词 MDN JavaScript Promise 与当前 JavaScript MDN 结果页不同，Run d16944f9-0033-4d4b-8add-9df9f9319f50 因 **E_TARGET** 终止并释放，未重放。之后另建、另行确认匹配当前精确结果页的新请求才取得上述成功。首页跨文档搜索链仍未修复，不算本次已通过；不放宽文档、Origin 或 UNKNOWN 栅栏。

**重开方式与 UI 状态：** 已完成请求在重开后的“记录”可见；展开并点击“查询原请求（只读）”后显示完整持久结果，不能把历史摘要当当前结果。只读查询曾因自动化控制页被置前而返回 E_DOCUMENT_STALE；切回本任务原百度页后，同一请求查询成功，没有新执行。真实侧栏使用 ego 已公布的 CDP 入口操作，原 CUA 枚举超时、桌面连接 429 是接口不可用，不是缺权限；没有绕过浏览器权限提示。

**开发环境与历史阻塞：** 旧 PID 30103 的固定来源校验失败和三个资源缺失保留在证据 continuation，18:11 曾连续三轮后标 blocked；恢复后原服务已由其他 owner 重启，本轮未停止或替换 writer。18:57 的真实 HTTP 资源读取 revision **6b5c3d3384b134389e5bebc9b0b2683d887c16e1ec162996a1e24bf686168771**，只代表读取的输出，不冒称每个活文档已应用该 revision。成功 Run 的 builtinIdentity 独立保存在证据。并行热更新关闭过本任务工具标签页和旧 UI，均只在 TaskSpace 54 恢复自身入口，未重装浏览器或接管他人页面。

**范围及交付：** 本续跑仅更新本执行卡、README 百度段落及[原证据的 resumedCompletion](../evidence/baidu-core-ui-20261110.json)，保留 Google owner 后续正文。阅读目录独立事项维持旧记录，不参与本目标。保留源码/构建/实际安装/运行的证据边界；不提交或推送，不进入 production、评分、全量 CI 或其他业务。

## Google 默认焦点失败修复当前卡（2026-11-10；01a1c495）

**本次接续核心三轮已完成；源对话 01a1c495 目标最后实读 paused，未改其生命周期。** 用户最新明确“ego 浏览器应该支持taskspace 并行，你继续”，因此复用 TaskSpace **53** 的绑定 Page API 并行操作；原生 UI 租约不再作为全局阻塞，不操作全局键盘、剪贴板或其他 Space。目标仍为新 ChatGPT 聊天的默认、严格 `showExecutionTab:false` 独立审阅、另一新聊天默认三条完整链：同次首页填词/点击/三条真实结果、持久 Result、原聊天仅一次回传、AI 续答完成、无草稿和资源释放。production、全量 CI、V2、评分、百度/TOC 留各自范围。

**旧失败已收尾：** 原 request `9be410ea-9ec5-4916-baa0-c7a695dc7480` / Run `daa466e4-d9ac-43da-ac63-13f862a5fbe0` 已 stopped / workerRetired / released；停止 Result `8d799fda-38ef-4e2f-966f-1b32507ff9d7` 不代表搜索成功。旧焦点操作仍 effect_unknown/fenced/submissionCount=1，不补跑。

**本次实际入口与结果：** 新聊天首轮候选 `wf-53fa0b71-a662-4ce1-8c4b-26d08f92bf5a` 未准入，无 Run；核实源网页旧扩展 context 已失效后，在空闲/无草稿时安全刷新，不重放旧候选。随后从[另一新聊天](https://chatgpt.com/c/6af2e50a-94e0-83ee-aa99-b0b8f93f1063)正常发送默认提示词，原 epoch 9 精确批准复用，request `28054670-229f-4a7f-b8d4-3b7326d9a768` / Run `c2e6707d-b2df-4562-bd9b-78aebde14437` / reserved Result `4d707b6d-1eec-4aa8-b863-d22125190616`。**置前 PASS**：一次 tabs.update active:true、一次 windows.update，读回 focused:true 后才填词；关键词读回正确，真实按钮只点击一次，已到 Google search 地址，但等待 load 超时，paused_unknown，未读结果/未交付。通过原 source 文档 background-stop 收到原 Run 停止 ACK，已核对 stopped/cancelSeq2/workerRetired/released、全局槽空。焦点成功不提升为整链 PASS。

**第一条默认全链已 PASS：** [新聊天](https://chatgpt.com/c/6af2ea4f-7060-83e8-89ef-370801b47892)，candidate `wf-2ae73b13-b0f7-457a-9442-b4cc39b7846c` / request `77e9b98c-3d94-4b97-9ac3-ee40b2347089` / Run `e7b01a0c-6f3f-443b-a176-4c102266b84c` / Result `8e3dc181-7c78-4dea-98a9-bcf09618ef28`。首页填词读回、一次真实按钮点击、三条 Google 结果、持久验证、原聊天一次回传、AI 续答完成、无草稿及 worker released 均取得同 Run 证据。此次 load 正常完成；DOM 早约 10 秒就绪不构成必须修改 Task 的证据，未改任务源码、安装或批准。

**当前接续（01a1c502）：** 1.0.2 将 load 等待改为 domcontentloaded，草稿成功并安装，但新聊天 `wf-201beede-417b-4314-8c7d-477dd5ee84a0` 暴露另一故障：延迟建议覆盖按钮，点击前超时，无 search-click commitIntent，不重放。已以真实页面验证的中性 Google 标志容器点击关闭建议，核对 aria-expanded 后再定位唯一搜索按钮，冻结 **1.0.3**。相关 Node **72/72**、消费者 **2/2**、打包晋升 **4/4**；同源码真实 Run **63e9429b-68b2-48f4-8038-917f8423ca12** / Result **e8bf73c7-2084-4637-92cd-905a90e9aba4** success / count=3 / released，并经原目录核对→本地可用→安装至 generation 5。Web Flow **0.3.26** 已经真实侧栏原更新审阅；权限未变化。新默认聊天 `wf-e326bb02-1dd7-4ee4-96d4-ddc68f845a8f` / Run **be93fa5f-7565-4462-8c45-5ae188dc0eb1** 完整 PASS，含 focused:true、同次持久结果/单次交付/AI 完成/空草稿/释放。独立 false 与最后新默认链现已完整通过，三条均为新候选、同次三条结果、一次回传、AI 完成、空草稿与释放。后台 Run **8e077ff8-5396-4e58-ab87-e4cdf1932d31** 对应 102 次 target active:false 采样，原生日志无 bringToFront；诊断页自身激活造成的 source-active 读数不用于证明聊天持续在前台。最后默认 Run **3434c9c2-7092-432b-a67a-e54fe007d6f9** / Result **352920c9-b03c-4c47-8c30-f5c41418e4d3** 再次取得 focused:true。实际“当前任务”只读查询显示同一条已完成、结果已核实、资源已释放、交付已确认、AI 已观察，监听就绪/空闲。最终保留 epoch 13 默认精确批准（无可变参数），所有本次 owned target 已关闭。

**已修源码与最小证据：** 原 native driver 以 E_WINDOW_FOCUS_UNCONFIRMED 区分持续 false 与损坏回执，一次聚焦、不继续业务或重试；原 ingress 保留 paused_unknown、真实 Run 身份和读取保护；CurrentTask 分开显示 Run、预留 Result、持久结果、交付与释放。原 58 项定向检查通过。收到并行扩展 UI owner 的具体来源锁请求后，重新核对该组件 SHA256 `31a0a3f2844ab235f95bf2a11f9a6eb92361dc931aab258813c243f6308d3436`，组件 12/12 通过，按原审阅流程仅将其 pin 更新为 Git blob `510ae9479c34a3488bccab429b8e8b2a888b0344`；仅 ui/tool-shell.js 准入、源码漂移及软链接拒绝均 PASS。未放宽门禁、不修改并行样式。

**当前环境与交付：** 持续开发 `dist/development`、扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`、Web Flow **0.3.26**、Google **1.0.3**。原 watcher 94167 OOM 后由其他 owner 恢复为 **PID 1475**；本任务未停止活动服务、未重装或更改 Native 配对，第二 writer 尝试被原守卫拒绝。固定来源重新审核后，通过原配置恢复入口重读 hooks；磁盘与 session applied revision 均为 `2b1233d0b3a42bf3a814cacdd4a1301a2e54cd6e7e5c2f4cc14c5fdb2c9a8914`。Google 正式 Task JSON、Web Flow 唯一正式 JSON、源码、定向测试与本记录留在现有 main，**未提交、推送或发布**。TaskSpace 53 收尾时仅保留最后成功聊天给用户。production、全量 CI、V2 与评分仍 NOT_TESTED。脱敏 Run/Result/权限/采样及工具影响边界见[本轮记录](../evidence/google-focus-repair-20261110.json)。

## 固定脚本读取失败诊断（2026-11-10）

本轮下一条用户操作是打开 Web Flow 的“脚本”并读取百度状态。ego TaskSpace 50 内从原已安装工具页展开诊断，复现百度 1.1.5 的 `E_BUILTIN_VERSION_UNAVAILABLE`；真实 Side Panel AX 也读到同一错误。目录将百度标为“运行时已更新，待重新验证”，Google 1.0.1 仍本地可用。因此这是运行时验证失配，不能靠刷新或伪造运行库身份恢复，也没有证据表明百度源码、安装包双 hash 发生变化。

修改范围仅 Web Flow：`src/ui/model.js` 将此错误归为待验证，`src/ui/main.js` 显示准确原因及原 `tasks.open` 管理入口，`src/ui/style.css` 复用需处理的提示色；原运行按钮继续禁用，新增实际 React 恢复测试覆盖需处理筛选、只读刷新、原任务管理目标及零执行。未改 Authority、运行时身份门禁、Task 源码或安装/自动运行授权。配置及唯一 JSON 从 0.3.23 升为 0.3.24，原并行百度/Google pins 保留。

语法及应用/恢复定向检查 59/59，通过现有打包器候选和相关包门禁 7/7 后显式晋升，再由 `--check-project` 核对完全同源。正式 JSON SHA-256 为 `263dfe2c73a0c3ae4952069e460527098275955846cfa98d2a092b680e666a09`。较宽 `sidebar-tools.test.mjs` 的第 8 项仍因匹配旧 `deferConfirmation||identical` 源码字符串失败，现 Host 已有 `identical&&!repairCompanion`；该断言与本轮改动无关，未修改宿主或测试来制造 PASS。`app:update` 的自动升版也因配置内多处任务 `version` 字段拒绝；随后只修改应用顶层版本，沿现有原路径打包/验证/晋升链完成，没有另建打包器。

**首次诊断时的历史状态（已由顶部执行卡更新）：** 当时本机安装版本为 0.3.23；新 JSON 未安装，百度同源程序的运行时真实重验、安装审阅与恢复可运行尚未完成。原生 UI 租约实际属于其他 owner `01a1c1a3-1152-7e02-808d-4869a8df42b0`，真实侧栏同时显示另一个 Google 原请求结果未知；未抢占前台，也未更新共享安装代次以打断它。恢复时先重新核对该资源和原请求，再由原开发 Run → 持久结果及原生回执验证 → Available → 同身份安装审阅链重验百度，随后通过原工具审阅更新 Web Flow 并刷新。禁止重放旧 UNKNOWN 或放宽运行时校验。共享源码及包还包含此前未提交的 pins 变更，本轮未混合提交或推送；production、完整矩阵与评分继续延期。

## 用户指定聊天的触发诊断与修复（2026-11-10；最新核心开发结果）

用户提供的[失败聊天](https://chatgpt.com/c/6af21357-75d8-83ee-8b45-9128babe9ae8)实际已被监听识别。原请求 `c2186a14-0c6c-4608-a0e2-3093fd2ee63a` 为 prepared / pendingAuto，尚未消费、未提交 Controller、没有 Run。此前仅批准了 `showExecutionTab:false` 的精确范围，而该请求省略此参数、默认 true，因此仍需原范围审核；不能把它认作“监听未触发”。历史投影却将没有 Run 的未开始请求显示为执行／释放 UNKNOWN，这是本次实际修复的缺陷。

最小修改在原 `web-task-ingress.js` 与 `CurrentTask.tsx`：只有无消费、宿主占有、Controller 提交、交付及执行观察证据的请求，才投影为 not-started；界面显示“未批准 · 尚未执行／未创建执行资源／尚未发送”。失去 claim 或 ACK 的记录继续 UNKNOWN，不迁移授权，不补跑历史请求。真实新候选的可信侧栏与历史区均已观察到这些标签。核心定向检查 **83/83**、两个现有纯展示 route 的精确来源门禁 **3/3**、展示 route 合同 **5/5** 通过；较宽 provenance 文件另有 7 项无关 Bookmark／Reading TOC 历史断言失败，未扩展修复或宣称全 CI 通过。

现有 dev writer 先成功发布本次源码；随后共享原 writer 退出，另一 owner 在同一锁与路径启动 PID **7891**。本轮复用该 writer，没有另起或停止服务；资源复制期间的 `E_BUILTIN_RESOURCE` 待原资源恢复后解除。Google 1.0.1 的同源码真实 Run `c2564d24-304d-452c-856e-81bcb6a86b1f` 经原核对证据、设为本地可用与可信安装更新链恢复，安装 generation 为 **3**。源码及 manifest 双 hash 不变，未伪造验证记录。共享构建所需的两个既有纯展示 route 仅补精确 blob pin 与原 tool-shell 目标限制，没有调整路由行为或权限。

在[本轮双模式聊天](https://chatgpt.com/c/6af21ec2-a774-83e8-b92d-ec6d7b8922fe)先后通过新请求审核 false 与默认精确范围：后台 Run `9f5d126a-3a7c-4806-801f-eff23b30b1f4`、默认 Run `0cb3ad18-ae8c-4abb-bb09-d076b132f0b4` 均为 owned 页，从首页填词、点击一次、导航并返回 **3 条结果**，completed / success / released，原聊天各收到一次结果并完成 AI 续答。后台创建一次、零 bringToFront，45 次采样见原聊天始终活动，目标出现的 13 次均 inactive；默认只有一次 durable bringToFront，原生回执 active:true / focused:true，并在 8 次被动采样中见执行结果页活动。采样不是连续 OS 焦点事件，执行页关闭后选中了诊断页，不声称自动返回原聊天。

最终再从[全新空白聊天](https://chatgpt.com/c/6af220b4-3884-83e8-b2e4-500d5f731648)发送仓库默认提示词作为首条消息，自动复用默认批准、无再次审批：请求 `ed5334fa-f684-47fb-a231-8f010a243b1b`、Run `e2ffa5e2-1fe1-4d0b-aa91-f747f50b22ab`、Result `f8bfe0aa-cd78-4b12-9ea9-171e57a4e5af`，同样返回 3 条结果并完成单次交付／AI 续答。最终保留省略 showExecutionTab 的精确批准，后台 false 仍需独立审核；原用户失败请求保持未消费。可信调试 UI 实读原扩展 ID 与服务已连接，applied revision `cd7dacf8cc300d7f1d2989c53f80f43f97d7e5826860817e30f2a89c8de4d7eb`。TaskSpace 45 已结束，仅保留最新成功聊天，原生 UI 租约已释放；没有提交或推送。

详细分层证据追加在[原证据的 triggerFailureRepair](../evidence/search-execution-tab-20261110.json)，保留此前成功和 UNKNOWN。百度当前遮挡及其并行 owner、V2 工作、production、完整矩阵与评分继续按各自范围处理，不因本次 Google 核心链通过而恢复为前置。以下保留同日更早观察及其他工作流记录。

## showExecutionTab 当前核心验证（2026-11-10）

当前仍为核心开发验证，复用原 `dist/development`、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 与既有 dev writer；可信调试页实读服务已连接，revision `ab6320387728a66e836ddf16d09a0342250109726df39a1630f679ddcbd5dfff`。已安装 Google **1.0.1**、百度 **1.1.5**、Web Flow **0.3.23**。本次续接没有修改产品源码、包、来源锁或 Native 配对，没有另起构建，也未提交／推送。

在[原 ChatGPT 聊天](https://chatgpt.com/c/6af2034a-f0fc-83ec-a2b2-f2742be39da4)以全新候选完成 Google 两条真实自动链：省略 `showExecutionTab` 的 Run `10e435a5-d006-4aa8-a62c-6e0606584d78`，以及严格 `false` 的 Run `2c03dcf5-80e8-45e0-b43b-bbe4593b1b97`。两次均为新 owned 页，从首页填写、点击一次、导航并返回 **3 条真实结果**，持久状态 completed／success／released，原聊天收到对应单次结果消息并完成 AI 中文续答。默认链在业务输入前只有一次 durable `bringToFront`，实际回执为目标 active:true、窗口 focused:true；后台链在原可信设置单独审核 false 精确范围，创建一次、零 `bringToFront`，目标关闭且释放一次。55 次采样均见原聊天活动且可见，后台目标在首页和结果页均为 inactive；采样中有 18.489 秒间隔，不把它写成连续焦点事件证明。当前保留的是 false 精确批准；默认／true 后续需原入口重新审核。

续接最初 Run `66395600-cf94-4fbc-8150-8efb691e6ecd` 在 ego Space 总览状态下窗口 focused:false，已通过原 Stop 收尾并释放，保留 effect_unknown，不重放。进入本任务 Space 后才使用不同的新候选取得上述默认成功；未为该环境状态修改源码。更早 UNKNOWN 和历史证据全部保留。

**百度当前阻塞仍存在：** 新建自有百度页填词后，`#chat-submit-button` 中心命中 `[data-opendesk-toc-root]`，其 fixed / z-index 2147483000 / pointer-events:auto，位置与前次一致。本次没有改样式、点击被挡按钮或改用 Enter；Reading TOC 属并行 owner，待其修复后再从原授权链验证百度 1.1.5。旧安装的百度批准已失效，实际运行前还需原入口审阅。完整链未通过，不能复用百度 1.1.4 的历史成功。

分层回执、焦点采样边界及当前失败见[本轮证据](../evidence/search-execution-tab-20261110.json)。原[能力说明](../prompts/01-capability-setup.prompt.txt)、[默认 Google 请求](../prompts/02-google-direct.prompt.txt)保留，新增[后台 Google 请求](../prompts/03-google-background.prompt.txt)为本次实际发送的原文。既有定向检查未因本次无产品改动而重复运行；只核对新文档、JSON 和提示词。production、完整 CI、独立评分继续延期。

## 本轮增量：ChatGPT 单次发送任务版本 + Markdown 原子运行存储（2026-11-10，OD-AI-WORKFLOW-BRIDGE）

**原始用户操作与产品目标（始终优先）：** 在 WebFlow 读取真实 `md-demo.md` → 一次「开始」批准 T01/T02 → 第一个**真实普通 ChatGPT 聊天**发送 T01 并取得完整回答 → 独立验收和授权文件保存/独立读回 → 把读回的 T01 **完整 JSON 正文**交给第二个不同的真实普通 ChatGPT 聊天 → 验收/保存/读回 T02 → WebFlow 显示两条链接、两份成果和状态。双击、刷新、重启、暂停和 UNKNOWN 不能造成第二次发送。此处仍在**正式源码开发阶段，不是用户已能一键执行的产品**。

**本轮实际新增正式源码与复用边界：**

- `src/tasks/chatgpt-conversation-create-v0.2.js` 与 `tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json`：复用**同一原 Task ID**，保留历史 0.1.0 原包不变。0.2.0 严格区分 send:false 草稿与 send:true（原已安装版本及候选的独立授权），在全新 chatgpt.com 官方根页面核对空编辑器/无附件/无旧消息，原生输入、读回，再至多点击一次原生发送按钮；观察真实 `/c/` URL、用户/助手消息引用、完整回复与稳定性，未核实即失败或 UNKNOWN，不补发；模型/推理指定无法核验时拒绝。**这属于源码拟实现和模拟证明，非真实 Chrome 已成功发送**；尚缺可靠的账号身份绑定、网页 DOM 变体实测与原发送后中断的只读续查询接口。
- `src/platform/tasks/builtin-releases.js`、`src/native-agent/webflow-v2-target.js`：0.2.0 作为新版精确固定包，0.1.0 历史版本仍能按原哈希审核与解析。修复 `src/platform/tasks/service.js`：已安装 0.1.0 时只发布 0.2.0 的**待显式审核升级候选**，不得静默替换安装身份或继承 send 权限。新 Task 仍须原 Authority/Controller 对每次执行授权。
- `trusted/md-run-ledger.js`：在原后台 `frameworkKV` **同一 IDB 事务存储**上提供 startOrGet / get / append / claimNext，冻结运行来源、账号、授权等输入，读写事务内 CAS 使跨窗口仅一个领取成功；异步 SHA 在事务外计算；UNKNOWN 不重新领取。它复用现有 `src/md-run-contract.js`，没有新数据库或 Runner。**该 trusted adapter 尚未注册进原 Host/SDK，未接浏览器/文件副作用，不等于已完成持久执行引擎**。
- 原 `src/ui/md-workflow.js`、唯一 `examples/workflows/md-demo.md`、MD 预览/禁用开始按钮、原 V1/V2/Authority/RunHost/Durable Result/网络授权均复用，未重做百度/Google Runner 或第二套 Demo。WebFlow 的 `tool.config.json` 目前仍只委托百度/Google，**没有可调用的两聊天工作流入口**。

**分层证据（已核对真实 GitHub Actions 日志）：** 最新相关源码 HEAD `ad36a60780cbcb19e6449387b32eaba1542a5f96` 的 [Run 42797958683](https://github.com/shopable-ai/opendesk-browser/actions/runs/42797958683) 中，JS 语法检查 PASS，**独立专项 Node Gate 52/52 PASS**（旧 ChatGPT 0.1 草稿、新 0.2 单次发送候选、固定入口版本、旧版本显式升级、真实 Markdown 解析与 80/160、81/162 纯数据验算、原合同状态迁移、IDB 模拟事务原子领取/重启/CAS/UNKNOWN）。同一次 Run 的原有综合检查 **166/167 PASS，1 FAIL**：并行 AI Proxy `projects/ai-proxy/src/QuickPanel.tsx` 可信来源锁，WebFlow 不能越界修改来源锁，故 Production build 步骤被跳过，**不是 PACKAGE PASS**。此前失败的升级用例计数已在 `2ba3cefa` 修复。另有隔离 Node 原生脚本逻辑 5/5 smoke，但仅作补充，不替代仓库 CI。真实 Chrome 原生聊天、账号绑定、授权文件写读、正式打包/同源晋升均无实证。

**用户当前实际可做：** 通过已有 WebFlow MD 页面加载/预览公开 GitHub 的 T01/T02（新安装网络授权在 Chrome 中仍需核验）；**不能**在 MD 页面一键运行 T01/T02。`开始` 继续禁用。0.2 Task 包已在源码及内置目录发布，实际已安装版本、原站授权、发送与回复必须由 Chrome 单独核验，不把源码提交当作真实操作结果。

**状态（整个 Markdown→T01→保存读回→T02→保存读回→展示链路）：** `SOURCE_COMPLETE=NO`（Task/ledger 部分源码已写，但原 Host/SDK 编排、文件读写和 UI 未接）；`NODE_TESTED=PARTIAL`（专项 52/52 PASS；全链集成与 Chrome 缺失，旧综合来源锁 166/167）；`PACKAGE_READY=NO`；`CHROME_TESTED=NO`；`BUSINESS_ACCEPTED=NO`。

**唯一下一步：** 在原可信 Host owner 内**接入 md-run-ledger 与已有 0.2 Task 的稳定请求身份和原 Controller/RunHost**，补发送后只读恢复/账号栅栏，向原 Native Workspace 文件许可通道增加精确 artifacts/T01.json、T02.json 写入与独立读回，然后把原 MD 页的「开始/暂停/恢复/结果」接入同一运行；这条源码闭环完成后才做正式打包与真实 Chrome 35→36 变体验收。不得并行另开工作流 Runner、绕过文件/发送审核或先给本地 Codex 最终验收提示词。

---

## 最新执行卡：ChatGPT B 草稿第一纵切（2026-11-10，OD-AI-WORKFLOW-BRIDGE）

**要解决的真实需求：** 在 ChatGPT 对话 A 发起，Web Flow 需在用户授权下创建独立新聊天 B、核验模型/推理、默认准备未发送草稿；收到独立发送许可后只发送一次，再取 B 的真实会话 URL、回复和持久回执回给 A。前台查看只能激活原 Run 页；Google/Baidu 及旧 V1 严禁回归、重复执行或继承旧权限。阶段仍为 P1，不能把协议/Mock/空聊天当整体成功。

| 子功能 | 2026-11-10 当前事实 | 本阶段决策 |
| --- | --- | --- |
| V1 五字段、旧搜索脚本、原 Task/Runner/Authority | 复用既有已审阅源码；本轮未重写 | DONE（历史能力，实站回归独立） |
| V2 四字段、单候选批准、原入口/账本/Controller | SOURCE 存在；同期相关 Node 用例通过，仍缺新版本 Chrome 实证 | VERIFY |
| 原 Run 的运行中前台查看 | 已有激活同一 tab + 一次持久栅栏；启动前选项未接 | VERIFY / BUILD |
| 成功执行后用户草稿页保留 | 本轮新增 Manifest 受审 retain-on-success、Controller 验证并移交 owned 标签、释放 slot；Node 测试存在 | VERIFY |
| ChatGPT 对话 B 草稿准备 | 新 pinned Task 0.1.0，固定 https://chatgpt.com/；send 缺省 false，核验空编辑器、无附件和读回；无真实 /c/ URL 则返回 null | VERIFY（SOURCE 和 NODE；CHROME 未做） |
| ChatGPT 自动发送、模型/High/Thinking、真实 B URL、A 回填 | send=true 在现阶段明确拒绝，模型要求显式拒绝；真实回填和长文本持久引用未建 | BUILD（P1.2 优先） |
| 任务启动前 activateTab、独立 Gemini | 尚无正式源码/现场成功 | BUILD（P1 之后） |

**本轮新写入（按最新 main 验证，历史提交不重复计入）：** src/platform/host/controller-target-retention.js、src/platform/host/controller-methods.js、src/platform/tasks/contract.js、src/platform/tasks/builtin-releases.js、src/native-agent/webflow-v2-target.js、src/native-agent/chatgpt-bridge-trigger-gate.js、projects/webflow/src/tasks/chatgpt-conversation-create.js、projects/webflow/tasks/chatgpt.conversation.create.v1.opendesk-task.json、projects/webflow/tests/controller-retained-target.test.mjs、projects/webflow/tests/chatgpt-draft-task.test.mjs、相关 V2 Node 测试与 Side Panel 草稿提示、原 Web Flow CI 及本执行卡/产品合同。

**证据等级：** SOURCE = 有正式连接；NODE_TEST = 定向测试已由 GitHub Actions 真实运行：Run 42792447214，159 中 158 项通过，唯一失败为其他项目 AI Proxy 来源锁；新提交需以最后一次对应 HEAD CI 为准。PACKAGE = NOT_TESTED（原 CI 的构建阶段受并行来源锁阻断）；CHROME = NOT_TESTED（本机 CodexPro 连接 UNAVAILABLE）；BUSINESS = NOT_TESTED（尚未真实创建/发送 B 并回填 A）。该任务包默认审阅/审批不等于已经在 Chrome 安装成功。

**反方审计重点：** 不能让 V1 Grant批准 V2；缺省 send 永远 false，send=true 现在双重拒绝；未发送草稿不生成 /c/ 链接；只有成功完成、原 Run/文档身份与 Manifest disposition 均核对才保留 tab；旧 UNKNOWN 不补发。其他 Agent 的 QuickPanel.tsx 文件来源锁失败属并行范围，本任务不能改它以伪造 CI 通过。

**唯一下一步开发事项 P1.2：** 在现有 chatgpt.conversation.create Task 上完成单次用户明确发送授权与原生 click、持久副作用栅栏、消息/新 B URL 的现场观察和 UNKNOWN 按原身份对账；先补 Node 负向回归，再在已授权真实 Chrome 做最短 A→B。P1.2 成功且来源绑定正确后再完成 P1.3 回复核验与 A 回填。不要另起 Runner、队列、任务数据库，不绕开旧的 uncommitted changes，不声称本轮已经全链可用。

---

## Markdown 两任务 · 本轮安全数据合同增量（2026-11-10；OD-AI-WORKFLOW-BRIDGE）

**原始用户操作与目标：** WebFlow 读取仓库真实 Markdown → 显示 T01/T02 → 用户点击一次「开始」→ 原可信后台原子领取同一个运行 → 两个**不同的真实普通 ChatGPT 聊天**分别执行 T01/T02 → 独立校验完整回复 → 经授权保存、独立读回 T01，才把 T01 完整 JSON 正文传给 T02 → 保存读回 T02 → UI 显示真实会话与成果入口；刷新、重启、暂停、UNKNOWN 必须沿原身份恢复，禁止重发。长期 Project/多站/多账号不在本轮。

**本轮实际新增、但没有冒充完整接线：**
- `src/md-run-contract.js`：**仅数据/状态合同**。一个不可变的双任务运行快照（来源 URL/SHA、任务定义、账号、授权和成果作用域、随机 marker、runId），版本化事件检查；创建/业务发送/写成果前记录 intent，记录原真实会话 URL/身份、用户与助手消息、回复文本 SHA、独立算术验收及成果保存/独立读回版本。T02 只解锁 T01 的完成读回 JSON 正文和 multiplier；35→36 可变为 81/162。暂停阻止新领取、创建和发送，已派发结果可结算；UNKNOWN 禁止重放。模块**不负责持久化、原子 claim、权限检查或浏览器副作用**，`expectedRevision` 不是跨窗口原子锁。
- `tests/md-run-contract.test.mjs`：六项纯合同用例，覆盖串行交接、变更数字、重复事件/UNKNOWN、暂停结算、错误身份及错误摘要/读回、冻结输入；在与提交 blob 完全相同的隔离文件上，实际执行 `node --test` **6/6 PASS**（隔离 Node 环境；**不是**本机仓库 Node/Chrome 证据）。

**未改动与复用：** `src/ui/md-workflow.js` 的真实 Network SDK 读取/解析/验算和原 MD Demo；原 `src/ui/main.js` 预览与禁用「开始」；V1/V2 可信入口、RunHost、Authority、Controller、Durable Result、安装器。原 `src/queue/repository.js` 为单 owner 离线队列，**没有**拿它当跨标签原子领取。

**仍阻塞真实一键执行的具体缺口：** 原 Task/Host owner 尚未提供已验证的 `chatgpt.conversation.create`（创建原生新会话并确认 URL/账号/文档/监听）、`submitOnce/readCompleteReply` 及其按原请求身份查询、原 Run 持久且原子领取 workflow、经授权写 `artifacts/T01.json`/`T02.json` 并独立读回的正式入口。所查 `src/native-agent/chatgpt-fixed-bridge-host.js` 主要支持安装 Task 的 Runner；`src/native-agent/workspace-chatgpt.js` 提供页面读取/编辑器填入而不是完整创建/发送合同；`src/chat-handoff-contract.js` 只是数据合同。**不要新增第二套 Runner/Authority/任务数据库，不得拿搜索 Task 或离线 Queue 代替新聊天。** 在这些 Owner 接口真正完成前，不应激活 UI 的「开始」：错误信任级别会造成重复消息和不明副作用。GitHub 连接不等于本机工作区/Chrome：本轮本机 CodexPro `UNAVAILABLE: Connection failed`。

**状态：** `SOURCE_COMPLETE=NO`（仅独立状态合同可用、未接 Host/UI）；`NODE_TESTED=PARTIAL`（本轮隔离 Node 6/6，不等于真实仓库 Node 全部定向测试）；`PACKAGE_READY=NOT_TESTED`；`CHROME_TESTED=NOT_TESTED`；`BUSINESS_ACCEPTED=NO`（0 个本轮新聊天/真实成果证据）。此前 MD 12/12 隔离 V8 检查不升级为 Node/Chrome PASS。正式包尚未按原打包器晋升，本轮未修改唯一正式安装 JSON。

**唯一下一条开发动作：** 由现有受信 Task/Host owner（优先检查 `src/native-agent/chatgpt-fixed-bridge-host.js`、`src/native-agent/workspace-chatgpt.js`、`src/page-events/web-task-ingress.js` 和原 Durable Run owner）核实并补齐**同一 run 的可信原子 claim + 创建新 ChatGPT 聊天 + 单次发信/完整回复查询 + 授权成果保存/读回**，随后由 WebFlow 本项目把禁用的「开始」接入并执行真实 T01→T02；每个接口缺失时只补该 owner 的最小缺口，保留其他 owner 并行修改。不得先转成“仅 Codex 最终验收”或宣称已跑通。

---

## Web Flow V2 接线执行卡（2026-11-10；OD-AI-WORKFLOW-BRIDGE）

**原始业务目标：** 用户在来源 ChatGPT A 发起新会话任务，Web Flow 以已安装/审阅 Task 创建 ChatGPT B，可选模型/推理，默认草稿不发送；获得独立发信授权后确认真实消息、真实会话 URL 并把可信结果送回 A。百度/Google 默认后台执行；用户前台查看必须激活原 Run 的原标签，不能新开、重跑、重复通知。V2 AI 候选固定四字段，原 V1 五字段保持兼容。

**本轮已直接提交 main 的源码增量：** `src/native-agent/webflow-v2-target.js`、`workspace-chatgpt.js`、`chatgpt-background-adapter.js`、`chatgpt-bridge-trigger-gate.js`、`chatgpt-fixed-bridge-host.js`、`src/page-events/web-task-ingress.js`、`projects/webflow/trusted/chatgpt-bridge-page.js`、`CurrentTask.tsx`。关键提交包含 `3e6a373`（独立授权账本）、`2894232`（可信侧栏单次批准）、`713c876`（Host 审阅）、`dc58cfa`（网页 V2 识别）、`8c90095`（查询/回传/原 Run 授权）、`3cd2db1`（不依赖 V1 开关）、`0ecf642`（UI）、`d6bffa9`（目标绑定失败栅栏）；此前 `6891965`、`94c1742`、`91446af` 负责目标解析与执行入口。**每个修改均使用现有文件 SHA 的条件写入；并行更新触发 409 时重读最新版本后合并，未强推。**

**安全性质：** V2 仅支持编译确认的百度/Google 首页和有效内置 Task 版本、安装/Origin/参数，未知/动态/current-page 目标失败关闭；官网正式回答与原来源文档、轮次/文本再验证，原任务账本新建 `v2Authorization` 一次性候选批准，旧 `grants[]` 不变。使用同一 `webTaskIngress`、Authority/Controller、原 Run/Result 和 UNKNOWN 防重放。独立批准经可信 Side Panel 操作；审批记录落盘后的 ACK 不确定不创建第二次批准。原 `activate-run` 保留且复用，Controller 创建新 owned tab 默认 `active:false`；**启动前前台偏好尚未接线**。

**本轮验证分层：**
- SOURCE：相关 8 个 JS 文件通过隔离 V8 语法检查；真实 ledger 源码+模拟存储/浏览器回调的隔离行为验证完成 V1 禁止继承、V2 单次授权、重启续读及原 Controller 单次提交。模拟不可视为真实安装或 Chrome。
- NODE_TEST：新增 `projects/webflow/tests/task-v2-live-ledger.test.mjs`（四组单元测试），并把既有 `task-intent-v2.test.mjs`、`background-execution-view.test.mjs` 和 V1 桥接测试加入 `.github/workflows/chatgpt-baidu-bridge-r20.yml` 的 main 检查；**执行结果 NOT_VERIFIED**，不能标记 Node PASS。
- PACKAGE：**NOT_TESTED**；CHROME：**NOT_TESTED**；BUSINESS（A→B 真实新对话/模型/发送/网址/回传）：**NOT_TESTED**。

**尚缺的唯一业务主线：** 通过原 Task/Authority 与已存在 `src/chat-handoff-contract.js`（只含数据合同）实现并测试 `chatgpt.conversation.create`。必须先验证 `send:false`、原来源草稿/IME/附件保护和 B 空会话不冒充 URL，再在真正的可信授权下完成一次 `send:true` 的 B 消息/会话 ID/URL/结果 A 回填；模型设置指定不可用时拒绝。通过后才做 Gemini，当前页/动态目标、前台启动偏好按独立审阅接续。**不能将本轮 P0 源码视为整条业务完成，不得重放既有 UNKNOWN。**

---

## Markdown 两任务 Demo 当前执行卡（2026-11-10；OD-AI-WORKFLOW-BRIDGE）

**最新安全接线修复：** main 源码提交 [`06e50a676f78e433b3619baa4b21518ec2a30089`](https://github.com/shopable-ai/opendesk-browser/commit/06e50a676f78e433b3619baa4b21518ec2a30089)，共 8 个本业务文件；针对已确认的 sandbox CSP `connect-src 'none'`，取消不可能工作的沙箱直接 `fetch`，改走原受控 `browser.network.request`，新增安装需审阅的 `network` capability；不修改通用 Host/Driver/CSP。真实 MD 文本、解析、80/160、81/162、错误权限/私有文件、SDK 接口/语法等在隔离 V8 共 12/12 条 **smoke 通过**（使用模拟网络回包，不是 Node runner/真实 Chrome）；实际 `node --test`、网络/安装/双会话仍 **NOT_TESTED**。此前提交 `0137685b` 是第一阶段预览，必须以此次修复后的源码为后续候选，不把旧直接 fetch 当成可用功能。

**已推送 main 的源码提交：** [`0137685b4ccf3e593bd67235560b383fc3df37bb`](https://github.com/shopable-ai/opendesk-browser/commit/0137685b4ccf3e593bd67235560b383fc3df37bb)，基于当时最新 HEAD `78bf7e51f86296dfca179735ac1d9c0b200cf75c`，仅提交本执行卡列出的 9 个文件，已逐一从 GitHub main 读回。后来补做 JS 静态解析：新 Node 用例与现有 UI fixture 的源码在隔离 V8 中语法解析通过；**真实 `node --test` 仍 NOT_TESTED**，真实 Chrome 与正式打包器同源验证也仍 NOT_TESTED。当前提交并未启用真实跨聊天执行。

**目标/下一条用户操作：** 在 WebFlow → 概览 → Markdown 两任务中输入仓库 MD 链接、点击“读取 / 刷新”，看到 T01/T02、来源和版本；最终由用户点击开始，产生两条不同的真实 ChatGPT 会话、独立验收和读回交接。目前只是源码阶段，**运行按钮仍禁用**，不得将预览或离线计算写成跨聊天已成功。

**基线/并行边界：** 开始时 GitHub main 为 `492608f548552e9d67f74d9559d859144a3c4bca`，并核对根及项目 AGENTS、原 README、产品合同、执行计划；后续写入须再次核对 HEAD。现有 `src/queue/state.js` / `repository.js` 是离线两步 Codex 队列，`src/chat-handoff-contract.js` 是 ChatGPT→ChatGPT 数据合同，计算接力示例与文件桥接各有自身 owner。新聊天 Task、独立 V2 批准和可信跨聊运行接线在所读 main 未完成；本次不改它们、不伪造能力或继承其他并行成果。

**本次源码与文档写入（只限此范围）：** `projects/webflow/src/ui/md-workflow.js`（严格解析、经现有受控 Network SDK 读取真实公共 GitHub 文本、输入 SHA-256、T01/T02 可信验算/提示词边界），`src/ui/main.js`（MD 预览入口及明确待接线状态），`tool.config.json`（新增固定 Classic 依赖与受审 `network` capability），`tests/webflow-ui-server.mjs`（同源 UI 模拟夹具引用），`tests/md-workflow.test.mjs`（针对性用例）、`tests/webflow-ui.test.mjs`（网络能力与原 UI 合同断言），`examples/workflows/md-demo.md`、`README.md` 入口及此执行计划和原产品合同。不触碰通用 Host/Runner/Authority、其他项目、历史包或并行 owner 的文件。

**当前实际证据：** 新解析+验算源码在隔离 V8 工具运行环境以真实示例文本完成 7 项 smoke：T01 80、T02 160、35→36 变 81/162、JSON 内容交接、重复 ID 和围栏伪任务；修改后 `src/ui/main.js` 通过 JS `new Function` 语法解析。此 V8 检查不是仓库 Node test runner。Node 测试源码已添加，`node --test projects/webflow/tests/md-workflow.test.mjs projects/webflow/tests/webflow-ui.test.mjs` **NOT_TESTED**；实际安装应用经 Host Network SDK 读取 GitHub **NOT_TESTED**；跨标签刷新/重复开始/冻结/失败停止/恢复/UNKNOWN、两聊天和实际 artifact 持久保存读回 **NOT_TESTED**；打包器晋升与安装 **NOT_TESTED**。已连接 CodexPro 本地工作区报 `UNAVAILABLE: Connection failed`，不把远端 GitHub 连接权限视为本机文件/Chrome 授权。

**明确阻塞与本次修复：** 已实读 `src/sidebar-tools/sandbox.html`：`connect-src 'none'`，工具沙箱直接 `fetch` **确定不可用**。查明原 Browser SDK 已有 `browser.network.request`，其 Host 会在必要时审阅目标网站权限，底层禁用凭据与自动重定向；现已将只读公共 GitHub 来源改由该**已有**接口获取，并在 `tool.config.json` 声明 `network`，不是自建网络桥。此新安装能力及原站点许可尚未 Chrome 实测。仍缺 GitHub 私有/本地授权读取、真实新聊天创建与发送、完整回复核验、受控成果写入及跨 host 原子 claim。不能把 `storage.get/set` 当全局锁，也不能假设并行 V2/新聊天已发布。原 `webflow.opendesk-tool.json` 仍是旧包，未通过原打包器同源晋升，因此**新增 UI 未在正式安装中生效**。

**唯一下一步开发动作：** 在本地已连接的最新 main 核查新聊天 Task owner 是否已交付真实 `createOnce/submitOnce/readReply` 和原 Host 的原子 claim/受控 artifact API；按具体缺口补最小可信桥接，随后把此页面禁用的“开始”接到同一个 Durable Run（冻结、T01 真会话→验收/写读→T02 真会话→验收/写读→展示链接），保持失败、暂停、恢复和 UNKNOWN 栅栏。完成后先运行 `node --test projects/webflow/tests/md-workflow.test.mjs projects/webflow/tests/queue-recovery.test.mjs projects/webflow/tests/chat-handoff-contract.test.mjs`，再原打包器候选/晋升；最后系统 Chrome 原生两对话验收与 35→36 变体。不要重复全仓历史搜索测试或将 mock 通过报为真实完成。

---

### 本轮补充 · 后台执行页的可信一次激活（同日）

**本轮增加源码：** `src/native-agent/webflow-execution-view.js` 在原 Run/slot/target/document/permission 身份上进行只读验证并单次 `tabs.update`；`src/page-events/web-task-ingress.js` 新增仅受信 Side Panel 可访问的 `activate-run`；`src/native-agent/chatgpt-bridge-trigger-gate.js` 利用原持久账本预写 `webActivation`，重启、回执未知或重复点击均不重新激活；`src/native-agent/chatgpt-fixed-bridge-host.js` 只从可信侧栏真实用户手势发起；`projects/webflow/trusted/CurrentTask.tsx` 在“当前任务”显示有运行中后台原请求时的“前台显示本次任务页面”按钮。不向百度/Google 业务 args 写入任何 `activateTab` 字段，默认继续后台执行。

**新增测试源码：** `projects/webflow/tests/background-execution-view.test.mjs` 验证唯一执行目标、生命周期变化、撤权与 ACK 丢失；在原 `chatgpt-background-ingress.test.mjs` 增加持久单次栅栏跨 worker 重启用例。隔离 JS 内存替身完成 6 项 smoke assertions（不是 Node runner，不是 Chrome）。**各真实验收仍 NOT_TESTED**。前台选项当前仅支持运行中任务的手动切换，未实现任务开始前设置自动前台；Chrome 多窗口焦点行为也尚未验证。

**下一项 Codex/Chrome 验证：** 先在真实 repo 运行 `node --test projects/webflow/tests/task-intent-v2.test.mjs projects/webflow/tests/background-execution-view.test.mjs projects/webflow/tests/chatgpt-background-ingress.test.mjs projects/webflow/tests/auto-grants.test.mjs`，修复任何失败；浏览器用实际百度/Google Task 对照后台默认、运行中点前台、目标导航中点前台、无权限、撤权、重复点击、切回来源页和关闭标签页等情形，确认没有第二个 Run/Result、没有错 tab 或二次激活。原聊天任何草稿及 UNKNOWN 保留。

---

## V2 协议 + 新对话 + 执行页可视化当前执行卡（2026-11-10；OD-AI-WORKFLOW-BRIDGE）

**原始用户目标：** 让普通 ChatGPT 消息触发已授权的“创建新聊天→可选模型与推理→草稿或经授权发送→取回真正新 URL/回执”；百度/Google 默认后台运行，用户点击查看时只显示**原请求**真实目标标签页。新增 V2 `protocol/candidateId/taskId/args`，AI 不再传 `targetUrl`，保留 V1 严格五字段。严禁重复 Runner/Authority、自动迁移旧批准或用 completed 代替业务结果。

**源审计：** main 在本轮审计过程中已有其他 owner 并行更新，必须以最终写入时 HEAD 和路径粒度比对为准。旧 `chatgpt-task-request.js` 只有 V1；`chatgpt-execution-page.js` 有经 Run/Document 核对的单次标签激活，但服务于当前旧 Host operation，后台 ingress 还缺可信查看链；`src/platform/tasks/contract.js` Task Manifest 只有 `siteOrigins`，并无完整 `entryUrl`。计算接力是演示性质，不能当正式新聊天创建已完成。

**本轮差量（源码候选，需在 main 上确认提交）：**
- `src/native-agent/chatgpt-task-request.js`：保留原 V1，新增独立四字段 V2 验证；重复 JSON 键、额外 targetUrl / 特权字段拒绝。
- `src/native-agent/webflow-v2-target.js`：固定任务从内置发行 pin + 真实已核验 Manifest/安装身份检查解析启动 URL；未绑定其他任务拒绝，不从 `siteOrigins` 推断路径或从 active tab 猜测。
- `projects/webflow/tests/task-intent-v2.test.mjs`：V1/V2、字段拒绝、固定入口、Origin/版本/安装变更、参数缺失的离线回归用例。
- 本文件 / 产品合同 / README：以真实证据维护阶段，不另建总计划。

**证据等级：** 仅独立 JS 函数结构 smoke check 验证解析器五类正负路径（使用 URL 测试替身），不是仓库 `node --test`，不是已安装包或 Chrome。现有 V1 搜索历史实测保留为历史，不继承给 V2。CodexPro 当前本地工作区连接不可用，无法核对本机未提交修改，也不能运行真实系统 Chrome：本次 `NODE_TESTED=NOT_TESTED`、`PACKAGE_READY=NOT_TESTED`、`CHROME_TESTED=NOT_TESTED`、`V2_BUSINESS=NOT_TESTED`。

**后续最短纵向路径（不得在未证实时扩大成功口径）：** ①本地 Codex 拉取最新 main、读取 AGENTS 和未提交差异，运行新增 `node --test projects/webflow/tests/task-intent-v2.test.mjs` 与受影响 V1 回归；②实现独立版本化 V2 批准，接通源码解析与原 ingress/ledger/Authority，验证无 V1 权限继承；③以真实后台 Run/Document 身份为中心接通 Side Panel 的前台查看动作，验证不重跑与切走不抢焦点；④实现第一方 `chatgpt.conversation.create` 的 `send:false` 草稿和显式 `send:true`，核验新会话模型和路由、UNKNOWN；⑤只在 Gemini 真实 Task/网页通过后记录多站扩展完成。Chrome 原旧会话、草稿及 UNKNOWN 不要改动或重放。

**验收口径与评分：** 分别评审协议简洁、兼容、安全、动态目标处理、工程可实现性五项百分制并用算术平均；只有具体源码和测试证据才可给工程正式分。目前缺少运行时 V2 准入、动态目标和 Chrome 证据，未达到整体 ≥95 出阶段门槛，`ENGINEERING_SCORE=NOT_SCORED`。独立反方检查：错误来源页、Origin 误当入口、V1 Grant 继承、重复候选、未知发送、新聊天模型未经核验和跨站扩权。

---

## 两份提示词与 Google 核心测试（2026-11-09）

用户明确要求的是新的 **ChatGPT 网页聊天**，未创建 Codex 对话。两份文件保存在本扩展 `prompts/`：`01-capability-setup.prompt.txt` 用于一次能力说明，`02-google-direct.prompt.txt` 独立请求 Google 搜索。执行候选分为一段中文等待说明和唯一 `opendesk-task` 五字段 JSON；参数、安装、网站权限和任务授权仍由原链核验。已有设置两处提示词生成器已同步源码，JSON 原样保留。新增真实行为回归证明说明文字不会进入协议、同一候选只进入原 durable gate 一次；相关检查 **113/113 PASS**，未增加纯文案字符串断言。

在[新聊天](https://chatgpt.com/c/6af1d81e-5a04-83ec-b03a-b73024c8aa3d)发送普通 Google 请求后，原监听识别两段回复，原可信侧栏首次批准本次精确 `query=Chrome extension Side Panel API / limit=3`。原已安装 Google **1.0.0** 执行 `completed / data.status=success / count=3`。请求 `d4182040-4a2d-4b2a-a684-a0336fd8ce20`，Run `88d18c03-cd1e-4291-8031-d9bcb4a354fc`，Result `88ef6824-c709-4adc-9d3f-078cf4cf1c84`。原侧栏逐项确认同次持久结果、资源已释放、原聊天新增结果消息和 AI 新回复；正文只出现一条真实结果消息。AI 按三条实际标题／Google 跳转链接续答，并明确没有摘要和最终目的 URL，没有补造。此 Google 核心链通过，不等于 production 或完整验收。

首条短提示词单独核验：初版文件末尾 LF 与官网提交后的正文不同，曾被判为历史／未见证；不声称解释了所有旧故障。去除文件末尾换行后，[另一个新聊天](https://chatgpt.com/c/6af1dbb7-23d0-83e8-8941-1633274d5bef)首条候选 `wf-6d2e8c41-9a73-4f0b-b516-2cae907d84f3` 已由原监听识别，随后准备报 `E_BUILTIN_RESOURCE`，可信侧栏明确“当前候选（尚无任务请求）”、账本 0 条。未手工采用、改身份补跑或放宽 witness。[完整接入说明的新聊天](https://chatgpt.com/c/6af1dc59-eec4-83ee-8e88-75bcc79732d7)只确认协议，没有输出候选或运行任务。

**历史环境阻塞（后续已恢复）：** Google 成功后发现原 dev 服务已退出，原 `dist/development` 缺少 manifest 与资源。确认无存活 writer 后用原 `npm run dev`、原输出锁恢复，取得 PID 27587；构建被并行 `projects/ai-proxy/src/domain/header-actions.ts` 的固定来源门禁拦截，服务正常退出并释放锁。该轮没有修改该 owner 的代码／source-lock，也没有绕过校验、复制旧包、另建加载目录或修改 Native 配对。

**最新首条复测通过：** 后续核对发现原 dev writer PID **33072** 已运行，manifest／资源已恢复，AI Proxy owner 的来源锁已包含该文件；本轮复用现有服务，没有另起 writer。两份提示词、设置源码及回归已进入 `main` 提交 `d2465192d`。恢复原 ego Space **22** 后创建[新的 ChatGPT 网页聊天](https://chatgpt.com/c/6af1df79-ab04-83e8-8e06-db19beebafab)，将仓库短提示词原文（420 字符、末尾无 LF）作为首条发送。候选 `wf-d43b3c4f-dacc-48e4-8bdd-4b185d2db047` 自动复用已有精确范围，未再次审批、手工采用或重放旧任务。请求 `abdca6be-976a-4925-a41a-fcdf33095e22`，Run `978f33e9-e179-42d4-8231-6865b2a4c8cb`，Result `02cebaa3-2691-4a7b-9f68-30b2aad7b88a`；真实回执 `completed / data.status=success / count=3`，正文仅一条结果消息，AI 已完成中文整理且没有新任务候选。三条标题为 Chrome 官方 Side Panel API、Plasmo 使用指南和 Medium Side Panel 文章。仍只有标题、排名和 Google 跳转链接，AI 明确中文说明仅依据标题，未编造实际摘要。

本轮首条 Google 核心流程 **PASS**；新设置界面文案、调试页 applied revision 及本次侧栏资源释放状态未重新现场核对，共享原生 UI 被其他 owner 占用，不把旧轮侧栏证据移作本次证明。113 项检查对应源码哈希未变，未重复运行。Space 22 已 `finish`，仅保留新结果聊天及原未发送草稿，关闭中间测试页；原生 UI 未取得租约，不释放其他 owner 的锁。所有旧 UNKNOWN 和未采用候选继续保全。正式包、production、评分、全量 CI 与跨版本矩阵延期。完整身份、数据、源码哈希和验证边界见[证据](../evidence/google-prompts-20261109.json)，本机原始记录在 `artifacts/webflow/google-prompts-1109/short-fresh-result-20261109.json`。

**用户可见窗口再次复测：** 用户明确当前 ego 窗口手动复制后未正常运行。本轮将原 Space 22 置前，发现其[新聊天](https://chatgpt.com/c/6af1e0bd-d420-83ec-b602-9fbb7ae213f9)已含请求 `ce9ad5d5-a839-476c-96e2-301538ab03ea` 的真实成功回执和 AI 整理，原侧栏五项均成功。保留该现场后，通过普通输入框发送一条全新 Google 请求，生成新候选并自动运行；请求 `1ecd4807-e8b3-4d7b-a60c-3bf5e2694fe3`、Run `d4f97309-4b82-44f6-894e-111046823114`、Result `f783f66e-9a9f-435a-ba57-7cae3ee6b872`，`completed / success / count=3`。原侧栏账本增至 2，同次持久结果、资源释放、单次回传和完整 AI 续答全部核实。页面滚动到结果，Space 再次 finish 并保留该页及未知来源草稿，原生 UI 租约已释放。开始时 serve PID 33072 已停止，使用已加载 development 产物完成，没有重建或重启；不能据此声称 serve 已连接。用户报告的失败未复现、原因未知，未改源码或放宽任何保护。

## 历史提示词回传诊断修复与连续复测（2026-11-09）

当前完成的是持续开发环境中的普通百度核心链与回传诊断，不扩展 production、Google、评分或完整验收。ego TaskSpace **18** 从空白官网复制历史能力说明（输入文件 SHA256 `f15df16029b1943ff8332ebf5e4f5451e1591b4b0d048befa3c69ca7e08d3fbd`），再以普通中文发送需求；没有手工采用候选、填写身份或直调执行。能力说明本身只获 AI 确认，不触发任务。

**修复后连续两轮真实通过：** [新聊天](https://chatgpt.com/c/6af1d06c-4000-83ec-95df-a5bf2f7efac6)中先搜索“浙江省博物馆开放时间”，再搜索“陕西历史博物馆开放时间”。两轮均使用原已安装百度 **1.1.4**、原范围授权与自动运行，分别产生独立请求／Run／Result；每轮 `completed / data.status=success / count=3`、持久结果 verified、资源 released、交付 confirmed、AI 续答完成。聊天为能力说明加两组需求／结果，共 **5 条用户消息、5 条完整 AI 回复**，每个结果仅出现一次，草稿为空。完整身份及真实三条结果见[本轮证据](../evidence/delivery-repair-20261109.json)。

最小源码修复在 `src/page-events/web-task-ingress.js`：将已写 dispatch 围栏后的最终来源／授权核验纳入原错误记录路径，并保留网页返回的具体错误码和原因（限制长度）；此前该核验失败可能只留下 dispatching 与旧 not-sent 缓存，网页拒绝也会丢成泛化错误。新回归先复现三个失败，修后与相关入口保护共 **94/94 PASS**，覆盖 E_CHAT_FILL／E_CHAT_ANSWER 保真、最终来源拒绝时零发送、对账后仍不补发。没有放宽来源、身份、权限或未知结果围栏，也没有重写 Task 或正式工具包。

分清现场：本轮较早的[另一个新聊天](https://chatgpt.com/c/6af1cbaa-0344-83e8-8bde-549737ba01ba)在本次后台改动前已完成苏州搜索；不能把它归功于本次诊断修复。开发更新后该页面两条新需求只生成候选，原生可信侧栏显示监听断开／版本更新，当前 URL 账本仍只有此前成功的一条。未采用或补跑这两条候选；页面历史加载时机不足以解释该现场，之前的驱动推测不作根因。随后同一任务空间进入新的空聊天，才取得上述修复后连续两轮证据。

原失败请求 `bf2cf792-c335-4385-be95-fc388a4ad10f` 本轮只读补得 Run `2e6a63ac-0650-4de1-8eab-b174a7881ec0`／Result `350bf82a-e98d-46c2-a2e3-178aa7daebee`；观察为 completed／verified／released，dispatching、缓存 not-sent 且无具体错误。实际交付仍属 UNKNOWN；无法据此区分最终核验失败、网页填入失败或其他原因，亦未恢复原始业务数据。历史过期 revoked 不证明断连由开发更新造成。该请求与其他旧 UNKNOWN 均保留，不补发、不重放、不清账。

原 `dist/development` 与扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 保持。复测实读 applied revision `801f64453f24…`，后台 SHA `6ab319c723438112e5d99691f85a5699c1dca89939813bb4d8e13f1945f4bf7f`，其 map 中入口源码与当前修复逐字一致；固定页面桥 SHA `2a34a3fa88dab6f5c872ba88e6eba4b54acee99bb87ad0202f4babde0fe04087`。沿既有 writer 应用，没有第二个构建、重装或改 Native 配对。收尾进程只读检查未找到原 writer 30477，当前持续服务连接未重新确认，不声称仍在 serve。源码／产物／已应用证据与正式发布分别报告；本轮未提交或推送，保留并行改动。

## 历史提示词新聊天复现（2026-11-09；修复前失败）

**用户继续反馈未正常运行后，已用历史同一份产品能力说明复现失败，不能把下节的一次成功当作当前问题已解决。** 按用户最后补充“复制你历史对话中的提示词”，本轮从 ego 自有 TaskSpace **12** 的空 ChatGPT 首页发送历史能力说明，等待 AI 确认，再普通发送“请用百度搜索‘南京博物院开放时间’，给我前三条自然网页结果”。[本轮聊天](https://chatgpt.com/c/6af1af5a-cf4c-83ee-95f8-932b4eb1d6c8)产生合法候选 `wf-3c98e62a-7f41-4b9d-a528-1e6c0f74b39d`；没有手工采用候选或填写运行身份。

原生可信侧栏实读 Web Flow **0.3.22**、自动运行 **ON**、两项任务可用。当前 URL 的原请求账本 **1 条**，请求 `bf2cf792-c335-4385-be95-fc388a4ad10f`，创建于本地 **19:33:38**，状态为 **已完成 · 回传未知，禁止补发**；独立监听显示“需要刷新当前对话”，因原请求执行或回传未确认，产品自身禁用刷新。最终聊天仍只有能力说明与普通需求两条用户消息、两条 AI 回复，输入框为空，没有新增结果消息或 AI 结果摘要。原生 AX 截断长账本，完整 Run / Result、原始结果条数和具体 delivery 错误 **尚未取得**；不把“执行已完成”写成三条数据成功，不把监听断开写成已证实的回传原因。

本轮只测试和记录，未改产品源码／包、重启 writer、覆盖 `dist/development`、刷新聊天、补发或重放 UNKNOWN。当前 loaded revision 与开发服务连接未重查，不能沿用历史指纹。原生 UI 占用锁已释放，自有空间结束且仅保留本轮聊天供查看；并行文件与其他空间不动。下一条操作是只读核对**这条原请求**的完整持久回执／delivery 错误，并关联原文档连接与开发更新时序，再决定最小修复；本轮尚未修复，完整核心结果 **未通过**。Google、production、全 CI、评分与正式验收继续延期。见[本轮分层证据](../evidence/historical-prompt-repro-20261109.json)。

## 全新聊天核心验证（2026-11-09；核心开发）

以下保留上次成功观察；最新结果以本文件首节为准。

**全新聊天的核心链已跑通。** 用户反馈“复制能力说明到新聊天后未触发”，因此重新从空的 ChatGPT 首页开始，复用产品能力说明而非每轮开发提示词。ego 同一 TaskSpace **9** 的[新聊天](https://chatgpt.com/c/6af1a844-05f0-83e8-97ff-e290f21c604b)先收到能力说明和 AI 确认，再普通发送“请用百度搜索‘南京博物院开放时间’，给我前三条自然网页结果”。原监听实际见证新增用户消息并等待完整候选 `wf-7f92c8d1-0b43-4e6a-9d57-2a84f1c0b935`，沿原授权自动执行，没有手工采用候选或填写 Run 身份。

真实请求 `e13555ca-e03a-4dff-89a7-d1856a874707`；Run `a9773eed-cc2c-4e08-8b6e-2080514a8df0` / Result `bee67afa-295a-4799-bea0-70aeb4603fc7`。原已安装百度 **1.1.4** 和双 hash 不变，返回 `completed / data.status=success / count=3`：南京博物院参观页、官网首页、南京本地宝游玩指南。真实 trace 包含输入、点击、结果页导航和读取三条。可信 UI 分别确认脚本完成、同一持久 Run / Result、资源释放、原聊天交付及 AI 续答；原聊天仅出现一条该请求的真实结果消息，AI 完成中文摘要，输入框为空。展开原账本仍为 **1 条、已完成 · 原聊天交付已确认**。本轮未单独截取发送前草稿瞬间，不能将最终交付倒写为独立的草稿截图证据。

首次自有[新聊天尝试](https://chatgpt.com/c/6af1a69f-b10c-83ec-938c-d4670d7322e9)虽有合法候选，但实际侧栏显示“监听断开／版本已更新，需要刷新”，账本 **0 条**。保留该现场；确认本任务无待处理动作且草稿为空后，在同一页面安全进入新的空聊天，确认连接后才发送上述新需求，没有采用或重放旧候选。此证据解释本轮首次尝试的断连阻塞，不证明用户先前失败具有同一原因，也不把历史已接入聊天的成功当作新聊天证据。

当前环境为原 `dist/development` 持续开发、固定扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、已安装 Web Flow **0.3.22**、自动运行 **ON**，两项任务可用但只运行百度。本轮未修改产品源码或包，保留现有唯一 writer **30477** 及并行 listener／site 修复；该共享开发树成功不代表独立提交或 production 已验收。Debug 指纹 `dcc304b1523f…` 在最终成功聊天前读取，最终未重新核对 loaded revision，不能冒充同候选指纹证据。空间 **9** 已释放，仅保留成功聊天供用户查看。历史 UNKNOWN 请求不补发、不重放、不清账；Google、production、完整 CI、评分及正式验收继续延期。完整回执、分层观察与证据边界见[本轮证据](../evidence/fresh-chat-core-20261109.json)。

## 普通百度需求当前执行卡（2026-11-09；核心开发）

**以下为已接入原聊天的历史核心验证；全新聊天结论以上节为准。** 在 ego 同一空间 **7** 的[原聊天](https://chatgpt.com/c/6af19ad4-ae48-83ec-9bd1-e073248c49cd)，已有能力／协议说明后，正常发送“请使用 Web Flow 在百度搜索‘故宫博物院 开放时间’，取前三条自然网页结果，等真实回执后整理”。真实 AI 生成五字段候选 `wf-3e1a8d57-c964-4f02-a7b3-5d6e920bc148`，现有监听见证新增消息和完整回复，复用原百度关键词授权自动执行，无手工采用候选、填写 Run 身份或直调后台。

真实请求 `1e5a8f4c-167b-42ec-b228-9dd89a34b57f`；Run `1edc061a-953c-4cb9-8f0c-b1123c9cb4fb` / Result `7691cd4b-bc71-4f27-9f15-ed4378b0c26a`。原百度 **1.1.4** 返回 `completed / data.status=success / count=3`，包括参观、官网和在线订票三条自然结果。可信侧栏核实同一 Run / Result 与资源已释放；原聊天出现真实结果用户消息，重开侧栏后的原账本仍显示“原聊天交付已确认”，官方 AI 已完成带三条链接和摘要的中文续答，输入框为空。执行、持久结果、释放、回填、发送、续答分别取证；后续开发上下文变化导致监听需恢复，不影响上述已完成原记录，也未补跑。

此前唯一 writer PID **85127** 缺少 manifest／侧栏产物。用户明确批准接管后，已温和停止原进程并在同一 `dist/development` 启动唯一 writer **30477**。首次恢复暴露 Cloud Host 经 Task Service 间接导入包 JSON，被原来源门禁正确拒绝；最小修复将原样运行授权函数移到独立模块，Cloud Service 直接导入，保持 JSON 仅进入 SW 的限制。修前失败、修后通过的实际 bundle 闭包回归及来源检查 **3/3**，初始化 **16/16**、Task 权限／恢复 **15/15**、Cloud 单 Task 撤销 **1/1**。开发侧栏实读原 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、服务已连接，指纹 `664618b74dbd`。此为含并行 listener／site 修复的共享开发树证据，不冒充冻结提交或 production 候选。

恢复前候选 `wf-9c7b64e2-1f85-4a30-bd96-83e72f0a5c41` 被正确视为历史，未补跑；本次是监听就绪后的新普通需求。历史请求 `c1ac3f73-48b9-4a3b-b9c8-926a5dcaf70b` 的 UNKNOWN 保留，不补发、不重放、不清账。Google 初始化不作为百度前置；production、完整 CI、评分及正式验收继续延期，不因核心完成自动启动。完整分层数据见[当前证据](../evidence/core-request-20261109-current.json)。下列各轮段落均保留当时观察。

## 内置任务接入与恢复（2026-11-09；V0.3.22）

当前阶段是修复普通用户首次使用时缺少已安装 Task 的入口；复用上一节真实操作发现的阻塞，不重写百度/Google 脚本，不重做搜索全组，也不恢复 production、评分或完整验收。两个固定脚本仍为百度 1.1.4 / Google 1.0.0，源码与 manifest hashes 未变。

框架 `src/platform/tasks/builtin-releases.js` 只导入两个原正式 JSON。原 `service.js` 抽取共享安装事务，目录/resolve 与后台候选均先调用同一幂等初始化，写入真实 candidate、Revision、安装记录及安装授权；发行证明为 `builtin-release / packaged`，没有伪造 runId/resultId/verifiedAt/native receipt。新包按静态版本及双 hash 核对；已有合法安装不依赖当前发行目录仍匹配。已有安装身份、停用及历史证据保留；卸载写原存储 tombstone，关闭重开/运行时更新不重装。历史仅有候选而无安装的状态无法判断是否曾卸载，保守保留可审阅候选，不暗中安装。失败事务整体回滚、可重试；精确区分未安装、已卸载、已停用、初始化失败。原权限、真实目标、安装 CAS、撤权、UNKNOWN 和执行世界保护继续执行。

Web Flow 通过公开 `tasks.open` 进入原“我的”管理或原全页候选目录；初始化失败额外提供重试，运行按钮保持禁用。原任务目录清楚标注“内置发行”，无需填写本机 runId；普通导入任务的真实验证流程不变。编译门禁仅允许两个精确 JSON blob 进入 SW 作为安装数据，拒绝原脚本 JS、任意任务包、其他固定输出、改字节和符号链接，不将其中 sourceUtf8 当特权代码执行。

验证：核心定向 **92/92**、恢复导航及相关 Authority/作用域行为 **20/20**、原包门禁 **8/8**。包测试中原先要求 Host 源码直接出现 `focusInstalledTask` 的两项静态断言已由实际管理/安装恢复行为测试取代，其他沙箱保护保持。JS 语法、内存 browser bundle 及来源准入检查通过；内存 graph 仅包含两个 JSON，无任务 JS 模块。唯一包 **0.3.22**，72,888 bytes，SHA256 `f26c676719f8090002272ea601d32d791b7733913b557ad3d6019ee2ebd92b15`，原候选→晋升→同源检查通过。

ego TaskSpace **64** 在原扩展中心完成 **0.3.21 → 0.3.22** 同 ID 本地审阅更新，权限不变，安装存储独立读回版本与上述 SHA。自动运行实读 **OFF**。当前为原 `dist/development` 持续开发，Debug 实读已连接、指纹 `79432ef89e38`；但 `sw.js` 仍为旧字节（SHA `6c9fdec1482083eaeaf7ef6a6f1e410fbafbc6920bed17bc71fec1cde95cc5f9`），没有新初始化错误码，实际 Web Flow 仍只有百度可用、Google 不可用。工具 JSON 不能替换固定后台，故**当前 Profile 双 Task 自动安装与新普通聊天准入仍 NOT_TESTED**。

本轮直接来源检查还发现并行 `projects/webflow/trusted/chatgpt-bridge-page.js` 已改动而原固定 blob pin 未更新，完整产物输入尚不就绪。未改写该 owner 的回传代码、未代为放宽/更新其来源 pin，未另起或重启 writer、未覆盖 dist。下一条受影响操作：该输入由其 owner 完成审阅后，由原 writer 正常载入本轮精确 JSON 来源准入并安全更新；在真实产品入口核对两个实际安装身份与重开幂等，再在新聊天验证普通候选到必要授权步骤。旧聊天请求 `c1ac3f73-48b9-4a3b-b9c8-926a5dcaf70b` 的 UNKNOWN、网站自身异常与回传失败保持原状态，未补发、重放或借新请求绕过。没有把 Node 通过或包安装成功写成完整业务成功。见[证据](../evidence/builtin-onboarding-20261109.json)。

## UI 修改后普通聊天核心回归（2026-11-09；01a1bf76）

用户最新纠偏：复用此前已成功的固定脚本，先在真实产品入口测试普通需求；具体步骤失败才下探，不从零重建脚本测试。当前仅核心回归，正式验收、production、评分和全量矩阵继续延期。本轮无产品源码或安装包修改；仅本节与[本轮证据](../evidence/core-regression-20261109-01a1bf76.json)记录结果，保留其他 owner 的 UI、预览与 watcher。

ego TaskSpace 63、原聊天 `6aef78a7-6c40-83ec-a189-831eec649921`、已安装 Web Flow 0.3.21。首次普通提示词生成候选后，实际阻塞为缺少已安装 Task；经原目录复用同源码已完成运行的原生回执安装百度 Task 1.1.4，未改固定源码或 hashes。监听断开时核对聊天草稿为空、无附件且回复结束，恢复同一聊天连接；旧候选未补跑。之后新的普通需求产生新候选，原可信范围审阅后真正进入后台执行。

本轮实际请求 `c1ac3f73-48b9-4a3b-b9c8-926a5dcaf70b`，Run `f2468976-eea0-4bb2-ac7b-0d301b2953e0` / Result `7e430153-6ab6-4183-b28a-52164dc08841`。可信 UI 核实同次持久结果及资源已释放；原聊天真实输入框读回 1494 字符结果草稿，未手工伪造或发送。业务返回 `stopped / E_TIMEOUT / count=0`，trace 为填入成功、点击开始后超时；用户明确将目标网页空白归为网页自身异常，未据此修改脚本。随后发送前校验返回 `E_CHAT_DELIVERY_UNKNOWN：准备发送期间原生编辑器、草稿或消息记录已变化`；未确认发送或 AI 续答，具体变化条件尚未定位，不放宽保护。

另一个普通需求“请用百度搜索 OpenDesk Browser automation，返回前三条自然网页结果。”生成新候选 `wf-a73c91e5-4b28-4df0-9a62-e5c7b18d304f`，但首轮交付 UNKNOWN 保持围栏，未产生第二次执行请求；关键词授权复用与两轮业务成功均未通过。结束时账本仍为 1 条，自动运行已恢复 OFF，空间仅保留原聊天，首轮实际回填草稿保存在本轮证据引用的本机 artifact 中；最终输入框为空。下一条操作只定位原发送前核对失败及目标网站可用性，不重新跑脚本全组、不重放或补发 UNKNOWN。完整核心成功状态为 **未通过**，不将框架 completed 或历史成功冒充本轮三条自然结果成功。

## 高度宿主核心交付（2026-11-09；01a1bf25）

用户随后回复“你可以继续推进”，明确承接前一问题中的宿主高度修复提交、真实正常／矮侧栏复验及一次 writer 协调授权。原高度 owner 的四份框架源码和定向测试归本轮收尾；已向皮肤 owner 发出一次资源协调消息，核对其唯一 writer PID 85127（父进程 85107）及原 `dist/development`。本对话未启动／重启 writer、覆盖输出或修改 Native 配对，仍在 main。正式应用交付已由 `aaca631703976c973d5dbb16c445c7bfe65e798c` 推送，唯一包保持 **0.3.21** 与原 SHA。

本轮先用 ego TaskSpace 59，确认真实侧栏 360×663、iframe y=160 / h=503 / bottom=663，以及开发服务连接。ego 主界面显示多个窗口列表时，目标 Page API 及本窗口原生导航仍可操作；原生键盘和桌面焦点共享，输入前先选中自有窗口。此次其滚轮／键盘未改变业务滚动位置，缩放命令返回成功但实际窗口未变，不能记为滚动或矮窗口 PASS。只读探针、CDP 会话已关闭，恢复概览且自动运行关闭，空间 59 以 `keep:[]` 释放。

为解除该具体能力缺口，专项复验改用已有 Chromium **156.0.8078.4**、独立临时 Profile，直接加载现有持续开发目录，实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。经原目录打开真实 Side Panel，并用现有身份验证 helper 核对唯一当前 `SIDE_PANEL` context、documentId、hostInstanceId 及无普通 Tab 身份。原安装器文件导入／审阅 **0.3.21** 及 SHA `87ab1892ead64582418c7da1ddf5f2da0d3d312f8e06f114dbb877512e4c43ac` 后安装；本次是临时 Profile 的新安装，高度检查不替代此前 ego 的同 ID 升级与收藏保留证据。

正常实际窗口 **1100×800**，原生内容区 **360×665**：iframe y=160 / h=505 / bottom=665，帮助真实滚轮到底 `scrollTop=650.5 / clientHeight=461 / scrollHeight=1112`，iframe 文档未滚动，外层无尺寸溢出。该次原始报告后续尝试缩窗超时，整体状态仍为 FAIL；只采信已经完成的两项正常尺寸观察，且该次未记录 loaded revision。随后以真实 **1100×500** 矮窗口重新启动专用 Profile，内容区 **360×365**，iframe y=160 / h=205 / bottom=365；帮助到底 `950.5 / 161 / 1112`，脚本、应用偏好及返回、可信“运行与授权”面板开合通过，七项记录、errors=[]。Debug 前后均显示开发服务已连接、同一 revision `e5d1061c1be6b8d6c96f6bee0e83274d32309868722c04a4d4370d683384b07b`。截图已检查；驱动和自有浏览器已收尾，不把此开发证据提升为 production。

Host 来源／会话／布局定向 **10/10**、R10 iframe CSS 定向 **1/1**、相关 JS 语法通过。源码夹具先在当前工作区通过，再仅用 index 中四份高度源码与 HEAD 的旧 More 菜单复验 **1/1、16 组尺寸、errors=[]**，证明提交不依赖并行直接图标和 Page 安装状态改动；未改源码 HTML / Vue / React 的原行为仍通过。只读 reviewer 未发现阻塞高度问题，修正夹具导航使其兼容旧菜单及直接图标。应用／恢复 **55/55** 与包 **8/8** 复用相同输入的已有结果，不重复构建或打包。

本轮只提交四份框架高度源码、对应测试／fixture、本节、README 与两代高度证据，保留混合文件内并行页头 CSS、Page 安装状态 hunk、预览及其他项目。未安装／授权／启动 Task，未发送 ChatGPT、开启自动运行或重放 UNKNOWN。Native 配对、IME／完整键盘矩阵、真实非空记录与 Knowledge 集成、production、全 CI、独立评分及跨版本／缩放矩阵继续 **NOT_TESTED／延期**。来源哈希、两次原生报告的准确边界、截图及定向验证见[本轮证据](../evidence/host-delivery-20261109-01a1bf25.json)；下列段落全部保留各轮当时状态，不覆盖本轮移交与结果。

## 草稿修复同源交付（2026-11-09；01a1bf25）

用户已在本对话明确移交 Web Flow 正式包与版本收尾，允许保留高度修复并按原链交付下一补丁版。当前 owner 为 `01a1bf25-da8f-70a0-8b9f-f19b58a656e7`；只在现有 main，接续 `main.js` 的公开 `setState` 修复与恢复测试，不重写业务。包版本为 **0.3.21**，能力、固定任务及其精确 hashes 不变。

写入范围为本项目 `src/ui/main.js`、原恢复测试、配置、唯一正式包及本节/README/本轮证据；同源交付保留已移交包所包含的 `src/ui/style.css` 高度来源。框架、旧预览及其测试/证据仍归原 owner，不整文件提交并行文档段落。当前阶段仅核心完善与最小验证；0.3.20 的原正式包与旧临时候选保留为来源证据，不以相同版本替换字节。

核对 main.js / 恢复测试指纹与源记录一致，复用原应用 **55/55** 结果；新增版本补原包门禁 **8/8** 与候选→晋升→`PROJECT_PACKAGE_MATCH`。唯一正式 **0.3.21** 包为 71,761 bytes，SHA256 `87ab1892ead64582418c7da1ddf5f2da0d3d312f8e06f114dbb877512e4c43ac`。

自有 ego TaskSpace **56** 的真实侧栏沿原安装器审阅并确认 **0.3.19 → 0.3.21** 同 ID 更新，审阅哈希与候选一致，权限未变化、两个固定任务 hashes 不变；重开标题实读 0.3.21，Google 收藏保留，自动运行仍关闭。安装后的普通工具页完成搜索／清空→More 帮助→返回原脚本 Tab→应用偏好深色保存读回→More 帮助→返回及独立工具设置；没有再出现旧草稿标记拦截。真实侧栏安装证据与普通工具页导航证据分开记录，不将普通工具页的自动运行状态核验拒绝当作侧栏通过。

期间并行皮肤 owner `01a1bf2d-5cdc-78c0-8574-592f30819182` 启动唯一 `npm run dev` 并由原安全更新链处理产物。本任务页面重新打开后出现直接帮助／应用偏好图标，调试实读“开发服务已连接”、指纹 `2bbde69c8ae0`。本对话未启动 writer、写入共享 dist、强制重载或修改 Native 配对；页面重新打开还读回了深色偏好。随后通过原 UI 恢复跟随系统、取消临时 Google 收藏并取得保存读回提示，搜索为空，返回概览；TaskSpace 56 已释放。

包和草稿修复已安装交付。真实正常／矮侧栏高度与滚动仍待宿主 owner 收尾，本轮未取得该实际尺寸证据；宿主源码提交没有随包移交，不能一并提交。Task 安装／授权／启动、ChatGPT 消息均为 0；IME、真实非空记录、Native、production、完整 CI、独立评分与缩放矩阵继续 **NOT_TESTED／延期**。见[本轮证据](../evidence/core-delivery-20261109-01a1bf25.json)。

## 真实安装核心检查与草稿状态修复（2026-11-09；01a1bcf7）

本轮沿原安装器将已安装 **0.3.14 → 0.3.19** 同 ID 更新，使用已提交 `477a4c312` 的确切包，SHA256 `fc4498c2e7d1656cbc35c303cfe59f1ff37682d8a5a27a9fe4d2a238071641dd`。ego TaskSpace 54 的真实侧栏确认版本、收藏与主题保留，三 Tab、搜索／清空、筛选／空状态、收藏排序、行菜单、中文任务不可用指引及运行禁用、帮助／应用偏好回退与独立可信设置均可用。测试标记已还原，自动运行保持关闭，未安装或运行 Task、授权或发送 ChatGPT。完整边界见[本轮证据](../evidence/installed-core-20261109-01a1bcf7.json)。

当前是日常 **development**：实际加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，Debug 显示指纹 `fc74f1aeb3ae…` 和服务已连接；进程／43119 监听未能独立证明仍有 serve writer，不能据此声称持续更新有效。没有覆盖 dist、重建或重载 Browser，旧宿主仍使用 More 回退，新 Header 直接图标尚未生效。

实际缺陷有两项。① 真实搜索输入／清空和主题保存读回后，宿主仍将应用视为未保存，禁用 More。公开 SDK 要求应用同步 `setState({dirty,busy})`，当前 Web Flow 漏报；只在 `src/ui/main.js` 补状态同步及偏好确认，不改公共宿主。视图搜索释放误标记，未保存参数及失败／不一致读回继续 dirty，持久写入期间 busy，确认保存后才释放。原 `tests/webflow-recovery-ui.test.mjs` 新增四项交互覆盖；前三项修前失败，修后应用／恢复 **55/55**、原包门禁 **8/8**、语法／定向 diff 检查通过，任务固定身份／CAS／UNKNOWN 恢复保持。② 约 600px 高真实窗口中页脚及详情仍被裁切且无法滚到；已恢复正常窗口。下段 0.3.20 高度源码及框架改动属于并行 owner，本轮未覆盖，其夹具证据不能当成真实安装通过。

原打包器已生成本任务临时候选 `artifacts/webflow-installed-core-01a1bcf7/draft-state-candidate.opendesk-tool.json`：当前配置 **0.3.20**、71,761 bytes、SHA256 `f9020ac3bebdb6ec1ac2f91b945d538f52675f7cdf19f48ee5d3adee4908821d`，验证有效但**未晋升／未安装**。它包含当前并行高度源码，仅供协调核对；原 owner 的正式 0.3.20 包尚不包含本次草稿修复，当前源码不应继续声称与该旧包完全同源。已请求正式包／版本收尾移交，未收到答复前不改其配置、正式包、CSS、预览或 Host 文件，也不抢先制造会阻断 0.3.20 升级的新版。下一条操作是明确交付 owner 后由原链统一晋升，再验证安装后的草稿保护；高度还须对应宿主源码生效。真实 Task、Native、production、完整 CI、评分、缩放等继续 NOT_TESTED／延期，核心目标尚未全部达成。

## 框架统一高度与滚动（2026-11-09；V0.3.20，历史开发验证）

以下为原高度 owner 的当时记录；现已由上方 0.3.21 与宿主核心交付接续。当时完成范围为源码开发与对应最小验证。已在 ego 原安装入口复现外层溢出；没有覆盖 `dist/development`、重载扩展或操作 Native。正式包和 Browser 宿主分别交付，不继承旧包的安装证据。

通用 Host 为所有 opaque 沙箱提供同一有界画布，去掉官方 ID 白名单、Cookie / Time Review 的高度分支、固定偏移和高度上限；内容尺寸不再反馈改变 Host。Sandbox 保留自然文档滚动，并提供可选 workspace / scroll CSS。Web Flow 唯一业务改动为挂载节点 `height:100%`，保留原导航、偏好、说明、存储和任务绑定。额外修正可见 display 作用域，保证忙碌实例保留时列表仍能滚动；全宽滚动容器避免左右裁切，通用 iframe flex 支持已有嵌套目标。

真实 React Shell / ToolHost / controller / Sandbox / bridge / WebflowAutoControls 浏览器夹具通过 16 组尺寸记录：400×600 时沙箱 y=224 / h=376 / bottom=600；可信授权 Sheet 开合尺寸不变；外层控件增加 100px 后画布对应缩小 100px；320×300 时仍有 78px 画布。五个应用页面、帮助滚到底、稳定高度与消息去重、独立工具页、保留实例返回长列表，以及未改源码 HTML / Vue / React 的读取、保存重开、自然滚动与原 React 图表均通过。嵌套 flex 目标与 iframe 同为 300px。修改前四份框架快照的同夹具对照为 iframe bottom=1304（窗口 600px），工作区 scrollHeight=1209。

先尝试 ego，但其当前开发扩展向 HTTP 沙箱注入不可重新定义的 `OpenDeskSDK`，与实际 bridge 冲突；本轮使用仓库既有独立 Chromium 156 测试入口验证源码，没有修改用户扩展或 Profile。ego 空间 52 和本任务夹具 / 浏览器已释放。mock 仅为目录、存储、只读任务元数据及关闭的自动运行状态，真实 Task 派发与特权修改均为 0。

相关 Host 高度 / 来源 / 实例检查 **9/9**、Web Flow 应用与恢复 **51/51**、原包门禁 **8/8 PASS**，JS 语法与定向 diff 检查通过。完整 Host 文件此前为 274 PASS / 16 FAIL：撤销草稿导航、缺失 Reading TOC 正式包、Bookmark 确认均由修前快照定向复现；旧 R10 的 Dock 源码字符串断言也属于已有迁移问题，未扩大修复范围。真实 Knowledge 工作区集成、当前扩展重载、应用安装、Task / Native、production、全 CI 与评分保持 **NOT_TESTED**。

唯一包 **0.3.20** 经原打包器候选→门禁→晋升→`PROJECT_PACKAGE_MATCH`，71,179 bytes，SHA256 `70e5ccb064c334593df73f4c4d779ba48123b8a49e6faaa8adb839b751a19c6e`；尚未安装。自动更新器遇到配置内多个 version 字段不能安全替换，故仅精确提升配置顶层版本并沿原打包器执行，没有修改更新器。全部本轮修改留在 main 工作区，未提交或推送。详细来源、截图位置与未测项见[本轮证据](../evidence/sidebar-host-layout-20261109.json)。下方 0.3.19 及更早段落保留各 owner 的历史记录。

## 核心 UI 与共享交付（2026-11-09；01a1bca2）

真实 ego 安装与核心操作证据仍只对应 0.3.13／0.3.14：三 Tab、百度搜索／清空、筛选、收藏排序和设置可用，收藏保存误报已修复，自动运行保持暂停。固定任务未取得有效安装／启用状态，未派发真实 Task、重放 UNKNOWN 或扩大权限；空间 42 已释放。

用户明确授权“允许统一提交并推送”后，本轮交付范围为 11 个核心文件：README、原执行计划、两份 UI 核心证据、`src/ui/{main.js,model.js,style.css}`、现有恢复测试及 UI fixture、版本配置和唯一正式包。保留并行菜单／任务提示／高度改动及来源归属；宿主源码、完整预览、其他 fixture 和其他项目继续留给原 owner。

提交守卫发现并行 owner 正在修改高度 CSS 并将配置提升至 0.3.20，而已验证正式包仍为 0.3.19。本轮使用只读临时快照冻结 0.3.19 的 11 个核心文件，经原测试与打包器再核对后提交。并行新增 CSS／配置不写回、不回退，原样留在工作区给原 owner；本轮快照不是第二安装入口。

等待授权期间候选由 0.3.18 迭代至 **0.3.19**，能力及固定任务绑定未变。当前快照的应用／恢复检查 **51/51 PASS**，相关 JS 语法与文档／JSON 检查通过，原打包器只读核对 **PROJECT_PACKAGE_MATCH**：71,295 bytes，SHA256 `fc4498c2e7d1656cbc35c303cfe59f1ff37682d8a5a27a9fe4d2a238071641dd`。没有新建打包器、重写正式 JSON、启动 Browser 构建或改变安装。0.3.19 的原生安装、宿主部署、真实 Task、production、缩放、全量 CI 和评分继续 **NOT_TESTED／延期**；Git 交付不提升这些证据等级。

## 应用偏好与工具设置区分（2026-11-09；V0.3.19）

用户指出两个齿轮容易混淆。核对后，前者为沙箱应用的主题偏好及使用说明，后者为宿主的权限／启停／工具管理。采用滑杆“应用偏好”与齿轮“工具设置”，保持原导航 ID、所有内容和可信管理入口。共享 Header 的现有 `settings` 图标键改为滑杆；Web Flow 的 fallback、label、title、页面标题及面板名称同步，不增加 SDK 字段、导航或授权层。沿原 `opendesk-extension-ui`／应用开发边界修改，无权限实现变化。

相关应用导航 **5/5**、Header 组件 **3/3**、原打包门禁 **8/8 PASS**；JS 语法及定向 diff 检查通过。ego TaskSpace **51** 在原完整源码／模拟边界夹具中确认顶栏不同图形和提示、键盘 Enter 打开“应用偏好”、主题及原说明仍可达；截图 `artifacts/webflow-preference-icons/topbar.png`。离线预览 113 项输入与当前工作区匹配，候选 SHA `1aacf89aef54368e2117e953d14846efd43e962be5a9f1a994d13450a20aaab5`，HTML SHA `9c8a06f655dbf74666cd3540781efe1ed1ee5c499d191b6c00e37a43692f9077`。这是源码组件证据，不是实际安装或 Native 验收。

唯一正式包 **0.3.19**，71,295 bytes，SHA256 `fc4498c2e7d1656cbc35c303cfe59f1ff37682d8a5a27a9fe4d2a238071641dd`，原候选→测试→晋升→同源核对完成。仍需 Browser 加载当前共享 Header、应用经原安装器同 ID 更新；未自动安装、未构建 Browser、未运行真实任务、未提交推送。空间 51 已 `finish({keep:[]})`，没有新增服务。原存储、任务不可用、高度／配色及其他 owner 的运行时修改均保留，上一轮的安装与延期边界不变。

## 宿主右上角直接图标（2026-11-09；V0.3.18）

最新纠偏：帮助／设置放到宿主右上角、卸载旁原“…”位置，不放在三个主页签旁，也不删除原页面或内容。原入口是 `projects/webflow/src/ui/main.js` 的公开 `setNavigation`，位置由唯一可信 `src/ui/react/tabs/tool-host.tsx` 决定，工具自身不能把沙箱 DOM 放入可信页头。复用现有 Header 和 `IconButton`：1–2 个都有有效图标的动作直接显示，其余保留唯一菜单。ScrapyJS 的新建／配置库也是同一规则的现有消费者；没有按 Web Flow ID 分支、增加 SDK 字段或改动权限。帮助使用现有 diagnostics 图标键的问号圆圈；管理设置及卸载继续保留原控件。

Web Flow 恢复完整 Header 快照及原 root 事件，复核当前页后才切换帮助／设置，返回原来的概览／脚本／记录页签。宿主接受投影才隐藏内容入口；拒绝时立即重交 base 并保留原按钮。四组帮助、设置主题、运行与授权、开发安装和流程说明全部保留。并行的存储读回、任务不可用、高度／配色修改完整保留，未修改其他应用、共享索引或真实任务。

验证：Web Flow 应用交互 **51/51**、完整 Header 组件 **3/3**、受影响 Host／Bridge 作用域保护 **24/24**、AI Proxy／ScrapyJS 原导航 **6/6**、原打包检查 **8/8 PASS**；相关 JS 语法与定向 diff 检查通过。Header 旧静态断言错误地要求历史 `gap:2px` 和声明顺序，本轮仅改为解析 CSS 检查定位／层级语义，不改变有效产品间距。测试的 Vite 依赖发现误扫描整个 artifacts 导致大量无关预览日志，已在该纯 SSR 测试关闭依赖发现和文件监听；重跑为 1.7 秒、无扫描错误。

ego TaskSpace **50** 使用现有完整可信宿主与 opaque 应用 iframe 源码夹具，仅模拟 SDK／安装／权限／存储边界；复用原预览生成器并补齐导航 Mock，无展示补丁。400px 宿主中两图标与卸载同为 **y=59.5、30×30px**，More 不存在，无横向溢出；实际键盘 Enter 打开帮助、切换设置、主题保存读回、返回原脚本页、重开保留主题均通过。截图 `artifacts/webflow-header-actions/{settings,topbar}.png`。候选输入 SHA `1f3eddee39b81d282a86c8a9d6498f681b0b1a6bae4fb927085807e7c5dbf97e`，离线 HTML SHA `f663cb104d4c97637a0dc5c364c3e49d8b4c6437c54989fe206dc838ceff5ffd`；113 项当前源码依赖逐项匹配，原生运行不是本轮证据。

唯一正式包 **0.3.18**，71,364 bytes，SHA256 `e6600a83c4c9caef6db7da7ded9c2247bfd85c2992285ba9b28d35eda7da83fd`。仅提升顶层配置版本（原自动替换无法处理委托任务的多个 version），之后原 `app:update` 完成候选、8 项门禁、晋升和 `PROJECT_PACKAGE_MATCH`。本轮没有 Browser writer／43119 监听，未启动或覆盖共享构建；状态为 **源码及组件验证完成 / PACKAGE_READY_INSTALL_NOT_TESTED**。需要 Browser 本体加载宿主修改、再经原安装器同 ID 更新应用后，才可声称现有产品生效；实际安装证据仍止于历史 0.3.14。不安装、不运行真实 Task、不恢复延期 production／评分／全量验收。空间 50 已 `finish({keep:[]})`，仅停止本任务预览服务 PID 97686，其他空间和服务未操作。当前对话负责本轮源码、同源包和文档收尾；没有提交／推送指令，未操作共享索引，协调对话的存储修复／测试及证据全部保留。

## 应用高度与正文滚动（2026-11-09；V0.3.17）

当前用户操作是打开 Web Flow，要求应用占满可用高度并合理滚动。正式 owner 仍为 `projects/webflow/` 的 Sidebar Tool 沙箱；先打开 ego 扩展入口，但普通标签页仅显示本地任务目录，因此转用原 `tests/webflow-ui-server.mjs` 的真实源码组件直接诊断，不安装或执行真实 Task。

复现：400×720 组件中，原应用高度只有 **226px**，`min-height:100%` 的自动高度父级不能提供明确基准；挂载点与 React 根还共用 `.wf-app`。现有宿主已提供 `--opendesk-host-available-height`，无需新增 SDK 或修改 Browser。只在原 `src/ui/style.css` 中明确挂载点高度、内层列布局、导航不收缩及正文 `min-height:0`／独立滚动。短内容保持靠上，长内容可滚动，未提供宿主尺寸时按内容自然展开，避免视口高度与 iframe 内容自适应形成反馈。保留并行的文字导航和配色提交；收尾观察到其他 owner 的 stash 合并标记，随后已由并行 owner 清除，复核高度规则及配色均保留，没有替换整个文件或重置工作区。

验证：ego TaskSpace **45**，沿原组件夹具运行 **13 项**高度／滚动检查，包括概览、空记录、设置、长帮助、PageDown／End、导航固定、720／400／240px 高度、筛选与行菜单可达，以及宿主控件预留空间；另验证旧宿主按内容展开、改变 iframe 视口不会导致高度反馈。720px 可用区域内应用为 **720px**、导航 44px、正文 676px；长帮助正文约 1039px，只在正文滚动。Mock Task start **0**。空间已 finish，仅停止本任务自建夹具 PID 84191／85460／86935，未控制其他空间或 Browser watcher。

浏览器实际消费的是启动时冻结源码：main.js `594b650692375d9c51f384e6f839a06dd20a288b26fd0ad6b8bf92a75d7f28ee`、model.js `7f0356f432b1b652fa5c777fd2451967e532dd42ef2b863a81cbc90b0d09acc2`、style.css `5797578335ce10a7b741c092da434b381e9f87459fa225201c803e852f2459fa`。合并后的 CSS 为 `571219b2b50bf03834abe726575b0864db326790bf7f4eddf7eb1ea0a98d578f`；仅逆向替换配色变量及主按钮颜色声明即可还原精确已测 SHA，布局字节未变。最终配色截图 **NOT_TESTED**。原始几何结果、脚本与截图位于忽略目录 `artifacts/webflow-height/`；该证据只证明源码组件，不证明真实安装／Native／Task。

原 `app:update` 完成 7 项门禁，但在 `tests/environment/sidebar-tools.test.mjs:208` 的旧宿主页头断言失败：期望 `34px/margin-bottom:8px`，当前宿主已为 `48px` 全宽页头；本次未修改该宿主。保留失败，未为迎合旧断言改产品或测试。按当前改动范围使用原打包器，明确选择包格式、路径／资源、候选晋升／版本保护、沙箱隔离的 **7/7** 检查及 Web Flow 原打包合同 **1/1**，均通过；此前应用既有检查 **7/7** 也通过。候选 `artifacts/webflow-height/candidate.opendesk-tool.json` 再经原 `--promote-from` 和 `--check-project` 成功，未运行根全量测试或 Browser 构建。

唯一正式包 **0.3.17**，70790 bytes，SHA256 **`8997791c70f82a87f1180bfc2fb8fec2818d89cfe5930bebab71f33fb1ef2dae`**。范围为高度 CSS、顶层应用版本、原正式 JSON 和本段／README；其余并行源码、暂存改动与证据保留。状态 **PACKAGE_READY_INSTALL_NOT_TESTED**；下一条真实产品操作是原安装器同 ID 更新后重开，核对真实侧栏高度。未安装、未提交推送，正式验收与评分继续延期。

## 原菜单内容完整展开（2026-11-09；V0.3.16）

用户纠偏要求保留原“…”内按钮及内部内容，并授权自行完善设计。逐项对照旧导航快照与原帮助／设置页，保留主题选择、运行与授权说明、开发安装说明、多步骤流程说明，以及自动运行、停止排查、手动运行、版本／UNKNOWN 四组指南。上一轮仅将入口改成图标，本轮进一步显示“帮助”“设置”文字与当前页状态；帮助按四组卡片直接展开，设置中的流程说明也直接显示，不再增加内容折叠层。只修改原 `src/ui/main.js`／`style.css` 与现有导航测试，本项目文档同步；原基础导航、宿主唯一返回、SDK、权限、任务菜单和并行任务恢复／存储修复保留。

验证：`node --check`、现有应用检查 **50/50** 通过。ego TaskSpace **46** 在原组件夹具、400px 内容宽度核对文字按钮、键盘 Enter 打开帮助、四组指南展开、设置内容展开、主题保存读回及返回脚本后重新打开保留主题；内容无横向溢出，模拟 Task start **0**。截图为 `artifacts/webflow-expanded-actions/settings.png`；组件输入 main.js `594b650692375d9c51f384e6f839a06dd20a288b26fd0ad6b8bf92a75d7f28ee`、style.css `c5230ffd321de664d483be90b72eb5fb903472f332234cd55f2faaf1f6fab96f`。SDK 为模拟，非真实安装或任务证据；空间已 finish，临时夹具已停止，未操作既有空间与 Browser writer。

并行 owner 已通过原晋升链将包含本次源码的正式包提升至 **0.3.16**。本轮重新执行 `--check-project` 与 `app:update --check`，分别为 **PROJECT_PACKAGE_MATCH / ALREADY_CURRENT**，无需再重包或升版。正式 SHA256 `3f8e23d266612c025714aacffc503aeb8245dbd8349b788d309c0794c81f4a1d`。状态仍为 **PACKAGE_READY_INSTALL_NOT_TESTED**；下一条产品操作是原安装器同 ID 更新后重开。没有安装、运行真实任务、提交或推送；下方历史分数和正式验收延期不变。

## 任务不可用提示与恢复（2026-11-09；V0.3.16）

当前请求为直接修复脚本列表中的 `E_PERMISSION：Task is disabled or not installed`。原 `tasks.read` 安装检查将“未安装或已停用”合并返回，应用直接拼接英文错误，且不可用任务的“宿主管理”无法使用。公开 `tasks.open` 只支持已安装、已启用任务，不能作为缺失任务的安装入口；继续复用原 SDK 与可信任务目录，不新增平台接口或绕过检查。

写入范围：原应用 `src/ui/model.js`／`main.js`、现有 `webflow-recovery-ui.test.mjs`／`webflow-ui-server.mjs`、顶层应用版本与唯一正式包、本项目 README／本段记录。保留原 0.3.14 导航、存储读回和已暂存文件，不修改任务固定身份、Framework、真实安装或未知请求。

结果：列表显示中文原因及“我的”安装／恢复、刷新指引；普通权限拒绝不误判为任务缺失；版本或验证变化、应用停用、所有权拒绝和其他读取失败分别提示。原始错误保留在详情中的折叠诊断，不默认展示。不可用任务不显示无效管理入口；刷新开始清除旧提示并撤销运行资格，只有有效安装回读后才恢复，整个过程不派发任务。

验证：两项新增真实 React 交互回归修前失败，修后 `node --test projects/webflow/tests/webflow-ui.test.mjs projects/webflow/tests/webflow-recovery-ui.test.mjs` **50/50 PASS**；相关三个 JS 文件 `node --check` 与 `git diff --check` 通过。ego TaskSpace **44** 使用现有独立源码组件夹具复现原英文提示、检查中文提示及默认折叠诊断、模拟恢复后刷新，回到“可手动运行”，模拟 Task start **0**。证据为 **UI_COMPONENT_MOCK_SDK**，不代表真实安装／网站执行；空间已 `finish({keep:[]})`，本轮夹具进程已停止，无 Browser 构建或共享 watcher 改动。

收尾同源核对发现并行的帮助／设置源码和样式更新，使初次 0.3.15 候选过期；保留该变更并重新执行应用检查 50/50 后，将最终版本提升为 0.3.16。原 `app:update` 完成新候选、8 项包／晋升保护检查、晋升及同源核对。ego 组件证据仅覆盖当时 main.js `05b76689…`／model.js `7f0356f4…`，并行展示变化不继承该浏览器结论。唯一正式包 **0.3.16**，SHA256 **`3f8e23d266612c025714aacffc503aeb8245dbd8349b788d309c0794c81f4a1d`**，状态 **PACKAGE_READY_INSTALL_NOT_TESTED**。下一条真实操作为原安装器同 ID 更新后重开；若百度任务未安装或主动停用，仍经“我的”原审阅／恢复入口处理，再回“脚本”刷新。没有自动安装、自动恢复或实际运行百度搜索；真实安装／任务执行、production 与完整验收保持 **NOT_TESTED**，未提交推送。

## 帮助与设置直接显示（2026-11-09；V0.3.14）

用户当前要求仅为取消右上角“…”中的两项折叠。复用 `projects/webflow/src/ui/main.js` 原有帮助／设置按钮与 `setNavigation` 基础导航，不声明 `headerActions`，两个按钮固定显示在三个主页签右侧；宿主继续提供标题与唯一返回。没有修改 Browser 框架或权限。

写入范围为原应用 `main.js`、现有导航交互测试、版本配置与唯一正式包，以及本项目 README／本段记录。同文件并行新增的存储读回比较与两项测试完整保留，随当前源码打包，不将其归为本轮实现；其他已暂存文档及浏览器交接保持原状。

验证：语法检查、应用现有 Node 测试 **48/48**、打包门禁 **8/8** 通过。ego TaskSpace 43 在 400px 宽的真实源码组件中完成帮助／设置直接打开、键盘 Enter 打开、返回脚本页；两个入口可见、内容无横向溢出、模拟 Task 派发 **0**。SDK 与宿主导航分别为组件模拟和 Node 交互证据，不代表真实安装。空间已 finish，临时夹具已停止，未操作既有浏览器空间或 `dist/development` writer。

`app:update` 的自动 PATCH 替换因配置中同时存在委托任务版本而拒绝；仅提升顶层应用版本后，原 `app:update` 完成候选、门禁、晋升与同源核对。正式版本 **0.3.14**，SHA256 `4c3d7e9db8e751b6c6a1f9e3c9f68ed06104d778c88877604994d661349d8a2f`。状态 **PACKAGE_READY_INSTALL_NOT_TESTED**，下一条产品操作为原安装器同 ID 更新后重开；本轮未安装、未运行真实任务、未提交推送，不恢复下方延期验收。

## V0.3.13 UI 核心执行卡（2026-11-09；01a1bc77）

**最新阶段：UI 核心优先。** 用户最新明确“现在不需要考虑缩放，优先完成核心部分”。本轮只完成现有紧凑 UI 的真实源码交互、状态修复和同源安装包；缩放、完整原生验收、六专家最终评分及正式验收结论延期，自动续跑不得恢复旧全量清单。原始最高产品目标保留。

**核心结果：** 保留已整合的概览／脚本／记录及原 SDK 执行链；任务缺失 fixture、网页切换核验、迟到回包、卸载及缺失安装身份已修复。核验中／错误网站不再显示“可手动运行”。搜索、筛选、收藏排序、图标、键盘焦点、Escape、记录展开与只读查询通过 320/360/400px 正式源码 Chromium 检查，共 21 张截图；SDK 为模拟，未真实执行 Task。

**验证与包：** 必需 Node 49/49、可信设置组件 49/49、可信 Host 43/43、后台历史 22/22 PASS；额外全局来源检查被并行 AI Proxy 来源锁不一致阻断，未放宽。唯一正式包已由原打包器候选→晋升→`--check-project` 核对，版本 **0.3.13**，SHA256 `9447f6802bf00b1dfcfddf5613b82ee6fbc23f32bc92be0d2a210736c81381b4`。该包现为历史基线：Chrome 安装／打开为源对话观察；ego 经本轮用户当次确认已安装，再更新到同 ID 0.3.14。已收尾的可信控制／历史撤销围栏修复继续留在原 owner，不另建运行器。

**UI CI 补证：** 共享提交 `6fadef04c` 的 Node 49/49 与候选构建已通过；Linux Chrome 在长任务详情处因 15px 竖向滚动条误报窗口宽度。仅修浏览器测试，分别检查窗口与内容区宽度，并按内容区继续严格验证无横向溢出；本机三宽度 / 21 截图 PASS。已补浏览器测试及 fixture 的原工作流路径监听；提交 `82a34afb5` 的 [Linux CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/42514171412) 已全部 PASS：Node 49/49、Chrome 157 三宽度 / 21 截图、候选构建与晋升同源核对。正式 UI／包字节未改变，不扩展缩放专项。App CI 在跨项目 discover 配置阶段失败，未执行 Web Flow 用例，不代替 UI 结论。

**浏览器入口增量（01a1bca2）：** 源对话交接记录已观察 Chrome for Testing 149 在原 `dist/development`、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 中审阅同 SHA 包并安装打开 0.3.13；可信自动运行区域、运行与授权及三个沙箱 Tab 可见。两个固定任务显示 `E_PERMISSION: Task is disabled or not installed`，运行禁用，自动运行暂停；三 Tab 实际交互与真实 Task 未测。本对话没有重新控制已交还用户的 Chrome，该项证据来源为交接正文，不冒充本轮重测。

**ego 核心操作与最小修复（01a1bca2）：** 用户回复“确认安装并继续核心 UI 检查”后，接回自有空间 42，按已核对同 SHA 包安装 0.3.13。原生侧栏已验证脚本搜索百度 1/2 → 清空 2/2 → 概览／记录，以及收藏／可运行筛选、清除筛选、设置和可信运行入口；未用普通网页或 fixture 代替安装 UI。两个固定任务均缺少有效安装／权限，运行禁用，没有安装任务或执行旧请求。

收藏操作复现“偏好未确认保存：保存后读回不一致”，重开却已收藏。原工具用 `JSON.stringify` 直接比较读回值，对字段顺序变化误报。仅在 `main.js` 保存读回处按 JSON 内容递归比较；数组顺序、字段增删、类型和真实值仍严格检查，CAS／原请求围栏不变。现有 React 测试增加字段重排后的收藏及嵌套步骤正例、真实内容／字段／类型／数组顺序变化负例；正例修前 FAIL、修后与现有 UI／恢复检查 **48/48 PASS**，强化负例后单项 **2/2 PASS**。没有修改 Framework。

并行 owner 同时实现帮助／设置直接显示并晋升 **0.3.14**，包含本轮存储修复；本轮只读 `--check-project` 同源核对后，沿原安装器审阅 **0.3.13 → 0.3.14**，SHA `4c3d7e9db8e751b6c6a1f9e3c9f68ed06104d778c88877604994d661349d8a2f`、67,649 bytes，能力／固定任务未变。同 ID 更新保留旧收藏；取消与新增收藏正确提示“偏好已保存并读回”，收藏优先及名称排序实际变化，应用设置、可信工具设置、原页签返回和运行与授权可达。最后恢复无收藏、清空搜索并重开概览，自动运行始终暂停。

**验证缺口与下一步：** 原生记录为空，不造记录验证展开；原生 CUA 按键未使筛选浮层响应，键盘投递／Escape／可见焦点尚未证明，保留原组件级证据，不据此改产品。真实 Task 条件缺失，Run／Result／释放／聊天交付／Stop／撤权／UNKNOWN 本轮均 **NOT_TESTED**。当前 UI 检查已收尾；共享源码及正式包随后由并行 owner 迭代至 0.3.19，不继承本轮 0.3.14 原生结论。用户现已明确授权由 01a1bca2 统一提交并推送 11 个核心文件；宿主源码、预览和其他项目仍归原 owner，不自动安装后续候选或恢复延期验收。

**连续性与资源：** 01a1bca2 开始时 main／origin 为 `566b5853a3a70509c42e72c9b737531b542ce122`；原并行 AI 滚动导航 README 保留。本轮只实现上述存储比较与两项测试，其余同文件导航／提示／样式改动归原 owner。正式包由原打包链输出，本轮未另起 Browser writer、构建、修改配对或抢占其他空间。原 PID 16888 与 43119 监听已只读确认；ego 原生调试页另实读“开发服务已连接”及 revision `fc74f1aeb3ae99de5bdc9047ed1672570cf537f68ee295d0e67b5a1d7df9c70a`，不证明旧网页重新注入 SDK。扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载原 `dist/development`。空间 42 已 `finish({keep:[]})`，未升级 ego 0.6.2.8，未操作已交还用户的 Chrome。

**证据与生命周期：** [当前 UI 核心证据](../evidence/ui-core-v0.3.13-20261109.json)与[浏览器入口／K1–K8 条件](../evidence/ego-ui-core-v0.3.13-20261109.json)。源对话最后报告旧正式发布 GOAL 已 blocked，本对话未控制它；本对话核心 goal 曾因共享提交授权连续缺失而 blocked；用户已回复“允许统一提交并推送”，现按该授权完成交付，最终状态由原生 goal 工具核对，不把授权当成提交成功。保留原目标，不因交接伪报完成／暂停或恢复延期验收。GitHub 文档提交不等于安装、真实交互或任务通过。

## 当前文件核心执行卡（2026-11-08；01a1b79c）

本轮 owner `01a1b79c-85f7-7c50-8142-4e8c9840a562`。原生目标现为 **complete**：现有文件读写链已完成两组全新身份的真实读取、合法确认保存、独立读回和原聊天反馈，并修复新聊天入口身份误判。未设置 token budget；旧目标不迁移、不改状态。百度核心链已完成，不重复搜索验证。

**当前核心结果：2/2 已通过。** 从原 ChatGPT 聊天 `6af02448-0cb8-83ec-88bc-b8c6aa809310` 领取全新身份，经原发现器 / adapter / controller 自动读取、回填真实正文，发送上下文后生成提案，可信页具体确认，Native 保存并读回；两次独立磁盘全文 / 字节 / SHA 都相符。未点击手动 inspect，未从终端写业务结果。第二组在同一聊天、同一审阅 owner 内重新读取第一组保存后的版本，最终状态 `status=round2-complete / revision=2`，109 bytes，SHA256 `8030f370ebad1c814668a4d044e630d3b371a74fd3336a35e15ad43c3792131d`。最终回执保留原聊天草稿，未发送；第一组回执已逐字留存后才清空自己的草稿进行第二组。

**当前阶段与收尾结果：** 核心开发及必要验证已完成。新聊天从首页经 SPA 切换后，Sender URL 仍可能是首页，原入口因此报 `E_FILE_SENDER`；最小修复仅将官方 origin 用于 Sender 初筛，当前 tab/frame/document/正式会话精确校验保持。回归修前 FAIL、修后 103/103 PASS，独立审查批准精确 blob `3dce19043…`。新浏览器对话 `6af02b28-396c-83e8-b155-9a661467afd5` 的初始文档仍是首页、当前地址是正式聊天；无需刷新就打开审阅并领取正确来源。该入口验证未准备或执行第三组文件请求。

**运行身份与环境：** main 原 HEAD `285524e993f8b40a10a4d4aeaae88d681fd249f5`；其他 owner 的导航、AI Proxy 文档、包检查及示例改动保留。ego TaskSpace 28，实际启用 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载原 `dist/development`。初始旧产物不匹配当前源，沿原守卫恢复唯一 `npm run dev`，生成 revision `9f4f5184db15b7abea81f3346779d3ebc2e319b46fa8b7c591531b84f1ac6885`，六项相关映射同源。实际 p6 / p7 的 `Debugger.scriptParsed` 分别确认 bridge SHA `c400c7e8f496…` 与 settings SHA `3809ee902255…`，和磁盘字节一致；本轮新 UI 确实加载。writer PID 51665 随后因 Node heap OOM 退出，当前批是已加载静态 development 证据，不能冒称 serve 连接。

**Native 与夹具：** 原权限阻塞已解除，无需用户再次操作。显式 connection `3867689560319bb2b8c31231b81b5570` 的 `bridge.status` 返回 `nativeConnected=true`、原 extensionId；旧默认 `doctor` 仅核对 legacy socket，不能据此判定当前多连接 Native 离线。经原命令授权隔离 workspace `workspace-eaef3e53-d817-4a01-95b5-0304cd2dad01`，路径 `artifacts/webflow-file-loop-20261108-01a1b79c/workspace/note.txt`。初始 99 bytes / SHA `f9f76d0a32fbb6040dfaf0f2307b5be38414e263e200dbc6eb7b6390245a127b`；两次后均保留 owner、context、LF 和末尾换行。

**必要共享构建修复与最终服务：** 主干并行提交使 AI Proxy `Settings.tsx` 新字节与原锁不符，来源测试先为 5 PASS / 2 FAIL；独立审查确认仅文案 / 卡片顺序变化且无来源安全阻断后，仅同步该精确锁项 `3c9bd01a…`，原目标不扩。reviewer 整体结论仍为 COMMENT，类型环境缺口保留，不冒称产品 / 类型批准。首次构建随后在 `src/ui/react/tabs/tools.tsx` 设置视图少一个 JSX `}` 处失败；只补该字符，单文件 TSX transform PASS 后恢复构建。原路径唯一 writer PID **68082**、43119/43120 同 PID，Node 堆上限仅本进程设为 8192MB；构建及来源检查 **7/7 PASS**。浏览器实读已应用 revision `049e094b4a4b…` 并完成新入口验证；之后 watcher 的其他候选与本轮业务证据分开记录，不补跑文件或冒称同候选正式验收。

**来源与保护：** 先前 AI Proxy 9 项精确来源审查仍保留，本轮只另同步上述已审查的一个锁项，不改该业务源码。保存后原重复确认按钮禁用；关闭网页展示不改变最终回执草稿，诊断恢复隐藏、文件处理保持开启。原权限、基线、停止及 UNKNOWN 保护未改；本轮没有新跑完整 Stop / 撤权矩阵，raw Native dispatch 次数仍 **NOT_TESTED**。TaskSpace 28 已 finish，仅保留原结果聊天；最终回执逐字保留、未发送。没有提交推送。完整身份、历史阻塞、来源审查限制、回执与产物 SHA 见[本轮证据](../evidence/file-core-20261108-01a1b79c.json)。

| 条件 | 本轮必须取得的证据 |
| --- | --- |
| K1 真实运行身份 | 实际扩展路径 / ID、加载字节或指纹、Native 配对与已批准 workspace / path；源码和磁盘产物分别记录 |
| K2 原监听入口 | 真实原聊天发送、完整回答和原发现事件进入 controller；不以手动 inspect、终端或私改 storage 代替 |
| K3 准确读取 | 正文 / 字节 / SHA 与独立只读核对一致；草稿回填和模型发送分开记录，仅披露已批准内容 |
| K4 基于正文修改 | 只发送真实读取上下文，保留编辑身份及 baseSha256；拒绝历史、流式、不完整或混合 Task / 文件回答 |
| K5 合法确认 | 固定非 project 路径按具体前后全文和当前 reviewId 可信确认，确认前磁盘不变；已有 project 合同不扩权 |
| K6 保存及反馈 | saved=true、readBackVerified=true，独立全文 / SHA 相符；原聊天明确结果，最终回执仅草稿、不自动发送 |
| K7 连续两组 | 各自完整通过且 request / binding / result 全新；第二组读取当前磁盘，可信审阅 owner 按原生命周期有效 |
| K8 必要保护 | 按实际影响回归权限 / 路径 / 来源、基线变化、重复确认、Stop / 撤权和 UNKNOWN；无原始派发计数则 exactly-once 为 NOT_TESTED |
| K9 面板兼容 | 涉及入口时核对空闲隐藏、显式展开、关闭不重发、草稿 / 回执保留及未知详情可达；展示关闭不停止正式处理 |

**保全与延期：** 旧 unknown `da70fed7-d56b-467c-8648-7f081f8f7b9b` / binding `75799e57-d20d-4518-b7bb-e3bd0ce9964b` 及其聊天、草稿、文件不重放、不清账本、不覆盖。原受保护 demo.txt 开始时仍为 63 bytes / SHA256 `fd06e9aea785d77a3f29400571e76cf855520cad1a6c43262488bf530534f137`。新测试使用没有未知屏障的独立文本夹具。仅现有 main，不创建分支 / worktree / PR，不擅自提交推送或停止他人服务；业务修改归 `projects/webflow/`，无 Native 缺陷证据不改 Go。自然语言自主项目 / 未知文件发现、MCP、production、完整 CI、评分和压力矩阵继续延期。完成两组真实链及必要保护后才将目标 complete。

## 网页文件面板交互修复（2026-11-08；独立 UI 范围）

本轮重新审查正式 / 辅助 / 临时边界，不以上轮增加关闭按钮为最终设计。正式文件 adapter、首次连接、停止、回执和 UNKNOWN 对账保留；可选文本生成、手动执行与固定协议均有真实消费者。本轮退役“诊断偏好使空闲页面展开开发区”的展示和“旧版”命名，没有删除服务或数据。默认空闲不显示；显式开启网页工具入口也只出现 220×52px 小入口，点击后才展开更多操作。设置文案同步区分处理开关与展示开关。

独立复核发现并修复“诊断关闭时未知 Stop 的详情不可达”，回归修前 FAIL、修后 79 项行为 PASS；独立来源审查批准 blob `79b1f9ff03e3d79e67718e7b0a499a3fd0f5bde6`，仅更新该项 pin，目标不扩。语法、设置控件关联、3 项来源负例与本文件固定目标正向检查 PASS。完整来源正向测试仍被并行 AI Proxy `App.jsx` 来源漂移阻断。ego 实际组件 / 模拟消息边界验证了紧凑入口、主动展开、错误详情、Escape 焦点、320px 浅深色及未知 Stop 后两次轮询无派发。

**Chrome 尚未应用：** 原 writer 已退出、开发端口未监听，磁盘 source map 不同源；共享 serve 的只读预检同样在 AI Proxy 来源锁失败。没有启动已知会失败的构建、改写产物或重载聊天。保存的 Chrome 配置路径 / ID 仍为原 `dist/development` / `ccfcjegpkdlgbclopjmadlcjedelidmf`，运行客户端和页面效果未证实。下一步由 AI Proxy owner 完成其来源复核后恢复原持续开发服务，再通过原安全栅栏验证系统 Chrome；CUA 超时、Apple 事件页面脚本关闭的观察限制也已记录。具体边界、恢复顺序和证据见[本地文件说明](chatgpt-local-files.zh-CN.md#网页文件面板2026-11-08)。

写入仅该页面源、项目测试、可信设置原静态控件的两处文案、原来源门禁及测试中的对应一项 pin、本节 / 本地文件说明 / README 导航及专属证据。保留其他 owner 并行改动，不提交推送。实际文件 / Native、production 与评分没有新 PASS；下方 ego 安装、百度核心链和旧文件 UNKNOWN 的阶段与 owner 不变。

## ego 真实安装与核心链（2026-11-08）

**本轮核心链已完成，ego 普通需求搜索 2/2。** 当前 owner `01a1b764-5b8d-77f0-9a44-f72ae0f329b0` 只完成核心功能及必要真实验证。源对话 `01a1b74b-13a0-7743-9ffd-0b0a333ca834` 的目标保持上次实读的 **paused**，本轮没有改变或重启它；不恢复延期验收。

- **最新纠偏：** 用户指出之前已多次成功，不应反复测试百度脚本。复用历史证据，下一步只诊断当前 ego 安装实际超时及尚缺的普通聊天 / 关闭侧栏产品链，不重新跑全组脚本测试。
- **安装与控制：** 沿授权接管原 TaskSpace 22，没有另建空间。Web Flow 0.3.11 原安装回执保留；百度 1.1.4 已沿“核对运行证据 → 设为本地可用 → 安装确定版本”完成，目录读回“本地可用 · v1.1.4 · 已安装”。安装身份 `bc4621c4-6f52-4621-8e74-2f7e938f1fdd`、generation=1、scriptId=`task:baidu.search.top3:1.1.4`、revision=1。
- **安装材料：** 唯一正式 Web Flow 0.3.11 包 SHA256 `44a5f683a1b33c15d0b443681f0a6c9a910f55572c32f94f4820a3ef8e481ed9`，54,506 bytes。原打包器候选、36/36 包与恢复行为检查、晋升及同源核对通过；能力和委托身份未改，没有提交推送。
- **原超时及必要验证：** 只读取得原 Run `a072d899-599c-45ca-8b97-8feaa17a5a7b` 的完整 trace 与 Result `d288e36b-e7d5-43be-bd3f-e2bb53bbe19a`：输入返回，`#chat-submit-button` 点击开始后超时，无点击返回。首页命中检测确认阅读目录挡住按钮。用原拖动入口移开后，必要验证 Run `b2855f3b-62c2-463e-aa22-ac48cf2750a7` / Result `5e88d6c0-4e07-456f-a4d6-a86844a69067` 返回 `success / count=3`，completed / released；此运行仅用于安装验证，不计普通聊天两轮。
- **固定 Task：** 1.1.4 包 SHA256 `e55cc2ad83f0b62b6c5de824fd643aa07b497e527a446d9d10b3dd10a7cd8d62`；manifest SHA=`3d86dfa83de51535fef2f7a5d7ac81ec0d6905273191d1785e68881a28212bac`，源码 SHA=`14b8dd8d53484dfc527cbb710b0df27c9bc11db2c3d78f8225eedd9a46264269`。query 1–120 字，limit 固定 3，禁止额外参数，目标仅 `https://www.baidu.com`，期限 120 秒。
- **环境：** 实际启用 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 与加载路径 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development` 已从扩展详情核对。磁盘 revision `98530fe401087df05b94fad98402909d0bfea657046977881da1fb6136e40c4c`，本轮未发现 dev watcher 或 43119/43120 监听，serve 未证明连接；未核对 live revision。AutoSettings / 文件控制器源码映射落后，不能据此推断百度超时原因。未启动 writer、构建或写 Browser 输出，未改 ID / Native 配对。
- **持续授权与接入：** 通过真实 Web Flow“运行与授权”批准 ChatGPT 来源、百度首页和任务固定安装身份；允许 query 在 Schema 的 1–120 字内变化，limit 固定 3，开启自动运行。将真实生成的能力说明发送到普通新聊天一次，后续只发送中文需求，AI 自行生成全新候选。没有手动“采用”或粘贴执行 JSON。
- **首次自动失败保留：** candidate `wf-93f0c6e2-8b47-4f19-9c35-2da861e072bf`、Run `90726f7d-aebc-4f02-9790-43ab4e6dbd97` 同样在点击阶段 `E_TIMEOUT / count=0`；其持久结果、释放及失败回传均完成，AI 没有编造成功。随后将百度站点目录移至左侧，新页面恢复为 x=8 / y≈280，按钮中心命中真实按钮；原候选不重放，以全新普通需求继续。没有为此改动百度脚本或产品源码。

| 成功轮次 | 普通需求关键词 / 真实侧栏 | Run / Result |
| --- | --- | --- |
| 1 | `OpenDesk Browser`；侧栏打开 | `eb0f9f7f-b966-4239-911e-9d0f2621af5f` / `a0eb7140-7978-4341-a1bb-80f297c6db73` |
| 2 | `OpenDesk Browser automation`；发送前关闭真实 Side Panel，交付与 AI 续答后才重开 | `213d438e-e45f-4fc7-b8ee-06b2f6c6e0b9` / `9d426a98-a4fe-4d35-8e4e-b08218fad02a` |

两轮均返回 `success / count=3`；原持久账本与 Controller Run / Result 逐项核对结果值及固定源码身份一致，`execution=completed / persistence=verified / release=released / delivery=confirmed / aiReplyObserved=true`，Worker 均已 retired。原聊天真实展示标题、链接、摘要并完成续答，第二轮复用相同安装和关键词范围，无重装或逐词批准。搜索结果包含同名及 OpenClaw 内容，AI 明确指出相关性有限，没有冒称属于本项目。

**最低防误触发检查：** 在同一聊天依次发送普通闲聊、明确“不执行”、要求“五条结果”，三次均无任务候选；五条没有静默改为三条。结果消息及三条检查均未新增请求；重开侧栏读回三条原请求（一次失败、两次成功），没有重跑或补发。这里只证明可见消息与账本，raw dispatch exactly-once 继续 **NOT_TESTED**，不扩展为撤权/故障注入矩阵。

**收尾与使用：** [当前结果聊天](https://chatgpt.com/c/6aef78a7-6c40-83ec-a189-831eec649921)已完成一次接入，继续发送三条自然结果的普通搜索需求即可。TaskSpace 22 已 `finish({keep:['p4','p3']})`，仅保留结果聊天和逐字恢复的 488 字未发送草稿；真实侧栏已关闭。发现草稿后先保存，未误发原内容；旧文件 UNKNOWN、旧聊天草稿及 fixture 均未操作。

本轮证据统一维护在 [ego-core-20261108.json](../evidence/ego-core-20261108.json)，不建立平行总计划。MCP、自然语言文件发现、production、完整 CI、评分、版本及压力矩阵继续延期。main 上公共侧栏及文件业务并行改动保留；接收 owner 只更新本项目 README、本节和原证据，未修改配置、正式包、源码、来源 pin 或 Browser 输出，没有提交推送。前一 owner 的包准备及检查作为历史证据保留，不重复运行。

## 百度怎么测、成功看哪里（2026-11-07）

1. Chrome → OpenDesk → 扩展 → Web Flow → **运行与授权**：在“任务授权”复用有效批准，确认自动运行开关已开；缺少范围时走原审阅，不重复批准有效范围。
2. 在“使用说明”复制一次能力说明到普通新聊天；原已接入聊天直接发普通需求，**无需每轮 JSON**。验证后台运行时，在新需求发送前关闭侧栏，结果交付后再重开；也可保持侧栏观察。
3. 先发送第一条；要验证换关键词，完成后再发送第二条：

> 请用百度搜索 OpenDesk Browser，返回前三条自然网页结果。
>
> 请用百度搜索 OpenDesk Browser automation，返回前三条自然网页结果。

**成功看哪里：** “当前任务”核对“已完成”、同一 Run / Result 的持久结果及“已释放”；原聊天核对三条真实网页结果与 AI 续答。沙箱“记录”只含手动请求，空记录不能判自动任务失败；raw dispatch 次数仍 **NOT_TESTED**。

- **已完成：** [最新可视复测 01a1b64a](../evidence/visible-retest-20261107-01a1b64a.json)百度 **2/2**、固定文件 **1/2**；文件第一轮保存及独立读回相符，最终回执仅草稿、未发送。
- **仍阻塞：** 文件第二轮原请求仍保留回填 `unknown`，尚未读取或写入。本轮只读核对时，原聊天标签页和可信审阅页已不在列表，不能换文档补跑；原测试文件仍为第一轮正文。
- **延期：** 自然语言文件发现、MCP、production、完整 CI 与当前整体评分；本批开发指纹曾变化，不算同一冻结候选验收。

**回填修复（源码已验证，Chrome 未应用）：** 原输入框缺失时，可信回填函数明确返回 `NOT_DISPATCHED`；控制器现在保存这项失败依据，并允许用同一请求、同一提示词再次手动填入。超时、失联、插入后核对失败及旧 unknown 仍不重放；没有清除旧账本或换身份。当前开发产物未包含该改动，原生第二轮仍未完成，见[本轮恢复证据](../evidence/prompt-recovery-20261107-01a1b688.json)。

以下 UI 增量保留其独立范围；01a1b5f2 的 2+2 与 2026-11-06 的 0/2 均为历史批次，不能覆盖本卡最新复测。

> **当前源码交互预览与主页收尾（2026-11-07；组件 / 预览范围完成）：** 原唯一预览现从当前工作区的真实 Shell、可信组件及沙箱应用重建，移除历史 Git UI 与预览专用排版补丁；102 项源码 / 依赖输入、完整交付 HTML 及内嵌源码相互校验。当前候选 `9022d3736c8e…`，HTML SHA `16647c5fa137…`。Git 提交号仅为 manifest 历史元数据，无关提交不再使未变的预览失效。见[可操作离线预览](../preview/webflow-v0.3-preview.html)。
>
> 本轮将真实主页的手动任务指标 / 原因入口归组，刷新同行，教程默认折叠放在最近手动结果之后；导航及帮助 / 设置保持 44px 热区。可信主页明确“消息检测就绪”，关闭自动运行时显示“不接收新任务”；查看进度定位当前状态，停止入口只定位原请求取消按钮，保留原确认与执行边界。授权草稿、UNKNOWN、具体错误及断线恢复继续保留。没有修改 Task、文件、监听业务或 SDK / Authority。
>
> 组件 / 恢复及预览联合检查 **86/86 PASS**，随后预览完整性与 Git 元数据回归 **3/3 PASS**。ego(lite) 使用真实源码与模拟边界验证 320/360px、浅 / 深主题的 **40 个状态场景**，无横向溢出；四组各五次轮询均 0px 位移，键盘 / 触摸 / IME-Esc、焦点、草稿、原停止和模拟批准通过。最终 file:// 入口通过；产品文档 SHA 与上述浏览器矩阵逐字节一致。新的独立 UI 复评 **96/100**（非继承上一条历史评分），完整扣分及范围见[本轮证据](../evidence/home-preview-20261107.json)。独立代码复审的两项预览完整性问题已修复并复核关闭。
>
> **仍未应用到日常 Chrome：** 本轮两项精确来源 pin 匹配，公共来源检查 **2 PASS / 1 FAIL**，正向 bundle 仍被并行 AI Proxy `App.jsx` 来源漂移阻断。只读重查发现 `dist/development/ui/tool-shell.js.map` 两份组件仍不等于当前源码；原 PID 26234 writer 保留，没有覆盖、重载或操作未发送文件回执。正式包未更新；系统 Chrome、安装升级、Native、production、读屏及完整 Tab 焦点遍历 **NOT_TESTED**。本条仅更新独立 UI / 预览结果，下方业务目标、原生生命周期和延期事项不变。

> **主页信息层级与按需解释（2026-11-07；独立 UI 开发完成）：** 主页保留自动运行、监听状态及必要动作；长解释和维护操作移入默认关闭的原生详情。待批准、未知、具体错误、断线恢复及进度 / 停止入口保持可见。原沙箱教学步骤默认折叠，最近运行更早出现；概览正文及关键触控尺寸增大。手动“重新检查”会加入当前只读检查并给出反馈，轮询不改变详情开合、焦点或页面位置。写入仅原可信 UI、原沙箱展示、对应组件夹具/测试、两项来源 pin 及本条证据；不接管文件或后台 Task 业务。
>
> 最终组件与受影响恢复检查 **83/83 PASS**；ego(lite) 真实 Shell / 组件 / 沙箱源码、模拟 Host 边界下，320/360px 的 20 个状态场景无横向溢出，详情开/合四组各 5 次轮询均 **0px** 位移。键盘 / 触摸 / IME-Esc、焦点恢复、授权草稿保留及手动检查反馈通过。独立 UI 复评 **96/100**，独立代码复审无阻断；初评 92 为历史，评分不代表业务或发行验收。见[最终证据及完整评审](../evidence/home-status-hierarchy-20261107.json)。
>
> **尚未应用至日常 Chrome：** 本轮两项精确来源 pin 与源码相符；共享来源测试 **2 PASS / 1 FAIL**，正向 bundle 检查仍被并行 AI Proxy `App.jsx` 来源漂移提前阻断。现有 `dist/development` 两份相关 source map 与最终源码不一致，保留原 writer / ID 与未发送草稿，不覆盖、重载或补发。沙箱正式包亦未进入更新阶段；最终系统 Chrome、安装升级、Native、production 与读屏 **NOT_TESTED**。本条仅完成当前 UI 源码 / 组件范围，不改变下面百度和文件目标、生命周期或延期事项。

> **主页状态稳定性修复（2026-11-07；独立 UI 范围）：** 用户反馈系统 Chrome 中自动运行 / 监听状态区域持续闪缩。已在原可信 `AutoSettings.tsx` / `CurrentTask.tsx` 复现：每 1200ms 的只读检查反复设置可见 busy，临时插入“暂不能刷新”正文并禁用按钮。现将后台 polling 与前台 busy 分开，恢复提示只随真实恢复条件变化；最终刷新确认仍等待检查结束，上下文失效、超时、UNKNOWN 和迟到回包保护保留。写入范围仅这两份组件、原组件测试、`bundle-provenance.mjs` 中对应两项精确来源锁及本条证据；并行文件业务不由本轮接管。
>
> 组件与来源检查 **52/52 PASS**，新增回归修复前两项失败、修复后通过。ego(lite) 使用实际 React 组件及 Tokens、模拟控制器测量：修复前下方内容周期位移 **22.59375px**；修复后 320/360px 宽度各 5 次检查均为 **0px**，且真实状态变化仍及时显示。独立原生代码复审未发现阻断；原 watcher 已发布 `dist/development` revision **`0c55bfa3a4bd…`**，两份组件 source map 逐字及产物 SHA 核对通过。修复后系统 Chrome 实际加载与 production **NOT_TESTED**。详见[本轮证据](../evidence/home-status-stability-20261107.json)。此条不恢复或改变下面百度 / 文件任务的原生目标与阶段。

> **历史执行结果（2026-11-07，01a1b5f2）：百度 2/2，固定文件原监听读写 2/2。** 已依次完成两次全新普通百度需求的完整提示词、AI 候选、原监听、真实搜索、同 Run 保存/释放、原聊天唯一发送及 AI 续答，实际侧栏关闭；随后完成两组不同对话及全新 request/binding 的固定文件读取、真实上下文生成编辑、原监听接纳、可信页具体确认保存、独立磁盘全文/SHA 核对与最终回执草稿。最终文件回执未发送。普通自然语言自主项目发现、MCP、production 与全量 CI 继续延期，不自动进入后续验收。
>
> **本轮已复现与最小修复：** 原安装百度 v1.1.4 经同源码正常开发验证后恢复安装及原授权，generation=4。新普通需求由原监听自动进入后台，侧栏关闭，Run `e65cbd3d-cc61-48ab-8f65-8f4fe2ff60ad` 实际因 `E_TIMEOUT` 停止并释放，未交付，之后由可信入口取消后续回传；不重放。通用 `web-task-ingress` 固定 30 秒与已安装 manifest 的 120 秒不一致，现改为原 Authority 读取当前安装期限并逐字段核对 pin；期限、身份及原防重/撤权/交付定向测试 **83/83 PASS**。修复后新请求 `dea16a95…` / Run `560fa58b…` 与 `c5a823d5…` / Run `53ce6c9e…` 均完成、持久化、释放、原聊天各交付一次且 AI 续答，原始 typed JSON 已由正式 UI 下载并核对 SHA。原旧 `wf-7bc39908-2fd8-4a82-9de5-4f3aa1a0afb1` 继续只读保全。该批现场身份及进度见 [历史批次证据](../evidence/baidu-prompt-loop-20261107-01a1b5f2.json)。下方 2026-11-06 执行卡为上次状态；当前以顶部 01a1b64a 可视复测为准。

> **文件业务最新目标（2026-11-07，01a1b5ac）：** 本轮先贯通固定文件协议的原监听链：真实发送与完整回答发现 → 现有 adapter/service/controller → Native 读取 → 草稿；编辑提案仅经可信页具体确认后写入，核验 saved 与独立全文/SHA，再用新身份复测。自然语言项目发现、MCP、production 与全量 CI 延期；旧高级页 poll 成功不能作为本轮证据。

> **本地文件历史进度（2026-11-07，01a1b5f2 实测）：** [固定协议接线方案](protocol-execution-chain.zh-CN.md#当前文件接线方案2026-11-0701a1b5ac设计评审通过浏览器验证进行中)已在真实系统 Chrome 完成 **2/2**，详见[新文件证据](../evidence/file-prompt-loop-20261107-01a1b5f2.json)。读取回填成功后，长用户消息追加的省略号/展开控件使原 discovery 的整节点文本基线变化，编辑未接纳；固定结果单段化并未单独解决此断点。现统一使用原发送见证的精确用户正文比较，保留正文空白、节点/稳定 ID、历史、唯一回答与授权保护。相关原监听/文件桥 **138/138 PASS**，独立定向源码复核无阻断；两轮真实保存均取得 saved/readBackVerified，磁盘全文及 SHA 独立相符（75 bytes），最终回执保留原聊天未发送草稿。系统 Chrome ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，路径 `dist/development`；同一 watcher 当前 PID `26234`，最新相关产物 `ca505a945672…` 的 discovery source map 与源码逐字一致。旧 writer 因 OOM 退出后才恢复同一路径服务，无第二 writer、无 Native 配对/Go 变更。旧失败与未发送读取草稿保留，不重放；旧百度 unknown 不重发。全部在 main，不提交推送、不建分支/worktree。前期实施、评审与历史测试仍见 `evidence/file-listener-site-20261107-01a1b5ac.json`，不作为本轮产品评分。

## 后台 Task 当前执行卡（2026-11-06；接续时先读）

> **历史执行卡（2026-11-06 至 2026-11-07 入口恢复阶段）：** 以下 0/2、运行时拒绝、待操作及目标生命周期均保留当时观察，不是当前指令或当前实读状态；最新百度 2/2、固定文件 1/2 及下一步以上方使用与状态卡为准，不恢复旧阻塞或延期验收。

### 用户目标与任务拆分

**这次要做成什么：让 ChatGPT 能调用已经安装、已经授权的百度搜索任务；关闭 OpenDesk 侧栏后，任务仍会完成，并把真实结果送回发起需求的聊天。**

用户的使用过程是：

1. 首次使用时，完成必要的能力说明和权限审阅，让 ChatGPT 知道有哪些可用任务，让 OpenDesk 知道允许执行什么。
2. 以后只在 ChatGPT 正常说：“请用百度搜索 OpenDesk Browser，返回前三条自然网页结果。”用户无需填写任务编号、协议或复制 JSON。
3. AI 生成任务指令，OpenDesk 核验后自动操作百度网页：填写关键词、提交搜索、读取结果。侧栏关着也继续工作，无需再点“采用”或“执行”。
4. 系统保存三条结果的标题、网址和摘要，释放本次运行资源，只向这次需求所在的原聊天交付一次。重开侧栏时可以查看同一结果。
5. 再提出另一条已获准范围内的搜索需求，仍能使用同一任务，不必重装或逐个关键词重新批准。

**现在还没做成。** 本轮要求完整演示两次，上述过程尚无一次全部满足，记为 **0/2**。这是“两次完整使用的计数”，不是全部开发工作的完成百分比。旧版本在侧栏打开时的成功记录，不能证明本轮关侧栏的要求已通过。

#### 工作分成三个交付阶段

| 交付阶段 | agent 要完成的工作 | 怎样才算交付 | 当前状态 |
| --- | --- | --- | --- |
| 一、恢复可以正常发起任务的入口（T1、T2） | 核对已安装任务，处理当前拒绝执行的原因；完成测试聊天的一次能力说明、页面监听和必要授权。 | 读回任务可用、当前聊天监听及有效授权；普通需求的自动触发留到第二阶段实测。 | 未完成：安装已确认，自动执行入口仍被运行时检查拒绝。 |
| 二、完整跑通第一次使用（T3、T4） | 关闭侧栏，发送第一条普通需求；核对真实搜索、保存、原聊天交付，再重开侧栏查看。 | 下方条件中适用于第一次的部分全部满足，完整使用计数变为 1/2。 | 未实测。 |
| 三、证明任务可以重复使用（T5） | 第一次成功后，换一个已获准的关键词，完整重复第二阶段。 | 第二次也满足全部条件，完整使用计数变为 2/2。 | 未实测。 |

**记录和保护检查贯穿三个阶段（T6）**，不作为一个独立的用户操作阶段。每次实际失败只修对应问题，并做相关的最小验证。

#### 原生目标与关键测试条件（2026-11-06）

用两条独立新需求验证，例如先搜索“OpenDesk Browser”，第一次全部成功后再搜索“OpenDesk Browser automation”。每条都必须满足下方适用于它的条件；第二条另验证换关键词复用。不能把两次各通过一半拼成一次成功。

| 条件 | 用普通话说明怎样判断通过 |
| --- | --- |
| K1 任务确实可用 | 使用的是真正安装、验证并获准的任务，正常执行入口不再被当前运行时检查拒绝。 |
| K2 用户只说需求 | 完成首次接入后，只发送普通搜索需求；由 AI 生成有效指令，系统自动接收，无需用户每轮拼装或回显固定 JSON。 |
| K3 侧栏关闭也能做完 | 在发送需求前关闭实际侧栏；直到搜索、保存、释放运行资源、原聊天收到结果都结束，一直不重开侧栏。 |
| K4 结果是真的、对应本次搜索 | 观察百度首页的填写、提交和结果展示；逐项比较本次网页与保存的三条标题、网址、摘要，按现有清理和截断规则一致。仅显示“完成”或“三条”不算通过。 |
| K5 送对地方、只送一次 | 这轮真实结果实际进入发起需求的原聊天一次，没有发到别的聊天，也没有覆盖用户草稿、附件或输入法编辑。发送结果不确定时不补发。 |
| K6 查看不会重跑，换词还能用 | 每条完成后分别重开侧栏，只显示该次原记录，不新增搜索或发送；第二条还须证明换获准关键词可以复用同一任务，无需重装或逐词批准。 |
| K7 出错也保留保护 | 权限失效或撤销后不能继续越权；同一请求不重复执行；执行或发送结果不确定时保留原记录，不自动重试。相关来源、身份及互斥保护保持有效。 |

**什么时候结束：** 两条需求分别满足以上条件，才算本轮核心功能完成，并将原生目标标记 complete。文档、源码、Node 测试、构建和安装准备都不能增加 0/2 的分子。当前核心阶段不自动扩展到 production、完整 CI、压力测试、跨浏览器矩阵、95 分评分、跨日/跨对话编排或 MCP 完整验收。

#### 现在差什么、谁来处理

**已经确认：** 原系统 Chrome 的“我的”中确实安装了百度任务 v1.1.4。此前“安装回执未知”的问题已通过原界面读回确认，不再重复安装来猜结果。另有一次侧栏打开时的开发验证完成并释放资源，返回三条；它没有证明关侧栏的全流程，也未逐项核对三条正文。

**当前卡住：** Web Flow 自动执行入口报告“内置运行时已改变或旧版本未记录身份”，拒绝使用现有批准。下一步由 agent 从原版本/验证入口核对任务记录与当前运行环境，再沿正常验证、安装和授权流程恢复。尚未读出两份身份的实际值，不能断言根因，更不能跳过检查来制造成功。

**上次真实界面观察（2026-11-06，非本轮当前状态）：** 原 Chrome 已显示可用的 ChatGPT 首页和 OpenDesk 侧栏，agent 在空闲时取得窗口租约，通过现有“我的 → 更多操作 → 打开本地任务目录”恢复入口。已确认旧版 v1.1.4 仍安装，且当前授权仍被运行时检查拒绝；随后只导入同源 v1.1.5，目录读回“待验证”，未运行、未安装。当时开发服务已连接，实际显示指纹 `3534b57386f4…`；后续原 writer 与端口监听未找到，不能沿用当时连接状态。完整使用仍为 0/2。

**现在只确认开发入口（2026-11-07 用户纠偏）：** 用户回答“不知道，怎么感觉严重缺失。开发大概是 sidepanel 里面的开发 tab、本地项目。”这既不证明草稿已载入，也不证明从未运行；不能继续索要尚无依据的 Run ID。本次是单文件 Controller，入口为 **Side Panel → 开发 → 关闭「本地项目」开关 →「直接编辑」与源码框**。现在只请用户确认这两项是否出现，不点「运行」、不导入覆盖、不启动目录 CLI。原文件选择器的草稿交接继续记 UNKNOWN；扩展页观察拒绝没有合法恢复证据，agent 不经其他通道读取该页面。此配合用于恢复受工具限制的开发现场，不作为正常 ChatGPT 使用的每轮步骤。

静态核对发现，`src/ui/local-project.js` 会保存并恢复 `localMode`，公开本地项目文档中“每次默认关闭”的文字与当前源码不一致，不能假定用户现在处于直接编辑。`src/ui/react/tabs/develop-editor.tsx` 定义「本地项目」开关与「直接编辑」标题；`src/ui/script-editor.js` 当前把直接编辑按钮标为 **「运行」**，本地模式标为「运行本地项目」。此前笼统使用“运行草稿”的叫法不足以定位按钮。这里只证明当前源码和公开路径，未读取实际扩展页面，也未确认已加载产物。

入口确认后的后续验证仍为：确认“开发”页已载入 `baidu-search-top3.js` 的同源 Controller 草稿，并先查清是否已有本次 Run；只有明确尚未运行，才在本任务百度首页用参数 `{"query":"OpenDesk Browser","limit":3}`、期限 120 秒明确运行一次。完成并释放资源后取得完整运行 ID，再在本地目录选择 v1.1.5，用该 ID“核对运行证据”。成功后才沿原“设为本地可用 → 安装确定版本”审阅链继续。未取得回执或报错时保留原记录，不重复运行；这次是前置验证，不计入两次关侧栏的业务使用。**此刻不要求用户执行这段后续操作。**

#### 接收对话本轮核对（2026-11-06；01a1b109）

- **原生目标：** 接收对话 `01a1b109-87b7-7b63-b155-3e9fd9ce3adc` 已按用户要求创建完整目标，包含三个交付阶段、K1–K7 和两条分别通过的完成条件；未设 token 预算，完整使用仍为 **0/2**。源对话目标仅保留交接时的 active 观察，本轮没有修改其生命周期。
- **当前生命周期：** 同一扩展页观察拒绝及前置验证回执缺失已连续出现在至少三轮本目标执行中；合法独立核对完成后仍无法执行下一条用户操作，原生 `update_goal` 已返回 **blocked**。完整目标保留；取得原界面真实回执或工具合法恢复证据后续接，不循环重试被拒通道。
- **前置材料已核对：** 磁盘 v1.1.5 候选的 `sourceUtf8` 与 `examples/tasks/baidu-search-top3.js` 逐字节一致，源码 SHA 仍为 `14b8dd8d53484dfc527cbb710b0df27c9bc11db2c3d78f8225eedd9a46264269`。相对正式 v1.1.4，仅版本和相应 manifestHash 不同；站点、权限、Schema、120 秒期限及源码未变。这不证明当前浏览器绑定身份或验证通过。
- **服务记录已失效：** 本轮 `ps -p 68812` 未找到原 PID，`lsof` 未发现 43119/43120 的监听。当前实际加载路径、serve 客户端连接和浏览器运行时身份均未重新读取；不把历史“已连接”当作本轮事实，也未另启 writer、覆盖输出或重载扩展。
- **仍待真实回执：** 原开发草稿交接是否成功、是否已发生验证 Run 均未获得新回执。已请求用户在现有原界面确认同源 Controller 草稿；仅明确尚未运行时在本任务百度首页以原参数、120 秒运行一次并回报完整 Run ID、终态及 released。不确定时只回报提示，不重复 Run。扩展页访问拒绝没有新的合法恢复证据，本轮没有尝试其他观察或控制通道，也未发送业务需求。

### 当前操作与环境

以下是供执行者续接的技术记录，不要求普通用户填写或理解。环境和界面状态均为上次观察，实际恢复时重查相关项；本卡只覆盖后台 Task，ChatGPT 本地文件业务继续由原 owner 维护。

- **本轮范围与归属：** 核心功能与最小必要验证；业务根 `projects/webflow/`，工作区 `/Users/shopme/Documents/workspace/opendesk-browser`。本次可读性修订只涉及本执行计划、项目 README 的发现入口和原证据 JSON；不改产品源码，不改变 2/2 完成标准。
- **运行时拒绝：** Web Flow v0.3.9 刷新授权报 `E_BUILTIN_VERSION_UNAVAILABLE`，旧精确批准保留但不能通过当前准入检查。这是固定编译运行时身份保护；不得将其改成官方 Catalog 发行版本/SHA 匹配要求，也不得放宽它。尚不能由此推断已安装任务本身或后台 RunHost 已损坏。
- **下一条具体操作：** 先按上方 2026-11-07 纠偏确认「开发 → 直接编辑」入口，不运行。随后只读核对草稿及已有 Run，再在合法可访问的原任务详情/版本验证入口比较 `baidu.search.top3@1.1.4` 绑定的运行时与实际加载身份。安装事实已确认；只在必要时沿原 Candidate → Verification → Available → Installed 链处理新版本，随后恢复有效批准，再接入新的测试聊天。临时候选 v1.1.5 已通过原目录导入并读回待验证；没有新的验证 Run、可用或安装回执，原 v1.1.4 安装保留。
- **入口的最新观察：** 原 Chrome 已显示 ChatGPT 首页的账号菜单和侧栏；目录 tab `560070231`、本任务新建百度首页 tab `560070232`。侧栏原 host 为 `bb35305b-d097-4605-94cd-487566c826fd`，目录 host 为 `8f6a9954-2779-43ce-83c4-4d9c54999cb2`。JS 文件选择器点击“打开”后，只能读到原窗口的 `workerRetired` 查找栏，不能确认源码交接；截图工具报大小错误。随后对已打开目录的定向绑定被 URL 策略拒绝观察，明确禁止替代通道绕过；自此停止扩展页面自动观察/操作。该读取拒绝不同于先前仅导航失败，不再以重复打开入口为恢复条件。已释放自有 UI 租约。
- **可选本地项目路径：** 本地 CLI 包/登记一致，原 Native 连接报 `E_NATIVE_NOT_READY`。这只限制本地项目 provider；只有选择该路径时才处理连接，不将它变成已安装 Task 的通用前置条件。
- **关键词复用：** 遵守[现行产品合同](product-contract.zh-CN.md#任务范围授权与可变化的业务输入2026-11-04)。可以一次审阅允许 `query` 在已安装 Schema 内变化，固定目标、`limit:3` 和安装身份。历史“仅此关键词”批准必须先经可信 UI 转换并审阅一次，不能静默扩大，也不授权其他任务的任意参数变化。
- **每次应保存的证据：** 唯一 candidate → request → Run → Result，精确来源聊天/tab/document、安装和授权身份、侧栏关闭至交付的时间线、后台/Offscreen RunHost 归属、三条真实网页与持久结果比对、资源 released、原聊天单次交付、重开后 Run/交付次数不增加。T1 对应 K1，T2 对应 K2，T3 对应 K2–K5，T4 对应 K6，T5 重复全部条件，T6 贯穿 K7；不凭另一个候选的 PASS 补证。
- **开发环境：** 日常输出固定 `dist/development`，复用已有 serve/writer；恢复时核对真实加载路径、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、连接及所需运行身份。不另起 writer、不覆盖输出、不停止别人的服务。持续开发、静态开发包和 production 证据分别记录。
- **并行与写入：** 只在现有 main 工作，不创建分支/worktree/PR，不提交、推送或发布。保留共享页面桥、后台 adapter、文件路由、README、执行计划及 provenance 的并行改动；实际重叠只暂停受影响部分。不抢占共享原生 UI，不发送未授权的跨对话协调消息；窗口阻塞不妨碍独立必要工作。
- **执行边界：** 复用原 SDK、Authority、账本、RunHost、Controller、安装器及受控 Chat，不新增执行/授权链或提权沙箱；保留真实来源、原生发送见证、安装身份、权限/撤权、固定源码来源、去重、文件/网页 Task 同轮互斥和 UNKNOWN 不重放。没有新失败、改动或证据失效时不重复测试/构建，不用循环查询或补报告代替真实使用验证。
- **旧 UNKNOWN 禁止重放：** `wf-084e05c5-0230-44fc-9ecb-4f94cea6e759`、`wf-8d7c2a91-4e63-4f20-a85b-91c6e3d702bf`、`wf-015d0f5e-ade3-4aea-95b5-b4093a67c471`、`wf-9c6d4f2a-7b81-4e35-a920-6f1c8d3b5e74`，不重发、不补跑、不补发结果、不换 ID 补偿同一未知业务。
- **进展与交接：** 先报完整使用 n/2、当前用户操作、实际失败或下一步。用户最新阶段优先于历史计划。只有明确要求时才创建新对话；首条交接须独立保留目标、阶段、计数、下一步、禁区和并行保护，按个人 thread-handoff Skill 同文创建并读回。创建对话不等于目标完成、暂停或转移；原生目标状态以工具实读为准，不手改应用数据库。
- **唯一证据入口：** [本轮身份及观察边界](../evidence/core-flow-20261106-01a1b02e.json)；既有安装恢复增量见[第 12.28 节](#1228-后台核心链续查与当前运行时-task-恢复2026-11-06)。源对话原生目标正文的旧“安装未知”已由上述实读安装事实更新解释；未改写源目标。接收对话按用户本次明确要求创建自身完整目标，不以目标创建代替业务完成。

> **固定检索词：`OD-AI-WORKFLOW-BRIDGE`。** 本文件是 Web Flow 的唯一进度与执行入口，后续新对话从本文件恢复，不再按对话创建平行总计划。
>
> **当前项目入口：** [projects/webflow/README.md](../README.md)。2026-11-01 按用户要求将 Web Flow 归为独立业务扩展应用，完整产品合同与本执行记录迁入项目 `docs/`；旧路径仅保留跳转。目录调整记录见第 8 节，原始源码审计及验收边界保留。
>
> **ChatGPT 本地文件（2026-11-06）：** 固定可信源码归 `projects/webflow/trusted/`，复用原 Native 文件及具体对话项目授权，非已安装 Task。同轮互斥限于当前可识别的需求和协议，手动文件入口的意图检查正在收尾。当前新候选真实 Chrome / Native 读写和安装运行 **NOT_TESTED**，当前产品 **NOT_SCORED**；[本地文件文档](chatgpt-local-files.zh-CN.md)记录当前源码、手动步骤和完整历史证据，旧候选结果不自动继承。
>
> **旧阶段索引（历史）：** 第 12.11 节记录第一阶段自动运行 UI 与原触发接线、v0.3.4 源码/组件证据，不是当前后台 Task 的最新状态。当前阶段、完成度与下一条操作以顶部“后台 Task 当前执行卡”为准。下列方案、历史搜索、离线队列与 V0.3.1 包级记录保留各自证据等级，不转记为本轮 Chrome 通过。
>
> **执行者：** 实施时按仓库现行 `.agents/workflows/extension-creation.md` 和对应 owner Skill 逐任务推进；可用时采用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`。同一文件及公共合同只有一个写入 owner，只读复核可以并行。

**长期产品目标（本轮仅执行顶部执行卡范围）：** 用户把研究/开发任务交给 OpenDesk 后，可以依次完成搜索、AI 输入输出、当前或新对话交接、仓库核验及有边界的连续执行；数日后能够找到并恢复准确断点。

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
| FIFO 和对应回复栅栏 | `node --test projects/ai-send-queue/tests/engine.test.mjs` |
| 输入恢复、草稿和用户入口 | `node --test projects/ai-send-queue/tests/main-recovery.test.mjs` |
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

### 12.10 本轮 installed-task MCP 实施与真实证据（2026-11-02）

**独占目标：** 官方 ChatGPT 通过 MCP 对本机已经安装并已授权的百度 baidu.search.top3@1.1.1 发起受限任务，原结果通过同一 MCP 调用或原会话 result(operationKey) 返回。本轮未接管 V0.1 Bridge、V0.2 编排队列、V0.3 UI、Task Shop 或现有 Task/Authority/RunHost。

**已提交的增量源码：**

| 路径 | 本轮已实施 | 实际边界 |
| --- | --- | --- |
| [installed-task-mcp.mjs](../src/adapters/installed-task-mcp.mjs) | opendesk.webflow.start({operationKey,query}) 和 opendesk.webflow.result({operationKey}) 的严格工具参数与错误处理，主体/原会话命名空间、幂等、UNKNOWN、一次许可和持久记录接口，复用 serveMcp | 没有可信调用者 provider / 原子关联 store / Native 安装 CAS，默认 stdio 启动只能安全发现工具，不能实际派发 |
| [native-installed-task.mjs](../src/adapters/native-installed-task.mjs) | 固定 baidu pin/schema，复用 requestAgent；验证 task.list、目标、Native envelope、request.get 和 run.get；Controller Codec 解码、结果身份/投影字段白名单 | 不扩展任意脚本/Native 方法；没有绕过 Authority；真实 Go 与安装包仍待核对 |
| [installed-task-mcp.test.mjs](../tests/installed-task-mcp.test.mjs) | 输入/冒充/重复/跨会话/撤权/丢 ACK/原生回复/结果白名单的定向离线测试 | 单测中的 mock store 和 mock CAS 只为测试，绝非可上线持久设施或可信身份来源 |

源码 GitHub 提交顺序：0ddf6edd（Native 适配），e10f7e8c（MCP 受限入口），c417a866（测试），862dea7a（MCP 侧效应声明和 pin 验证），fe756050（测试预期修正）。文件全部在 projects/webflow/，无其他 owner 代码修改。

**当前定向测试证据：** 本轮通过 GitHub 连接读取已提交文件，在独立 V8 环境用注入 mock 的语法/行为检查，17/17 逻辑用例通过。V8 检查通过移除 ESM import 并以 stub 替代 Node/Native/Codec 的依赖，**不等于真实 Node 22 测试，更不等于 Chrome/Tunnel 验收**。实际仓库 node --check、node --test projects/webflow/tests/installed-task-mcp.test.mjs、stdio MCP Inspector、真实 ChatGPT MCP、Mac Chrome/Native 均未执行；因此不标 COMPONENT PASS。

**三个正式接线 BLOCKED 及公共 Owner 最小接口：**

1. MCP-CALLER-CONTEXT：native-agent/local-dev/mcp.mjs 的 serveMcp tools/call 当前只将 (tool.name,args) 传给业务 dispatch，不提供来自已认证传输的 caller 和原 conversation；clientInfo、_meta、模型自报会话和 JSON-RPC ID 都不能授予权限。由 MCP/Transport Owner 审核加入可验证调用身份/会话上下文（不允许直接信任原始参数），并给出跨会话与缺失身份回归。当前 getTrustedContext 没有合法生产 provider，start/result 均 fail-closed。
2. MCP-DURABLE-ADMISSION：service-worker.js 已有 Native admission ledger，但没有 MCP principal/conversation/冻结原封套与批准预算的原子持久关联。由原批准的存储/Authority Owner 提供 read(scope)、reserveAndConsume({scope,fingerprint,proposed,grant})、attachAck({scope,runId,revision,executionTarget}) 的受审持久事务合同。reserveAndConsume 必须同一原子事务写完整原始请求和消费 maxAdmissions=1；attachAck 必须 CAS 检查原 requestId/run 身份。当前仅有调用方 port，没有真正实现，不用进程内 Map 或第二套数据库代替。
3. NATIVE-INSTALLATION-CAS：src/native-agent/host-adapter.js 的 installed-task run.start 接受 taskId/version/sourceHash，解析当前安装后才把 expectedTaskGeneration/expectedTaskInstallationId 给 Authority，无法对 MCP grant 中冻结的旧 generation/installationId 做同一次 admission 的原子比较。由 Native/Authority Owner 提供最小可信 CAS（不能让模型自报授权代次），同版本/同 hash 的卸载重装也必须拒绝并测试。当前 Native adapter 没有声明 atomicInstalledTaskPin 能力，投影因此拒绝真实派发。假 CAS 仅用于离线逻辑测试。

**附加现场前置：** 历史 Go Native task.list 有连接关闭/allowlist 缺口；需现场核验当前二进制或经批准等价安装核验。实际 ChatGPT/Tunnel 写工具资格、Native 配对和当前百度 Host/document/权限仍未知。B Demo 必须先与 C Bridge Owner 协调撤销匹配的待准入/一次预批准并核对回执；跨入口尚无共同去重锁，UNKNOWN 不允许切入口再执行。

| 证据层 | 本次状态 | 含义 |
| --- | --- | --- |
| SOURCE_IMPLEMENTED | PARTIAL_COMMITTED | 三个新文件真实提交，安全调用方适配可复用；公共能力缺失导致真正执行 BLOCKED |
| COMPONENT_TESTED | PARTIAL_OFFLINE | V8 shim 17/17；原始 Node 测试 / stdio 与真实集成 NOT_TESTED |
| MCP_CONNECTED | NOT_TESTED | 无真实账户/Tunnel 调用 |
| CHROME_NATIVE_VERIFIED | NOT_TESTED | 无本轮 run.start/run.get 原生回执 |
| BUSINESS_VERIFIED | NOT_TESTED | 无本轮真实百度网页动作和自然结果 |
| DELIVERY_VERIFIED | NOT_TESTED | 无原 ChatGPT 对话的正式 MCP 结果及 AI 续答 |

**唯一下一步：** 本地 Codex Owner 先以现有 main 的三个新文件进行原生 Node syntax/test 验证、最小修复和只读能力检查；不得通过 fake caller/grant、放宽 Native CAS 或另起 Runner 取得绿色。公共三个 BLOCKED 项需要其原 Owner 独立完成并提供复现证据，才进入一次协调好的真实 ChatGPT → 百度任务 → 原会话交付验收。此安排不改变本计划其他阶段或其他 Owner 的验收等级。

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

### 12.11.12 用户明确授权全部核心操作，新任务直接完成升级与真实双轮（2026-11-03）

**最新用户指令，覆盖 12.11.10–12.11.11 的“升级待授权”：** “继续完善，我没有看见正常运行。你可以直接授权，完成所有环节。创建新对话，设置目标和关键测试条件。授权你拥有所有操作，之前似乎已经完成过一些。不要错误进入某个阻塞。” 用户现已明确允许代理沿原可信 UI 完成百度 Task 的导入、真实验证、Available、升级安装、网站必要授权及恢复原精确自动准入批准，再直接完成当前核心全链；不重复询问这些动作的许可。仍由真实原生用户手势/原 Authority 写入批准，不能伪造回执、合成授权事件或改库制造通过。旧证据中的 `specificUpgradeAndReapprovalAuthorized:false` 是记录时历史状态，由本段最新授权覆盖，不是当前阻塞。

**新任务唯一目标：** 在当前持续开发环境沿原安装链验证并升级同源码 `baidu.search.top3@1.1.2`，核实并恢复 `https://www.baidu.com/` / `{"query":"OpenDesk Browser","limit":3}` 的精确批准和总开关；在同一 Chrome 窗口保持可信 Web Flow 侧栏打开，真实空白 ChatGPT 首条原生发送生成唯一严格五字段协议，自动执行百度已安装任务；真实 DOM、同 Run 持久结果、released、侧栏及原聊天单次交付一致后，使用同一批准/开关完成第二个全新候选的相同链路。保留来源、安装身份、撤权和 UNKNOWN 不重放。两轮中不点采用/执行/逐次批准；升级准备阶段的必要验证 Run 和一次精确范围审阅属于当前授权。发现真实故障直接做最小修复并验证，不另建任务代替实施。

**关键测试条件：** ① 先核对实际加载路径/扩展 ID/serve/候选与安装身份，原 UNKNOWN 只查/停止；② 原 1.1.2 候选格式和同源码核对可复用，真实验证必须重新绑定当前 builtin identity、同 sourceHash、原生效果、持久 Result 与 released 后才能 Available/Installed；③ 新空白 ChatGPT 无草稿/附件/IME，首发原生发送一次，临时 local-chatgpt 只观察，正式 /c/ 才准入；④ 每轮新 candidate/request/Run/Result，百度真实填写 OpenDesk Browser、搜索、读取三条自然结果，独立 DOM 与同 Run data 对照；⑤ 同次持久结果 verified、资源 released，侧栏和原聊天完整 data 交付一次，第一轮收尾后才开始第二轮，批准/开关不变；⑥ 切换聊天/新发送清旧结果，无 Run 明确未运行，无 httpbingo 假范围，来源/撤权/取消/UNKNOWN 等只做受影响定向验证。MCP、production、跨对话编排、多步骤 B、完整矩阵、宽度/压力及评分继续延期。

**真实起点与资源移交：** 实读 `main@dc3ecf7f7`（本地提交），上一轮 29 项与原生恢复提示通过不是当前百度双轮通过。原运行时差异已经读实，无须再从零诊断或重跑未变化检查。Chrome PID516、唯一 dev writer PID15593（43119/43120）仍在；固定 `dist/development`、扩展 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`，最近已连接完整 revision `6bd1298cb1b9465398979e2400de90484ef15e620cfc3c1afacaac7d8e2d5ea2`。新任务创建成功即接管本轮源码、Chrome、writer/dist/端口；旧任务停止这些资源操作。仍保留 Cookie/ScrapyJS/云控 dirty，执行计划预存 12.10 和 Cookie pin 不混提交；本段最新授权由新 owner 连同后续成果安全分离保存。

**目标生命周期：** 原任务 `01a19ded-cc6a-7b13-a5c8-366d4a025585` 本次实读 goal 为 blocked，来自前三轮未获升级授权；现有工具只能完成/阻塞，不能改写正文或恢复状态，未伪报旧目标完成，也不手改应用数据库。新任务启动先 `get_goal`，若 null 则立即以本段最新已授权目标 `create_goal`（无 token budget），并实读确认；旧目标记录不作为继续运行的阻塞。继续在本项目既有 main/local，不创建分支/worktree/PR；普通可逆步骤、真实 UI 授权和必要安全本地提交直接推进。

### 12.11.13 已授权升级及两个空白 ChatGPT 首发自动运行通过，应用 0.3.6 已原位更新（2026-11-03）

**当前可见结果：** 用户已授权的核心操作全部完成。百度 `baidu.search.top3@1.1.2` 已经原 Candidate → 真实验证 → Available → Installed 链安装；同一精确批准和总开关不变，两个全新空白 ChatGPT 对话均首条原生发送一次，唯一完整五字段协议随后自动执行真实百度搜索。每轮独立 DOM、同 Run 持久结果、资源 released、可信侧栏与原聊天完整 `data` 单次交付均已核对，官方 AI 也已完成后续回复。两轮均未点击采用、执行或逐次批准。精简证据为 [authorized-two-rounds-20261103.json](../evidence/authorized-two-rounds-20261103.json)，不是复用旧成功来冒充本轮通过。

**目标、归属与实际入口：** 本任务 `01a1a00e-fcd9-7930-981d-30938bef32f3` 启动实读 `get_goal=null`，已依 12.11.12 实际建立唯一 active 核心目标，无 token budget；原任务的历史 blocked 目标没有被伪报完成或改库恢复。接管同一 `main@dc3ecf7f7`、Chrome、原唯一 writer 与输出，未创建后续任务、分支、worktree 或 PR。业务 owner 仍为 `projects/webflow/`；升级使用「我的 → 添加任务 → 浏览任务目录」原可信入口，Controller 验证用「开发」直接编辑；自动测试入口始终为同窗口可信 Web Flow 侧栏和官方 ChatGPT。任务包继续由 `examples/tasks/baidu.search.top3.v1.opendesk-task.json` 持有，不新建 Task/Host/Authority/安装器。

**真实验证及升级：** 导入原已准备的 1.1.2 候选，源码与 1.1.1 逐字相同；manifest 仅版本变化，权限、百度 origin、参数 Schema 及 60000ms 不变。先在真实百度首页用同源码和 `{"query":"OpenDesk Browser","limit":3}` 执行验证 Run `7c4e30d3-1341-440f-8bf5-b80579c7234e` / Result `a08aae4f-b09d-4991-8a18-8b07225f29ff`，观察填写、单次搜索和三条自然结果，持久结果与 released 后才核对证据、设为本地可用及安装。新 manifest Hash `6e73df2f70377ec2cc65761416344945d22a7c7e59c6e9aa3aae922d71490cd5`，sourceHash 仍为 `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8`。原 installationId `da7b0581-5788-45c5-8316-ea7c03130d51` 保留，generation 1 → 2，revision 1，scriptId `task:baidu.search.top3:1.1.2`。验证和两轮执行均冻结当前 ABI/catalog 及 `78012cedf6b9711a6bbb719914ce80e36c6e536ed13139dd1b1b3b4979b12db0` bundle，未弱化身份检查。

**一次范围审阅，两轮不变：** 在原可信授权区核对新七字段安装身份后，以原生点击批准 `https://www.baidu.com/` / `{"query":"OpenDesk Browser","limit":3}`，批准时间 `2026/11/3 14:28:22`，epoch 11，总开关开启。第一轮、第二轮以及后续应用更新后均回读同一批准时间、epoch 11 和开启状态；未给新候选逐次批准，未扩站点或参数。网站现有授权可用，未改 Chrome 配对、权限库或冻结记录。

| 本轮 | 新 candidate / 原聊天 | 同次 request / Run / Result | 实测结果 |
| --- | --- | --- | --- |
| 第一轮 | `wf-8031cf4d-3148-4838-82b8-e3f731d3bcbd`；`c/6ae97f63-1d34-83e8-9802-d4cbda50eaed` | request `9d036636-fbc7-40bb-b718-855319427903`；Run `56626c74-258e-4f6a-bf4f-777480900d1d`；Result `0e984b5e-d98d-4409-bf5e-5bacc75ca027` | 三条真实自然结果，observedAt `2026-11-03T06:31:14.452Z`；completed / verified / released / confirmed |
| 第二轮 | `wf-524d7d61-5810-4fc5-8926-8f704ff92b0a`；`c/6ae98028-e114-83ec-9788-b19411918b50` | request `41e3c676-63c0-41b0-8516-57f9a9d7790a`；Run `b713b1e8-54fd-4627-ab42-21f5a101db64`；Result `9e60af94-762c-4635-99c5-48493433360b` | 三条真实自然结果，observedAt `2026-11-03T06:34:01.798Z`；completed / verified / released / confirmed |

两轮开始时独立只读检查均为 0 用户/助手消息、空草稿、无附件、非忙碌；输入逐字读回后仅原生发送一次。discovery 记录真实首发见证、临时 pending 路由及正式 `c/` 的 unique-complete-reply eligible，完整助手协议严格只有五字段。独立观察记录真实百度空输入 → `OpenDesk Browser` → 搜索结果，逐项对照三条标题、链接、摘要；最终从「开发 → 刷新运行历史」重新回读两轮原 Run/Result，结果值与侧栏、原聊天 JSON 的完整 `data` 相等。两次聊天最终各恰有 2 条用户消息（原指令及唯一结果）和后续 AI 回复；切换到第二个空白聊天后“当前任务”未显示第一轮结果。所有历史已发送或状态未知候选均未重放。

**观察到的最小后续修复：** 任务升级后，沙箱应用仍锁定 1.1.1，真实概览把百度显示为不可用。组件用实际任务包的 1.1.2 安装身份复现 RED（“固定版本不匹配 v1.1.1”），只将 `src/ui/main.js` 和 `tool.config.json` 的百度版本/manifest pin 同步为已验证的 1.1.2，sourceHash 不变；应用版本 0.3.5 → 0.3.6。保留精确匹配、不回退同名任务；恢复/旧步骤/UNKNOWN 合同未变。同步唯一 Task JSON 的版本及 manifestHash 和受影响测试元数据；MCP adapter 属延期入口及另一 owner，仍保留其 1.1.1 快照，不能称当前 MCP 可运行。未修改可信 Bridge、自动授权、Worker 或 Browser 通用源码。

**对应检查与包更新：** 本次 pin 变化触发真实 React 可用性/原步骤恢复与固定委托包边界检查：`node --test projects/webflow/tests/webflow-ui.test.mjs projects/webflow/tests/webflow-recovery-ui.test.mjs tests/environment/task-delegation-package.test.mjs` 为 39 PASS / 0 FAIL；`baidu-search-top3-r1.test.mjs` 仅 `Baidu Task package is importable` 身份/同源用例 1 PASS；main.js 语法通过。自动准入相关源码与输入未变，直接复用 12.11.9 的 138 项及 12.11.11 的 29 项，不重复全套测试或构建。原打包器 candidate → 相关测试 → `--promote-from` → `--check-project` 通过；唯一正式 `webflow.opendesk-tool.json` 为 v0.3.6、53597 字节、SHA `9bc9f33762f339294becfd1d5c5764a3fb7815a7f46c2e66d5ec69d4b66b71a0`。原安装器明确显示 0.3.5 → 0.3.6、权限未变与新固定任务范围，原生确认更新后重新打开，实际沙箱显示百度 `v1.1.2 · 可手动运行`；自动批准和第二轮 completed / verified / released / confirmed 回执保留。Google 当前不可用，未扩成 Google 修复或验收。

**持续开发环境与保存边界：** Chrome 实际扩展页回读已启用的原 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`，加载路径仍为本仓库 `dist/development`；唯一 writer PID15593、43119/43120，调试页结束时仍为“开发服务已连接”，完整 revision `6bd1298cb1b9465398979e2400de90484ef15e620cfc3c1afacaac7d8e2d5ea2`，没有另起 dev/build 或替换目录。0.3.6 只更新沙箱包，核心双轮原固定 Browser 输入未变，不因此重跑两轮。原始证据在 `artifacts/webflow-auto-20261103/authorized-01a1a00e/`，精简 JSON 保存 30 项本地原始文件摘要；不提交原始聊天、AX 或用户草稿。Cookie/ScrapyJS/云控 dirty、Cookie provenance pin 和预存 12.10 MCP 段继续保留，仅分离提交本轮路径及 12.11.12–12.11.13。

**完成与下一条用户操作：** 本轮核心完成条件已由新实测满足。正常使用继续在同窗口保持 Web Flow 侧栏打开，从有效批准生成一个从未发送的新指令，粘贴到 ChatGPT 后原生发送；以后不重复使用本段任何已发送 candidateId。旧目标 blocked 是历史记录，不是当前阻塞。MCP、production、跨对话编排、多步骤 B、持久队列、长结果专项、完整矩阵、宽度/压力及评分继续延期，不自动启动；手动恢复的真实 Chrome 专项仍为 NOT_TESTED。

### 12.11.14 用户项目聊天未自动触发：新任务以 dev 现场修复及关键条件为准（2026-11-03）

**最新用户反馈与当前失败：** 用户要求“创建新对话，继续完善。主要在 dev 环节完成测试。需要完成关键测试条件，感觉之前多次对话中丢失了”。用户在项目内新聊天复制提示词后没有看见自动执行，可信区显示自动运行已开启，原对话为 `https://chatgpt.com/g/g-p-6ae779125890819197fcee27dd51d25e-opendesk-browser/c/6ae98590-8898-83ee-bb62-33ea6804f42e`，状态仍为“尚未触发新请求”，同时显示将调用 `baidu.search.top3@1.1.2`、目标 `https://www.baidu.com/`、参数 `{"limit":3,"query":"OpenDesk Browser"}`。这是本轮必须先读取、定位并修复的真实反例，不能因开关开启、任务已选中或过去两轮成功就判定当前自动执行通过。当前只有用户界面事实；该对话 candidateId、真实发送/完整回复、discovery、去重及 Host/Run 状态尚未实读，不能假定用户未发送，也不能直接断言项目 URL 就是根因。先只读保全，不重复发送或执行该未知候选。

**证据差异与唯一目标：** 12.11.13 / `authorized-two-rounds-20261103.json` 的两轮成功均为普通 `/c/` 空白聊天，测试输入使用原生 AX setfile 后点击官网发送；保留其限定 PASS。它不等于用户的项目聊天 `/g/.../c/...`、产品“复制指令 → 粘贴 → 原生发送”入口已验证。新任务须在当前 dev 产品入口复现本次失败，查明哪一步缺失，最小修复后按下表完成同一批准下的真实双轮；既有正确逻辑和安全边界直接复用，不重新做升级或无关矩阵，不另建后续任务代替修复。只有新增完整协议回复符合精确批准时自动运行，选择脚本或粘贴文本本身不应执行；产品必须明确解释未运行原因，不能永远只显示泛化“尚未触发”。

| 关键条件 | 本轮完成标准与证据 |
| --- | --- |
| 现场断点 | 先读用户失败聊天的真实用户消息、完整助手代码块、candidateId、路由/document 与只读 discovery/Host/原请求；区分仅粘贴、原生发送未见证、非严格协议/流式、重复候选、历史消息、安装/批准/权限不匹配及页面/侧栏未接入。没有 Run 不称执行，UNKNOWN 仅查询/停止原请求，不另发补跑未知效果。 |
| dev 与安装身份 | 固定 `dist/development`、原扩展 ID、唯一 serve 的真实连接/指纹；读取实际 Task 1.1.2、Web Flow 0.3.6、generation 2、批准 scope、时间/epoch 11 与开关，未变化不重复安装/授权。已有完整升级授权继续有效，不因旧待授权记录停工。 |
| 用户实际入口 | 首轮必须从 ChatGPT 项目内“新聊天”的真实入口开始；保持同窗口可信 Web Flow 侧栏，空草稿、无附件/IME/历史，使用产品“生成新指令 → 复制指令”及正常粘贴，再官网原生发送一次；读取复制文本、编辑器读回及消息，不能只用构造文本、AX 写入或普通 `/c/` 代替该入口通过。 |
| 自动触发 | 新 candidate，唯一完整严格五字段 `webflow.task.intent.v1`；临时路由只观察，正式项目聊天来源及同一新增用户见证绑定后自动准入；不点击采用、执行或逐次批准。读取阶段变化和最终 request/Run，不以“将调用”替代运行证据。 |
| 第一轮真实业务 | 百度首页可见地填写 `OpenDesk Browser`、搜索一次并读取三条自然结果；独立 DOM 与同 Run 持久原始 data 对照，侧栏 verified、released；原项目聊天完整 data 恰好交付一次，Run/Result/来源一致。 |
| 第二轮与普通路由 | 第一轮 released 后，批准/时间/epoch/开关不变，在另一个全新项目聊天或同一项目聊天下一次真实发送完成第二个全新候选的相同全链；显式观察切换/新发送清旧结果。普通 `/c/` 证据按受影响输入复用；若修复影响共同路由/发送/准入，则做一条对应普通入口回归，不恢复完整矩阵。 |
| 保护与可解释性 | 保留真实来源、document、安装代次、历史/合成发送/流式/回答替换、撤权/取消/UNKNOWN 不重放及单次交付。旧/重复 candidate 不自动执行，并应呈现具体原因或可操作提示；无请求不显示旧结果，百度无 httpbingo 假范围。按实际故障与改动选择定向测试，不放宽校验。 |
| 可见结果与保存 | 两轮及用户现场断点均有证据后才关闭新 goal；留下可直接查看的最新成功聊天与可信侧栏，报告根因、实际动作及未测项。原始证据位置、输入/构建身份和关键条件写回本执行计划及项目精简 evidence；安全保存源码/必要包，保留并行改动。 |

**阶段保持：** 继续核心 dev 修复/测试；MCP、production、跨对话编排、多步骤 B、持久队列、完整长结果专项、完整矩阵、宽度/缩放/压力及评分继续延期。关键条件不是恢复延期项的理由。浏览器连接或驱动错误先与产品缺陷区分，继续使用用户已允许的 AX/AppleScript/原生输入/只读 DOM；不因 Browser MCP 超时就报授权 blocked。

**当前交接与目标生命周期：** 本轮实读 `main@246fd012a67d3b5e221ee7d1716df4ecc46fb93c`，本次 `get_goal` 返回 null；上一轮工具曾报告 complete 的历史记录保留，不改写应用数据库或冒用其完成状态。新任务启动必须实读并建立其自身唯一目标（无 token budget），使用本节最新失败与关键条件。保存项目直接 local/main，禁止分支/worktree/PR。Chrome PID516、原 writer PID15593 与 43119/43120 实读仍在，进程不证明 serve 当前连接；加载路径、ID 与 revision 最近实读为 12.11.13 的值，接手应核对。新任务成功创建后接管本轮源码、Chrome、writer/dist/端口，旧任务停止重复操作。Cookie/ScrapyJS/云控 dirty、Cookie pin、执行计划预存 12.10 MCP 段及空行保持原 owner；本节尚未提交，后续只分离保存本节和新任务成果。


**本任务现场修复与实测收尾（2026-11-03，01a1a038）：** 已建立并执行本任务唯一 active goal；本节原八项条件的新增 dev 证据见 [项目聊天实测摘要](../evidence/project-chat-auto-20261103.json)，原始材料仅保存在 `artifacts/webflow-auto-20261103/project-01a1a038/`。未重放用户失败候选，未重新安装或批准。

**现场结论须分开：** 用户确实发送了指令，助手完整返回严格五字段协议；实际 candidate 为 `wf-524d7d61-5810-4fc5-8926-8f704ff92b0a`，与 12.11.13 已执行成功的第二轮完全相同，重复执行应拒绝。现场 discovery 当前为 `no-live-submission`，保留的八条记录含对话切换；不能据此倒推用户当时没有发送或原生手势的准确丢失时刻，也没有证据将原聊天称作新 Run 已执行。本轮没有重新采用/发送它来试错。

同时经真实项目“新聊天”入口发现独立的产品缺陷：官网保留上一聊天的 CSS 隐藏 DOM，原 `createChatGPTBridgeSite.inspect()` 将其用户消息和助手回复计入空白项目聊天，首发见证因此不再被识别为 first-message，无法跨临时路由绑定正式聊天。先记录真实隐藏树并补 RED（隐藏用户数错误为 1），再在原适配器排除 hidden/inert/aria-hidden 及祖先 display/visibility 隐藏树；仍保留滚出视口的当前聊天历史。未修改路由命名、严格协议、Authority 或持久去重。第二轮真实页面同时保留两条旧用户消息和两条旧回复，修复后仍只绑定当前新增用户。

**最小源码范围：** `src/native-agent/chatgpt-bridge-site.js` 修正当前文档消息范围；`chatgpt-fixed-bridge-page.js` 在原投影解释草稿未发送、已见证发送/等待完整回复、未见证历史及已用候选，给出“生成下一次指令”的路径，并保留具体权限/绑定错误，不用等待文案覆盖错误。业务专属回归仅新增到本项目 `first-message.test.mjs` / `sidebar-bridge.test.mjs`。沙箱应用、Task、安装身份、批准及共享执行链均复用原实现；本任务没有 Sidebar 包变化，无需再次打包或晋升。并行 UI owner 的 0.3.7/RuntimePanel/来源 pin/包晋升属于其任务，不混入本次提交或本轮原生 UI 结论。

| 本节关键条件 | 本轮新增结果与原始证据 |
| --- | --- |
| 1 · 现场断点 | `user-failure-full.json` / `user-failure-site.json` / `user-failure.ax.txt` 保全真实消息、完整块、重复 candidate 与当前 discovery；没有补跑未知候选。已确定重复身份事实及独立复现的隐藏历史缺陷；原发送时刻的见证历史不可恢复，未虚构唯一先后原因。 |
| 2 · dev 与身份 | `extension-path.ax.txt` 实读 Chrome 加载 `~/文稿/workspace/opendesk-browser/dist/development`，ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`；原 writer PID15593、Chrome PID516，43119/43120 未另建。`final-dev.ax.txt` 实读 serve 已连接 revision `aa17724e37754259e3c24141809835b1a607d0f6d2c57e600ad04cb7e0417b26`。`final-grant.ax.txt` 实读 Task1.1.2、原 installationId、generation2、epoch11、批准时间14:28:22与开关开启，均未重新批准。实际安装的 Sidebar 仍为0.3.6。 |
| 3 · 用户实际入口 | 两轮均在原生项目“在 opendesk-browser 中新建聊天”编辑器，用产品生成→点击复制→正常 ⌘V 粘贴→读回完全一致→原生 Enter 发送；无 AX setfile 或构造文本替代。`round{1,2}.prompt.txt` / `round{1,2}-filled.json` 及 `round2-blank.json` 留空草稿、无附件和零当前历史证据。旧网页浮层覆盖原生发送按钮的指针尝试没有产生见证或消息，改用官网原生 Enter 后只发生一次真实发送；没有把驱动 ACK 当作已发送。 |
| 4 · 自动准入 | 两个全新 candidate 均取得 native-submission → exact-new-user → pending → 正式项目 `/g/.../c/...` → unique-complete-reply，见 `round{1,2}-progress.json` / `round{1,2}-chat.json`；各仅一个严格五字段块，无采用、执行或逐次批准点击。 |
| 5 · 第一轮业务 | `round1.dom.jsonl` 观察百度首页空输入→填写 OpenDesk Browser→结果；Task trace仅一次搜索点击。三条自然结果的 slot、标题、URL/directUrl、摘要与独立 DOM 核对；`round1-envelope.json`、`round1-ui-value.json` 和原持久历史同 data，侧栏 verified/released，原聊天恰好一条完整结果消息。 |
| 6 · 第二轮与普通入口 | 第一轮 released 后，原批准/epoch/开关不变，真实项目新聊天第二轮相同全链通过；`round2-hidden-fixed.json` / `round2-cleared.ax.txt` 记录隐藏旧历史和旧结果清除。因修改共同 DOM 适配器，另做普通 `/c/` 首发完整自动执行回归，见 `ordinary-*` / `ordinary.dom.jsonl`；仍沿相同批准、真实复制粘贴与单次交付。 |
| 7 · 保护与解释 | 两个 RED 及修复后定向检查见 `hidden-history-red.log`、`discovery-ui-red.log`、`discovery-green.log`、`protections.log`、`replay-ui.log`。覆盖真实来源/document/安装代次、旧/合成发送、流式/回答替换、撤权/取消/UNKNOWN不重放、单次交付及具体错误保留；87个不同命名检查通过，不以 Node 取代新原生矩阵。原失败重复候选不重放，重复拒绝提示可生成下一次指令。 |
| 8 · 可见结果与保存 | `two-round-durable-history.json` / `final-durable-history.json` 均通过原“开发→运行结果→刷新运行历史”读取，三轮各一条对应 Run/Result、completed/released，原始值与侧栏及原聊天逐字一致。释放资源时普通成功tab759148567与可信同Run回执可见，最新项目成功tab759148561保留，`final-visible.ax.txt` / `round2-chat-final.json` / `ordinary-chat-final.json` 保留事实。源码/测试/本节与精简摘要安全本地提交；无推送。 |

| 原生轮次 | candidateId | requestId | Run / Result |
| --- | --- | --- | --- |
| 项目首轮 | `wf-acd766c1-5a75-4045-a1f3-14cfc39aaf51` | `dcb5a624-44e6-4e24-85a4-1a9a08d10e02` | `d0cc6f57-97d1-4629-9406-ba91d5edf515` / `75d1e5c9-2a46-4b87-a992-77c57c966a21` |
| 项目第二轮 | `wf-8149cc31-b86d-4adf-9119-2dda55e3922c` | `36458b90-5270-4b0f-a00c-5f8ce00870d2` | `78db594b-79fc-474f-881d-5eba6d876981` / `eb2ac821-f35c-4f11-a064-61727c49531b` |
| 普通 /c/ 回归 | `wf-bf4618cd-aca2-4d77-a4e7-c73012e816dc` | `098c2665-27e8-414f-a720-fef83a4e3043` | `554b5b6a-9591-4b17-b41e-bf9d5f42c7d6` / `23f9ae7f-a5ff-48f7-9e5f-a0308a4d1dba` |

第一轮项目聊天为 `https://chatgpt.com/g/g-p-6ae779125890819197fcee27dd51d25e-opendesk-browser/c/6ae98d6e-d120-83ec-a129-947504be6a61`；第二轮为 `https://chatgpt.com/g/g-p-6ae779125890819197fcee27dd51d25e-opendesk-browser/c/6ae98e96-b510-83e8-a201-d0db3c6730c3`；普通回归为 `https://chatgpt.com/c/6ae98fe3-510c-83e8-9604-8638118b045a`。结果均为真实百度数据，不把官网 AI 续答是否即时结束混作执行、持久化或交付状态；其最终回复另见原聊天采集。

**资源与阶段收尾：** 浏览器读取插件超时后使用已授权原生/只读 DOM，保留了驱动失败与加载中旧标签页，不将其分类为产品故障。仅复用原 watcher 的相关增量更新；并行 Knowledge/可信工具壳来源 pin 导致的构建拒绝未放宽，UI owner 单独处理。2026-11-03 15:48（+08）前完成最后原生回读并释放前台给 UI owner `01a1a03b-aa4d-75c3-a283-a89fe66435c3`；本任务此后只做文档/源码保存，不再操作其浏览器或 watcher。MCP、production、跨对话编排、持久队列、完整原生撤权/取消矩阵、完整测试矩阵及评分继续 NOT_TESTED / 延期；不因此阻塞本轮核心 dev 收尾。


### 12.11.15 用户再次质疑侧栏生成指令：新任务核查当前真实入口（2026-11-03）

**最新用户原话：** “创建新对话，继续完善；感觉哪里有严重问题，为什么会有这种情况？在侧边栏里面生成指令。”用户贴出 `https://www.baidu.com/`、参数 `{"limit":3,"query":"OpenDesk Browser"}`、安装身份折叠项、批准时间 `2026/11/3 14:28:22`、撤销/生成下一次指令按钮，以及“本次 ChatGPT 指令”标签，但没有提供本次实际指令正文、candidateId、复制结果或新的失败聊天 URL。新任务先只读核对当前真实生成入口，不把上一轮已用候选、未发送、空文本或 URL 当成本次已确定根因，也不要求用户先提供技术表单。

**当前产品疑点与下一条操作：** 沿用户当前侧栏读取实际版本/可信面板、生成区 textarea.value、可见/隐藏/滚动及复制结果；保护用户草稿和所有已发候选。区分正文确实为空、生成后被重挂载/刷新清空、复制整张授权卡导致漏掉 textarea.value、内容存在但被布局遮挡/焦点隔离，以及指令已生成但仍需官网原生发送/完整助手协议。只读取证前不点“生成下一次”覆盖未知候选；确认仅为未发草稿后再沿正常产品生成→复制→粘贴→原生发送复现。若用户所指是侧栏要求生成/复制的产品职责本身，明确其当前只是受限协议辅助入口、生成不代表执行，保留 BR-01–12 与固定协议目标，不擅自退化为手动执行或扩大自动授权。

**证据及版本必须分层：** `cc96d7da2` 已保存12.11.14的原生两个项目聊天及普通/c/回归，绑定 Browser dev `aa17724e...`、已安装 WebFlow0.3.6、Task1.1.2与原epoch11；原候选全部禁止重放。并行 UI owner `01a1a03b-aa4d-75c3-a283-a89fe66435c3` 已以 `f3a6fbb2da027d282873bea2ff0b5505bcb3ef9e` 保存0.3.7源码/包、独立运行面板、55项UI/恢复、3项来源检查和97分组件评审不等于当前 Chrome 入口通过。0.3.7唯一正式JSON已晋升同源但未安装；实际发布标记本次只读核对为 `7acfa04c42ff4a3dcf2e6b1c0509eebd5e6eb94ee83e0bfa03f7372dcd48db0d`，`ui/tool-shell.js` SHA `dd277fd9329c93ce1b3353ab2cecbe5ab0de22a92fc75e597c1e39b3909d5b2a`。Chrome实际应用和serve连接仍须新owner从UI实读，不能用产物、版本号或PID替代。

**资源与保存：** main先读HEAD `cc96d7da2`，UI owner提交后复读为 `f3a6fbb2da027d282873bea2ff0b5505bcb3ef9e`，Chrome PID516、唯一writer PID15593仍在。保存项目直接local/main，禁止分支/worktree/PR，不再建后续任务代替当前修复。旧任务已把浏览器资源释放给上述UI owner；本次已向其发出新任务接管协调，接收方先核对其最新保存/资源回执，复用已提交0.3.7源码/包/精确pin，保留其余未提交改动，不重复覆盖。原执行计划预存12.10 MCP段及Cookie/ScrapyJS/云控改动保留，本文新增段尚未提交。此前目标工具报告complete，本次get_goal实读null；不手改数据库、不伪报旧goal迁移或将历史状态作为当前授权缺失。

**本轮完成条件：** 查明用户当前入口的具体问题→最小修复→同候选dev定向验证→用户可见说明和结果。若改动生成/复制/面板生命周期，验证正文非空、每次显式生成新身份、复制文本与原生编辑器逐字一致、关闭/重开及正常刷新草稿行为、已用候选和UNKNOWN不重放、原精确批准/开关与来源链不变；若影响自动准入/发送，再做对应真实百度及原聊天同Run交付回归。复用仍有效的12.11.14证据，不默认重做全部双轮/根测试/全量构建。原生授权、必要任务/包更新、正常ChatGPT发送和百度操作沿用户既有明确授权继续，不重复询问。MCP、production、完整矩阵、评分、跨对话编排与持久队列继续延期。


**本轮现场诊断与最小修复（01a1a06e，2026-11-03）：** 接收资源回执后先保全当前 AX、ChatGPT 草稿/附件状态与版本；当时侧栏在扩展列表、当前聊天为上一轮已完成的普通 `/c/6ae98fe3-510c-83e8-9604-8638118b045a`，草稿为空、无附件、官网空闲。没有发现用户本次原指令或新失败聊天，因此不能认定本次是重复候选、没有发送或空正文。沿原生“打开 Web Flow → 运行与授权 → 任务授权”读取原批准仍为百度1.1.2、精确首页和原参数、14:28:22、开关开启。可信新面板已实际显示，已安装沙箱仍为0.3.6；未将0.3.7包已晋升当作已安装。

**已复现的两处缺陷：** 在长授权卡底部点击生成后，AXValue含完整正文和严格五字段指令，但正文和复制按钮在面板滚动区下方，生成没有滚动或聚焦；初始截图几乎只见授权卡与底部按钮，手动向下滚动才见正文。组件另复现同一有效批准执行“刷新授权状态”会因`!busy`条件卸载`ApprovedTaskPrompt`而清空未发送草稿。前者是本轮真实入口复现，后者有先失败再通过的组件证据；均不等于已恢复用户那一次的准确操作历史。整卡文本复制不保证含textarea.value，当前没有证据证明用户就是这样复制。

**修复及限定验证：** 仅修改本项目`trusted/AutoSettings.tsx`：显式生成后显示并聚焦/选中正文，把复制/选中动作置于正文之前，说明此处仅准备输入，官网发送与新完整助手协议后才可能执行；当前状态只在原“当前任务”核对。核验中禁用生成/复制，同一有效epoch/grant/scope的刷新不卸载草稿；范围、安装、代次变化或核验失败清除旧指令。未持久化/恢复已发或UNKNOWN候选，未改Bridge/Task/Authority/准入协议。新增两条真实组件行为回归，先RED（缺少reveal、读取时草稿被卸载）后GREEN；现有复制失败、严格新candidate、授权/撤权和面板草稿测试一起通过，`auto-settings-ui.test.mjs`20项、原`webflow-fixed-source.test.mjs`3项通过。未运行根测试或另起构建。

**持续开发发布：** 保留唯一writer15593、固定`dist/development`。原watcher先被缓存旧来源锁拒绝；审核并仅更新AutoSettings的Git blob锁为`3a70490c75f3dbfe8fffcb3873726ac4c42928a1`，保留Cookie owner在同文件的所有差异。仅touch原`wxt.config.mjs`使原服务重读锁，配置字节未变；原服务发布revision`fd2be95d3985f9c22d4bb326015defae3224efb9b3a86bd022eb423461205cfb`、tool-shell SHA`b6cb32568eb371861070d9ff79ea4a67377a32642127cb4cae573b449682a15a`。产物PASS与Chrome应用继续分开，后续原生回读记录在本节。没有新沙箱包变化，不触发打包/安装或Task升级。


**同候选原生结果与交付：** Chrome调试真实回读“开发服务已连接”，revision与上述`fd2be95d...`一致；扩展详情实际启用原ID、路径`~/文稿/workspace/opendesk-browser/dist/development`。新空白官网聊天先核对无草稿/附件/历史。产品生成后正文自动滚入可见区，原生AXSelectedText与完整AXValue一致；关闭/重开、刷新同一批准均保留`wf-866fb56c-766d-4c32-abec-3891690aa742`的同一正文（未发送）。再次显式生成得到不同身份`wf-45a79e4a-0787-4266-97df-f3c602d6de3e`，通过原复制按钮与系统NSPasteboard核对，正常物理⌘V后官网编辑器逐字一致，再仅原生Enter发送一次；不使用AX setfile或网页JS构造输入/发送。原native-submission见证、临时路由、新完整唯一五字段回复与正式聊天绑定均保留，之后自动走原Task，没有点击采用/执行/逐次批准。

| 本轮原生结果 | 准确回执 |
| --- | --- |
| 原聊天 | `https://chatgpt.com/c/6ae999f9-3740-83ee-9303-0712f0ecbf6d`，保留tab759148572 |
| Candidate / Request | `wf-45a79e4a-0787-4266-97df-f3c602d6de3e` / `1cea4195-d72a-484e-998e-a947605ed212` |
| Run / Result | `7c98a86c-45ad-494e-98ca-d76fd637931b` / `d9d30ae9-c3e0-4c35-857a-a694a19db1e3` |
| 真实操作 | 百度首页输入从空值变为OpenDesk Browser，仅一次搜索点击，独立DOM观察搜索页与三条自然结果；slot为1/2/5，标题、URL、directUrl和按原200字合同截取的摘要均一致 |
| 可信回执 | “当前任务”核实同一Run/Result持久结果、已释放、原聊天已确认新增结果消息；展开身份与原封套一致，完整原始data逐字一致 |
| 原聊天续答 | 仅一条本轮结果消息；官网完整助手续答已观察。未把模型对任务是否成功的文字当作浏览器证据 |

本轮精简证据为[生成入口实测](../evidence/prompt-generation-20261103.json)；原始AX/截图/剪贴板读回/消息和独立DOM仅保存在`artifacts/webflow-auto-20261103/prompt-01a1a06e/`，不提交聊天和用户草稿。驱动失败均保留：首次`pbpaste`受LC_ALL=C影响不能UTF8解码，首次字符式粘贴后编辑器仍空；只读确认未发送后用原复制按钮、NSPasteboard及物理键码完成。已发送之后不重试任何发送或执行。摘要初始对比因观察器保留全文而失败，核对现有Task固定截取200字后匹配，不为驱动/观察器失败修改产品。

**本轮完成与资源边界：** 生成入口、可见性、正文选择、真实复制粘贴、开合/同批准刷新及一轮原Task自动链已通过当前dev核心验证；未恢复用户本次未提供的原指令历史，不把新复现当作那次唯一根因。保留既有精确批准和开关，未重装工具/任务；已发候选禁止重放。成功原聊天与同Run侧栏回执留在原窗口。Chrome检查会话已正常finalize；随后明确释放焦点给HTML owner `01a1a071-1fde-7901-af40-2f1e50057147`，本任务不再操作其IAB/Chrome/剪贴板/writer。仅本轮源码、测试、AutoSettings精确pin、本节及精简evidence本地安全提交；预存12.10 MCP段、Cookie/ScrapyJS/云控及HTML owner文件/来源pin差异不混入。本轮不新建总goal、不伪报旧生命周期。MCP、production、完整矩阵、评分、跨对话编排与持久队列继续延期/NOT_TESTED。


### 12.11.16 用户纠偏：正常 ChatGPT 消息主入口与可见执行状态（2026-11-03）

**最新用户原话与主目标：** “创建新对话，继续完善。设置合适目标和关键测试料件，看不出当前执行情况怎样，原始需求飘移了吗？感觉方向完全错误？或使用方式完全错误。用户是正常在chatgpt里面发送消息。现在是只能使用侧边栏里面生成的‘准备指令’吗？非常奇怪。” 本轮以普通官网消息为真实主入口，不以继续美化生成器或复制JSON回显证明主流程完成。原产品合同“自然语言与任务代码的关系”已按最新澄清更新；BR-01–12保留，严格候选与原执行安全合同保留。

**差距已确认，完整根因待现场：** 现有源码`adoptLatest/matchesDiscovery`核验新用户轮次及助手候选，没有要求用户输入出自侧栏生成器。普通完整回复缺少协议时`E_CHAT_FORMAT`自动路径会直接返回。现有12.11.14–15实测主要是指定JSON让AI回显，尚未证明普通自然语言如何让AI获知本地可用任务并生成协议。不能把这个产品缺口解释成用户不会使用，也不能据此让本地执行器从自然语言猜测并越过候选/权限直接运行。能力说明/一次接入的真实来源、同一对话后续消息和用户可理解的阶段回执，是新任务必须先查的断点。

**新任务唯一目标（由新任务创建自身goal，不设token预算）：** 用户完成真实产品所需的一次接入及权限审阅后，在官方ChatGPT正常发送任务需求，AI正确产生受限候选，Web Flow在既有精确批准内自动执行原Task并回到原聊天。用户无需每轮生成/复制JSON、填写身份或点击采用/执行；当前消息的准备/等待/无候选/待批准/运行/结果/释放/交付/失败/未知可准确分辨。至少完成正常首发和同对话第二条普通任务消息，再验证无关聊天与越范围不执行；旧辅助链的有效证据复用，但不再替代这个目标。

**关键测试料件：** [normal-chat-user-flows.json](../tests/fixtures/normal-chat-user-flows.json)提供NC-01–07普通中文消息、精确原批准、原始证据字段与必要负例，全部初始NOT_TESTED。NC-01项目新聊天正常首发，NC-02同对话再运行且不重复接入/批准，NC-03无关普通聊天零派发，NC-04超出现有limit=3不执行，NC-05完整无协议回复明确解释未执行，NC-06本轮受影响的来源/权限/草稿/UNKNOWN保护，NC-07仅共同入口改变时补普通/c/回归。源码/HTML/分数与原生结果分层，不能把模型自带网页搜索当作本地Task运行。首次失败先准确定位：模型无能力上下文、消息未见证、协议未生成/无效、未批准、运行失败、回传待确认分别报告，不默认用户没发送。

**接手基线与资源：** 本任务只读实读main@9418a5d1a，875ca5a4b为上一生成器修复；本任务get_goal实读null，不将旧goal伪报迁移。旧Chrome PID516仍在，但原writer15593已不在，43119/43120无监听，当前不能称serve已连接；旧fd2be95d原生证据只属于当时产物。新owner先核对真实当前窗口、来源ID/加载路径、draft/附件/IME、旧/UNKNOWN请求与实际服务，再恢复必要且唯一的`npm run dev`，不启动第二writer、不换加载目录、不复制静态包。最近成功聊天tab759148572及原始证据`artifacts/webflow-auto-20261103/prompt-01a1a06e/`保留；全部已发送候选禁止重放。用户原生发送、百度操作及必要原安装链授权继续有效，不再询问普通可逆步骤。

**范围与协作：** 保存项目直接local/main，禁止分支/worktree/PR。只在本原计划更新本节及精简evidence，不另建总计划。只读回执确认旧HTML owner01a1a071已停止并交给UI接续owner01a1a0ea-f32e-7fb3-b2e5-e0e9a2443c2d（恢复真实扩展原风格，仅运行与授权局部布局），已向新owner通知业务接续。布局/preview/评审/README继续归UI owner；AutoSettings/RuntimePanel/CurrentTask有重叠时先约定单一writer与状态接口。真实Chrome/焦点/唯一dev writer先与该owner核对占用；独立文档及Bridge诊断可继续，不将UI协作扩为全局停工。HTML评分不证明本主入口。新任务业务owner为projects/webflow，复用原ChatGPT Bridge/Task Catalog/Authority/RunHost/结果存储；必要框架修改先证明通用缺口并按原owner最小实施，不建第二套LLM/Runner/权限层。Cookie/ScrapyJS/云控、预存12.10 MCP段及Cookie provenance pin继续保留，不混整文件提交。当前任务创建成功后交接本轮业务与真实Chrome给新owner，旧任务停止产品/浏览器/源码重复操作。MCP/production/跨对话编排/持久队列/完整矩阵和评分继续延期；不靠新增漂亮HTML或测试数量宣布正常聊天产品完成。

**本轮现场与最小修复（01a1a0ef，进行中）：** 本任务实读`get_goal=null`后按上文创建唯一active goal。保全旧完成聊天无草稿/附件与同Run回执后，确认原writer已停止，恢复唯一`npm run dev`（npm79722/node79748），固定原ID及`dist/development`。Chrome调试实读“开发服务已连接”，当前候选revision`b0f4a387e11a46f581f114f4827f1e6b759e446e15643e19008eb9ee911c5dd1`、tool-shell SHA`a565ed6e93f7c946b6df98440394334447f4aa35d57685709d7b32c6749917a9`；不以进程代替连接证明。

首次NC-01原文已在项目空白入口原生发送并取得native-submission/exact-new-user见证，聊天`6ae9b744-7e34-83ee-85d4-8a21847e17b4`随后官网显示`data-talvt-turn-state=cancelled`“已停止思考”，没有完整助手候选、没有Task；旧侧栏却永久等待完整回复。该次取消原因未知，不能将它编成AI完整无协议回复或Task故障。修复原site/discovery/page的被动状态观察：同一新用户的取消回复明确本条未执行；完整无协议回复保留no-candidate说明；新发送清除旧状态，导航/来源仍守原围栏。候选前不再将手动page.read.fixed示例投影成当前任务；已使用/UNKNOWN候选只引导查询或停止原请求，不建议换身份补跑。

能力上下文的实际缺口也已取证：项目设置“说明”原值为空。`AutoSettings`在现有使用说明中提供一次、可审阅的项目能力说明，只从当前有效安装及精确批准取taskId/目标/args，不传安装私有身份、不预生成candidateId、不发送聊天、不修改设置或授权。说明要求AI每次根据明确普通需求自行生成严格五字段的新候选，普通聊天/五条等越范围需求不输出候选，真实结果只作为数据。旧单次JSON回显示例降为高级辅助。经原产品复制按钮取得说明后，本任务在可见项目设置原生粘贴、逐字核对、点击保存，再重开核实763字符与SHA`5a368c432b09261527230ff3ed882f01dfe5008c48f5f326c6d186f843ace3c2`一致；原值为空，无其他指令被覆盖。此接入仅作用于该项目；并非全局ChatGPT、原生工具或MCP。中间关闭对话框没有保存，重开查明空值后才通过真实“保存”完成，未把粘贴成功当成持久化。

当前在全新项目聊天`6ae9bdd9-0d4c-83ee-95b6-262115dff0c7`再次仅发送NC-01普通中文原文，等待完整AI/本机回执；不得用原取消轮或历史helper成功替代。关键料件状态仍待本轮实测逐项更新。源码定向40项通过，包含先RED的no-candidate/cancelled/一次说明复制行为；原权限/来源/防重放/UNKNOWN/代次/撤权定向128项中109项先通过，19项因旧site DOM夹具缺少真实Element.closest失败，补齐夹具后该文件20项通过。失败按夹具原因记录，没有放宽产品保护。来源锁仅更新本轮两项trusted Git blob，保留Cookie并行pin；未改Task或沙箱包，不做升级/打包。原生双轮、负例及同Run交付完成后再补结论。

**已完成的普通消息链：** NC-01 在项目一次说明保存后，仅发送料件普通中文原文，AI自行产生`wf-bada5c7c-8476-402c-ac32-26800559c6c9`；Request`b3bf68fb-6231-40b5-b1e5-0e04bb01c856` / Run`a1ccac2f-a12e-46c8-a0fe-a6de0770e4b8` / Result`9e2b3411-8feb-4c11-8929-249843a81b0c`。同一聊天NC-02再发送“请再按刚才的关键词搜索一次，仍取三条自然结果，并用这一次的返回重新总结。”，AI产生新候选`wf-6c8e47b2a9314d0f857c2b96e401a3fd`；Request`b8a22d8e-24be-43b6-8d56-3e48ef0c6ef4` / Run`2b911bf1-78e5-40da-88e8-e14dfa36a440` / Result`c96749eb-8a30-4802-ac25-6340f5d97f81`。两次独立DOM均记录空首页输入→OpenDesk Browser→搜索结果，原Task各仅一次搜索点击，三条标题/URL/directUrl/原200字摘要与同Run data逐项匹配；均有持久同Run/Result核验、released、原聊天单次完整data回传和官网完整续答。没有每轮生成/复制/重新接入/批准。当前批准原生读回仍为14:28:22、原installation`da7b0581-5788-45c5-8316-ea7c03130d51`/generation2、任务1.1.2及原精确地址/参数。

NC-03普通解释且明确不要执行：完整助手无任务代码块、没有第三个Task/结果，侧栏显示本条未执行且无旧完成回执。NC-04请求五条：AI明确说明当前固定任务只支持三条，本条未执行、未生成任务指令，不静默降为三条；侧栏同样保留no-candidate。NC-05的完整无协议不执行和清楚解释由这些原生负例及专属组件用例共同证明，不把最初cancelled轮误写为完整无协议。ChatGPT在后续轮次逐步逐出最旧DOM前缀，证据按消息ID/原Run逐轮保存，不用最后页面节点总数推断全部历史。

**应用说明收敛与待完成交付：** 真实已安装0.3.6首页仍提示每轮复制，因此只改本项目沙箱概览/帮助文案与描述，版本0.3.8，权限、delegatedTasks、业务逻辑和Task源码未变。按原打包器候选→61项相关包/UI/恢复/可信来源检查→同打包器promote/check完成，唯一包SHA`de7c7aa0fb47799bdb2b9f850529eaaa4c1985b0e3620f7971e8e13928e1a1e2`；安装仍待原生核实。可信使用说明补充普通聊天可先发送能力说明一次（只限该聊天），当前任务将核验/启动/释放待确认/回传待确认显示为中文。日常原writer正在重读这两项最终来源pin，无静态build或第二writer；前述双轮证据绑定b0f4候选，最终说明版指纹与普通/c回归另记，不偷换同候选。

**Go边界只读核对：** 本机`opendesk browser doctor`返回connected=false、local无extensionId；Chrome NativeMessagingHosts仅发现旧`org.opendesk.browser_core_demo`配置允许jpj…，不是本轮ljcl…的配对证据。未修改或修复任何Native配置。此次真实Task明确返回`inputMode=isolated-dom`，不依赖该Go连接；以上Chrome原生操作/持久结果通过，绝不据此宣称Go Native配对通过。Go Native仍NOT_CONNECTED/NOT_TESTED且不阻断本次既有DOM核心链。

**最终同候选收尾（2026-11-03，dev 核心完成）：** 最终持续开发revision为`a9f14460bb9bd534702fb81efeac87a3c60ca4509236693d2eaf190436a3f6a2`，tool-shell SHA`ff9d5f16c55ab74b6777580c9853fcb71b31ecd761909af1a0d81912ed5b1289`，Bridge SHA`7f3f61691db52fcd0f9168f3255bb421d7f8a1843ab27760846c810472e7efc1`。Chrome调试实际回读同revision及“开发服务已连接”，仍是原ID、固定目录、唯一writer79748。说明包0.3.8沿原安装器从已安装0.3.6原位更新，审阅显示权限未变化及候选规范SHA与de7c…一致；更新后首页实际显示正常需求入口，未再次启用或批准Task。

普通聊天的一次接入曾被官网将原始网址转为富内容，原安全检查在发送前阻止，users=0、零Task；仅清除逐字确认属于本测试的未发送草稿。修复一次说明为单段与JSON网址转义，保留解码后的精确地址/参数，不放宽富内容或发送见证。定向先RED后24项通过；原生复制取得778字、SHA`3185742fff35e1a0f234a91380219c5046e930ef3beea90ebcb1ed330b7d7c56`，官网空编辑器逐字读回、无富内容后只发送一次说明。原项目已保存的有效763字说明不需要重做或扩权。

NC-07在普通`/c/6ae9c70a-68fc-83ec-997d-7aabfeab93b0`先进行一次可见说明确认（无任务），随后正常发送NC-01同一中文需求；AI新候选`wf-f259bd17-55ff-4c05-bdad-c28e206e9e71`，Request`2b3d3687-75dd-4eb1-a373-4b16d4ec50a4` / Run`442c97ee-846c-4cb2-8440-b112e5186192` / Result`a71d2d0d-842b-4295-851a-d83729233ee3`。原Task仍为1.1.2，原批准未变；独立DOM再次匹配首页填写、一次搜索及三条数据。可信“查看完整结果”的实际AXValue与原聊天本轮完整data逐字段/字符串一致，同Run持久核验、released、单次交付及完整AI续答均确认。此结论是一次接入后的普通聊天首条任务，不冒称全局未接入聊天会自动知道本地能力。

另在独立无执行需求聊天中原生点击官网“停止”一次，真实最新turn为cancelled，侧栏明确“本条未执行：官网已停止本轮回复，没有完整任务候选”，不再永久等待，零Task。测试聊天已关闭；成功普通聊天与真实同Run回执已恢复保留。中途预览标签被前置时，URL守卫拒绝后续UI动作，没有在离线HTML上点击或将其记作通过。

本轮精简证据为[normal-chat-20261103.json](../evidence/normal-chat-20261103.json)，关键料件NC-01–07已分别更新实际等级；NC-06保留组件与当前受影响原生核心的分层，不宣称完整原生故障矩阵通过。原始DOM/AX/复制读回/完整消息仅留忽略目录`artifacts/webflow-auto-20261103/normal-chat-01a1a0ef/`。本任务唯一goal对应的正常聊天dev核心已满足；MCP、production、跨对话编排、持久队列、全量对抗/原生撤权与IME/UNKNOWN注入矩阵及产品评分继续NOT_TESTED/延期，不自动进入旧目标阶段。仅本轮源码、唯一0.3.8包、料件与精简证据安全保存main；预存12.10 MCP和其他owner改动不混入，不推远端。


### 12.11.17 普通新范围待批准与同候选执行（2026-11-03）

**本轮核心已完成，未进入 production / MCP / 全量验收。** 原固定范围及 NC-01–07 的历史通过证据直接复用。本轮先在真实普通聊天发送“请用 OpenDesk Browser 在百度搜索 OpenDesk Browser SDK，给我前三条自然结果，并根据实际返回内容总结。”，随后沿原入口修复并验证新精确范围；没有给用户消息附候选 JSON，也没有使用单次协议生成器。

**实读与根因：** 初始 main 为 `297b192ea`，Chrome 实际启用原 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`、加载原 `dist/development`，复用唯一 `npm run dev`。真实 Task Catalog/安装核验投影的 Schema 允许 1–120 字关键词、固定 `limit=3`；Task 仍为 `baidu.search.top3@1.1.2`，installation `da7b0581-5788-45c5-8316-ea7c03130d51` / generation 2，源码与 manifest Hash 沿原基线。应用仍为已安装 0.3.8；两者未升级或重装。初始能力说明仅列已批准样本，导致 AI 误认新关键词不支持，原侧栏如实显示无候选未执行。

能力说明改为分别列出真实已安装任务的完整 Schema 和当前精确批准。普通聊天只原生发送一次可见说明，逐字回读且保留单段文本及 JSON 网址转义，不修改全局设置或既有项目指令。能力说明复制来自 `1cf75a0432fe…` 的真实可信 UI，随后保留聊天上下文；最终两轮任务均在 `d623f73025c1315a1e755555b1f174938b756599618d3c15648a60ab490bfa41` 执行，tool-shell 字节未因后续发现器修复改变。初始无候选和中间失败候选不拼作最终同候选通过。

中间候选 `wf-a11ce66b-9ed3-4225-80e1-66e9a33f04db` 已由官方完整回复产生，但官网曾短暂将用户轮次标记 cancelled，旧发现器提前退休发送见证，故零请求、零执行；该候选封存且未手动采用。修复在原 discovery/site/page：原生 Stop 手势才退休该轮见证，短暂 DOM 标记不自行丢弃发送；停止后迟到回复仍不可恢复。未让本地执行器猜自然语言，也未放宽完整回复、来源或五字段规则。

**唯一链路的最小修复：** `AutoSettings.tsx` 提供 Schema 能力说明；原 `admitAutoTask` 在完成参数/安装/来源核验后，请原持久 trigger ledger 保存 prepared 候选。缺精确批准时返回明确待批准而不 reserve/execute/start。可信 `CurrentTask.tsx` 展示原参数、候选、来源和安装身份，原生“批准此精确范围并执行”经原 Host 与 ledger 核验同一 request/candidate；在既有存储中写入精确批准和本请求批准并读回确认，再通知原 page 执行。原 reserve、check-consumed、Authority `withControllerAdmission`、controllerSubmitted、原 Task、持久结果和原聊天交付继续逐次围栏。新增待批准记录也不能绕过 Controller 提交保护；取消、撤权或 ACK 未知时不补发、不换身份。无新 Runner、Host、授权层或数据库。

**真实两轮：** 普通 `/c/6ae9e75a-50a8-83ee-8a51-10e89c3ab42a`，最终开发 revision `d623f73025c1…`，真实 UI 确认 serve 已连接。

| 操作 | candidateId | requestId | Run / Result |
| --- | --- | --- | --- |
| SDK 新范围 → 待批准 → 原生审阅执行 | `wf-f0515191-60cc-4c6f-81cd-3c4eb8d44eaf` | `00e759e2-81ca-4904-970e-eb4b50bdb7c4` | `3865425b-1432-4042-a594-cab2e1f8fcdb` / `cd4bb918-ccdd-4cd1-807f-d62e63d8e1cb` |
| “请再按刚才的关键词搜索一次，仍取三条自然结果，并用这一次的返回重新总结。” | `wf-6ed1390b9a0d4d6fa5b0c9e04a31b82f` | `af3cdca7-21c1-41ff-a846-22c122e4a077` | `e30cdc82-9c47-4838-b51c-67800a5e4ce9` / `ed8d7f5c-099c-4b83-bce1-805d125f35d3` |

第一轮在可信界面审阅 `OpenDesk Browser SDK / 3`、百度首页和原安装身份前，显示明确待批准、没有 Run/结果，发送前启动的只读观察器未见百度目标。原生批准后同一候选执行一次；第二轮未再次接入或批准。两次目标分别为 tab 759148605 / 759148607：独立 DOM 均记录首页空输入 → 填入 SDK 关键词 → 一次搜索 → 三条结果。按 Task 的 title/summary 截取合同逐条比较 slot、URL、标题和摘要，两轮真实 DOM、可信“查看完整结果”和原聊天完整 data 一致；执行 completed、同 Run 持久核验、released、每轮单条交付及官方 AI 完整续答分别确认。所有上述候选/请求/Run/结果均封存，禁止重放。

**精确批准与负例：** 现行 `grants[taskId]` 仅保留一个精确范围，2026-11-03 22:04:43 的新批准替换原 `OpenDesk Browser / 3` 为 `OpenDesk Browser SDK / 3`，未扩为通配或并存授权。最终可信刷新确认 SDK 范围仍有效且总开关开启。旧关键词重新请求会待批准；候选 `wf-9c35d01c-71a3-4a65-9a88-4cb990be62ce` / request `41f685f0-0867-4bd0-84a1-31a17e7ec536` 经可信取消后，Run/Result 均 null，只读观察器零百度目标；迟到批准不恢复的竞争条件另由组件验证。五条请求被 AI 明确解释为 Schema 不支持，没有候选，没有偷改为三条。普通解释无 Task。最终候选下的原生 Stop 留下 `native-stop-witnessed`，明确本条未执行、零新 Task，不永久等候。

**验证与驱动边界：** 定向组合 182 项通过；补充批准 ACK 丢失及批准持久写入期间取消后，两文件 28 项通过（其中 2 项新增，去重共 184 项）。验证新范围待批准、同请求执行、精确替换、权限/安装/来源、撤权、防重放、原生 Stop、结果及草稿/附件/IME 保护；未运行根全量测试。可信两组件 pin 仅更新本轮 Web Flow 项，保留并行 Cookie pin。旧 pin 曾阻止 dev 发布，修复 pin 后由同一 writer 恢复；未另起 writer 或复制静态扩展。

原生驱动的菜单/窗口守卫、动画或被裁剪 AX 坐标先按驱动诊断：第一次坐标落在被裁剪内容，核对仍待批准后滚动到实际按钮再执行，未改产品适配坐标。证据读取器曾在第二轮 UI 上校验第一轮，断言正确拒绝；随后仅在原“开发 → 查询任务”按第一轮确切 runId 读取原持久快照，确认同 Result/released/完整 value，无任务重跑。主世界无法读可信 Shadow UI 的空结果未被当作执行证据。浏览器检查会话已 finalize，普通聊天和原 dev 服务保留。

精简证据为 [normal-new-scope-20261103.json](../evidence/normal-new-scope-20261103.json)，料件扩展 NC-08–10，原始 DOM、AX、消息、真实原 Run 快照及日志仅留 `artifacts/webflow-auto-20261103/new-scope-01a1a19b/`。本轮仅 main 本地保存；预存 MCP 段落、并行 UI/预览、Cookie、ScrapyJS 和云控改动不混入，不推远端。MCP、production、Go Native 配对、跨对话编排、持久队列、完整原生撤权/代次/IME/UNKNOWN 故障注入、缩放压力及产品评分继续 NOT_TESTED/延期。

### 12.11.18 用户指定固定协议提示词两轮实测（2026-11-03）

**用户指定的两轮固定协议原生操作已核实，owner 01a1a1e8-b9b0-7c63-a7d7-490dd8f7de3a。** 用户此前仍未认可核心完成；本轮直接制作并发送可复制的官网测试提示词，要求官网 AI 自行生成全新五字段候选，不重放历史 JSON。现有普通需求入口及 12.11.16–17 的限定证据保留。本任务先实读 `get_goal=null`，再按明确要求建立本任务目标，不改写其他任务生命周期。这是本次指定操作链的实测结论，不代替用户亲测或长期产品验收。

**发现、复用与写入范围：** 正式业务 owner 为 `projects/webflow/`；组合应用沿原可信 Web Flow UI、ChatGPT Bridge、已安装 Task、Authority、RunHost 与持久结果。无已证实源码缺陷时不改实现、不打包/升级。只新增 `tests/protocol-auto-first.prompt.txt`、`tests/protocol-auto-followup.prompt.txt`、本轮精简 evidence，以及本节；不接管 UI/preview、README、Cookie/ScrapyJS/云控、预存 MCP 或 provenance 改动。共享计划仅追加本节，提交时只暂存自己的精确片段。

**现场与起始操作：** `main@f51ca3410`；旧任务明确交接真实 Chrome 焦点及本轮业务。本轮复用 Chrome PID516、窗口759148456、聊天tab759148601，唯一 dev writer79748、43119/43120；原 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`。真实调试页显示 serve 已连接，revision `d623f73025c1315a1e755555b1f174938b756599618d3c15648a60ab490bfa41`。可信授权 UI 读回总开关开启、百度首页、`{"query":"OpenDesk Browser SDK","limit":3}`、22:04:43 原批准、Task1.1.2/原SHA/installation/generation2，未重新批准。起始操作为原生发送提示词 A；发送前启动只读百度观察器，逐字核对空草稿/无附件/完整闲置，观察新增消息及完整协议，再分别核对真实搜索、同Run持久值、released、单次回传与完整续答。原始材料独立保存 `artifacts/webflow-auto-20261103/protocol-01a1a1e8/`。此双轮原生验证由用户指定入口触发；未改源码不重复旧 Node/构建矩阵。

**用户可直接复制的实际料件：** [提示词 A](../tests/protocol-auto-first.prompt.txt) 与 [提示词 B](../tests/protocol-auto-followup.prompt.txt)。两条均为单段文本，已填入真实 Task、网址与精确参数，只要求官网 AI 自己生成新 candidateId，没有封存候选或待用户填写的字段。目标网址保留 JSON Unicode 转义以避免官网富内容转换，解析后仍是原精确百度首页。无需每轮到侧栏准备或复制 JSON；保持当前 Web Flow 自动运行及原精确批准即可。两条分别在本任务进展中完整交给用户，并原生粘贴、逐字回读后按 Enter 一次。第二条在第一轮完整续答结束后发送，没有接入、采用、执行或批准点击。

| 测试 | 官网新 candidateId | 原请求 / Run / Result | 实际结果采集时间（北京时间） |
| --- | --- | --- | --- |
| A | `wf-7da1b8e4-62c9-4e35-a0bf-19f6d2c8437e` | `7a695d58-dd5a-4272-a03b-8978e51672d4` / `770c533f-d9ed-419c-a007-792db9bd23a0` / `816960c3-0341-4ef2-b31f-bba8ec640190` | 2026-11-03 23:02:00 |
| B | `wf-2bd5e1a7-c880-4efa-9f14-51d8cfe703ab` | `f247e6de-88e3-4484-b6be-df3efb8fc243` / `33614af9-9705-4c00-8a25-d120c44ada21` / `204e53c9-b736-4ca5-8ea3-cb1d0fdfe471` | 2026-11-03 23:05:19 |

**逐段实证：** 两轮官网完整助手回复各只有一个 `opendesk-task` 五字段代码块，均通过现行 `validateWebFlowTaskIntent` 直接校验。发送前已启动的独立只读 DOM 观察分别记录目标tab759148609/759148611的首页空值→填写关键词→结果页；原 Task trace 各仅一次搜索点击。固定 Task 返回的三条网页容器在独立 DOM 的顺序、slot、标题、URL/directUrl、摘要截取与可信“查看完整结果”原始值及原聊天完整 data 逐项一致。两次脚本均 `completed`、业务 `success`/3条；原可信 UI分别确认同一Run/Result、资源已释放、原聊天已确认新增结果消息；原生展开“本次身份”核对候选到Run绑定。每轮原聊天仅一条对应完整结果，官网续答均为complete，按这次真实data总结且没有再产生任务候选。最终当前任务显示“真实结果已回传，官方 AI 已完成回复 / 触发：持续批准自动执行”。以上身份全部封存，只复制提示词让AI生成新身份，不复制实际回复补跑。

**归类与边界：** 本轮没有产品源码、Task或沙箱包变化，因此不升级、不打包、不重复184项组件回归。旧同指纹的limit=5明确不执行、新精确范围待批准/取消及原生Stop等证据按[上一轮证据](../evidence/normal-new-scope-20261103.json)复用，不冒称本轮重跑；新范围仍须可信审阅，不能静默改参数。最初浏览器快照读取超时无发送，后续用用户明确允许的原CGEvent/AX驱动与只读DOM观察完成；身份控件首次被裁剪未展开，滚动后真实展开核验，没有为驱动错误改产品。Chrome扩展详情另实读原ID的加载路径为`~/文稿/workspace/opendesk-browser/dist/development`；dev两项产物SHA与前轮一致。只读观察器已停止、检查标签已关闭、浏览器检查会话已finalize；原聊天、侧栏、批准与原dev writer保留。

精简证据为[protocol-prompts-20261103.json](../evidence/protocol-prompts-20261103.json)，包括实际提示词摘要、原生消息ID、两轮完整身份、独立网页/持久/回传核对及原始材料SHA。这里验证原固定Task的可见结果及完整桥接，不宣称任意网页自然排名、全站广告审计、MCP、Go Native配对、production、跨对话、持久队列、完整IME/撤权/UNKNOWN故障矩阵或评分通过。保存到现有main本地提交，不推送，保留并行未提交内容。

**用户再次要求先实测成功再交付提示词（同owner，两轮新请求已确认）：** 起始实读main@96c63ab34、get_goal=null；原聊天仍空草稿/无附件/完整闲置，但原79748及43119/43120已无监听。已恢复同一固定`dist/development`唯一`npm run dev`（node54212），真实调试页确认已连接、原d623指纹与两项产物SHA均一致。编译期间授权UI曾显示“安装已变化或不可用”，编译完成后原生刷新即恢复原有效精确批准，原22:04:43批准、installation/generation及Task均未变化，未重新授权。此为环境恢复，未发现需修改实现的产品缺陷。沿原提示词A/B重新测试，两轮均由官网AI生成新候选，旧candidate/Run/result全部封存不重放。写入仅本段、原证据追加本次实测及独立`artifacts/webflow-auto-20261103/confirmed-01a1a1e8/`原始证据；不改并行UI/preview、README、MCP/provenance或其他工具。两轮真实网页、同Run持久结果、released、原聊天单次回传与完整续答全部确认后，才在本次最终回复给用户提示词。

复测A：官网候选`wf-8f2a719c-55b4-4d3e-9e12-c0d78a6f423b`，Request`52396a6c-1f82-4efb-be5d-ac03e1b44586` / Run`bd51c8cc-af5e-4163-bbdc-df4af1807c32` / Result`fc935d48-7397-48ba-abcf-915753e77f31`；23:23:16北京时间采集成功。复测B：官网候选`wf-4e92b7c1-6f3a-42d8-9a05-7c1e63b8d294`，Request`edf2d87c-5116-4363-8752-4261c62d34db` / Run`017e33e5-ff02-4b1b-946f-46a718d7592d` / Result`229b70ba-8e3c-4e56-995e-6d7be400f0a2`；23:26:24北京时间采集成功。原生发送各一次，原批准内自动执行，无采用/执行/再批准；两轮目标tab759148615/759148617均独立记录空首页→填写→一次搜索→3条结果，完整持久值与原聊天data逐项一致、released、各一条结果回传且AI续答complete。当前UI再次明确“真实结果已回传，官方AI已完成回复”。本次没有仅以旧完成状态或Node数量代替实际运行。

官网AI仅看到回执，续答保留对原始槽位1/2/5的排名/过滤不确定性。本轮额外只读DOM核对实际顺序：槽位3为`bk_polysemy`百科卡，4为`recommend_list`推荐模块，都不是原固定Task的`.result.c-container`普通网页容器；实际前三个普通网页容器为1/2/5，与返回数据一致，三行未见精确广告标签。此为当前固定Task的网页容器选择核对，不扩大为全站广告或任意自然排名认证。新协议也经现行parser校验；旧权限/来源/防重放组件证据复用，无源码变化不跑全组。证据追加在原JSON的`latestReconfirmation`，保留旧两轮及其原始摘要；只读观察器已停止，原聊天空草稿/完整闲置，开发服务与侧栏保留运行，不切换安装环境、不推远端。

### 12.11.19 用户实际项目入口拒绝与旧项目说明修复（2026-11-03）

**原失败项目入口已修复并完成两轮原生核验，owner 01a1a1e8。最新用户反例优先：** 前两次只覆盖普通`/c/`聊天，不能证明用户当前项目聊天可用。本轮main@e8957b483、get_goal=null；真实用户入口已变为`/g/g-p-6ae779125890819197fcee27dd51d25e-opendesk-browser/c/6ae9fe60-ba0c-83ec-b275-68d0ad030e72`，tab759148601。用户原消息`de473f2d-f427-4194-ab42-3a7299f1e477`确实请求SDK关键词；官方完整助手`a314f57e-44f3-46fe-920d-cf5b5d600627`明确拒绝、零协议块，原发现器留有原生提交/新用户/完整回复见证，可信侧栏显示no-candidate未执行。本轮失败在AI产生候选之前，没有Host或Task Run，不重放历史身份。

**根因与最小修复：** 实读项目设置的“说明”仍是763字历史能力说明，要求完整精确范围一致才产协议，且只列`OpenDesk Browser`；可信侧栏当前实际批准却是原22:04:43的`OpenDesk Browser SDK / 3`且授权有效。当前`ChatGPTConnection`源码和真实“复制项目能力说明”已正确区分Schema与批准，问题是上轮普通聊天更新未同步这个项目的持久说明。原生打开项目设置，保留旧值及SHA；确认内容仅为旧Web Flow说明、无其他用户指令后，用真实可信UI复制的1336字新说明替换旧块，逐字回读、原生“保存”、重新打开项目设置核对持久值SHA`3ba3627b8fc0f95dd1189db8867288ac692a008a06639f19c5f2655f5737bd19`。新说明允许Schema内新参数产候选等待原可信审阅，不授予权限、不改批准、不修改Task/Host。

**本轮范围与验证：** 只修当前项目设置、追加本节与项目精简证据/必要料件；浏览器源码、沙箱包、并行UI/preview、README、MCP/provenance、Cookie/ScrapyJS/云控不写。原dev54212持续监听43119/43120，沿固定dist/development和原ID；本任务未重启或构建。已回到用户原失败聊天，原生重发该条实际文本（包括用户复制后实际的双反斜杠转义形式），由官网AI生成合法新候选，再发送第二条请求，分别核对真实网页、同Run持久值、released、单次原聊天回传和AI完整续答。原始证据只留`artifacts/webflow-auto-20261103/project-fix-01a1a1e8/`。UI驱动遇到菜单被浮动工具遮挡时，截图后点实际可见区域；误点只插入了本测试可精确识别的未发送模板，已逐字核对归属后原生清除，零消息发送，不为坐标错误改产品。

| 原项目聊天操作 | 官网新candidateId | Request / Run / Result | 采集时间（北京时间） |
| --- | --- | --- | --- |
| 逐字重发实际失败输入 | `wf-59149935-bf25-479c-af08-6e3eff8452f9` | `468488b6-d6b0-4c7a-ada8-ddf31a426029` / `d118ce3d-544f-4ca2-9b9d-f24fa228a113` / `f98fdb4f-138a-4c49-8a5a-6336ac4b6254` | 2026-11-03 23:47:40 |
| 同一项目聊天发送原提示词B | `wf-2a8e4b91-60d7-43ca-aea5-0db3c4fa721e` | `0259d550-1cda-463a-9d30-52311d8663ba` / `3dc163cb-e6ef-43d5-aee6-f44ffc46fe45` / `31904475-5762-4a85-a20b-558dae9cc4a1` | 2026-11-03 23:51:08 |

两轮均无需采用/执行/再批准，自动调用原Task1.1.2。独立DOM分别记录tab759148619/759148621空首页→原SDK关键词→一次搜索→三条普通网页结果；title、URL/directUrl、summary及顺序与可信完整持久结果及原聊天data逐项相等。原UI确认同Run/Result、released、单次新增结果消息，原生展开身份确认每次候选绑定；两轮官网续答均complete且没有继续产生任务候选。这里确认桥接及这次原固定Task的真实操作，不把模型对全站排名/广告审计的保留意见偷换成独立全面验收。原先普通聊天通过的结论仅保留其原入口范围，不再覆盖本项目失败反例。

精简证据：[project-instructions-repair-20261103.json](../evidence/project-instructions-repair-20261103.json)，保留原用户消息/拒绝、项目说明前后SHA、真实保存重开回读、当前原批准、两轮完整身份及原始材料SHA。读回校验器曾把保留的隐藏历史DOM节点算成原失败轮，已按精确用户/助手消息ID核对；未修改产品或重跑Task制造通过。真实浏览器及三个可信UI输入已明确交给UI任务01a1a216，只读观察器停止，交接时空草稿/无附件/idle、无UNKNOWN。该任务后续UI/CSS/pin变化另绑候选，不提升本轮d623证据为其95+通过；本任务继续仅保存文档/证据并在main本地提交，不推远端。

### 12.11.20 任务范围授权与换关键词免重复批准（2026-11-04）

**当前操作与失败：** 用户在自动运行已开启时，请求百度搜索“时间清单 / 前三条”，候选 `wf-f99782c5-10d2-4ac7-b9d5-442303d1e499` 停在“待精确批准”。源码证实 `assertAutoGrant` 原来逐字比较包含 `query` 的完整 args，并且新批准替换旧输入；因此只对同一关键词自动运行。沿用用户已提供的真实失败，不重放该候选或自动批准本机权限。

**Owner / 类型与复用：** 仍为现有 Web Flow Combined Application。可变搜索输入策略归 `projects/webflow/src/authorization-policy.js`，存储匹配归原 `src/auto-grants.js`；可信 UI 仍由本项目两组件静态编译，最小接线只修改原 Bridge Host / Trigger Ledger / Page 提示。继续复用原 Schema 校验、Ledger、Authority、Controller 和持久结果/原聊天交付，不新增沙箱授权 API、Runner、数据库或安装器。沙箱源码、工具 JSON、Task 1.1.2 与安装身份不改；UI owner 01a1a216 的间距、40px 等宽页签和状态卡片完整保留。

**实现行为：** 可信任务审核可选择“允许更换搜索关键词”，从真实解析出的固定安装 Schema 保存 `parameterPolicy`，仅 `query` 可变；`limit` 等其余参数、精确目标和全部安装 pin 保持固定。Host 拒绝伪造/过期 Schema 和非已审阅可变字段；Ledger 在准入、预留及最终提交前核对新规则。当前待批准卡片用原候选/请求保存规则并只执行一次，随后新关键词的新候选无需重批。旧授权仍精确；“改为允许更换关键词…”只预填并展开原审核，不自行保存或启用。高级固定输入模式保留，切换授权方式使旧审核失效；完成授权后刷新父级授权摘要。原始候选/来源/安装明细折叠，普通审核先读可变字段、固定边界与本次输入。

**定向验证与证据边界：** `node --test projects/webflow/tests/auto-grants.test.mjs projects/webflow/tests/auto-host.test.mjs projects/webflow/tests/auto-settings-ui.test.mjs projects/webflow/tests/current-task.test.mjs projects/webflow/tests/reply-admission.test.mjs projects/webflow/tests/sidebar-bridge.test.mjs`：85 PASS。新增回归先在旧实现失败，修复后不同关键词经过原最终提交且重启保留同一批准；空/超长关键词、五条、缺失/多余参数、目标变化、各安装身份变化、撤权/停用、旧精确批准、伪造 Schema、原请求只消费一次及真实事件转交均已覆盖。切换原生 select 的 Linkedom 夹具先清理全部旧 selected 再选择目标，避免测试驱动产生空选择；未为驱动错误改变产品。固定构建门禁新增 `authorization-policy.js` 精确 blob，原 auto-grants/两 UI pin 同步；`node --test --test-name-pattern='Web Flow keyword policy' tests/environment/bundle-provenance.test.mjs`：1 PASS，验证合法目标、错目标、字节漂移和 symlink 拒绝。修改的 JS 语法检查及 diff 空白检查通过。

**用户要求启动与实测（2026-11-04，进行中）：** 已通过原生侧栏“调试 → 本地开发服务”实读原扩展 ID 与已连接 `97b1997586d5`，并真实看到新授权文案。可信审核一次保存可变关键词规则后，普通消息“时间清单 / 三条”生成全新候选 `wf-5f7a0bfd-015f-4d0f-a447-6cd5e1156602`，无需再次批准即产生 Run `6838d5d4-852b-46af-926e-25f581362f2f` / Result `725d296f-aee1-43e3-968d-1aad4308f9fd`；技术执行 completed、资源 released、单次原聊天交付及 AI 完整续答已核对，但旧 Task 1.1.2 的业务结果是 `stopped / E_STRICT_MODE_VIOLATION`，不能记搜索成功。已在原 Task owner 修复隐藏重复按钮，1.1.3 候选及 18 项定向检查通过；原生开发草稿同源码 SHA `14b8dd8d…` 已填写并点击到百度 `/s`，但 UI 显示已停止，仍需原持久 Run 原因对账。随后同一侧栏显示旧 ScrapyJS 1.7.4，并被“当前工具正在保存”阻止导航；已交该实际故障 owner `01a1a253-cd68-7f40-bf44-f6bce4c15691` 独立修复，本任务暂停受影响的 UI 操作、不清锁或重跑。当前真实事实及未完成步骤见 [authorization-runtime-20261104.json](../evidence/authorization-runtime-20261104.json)。新页签产物 `5e9966bf46e8` 已磁盘发布，最终两关键词与独立整体评分仍未完成，不继承旧组件 99 分。

**新 owner 原 Run 对账与最小修复（2026-11-04）：** 本任务已接管 WebFlow，沿新普通窗口 `759148633` 的真实“开发 → 运行结果 → 运行记录与技术信息 → 刷新运行历史 → 完整历史与版本身份”只读取得完整 AX Value。原 `14b8dd8d…` Run 为 `cc354f76-bfd0-41c2-8d79-d1942ece6bee` / Result `e9bf334d-1792-4fdf-a73c-ffd7680f5c95`，目标仍是原窗口 `759148456` 的百度首页 / tab `759148631`，终态 `stopped / E_TIMEOUT: Controller fenced`、`workerRetired:true / released`，没有业务结果；未补跑、未操作原未知 AI 文档。原草稿入口固定 30000ms，Task manifest 为 60000ms，不能用页面已搜索代替验证。当前仅在原 Task 业务源码内将独立只读字段分组并发以缩短提取耗时，动作保持顺序、未知点击不重放。预期写入：`examples/tasks/baidu-search-top3.js`、同目录唯一 `baidu.search.top3.v1.opendesk-task.json`、`tests/environment/baidu-search-top3-r1.test.mjs`（已有 owner，必要回归）、WebFlow 原适配器中相应版本 pin、候选/正式工具包及本项目原 README/执行计划/证据；不改 Framework/SDK/Authority。浏览器短时已明确交给 ScrapyJS owner 仅验证其返回行为，本任务此时只做本地 Task 工作；原 writer54212 保持，相关完整原始记录在既有 artifacts 目录。

**已证明的通用开发入口缺口与当前范围：** `docs/api/controller.zh-CN.md` 已公开 1–120 秒运行期限、Task 1.1.3 固定 60 秒；`src/ui/controller-draft-run.js` 的唯一草稿入口却固定 `Date.now()+30000` 且无 UI 选择，造成同源码 `cc354f76…` 与 `986b2ce4…` 在验证阶段到期。原生只读测得每读取约 0.4–0.7 秒、六项并发约 3 秒，原只读链串行处理；在业务目录分组 Promise 无法消除期限差。改用公开 `$$eval` 的另一次有意验证返回 `E_USER_SCRIPTS_UNAVAILABLE`（Run `48de3d90…` / released），会新增原 ISOLATED Task 不需要的环境条件，已将本轮这些尝试保存到 artifacts 并仅撤回自己的源码/包/pin/夹具改动，恢复原 `14b8dd8d…`。因此由平台 Runtime Skill 最小开放现有草稿 deadline 参数：`src/ui/controller-draft-run.js`、`src/ui/develop-fields.js`、`src/ui/react/tabs/develop-execution.tsx`、`src/ui/script-editor.js`、已有 `tests/environment/sidebar-draft-runhost.test.mjs`、`docs/api/controller.zh-CN.md`；默认仍 30 秒，只允许合法 1–120 秒，可信点击内冻结，准备中变更拒绝旧启动。全体长时 Controller 草稿均可复用，不新增 API/Registry/Host/Authority，不改 manifest/权限/执行世界/Stop/未知围栏；已安装 Task 仍受其原 manifest 期限约束。复用原 dev writer 发布并定向验证，未经同候选 Chrome 证据不记通过。


**当前候选原生进展（2026-11-04 02:10）：** 原 writer 已发布并真实侧栏连接 `e694cd406fc4…`；四个草稿期限相关 source map 正文与当前源码逐字一致。原 `14b8dd8d…` 在可信 UI 选择 60 秒后，Run `898172bf-3dc6-4d93-a38c-3cab0900ccf5` / Result `e9e3c5d3-039a-41e5-aad2-dbb1b32cf9a2` 实际填写、点击一次、读三条，`success/count3/completed/workerRetired:true/released`，三条标题/URL 与独立页面观察一致。沿“我的 → 添加任务 → 浏览任务目录”导入 1.1.3，用该原 Run 核对证据、设为本地可用并安装；随后原打包器候选→36 项相关应用检查→晋升→check-project，正式工具 0.3.9 SHA `6dbc185f…` 已通过安装器原位更新（权限未变化、保留数据）。新 Task 安装身份的关键词规则原生重新审阅一次并保存有效，旧身份先真实显示需重批。第一条普通聊天“OpenDesk Browser SDK”由 AI 新建候选 `wf-5876ac36…`，未经第二次批准即产生 Run `e7ec7825-f7e6-47d5-819e-50aa572cda1e` / Result `b3c39290-59f7-4449-aa15-1e3ca4993980`，原聊天一次回传 `success/count3`，AI 后续回复已完整且位于本次结果用户消息之后。原持久 retirement 和第二词仍未完成。约 02:05 出现窗口移位、Cookie Editor 界面/授权提示及外部 Cookie-Editor 弹窗，已只暂停 Chrome 输入并向活跃 Cookie owner `01a1a295-afc1-73c3-aae0-44308af99dc3` 协调焦点；不将此状态当作 WebFlow 新需求，不批准 Cookie 权限，不清锁、不重载、不重放成功 Run。

**连续第二条的真实阻塞与宿主路由修复（2026-11-04）：** 原 A Run 已完整对账 completed / workerRetired / released，三条内容逐一匹配 DOM，原聊天唯一结果消息与其后的完整 AI 回复均已核对。第二条普通“时间清单”真实发送产生 `wf-0d6e3c42-71f8-4cb6-9e5a-2a4602dcf95b`，网页发现记录经过 native-submission-witnessed → unique-complete-reply-observed，但没有新的 Run，当前任务仍指向 A。原生字段可编辑、执行不可用，结合 Page guard，旧请求已 attempted 且未 settled；没有重放 B。A 持久 run.identity.hostInstanceId 为 `635e8084…`，本窗口观察过 `0f5c1f8f…` 与 `3ad5b358…`；现有固定 runtime 广播只筛同 window，准备回执与 execute 未绑定具体 Host，多接收者可出现一方先拒绝、另一方真正运行并回传，导致网页未拿到正确 execute 终态。新增测试已证实 adopted candidate 的 execute 缺少准备方 Host 定位。该缺口无法由沙箱/Task 业务修补，跨所有已安装任务通用；最小平台适配范围为 `src/native-agent/chatgpt-fixed-bridge-host.js`、同目录 `chatgpt-fixed-bridge-page.js`、原 `src/ui/tool-shell.js` Listener、`projects/webflow/tests/sidebar-bridge.test.mjs` 与 `auto-host.test.mjs`，由当前 Runtime owner 处理。仅增加真实响应 Host 的路由定位并剥离后再进原业务协议；不作为授权，不改变 AI 五字段、Sender/窗口/文档/安装/撤权/UNKNOWN 门禁，不建第二 Registry/Host。旧 Host 失联继续拒绝，不转发到另一 Host 执行。Root UI 输入异常已与 Cookie owner 做资源协调，其明确零原生手势，后续只做其源码；外部 Cookie 弹窗已安全关闭、未读取或批准其数据，回到扩展列表后正常导航可用。本任务不接管 Cookie 业务。

**当前收尾与环境阻塞（2026-11-04）：** 新路由已按独立评审补齐：先通过原只读 list-tasks 选择可见且真实的同窗口 Side Panel，再定向执行准备/授权/准入等操作；非目标 Host 同步忽略且不抢答，私有 hint 在进原业务协议前剥离。具体请求固定原 owner，隐藏不换 owner；progress/deliver 同时核对真实 sender URL 与 message 中的 Host 定位，回执错配/失联保留 UNKNOWN，不清 settled 围栏。原请求回执未知时的新消息获得明确未执行说明，旧 B 候选不重放。当前相关协议检查106 PASS；扩大读取类旧夹具后129项中128 PASS，单项 Legacy BAIDU_TASK_VERSION 固定1.0.0对当前包1.1.3的旧断言为本轮前已存在差异、未改旧产品常量；9项相关 shell 生命周期PASS，2项原 one-shot preview 夹具不适配现订阅入口而延期，未修改预览产品。旧 fixture 补 MyAgent 连接 stub、当前路由 envelope 的宿主元数据及双向 sender 负例，不用这些驱动改产品。

**上次交接的环境状态（本轮恢复见下文）：** 原 writer54212 已实读退出，43119 无监听，旧锁原样保留，当时是旧 e694 静态开发产物（serve断开），不是新路由已部署。固定源码/pin owner `01a1a295…` 已明确完成本轮来源审查并宣告稳定；其未恢复服务，本任务也遵守交接“原writer勿重启”，未清锁、未启动第二writer、未重载扩展或旧未知文档。唯一下一条未完成操作为：在明确允许恢复后，通过原 npm run dev 与同一 dist/development/扩展ID恢复持续开发；核对新fingerprint、SourceMap与连接后，保留原A/B事实，对已明确无新Run的B不补跑，以新普通需求产生新candidate，完成新路由同候选的两个不同关键词、同Run持久结果/单次原聊天/AI续答及独立整体≥95。production、全矩阵、MCP继续延期。当前get_goal实读null；不创建新总goal或伪报旧目标完成。

**用户授权恢复后的续跑（2026-11-04，owner 01a1a53a）：** 用户明确允许原 `npm run dev` 恢复，并要求设置合适目标；目标已创建且 active。固定 main@1a8c4b9ff、原目录/扩展 ID 下，由原开发锁正常恢复唯一 writer49560，没有手改旧锁。首次编译 183 秒，磁盘 / SourceMap / 真实侧栏一致为 `321cf9f4ea148ed7b876df1eae08954dc2102b39af0de8f6712fa73214399300`，服务已连接。旧 637 聊天文档持续 loading 且保留旧监听器 DOM；新候选 `wf-9c2f4a61…` 未观察到新 Run。没有为驱动 / 旧 DOM 修改产品；同一原聊天在新普通 tab759148642 正常加载并建立新发现基线，旧候选不重放。未手动操作、重载或清锁原 ScrapyJS unknown 窗口。

正常新需求 C `wf-3e7b6a80…` / Request `7fc2b878…` / Run `34e46e3b-eb50-46b7-8e14-677327999855` / Result `6334e52b-c684-45b2-92b8-4d4d1acdf72c` 自动成功，三条 title / URL / directUrl / summary 与独立 DOM 逐项一致，原聊天数据与完整持久值相等，Worker retired / released，结果用户消息 `e08e68b4…` 唯一且 AI 续答 complete。随后由正常 sidepanel.html 入口生成第二真实 Host `a5a71735…` / tab759148646，保留在同窗口后台。正常换词 D `wf-2f1c890a…` 实际启动 Run `9c700548-9a5e-4951-9c11-89e98869b1d2` / Result `009404cc…`，C/D 均由正确原 Host `5f7fcf91…` 拥有；D 已填写、点击并展示搜索结果，但持久终态是 `stopped / E_TIMEOUT: Controller fenced`、retired / released，不能记三条业务成功或补发。新路由连续派发已得到原生证据，完整双词闭环仍未通过。

**最小任务期限修复：** 原 Task 清单 60 秒不足以稳定容纳真实受控读取。候选 `baidu.search.top3@1.1.4` 只将 manifest 期限改为既有公开上限 120000ms，源码 SHA 仍 `14b8dd8d…`、网站 / 权限 / 参数不变，manifestHash `3d86dfa83de51535fef2f7a5d7ac81ec0d6905273191d1785e68881a28212bac`；不改 Framework 或放宽 UNKNOWN。WebFlow 两处委托 pin 同步，应用 0.3.10。原开发编辑器经原生复制逐字核对源码、输入固定参数并选择 120 秒后，有意新 Run `56321c09-4c89-46aa-b95d-145e7247ab1c` / Result `6ffbd5d5-2fbb-4924-8c0d-19b7e03367d2` 从百度首页完成一次搜索，持久 `success/count3`、workerRetired / released。AX 编辑器虚拟文本不完整不作为源码变化；完整剪贴板 SHA 保存在原始料件。Task18 / WebFlow36 相关检查 PASS；原应用打包器 candidate → promote-from → check-project，唯一正式 0.3.10 SHA `01433fbaae1f728d6d49ba0b60f45f25a9ac4d94b38f65e6973aa33d65d36d7b`。独立只读评审 Lagrange `01a1a56f…` 未发现 P0/P1、身份准入或期限绕过；尚未评分。

**当前准确断点与工具边界：** Task 1.1.4 已通过真实文件选择器导入目录并选中，状态仍待验证；展开“开发者：核对证据与设为本地可用”后，验证输入仍为空，没有误把其他 Run 验证或设为可用。原目录中已安装版本仍 1.1.3，应用已安装版本仍 0.3.9。随后尝试以 Browser Use 连接精确扩展页被 URL 安全策略拒绝；返回明确禁止其他控制方式达成同一被阻止操作。本任务立即停止受影响的浏览器控制并 finalize，未绕过。该阻断不来自此前已解除的“勿重启”限制。原 dev writer 保持；本地修复、包和记录继续安全保存，目标不伪报 complete / blocked。

下一条实际操作为用户在当前本地任务目录填入原 Run `56321c09-4c89-46aa-b95d-145e7247ab1c`，核对证据 → 设为本地可用 → 安装确定版本 1.1.4；再由原扩展安装器原位更新正式 WebFlow 0.3.10，对新安装身份原生重审关键词规则一次。此后两条全新普通需求、新 candidate / Run，核对各自真实 DOM、同 Run 持久结果 / retired / released、单次原聊天和 AI 完整续答，最后独立整体 ≥95。普通聊天的新需求不能重放 C/D；旧失败、未测和旧组件分数边界继续保留。production、全矩阵、MCP 延期。当前整体 NOT_SCORED，不能把 120 秒草稿成功当作安装后通过。

**独立代码评审：** 只读 reviewer `01a1a22d-9e58-7ad0-8832-3b70c8ff014e` 未发现严重或重要问题，确认旧精确授权、唯一可变字段、Host 来源 Schema、固定目标/参数/七项安装身份、撤权及原候选单次执行边界；没有操作浏览器或重跑测试。此结论只属于本轮源码审查，不等于 UI 评分或原生执行通过。

**持续开发磁盘发布（2026-11-04）：** 原 writer 自然发布 revision `97b1997586d557a7e70050343622688a63691822ec5a6de085f7d6c59dde612f`；UI owner 提供 `artifacts/webflow-runtime-spacing/published-build.json`，本任务再只读核对实际 `development-update.json`。`ui/tool-shell.js` SHA-256 为 `813fb7b18c64b30e67bf35d3b515e67a947ba56d63f4ffe70e8c7f2cc7b96846`，Bridge 为 `e7381e457c0969cea80b8e062db0b2a76b45bd0bf057510b2886a27c3e8e7b50`，SW 为 `5da28bab86305a9480f2e122eba40939e8ec5f6a3460e01728024aa372a95b4c`；均与发布清单一致。进一步对三份 source map 的 10 项相关 `sourcesContent` 逐字比较当前稳定源码：三可信组件、两处 policy/auto-grants 消费、Host、Ledger 与 Page 均一致，确认本轮授权源码已进入对应磁盘产物。此项只标 **DISK_PUBLICATION_PASS**；没有据此推断已加载的侧栏、客户端连接、用户授权或真实任务执行。

**运行资源与下一步：** 唯一 dev writer54212 及 `dist/development` 由原 owner/UI owner 协调，本任务没有新建/触发构建、touch 配置或停止服务。源码冻结后已通知 UI owner 重新读取当前 pin；实际连接与新可信 Side Panel 生效不能仅凭磁盘产物宣称通过。本任务只读浏览器检查遇到页面读取超时及 Chrome 内部页不可 claim，已 finalize；未读取浏览器存储、修改项目说明、扩大本机批准或运行任务。新的 Chrome 原生参数授权及不同关键词实际搜索仍为 **NOT_TESTED**，旧固定输入/布局截图不继承为本轮证据。下一用户操作是新可信界面中一次审阅可变关键词规则；若原候选已过期则保留原结果未知/取消边界，由后续全新需求产生新候选，不重放历史身份。production、完整矩阵、评分与 MCP 继续延期。


### 12.11.21 运行面板间距与等宽页签（2026-11-03）

用户当前要求优化「扩展 → Web Flow → 运行与授权」间距与一行小按钮并做 95+ 专家复核。真实 owner 为本项目已固定编译的 trusted/AutoSettings.tsx、CurrentTask.tsx、RuntimePanel.tsx；复用原 Button、Switch、Sheet、Tokens、唯一可信 Root 与完整宿主夹具，普通沙箱应用与公共 Host/SDK 不改。先恢复用户的历史未见证回复场景，修 16px gutter、独立开关状态组、40px 等宽页签、同行任务状态 / 刷新、长地址与状态阅读区，以及短字段 / 授权动作的对应关系。保护原查询、Stop、草稿、真实手势、来源、身份、撤权和 UNKNOWN 不重放。

本轮布局源码已由用户另行 Git 同步任务在 0561820a3 保存并合入 main（63090e6ee）；现有两份组件测试 23/23 PASS。冻结布局在真实 Chromium 完整宿主夹具中的方向键 / Home / End / Escape、焦点归还、跨 Tab / 开合后的 URL 与中文 JSON 草稿、审核 Tab / Shift+Tab 及无横向溢出有同候选图证；只准备审核，未批准或执行真实任务。独立 AI 专家 Herschel 对该冻结候选评 99/100，唯一扣 1 为首末控件双向焦点循环缺实测读回，不是已发现产品故障。详见[UI 评审第 15 节](webflow-v0.3-ui-ux-review.zh-CN.md#15-运行面板间距与等宽导航2026-11-03)与[精简证据](../evidence/ui-runtime-spacing-20261103.json)。

后续 12.11.20 参数授权业务在同两组件继续修改，布局保留但不继承本分数；新业务由原 owner 独立验证。writer 54212 继续负责 dist/development；原配置代曾因并行源 / pin 改变而保守拒绝，稳定新输入在精确准入检查通过后仅走原配置重读，未停服务、新建 writer、换扩展路径或放宽保护。真实 Side Panel 新混合候选、安装 / Native / production 及产品综合评分仍 NOT_TESTED，旧 d623 不提升为本轮原生通过。收尾时原 writer 已成功发布 revision `97b1997586d557a7e70050343622688a63691822ec5a6de085f7d6c59dde612f`（236s）；tool-shell / Bridge 实际 SHA 与发布清单一致，source map 三份可信组件正文逐字匹配稳定源码。构建 / 发布 PASS；实际 Chrome 已加载 / 开发客户端连接与新混合侧栏仍 NOT_TESTED。下一条尚未见证操作为真实侧栏应用该候选；新授权范围审阅 / 官网实跑归参数授权任务，不为此重复触发或升级旧 grant。临时对照 Browser 已 finalize，Chrome 焦点已释放；历史预览、并行文档和源改动全部保留。


**2026-11-04 页签风格后续：** 运行管理页签已复用主导航外观：公共 `od-button--tab`、选中强调文字与 2px 下划线、透明底、等宽 40px。仅两处展示 hunk 及 AutoSettings 精确 pin 改变，原回调、权限与草稿保留。既有 UI 检查 25/25 PASS，真实 Chromium 组件的键盘与草稿读回通过；独立 AI 新评 99/100 仅覆盖本轮 tabs。源码 blob `863e81bfc3dc193bf4cdc396af1f66ef97b247e5` 已包含在原 writer 发布的 `5e9966bf46e8527b6985246dd0e0ae1d74746ef9f677a3678a1ac6c82282ce0d`，映射与实际文件 SHA 已核对。真实侧栏新样式应用仍 NOT_TESTED。详见 UI 15.1 及原证据的 tabsStyleUpdate20261104；Browser 已 finalize，原生 Task 1.1.3 与两关键词验证继续由原 owner 负责。

### 12.12 通用网页适配 V1.1（2026-11-03，实施中）

**用户目标：** 经授权的网站以统一入口提出网页任务，识别已安装脚本，经原 Authority/Controller/RunHost 执行并持久化 Run/Result，安全交付和对账；ChatGPT 是首个案例，普通网站和其他 AI 站点不得各自复制运行器、授权、数据库或调度器。当前不得把下列组件阶段当成整个目标完成。

**现状和 owner：** `manifest.json` 在 `chatgpt.com` 顶层 ISOLATED 注入固定入口；`src/native-agent/chatgpt-{fixed-bridge-page,bridge-site,task-discovery}.js` 负责页面观察和聊天 DOM，`chatgpt-fixed-bridge-host.js` 在可信 Side Panel 核验文档、安装及结果并调用原 RunHost，`chatgpt-bridge-trigger-gate.js` 位于 SW 维护授权和去重，`src/platform/host/` 保留原 Authority 和持久运行。`src/cloud-control/runner-lifecycle.js` 管理原 offscreen 文档，但创建条件是云控或待处理 App Service，不自动接管网页任务。当前 Side Panel 自有 RunHost 在 `pagehide` 处置；SW 重启可能将未结任务标为 `paused_unknown`，不会恢复 JS 执行栈。保留原 Key、五字段协议、Task 安装身份和聊天回传，不把历史原生证据当成本次候选证据。

**架构结论：选择 C，Profile 是受限路由数据。** B 在站点数量很少时更简单，但站点仅改变精确 origin 时仍要改注册代码；C 允许共享固定 Generic Adapter，以受校验数据表达这种差异，同时仍需要审计过的站点适配代码。只有 Generic 的 A 无法证明 AI 页面的新用户轮次、完整回复、唯一身份和原聊天回传。三者相同的原 Authority、安装、Runner、Controller 和持久存储不另建。配置不允许远程可执行代码或权限字段，且不是授权凭证。

| 维度 | A 全 Generic | B 共享 Runtime + 专用 Adapter | C 再加受限 Profile |
|---|---|---|---|
| 新站接入成本 | 标准事件低；特殊站难 | 每个特殊站需代码 | 标准站配置低；特殊站仍需代码 |
| 代码复用 | 高，但泛化容易不正确 | 公共流程复用、站点逻辑独立 | 同 B，站点匹配数据可复用 |
| 兼容性 | 对 AI 页面完成/发送语义不足 | 可针对真实差异 | 同 B，不承诺配置覆盖任意页面 |
| 安全 | 泛解析扩大误触发风险 | 可逐站审计 | 配置需封闭校验且不授权；否则多一条攻击面 |
| 权限 | 仍需原 Authority | 原 Authority | 原 Authority；Profile 不扩大权限 |
| 性能 | 可集中监听，但全站注入代价高 | 按站点触发 | 精确匹配可限制触发；尚无实测 |
| MV3 | 固定入口可行 | 静态审计代码可行 | 配置仅数据；动态注册与撤权仍需实现 |
| 维护 | 特例最终集中 | 每站代码可能增多 | 简单站降低重复，增加配置版本及冲突管理成本 |
| 开发者体验 | 标准协议最少步骤 | 必须理解站点 adapter | 标准站填写受限配置；无须复制监听器 |
| 长期扩展 | 受单一协议限制 | 能容纳特殊站 | 同 B，另可配置复用；必须保持边界 |

**创建和管理规则：** 标准事件使用 Generic；仅 origin 不同时新增精确 Profile；必须观察特定 DOM、消息或交互时才创建受审固定 DOM/Protocol/Site Adapter；特殊权限走原独立审阅。每个 Profile/Adapter 均有独立版本；不支持的版本、冲突或失效时拒绝选择。安装和升级必须验证可信代码及配置来源、精确范围、冲突和用户原授权；撤权阻止未来准入，并对在途效果保留 UNKNOWN，不能声称撤销已发生的外部操作。多站可共享一个 Generic；同一 origin 出现多个启用 Profile 当前直接拒绝，而非以顺序取第一个。Profile、Adapter、Task Script、用户权限是四种对象：分别描述路由、实现观察、提供受控任务源码、批准能力和范围。

**本次落地的文件和合同：**

- `src/page-events/site-profiles.js`：严格字段 `{id,version,origin,adapter,adapterVersion,protocols,enabled}`，HTTP(S) 规范精确 origin、已知 adapter/协议、独立版本、重复 ID/启用 origin 拒绝；冻结选择结果。当前注册仅进程内静态数据，没有安装、升级、持久注册、撤权同步或动态 JSON 装载。
- `src/page-events/content-runtime.js`：顶层文档选择、固定 adapter 表及版本核对，不进行权限判定或执行；`chatgpt-runtime.js` 和 `src/entrypoints/chatgpt-fixed-bridge.js` 把原 ChatGPT 初始化接到该选择器。ChatGPT 的协议列表目前是静态描述，原 Bridge 仍使用原有独立协议校验，不能把修改列表误作运行时权限或协议开关。
- `src/page-events/generic-task-adapter.js`：监听 `opendesk:task-intent` 的字符串，复用原 `webflow.task.intent.v1` 严格五字段解析，输出不可信候选且支持 dispose。测试中的多站调用了真实 Generic 组件，但没有生产入口或后台消息链；网页可伪造该事件，绝不能把事件当提交见证或授权。重复候选必须最终由 Authority/原账本防重放。
- `tests/environment/{site-profiles,site-runtime,chatgpt-site-runtime,generic-task-adapter}.test.mjs` 覆盖相似域名、冲突、非规范配置、版本、顶层、共享组件和无效事件。`chatgpt-fixed-bridge-r12.test.mjs` 中两处旧 `runtime.getURL` stub 修正为包含传入路径，以匹配当前 Side Panel sender 合同；生产校验未变。

**阶段状态：** P0 已梳理原边界；P1/P2 为 `SOURCE_IMPLEMENTED / COMPONENT_TESTED` 的初始路由、Profile 与 Generic 候选组件，尚无可安装站点注册或普通网站端到端；P3 Background 通用入口、P4 受信来源到原 Authority/RunHost 的接线、P5 ChatGPT 专用逻辑完整收敛、P6 第二 AI、P7 普通网站实际接入、P8 关闭面板/Worker 重启/撤权/UNKNOWN 的同候选原生验证均为 `NOT_TESTED` 或未实现。不得将静态选择器、历史 ChatGPT 原生结果或 Node 测试写成 `CHROME_NATIVE_VERIFIED` / `PRODUCT_DONE`。

**下一条工程任务：** 在原触发账本与 Authority 上设计并实现一个受信后台候选入口，浏览器实际 sender 的 extension/tab/frame/document/origin 必须独立重读并绑定已审 Profile、当前站点权限、用户批准与固定安装身份；保留原防重放及最终提交围栏。先完成原 ChatGPT 行为兼容，再以普通网站最小事件验证；不要直接放宽原 `officialURL` 或把网页事件送进 `host.start`。Side Panel 解耦需在新任务准入前选择原 offscreen host 并证明生命周期，不能迁移或重跑在途 Controller。

**Profile 示例（现阶段仅演示数据，不代表网站已注册或获批）：**

```json
{
  "id": "example",
  "version": "1.0.0",
  "origin": "https://example.com",
  "adapter": "generic",
  "adapterVersion": "1.0.0",
  "protocols": ["webflow.task.intent.v1"],
  "enabled": true
}
```

这是当前代码接受的闭合字段，不包含权限、动态 JS 地址或 CSS selector；`origin` 必须是规范化精确来源。产品化注册还需要可信配置来源、持久化、审阅、原生站点权限、版本升级、失效和撤权对账；当前代码不提供这些管理能力。后续如须在同一 origin 按路径选择多个 Profile，必须先实现明确的路由交集与冲突检测，不能靠注册顺序覆盖当前的拒绝语义。

**尚不能直接接入后台的具体原因：** 既有 `normalizeAutoScope` 绑定任务、参数、目标及安装快照，但该自动批准数据本身不包含来源站点；当前安全性依赖原 ChatGPT Host/gate 的浏览器来源和会话校验。把其 `officialURL` 放宽到其他网站会把已有批准静默扩展到新来源。必须先通过原 Authority 扩展并审阅来源范围、身份与撤权语义，再考虑数据迁移及同一旧批准的兼容；不把这项未完成当成用户已批准跨站。原 `runner.js` 只取云控和 App Service 请求，也不能假设普通网页任务能使用它。通用站点事件的发送者是网页脚本，严格 JSON 和 listener 唯一性均不证明用户手势或授权。

**书面审议与当前证据：** [60 项架构与反方审议](site-adapter-review-v1.1.zh-CN.md) 由三名独立 AI 子代理分别完成；这是 60 条有正反意见和证据的书面分析，不是 60 次实际会议。审议中发现的 `null` origin、稀疏协议列表及同实例重复监听已补行为测试并修复；监听器的 WeakSet 只对同一 JS 模块实例生效，不能代替跨实例持久防重放。ChatGPT 的 Profile 协议字段仍是静态描述，动态协议缩限尚未实现；BFCache 恢复也未接未来动态停用策略。全量产品、第二 AI、原生跨世界事件和生命周期验收仍未完成。

**本轮独立 AI 评审评分（非正式验收）：** 以下评分由十个彼此独立的 AI 子代理分别给出，都是当前阶段的主观判断，不代表十名人类专家；各人侧重的完成度和专业维度不同，不能代替统一量表的正式评审。评分发生在下列 CFT 组件夹具验证之前，故未将该新证据计入。

| 独立评审侧重 | 分数 | 主要扣分依据 |
|---|---:|---|
| 适配架构与可维护性 | 62 | 后台接线、注册和多站闭环缺失 |
| MV3 安全与权限 | 65 | 通用来源、撤权与浏览器验证缺失 |
| 运行可靠性与生命周期 | 55 | 网页任务尚未接入 offscreen；重启为 UNKNOWN |
| 扩展构建与 MV3 | 35 | 仅 ChatGPT 正式入口，缺少产品级多站接线 |
| 多站适配与抽象 | 35 | Generic 没有生产消费者及安全执行链 |
| 测试与验收证据 | 30 | 同候选真实产品端到端和生命周期缺失 |
| Content Script 与网页事件 | 35 | 跨站来源尚未接 Authority 和防重放 |
| 权限隔离与重复执行 | 35 | 来源绑定授权、持久注册及撤权未完成 |
| 产品与开发者体验 | 30 | 无法安装管理普通站 Profile 或完成任务交付 |
| 长期扩展与改造风险 | 28 | 扩展管理、第二站及原生闭环均未完成 |

十个有效独立意见的算术平均值是 **41/100**。这只是阶段性主观估分，不是产品正式评审，也未达到 95 分；尤其不能用它替代后续实际实施和 Chrome 原生验证。

**补充同轮验证：** `node projects/webflow/tests/generic-adapter-isolated-chromium.mjs` 使用独立临时 Chrome for Testing 配置与最小 MV3 测试扩展，实际观察网页 MAIN 的一次事件由 ISOLATED 中的 Generic Adapter 解析为一次候选（PASS）。该 fixture 并未加载 OpenDesk 正式扩展，也未运行后台、Authority、Task 或结果交付，因此仅为 **Generic 组件跨世界 Chrome 验证**，不构成 `CHROME_NATIVE_VERIFIED` 的产品闭环证据。测试结束清理自建临时 Profile，未切换日常 Chrome 扩展。`projects/webflow/tests/auto-grants.test.mjs` 新增原 ChatGPT 持续批准不能用于 Gemini 或伪造域名的拒绝检查，不改变生产准入。

本轮最终定向回归：`site-profiles`、`site-runtime`、`chatgpt-site-runtime`、`generic-task-adapter`、`chatgpt-task-discovery-p0`、`chatgpt-independent-task-intent`、`chatgpt-fixed-bridge-r12`、`reply-admission` 和 `auto-grants` 共 **175 PASS / 0 FAIL**；新入口另经 Vite 内存 IIFE 编译通过（122,822 字节，未写入构建目录），JS 语法与 `git diff --check` 通过。该内存编译不是 WXT 正式包构建；受影响产品原生链及 production 仍为 `NOT_TESTED`。原开发 watcher 保持运行，未新增 writer、修改日常扩展路径或提交。

### 12.13 持续目标与关键测试条件（2026-11-03）

用户明确要求“直接设置目标，和关键测试条件。完善对应逻辑”。已建立本对话原生持续目标，状态 `active`；目标是统一网页运行时、声明式网站注册和原有安全执行链的真实多站闭环，不以组件或评分替代产品结果。继续在现有 `main` 上工作，保留并行文件与持续开发服务。

| 门禁 | 必须证明的行为 | 当前证据与下一步 |
|---|---|---|
| K01 来源绑定 | 旧批准只对应 ChatGPT；新的精确来源批准不能借给其他站；最终提交再次用浏览器来源核验 | 原 `auto-grants`、原 ledger 已实现并通过组件测试；五字段协议、Task/安装身份及旧持久 Key 不变 |
| K02 Profile/Adapter | 精确 origin 选唯一已知版本；只增加 Profile 即可让普通站复用 Generic；不匹配/停用/版本漂移拒绝 | 动态注册与撤权对账已接 SW，真实 Chromium 组件确认注册；产品批准/升级全链待测 |
| K03 不可信事件 | 假 sender、iframe、伪域名、缺原生权限、未知安装或参数变化不能执行 | 通用后台逐次核对真实 sender/frame/document/权限；原 Authority 提交核验保留，组件拒绝测试通过 |
| K04 幂等与 UNKNOWN | 重复事件、丢失 ACK、Worker 重建不重复副作用；已消费/未知候选只查询对账 | 复用原 ledger，消费先持久化、Host 文档固定、丢失回执不再领取；Worker 重建组件通过 |
| K05 撤权 | 关闭、撤任务、Chrome 站点撤权、导航及提交期间撤权均阻止后续准入和结果交付 | 原提交栅栏保留；新增最后异步核验期间撤销/替换批准的同步围栏，结果发送为零的回归通过 |
| K06 宿主独立 | 关闭 Side Panel 后已准入任务继续在同一 Offscreen RunHost；浏览器恢复读取同一 Run/Result | 通用请求已接原 Offscreen 循环和生命周期；组件验证忙槽保留、消费后保留及关闭重查；产品原生待测。ChatGPT 仍为原侧栏宿主 |
| K07 三类网站 | ChatGPT 无退化；第二 AI 通过少量专用适配；普通站不创建专用 JS | 原 ChatGPT 定向回归；Generic 原生组件链通过。第二 AI 专用 Adapter 未实现，三站产品闭环 NOT_TESTED |
| K08 结果与恢复 | 持久 Run/Result 与交付状态分开，原文档失效/交付 ACK 未知不重复发送；重启先对账 | 从原 Authority 快照验证同 Run/Result/安装 pin，同一原文档交付一次；未知回执、并发结算及新文档查询拒绝组件通过；产品原生待测 |

证据等级只使用 `SOURCE_IMPLEMENTED`、`COMPONENT_TESTED`、`CHROME_NATIVE_VERIFIED`、`PRODUCT_DONE`、`BLOCKED`、`NOT_TESTED`。Chrome 组件试验单独写明范围；未加载本次 OpenDesk 候选并跑通真实任务，不标记产品 `CHROME_NATIVE_VERIFIED`。尚未达到这些门禁时不把原生持续目标标为完成。

### 12.14 关键逻辑实施与本轮证据（续 12.13）

12.12 是首次组件阶段快照；其“未接后台/无注册管理”的判断已由本节的实际接线更新，历史评分保留原时点，不能直接算作本轮最终评分。

**用户新增能力：** 可信设置中的“来源网站地址”可以审阅普通网站的精确来源、已有 Task、参数、目标和安装快照。真实批准动作先申请 Chrome 网站权限，再以预期旧配置比较的方式登记通用 Profile，最后保存原持续批准。多个站点共享一个固定 Generic Adapter；每个 Task 当前只有一个来源批准，新批准替换原范围。旧批准没有来源字段时仍只允许 ChatGPT。拒绝权限不登记、不批准；仅登记 Profile 不执行任务。新登记只影响后续页面加载，已打开来源页面需要重新进入才能加载监听器。

**实际文件与执行映射：**

| 位置 | 本轮实施及原设施复用 |
|---|---|
| `src/page-events/site-profiles.js`、`site-catalog.js`、`content-runtime.js` | 唯一受限 Profile/版本目录与 Runtime 选择；无任务授权或执行能力。动态目录当前仅编译 `generic@1.0.0` |
| `src/page-events/generic-task-adapter.js`、`content-bridge.js`、`web-task-contract.js` | 标准五字段事件解析、页面回执/只读查询、同文档结果接收；数据 JSON 有界，BFCache 恢复重新取配置 |
| `src/page-events/chatgpt-runtime.js`、`src/entrypoints/chatgpt-fixed-bridge.js` | 固定 ChatGPT Profile 包装原页面桥；DOM/完整回复/发送逻辑仍在原 `src/native-agent/chatgpt-*`，不进入通用 Runtime |
| `src/page-events/content-script-registration.js`、`src/entrypoints/web-task-content.js`、`scripts/build-contract.mjs` | 一个固定打包内容入口，MV3 顶层 ISOLATED 动态注册；身份包含 Profile/Adapter 版本及协议；先撤旧再登记。Chrome 模式覆盖同主机所有端口，Runtime/Ingress 继续核对精确端口 |
| `src/page-events/web-task-ingress.js`、`src/sw.js` | 原 SW 的真实网页 sender/document/权限、Profile CAS 管理、领取/查询/结果交付；无新 Run 数据库。新配置 Key 只存路由数据 |
| `projects/webflow/src/auto-grants.js`、`src/native-agent/chatgpt-bridge-trigger-gate.js` | 原来源绑定批准、持久请求/消费/防重放账本、最终 Authority 提交栅栏；旧持久 Key、Task/安装身份和五字段协议保留 |
| `src/cloud-control/runner.js`、`runner-lifecycle.js`、`src/entrypoints/cloud-runner.js` | 原 Offscreen 循环新增网页来源，复用同一 RunHost/Controller/准入锁/执行槽；消费后不转移到新 Host，不再建调度器 |
| `src/native-agent/chatgpt-fixed-bridge-host.js`、`projects/webflow/trusted/AutoSettings.tsx` | 原可信审阅入口增加来源范围；审核对象冻结，权限来源来自内部快照；任务目录、参数 Schema、安装身份、权限及结果校验继续使用原逻辑 |
| `scripts/bundle-provenance.mjs` | 仅更新独立复核过的两个 Web Flow 源码 blob；不放宽可信来源门禁、不允许工具 JSON 替换代码 |

不按候选目录大搬迁；公共代码集中于已实际消费的 `src/page-events/`，后台、执行和站点业务留上述原 owner。无 `src/execution/`、第二 Host/Authority/Controller 或空 Gemini/Claude 目录。

| 阶段 | 用户现在得到什么；解决什么；尚缺什么 |
|---|---|
| P0 | 已梳理并保持 ChatGPT 页面/可信宿主边界；避免 DOM 混入公共层；未迁移原侧栏执行 owner |
| P1 | Registry/Generic 可共用同一固定监听，普通站无需专用 JS；已做行为测试与真实 Chromium 组件验证 |
| P2 | 封闭 Profile、精确来源/版本、冲突拒绝与可信 CAS 登记；未知 Adapter、权限字段、远程脚本拒绝；完整管理界面待补 |
| P3 | 原 SW 已接真实网页入口和动态注册；排除 iframe/伪 sender/缺原生权限；产品候选原生全链待测 |
| P4 | 网页请求进入原 ledger、准入 guard、Offscreen RunHost/Controller，结果读取原 Authority 快照；真实产品安装到执行证据待测 |
| P5 | ChatGPT 通过固定 Adapter 包装原桥，定向回归通过；原聊天编排仍依赖 Side Panel，尚未完成统一后台执行迁移 |
| P6 | 第二 AI 专用 Adapter 未实现。现有 Gemini 导航仅证实 `chat-window`、`user-query,model-response`，不能证明任务回复完成或结果回传；不得按猜测创建专用 JS 并报通过 |
| P7 | 普通本地站仅增加 Profile，真实 Chromium 标准事件→ISOLATED→后台→原账本组件通过；该夹具的安装身份是测试数据，不证明真实产品 Task 执行 |
| P8 | Side Panel 独立的共享 Offscreen 生命周期、Worker 重建、撤权、消费/交付 ACK UNKNOWN 已做组件测试；产品级关闭侧栏/真实 Worker 与浏览器重启、撤权全链为 NOT_TESTED |

**审查发现及修复：** 独立反方复现“最后异步核验期间已撤权但仍发送结果”和“失效队首阻塞新版本候选”。已增加批准策略同步代次（撤销及替换均检查），发送前仍检查来源/权限/配置变化；确认失效的队首持久标为 revoked 并保存原因和防重放候选，再处理后继。原生 API/存储状态未知继续报错，不消费或重放。另一独立审查发现可修改可信审核对象、以隐藏 `toJSON` 欺骗 JSON 比较后申请未经审阅来源权限；现已冻结完整审核树，权限参数只从内部固定字节产生。第三位独立 AI 复核三处修复并运行 82 条相关测试及额外竞态探针，无剩余所查缺陷。此结论不涵盖全产品安全验收。

**当前验证：** 19 个相关 Node 文件共 **338 PASS / 0 FAIL**，包括原 ChatGPT discovery/intent/bridge、来源批准/UI、固定源码准入、Generic/注册/后台/ledger、共享 Runner 和生命周期；没有运行根全量测试。新增测试均对应 K01–K08 的用户行为或安全回归。`generic-runtime-isolated-chromium.mjs` 在 Chrome 156 实测动态注册的真实属性、原生 documentId、MAIN→ISOLATED→SW 的 approved ACK、防重复单行、同文档查询、导航隔离及不同端口拒绝（PASS）。它使用临时最小测试扩展、显式夹具安装数据和只读 Foundation 替身，不创建或执行真实 Task，**不算产品 CHROME_NATIVE_VERIFIED**。自建 Profile、Chrome 和服务器已清理，未操作其他浏览器。

**仍未完成：** 本次真实 OpenDesk 候选的安装→批准→事件→原 Controller→持久 Run/Result→原文档交付与关闭侧栏；第二 AI 的完成/回传 Adapter；ChatGPT 原侧栏 owner 迁移；浏览器重启后的可信历史查询/人工对账界面；Profile 单独恢复/升级管理 UI；同一 Task 的多来源同时批准。当前持续目标保持 active，不据此宣布 PRODUCT_DONE 或提高历史评分至 95。

**开发阶段与体积预算（最新调整）：** 用户要求先使用 dev 继续，并允许专家合理提高 SW 等文件预算。SW 在 development/production 两种模式统一为 **2 MiB** 硬上限，保留 **512 KiB 非阻断审阅线**；`tool-shell.js` 原 3 MiB、Sidebar Tool Host 原 1 MiB、普通入口原 512 KiB 不变。构建、包验证、固定入口审计和 libs doctor 同步采用此规则，来源锁、CSP、自包含、权限及身份检查不放宽。此前 production 构建在旧 1 MiB 门限因 SW 1,128,391 字节失败，只是旧预算下的历史结果，不再是 dev 核心流程的阻塞；本轮不将 production 正式验收作为前置条件。

**已通过的静态 dev 候选：** 在独立物理源码快照 `/private/tmp/opendesk-production-source-7qm11d89` 中运行原 `scripts/build.mjs development` 成功，构建回执 `snapshot-evidence/build-development/build-development.json` 为 `passed`，构建期间源码漂移为空。候选为该快照的 `dist/development`，packageHash 为 `2c75c71e8bb91b4a982c12c91071141094c61d2cee8160064c5c25c0e548eee8`；SW 为 **1,128,760 字节**，通用内容入口为 **8,176 字节**。这是隔离的静态开发包，未连接 serve，也不是 production 验收包；日常根目录 `dist/development` 和原 dev watcher 未覆盖、停止或切换。该候选先于预算调整构建，不能宣称已用新规则重建；运行逻辑输入已冻结，可用于本轮原生核心链验证。

新预算的三组定向检查 **26 PASS**，涵盖两种模式 SW 与普通入口的恰好上限/+1 字节、固定入口审计和 doctor；遗留 Native transport 的预算断言同步后单项 **1 PASS**。另一次合并运行共 30 PASS/1 FAIL，唯一失败是旧测试对源码 manifest 调用发布 manifest 校验，触发既有工具栏品牌规则；该断言与本次预算无关，未放宽生产校验制造通过。按新规则只读核对上述物理候选：SW 1,128,760/2,097,152、通用入口 8,176/524,288、tool-shell 2,750,827/3,145,728 字节，均在各自限额内；这项核对不等于新构建或启动性能验收。

**下一项唯一工程任务：** 用上述同源静态 dev 候选完成普通网站的纵向原生闭环，并修复该链的第一个实际阻塞。首次驱动在打开真实 Side Panel 时连接了缺少 `chrome.runtime` 的执行上下文，已清理自建浏览器；属于测试驱动阻塞，尚不能据此判定产品故障或报告产品原生通过。继续修复正确的 SW/CDP 会话和原生入口，不覆盖原 watcher，不以旧 production 产物替代新候选。

**新对话交接时的最新阻塞：** `projects/webflow/tests/generic-product-chromium.mjs` 已加入真实 SW executionContext/document 绑定及原生输入见证；最新单场景在显式 `contextId` 的就绪探测出现 `CDP timeout Runtime.evaluate`，尚未到 native UI pending，根因未确认。最近证据为 `artifacts/webflow/generic-product-1793695007967-ba772585-52f2-4502-adb5-846e39095861/report.json`；自建 Chrome 156、Profile 与 shell session 28228 已由原 launcher 清理，`cleanupStatus: PASS`，无本轮活动测试会话。早期 Chrome 138 曾进入真实本地页面和扩展菜单，但未完成 Side Panel 审批；这些都不构成产品全链原生通过。用户要求创建新对话继续完善；后续文件和该窄场景由新对话接管，旧对话不再重复运行。旧对话原生 goal 实读仍为 active，创建对话不等于暂停、迁移或完成它。

### 12.15 普通网站原生纵向链与登记回读修复（2026-11-03）

**当前结果：** `CHROME_NATIVE_VERIFIED` 仅适用于以下隔离静态 dev 候选、单一本地普通网站场景。真实 Chrome 侧栏内保存并运行 Controller，在产品目录核对相同源码和运行证据、设为本地可用并安装；通过可信 AutoSettings 审阅精确来源、目标、参数和安装身份并开启自动准入。来源页面发送标准事件后，原 Offscreen 宿主准入；真实关闭侧栏后才发生本地表单副作用，原 Run/Result 持久身份与宿主文档一致，结果交付原来源文档。重复同一候选返回 `E_BRIDGE_REPLAY`，无新增 Run、副作用或第二次结果交付。详情为 [原生测试报告](../../../artifacts/webflow/generic-product-1793696826771-041b4a97-b129-410a-a3dc-ba625080a8d6/report.json)，含受信输入、逐步事实及自建进程和 Profile 清理 `PASS`。

**实际缺陷与最小修复：** 修复前真实侧栏批准后报告“网站登记写入回执未知”；[只读现场](../../../artifacts/webflow/generic-product-1793696320186-a4e85f65-7827-4f97-809f-a912399dbf62/report.json)显示 Chrome 已保存并注册 Profile，但存储回读重排了对象字段，自动批准尚未保存。原 `src/page-events/web-task-ingress.js` 按 JSON 字符串比较导致误判；现对经原 Schema/Adapter 校验的完整 Profile 按字段和值、数组顺序比较，仍对变更的审核快照拒绝，对真实回读差异报 UNKNOWN，不放宽来源、权限或安装验证。新增真实字段重排、无效 CAS 和不一致回读的回归：重排场景修复前失败；修复后 `node --test tests/environment/web-task-ingress.test.mjs` 为 58 PASS。

**产物来源：** 新候选 `/private/tmp/opendesk-webflow-profile-fix-1stbDO8b/dist/development` 的原构建回执在 `/private/tmp/opendesk-webflow-profile-fix-1stbDO8b/evidence/build-development.json`，packageHash `2545aa623bf0dc353ce79f558a03120353027063ef5d8f14c54c8da229fee69e`；与 12.14 候选的构建输入相比仅 `src/page-events/web-task-ingress.js` 改变，构建期间输入漂移为空，测试前后产物指纹一致。第一次构建因依赖符号链接指向快照外被来源门禁拒绝；在新快照内复制依赖后按原门禁成功构建，未放宽规则。该产物未连接 serve，不是 production 包；原日常 dev watcher PID 10656 仍运行。

**范围与剩余工作：** 此次不证明 ChatGPT 侧栏 owner 迁移、第二 AI、浏览器重启恢复、全量撤权矩阵或 production 正式验收，均仍为 `NOT_TESTED` / 未实施；不能据此称整个 V1.1 `PRODUCT_DONE`。本测试驱动对早期 SW 目标先打开真实页面并等待稳定、绑定指定上下文；这是观察到可工作的规避方式，原早期 CDP 目标消失的根因仍未证明。前对话 goal 上次实读为 active；本对话无法据此变更或宣称其完成。工作仍在现有 `main`，保留并行未提交改动，未提交或推送。

### 12.16 自动运行设置的真实 UI 续测准备（2026-11-03）

**当前状态：`BLOCKED`，新增真实 UI 场景尚未执行。** 接续时 `main` HEAD 为 `43203cbd20184f44ad021de49dbfd07d6f306281`；日常 dev 端口 43119/43120 无监听，机器上有其他会话的 Chrome，不操作其进程或 Profile。真实桌面 UI 协作锁由 `01a1a005-4b70-7f11-8bd8-ca07b55d7664` 持有；两次申请均返回 `native UI busy`，桌面显示该对话 `systemError` 不等于资源已释放或已交接，未强抢或代其清理。没有启动本轮 Chrome、发送网页事件或写入测试授权；申请锁的 owner 负责结束或交接其资源后，才能继续本轮原生操作。

**测试驱动：** 在唯一 `projects/webflow/tests/generic-product-chromium.mjs` 的原真实安装链后增加行为检查：来源、目标、参数改动及恢复后旧审核均失效；不批准关闭再打开不保存审核或授权；完成原自动运行后重开真实侧栏，核对持久开关，用可见开关和可信 Space 操作，并分别对关闭和撤销后的新 candidate 检查明确拒绝、Run/表单副作用及结果交付数不增加；重开设置核对撤销与开关状态。记录 busy 变化与可信输入，失败时保留已完成阶段证据。驱动已通过 `node --check`，但其新分支未在 Chrome 跑过，选择器、键盘焦点、拒绝回执和异步忙态均不能据此标记通过；若现场显示驱动问题先按真实行为分类修正，不以绕过权限或伪造动作制造通过。

用户随后指出看不到 UI 操作、关键条件和结果；驱动已增加逐项 `uiCases`，初态均为 `NOT_TESTED`，在对应真实行为断言通过后才记 PASS。安装、审核、修改失效、取消重开、开启、来源交付、重放拒绝、关闭和撤销状态均由真实目标的 `Page.captureScreenshot` 保存 PNG 到该次报告目录，失败保留之前已完成项；尚未启动本轮浏览器，因此当前没有新截图。历史 12.15 报告有可信输入及账本记录，但没有可补发的现场截图。

| 实际 UI 操作 | 关键通过条件 | 当前候选结果 |
|---|---|---|
| 开发 → 创建候选 → 目录审阅 → 安装 | 固定源码与真实开发 Run 一致，经原目录安装成功 | NOT_TESTED；历史候选该链 PASS |
| 准备审核后修改来源、目标或参数 | 旧审核立即失效，恢复原值也不恢复；零批准、零新增执行 | NOT_TESTED |
| 取消审核后重开设置 | 未批准审核不成为持久授权；重新审核才能批准 | NOT_TESTED |
| 批准精确范围并开启 | 真实可信手势，来源/目标/参数/安装身份一致，UI 与持久状态一致 | NOT_TESTED；历史候选基本批准开启 PASS |
| 关闭侧栏后的后台执行及结果 | 同一 Run/Result、资源已释放、向原文档单次交付 | NOT_TESTED；历史候选该链 PASS |
| 重复候选 | 明确拒绝；新增 Run、副作用及交付均为零 | NOT_TESTED；历史候选 E_BRIDGE_REPLAY PASS |
| 重开侧栏后通过可见开关关闭 | 已批准状态持久；新 candidate 明确拒绝且零新增效果 | NOT_TESTED |
| Space 开启，再撤销任务并重开 | 可信键盘触发、撤销持久，新 candidate 拒绝且零新增效果 | NOT_TESTED |

续查持锁对话确认其最后一轮因模型容量错误 failed；仍未取得跨 owner 回收授权，已向用户提交“只回收遗留桌面锁并重新申请”选项。等待期间只修改测试证据输出及本记录，没有操作其他对话的 UI、浏览器或租约。

**当前候选：** 隔离静态 development 构建 `/private/tmp/opendesk-webflow-ui-current-4MYODQ/dist/development`，原回执 `/private/tmp/opendesk-webflow-ui-current-4MYODQ/ui-evidence/build-development.json`；原 `scripts/build.mjs development` 返回 `passed`，packageHash `67ffe2f1cb6908c62c37de8474a1dd3d5711238a990193891b051855ceaa3ed8`，回执所列输入在构建期间无漂移，与本轮核对时工作区对应输入一致。构建模块记录 `AutoSettings.tsx` 的审核 blob 为 `cc7d6630e9fcdcd9398f449d403a9aa4c0994bd2`，与当时工作区该文件一致；`auto-grants.js` 为 `db7b5aad4d0b5f19de518659f361e3a8458e4a8a`。这是独立快照和输出 guard 的静态包，未连接 serve，尚无本候选 Chrome 安装或运行证据。原构建的通用 `sourceInputs` 不完整覆盖 `projects/`；以上通过 bundle module blob 单独核对当前这两个可信文件，不能把空漂移解读为所有项目输入均被该列表覆盖。

12.15 历史候选包含 `AutoSettings.tsx` blob `25f65781d8003278daba84bd11b8ebccaee88ff0`，与本轮当前源码不同；差异包括任务运行时版本不可用的提示，历史原生 PASS 不自动证明当前组件。12.15 的“仅 ingress 改变”应理解为**当时构建回执所列输入的比较**，并非全部编译模块的逐文件比较；历史实测和此前 76 项组件/入口测试各保留原候选及其范围。

**下一条操作：** 锁合法释放后重查候选指纹、源码漂移及实际 UI owner，按驱动 `--help` 启动独立 CFT 与临时 Profile，以 `--build-receipt=/private/tmp/opendesk-webflow-ui-current-4MYODQ/ui-evidence/build-development.json` 绑定本候选，只对 `pending-native-ui.json` 指定的自建实例做原生侧栏操作。先取得真实拒绝、持久状态和零新增副作用证据，再视具体故障做最小修复与定向回归；记录测试报告及清理结果。其他任务的 Chrome、日常扩展、源码和未提交改动继续保留；production、第二 AI、重启恢复和正式评分仍延期。

### 12.17 自动运行设置真实 UI 结果（2026-11-03，更新 12.16）

**结果：8/8 PASS，限本次普通网站静态 dev 候选。** 用户授权在其他对话未使用桌面的间隙继续；确认旧持锁对话已因容量错误结束后，通过原 Profile 管理命令释放其遗留桌面锁并为本对话申请。测试使用独立 CFT 156.0.8078.4、临时 Profile 和本地两端口夹具；原生 CUA 打开、关闭、重开真实 Side Panel，并实际执行 Shift+Tab 与空格。其余产品操作沿用原驱动的可信 CDP Input，不直接写产品授权/配置、不伪造运行或交付。没有操作其他浏览器或日常扩展。

本轮 [完整报告（含可信输入、8 项条件、原账本和清理）](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/report.json) 为 PASS，保存 11 张现场 PNG。报告包含候选测试前后指纹，均为 `67ffe2f1cb6908c62c37de8474a1dd3d5711238a990193891b051855ceaa3ed8`，即 12.16 的同一候选；测试结束重新核对回执所列源码输入，无差异，上述 AutoSettings、auto-grants 及 CurrentTask 的 bundle blob 与当前工作区仍相同。该包未连接 serve，不是 production 验收包。

| 真实 UI 操作 | 关键条件和实测结果 | 结果 |
|---|---|---|
| 开发创建、保存运行，目录核对源码、验证并安装 | 原 Controller 开发 Run 与相同固定源码对应，经原目录安装；[安装截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/01-task-installed.png) | PASS |
| 准备审核后分别修改来源、目标、参数 | 每次旧审核失效，恢复原值也不恢复；未保存批准、未新增执行；[参数改动截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/03-review-invalidated-args.png) | PASS |
| 不批准，取消后重开设置 | 旧审核不存在，持久批准不存在；[重开截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/04-settings-reopened-unapproved.png) | PASS |
| 重新审核精确范围、批准并开启 | 来源、目标、参数、安装身份经原可信入口批准；可见状态与持久开关一致；[开启截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/05-approved-enabled.png) | PASS |
| 标准事件准入后原生关闭侧栏 | 关闭后才发生自动表单动作，原 Offscreen Run/Result 完成并释放资源，结果交付原来源文档一次；[来源结果截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/06-result-at-source.png) | PASS |
| 重复发送同一 candidate | `E_BRIDGE_REPLAY`；新增 Run、表单效果、结果交付均为 0；[拒绝截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/07-replay-denied.png) | PASS |
| 重开真实侧栏，点击可见开关关闭，再发送新 candidate | 原开关/批准持久；关闭后 `E_WEBFLOW_AUTO_DENIED`，新增 Run、效果、交付均为 0；[关闭截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/08-disabled.png) | PASS |
| 原生 Shift+Tab 聚焦，空格开启；撤销任务后发新 candidate，再取消重开 | 捕获指向开关的可信空格事件，开启状态持久；撤销后 `E_WEBFLOW_AUTO_DENIED` 且零新增 Run/效果/交付；重开仍显示已撤销；[撤销持久截图](../../../artifacts/webflow/generic-product-1793702652722-5c1072a7-f935-4a9e-92ad-e5638aad2073/09-revocation-persisted.png) | PASS |

自动 Run `44719ddf-ef45-4e0b-b40b-9a0dba55951c` 与 Result `acfe4306-5b6c-4506-908b-2a6e3f1f1da4` 在原持久库和来源回执一致。整个测试只有 2 次表单效果（开发验证 1 次、自动执行 1 次）；三个拒绝分支均不增加 Run、效果或交付。busy 变化有真实 MutationObserver 记录，但未做延迟/故障注入矩阵。

**驱动修正及边界：** 前两次同候选运行在键盘焦点断言失败，均保留独立 FAIL 报告与已通过的 7 项结果：`generic-product-1793702331615-e0442556-4eb1-46be-a48f-e4e442ea00be`、`generic-product-1793702537862-ca172317-ecdd-4477-9982-9ce2ff2d68c8`。第一次错误假设保存期间短暂禁用后仍保留鼠标焦点；第二次 CDP Tab 未能证明原生窗口焦点。最终前置持有真实侧栏的本轮窗口，以 CUA 原生 Shift+Tab 和空格直接验证通过，未修改产品控件或放宽 Authority。这里只改唯一测试驱动和执行记录，保留并行产品改动；驱动语法检查通过，没有重复运行无新增产品改动的组件测试。

三次自建浏览器均由原 launcher 清理 PASS；最后 PID 33824 已退出、临时 Profile 已删除，桌面锁通过原命令释放为 null。本轮未提交、未推送。当前所请求 UI 续测已完成；ChatGPT/外部模型、第二 AI、浏览器重启恢复、production 正式验收及评分仍为 NOT_TESTED，整个 V1.1 不标 PRODUCT_DONE。

### 12.18 用户系统 Chrome 的真实 ChatGPT → 百度 → 原聊天回传（2026-11-03，更新 12.17 的 ChatGPT 缺口）

**结果：真实登录 ChatGPT 单轮核心链 PASS。** 用户明确授权直接控制当前系统 Chrome，并指出此前本地页面测试不能替代真实 ChatGPT。本轮使用 `/Users/shopme/Applications/Google Chrome.app` 的既有登录态、新建独立聊天与正常扩展 UI，全部交互经原生 CUA；没有提取 Cookie、修改已有聊天、直接写产品存储、注入模拟回复或点击每次「执行 / 允许本聊天」。[真实测试聊天](https://chatgpt.com/c/6ae9bf1d-4d00-83ec-8a78-b7fce5ac0331) 保留供人工查看。

**实际环境：持续开发。** 当前扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；调试页明确显示「开发服务已连接」，运行指纹 `2c77ce889e826baa8e32865bbcd2425e99cc2c0eaf4b2f546a5ab637018d4abf` 与仓库 `dist/development/development-update.json` 相同。已有 dev watcher PID 33071 和端口 43119/43120 未停止、重启或覆盖；内部扩展设置页未读取，因此实际 unpacked 路径不另作独立证明。本次不是 12.17 的隔离静态候选，也不是 production 验收。

**入口发现与复用：** 原 AutoSettings 中已有任务均提示 `E_BUILTIN_VERSION_UNAVAILABLE`，无可审核任务，自动运行关闭、无批准。本轮不替换这些旧任务；复用「开发 → Controller 固定版本 → 真实 Run → 任务目录核对证据 → 本地可用 → 安装」建立唯一测试任务 `webflow.realchat.read.20261103@1.0.0`，名称「Web Flow 实网只读验证」。源码只调用 `await page.title()` 和 `await page.url()`，返回公开百度页面元数据及测试标记；无表单提交、登录数据或私有业务采集。开发核对 Run `5f159213-5ac1-4182-93e4-810f179512d6` 的真实返回与候选固定源码一致，原目录证据核对通过后安装。

| 原生 UI 操作 | 关键条件与可见结果 | 结果 |
|---|---|---|
| 保存、运行、核对并安装只读 Controller | 真实百度页返回标题「百度一下，你就知道」和 `https://www.baidu.com/`；固定源码与真实 Run 通过原目录核对；[安装截图](../../../artifacts/webflow/system-chrome-20261103/01-task-installed.jpg) | PASS |
| 任务范围审核、批准、开启 | 来源 `https://chatgpt.com`、精确目标 `https://www.baidu.com/`、参数 `{}`；固定安装身份见下文；[批准截图](../../../artifacts/webflow/system-chrome-20261103/02-exact-scope-approved.jpg) | PASS |
| 生成全新指令并发送给真实 ChatGPT | 候选 `wf-0ebcb604-c1a2-4d8a-9758-0d0f2760ad6c`；ChatGPT 完整输出 `opendesk-task` JSON 后出现「持续批准自动执行」，自动打开真实百度页；未点击执行或逐次批准 | PASS |
| 等待自动结果回传及官方 AI 续答 | 原聊天新增一条 `opendesk.task.result.v1` 用户消息，随后官方 ChatGPT 续答；UI 显示「本次执行已完成，资源已释放。真实结果已回传，官方 AI 已完成回复」；[真实结果截图](../../../artifacts/webflow/system-chrome-20261103/03-chatgpt-result.jpg) | PASS |
| 「我的」→ 测试任务 → 最近结果 / 技术信息 | 仅一条安装任务成功记录；原始标题/网址、Run、Result、源码哈希与原聊天一致；[持久结果截图](../../../artifacts/webflow/system-chrome-20261103/04-persistent-result.jpg) | PASS |
| 测试收尾 | 总开关恢复 off；仅撤销本轮测试任务的持续准入，UI 显示已撤销；独立测试任务与聊天保留；[收尾截图](../../../artifacts/webflow/system-chrome-20261103/05-scope-revoked.jpg)；原命令释放桌面锁为 null | PASS |

实际自动 Run `ef3c6469-1aaa-4401-a14d-739bc009df58`，Result `c18ce646-8551-4131-898f-1060f77882f4`，request `3de01b1e-4b79-4507-a651-3d7d4e8b72d1`；`scriptId=task:webflow.realchat.read.20261103:1.0.0`、revision 1、源码 SHA `be2b1bc25f88e6f8ff08f4b1c901c3b21f1b9714e645c5fe4af6c33780942a85`，installation `303b19ac-4d5b-4b19-9316-f90bfadc63c9`、generation 1，manifest SHA `54d69a529edb1a1218a0dace1edec1e40ed0efdac12665529498a34d0a5a4a91`。完整可访问性现场及结构化结果保存在 [本轮证据目录](../../../artifacts/webflow/system-chrome-20261103/)。

**证明范围：** 本轮证明真实 ChatGPT 完整回复准入、已安装只读 Controller、真实百度元数据、持久结果及同聊天自动回传/续答。ChatGPT 测试全程保持同窗口可信 Side Panel 打开；不据此宣称 ChatGPT 已迁移为关闭侧栏后台运行。关闭侧栏和拒绝分支仍按 12.17 的独立普通网站候选证据报告，未在系统 Chrome 重放。第二 AI、浏览器重启、production 与正式评分继续延期。本轮没有修改产品源码、重建产品、提交或推送，不将官方 AI 对返回值的推断当作额外浏览器证据。

### 12.19 关键业务测试方法纠偏与搜索入口核查（2026-11-03）

**结论：12.18 是真实协议闭环通过，不是自然语言搜索业务通过。本轮搜索场景在前置检查中阻塞，未执行自然语言生成或搜索，不新增 PASS。** 用户最新要求先确认测试方法正确，再做最少必要的真实业务验证；不恢复旧测试矩阵。

**方法核对与能力边界：** 产品合同 2026-10-28 的范围是识别明确协议并触发已安装脚本；不能把自然语言映射能力当作该历史合同已经交付。当前 `trusted/AutoSettings.tsx` 的 `ApprovedTaskPrompt` 把已批准 taskId、targetUrl、args 和新 candidateId 全部填好，要求 ChatGPT 原样返回。这能检查完整回复识别、准入、执行、持久化与回传，不能检查 AI 是否从业务需求选择正确任务、生成参数或得到正确搜索结果。官方 ChatGPT 路线未发现自动交付可用任务目录/参数说明的入口；工作流 Tab 内的独立 AI 对话也不能替代官方网页路线。必要的任务说明可以人工提供，但须明确记录这种前提；一个可用任务最多证明单任务匹配与参数生成，不能证明多任务选择或自动创建脚本。

**下一次业务验证只用下面这一条场景，按顺序判定，不以 completed 或 AI 自述代替网页事实：**

| 用户想做什么 / 检查项 | 前置条件与真实操作 | 怎样算通过 | 本轮实际结果 |
|---|---|---|---|
| 能用已有百度任务搜索公开资料 | 系统 Chrome、新独立 ChatGPT 测试页、同窗口可信侧栏；通过原任务目录及自动设置核对当前安装版本、Schema 和运行时身份 | 搜索任务可审核，安装身份有效；仅审阅不执行 | **BLOCKED**：真实设置显示 `baidu.search.top3` 为 `E_BUILTIN_VERSION_UNAVAILABLE`，提示保存新版本并重新验证 |
| AI 理解“在百度搜索 OpenDesk Browser，给出前三条非广告网页结果及链接” | 前置通过后，提供真实可用任务的能力说明及五字段协议规则；不提供本次完整请求 JSON、已填参数或业务答案；在新聊天发送该自然语言需求 | AI 实际输出唯一新候选，选择正确 taskId/目标，自己从需求生成 `query` 和固定 `limit=3`；保存原始需求和完整实际回复 | **NOT_TESTED**：前置不成立，未发送消息；自动交付任务说明的产品入口仍缺失 |
| 浏览器确实完成搜索并得到正确结果 | 经原可信 UI 审阅精确范围并开启；让上一步完整回复进入原执行链；只执行一次，不重用 candidate | 观察真实输入和单次搜索，核对搜索词、页面顺序、广告标记及前三条标题/链接与同次持久结果逐条一致；不足三条、截断、blocked/stopped 均不能算本需求通过 | **NOT_TESTED**：未派发，无本轮 Run/Result，不拿标题任务替代搜索 |
| 结果准确回到提出需求的聊天 | 沿上一行同一 Run/Result 查询与交付，保留聊天 URL、网页截图和结果证据 | 原聊天单次收到相同真实结果，AI 的总结与数据一致，另证资源已释放；回传和业务分别判定 | **NOT_TESTED**：本轮未产生结果；12.18 只读任务的历史回传事实保留 |

任务文件 `examples/tasks/baidu.search.top3.v1.opendesk-task.json` 的 Manifest 是 `baidu.search.top3@1.1.2`，Schema 要求非空 query（最长 120 字符）及 `limit=3`，不允许额外参数；这只是磁盘合同，不证明本机当前可运行。源码会过滤广告并收集最多三条，但 `status=success` 可以只含一至两条，因此业务判定必须另核对三条与真实页面，不能照搬运行状态断言。

**本轮真实 UI 和环境证据：** 使用 `/Users/shopme/Applications/Google Chrome.app` 的“您的 Chrome”窗口，新建“🧪 Web Flow业务核验”分组中的空白测试页（tab `560069622`）；没有修改旧聊天或草稿。经“工作流 → AI 来源 → 高级 AI 设置 → 任务范围与授权 → 诊断”读取上述拒绝。唯一可审核项仍为 `webflow.realchat.read.20261103@1.0.0`（仅标题/网址）；自动运行保持 off，该任务持续准入保持已撤销。未保存新授权、未升级/替换任务、未发候选，也未重放未知请求。

- [搜索任务阻塞截图](../../../artifacts/webflow/business-method-20261103/01-search-task-blocked.png)及[完整 AX](../../../artifacts/webflow/business-method-20261103/01-search-task-blocked.ax.txt)。
- [持续开发连接截图](../../../artifacts/webflow/business-method-20261103/02-development-connected.png)及[完整 AX](../../../artifacts/webflow/business-method-20261103/02-development-connected.ax.txt)：真实 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、开发服务已连接、运行 revision `2c77ce889e826baa8e32865bbcd2425e99cc2c0eaf4b2f546a5ab637018d4abf` 与 `dist/development/development-update.json` 一致。PID 33071、43119/43120 仍监听。实际 unpacked 路径未独立读取；不是静态候选或 production 证据。

**归属及下一步：** 本轮仅追加本执行记录及本机证据，沿现有 `main` 保留全部并行改动；不修改产品合同的历史范围、不修改产品源码或原唯一测试驱动、不构建、不提交/推送。下一条受影响操作是沿既有 Controller Candidate → Verification → Available → Installed 流程重新验证搜索任务运行时身份，再执行表中同一最短业务场景；不能放宽版本/SHA 校验、用内部函数或存储写入代替 UI。该前置未解除前不发送一份注定不能执行的搜索请求来制造测试数量。第二 AI、关闭 ChatGPT 侧栏、浏览器重启、production、评分继续延期。四个证据链接已核对存在；桌面锁经原 Profile 管理命令释放为 null，系统 Chrome 和既有 watcher 保留运行。

### 12.20 本机任务恢复与自然语言业务核心目标（2026-11-03）

**用户已要求设置目标、关键测试条件并继续完善。** 本聊天原 `get_goal=null`，本轮建立持续目标；不是恢复其他聊天的旧目标。当前操作是恢复本机百度任务的有效运行时身份，再完成 12.19 的单条搜索业务链。使用已授权系统 Chrome 和登录 ChatGPT、现有 `main`、`dist/development` 与唯一 watcher；先检查真实现场，复用已有入口。Controller 业务/包仍归 `examples/tasks/baidu-search-top3.js` 及唯一 `baidu.search.top3.v1.opendesk-task.json`，Web Flow 业务和证据归本项目；本次不预设修改通用框架。

| ID | 条件、操作与通过标准 | 初始状态 |
|---|---|---|
| K1 本机任务恢复 | 核对当前已安装版本、固定源码和失效原因；沿原 Candidate → 真实开发 Run → Verification → Available → Installed 完成必要的新版本升级。源码/权限不扩张，不修改旧冻结记录；新安装在可信目录可解析并能审核 | 待执行；上次观察旧任务运行时不可用 |
| K2 AI 理解业务 | 新独立 ChatGPT 聊天只收到真实能力及协议说明和“在百度搜索 OpenDesk Browser，给出前三条非广告网页结果及链接”。不提供本次完整请求 JSON、预填 args 或搜索答案。保存 AI 实际完整输出，核对任务、精确目标、query 和 limit；单可用任务不宣传为多任务选择 | NOT_TESTED |
| K3 真实搜索 | 用户已授权范围通过原可信 UI 审阅，开启后由新完整助手回复自动准入。观察真实百度输入和搜索；按页面顺序核对三条非广告标题及链接与同 Run/Result 完全对应；不足三条、截断或模型自行搜索不算通过 | NOT_TESTED |
| K4 结果与回传 | 原持久结果、可信侧栏和原聊天绑定相同 Run/Result；单次交付，资源 released；AI 后续解释不夸大真实返回值。协议、理解、业务、交付分别给结论 | NOT_TESTED |
| K5 保护与收尾 | 保留精确来源/目标/参数、安装代际和版本指纹，未知效果只查原运行不重放；不覆盖草稿/其他聊天。只对本轮实际变更做定向保护检查；完成后关闭本轮自动准入并撤销本轮批准、释放桌面锁，保留聊天/结果供复核 | 待执行 |

**执行与停止边界：** 优先本机正常 UI 恢复，不等待另一台电脑重复提交已有修复；源码缺陷有现场证据才最小修复。新版本号取决于本机目录实读，不能预设 1.1.2 仍可重新使用。若本机已存在同版本旧指纹候选，按原不可变合同使用新的版本，不改旧记录。不得直接写授权/数据库、调用内部函数代替 UI 或注入 AI 回复。当前阶段不新增自动创建脚本/完整多任务自然语言产品入口；能力说明人工提供的限制如实报告。第二 AI、关闭 ChatGPT 侧栏后台、重启恢复、production、全量矩阵和评分延期；不提交推送。目标只有真实核心业务达成才完成，执行细节和证据继续追加本节。

#### 12.20.1 第一轮真实业务结果：执行完成，前三条条件失败

**当前结论：目标未完成；不能以 completed / count=3 判定业务成功。** 本机目录实读原安装为 1.0.0，随后通过原导入、真实开发运行、核对证据、设为本地可用和安装流程升级为 1.1.2；没有改写旧候选。开发验证 Run `5eb20fd4-12f4-403d-b281-7db050324182`，源码 SHA `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8`。[开发运行](../../../artifacts/webflow/business-method-20261103/03-development-search.png)、[目录升级](../../../artifacts/webflow/business-method-20261103/04-task-upgraded.png)和[精确审核](../../../artifacts/webflow/business-method-20261103/05-exact-scope-approved.png)均保留原 AX。安装 ID `4fb33bcf-ced1-43b0-8af2-584999f865e1`，generation 2、revision 1、manifestHash `6e73df2f70377ec2cc65761416344945d22a7c7e59c6e9aa3aae922d71490cd5`。没有扩大网站、权限或参数范围。

独立聊天 [百度搜索结果](https://chatgpt.com/c/6ae9d675-ac20-83e8-8d63-6c5dffa1a748)只收到[能力/协议及自然语言需求](../../../artifacts/webflow/business-method-20261103/natural-language-request.txt)，没有提供本次完整请求 JSON 或业务答案。[AI 实际请求](../../../artifacts/webflow/business-method-20261103/first-round-ai-intent.json)的 task、target、query、limit 正确，candidate 为 `wf-0fa82fc1-b258-4536-9381-68b544e62784`；没有点击逐次采用、执行或批准。原聊天自动收到一次[实际结果](../../../artifacts/webflow/business-method-20261103/first-round-returned-result.json)：request `35b35827-bdba-413e-b7af-ff6955157372`，Run `1f5f0a70-1fab-4d51-b143-476ac75cf6c1`，Result `040e06b2-8185-4974-aef2-af4bd2c70d42`。trace 记录输入读回 `OpenDesk Browser`、一次 click started/returned、导航以及结果读取；原 UI 显示完成及资源已释放。完整复制结果由正常聊天复制入口取得，[原始 AX](../../../artifacts/webflow/business-method-20261103/08-returned-result-full.ax.txt)可追溯；结构化 JSON 仅从该 AX 解码，不是模拟结果或直接读取浏览器数据库。

| 条件 | 本轮事实与结论 |
|---|---|
| K1 | **PASS（恢复步骤）**：1.0.0 → 1.1.2 经原验证/安装链完成；后续源码修复须新不可变版本及新验证，不能沿用本次源码证据 |
| K2 | **PASS（单能力理解）**：模型自行生成严格请求；不代表多任务能力发现产品已完成 |
| K3 | **FAIL**：实际返回的结果 slot 为 1、2、5，第三项是 OpenProject 13.1；同查询真实页面的第三条可见非广告网页是 openDesk 百度百科，被漏掉。见[页面复查截图](../../../artifacts/webflow/business-method-20261103/10-before-inspection.png)和[页面 AX](../../../artifacts/webflow/business-method-20261103/03-development-search.ax.txt)。搜索/回传成功不能掩盖排序漏项 |
| K4 | **部分已验证**：原聊天、执行详情的 Run/Result 一致，单次结果消息及资源释放可见；尚未再从“我的”独立核对该自动 Run 的持久原值。AI 后续回复见[完成现场](../../../artifacts/webflow/business-method-20261103/09-first-round-complete.png)，不据此提升 K3 |
| K5 | **未收尾**：未重放未知操作、未覆盖其他草稿；工具中止前本轮 Auto 仍开、本轮精确授权仍有效，尚未通过正常 UI 关闭/撤销。不得记清理 PASS |

**诊断与历史：** 当前 `baidu-search-top3.js` 只遍历 `.result.c-container`，只接受空 tpl / `se_com_default` / `www_index`，并要求既定选择器的可见摘要。2026-10-26 提交 `20791f48d` 已具有相同容器、上述模板及摘要规则，2026-10-25 `e1c2bfb0d` 已采用保守模板排除；这说明限制有历史来源，但尚不能证明当前百科卡片究竟在哪个条件被过滤，更不能凭这些历史把本次故障归因于某次 UI 改版。先前测试把 `bk_polysemy` 作为未知模板的人工数据，也不证明现场百科的实际 tpl。**真实卡片 wrapper、tpl 和摘要 DOM 尚未取得，不猜选择器、不删除广告/未知模块保护制造 PASS。**

**当前外部阻塞及下一条操作：** 正常检查器操作未取得该 DOM，点击结果意外进入百度跳转页；浏览器工具随即明确拒绝当前网址并要求结束控制，未改用其他自动化通道绕过。`06-ai-generated-intent` 实际已捕获百度首页，`07-automatic-baidu-search` 实际已返回 ChatGPT，文件名不作为页面阶段证明；`12-baike-dom.ax.txt` 没有取得百科 DOM，不能作为定位证据。已请求用户切回原百度搜索标签页，不重新搜索；恢复后先正常 UI 关闭本轮 Auto 并撤销本轮精确授权，再检查可见卡片 DOM，补真实结构回归（先失败）、最小修复、新版本正常验证/安装，最后用全新自然语言聊天重跑 K2–K5。尚未修改 Controller 或任务包，不执行与当前缺陷无关的全量测试/构建；main、并行文件、现有服务继续保留。

**本轮离线收尾：** 已从保存的原始 AX 解码 AI 请求和真实结果，核对本段本地链接存在、正式包与源码逐字相同及上述 SHA；没有重跑产品测试。用户再次授权“你直接控制”，操作授权不存在缺口，但不能解除工具的网址强制限制，页面恢复尚无证据。通过原 `profiles.py --owner 01a1a149-a266-7850-a23b-8cda92bbd2e0 ui-release` 已回读 `native_ui_owner: null`；这仅释放桌面协作锁，**没有关闭 Auto 或撤销浏览器内授权**。目标继续 active，不把外部恢复未完成记为产品通过或目标完成。

**后续目标审计：** 同一网址控制阻塞连续三个目标回合仍未解除，用户最新授权没有提供页面已恢复的状态证据。重新读取原生 goal 为 active、当前源码/正式包仍是相同 SHA 的 1.1.2、保存的真实返回仍是 slot 1/2/5；没有可据以确定百科提取规则的新 DOM，也没有合法的浏览器收尾路径。因此已通过原生 `update_goal` 将本聊天目标设为 **blocked**（工具回读确认），保持完整目标及延期边界不变；不是 complete 或用户请求暂停。恢复条件仍为外部切回允许控制的百度搜索页面，随后先收尾临时 Auto/授权，再按上段步骤修复和复验。

**续接现场（2026-11-03，本聊天 `01a1a17e-45de-7dc2-b5f4-0ab10717c4f4`）：** 本聊天启动时 `get_goal=null`，已按交接建立自己的 active 目标；不操作原聊天目标。只读确认 `main`，任务源码仍为 SHA `28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8`，任务源码与包无未提交改动；执行计划已有并行未提交内容，本次仅追加本段。已有 watcher PID 33071 及端口 43119/43120 仍在，未启动第二 writer；运行时加载路径及安装身份本轮未重新核验。

取得本 owner 桌面锁后，浏览器清单显示原百度搜索页、原测试聊天和 `chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf/sidepanel.html` 标签仍存在；清单不证明页面内容可控。尝试读取该可信侧栏标签时，浏览器安全策略拒绝 `chrome-extension:` 协议，明确禁止通过其他浏览器表面、底层协议或间接方式绕过。因而未能核对活动运行、关闭 Auto 或撤销本轮精确授权；这些状态仍为**未核实、未收尾**。未操作百度页面、未重新搜索或重放 candidate。原 AX 仍只证明百科在页面可见，未提供真实 wrapper/tpl/摘要选择器；没有编造 fixture、修改源码/任务包或运行与缺陷无关的测试。桌面锁经本 owner 正常释放，回读 `native_ui_owner=null`，不等于浏览器内授权已撤销。

**恢复入口：** 需要外部提供允许控制的可信 Web Flow 正常 UI；不能换通道规避上述浏览器策略。恢复后先核对无活动运行，关闭本轮 Auto 并撤销本轮百度精确授权，记录真实回读；再在原搜索页检查百科真实结构，按本节既定顺序完成回归、修复、正常升级和 K1–K5。当前真实前三条仍失败，修复版安装及新业务链均 `NOT_TESTED`；目标未完成。

**本聊天续跑阻塞审计：** 相同侧栏协议限制已在初次操作及两次续跑中持续；最新浏览器清单仍只有同一 `chrome-extension:` 可信侧栏，未见用户清理回读或可合法控制的新入口。原证据仍不足以判定百科过滤点，无法安全实施修复或经原安装链验证。桌面锁仍为空；Auto 和精确授权仍未核实、未收尾。目标保留完整范围，按原生目标状态工具记录为 blocked，等待外部恢复，而非完成。

**用户恢复目标后的离线核查：** 当前目标实读 active；`main` 上 Task 源码仍为上述 SHA，未改任务或包。扩大搜索现有项目、测试和本次 artifacts，未发现此次百科卡片的真实 wrapper/tpl/摘要 DOM。补充边界：`src/native-agent/chatgpt-fixed-bridge-host.js` 的旧固定百度结果分支限定 `null` / `se_com_default` / `www_index`，其旧测试中的 `bk_polysemy` 只是人工未知模板；该函数对 `request.installation` 先走有限 JSON 路径并返回，因此不能把旧固定分支的限制直接归因于本次已安装任务链。实际 tpl 尚未知；修复后仍须按真实安装请求验证原持久值及交付，不能伪造 evidence 或放宽保护。

**恢复后的阻塞审计：** 用户恢复后，初次及两次续跑均未获得可控可信入口、授权清理回读或真实百科 DOM；最新清单仍是原 `chrome-extension:` 侧栏，浏览器策略拒绝及禁止绕过仍适用。未改任务源码/包，未执行或重放请求。原生目标重新记为 blocked；目标及待清理事项保留，等待外部状态变化。

**用户纠偏（2026-11-03，优先于上述将百科 DOM 作为前置的判断）：** 用户说明目标是获取搜索结果；百科导致提取失败时可跳过，不要求取得百科卡片 DOM。现有 [真实返回](../../../artifacts/webflow/business-method-20261103/first-round-returned-result.json) 已有三项标题及链接，slot 为 1、2、5；按新允许跳过无法可靠提取项的条件，该漏项不再单独触发源码修改、升级或新的运行。不得将其说成严格页面前三条，也不改变现有广告、未知模板或来源保护。12.20.1 的 K3 FAIL 是按当时严格前三条的历史判定，不能覆盖本次纠偏。

原 1.1.2 真实验证和安装、模型自行生成请求、返回结果、侧栏报告 released 及原聊天回传仍是已有证据；未从「我的」独立核对自动 Run 原持久值，本轮 Auto 和精确授权也尚未完成正常 UI 清理。本聊天原生 goal 的旧正文仍要求修复遗漏、状态为 blocked；该工具不能修改正文或自行恢复状态，不能把旧目标表述或 blocked 状态冒称已同步到新要求。后续仅在获得合法入口或用户提供真实清理回读后处理相关缺口，不再以百科 DOM 为阻塞理由。

#### 12.20.2 核心流程测试：返回一条真实数据也可验证链路

**最新阶段与完成条件：** 用户进一步明确百度搜索只是流程测试的其中一环，返回一条数据即可；本轮重点是完善核心流程测试。检查自然语言及协议产生任务请求、已安装任务按授权执行、至少一条真实数据保持原值、同一 Run/Result 回传原聊天一次、资源释放。条数或百科模板不再触发修复或新版本安装；1.1.2 既有正常验证/安装证据可复用。

**本次测试计划与写入范围：** 复用 `auto-host.test.mjs` 中原 Host、Ledger 和 Broker 集成夹具（外部 Chrome/Controller 为注入边界），只追加一个核心流程用例，核对单条持久结果与实际交付 JSON、侧栏身份及原值一致、相同候选不重跑、关闭 Auto 和撤权后拒绝新准入；保留该文件原有并行修改。`current-task.test.mjs` 补单条原始结果的 React 展示，避免 UI 补齐三条或改变值。执行首条消息发现、完整候选准入、Host、当前任务、原会话投影的定向检查，分别验证本链路的发送见证、最终来源检查、单次执行/交付、展示及跨请求隔离。测试使用独立 fixture，不向真实 Chrome 或 ChatGPT 注入结果，也不把组件测试提升为本机实测。生产源码/安装包没有已确认缺陷时保持不变。

**本轮结果：** 新增两个用例，以上单条结果核心链和 React 原值展示均通过。`node --test --test-name-pattern='one returned search row|trusted approval then|Host rejects|revocation immediately|sidebar receipt' projects/webflow/tests/auto-host.test.mjs` 为 5 PASS；`node --test projects/webflow/tests/first-message.test.mjs projects/webflow/tests/reply-admission.test.mjs projects/webflow/tests/current-task.test.mjs projects/webflow/tests/sidebar-bridge.test.mjs` 为 30 PASS；合计 35 PASS / 0 FAIL。测试和本文 `git diff --check` 通过。未改生产源码、Task 参数/版本/包、已有安装或浏览器授权，未构建或提交；新测试首次运行即通过，属于既有行为的覆盖补充，不宣称修复了产品故障。

**现在如何继续：** 核心流程自动化测试已补齐当前缺口，已有实网运行可复用：真实能力说明及自然语言 → 模型新五字段协议 → 1.1.2 已安装任务 → 百度输入/单次搜索 → 三项真实结果 → 同 Run/Result 原聊天回传及资源释放。返回至少一条即可满足本轮业务样本条件；不再调查百科、强制恰好三条或为此重新升级。真实现场的 Auto/精确授权清理与从「我的」独立读取原持久值保留未完成事实，浏览器策略限制仍适用于相关操作；本次组件测试的清理 PASS 不能冒充该本机清理。它们不阻止本轮独立的测试完善收尾，也不触发重复轮询、重新搜索或旧请求重放。

### 12.21 ChatGPT 新准入迁移为框架后台 owner（2026-11-04）

**当前结论：源码迁移和定向检查通过，官方 ChatGPT 双轮验收未完成。** 本轮用户明确要求新完整固定协议回复在精确持续授权内自动执行，关闭侧栏后仍完成执行、持久结果、释放和原聊天单次回传。沿用 12.13–12.18 的框架与证据边界；历史普通网站、系统 Chrome 或只读任务 PASS 不替代本候选。第二 AI、完整多来源管理、production 不作前置；不把旧 goal 或旧验收清单恢复为本轮任务。

**真实入口与缺口：** 修改前 `src/sw.js` 的原 `webTaskIngress` 已处理普通网站入口，原 `src/entrypoints/cloud-runner.js` / `src/cloud-control/runner.js` 已有 Offscreen RunHost、单槽和 Controller 执行；ChatGPT 的 `auto-task` 仍由 `src/ui/tool-shell.js` 创建的 `createChatGPTFixedBridgeHost` 接收，可信侧栏关闭就没有该入口。这是现有框架的接入缺口，不需要重建网页运行框架。复用 Site Profile、ChatGPT 完整回复读取器、原触发账本、Task integrity validator、Authority、Controller 和持久 Results；新 Adapter 只做官方 ChatGPT 来源/DOM/协议核验与原结果消息格式适配。Web Flow 持续授权策略与可信 UI 继续归本项目，不向网页或模型开放授权。

**owner、写入与运行环境：** 当前聊天 `01a1a27d-949e-7fd2-b22e-c0213e3c6410`，`main` HEAD `8ec5c9421f61519c2c29158d9da117ba70af411e`。平台写入限 `src/page-events/{web-task-contract,web-task-ingress}.js`、`src/native-agent/chatgpt-{background-adapter,bridge-trigger-gate,fixed-bridge-host,fixed-bridge-page}.js`、原 `src/{sw.js,ui/tool-shell.js,entrypoints/cloud-runner.js,cloud-control/runner.js,platform/host/authority.js}`；项目写入限 `trusted/CurrentTask.tsx`、相关 tests、当前计划与证据。`scripts/bundle-provenance.mjs` 只更新已审查 CurrentTask 的精确 blob，未放宽来源门禁。新增通用内部 fence 位于原 Authority 的安装/停用/卸载写入入口，不成为公开 SDK 或网页权限接口。独立子 agent 仅执行有界账本测试与只读审查，不并行操作浏览器。

其他 owner 的 ChatGPT 文件意图、ScrapyJS、共享 Chat、React 工作台及测试改动均保留。本轮没有修改百度 Controller/任务包、提交、推送、新建分支/worktree/PR、发布或重装扩展。现有 PID 19312 的 dev watcher 及 43119/43120 服务保持原状，未覆盖日常 `dist/development`；观察到日常 SW/可信侧栏产物尚未包含本轮迁移，不能将其当成本轮已验证版本。后续使用前须重查实际路径、ID、serve 连接与产物指纹。

**实现与安全边界：**

- 仅从新的 `auto-task` 准入选择 SW/Offscreen owner。原侧栏手动和已在途请求不转移、不重新执行。固定官方 ChatGPT Site Profile 不签发授权；仍核对完整回复、turn/answer、原聊天 URL、Chrome 顶层 document、七项安装快照、完整参数与精确来源/目标范围。
- 原账本先持久准入，页面确认原 request 后才置 ready；ready 不批准、不重置 consumed。原单槽和 Controller admission 消费一次。确定的候选或任务失配保留拒绝墓碑并允许处理下一候选；读取失败、资源不可用等未知错误保留原状态，不猜测授权。
- 原 Run/Result 按 request、namespace、原 Offscreen document 查回；执行、结果持久化、资源释放、原聊天交付、AI 续答分开记录。持久交付 fence 在发送前建立，ACK 丢失保持 unknown，查询原记录而不补发。页面发送前再次核对原来源、任务、持续授权和该 request 未取消；安装变更在异步最终检查期间由原 Authority 同步 fence 拦截。
- 取消先持久撤销该 request，再通知原 RunHost 取消原 request 的启动或停止已确认相同 Run；不按共享槽猜目标。历史结果仍经原 Authority 读取，拒绝时只展示状态/错误，不泄露原值。
- SW 重建只对同一仍存活 Offscreen owner 的原 consumed 身份对账；更换 Offscreen 或浏览器重启不接管、不重跑。原 `paused_unknown` / 缺失 ACK 不称透明续跑。可信「运行与授权」可查看原身份、结果和 unknown，提示先关闭/撤销，再核对目标网站与原 Run/Result。恢复后的旧文档历史与当前会话回执分开，不能向新聊天送旧结果。

**当前源码验证：** 原 Host/回复准入、后台 Adapter/账本/Ingress、旧普通网站入口、页面桥接、可信 React 展示、Offscreen bootstrap 和原 runner 的 17 个定向文件合计 **319 PASS / 0 FAIL**；原 Authority 安装变更/撤权/停用用例另 **7 PASS / 0 FAIL**。包括新增双独立请求、重复候选、关闭/撤销、任务/来源失配、换聊天、执行 ACK 丢失后重建 SW 对账、交付 ACK 丢失不重发、新 Offscreen 不接管、最终交付时取消及安装变更交错。这里的 Chrome/DOM/执行边界使用注入夹具，不能记为真实网站或权限 UI PASS。相关 JS 语法检查、组件编译及 scoped `git diff --check` 通过；未运行无关全量 CI。日志及源码哈希见[本轮证据摘要](../evidence/background-migration-20261104.json)。

**同候选构建与真实 Chromium 传输：** 在独立物理快照 `/private/tmp/opendesk-webflow-background-a_7ole3z` 使用原 `node scripts/build.mjs development` 构建通过；产物为该目录的 `dist/development`，静态开发包、未连接 serve、非 production。原回执 `evidence/build-development.json`，packageHash `f73280c222dd17c441541cea35129b62ce184f8053c949295329db3852c5f088`，构建期间原回执输入漂移为空；另核对本轮 14 个实现/生成器/审查文件与实际快照字节全部相同。第一次快照缺少已有根 `native-agent/local-project-source-contract.mjs`，补复制原依赖后经原门禁重建通过，未修改产品来适配快照。

自建无登录、无授权、无 Task 的 headless CFT 154.0.8037.92 实测原 SW 启动、原 Offscreen bootstrap、实际 SW `MessageSender` 及原 `stop-owned` ACK，通过且全过程无 Side Panel。实际测试扩展 ID `dnjckkpphhkcclmlklopilmipdjfeamc`；这是本临时路径的 ID，不是日常扩展/Native 配对证据。产物前后指纹一致，launcher 正常关闭本实例并删除本临时 Profile，cleanup PASS。首次驱动绑定早期 SW 目标时 CDP 求值超时，保留 FAIL 与清理证据；随后按既有驱动绑定稳定的原 worker context 后 PASS，没有为此改产品。完整报告在 `artifacts/webflow/background-migration-20261104/runtime-smoke-bound-context.json`；本项仅证明传输，不代替以下实网验收。

| 当前用户验收项 | 源码/夹具结果 | 同候选官方 ChatGPT + 百度 |
|---|---|---|
| 可信 UI 对当前已安装任务/来源/目标一次授权，关闭侧栏后新回复自动执行 | 原授权与后台准入保护 PASS | NOT_TESTED |
| 实际输入、搜索、导航、读取三条结果、持久化、释放、原聊天一次回传与 AI 续答 | 原 Run/Result/交付及分阶段回执 PASS | NOT_TESTED |
| 同一有效授权下第二次独立请求，身份/结果分别正确，每次一次 | PASS | NOT_TESTED |
| 重复候选、关闭/撤销、任务/来源失配拒绝执行 | PASS | NOT_TESTED |
| 导航/换聊天后禁止错误交付 | PASS | NOT_TESTED |
| 执行/交付 ACK 丢失、SW 重建后查询原身份，不盲目重跑/重发 | PASS，含新 owner 拒绝接管 | NOT_TESTED；透明重启续跑未实现或证明 |

**实网阻塞与下一条操作：** 三个已登记 ChatGPT Profile 分别属于 `01a181b4-3c6d-7831-b003-73965362118e`、`01a18c66-2de6-7822-a7b4-96e53c2b2f68`、`01a19d33-48b5-7aa2-8081-86e6de53afac`。最后 status 的桌面锁为空，但 Profile 租约仍在；进程退出或租约陈旧不构成移交。个人 [chatgpt-test-profiles Skill](/Users/shopme/.codex/skills/chatgpt-test-profiles/SKILL.md) 明确“都已占用则报告忙碌，不触发扩容”“不会因超时抢走其他owner”，因此未操作这些实例、强抢租约、另建登录池或发未经授权的跨聊天消息。合法释放/明确移交后，下一条操作是在本 owner 的隔离浏览器绑定本候选，沿可信 UI 核对已安装百度任务与权限并只批准一次，再做下列两轮；如出现验证码、站点限制、权限缺口或未知副作用，停止相应动作并记录，不重放。

**当前版本用户手测步骤与提示词：**

1. 在可合法独占的隔离测试浏览器确认实际扩展路径、ID 和上述候选 packageHash；不要用旧日常产物冒充新版本，也不要重装日常扩展。打开「扩展 → Web Flow → 运行与授权」，检查真实已安装 `baidu.search.top3` 的版本、源码与安装代际。仓库任务包当前为 **1.1.3**，但本轮未读取浏览器实际安装，不能假定二者相同；版本不可用或身份变化时停止，由正常可信流程处理，不复用旧批准。
2. 在可信 UI 审阅并批准来源 `https://chatgpt.com`、任务 `baidu.search.top3`、目标 `https://www.baidu.com/`、完整参数 `{"query":"OpenDesk Browser","limit":3}` 的精确范围，开启自动运行一次。必要的网站权限仍由可信手势批准。生成两个不同候选提示词后关闭侧栏；没有匹配授权时网页应保持待批准，模型文字不构成批准。
3. 在官方 ChatGPT 新对话**只发送一次**[第一轮当前生成提示词](../tests/manual-background-baidu-first.prompt.txt)，不要点击采用/执行。等完整 `opendesk-task` 回复后观察真实百度输入、一次搜索与导航、三条真实结果、目标资源释放、原聊天单条 `opendesk.task.result.v1` 用户消息和 AI 续答。缺少任何一步分别记录，不能用 AI 推断补齐结果。
4. 第一轮明确结束后，在同一聊天、同一有效授权下**只发送一次**[第二轮当前生成提示词](../tests/manual-background-baidu-second.prompt.txt)，保持侧栏关闭，核对两套不同 request / Run / Result，每套仅执行和回传一次。不要复用第一轮 candidateId。
5. 重开「运行与授权」查看「后台原请求与对账」，并从原任务最近结果核对两次持久原值、资源与交付身份。执行完成、结果已核实、释放、交付确认、AI 续答分别看；UNKNOWN 只查询原记录，不换 ID 重跑或补发。测试结束通过可信 UI 关闭本轮自动运行并撤销本轮批准，保留结果供复核。

两份文件由当前 `AutoSettings.tsx` 中原 `ApprovedTaskPrompt` 的生成动作产生，并经原五字段解析器核验；不是浏览器里已完成授权的证据。生成器 SHA256 `9f80d769e386d612176f5ad19acf9a4bc1802bf3e0c692756ea85da2d19d0274`；候选分别为 `wf-872ae43b-b58f-46a8-99d4-5bf97beb3092` 和 `wf-de4f3c44-7abd-42ff-8164-f206c387467e`，均尚未发送。未来测试用过后应从同一可信组件重新生成，不修改或重用已消费候选。本文两轮和拒绝/故障矩阵在真实站点仍未完成，整个迁移不记为已正式验收。

#### 12.21.1 本聊天持续目标与关键测试条件（2026-11-04）

用户明确要求设置目标后，已通过原生 `create_goal` 为本聊天 `01a1a27d-949e-7fd2-b22e-c0213e3c6410` 创建 **active** 目标，无指定 token 预算。目标是：**完成现有 Web Flow 的 ChatGPT 后台迁移，在精确可信持续授权内，关闭侧栏完成两次独立真实执行、保存结果、释放资源及原聊天各一次回传和 AI 续答，并验证拒绝与未知状态不重放。** 继续复用原框架与上述 owner，不新建另一份总计划。状态以原生 `get_goal` 实读为准；本文不是应用状态的替代存储。

以下条件已经写入原生目标。全部真实验收绑定**同一 dev 候选、同一个合法独占隔离浏览器**；源码测试与历史证据单独保留，不折算为实网 PASS。

| 条件 | 具体操作与通过标准 | 设置时状态 |
|---|---|---|
| K01 候选与资源身份 | 重查 main/diff、文件 owner、Profile/UI 租约；核对真实扩展路径、ID、候选指纹/模式、登录，以及已安装任务的版本、源码、manifest、revision、installationId、generation。源码包不当安装证明 | 待重查；已有构建/传输证据，实际安装身份未读 |
| K02 一次精确可信授权 | 通过真实可信 UI 一次批准 `baidu.search.top3`、来源 `https://chatgpt.com`、目标 `https://www.baidu.com/`、完整参数 `{"query":"OpenDesk Browser","limit":3}`，开启后关闭侧栏；缺少网站权限仍走原可信手势链 | 实网 NOT_TESTED |
| K03 第一轮关闭侧栏闭环 | 官方新聊天发送一次当前生成的全新固定协议提示词，不点采用/执行；观察实际输入、一次搜索、导航、三条真实结果；同一 request/Run/Result、持久原值、released、原聊天单条结果及 AI 续答分别确认 | 源码/夹具 PASS；实网 NOT_TESTED |
| K04 同授权第二次独立请求 | 第一轮明确结束后，同一仍有效授权发送第二个新候选，继续关闭侧栏且不再批准；两轮 request/Run/Result 正确，每轮各执行/回传一次。相同查询的数据值可以相同 | 源码/夹具 PASS；实网 NOT_TESTED |
| K05 拒绝与零副作用 | 重复候选、关闭开关、撤权、任务/安装版本或来源失配均拒绝，新增 Run、网站效果、交付为零；保持原单槽与安全链 | 源码/夹具 PASS；实网 NOT_TESTED |
| K06 原聊天及最终交付检查 | 原聊天/URL/document 导航变化不向错误聊天发送；取消、安装或授权变化交错继续拦截；未知交付不补发给替代聊天 | 源码/夹具 PASS；实网 NOT_TESTED |
| K07 执行和交付 ACK 丢失 | 自有隔离环境分别有界验证两种丢失，先查原账本与 Run/Result；执行不换 ID、不启动第二 Run，交付保留 unknown、不重复发送；可信 UI 能查看和处理 | 源码/夹具 PASS；实网 NOT_TESTED |
| K08 SW/浏览器重启对账 | 验证自有 SW 重建后原身份对账；原 Offscreen 存活只查同一 owner。更换 owner 或浏览器重启后，无法确认副作用就保持 UNKNOWN/paused_unknown，不接管、不重跑、不重发 | 源码/夹具 PASS；实网 NOT_TESTED；透明续跑未实现或证明 |
| K09 可复核交付与收尾 | 分别报告源码和真实结果、每阶段身份及一次效果；保留当前提示词/手测步骤；可信 UI 收尾本轮开关/批准，按原 owner 命令清理自有资源；未知动作先对账，不误报清理成功 | 源码交付已有；实网收尾 NOT_TESTED |

**硬条件与完成线：** 核心真实双轮、可信授权、身份与来源隔离、拒绝零副作用、未知不重放必须通过；每个适用条件都有当前候选对应证据才完成原生目标。透明重启续跑不作本轮前提，未实现/未证明必须继续明确列为未完成；不能以 `paused_unknown` 表述为续跑成功。出现 Profile/窗口归属不明、验证码、站点限制、权限缺口或未知副作用时，停止相应动作、记录阻塞并继续独立必要工作，不制造 PASS。

**持续边界：** 保留 main、并行改动、现有 watcher 和日常加载目录；不新建分支/worktree/PR、不提交/推送/发布/重装，不未经授权向其他聊天发消息或抢浏览器。第二 AI、完整多来源管理、production、95 分评分和无关全量 CI 不作前置。319+7 源码 PASS、快照构建及传输 PASS 是上次基线，未因设置目标重复执行；后续仅在变更、失败或证据失效时补相关验证。下一条实际操作为重查合法 Profile/窗口租约与候选身份，再执行 K02–K04；历史占用不构成抢占依据。

**设置目标后的第一次实测入口复核：** 上个目标回合已创建原生目标并固定条件，属于已完成的进展；本回合没有取得新的实网执行证据。14 个实现/生成器/审查输入均与快照相同，171 个产物文件的 packageHash 仍为上述值，无需重建或重复源码测试；PID 19312 及两开发端口仍存活。三个 Profile 租约仍属其他 owner，当前原生 UI 锁改由 `01a1a297-f4bc-7992-b2c9-45fe3161ab4e` 持有。只读核对 `test-chatgpt-03` 原 owner 的最后一轮已结束，其原目标报告 blocked、浏览器正常关闭但租约未释放；其上次页面提示登录过期，不当作当前登录实读。已向用户提出仅移交该关闭 Profile 的明确选项，不包含接管现有 UI 锁，也没有默认批准、代签 owner 或改注册表。目标保持 active；这是创建目标后的第一次实际入口阻塞审计，不提前记 blocked。获得明确移交或合法空闲后再按原管理命令申请，核验正常登录与窗口身份，随后做 K02–K04。证据摘要保存了本次检查，K02–K08 实网仍 NOT_TESTED。

**用户授权移交后的实际进展：** 用户明确回复“移交 test-chatgpt-03 给本聊天”。确认该目录无运行进程后，按用户授权通过原 `profiles.py --owner <旧owner> release --name test-chatgpt-03` 释放，再用本聊天 owner 原 `acquire` 申请成功；仅此 Profile 转移，未手改注册表或接管原生 UI 锁。随后在本 owner 独占 headless 实例 PID 84750/端口 57495 使用原 `check` 检查现有登录：官方 ChatGPT 显示“请稍候…”、`challenge:true`、无账号菜单和编辑器，结果 `NOT_VERIFIED`。没有刷新、循环导入 Cookie、自动点击验证、发送消息或运行任务；原 `stop` 命令已正常关闭本实例，保留本聊天 Profile 租约与登录数据。原 helper 截图只在私有 slot 中，不复制入项目。这是已完成的资源移交和当前登录诊断，不是实网业务 PASS。

当前桌面 UI owner 仍为 `01a1a297-f4bc-7992-b2c9-45fe3161ab4e`，其原生聊天实读 `active/inProgress`，不能按空闲或结束处理。下一步在其正常释放后取得本 owner UI 锁，准确绑定此 Profile 的可见窗口，按网站正常流程处理验证并核对登录；不再以“全部 Profile 被占用”作为本聊天阻塞理由。源码映射另证实日常 SW/可信侧栏主包尚缺本轮迁移，而 ChatGPT 页面桥接已更新；没有操作日常 writer 或把混合产物当成本候选。原冻结静态 dev 候选保持有效，实际业务验收仍须核对加载身份并满足 K01–K09。新外部条件为原生 UI 忙及网站验证，不沿用旧 Profile 租约阻塞次数；目标继续 active。

**移交后的连续阻塞审计结论：** 移交并诊断出网站验证的回合、其后一次实时 owner 等待及本次复核，共三回合均未取得合法原生 UI 使用权及正常登录条件。本次原 owner 的同一 turn 实读仍为 `active/inProgress`（cursor `357db128-ec80-4749-9528-08e3bd0f4fec:8`），不因等待超时判定结束。14 个本轮实现输入无漂移，原候选仍在，没有需要独立继续的已知源码修复或失效测试；未重复启动浏览器、导入 Cookie 或重跑测试。已经通过原生 `update_goal(status="blocked")` 登记，工具回读确认为 **blocked**，不是 complete 或用户暂停；目标全文和 K01–K09 不变。已完成的源码、构建和传输证据保留，实网双轮、拒绝及故障条件仍 NOT_TESTED。`test-chatgpt-03` 继续由本聊天保留、无运行进程，其他 owner 的浏览器和 watcher 不动。恢复须先由原 owner 正常释放 UI，再取得本 owner UI 锁、绑定本 Profile 可见窗口、按网站正常流程完成验证并确认登录，随后从 K01 继续。没有将“设置阻塞状态”当作产品目标已完成，也不以反复查询维持续跑。


#### 12.21.2 新对话续接的实际入口检查（2026-11-04）

本对话 `01a1a2b9-3b15-7a83-9c14-661dee32475d` 首先调用原生 `get_goal`，返回 `goal: null`；随后通过 `create_goal` 建立包含最终后台行为、K01–K09、约束和停止条件的 **active** 目标，未设置 token_budget。原对话目标按用户交接为 paused，本次没有跨对话迁移或改写它，亦未把未完成工作标完成。

当前 `main` HEAD 仍为 `45d561be780374d84b51ec22ff708fa4aeef2775`。本轮 14 个迁移/生成器输入与原已构建快照的字节均相同，复用原源码测试、静态构建和传输证据，没有重复运行测试或独立构建。已阅读实际迁移 diff 和 SW → 原 Ingress/Adapter → 原 ledger → Offscreen Runner/RunHost → Authority → 原聊天交付调用链，没有据此新增另一套实现。

**资源已取得，原生入口仍阻塞：** 用本对话真实 ID 显式 acquire `test-chatgpt-03` 成功，目录及登录态保留，当前没有本对话启动的浏览器。原 `ui-acquire` 返回 busy；最后实读 UI owner 为 `01a1a2b7-4e36-7ae0-8367-5c7086a3325a`，不操作或查询其窗口，不代其释放、不发协调消息。01/02 租约及浏览器保持不动。当前正常登录、窗口/PID/CDP 绑定和实际安装任务身份均 **NOT_READ_CURRENTLY**；旧挑战页不当作当前现场。

**候选接入的具体缺口：** Profile03 的只读扩展元数据仍指向 `ccfcjegpkdlgbclopjmadlcjedelidmf`、仓库 `dist/development`，禁用原因列表为空；这不是运行时安装或开发连接证明。原 writer PID 19312、43119/43120 与输出锁仍存活。本轮沿原 watcher 对自有源码做内容不变的保存探针：cloud runner 与 ChatGPT page bridge 的相关源码映射相同，SW 与可信 tool-shell 的相关源码映射仍不同，且 SW 中缺少本轮后台 adapter。最新磁盘 revision 为 `19daad2a5a34aa96d19e6329cd40e0b684ae5f817cddb4542fe056d23094cb0c`；发布标记存在不能证明全部本轮迁移已经进入候选。未从现有可读信息确认两个入口未更新的原因，不能擅自断言是源码、pin、预算或 watcher 错误。没有停止/重启原 watcher、另起 writer、覆盖产物、重装扩展，亦未把不同 ID 的静态快照加入 Profile03。

本轮证据追加在[原摘要的 continuations](../evidence/background-migration-20261104.json)，实际检查明细为 `artifacts/webflow/background-migration-20261104/current-entry-01a1a2b9.json`。K01 部分完成；K02–K08 当前候选实网仍 **NOT_TESTED**，业务消息/新 Run 均为 0；K09 仅完成本次来源与阻塞记录。旧字段中的 owner/blocked/UI 忙均保留为历史时点，不能覆盖本节。现成两份提示词未发送、未重用，发送前仍须从当前可信生成动作产生新 ID 并核对实际安装任务。

下一条操作仍是：UI 合法释放后取得本 owner 租约并准确绑定可见 Profile03，沿原共享 writer 取得包含后台迁移的当前日常候选（不重装、不绕过刷新保护），核对官方登录与真实安装百度任务，再做可信 UI 一次精确批准、关闭侧栏双轮。若候选更新确实要求改变“不得重启共享 writer”等当前边界，只暂停该动作并明确所需协调；不自行绕过。这个新目标的第一次入口阻塞审计保持 active，未提前设为 blocked 或 complete。


**本新目标的连续三轮入口审计结论：** 首轮完成目标建立、Profile03 申请及日常候选缺口取证；第二轮对当前实时 UI owner 有界等待，仍 active/inProgress；第三轮再次用同一 turn 与 cursor 核对，仍 inProgress，UI 申请失败。最新磁盘 revision `8bd51efe934afb2c4c4ac2eb98e51589a6a5051c7ba677db7cc3cb373e0e5d15` 中，SW/可信 tool-shell 相关源码映射仍旧，14 个迁移输入无漂移；没有独立必要源码修复或失效测试可继续。相同实际阻塞已连续三轮，原生 `update_goal(status="blocked")` 回读确认为 **blocked**，原目标全文与 K01–K09 不变，未标完成。已通过本 owner 原 `release --name test-chatgpt-03` 正常释放未运行的 slot，返回 released；目录和登录数据保留，没有取得或释放他人的 UI 锁。恢复时需重新显式 acquire Profile03 及 UI，沿原 writer 取得当前迁移候选、绑定窗口并核对登录/实际安装任务，然后继续 K02–K04。未启动浏览器、未发送消息、未执行任务、未重跑测试或构建；K02–K08 实网仍 NOT_TESTED。源码、旧构建、传输冒烟与真实验收继续分开。后续停止轮询，不通过重复检查维持续跑。


### 12.22 官方 ChatGPT 图片保存增量：核心链尚未完成（2026-11-04）

**当前结果：官方新图与完整资源字节已证明；P0 固定流程保存、已安装 Native 核验及原聊天单次回传未完成；P1 未开始。** owner 为聊天 01a1a2b7-5802-74d0-944a-7bb6ad5027e8，原生 goal 最后实读 active。沿用本计划、原 Web Flow / 固定协议、Chrome downloads 和 Native files；不新建总计划、下载引擎、授权层或 MCP Tunnel。仅核心开发及必要验证，没有提交、推送、重装、新分支/worktree 或停止他人服务。

**真实来源与本轮新证据：** 在官方 [原聊天](https://chatgpt.com/c/6aea2fc0-db1c-83e8-a953-15eeeed62e12) 只发送一次非敏感生成提示，得到白底蓝色卡通小猫、无文字或球。官方查看器的一次诊断下载已完成；保留原 Downloads 文件，并以 COPYFILE_EXCL 复制到批准目录的 official-source-probe.png，字节相同。macOS ImageIO 完整缓存解码及 CoreGraphics 光栅读取通过：PNG、1254×1254、1,367,957 字节，SHA256 为 0e9ae73bb864c59427f9e13b8ba905abab3f9ef0560fda5dfe1cd94dc4b0b05d。本轮又在原官网页面通过 CUA 操作 Console，对选中 gallery blob 做一次只读 fetch / digest；MIME、字节数、尺寸和 SHA 与官方完整下载逐项相同。先前“两个 blob URL 不同所以原资源映射未知”已被本张图片的字节证据解除，不继续沿用旧阻塞；此结论限当前已核对资源，不宣称任意 blob 都是完整生成图。

**发现与最小实现：** 这是经审计第一方可信功能，业务 owner 为 projects/webflow/trusted/chatgpt-{image-page,images,images-ui}.js；settings.html#chatgpt-images 是原扩展的可信审阅页。继续复用 workspace-chatgpt 来源/回复/草稿入口、NativeConnection / File Workspace Service 和 Chrome downloads。公开下载能力没有可信落盘解码元数据，原 files.read 仅为 32768 字节文本合同，已证明的公共缺口限定为授权目录内只读 files.inspectImage。Browser 原链增补此方法，Native master 的 files_image_unix.go 复用 session / workspace grant / lease 和 descriptor-relative、no-follow、设备及硬链接保护，8 MiB 数据 / 16×1024×1024 像素上限、稳定快照和完整 PNG/JPEG 解码，返回可信路径、尺寸、字节数和 SHA，不传二进制或新增下载器。旧文本读写及 SHA 合同保持。

**本轮实际 DOM 与摘要修复：** 官网助手节点现在仅有单个 UUID 的 data-chatgpt-search-message-ids，其直接父节点有唯一 assistant 角色标题；同一 complete turn 同时含 user / assistant，不能用宽祖先推断角色。共享读取器据此增加窄适配，并保留用户最新轮次、唯一完整代码块、嵌套来源、隐藏/引用、streaming 和请求 echo 检查。图片观察器要求完成的助手、明确 gallery / preview、精确图片 owner，拒绝引用、普通附件、未知 CDN、跨站或非 UUID blob；当前已证明官网形态的 same-origin blob 可作为显式选择。仅对选中资源读取有界流并计算摘要，异步后再查图片、文档、生成状态和尺寸。准备请求固定 expectedSha256；下载前复查同一消息/asset、SHA、字节、MIME、尺寸，独立 Native 读回必须匹配相同 SHA，防止同尺寸不同内容误报成功。固定协议只回显可信页字段，模型不能加 URL、Shell、授权或覆盖参数。

**生命周期与零重放：** 原来源/document、Native session/grant 在最终边界回查；先持久 dispatch / delivery fence，Chrome 另存为使用新文件和 uniquify，已存在或错误文件拒绝。原下载 ACK 丢失、同路径未知结果、回填未知不换 request 绕过或重复执行；输入框草稿导致明确 NOT_DISPATCHED 时允许同一操作 ID 重试，真正 unknown / replay 仍保留 fence；过期仅允许查询原下载/已发送结果。结果草稿不等于送达，只有原聊天可见真实 resultId 才记 received。3 个业务文件仅按精确 Git blob 摘要准入原 settings / transport，UI 不进入 transport，错误目标、变更字节及 symlink 继续拒绝。

**当前运行边界：** 原 PID 19312 watcher 曾自动产出包含图片协议的 settings / transport，仍使用 dist/development，没有第二 writer。完成本轮准入摘要后，仅触发原 watcher 重读配置（配置字节未变、原 PID 保留）；settings / transport 的 5 项适用 source map 输入已与当前源码逐字节相同。该证据证明持续开发产物同源，不证明浏览器已安全重载或 Native 已激活。扩展 ID ccfcjegpkdlgbclopjmadlcjedelidmf 与原 Native doctor / allowed_origins 配对；serve 已连接是上次 UI 观察，实际加载目录未从扩展详情重新证明。已安装 Native 仍为旧 build-cookie-service-20261031-a92036ec。独立官方完整签名 App 已构建成功，位于 Native 仓库 .runtime/tests/chatgpt-images-20261104/native-candidate/OpenDesk.app；主 App、vision / status helper 连续性通过，但 UI helper 从旧裸路径/identifier 迁移为嵌套 App / 新 identifier，整包连续性检查 FAIL。两包完整签名有效；该失败不是主程序签名失败，也不是 updater 强制的 Native 注册拦截，但不能宣称 GUI/TCC 连续性通过。不替换 signed bundle 内单个二进制，不放宽检查器。

**真实链仍有具体阻塞：** 只读核查 Native Host PID 13799 没有可见本地 accepted client、网络连接或子进程，但仍连接共享 Chrome；原 status 不提供全局 idle 证明，不能排除 Chrome-originated pending AI。官方 browser update 要求原 Host/socket 退出，当前未确认所有消费者空闲，因而没有断开、停止或激活候选。另一次 Chrome downloads.download 精确 blob 诊断调出 Save As，但随后 AX 窗口变为 scrapyjs 文件名，未点保存、未猜测归属，结果 UNKNOWN，未重试。尝试绑定本任务扩展标签页时，浏览器安全工具明确拒绝 chrome-extension 协议并禁止换入口绕过；此后停止相关 UI 操作，没有从其他 surface 或命令继续访问。原生 UI 锁已通过本 owner 原命令释放；未知保存窗口和 DevTools 不冒称已关闭。下一条真实操作需要工具允许访问的可信审阅入口，以及共享 Native 连接可安全更新的明确空闲条件；不得通过手改配置、猜测下载归属或中断他人工作绕过。

**验证范围：** 本轮先以失败测试复现摘要冲突、新 DOM 识别和引用图片误选，修复后图片/原 files/共享读取定向文件合计 87 PASS，来源准入定向 3 PASS，语法和 git diff --check 通过。共享读取器子 agent 另报告关联调用方定向合计 130 PASS。之前 Native TestNativeFilesInspectImage 主聊天新运行 PASS，子 agent 报告 files/lease/MCP 定向 race 与 vet PASS（race 有既有 LC_DYSYMTAB 警告），相关 Native 输入未变化，不重复构建或测试。无关 package brand 断言曾失败并保留，不宣称全 CI 通过。独立复查先提出图片 owner 歧义及明确未插入后无法重试两项 MEDIUM，均以失败回归复现并修复；同一 reviewer 复查无剩余具体 HIGH/MEDIUM，3 个定向回归通过。自动验证与源码审查均不替代真实 Chrome 下载完成、已安装 Native 联合核验或原聊天单次回执。

已批准目录仍为 artifacts/chatgpt-images-20261104/workspace，workspaceId 为 workspace-9266be80-75fa-463a-bd51-b63e6444d22d。唯一已核对落盘文件是手动诊断 official-source-probe.png；它不算固定协议保存。原对话未发送固定保存请求或结果，P0 未完成，P1 尚未上传或编辑。安全入口恢复后从原图显式选择 / 新文件路径继续，取得真实下载 ID、独立读回及单次原聊天结果；P0 后再上传同一图做语义编辑、另存并核对原图不变。并行文本协议、后台迁移、共享 Chat 和其他改动保留。本机最新产物/源码摘要、检查与阻塞见[本轮证据](../../../artifacts/chatgpt-images-20261104/evidence.json)。


**连续三轮阻塞审计结果：** 上一目标回合完成真实 blob / 官方原图字节比对、DOM / SHA / 重试边界修复及同源产物，属于 progress。本轮只读复核发现旧 PID 13799 已退出，但 Chrome PID 47748 已自动建立同一旧签名包的新 Host PID 20110，agent.sock 仍由其监听；不是得到安全维护窗口，亦不是新版 inspector 已激活。当前相关 Browser / Native 输入、5 项来源映射及原诊断文件均未变化，没有重复测试、构建、下载、浏览器动作或停止服务。共享 Native 安全更新条件未满足是从原始目标回合至本轮连续三轮的同一真实阻塞，工具禁止扩展协议访问的边界也仍有效，所请求的维护窗口 / 人工接管信息尚未收到。没有剩余可独立推进的必要修复，因此原生 update_goal(status="blocked") 已回读确认为 **blocked**；完整 P0/P1 目标保留，未标 complete 或用户 paused。P0 固定保存 / 已安装 Native 读回 / 原聊天单次回执仍未完成，P1 未开始。停止循环复查，待共享 Native 的安全维护条件及获准可信操作入口实际具备后，再恢复原图的新路径保存链；未知诊断下载只对账、不重放。详情记入本轮 evidence.json 的 blockedAudit。

### 12.23 任务协议可读显示与内部编解码（2026-11-04）

**当前操作与原因：** 用户看到的 `opendesk-task` JSON 将网址斜杠显示成 Unicode 转义。实际 `WebflowAutoSettings` 的“生成 ChatGPT 指令 / 复制指令 / 一次接入能力说明”组件入口复现了该行为：`AutoSettings.tsx` 主动改写全部斜杠，单次指令还额外改写反引号；原五字段解析器已经支持普通网址和合法 JSON 转义。历史为官网富链接和自动化发送见证添加的可见转义，被本轮用户要求取代。

**归属与修复：** Web Flow 组合式应用的固定可信 Side Panel UI，owner 为 `projects/webflow/trusted/AutoSettings.tsx`，按 `opendesk-trusted-sidebar-feature` 处理。显示与剪贴板复用标准 `JSON.stringify`，返回复用原 Bridge / `validateWebFlowTaskIntent` 的 `JSON.parse`；没有公共 SDK 缺口，不新增 Framework API、解码器或安装器。网址、中文及普通标点直接显示，仅保留引号、反斜杠和换行必需的 JSON 语法处理，并在能力说明中要求 AI 同样输出可读 JSON。用户无需手工转码。原严格五字段、任务身份、权限与发送保护继续适用。

**写入与验证：** 修改上述组件、原 `auto-settings-ui.test.mjs`、现用 `protocol-auto-first.prompt.txt` / `protocol-auto-followup.prompt.txt`、README、本节，以及 `scripts/bundle-provenance.mjs` 的该组件一条摘要。组件 Git blob 为 `3868a516fef337d7d7e62698a979538d08806cef`；真实 `describeBundle` 核验仅准入原 `ui/tool-shell.js`，错误 SW / Content / sidebar-tool-host 目标继续拒绝。现有三个行为用例先因可见网址转义而失败，修复后通过；随后 `node --test projects/webflow/tests/auto-settings-ui.test.mjs projects/webflow/tests/reply-admission.test.mjs` 共 43 PASS，覆盖显示/复制、中文/反引号/引号/反斜杠/字面转义值、普通与合法转义 JSON 内部解析等价、安装变化/撤销、唯一完整回复与防重放。原 esbuild 夹具只在内存编译组件。未改旧固定 candidateId 料件、历史证据或并行 background 料件。

**运行与边界：** 保持 main 和全部并行改动，不提交/推送，不替换正式工具 JSON，不启动/停止/重启 watcher，不静态构建或写 `dist/development`，不发送浏览器/模型消息，不重放任务或重装工具。本轮是源码与内存组件验证；日常目录仍为仓库 `dist/development`，实际 Chrome 加载路径/ID、serve 连接、指纹及新源码是否安全应用未重查。真实 Chrome 新显示、粘贴发送及官网 AI 可读输出为 `NOT_TESTED`；production、评分和完整验收延期。后续只核对本次显示与复制变化，不恢复历史双轮执行等无关目标。

**本目标续核：生成 → 官网代码块读取 → 严格解析（2026-11-04）：** 用户明确要求核对对应逻辑、提示词约束与转码风险，并建立完成目标；本聊天已通过原生 `create_goal` 建立本次可读协议目标，没有另建总计划。实际代码改动在 `AutoSettings.tsx` 的 `ApprovedTaskPrompt` / `ChatGPTConnection`：前者删除网址和反引号的额外改写，后者删除能力与批准范围 JSON 的斜杠改写，并增加可读 JSON 的 AI 约束。提示词提高模型输出一致性，程序的标准序列化、原始文本读取和严格校验负责正确性，不要求人工替换文本。

现有链路为 `workspace-chatgpt.js` 从唯一完整助手代码块读取 `code.textContent` → Page / Background 原样传递 `candidateText` → `validateWebFlowTaskIntent` 对原始 JSON 文本解析。各边界会独立校验同一原始文本，不对已经解析的字符串再次 Unicode / HTML / URL 解码。旧 `opendesk-request` 手动 Bridge 的提示词属于另一协议，本轮不改。独立只读 reviewer 未发现本轮具体 HIGH / MEDIUM 问题；该结论不替代官网实测。

在原 `reply-admission.test.mjs` 增加真实读取器与解析器联合回归：6 类参数 × 5 种合法 JSON 表达共 30 项子用例覆盖中文 / emoji / 组合字符、标点、字面反斜杠、实际控制字符、HTML-looking 数据与百分号文本；分散高亮文本节点合并后保持原始字节及解析值。另有 7 项子用例拒绝非法转义、Unicode 解码后重复键、二次编码 / Markdown / HTML 实体网址和超长 JSON，全部在授权或派发前失败。两份定向测试文件合计 **82 PASS**；随后发现并行 listener UI 源码变化，仅重跑本次显示 / 复制 / 能力说明 / 联合解析相关选择，**42 PASS**。没有为了本轮新增失败而改原生产解析器。

真实无界面 CFT 154.0.8037.92 中，通过原组件及真实解析器完成生成 → 显示 → 原复制按钮 → 解析 → 新候选检查，标准 JSON 与合法斜杠转义解析值一致，中文、emoji、引号和字面反斜杠保留；授权 / 执行边界调用为零。安装、任务目录与剪贴板由夹具模拟，不是已安装扩展或系统剪贴板的证明。该组件候选为上文 `3868a516…` 源码；报告与截图位于 `artifacts/webflow/readable-json-01a1a54b/`。本 owner 正常申请已有空闲 Profile03，官网停在挑战页，未发送任何消息或任务；已正常关闭本 owner 的浏览器并释放租约，保留登录目录，没有操作其他 Profile 或 UI 锁。

**当前应用边界：** 本次只读检查时，`dist/development/ui/tool-shell.js.map` 中该组件尚未与本次源码相同，锁文件记载的 PID 35137 已退出，43120 没有监听；同时其他 owner 正在修改同一文件的 listener 功能，源码已变化为 `2c16c6a6…`，原精确准入摘要仍为已复核的 `3868a516…`。这是检查时点的混合开发状态，不证明已安装扩展收到修改，也不授权本聊天替其他 owner 审核并更新整份文件摘要。保留并行变化、原输出和来源围栏，不启动新 writer、不覆盖产物。并行 owner 完成其源码与摘要集成后，沿正常持续开发入口安全应用；本次不恢复双轮任务、正式安装或 production 验收。官网 AI 本轮可读输出与已加载扩展的新链仍为 **NOT_TESTED**；已完成的源码及组件验证与这两项未测边界分开记录。

**本目标收尾状态：** 源码修复、定向解析验证及真实 Chromium 组件验证已完成；原生 goal 保持 **active**，未把尚未进入日常产物的变更或官网受阻链标完成。15:05 CST 再次只读检查时，并行源码已变为 `f771f366…`，原准入摘要未变；日常 source map 中仍没有新的可读 JSON 逻辑。继续所需的是并行 UI owner 完成当前候选及精确摘要集成，然后核对正常开发产物与已加载扩展；官网挑战解除前只记录未测，不重发任务。本聊天停止修改共享组件和准入摘要，保留本轮回归与记录；单次状态摘要为 `artifacts/webflow/readable-json-01a1a54b/status.json`。没有重复构建、重跑无关测试或抢占并行资源。

**连续三轮同一阻塞的审计结果（15:14 CST）：** 前轮完成源码与回归后，在两次原目标续跑中再次核对同一 UI 文件、精确准入和日常候选，并通过 `wait_threads` 确认实际 owner 聊天「Web Flow 监听状态与后台闭环（95+）」仍为 active / inProgress；等待超时未当作任务退出或重启理由。该 owner 仍在修复独立审查发现的未知回传 / 安全刷新问题。本轮先后检查源码 `f645ed7e…` / `27d7e6f5…`，均与原准入摘要 `3868a516…` 不匹配，日常 `ui/tool-shell.js.map` 已缺失，开发锁与 43120 监听均不存在；缺失产物只记为当前不可用，不推断损坏原因，不自行恢复共享 writer。没有剩余可独立推进的必要源码修复；源码生成、解析、防重放与组件证据复用，不重复测试。本目标原文保留，原生 `update_goal(status="blocked")` 已回读确认为 **blocked**，未标 complete 或 paused。待当前 UI owner 完成审核及源码/摘要集成、正常日常候选可用后，恢复本次已加载扩展的显示 / 复制 / 读取核对；官网挑战未解除仍记录 NOT_TESTED。实读状态与恢复入口追加在上述 `status.json`，此后停止循环等待，不占用其他浏览器、输出或文件。

**用户恢复后的首轮核查（15:21 CST）：** 原生目标已由用户恢复 active，阻塞计数重新开始。实读源码仍为 `27d7e6f5…`、准入仍为 `3868a516…`，日常 source map / 开发锁缺失，43120 无监听；通过同一实际 owner 的 `wait_threads` 句柄确认其仍为 active / inProgress，独立复审后的安全刷新竞态仍在处理，原生 UI 租约现由该 owner 持有。完成一次 45 秒有界等待，没有把超时当任务退出，没有另起 writer、占用浏览器、复跑已通过测试或扩大写入。目标继续 active，完整范围不变；本轮为 verified wait，当前精确句柄及恢复审计已写入原 `status.json`。

**恢复后的三轮审计结束（15:25 CST）：** 恢复首轮及两次续跑均以当前文件和同一 live peer 句柄核对，源码 `27d7e6f5…` / 准入 `3868a516…` 持续不匹配，日常 source map 与开发锁缺失、43120 无监听；peer 仍 active / inProgress，未完成候选集成。前轮为 verified wait，超时没有被解释为退出；本轮没有其他必要独立修复可做。原生 `update_goal(status="blocked")` 已再次确认 **blocked**，完整目标与官网 / 已加载扩展未测项不变。当前候选与来源摘要集成完成、正常开发产物可用后再恢复；不继续循环查询，不覆盖共享文件 / 输出，不另启 writer 或重放任务。准确审计与恢复条件保留在原 `status.json`。

**再次恢复后的实际进展（15:31 CST）：** 本轮先确认原 owner 仍 active，再沿其实际开发进程等待，未另起 writer。原 owner 已将当前组件精确准入更新为 `27d7e6f577f161a5cb5b86f195c3c6775d4b84ee`，并通过原 `npm run dev` 启动 PID 87636 / 43120；此前的摘要与缺失产物阻塞已解除。日常候选 `8844987b8b6c806d43c1292dbd40a867a05c0e3e6e67a59063af5f3827b3a3cc` 的 tool-shell / page bridge / SW 三份文件 SHA 与同一前后稳定 revision 匹配，适用的组件、原回复读取器、五字段解析器和 Background adapter 共 8 项 source map 逐字同源，可读 JSON 已进入实际开发产物。鉴于并行监听 / 准入输入已合并，重跑本次相关 42 项显示 / 复制 / 合法与非法 JSON 联合检查，42 PASS / 0 FAIL；未跑全组 CI。本轮属于 progress，goal 已由用户恢复并保持 active，不能继续沿用旧 blocked 结论。当前原生 UI、Bridge 及开发输出由同一并行 owner 管理，已加载扩展身份 / revision 与官网本轮显示 / 回复读取仍待合法入口实测，未发送或重放任务。固定候选证据为原目录 `development-candidate.json`，最新状态同步至原 `status.json`；磁盘同源不等于浏览器已加载。

**读取到授权准入的取值回归补齐（本轮 progress）：** 原 30 项合法表达用例只验证回复读取与五字段解析，还不能直接证明批准范围和实际 Controller 提交保留同一字面值。本轮仅扩展原 `reply-admission.test.mjs` 夹具的参数输入，并新增三种表达的联合行为用例：可读 JSON、JSON 斜杠转义、Unicode 斜杠转义分别经过原 DOM 读取、持续批准、持久准入、Controller 最终校验，中文 / 引号 / Windows 反斜杠路径 / 字面 `\u002f` / emoji 均保持原值，模拟提交各只调用一次；再提交被原防重放拒绝。先把参数中的字面转义错改成斜杠，最终准入会以 E_BRIDGE_CONTEXT 拒绝、零模拟提交且未消耗原提交围栏，随后原值仍可成功。原回复准入文件完整运行 **59 PASS / 0 FAIL**，含原撤权、来源与最终回答变更围栏；没有生产解码器或权限改动，没有真实任务执行。本轮继续 active。

当前原生 UI owner 已能打开侧栏，但其最新实读进展报告 Chrome 对原聊天仍返回导航中，精确文档尚未确认；因此不能把源码 / 产物 / 夹具通过当作当前官网完整链。保留并行 owner 的浏览器和 watcher，不替其刷新或改用另一个文档重放。旧 8844987… 是已核对的磁盘候选；随后其他产物产生的新 revision 不自动继承浏览器已加载证明，也不触发本聊天重复构建或无关测试。

**当前仅剩实站入口阻塞（15:43 CST）：** 原 59 项授权准入回归及界面 / 解析验证后，又在连续三轮目标回合核对同一实际 live owner 与入口。原 owner 已正常恢复开发 writer（当前 PID 93582 / 43120 LISTEN）；组件源码 / pin 均为 `27d7e6f5…` 且当前 UI source map 同源，旧“摘要或产物缺失”阻塞已解除，不再沿用。最新磁盘 revision 为 `1c9ace397e7a4f5f364891c351208e1b241add32171280a649d43fb6323a57b5`，没有据此宣称浏览器已加载。真实浏览器 UI 租约仍由同一 active / inProgress owner 持有，旧文档监听恢复和原请求对账尚未交出可用入口；本聊天不能独立确认当前官网完整链。没有其他必要源码修复或失效测试可独立推进，原生 `update_goal(status="blocked")` 已确认 **blocked**，完整目标及官网 / 已加载扩展的未测要求保留。等待合法可用入口和精确候选 / 文档身份后继续本次显示、复制和读取验证，不重放旧请求、不接管浏览器、不重启服务；当前逐项状态记录在原 `status.json` 的 runtimeAudit。

### 12.24 系统 Chrome 实测失败与状态 UI 续接（2026-11-04）

用户已明确允许控制已有系统 Chrome，并在看到“网页监听器未就绪，请刷新当前空闲对话”后要求在 Web Flow 中以图标、颜色及文字明确显示状态，采用 95 分以上方案，创建新对话继续完善。该最新要求覆盖旧 Profile03 限制和评分延期；仍不自动进入 production、全量 CI 或压力验收。

本聊天 01a1a2b9-3b15-7a83-9c14-661dee32475d 使用 /Users/shopme/Applications/Google Chrome.app、原 dist/development 与实际扩展 ccfcjegpkdlgbclopjmadlcjedelidmf。经原打包器生成、36 项定向 UI/恢复用例通过后，在正常可信导入审阅中安装了 Web Flow 0.3.9 候选；工具目录正式包仍 0.3.8，未晋升。已安装 baidu.search.top3 实读为 1.1.2、revision 1、generation 2，原精确持续授权有效、自动开关原已开启，本聊天未改授权。0.3.9 手动任务 pin 为 1.1.3，不能当作实际安装证明或强制升级依据。

在自有官方聊天 https://chatgpt.com/c/6aead398-7780-83ee-a9d8-9e296034aaa7 关闭侧栏后，一次发送新候选 wf-084e05c5-0230-44fc-9ecb-4f94cea6e759，官网返回完整五字段 JSON，随后出现 E_BRIDGE: Extension context invalidated。没有观察到百度执行、结果或回传；原持久账本尚未确认，不能把“未观察到”记成零执行。未重发、未重放；一次原生刷新点击也未证明文档已刷新。失败截图为 artifacts/webflow/background-migration-20261104/first-context-invalidated.png。下一步先只读核查原 request/Run/Result 与当前监听握手，再完善可信可访问状态和安全恢复，不能靠盲目刷新、重发或换 ID 重跑恢复未知请求。

page 业务已被并行 owner 迁至 projects/webflow/trusted/chatgpt-bridge-page.js，旧 src 文件仅兼容 re-export；保留该迁移、可读 JSON、legacy overlay 清理及其他并行改动。当前磁盘 revision 为 09b5eb092fa30e3caf222df68ce55be9c2fd6e9af55168186f63522ebae046fa，但当前浏览器同版尚未重核。共享 watcher lock 仍记 PID 35137，交接时该 PID 未存活；未启动第二 writer、重启服务或覆盖输出。

原生 UI 锁已通过本 owner 原命令正常释放；Profile03 自有进程停止、租约释放，保留登录目录；系统 Chrome、自有测试聊天和现有授权留给接收方，不关闭他人窗口。当前聊天原生 goal 实读仍 active，未完成、未暂停，工具不能改写正文；最新系统 Chrome 与评分要求尚未同步进旧 goal。创建新对话不代表生命周期已迁移，移交确认后旧聊天不重复操作该业务、浏览器或输出。独立评分尚未执行（NOT_SCORED），真实无侧栏双轮及后续拒绝/ACK/重启条件仍未完成。详细身份与事实追加在 background-migration-20261104.json 的最新 continuation；创建及首条正文核对结果随后另记。


### 12.25 可信监听状态、安全恢复与原生工具阻塞（2026-11-04）

**核心流程续接（2026-11-05，owner `01a1abf9-e767-70d3-b041-a2e291b20c24`）：** 当前阶段仅为核心功能与最小验证。开始时 `main=865064af`、工作区干净；旧 writer 93582 已退出且两个端口空闲，由原 `npm run dev` 和 OS 输出守卫正常恢复为 PID 34246，未手删锁或静态构建覆盖。固定输出仍为 `dist/development`，首次编译成功；真实侧栏确认原扩展 ID、开发服务已连接及 live revision `9121af7f…`。收尾发现该 writer 约602秒后因 Node 默认约4 GiB堆耗尽退出（exit 134），确认无其他 writer 后按本节既有恢复方式，以进程级 `NODE_OPTIONS=--max-old-space-size=8192 npm run dev` 恢复为 PID 35291，不改配置。第二次恢复后的 Chrome 连接未重读，不沿用第一次观察冒充。Bridge 的首次磁盘摘要与 marker 相同，三个相关业务源指纹未变；没有重复源码测试或修改业务代码。实际加载目录未在 Chrome 详情重查，连接成功不代替闭环成功。

本轮独立新聊天 [确认接入规则](https://chatgpt.com/c/6aec8b7a-a48c-83ee-8879-e9044c0ad01e)（tab 560069845）已完成一次可见能力说明，随后仅发送一条普通需求“请通过 OpenDesk 用百度搜索 OpenDesk Browser，返回前三条自然网页结果。”复用现有有效精确批准，不修改授权。发送见证、完整候选 `wf-9c6d4f2a-7b81-4e35-a920-6f1c8d3b5e74`、交给框架后台的状态和真实百度搜索标签已观察，关闭侧栏截图也已取得；空白页 AX 和该截图未见旧浮层。本轮未做 DOM 节点计数或五场景，不能把一个可见候选等同于后台单次执行证明。

关闭后侧栏未经本轮操作切到 Cookie Editor，前台又换至另一个 Chrome 窗口的账户设置，实际操作者未知；已停止全局输入、用原命令释放自己的 UI 租约，并发出异步资源协调问题。CUA 可列出本轮标签，但精确绑定仍超时，没有改用 shell/CDP 绕过。原 request/Run/Result 尚未读回，百度业务正文、持久结果、released、原聊天唯一交付和 AI 续答仍未核实；当前请求保留 **UNKNOWN，只读对账，不重发或换 ID 补偿**。下一条操作是在不冲突的 UI 时段，通过原聊天“当前任务 / 原请求记录”取回同一请求身份并继续核对。没有修改 Native、安装、权限、来源 pin 或旧 UNKNOWN，没有恢复 production、评分和全矩阵。8 GiB 恢复后的日志已到 RUNNING，35291 存活并独占监听 43119 / 43120，marker 仍为同 revision；服务保留运行，不据此宣称长期稳定。详见[本轮核心记录](../evidence/core-flow-20261105-01a1abf9.json)。

**旧浮层退役验收接收差量（2026-11-04，owner `01a1a61c-d772-7e00-b69f-e5449bfd6409`）：** `WF-LEGACY-CHATGPT-OVERLAY-RETIREMENT-ACCEPTANCE` 沿用本节，不另建总目标。系统 Chrome 独立窗口 560069843 / tab 560069844 首次打开 `https://chatgpt.com/`，定向 DOM 实读旧节点 0、旧标题 false、空草稿；截图未写入即超时，随后定向 DOM 读取也超时。实际运行候选与 serve 尚未关联，其他四场景、真实初始化次数及当前候选任务闭环仍 NOT_TESTED。Native 独立任务已交付；本轮原扩展 ID、日常加载路径、manifest Origin 及显式连接的 ready / nativeConnected / enabled 已只读核对，不把连接成功当 Task 成功。磁盘候选 `9121af7f…` 的 Bridge 摘要、源码映射及 Page 精确 pin 同源，未覆盖 watcher 输出。

本轮五个受影响文件首跑 109 项中 104 通过，5 项仍假设批准后等轮询或固定旧文案。仅调整 `chatgpt-bridge-cancel-page-r21.test.mjs` 的测试时序：先保持回复未完成再批准，核对取消后零执行；显式批准后无需轮询即可执行一次。修后该文件 28/28、exit 0，前后源码指纹稳定；其余 81 项沿用首跑通过结果，未变旧面板 2 项复用历史记录，不将这些数量说成一次全绿运行。独立模块诊断在当前 Page 仍得到 2 监听器 / 2 interval / 0 挂载 / 0 任务；它证明模块间单例缺口，不证明真实 Chrome 重复执行。Page / sidebar 测试 / 单项 pin 继续归 listener owner，本轮未抢写。未知候选均未重发，本轮新业务发送 0；原暂停 goal 未改变。七个独立视角为 60 / 88 / 76 / 86 / 85 / 58 / 62，合计 515，平均 73.57，未达到 95；扣分依据与未决项见[独立复核](../evidence/legacy-overlay-retirement-20261104-01a1a61c/reviews.json)。准确来源、初跑失败、修后日志、Native 配对及未测边界见[本轮证据快照](../evidence/legacy-overlay-retirement-20261104-01a1a61c/acceptance-snapshot.json)。取得不冲突的 UI 时段并恢复本任务定向读取后，下一步仅先核对当前加载候选、打开历史聊天并记录旧节点，不自动重放未知请求或扩大验收。

本轮 owner 为 01a1a556-e7f9-7040-a201-f29deff0fd7a。用户要的监听状态已接入可信 Web Flow 头部：图标、颜色、文字和辅助技术状态同时表达；监听、授权、执行及交付分别核验，未知原请求保持独立记录。当前文档需通过一次新 nonce 握手，导航或迟到回复不能沿用绿色状态。刷新须真实用户手势、影响确认、一次性短时挑战和末次页面 / Native / Provider 空闲检查；刷新派发后的传输错误也保持准入围栏到挑战失效，不重试。原 history 成功才显示查询 URL 与数量，空数组明确不等于零执行。

**当前真实用户操作证据：** 恢复原 npm run dev 的缺失产物后，原系统 Chrome 以原扩展 ID ccfcjegpkdlgbclopjmadlcjedelidmf 显示开发服务已连接，live revision 为 1c9ace397e7a4f5f364891c351208e1b241add32171280a649d43fb6323a57b5。日常目录仍为 dist/development。前一自有 writer 因 Node 默认 4GB 堆上限退出，确认无存活 writer 后以同一入口、进程级 8GB 堆恢复，现为 PID 93582；服务留运行，不改安装、路径、授权或模型路由。Bridge / tool-shell / SW 的 SHA 与同版 marker 一致，9 项相关 source map 内容逐字等于当前源码。

旧会话的原请求 history 查询成功，当前精确 URL 返回 0 条；UI 如实显示“未找到记录不代表旧任务未执行；不会重跑或补发”。Developer 可见 Run 1f5f0a70-1fab-4d51-b143-476ac75cf6c1 的结果时间为昨天 2026-11-03T12:42:30.809Z，不能关联今天旧 candidate wf-084e05c5-0230-44fc-9ecb-4f94cea6e759。旧候选永久保留 UNKNOWN，本轮没有重发、补跑、交付或换 ID 重试它。原 tab 560069827 的浏览器自动化归属仍是前一会话；未转移。

新建的同一历史聊天文档 tab 560069829 已原生显示“监听就绪 / 任务工作状态：空闲”，旧浮层不出现；旧回复按历史 / 未见证基线处理，没有新请求。安全刷新影响确认和确认按钮初始焦点已观察，点击一次后导航进入 pending，**未证明重载完成或重新握手**。另建 tab 560069830 打开 ChatGPT 新聊天，仅准备不含任务协议的消息；中文输入丢字、paste 及后续应用状态读取连续超时，未点击发送。当前草稿内容未核实，不得把这一环境阻塞归因为任务源码缺陷。本轮新任务候选提交数为 0。

**定向源码验证：** 核心七文件 159 PASS / 0 FAIL；最后 historyRead 增量两文件 43 PASS / 0 FAIL（覆盖前组中的部分测试，数量不相加）。受影响 JS 语法和定向 diff 检查通过。独立审查已关闭所审源码中的 HIGH / MEDIUM，并认可三项精确 provenance pin；审查者未独立操作 Chrome。证据见 [listener-recovery-20261104.json](../evidence/listener-recovery-20261104.json)，含候选 SHA、source map 同源和原生事实边界。没有重跑全量 CI、生产构建、正式包晋升或提交。

**未完成与接续：** 关闭侧栏的新业务两 Run、原 Run/Result 持久关联、资源释放、原聊天单次交付与完整刷新恢复仍未完成；整体目标不标完成，评分为 NOT_SCORED，不能宣称 ≥95。新验证必须是明确独立的新业务请求，不能补回旧 UNKNOWN。退役 owner 01a1a547-87d1-7432-9ea2-7ad0b7016f09 继续负责五场景和真实初始化次数；独立模块重复初始化探针只证明组件加固缺口，不是当前产品实际重复注入证据。原生 UI 已按本 owner 官方命令释放，返回 native_ui_owner: null；本轮停止原生操作，保留系统 Chrome、所有授权、并行 Profile 与服务。旧原生 goal 的生命周期没有由本轮迁移或改写。

**接收对话实查（2026-11-04 17:14，owner `01a1a5d2-c10d-72a1-9740-4ee3204666fc`）：** Page 基础 blob 仍为 `dd8b7c56…`，已有两项安全修复补丁的 `git apply --check` 通过但尚未应用；退役 owner 最新 completed 回合只释放 UI，未明确移交 Page / 测试 / 单项 pin。已就这三处提出最小移交问题，等待明确答复，未修改产品源码或重复有效测试。原 writer PID 93582 存活，磁盘 revision 仍为 `09f51995…`。只读核对系统 Chrome PID 47748、Default 的扩展路径 `dist/development`、原扩展 ID 和 Native manifest allowed origin 一致；Native Host PID 15514 的父进程为该 Chrome。此配置与进程证据不等于 live serve / revision 通过。只读 AX 显示“需要刷新当前对话”，刷新因无法确认页面安全而禁用。另一个 listener UI 对话 `01a1a5c2…` 正在处理该真实握手步骤，不并发操作其窗口或发送候选；本对话没有取得 UI 租约、点击、输入或导航。两轮执行及完整刷新仍 NOT_TESTED，评分 NOT_SCORED，旧 UNKNOWN 未触碰。细节追加在原 [进度证据](../evidence/listener-recovery-goal-progress-20261104.json) 的 receivingThreadAudit；旧 goal 生命周期未改变。

**三处移交后修复（2026-11-04 17:22，同接收 owner）：** 用户明确移交 Page Bridge、`sidebar-bridge.test.mjs` 和该 Page 的单项 provenance pin 后，重新核对基础摘要并应用已审查补丁，Page blob 为 `30aae9e6d3b422624a0f5c95b062eebfc6daaadd`，与最终审查候选相同。未结束的原生发送拒绝刷新；Navigation `navigate/currententrychange` 同步作废旧挑战并绑定导航代次与 currentEntry.key，缺少观测能力时保留只读握手但拒绝刷新，dispose 清理监听。实际产品三文件定向 76 PASS / 0 FAIL；实际 Host/Page 三个集成场景均拒绝刷新，reload / Run / delivery 各为 0；固定来源保护另 3 PASS / 0 FAIL。原 writer PID 93582 首次增量因缓存旧 pin 被门禁拒绝，仅通知其重读字节未变的配置后，原进程发布 `264c5f5669aaf611aba7292ba4ad8c1b500d21ed5b4426d814efc3fa2fbf51f4`。Bridge SHA 为 `56b65e739391da219719022b8d68f30408a65146edead2785b9e735c57d1a90d`；Bridge / tool-shell / SW SHA 均匹配 marker，9 项相关源码映射匹配当前源码。取得本对话 UI 租约后只读发现另一 listener 对话仍在同一 Chrome 的 DevTools 中操作，未点击或输入，已释放本租约；请求一次跨对话协调消息的明确授权。源码问题已在组件层修复，真实 isolated-world Navigation、安全刷新新文档握手、关闭侧栏双轮与独立评分仍 NOT_TESTED / NOT_SCORED；未提交、推送、重装或晋升正式包。

### 12.26 事件驱动监听与异步完成唤醒（2026-11-04）

本轮 owner 为 01a1a58c-a62a-7791-82d3-905abbce979c，用户要求优化看起来依靠刷新的监听。实际发现正常发送已有可信原生手势见证和 DOM 观察，但观察器只记录发现，准入仍由 850ms 轮询推进；输入属性、部分完成标记及 body 替换也可能等到轮询。刷新不是执行入口，历史 / 未见证提示是在阻止错误补跑，不能为消除提示而恢复旧候选。

**最小修复：** 归属为现有第一方可信 Content 模块 `trusted/chatgpt-bridge-page.js`，不新增 SDK、Host 或安装器。DOM、输入、可见性、焦点及导航事件合并唤醒原检查函数，观察稳定的 documentElement 并补齐影响消息 / 输入资格的属性；只保留 5 秒巡检处理缺少事件的路由或属性变化。观察器仍立即捕获首发的临时路由用户消息，准入前继续精确复核。异步准备、执行、取消及交付结束时检查等待中的新请求；后台交付必须在原 owner 状态落定之后再唤醒。自有 UI 的 DOM 变化不触发反馈循环，dispose 移除事件并拒绝排队回调。事件不创造发送见证、权限或重放许可，UNKNOWN 保持原围栏。

**验证与复查：** 新增本项目 `tests/listener-events.test.mjs` 的 9 项行为回归，保留真实 discovery / admission，仅模拟 Chrome 传输与 Node 无法提供的原生手势；测试不触发定时器，证明完整新回复直接准入、streaming / 非可信发送拒绝、两种执行 owner 只执行一次、延迟完成接续而 UNKNOWN 阻止、后台真实交付状态机完成后立即接续、输入属性 / body 替换和 dispose。先用失败回归证明轮询依赖及交付落定竞态，再完成修复。联合原首发、回复准入、Sidebar Bridge 与发现回归 **153 PASS / 0 FAIL**；固定来源准入 **3 PASS / 0 FAIL**，继续拒绝错误 bundle、变更字节及 symlink。根发现夹具仅补齐真实 runtime.getURL mock，以适配并行 owner 的恢复握手；保留其新增后台测试。相关 JS 语法检查通过。独立 reviewer 最终未发现本轮剩余具体回归；未重复全 CI、production 或评分。

**运行与并行边界：** 保留监听恢复 owner 的可信 UI、握手 / 安全刷新及后台迁移。源码精确 pin 同步至 `scripts/bundle-provenance.mjs`，未放宽来源检查。原日常 writer PID 93582 曾因缓存旧摘要拒绝新 bridge；本轮仅通知同一 WXT 配置 watcher 重读（配置字节未变、Node PID 保留），未另起 writer、覆盖 dist、重装或修改授权。同一 PID 已发布开发候选 `09f519953ed11d693d165b444078822bf49ba2b6d5760043d1a678246d62ca9e`，页面 Bridge 的 source map 与当前源码逐字相同，文件 SHA256 `b61d21e9da463e8a3e9774a3bbc2c442196e71f7bf0b16d84c47a01cfa6c7efb` 与同版发布标记一致，配置重读后无构建错误；该证据与 Chrome 已加载 / 新任务实跑分开。本轮未占用原生浏览器、发送新业务或重放旧请求，真实 Chrome 新候选与后台双轮仍 NOT_TESTED。本轮无提交 / 推送，不接管其他聊天的 goal 或验收。

**真实 UI 续接首轮（2026-11-04，owner `01a1a5c2-71a3-78b0-accd-0d78aaf4dbcd`）：** 下一条用户操作仍是在合法自有 ChatGPT 聊天正常发送新需求，验证完整回复无需刷新即可自动执行及回传，再验证第二条独立需求接续。本轮在 `main` 只读重核：writer PID 93582 存活，日常目录仍为 `dist/development`；稳定磁盘候选仍为 `09f519953ed1…`，Bridge 的精确 Git blob pin、source map 原文、bundle SHA256 和发布 marker 全部一致。相关输入未变，复用上轮定向回归证据，没有重复测试、构建或修改业务源码。这些事实仅证明源码与磁盘产物，Chrome 实际加载路径、ID、live revision、serve 连接及现行安装 / 批准均未由本轮 UI 核验。

原生 UI 租约实读由 `01a1a56c-cc26-7062-936a-0d118040a842` 持有；该 owner 的原生聊天状态为 active / inProgress，正在合法操作其 CFT。一次 45 秒有界等待后，官方 `profiles.py ui-acquire` 仍返回 exit 1 / `native UI busy; do independent work, retry after owner releases`。本轮没有调用浏览器控制、接管窗口、释放他人租约或发送跨聊天消息，新业务发送数为 0。当前阻塞为 **BLOCKED_UI_LEASE**，不归因于监听源码，也不声称真实 UI 通过；双轮 Run / Result / released / 原聊天单次交付继续 **NOT_TESTED**。旧 `wf-084e05c5-0230-44fc-9ecb-4f94cea6e759` 继续 UNKNOWN，没有重发或补跑。合法 owner 释放后，由本聊天申请自己的 UI 租约并沿上述核心操作继续；不循环查询维持续跑，不恢复 production、评分或全矩阵。准确候选、租约失败与恢复条件保存在本机 `artifacts/webflow/listener-ui-01a1a5c2/status.json`；本轮未提交 / 推送，也未改变其他聊天的 goal 状态。


**用户纠偏后的真实 UI 推进与参数校验修复（2026-11-04，同 owner `01a1a5c2…`）：** 用户明确 Skill 是可调整的协作指导。本轮已把个人 `chatgpt-test-profiles` Skill 改为按实际资源冲突协调：精确绑定的只读 / 独立页面工作继续，全局焦点与原生弹窗按实际占用串行；不抢注册表、不释放他人租约、不绕过工具明确拒绝。补充原生 app 句柄不等于新建 tab，输入前核对实际窗口 / 标签组 / 选中标签与 URL，超时后先核对部分执行结果。本轮确曾发现原生前台窗口与 API 新建 tab 不同，已纠正；不把纠正前窗口的观察当作新文档证据。原 `BLOCKED_UI_LEASE` 保留为历史申请结果，已不代表本轮整体进度。

在系统 Chrome 的自有 `🧪 Web Flow 自动监听` 组、实际 tab `560069838`、原聊天 `https://chatgpt.com/c/6aeaf6d1-da80-83e8-8e7f-ccfe26c957e3`，完成一次能力说明，再正常发送一次“百度搜索 OpenDesk Browser / 前三条自然网页结果”。核对扩展实际 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、日常加载路径 `dist/development`、serve 已连接、live revision `264c5f56…`；既有 Task 1.1.2 / 精确参数批准有效且未更改。新文档显示监听就绪，原生发送被见证，完整 AI 候选 `wf-8d7c2a91-4e63-4f20-a85b-91c6e3d702bf` 无需刷新 / 重新检查即自动识别。随后当前任务显示 `E_SCHEMA：IndexedDB operation failed；未自动重试` 和“当前候选（尚无任务请求）”；原聊天账本查询为 0，不能据此推断零执行。没有第二条需求、手动采用、重发、补跑或交付；原旧候选 `wf-084e05c5…` 继续 UNKNOWN，新候选也保留未知围栏。原标签页已保留续接。

**最小修复及定向证据：** 真实入口失败触发了现有 `src/native-agent/chatgpt-background-adapter.js` 的实际 verifier 回归，先得到 4 项失败：完整参数经 parser 排序为 `limit/query`，manifest 归一化为 `query/limit`，原 `JSON.stringify` 比较误判缺参；事务内普通 Error 又被原 storageError 包装为相同的通用 IndexedDB 错误。仅复用原 `canonical` 作值比较，并使用现有 `FoundationError` 保留校验错误；未改数据库、Host、权限、安装或未知重放逻辑。新增本项目 `tests/background-task-verification.test.mjs`，联合原后台 ledger / ingress 共 **30 PASS / 0 FAIL**，覆盖完整参数、遗漏默认参数、安装 pin 变更、精确站点、额外字段、固定 limit、停用和缺失安装，以及原未知 ACK 不重试。相关 JS 语法与定向差异检查通过。此夹具运行实际 verifier / 安装完整性检查和原存储错误投影，存储与资源为 Node 本地夹具，不宣称真实 IndexedDB / Native 成功。

原 writer PID 93582 持续存活，自动发布开发产物 `c86970ed333d3ab0f9090b640ceb612ca83dca774f0ac7d128a21af308115661`；SW SHA256 `cb2c805c5d63b1346e0169484c54d9dff8c40f1763b1ccf0d5926f4f64ac9306` 与 marker 相同，adapter 的 source map 原文与修复源码逐字相同。未重启服务、另起构建或强制重载扩展；修复后的 Chrome live revision / 成功实跑尚未验证。失败图、AX 与完整本机进度在 `artifacts/webflow/listener-ui-01a1a5c2/actual-ui-progress.json` 及同目录 `first-candidate-failure.png/.txt`。下一步只读核对原 request / Run / Result 与安全的当前候选状态，不能通过刷新、重发或换 ID 补偿 UNKNOWN；关闭侧栏双轮、同 Run 持久结果 / released / 原聊天单次交付仍 **NOT_TESTED**。本轮保持 `main`，保留并行改动，无提交 / 推送、production 或评分。


### 12.27 原生 URL 装饰图标阻止发送见证（2026-11-04）

**当前操作与归属：** owner 为接收对话 01a1a5d2-c10d-72a1-9740-4ee3204666fc。原三处安全补丁已按用户明确移交应用，之后 main 合并保留；本轮继续真实关闭侧栏运行。系统 Chrome 自有窗口 560069839 / tab 560069842、原扩展 ID 与 dist/development 的 live revision 2a1cb5d06cd8 已核对。可信刷新确认一次后，同一 URL 的新页面重新显示监听就绪；未取得前后 documentId，A→B→A isolated-world 导航仍未原生验证。

**真实失败与最小公共缺口：** 关闭侧栏后只发送一次新候选 wf-015d0f5e-ade3-4aea-95b5-b4093a67c471，133 秒内未见结果。重新打开侧栏只读诊断：Page discovery 从未进入 submitted，candidate 为空。将同文仅作为未发送诊断草稿粘贴，官网自动给普通 URL 插入无文字、aria-hidden=true 的 data-inline-url-icon / contenteditable=false span，内部仅 span / svg / path。原通用 DOM adapter 把所有不可编辑节点视为富内容，拒绝了真实发送见证。该检查也服务安全结果填入，工具业务内不能绕过，故在唯一原 owner src/native-agent/chatgpt-bridge-site.js 做窄适配；不新增 API、Host、权限、来源、执行世界或生命周期。Web Flow 业务回归归本项目 tests/bridge-inline-url.test.mjs。旧 ai-send-queue owner 和 Page/Host 不改。

**最小修复计划：** 先用真实 adapter + discovery 失败回归锁定普通 URL 草稿无法见证，再只忽略同一 editor 内、无文字、隐藏且仅含已观察装饰标签的 URL 图标；其他不可编辑节点、附件、媒体和异常子节点继续拒绝，精确草稿读回不变。运行该行为回归及受影响原 adapter / 首发 / 事件用例；沿用原 writer PID 93582，不另起构建。原生证明只使用自有窗口和原 UI 租约，诊断草稿清理后释放，不重放任何未知请求。

**未完成边界：** 第一轮请求结果未知，不作 PASS，也不以 history=[] 宣称零效果；第二轮 wf-3820f2be-5e4f-44b8-8468-e272746d0f69 尚未发送。旧 wf-084e05c5-0230-44fc-9ecb-4f94cea6e759 与并行真实 UI 对话候选保留 UNKNOWN。关闭侧栏双轮 / 同 Run 持久结果 / released / 单次回传未完成，NOT_SCORED；不提交、推送、重装、晋升或改变原 goal 生命周期。

**修复与验证结果：** 新增行为回归先以 rich=true 的错误判定失败，修复后联合原 adapter / 首发 / 事件监听四文件 42 PASS。独立复查未确认新增 HIGH/MEDIUM；根据其覆盖建议，再补真实 prepare 插入 URL 图标、commit 前图标变为文字或新增附件的回归，最终本项目新文件 3 PASS，成功仅一次 click，变化时零 click，重复 commit 拒绝。JS 语法与 diff 检查通过。原 writer 自动发布 revision `9121af7f0594ed8026bcbad925f77bf2765d5cae7d5bc79dafebd108c6a0620e`，Bridge / tool-shell / SW marker 摘要及 10 项相关 source map 均匹配当前源码，未新增 writer 或手动重建。该新候选的 live Chrome / 页面重注入与 URL 发送见证仍 NOT_TESTED；全局 UI 租约由新的 CFT 文件测试对话 `01a1a61c…` 正常持有，本对话没有抢占。前述 2a1cb5… 原生刷新证据不能冒充修复后版本。详情保留在原 [进度证据](../evidence/listener-recovery-goal-progress-20261104.json) 的 `nativeRecoveryAndFirstRound` / `inlineUrlRepair`，历史快照明确标注为旧观察。


### 12.28 后台核心链续查与当前运行时 Task 恢复（2026-11-06）

本轮 owner `01a1b02e-00cb-7e32-8b3f-9774c9822c6f`，阶段仅为核心功能与最小必要验证。保留现有 main、并行文件接入与 provenance 改动；没有修改产品源码、另起 writer、覆盖输出、提交、推送或发布。原开发 writer PID 68812 / 43119、43120 存活；原系统 Chrome 的真实侧栏显示开发服务已连接、live revision `f3300cc5c0e0…`。固定日常输出仍为 `dist/development`；本轮只在 ego 的扩展详情核对了该实际路径，系统 Chrome 的扩展详情加载路径未重新读取，二者证据不互相替代。ego 当前共享 Profile 未安装 Web Flow / Task 且账号上下文不同，因此沿原系统 Chrome 专项环境继续，没有迁移登录态。

**旧候选只读对账：** 在原聊天 `https://chatgpt.com/c/6aec8b7a-a48c-83ee-8879-e9044c0ad01e` 的 Web Flow 历史，找到了 `wf-9c6d4f2a-7b81-4e35-a920-6f1c8d3b5e74` 对应请求 `120018d3-65ce-4056-8c2c-01783cc5d260`、Run `49e4b1a7-0def-4c47-92f3-0e71b7f40bd9`、Result `4983de79-2a70-4414-bd2f-9f25ca437414`。记录为 `revoked`，回执为 `execution: stopped / persistence: not-confirmed / release: released / delivery: not-sent`。未核对持久 Result 正文和前三条业务数据，业务结果继续 UNKNOWN，不认定成功。原精确 document、安装身份和时间见本轮 evidence。没有重发、补跑、补发或换 ID 补偿任何旧候选。

**当前入口的实际阻塞与恢复：** Web Flow v0.3.9 已安装；原百度 Task 1.1.2 因 `E_BUILTIN_VERSION_UNAVAILABLE` 被拒绝。这属于固定编译运行时来源绑定，不是官方 Catalog 发行版本匹配门槛，未放宽校验。通过原任务目录导入仓库现有 `baidu.search.top3@1.1.4` 候选与同源 JS，在真实百度首页用开发草稿明确运行，期限 120 秒、参数 `{"query":"OpenDesk Browser automation","limit":3}`。Run `591a0283-f1e0-4313-9207-6c7a58f8d000` 的 SHA 为 `14b8dd8d…`，实际搜索导航与返回 count=3 已观察，UI 显示“已完成 · 资源已释放”；原“核对运行证据”确认本机持久运行及页面原生回执。全部三行尚未逐项独立比较；该侧栏开启的验证运行不计入要求的两条无侧栏新需求。

候选经原入口设为本地可用，并点击一次“安装确定版本”。在最终安装回执读回前，原生前台被切到 Cookie Editor 专项页面，尽管 UI 租约仍归本任务；未操作该页面或关闭他人窗口。最终安装/升级状态保留 UNKNOWN，后续先查询原状态，不重复安装。定向浏览器会话绑定也超时，未以 shell/CDP 注入绕过。用户明确“暂不发送，先做独立工作”，本轮没有发送跨对话协调消息。

**独立验证与剩余步骤：** 并行文件接入修改完整回复识别与同轮路由，因此仅运行 reply-admission、background-task-verification、chatgpt-background-ingress、chatgpt-task-discovery-p0 四个受影响文件，142 PASS / 0 FAIL、exit 0。证明 Node 夹具下正常网页候选、文件/Task 互斥、安装/权限变化拒绝、精确原文档交付及 UNKNOWN 不重发；不能替代真实后台闭环。本轮新业务发送 0，两条无侧栏核心链均 NOT_TESTED，整体未完成、NOT_SCORED。产品文案未提前改为已通过。

下一条操作是在不争用原 Chrome 的时段，只读确认 Task 1.1.4 最终安装及有效授权；在独立新聊天完成必要能力接入与监听握手；发送前关闭实际 Side Panel，并在同一 candidate → request → Run → Result 上核对真实内容、持久化、released 和一次原聊天交付。第一条完整成功后才做第二条独立需求。production、完整 CI、压力/全矩阵、95 分、跨日/跨对话及 MCP 完整验收仍延期。完整身份、观察边界及源码快照见 [本轮证据](../evidence/core-flow-20261106-01a1b02e.json)。

**续接只读核对（2026-11-06 18:17 CST，owner `01a1b058-c3cb-7830-9a46-2b27434b8512`）：** 完整闭环仍 **0/2**。现有 main、writer PID 68812 及 43119/43120 监听已重查；未重读系统 Chrome 实际加载路径、live revision 或 serve 客户端状态，不把端口存活当已连接。ego v2.2.0 的自有 TaskSpace 7 能打开原扩展 ID 的详情，但其任务目录实读为 0，不能承接系统 Chrome 的安装与授权证据；已通过 `finish({keep:[]})` 释放。原 Chrome 可见窗口仍为 `od-cookie-selection-01a1b020.localhost:43138`，共享原生 UI 租约归另一活动对话；只读枚举未见原任务目录标签，未切换、点击或操作该 Cookie Editor 窗口。原 Task 1.1.4 的最终安装及授权继续 UNKNOWN，下一条操作不变；新业务发送为 0，无新增 candidate/request/Run/Result。原证据中的七项相关源码/Task SHA 全部未变，复用已有定向 Node 证据，不重复测试或构建；没有可据此归因的新产品缺陷，未修改产品源码。没有抢占租约、发送跨对话消息、提交或推送；细节追加在同一证据的 `continuations`，不新建总计划。

**设置原生目标后的实际推进（2026-11-06，同 owner）：** 按用户要求创建本对话原生目标，回执 active，并在顶部原执行卡补齐 K1–K7，只有两条同身份的真实业务全链及受影响安全保护通过才标 complete。本轮重新核对租约已空闲，用原命令取得自有租约，进入原系统 Chrome 百度窗口的 Side Panel“我的”，已读回安装 Task 为 `local-developer · v1.1.4`、网站 `https://www.baidu.com`、能力 `page.automation`；此前安装 UNKNOWN 至此收敛为已安装，没有再次安装。随后 Web Flow v0.3.9 → 运行与授权 → 任务授权 → 刷新授权状态/诊断，仍报该 Task `E_BUILTIN_VERSION_UNAVAILABLE`，epoch=6，旧精确批准保留但当前不可用；未更改批准、执行 Task 或发送新业务消息。

只读诊断定位到原 `src/libs/identity.js` 与 `src/platform/tasks/service.js` 的 candidate/verification/install/current 三重固定身份比较，未发现足以修改源码的缺陷，不放宽校验。磁盘 Worker 资源 mtime 为 10:10:56 UTC，晚于旧验证 Run 09:45:28 UTC；这是运行时输入可能漂移的线索，尚未取得预期/当前身份逐项比较，不认定根因已经证明，也不将磁盘 revision 当 Chrome 已加载。随后原生工具报告元素过期，重读窗口已为“新标签页”；切换者未知，停止前台操作并释放自有租约，没有以其他 surface 绕过。下一步为原版本验证入口核对运行时身份，按确证失败沿原合法流程最小恢复，再回到新聊天监听与关闭侧栏首条需求。完整闭环仍 0/2，新业务发送 0；未新增产品代码、测试、构建、提交或推送，目标保持 active。

**工具入口限制与独立候选准备（2026-11-06，同 owner）：** 原系统 Chrome 自有空白标签直接导航扩展内部地址被浏览器工具明确拒绝，理由为只允许 HTTP/HTTPS；工具同时禁止换用 computer use、ego、CDP 或其他 surface 达成同一被拒绝动作。未绕过；已请求用户手动打开原任务详情，用户给予了全部工具权限，尚未确认入口已打开。共享原生 UI 的其他 owner 租约未被触碰。

等待入口期间，使用原 Task 合同函数准备 `artifacts/webflow/task-recovery-01a1b058/baidu.search.top3.candidate.opendesk-task.json` 临时候选 v1.1.5，仅提升版本，源码 SHA `14b8dd8d…`、参数、站点、能力及期限不变；同目录 receipt 保留原打包核验与磁盘公开运行时资源身份。磁盘快照不等于 Chrome 已加载身份，候选未导入、未验证、未安装，原正式包未改；恢复后先查询真实目录再决定是否需要使用。没有产品源码改动、新测试或构建，新业务发送 0，完整闭环仍 **0/2**；原生目标继续 active，K1–K7 和延期范围不变。

**用户恢复后原入口与本地项目实查（2026-11-06，owner `01a1b058-c3cb-7830-9a46-2b27434b8512`）：** 用户明确继续并给予全部工具权限，原生目标实读 active，完整闭环仍 **0/2**。官方 `opendesk browser doctor` 返回原扩展 ID、连接 false/socket 不存在；`opendesk-dev --doctor --json` 证明已安装 CLI 包及登记内容一致，但认证 Native 为 `E_NATIVE_NOT_READY`。沿原 `resolveNativeConnection` / `probeConnection` 仅认证复核同一 legacy 连接，仍未就绪，没有重新配对、安装、启动 Provider 或附加项目。该事实只限制本地项目 provider 路径，不据此认定已安装 Task 或后台 RunHost 故障。原开发 writer PID 68812 与 43120 监听仍在，未触碰输出。

只读原 Chrome 当前界面为 ChatGPT 登录页，未打开侧栏；这不证明所有历史标签或账号都已退出。本任务原独立聊天 tab 560070201 定向绑定超时，再读同一 tab 仍超时，没有改用其他协议或控制通道绕过原扩展地址拒绝。原任务详情尚不可用，无法读取已安装/当前身份差异或沿原审阅链验证临时候选。没有已证实的新源码缺陷，不为制造进展修改公共校验；没有新测试、构建、业务发送或 UNKNOWN 重放。恢复条件是合法原任务详情可操作；若采用本地项目，则其原 Native 连接须就绪。保留原 K1–K7、未导入 v1.1.5 临时候选与全部延期项。

### 12.29 固定协议文件读写与自然完成（2026-11-06，owner 01a1afe0）

**本轮范围已完成：** 用户要求提示词含完整 JSON、AI 只原样回显，原监听器正常触发，真实读写及相关功能能够重复发起并自然结束。范围为现有“高级：旧版文件协议访问与审阅”的受控 read／edit-write／list；不替换上方后台 Task owner 的执行卡、旧 UNKNOWN 或延期验收。

实际发现只读回填后仍等待编辑、同页后续请求可能被旧项目会话接管；关闭页面不能代替完成。本轮沿项目唯一可信 owner 修复：默认只读不生成编辑身份；可信页面明确选择读后修改；成功结果回填后标 completed 并停止轮询；写入须审阅确认、取得真实保存回执、独立读回和最终回填后完成；新轮清除旧状态并生成新身份，未知交付拒绝换身份重放。短提示词直接含任务和完整六字段 JSON，模型协议未增加权限字段。复用原解析、Native、持久账本和权限边界。

**实际运行：** 原 CFT 149／原扩展 ID／原 Native，原同一可信页面及同一聊天连续两轮只读、两轮读改写、一轮根目录 list，全部由自动监听触发并在关闭页面前自然完成。第二轮修改读取第一轮刚保存的新内容；确认前磁盘未变，确认后两轮均 saved=true／readBackVerified=true；独立只读磁盘核对最终 65 字节、LF，SHA aa6d37c4507adfcedac067b46ddf51a9beff1f0377d6de5de232645c259e3a6b。list 真实返回 demo.txt／65B／truncated=false。最终回执未发送模型不影响完成。

**验证和来源：** 本次相关 Node 检查 145 PASS／0 FAIL；Mendel 独立审查三份 trusted 源码及对应来源 pin。既有唯一 npm run dev writer 发布 revision 85af1a3c0736e6eb05ef5ff9046298300f68f91d17da51f0ec47355a899fa3e8，三份相关目标 source map 与源码一致；CFT 只读配置核对为 canonical dist/development。未另捕获 UI live serve 客户端状态，不以磁盘 revision 冒充该证据。独立本轮方案复评 96/100（不是继承旧97），整产品原92及 production 状态不变。

实际改动归 projects/webflow/trusted 的 controller／UI／HTML、项目定向测试，外加仅三项准确来源 pin 及其门禁测试；没有新协议、Host、Native 修改、第二 watcher、分支、提交或推送。无原始 Native 报文、实际总派发计数、本候选未知故障注入或 production 证明，不宣称零额外 IO。测试后原聊天草稿清空、临时诊断关闭、审阅页关闭和本任务 UI 租约释放；用户浏览器、Native、原项目撤权状态及唯一 watcher 保留。

完整链路、含测试内容的完整提示词和手动读／写／list 步骤见 [文件链说明](chatgpt-local-files.zh-CN.md#固定协议发起与完成修复目标2026-11-0601a1afe0)；逐轮身份、保存／读回、独立磁盘及边界见 [本轮记录](../evidence/file-protocol-completion-20261106-01a1afe0.json)。本轮已设置的原生目标只覆盖该文件链，不接管其他 owner 的后台 Task。

#### 12.29.1 本轮路由补漏与新的完整链路（2026-11-06，owner 01a1afe0）

用户要求假设有遗漏继续完善，并解释原 Web Flow 监听怎样触发文件业务。实证发现固定文件协议被自然语言文件识别排除后，仍可能进入 Task 路由；文件解析又可能只选文件块而漏看同回答 Task。沿原 owner 最小补齐原监听/Task 最终准入与文件 controller 的双向拒绝，核对协议解析和独立路由观察属于同一完整回复，并区分未取得结果、只读、修改、审阅、最终回执、暂停与完成提示。没有新监听器、协议、权限或 Host，未修改 src/Native。

5 个新增行为回归 RED 5 → GREEN 5；相关九文件 390 PASS、0 FAIL、0 skip，三份语法通过。Hubble 独立审查当前三份源码无 P1/P2 阻断，批准精确 blob，原来源保护同步后 4/4 PASS。唯一原 dev writer 发布 3534b57386f41c4e649293e8a9b193eea5d288185d0f5a70271dafa042ac3e2b；controller/UI/route 映射与源码一致，未捕获本次独立 live serve UI 状态。

原 CFT 149 中 Native 已连接，新阶段提示可见；官网加载失败恢复后，以全新身份 6f75880c-1484-43cd-a6d9-0d59f1cd83f8 回填完整协议并发送一次，官网持续“正在思考”且停止禁用，没有完整回答。新版真实读写及混合拒绝复测 NOT_TESTED，不继承 12.29 的原生 PASS/96 分；本轮 NOT_SCORED，后续文档独立复核因 429 未返回，未改 provider/model。磁盘仍为原 65B/SHA aa6d37c4507adfcedac067b46ddf51a9beff1f0377d6de5de232645c259e3a6b。自有审阅页关闭停止轮询、诊断恢复隐藏、草稿为空、UI 释放，保留原环境和撤权状态。

新说明明确区分普通聊天的原 Web Flow discovery/adapter/project 链与保持高级页打开的 JSON poll 链；逐步列明提示词完整 JSON、解析分派、Native read/list、真实上下文、edit、确认、SHA 保存及独立读回/完成，并保留未知写入只读对账和现有范围限制。见[最新链路](chatgpt-local-files.zh-CN.md#最新链路与本轮补漏2026-11-0601a1afe0)及[本轮独立记录](../evidence/file-protocol-routing-20261106-01a1afe0.json)。无提交、推送或其他项目改动。

---

## R2 差量 · ChatGPT→ChatGPT 交接合同与 GitHub 分工（2026-11-10）

**用户目标**：复用 AI Send Queue、Web Flow 与 GitHub 完成多步骤、多对话日常任务；不重写原发送队列、不重复造 Host/任务库；以真实跨 ChatGPT 对话为下一阶段 MVP，而不是重新讨论旧 P0。补充技术决策见 [multi-conversation-github-r2.zh-CN.md](multi-conversation-github-r2.zh-CN.md)，BR-06/07/08/10/11/12 仍以本项目 product-contract 为权威。

**本轮实际修改（main）**：
- 新增 `projects/webflow/docs/multi-conversation-github-r2.zh-CN.md`：只记录 gh-aw/Actions 与 Web Flow 的执行分工、P1a 最短链、输入互斥、安全与验收，不另建需求真相/并行计划。
- 新增 `projects/webflow/src/chat-handoff-contract.js`：**纯数据** `opendesk.workflow.handoff.v2`，仅允许同 Profile 的 ChatGPT 原 A → 最多一次新 ChatGPT B → 原 A 的有界交接候选；要求可信调用侧提供 expectedSource/Target/InputRefs/AuthorizationRef，拒绝错源、篡改证据、错误时间/预算/多余字段。它不会验证真实授权，也**不能**执行任何网页动作。
- 新增 `projects/webflow/tests/chat-handoff-contract.test.mjs`：10 组 Node 顶层测试覆盖冻结、版本隔离、封闭 Schema、可信预期范围、期限/步数、恶意附加字段、UTF-8 长度与来源回填；在独立 Node 22 环境对**精确 Git blob 内容**验证 `10/10 PASS`（blob SHA 分别为 `05009811950a092c7f0da90523dd48256da36496`、`26e527e4652bd3af6436f92e75a4e1e2c4ebb0c8`）。非仓库 CI、非 Chrome/Native 原生测试。
- 原 `handoff-contract.js` v1、`queue/state.js` v1、AI Send Queue Page / Host、Web Flow 自动执行/授权链、`dist/development` 与现有正式包**完全未改**；未触发任何 ChatGPT 发送、Codex、GitHub Issue 写入或权限申请。

**证据分级**：`SOURCE_IMPLEMENTED=YES`（纯 v2 合同和测试已提交），`COMPONENT_TESTED=10/10`（独立 Node 22，Git blob 一致），`INTEGRATION=NOT_IMPLEMENTED`，`CHROME_NATIVE_VERIFIED=NOT_TESTED`，`PRODUCT_DONE=NOT_TESTED`，`ENGINEERING_SCORE=NOT_SCORED`。不能把数据解析测试当多对话已跑通。

**下一条最小执行动作**：只读核查并行中的 `chatgpt.conversation.create` 是否已有正式可信入口和单次创建回执；若已合入，新增最小 ChatGPT site adapter 并接现有 Bridge/Authority/RunHost 做 A→B→A（一轮 B）实测；若仍未合入，先完成不执行真实网页的 v2 交接 Receipt 与读写对账测试，**不要重复开发新对话按钮/Runner**。测试时必须隔离原 Send Queue 的草稿、IME、附件与 unknown；真实结果基于 conversationId/turnId/Run/Result/唯一交付回执验证。GitHub 初期只读，写入评论须另行明确授权。

---

## 2026-11-11 · 文件任务网页浮窗退役／可信扩展接管（OD-AI-WORKFLOW-BRIDGE）

**用户问题：** ChatGPT 上的「项目文件／打开／×」浮窗污染正常聊天，原浮窗又承担文件任务 Stop、回执和诊断；必须退役页面 UI，不删除其自动监听和文件业务。

**本轮只做的源码差量：**
- 将 chatgpt-file-intent-page.js 改为 Headless adapter：无网页 DOM/Toast，复用 chatgpt-bridge-page.js 的唯一消息及完整答复发现器。
- 在原 chatgpt-files-service.js/controller.js 增加可信 project-list / project-status / project-stop / project-review：绑定原 tab/document/project，保留原状态/授权/Native/写入账本，无第二套 Runner。
- 在原 native-agent/settings.html 加入任务选择、状态/回执、Stop、审阅，以及无需先创建项目任务的当前窗口 ChatGPT 原文档选择与一次性审阅；Side Panel 只链接已有可信扩展设置页。
- 原 file-intent-gate.js 复用一次性安全 handoff；旧 diagnosticsVisible 保持兼容但仅属于扩展内折叠诊断。
- 替换浮窗相关过时断言，保留文件协议、Native SHA、写入回执与跨重启 Stop 栅栏核心回归。其他并行 V2、MD 队列、通用 Toast、安装器 owner 不改。

**分层：** SOURCE = 最新 GitHub 提交待核对；SYNTAX = 源码 V8 解析；NODE_TEST = 只按与提交 SHA 匹配的实际 CI 日志判定；PACKAGE / CHROME / Native / BUSINESS = NOT_TESTED，直到本地真机证据取得。

**Codex 下一步唯一任务：** 基于最新 main 核对增量已落地，执行 WebFlow 文件专属 Node 回归/构建，再在真实 Chrome 用隔离授权项目验收：网页全状态无浮窗、官网自然发送、文件授权/读取/审阅/写入读回、设置页面原任务状态/Stop/撤权/UNKNOWN、关闭与重开侧栏、原网页 Task 回归。任何实测缺陷只修本轮责任范围，不重做其他 owner 工作。

**本轮最新实际 CI 证据（2026-11-11）：** `main` 上最终测试代码提交 [80447bb](https://github.com/shopable-ai/opendesk-browser/commit/80447bbcd5fb795fa38646d28ca4f4f26663ebcf)；[专项 Actions 42872904587](https://github.com/shopable-ai/opendesk-browser/actions/runs/42872904587) 的 `headless-contract` 真正执行 Node 22 + `node --check` + 7 组文件安全回归，**204 PASS / 0 FAIL / 0 skipped**。这仅验证本轮固定模块/可信控制器/测试夹具，不代表完整 WebFlow/App CI 或 WXT 生产包通过；后者当时受到并行 Task 版本、Provenance 固定源等其他 owner 问题影响，不能掩盖。PACKAGE/CHROME/Native/BUSINESS 仍 **NOT_TESTED**。
