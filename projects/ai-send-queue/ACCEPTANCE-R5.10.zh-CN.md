# R5.10 · Mac 安装与验收记录

2026-10-28 起接续对话 `01a1831f-9060-76b3-b98d-758dceea4006`。最新结论为 **日常 Tool 已安装并可打开，网页队列仍受阻，核心链未通过**。没有公开发布。以下按时间区分最新开发证据和历史验收记录。

## 最新开发证据（2026-10-29，覆盖下文旧状态）

- 持续开发：原 `npm run dev`（npm 18395 / Node 18415）、`dist/development`、普通 Chrome 156.0.8078.73、扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`；未重装扩展或改变 Native 配对，未启动第二 writer。
- 正常文件导入、审阅并确认安装成功。真实入口「扩展 → AI 消息发送队列 → 打开」已显示正式 React Tool UI，版本 0.1.13、文件 SHA256 `df0f8484594dc7f0d5ac7c0d4c79330426aa079981af00a012282c5f31065ddb`，与原同源晋升包一致。它显示「当前网页未执行获准的队列程序」；与下文只读开发预览不同，不计为真实队列成功。
- 容量按已复现需求由 12 最小扩为 13；单包/数据限额、权限、CSP、安装身份与审阅不变。DNR 槽和市场提示引用同一常量。实际 SW 控制台随后暴露右键菜单仍硬编码 12 的遗漏，已改为引用同一常量，避免新增第 13 项后把合法注册表误报损坏。原工具和数据未删除。
- 开发页正常读取的 r12 最近执行回执：`E_PAGE_SCRIPT_EXECUTION: Packaged Send Queue crown image is missing or invalid`。真实打包器已内嵌 CSS 图片，产品仅接受相对路径的假设导致初始化退出。本次仅修该来源校验冲突，仍要求 CSS 使用同一声明皇冠图片；皇冠位置、样式、发送引擎和权限不改。
- 已用原 Program 打包器生成 r13：sourceHash `2e33a179ff03ba02810827ce6bc56482a3ae90d4da9b93805870334b6962e8de`，packageHash `c63d0b0321826eabf5340f06a96d435a6983fc982371e2bede440941c9a30720`，文件 SHA256 `788cc74c9569677bdbab9eff048a60aa95edbcebcc311fabc72ad3094fed3cb6`。候选在 `artifacts/ai-send-queue-r510/core-20261029/ai-send-queue-r13.opendesk-page.json`；现有受信准入精确绑定 r13/hash，Tool pin 不变。
- 原审阅确认更新 r12→r13 被 `E_PAGE_CLEANUP_PENDING` 拒绝，未计安装成功。只读 SW 诊断定位到 r11 的两个存活 document（560068741 / 560068827），原执行都已因同一皇冠错误失败；未写存储、清除恢复记录或绕过栅栏。分别核对草稿后正常刷新原文档：560068741 的测试草稿逐字一致保留，560068827 输入框为空。尚未读取刷新后的清理终态。
- 随后 CUA 原生控制、直接绑定标签页均持续超时，未恢复真实更新操作。一次恢复控制的新窗口请求虽超时，清单确认创建了同一测试会话的空标签 560068850；它未输入或发送消息，因控制工具不可用尚未关闭。原独立测试标签 560068828 保留。没有新队列消息或普通 ChatGPT 消息发送。
- 定向检查：图片回归在修改前复现失败，修复后 view 22/22；r13 固定准入及入口 6/6；容量相关安装 4/4；右键菜单在新增第 13 项用例修改前复现失败，改后 21/21（含溢出与重复身份拒绝）。DNR/预算 23 PASS、2 FAIL；这两项在进程内恢复旧容量 12 的基线诊断中同样失败，记录为既有 fixture 问题延期，未放宽产品保护。
- 正式预览器尚无 ai-send-queue React 适配，本轮没有新增 Mock 预览，也未声明 `SOURCE_HTML_INLINE` 或新的界面截图通过。此前真实安装截图仅证明同字节 Tool 外壳；历史网页设计稿亦不等于真实 ChatGPT 队列。
- 收尾时官方 native UI 锁已释放，并向获授权的共享服务 owner `01a1835f-7dfb-7012-a526-97ec85af800f` 发出资源回执；上述服务 PID 仍在。浏览器控制超时后未再操作 UI，最后一次扩展刷新后的连接/页签状态未验证。修改保留在 main，尚未提交。

下一条用户操作：恢复可用的浏览器控制后先刷新安装状态，确认原 managed cleanup 的终态；再经现有导入审阅安装 r13，回到独立测试会话，验证 Page 入队 → Sidebar 同 ID/revision → 跨端暂停/恢复 → FIFO 真实回复。各项目前均 `NOT_TESTED`，不能以本次 Node PASS 或 Tool UI 可打开替代。完整验收、评分、production 与专项矩阵仍延期。

## 当前阶段：核心开发（2026-10-28 最新覆盖）

接收 owner `01a18336-1f62-7e72-8954-bd4000e2d95d` 按最新要求仅推进真实核心链。以下 P1/P3 与八维表保留为历史验收记录，不再触发本轮完整验收、评分、宽度/缩放/触屏矩阵、production 发布或全量 CI。

普通 Chrome 准确路径 `/Users/shopme/Applications/Google Chrome.app` 的交接标签页保留原草稿，另开独立测试会话 `https://chatgpt.com/c/6ae21a75-b3e8-83ee-8a79-3ac355d2ae84`，发送仅用于建立会话的 ASQ-CORE-20261028 消息后收到真实回复 `READY`，原生回复复制动作已出现。网站与服务器会话入口可用；这不证明消息经过队列发送。

