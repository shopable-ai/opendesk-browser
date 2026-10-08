# ADR R8：OpenDesk Browser 统一程序内核、GM 兼容层与可选 Agent 能力

> 2026-10-09。状态：**PROPOSED / R8 RESEARCH，非已实施、非原生验收**。主干初始基线 fa8e3fba80ca6f86a2f8160c08d19c6f925ce670；本轮仅文档写入 main。本 ADR 服从 [D1 依赖合同](userscript-dependencies-d1-adr.zh-CN.md)、[R6 Agent ADR](ai-browser-agent-ecosystem-r6-20261008.zh-CN.md) 与 [R8 GM 矩阵](userscript-compatibility-matrix-r8.zh-CN.md)。已有代码与约束不可推倒重做。

## 0. 决策

选择 **方案 C：单一受信 Browser Core + 类型化程序/执行入口 + GM API 兼容 facade + 按需 Agent Bridge**。先实施 **P0：Page Program Candidate → 类型专属真实验证 → Available → Installed+Enabled → chrome.userScripts.register/getScripts/unregister 对账**；GM API、后台 Cron、云市场、AI 录制均不是 P0 前提。Controller Task 仍保持既有 opendesk.task.v1 稳定合同；不把 Page 修改为 Controller 的子任务或复制数据库。

目标效用：普通用户安装后网站自动增强；开发者直接贴单文件即刻预览；复杂用户多文件 ESM/package-lock 构建成本地冻结 JS；Controller 与 Agent 产出经证据验证的可重复 Task。默认不需要 LLM、MCP、Native Host 或网络账户。

## 1. A/B/C 三路线评审（主观架构适配，不是实测分数）

| 方案 | 优点 | 致命缺陷 / 代价 | 独立结论 |
| --- | --- | --- | --- |
| A 传统用户脚本优先 | 快速满足安装 @match/GM/传统脚本迁移需求；市场熟悉 | 易重建第二 Runtime、第二权限模型和历史兼容包袱；削弱已有 Locator、任务冻结及 Agent 的产品差异 | 若目标仅替代油猴可选，本项目不推荐 |
| B AI Browser Automation 优先 | 对 R6 Agent→Task 路线最短；可复用现代 Locator、RunHost、Task | 普通用户没有站点自动生效与导入脚本体验，产品仍像“开发者浏览器工具” | 已有能力不应替代新用户脚本主链 |
| C 统一内核+兼容适配+AI 可选 | 保护已有源码投入，单次审核/锁、类型化信任边界、普通用户与开发者共存 | 类型演进复杂；GM legacy 同步语义难；真实 Chrome 生命周期和撤权 race 需要专项测试 | **采用：阶段交付，先 P0 再 GM/G2** |

约束：不设置“第三方脚本可直接使用全部 chrome API”；不为 ScriptCat 建照搬 Runtime；不引入独立的 TaskDB / AuthDB / NetworkBroker / Controller。GM facade 属于不可信 JS 功能投影，不是第二权威。

## 2. 程序五维合同，而非把“运行形态”混成一维

| 维度 | 取值 | 说明 |
| --- | --- | --- |
| Authoring / Source | single classic .user.js；single async function main；multi-file ESM/package.json | 仅编写/构建形式，不自动获得更多权限；最终冻结来源 JS 字节、sourceHash 与依赖 manifest |
| Runtime Kind | page-userscript；controller-task；background-script（未来）；usercss（未来） | 不同执行宿主、目标与脚本上下文；复用身份、审核、存储和日志 |
| Trigger | manual-preview；installed-auto-document；manual-run；alarm-schedule（未来）；browser-event（未来）；external-agent（可选） | schedule 是触发器，不应自动创建新 Controller/Task DB；完整生命周期必须写入适配 |
| Trust / Release | Draft → Candidate → Verified → Available；Installed + Enabled/Disabled；Retired | 发行状态与安装状态分别存储；Page 与 Controller 的验证器、native receipts、运行效果不可互换；注册成功另记 observed 状态 |
| Capability / Permission | manifest 资格、浏览器实际授予、脚本声明、应用能力、单次目标/身份 | 五者逐层收窄；源码格式、触发方式、AI 生成或安装状态均不能自行扩大权限 |

