# OpenDesk Browser · 框架功能树与进度树（2026-10-13）

> **统一阅读入口（非第二份功能权威名单）**。审计 `main@e5b7c26145235e16372301ce2cddb574990a153e`，整理 18 个框架子系统与真实依赖；新 Agent 应重新读取最新 main HEAD 和实际 CI，不能把本日期当最新自动状态。
> 本文是框架层导航与任务顺序，不修改已有 188 条产品研究、18 域 74 叶浏览器能力、35 项正式 SDK 接口或旧 603+19 验收分母。

## 一、四层总账怎样读

| 层级 | 回答的问题 | 唯一事实来源/用途 |
| --- | --- | --- |
| L1 运行与产品路径 | 用户通过什么入口执行？Controller、Page、Tool、Scheduled、Cloud、Native | 框架实际用户运行链，不是 UI 数量 |
| L2 框架子系统 | 存储、Authority、Worker、SDK、Cookies、依赖、调度、云控各在哪里？ | 本树 F01–F18 汇总目录；源码仍为准 |
| L3 具体能力/API | 哪些已经接线、哪些只是候选、哪些故意不开放？ | `browser-contract.js`、74 叶功能审计、188 项产品能力规划；不改原分母 |
| L4 验收证据 | 源码、组件、构建、原生 Chrome、F3 是否各自通过？ | 原 workstream、CI SHA、packageHash、原生 Run/Result/receipt |

**本快照关键计数不是完成率：**R8 14 模块/188 项是产品能力规划；18 域/74 叶是 Chrome 能力发现；Browser SDK 正式 `35 = 26 IMPLEMENTED + 7 PLANNED + 2 NOT_EXPOSED`，不含未注册的 Cookie 候选；旧迁移保留 603 必选+19 增项及 F3 合同。绝不把 26/35、项目模块数或 222 条测试通过率解释成全框架完成百分比。

## 二、框架运行模型

```text
安装/授权的 Controller Task ──→ 唯一 Authority / original runs/@slot
                                           │
                                          RunHost → Worker → Page/Locator
                                           │
                              原 Result + commandJournal + retirement
                                           ↑
Scheduled Alarms → FireId ─────────────────┤
Cloud Provider → assignment/permit ───────┘（目前仍限定真实 Side Panel 执行）

Page USER_SCRIPT：经安装/授权后在专属网页世界运行与受管挂载
Installed Sidebar Tool：沙箱 → Browser SDK 合同 → Host 权限 → Chrome API
Native Workspace：本地文件/AI 编辑 → 原任务与页面执行路径（不另建 Run DB）
```

说明：既有 Scheduled 可见执行页只证明本地计划，Cloud HostOwnerLease 目前 dormant；两条触发链**尚未完成**统一 owner 和 source/generation/FireId CAS，不允许把关闭 Side Panel 后的 Cloud 长期执行宣传为已完成。

## 三、L1 → L2 → L3 框架功能树

状态说明：`源码有` ≠ `组件测` ≠ `原生局部` ≠ `最终发布`。`原生局部` 只绑定原 SHA/包/案例。

### 可信运行底座

```text
可信运行底座
  F01 MV3 / WXT / 固定构建入口 [SOURCE_CONFIRMED | BUILD_VERIFIED_SCOPED]
    F01.1 WXT 与 MV3 SW 固定入口 [源码有]
    F01.2 Standard / Developer 双版包 [源码有]
    F01.3 CSP / 依赖预算 / verify [组件测]
    F01.4 同一最终包发布验收 [待核验]
  F02 Authority / Broker / IDB / 权限 [SOURCE_CONFIRMED | COMPONENT_TESTED;NATIVE_SCOPED]
    F02.1 唯一 Host / Sender 身份 [源码有]
    F02.2 持久 Run/Result/commandJournal/slot [源码有]
    F02.3 安装与网站授权/撤销 [源码有]
    F02.4 跨执行环境全量故障证据 [原生待验]
```

