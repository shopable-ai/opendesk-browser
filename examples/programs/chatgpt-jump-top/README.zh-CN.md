# AI 对话滚动导航 · AI Chat Scroll Navigation

## 最新真实 UI 核心完成（2026-10-27，0.4.7/r11）

**本次测试 Profile 的核心操作已完成。** 在 Mac 有窗口 CFT 154 的独立持久 `test-chatgpt-01` 中，经原 Installer 安装并读回相同 r11 字节，真实点击验证 ChatGPT 导航与提示词浮动栏同为根节点子元素、左边距均为 349px，正常窗口内互不重叠；整段对话回顶与到底及边界禁用可用。当前 R134 宿主的稳定回顶位置为 `0.5`，最大值 `7917`；首次加载后的内容展开曾改变位置，未把该中间读数当成回顶成功。回复操作组起始边距为 `0px`、`justify-content:flex-start`；真实回复回顶可见首节，末端按钮点击后可见末节（不单独归因额外滚动距离），原生「更多操作」可打开。

实测修复了两个业务问题：透明侧栏父元素中的按钮被误算为障碍，导致导航隐藏；关闭 Shadow DOM 的提示词栏未预留位置，导致重叠。现在过滤不可见祖先，检查公开 Shadow DOM 与根级固定宿主的可见矩形，并沿同一左边距寻找空位；不读取其他工具私有内容，不修改宿主或 SDK。

本地 `http://127.0.0.1:43111/demo-form.html` 已完成：可视选择区域 `main > div > div` 和滚动容器 `html` → 消息 `.unit`、路径 `/demo-form.html` → 双向测试 →「已保存并从可信 Host 确认」→ 刷新恢复双按钮及边界状态 → 停用后「原生注销已确认」且网页入口移除 → 恢复、刷新并从可信 Host 读回同一条配置。最终 r11 安装身份为 `db7f5f7f-6d9e-4061-a307-a262fbe03555`，授权 active、Chrome registered、清理 retired。允许的 UI 不显示 ETag，故数值 ETag 保留 `NOT_TESTED`。

测试复用既有 R134 production 静态快照 `/private/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-r134-r7-inputs-pnfhgxbr/dist/production`，扩展 ID `jebmpompeddppmefggjeffhldlkhkkdo`，无 serve 连接；这是独立测试宿主，不代表当前 main 扩展的完整 production 验收。此前 Send Queue 静态快照缺少配置桥接，改用已有 R134 快照后完成本地链路，未为环境差异修改平台。测试结束已正常关闭自有浏览器、释放 Profile 和 UI 锁，保留登录态与规则；没有发送 ChatGPT 消息。

r11 sourceHash 为 `05a3108f3a6b1afefb470e796c98b45f0f9cd08f586a97ea6d98ea3503517e6e`，packageHash 为 `d14640c5df41c003e286a69a940b2dbfe5a68607305afa6df8a79dcf616a1c66`，五个业务模块与当前源码及构建记录逐字节一致。受影响的 89 项定向检查通过；透明父元素用例进一步限定为可见侧栏后，9 项布局检查再次通过。源码与测试改动留在 main 工作区，未提交或推送；目录正式 r7 包未覆盖，日常安装清理问题未在本轮处理，DeepSeek/Gemini 长对话、正式发行、评分及尺寸矩阵不属于此次核心完成声明。

证据：[最新结果与截图索引](../../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/result.json)、[r11 测试候选](../../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r11/ai-scroll-navigation.opendesk-page.json)、[ChatGPT 实际布局](../../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r11-r134-chatgpt-top-final.png)、[恢复后的配置](../../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r11-restored-config.png)。下文均保留为历史观察，不覆盖本节最新结果。

## 历史：指定测试 Profile 实测中断（2026-10-27，首次 r9 未安装）

本轮已取得并释放自身 UI 锁，经 CUA 精确选择 CFT 154 进程 PID 54791，新建本任务窗口；`chrome://version` 实读为 `test-chatgpt-profile` 对应的 `codex-cft-xjma6yw1/Profile 1`。Chrome 扩展详情实读 ID `ajjjgoapcaonglplhlnlfofmlemdakhk`，实际加载 Send Queue 静态开发快照 `artifacts/send-queue-r56-mac-final-01a17882/source-snapshot/dist/development-developer`，用户脚本已允许；未验证 serve 连接。原导航安装 ID `dc776e10-cce8-4dd3-a829-94283e9417de`、r7、active / registered、清理 retired，与日常安装分开。