**Runtime 映射**：
- **Page Userscript**：chrome.userScripts USER_SCRIPT world（P0），匹配 URL/frame/runAt；没有 Controller page 对象；安装一次，文档自动执行，执行效果不会在 unregister 后自动回滚。
- **Controller Task**：现有 RunHost + Worker + ChromePage/Locator + Authority，人工或参数化 Task 运行，有固定 durable Run/Result/Stop；不因 @match metadata 自动注册。
- **Background Script**：P2 类型，无 DOM，没有任意持久 SW；适合短工作、事件、可续任务。在可选受控 Extension Document/Sandbox 内的长执行需记录宿主退出/失联。
- **Scheduled Task**：P2 是对可恢复工作单元的 schedule trigger；基于同一身份、Run Journal、输入哈希、租约和效果收据；触发不能提升 script grant。browser closed 下不执行，醒后根据策略补偿。
- **UserCSS**：可独立 Source+Style Revision 与匹配，不接受 JS/GM API，适配 CSS 注入/卸载。
- **AI Agent / Skill**：可选外部 UI 或受信 Adapter 调用已有 Controller/Task；不能绕开 Candidate/Verified/Available。Agent 不是 Page Runtime 特权世界。
- **Native Host / CLI**：R6 已有 PR #11 正在开发但未合并 main；只作为可选 IPC 外部入口，不持有第二调度权威，也不是普通脚本安装的前置条件。

## 3. 最小核心模块与复用线路

    Sidebar (我的任务 | 发现 | 开发) —— 独立完整管理页面
        |
    Import/Review + Editor + Program Builder
        |
    Existing source/revision store + dependency locks + Task assets
        |
    Existing Trusted Broker / Authority / Permissions / Journal
        |                      |
    Type-specific release     Installed declarative state
    checks (Page/Controller)  |
        |                     Page Registration Reconciler (P0)
        |                       -> Chrome userScripts.register/getScripts/update/unregister
        |
    Controller RunHost ---- ChromePage/Locator ---- Task Run/Result
        |
    GmApiFacade (P1) -> onUserScriptMessage -> Broker capabilities -> SDK storage/network/tabs/etc
        |
    Scheduler adapter (P2) -> alarms -> same authority / journal
        |
    Optional Native/Agent facade -> existing Controller/Task APIs

源码重用：
- src/platform/host/{authority,broker,controller-methods,sdk-methods}.js 不换；新增类型方法沿现有认证消息和持久 CAS。
- src/platform/tasks/{contract,service}.js 既有 Controller Task 语义不扩张为 Page 假证据。Page 发布可抽通用“版本/证明/安装元数据接口”，但验证实例和 native semantics 必须是新 type-specific。
- src/scripting/user-scripts/{dependency-metadata,dependency-manager,execution-source,page-program-contract,page-program-package,preview}.js 保留。P0 接线正式资产校验、来源审计、注册 reconcile，不重新编写 @require downloader。
- src/platform/storage/index.js 现有 IDB v2 frameworkKV；新增按 namespace/version 的 record key、schema 校验和 CAS，而非无理由 v3 migration 或第二 DB。
- src/platform/chrome/permission-gate.js + manifest.json 当前默认 <all_urls> 和可选 API 权限。P0 不应扩权；未来扩权依需要审计，不因脚本 @grant 自动生成“浏览器所有权限”。
- src/framework/sdk/ 和 src/platform/chrome/network.js 为未来 GM G1/G2 broker 的驱动基础；保留当前 HTTP headers/credentials/timeouts 边界，另建适配器而非双网络服务。
- src/run-host.js 继续由可见扩展文档负责 Controller 的持久运行；不要误当 MV3 Service Worker 不会被杀。

