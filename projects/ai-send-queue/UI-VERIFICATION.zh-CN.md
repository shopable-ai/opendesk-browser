# AI 消息发送队列 UI 验证（2026-11-10）

## 刷新后增强 UI 延迟目标（2026-11-13）

本轮继续处理原生 ChatGPT 输入区已可用、队列增强长时间不显示的问题。**安全恢复后，同一稳定候选的单页 5 次均 ≤2 秒，三页并发全部出现且 ≤8 秒；本轮没有再出现 20 秒缺失。** 原三页并发 ≤3 秒仍有两页 FAIL，历史缺失失败全部保留；不保证长期不复发。当前核心开发恢复与验证完成，未进入 production 或完整验收。来源对话 `01a1d0d8-ab7b-7572-8261-cfef6f806159` 移交时 goal 为 blocked，更早来源 goal 上次观察为用户主动 paused、此次未跨对话复核；本接管聊天 get_goal 为 null，未恢复、迁移或完成这些目标。

原因与后续规避统一记录在[扩展持续开发文档：网页增强启动延迟与不挂载](../../docs/framework/extension-development-r131.zh-CN.md#page-startup-delay-20261113)。其中区分已确认的全表读取冗余、过期请求准备和串行排队，以及存储关闭、开发更新和资源故障；存储关闭的最初诱因与长期可靠性仍未知。本报告保留真实时序、运行身份和全部历史失败，不能将一次恢复记为所有缺失原因均已根治。

### 本轮恢复与最终实测（2026-11-13）

原 ego TaskSpace 101 已不存在；获用户明确允许后，创建唯一替代 TaskSpace 119「AI 消息队列 UI 验证 20261113 续接」。用户又确认所有窗口空闲、草稿已保存，并允许一次整扩展重载。执行前新只读检查确认无活动 Controller、Native ledger 为空、8 项历史 Controller unknown 的资源已有精确退役回执，残留队列 preview 原文档已消失；于 `2026-11-13T08:59:25.604Z` 调用一次原 `chrome.runtime.reload()`。没有直写 slot、清除 unknown、伪造宿主 ACK 或重放业务；旧 preview 随原启动恢复流程释放。

环境仍是 `dist/development` 持续开发、原扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。并行「修复扩展更换安装包失败」任务负责 `src/platform/storage/{index,idb}.js` 的连接恢复并恢复 writer PID 19215；本任务未修改这些文件、启停服务或覆盖输出。新磁盘 141 项 SHA-256 全部匹配；实际 applied revision 为 `002532190cf3f368767e11019a6272ad85d6758821aecaca293400e28214ef3b`、SW `eb2fa28a255dbd01de84662e593beb15207a739c569be25d2199036eaad0aace`、BACKGROUND context `f8aabe81-9431-4018-90b2-d11557383e3c`。三项原 Page 注册均已包含新增诊断，矩阵前后及最终交互后身份一致。

| 当前候选的用户操作 | 实测与结论 |
| --- | --- |
| 单页真实刷新 5 次，每次 ≤2 秒 | 1.001 / 1.221 / 1.034 / 1.058 / 1.123 秒，5/5 PASS；均为可见文档，生命周期、队列区、皇冠各 1 |
| 三页并发，原 ≤3 秒 / 开发 ≤8 秒 | 1.173 / 3.473 / 4.691 秒；原门槛 1/3 PASS、开发门槛 3/3 PASS。页面开始导航的 timeOrigin 最大相差约 3.38 秒；第一页面记录 visible→hidden→visible，不能声称三页全程前台或同毫秒开始 |
| 皇冠及 Ctrl+Enter | 空草稿下分别实际操作，首条保护反馈可见，URL 保持首页、用户消息 0、草稿空，控件各 1；本轮未发送消息，未把空草稿操作冒充新的草稿保留/FIFO 验收 |
| 正常测试会话的三种增强 | 自动出现且生命周期各 1、回复入口无重复。队列距输入框约 0.357 秒；思维导图约 2.031 秒、滚动导航约 2.540 秒；后二者距原生回复操作栏分别约 1.230 / 1.739 秒 |
| 其他增强的实际操作 | 思维导图展开真实 XMind 画布，返回后 viewer=0、原文恢复；回复开头/末尾按钮均产生 isTrusted=true 点击和滚动位置变化，草稿空 |
| 当前文档执行回执 | 四个本任务文档中的三种 Page 共 12 条 completed，sourceHash 与原安装一致。队列仍为 r25 / 0.1.26，未升级并行 owner 的业务包 |

刷新窗口的新诊断记录过 `E_DOCUMENT_STALE`，当前目标文档均完成执行；没有为过期派发重试。最终只读状态的 8 项 Controller unknown 仍保留，Native ledger 为空；此时并行任务已安装鼠标手势并持有自己的 preview，本任务未操作它。TOC 的授权代数也由并行操作改变，不纳入本任务修改或验收。存储连接关闭的最初诱因仍未知，不能从本轮恢复推断永久根治。

复用原源码定向 Node 232/232 及诊断 150/150 证据，未因续接重复执行。此次新增脚本语法、定向 diff 检查与上述真实 UI 证据。自然冷启动、系统 Chrome、production、长期压力和正式评分均 NOT_TESTED。本轮证据为忽略目录下 `pre-recovery-idle-119.json`、`manual-reload-intent-119.json`、`post-recovery-runtime-119.json`、`recovery-ui-119.json`、`recovery-matrix-119.json`、`recovery-multi-119.json`、`recovery-interactions-119.json`、`recovery-final-identity-119.json` 及两张 `recovery-*-119.png`；截图含账户 UI，不提交。确认四个测试网页均空草稿、无回复进行中后，已通过原 `TaskSpace.finish({keep:[]})` 关闭本任务空间 119，回执成功，未关闭其他空间、writer 或 preview。具体 owner 与历史恢复断点见[续接工作记录](../../docs/framework/workstreams/page-startup-reliability-20261113.md)。

### 恢复前历史证据（保留原始失败）

计时从唯一可见且可编辑的原生输入框出现，到可见队列区域和可命中皇冠均出现；生命周期、区域、皇冠须各为一个。20 秒缺失判 FAIL。原生输入框未就绪、探针丢失和驱动异常单列；原始失败始终保留。样本记录 visibilityState，hidden→visible 不能当作纯前台证据。其他增强按自身真实功能条件检查：空白聊天不应显示思维导图或回复滚动按钮。

| 用户操作 / 条件 | 当前结果与边界 |
| --- | --- |
| 连续单页真实 reload，5 次均 ≤2 秒 | 基线 3/5 等待 20 秒无队列；第一候选 1.051 / 1.356 / 1.213 / 1.598 / 1.433 秒，第二候选 1.629 / 0.659 / 1.042 / 1.051 / 1.002 秒，各自 5/5 PASS。续接的三个正常会话样本为 1.454 / 1.737 / 1.610 秒，单实例 |
| 原三页并发，每页 ≤3 秒 | FAIL。基线 3.76 / 11.18 / 5.00 秒；第一候选 3.658 / 5.254 / 6.792 秒；第二候选 2.713 / 3.794 / 6.897 秒。保留原门槛与全部失败 |
| 并发开发门槛评估 | 暂以每页 ≤8 秒评估三页负载：三个已启用 Page 在三页触发九个共享串行启动，前两轮最大约 6.9 秒。只调整并发开发预算，单页 2 秒、20 秒缺失失败及安全约束不变；不声称原 3 秒目标达成。最新窗口结果见下文 |
| 皇冠及 Ctrl+Enter | 当前安装版均真实操作通过：首页首条保护反馈可见，测试草稿逐字保留，零消息发送；随后通过原输入框清除。截图中原生输入区、发送按钮与皇冠无重叠。不是仓库新版中性文案的安装证明 |
| 思维导图与滚动导航 | 三个正常会话样本均自动出现。思维导图真实点击后渲染 XMind 画布，返回后原文恢复、viewer 为 0；滚动导航真实按钮使滚动位置变化，底部按钮事件 isTrusted=true；草稿保持空。三种 Page 生命周期各为 1，每个回复操作栏无重复入口 |
| 原管理 UI 停用 / 恢复 / 新文档 | 实体 SIDE_PANEL 操作已完成。停用时遇旧代活文档清理 unknown，控件未能即时移除，恢复被 E_PAGE_CLEANUP_PENDING 正确拒绝。关闭本任务无草稿页后剩两张其他任务页面；获用户明确允许，逐页核对空草稿、零待发送、回复已结束后刷新。旧 UUID 均精确查询为 null，原观察入口自动转 retired；再从原侧栏恢复成功，新文档自动单实例挂载。未清 unknown、未重放清理、未直写安装记录 |
| 后台自然停止后唤醒 | NOT_TESTED；未观察到自然停止，不把开发重载或普通刷新冒充冷启动，不强杀 Worker 或停用他人服务 |
| 系统 Chrome / production / 完整矩阵 / 评分 | NOT_TESTED；本轮仅 ego 共享 Profile 的持续开发证据 |

历史实测运行环境为 ego TaskSpace 101，固定加载 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。原 watcher pid 35698 及恢复进程 80828 均已退出；后续只在确认无 writer 后通过原 `npm run dev` 恢复，pid 88367 曾初次编译完整成功并 RUNNING，此后已退出，没有第二 writer、独立全量构建或路径/ID/Native 配对替换。上述 UI 样本的运行 SW SHA-256 为 `3a011f20456d852c14e7ebe9bd6ff78ffdf22cda9213a92d6f4d5a2c13994fc5`。applied 与磁盘曾多次一致；并行可信 UI 更新会改变总 revision 并安全重载 Worker，即使 SW 字节未变，也必须区分运行窗口。诊断新源码已编译，但截至下述存储诊断时仍未加载，不把磁盘新产物当作运行证明。

| 实际安装 Page | revision | sourceHash | 本轮状态 |
| --- | --- | --- | --- |
| app.ai-send-queue | 25（0.1.26） | ab795b7ab732faf6e597c2050ad941772413d9f4349377df17c32102e650175b | 原 UI 恢复后 enabled / active / registered；正式安装同步生成新 installationId，未替换业务版本 |
| opendesk.ai-reply-mindmap | 5 | 1e82bb337f5f9ffec776b8752e2af5e2487586d176e97c970ae69bf2788a14a4 | enabled / active / registered |
| opendesk.ai-scroll-navigation | 20261112（历史 0.4.14） | 7992b0f3bbc98df0bcdbee9903c13978363b816a289db49f3b9ee91d1f553aa2 | enabled / active / registered；按实际回复顶部/底部按钮测试，不冒称仓库新版 Dock 已安装 |

Reading TOC 原本停用且清理 unknown，本轮未启用或更改。可信 Prompt Shortcuts 在真实页面出现唯一工具栏；这项存在证据不替代其完整功能验收。未更新并行 owner 的队列业务源码、正式 JSON 或版本。

三个正常会话样本中，思维导图相对原生输入框为 3.340 / 4.017 / 3.699 秒，相对原生回复操作栏可用约 2.572 / 3.175 / 2.790 秒；滚动导航分别为 3.799 / 4.587 / 4.226 秒及 3.031 / 3.745 / 3.316 秒。不能把队列输入框起点和 2 秒门槛套给等待实际回复、操作栏及稳定正文的增强。思维导图每条回复一个按钮，不要求全页只有一个。

失败分类：`ui-multi-enhancement.json` 第 4、5 个样本保留原始 UI_DEADLINE；后续实际页面显示“无法加载此 ChatGPT 对话”，原输入框消失，三种隐藏生命周期已存在且执行 completed/evaluated，因此单列为网站会话加载失败，不凑成 5 个有效增强成功样本。p17 的 Page.getFrameTree 无响应单列 renderer/驱动异常。

一个恢复窗口中三页均挂载，延迟为 2.199 / 4.441 / 5.842 秒，生命周期、区域、皇冠各为 1；原 3 秒门槛仍有两页 FAIL。原报告写入遇 ENOSPC，随后从同一文档探针恢复数据至 `ui-concurrent-window.json`，未重新测试；前置指纹未保存，因此不声称该轮前后 Worker 身份相同。磁盘余量在约 160 MiB 附近波动，ENOSPC 原失败保留。

随后 `ui-concurrent-final.json` 记录到更明确的失败：前后 applied revision、SW 哈希及 BACKGROUND contextId 均相同，三个原生输入框正常，但三页均等待 20 秒无队列。原生只读探针确认三页的九个安装引导标记均存在，注册 token 与安装身份匹配（`stable-missing-markers.json`）。这不能归因于整个 Worker 被替换，暂定 8 秒预算也不能把缺失判为通过；仍须定位派发前拒绝。已补充 bootstrap 的失败响应码日志，不重试或重新执行。对应 Node 首轮 141/150 PASS、9 项因 ENOSPC 无法写 fixture；清理可重新下载的 npm 内容缓存后原命令 150/150 PASS。开发服务已退出，确认无 writer 后通过原入口恢复，诊断运行证据待补。

最新原侧栏实际报 `Storage connection closed`，开发状态显示自动刷新延后。`runtime-storage-diagnosis.json` 证明同一原 v2 数据库可由新只读连接读取：当前 Controller run 为 null、Native ledger 为空；八个历史 Controller unknown 均有终态 stopped、workerRetired/released 及 releaseCount=1 的精确 retirement 回执，记录未更改。残留 preview 属本任务 p29 旧队列文档 `03C4B517422A393E02C69F9C604AF66F`，原生精确查询为 null；不是其他任务活跃执行。原 `recoverExecutions` 可在后台重新启动时保留 outcome-unknown 并仅按原文档消失释放预约，本轮未直写 slot。旧 broker 的 storage 引用一旦关闭就持续拒绝新事务；连接关闭由何事触发尚未知，ENOSPC 只是候选诱因。独立架构只读审查支持先保留现场，不将其扩大成自动重连或失败事务重放补丁。整个扩展的恢复会影响其他活工具宿主，另行请求用户授权并继续保护草稿；两张业务网页的刷新授权不扩展到该操作。

续跑核对：pid 80828 又因 V8 heap out of memory 退出，原进程回执 exit 134，日志保留。确认 writer 不存在且本机内存充足后，仅对新进程临时设 `NODE_OPTIONS=--max-old-space-size=8192`，通过原入口启动 pid 85910；未修改全局配置。该次编译未再遇 OOM，但在 tool-shell 触发 `Trusted AI Proxy source changed; review and re-pin: projects/ai-proxy/src/ui/ProxyEntry.tsx`，exit 1 并正常释放服务。原始回执在 `dev-diagnostic-recovery.log` 与 `dev-diagnostic-recovery-8g.log`。失败后的磁盘输出未用作新候选；本轮未覆盖并行 owner 的源码或 source-lock，也未放宽来源检查。

随后该 owner 的来源记录更新，原只读 `verifyTrustedAIProxySources` 核验 PASS。构建依据变化后，用同一临时 8 GiB 参数从原入口重试，pid 88367 曾完整编译成功、当时进程仍在，此后已退出；日志为 `dev-diagnostic-recovery-8g-retry.log`，尾部后来出现 `ProxyEditor.tsx` 来源 pin 失败。初次成功产物 revision 为 `44cc653eef1a500df91fcbe4f68d6d15df36b6630c11e873c8717586324bf9ea`，磁盘 SW SHA-256 为 `9e4a4871bb66629f123451459336469b8c3cc8e02e6ae37956b2ccbd850f44d4`。这只证明当次编译及当时服务存活，不证明长期内存问题已修复。浏览器最后实读仍为上述旧 SW/context，三项注册均未包含新增诊断；整扩展安全重载授权仍待答复，最新磁盘候选见顶部接管核对，尚无新运行证据。

另外两轮并发组出现 3 张、2 张原生输入框正常但 20 秒无队列，仍保留真实增强缺失 FAIL。同期诊断扩展页被关闭，前后后台 contextId 与 applied revision 改变，SW 哈希相同；这证明测试窗口有扩展重载，不能宣称同一稳定运行窗口全通过，也不能仅凭源码推断每条失败必为 E_DEV_RELOADING。`src/sw.js` 在开发更新 held 期间明确拒绝自动派发，现有开发合同要求固定脚本重载后刷新原网页；本轮未放宽或自动重放该栅栏。

源码修复沿用原 Page Authority：以既有主键前缀游标只读 installed/execution 元数据，避免克隆整个 frameworkKV 冻结源码；过期文档先拒绝，再读取源码和探测原生执行世界。保留授权、安装身份、配额、三项原生探测、unknown 与清理保护。只读诊断表明剩余并发延迟主要发生在共享串行启动准备，未以并发化执行或跨启动缓存换取测试通过。已有最终定向 Node 232/232 PASS，未改对应源码后不重复执行；新 UI 证据另列，不累加测试数量。

本机忽略目录 `artifacts/ai-send-queue/startup-20261113/` 保留两组候选、原始执行计时、`ui-multi-enhancement.json`、`interaction-current.json/png`、`representative-mindmap.png`、`representative-scroll.json`、`disable-cleanup-diagnosis.json`、`final-identity.json`、各轮 `ui-concurrent-*.json`、`stable-missing-markers.json` 及 `runtime-storage-diagnosis.json`。截图含账户界面，不提交。测量仅观察 DOM，不临时注入产品实现或发送消息。磁盘曾仅约 162 MiB 可用；清理约 336 MiB npm 内容缓存后约 450 MiB，保留 ENOSPC 原失败，不删除其他任务产物。

## 0.1.26 已安装 UI 与核心发送闭环

本轮解决「装好后侧栏只有两段说明，无法判断网页模块是否运行」的问题，补上公开 `page.request` / `OpenDeskAppPage.onRequest` 的只读 `queue.status`。业务仍由唯一 Page 队列执行；没有源码临时挂载、测试 UI owner 或第二个发送器。目标与使用方式见 [README 当前记录](README.zh-CN.md)。

| 最终身份 | 实际值 |
| --- | --- |
| 唯一正式文件 | `ai-send-queue.opendesk-tool.json` |
| Tool / Page 版本、修订 | `0.1.26` / `0.1.26`，revision `25` |
| Tool / Page ID | `ai-send-queue` / `app.ai-send-queue` |
| 字节数 | 136624 |
| 文件 SHA-256 | `bbf37b93aaf10d721436bbb60f3a22543386e227f2f1e0d0568d31aedef8c7a7` |
| Page sourceHash | `ab795b7ab732faf6e597c2050ad941772413d9f4349377df17c32102e650175b` |
| 安装与当前运行 | 安装完整对象与正式 JSON 深比较相同；enabled / authorization active / nativeState registered；最终回执 completed / managed lifecycle evaluated，revision/sourceHash 匹配 |

环境为 ego TaskSpace 66，既有扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。使用原实体 Side Panel 的安装、管理及真实沙箱 UI；面板视口为便于操作设为 420×900，未改变产品源码或执行世界。TaskSpace 共用 Profile，不能作为 Cookie 或权限隔离证明。没有启动/重建 Browser，没有替换日常加载目录或 Native 配对，也没有操作其他任务的 watcher。普通队列和项目队列测试均使用本任务新建的测试会话。

| 实际用户操作 | 最终结果与证据边界 |
| --- | --- |
| 原安装审阅更新单包 | PASS；`0.1.25 → 0.1.26`、权限未变化。清理未知后先核对旧文档，再使用同包「核对并恢复网页模块」；成功反馈可见，没有直写存储冒充安装 |
| `/`、`/c/<id>`、项目首页、带项目 slug 的 `/g/g-p-…/c/<id>` | PASS；最终包四类真实入口各只有一个生命周期、皇冠、队列区域；有/无会话的空状态正确 |
| 首页与项目首页的首条保护 | PASS；最终包分别通过 Ctrl+Enter 和皇冠测试，原草稿逐字保留、零队列项。首条真实原生发送并进入新对话另外在 0.1.25 完成，未将其冒充最终版本的新首条发送 |
| 项目首页点击本任务对话链接 | PASS；timeOrigin 保持相同，是真实 SPA 切换；新输入框和按钮出现后仍只有一套队列控件 |
| 皇冠与 Ctrl+Enter | PASS；0.1.25 的普通对话分别真实入队/入站一次；最终包 Ctrl+Enter 首条保护和皇冠双条入队再次验证，快捷键处理未改 |
| 最终包两条同时排队、暂停/恢复、FIFO | PASS；A26/B26 都先显示为暂停行；恢复后先 A26，再等 A26 回复 complete 后提交 B26。两条用户消息各一次，B26 回复 complete 后无 stop、无草稿、无队列行、无 unknown |
| 侧栏手动检查与切页后重新检查 | PASS；最终安装 UI 分别显示「当前目标不可用」「当前目标不支持」「请先发送首条消息」「网页队列已就绪」；后两者显示 Page 0.1.26。无自动轮询、无消息正文、无逐条操作 |
| 主动停用应用 | PASS；原管理菜单反馈已停用；当前页生命周期、皇冠与队列区域均为零，草稿为空；未通过快捷键尝试原生发送 |
| 恢复应用并进入新文档 | PASS；原管理入口恢复后，新文档单实例重新运行，侧栏返回 ready / 0.1.26，当前执行 completed/evaluated |
| 恢复后的旧文档即时重挂 | NOT_CONFIRMED；旧页未即时重挂，一次刷新后也未拿到新执行回执；切到另一新文档后正常。未将注册标记直接算作当前页运行成功，未扩大修复框架 |
| 系统中文 IME、休眠/压力、完整撤权/卸载矩阵、production、评分 | NOT_TESTED；当前开发阶段之外，历史证据不升级为本候选正式验收 |

最终 FIFO trace（UTC，2026-11-10）：A26 入站 `15:44:57.268`，其回复 complete `15:45:00.418`；B26 原文准备 `15:45:02.994`，入站 `15:45:03.762`，回复 complete `15:45:09.351`。采样没有替代网站回执，只记录真实可见 DOM；各精确正文在本轮测试对话计数为 1。最终包没有复现 0.1.21 的末项 unknown；历史精确节点保护保持原样，不能据此声称所有虚拟化情况已解决。

安装阻塞处理：最初发现旧 r20 的 18 个文档中仅空间 53 指定项目首页仍存活；用户明确允许检查、空闲后刷新。检查确认无草稿、队列缓存或正在回复后才刷新并交还控制。0.1.26 更新时只刷新本任务无草稿/缓存/回复的旧测试文档，确认 r24 活文档为零后使用原恢复入口。所有 unknown 都按原栅栏核对，没有自动重试发送或伪造清理凭据。

定向检查：`page-status`、`sidebar-status`、`sidebar-contract`、`view` 共 68 PASS；最终候选 `package` / `identity` 共 10 PASS。此前 main 恢复/快捷键组合的 145 PASS 证据用于未变行为，不累计成新的全测分数。独立复审发现检查异常被误报输入框未就绪，已改成固定 `E_QUEUE_STATUS_INSPECT` / `E_QUEUE_STATUS_LAYOUT` 错误，补了两个不泄露异常正文的回归。React 预编译、语法、diff、候选晋升及正式包 `--check-project` 通过；未运行全仓测试。

本机忽略目录 `artifacts/installed-ui-20261110/` 保留 `final-routes.json`、`final-fifo.json`、`final-sidebar-states.json`、`final-fifo-two.png`、`final-fifo-result.png` 和 `final-sidebar-ready.png`。无 `final-` 前缀的文件包含中间 0.1.25 诊断，不混写为最终候选。原截图可能含账户 UI，不提交。菜单最初被驱动的延迟 scroll 事件收起，先修正驱动滚动后正常操作；未为此修改有效产品行为。

## 0.1.24 新聊天与项目入口（历史）

本轮只修复新聊天区域发现与状态展示，不实现首条自动发送或临时会话队列。目标与关键条件以 [README 对应章节](README.zh-CN.md#新聊天与项目入口2026-11-10) 为准。普通已有对话及项目已有对话继续以 `c/<id>` 绑定；首条前区域可见，皇冠与 Ctrl + Enter 提示先原生发送并保留草稿。

| 检查 | 结果与限制 |
| --- | --- |
| Site + main/Site/Engine 组合 | 163 PASS；四类入口、项目 slug、身份未建立时拒绝写入/发送/确认、首条后状态切换及旧队列不跨聊天 |
| Engine + View | 149 PASS；FIFO/unknown/草稿保护、重复挂载、空区域状态、旧队列切新页隐藏并返回恢复、替换输入框、布局及销毁 |
| main 恢复/生命周期 | 76 PASS；原轮询、异常与停止保护保持 |
| 候选包、安装身份与缓存 | 24 PASS；最终版本元数据另经相同包/身份 9 项检查；没有将重复执行累加到 412 项总数 |
| 普通新聊天真实 DOM 源码挂载 | PASS；区域 716×20、皇冠 34×34，重复 place 成功且只有两处视图 host；点击反馈正确，原生输入保持空 |
| 项目新聊天真实 DOM 源码挂载 | PASS；区域 580×20、皇冠 34×34，连续三次 place 均成功；真实点击后「队列显示检查（不发送）」草稿逐字保留，截图无输入/原生按钮遮挡 |
| 当前新版安装与 USER_SCRIPT 运行 | NOT_TESTED；原生界面控制启动超时，没有更新安装对象或绕过原安装审阅 |
| 真实首条发送后的排队、完整撤权、production、评分 | NOT_TESTED；没有向 ChatGPT 发送测试消息，本轮不扩展这些验收 |

真实网页诊断使用 ego TaskSpace 62、新建标签页和真实 ChatGPT DOM，运行原 Site/View/Engine 源码及测试 UI owner；它不是已安装的 SDK owner/USER_SCRIPT。诊断没有驱动引擎 tick、清空原生草稿或点击发送；自有测试草稿经普通编辑清除，临时 host 已销毁，TaskSpace 62 已关闭。截图和采样保存在本机忽略目录 `artifacts/routes-20261110/`；普通/项目新页各有 `*-source.json` 与 composer 局部 PNG。已有项目页也只读观察到旧安装的区域正常显示，没有读取或操作原聊天内容。

最终单包为 **0.1.24 / 内嵌修订 23**，129564 字节，SHA-256 `400cdfc9648cc31beed5287e6e2d95da8492cc77ec2c68238cd994ec581135c6`，Page sourceHash `de15927a4dc2e29fc1fdd126482feba9b9762d8f9cd2616ed11fc68211e6cd56`。由原打包器从最终源码生成候选，包/身份检查后晋升并完成逐字节 `--check-project`；没有重编 Browser、替换加载目录、变更权限或配对。状态 **PACKAGE_READY_INSTALL_NOT_TESTED**。

以下为 **0.1.21 历史记录**，不作为 0.1.24 或 0.1.26 的安装、发送或完整闭环证据。

本轮为开发阶段验证。业务、资源、测试和唯一正式 JSON 继续归本目录；未修改 Browser 固定源码、启动第二个 watcher、全量构建 Browser 或更换 Native 配对。测试使用 ego 既有扩展及 TaskSpace 55，只在本轮新建的 ChatGPT 测试会话操作。

## 正式交付身份

| 项目 | 本轮结果 |
| --- | --- |
| 唯一安装文件 | `ai-send-queue.opendesk-tool.json` |
| 产品版本 | Tool 与内嵌 Page 均为 `0.1.21` |
| 内部修订号 | `20`，不是第二个产品版本或独立安装目标 |
| Tool / Page ID | `ai-send-queue` / `app.ai-send-queue` |
| 字节数 | 128826 |
| 文件 SHA-256 | `d440d27d821990faae598ab16cee398a6f4114f1a9b2671681373ae20c0c9c49` |
| Page sourceHash | `3ae29003f6530f9271d70fb1f3535a3f222eb467d8a764a0f13e9945a9d8d65d` |

安装通过「扩展 → 导入扩展」原审阅：界面显示 `当前 v0.1.20 → 新 v0.1.21`、权限未变化及上述候选 SHA。确认后，只读取本工具的已安装对象，与正式 JSON 做完整深比较，全部字段一致。新文档只有一个 `app.ai-send-queue.lifecycle`；历史命名的 `.list` / `.button` 是视图标记，不是额外发送器。未读回独立 Page Authority 完整安装回执，不将此结果升级为全部安装/撤权合同验收。

## 实际操作结果

| 操作 | 状态 | 证据与范围 |
| --- | --- | --- |
| 单 JSON 安装、更新及完整安装对象读回 | PASS | ego 扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；安装对象与正式 `0.1.21` 一致；没有另导入 Page |
| 打开工具说明页 | PASS | 原应用页中的真实沙箱 iframe 仅显示网页使用说明，不显示或读取队列；不等于实体 Side Panel 关开验收 |
| 皇冠、Ctrl + Enter 入队 | PASS | 实际输入框、可信键盘及可见队列行；`0.1.21` 再次验证快捷键和皇冠；入站前被拒绝的草稿保留，核对状态后才再次操作 |
| 普通 Enter、Shift + Enter | PASS | `0.1.20` 真实原生发送和换行；`0.1.21` 未修改键盘处理代码；没有把驱动定位失败计为通过 |
| 两条 FIFO 顺序、回复门禁、暂停与恢复 | PASS | `0.1.20` 忙时 C/D 各入站一次且清队；`0.1.21` 两条先暂停、再依次恢复，A 回复完成后 B 才发送，两条各入站一次 |
| 最终包双条发送后的完整自动确认与清队 | FAIL | `0.1.21` 第二条正文完全匹配且回复已完成，但历史用户节点发生变化，确认超时后保留 unknown。未自动重发，不能写成最终包完整 FIFO 闭环通过 |
| 三条以上展开/收起及 Alt + 上下排序 | PASS | `0.1.20` 真实五项队列；暂停一项，上移再下移，恢复原顺序后继续；源码未变 |
| 多行原文、刷新暂停及 unknown 保留 | PASS | `0.1.20` 刷新前后原文与 ID 顺序逐项一致，普通 queued 变 paused，unknown 仍 unknown；升级并刷新 `0.1.21` 后三条缓存仍暂停，没有自动发送 |
| 更多菜单 → 取回编辑 | FAIL → PASS | `0.1.20` 的文字按钮只有 29px，标签重叠并拦截点击；临时修正验证后，正式 CSS 仅调整规则顺序。`0.1.21` 实测宽度为 97/97/65px，点击后原文进入原生输入框，原队列项移除 |
| 长文原生输入框滚动 | PASS | `0.1.21` 原生输入框中 18 行、DOM 文本 2421 字符；滚动容器高度 187、内容高度 1903，scrollTop 从 0 到 627.5，前后正文相同；未改写输入框尺寸 |
| 删除/已确认项不因刷新复活 | PASS | 本轮自有测试项删除或精确入站后缓存为空，再刷新仍为空；没有改写内部队列或 sessionStorage 制造状态 |
| 不确定结果不自动重发 | PASS | 网站裁掉边缘空白时拒绝精确入站确认；草稿/历史变化时保留 unknown 与原文。只备份并显式删除本轮测试数据，没有自动重试 |
| 系统中文 IME、其他输入框、实体 Side Panel 关开 | NOT_TESTED | 本轮未取得对应原生操作证据，不用合成事件或应用页冒充 |
| 日常 Chrome 旧独立 Page 卸载 | NOT_TESTED | 上次观察仍有同名 Tool 与旧 Page 两项；桌面 UI 锁由其他任务持有，未核对旧页草稿/unknown，不卸载、不强抢、不刷新用户旧页 |
| production、完整撤权/安装回执、系统休眠与评分 | NOT_TESTED | 当前开发阶段之外 |

忙时测试中曾在原生提交后立刻连入 A/B，历史/草稿交接变化触发 unknown。该结果如实保留；没有证据将其归因于某个历史匹配分支，也没有放宽身份或正文确认来制造 PASS。待原生页面稳定后排入 C/D，实际 FIFO 成功。初次网页输入驱动对长文超时、短暂重排或 stale ref 的失败均先读取现场，未盲目重复发送。

最终 `0.1.21` 双条 trace 先记录两项均 queued；A 开始发送 `1794302702506`，A 回复 complete `1794302707007`，B 开始发送 `1794302709614`。A/B 用户正文计数各一。B 最终警示为「历史用户消息节点已变化；未能确认用户消息入站，禁止重复点击」；当前正文逐字相同，不能替代发送前节点链证据。仅凭现场不能判断是网站重建、虚拟化的何种节点变化，故未削弱匹配保护。本轮自有 unknown 原文和 trace 已备份后显式删除，不重试发送；该限制仍是后续最小诊断点。

## 清理、版本及验证

仓库当前已没有独立 Page 正式 JSON、无消费者的旧编译包或独立 Page 官方发行入口，本轮没有再次制造删除 diff。`src/page/` 及其资源是正式 Tool 内嵌模块的必需源码；legacy 生命周期避让、回归夹具和有真实历史消费者的脚本保留。日常 Chrome 的旧安装记录与仓库源文件清理分别报告。

两个交付脚本移除硬编码的 `0.1.18` / 内部修订号 17，改从候选或项目配置交叉核对真实版本。旧原生驱动仍明确输出 `NOT_TESTED`，不因改用新版本元数据而宣称安装测试通过。

本轮 CSS、包身份与 legacy 避让的定向检查：`view.test.mjs`、`package.test.mjs`、`identity.test.mjs`，40 PASS / 0 FAIL。先用原 `stage-react-candidate.mjs` 调用唯一打包器生成临时候选，以 `SEND_QUEUE_PACKAGE_PATH` 指向该候选执行测试，通过后由 `build-sidebar-tool.mjs --promote-from` 晋升，并完成 `--check-project`。脚本语法、候选元数据报告与 diff 检查通过；没有重复全工具或全仓测试。

原始截图、缓存备份与定向 DOM 采样仅存于本机忽略目录 `artifacts/ui-20261110/`，不提交包含账户侧栏的原始页面快照。测试会话为本轮新建会话；用户原有业务对话、旧队列、既有服务和其他任务文件均保留。
