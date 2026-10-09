# OpenDesk Browser R8：产品能力路线、三页签信息架构、验收与专家独立审计

> **2026-10-09 当前交付次序更新**：请先读 [用户目标与近期优先级](browser-automation-r8-product-guide.zh-CN.md)。原 P0–P4 是功能域的长期规划，不代表下一次 PR 的顺序；眼下先完成 Codex 本地编辑与真实浏览器执行闭环，再完成 P0 Page 安装自动运行。以下原始研究与阶段内容保留作历史和能力范围依据。

> **R8 工程执行总计划**：已另行保存 [R8.0～R8.6 实施计划（40 项工程任务，关联 188 项功能 ID）](browser-automation-r8-implementation-plan.zh-CN.md)。本文保持产品 P0～P4 方向、UI 和用户目标；具体工程依赖、优先实施工作包、PR #11/#20/#22 边界与真实 Chrome 验收门槛以执行总计划为入口。该链接不表示功能已经完成。


> 2026-10-09；状态：**RESEARCH / PROPOSED / PLAN，非功能落地**。以 2026-10-09 核查的 GitHub main 初始 HEAD fa8e3fba80ca6f86a2f8160c08d19c6f925ce670 为源码基线；R8 仅提交研究文档。与 [R8 竞品调研](../architecture/browser-framework/userscript-competitor-research-r8-20261008.zh-CN.md)、[GM 兼容矩阵](../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md)、[R8 ADR](../architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md) 同时阅读。下一轮实施必须先 fetch 最新 main，检查并行 PR 与原生 Chrome 条件。

## 1. 真实完成度（按证据而非宣传）

| 能力 | main 状态 | 依据及本轮未关闭 |
| --- | --- | --- |
| 三页签 我的任务 / 发现 / 开发 | SOURCE_IMPLEMENTED（src/ui/tool.html、task-workbench.js） | 已有历史 Node UI 测试；R8 未实跑构建或 Chrome |
| Controller Task、Task Revision、RunHost、现代 Locator | SOURCE_IMPLEMENTED（src/platform/tasks、src/framework/locator.js、src/run-host.js） | 已有历史测试与 R6 文档，不能宣称外站成功率/Native E2E |
| 单文件 Controller JS 直接运行 | SOURCE_IMPLEMENTED（src/ui/script-editor.js） | 真实新 Profile 验收 NOT_TESTED（本轮） |
| 单文件 Page DOM 即时预览 | SOURCE_IMPLEMENTED / 历史 COMPONENT_TESTED（src/scripting/user-scripts/preview.js） | 非正式安装；真实 Chrome USER_SCRIPT 效果 NOT_TESTED（本轮） |
| 多文件 ESM/package.json 构建 | SOURCE_IMPLEMENTED / 历史 COMPONENT_TESTED（scripts/validate-program-project.mjs、build-program-project.mjs） | 构建资产被标 BUILT_UNVERIFIED；不能自动发布 |
| 传统 @require 元数据/依赖审核/冻结 | SOURCE_IMPLEMENTED / 历史 COMPONENT_TESTED | 已有依赖锁与离线缓存；正式 native automatic run 尚未验证 |
| Page Program 注册描述编译 | SOURCE_IMPLEMENTED / 历史 COMPONENT_TESTED（page-program-package.js） | **调用 chrome.userScripts.register 的正式持久安装与对账 MISSING** |
| GM_* / GM.* | MISSING | @grant 非 none 目前拒绝；network/sdk 存在不等于 GM 兼容 |
| @background / @crontab、UserCSS | MISSING | Chrome Alarms 权限当前 manifest 也未声明；未来实施需单独审计 |
| Native Agent Bridge | PR_ONLY：PR #11 open/draft，**不在 main** | R6.2 协议文档存在，真实 Codex/Chrome native E2E 未证明 |
| 完整录制/AI Skill/MCP 市场 | MISSING / PROPOSED | R6 只确定可选 Agent 方向，不可冒充现有功能 |
| R8 此轮完整 CI/原生效果 | NOT_TESTED | 本轮只读真实远端代码并编写文档，不触碰运行源码 |

