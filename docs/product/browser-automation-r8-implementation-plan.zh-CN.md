# OpenDesk Browser R8：跨模块工程实施计划（R8.0～R8.6）

> 研究/规划日：2026-10-09；本轮实际代码审查基线：main@f0f0026d8aa5ad324d4e6c44d2e82f3f2179ecdf。状态：IMPLEMENTATION_PLAN / PLANNED。**保存计划不代表功能已开发或原生 Chrome 通过**。执行前重新检查最新 main 和 PR。

## 一、文档职能与唯一产品定位

产品定位：**用户脚本管理器 + 现代 JavaScript 开发框架 + 可安装自动化任务 + 可选 AI Agent**。普通用户可安装受支持的网页增强脚本；开发者既能在 Sidebar 直接运行 JS，也能构建多文件 ESM；可选 Agent 通过现有 Controller/Task 而非第二引擎工作。

- [R8 188 项能力总清单](browser-automation-feature-catalog-r8.zh-CN.md)：唯一功能 ID/价值/分层/候选阶段目录；本计划**不复制第二份 188 行清单**。
- [R8 产品路线](browser-automation-r8-roadmap.zh-CN.md)：P0～P4 产品优先级、UI 与用户价值；工程批次 R8.0～R8.6 是执行拆分，不是与 P0～P4 一一对应。
- [R8 架构 ADR](../architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md)：统一 Browser Core、唯一 Authority/Broker、Host、Page/Controller 边界。
- [GM 兼容矩阵](../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md)：每个元数据和 GM API 的目标行为、源码状态与测试。
- [R8 全球竞品研究](../architecture/browser-framework/userscript-competitor-research-r8-20261008.zh-CN.md)：Tampermonkey、ScriptCat、Violentmonkey、Greasy Fork 和 RPA 来源。
- [真实框架实施状态](../architecture/browser-framework/implementation-status.md) 和机器验证账本：实际完成度的权威，不由本计划代签。

## 二、最新 main 事实与并行工作