打开日常 OpenDesk Side Panel 后实际出现 `ERR_FILE_NOT_FOUND`。Chrome 详情确认扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 仍加载仓库 `dist/development`；磁盘缺少该目录的 `sidepanel.html` 与 `manifest.json`。既有 watcher PID 93865、43119/43120 仍在，日志反复读取旧 Host 528384-byte 预算并拒绝 528503-byte 入口；源码上限已由并行任务改为 1 MiB。当前待恢复同一服务后继续 Page/Sidebar 操作；未启动第二 writer，未替换日常扩展或 Native 配对。

共享恢复回执（2026-10-29）：Quick Notes 接收 owner `01a18338-c0b7-74a3-acc3-44bf2c846c15` 已正常退出旧 writer、待守卫释放后恢复同一服务，新 Node PID `18415`，当时输出 revision `31a97aaa03affc85516693e2c874b88c12f11f572fba65328bdb48f0c8eff8f1`，Host 528503 bytes。本对话随后真实打开同一日常扩展的侧栏，确认五个产品 Tab 与 development 调试入口可见；没有重启或另起 writer。

2026-10-29 日常 Chrome 核心操作实测（优先于下文历史 Profile 结论）：

- 同一扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，仍加载仓库 `dist/development`；不改 Native 配对。
- 经原文件导入、审阅与确认更新，同一 Page `opendesk.ai-send-queue` 从 r11 更新至 `0.1.13/r12`。安装身份 `817878f0-d69e-4e58-95cd-f900cc5e1468`，sourceHash、manifestHash 与下表一致。Authority active、Chrome registered，但受管清理状态 unknown，列表提示「注册或清理异常，需核对」。清理状态与页面无 UI 的因果尚未证明。
- 独立测试会话刷新后仍没有「当前草稿加入发送队列」按钮。没有创建队列条目，未发送新消息；READY 仍是前日普通原生发送。
- 正式 Tool JSON 经原安装审阅确认后失败：`E_TOOL_CAPACITY：最多安装 12 个工具`。没有删除用户工具或绕过容量校验。
- 原 stage 发布同源包后，以官方 `opendesk browser dev --read-only` 临时连接自身目录，正常「在侧栏调试」显示真实 React 外壳。界面明确为「本地快照 · 未安装」「只读预览」，请求被「开发预览不允许真实写入、打开任务或控制网页」拒绝，连接状态另报 `E_FILES_NOT_FOUND`。这不是可操作队列或安装成功证据。
- 本次临时预览已正常 Stop，自己的只读 CLI 已 Ctrl+C，官方 UI 锁已释放交还 Quick Notes owner。保留其 Workspace、源码、数据、Vite/stage 与共享 dev 服务。独立测试页中误插入的提示词草稿已清空，没有发送；原交接标签页草稿保留。

本次实际截图与 AX 状态：`artifacts/ai-send-queue-r510/core-20261029/actual-core-ui-blocked.png`、`actual-core-ui-blocked.txt`。当前结论是 **核心 UI 尚不可用**；下一步只诊断页面未出现与正式安装容量阻塞，再验证入队、列表及发送。

本轮新证据：`artifacts/ai-send-queue-r510/core-20261028/session.json`、`session-ready-sidebar-missing.txt/png`。队列入队、同 ID/revision、跨端暂停恢复与真实 FIFO 仍为 `NOT_TESTED`，没有注入假队列或重试历史未知消息。

## 用户操作结果