## 4. Page P0 状态/数据/注册对账设计

### 4.1 固定身份

PageProgramRev 应冻结：namespace、programId、revision、sourceHash、entryFormat、sourceProfile{metadataProfile,importSourceUrl}、dependencyLockId、dependencyManifestDigest、pageRules{matches,excludeMatches,runAt,allFrames,world=USER_SCRIPT}、manifestHash、source provenance、declared grants/connect 与版本许可摘要。利用已有 validatePageProgramManifest 扩充审计必要字段需做显式版本迁移，不能破坏现行 v1 的 hash 稳定性。

PageInstallation 应记录：installId、programId、approvedRevision、approvedManifestHash、approvedRules、approvedPermissionSnapshot、enabled、registryId、registryHash、generation、desiredState、observedState、lastError、timestamps、dependency references。原生 Chrome registration 是**派生缓存**，唯一权威为已经安装并复核授权的本地 desired state。

### 4.2 类型专属验证

Page Candidate 不能借 Controller RunResult 冒充 Page 验证。P0 对固定页面程序需要 Native proof：实际 script hash，实际依赖锁，Chrome USER_SCRIPT world 与 worldId，精确 tab/frame/document、URL 与 runAt，脚本真实 DOM 观察/明确用户验收。验证证据只能由可信 native observer/Broker 收集；一次立即 preview ack 不代表定时/匹配/下一文档生效。将“preview verified”和“installation native validated”区分，不能返回虚假 Available。

### 4.3 安装与浏览器状态不是分布式原子事务

Chrome userScripts.register 与 IndexedDB 不共享原子事务。用**单一 writer 的期望状态 + 持久 effectId/operation digest + 幂等 reconciliation** 达到最终一致性：
1. 可信 UI 检查 Candidate、审核字节/依赖、网站和高敏变更，用户明确安装+启用。
2. Authority 事务冻结 Installed(enabled) 的期望状态与 generation；未经权威 proof 不生成 native registration。
3. Reconciler 从 frameworkKV 读 desired set，并从 chrome.userScripts.getScripts() 读 actual；比较 id + fixed hash + world + rules，缺失补注册，过期/不匹配 unregister 或替换；记录 native ack/失败，不把 API Promise resolve 当 DOM 执行完成。
4. 在 SW 启动/onInstalled(update)、启用停用、变更权限/onRemoved、依赖丢失、重启/升级后重对账；Chrome 明确在扩展更新时清空 userScripts 注册，不能依赖之前的 native state。
5. 所有外部调度消息带 operationId、generation、sourceHash、expected old state；旧操作回执不能覆盖新状态。更新失败旧版可回滚，不能静默执行下载到的新字节。
6. reconcile 中出现浏览器开关关闭、站点撤权、禁止类型或资产损坏时 fail closed、保留用户可修复的明确状态。

**撤权 race 关键警告**：从 IndexedDB 停用到 chrome.userScripts.unregister 的短窗口内，已注册且尚未生效的脚本可能赶上下一文档。P0 必须验证是否使用 USER_SCRIPT 隔离的受信启动握手（chrome.userScripts.configureWorld({messaging:true}) + onUserScriptMessage）在**运行用户代码之前**校验 install generation、浏览器授权和 document scope。此异步握手可能影响 document-start 时序；若无法同时保证，必须对受限 document-start 语义明确拒绝/降级而不能虚报同步时机。GM 所有特权 API 另外在每次调用再校验授权。不能保证撤销后回滚过去 DOM 效果或远程副作用。

### 4.4 实际 Stop 语义

- Page auto “停用”：阻断下一个 document，best-effort 取消尚未起始的安装 run；**已执行的 DOM 修改、事件监听、定时器不能简单撤销**。可选有 cleanup() 合同的脚本才能提供 cooperative stop，不能宣传通用强制停止。
- Controller “停止”：保留现有 RunHost 停止与 retirement；并不逆转网页已发生效果。
- Browser/Native “停止”：取消后续调度和权限，正在发生网络/点击的未知结果需通过 journal 判定，不自动重复。