### 浏览器与脚本能力

```text
浏览器与脚本能力
  F03 Controller / ChromePage / RunHost / Worker [SOURCE_CONFIRMED | NATIVE_CHROME_VERIFIED_SCOPED]
    F03.1 Controller 零参数 main / 受限 Worker [源码有]
    F03.2 现代 Locator/observe/fill 与历史兼容 [源码有]
    F03.3 Run/Stop/Result/retirement [原生局部]
    F03.4 旧全部接口与最终 F3 [待核验]
  F04 Page USER_SCRIPT / Page UI 生命周期 [SOURCE_CONFIRMED | NATIVE_CHROME_VERIFIED_SCOPED]
    F04.1 Page Candidate/安装/可用与运行 [源码有]
    F04.2 受管 UI、SPA/BFCache 清理 [原生局部]
    F04.3 匹配与 GM 全量兼容 [部分]
    F04.4 同候选全生命周期验收 [待核验]
  F05 Browser SDK 正式合同 [PARTIAL | COMPONENT_TESTED;NATIVE_PENDING]
    F05.1 正式 35 项接口及权限模型 [源码有]
    F05.2 26 个源代码登记 IMPLEMENTED [源码有]
    F05.3 7 个规划 / 2 个明确禁用 [规划/禁用]
    F05.4 35 项独立 Mac Chrome GUI 验收 [原生待验]
  F06 Cookies 可信 Browser SDK 与 Cookie Editor [PARTIAL | SOURCE_CONFIRMED_CONTROLLER_ONLY;NATIVE_PENDING]
    F06.1 Controller 原 Cookie 驱动读写 [源码有]
    F06.2 Browser SDK cookies 核心 CRUD [未实现]
    F06.3 store/partition/变更事件观察 [未实现]
    F06.4 Cookie Editor 真实站点读写闭环 [未实现]
  F07 Tabs / Network / Downloads / 其它 Chrome 能力 [PARTIAL | COMPONENT_TESTED;NATIVE_PENDING]
    F07.1 自有 Tabs Open/Focus/Get/List/Close [源码有]
    F07.2 主动 HTTP 与有界 Observe/截图 [部分]
    F07.3 下载与浏览器附加能力 [部分]
    F07.4 Window/Group/Bookmarks/History/DNR 等 [规划/禁用]
  F08 预置库 / 多文件 / 外部依赖运行 [PARTIAL | COMPONENT_TESTED;NATIVE_SCOPED]
    F08.1 Controller 预置 _/dayjs/OpenDeskLibs [源码有]
    F08.2 多文件 JS / React / Vue 受控构建 [原生局部]
    F08.3 按需依赖与固定哈希 [部分]
    F08.4 未预装包的外部获取与可复用缓存 [待核验]
```

### 任务与协调

```text
任务与协调
  F09 Scheduled Tasks R1 可见计划执行 [SOURCE_CONFIRMED | NATIVE_CHROME_VERIFIED_SCOPED_MAC_CFT]
    F09.1 ScheduleDefinition / FireId / Alarms [源码有]
    F09.2 可见 scheduledRunner=1 执行宿主 [原生局部]
    F09.3 Mac CFT 基础页面真实 Run/Result [原生局部]
    F09.4 重启/版本更新/撤权/多宿主完整矩阵 [原生待验]
  F10 Cloud Control R4 Provider 与原执行链 [SOURCE_CONFIRMED | COMPONENT_TESTED;BUILD_VERIFIED;NATIVE_IDB_COMPONENT]
    F10.1 Provider 配对、指派、许可、回执 [源码有]
    F10.2 Cloud→原 Run/Result/Authority [源码有]
    F10.3 原 IDB 游标分页与回滚 [原生IDB局部]
    F10.4 完整 Gate4 原生恢复和持续运行 [原生待验]
  F11 统一可见 Host Owner Lease [NOT_CONNECTED | COMPONENT_TESTED_ONLY]
    F11.1 CAS Lease 基础源码 [源码有]
    F11.2 可信 TAB/documentId 注册和 Runner 身份 [未实现]
    F11.3 Cloud claim/admission/Worker 三处 fence [未实现]
    F11.4 双 Host 争用和旧 owner 拒绝原生验证 [原生待验]
  F12 Cloud / Local 定时计划单源幂等 [NOT_IMPLEMENTED | NOT_TESTED]
    F12.1 本地 FireId 唯一准入 [源码有]
    F12.2 Cloud/local source 所有权定义 [未实现]
    F12.3 来源切换原子 generation [未实现]
    F12.4 云+本地并发原生拒绝重复 [原生待验]
```