从当前业务源码用原 Program Builder 和 Page 打包器冻结独立 **0.4.7/r9**，保留指定六条精确匹配。sourceHash 为 `9fc66673189bca2f39141eb3f21f4f384a09dfefe13d5ea9c67e70c75b4cb883`，packageHash 为 `68784ccd790dabc3d44638ae83e3f6271d7e04b7bfb640618dfec4b807c72c9a`；全部五个业务模块逐字节对应当前源码。旧 r8 继续不适用，目录正式 r7 包保持原字节。

已只读打开指定既有长对话，看到真实提示词快捷按钮和旧导航，并进入原「更新 / 导入新版」文件选择器。**选择器尚未完成、未进入 r9 审阅时，CUA 返回 `App quit`；进程检查确认 PID 54791 及其目录对应进程已退出。退出原因未确定，不据此认定脚本产品故障。** 按交接明确限制没有重启、替换 Profile 或强抢其他窗口。r9 未安装，最新左对齐、上下滚动、边界禁用、回复组、本地适配、可信保存、刷新及停用恢复全部仍 `NOT_TESTED`；本轮不重复已有 Node 测试，也不声称 UI 测试完成。

历史候选与来源：[首次中断证据](../../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/interrupted-result.json)、[历史 r9 候选](../../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r9/ai-scroll-navigation.opendesk-page.json)。后续需先在获准恢复的同 Profile 读回真实安装状态，再复用此不可变 r9 走正常审阅和核心 UI 链；日常清理阻塞、production、发行及评分仍单独延期。本轮未改业务、平台源码或共享服务，未提交或推送。

## 父容器左对齐修正（2026-10-27，源码完成、安装未验证）

按最新要求，置顶/置底导航与提示词快捷按钮的浮动宿主同为 `document.documentElement` 的子节点，使用相同的主区域左侧 8px 边距，不再额外叠加提示词栏的 1px 边框和 6px 内边距。320px 左侧导航占位场景中，导航宿主从上轮的 335px 修正为 328px；碰撞避让只沿该左边距向上移动。独立安装不依赖提示词工具的 DOM、安装或启用状态。

回复操作区 `span[data-opendesk-chatgpt-answer-tools]` 取消起始侧自动边距，改为起始侧 0、末尾侧 auto，内部按钮靠左排列；复用已有右对齐组时也会修正布局，保留原生操作和独立 Mind Map 宿主。改动只涉及本项目业务源码和定向测试，上下滚动及边界禁用通过相关检查。

修复前 7 项相关用例失败，修复后 `node --test --test-reporter=dot examples/programs/chatgpt-jump-top/tests/floating-navigation.test.mjs tests/environment/chatgpt-jump-top.test.mjs` 共 86 项通过，两个修改模块语法检查通过。原生 UI 锁仍由其他 owner 持有，本轮未取得锁、未操作浏览器，也未刷新可信状态；上轮的停用及 `managedCleanup=unknown` 只是最后已知安装状态。本轮真实对齐、安装、网站适配、可信保存和刷新恢复仍 `NOT_TESTED`。

**下文旧 0.4.7/r8 候选已不对应本次源码，不可作为本次修复包导入。** 保留旧候选及其历史哈希，不重建扩展、不覆盖 watcher；后续只有正常可信状态实际变为 retired 后，才从最新源码通过原 Builder 生成新的不可变 Revision、保留已批准六条范围，并走原 Installer 同身份更新。原正式 JSON 仍为 0.4.6/r7。本轮证据记录在既有 dev JSON 和 R134 台账的 `parentContainerAlignmentCorrection`。

## 上轮左边距修复与安装阻塞（历史记录）

**源码已修复，新版尚未安装（`SOURCE_FIXED_UPDATE_BLOCKED_MANAGED_CLEANUP`）。** 本轮已取得并释放原生 UI 锁，在日常 Chrome 的既有 ChatGPT 内容截图中再次复现旧导航偏右。DOM 矩形驱动超时，未将截图估读或定向测试当作新版原生通过。源码改为按可见主区域、原生导航占位及完整对话列定位，并计入提示词按钮的物理内边距；不依赖提示词工具 DOM 或启用状态。自定义锚点、其他站点、单实例、可信点击及清理合同保持。

