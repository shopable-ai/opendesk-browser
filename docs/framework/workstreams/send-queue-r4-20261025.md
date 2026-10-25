# Send Queue R4 — 独立 Page Program 工作流

> 当前结果见末节「R4.6 同轮复杂 A→B→C 可见等待与确认诊断」。r3 的短会话链通过，长对话数量校验限制仍存在；安装及先前管理证据见 R4.4。前节环境、延期和未测状态均保留为对应候选的历史观察，不代表当前结果。

- 日期：2026-10-25
- 仓库：`shopable-ai/opendesk-browser`；**只写 `main`**
- owner：本 Send Queue 执行会话；其他并行 Agent 的原有 Page 程序、Prompt Shortcuts、Scroll Navigation、Mind Map、统一 UI 与宿主 `src/` 全都只读。
- **本轮业务写入**：`examples/programs/chatgpt-send-queue/{package.json,src/main.js,src/site.js,src/engine.js,src/view.js,assets/queue.css,tests/engine.test.mjs,README.zh-CN.md}`；唯一进度记录就是本文件。
- 执行模式：GitHub main 远程源码编辑。当前没有用户 Mac 本地仓库写入、真实已登录 Chrome/Profile、`npm run dev` watcher 访问权；不能宣称原生验收。
- 已读取：最新 `AGENTS.md`、公开 Page USER_SCRIPT / `@opendesk/ui` API、Page Schema、页面增强现有程序；R3 HTML 从用户文件库只读恢复，没有覆盖原型。
- 目标能力：页面内存队列；唯一原生编辑器保守探测；两阶段填入/点击；单次官网点击 + 新增用户消息回读确认；下一轮 AI 明确完成栅栏；提前停止须用户确认；未知停止/发送不自动重试；原生输入宽度前后检查；受管 UI 生命周期。
- 验证等级：静态语法快检 + 纯 JavaScript 状态机模拟仅属于开发期间的初步自检；尚未在用户 Mac 运行仓库 Node 测试和安装测试，不能把测试文件存在等同于 PASS。
- 不足：刷新/扩展重载恢复需要公开可信持久化能力，当前 Page USER_SCRIPT 不持有经审计的私有安全存储；不能将聊天消息明文保存到网站本地存储。目标 ChatGPT 编辑器、React 节点、按钮位置、Stop/Send 真实事件兼容性都需实测。
- 下一步：本地 Codex 针对已登录 ChatGPT 在测试对话连续两次真实发送；最优先核实 `src/site.js` 网站适配、`src/view.js` 按钮及队列的宽度/圆角，保存真实回执后再做定向回归。真实网站、正式安装、升级、停用及撤权全部 `NOT_TESTED`。

## R4.2 编辑语义精简（2026-10-25）

**产品纠偏**：不建立队列内嵌编辑器。点击某条「编辑/取回输入框编辑」后，若官网原输入框完全空白、无附件、会话身份保持且该条未处于发送中或 unknown，则将正文写回原生输入框；读回确认一致后，才把该条从待发队列删除。用户随后可在原输入框修改、手动发送，或再按蓝色按钮重新排队。

已有草稿（含空白字符）、附件、会话切换、输入控件替换、无法写入/读回或发送结果未知均**不移除队列项**；可能部分写入时保守暂停队列，避免重复发送。编辑不是删除真实 ChatGPT 对话，也不是点击后直接发送。

**修改范围**：仅 Send Queue 自有 `src/main.js`、`src/site.js`、`src/engine.js`、`src/view.js`、`tests/engine.test.mjs`、工具 README 和本记录。HTML 原型另在对话生成附件，不批量增加仓库原型版本。原生 ChatGPT 实际 DOM/React、正式安装和两轮真正自动发送仍为 **NOT_TESTED**。离线 Chromium 仅验证 320/360/400/440/700px 的队列取回、草稿保护、无横向溢出、宽度一致与 0px 间距，不得转为原生 PASS。

## R4.3 Mac 本地执行（2026-10-25）