### 桌面与产品承载

```text
桌面与产品承载
  F13 Native Host / Go / Local Workspace [PARTIAL | COMPONENT_TESTED;NATIVE_SCOPED]
    F13.1 Native 消息桥和本地源码读取 [源码有]
    F13.2 工作区文件树/预览/授权保存 [部分]
    F13.3 Go Host 无 Node 安装路径 [部分]
    F13.4 真实 Chrome 升级/回滚/用户 Mac [原生待验]
  F14 开发工作台 / 多文件脚本 / AI 流程 [SOURCE_CONFIRMED | NATIVE_CHROME_VERIFIED_SCOPED]
    F14.1 开发 Tab 草稿与 Controller 执行 [源码有]
    F14.2 多文件和 React/Vue 运行 [原生局部]
    F14.3 AI/Workflow 生成 Task 与授权 [部分]
    F14.4 真实终态/版本/重启完整矩阵 [原生待验]
  F15 Side Panel / 控制台 / R27 UI 系统 [SOURCE_CONFIRMED | COMPONENT_TESTED;NATIVE_SCOPED]
    F15.1 Side Panel 6/7 Tab + 开发/我的/云控 [源码有]
    F15.2 共享 R27 tokens / layout [源码有]
    F15.3 独立 Cloud Observer-only 控制台 [源码有]
    F15.4 无障碍/响应式/200% 验收 [原生待验]
  F16 已安装工具 / Official Tools 生命周期 [SOURCE_CONFIRMED | COMPONENT_TESTED;NATIVE_SCOPED]
    F16.1 第三方 Side Panel 工具沙箱/通信 [源码有]
    F16.2 官方工具安装/更新/禁用/卸载 [源码有]
    F16.3 Cookie Editor UI 导入导出 [源码有]
    F16.4 Cookie Editor 真实浏览器 Cookie [未实现]
  F17 应用市场 / 安装更新发布渠道 [SOURCE_CONFIRMED | NATIVE_CHROME_VERIFIED_SCOPED_MAC_LINUX]
    F17.1 目录/不可变包与安装意图 [源码有]
    F17.2 安装更新卸载及权限 [原生局部]
    F17.3 多平台实际 Chrome 市场测试 [原生局部]
    F17.4 正式 HTTPS 和 CWS 放行 [阻断]
```

### 验收与发布

```text
验收与发布
  F18 证据治理 / F3 / ZIP / 长稳 [PARTIAL | HISTORICAL_SCOPED_ONLY]
    F18.1 CI 流水线与按 SHA 证据复用 [源码有]
    F18.2 历史定向 Node/真实 CFT 证据 [源码有]
    F18.3 完整同包 F3 / 正式 ZIP 安装 [待核验]
    F18.4 跨功能 1h/24h/72h 长稳 [未测]
```

## 四、L4：完成进度不能混合计分