此前定向检查已复现旧算法 `598px` 对比目标 `335px` 的偏移，修复后 109 项受影响检查通过；本轮没有重复源码测试。三站基候选 **0.4.7/r8** 的 sourceHash 为 `361aa36fb1a18799a8c5143a04cf782ab77f8c554e651e9c558bf459e2b974b4`，未安装。为保留当前已批准的本地范围，本轮从相同业务源码快照经原 Program Builder 生成临时日常候选 `artifacts/ai-scroll-r134/dev-left-alignment-20261027/daily-r8/ai-scroll-navigation.opendesk-page.json`，只补入已批准的三条本地精确匹配；sourceHash 为 `84f8ba1795b0233e3b42f2f7430a5c5bdba1ad9532887ed4cd7c438e43192861`，packageHash 为 `8414db7c010288b570ce508f98990429b4e30fd60325383a532fa029d22d6f4d`。包与构建字节、当前源码模块逐项一致；仓库正式包仍为 0.4.6/r7。

原「更新 / 导入新版」已显示**网站权限范围未变化**，完整保留三站及 `http://127.0.0.1:43111/demo-form.html`、`?*`、`/*` 六条执行匹配。但确认更新返回 `E_PAGE_CLEANUP_PENDING`：旧安装 `managedCleanup=unknown`，不能覆盖恢复记录。此未知态在更新前已存在。正常详情停用移除了当前文档的导航、回复按钮及网站适配入口；恢复同样被清理栅栏拒绝。结束本聊天旧测试文档后，可信刷新仍为 unknown。**当前原安装仍是 r1978225210，原 installationId `0f356e39-c6a2-4694-81e7-18ce3dbc2e1d` 和范围保留，授权及 Chrome 注册均为 disabled；没有安装 r8，未强制恢复、卸载、清空账本或修改 Authority。** 其他聊天窗口未动，配置未写入。

日常扩展 ID 实读为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，Chrome 详情的实际加载来源已核对为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`；「调试 → 本地开发服务」已连接，构建指纹 `342c19166d67c722a19754ef539027686c1d0d55d12120d2de340221f8feb371`。未构建或重载扩展、未覆盖共享 watcher。本聊天续接入口为 windowId `560068656` / tabId `560068665` 的本地 demo；旧窗口中本任务三个标签及本任务原单页已正常关闭，均可按原 URL 重开。

下一步只读核对原安装清理是否已由真实文档退出变为 retired；unknown 不变时不重复更新、启停、测试或构建。解除后才按原 Installer 更新同一身份并恢复，再核对真实对齐/上下滚动 → 本地可视选择主区域和实际容器 → 双向测试、可信保存读回、刷新和边界禁用 → 正常停用清理与恢复。配置/ETag 保留仍 `NOT_TESTED`；ETag 无允许入口时如实保留未验证。原始记录及截图见 [本轮 dev 证据](../../../artifacts/ai-scroll-r134/dev-left-alignment-20261027/dev-result.json) 和 R134 台账 `leftAlignmentContinuation`。production、发行、评分及尺寸/边缘矩阵继续延期。

## 前次 dev 测试（2026-10-27）

**当前 dev 已通过 ChatGPT 实际滚动操作和本地网站范围更新，网站适配核心流程尚未完成（`HANDOFF_PARTIAL_CHATGPT_AND_LOCAL_INSTALL_PASS`）。** 此前已从日常「您的 Chrome」工具栏正常打开侧边栏并进入「开发」，未再出现 `ERR_FILE_NOT_FOUND`；「调试 → 本地开发服务」实读为已连接，扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，构建指纹为 `d689f432f4827c58922537502eba3be1368efb4b1bfb071fa9781b000c1c32c4`。实际加载目录仍未从日常 Profile 详情读回，不能只凭预期 `dist/development` 路径认定。

日常安装原为主动停用的 r2。本轮通过原「更新 / 导入新版」安装 **0.4.6 / r7**，读回源码 SHA-256 `487f655fb22184bedbde0450b7e6f542961aa76ecc78a806fd1e63b0190335e3`，安装身份 `0f356e39-c6a2-4694-81e7-18ce3dbc2e1d` 保持，升级保留停用；随后为本轮测试明确恢复，Authority 为 `active`、Chrome 注册为 `registered`。这不证明网页已实际导航。

等待并行原生操作结束后，已通过原安装器完成本地 `http://127.0.0.1:43111`、路径前缀 `/demo-form.html` 的固定范围更新，版本 `0.4.6+site.r1978225210`、修订 `1978225210`；安装身份保持，授权 `active`、Chrome 注册 `registered`。更新后固定源码 SHA-256 为 `3d1157f6e92ff1e77d8ec56a7c1ccf7dacf57d67ade13343e3b8fd11ac429da6`，Manifest SHA-256 为 `86379c7f154838a2744d1ec13005bb25d6091988d09ed586102711175ef515e5`。刷新后网站适配入口自动显示，可信 Host 读回 0 条规则；区域选择尚未保存，用户要求新对话续接后已按 Escape 收束选择，保留专用标签并释放 UI 锁。未发协调消息。

