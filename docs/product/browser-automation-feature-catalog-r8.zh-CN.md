# OpenDesk Browser R8：用户脚本与浏览器自动化能力总清单（分级、评分、差距和验收）

> 研究基线：2026-10-09，仓库 shopable-ai/opendesk-browser 的 main@c93ee36700171114ff38a5e705ce177fc55251df（文档审计起点）；**本文件是版本化产品能力规划，不是功能实现声明**。创建/更新文档不改变真实代码状态。初始研究之后的工程复核见第 7 节：源码基线 945cf927，同步并行 main 至 74d261b7；审查修复已由 PR #25 合入 70fb3449，Native/HTTP/Program 随 PR #11 合入 189a7037。本地审查 SHA 只作原始证据身份，不要求是远端祖先。详情以实际 main 源码及测试证据为准。任何 SOURCE_IMPLEMENTED 都不能冒充 BUILD_VERIFIED/CHROME_NATIVE_VERIFIED。

## 1. 如何使用本清单

- **唯一的“能力总账本”**：给每条能力稳定 ID；新发现的竞品功能先建条目，再经源码审计、分级、阶段分配，不直接开发。功能设计见 R8 ADR，GM 逐方法语义见 R8 compatibility matrix，推进节奏见 R8 roadmap。禁止在多个文件维护互不一致的第二份全量清单。
- **产品分层**：L0 核心必要（正常安装/执行/授权/原生验收）；L1 重要兼容和日常增强；L2 高级开发者/高频团队需求；L3 可选实验/平台/高权限功能；LX 明确近期不实施或刻意拒绝。产品层级与阶段 P0–P4 是独立维度，LX 的 P4 只表示可定期重新评估，不是已承诺交付。
- **评分不是代码完成百分比**：每行 V=产品价值（1–5，5 最高）；每模块分别给 **用户价值/100** 与 **OpenDesk 产品契合度/100**，实现复杂度 C=1..5、安全/权限风险 R=1..5。全为研究时的独立专家判断，不是市场用户样本或实测分数；无总平均分，不用高价值抵消高安全风险。
- **源码证据简称**：S=SOURCE_IMPLEMENTED；P=PARTIAL；M=MISSING（仅对已抽样的对应目录/产品链而言）；U=NOT_AUDITED。历史 Node 测试、CI 构建、真实 Chrome/Codex 等必须另填 COMPONENT_TESTED/BUILD_VERIFIED/CHROME_NATIVE_VERIFIED 的证据 SHA；早期 R8 补充研究没有执行这些命令；本轮工程证据另见第 7 节。
- **R8.1 范围**：P0 功能在 R8.1 需“复用或完成缺口”，但已 S 的能力主要回归测试，不允许以 P0 标签让 Codex 再开发一次；P1–P4 和 LX 不由 R8.1 实现。P0 不包括 GM_* 全量兼容。安全上无法证明的行为必须标 BLOCKED，而不是为达标放宽权限。

## 2. 模块独立评分（仅决策优先级，不等于已完成质量）

| 模块 | 条目数 | 用户价值/100 | 产品契合/100 | 复杂度 C/5 | 风险 R/5 | R8.1 核心关系 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| INS 脚本发现、导入、安装和更新 | 17 | 99 | 99 | 4 | 4 | 有 P0 复用/缺口 |
| META UserScript 元数据与匹配语义 | 19 | 96 | 100 | 3 | 3 | 有 P0 复用/缺口 |
| LIFE 页面自动运行与浏览器生命周期 | 15 | 100 | 100 | 5 | 5 | 有 P0 复用/缺口 |
| GM GM API 兼容桥 | 23 | 95 | 96 | 5 | 5 | R8.1 不开发 |
| DEV 开发、依赖、调试与项目发布 | 12 | 96 | 100 | 3 | 3 | 有 P0 复用/缺口 |
| AUTO 现代 Browser Automation 与 RPA 操作 | 14 | 94 | 98 | 4 | 4 | 有 P0 复用/缺口 |
| TRG 触发入口、交互与自动化启动 | 11 | 87 | 92 | 3 | 3 | 有 P0 复用/缺口 |
| BG 后台、定时调度与可靠性 | 11 | 87 | 90 | 5 | 5 | R8.1 不开发 |
| AI AI Agent、录制、Skill 与可重复发布 | 11 | 90 | 96 | 4 | 5 | 有 P0 复用/缺口 |
| UX Sidebar、普通用户体验与开发面板 | 12 | 98 | 100 | 3 | 2 | 有 P0 复用/缺口 |
| CSS UserCSS 和网页样式管理 | 7 | 70 | 75 | 3 | 2 | R8.1 不开发 |
| ECO 生态市场、备份、许可和更新治理 | 12 | 79 | 82 | 4 | 4 | R8.1 不开发 |
| SEC 权限、安全、隐私和供应链 | 15 | 100 | 100 | 5 | 5 | 有 P0 复用/缺口 |
| PORT 跨浏览器、可观测性和可选插件架构 | 9 | 76 | 85 | 5 | 4 | R8.1 不开发 |

评分口径：100 分表示研究人员认为该模块值得成为核心产品能力，**不是实现质量已达到 100/100**；个别 GM、后台、AI 的高风险不得被模块价值评分掩盖。若任何 P0 的权限撤销、真实 Chrome 自动运行或版本回滚失败，发布门槛仍为 NO。

## 3. 逐项功能清单

列说明：ID 为永久追踪键；级=产品分层；期=候选交付阶段；V=主观用户价值（1–5）；现状=S/P/M/U；“范围/证据”是一条必须关闭的差距或复用边界。

### INS · 脚本发现、导入、安装和更新