不要重新制作 Sidebar，不改变原三页签 HTML。发现当前是本地任务查找，不应未经决策变成联网市场。

## 2. 分期开发总览

| 阶段 | 用户价值 | 真实代码复用 / 依赖 | 改动范围与权限 | 主要风险及复杂度 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| **P0 — 正式 PageScript 安装与自动运行** | 普通用户导入脚本、批准网址、安装/启停、刷新后自动生效 | 复用 metadata/dependency-manager/page-program-contract/page-program-package；Broker/Authority；IDB frameworkKV；现有 Sidebar + 管理页面 | src/scripting/user-scripts/、src/platform/host/、src/platform/storage/、src/sw.js、src/ui/ 对接；**原则上不增加 manifest 权限**，需要已有 userScripts 开关与 real host grants | **高**：应用授权/原生注册非原子、撤权 race、SW 生命周期、跨 frame，文档启动握手可能延后 document-start | 固定 hash、Node/Build、真 Chrome 新 Profile 安装→reload once/nonmatch zero/disable next-document zero/重启与升级对账、真实 native receipt；本地 Codex 必需 |
| **P1 — 常用 GM API / 导入 / 受控更新** | 迁移典型油猴脚本，持久值、样式、菜单、网络与资源 | SDK storage/network/notifications/tabs/downloader、既有 DepLock、Broker | 新 src/scripting/user-scripts/gm-adapter/、network response adapter，必要 Host 能力细化；不默认增加 Cookie/Downloads/Clipboard 全部 grant | **高**：GM sync vs Promise、callbacks、@connect、跨域/CORS、滥用流量 | API 行为矩阵每条有 Node + Chrome 138+/152+ 真机、权限/撤权/超时、断网依赖，版本升级权限 diff 与失败回滚；本地 Codex 必需 |
| **P2 — 有边界的后台/定时、日志/备份、基础 UserCSS** | 低频定时增强、可靠状态可查、任务导入导出、网页主题 | 现有 Run Journal、Storage、Host、UserScripts 平台；另加 ScheduleDriver/StyleDriver | 需要评审声明 alarms（当前 manifest 未列）；可选 Offscreen 或现有可见 Host，不承诺后台永久在线；CSS 存储复用版本机制 | **高**：SW 30s idle、Chrome alarm 允许延迟、时区/DST、missed run、持续任务退出 | 睡眠/断电恢复模拟、真实 Chrome restart、进程杀死、补跑策略、同一 fireId 不重复提交、style 启停；本地 Codex 必需 |
| **P3 — AI 生成、页面录制、Skill / Agent Tool** | AI 制作可靠脚本，生成后可独立运行 | R6 Agent→Task 合同、R5 Locator、可选 Native PR #11（待真实验收/合并） | 可选 Bridge、外部 Tool Facade 和页面录制 UI；涉及 debugger 等须独立上架/权限评审，不默认扩大权限 | **高**：幻觉 selector、未知 side effects、提示注入、CDP 警告、Agent 自主动作风险 | AI run 后断开模型，冻结脚本→Task Verified→安装后两次独立运行；高风险动作用户确认；Codex + Chrome 必需 |
| **P4 — Firefox/Safari、同步和社区生态** | 跨平台迁移、备份云同步、订阅/共享 | 已有 Authoring 项目和安装型 manifest；按适配驱动分别实现 | BrowserAdapter、Extension Store/CWS 审核、可选独立账户服务；浏览器相关 manifest/profile | **很高**：跨浏览器不一致、许可证/供应链、账号/隐私成本、同步冲突 | 按浏览器版本的完整兼容矩阵、权限提示和端到端跨端恢复；多平台本地原生验收 |