| 已有模块 / 工作流 | 审计结论（以上 HEAD） | 处理方式 |
| --- | --- | --- |
| Controller RunHost、Authority、Task Revision、Page API/Locator | 已有源码及历史组件测试；本轮未运行原生 Chrome | 先测试与复用，不重新建设 |
| Sidebar 三页签、Controller 草稿运行、Page USER_SCRIPT 即时试运行 | 已有 UI/Host 接线，Preview 不等于 Installed | 保留原三页签、原底栏和 UserScript 折叠区 |
| D1 @require 元数据/不可变锁及 Page descriptor 编译器 | 已有源码；正式 Page persistent register/getScripts 对账仍未证实 | 优先连接正式安装，不重做 downloader 和 DB |
| Browser Test Lab R8 | 当前 main 已新增七组 Locator/HTTP/表单场景及 docs/framework/browser-test-lab-r8.zh-CN.md | 固定人工入口 examples/tasks/demo-form.html；勿再建重复 /fixture |
| [PR #22](https://github.com/shopable-ai/opendesk-browser/pull/22) | **Merged=true（2026-10-08T17:11:02Z），base 为 Native 草稿分支，不是 main**；多文件 authoring 快照/构建产物分离，含部分 CFT 149 证据；未进入 main | E03 专项验收，不在 E33 重新发明同一 Editor 功能 |
| [PR #20](https://github.com/shopable-ai/opendesk-browser/pull/20) | **Merged=true，但 base=agent/native-agent-bridge-r1-20261008，未进入 main**；真实 HTTP/axiosx fixture 仍属候选；缺完整 Chrome 结果 | E04 专项验收，不将网页 Fetch 当 GM_http 实现 |
| [PR #11](https://github.com/shopable-ai/opendesk-browser/pull/11) | Draft/Open；Native Agent Host/CLI，缺同最终候选真实 Chrome+Codex E2E | E05 独立验收，R8.1 Page 安装不依赖 Native |
| GM_*/GM.*、@background、@crontab、UserCSS | 在已抽查 main 未发现完整的正式产品闭环 | 进入后续批次，实际开发前重新查代码；不能因有 chrome API 声称已兼容 |


> **R8 Engineering Program R1 · 2026-10-09 增量审计快照**：GitHub main@ca3e7655f8054494b024ccca3e2d7aab50ce8638；PR #11（Native）仍 Draft/Open；PR #20（HTTP/axiosx）和 #22（多文件源码）均已 **Merged 到 Native 草稿分支而非 main**；三个工作流的候选新增功能均不能据 PR 状态算作正式 main 已发布；受限环境未接入 Mac 工作区或真实 Chrome/Codex，以上 PR 原生端到端项保持 NOT_TESTED。R8 目录初次与 E01～E40 对账时有 35 个功能 ID 未显式归属，下面“追溯补充”只指定责任和处置，不增加新执行引擎或声称功能已完成。新增源代码层自动检查：node --test tests/environment/r8-backlog-contract.test.mjs；其通过也不是 Chrome 原生验收。


> **GitHub PR base 核实（2026-10-08T17:04:34Z 后）**：PR #20 合并 commit `33a551a6f1d308e7c9593bfa5ee8b1baf5fad2fd` 的父提交分别是 Native 草稿 `bdb3bf9b55a56dfbc70e2fb2b30b70a11252cc42` 与 HTTP 候选 `66cfcbd67fb2393d0addaa3d81b15c273ed6710a`；GitHub API 的 PR base.ref 是 `agent/native-agent-bridge-r1-20261008`，并非 `main`。在当前 main 读取 `examples/tasks/http-test-server.mjs`、`native-agent/native-host.mjs`、`src/ui/program-source.js` 均为 404。这说明 #20 的 `merged=true` 不能作为 E04 已合主干证据。PR #22 的 base.ref 同样为 Native 草稿分支。E03/E04/E05 的正式闭环均需要核对最终合入 main 的 commit ancestry、目标文件及冻结 SHA；合并后的真实 Chrome/Codex 验收不能借用旧 PR 回执。

> **二次集成目标纠正（2026-10-08T17:11:02Z）**：PR #22 与 #20 一样，已被 **合并至 Native Agent 草稿分支** 而不是 main；PR #22 merge commit `a2e1bda59bf74fabfb9ae3cd2b882c483cdc1383`。PR #11 仍 Draft/Open 且目标为 main，是真正把 #20/#22 候选传入主干的潜在汇合入口，但未经过安全整合/原生验收时不得强行合并。尤其不能把 #20/#22 的 `Merged` 标签当作 `MAIN_SOURCE_IMPLEMENTED`。

当前 main 已声明 MV3、最低 Chrome 138、<all_urls> 与部分敏感命名权限；这不等于用户脚本有全部权限，也不证明 Chrome Web Store 公开发布已经满足最小权限政策。PR 状态可能随其它工作流变化，请在执行当日更新。

## 三、架构实施边界

1. **四个正交维度**：源码形态（单文件、传统 .user.js、多文件 ESM）× Runtime Kind（Page、Controller、未来 Background/UserCSS）× Trigger（手动、网站匹配、导航、Cron、可选 Agent）× 发布状态（Draft→Candidate→Verified→Available→Installed/Enabled）。能力/权限单独逐层授权。
2. Page USER_SCRIPT 可直接操作获准 DOM；Controller 的现代 Locator 只由现有 Worker/RunHost 使用。GM facade 只翻译兼容 API，不开放任意 chrome.*；不创建第二 Controller/Task DB/Network Broker。
3. Chrome manifest 全站声明只是宿主资格。实际目标需要 Chrome 实时网站访问 × Page 规则 × 已安装脚本能力 × 本次操作目标的交集；@connect、Cookie、Native IPC 等另设安全准入。
4. Service Worker 空闲后不可靠存活。后台任务和 Cron 必须持久化调度/租约/误时补偿；Offscreen、Native Host 不能未经证据承诺 24×7 或远端副作用 exactly-once。
5. Sidebar 的一级页签始终为 我的任务 / 发现 / 开发。复杂安装审核、GM 权限 diff、完整编辑和调试留给独立管理页；不要为了竞品功能新增一整套控制台。
6. 无需开发 GM_audio、GM_webRequest 或默认 MAIN/unsafeWindow；高风险 Cookie/代理/调试器如有需求，先做独立隐私与权限 ADR。

## 四、分阶段工程交付

| 工程阶段 | 核心目标 | 工程任务 / 验收门槛 |
| --- | --- | --- |
| **R8.0 现有工程与未合 PR 收敛** | 稳定已实现 Controller/Sidebar/ESM/axiosx/Native 的测试基线；PR #22/#20/#11 独立验收，不把三者作为 Page P0 必需依赖 | E01、E02、E03、E04、E05、E06；必须有阶段所需的源码/组件/构建/真实原生证据，不得以文档或旧 PR 冒充 |
| **R8.1 正式 Page Userscript 基础闭环** | 可信导入+类型验证+自动注册+匹配+启停撤权+版本回滚+重启恢复+真实 Chrome 用户验收 | E07、E08、E09、E10、E11、E12、E13、E14、E15；必须有阶段所需的源码/组件/构建/真实原生证据，不得以文档或旧 PR 冒充 |
| **R8.2 GM G0/G1 核心兼容** | 可信 GM 通道、脚本私有存储、样式/资源/菜单、逐方法兼容测试 | E16、E17、E18、E19、E20、E21、E22、E23；必须有阶段所需的源码/组件/构建/真实原生证据，不得以文档或旧 PR 冒充 |
| **R8.3 网络与脚本管理** | 授权 GM_xmlhttpRequest、下载/通知/标签页、脚本更新审批与日志备份 | E24、E25、E26、E27、E28；必须有阶段所需的源码/组件/构建/真实原生证据，不得以文档或旧 PR 冒充 |
| **R8.4 后台与定时触发** | Background Script、Cron/Alarms、错过执行补偿、失败恢复与事件触发 | E29、E30、E31、E32；必须有阶段所需的源码/组件/构建/真实原生证据，不得以文档或旧 PR 冒充 |
| **R8.5 开发者与 AI** | 源码产物分离、GM 类型/调试、录制成 JS、Agent→任务固定发布、可选 MCP/Skill | E33、E34、E35、E36；必须有阶段所需的源码/组件/构建/真实原生证据，不得以文档或旧 PR 冒充 |
| **R8.6 跨平台与生态** | UserCSS、Firefox/Safari、同步/市场/Plugin SDK 在独立需求与安全证据充分后开发 | E37、E38、E39；必须有阶段所需的源码/组件/构建/真实原生证据，不得以文档或旧 PR 冒充 |
| **横向安全审计** | E40 贯穿各阶段 | 任一关键权限、供应链或 Chrome 政策 blocker 未关闭就不签收对应产品阶段 |

## 五、40 项实际工程任务（关联 188 项功能 ID）

每个 E ID 是可执行任务；功能清单的 INS/META/LIFE/GM 等 ID 是另一层追踪标识。**C/R** = 复杂度/权限安全风险，均按 1～5 单独评分，只用于排优先级而不代表已完成质量。状态为静态审计标签，必须在执行时依据新的真实 main 修订。

### R8.0 现有工程与未合 PR 收敛

| 工程任务 | 功能 ID | 前置 | C/R | 当前状态 | 相关源码与可独立签收条件 |
| --- | --- | --- | --- | --- | --- |
| **E01 核查 HEAD/PR/Worktree/验收证据** | SEC-013、PORT-005、DEV-012 | — | 2/3 | PARTIAL | AGENTS.md、parallel-development.md、GitHub PR/CI；**验收**：列出真实仓库 HEAD、PR #11/#20/#22、影响的源码和每份回执绑定的候选 |
| **E02 既有 RunHost/Controller/Locator/Task 回归** | AUTO-001、AUTO-002、AUTO-003、AUTO-004、AUTO-005、AUTO-006、AUTO-012 | E01 | 3/4 | SOURCE_IMPLEMENTED | src/framework/、src/run-host.js、src/platform/tasks/host/；**验收**：同候选验证运行、停止、持久结果、导航与撤权，不能以旧候选 Native PASS 代替 |
| **E03 验收集成 PR #22 ESM 源码/构建产物** | DEV-003、DEV-004、DEV-008、DEV-011 | E01,E02 | 3/3 | MERGED_TO_NATIVE_DRAFT_NOT_MAIN | PR #22：scripts/build-program-project.mjs、src/ui/、测试；**验收**：源文件只读快照与执行字节哈希一致、调试映射、真实运行/保存/重启；满足门槛才集成 |
| **E04 验收集成 PR #20 axiosx 真实 HTTP** | SEC-012、AUTO-008、DEV-012 | E01,E02 | 3/4 | MERGED_TO_NATIVE_DRAFT_NOT_MAIN | PR #20：demo-form、HTTP loopback、SDK Network；**验收**：真 Chrome MAIN/Controller SDK GET/POST、跨源和拒权/撤权；Fetch 仅作 CORS 对照 |
| **E05 验收集成 PR #11 Native Agent** | AI-003、AI-004、AI-007、TRG-011 | E01,E02 | 5/5 | PR_DRAFT | PR #11：Native Host/CLI、SW transport、RunHost；**验收**：Mac 真 Chrome+Codex 连接、授权、target、run/get/stop、失联与无 AI 运行回归，达标再合并 |
| **E06 验证已合入 Browser Test Lab 基线** | DEV-012、UX-011、AUTO-002、AUTO-003、PORT-005 | E01 | 2/2 | SOURCE_IMPLEMENTED;NATIVE_NOT_TESTED | examples/tasks/demo-form.html、browser-test-lab-r8 文档及 Node 测试；**验收**：保留已合入 Locator 七组场景、单一人工入口，组件结果不冒充 Chrome 真实回执 |

### R8.1 正式 Page Userscript 基础闭环

| 工程任务 | 功能 ID | 前置 | C/R | 当前状态 | 相关源码与可独立签收条件 |
| --- | --- | --- | --- | --- | --- |
| **E07 Page Revision/Installed 身份及持久资产** | INS-007、INS-008、SEC-005、META-002 | E01,E02 | 4/5 | PARTIAL | page-program-contract.js、storage/、host/；**验收**：冻结 script ID、revision、sourceHash、manifestHash、依赖锁和 Page 类型，不另建 Task DB |
| **E08 经典脚本文件/HTTPS 来源与审核** | INS-001、INS-002、INS-005、INS-006、META-001、META-004 | E07 | 3/4 | PARTIAL | dependency-metadata.js、dependency-manager.js、task-workbench.js；**验收**：导入只产生明确的未安装候选，展示实际字节、网站、许可和反功能风险 |
| **E09 Page 类型专属 Verification/Available** | INS-008、LIFE-007、AI-002、SEC-006 | E07,E08,E02 | 5/5 | MISSING_CLOSED_LOOP | 现有 Authority/Broker、Page manifest/preview；**验收**：预安装来源/源码与类型证明、安装后 native 自动效果分别留证；不借 Controller RunResult 冒充 |
| **E10 单 Writer userScripts 注册与状态对账** | LIFE-001、LIFE-002、LIFE-003、LIFE-004、LIFE-015、TRG-003 | E07,E09 | 5/5 | MISSING_CLOSED_LOOP | src/sw.js、broker.js、page-program-package.js；**验收**：register/getScripts/update/unregister 按 desired/actual 和 generation 幂等对账，重启/更新可恢复或拒绝 |
| **E11 站点匹配、runAt、frame、once 语义** | META-005、META-006、META-009、META-010、META-014、LIFE-006、LIFE-007、LIFE-009 | E10,E06 | 4/5 | PARTIAL | dependency-metadata.js、execution-source.js、tests/environment/；**验收**：匹配一次、非匹配零次；真实测试 document-start/end/idle、嵌套 frame 与已锁依赖顺序 |
| **E12 撤权竞态/USER_SCRIPT 文档级授权** | LIFE-005、LIFE-010、LIFE-011、SEC-001、SEC-002、SEC-008、SEC-009 | E07,E09,E10 | 5/5 | CRITICAL_PARTIAL | permission-gate.js、Broker、SW、userScripts 世界消息；**验收**：关闭开关、站点撤权、停用、导航后新文档失败关闭；同步 document-start 不可保证时显式降级 |
| **E13 版本切换与旧版回滚** | INS-013、LIFE-012、SEC-005、SEC-006 | E07,E10,E12 | 4/5 | MISSING | storage/、Broker、Page revision 与安装指针；**验收**：存储与原生注册非原子时使用固定 generation/operationId；失败不运行未批准新字节 |
| **E14 三页签内 Page 最小管理 UI** | INS-009、UX-003、UX-006、UX-007、UX-008、UX-011 | E08,E10,E12 | 3/3 | PARTIAL | tool.html、task-workbench.js、script-editor.js、完整管理页；**验收**：保留现有运行草稿/保存/停止及三页签，增加 Page Installed/Preview/权限/启停的真实状态 |
| **E15 真实 Chrome P0 用户闭环签收** | DEV-012、LIFE-003、LIFE-004、LIFE-006、LIFE-011、SEC-008 | E10,E11,E12,E13,E14,E06 | 5/5 | NOT_TESTED | demo-form.html、原生 Chrome/CFT 和测试账本；**验收**：导入→验真→安装→新文档运行→停用→撤权→回滚→重启/升级对账全部有 native + 网页效果证据 |

### R8.2 GM G0/G1 核心兼容

| 工程任务 | 功能 ID | 前置 | C/R | 当前状态 | 相关源码与可独立签收条件 |
| --- | --- | --- | --- | --- | --- |
| **E16 GM Facade 与可信专用 Script 消息桥** | SEC-004、META-012、GM-001、GM-023 | E07,E10,E12,E15 | 5/5 | MISSING | 现有 SDK Broker/Authority 与新的 GM facade；**验收**：验证真实 sender/world/document/install generation，payload 无法伪造脚本 ID、grant 或特权 chrome.* |
| **E17 GM_info/addStyle/addElement/log G0** | GM-001、GM-002、GM-003、GM-004 | E16 | 2/3 | MISSING | GM facade、DOM scoped adapter、受控日志；**验收**：只读身份、样式生命周期、元素安全约束和日志限额有方法级测试 |
| **E18 GM Promise KV 存储 G1** | GM-005、GM-007 | E16,E07 | 4/4 | MISSING | SDK storage.js、platform/storage/、GM 适配；**验收**：同 script namespace 持久化、删除/枚举，跨脚本无法访问，撤权/重启有正确错误 |
| **E19 GM 同步镜像、批量和变更事件** | GM-006、GM-008、GM-009 | E18 | 5/4 | MISSING | GM local cache、storage 订阅、types/；**验收**：不伪造同步跨进程 RPC；批量语义、跨标签 remote 标志、监听清理明确实测 |
| **E20 @resource 与 GM Resource API** | META-015、GM-010、GM-011 | E16,E07 | 3/4 | MISSING | 现有 dependency-manager 与资源锁；**验收**：resource 名称/MIME/hash/URL 生命周期正确，未声明与损坏资产失败关闭 |
| **E21 GM 菜单命令与脚本归属** | GM-012、UX-010 | E16,E14 | 3/3 | MISSING | src/ui/、Broker、受控菜单组件；**验收**：注册/取消/重启生命周期正确、菜单不能跨脚本冒充、不增加 Sidebar 一级页签 |
| **E22 @include/exclude 与 SPA urlchange 兼容** | META-007、META-008、LIFE-008、TRG-004 | E11,E12 | 4/4 | MISSING | metadata parser、Chrome 原生 glob、SPA adapter；**验收**：能用 Chrome includeGlobs/excludeGlobs 的先映射，非标准正则显式拒绝，SPA 不重复整脚本 |
| **E23 GM G0/G1 方法级兼容验收** | GM-023、DEV-007、DEV-012 | E17,E18,E19,E20,E21,E22 | 4/4 | NOT_TESTED | tests/environment/、Chrome 方法级测试、types/；**验收**：记录各管理器/浏览器/API 版本、Promise/同步/回调/错误，不宣传未经测的 fully compatible |

### R8.3 网络与脚本管理

| 工程任务 | 功能 ID | 前置 | C/R | 当前状态 | 相关源码与可独立签收条件 |
| --- | --- | --- | --- | --- | --- |
| **E24 @connect 与 GM_xmlhttpRequest 适配** | META-013、GM-013、SEC-003、SEC-012 | E16,E12,E23 | 5/5 | MISSING | 现有 NetworkService/axiosx 驱动 + GM XHR facade；**验收**：Chrome host×@connect×用户×应用层授权，abort/timeout/回调/凭据与重定向行为可验证 |
| **E25 GM 下载/通知/新标签页受控适配** | GM-014、GM-015、GM-016、SEC-010 | E16,E12 | 3/5 | MISSING | downloads/、notifications/tabs 服务及 Broker；**验收**：文件/URL/容量/用户手势与权限状态受控，脚本不持有 chrome API |
| **E26 脚本更新/权限差异/来源审批** | INS-010、INS-011、INS-012、META-003、META-004、META-016、ECO-001、ECO-002、ECO-003、ECO-004 | E07,E08,E13,E23 | 4/5 | MISSING | Page 版本/依赖锁、独立安装页；**验收**：更新只下载候选，来源、依赖、站点、@grant/@connect 变化由用户审核，旧版能回滚 |
| **E27 脚本日志/诊断/备份/恢复** | INS-014、INS-015、INS-016、INS-017、DEV-009、UX-009、SEC-011 | E15,E18,E26 | 4/4 | PARTIAL | 原 Run Journal、Storage、独立管理页；**验收**：区分注册 ack 与真实页面效果；导入导出完整校验、敏感数据脱敏与存储引用清理 |
| **E28 GM 网络和更新原生总体验收** | GM-013、GM-014、GM-015、GM-016、GM-023、SEC-003、DEV-012 | E24,E25,E26,E27 | 5/5 | NOT_TESTED | 受控 HTTP 服务器与 CFT/Chrome、SDK/GM Fixture；**验收**：跨域拒权/授权/撤销、超时、错误回调、更新权限、旧版回滚真实有效 |

### R8.4 后台与定时触发

| 工程任务 | 功能 ID | 前置 | C/R | 当前状态 | 相关源码与可独立签收条件 |
| --- | --- | --- | --- | --- | --- |
| **E29 Background runtime 与隔离预算** | BG-001、BG-008、BG-009 | E07,E12 | 5/5 | MISSING | 现有 Sandbox/Host/Journal、可选 Offscreen；**验收**：无 DOM、短时可控执行/生命周期退出可记录；不让 Service Worker 伪装常驻 |
| **E30 Cron/Alarms/fireId/错过策略** | BG-002、BG-003、BG-004、BG-005、BG-006、TRG-008、PORT-004 | E29 | 5/5 | MISSING | Chrome alarms、存储的 ScheduleDefinition 与租约；**验收**：时区/DST、skip/coalesce/catch-up、SW 恢复及重复 tick 可控；不承诺远端 exactly-once |
| **E31 快捷键/右键/启动事件触发** | TRG-005、TRG-006、TRG-007、TRG-009、META-018 | E29,E12 | 4/4 | MISSING | Chrome commands/contextMenus/webNavigation、权限 Gate；**验收**：站点与用户手势要求明确，来自网页 CustomEvent 不可伪造受信授权 |
| **E32 后台任务故障注入和原生验收** | BG-007、BG-011、LIFE-015、SEC-008 | E29,E30,E31 | 5/5 | NOT_TESTED | CFT + native profile + 故障日志；**验收**：休眠/重启/重复闹钟/错过执行/撤权/暂停，未知副作用不盲目重放 |

### R8.5 开发者与 AI

| 工程任务 | 功能 ID | 前置 | C/R | 当前状态 | 相关源码与可独立签收条件 |
| --- | --- | --- | --- | --- | --- |
| **E33 成熟 ESM/类型/Source Map 开发体验** | DEV-006、DEV-007、DEV-008、DEV-009、DEV-010、DEV-011 | E03,E23 | 4/3 | PARTIAL;PR_DRAFT | 复用 PR #22 已有 authoring 快照、脚本构建和 Editor；**验收**：调试指向实际源码/helper 文件，保存/运行仍冻结编译字节，不破坏单文件入口 |
| **E34 Agent→验证 Task→无 AI 重跑** | AI-001、AI-002、AI-003、AI-004、AI-005、AI-006、AI-010 | E05,E02,E15 | 5/5 | PARTIAL;PR_DRAFT | R6 合同、PR #11、Task Service 与 RunHost；**验收**：观察/动作/真实 Result/Task 发布的固定 hash 一致，关闭 Native/AI 后重复运行两次 |
| **E35 可选录制→Locator/JavaScript 草稿** | AUTO-011、AI-009、AUTO-012 | E02,E34 | 5/5 | MISSING | 已有 Locator/observe、受控 recorder adapter；**验收**：录制不另造工作流执行器，生成 JS 必须审查，未知页面副作用不盲重放 |
| **E36 可选 CLI/MCP/Skill Tool facade** | AI-007、AI-008、AI-011、TRG-011、PORT-006 | E05,E34 | 4/5 | PARTIAL;PR_DRAFT | 沿用 Native Host/RunHost 与现有权限系统；**验收**：只调用已授权 runId/target/能力，普通任务不依赖 Agent 长连接 |

### R8.6 跨平台与生态

| 工程任务 | 功能 ID | 前置 | C/R | 当前状态 | 相关源码与可独立签收条件 |
| --- | --- | --- | --- | --- | --- |
| **E37 独立 UserCSS 样式安装和回滚** | CSS-001、CSS-002、CSS-003、CSS-004、CSS-007 | E07,E13,E14 | 3/3 | MISSING | 独立 Style driver + 现有版本/来源/目录；**验收**：只运行 CSS，按站点匹配、启停、回滚、冲突提示；不转成特权 JS |
| **E38 Firefox/Safari 平台适配** | PORT-001、PORT-002、PORT-003、PORT-009 | E15,E23,E32 | 5/5 | MISSING | BrowserUserScriptsDriver/Permissions/Schedule 适配；**验收**：Firefox optional-only userScripts、Safari 授权/world 差异均各平台真实验收 |
| **E39 按需求评估订阅/同步/市场/Plugin SDK** | ECO-005、ECO-008、ECO-009、ECO-010、ECO-011、ECO-012、PORT-007、PORT-008 | E26,E27,E38 | 5/5 | DEFERRED | 原来源/版本/权限合同、未来可选账户服务；**验收**：发现脚本≠安装授权；同步冲突、签名/许可/隐私独立评审，未有真实需求不启动 |

### 全程 E40 安全、隐私与发布约束

功能 ID：SEC-013,SEC-014,SEC-015,ECO-004,SEC-009；复杂度/风险：4/5；审计对象：manifest.json、permission-gate.js、官方 CWS 规范与引用许可。完成条件：审查 Cookie/all_urls 默认声明、远程代码隔离、第三方 GPL 和敏感日志，关键安全问题不能用高平均分抵消。不因为其它功能高分或 CI 通过就跳过此关口。


### 188 项功能 ID 追溯补充：遗漏的 35 项（不新建第二份功能清单）

逐项总目录仍以 browser-automation-feature-catalog-r8.zh-CN.md 为准。**责任 E ID** 表示归属现有 40 项工程任务，不表示源码已实施；**保留回归** 表示已有实现或边界需要回归，**延期评估** 表示不进入近期 P0/P1 的正式交付，**不实现** 表示不作为普通用户脚本兼容能力提供。所有状态在相应 E 任务完成前均不得自动提升为 CHROME_NATIVE_VERIFIED。

| 责任任务 | 原功能 ID（仅补足追溯） | 处置 | 必须遵守的边界 |
| --- | --- | --- | --- |
| E02,E06,E14 | INS-003,DEV-001,DEV-002,TRG-001,TRG-002,UX-001,UX-002,UX-004,UX-005 | 保留回归 | 草稿即时运行、Controller 手动运行与三页签，不因 R8.1 安装改造而退化；原生状态未补测 |
| E06,E07,E08 | DEV-005,SEC-007,META-011 | 保留回归 | 复用 D1 锁、拒绝未知特权元数据；@grant none 不等于 MAIN 世界 |
| E08,E14 | INS-004 | 延期评估 | 发现网页 user.js 链接只生成待审核候选，不能静默安装 |
| E14,E33 | META-019,UX-012 | 延期评估 | 多语言展示及高级 GM 调试先放独立管理页，不改 Sidebar 一级导航 |
| E12,E15 | LIFE-013 | 保留回归 | 撤权/停用保证未来注入栅栏，不承诺撤销已经发生的 DOM 副作用 |
| E11,E27 | LIFE-014 | 延期评估 | 锁定依赖顺序与诊断优先，跨脚本冲突分析待真实案例 |
| E22,E40 | META-017 | 延期评估 | @run-in/@sandbox/@unwrap 不自动转换成 MAIN 或新特权 |
| E25,E40 | GM-017,GM-018 | 延期评估 | 剪贴板/高敏 Cookie 必须重新审核真实权限与用户意图，默认不可用 |
| E39,E40 | GM-019 | 延期评估 | 不提供跨脚本标签枚举，需求与隔离证明不足时不实现 |
| E40 | GM-020,GM-021 | 不实现 | 不把 GM_audio 和 GM_webRequest 宣称为常规兼容功能 |
| E16,E40 | GM-022 | 延期评估 | unsafeWindow/MAIN 必须经独立世界与风险评审，默认不开放 |
| E33 | AUTO-007,AUTO-009 | 延期评估 | 优先 JavaScript/Locator 组合；多 Tab/frame 范围逐项验证，不重建图形工作流引擎 |
| E35,E40 | AUTO-010 | 延期评估 | OCR/截图需要单独用户授权、隐私与性能验收 |
| E40 | AUTO-013 | 延期评估 | 网络拦截/改写不等于受控 axiosx，不自动扩大 debugger/DNR 权限 |
| E27 | AUTO-014,ECO-007 | 延期评估 | 文件资产/备份含敏感配置的导出范围、编码和恢复校验独立评审 |
| E31,E40 | TRG-010 | 延期评估 | 网页 CustomEvent 不得当成可信手势或任务授权 |
| E05,E29 | BG-010 | 延期评估 | 长任务 Native Host 独立显式授权，不使 Agent 成为普通任务必需 |
| E37,E39 | CSS-005,CSS-006 | 延期评估 | CSS 预处理与同步不进入最小 UserCSS 基础闭环 |
| E27,E39 | ECO-006 | 延期评估 | 批量分组管理先等待本地安装规模与真实 UX 证据 |

**可执行门禁**：tests/environment/r8-backlog-contract.test.mjs 以 Node 内建测试库校验 188 个功能 ID 唯一、E01～E40 按序存在、R8.0～R8.6 阶段齐全、补充责任任务合法、无遗漏/虚构 ID。该检查不验证 feature 实现、Chrome 权限或用户安装效果。


## 六、依赖顺序与可并行工作

关键路径：E01 + E02 + E06 → E07/E08 → E09 → E10 → E11/E12 → E13/E14 → **E15 原生 Chrome P0 签收** → E16 GM bridge → E17–E23 GM G0/G1 → E24–E28 GM HTTP/更新。

- **不阻塞 Page P0**：E03（PR #22）、E04（PR #20）、E05（PR #11）彼此可分流验收，但同一 Broker/RunHost/Sidebar/manifest 修改最终必须由一个有权集成者串行合并。
- **安全关键门**：E12 的撤权围栏与执行时序无法证明，就不把 E10 的注册 API 调用算作 R8.1 已完成。E15 的真 Chrome 通过必须包含 E12。
- **可有条件并行**：E29–E32 Background/Cron 可在 E12 合同稳定后独立实施，不必等 E24 GM 网络；E33 基于 PR #22、E34/E36 基于 PR #11，不得复制其实现。
- **待用户价值验证**：E37 UserCSS、E38 Firefox/Safari 与 E39 同步/市场先独立原型或 POC，未完成基础 Chrome 信任链与真实需求时不抢先扩张默认权限。

## 七、首批执行工作包（下一轮从这里开始）

| 先后 | 执行组合 | 具体交付物 | Go/No-Go |
| --- | --- | --- | --- |
| 1 | E01、E02、E06 | 最新源码指纹、PR/测试资源归属、现有 Controller/Sidebar/Browser Test Lab 基线 | 未确认共享文件 owner 或原生证据来源，不做大范围改造 |
| 2 | E07、E08、E09 | Page Revision/Asset/来源审核/类型专属 Candidate→Verified→Available | 未经 Authority、固定源码和锁验证不允许 installed/registered |
| 3 | E10、E11、E12 | userScripts desired/actual 对账、匹配、撤权与文档启动围栏 | 新文档停用/撤权仍执行或 document-start 不受控则必须阻断/降级 |
| 4 | E13、E14、E15 | 更新回滚、Sidebar 最小用户管理、真实 Chrome 原生 P0 E2E | 未完成新 Profile 安装/重启/扩展更新测试不签收 R8.1 |
| 5 | E16–E23 | 首批 GM 方法兼容及真实 API 行为档案 | 只宣布经过验证的 API/参数/浏览器版本子集 |
| 6 | E24–E40 | 网络、调度、Agent、UserCSS、生态按价值分线推进 | 高风险/跨端/市场需独立需求、许可及权限审查 |

### R8.1 完成后用户实际可以做什么

可在现有管理页明确审核并安装受支持的经典 .user.js 或冻结的 Page Program；只在批准的网站新文档按匹配规则自动运行；在现有 Sidebar 查看状态并启停/卸载；使用既有 @require 不可变依赖；浏览器重启/扩展升级后核对并恢复注册，版本替换失败回滚旧版。**停用不保证撤销旧 DOM 改动**。

尚**不能**因此宣称完全兼容 Tampermonkey/ScriptCat：GM_xmlhttpRequest、GM 存储/菜单/资源等未交付的语义、@background/@crontab、可用的 AI 录制、Firefox/Safari、云市场/同步仍需各自批次完成。

## 八、Native 验收、证据等级与失败关闭

状态必须分列 SOURCE_IMPLEMENTED、COMPONENT_TESTED、BUILD_VERIFIED、CHROME_NATIVE_VERIFIED、USER_FLOW_VERIFIED、FINAL_ACCEPTED；同时允许 PARTIAL/MISSING/NOT_TESTED/PR_ONLY/BLOCKED。构建、模拟回执或 Native register 方法成功**不**等于网页脚本真正执行或用户安装通过。

### 固定人工网页与命令

- 唯一通用手工 Fixture：examples/tasks/demo-form.html；启动 python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks，访问 http://127.0.0.1:43111/demo-form.html。已合入 Locator 实验室第七组，不要恢复临时 /fixture 入口。独立原生/自动化 Fixture 可以保留。
- 核验命令：npm run check、npm test、npm run build、npm run build:dev、npm run verify；先执行受影响的 node --test 定向测试，再对同一冻结候选完成必要全量回归。
- PR #20 若仍未合并，不假定 tests/http-test-server 或可选回环服务在 main；HTTP 验收应检查真正存在的 fixture 与脚本。页面原生 Fetch、注入 SDK axiosx、Controller Network、未来 GM XHR 是不同测试对象。

### R8.1 绝不能跳过的十条原生用例

1. 用户导入→来源/实际字节/依赖 hash 审核→Candidate/真实准入→明确安装；禁止仅编译 descriptor 就显示 Available。
2. 新 HTTP(S) 文档匹配执行一次，不匹配网站零次，多标签/重载不重复错误执行。
3. document-start/end/idle、同源/跨源子 frame、about:blank 与受限浏览器地址的拒绝/降级边界明确。
4. SPA pushState/replaceState/popstate 不把同文档导航误当作新的注入文档。
5. 已批准 @require 库按序、离线复用；缓存缺失/hash 损坏失败关闭。
6. 网站撤权、关闭 Chrome 138+ Allow User Scripts、停用/卸载后下一文档不执行；记录异步 gate 对 document-start 的时序影响。
7. 用户选择版本升级，来源/权限/依赖变化重新核对，失败保持旧版已审核的固定字节。
8. Service Worker 休眠、扩展升级清空注册、浏览器重启时实际 native 注册与持久 desired 状态重对账。
9. 并发安装、停用、切导航和迟到 ACK 不会恢复过期 generation 或破坏原 Authority。
10. 既有 Controller Task、单文件/多文件源码入口、axiosx、Sidebar 三页签及旧 Task 包的功能/哈希不倒退。

### 每个 E 任务更新时必须记录

taskId、featureIds、mainSha、PR/worktree、changedFiles、runtimeKind、sourceHash、manifestHash、dependencyLockId、permissionSnapshot、componentTests、buildHash、browserVersion、extensionId、documentId、nativeRegistrationId、runId/resultId（如适用）、pageEffectEvidence、result、blockers、nextAction。不存在的证据写 NOT_TESTED，不得伪造。在工作流 docs/framework/workstreams/ 中保存独立运行记录而不是重写历史 owner/receipt。

## 九、工程开发与 Git 规则

1. 开始前检查 AGENTS.md、docs/framework/parallel-development.md、main 最新 HEAD、所有 PR 和本地 git status。多 Agent 独立工作区/任务分支可以并行；main 只由经授权的集成者按已经验收的候选逐个集成。最终只有 main 是正式交付，不强推、不删除尚有唯一未合代码的分支。
2. 既有实现优先测试与修复，而不是重建。例如 modern Page API/RunHost、D1 @require、R6 Sidebar、原 ESM 编译、R8 Browser Test Lab、PR #11/#20/#22。
3. 做出源码修改必须同步其真实消费者、文档、最小复现、测试和回滚策略；共享 Broker/Authority/Storage/SW/Sidebar 改动要预先审查与其他工作流的文件交叉。
4. 无法从当前环境直接访问用户的本地 Mac Chrome/Codex 时如实标注 NOT_TESTED，保存可直接本地执行的精确验收 GOAL；不能让旧 PR 的模拟 Chrome 帧充当真实 Native 运行。
5. 工程完成后更新此 E 任务状态和 188 功能目录相应 ID，附真实 HEAD 与测试证据。任务计数或平均评分不能代替功能质量；未关闭 P0 安全阻断时绝不能宣布 95+ 最终验收。

## 十、下一轮可直接使用的执行指令

> GOAL：在 shopable-ai/opendesk-browser 最新 main 的真实源码上推进 OpenDesk R8.1 第一闭环。阅读 AGENTS.md、docs/framework/parallel-development.md、本文及 R8 188 项功能目录。先核查 PR #11/#20/#22 与已经合入的 Browser Test Lab，保护并行工作。优先推进 E01/E02/E06 基线和 E07/E08/E09 Page 资产、来源、类型专属验证；若具备安全前提再实现 E10 注册对账，但 E12 撤权围栏未关闭时不得宣称 P0 完成。复用现有 RunHost/Authority/Task/依赖锁/Sidebar，不重复开发已有功能、不添加第四页签。输出实际修改的源码、同步文档、Node/构建/真实 Chrome 分层证据、阻断、合并 SHA 或未合 PR、下一批 E10～E15 可执行 GOAL。

**说明**：本文件只是 R8 完整实施计划的实际仓库保存版本，不能替代未来代码开发、功能验收或真实 Chrome 发布证明。