模块来源：[SRC01][SRC02][SRC04][SRC05]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| INS-001 | 本地 .user.js / JS 文件导入 | L0 | P0 | 5 | P | 现有 JS 草稿导入；Page 正式安装缺口 |
| INS-002 | 从 HTTPS 脚本链接预览候选（不自动安装） | L0 | P0 | 5 | M | 只收集 URL 与固定实际字节，明确点击审查 |
| INS-003 | 粘贴单文件后立即 Page 试运行 | L0 | P0 | 5 | S | 现有单次 USER_SCRIPT preview，不等于安装 |
| INS-004 | 发现网页脚本链接的安装入口 | L1 | P1 | 3 | M | 已查 task-workbench / tool-shell；当前仅本地 JS/Task 包入口，没有网页 .user.js 链接接管消费者 |
| INS-005 | 安装确认页显示源码、版本、目标网站 | L0 | P0 | 5 | P | 保留独立管理页，批准真实来源及权限 |
| INS-006 | 安装来源 URL 与 @namespace 唯一性 | L0 | P0 | 5 | P | 以真实下载/导入出处为准，不信 @downloadURL |
| INS-007 | 候选版源码哈希/依赖锁冻结 | L0 | P0 | 5 | S | 已有依赖与 Page manifest 编译，发布状态仍缺 |
| INS-008 | Page Candidate→Verified→Available→Installed | L0 | P0 | 5 | P | 必须类型专属证明，不能借 Controller 结果 |
| INS-009 | 已装脚本启用/停用与卸载 | L0 | P0 | 5 | P | Controller 已有，Page 需要 Native 注册管理 |
| INS-010 | 名称与来源冲突检测/导入覆盖提示 | L1 | P1 | 4 | P | tasks/service.js 已拒绝同 taskId/version 不同字节（E_REQUEST_CONFLICT）；Page 名称/来源去重、覆盖审查未接入 |
| INS-011 | 更新源固定、手动检查与更新候选 | L1 | P1 | 5 | M | 更新 URL 不是自动授信 |
| INS-012 | 更新权限 diff 与来源/依赖变化审核 | L1 | P1 | 5 | M | 变更网站/@grant/@connect 重新确认 |
| INS-013 | 更新失败回滚已装固定版本 | L0 | P0 | 5 | M | P0 覆盖最小手动替换/失败回滚；自动更新 P1 |
| INS-014 | 版本历史与完整 diff | L1 | P1 | 4 | P | 现有 Controller revisions，Page 完整视图待接线 |
| INS-015 | 脚本标签/分组/批量启停 | L1 | P2 | 3 | M | task-workbench.js 有目录筛选和逐任务启停；没有脚本标签/批量操作合同 |
| INS-016 | 脚本回收站与原配置恢复 | L2 | P2 | 3 | M | ScriptCat Beta 参考，不要求 P0 |
| INS-017 | 导出 ZIP/JSON/脚本备份 | L1 | P2 | 4 | P | tasks/contract.js 有固定 JSON Task Package，script-editor 可下载结果；未形成已装脚本/依赖/配置的导出恢复闭环 |

### META · UserScript 元数据与匹配语义

模块来源：[SRC01][SRC02][SRC04][SRC05]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| META-001 | 开头元数据语法识别、未知指令失败关闭 | L0 | P0 | 5 | S | 已有 metadata parser/assess；只读保留不等于兼容 |
| META-002 | @name/@namespace/@version/@description | L0 | P0 | 5 | P | 识别与展示；需绑定安装身份 |
| META-003 | @author/@license/@supportURL/@homepageURL | L1 | P1 | 4 | P | 识别未必落实可信来源/许可政策 |
| META-004 | @antifeature 追踪/广告/矿工等风险披露 | L1 | P1 | 5 | P | 84dc3c7：真实头部及 locale @antifeature 在依赖审核显示 W_ANTIFEATURE_DECLARED 纯文本自述风险；正式安装风险审查仍缺 [EP-E1] |
| META-005 | @match 网站规则 | L0 | P0 | 5 | P | 有 native descriptor；实际持久注册缺口 |
| META-006 | @exclude-match 规则 | L0 | P0 | 5 | P | 描述可编译，需真实非匹配测试 |
| META-007 | @include glob 或正则变体 | L1 | P1 | 4 | M | 当前明确拒绝；必须转换或声明差异 |
| META-008 | @exclude glob 或正则变体 | L1 | P1 | 4 | M | 同上 |
| META-009 | @run-at document-start/end/idle | L0 | P0 | 5 | P | preview 不还原执行时机；注册原生验收 |
| META-010 | @noframes 与 iframe 范围 | L0 | P0 | 5 | P | 现有 allFrames 声明，原生覆盖未证实 |
| META-011 | @grant none 与实际隔离世界差异 | L0 | P0 | 5 | S | USER_SCRIPT world，不隐式 MAIN/unsafeWindow |
| META-012 | @grant GM_* 与 GM.* 声明 | L1 | P1 | 5 | M | 当前非 none 失败；按 API 准入 |
| META-013 | @connect 网络目标 | L1 | P1 | 5 | M | 必须联动浏览器/脚本/用户授权 |
| META-014 | @require 按序依赖、SRI、离线锁 | L0 | P0 | 5 | P | 有锁管理与预览，正式自动运行待验 |
| META-015 | @resource 资源声明及锁定 | L1 | P1 | 4 | M | 识别但当前拒绝执行语义 |
| META-016 | @updateURL/@downloadURL（附 @installURL 差异） | L1 | P1 | 4 | P | 仅信息级现状；不可默认为可更新来源 |
| META-017 | @run-in/@sandbox/@inject-into/@unwrap | L3 | P3 | 2 | M | 高风险兼容选项逐项复核，不默认 MAIN |
| META-018 | @run-at context-menu 与 ScriptCat 扩展 | L2 | P2 | 3 | M | 应映射 Trigger，非 document-run |
| META-019 | 多语言 @name:locale/@description:locale | L2 | P2 | 3 | P | 元数据解析有部分 locale 支持，展示未验证 |

### LIFE · 页面自动运行与浏览器生命周期

模块来源：[SRC03][SRC07][SRC08]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| LIFE-001 | 注册正式 Page userScripts | L0 | P0 | 5 | P | 纯 descriptor 存在；真正 register 调度仍缺 |
| LIFE-002 | getScripts 实际/期望状态对账 | L0 | P0 | 5 | M | 仅可信单 writer Reconciler |
| LIFE-003 | 扩展升级清空后重注册 | L0 | P0 | 5 | M | 浏览器官方明确注册清空 |
| LIFE-004 | 浏览器重启后安装状态恢复 | L0 | P0 | 5 | M | 本地 desired state 与原生状态核验 |
| LIFE-005 | Chrome 138+ Allow User Scripts 引导 | L0 | P0 | 5 | P | 相关文档已有；原生 UI 引导待验 |
| LIFE-006 | 非匹配网站零次执行 | L0 | P0 | 5 | M | native 新 Profile E2E |
| LIFE-007 | 匹配文档恰好一次的脚本启动门槛 | L0 | P0 | 5 | P | wrapper once-token 不等于完整安装验证 |
| LIFE-008 | SPA pushState/replaceState/popstate 观测 | L1 | P1 | 4 | M | 默认不重复整脚本注入，按事件独立订阅 |
| LIFE-009 | frames/嵌套 frame/跨源 frame/空白 frame | L0 | P0 | 5 | P | exact frame 与 site scope 正式验收 |
| LIFE-010 | document-start 同步时序与授权握手冲突 | L0 | P0 | 5 | M | preview/execution-source 尚无正式逐文档认证；ADR-06 明确异步授权与原生 start 不能同时无等待，需原生时序证明 |
| LIFE-011 | 用户取消网站授权后禁下次启动 | L0 | P0 | 5 | P | 单次预览有 gate；注册竞态尚未关闭 |
| LIFE-012 | 脚本更新时原子版本切换/回滚 | L0 | P0 | 5 | M | Chrome API 与本地事务非原子，需要对账 |
| LIFE-013 | 已运行 DOM 副作用无法强制回滚提示 | L0 | P0 | 5 | P | 停止语义需呈现不可逆边界 |
| LIFE-014 | 脚本冲突检测及依赖顺序可观察日志 | L1 | P1 | 4 | P | @require 顺序可定；独立脚本冲突规则未审核 |
| LIFE-015 | Chrome Service Worker 被终止后的恢复 | L0 | P0 | 5 | P | 现有 SW/Broker；Page 注册对账未有 |

