> 历史资料：不要再次执行本文件的旧任务清单。
> 当前唯一续作入口：[Scrapling Dev续作提示词](scrapyjs-r17-product-use-and-test-20261031.zh-CN.md)。原始目标保留，按其中已完成/未完成及候选范围复用证据，不把多份历史提示词串行重跑。
> 当前以Dev核心为先；评分各维100分、综合取算术平均，旧权重只作历史。

请直接使用已保存的 opendesk-browser 项目和当前 main 工作目录；禁止创建/切换开发分支、Git worktree 或 PR。用户最新请求（2026-10-30）是“已经完成了什么？通过测试了吗？创建新对话，继续完善。”你接任唯一 ScrapyJS 业务 owner，旧任务 01a18d57-430e-7332-98b5-17d189f92a63 停止业务和环境操作，不要发回等待批准，也不要另建总 Goal或第二个业务执行者。

先读 AGENTS.md、examples/sidebar-tools/scrapyjs/README.zh-CN.md 顶部、evidence/r17-verification.json.currentCoreAcceptance、docs/framework/workstreams/scrapyjs-r17-native-20261030-01a18c46.md，以及对应 Sidebar Tool 开发 Skill。第一步在原 currentCoreAcceptance/工作记录写入你的实际任务 owner。原 20261030 接续提示词是修复前历史，以本正文和当前源码为准。

当前阶段仍是“采集核心优先，AI 可选”，不新增功能清单或重开整体架构讨论。目标是：
打开安装态应用 → 选择/复用已有配置或人工填写声明式规则 → 真实试采 3 页 → 核对数据 → 明确确认完整采集 → 活跃时关闭再打开侧栏恢复同一 runId → 至少一页后 Stop 原任务 → Chrome 保存 CSV/JSONL 并独立逐字段读回。
无 AI、无 Provider、不打开 Chat，合法配置也必须能够完成此核心链。production、正式评分、完整矩阵、宽度/主题/缩放、睡眠与 AI 专项继续延期。历史 AI 优先八条件不作为前置。

已完成并可直接复用：
- 本机 main 提交 21b1ec5ed，7 个本轮文件：src/App.jsx、src/AiPanel.jsx、新 src/CaptureWorkspace.jsx、tests/react-fixture.mjs、新 tests/local-runner-app.test.mjs、tool.config.json、唯一 scrapyjs.opendesk-tool.json。未推送；不能夹带其他工具暂存/未提交成果。
- 本机采集的唯一 client、试采、明确 full 确认、恢复/轮询、Stop、结果、CSV/JSONL 导出已从 AiPanel 移至 CaptureWorkspace。入口 App 的“本机试采 / 任务”。直接读取当前保存配置，允许手填本机 JSON，保留原配置目录与原浏览器采集入口及浏览器10页上限。
- 不打开 Chat 时不初始化 AI、不调用 ai.info/generate/cancel。AiPanel 仅保留领域提示词、提案校验/差异/显式应用；继续从 @opendesk/ui 复用 SharedConversationFrame/createConversationSession，按需挂载并保留隐藏后的草稿。不要重建 Chat、Provider 设置、历史存储或调查整套书签业务。
- full 不再查询 Provider或依赖 AI draft；仍需核对试采后勾选确认，绑定 previewRunId/configHash/config 和原 client/Host 的 scope/权限。配置编辑再改回也不会复活认证。AI unknown 仍保留原请求、禁止推理/应用/重放及刷新围栏，但不全局锁死无依赖配置编辑/人工采集。
- 没有改引擎、通用 Framework、Host、存储 schema、权限或 Task 源码。adapters/static-http-trial.mjs 在 src 没有实际消费者，不因它较新就切后端，更不通过直接HTTP代替安装态授权链。

已有有效验证（当前源码/包 SHA 已只读重新核对一致，无新修改/失败时不要重跑）：
- React/client/配置与原浏览器模型兼容 54项 PASS：
node --test examples/sidebar-tools/scrapyjs/tests/local-runner-app.test.mjs examples/sidebar-tools/scrapyjs/tests/ai-app.test.mjs examples/sidebar-tools/scrapyjs/tests/ai-panel.test.mjs examples/sidebar-tools/scrapyjs/tests/local-runner-client.test.mjs examples/sidebar-tools/scrapyjs/tests/app-view.test.mjs examples/sidebar-tools/scrapyjs/tests/app-model.test.mjs
- 最后复核发现 AI/采集状态提示 DOM ID 重复，先复现再把 AI 状态改为 ai-notice；受影响 local-runner-app/ai-app/ai-panel 9项重新 PASS。其余未变输入的有效结果复用，不把9项与54项相加为独立测试总数。
- npm run build --prefix examples/sidebar-tools/scrapyjs：项目 Vite PASS，14 modules，未构建/覆盖 Browser dist/development。
- 原 scripts/build-sidebar-tool.mjs 候选 → tests/package.test.mjs 1项 PASS → --promote-from → --check-project PROJECT_PACKAGE_MATCH。
- 最终唯一正式 App 1.7.3，固定委托 Task0.4.1，111803 bytes，SHA256 60a6402ca171ad1c7174f462be6cb33c3d41ffe034446c5a1a4fc85104611842。原权限声明无扩张。中间1.7.2仅本机候选、未安装；最终包是1.7.3。
- JSON/owner/源码SHA/包SHA/受影响本地链接/diff空白已核对通过。
- 所有上述是源码、组件替身传输、client或包证据，不是实际 Chrome 采集/下载证明。