在本任务独立日常 Chrome 窗口、既有 ChatGPT「技术验证准备確認」对话中，已实际点击整段对话顶部和底部：真实 `.thread-scroll-container` 的 `scrollTop` 分别落到 `0.5` 和 `7883.5`（最大值 `7884`），对应边界按钮停用；末条长回复回顶落到 `6734.5`，可见其首节。末条回复到底后可见末段，但定位器可能先把末尾工具栏滚入视口，不单独据此归因按钮处理函数的滚动距离。刷新后整段对话双按钮及网站适配入口自动恢复。未发送消息；本次未验证 DeepSeek/Gemini，规则持久化及停用恢复仍待完成。

用户最新要求：左下角置顶、置底双按钮的左边距与提示词快捷按钮一致，提取前坐标正常。接收对话优先核对真实页面与原定位逻辑并修复，再完成网站适配、可信保存刷新和停用恢复；本对话尚未修改该定位。

本任务未改业务或公共构建源码，未启动第二个 writer、停止服务或发送网页消息；不为驱动焦点问题修改安装器。旧的内部 URL 拒绝和隔离 production 测试保留历史，不能代替当前 dev 通过。详见 [R134 台账的 `devContinuation`](../../../docs/framework/workstreams/ai-scroll-navigation-r134-delta.json) 与其中证据索引；production、正式发布、评分和边缘矩阵继续延期。

## R1.3.4 增量（2026-10-27）

- 当前正式可导入包为 **0.4.6 / revision 7**，保留独立 Program ID `opendesk.ai-scroll-navigation`。后续历史章节不能代替本候选证据。
- 首次使用 Page 网页增强时，需在 Chrome 的 OpenDesk Browser 扩展详情中允许用户脚本。安装后在批准的网站直接运行；不需要再到产品详情启用一次。`E_USER_SCRIPTS_UNAVAILABLE` 时先核对这一 Chrome 权限开关及其真实读回。
- 从「扩展 → 已安装 → AI 对话滚动导航 → 详情」填写精确 HTTP(S) Origin 和路径前缀，进入原 Installer 审阅。Chrome 网站授权可能覆盖整个主机；原生匹配路径、明确端口与可信 Host 仍约束程序执行。HTTP/HTTPS、localhost、127.0.0.1 和不同端口分别处理，禁止通配 Origin、查询或片段作为路径范围。
- 自定义网站候选由可信 Host 从当前不可变源码生成，使用 `1_000_000_000..2_147_483_647` 的保留 Revision 区间和 `+site.r…` 版本。相同输入生成相同身份，碰撞失败并保留旧安装；官方冻结包不得使用该区间。Revision 是不可变键，不以数值决定升级顺序。
- 新网站审阅成功后打开或刷新目标页面，点击「网站适配」，选取主区域与滚动容器，可选消息和锚点，分别测试顶部、底部，再保存并核对可信读回。配置与安装授权分离；并发冲突及未知保存需先主动重新读取。收缩授权保留休眠规则数据，不能借旧规则恢复执行权限。
- 扩权拒绝或原生注册失败保留原安装；旧确认、停用、撤权和未知状态不能显示成功或自动恢复。升级不扩权时复用合法安装授权；新增范围仍须原审阅和 Chrome 权限。
- **本阶段核心闭环已在 Mac 有窗口 Chrome 的隔离 Profile 跑通**：原安装器安装 r7 → 审阅并更新本地精确网站范围 → 可视选取对话区域和滚动容器 → 上下测试 → 可信保存并读回 → 刷新恢复双按钮及边界禁用态 → 正常停用清理和恢复。测试页面为 `http://127.0.0.1:43111/demo-form.html`；主区域选取结果 `main > div > div` 对应 `.lab-content`，滚动容器为 `html`，消息选择器为 `.unit`。恢复后配置值与 ETag 均保留。
- 定向 Node、真实 Builder、包哈希与本次原生核心证据分别记录在 [R134 增量台账](../../../docs/framework/workstreams/ai-scroll-navigation-r134-delta.json) 的 `coreContinuation`。复用已有 production 快照，未替换日常扩展，也未重测未变输入。本次网站扩权升级发生于首次规则保存前；保存后的升级保留沿用未变的定向保护测试，不新增原生通过声明。**三站真实长对话、完整发行验收仍未完成，官方目录继续 `publication=blocked`；边缘矩阵延期。**