### GM · GM API 兼容桥

模块来源：[SRC01][SRC02][SRC03]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| GM-001 | GM_info / GM.info | L1 | P1 | 5 | M | G0，实际安装身份快照 |
| GM-002 | GM_addStyle | L1 | P1 | 5 | M | G0，按 document 注入与清理 |
| GM-003 | GM_addElement | L2 | P1 | 3 | M | G0+，受限元素创建，防止任意脚本 URL |
| GM-004 | GM_log | L1 | P1 | 4 | M | G0，限额脱敏日志 |
| GM-005 | GM.getValue/setValue | L1 | P1 | 5 | M | G1 Promise，按安装 ID 命名空间 |
| GM-006 | GM_getValue / GM_setValue 同步版本 | L2 | P1 | 4 | M | G1 需同步缓存一致性证明，不伪造阻塞 RPC |
| GM-007 | GM.deleteValue/listValues | L1 | P1 | 4 | M | G1 隔离键空间 |
| GM-008 | GM.getValues/setValues/deleteValues 批量版本 | L2 | P1 | 3 | M | G1，逐管理器语义版本差异 |
| GM-009 | GM_addValueChangeListener/removeValueChangeListener | L1 | P1 | 4 | M | G1 跨标签 remote 标志、重启清理 |
| GM-010 | GM_getResourceText | L1 | P1 | 4 | M | G1 依赖资源不可变资产 |
| GM-011 | GM_getResourceURL / GM.getResourceUrl | L1 | P1 | 4 | M | G1 URL 生命周期与页面可见性 |
| GM-012 | GM_registerMenuCommand/unregisterMenuCommand | L1 | P1 | 4 | M | G1 不新加 Sidebar 一级页签 |
| GM-013 | GM_xmlhttpRequest/GM.xmlHttpRequest | L1 | P1 | 5 | M | G2 新 facade：回调/响应/取消/@connect/授权 |
| GM-014 | GM_download/GM.download | L1 | P1 | 4 | M | G2 下载服务与业务手势限制 |
| GM-015 | GM_notification/GM.notification | L1 | P1 | 4 | M | G2 防通知滥用、事件回调 |
| GM-016 | GM_openInTab/GM.openInTab | L1 | P1 | 4 | M | G2 限定 URL、新建窗口与句柄 |
| GM-017 | GM_setClipboard | L2 | P2 | 3 | M | G3 用户手势/跨浏览器差异 |
| GM-018 | GM_cookie.list/set/delete | L3 | P3 | 2 | M | G3 高敏，默认不开放 |
| GM-019 | GM_getTab/saveTab/getTabs | L3 | P3 | 2 | M | G3 私有标签数据权限，按需求再做 |
| GM-020 | GM_audio.* | LX | P4 | 1 | M | 缺少核心价值，拒绝或仅记录不兼容 |
| GM-021 | GM_webRequest | LX | P4 | 1 | M | 不把特权拦截作为普通 GM 能力 |
| GM-022 | unsafeWindow 与 MAIN 兼容 | L3 | P3 | 2 | M | 高风险与页面全局共享，默认不开放 |
| GM-023 | GM Promise/回调的异常及 API 版本行为档案 | L1 | P1 | 5 | M | 每个方法要有实测矩阵和 profiles |

### DEV · 开发、依赖、调试与项目发布

模块来源：[SRC01][SRC02][SRC10]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| DEV-001 | Sidebar 单文件 JS 草稿直接运行 | L0 | P0 | 5 | S | 现有 Controller 草稿执行 |
| DEV-002 | Sidebar Page 用户脚本即时运行 | L0 | P0 | 5 | S | 现有单次 preview，真实 Chrome 本轮未测 |
| DEV-003 | 多文件 ESM/package.json 项目 | L0 | P0 | 5 | S | ESM 双模式构建、源码快照和固定执行产物消费者已在 main；复用 builder/program-source/script-editor/task-workbench |
| DEV-004 | 本地构建与执行字节锁 | L0 | P0 | 5 | P | 执行字节/hash/只读源码快照与 development map 已实现；仍为 BUILT_UNVERIFIED，Page 正式注册和安装未闭 |
| DEV-005 | @require 第三方 JS 审核/离线命中 | L0 | P0 | 5 | S | 已有 D1 manager，真实 Chrome 回归待做 |
| DEV-006 | 语法检查/错误定位 | L1 | P1 | 4 | P | 已有编译错误位置、development Source Map 生成/映射助手；运行错误到原模块的完整编辑器消费者仍缺 |
| DEV-007 | 现代 JS/GM 类型定义与自动补全 | L1 | P1 | 4 | P | types/opendesk-page.d.ts 已有现代 Page/Locator 声明；GM 类型、编辑器补全及诊断缺失，不复制 GPL 实现 |
| DEV-008 | 源码版本 Diff / 依赖更新对比 | L1 | P1 | 4 | P | Controller Revision 存在；跨运行类型视图欠缺 |
| DEV-009 | 真实页面断点/调试输出/日志 | L1 | P1 | 4 | P | Controller 日志与只读项目源码/生成产物视图已有；GM 调试页、原文件断点和运行时 map 消费未闭 |
| DEV-010 | 生成示例、模板和脚本脚手架 | L2 | P2 | 3 | P | 已有 examples/programs，不做复杂编辑器平台 |
| DEV-011 | 源码导入/导出与 VS Code/Codex 开发联动 | L2 | P2 | 3 | P | main 已有 .opendesk-draft.json 导入、源码快照视图与 CLI；源码项目持久化/导出恢复和完整 VS Code/Codex 联动待补 |
| DEV-012 | 类型专属 native 自动化测试/测试报告 | L0 | P0 | 5 | P | Program 原生驱动与证据复用检查器已在 main；测试代码存在不代表本候选真实 Chrome 执行通过 |

> **UI 开发能力补充（2026-10-09）**：DEV-003/004/010/011 作为原生、React/Vue、Tailwind 与多文件 UI 资源的上层追踪入口，详细范围见 [UI 开发与样式隔离 R1](../architecture/browser-framework/ui-development-and-style-isolation-r1.zh-CN.md)，工程责任见实施计划的“UI 开发专项增补”。当前插件自身 UI 和参数表单已实现，不代表完整用户 UI 框架已支持；现有 `.js/.mjs` 构建、未接通的 CSS/图片资产与待实现的组件编译必须分列。此需求不同于下面的 UserCSS 模块；原 188 项 ID 与数量保持，新增专项设计不提升任何运行时验收状态。