- owner：Codex `01a17314-6b91-7c91-84af-bd4e059a7052`，源码阶段 `SOURCE_IMPLEMENTED`；本节取代上方旧会话“没有 Mac 访问权”的环境观察。用户最新明确“先完成源码，稍后做浏览器验收”，本轮不再操作 Chrome 或进入正式安装阶段。
- 起始 main：`52d44595cfa9d4becf8196cb72c83ec55784701d`；安全 fast-forward 到 `eb6d21f890095e3539c2d70a6881bb1e980db7df`。Send Queue 仍为 `8c79c1545`，未重做已有实现。其他 dirty 文件均不属于本业务，保留。
- 写入范围：本目录 `src/{engine,site,main,view}.js`、`assets/queue.css`、业务定向测试、README 及本记录；共享 SDK/Host/React/Prompt Shortcuts 不写。
- 环境：日常 Chrome / OpenDesk Developer `0.1.0`，真实扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。只读核对 Chrome 已加载路径为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，Native allowed_origins 与 ID 一致。现有 `npm run dev` PID 36366 保留，未启动第二 writer；浏览器 serve 握手未验证，不能确认持续更新已连通，也不是 production 验收包。
- 已执行 `opendesk browser dev examples/programs/chatgpt-send-queue`：Native 已连接、目录身份确认、源码 Provider 注册；工作区 `workspace-d0396a74-5f2c-1ef5-34e2-63e86673061d`。仅注册，不是 Run 或发送证明。
- P0 首次尝试：真实已登录 Chrome，独立测试标签和窗口；已有测试对话脱敏 `c/6addec21…639` 停在“正在加载 ChatGPT 对话”，添加附件禁用。开发页已打开但尚未选择并 Run 本项目，队列按钮尚未出现。官网根页存在其他任务的非空草稿，未覆盖、未发送。浏览器 DOM 控制两次 30s 超时，原生 UI 又被其他前台操作切换到 OpenAI Platform；暂停争用前台资源。**A/B 发送 `BLOCKED`，未执行任何 Send Queue 发送点击。运行 candidate/sourceHash 尚无。**
- 接入收尾：临时 CLI session 返回 `E_NATIVE_NOT_READY` 并退出；以上 Provider/目录绑定仅为当时观察，后续验收须重新接入并读回 Authority，不得复用为有效 Run 证据。没有停止或重启其他会话 watcher。

### 本轮源码结果与证据

- `src/engine.js`：`await-native-ready` 暂停后不调用 commit；已点击后的暂停继续只读确认，页面失联或会话离开达到确认期限转 unknown，禁止重试。空白原生草稿也阻止准备发送。
- 独立反方审查证实两个额外源码缺口：确认后队列空/删除最后一条会清掉回复栅栏；停止失败未关联 item 会永久锁死且无法人工恢复。回归先得到 24 项中 18 过/6 失败，再修复为确认后始终保留栅栏和原会话，直到新助手回复明确完成；停止 false/throw 均锁定所选 item，人工核对删除后仍暂停。`src/main.js` 也在空队列仍有栅栏时保留官网手动 Stop 暂停监听。
- `src/site.js`：准备、提交、取回、确认均精确比较正文；不再 trim/NBSP 替换/删末尾换行来掩盖丢失。严格比较可能保守拒绝官网特殊空白，真实编辑器行为未验证。
- `src/view.js` / `assets/queue.css`：第一行恢复编号，正常行无暂停按钮；复用 Shift+蓝色按钮主动暂停和状态区恢复，unknown/已点击待确认无一键继续。恢复 UI 的渲染缓存包含 inFlight/phase。未改官网布局算法；现有仅 form 的宽度守卫不能证明原生编辑器未缩窄。
- 定向测试：`tests/engine.test.mjs` 24/24，`tests/site.test.mjs` 6/6；后者仅明确 DOM stubs 契约测试，不证明官网选择器或 React 输入接收。四个源文件 `node --check` 通过；项目校验为 `AUTHORING_VALID_NOT_PACKAGED` / `installable:false`。未运行无关全仓测试、Program 构建或正式安装。
- 独立只读 delta 复审确认上述两处缺口已解除，5 个内存探针通过，未发现新增安全问题；这不是官网或撤权证据。恢复可由用户明确的恢复或提前发送动作发起，均仍受原会话/unknown/回复栅栏限制，不会自动解除暂停。
- 本机忽略产物 `artifacts/send-queue-r43-01a17314/{validation,source-evidence}.json` 保存命令回执与逐文件 SHA。当前源码清单指纹 `e34cdc19971b2255c7f4ae51eaa7a2b727ae313f139e011023d14e67c61ec775`；它**不是**运行 revision.sourceHash，也不是安装 candidate SHA。运行 previewId/sourceHash/candidate 均无。
- 官网 A→B、编辑取回单条/非首条、暂停安全实测、320/360/400/440px/桌面/200% 的 form+editor+queue 实测，以及正式安装/停用/恢复/升级/撤权/卸载全部 `NOT_TESTED（用户延期）`。初次入口 `BLOCKED` 不改写为源码或真实发送 PASS。七项专家维度 UX/前端架构/浏览器扩展安全/业务正确性/异常恢复/可维护性/反方审计均 `NOT_SCORED`，不计算综合分。
- 唯一下一优先任务（浏览器阶段恢复时）：在可独占操作的原测试对话重新绑定并明确 Run 本地项目，记录实际 sourceHash、会话和消息 DOM 身份，完整验证一次真实 A→B；按首个实际失败做最小修复。其他正式验收继续排在核心链路之后。

## R4.3 真实运行与安装续接（2026-10-25）