## 5. GM API facade 与 4 层权限模型

**从外向内的交集，而不是 OR 关系**：
1. **Chrome Manifest/真实允许的网站及浏览器 API**：manifest 所声明 ≠ Chrome 仍实际授予。当前 all_urls 为扩展资格，不是单脚本资格；chrome:// 等保护页仍不支持；Chrome 138+ Allow User Scripts 必须打开。
2. **已安装脚本的站点执行规则**：approved @match/@exclude-match、frame、world、runAt、window/document scope；@grant none 不将世界切 MAIN。
3. **脚本 capabilities**：@grant 是申请声明，不是管理员许可。GmApiFacade 为每个 method 检查 approved grant、类型、namespace、installed generation、revocation fence。
4. **目标操作级授权**：GM_xmlhttpRequest 等还要求 @connect destination + 实时 target Chrome host + 用户 per-script approval + Network Broker allowlist；Cookie/Download/Clipboard/Tab/Notification 有单独专用 gate。

对每次消息：页面数据、userScript 参数、来源 URL 均不可信；通过 Chrome 专用 chrome.runtime.onUserScriptMessage/onUserScriptConnect 与 configureWorld({messaging:true})，从可信原生 sender 的 tab/frame/document 与 broker 的登记世界/实例查权，**不得相信 payload 里的 scriptId、tabId、grant 或任意“已验证”状态**。返回序列化脱敏 + 大小预算。对未知世界、导航、卸载、撤权和扩展更新 fail closed。

**GM Value**：按 [ownerNamespace, programId, grantProfile] 分区，异步 GM.getValue 优先；同步 GM_getValue 只可提供经过启动握手初始化的冻结 local cache，写入失败的偏序与 remote listeners 必须有版本合同，绝不通过阻塞跨进程 RPC 伪造同步。

**R8 Engineering 身份修正**：上述“登记世界/实例查权”是尚待实现的认证要求，不代表 Chrome `MessageSender` 能报告脚本身份。当前 Chrome 官方 runtime 合同没有 `scriptId` / `worldId` / `userScriptWorldId`；`sender.id` 是扩展 ID。专用事件只能证明消息来自本扩展关联的 USER_SCRIPT 通道。不能拿不可信 payload 的世界名去查询可信登记表后直接放权。具体否决门槛见下方 R8-EP-ADR-05。

**GM XHR**：GmHttpAdapter 做 callback/event/Promise/abort 投影，Broker/NetworkService 执行受控 HTTP。现有 axiosx SDK 不能“注入后就绕开 CORS”，页面 fetch 依然受 CORS；扩展后台网络也要检查目的 host。当前驱动 credentials:omit、禁敏感头、短超时、文本 JSON；不应为实现 GM 直接开放任意 cookie/header、redirect、stream。未知请求效果不能主动重试导致重复 POST。

**GM Resource / Download / Notification**：复用已锁资产与现有可信 chrome services，资源 URL/临时 Blob 生命周期严格限定；不公开通用 extension Web Accessible Resource 列表。

## 6. Background / Scheduled P2：MV3 的真实保证

Browser SW 通常空闲 30s 即销毁，globals 非持久；Chrome Alarms 最快 30s，触发可任意延迟。Chrome 150+ 支持 persistAcrossSessions 标志，但 Chrome 138–149 和其他浏览器的持久性不可靠，仍要按 desired schedule 在启动时重建。[Chrome 官方 lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) / [Alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)。