### AUTO · 现代 Browser Automation 与 RPA 操作

模块来源：[SRC06][SRC09][SRC11]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| AUTO-001 | Controller ChromePage API | L0 | P0 | 5 | S | 现有 RunHost 不重建 |
| AUTO-002 | getByRole / getByLabel / Locator | L0 | P0 | 5 | S | 源码已实现，真实网站成功率未量化 |
| AUTO-003 | Locator click/fill/waitFor | L0 | P0 | 5 | S | 受控 DOM 合成操作，非 Playwright 可信键鼠 |
| AUTO-004 | 语义 observe 与 bounded snapshot | L0 | P0 | 5 | S | 已有受限 Controller observe |
| AUTO-005 | 导航/当前页面/文档精确身份 | L0 | P0 | 5 | S | 现有 target fences |
| AUTO-006 | 参数 schema、确定性结果/停止 | L0 | P0 | 5 | S | 已有 Controller Task v1 |
| AUTO-007 | 多步骤条件/循环/变量 | L1 | P2 | 4 | P | 优先用 JS/已有 Task 组合，不做第二节点引擎 |
| AUTO-008 | 表单/下载/数据读取 | L1 | P2 | 4 | P | 复用原 SDK，按任务验证 |
| AUTO-009 | 多 Tab 协作及 frame/shadow DOM | L2 | P2 | 3 | P | 先核查已有 API 范围，不宣称全 Playwright |
| AUTO-010 | 截图/全页视觉/OCR | L3 | P3 | 3 | P | ChromePage.screenshot → control/native-driver.js → captureVisibleTab 已实现受控视口截图；fullPage 明确拒绝，OCR 缺失；本轮 native NOT_TESTED |
| AUTO-011 | 录制操作→Locator/JS | L2 | P3 | 4 | M | 可选录制层，不用新 RPA 执行内核 |
| AUTO-012 | 错误恢复/超时/重试前效果证明 | L0 | P0 | 5 | P | 当前 Run/Journal 基础，严禁未知效果盲重发 |
| AUTO-013 | Network 请求监控/拦截/改写 | L3 | P3 | 2 | M | 已查 SDK/network/native-driver；axiosx 请求不是监听/拦截。manifest 的 webRequest/DNR 可选声明没有对应脚本拦截产品 |
| AUTO-014 | CSV/JSON/文件任务资产 | L2 | P2 | 3 | P | 已有 Result/下载组件，具体 formats 待测 |

### TRG · 触发入口、交互与自动化启动

模块来源：[SRC06][SRC09]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| TRG-001 | 用户点击 Sidebar 运行草稿 | L0 | P0 | 5 | S | 现有功能 |
| TRG-002 | 已安装 Controller Task 手动运行 | L0 | P0 | 5 | S | Controller 生命周期保留 |
| TRG-003 | 匹配网站新文档自动执行 Page Script | L0 | P0 | 5 | M | R8.1 核心交付 |
| TRG-004 | SPA 路由变化事件（非重新注入） | L1 | P1 | 4 | M | 应独立订阅可撤销 |
| TRG-005 | 浏览器右键菜单启动 | L1 | P2 | 3 | M | 可选 contextMenus 权限已经声明 |
| TRG-006 | 浏览器快捷键 / 命令 | L2 | P2 | 3 | M | manifest 无 commands，SW/Sidebar 无 onCommand 任务消费者；需独立键位/授权合同 |
| TRG-007 | 浏览器启动后触发短任务 | L2 | P2 | 3 | M | 需有未运行/错过处理 |
| TRG-008 | 定时/间隔/Cron | L1 | P2 | 4 | M | MV3 不能承诺持续准点 |
| TRG-009 | 标签打开/关闭/切换事件 | L2 | P2 | 3 | P | current-page-target.js、SW 和 controller-methods 有标签事件/目标失效围栏；未形成可安装 TriggerDefinition |
| TRG-010 | 页面 CustomEvent/API 触发 | L3 | P3 | 2 | M | SDK transport 的 CustomEvent 是现有受控请求桥，不是可由网页任意启动 Installed Task 的触发器 |
| TRG-011 | 外部 CLI / Agent 请求触发 | L2 | P3 | 4 | P | main 已有可选 CLI run.start → Native Messaging → 活跃 Sidebar RunHost；正式 Installed 外部触发和完整本机闭环仍缺 |

### BG · 后台、定时调度与可靠性

模块来源：[SRC02][SRC03][SRC07]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| BG-001 | Background Script 独立运行类型 | L1 | P2 | 4 | M | 无页面 DOM；不假装 SW 常驻 |
| BG-002 | ScheduleDefinition/timezone/Cron 标准化 | L1 | P2 | 4 | M | 和 Controller/Page 是正交触发器 |
| BG-003 | chrome.alarms 驱动与冷启动对账 | L1 | P2 | 5 | M | 现有 manifest 缺 alarms，需要审计新增 |
| BG-004 | 执行租约/fireId/幂等准入 | L1 | P2 | 5 | M | 远端副作用不能保证 exactly-once |
| BG-005 | 错过执行的 skip/coalesce/catch-up 策略 | L1 | P2 | 5 | M | 须让用户理解浏览器关闭影响 |
| BG-006 | 重启、进程休眠和崩溃恢复 | L1 | P2 | 5 | P | RunHost 局部已有，调度场景缺口 |
| BG-007 | 后台执行日志、错误、重试与暂停 | L1 | P2 | 4 | P | 复用 Journal，分清执行与触发记录 |
| BG-008 | 长任务 checkpoint 与资源预算 | L2 | P2 | 3 | M | 按工作单位持久化，不依赖无限 keepalive |
| BG-009 | Offscreen/沙箱受控短任务 | L2 | P2 | 3 | P | scripting/sandbox/controller.js 与 worker-runtime.js 已承载 Controller 短任务；没有 Background/Offscreen 独立合同 |
| BG-010 | 可选 Native Host 更长任务 | L3 | P3 | 3 | M | main Native Host 仅认证/IPC 转发；仍需活跃 Sidebar、原 RunHost 且 deadline 为 1–120 秒，独立长任务与浏览器关闭后保障合同缺失 |
| BG-011 | 调度同时多任务并发上限 | L1 | P2 | 4 | M | 避免重入/权限扩大 |

### AI · AI Agent、录制、Skill 与可重复发布

