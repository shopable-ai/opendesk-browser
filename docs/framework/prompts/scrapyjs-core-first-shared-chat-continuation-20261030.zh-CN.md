> 历史资料：不要再次执行本文件的旧任务清单。
> 当前唯一续作入口：[Scrapling Dev续作提示词](scrapyjs-r17-product-use-and-test-20261031.zh-CN.md)。原始目标保留，按其中已完成/未完成及候选范围复用证据，不把多份历史提示词串行重跑。
> 当前以Dev核心为先；评分各维100分、综合取算术平均，旧权重只作历史。

# ScrapyJS：先完成采集核心，复用独立共享 Chat

用户最新纠偏（2026-10-30）：前几轮重心偏到 AI 入口和桌面输入；AI 不是采集核心。继续完善现有 ScrapyJS，先让用户能够完成采集，不增加新功能清单，不重开整体架构讨论。

你接任唯一 ScrapyJS 业务 owner。旧任务 01a18d36-194f-7850-9925-1effa058d001 已停止浏览器/桌面输入，Browser 已 finalize，无本轮 AI、配对、安装确认或 Run 在途，get_goal 实读 null。不要另建总 Goal、第二个业务执行者或查询旧任务等待批准。先按最新阶段更新原记录的实际 owner；之后旧任务不再写入业务或操作环境。

## 当前核心目标

用已有或人工填写的声明式配置，独立完成：
打开安装态应用 → 选择目标和规则/复用保存配置 → 真实试采 3 页 → 核对数据 → 明确确认完整采集 → 活跃时关闭再打开侧栏，恢复原任务 → Stop 原任务 → Chrome 保存 CSV/JSONL 并独立读回。

AI 只是可选的“生成/纠正规则”辅助入口。无 AI 调用、没有 Provider、用户不打开 Chat 时，合法配置仍应能试采、查看、确认运行、恢复、停止和导出。AI 请求 unknown 只约束相关推理与依赖副作用，不把无依赖的配置编辑与源码工作全局锁死；不得借解耦静默重放未知请求或解除原安全围栏。原浏览器采集主流程必须保留。

先交付核心操作与最小验证。production、正式专家评分、完整矩阵、宽度、主题、缩放、睡眠恢复与 AI 专项验收延期；旧“AI 必须先成功的八项条件”保留历史，不继续作为当前核心前置。

## 第一项工作：确认现有功能和真正阻塞，再最小修复

先读当前 AGENTS.md、工具 README 顶部、原 currentCoreAcceptance、原工作记录，以及对应的 Sidebar Tool 开发 Skill。用一屏说明当前有哪些用户功能、哪些有真实安装态证据、哪条下一操作失败；不要把按钮数、测试数或源码存在当完成度。

已发现的具体接线线索，不必重做整库调查：
- examples/sidebar-tools/scrapyjs/src/App.jsx 已有配置、规则/JSON、保存配置和原浏览器采集入口。
- src/AiPanel.jsx 当前同时持有本机试采、长任务、恢复、Stop、结果和导出；certified 依赖 AI draft，startFull 还调用 ai.info 校验 Provider。这是采集被绑到 AI 的具体位置，需核实真实调用链后最小解耦。
- 复用现有 local-runner-client.js、模型、已审计可信 Host/本地服务及原安装合同。能走已有非 AI 入口就直接走；若仅缺入口/状态归属，修工具自己的必要接线。不要重写采集引擎、Host、存储或新增运行器。
- 新合入 adapters/static-http-trial.mjs 是已有候选模块，须按其公开边界判断是否为当前真实消费者；不能因文件较新就切换后端，不能绕过 v1 签名/选择器拒绝或用直接 HTTP 代替安装态权限链。
- 先运行一条最短真实采集链；当前桌面输入确实不可用时，可先做有明确故障依据的源码解耦及直接定向验证，不重复键入、全组测试或准备工作填补等待。不要为了“AI 先发一次”再耗完整轮次。

## Chat 公共边界

权威入口是 docs/api/sidebar-tools-ai.zh-CN.md 的“独立 Chat 的职责与最小接入”和“沙箱复用 Chat 展示”，并按 .agents/workflows/extension-creation.md 的发现与复用步骤执行。

Chat 展示 Frame、业务无关内存会话、受控 ai.info/generate/cancel 属共享能力；ScrapyJS 只拥有采集领域 adapter、最少上下文、声明式提案验证和显式应用。当前源码已从 @opendesk/ui 使用 SharedConversationFrame/createConversationSession，优先保留并正确消费，不另造 Chat，不复制书签管理整套业务，不另建 Provider 设置/历史存储/聊天服务，也不以本任务重构公共平台。

需要借鉴书签时，只看公共合同明确的最小消费者片段。源码已共享，不证明已安装的旧包也包含该共享实现；分清源码导出、目标版本包含、实际运行和权限批准。未知实际能力记 SDK_GAP_NOT_PROVEN，平台缺口用最小复现交原 owner，不越界补假 API。