设计：
- ScheduleDefinition：programRef/revision, timezone, cronExpression（验证与规范化）, nextDueAt, misfirePolicy（skip / coalesce / catch-up-one）, maxConcurrent, maxDuration, paused, owner, grantSnapshot, updatedAt。
- RunLease / FireId：scheduler tick 从持久 store 读取到期任务，在同一事务比较 generation、时间与原任务锁，claim unique fireId；按 unique effectId 记日志和幂等收据。**本地 exactly-once 的 DB admission 不意味着远端网络副作用 exactly-once**，失败结果 UNKNOWN 不盲重试。
- SW 只承载短促调度、状态与 Broker 工作；需要长执行必须有明确 extension document/可恢复 checkpoint，或者可选本地 Host（且用户同意安装与权限）。Offscreen 不天然 24/7 SLA，不以无界 keep-alive 对抗 Chrome。
- Cron UI 的描述应注明“浏览器在线、允许延迟、可能错过；下次唤醒采用指定补偿策略”；Native Host 高 SLA 是独立选项，不对普通脚本隐性要求。
- @background 类型没有 page DOM 与任意 open tab 接入，调用额外能力须走 Broker；定时任务不是网页用户脚本的普通 @run-at。

## 7. UserCSS、Agent、跨浏览器

**UserCSS** 独立格式：CSS sourceHash/selector/rules/preview/installedStyles，用受控 CSS 注入 API 实施；不进入 JavaScript Sandbox，不获取 @grant。Stylus 的预处理/变量/同步/Preset 待有用户使用证据再做。

**Agent / AI 任务冻结**：参考 [agent-to-task-contract-r1](agent-to-task-contract-r1.zh-CN.md)。AI 生成 ≠ 授权 ≠ 发布；Draft → same-source native Run → Durable Result + page-effect proof → verified Candidate → Available → 用户安装 → Agent 关闭后重复成功。Native PR #11 当前仍 open，不在主干；用户主动选择启用 Bridge。

**Firefox**：browser.userScripts、事件页/Offscreen、host-permission/更新与消息不同，定义 BrowserUserScriptsDriver、PermissionDriver、ScheduleDriver 的能力探测与测试合同；不假设 Firefox 等同 Chrome。**Safari**：扩展生命周期/用户脚本许可、跨上下文消息更受限，先验证 P4 POC 再声称兼容。代码中的 chrome.* 只能在 adapter/Host 层，不能扩散进 GM facade 核心。

## 8. 安全、CWS 与供应链准入

- 每次安装展示：精确来源 URL、作者/许可证、sourceHash、版本差异、@match、@grant、@connect、依赖 URL/hash、更新策略、隐私影响。远端商店只是发现，不自动安装或运行。
- 更新获取永远是 proposal：先下载隔离、锁 hash、显示权限/目标差异、验证必要 native 证据、用户确认 CAS 切换。失败保留 old installed + pinned assets，旧依赖只在无引用时 GC。
- 用户脚本在 chrome.userScripts 专属受控世界执行；绝不把第三方 JS 丢到 SW、具备扩展特权的 DOM、Controller Worker 中混装，也不通过通用 executeScript(MAIN) 绕过 CWS 远程代码限制。
- 未声明的 @grant/@connect/@include semantics 默认拒绝，而不是只告警后悄然执行。
- 严格处理恶意来源、元数据头部欺骗、依赖重定向/SSRF/篡改、跨 frame 逃逸、unsafeWindow、脚本跨命名空间冒充、原型污染、升级锁竞态、SW 休眠 ACK 丢失、平台权限已被用户撤销。
- Chrome host_permissions 目前默认 <all_urls>、cookies 等核心权限偏宽；**现状不是已经做到最小权限**。在对公众发布前必须评估单独构建渠道/逐步授权、Chrome Web Store 单一用途与隐私披露，不能为了 R8 反过来扩大默认能力。

## 9. ADR 关闭条件 / 否决条件

P0 采用门槛：正式 Page 可按规则安装/启停、同文档只执行一次、非匹配零次、真实跨源 frame 阻断、扩展更新恢复、撤权/开关关闭失败关闭、依赖锁按序离线运行、源字节更新/权限 diff 审核、失败回滚、新用户 Chrome 138+ 首装走通、同候选 Native 运行证据在账本中可见。不得以“有纯编译函数”/Node mock/ZIP 代替。