模块来源：[SRC02][SRC06][SRC09]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| AI-001 | AI 根据页面观察辅助生成 JS 草稿 | L2 | P3 | 4 | P | R6 合同已设计，原生 E2E 未测 |
| AI-002 | AI 生成后的静态校验/源码 hash 冻结 | L0 | P0 | 5 | P | 复用 Task Revision/manifest，发布仍需证明 |
| AI-003 | Agent 调用 Controller observe/click/run | L2 | P3 | 4 | P | main 已接 CLI 保存/运行 Controller JS，可复用 observe/Locator；六方法 Bridge 没有独立 observe/click RPC，原生用户任务待验 |
| AI-004 | Agent run.get / run.stop 复用 Durable Run | L2 | P3 | 4 | P | main run.get/run.stop 已复用原 Durable Run/Stop 和相同 registration 的已确认 run；跨重连/重启及完整原生链仍待验 |
| AI-005 | 关闭 AI 后用户独立重复任务 | L1 | P3 | 5 | P | R6 业务目标，真实验收缺 |
| AI-006 | 任务发布与行为证明的审核流程 | L1 | P3 | 5 | P | Controller 已有 Task v1，AI 到 Task 本机 E2E 未验 |
| AI-007 | 可选 MCP / CLI / Native Bridge | L2 | P3 | 4 | P | main 已有 macOS Chrome/CFT Host 安装器、CLI 和可选 Native 权限/设置；MCP Server/完整 Skill facade 尚缺，普通任务无需 Host |
| AI-008 | 可版本化 Skill / Task Package | L2 | P3 | 3 | P | 已有 Agent 设计与多文件项目能力 |
| AI-009 | 操作录制与 selector 修复 | L2 | P3 | 4 | M | 先验证现有 Locator，避免新引擎 |
| AI-010 | 敏感操作确认/提示注入拦截 | L0 | P0 | 5 | P | 发布/许可必须守门，AI 外部入口需增强 |
| AI-011 | 模型提供商切换与纯离线任务运行 | L2 | P3 | 4 | P | Task/RunHost 源码不依赖模型会话；模型 provider 切换未实现，含网络任务不保证离线可用，AI 退出后用户闭环 NOT_TESTED |

### UX · Sidebar、普通用户体验与开发面板

模块来源：[SRC02][SRC06]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| UX-001 | 固定三页签 我的任务/发现/开发 | L0 | P0 | 5 | S | 绝不新增一级页签 |
| UX-002 | 我的任务展示 Controller 已安装卡片 | L0 | P0 | 5 | S | 已有 Workbench |
| UX-003 | Page Script 已安装卡片/自动运行状态 | L0 | P0 | 5 | M | R8.1 最小 UI |
| UX-004 | 发现仅本机搜索/筛选、导入独立目录 | L0 | P0 | 5 | S | 现有三页签语义 |
| UX-005 | 开发区直接输入/执行 JS | L0 | P0 | 5 | S | 保留编辑器和底栏 |
| UX-006 | 明确 Page preview vs Installed 标识 | L0 | P0 | 5 | P | 避免把预览成功冒充发布 |
| UX-007 | 首次使用 Allow User Scripts / 网站权限引导 | L0 | P0 | 5 | P | 真实新 Profile 全路径验收 |
| UX-008 | 安装前详细权限/来源/差异审查 | L0 | P0 | 5 | P | 完整管理页，不拥挤 Sidebar |
| UX-009 | 运行结果/错误/历史与跳转调试 | L1 | P1 | 4 | P | Controller 已有，Page 后续事件记录不同 |
| UX-010 | 快捷启停、当前站点脚本数/状态 | L1 | P1 | 4 | P | task-workbench.js 的 Controller Installed 卡片已有启停/状态；当前站点 Page 脚本计数和自动注册状态仍缺 |
| UX-011 | 键盘/读屏/低对比辅助 | L0 | P0 | 5 | P | 已有 UI 回归，真 Chrome/a11y 待验 |
| UX-012 | 完整源代码/GM 调试放独立页面 | L1 | P1 | 4 | P | 已有只读项目源码与生成产物折叠视图；完整 GM 调试和运行时源码映射仍后续，Sidebar 三页签不变 |

### CSS · UserCSS 和网页样式管理

模块来源：[SRC12]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| CSS-001 | 普通 CSS 按网站受控注入/启停 | L2 | P2 | 4 | M | 独立 Style asset 不走 JS Runtime |
| CSS-002 | UserStyle 头部元数据和站点选择 | L2 | P2 | 3 | M | 不同于 UserScript 头部 |
| CSS-003 | 样式源码版本回滚 | L2 | P2 | 3 | M | 复用 hash 与安装/对账 |
| CSS-004 | @var 基础 CSS 变量与配置 | L3 | P4 | 2 | M | 需要完整运行/配置语义才可声称兼容 |
| CSS-005 | less/stylus/uso 预处理 | L3 | P4 | 2 | M | 仅需要时引入额外构建依赖 |
| CSS-006 | UserCSS 订阅/更新/同步 | L3 | P4 | 2 | M | 不抢普通脚本安装 |
| CSS-007 | 样式优先级/冲突诊断 | L2 | P2 | 3 | M | 样式覆盖与网页 CSS 可能冲突 |

### ECO · 生态市场、备份、许可和更新治理

模块来源：[SRC01][SRC02][SRC04][SRC05]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| ECO-001 | 外部脚本目录链接展示/跳转 | L1 | P1 | 3 | M | 实际 tool/catalog 消费者仅本机目录；研究文档有外链不代表产品发现入口 |
| ECO-002 | Greasy Fork 元数据与反功能披露 | L1 | P1 | 4 | P | 84dc3c7 新增 @antifeature 纯文本警示及编辑后刷新；无声明不证明安全，HTTPS 目录导入/安装仍未完成 [EP-E1] |
| ECO-003 | 来源固定与更新域名变更保护 | L1 | P1 | 5 | P | 现有依赖锁可复用，更新申请尚缺 |
| ECO-004 | 代码许可证与第三方依赖归属校验 | L1 | P1 | 4 | P | 许可 unknown 不自动当作可复制 |
| ECO-005 | 脚本订阅源/自选关注更新 | L2 | P2 | 3 | M | 只通知候选，不无确认安装 |
| ECO-006 | 脚本列表批量管理及分组标签 | L2 | P2 | 3 | M | 现有目录分类/搜索不构成用户脚本分组和批量修改；尚无对应存储/操作消费者 |
| ECO-007 | 安装后的本机加密/明文备份策略 | L1 | P2 | 4 | M | storage 的 preserveMigrationBackup 只保存不可执行原始迁移数据；不是 Installed 脚本/GM 配置明文或加密备份策略 |
| ECO-008 | 同步冲突/设备身份及云同步 | L3 | P4 | 2 | M | 不提前承诺商用账户服务 |
| ECO-009 | 版本签名/验证发布者身份 | L3 | P4 | 3 | M | Web PKI 与脚本签名另设计 |
| ECO-010 | 脚本安全报告/用户反馈入口 | L2 | P3 | 3 | M | 当前脚本详情没有安全反馈/举报入口；仓库 issue 地址不等同产品中的按脚本反馈 |
| ECO-011 | 开放插件 SDK、第三方适配包 | L3 | P4 | 2 | P | main74 已有离线 Sidebar UI 工具包与 OpenDeskTool 窄接口；通用插件 SDK、统一 ProgramRef/版本/授权和签名仍缺，原生未验 |
| ECO-012 | 企业管理/脚本集中投放政策 | L3 | P4 | 2 | M | 参考 Tampermonkey provisioning，不是近期核心 |