**排序说明**：P0 第一，因为普通用户连安装并随站点自动执行尚无正式主链；如果先实现大批 GM，仍无法形成可用产品。P1 G0/G1 可以与 P0 结束阶段评估，P2 Cron 必须等待可安装身份和持久回执，不先承诺后台运行。P3 R6 外部 Agent 独立测试可并行，但不能抢走 P0 的唯一 Authority。

## 3. P0 详细分解与验收门槛

P0.1 源码盘点与资格：
- 重新 fetch 最新 main、PR #11/#20、AGENTS.md 和用户明确排除的并行工作；本地可访问时 git status 工作区洁净，不覆盖其他 Codex 文件。
- 对 PageProgram manifest/真实依赖锁/USER_SCRIPT world 的安全校验补静态和组件测试，保证不把 Controller 的 Candidate/RunResult 偷用作 Page Type Proof。
- 定义 Page Draft/Candidate、Verified/Available/Installed/Enabled 的类型专属记录及 UI 错误状态，保留 frameworkKV，不再建数据库或重写 Task。

P0.2 受信注册器：
- 使用独一 Authority 签发 installed+enabled、namespace/program/revision/sourceHash/manifestHash/permission checks；生成的注册描述是纯值，不能由网页消息伪造。
- 单 writer 注册 reconcile：desired persistent set vs chrome.userScripts.getScripts native set；无 id 重复；update/rollback; extension update 清空重注册，SW startup 对账；注册失败报告部分状态。
- 停用、卸载和权限撤销发 native unregister；在注册到实际执行之间加每文档授权 fence 或经证据证明足够强的阻断方案。若异步 gate 无法保留 document-start 预期，必须显式标记受限语义。
- 失败关闭：Chrome 138+ Allow User Scripts 关闭时不可假定 API 属性仍可靠；调用可抛错，应提示用户前往扩展详情，绝不悄悄切 MAIN 或运行在 Controller。

P0.3 UX/真实使用：
- 原“开发”折叠区内保留 Page 即时试运行入口，增加独立“安装此固定版本”流程；普通用户由本地“发现→导入”打开完整管理页审查并安装。
- 每一条已安装 Page 卡片展示运行站点、状态、源/版本、权限与停用；Controller 卡片与结果入口不变。
- 外部 .user.js 来源 URL 只能打开**独立审查页面**，要求确认版本与权限，不允许打开 GreasyFork/ScriptCat 商店页面即自动安装。
- 真实新 Profile 完整演练：导入 → 字节审核 → hash → 原生类型验证 → Available → 确认安装 → 匹配页面刷新一次 → 不匹配不执行 → 关闭重启后恢复 → 停用后下次不执行。

P0.4 运行闭环测试：
- Chrome 138+ / 152+ (如本机可用)；开启/关闭 Allow User Scripts；网站限权/撤权/重新授权；HTTP、HTTPS、两个 host、subframe 跨源，about:blank 与受限 chrome:// 必须失败。
- document-start/end/idle、SPA pushState/replaceState/popstate、跨 frame/frame removal、导航到相同 URL 不重复文档注入、并发首次打开多个标签。
- @require 多项顺序、不同脚本使用不同审批、恶意内容、依赖断网缓存复用、hash 篡改拒绝、更新权限增加要求重新确认；版本切换失败回滚旧 sourceHash。
- Service Worker 被浏览器回收、扩展 reload/update、浏览器重启、native register 重入、重复执行/权限移除竞态、存储迁移不丢 Controller 已安装任务。
- 区分原生 Chrome 获得方法 ack、脚本确实改 DOM、更新后的自动执行和全部用户操作完成，这些验收是四层不同证据。

## 4. P1 的 GM API 分批投入