## 已有事实与候选，禁止重做或混用

- 项目唯一 owner：/Users/mac/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs/。仅本机 main；禁止分支/worktree/PR，保留所有并行和未提交改动，不提交/推送他人成果。
- 已安装候选为 App 1.7.1 / Task 0.4.0；原审阅规范包 SHA-256：83e5e7f3417b146889b1b8995c8148457d02260bbe3fb0568b80c6db0c5c039a。同 ID 1.7.0→1.7.1 升级、旧保存配置完整 JSON 独立读回已通过，不重做。
- 合并后源码含共享 Chat、Task 0.4.1 等变化，尚未重新编译、晋升和安装。旧候选的构建/同源/原生结论不能覆盖新源码。
- 原记录：examples/sidebar-tools/scrapyjs/evidence/r17-verification.json.currentCoreAcceptance；工作记录 docs/framework/workstreams/scrapyjs-r17-native-20261030-01a18c46.md。沿原位置更新，旧 AI 优先计划保留为历史，不新建并列验收账本。
- 本轮实际打开了正常 Chrome 工具栏、安装态 ScrapyJS 和 AI 工作台，需求框焦点可见、前台守卫匹配 Chrome PID 489 / Fixture 标题。指定 PID 输入明确报 PID-scoped native macOS Unicode typing failed with code 2；标准输入与正常菜单粘贴后最终仍是 placeholder。尚未证明 ScrapyJS 产品输入缺陷。原始证据 artifacts/scrapyjs/r17-manual-demo/01a18d36/native-input-blocker.json 与 native-input-blocked.png。同样条件不重复尝试；须驱动修复或有新合法受守卫输入路径。不给用户代跑测试。
- 旧任务尝试更新记录的 Python 命令在解析阶段因编码报错，未执行写入；后续实际变更以当前文件为准，不把失败命令当已完成。
- 真实扩展 ID/serve/ed52 是历史观察，实际加载路径仍 NOT_TESTED。只能从允许的可见入口补证；管理页 chrome://extensions/ 与扩展 Workspace 的既有拒绝继续有效，不经 OS/CLI/Profile/CDP/其他表面取同一被拒信息。
- 复用既有 dist/development 和共享 watcher，writer 仍归原 owner；不另启 dev/build、不覆盖共享输出、不重启 Fixture/Python。当前服务存活按必要只读检查确认，不从历史 PID 推断现况。需要更新工具时仅走项目自己的原编译及唯一打包 Skill，候选验证后再晋升，不手改 JSON。
- 普通网页用 Chrome Skill；正常工具栏/侧栏沿既有桌面授权，每次键鼠前 fresh active-window 和截图；工具 executed 不等于实际成功，不忽略窗口守卫盲输。
- secret 仅经原可信 Host 文件选择器；不读取到模型、iframe、日志或提交。不碰 Cookie、云控、公共 storage、device-keys 或他人索引。资源实际冲突只协调一次，无新路径时记录解除条件并结束，不轮询等待。

## 核心采集输入与判定

复用公开 Fixture http://127.0.0.1:43233/page-1.html：
#books 的直接 li；id 取当前 li 的 data-id，title 取 h2 文本，price 取 .price 文本。只有 id/title/price，缺失价格保留空字符串；a.next 同源分页，以 id 去重，最多 50 页；先试采 3 页。只用静态 CSS 声明式规则，不增加详情、processing、validation 或 fieldRequirements。

三页应恰好六条，价格保持字符串：
A / 浏览器工具 / 19.50
B / 本地任务 / 25.00
C / 声明式采集 / 30.00
D / 持久结果 / 0.00
E / 精确分页 / 42.25
F / 停止与恢复 / 空字符串

id/title 完整度 100%，price 5/6 非空，错误为空且 worker 退出。完整采集必须明确确认并绑定刚核对的 previewRunId/configHash/config/scope；配置变化使认证失效，不能为去掉 AI 前置放松此保护。活跃关闭重开须同 runId、无第二任务；Stop 须至少一页后原 PID 退出、workerExited=true 且无后续采集请求，自然完成不算。CSV/JSONL 必须真实 Chrome 落盘，并独立逐字段核对同 run 的值和空字符串。

原 Fixture 请求日志禁用，空日志不证明 Stop。复用 artifacts/scrapyjs/r17-manual-demo/observe_runs.py 与 01a18c46/readback_downloads.py；只有实际开始 Run 才启动必要观察。43234 仅公开文字暂存/模拟页，不是 AI/采集证据。

## 工作与报告方式

每项诊断/测试/构建前一句话说清当前行为或安全保护及必要缺口，只做受影响检查。没有新变化/失败，不重复旧测试；不恢复旧全量清单。已有有效证据按原候选等级复用。

先报告“哪个采集操作现在可用、哪一步失败/未验证、下一步修哪里”，再列必要证据。AI 复用情况单独简述，不把 AI Chat 当项目主功能，也不主动新增功能。最终以真实采集闭环的可用结果交付；未执行项如实标 NOT_TESTED。
