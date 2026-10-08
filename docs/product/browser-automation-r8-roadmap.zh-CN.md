# OpenDesk Browser R8：产品能力路线、三页签信息架构、验收与专家独立审计

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