| 模块与用户结果 | 真实已知证据 | 完整放行尚缺 |
| --- | --- | --- |
| **F01 MV3 / WXT / 固定构建入口**（SOURCE_CONFIRMED） | Standard/Developer 独立打包与部分真实 Chrome 已有固定候选证据 | 最终同包 F3/ZIP/商店发布、升级及资源预算全局关闭未完成 |
| **F02 Authority / Broker / IDB / 权限**（SOURCE_CONFIRMED） | 唯一 Broker、IDB v2、Run/Result/slot、安装与站点许可已有真实实现和历史回归 | 取消、撤权、Quota、重启等跨子系统同候选全量证明未关闭 |
| **F03 Controller / ChromePage / RunHost / Worker**（SOURCE_CONFIRMED） | 真实定位、填写、点击、等待、Stop、持久 Result 与释放已在固定候选验证 | 不是完整 Puppeteer/Playwright 等价物，旧全接口同包迁移 F3 尚未证明 |
| **F04 Page USER_SCRIPT / Page UI 生命周期**（SOURCE_CONFIRMED） | 安装与 Page UI 部分真实运行、SPA/BFCache/撤载受管清理有固定候选证据 | GM 全面兼容、全部 @grant/@match/@run-at、跨站点升级与正式发行尚未完成 |
| **F05 Browser SDK 正式合同**（PARTIAL） | 本快照注册 35 项：26 IMPLEMENTED / 7 PLANNED / 2 NOT_EXPOSED；接口登记不等于逐项可用/原生通过 | 正式 Cookie、更多 Tabs/Windows/Downloads、按权限环境分层原生测试不足 |
| **F06 Cookies 可信 Browser SDK 与 Cookie Editor**（PARTIAL） | 现有 Controller getCookies/setCookies/deleteCookiesByUrl；Cookie Editor 目前仍为内存 UI | 未注册并接通 browser.cookies.*；store/partition/onChanged/clearSite/Host 权限及真实 Chrome 写入缺失 |
| **F07 Tabs / Network / Downloads / 其它 Chrome 能力**（PARTIAL） | 自有 TabRef、请求与有界网络观察、截图/下载基础已有部分 Host 接线 | Window/Group/History/Bookmarks/DNR/录制/录屏等有候选或刻意不开放，不是现成正式接口 |
| **F08 预置库 / 多文件 / 外部依赖运行**（PARTIAL） | 零参数 main、固定预置库、按需资源及 JSX/SFC/ESM 多文件已有实际源码与部分浏览器证据 | 未覆盖第三方任意包；外部获取、哈希授权、缓存及每个 USER_SCRIPT 世界的稳定使用矩阵仍需验证 |
| **F09 Scheduled Tasks R1 可见计划执行**（SOURCE_CONFIRMED） | 固定 7bd7352 候选 Linux/macOS CFT：Task 安装、Alarms、可见 Runner、FireId→原 Run/Result PASS | Mac 双 Host/重启/升级/撤权/未知效果、长时运行与缩放未全部验证；非用户本人 Mac |
| **F10 Cloud Control R4 Provider 与原执行链**（SOURCE_CONFIRMED） | 222/222 CI + 双包构建（7e38eec）；Linux CFT 真实 IndexedDB 100/1000/10000 游标；旧 R1–R3 原生链另有候选证据 | 真实 Gate4 运行中 Stop、撤权、未知副作用的原 profile 恢复、Provider 1/24/72h 与长期 Runner 未关闭 |
| **F11 统一可见 Host Owner Lease**（NOT_CONNECTED） | 原 IDB CAS Lease 的 claim/renew/release/assertDispatch 基础及 Node 测试存在，但未在实际 Cloud 领取链使用 | 可见 Runner sender、ownerKind/documentId/generation/fencingEpoch 与 claim/admission/Worker fence 未接 |
| **F12 Cloud / Local 定时计划单源幂等**（NOT_IMPLEMENTED） | 本地 FireId 已独立持久，但 Cloud 不具备同一计划 source/generation 单源 CAS | local alarm 和 cloud notice 同时到达可能存在未来双派发风险，尚未安全开放云源 |
| **F13 Native Host / Go / Local Workspace**（PARTIAL） | Native 桥、本地文件与 Workspace UI 已有源码；Go 入口和多平台部分原生候选证据 | 真实 Chrome 配对/Go 安装升级与回滚、用户 Mac 日常环境及跨 profile/Windows 未全验 |
| **F14 开发工作台 / 多文件脚本 / AI 流程**（SOURCE_CONFIRMED） | Developer JSX/SFC、Standard 普通 JS、运行/Stop/本地 CLI 在固定 Chrome 候选有代表性实测 | 全量 AI→Task 授权、跨环境回滚、项目外部依赖大矩阵和正式发布未全部通过 |
| **F15 Side Panel / 控制台 / R27 UI 系统**（SOURCE_CONFIRMED） | 正式 Side Panel 导航、云控只读控制台、共享 CSS tokens 已有真实源码 | 300/360/420/520px、125%/200%、ARIA、暗色及完整错误态没有全局同包闭环 |
| **F16 已安装工具 / Official Tools 生命周期**（SOURCE_CONFIRMED） | 工具隔离、包身份、安装更新撤销、若干官方工具已有测试和历史原生证据 | Cookie Editor 真实 Cookie 写入尚未完成；部分工具 UI/恢复候选未通过最终包门槛 |
| **F17 应用市场 / 安装更新发布渠道**（SOURCE_CONFIRMED） | Linux/macOS CFT 有真实下载安装/升级/卸载及一定故障恢复证据；固定候选 16/16 安装例 | 正式公网 HTTPS、CWS、长期生产 ID、API ACK 真实丢失/Quota/TTL 等最终门禁未完成 |
| **F18 证据治理 / F3 / ZIP / 长稳**（PARTIAL） | 逐专项已有很多真实 Node、构建、Linux/macOS Chrome 证据并保留了原始失败 | 完整原 603+19 合同、独立 B05、1000 mixed / 10 reconnect / 2禁插件、资源 baseline、最终同包 F3 ZIP 未闭环 |