## R1.3.2 配置增量（2026-10-26）

- 正式源码目标版本 **0.4.2 / revision 3**；仅已批准安装的独立 ID `opendesk.ai-scroll-navigation` 可读写本程序网站配置。原有 0.4.1/r2 不因源码变化而自动获得 `page.config` 权限，更新需在原 Installer 审阅能力差异。
- 以页面右下角「网站适配」入口选取对话区域及真实滚动容器；上下分别测试，保存使用原 Installed Page Broker 的身份、文档、原生注册和授权读回，并使用 CAS/ETag 与保存后重读。
- 规则作为惰性 CSS 字符串按 Program ID 持久保存，支持刷新后恢复、冲突报错、重复保存确认及升级保留；不能把规则或网站存储当作授权。
- **新增任意 Origin 的自动打包、扩权审阅与安装闭环仍未实现**：现阶段 UI 只能保存已通过冻结 pageRules 获批的网站规则。要支持新网站，先由原 Installer 完成包含该 Origin 的受审阅升级，不能靠新增规则或 `<all_urls>` 绕过。
- 本段记录源码设计和本轮变更范围，并非 Chrome/Mac 原生验收结论；应以对应提交的 CI 与包哈希结果为准。正式目录继续 `publication=blocked`。

## 历史：R1.3.1 安装与状态（2026-10-26）

- **正式包与入口**：[ai-scroll-navigation.opendesk-page.json](ai-scroll-navigation.opendesk-page.json)，ID `opendesk.ai-scroll-navigation`，版本 **0.4.0 / revision 1**。在 OpenDesk「扩展 → 导入」选择此文件，审阅身份、版本及 ChatGPT、DeepSeek、Gemini 三站范围后安装；安装后归「网页增强」，由原 Page Authority 管理。
- **独立使用**：无需安装 Prompt Shortcuts。旧 `opendesk.chatgpt-jump-top` 与新 ID 分别管理，旧安装和网站授权不会自动转移；可在原管理入口主动停用或卸载旧安装。
- **已有证据**：指定冻结 Browser 候选已通过真实 Chrome 安装、范围审阅、注册读回、停用/恢复、更新、撤权清理、新旧 ID 独立安装与卸载；完整浏览器重启后仍保留同一 installationId 和停用状态。候选身份与原始证据见[四产品工作记录](../../../docs/framework/workstreams/ai-four-products-r125-local-20261026.md)，不代表当前 main 整包验收。
- **本轮内容操作**：同一冻结 Browser 候选、原 0.4.0/r1 在已登录 ChatGPT 的既有长回复中显示导航；实际点击后分别看见当前内容区域的首节和末段。此证据限于该区域的两个方向，不代表整段对话、全部内容类型或三站完整验收；与本机 Mind Map 新身份的两轮开关共用同一页面。
- **当前剩余**：DeepSeek、Gemini 的真实长对话导航仍为 `BLOCKED_CONTENT / NOT_TESTED`。官方目录继续 `publication=blocked`，暂不开放目录安装；上述原包导入入口不等于官方发行已批准。

下方 R1.2.1 及更早章节保留当时的源码与验收状态；其中“新包待构建”“安装未验证”等结论已由本节和工作记录中的增量证据更新。

## 历史：R1.2.1 业务源码（2026-10-25；当时新身份未正式安装验收）

