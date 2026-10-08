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

## 2. 程序四维合同，而非把“运行形态”混成一维

| 维度 | 取值 | 说明 |
| --- | --- | --- |
| Authoring / Source | single classic .user.js；single async function main；multi-file ESM/package.json | 仅编写/构建形式，不自动获得更多权限；最终冻结来源 JS 字节、sourceHash 与依赖 manifest |
| Runtime Kind | page-userscript；controller-task；background-script（未来）；usercss（未来） | 不同执行宿主、目标与脚本上下文；复用身份、审核、存储和日志 |
| Trigger | manual-preview；installed-auto-document；manual-run；alarm-schedule（未来）；browser-event（未来）；external-agent（可选） | schedule 是触发器，不应自动创建新 Controller/Task DB；完整生命周期必须写入适配 |
| Trust / Release | Draft → Candidate → Verified → Available → Installed → Enabled/Disabled → Retired | Page 与 Controller 使用同样“证据门槛思想”，但验证器、native receipts、运行效果不可互换 |

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