- **G0（先做）** GM_info / GM.info、GM_addStyle、GM_log；仅 USER_SCRIPT 文档隔离，方法参数/返回值/撤销语义写入类型声明。
- **G1** GM.getValue/setValue/deleteValue/listValues Promise、GM Resource Text/URL、脚本菜单与跨页 change listener；传统同步 GM_getValue 只有经启动握手、本地镜像一致性测试通过再可实现。现有 AppStorage ≠ GM 分区。
- **G2** GM_xmlhttpRequest / GM.xmlHttpRequest、GM_download、GM_notification、GM_openInTab；跨域 HTTP 复用受控 NetworkService，但旧 callback 事件、AbortHandle、headers、progress/binary 需要明确支持边界。@connect + Browser origins + script grant + application approval 必须全部通过；不借页面 fetch 绕 CORS。
- **G3（延后/可不实现）** GM_cookie、GM_setClipboard、unsafeWindow、MAIN world 以及 GM_webRequest。跨域 Cookie/MAIN 高敏、Chrome MV3 与各浏览器差异大；非 P1 发布必要能力。
- 每个 GM 的完整信息见 [R8 API 级矩阵](../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md)。别把接口名称存在当兼容标记；默认 Node 模拟不能覆盖页面真实浏览器权限。

## 5. Sidebar 产品信息架构（**必须保留三个一级页签**）

**我的任务**（默认）：安装的 Controller/页面脚本/未来 Background/Style 按任务卡片展示。主动作仍是用户任务“运行/停止”或 Page “启用/停用”；详情里显示当前网页是否匹配、版本、Last run、授权与出错；底层区分 Page 自动执行与 Controller 手动 Run，不能用一个假“运行成功”状态替代。

**发现**（维持现有产品语义）：默认是**已安装本地任务**的搜索/筛选；“导入”打开原有独立完整目录和审核页面。之后如支持 GreasyFork/ScriptCat 等外部脚本发现，建议只放独立页面外链/明确“浏览脚本来源”，不在 Sidebar 创建新的 marketplace tab，更不静默安装。

**开发**：保留原 JavaScript 编辑器与底部 “运行草稿 / 保存版本 / 停止”、Controller page/Locator、当前 Page DOM 即时预览与依赖折叠区。附加很少的“安装固定 Page 版本”链接/入口，复杂代码编辑和版本比较在独立全页开发器。多文件 ESM 继续本地 build → program.js → 现有草稿导入/预览；未来有自动导入也必须沿用同一后端。

### 五条完整用户路径

1. 普通用户安装 .user.js：可信导入操作 → 源码/版本/站点/GM 权限/@connect/依赖来源审核 → 必要 native 验证 → 明确安装 → 刷新目标页自动生效 → 我的任务停用/恢复；不支持的 GM 指令显示精确原因而非跳过。
2. 开发者临时调试：Sidebar“开发”粘贴 async function main() → 现有“网页用户脚本试运行”或 Controller“运行草稿” → 看真实日志/结果；**手动预览不等于已安装**。
3. 高级 ESM：package.json + src/main.js 静态检查 / npm ci → 输出固定 hash program.js → Sidebar 导入草稿 / 按类型试运行 → 冻结受审版本，复杂代码留全页管理。
4. 普通用户 Controller：我的任务 → 参数 → 运行 → 持久结果/Stop，完全不依赖 Agent，也不自动匹配每页执行。
5. AI Agent：R6 外部工具观察与行动 → 冻结 JS → 相同脚本真实跑两次 → Source Revision/Candidate/Verified/Available → 用户安装 → 关闭 AI Agent 后仍可运行；任何真实风险操作需显式确认。

### HTML 原型待办（P0 仅做文字/轻量入口，不重做 Sidebar）

推荐放在现有 prototypes/sidebar/r8/ 或 examples/ui/，不得放仓库根目录，不得取代 src/ui/tool.html：
- page-script-install-review.html：审查外部脚本来源/权限/依赖/差异并明确安装。
- page-script-installed-card.html：我的任务内 Page/Controller 两种卡片及状态区分。
- page-script-version-diff.html：版本升级权限与来源 diff、批准、回滚（独立完整页面）。
- gm-permission-consent.html：目标 host、script @connect、Capability 与浏览器授权四层确认（P1）。
- scheduled-task-config.html：Cron 时区、错过执行策略、运行可靠性声明、历史（P2）。