- owner：Codex `01a1732c-8d9f-7a63-8359-d02d6ce2da8e`，接收前会话的 Send Queue 执行所有权；`IN_PROGRESS`。最新用户要求恢复真实 ChatGPT 核心测试并完成正式安装，上节“用户延期”仅是历史阶段。
- 起始 `main`/`origin/main` 均为 `5ea7046eb3e2a40f72883af58cea69c657254130`；本业务四 JS/CSS 哈希未变，复用源码级 30 项证据，不先重复测试。保留其他 owner 的 `examples/sidebar-tools/reading-toc/trusted/policy.js`、`src/sidebar-tools/official-reading-toc.js` dirty 修改。
- 写入范围仍仅 Send Queue 自有目录和本记录。资源：复用 PID 36366 的唯一 dev watcher，不启动第二 writer；本轮目录 CLI session 重新注册原工作区，Provider Epoch `7c7c6d89-bfa1-4a0d-b86b-67ca575a2a01`。
- 环境：日常 Chrome、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、`dist/development`；实际 Sidebar 调试页显示“开发服务已连接”，已加载构建 revision `7f0192501fe80e73a1d41dce32a760e4ee4d6aa5c408f25b9751a12a1fd63bc7`。这是持续开发证据，不是 production。
- 入口：旧测试标签受旧浏览器 session 归属限制；原测试 URL 实际为其他 UI 工作对话且初始加载停滞，不向其中发送。新建唯一专属测试标签 `560068363`（分组“Send Queue 验收”），移至独立窗口；首页及临时聊天都复用了其他任务非空草稿，未覆盖、未发送。浏览器独立 DOM 控制超时，已改为原生 AX 操作；曾观察另一任务切换前台窗口，操作前逐次核对目标。
- 已从真实 Sidebar 选择 `chatgpt-send-queue · 页面脚本`，绑定 `local-v2-762752968e31c55886d45e12`，sourceHash `b991d6695877741df022b83d8a3a99de783ea37fbc140c76e2c1bb0f0ef70028`、inputHash `25ef998f016789845e44b381c6cd6b85cc385750a570677d9e69f8ce9fd1b654`。主动 Run 的真实 previewId 为 `0cac601d-0ce2-4024-89cc-2515030b7d40`，回执 `status:active / runtime:USER_SCRIPT / composer:not-detected / persistence:memory-only`；当时目标是临时聊天根路径，没有 `/c/<id>`，按当前网站适配不挂载按钮，不能当作发送 PASS。本机 `artifacts/send-queue-r43-01a1732c/preview{.png,-ax.txt}` 保存回执证据。
- 只读打开既有“核查发送队列”对话后，官网报告无法加载该对话；未发送。随后 Provider 显示 `E_DEV_PROVIDER_UNAVAILABLE`，目录 CLI 当时仍运行，Native doctor 可达；原因未知，不归为 Send Queue 源码缺陷，不重放原 Preview。
- 用户最新明确“新建专用测试对话，保留现有草稿”“创建新浏览器，并完成测试”。已使用独立 Chrome for Testing 155、新临时 Profile 和原 `dist/development`；未复制个人 Profile、Cookie 或凭据，未触碰其他浏览器进程。专用启动报告为 `artifacts/send-queue-r43-01a1732c/chrome-launch.json`，`check_instance.py` 返回 `managed-instance-ready`，浏览器 PID 74622，Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-fgphtr44`。此为持续开发实例，CFT 内 serve 连接及 Native 配对尚未核对，不是 production。
- 用户进一步指定 `/Users/shopme/Documents/temp/cookie-gpt.json` 用于专用实例登录，并明确确认仅在此临时 Profile 授予 Cookie Editor 全站 Cookie 管理及 OpenDesk 用户脚本权限。已复用预装 Cookie Editor，无需另装第三方扩展；Chrome 扩展详情核对 ID 和加载路径仍与日常开发目录一致。Cookie 管理授权已完成，用户脚本开关尚未操作。
- 登录入口实际结果：指定文件包含 30 条、均属 `chatgpt.com` 的 Cookie；通过原文件选择与导入流程写入。最初官网刷新后会话字节发生变化，为区分导入损坏与网站行为，再在不含登录脚本的同站 `robots.txt` 页面导入并导出比对，两段 session-token 的值与原文件逐字节一致。随后直接打开官网首页，仍跳至 `/auth/login?next=%2F`。因此是**当前凭据未取得网站登录态**，不推断已过期或 Cookie Editor 故障；不是 Send Queue 源码失败。Cookie 原值未输出、未写仓库；仅用于本机比对的私有临时导出已删除，用户原文件未改。本机不含凭据的结果为 `artifacts/send-queue-r43-01a1732c/cookie-login-check.json`。
- 登录后续：用户明确“已经登录成功”，本轮已核对专用 CFT 的真实登录态。新建独立 `Send Queue Test` 对话 `https://chatgpt.com/c/6ade0943-84ec-83ee-a8fa-5a71ae5f1e56`，发送无敏感种子消息并实际收到 `SQ-READY`，官网显示回复完成；未触碰其他草稿。临时 Profile 的“允许运行用户脚本”已核对为 on。
- 当前入口：独立 Profile 没有 Native/Provider，故按既有入口将本项目构建为固定普通 Page 草稿。仅执行 `build:program`，产物位于本轮 `candidate/`，sourceHash/buildHash 均为 `b991d6695877741df022b83d8a3a99de783ea37fbc140c76e2c1bb0f0ef70028`，与历史预览完全一致，仍 `BUILT_UNVERIFIED/installable:false`。真实 Run 返回 `E_BUILTIN_RESOURCE`；最小无副作用 Page 脚本同样失败，未到业务入场。原始 AX 为 `artifacts/send-queue-r43-01a1732c/page-entry-resource-blocker-ax.txt`。
- 环境诊断：共享 `dist/development` 实际为空，现有 PID 36387 watcher 日志持续报 `Unapproved WXT entry: chatgpt-fixed-bridge`。当前主干已包含该 entry 的契约，但常驻进程仍失败；不改其他 owner 的源码或停止其服务。为继续用户明确要求的独立浏览器测试，从已提交 main `e4bcd1f397d06dd3170ee2f499429e864a8594d0` 创建本轮只读输入快照 `artifacts/send-queue-r43-01a1732c/host-snapshot`，复用原构建器，独立输出、锁端口 43238 和证据目录；不是 Git worktree，不包含其他未提交源码，不写共享 dist。此为 CFT 静态开发包，非生产验收。
- 当前下一操作：恢复 CFT 的完整扩展资源，再主动运行同一固定源、确认蓝色按钮并执行真实 A→B。A→B、编辑、安全恢复和安装生命周期仍 `NOT_TESTED`；尺寸/缩放专项本轮不执行。