### 原生证据锚点（严格固定候选）

- **Scheduled Tasks**：固定 `7bd7352` 的 [macOS Chrome CFT #38269870147](https://github.com/shopable-ai/opendesk-browser/actions/runs/38269870147) 真正通过 Task 安装→Alarms→可见 Runner→原 FireId/Run/Result。不是用户 Mac、完整 R2 或云控持续运行 PASS。
- **Cloud R4**：固定 `7e38eec` 的 [CI #38265004633](https://github.com/shopable-ai/opendesk-browser/actions/runs/38265004633) 222/222 组件 PASS、双构建/verify PASS；固定 `658269e` 的 [Linux CFT IDB #38260781397](https://github.com/shopable-ai/opendesk-browser/actions/runs/38260781397) 是 100/1000/10000 游标局部原生，**不是**实际 Cloud Gate4 及长期任务。
- **Marketplace**：[R5 证据](../../framework/workstreams/app-market-r5.md) 记录 Linux/macOS 实际 Chrome 安装/升级/卸载局部 PASS；正式 HTTPS/商店身份/真实 Quota 与 ACK 丢失仍阻断发布。
- **编译器/开发**：固定 `176bb191` [macOS Chrome CI #38247467657](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657) 有 Standard 普通 JS 和 Developer React/Vue 的真实浏览器 Run/Stop；不等同整个工具矩阵、Native 安装/F3。
- **Browser SDK**：参见 [逐项机器账本](../../framework/workstreams/browser-sdk-acceptance.json)；已登记的 IMPLEMENTED 只证明源码状态，本快照不追加任何无证据的 Mac Chrome PASS。

## 五、进度树（按依赖，不按 UI 页面数量）

```text
Framework R-next
  已实施　总账架构：稳定 F01–F18；原 188/74/35/603+19 不重建
  P0 并行安全主线
    T01 Cookie SDK → Cookie Editor 真实站点 CRUD、Store/Partition/Observe
    T02 Cloud Gate4 → 原 Run/Result/Stop/撤权/未知效果一致性
    T03 35 项 Browser SDK → Host/权限/拒绝/真正调用的逐项证据
  P1 性能与统一 Owner（前置 Gate4）
    T04 Cloud reconcile、Scheduled 大历史有界扫描
    T05 单一可见 Runner + HostOwnerLease（依赖 T02；不安全不开）
    T06 Local/Cloud source/generation/FireId 幂等（依赖 T05）
  P1 工具与开发体验
    T07 预置→缓存→外部按需库、多文件/React/Vue 实际场景
    T08 Cookie Editor + 云控/侧栏 R27 交互、窄屏和缩放（依赖 T01/T05）
  Final
    T09 1h/24h/72h、原生 Chrome、权限/重启、最终 F3/ZIP（依赖所有 Gate）
```

### 按任务执行与验收

| 任务与状态 | 前置依赖 | 实施结果与放行条件 |
| --- | --- | --- |
| T00 DOCUMENTED |  | 功能树 L1-L4、进度树、索引、证据等级与稳定 ID。**PASS 门槛**：所有节点具备稳定 ID、源码指针、历史证据与下一动作；不改旧188/74/35/603分母 |
| T01 TODO | T00 | 可信内置 Cookie Editor 只能操作用户批准的网站、存储区与分区键；get/getAll/set/remove/clearSite/getStores 与 onChanged 分层开放；契约→Host→真实 Chrome cookies→返回/拒绝/撤权/持久日志。**PASS 门槛**：真实 Mac/CFT Cookie 正反向 CRUD、HttpOnly、SameSite、Partition、Store 与撤权；原生原始收据 |
| T02 TODO | T00 | Cloud Gate4 原 Run/Result/receipt/commandJournal 不重跑；运行中的 Stop、grant/site revoke、Provider lease 丢失与未知效果；配额/回滚及服务端对账正确。**PASS 门槛**：原 RunId 关联不变、停止后的 Worker/slot released、缺失证明时 OUTCOME_UNKNOWN、无副作用重放 |
| T03 TODO | T00 | 35 正式 Browser SDK 每项 Host/权限/失败路径审计；Tabs owned ref + observe/screenshot/download 用户手势；规划项和 NOT_EXPOSED 不默认为已实现。**PASS 门槛**：逐项源代码、组件、完整 Chrome 权限和 GUI 证据，不变更既有统计口径 |
| T04 TODO | T02 | Cloud reconcile/Stop 和 Scheduled list/reconcile 的 tx.all 大历史扫描审查；按原 IDB 索引、游标/有界批量修复，优先读写同库；100/1000/10000 和升级/Quota 性能。**PASS 门槛**：量化扫描、内存、响应、主线程阻塞与回滚，不能只截断 JSON 输出 |
| T05 BLOCKED_UNTIL_GATE4 | T02 | 只复用 tool.html?scheduledRunner=1 可见运行页；真实 TAB/documentId/registrationId 与 CAS HostOwnerLease；cloudNext/Resolve 精确受限 RPC + claim/admission/Worker 全链路 fence。**PASS 门槛**：Side Panel 与 Runner 竞争唯一 owner；旧 generation/epoch 不得派发；缺原生证据仍禁用云持续运行 |
| T06 BLOCKED_UNTIL_OWNER | T05 | 共享 source/generation/FireId 原事务；Local alarm 与 Cloud notify 并发至多一次准入；切换来源需用户授权；已知/未知原 Run 禁重放。**PASS 门槛**：多 Host 并发/重启/断网真实持久反向测试证明没有重复副作用 |
| T07 TODO | T00 | 预置库/已缓存/外部未收录依赖三级策略；Controller/Page/工具四环境隔离与多文件/React/Vue 示例；包锁、版本哈希、授权、离线和 ESM 错误。**PASS 门槛**：标准案例真实 Run/Stop/结果及权限拒绝；缓存复用时间与网络请求数可观察 |
| T08 TODO | T01, T05 | Cookie Editor 真实接入、Cloud 控制台故障态；300/360/420/520px、125/200% 缩放与键盘焦点；统一 R27 tokens，无新 UI 框架。**PASS 门槛**：真实窄窗口、Mac CFT 原生指针/键盘截图及实际用户可操作闭环 |
| T09 BLOCKED_DEPENDENCIES | T01, T02, T03, T04, T05, T06, T07, T08 | 1h/24h/72h 真实持续执行与恢复；最终唯一生产包/开发包签名及散列/标准权限；F3/ZIP/603+19 与服务/市场真实发布准入。**PASS 门槛**：完整独立证据和反向失败记录；十项分数只针对实际全部验收通过的范围打分 |

## 六、如何更新账本而不互相覆盖

1. **先查最新 `main`、目标源码、原工作流和同 SHA CI**；只允许修改当前任务自己的文件。绝不依靠旧聊天猜测最新 HEAD。
2. **新增一项功能**：先定位 R8 188 条或 74 叶子现有稳定 ID；Browser SDK 新正式接口必须实际进入 `src/framework/sdk/browser-contract.js`，并补 Host/Schema/权限/拒绝测试；未批准候选只停留在候选目录。
3. **改一个子系统**：先修改源文件与对应独立 workstream；补组件、构建、真实 Chrome 的来源与 packageHash。最后更新本树中的叶子状态及 `Fxx` 所关联的 `Txx`，不反向把本树当作测试收据。
4. **证据缺失时写明 NOT_TESTED / NATIVE_PENDING**；旧已通过原生案例保留旧候选身份，受影响新包另补必要测试，不能以一次 CI 绿灯替代 F3。
5. **长期 Runner 门禁**：只允许复用 `tool.html?scheduledRunner=1` 的受信可见 TAB；必须绑定实际 Chrome documentId、ownerEpoch、原 Authority/slot/permit、Worker 前 fence。不能创建隐藏常驻执行器和第二 Run DB。
6. **并行写入**：仅 `main`，不建分支/worktree/PR；逐文件 SHA 检查、非强制快进；Mac Chrome profile、固定端口、dist 和数据库由各专项 owner 独占。

## 七、独立文档归属（只增加总览，不迁移原账本）

- 产品机会/竞品功能：[R8 188 项](../../product/browser-automation-feature-catalog-r8.zh-CN.md)，**研究规划**。
- Chrome API 覆盖：[18 域/74 叶](../../api/browser-capability-universe.zh-CN.md)，**能力审计**。
- 正式 Browser SDK：[合同源码](../../../src/framework/sdk/browser-contract.js)、[验收 JSON](../../framework/workstreams/browser-sdk-acceptance.json)、[扩展候选](../../api/browser-sdk-full-interface-inventory.zh-CN.md)。
- 原迁移合同：[source-compatibility-ledger.json](../../framework/source-compatibility-ledger.json)、[testing-guide](../../framework/testing-guide.md)，**不因新增总览篡改 603+19**。
- 专项结果：[Scheduled](../../framework/workstreams/scheduled-tasks-r1-20261012.md)、[Cloud R4](../../framework/workstreams/cloud-control-r4-20261012.md)、[Cookie Editor](../../framework/workstreams/cookie-editor-r1.md)、[App Market R5](../../framework/workstreams/app-market-r5.md)。
- 机器可读镜像：[framework-feature-progress-20261013.json](../../framework/workstreams/framework-feature-progress-20261013.json)（从 L2/L3 标题与 Txx 依赖维护总览，**不是新的 API 或原生账本**）。

## 八、特别排除

- Page QA Inspector 已标记 `DEPRECATED / SOURCE_REMOVED_FROM_MAIN`，不能把它纳入正式浏览器框架可用能力。
- 网页采集业务、语音控制，以及任意 CDP/Debugger、隐藏持续 Worker 不属于本轮框架可调用完成口径。规划或明确不开放的项目不能因为没有代码而在完成率中算作缺陷。
- 总体“95 分以上”必须分别给架构、安全、可靠性、UI、可访问性、性能、测试、原生浏览器、恢复与发布独立证据；本树所有未经正式验收的评分均 `NOT_VERIFIED`。