交互原型必须无需复杂启动即可独立浏览，视觉质量基准沿用 R6/R5 Sidebar；真实 Chrome UI 仍须另验，原型截图不是产品已完成证明。

## 6. 独立反方审计（设计准备度，非经过测量的质量认证）

独立分数不作平均，不用高 UX 分遮盖安全/Native 失败。分数是**截至 R8 研究阶段的主观设计与可实施准备度**，不是产品兼容率、测试覆盖率或成功率：

| 维度 | 评分 /100 | 依据与未关闭事项 |
| --- | ---: | --- |
| 产品定位 | 92 | 一核 + 双脚本 + 可选 Agent 清晰；普通用户 Page 闭环尚未完成 |
| 用户脚本兼容性 | 65 | 解析/依赖锁基础扎实但 GM 空白，正式自动安装缺口 |
| 浏览器自动化能力 | 84 | Controller/Locator/Task 能力可复用；真实 Chrome 网站覆盖率没有实测 |
| AI Agent 可扩展性 | 78 | R6 研究/合同与 Native PR；PR #11 未合且真实 E2E 缺失 |
| MV3 可行性 | 83 | 官方 API 路线明确；注册更新、Worker/Alarm 生命周期与 document-start gate 未解决 |
| 安全与权限 | 76 | 多层 Authority/锁已有；默认 <all_urls> 权限广，撤权 race/发布策略待测试 |
| UX 简洁性 | 88 | 保留 R6 三页签和原体验；安装审核复杂度仍需原型 |
| 可维护性 | 86 | 不造第二 Controller/DB/Network Broker；GM legacy/cross-browser 适配待分层 |
| 真实测试可行性 | 74 | fixture 和 Node tests 有基础；当前真实 Chrome/Codex native 同候选门槛尚未关闭 |

**95/100 不是当前声明**。若 P0 Chrome native/fail-closed 或 P1 @connect 授权尚有阻断，绝不宣传架构已全面成熟。

## 7. 阶段签收与责任

- P0 出库前：Source Verified、Component Tests PASS、Production+Dev Build Verified、真 Chrome 新 Profile 用户安装/自动执行及撤权/回滚效果证明、同候选 commit/hash + 受审证据（runId、documentId、native registration ids），全部单独出示。
- P1 出库前：已选择的 GM API method-level 兼容矩阵逐函数/逐 Chrome 版本复测；没有测试过的方法标 unsupported，不宣称 TM fully compatible。
- P2 出库前：Chrome alarms 迟发/重启/重复触发、浏览器离线的预计状态、补偿策略验证；测试长运行时断电不可保证 exactly-once。
- P3 出库前：AI 不在场的普通用户重复运行成功、真实 Native/Codex 的读→动→审→冻结链；与 PR #11 不冲突。
- P4 出库前：Firefox、Safari 平台独立兼容和商店政策/许可证审查，未测平台禁止营销“全面支持”。
- 全程不新建开发分支；只在用户指定的 main 与没有并行覆盖的文件安全修改。**真实本地 Mac / CFT 无法从远端 GitHub connector 直接访问，不得伪造本地测试。**

## 8. R8.1 GOAL 拟执行范围（下一对话可直接使用）

**OpenDesk Browser R8.1：基于最新 main 补 Page Script 正式安装及自动注册闭环，严格复用既有 Authority/RunHost/Task 资源，不重复研发 GM 兼容或重做 Sidebar。**