- 已有 P1 证据复用：真实可见 Mac CFT 155.0.8059.39 中，经原安装器导入精确 Tool；React 19.2.0、opaque-origin 沙箱、原生 Side Panel 文档关闭重开、同 ID 不同字节包拒绝均通过。该证据不证明 ChatGPT 发送。
- 本轮实际接管空闲 `test-chatgpt-02`，以独立 production 目录重开；此次 Chrome 为 **154.0.8037.92**，不同于 P1 的 155。重新观察到 Cloudflare「请稍候…」，没有输入框，未创建服务器会话、未发送消息、未重试上一轮未知结果。
- P3 新增：通过真实文件导入及「确认更新」安装同程序 r11，Tool 实际 `sendQueue.snapshot` 返回 `E_QUEUE_PAGE_NOT_READY`，界面显示需要新版受信 USER_SCRIPT。
- P3 新增：取消旧版审阅后 Tool 字节与 Chrome 注册保持不变。r12 审阅尚未确认时关闭真实侧栏，等待 SIDE_PANEL 上下文为空，再重开取得新 documentId；持久安装仍是 r11。**只证明提交前中断**，没有测试提交中的故障恢复。第一次立即关开未等到文档消失，未计入通过证据。
- P3 新增：旧 ID `opendesk.chatgpt-send-queue` r4 经单独审阅后才安装，获得独立安装身份 `23d486e5-a3bf-46e1-846d-41b6260c8402` 和不同 Chrome 注册；随后已通过原确认链卸载。仅证明安装身份分离，**不证明两个活动页面队列冲突时的运行保护**。
- 已恢复精确 0.1.13/r12；安装身份仍为 `a99e8288-017d-4c0f-bcb7-c9344ce55b55`，Authority 为 active、Chrome 为 registered，固定 sourceHash 与 manifestHash 正确。旧 ID 注册已移除。
- P4：CUA 按准确 CFT154 路径实际绑定的是其他 owner 的 `test-chatgpt-01`，没有对它输入、点击或关闭。物理侧栏宽度 320/360/400/440/520px、200% 缩放、明暗、Mac 原生键盘与触屏实机均为 **NOT_TESTED**；没有用 viewport、触摸仿真或假队列替代。

## 真实调用链与证据边界

Tool React → `OpenDeskTool.request` → 既有 Side Panel Host → Foundation / Page Authority → 固定 Page USER_SCRIPT 的唯一 memory-only FIFO → ChatGPT 原生输入框与回复 DOM。

目前实际证明到安装、Host / Authority 拒绝及 Page 注册。最后两段的同一真实会话联调仍未取得证据。上一轮原生开场发送只得到 `cloudflare_challenge`，无服务器会话、无助手回复；不能计为队列发送成功。`ci-current-chromium.mjs` 的假数据预览不用于本验收。

## 精确候选与本地交付

| 项目 | 身份 |
| --- | --- |
| Tool | `ai-send-queue` · 0.1.13 · 22,902 bytes |
| Tool 文件 SHA256 | `df0f8484594dc7f0d5ac7c0d4c79330426aa079981af00a012282c5f31065ddb` |
| Page | `opendesk.ai-send-queue` · 0.1.13 · r12 |
| Page sourceHash | `c4c6e3418b2157700b0190e0e7bed119fd7042635d003984633b69d0577ea741` |
| Page packageHash | `43fec37e8bd8813612c06d4a87baed6273874f49f96c4ce46a8bc52342046a33` |
| Page 文件 SHA256 | `e68ead1a003446d750ea4d7061f7b6b524bddb282e5ef68c6486522875d87e85` |
| 安装 manifestHash | `b59b9bb4b6eb284526689abb66bc371b297b1fc20abdc99798e20ff3c27abd70` |
| production 包哈希 | `6a8301d7f72ec367c69ff1f21051073d947d4fa30031f290bef34caa5420f1d8` |
| production manifest SHA256 | `9ef66d7f7671d75d939c55e633f55df2ed08ed185e3bc1c4015dec32f5264192` |
| 本轮实际扩展 ID | `lcalikbobcjkennhhbjjbofghffonhnc` |

唯一正式 Tool JSON 为本目录 `ai-send-queue.opendesk-tool.json`。先重建本工具缺失的 dist，确认 JS/CSS 与已测快照相同，再以原打包器构建候选、逐字节比较原实装包、`--promote-from`、`--check-project`，结果为 `PROJECT_PACKAGE_MATCH`。没有手写包、改版本或新增公开目录条目。

production 实际路径为仓库下 `artifacts/ai-send-queue-r510/source-snapshot/dist/production`。它来自基线 `8687af923993192191a07b7a547fc2defa9ca4de` 加已记录修复；后续 main 导入/Stop 修复及并行预览改动未进入该冻结包。**它不是本次提交后完整 main 的重新构建结果。** 后续候选须按实际依赖变化冻结，不能冒用旧包身份。

## 复用验证、修改与 CI