- **独立 Page Program**：代码自带滚动导航；不再要求 Prompt Shortcuts 安装、启用或提供运行时。安装来源仍为 `examples/programs/chatgpt-jump-top/`，避免破坏现有路径引用。
- **新 Program 身份（源码）**：`src/main.js` 与 `package.json` 现一致为 `opendesk.ai-scroll-navigation`，项目版本 `0.4.0`。旧 `opendesk.chatgpt-jump-top` 不是同 ID 升级，原 `0.2.0` 正式包仅是历史安装制品。已查阅原 Page 安装合同，跨 ID 没有已证实的授权迁移；必须由用户在「扩展」审阅旧安装并明确停用/卸载，再经独立的网站权限审阅安装新 ID。**任何旧授权都不自动转移，新包仍待同源构建及核验。**
- **按站点单独适配**：ChatGPT 沿用原长内容识别及共享回复操作组；DeepSeek 只在经过固定路径和操作栏绑定规则的对话中提供长回复操作；Gemini 仅尝试在确定对话滚动容器后提供整段对话顶部/底部导航，**不接管未验证的单条回复工具栏**。未识别结构安全隐藏。
- **五项行为**：`regionTop`、`regionBottom` 为同一长内容两方向；`conversationTop`、`conversationBottom` 为整段对话；`floatingTop` 与 `conversationTop` 复用一枚顶部浮动按钮，不能创建第二枚。默认无需另加配置开关。
- **新旧脚本共存防护**：旧冻结包具有 `[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-jump-top.lifecycle"]` 生命周期宿主，改名后的源码识别它及旧回复导航的活动 ShadowRoot，在存在旧活动导航时**主动退出**；同一新身份的多个代码实例采用活体 DOM owner 仲裁，并在点击时重检。保留旧 `data-opendesk-chatgpt-jump-top` 回复标记供既有 Mind Map 寻址，新 `data-opendesk-ai-scroll-navigation="reply"` 明确标识现代实例。仅承担页面级兼容，不改变旧安装注册/撤权/用户授权。
- **权限**：Page `pageRules` 仅为 `chatgpt.com`、`chat.deepseek.com`、`gemini.google.com` 三个明确 Origin 的顶层 `USER_SCRIPT`。从旧版新增 Origin 属于扩权，必须走现有 Page Authority 与用户审阅；代码不会替安装器授予权限。
- **真实交付状态**：新 ID 只是**已提交的业务源码**；当前环境没有用户 Mac 工作区，也不能运行项目校验器或 Node 单测。目录历史 `chatgpt-jump-top.opendesk-page.json` 仍为 **0.2.0 / revision 2 / ChatGPT-only / 旧 ID**，绝不视作 0.4.0 可安装包。需由原有 `build:program`、`scripts/build-page-install-package.mjs --title "AI 对话滚动导航"` 与完整哈希校验生成**不同的新正式包**，经过原有独立安装确认与三站权限审阅，核验停用、撤权、旧 ID 退出与 Mind Map 共存。新旧安装迁移状态 `MIGRATION_REQUIRED`，上述真实 Chrome 项目一律 `NOT_TESTED`；不得虚构新包 sourceHash、授权转移或 `MULTI_SITE_VERIFIED`。
- **扩展中心搜索**：新包安装时的正式标题应明确使用「AI 对话滚动导航」。现有已安装 Page 的搜索读取 title、programId 和由 pageRules 映射的网站字符串；**npm description 不会自动成为已安装 Page 的搜索内容**。故在 Extension Center owner 修改投影前，「回顶」「长回复」等别名搜索仍有缺口。本轮不冒险重写另一 owner 的通用扩展列表。

## 历史：ChatGPT Jump Top 的原始单站证据

# ChatGPT 长内容回顶 · OpenDesk Page 增强