1. 先读 AGENTS.md、最新 main 和此 R8 4 文档，确认 PR #11/#20 与任何并行更改。不得另建分支，不能覆盖别人的脏文件。
2. 先验证现有 Page Program manifest、不可变依赖锁、手动 preview、Controller Task 可靠状态，形成 SOURCE_IMPLEMENTED/COMPONENT_TESTED/BUILD_VERIFIED/CHROME_NATIVE_VERIFIED 分离账本。
3. 实施独立 Page Candidate → native type-specific verification → Available → Installed+Enabled 状态与证明；不可通过 UI 属性或 Controller RunResult 伪造。
4. 给正式 Page 类型接入 trusted Broker/Authority 和 chrome.userScripts.register/getScripts/update/unregister 的 single-writer 对账、版本锁与重新注册，扩展更新/重启/授权变化均能恢复或关闭；不复制 Task DB。
5. 在 Sidebar R6 原三页签与独立管理页最小接入导入审查/安装/启停/报错。不重做现有“运行草稿/保存版本/停止”和 Editor。
6. 增加模拟组件测试与新 Profile Chrome 真实验收：reload once、nonmatch zero、disable next-document zero、SPA 与 iframe、@require 顺序和离线、撤权/脚本开关关闭、版本升级/回滚、SW 休眠与重启。尤其证明撤权 race 不会在**新文档**执行未经授权脚本；如与 document-start 同步语义冲突需限权或明确降级。
7. 在同候选运行 npm run check、npm test、npm run build、npm run build:dev、npm run verify；真实 Chrome/Codex 无法执行时保留 NOT_TESTED、提供本地 Codex 专用验收脚本，不写虚假 PASS。
8. 完成后更新 R8 ADR/矩阵/实施状态，报告实际提交 SHA、代码变更、验收证据和剩余阻断；只在 main 交付，不 push --force、不清理无关分支。


## 9. 产品能力总账本与评分分层（2026-10-09 增量）

**能力追踪总入口**：[R8 用户脚本与浏览器自动化功能目录（188 项，14 模块）](browser-automation-feature-catalog-r8.zh-CN.md)。这里是产品实施时间表，目录是稳定功能 ID、分级和实施证据的唯一能力总账。R8 全球竞品的新增查漏（ScriptCat beta、Automa 触发器、Tampermonkey 高级 GM、Greasy Fork 治理、Requestly）归档于 [竞品研究第 8 节](../architecture/browser-framework/userscript-competitor-research-r8-20261008.zh-CN.md)，新增元数据/API 语义归档于 [兼容矩阵第 7 节](../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md)。

### 四种评分与五类分层，不要把价值混同完成度

- 价值：单项 V=1..5；模块用户价值、OpenDesk 产品契合度分别 /100。**评分只表达是否值得研发，不表示目前实现程度**。
- 工程难度 C=1..5、权限/安全风险 R=1..5，不与价值取平均来掩盖高风险。
- 产品层次：L0 绝对核心；L1 重要迁移/增强；L2 高级开发者与触发能力；L3 可选实验和生态；LX 刻意不作为核心兼容目标（如 GM_audio / GM_webRequest）。
- 研发阶段：P0–P4 的工程优先级；L0/L1 不是“此轮全部做”的同义词，阶段优先于竞品的功能数量。
- 代码状态与验证证据分离：SOURCE_IMPLEMENTED、COMPONENT_TESTED、BUILD_VERIFIED、CHROME_NATIVE_VERIFIED、PARTIAL、MISSING、NOT_TESTED。单个条目目前的 P/M/S/U 标签是**静态抽查**，进入开发前重新核查最新 main。

### R8.1 执行以后普通用户真正应该能做什么