## R4.4 固定桥协作、真实发送与正式安装（2026-10-25）

### 当前可用操作

- owner：Codex `01a17370-ee0a-76d0-89f3-d79563462faf`；本节接续前 owner 的专属 CFT、程序目录及唯一记录。当前阶段为核心开发验证和正式 Page 安装，非 production 全量验收。
- `CORE_NATIVE_PASS / PAGE_INSTALLED`：同一专属 ChatGPT 对话内，A2/B2 各产生一条用户消息及对应 `SQ-A2-OK` / `SQ-B2-OK`；另将 A3/B3 同时入队，观察 A3 已入站、官网仍有“停止”按钮、B3 仍在队列，随后 A3 的 `SQ-A3-END` 与完成操作出现，B3 才入站并回复 `SQ-B3-OK`。无第二次原生发送点击、无自动重试。
- 正式包经已有「扩展 → 导入 → 身份/站点审阅 → 确认安装」成功。详情显示 r1、`page.dom`、仅 `https://chatgpt.com/*`、顶层 USER_SCRIPT、Authority `active`、Chrome `registered`；安装后新文档无需开发 Run，蓝色按钮自动出现。
- 实际点击“停用自动运行”后按钮从当前网页消失，Authority / Chrome 注册变为 `disabled`。恢复为 `active/registered` 后，在新文档建立专属测试对话，蓝色按钮再次自动出现。此为受影响的停用撤权与恢复证据，不冒充卸载验收。
- 在已安装实例主动暂停队列，入列一条仅供编辑测试的消息，再输入 `SQ-PROTECTED-NATIVE-DRAFT`。点击取回被拒绝，原生草稿和队列条目均保留；清除本轮测试草稿后再次取回，完整正文进入原生输入框，队列条目移除，全程没有发送。已清空本轮测试文字并恢复队列，最终无待发条目、无未知发送、无原生测试草稿。

### 冲突结论与所有权

| 范围 | 证据与处理 | 当前证据等级 |
| --- | --- | --- |
| 编译与可信来源 | 原固定桥直接导入独立 Send Queue `src/site.js`，已复现固定 bundle 来源拒绝。经用户授权向桥 owner 发送一次协调消息；桥 owner 改为自身 `src/native-agent/chatgpt-bridge-site.js`，当前固定桥不再引用队列业务源码，未以通配放宽来源门禁。桥文件及 provenance 修改由该 owner 维护，本会话未覆盖。 | 原构建失败 + 当前源码解耦；新桥完整 Browser 构建/运行由其 owner 验证 |
| 同一输入框 | 两个执行世界各有 JS 状态，却共享原生 DOM。队列写入现增加 focus 后再核对，避免官网聚焦恢复的草稿被覆盖；固定桥交付结果前设置公开 `data-opendesk-composer-owner`，队列见标记即拒绝操作。标记只会拒绝，不作为 Host 授权。 | 定向回归通过；新桥与队列的真实并发交付 `NOT_TESTED` |
| 发送时序 | 原计数条件可把不对应当前已确认用户消息的助手节点当完成。现要求历史节点前缀未变、刚确认用户仍为唯一新增用户、唯一新增助手在其后、站点明确完成且无 Stop/忙碌，再经过稳定空闲栅栏。 | 定向回归 + 真实 A3/B3 等待链通过 |
| 权限与消息路由 | 队列只经 USER_SCRIPT 操作 DOM，不调用可信桥 protocol/Chrome/Native。固定桥仍由固定 ISOLATED entry、真实 sender/Side Panel、原请求/会话/轮次及 Host 结果身份控制；没有新增 Host/Registry/Authority。DOM 标记可被网站更改，不能提升其权限。 | 源码核对；本会话未重新执行固定桥 Native 链 |
| 草稿、IME 与正文 | 队列新增 composition 跟踪；准备、focus 后、提交前再次校验草稿/附件/输入法。正文仍逐字比较，仅把已观察的空文档 `<p><br></p>` 作为空，不 trim 真正空白。 | 定向回归；真实普通文字与编辑保护通过；真实 IME/特殊空白 `NOT_TESTED` |
| 生命周期与 unknown | 队列继续由独立 createPageUI owner 管理；停用真实清理通过。桥 owner 保留未知结果的 composer 标记，不在 finally 自动解除；确认发送且原生草稿空、明确人工编辑或导航才按其合同处理。双方 unknown 不自动重放。 | 队列定向回归 + 实际停用/恢复；桥当前生命周期运行 `NOT_TESTED` |