### SEC · 权限、安全、隐私和供应链

模块来源：[SRC03][SRC04][SRC05][SRC07]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| SEC-001 | Chrome 网站访问与实时 revocation | L0 | P0 | 5 | P | manifest 全站资格不等于脚本获准 |
| SEC-002 | 脚本站点作用域与 @grant 逐项准入 | L0 | P0 | 5 | P | P0 先 none，P1 gm grants |
| SEC-003 | @connect 目标权限交集 | L1 | P1 | 5 | M | Chrome host + script @connect + 用户许可 |
| SEC-004 | 从 Script 世界发送专用消息并校验 sender | L1 | P1 | 5 | M | 不可相信 payload scriptId/grant |
| SEC-005 | 版本、sourceHash 和依赖锁验证 | L0 | P0 | 5 | P | 已有组件；正式发行审计未闭 |
| SEC-006 | 权限变更与审查记录不可绕过 | L0 | P0 | 5 | P | P0 站点范围，P1 GM/@connect 细分 |
| SEC-007 | 未知元数据/未支持 GM 明确拒绝 | L0 | P0 | 5 | S | 84dc3c7 复用 D1 失败关闭，修复异步依赖检查覆盖最新元数据/审批未复查；71 定向组件 PASS，native NOT_TESTED [EP-E1] |
| SEC-008 | 插件更新/浏览器重启注册竞态防重复 | L0 | P0 | 5 | M | Reconciler 执行日志 |
| SEC-009 | 远程 JS 只由 User Scripts 许可世界执行 | L0 | P0 | 5 | P | 遵守 CWS MV3 RHC 限制 |
| SEC-010 | Cookie/下载/剪贴板敏感作用域 | L3 | P3 | 5 | M | 不可继承默认 Chrome cookies 权限 |
| SEC-011 | 敏感数据日志脱敏与留存策略 | L1 | P1 | 5 | P | 持久结果已有，Page/GM 日志待分层 |
| SEC-012 | CORS/redirect/凭据/请求体边界 | L1 | P1 | 5 | P | 原 SDK/HTTP 服务及 Worker axiosx 已入 main；本轮修正 Page 草稿为真实 fetch Locator/channel，仍须独立验证 MAIN SDK/Worker 权限与 CORS |
| SEC-013 | 许可证/GPL 污染与第三方供应链审计 | L0 | P0 | 5 | P | 任何引用源码须版权审查 |
| SEC-014 | Chrome Web Store 最小权限与单一用途审核 | L1 | P1 | 5 | P | 当前默认 <all_urls>/cookies 较宽；公开发布前关口 |
| SEC-015 | 安全公告、漏洞报告、版本撤回 | L2 | P2 | 4 | M | 现有 Task 卸载/Script tombstone 不是发行安全公告或版本撤回流程；未发现对应产品消费者/仓库安全响应合同 |

### PORT · 跨浏览器、可观测性和可选插件架构

模块来源：[SRC03][SRC08]。

| ID | 功能 | 级 | 期 | V | 现状 | 范围/证据 |
| --- | --- | --- | --- | ---: | --- | --- |
| PORT-001 | BrowserUserScriptsDriver/permission adapter | L2 | P4 | 3 | P | Chrome 有现成包装边界，Firefox 未实施 |
| PORT-002 | Firefox MV3 optional-only userScripts 授权 | L2 | P4 | 4 | M | 与 Chrome install-time + UI toggle 不同 |
| PORT-003 | Safari 执行世界/权限/生命周期验证 | L3 | P4 | 2 | M | 不能以 Chrome API 等价判断 |
| PORT-004 | Chrome 138–149 与 150+ alarm 差异 | L1 | P2 | 4 | M | P2 需要每版本运行语义 |
| PORT-005 | 结构化 Run/Trigger/Effect 审计事件 | L1 | P1 | 5 | P | 已有 Journal，Page 调度/GM 抽象需补 |
| PORT-006 | Capability Registry 而非暴露 chrome.* | L2 | P2 | 4 | P | 现有 Host SDK 为基础 |
| PORT-007 | 可选第三方 plugin manifest 与卸载生命周期 | L3 | P4 | 3 | P | main74 的 sidebar-tool.v1 有本机导入、id/version/capabilities 与卸载；仅 UI 适配，未统一 Candidate/安装代次/权限治理或完成 Native |
| PORT-008 | 单个插件受限资源预算与故障隔离 | L3 | P4 | 3 | P | 原 RunHost 与新增 UI tool 有局部预算/opaque sandbox；通用 plugin kind、跨窗口生命周期与原生隔离仍待验证 |
| PORT-009 | 分浏览器 API compat test suite | L2 | P4 | 4 | M | 状态需按版本实际 CHROME_NATIVE_VERIFIED |

## 4. 专家优先级 / 工程依赖与否决清单

### R8.1 P0 必须完成的新增闭环（已实现能力只回归）

1. Page Program 独立 Candidate/真实原生验证/Available/Installed/Enabled；锁定版本、来源、网站与固定依赖；源文件和安装状态必须在原框架持久化。
2. 同一受信 Broker 与唯一 Authority 上的 chrome.userScripts.register / getScripts / update / unregister，对新建文档真实执行、启停、更新、卸载、扩展更新和重启做 **actual vs desired** 对账。
3. Chrome 138+ 开关不可用、权限撤销、匹配/nonmatch、cross-origin frame、document-start 时序、依赖损坏、离线复用、更新回滚等均 fail-closed；不能把已添加 DOM 的操作描述为可撤销。
4. 既有 Sidebar 三页签/开发区草稿和单次预览不改结构。正式安装、批准、停用/权限状态只加最少 UI；复杂差异展示在独立管理页。
5. 同一候选的 SOURCE_IMPLEMENTED / COMPONENT_TESTED / BUILD_VERIFIED / CHROME_NATIVE_VERIFIED 分层验收；本地 Codex/Chrome 不可使用必须写 NOT_TESTED，不能在远端代签。

### 明确不是 R8.1 的范围