以下任何一个未解决，**不标 R8 产品完成**：
- 未认证的 Page 启动即可执行；未经真实 Authority 认可冒充 Available；停用/撤权后允许下一文档运行的竞态无风险说明；
- 注入了 GM facade 即无条件访问 chrome.*, Cookie/网络/下载；不经 @connect/target grant；
- 定时器声称永久在线、秒级准点、exactly-once 远程副作用；
- PR #11 未合仍称 Native Agent main 已完成；UI 增加第四一级页签或重写当前 Controller/TaskDB；
- 任何未经过真实 Chrome/Codex E2E 的功能被标 CHROME_NATIVE_VERIFIED。

## 10. R8 Engineering Program R1 增量决策

> 2026-10-09（北京时间）。源码基线 `main@945cf92726fcadcd60ecb3dc70729029fb9f28e6`；复核 `main@0dcc23b6e1a3409a0dc06f2afd2884ed1e74a448` 的并行计划增量仅涉及文档，保留其 E01–E40 稳定任务 ID。以下为执行设计决策，**不是全部源码已实现**。任务、前置关系和逐项验收只在 [唯一执行计划](../../product/browser-automation-r8-implementation-plan.zh-CN.md) 维护；能力 ID 仍以 [188 项功能目录](../../product/browser-automation-feature-catalog-r8.zh-CN.md) 为准。`ACCEPTED_DESIGN` 不等于 `CHROME_NATIVE_VERIFIED`。