### 真实失败与最小修复

1. 第一份候选清空输入后读到布局换行，提示“无法可靠清空原生草稿”，未发送。只将 `textContent === ''` 且严格为空 P/BR 的富文本文档归为空；实际空白段落、多段与正文换行不归空。同步加入官网当前“开始语音 / Start voice”空闲锚点。
2. 第二份候选实际发送 A 并收到 `SQ-A-OK`，但队列未确认，随后停止受管预览，没有重复点击。通过开发 Page 入口只读检查本测试消息，证实当前用户节点已使用 `data-content-search-unit-key="…:user"`，旧 role 属性选择器匹配 0。只增加该已观察标记，保留唯一新增节点与完整正文校验，得到最终 r44c。
3. 官网多次报告“无法加载历史记录 / 无法加载此 ChatGPT 对话”，种子消息也曾报告“消息流中的错误”。正常新建专属测试对话继续；不覆盖别人的草稿、不把加载失败归为队列源码、不自动重放失败种子。A2/B2 与 A3/B3 已在新对话真实完成。刷新旧对话的官网故障仍存在。
4. 开发草稿文件选择器曾使 r44c 的“打开”禁用，改用现有直接编辑器粘贴同一冻结 `program.js` 并 Run。正式 `.opendesk-page.json` 导入文件选择正常，安装未绕过包验证或 Authority。

### 固定候选与环境身份

- Page：`opendesk.chatgpt-send-queue`，版本 `0.1.0`，revision `1`；源码 46,491 bytes，SHA-256 `08e7f0bcd98b8bcf78cfd32a62ea928460a3408806686aab4a484da4d916f367`。
- 正式包：`examples/programs/chatgpt-send-queue/opendesk.chatgpt-send-queue.opendesk-page.json`；packageHash `59101b693689cdebe7f5ac0b5badb0592afebfa0dc7684892ffdc77d590b5a4e`。原打包器直接复用真实运行的固定字节，没有重新编译或扩大匹配范围。
- 实际安装身份：`9f71bb28-256b-41b6-b15e-faca432f2993`；Chrome 注册 ID `opendesk-page-boot-7f201979d9e5fec0753a135b6d3116fcb273b3da87af8f77`；详情实读源码 SHA 与上述候选相同。
- 浏览器为专属 CFT 155.0.8059.39，PID 74622，原临时 Profile 保留。共享 `dist/development` 为空/旧 watcher 失败，故只在本专属 CFT 加载已有有效 Browser 静态候选的 APFS 副本 `artifacts/send-queue-r43-01a1732c/host-available`，扩展 ID `jkoicpoppfpocgaokdofmbkhbbgpagbd`。原 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 只在此 Profile 停用；日常 Chrome、Native 配对和共享 watcher 均未改。
- 该 Browser 包来自桥 owner 已有 build attempt `c01e4414-42bf-42be-b275-19dc7db3277f`，packageHash `f0c11683e90a8432b28d3d48a554842d7d5c0630b1b9dda173793f7a08e33473`，112 文件副本完整性校验通过。**该包早于本轮桥适配器解耦和 composer 标记，不能证明当前新桥协作已原生通过。** 它是本轮核心操作的静态候选，不是持续开发连接或 production 验收。
- 发送测试对话为 `c/6ade191a…b656`；安装自动运行测试 `c/6ade1afd…4669`；恢复及编辑测试 `c/6ade1b75…eff5`。仅操作本会话无敏感测试消息，未触碰其他真实业务对话。

### 验证、证据与剩余边界