复用未变输入的原始证据：产品/Bookmark/来源 222/222，最新 Bookmark/来源 29/29，Cookie 服务及来源 34/34，`npm run check` 1202 文件。Host 回归前后均为 28 PASS / 3 旧失败，admission 前后均为 29 PASS / 5 旧失败；没有把这些套件写成全绿，也未为旧 fixture 放宽产品校验。本轮新增真实操作证据独立保存，不重跑上述无变化测试。

接管并复核的修复：安装驱动记录真实 Mac/包/文档与截图；Host 抽取重复活读 guard 以保留原固定预算；删除已独立安装 Scroll Page 的旧特权输出豁免并对齐已有 Prompt pin；Cookie dispatch/navigation/cleanup 从入口共用原 exclusive 队列，防止旧 capture 在卸载清理后复活 Foundation snapshot。Cookie 保留用户批准的 Foundation 存储政策及只读旧密文，无新口令流程。独立 reviewer 静态复核未发现可行动缺陷；不把静态复核当原生发送证明。

[CI 40698534776](https://github.com/shopable-ai/opendesk-browser/actions/runs/40698534776) 已 completed / **failure**，对应旧提交 `910451ad649c5ce0ddd7f482f0d374de4c67b7ab`。29 项来源检查中一项失败：旧 Scroll `conversation.js` 的正向 pin fixture 已漂移；后续 MV3 构建和真实浏览器步骤 skipped。本轮已接管的删除旧豁免修复在该 CI 提交中不存在；尚无包含本轮提交的 CI PASS，不自动重跑旧提交制造新结果。

## 八维验收

| 维度（各满分 100，目标 ≥95） | 当前证据与缺口 | 得分 |
| --- | --- | --- |
| 原始目标 | 一份 Page 队列、两端源码与候选完整；真实主流程未通过 | NOT_SCORED |
| 发送调度 | 原引擎定向证据复用；真实 FIFO、跳过暂停、提前发送及回复确认未测 | NOT_TESTED |
| 可信身份 | 精确 Tool/USER_SCRIPT pin 与沙箱、伪造包/旧 Page 拒绝有证据；站点撤权未测 | NOT_SCORED |
| 真实同步 | 同一真实消息 ID、revision、双端状态变化尚未证明 | NOT_TESTED |
| React UI | 正式 React 19.2.0 沙箱实装；非空真实队列与专项交互未测 | NOT_SCORED |
| 安装生命周期 | 卸载/重装、独立身份、版本拒绝、提交前中断部分通过；活动队列升级/撤权仍缺证据 | NOT_SCORED |
| 构建资源 | 原 development/production 成功，Host 528224/527751 ≤528384；新完整 main 未冻结 | NOT_SCORED |
| Mac Chrome | 155 的 P1 与 154 的本轮 P3 有原生安装证据；P2/P4 未通过 | NOT_SCORED |

综合分为 **NOT_SCORED**。缺少可评估证据时不编造数字，也不以已测维度平均代替八维平均；取得全部数值后只计算 `(八维分数之和) / 8`。

## 原始证据和最短续接路径

证据根为仓库下 `artifacts/ai-send-queue-r510/`，Git 忽略，不将截图快照成堆提交。主要索引：

- `installed-mac-production-attempt4/result.json`：原 P1 精确安装、沙箱、重开、同 ID 拒绝。
- `mac-session.json`：原 P2 失败及 P3 卸载/重装证据。
- `resume-session.json`：本轮真实观察、r11 拒绝、旧 ID 独立安装与清理、提交前中断和 r12 恢复。
- `resume-chatgpt-challenge.png`、`r11-page-incompatible-native-panel.png`、`r12-restored-technical.png`：本轮实际页面截图。
- `ci-current-20261028.json`、`ci-jobs-current-20261028.json`、`ci-40698534776-job.log`：CI 真实结论及原始失败。
- `final-inputs-before-commit.json`：接管文件与冻结快照的字节对照，区分驱动、Host 和并行差量。

历史完整验收续接清单（本轮延期，不顺次执行）：原建议先在本 owner 的 02 正常完成站点验证并确认真实输入框/服务器会话；不自动重发旧未知消息。随后用真实长回复阻挡调度，在 Page 实际入队并逐条暂停，按 Page→Sidebar 的同 ID / revision、Sidebar 暂停→Page、Page 恢复→Sidebar 继续 P2，再补排序/编辑/删除/Stop、草稿/附件/IME、失联/刷新/撤权和活动队列升级。unknown 自然路径未出现时保留 NOT_TESTED。P4 需先能精确绑定自己的 Mac 窗口；不可绑定的物理宽度/触屏项保持 NOT_TESTED。站点与活动队列未验证前，官方 blocked 保持不变。

旧对话 goal 上次实读为 paused；本对话没有创建 goal，也没有修改旧 goal 状态。完成本地包晋升、提交或接续均不表示原始目标完成。