| 决策 ID / 问题 | 明确结论 | 实施约束、延期或否决门槛 |
| --- | --- | --- |
| R8-EP-ADR-01 · GM 与既有 SDK | **ACCEPTED_DESIGN**：GM Facade → 专用身份准入 → 原 Broker/Authority → 原 Storage/Resource/Network/Chrome service。只新增方法签名、序列化、事件和错误投影 | 不给第三方脚本 SDK 的宿主会话凭证，不创建 GM 专用数据库/权限引擎/第二网络服务。GM Promise API 以相同安装身份调用驱动；原 SDK 合同保持 |
| R8-EP-ADR-02 · Page 与 Controller 身份 | **ACCEPTED_DESIGN**：共享 owner namespace、资产引用、sourceHash、冻结 revision、依赖锁的基础设施，验证器按 runtimeKind 分派 | 保留 `opendesk.task.v1` 和 `opendesk.page-program.v1` 的现有哈希语义；需要新字段时显式版本化。Controller RunResult 不可充当 Page 自动安装证明；不把 `Available` 字符串当可信证明 |
| R8-EP-ADR-03 · 五维正交 | **ACCEPTED_DESIGN**：sourceFormat、runtimeKind、trigger、publication/installation、capability 分别建模 | `Draft/Candidate/Verified/Available/Retired` 是发行子状态；`Installed`、enabled、native observed 状态独立。源码保存、执行成功、正式验证、安装持久化、Chrome 注册回执是五件不同的事。Agent/Skill 是 adapter，不凭空增加特权运行世界 |
| R8-EP-ADR-04 · include/exclude | **DEFER_IMPLEMENTATION，保留拒绝**：有限 glob 可以作为未来适配目标，不能直接宣称完整传统正则兼容 | Chromium dynamic UserScript 实际为 `(matches OR includeGlobs) AND NOT excludeMatches AND NOT excludeGlobs`。不得用 `<all_urls>` 兜底纯 include，不照搬 content_scripts 的 AND。当前 D1 对 @include/@exclude 继续失败关闭；纯 include、query/fragment/编码/子域需目标版本 native 证据后才开放 [EP-S1][EP-S2] |
| R8-EP-ADR-05 · USER_SCRIPT 可信消息 | **SECURITY_GATE**：使用专用 `onUserScriptMessage/onUserScriptConnect`，但还必须证明脚本实例身份 | Chrome sender 的 extension/tab/frame/document/origin 是必要条件，不足以推出哪个 program/world。MDN 的跨浏览器 `userScriptWorldId` 不能视为 Chrome 支持。定义可信注册实例凭证的创建、保密、绑定 document/revision/generation、过期与撤销，做兄弟脚本冒用/网页伪造/旧版本重放 native 测试。未证明前所有特权 GM 维持关闭 [EP-S3] |
| R8-EP-ADR-06 · document-start 与授权 | **ACCEPTED_DESIGN，语义不可虚标**：安装时完成静态授权并预注册；早期 bootstrap 注入与异步权限就绪分别记录 | 无 GM 脚本可由已批准注册启动，但应用停用到 unregister 完成有竞态，必须定义生效边界并验证。若要求用户代码前异步实时授权，则不能保证用户代码仍在原生 document-start 时点、先于页面脚本执行；不可同时承诺零等待 document-start 和未知耗时的逐次权限确认。受影响 profile 明确延迟或拒绝，不能假称“补跑回 start” [EP-S1] |
| R8-EP-ADR-07 · 注册/更新/撤权竞态 | **ACCEPTED_DESIGN**：本地 desired state 为权威，native registration 为派生状态；按资产串行，持久 operationId + generation 对账 | 先撤销 Broker 实例能力，再 unregister；迟到 register ACK 不覆盖新代次，补偿注销过期 ID。只处理本服务拥有的注册 ID；register/update 与 IDB 无跨系统原子性。保留已装旧版本直至新版本切换确认，不能把 unregister 当 DOM/远端效果回滚 [EP-S1] |
| R8-EP-ADR-08 · Background/Cron | **ACCEPTED_DESIGN，R8.4**：Background 是无页面 DOM 的运行合同；Cron 是 TriggerDefinition，alarms 只负责唤醒 | 时区采用 IANA、固定解析版本，明确 DST gap/fold，默认 skip/coalesce，catch-up 有上限。持久 fireId/租约/代次借用现有 Journal；本地单次准入不等于远端 exactly-once。拒绝 SW 常驻、浏览器关闭继续执行、秒级准点承诺；Native 长任务独立授权 [EP-S4][EP-S5] |
| R8-EP-ADR-09 · GM 网络与 axiosx | **ACCEPTED_DESIGN，R8.3**：fetch 仍是浏览器 Web API；axiosx 仍是 OpenDesk SDK；GM adapter 在同一受信网络层补兼容语义 | `@connect ∩ 已安装批准 ∩ capability ∩ 浏览器实际 host ∩ 实际目标/redirect`。不通过注入 axiosx 改变页面 CORS，不让脚本自由选择扩展代理 URL。Promise/callback、abort、readyState、responseType 各有独立合同；复用 PR #20 唯一真实 HTTP fixture，不新增同类服务器 |
| R8-EP-ADR-10 · 单文件/多文件发布 | **ACCEPTED_DESIGN**：单文件编辑器与 ESM/package.json 是并行的创作入口，共同进入冻结资产、类型验证、同一发行/安装模型 | 优先验收 PR #22 的 authoring snapshot/build artifact 分离；不会在 main 重写另一套 source viewer。Source map 必须绑定构建模式、产物 hash 和原始路径；不把 bundle 当作者源码，也不强迫简单脚本建立项目 |
| R8-EP-ADR-11 · Native/Agent | **ACCEPTED_DESIGN，复用 PR #11**：Native 仅为可选 adapter，六项已有 RPC 进入存活 Sidebar 的同一 RunHost | 默认关闭、安装授权独立；关闭 AI/Native 后正式 Task 仍可运行。Bridge ACK 是准入不是结果；未知副作用不重放。不能因模拟帧 Host IPC 或有 continue-on-error 的绿色 CI 就合并整个 Native 产品链 |
| R8-EP-ADR-12 · UserCSS | **ACCEPTED_DESIGN，R8.6**：独立 usercss runtimeKind，复用资产、版本、匹配、安装状态与权限 | 首批仅受控普通 CSS 和基础元数据；不进入 JS Runtime，不获取 GM/任意 chrome 能力。Less/Stylus/uso、复杂 @var 和订阅同步延期，明确 style 冲突与撤除作用范围 |
| R8-EP-ADR-13 · 当前默认广泛权限 | **PUBLIC_RELEASE_GATE**：保留用户已授权开发场景，公开发行前单独审查 manifest 用途、最小权限和隐私披露 | `<all_urls>`、cookies/notifications 是当前资格，不是第三方脚本授权。不能说所有敏感 API 都可改 optional；debugger/proxy/declarativeNetRequest 等需按官方支持范围决定必需、独立发行配置或延期。不得为假想未来插件申请所有权限 [EP-S6][EP-S7] |
| R8-EP-ADR-14 · 防止三套版本/权限模型 | **ACCEPTED_DESIGN**：Task、GM 和可选插件共用规范 AssetRef 与 capability registry，适配层只投影能力 | 作者 `@version`、内部不可变 revision、安装 generation、触发 occurrence、GM API profile 分别记录，不混成一个版本号。禁止 TaskAuth/GMAuth/PluginAuth 三套独立权威；现有 IDB frameworkKV 做命名空间扩展，不新增第二持久库 |