- 本轮仅修改队列 `src/{site,main,engine}.js`、`tests/{site,engine}.test.mjs`、README、上述正式包及本记录。原已实现 view/CSS 未改。并行桥、本地化、UI 和 relay 文件未纳入本会话提交。
- 针对新安全分支及真实失败新增回归，最终 `engine` 30/30、`site` 13/13，共 43/43；语法和项目声明验证通过。新增覆盖 focus 后草稿恢复/编辑器更换、composer 占用、composition、精确新 user/assistant 身份与顺序、缺失完成校验时拒绝继续、严格空文档及真实空白保留。最后源码不变时不重复全组测试。
- 独立只读 code-reviewer 对最终三个源码及对应测试未发现可行动 P1/P2，43/43 定向测试与五文件语法通过；保守拒绝历史节点替换不被误报为回归。正式包 schema、packageHash、源码字节及全部模块/资源 SHA 与当前源码逐项核对通过，回执 `r44c-package-identity-check.json`；本轮文件 `git diff --check` 通过。
- 本机忽略证据目录仍为 `artifacts/send-queue-r43-01a1732c/`：`candidate-r44c-build.json`、`r44c-after-a3-ax.txt`、`r44c-installed{.png,-ax.txt}`、`r44c-installed-autorun-ax.txt`、`r44c-disabled-ax.txt`、`r44c-edit-{protected,reclaimed}-ax.txt`；A3 的 Stop+B3等待由原生 CUA 工具实际观察，文件 `after-a3` 保存的是后续 B3 完成状态，不把它冒充 streaming 截图。
- 仍不支持刷新后恢复内存队列；本轮没有修改存储权限。新桥与队列共同发送/真实 IME/特殊空白/升级/卸载为 `NOT_TESTED`；尺寸/缩放矩阵和正式评分不在本轮。固定桥活跃实现及其 Native 双模式验证继续由桥 owner 负责，本轮不接管其文件或浏览器。
- 已安装在本专属临时 Profile，日常 Chrome 未安装。保持 CFT 与 launcher 存活以保留登录态和安装；关闭会清理临时 Profile。核心发送、Page 安装和上述管理操作已完成，不再自动扩大到旧全量验收。

## R4.5 已安装实例可见发送演示（2026-10-25）

### 用户当前可查看的结果

- 本次接续会话接收 Send Queue 程序、专属 CFT/Profile 和本记录的执行所有权。开始时 `main` 仍为 `d2c3db432b97f0ad3ad4876d9a42279d907aa48f`，本业务目录及记录干净；其他 owner 的桥、provenance、workspace 和 relay 改动全部保留。
- 复用已加载的 **Send Queue Resume Test**：`https://chatgpt.com/c/6ade1b75-fccc-83e8-9eb6-61ca8b16eff5`，没有刷新旧对话、重新 Run 或重装。专属 CFT PID 74622 仍运行，加载路径仍为 `artifacts/send-queue-r43-01a1732c/host-available`、扩展 ID `jkoicpoppfpocgaokdofmbkhbbgpagbd`；本轮为静态核心验证候选，无 dev serve 连接，也不是 production 验收。
- 原生扩展详情再次实读：安装身份 `9f71bb28-256b-41b6-b15e-faca432f2993`，r1、`page.dom`、`https://chatgpt.com/*`、Authority `active`、Chrome `registered`，固定源码 SHA-256 `08e7f0bcd98b8bcf78cfd32a62ea928460a3408806686aab4a484da4d916f367`。页面蓝色队列按钮已自动出现，初始草稿与队列为空。
- 本轮 A 正文：`SQ-VISIBLE-A. Say SQ-VISIBLE-A-START, list integers 1 through 120 on separate lines, finish SQ-VISIBLE-A-END.`；B 正文：`SQ-VISIBLE-B. Reply only SQ-VISIBLE-B-OK.`。均只点击蓝色队列按钮入列，没有人工点击官网原生发送替代队列。
- **已安装实例发送演示 PASS**：A、B 各出现一条完整 user 消息，A 的回复包含 `SQ-VISIBLE-A-START`、1–120 和 `SQ-VISIBLE-A-END`，随后 B 回复 `SQ-VISIBLE-B-OK`。最终官网明确「回答已完成」，队列面板已清空、无 unknown、原生草稿为空；无重发或自动重试。窗口已滚到底部，可同时看到 A 结束标记、B 消息及 B 回复，保留登录、安装和测试对话。

### 本轮证据的准确边界

- 原生驱动最初未前置窗口，粘贴/带 Shift 点击没有改变草稿或暂停状态。前置后使用原生 `typeText` 与普通按钮点击完成操作；没有据驱动行为修改产品。**本轮没有成功将 A/B 同时保持在暂停队列中**，不能写成“两条同时待发”的新证据。
- 输入 B 草稿时实际观察到 A 已入站、官网仍有「停止」按钮；但 B 入列并保存截图时 A 已结束，截图显示 B 仍在队列而官网已回到「开始语音」。因此 `r45-visible-b-queued.png` 仅证明 A 完成后 B 尚待发送，**不证明 A 生成中 B 等待**。此前 R4.4 A3/B3 的原生 Stop + B 等待观察继续有效，本轮没有为补截图反复发送测试消息。
- 本机忽略证据仍位于 `artifacts/send-queue-r43-01a1732c/`：`r45-visible-b-queued{.png,-ax.txt}`、`r45-visible-after-enqueue-ax.txt`、`r45-visible-final{.png,-ax.txt}`。最终完整 AX 中 A/B user 正文及各结束/回复标记均各一次，同时保留已安装身份与源码哈希。部分中间 AX 为工具返回的差异，不能冒充完整历史快照。
- 源码、正式包及权限没有变化，继续复用 R4.4 的 43/43 定向测试和包身份校验；本轮只核对原生结果、离线 AX 消息计数及记录 diff，不重复产品构建或整组测试。