| 使用场景 | R8.1 完成且真 Chrome 验收后的可用结果 | 不可越界的条件 |
| --- | --- | --- |
| 普通用户装一个无 GM 特权的经典 .user.js | 在现有管理/导入页预览来源、版本、@match、依赖和权限，明确确认安装后只在获准网站后续文档自动运行 | 声明不兼容的 GM/@include 类脚本必须拒绝或明确提示，**不 silently ignore** |
| 开发者直接试运行当前页 DOM 脚本 | 现有 Sidebar 开发区粘贴 JS，调用 Page Preview；源码固定后可以进入正式 Page 安装候选 | Preview 是手动单次运行，不能自己标记 Verified/Installed |
| 多文件 ESM 页面项目 | 本地构建输出 program.js，沿现有导入/审核链试运行和冻结合格 Page Program 后安装 | R8.1 不开发云端 npm 包管理器、在线 ESM 动态加载 |
| 安装后自动执行 | 每个匹配新文档按获准的 run-at/frame 规则执行；不匹配零次；显示注册/脚本状态 | Chrome 138+ 需要用户打开 Allow User Scripts，真实网站权限必须有效 |
| 日常暂停/恢复脚本 | 用户可在“我的任务”或独立管理页停用/启用 Page，阻止后续文档自动注入 | 已经运行的脚本增加的 DOM/监听器不自动回滚；存在撤权竞态时不得假报“立刻彻底停止” |
| 安装状态恢复 | 浏览器重启/扩展更新/Service Worker 重启后，Authority 和原生注册集合对账，恢复应该存在的注册 | 缺权限、资产损坏、执行世界不可用时应失败关闭并明确提示 |
| 安全版本替换 | 显式选择新固定版本，验证 hash/依赖/网站和授权，失败回退旧版注册/状态 | **不等于**自动从任意更新链接更新；自动订阅/周期检查仍在 P1 |
| 查看运行和错误 | 看到安装、批准、注册、失败状态；可根据确切 documentId 或日志追溯自动运行 | 不能将 chrome.userScripts.register() 成功直接等同于真实网页功能效果 |

这张表是**目标验收合同**，不是当前主干已完成的事实。R8.1 只补 Page 类型安装链：Controller R5/R6 自动化、原三页签、dependency manager、ESM builder 等**既有功能要回归保护，不应重新开发**。

### R8.1 完成后仍然不会直接拥有的能力

**GM API 全面兼容**、跨域 GM_xmlhttpRequest、GM 存储/菜单/通知/下载、高敏 Cookie/unsafeWindow、@include/@exclude 的 Tampermonkey 全部规则、ScriptCat @background/@crontab、可精确恢复的 Cron、UserCSS、录制到 Workflow、AI 自动修复、MCP/Native Agent 已合 main、云同步或跨浏览器正式兼容。以上遵循 P1–P4 的分期合同；即使页面自动运行成功，**也不能对外宣称“全面兼容油猴/脚本猫”**。

### 最小 R8.1 验收与阻断

1. 统一标准 Chrome 原生测试页面以现有 examples/tasks/demo-form.html 为入口；如需新增专门的 Page fixtures 放相同 examples/tasks/ 下，禁止重新使用历史临时 /fixture 手工入口。
2. 真 Chrome：安装 → 新文档匹配执行一次 → nonmatch zero → 停用后下一文档 zero → iframe → SPA → run-at → 关闭脚本开关/撤站点权限拒绝 → 重启/更新对账 → 损坏依赖失败 → 更新回滚旧版。这些同时包含源 code 证据、Native 回执与用户可见 DOM 效果。
3. 安装更新是两个非原子系统（IndexedDB vs Chrome Native registration）：必须有单 writer、幂等身份、持久 desired/actual 状态、可信启动授权 guard 或明确被验证的时序限制；不能凭 UI 提示强行宣称无撤权竞态。
4. 同一个候选运行 npm run check、npm test、npm run build、npm run build:dev、npm run verify，真实 Chrome/Codex 不可用则必须报告 CHROME_NATIVE_VERIFIED=NOT_TESTED，不能把 P0 标记最终签收。
5. PR #11 Native Agent 和 PR #20 网络测试各自有独立工作流，不是本轮 Page P0 的实现依赖；不从 PR/旧文档推断已经合 main。

### 下一轮开始前的操作纪律

最新 GitHub main、PR/worktree 和文件修改权必须重新读取。只在用户批准的集成路径下处理 main；若 AGENTS.md 的写入隔离/保护规则与同轮用户具体授权存在冲突，应保留已有独立工作区安全边界，不以强推/重置覆盖并行成果。只允许已经确认的 P0 功能缺口进入 R8.1 的代码提交，不能以 catalog 出现 188 项为由展开大规模重构。