### 10.1 对旧段落的执行级修正

1. 第 4.3 节的启动握手属于待证明方案。缺少真实脚本实例身份时，不能仅凭 `payload.worldId` 找到登记表就声称握手可信。E16（可信 GM 通道）是特权 GM 的硬前置，也是严格逐文档即时撤权承诺的前置。
2. 停用操作以 native 对账完成作为“后续文档已停用”的可观察边界。在其之前显示 pending；对于必须零窗口拒绝的 profile，应采用已证明的启动认证方案或拒绝该 profile。已经运行的第三方代码及 DOM 效果不可通用撤销。
3. Chrome 138+ 开关撤回后，存活 SW 的 `userScripts` 命名空间可能仍存在。Driver 的 availability 应实际调用方法并处理同步异常/Promise 拒绝，不能只判断对象存在。Chrome 133+ worldId、135+ execute、138+ 独立开关需要版本/能力探测 [EP-S1]。
4. Chrome 150+ `persistAcrossSessions` 仍不能代替持久 TriggerDefinition、启动对账与错过处理；138–149 与 Firefox/Safari 不继承该保证。unpacked 的频率行为不是生产准时证明 [EP-S4]。
5. 依赖字节锁只审批依赖内容，不能转化成整个脚本的权限批准。本轮修复 `page-dependencies.js`：迟到依赖报告只更新同依赖身份的资产列表，当前元数据重新准入；读取权限/文件/服务回复后及审批点击时都重新检查。`@antifeature` 是脚本自述的纯文本风险披露，缺少声明不代表安全；正式安装审查仍属后续任务。

### 10.2 一手资料（本轮重新核实）

- **EP-S1**：[Chrome User Scripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)，更新、执行世界、开关、注册和时机。
- **EP-S2**：[Chromium UserScript::MatchesURL](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/user_script.cc) 与 [User Scripts WebIDL](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/api/user_scripts.webidl)，dynamic UserScript 使用 OR；本轮观察 user_script.cc blob `672b6fe2fd92c7f83272549a1f2b44c29c5dc674`。
- **EP-S3**：[Chrome runtime MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender) 与 [Chromium runtime.json](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/api/runtime.json)；MDN 跨浏览器属性不能替代 Chrome 实现证据。
- **EP-S4**：[Chrome Alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)，150+ 持久化与唤醒边界。
- **EP-S5**：[Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)，全局态丢失与终止恢复。
- **EP-S6**：[Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)，optional 的例外及 origin pattern 的路径不作为网站授权边界。
- **EP-S7**：[Chrome Web Store Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)，最小权限、单一用途和用户提供脚本的受控 API 边界。

以上来源用于确定设计约束，未执行对应跨版本原生测试；引用官方规范不改变功能的 `NOT_TESTED` 状态。