### 新版固定桥协作状态

- 只读核对 **AI Chat Bridge R1.3：修复失焦保护并继续 Mac 双模式验收**（`01a17383-fb91-7763-8d97-2413eb9b8368`）：owner 仍 `active/inProgress`，其最新进展为 102 项相关测试通过、新 production 构建完成，正在自己的专属环境继续官网请求、固定 Task 和结果回传。该进展不等于桥原生闭环或跨功能协作已经通过。
- Send Queue 专属窗口仍加载 R4.4 所列的旧桥静态包；未在该实例建立新版候选与真实 Task/Authority 运行绑定，桥 owner 的候选及浏览器仍由其占用，未移交。本会话未发送协调消息、操作其浏览器、复制其活动输出或接管桥文件。
- **新版桥 + 已安装队列协作为 `NOT_TESTED`**：仍需同一合法新版候选中的真实桥持有 composer、队列拒绝抢草稿，以及确认/撤权后的行为证据。当前队列演示 PASS 与该缺口分别记录，不把旧包当成新 marker 的原生证明。真实 IME、特殊空白、升级/卸载仍保留原 `NOT_TESTED`，本轮不扩大验收范围。

## R4.6 同轮复杂 A→B→C 可见等待与确认诊断（2026-10-26）

### 当前可查看的真实操作

- 本轮复用专属 CFT、登录态、Profile 与安装身份，目标是复杂 A 生成时分别入列 B/C，看见明确等待，再观察同一轮完整交接。最终 `CORE_ABC_NATIVE_PASS / PAGE_UPDATED_WITH_LIMITATIONS`；不恢复旧全量验收或评分任务。
- 最终会话 **Merge Sorted Lists**：`https://chatgpt.com/c/6ade29e7-5858-83ee-8ea3-94671ca77509`。根页先手动发送一条普通合并有序列表问题，只用于建立 `/c/<id>`；A/B/C 均通过已安装实例的蓝色按钮分别入列，没有人工点击原生发送代替队列。
- A 为带 `SQ-J-A` 的流式 TSV 解析器复杂题，要求完整 Python 实现、12 项案例及状态/复杂度说明。A 已入站且原生 Stop 可见时，分别输入并点击蓝色按钮入列算术解析器题 B（`SQ-J-B`）与简短 C（`SQ-J-C. Reply only SQ-J-C-OK.`）。截图同时显示两条待发、明确「等待中 · 等待上一条回复完成」、原生 Stop 和空输入框。
- 同一轮第二张截图显示 A 的复制/评价等完成操作已出现，B 已入站并开始 `SQ-J-B-START`，原生 Stop 仍可见；C 单独保留在队列并显示等待。A 的模型回复没有按要求输出 `SQ-J-A-END`，完成依据为网站完成状态和受控交接，不把题目完成度当发送状态。
- 最终 B 的 `SQ-J-B-OK` 和完成操作出现在 C 用户消息前，C 回复 `SQ-J-C-OK`；三条 user 各一次，官网「回答已完成」，队列面板消失、原生草稿空、无 unknown。此轮未人工删除条目、暂停/恢复、停止回复或重发。窗口保留最终结果和 r3 安装详情，可直接查看。

### 真实缺陷、修复与未解决限制

- 原 r1 在 A 生成且 B/C 已排队时，没有正常等待说明；已保存 `r46-before-fix-a-streaming-bc-queued{.png,-ax.txt}`。最小修改 `src/view.js`：非空队列持续显示实际等待/准备/已点击待确认/暂停/unknown 状态，并把回复栅栏纳入渲染签名。无倒计时、不推测完成，不增加可绕过 unknown 的恢复按钮。
- 原 r1 的 C、r2 较长会话 G 的 C 均实际收到回复但未通过入站确认。仅人工核对各自原对话回复后，通过已有 Delete→确认删除本轮测试条目，从未重新发送。`r46-before-fix-final` 实际为 unknown，`r46-before-fix-stream-visible` 已不是 A streaming；文件名不能作为通过证据。
- 增加 `src/site.js` 的 `confirmationIssue`，沿用原确认顺序与条件；`src/engine.js` 仅在原确认超时后附具体原因，未放宽任何准入/发送/完成门禁。r3 在原较长会话的单条 D 中复现：实际收到 `SQ-R46D-OK`，但显示「用户消息数量与发送前记录不符；未能确认用户消息入站，禁止重复点击」。**数量不符已确认，具体是否由历史加载或 DOM 虚拟化引起未证明；长对话兼容限制未解决。** 原节点前缀、精确正文、唯一新增消息与对应助手身份继续严格校验。
- r2 的 F 样本保存 A 生成时 B/C 同时等待和最终空队列，但漏拍 B 生成阶段；G 样本拍到 B 生成时 C 等待，C 却是在 A 完成后才点击入列，最终还进入 unknown。因此 F/G 不拼接成同轮全链通过。文件 `r46-fixed-c-processing` 保存的是 B 已完成、C 处理中，`r46g-c-still-draft` 保存 C 尚未点击入列。
- r3 的 H/I 复杂请求被官网简短作答，没留下足够观察窗口；I 的 B 仅输入未入列，已清空，未发送 B/C。最终使用普通技术会话 J 完成上述同轮观察，不把短答归为队列故障，不声称所有尝试均通过。