真实安装与剩余缺口：
- 最新实际安装观察仍 App1.7.1 / Task0.4.0；其规范包SHA 83e5e7f3417b146889b1b8995c8148457d02260bbe3fb0568b80c6db0c5c039a。原同ID1.7.0→1.7.1升级及旧保存配置完整JSON独立读回已PASS，不重做。
- 1.7.3 尚未真实安装。下一条用户操作是合法正常桌面路径恢复后，经原可信安装器同 ID 更新1.7.3，再打开“本机试采 / 任务”直接填写规则并试采，不能重新先要求AI成功。
- 上轮指定PID原生输入明确报“PID-scoped native macOS Unicode typing failed with code 2”；标准输入/正常菜单粘贴最终仍是 placeholder，未证明 Scrapy产品输入缺陷。原始证据 artifacts/scrapyjs/r17-manual-demo/01a18d36/native-input-blocker.json 与 native-input-blocked.png。
- 云控owner01a18d55-b835-72f2-b161-573d4f1158ac随后也报告正常Dock click未改变前台、guard读到VSCode而拒绝、tm_focus_window Google Chrome超时，已明确释放输入，无其在途Native/安装/配对/Run/chooser。本任务未执行任何桌面/浏览器动作。
- 同条件无新合法输入路径不重试；必要时只诊断当前驱动阻塞的最小原因，并把有证据的平台问题交对应owner，不把本任务扩成Native/环境重构。无解除路径时明确记录阻塞，不通过全组测试/构建/轮询填充等待，也不要求用户代跑。
- chrome://extensions/ 与原扩展Workspace已有拒绝继续有效。实际加载路径仍 NOT_TESTED，不经OS/CLI/Profile/CDP/其他表面获取被拒的同一信息。旧ID/serve/ed52是历史观察，不代表当前真实环境。
- 使用普通网页时按Chrome Skill；工具栏/侧栏只沿现有桌面授权，每次键鼠前fresh active-window和截图、尊重守卫，executed不代表成功。secret只经原可信Host文件选择器，不读取到模型/iframe/日志/提交。
- 不碰Cookie、云控、公共storage、device-keys、他人索引或Tab。若确实需要共享全局输入，只针对资源事件协调一次，不轮询或等待对方整体验收。
- 复用 dist/development 和原共享watcher，writer仍归原owner。不要另启dev/build、覆盖共享输出、停止他人服务或重启Fixture/Python。只有当前核心操作需要时，才做必要只读存活核对；不从旧PID推断现况。修改工具时仍走原项目编译及唯一打包Skill；没有源码变化不重复编译/晋升。

核心公开输入：
http://127.0.0.1:43233/page-1.html
{
  "url":"http://127.0.0.1:43233/page-1.html",
  "itemConfig":{"_listContainer":"#books","_listItem":":scope > li","id":".::data-id","title":"h2::text","price":".price::text"},
  "nextPageSelector":"a.next","maxPages":50,"dedupeKey":"id"
}
先试采3页，应恰好六条，价格全是字符串：
A / 浏览器工具 / 19.50
B / 本地任务 / 25.00
C / 声明式采集 / 30.00
D / 持久结果 / 0.00
E / 精确分页 / 42.25
F / 停止与恢复 / 空字符串
id/title完整度100%，price5/6非空，错误为空且worker退出。只用静态CSS声明式规则，不增加详情、processing、validation或fieldRequirements。
活跃重开必须同runId且不产生第二任务；Stop必须至少一页后原PID退出、workerExited=true且无后续采集请求，自然完成不算。原Fixture请求日志禁用，空日志不是Stop证据。
复用 artifacts/scrapyjs/r17-manual-demo/observe_runs.py 与 01a18c46/readback_downloads.py；只有实际Run开始才启动观察。43234仅文字暂存/模拟页，不是AI/采集证据。

记录/归属：
唯一业务目录 examples/sidebar-tools/scrapyjs/；保留现有未提交 README.zh-CN.md、R1.7-LOCAL-RUNNER.zh-CN.md、evidence/r17-verification.json 和原本机工作记录，它们已写入本轮进展，但没有夹带进21b1ec5ed。工作记录路径受原gitignore忽略，文件确实已保存。
继续更新原 currentCoreAcceptance / 工作记录，不新建平行验收账本。接手实际 get_goal 状态按工具读，旧任务此次 get_goal=null，未创建Goal；不得用交接伪报核心目标完成。
逐项诊断/测试/构建前说明它证明哪个当前行为/安全保护及必要缺口；没有新变化不重复旧测试。进度先讲真实操作，再讲组件/包证据。继续完善不等于恢复延期矩阵，也不为了有工作而改源码。