**日常产品入口已接入[提示词快捷按钮](../../sidebar-tools/prompt-shortcuts/README.zh-CN.md#chatgpt-长内容回到开头)**：安装并启用该工具、打开「网页按钮」后，由浏览器扩展固定适配器在进入或刷新 ChatGPT 时自动运行，无需另装或手动 Run 本项目。本目录继续保存唯一滚动算法、独立诊断入口及历史 Page 包；下文七次点击属于此前独立 USER_SCRIPT 开发证据，扩展自动运行的新增结果见[集成记录](../../sidebar-tools/prompt-shortcuts/evidence/chatgpt-jump-integration-20261020.json)。

仅面向 `https://chatgpt.com/*` 的顶层 Page USER_SCRIPT，复用 `@opendesk/ui` 和现有 Page Authority。2026-10-20 已在真实已登录 ChatGPT 页面通过七条核心点击操作；正式安装、升级和 production 扩展验收仍为 `NOT_TESTED`，独立 95+ 评分为 `NOT_SCORED`。

## 按钮在哪里

- 长用户消息：在原生“复制消息 / 编辑消息”操作组旁显示回到开头箭头。
- 长助手回复：在对应回复的原生“评价回复 / 复制 / 重新生成回复”操作组旁显示箭头。正文与操作栏可以是独立兄弟节点，绑定不能跨到第二条助手回复。
- writing block：在原生 `header` 中，紧邻 `Open editor / 打开编辑器`。点击原生“打开编辑器”进入独立查看器后，箭头位于含 `Close viewer / 关闭查看器` 的工具栏；原生打开、关闭功能保持原样。
- 其他可明确关联的长内容：优先使用原生按钮的唯一 `aria-controls`；否则只接受同一局部容器里唯一的内容节点与唯一工具栏。候选包括 `pre`、消息正文、可编辑区域和确实自身滚动的 `textarea`。没有打开编辑器按钮时，使用同栏最后一个原生操作按钮作为插入位置。

按钮为 34 × 34px，继承页面颜色，使用原生 `button`、中文 aria-label/title 和可见键盘焦点。插入位置与滚动目标分别保存，保留原生 span/tooltip 包装节点的所有权；不依赖 CSS 类名、SVG 内容或资源哈希。新增消息操作栏识别依赖精确中文 aria-label，其他语言或网站 DOM 变化可能不显示按钮。

各独立长内容最多一枚按钮。目标或操作组缺失、关联歧义、隐藏、inert、弹窗、没有有效滚动距离的区域均退出。普通 `aside` 仍排除；仅允许包含唯一直接 `header`、唯一编辑区域、唯一“关闭查看器”操作，且具有 aside 内部纵向滚动容器的 writing viewer。其 header 不作为全局对话工具栏。

全局回退仅用于可明确识别的对话顶部工具栏，目标为第一条对话消息。含“打开编辑器”却无法解析目标的工具栏不会被当成全局工具栏。此回退有组件测试，本次七条真实点击未单独验收它。

## 点击后到哪里

目标为绑定内容的真实布局起点，工具栏的吸顶视觉位置不能作为正文起点。普通内容滚动最近的实际纵向滚动容器；自然高度的 `contenteditable` writing block 或 viewer 正文滚动其合格祖先。确实自身滚动的编辑器只滚自身；溢出但不可滚动、被裁剪的编辑器及不能确认自身滚动的 `textarea` 拒绝执行。

普通内容先以 `目标矩形.top − 滚动口.top + scrollTop − 12px` 计算绝对落点，并限制在有效范围。随后读取落点处 Sticky/Fixed 元素的真实矩形，按横向交集、首行高度和实际遮挡最多做一次同步补偿。不会预测下方尚未吸顶的工具栏，也不会将其他栏位的工具栏算成遮挡。两次操作均为 `instant`，由一次点击完成。

目标本身为滚动容器时只将它的 `scrollTop` 设为 0。实际查看器为内部 div 滚动，内容起点滚到局部工具栏下方；不会无条件将整页滚到 0。保留其他容器与横向滚动值，不写入正文、输入、草稿、光标、选区或编辑状态，不采集或上传对话内容。

## 动态页面与清理

React 替换工具栏、内容、整个 `main`，或仅移除注入按钮时，重新建立绑定。点击时再次核对身份，旧按钮不能操作新内容。观察相关 DOM/ID、原生操作 aria-label、消息身份属性变化，以 120ms 合并刷新；忽略自身插入和无关侧栏变化，无滚动事件扫描。存在显式 ID 关联时，每轮只建立一次 ID 索引；没有关联时不扫描全页 ID。

同模块重装先清理旧实例。事件、Observer、延时和宿主沿用受管生命周期；Stop 清理保留组件级证据。真实 Authority 停用、撤权及卸载仍为 `NOT_TESTED`。本次未另做真实切换对话、React 重绘矩阵或关闭 viewer 后重新挂载箭头检查。

## 开发与现有安装包

从仓库根目录执行定向校验；环境测试入口已导入业务单测，使用一个入口即可：

```bash
node --check examples/programs/chatgpt-jump-top/src/conversation.js
node --test tests/environment/chatgpt-jump-top.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top
```

需要新的脚本候选时使用原编译器 `npm run build:program -- examples/programs/chatgpt-jump-top`，不必为文档收尾重建。已验证候选的 sourceHash/buildHash 为 `b0495ecffa05106cc93b942ad4d4b649890fd03e025b5af00be629ff31c6a303`，编译状态为 `BUILT_UNVERIFIED`、`installable:false`；`buildMode:production` 仅指业务脚本静态编译，不代表 production 扩展验收。

本地项目入口仍为 `opendesk browser dev "$PWD/examples/programs/chatgpt-jump-top"`，随后通过界面明确 Run。本次真实操作使用「开发 → 直接编辑 → JavaScript → Page·当前网页 DOM → 运行」执行最终候选，并获得 Page `active` 返回。界面未提供该次 Page 的精确 `previewId/sourceHash/documentId`，不能用旧 Controller 的 runId/SHA 补作收据。

现有离线包 [`chatgpt-jump-top.opendesk-page.json`](chatgpt-jump-top.opendesk-page.json) 保持身份 `opendesk.chatgpt-jump-top`、版本 `0.2.0`、revision `2`，sourceHash 为 `2f8c1667e0047e4c6a7152b5da121f0d1438abdfa470b139db9cc30c911cc791`。**旧包不含本次修复，本轮未晋升安装包。** 它由原 `build-page-install-package.mjs` 生成，不携带安装授权或运行证明；后续安装/升级仍走「扩展 → 导入」及原有审阅/Authority 流程，提交源码不会自动升级浏览器。

## 真实核心操作证据

[`evidence/development-20261020.json`](evidence/development-20261020.json) 保存最终候选与源码摘要、七份原始 JSON 的脱敏数值与文件摘要、操作方法、开发环境身份及限制。以下 scrollTop 均属于对应滚动容器，单位 CSS px：

| 操作位置 | 点击前 → 点击后 scrollTop | 内容顶部 | 首字符 top..bottom | 遮挡底边 |
| --- | --- | --- | --- | --- |
| 长用户消息 | 390 → 72 | 64 | 76..104 | 52 |
| 第一条长助手回复 | 5614 → 716 | 64 | 67..86 | 52 |
| 最后一条长助手回复 | 16832 → 2973.5 | 64 | 67..86 | 52 |
| writing 中部 | 10953 → 5142 | 115 | 117..145 | 115 |
| writing 底部 | 16023.5 → 5142 | 115 | 117..145 | 115 |
| viewer 中部 | 5945 → 0 | 64 | 66..94 | 52 |
| viewer 底部 | 10947.5 → 0 | 64 | 66..94 | 52 |

七次均使用 AXPress，事件报告 `trusted:true`。独立 DOM Range 测首字符，`elementFromPoint` 确认它可见且属于目标；输入、DOM 选择区、横向和其他真实滚动容器基线均未变化。测试页签 composer 当时为空，没有专设非空草稿或非折叠选区测试；原有非空草稿页签保持未触及。

中间候选曾一次报告 `otherScrollsUnchanged:false`，未捕获具体 delta，后续 detail 为 `[]/true`，根因未定位。最终诊断将基线限定为真实滚动容器并在 pointerdown 立即采集，最终两个 viewer 场景均通过；不据此声称已查明或修复该异常根因。

既有定向验证为 **55 PASS、0 fail**，项目校验为 `AUTHORING_VALID_NOT_PACKAGED`；本次收尾核对原输出与候选哈希，没有源码新变化时不重复运行。真实环境使用日常 `dist/development`，watcher/serve 客户端连接未验证；没有扩展全量构建、重装或改动其他会话输出。

[`evidence/r02.json`](evidence/r02.json) 与 [`evidence/r02-browser-layout.json`](evidence/r02-browser-layout.json) 保留旧 revision 2 及 Chromium 155 合成页面的历史范围。`tests/browser-checks.mjs` 由调用方提供专用 `about:blank` Playwright 页面，不证明登录态 ChatGPT 或 Authority 安装通过。历史 Apple event JavaScript 错误 12、测试 Chrome 未登录与 `E_NATIVE_NOT_READY` 不再代表本次七条真实点击未执行。

正式安装、升级、停用、恢复、撤权、卸载、重启与 production 扩展验收延期，均 `NOT_TESTED`；主题与专门键盘验收未测，宽度/缩放专项为 `OUT_OF_SCOPE`，独立 95+ 评分为 `NOT_SCORED`。