### 固定源码、安装和写入归属

- 最新 Page：`opendesk.chatgpt-send-queue`，v`0.1.2`、r3；源码 49,006 bytes，SHA-256 `68a73289c820fade777168230b7a60272f2d629cb16f4fd13b52dabe5c1804d4`；packageHash `6e2442f650d1ff40c54c11c66690a8a67823b333edd9d5c8576e0e8d1718d744`。唯一正式包仍为工具目录内的 `opendesk.chatgpt-send-queue.opendesk-page.json`，由原构建器复用本次已安装、已运行的固定字节生成，与临时候选逐字节一致。
- r2 为 v`0.1.1`，sourceHash `c4694f28e792cf61635e8c3520c0d4e8aa8683971706793356029001ec4f6e54`。r1→r2→r3 均走既有扩展详情更新入口、原生文件选择、身份/范围审阅和确认更新；未增加网站或权限。r3 新文档自动出现蓝色按钮。
- 实读安装身份继续为 `9f71bb28-256b-41b6-b15e-faca432f2993`，Chrome 注册 `opendesk-page-boot-7f201979d9e5fec0753a135b6d3116fcb273b3da87af8f77`，`active/registered`，仅 `page.dom`、`https://chatgpt.com/*`、顶层 USER_SCRIPT；详情 SHA 与本次 r3 相同。
- CFT 155.0.8059.39、原 PID 74622/Profile 与扩展 ID `jkoicpoppfpocgaokdofmbkhbbgpagbd` 保留；宿主仍加载 `artifacts/send-queue-r43-01a1732c/host-available`，无 dev serve 连接，是原静态核心验证候选，不是 production 或新版桥验收。本轮没有宿主构建、覆盖 `dist/development`、停止 watcher、重启浏览器或修改 Native 配对；日常 Chrome 未安装本程序。
- 始终在 `main`。开始 HEAD `848b4862c4a71b5ed3dc3d2a2ab2d61322f1d481`，并行 owner 持续提交 main；其中 `e080939b4` 已包含本轮等待提示与 v0.1.1，随后 `1475758fc` / `b994ca95e` 提交了皇冠外观，本轮 r3 如实包含当前已提交外观，未覆盖它们。本轮剩余写入仅队列自身确认诊断/测试、版本、正式包、README 和本记录，其他业务 dirty 文件不纳入提交。

### 最小验证与证据

- 确认诊断触及真实发送确认与 unknown 分支，故执行受影响 `site` 13/13、`engine` 30/30，共 43/43；验证精确正文、历史节点变化、数量不符、暂停及未知结果禁止重试。源文件语法、项目声明、当前来源和打包身份检查通过；未运行无关全仓测试、宿主构建、宽度/缩放矩阵或评分。
- 原生 UI 操作全部通过 CUA；未使用 CDP、页面 eval、AppleScript、私有 ChatGPT 请求或网站消息存储。AX 离线断言只检查已保存的真实快照，不作为额外模拟浏览器通过。
- 本机忽略证据目录 `artifacts/send-queue-r43-01a1732c/`：`r46j-a-streaming-bc-waiting{.png,-ax.txt}`、`r46j-b-streaming-c-waiting{.png,-ax.txt}`、`r46j-final{.png,-ax.txt}`、`r46j-timeline.json`（含 A/B/C 原文与观察时间）、`r46j-evidence-check.json`。三个快照证明同轮交接，最终离线统计 A/B/C user 各 1；`r46d-package-identity-check.json` 证明包、固定源码和当前全部模块/资源同源；`r46d-diagnostic-timeout{.png,-ax.txt}` 保留数量不符现场。
- 本轮仅证明上述短会话核心链与原权限内升级。长对话限制仍存在，刷新恢复仍不支持；新版固定桥协作、真实 IME、特殊空白、卸载和 production 完整验收继续 `NOT_TESTED`，不因本轮通过而提升其状态。保留专属 CFT 和 launcher，避免临时 Profile 被清理。