- P1：GM API 适配、@include/@exclude glob 兼容、@connect 真实跨域授权、自动更新、批量 GM Value；当前的 axiosx 是现有受控 SDK，不是 GM_xmlhttpRequest，也不会令普通页面 fetch 越过 CORS。
- P2：@background、@crontab / Chrome Alarms、UserCSS、完整回收站/备份、快捷键/右键触发器；长时后台并非 SW 默认保证。
- P3：可选 Agent/Native/MCP/Skill、视觉录制、可信键鼠/CDP、危险权限 Cookie/MAIN；Native PR #11 已经于 main@189a7037 完成源码合并；本机/原生验收与公开发布仍未关闭。
- P4：Firefox/Safari 实际支持、云同步、社区 Marketplace、开放插件 SDK；应先有目标用户需求与商店许可审查。
- LX：GM_webRequest、GM_audio.* 等默认不作为产品核心交付；若未来有用户需求先重新完成安全/标准适配决策。

### 候选优先级的硬门槛（不可平均抵消）

- 权限安全 blocker：未对每个实际 document+脚本授权，仍可读取 Cookie/网络跨域；页面 payload 可伪造 task identity；撤权后新的自动启动未阻断。
- MV3 blocker：错误宣称 SW/Offscreen 永久存活、Cron exactly-once 或秒级准时、注册/存储原子性。
- 供应链 blocker：未展示恶意 @antifeature/外部依赖/来源与扩权变更却自动更新执行。
- 发布 blocker：Chrome Web Store 针对最小权限、用户生成代码和单一用途的政策审查尚未通过；当前默认 <all_urls> 与 cookies 是明确待评审的公开分发风险。
- 验收 blocker：只有 mock/组件 PASS、纯注册描述生成或 SDK ack，却宣称已完成 Page 自动执行。

## 5. 竞品新发现的补充、来源与证据等级

| 来源 ID | 官方/公开一手来源 URL | 新增研究证据（2026-10-09） | 等级 |
| --- | --- | --- | --- |
| SRC01 | https://www.tampermonkey.net/documentation.php | 比常规 GM 列表更多：批量值、GM_addElement、GM_getTab/saveTab/getTabs、GM_audio、window.onurlchange、@run-in；支持多种 metadata 和部署规则 | OFFICIAL_DOC；行为未逐个 native 复现 |
| SRC02 | https://github.com/scriptscat/scriptcat/releases | v1.5.0-beta.1 外部 sctl CLI/MCP 及回收站；v1.5.0-beta.4 未支持 metadata/GM 显式提示、权限 diff、编辑模板；**Beta 不代表 v1.4 stable 已有** | RELEASE |
| SRC03 | https://developer.chrome.com/docs/extensions/reference/api/userScripts | Chrome 138+ 每扩展 Allow User Scripts；撤回切换后方法会失败；USER_SCRIPT 专用消息；扩展更新清空已注册脚本 | OFFICIAL_DOC |
| SRC04 | https://greasyfork.org/en/help/meta-keys | @license、@installURL/@updateURL/@downloadURL、@antifeature 等与安装身份/更新途径相关，Greasy Fork 可重写更新字段 | OFFICIAL_DOC |
| SRC05 | https://greasyfork.org/en/help/external-scripts | 远程执行代码的 @require/@resource、请求后 eval、script tag 等需要供应链审核 | OFFICIAL_DOC |
| SRC06 | https://www.goautoma.com/extension/docs/blocks/trigger.html | URL/日期/Cron/浏览器启动/右键/快捷键/CustomEvent 等十余触发场景 | OFFICIAL_DOC |
| SRC07 | https://developer.chrome.com/docs/extensions/reference/api/alarms | 低频触发/错过/恢复；Chrome 150+ persistAcrossSessions 必须版本分层，不能当作浏览器始终在线 | OFFICIAL_DOC |
| SRC08 | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts | Firefox MV3 userScripts 为 optional-only permission，和 Chrome 的 install-time + UI toggle 不同 | OFFICIAL_DOC |
| SRC09 | https://ui.vision/rpa/docs/uiv | JavaScript uiv.* 操作、OCR/AI/CSV/截图、输入层级；是对未来 P3 的参考，不必替换 RunHost | OFFICIAL_DOC |
| SRC10 | https://docs.scriptcat.org/ | ScriptCat 背景 Cron、GM 和脚本管理应按稳定/预览版分别核验，不直接复制 GPL 实现 | OFFICIAL_DOC/SOURCE_READ |
| SRC11 | https://requestly.com/products/http-interceptor/ | 网络拦截/改写、Mock 与请求观察属于独立高权限调试产品，不应混进普通 Page GM 权限 | OFFICIAL_DOC |
| SRC12 | https://github.com/openstyles/stylus/wiki/Writing-UserCSS | CSS @var/@preprocessor 的复杂性证明 CSS 应独立资产，不应由 JavaScript Task 模仿 | SOURCE_DOC |
| SRC13 | https://chromewebstore.google.com/detail/katalon-recorder-selenium/ljdobmomdgdljniojadhoplhkpialdid | Katalon Recorder 店铺明确公告不再维护，录制参考须关注供应商维护状况 | STORE |
| SRC14 | https://developer.chrome.com/docs/webstore/program-policies/policies | Chrome Web Store MV3 远程代码例外仅指定 API，且不得为将来的假想功能预留额外权限 | OFFICIAL_POLICY |
| SRC15 | https://webscraper.io/documentation/ | Sitemap/selector、云调度、导出/监控独立属于采集 RPA；项目 AGENTS.md 排除采集业务，不应因竞品有就引回当前功能 | OFFICIAL_DOC |

## 6. 维护与实施记录格式

每条功能实施必须记录：featureId、main SHA、runtimeKind、sourceFiles、tests、status、evidence SHA/path、testedChromeVersion、realPermissionState、owner/pr/nextAction。单次 test PASS 不改变其他状态；可将项目既有机器账本作为终局权威。对竞争能力仅允许 OFFICIAL_DOC/RELEASE/SOURCE_READ/COMMUNITY_REPORT/UNVERIFIED，禁止把商店宣传当测试。

**清单统计**：188 条、14 个能力模块；其中 P0 有 65 条（包括已经 S 的复用能力，绝非全部新开发），S=21、P=80、M=87、U=0。这些数字仅描述条目标签和研究范围，**不是实现百分比或产品覆盖率**。

历史状态说明：R8 文档创建前已检查 main、PR #11 和 PR #20；后续务必重新 fetch 以免并行 agent 修改导致静态标签过期。

## 7. R8 Engineering Program R1 真实源码复核（2026-10-09）

本次复核保留全部 **188 个原始功能 ID**。审查基线为 `main@945cf92726fcadcd60ecb3dc70729029fb9f28e6`；并行 `main@0dcc23b6e1a3409a0dc06f2afd2884ed1e74a448` 仅新增执行计划和路线链接，未把 PR #11/#20/#22 的功能合入。随后同步 `main@71fa54e` 的真实 HTTP 页面/测试变化及 `main@c2538e9` 的归属 CI；以上仍没有将 Native/PR #20 的候选代码合入 main。40 项工程任务沿用并行计划的 **E01–E40**，每个能力只有一个主责任务，验收任务可引用前置能力；详见 [唯一执行计划](browser-automation-r8-implementation-plan.zh-CN.md)。这里仍是唯一全量功能目录。

本轮把先前 19 个 U 项在各自真实消费者范围内改为 P/M，并纠正将未合 Native Draft 能力视为 main 部分实现的条目。审查了 `src/platform/tasks/{contract,service}.js`、`src/platform/storage/`、`src/platform/host/`、`src/framework/ChromePage.js`、`src/framework/control/native-driver.js`、`src/framework/sdk/`、`src/scripting/sandbox/`、`src/scripting/user-scripts/`、`src/ui/`、`types/opendesk-page.d.ts`、`manifest.json` 及现有测试。**M 表示对应正式功能的消费者或合同缺失，并不否定可复用的底层组件**；P 不代表整条用户流程已完成。

- **本轮产品源码切片**：`84dc3c7abe08505ae5e24849315dc8dd5587932d`（E08/E40 子项）。`src/ui/page-dependencies.js` 在检查回复、权限/文件/服务异步返回及审批时重新检查当前源码；旧依赖锁仍可按同依赖身份复用，不能借旧报告覆盖新的 GM/resource/include 拒绝。`dependency-metadata.js` 添加脚本自述的纯文本反功能风险警示。
- **EP-E1**：[独立工程回执](../framework/workstreams/r8-engineering-r1-b62cc961.json) 与 [原始日志/构建指纹](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/)：5 个新增行为用例在旧实现复现失败；修复后 71/71 定向；原候选 197/197 environment，同步新主线并处理 canonical 指南回归后最终 201/201 environment、139 文件静态检查、任务归属契约 3/3、生产/开发构建、ZIP 打包与包验证通过。源码、组件、构建分别记录；全部 Chrome 原生/用户安装闭环仍 `NOT_TESTED`。
- **技术决策**：[R8-EP-ADR-01～14](../architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md#10-r8-engineering-program-r1-增量决策) 只代表设计接受或延期/安全门槛。专用 USER_SCRIPT 消息不能单独证明具体脚本身份；没有可信实例认证不能开放特权 GM。官方匹配语义与 Chrome Alarms 版本差异均需后续原生验证。

### 7.1 后续 main@189a7037 增量复核（不重写历史证据）

PR #11 于 2026-10-08 17:38:58 UTC 合入 `main@189a7037afce89efe7fef7772e781fd70643143c`，最终 head `f1ca724a52e3190447c9be93ed9b00b8a97b52fd`；#20/#22 及后续 Program 改进随之进入主线。此前“未合 main”的说明是当时快照，已由本节更新。真实读取 `native-agent/`、`src/native-agent/`、`program-source.js`、builder 和六方法消费者后，仅将 TRG-011、AI-003、AI-007 从 M 改为 P；BG-010 继续 M，因为 IPC Host 不是独立长任务引擎。保留所有 188 个 ID 与独立规划评分。

主线已有源码/产物分离及本地 development Source Map；运行时错误映射、源码工程保存/重启/导出、Page 正式发行仍未完成，不能再把 Source Map 生成器本身当缺失。Program 自动测试 fixture 当前为 `tests/fixtures/program/d1-userscript.html`。

main189 组件/构建记录见执行计划 10.5：其精确 CI 和同源码树的 f1ca/d0f64 候选分别记录，不相加为完成率。最新 CFT 155 诊断是 extension ID 超时、0/1 FAIL；Mac Host IPC 的 3/3 使用模拟 Chrome framing，不是本机完整端到端 PASS。本轮还修复新主线遗留的 HTTP Page 草稿错按钮/错误 channel，并复用既有 HTTP 服务通过实际草稿的 200/503 组件消费验证；网页 fetch 的成功不计为 SDK axiosx、GM 或浏览器 CORS 验收。

以上统计是源码分类，不是功能完成率；本轮只交付明确标注的工程切片，未将 E08、E40 或整个 R8.1 宣告完成。

### 7.2 收尾 main@74d261b7：受限 Sidebar 工具适配已进入主线

并行 `59153b6` 新增 `src/ui/sidebar-tools.js`、`src/ui/sidebar-tools/package.js`、`src/sidebar-tools/` 与本地 packer，main74 经 14 个 WXT 入口门禁修复后构建通过。三一级页签保留，“我的工具”位于“我的任务”内部；工具只可使用 storage.local/currentPage.read/tasks.open 三项窄能力，tasks.open 只聚焦已安装任务 UI，不启动 RunHost。新增工具未在本轮 root 实现，已作为当前主线复用，不删除或重建。

据真实消费者将 ECO-011、PORT-007 从 M 改为 P；**当前合计 21 S / 80 P / 87 M / 0 U**，188 IDs 和独立评分保留。独立 UI 包的 id/version/capabilities 与 chrome.storage.local 记录尚未接入 ProgramRef、Task Revision、安装 generation、正式验证及统一 Authority；未来扩大工具能力前须经 E39/E40 收敛，不能把它作为第三套自动化权限/版本系统。工具样式不是 UserCSS，UI manifest 不是 Page Installed proof。

最新生产/开发 packageHash 为 2633c571… / 1124f3fa…；本轮组合定向 72/72、check 167、双构建/verify/pack PASS。main74 Node 环境 279 PASS/5 SKIP/0 FAIL；双 macOS CFT 各 0 PASS/2 FAIL 且 workflow failure。完整值及原始证据见唯一执行计划 10.7；旧 189/70 统计及构建回执保留固定身份，不迁移为该新包的原生验收。

### 7.3 发布前再次同步 main@5769730：保留 Page UI 与宿主消息增量

主线新增 `@opendesk/ui` Page Shadow DOM helper、CSS/JSON/本地图片的有界固定构建与 `page-ui-basic` 示例（2530b90/5769730）；它复用现有 USER_SCRIPT 草稿导入/执行，没有正式 Page 安装、GM 或 UserCSS 合同。E33 记录真实复用范围，DEV-003/004/010 的总体状态不因此升级。另有 407ac98 为已有 Sidebar 工具补充实际宿主消息负例与跨窗口 storage.onChanged 实例失效；通用权限、固定身份、安装 CAS 与部分排队/关闭回执仍缺，E39/E40 保持 PARTIAL。

本节取代 7.2 中“只含静态消息接线”和“不支持 Page 资产构建”的当前推断；旧段仍是 main74 的固定快照。188 ID、40 工程任务及 **21 S / 80 P / 87 M / 0 U** 不变，完整原生状态仍单独留证，最新构建/组件以执行计划 10.8 和实际 PR 为准。
