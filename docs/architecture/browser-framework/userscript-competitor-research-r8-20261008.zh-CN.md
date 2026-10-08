# OpenDesk Browser R8：全球用户脚本、UserCSS 与浏览器自动化竞品研究

> 调研日：2026-10-09（亚洲时区）；目标：OpenDesk Browser main。证据级别：OFFICIAL_DOC（官网/API）、SOURCE_READ（公开源码文件）、RELEASE（公开版本记录）、STORE（扩展商店）、USER_REPORT（公开 issue/评价）、INFERENCE（研究推断）、UNVERIFIED（未原生复现）。**文档不等于本地运行或兼容验收**。当前公共市场资料可能随更新失效，产品版本以此日检索为准。

## 1. 结论与边界

产品定位：**用户脚本管理器 + 现代 JavaScript 自动化框架 + 可安装任务系统 + 可选 AI Agent**。重点不是 GM API 数量第一、另造可视化 RPA，亦非重建 Browser MCP；与传统脚本平台差异在版本冻结、依赖审核、显式站点授权、可验证结果和 AI → 确定性 Task 转化。

保留现有 OpenDesk Browser Core、Authority、RunHost、Controller、Task Revision 和三页签。首先补正式 Page Script 安装闭环，再增 GM 适配。R6 AI 生态资料已在 [R6 研究](ai-browser-agent-ecosystem-r6-20261008.zh-CN.md)，这里仅补脚本/RPA 接缝，不重抄 Browser Use/Stagehand/Midscene/Playwright MCP。

## 2. 用户脚本管理器：对比与证据

| 产品 | 已有核心产品路径/特点 | MV3 / 浏览器 / 授权与依赖 | 管理、维护与采用建议 | 证据 |
| --- | --- | --- | --- | --- |
| Tampermonkey | 成熟的 .user.js 安装、匹配、GM 同步/异步 API、资源、菜单、更新、编辑器、备份和云同步 | Chrome MV3 已迁移；Chrome 138+ 单独开启 User Scripts；跨域和脚本元数据需区分；API 不能假定完整跨浏览器一致 | **高优先行为基准**。闭源发行，勿复制运行时；每个 GM 方法都应以现行文档和测试定协议 | OFFICIAL_DOC/RELEASE：[文档](https://www.tampermonkey.net/documentation.php)、[更新](https://www.tampermonkey.net/changelog.php?locale=en&more=true)；5.6.6242 在 2026-09 发布，具体修订应按平台分支核验 |
| ScriptCat | .user.js、@background、@crontab、GM、脚本更新/订阅/同步、后台日志、开发编辑器；Beta 有 Agent/Skill/MCP/OPFS | Chrome MV3 Service Worker + Offscreen + Sandbox；Firefox 适配复杂，属于多上下文系统 | **架构重点**，只借鉴产品与消息合同，不直接复制 GPL-3.0 源码。Agent 稳定性必须按发行渠道区分 | SOURCE_READ/RELEASE：[仓库](https://github.com/scriptscat/scriptcat)、[release](https://github.com/scriptscat/scriptcat/releases)、[文档](https://docs.scriptcat.org/) |
| Violentmonkey | 用户脚本安装、GM 兼容、编辑器、Zip 备份/同步、执行匹配 | Chrome 与 Firefox；2026 年 Chrome 店版本已迁移 MV3，不能引用 2024–25 年 MV3 缺失结论当现状 | **轻量 UX、可迁移备份结构**参考；MIT 许可但引入代码仍需审计 | OFFICIAL_DOC/STORE：[官网](https://violentmonkey.github.io/)、[源码](https://github.com/violentmonkey/violentmonkey)、[Chrome 商店](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag) |
| Greasemonkey | Firefox 用户脚本；GM4 体系强调 Promise API，旧 GM_* 不等价 | Firefox WebExtensions；需要单独追踪 browser.userScripts 语义和 AMO 版本 | **兼容边缘样本**：Promise、上下文、值存储。不是 Chrome MV3 主方案 | OFFICIAL_DOC/STORE：[manual](https://wiki.greasespot.net/Greasemonkey_Manual)、[repo](https://github.com/greasemonkey/greasemonkey)、[AMO](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) |
| FireMonkey | Firefox 用户 JS / CSS、内置编辑器、脚本与样式管理 | 面向 Firefox；Chrome 支持不应推断；仓库 MPL-2.0 | **样式合并管理 UI** 参考，不照搬执行器 | SOURCE_READ/RELEASE：[源码](https://github.com/erosman/firemonkey) |
| OrangeMonkey | Chromium 轻量脚本管理、按链接安装、图库、切换与 ZIP 导出；声称全面 GM_* | Chrome 商店 v2.0.16，更新于 2026-08-08；“全部 GM”仅厂商声称，未逐 API 复测 | **低成本操作入口**参考，许可与底层源码的可复用性未充分验证 | STORE：[Chrome 商店](https://chromewebstore.google.com/detail/orangemonkey/ekmeppjgajofkpiofbebgcbohbmfldaf)；完整兼容为 UNVERIFIED |
| Safari Userscripts | Safari macOS/iOS 脚本注入、编辑安装；部分 GM 接口 | Safari 扩展模型与用户动作限制不同；不要把 .user.css 文件读取当完整 Stylus UserCSS 语法 | 跨浏览器 P4 参考；GPL-3.0 代码不能直接混入现有不同许可项目 | SOURCE_READ：[quoid/userscripts](https://github.com/quoid/userscripts)、[UserCSS 限制讨论](https://github.com/quoid/userscripts/issues/711) |
| Stay | Safari 用户脚本/自定义网站体验，iOS/macOS 场景 | App Store 闭源产品；后台、GM API 的真实边界未逐项复测 | **移动 Safari 产品体验**参考；不把商店宣传当源码证明 | STORE：[App Store](https://apps.apple.com/us/app/stay-for-safari/id1591620171)，API 等级 UNVERIFIED |
| Stylus | 以 UserCSS 独立管理样式、变量、预处理、安装更新和导入导出 | 浏览器 CSS 注入与 JavaScript 运行时不同，UserCSS 带 ==UserStyle== 元数据 | P2 可做基础纯 CSS；完整 Stylus/LESS、变量与云同步 P4 再评估 | SOURCE_READ：[源码 GPL-3.0](https://github.com/openstyles/stylus)、[UserCSS 规范资料](https://github.com/openstyles/stylus/wiki/Writing-UserCSS) |

**来源分层**：上表描述“当前可参考的产品能力”，不代表逐个实现层均复验；“官方称兼容”与“真实 GM API 语义通过”是两个不同证据。公开 issue 存在版本与复现条件偏差，宜建按版本复现的测试库。

## 3. ScriptCat 专项源码审计：稳定与 Beta 不可混淆

### 版本与许可证

- GitHub API 的 latest stable 为 v1.4.0（2026-06-26）；stable 发行说明写明 AI Agent 仅在 dev/Beta，尚未于 stable 开启。main 的 src/manifest.json 为 1.5.0.1500 开发主线，**不能据此把 main 的全部功能标记为 stable shipped**。
- 1.5 Beta 的公开发布信息包含 External Access：本地 sctl daemon、CLI/MCP 和按操作授权、确认、审计。完整 Native/用户场景尚待独立复现。
- 根仓库 GitHub license 标识 GPL-3.0。可记录接口名称、元数据语义、风险案例并独立实现；不可不经法律/许可证审查搬运代码或把 GPL 片段混入原有闭源/不兼容仓库。

### 真实 Runtime 分层（来自源码，非纯 README）

| 能力 | 核心文件与机制 | 对 OpenDesk 的取舍 |
| --- | --- | --- |
| 页面匹配/自动执行 | src/app/service/service_worker/runtime.ts 维护启用脚本，调用 chrome.userScripts.register/unregister；content 侧封装 GM 上下文 | 参考注册、去重、恢复、frame 与执行世界；OpenDesk 使用自己 Page Revision + Broker |
| 传统 @background | SW → src/app/service/offscreen/script.ts → src/app/service/sandbox/runtime.ts；后台脚本不具备真实页面 DOM | P2 引入独立 Background Runtime 适配（不复制 Controller），必须明示生命周期 |
| 传统 @crontab | sandbox/runtime.ts 的 crontabScript、extractCronExpr、createCronJob、Map<uuid,CronJob[]>、stopCronJob、重试/状态记录 | 仅参考表达式解析与用户动作；**不能假定沙箱定时器在 SW 睡眠/浏览器退出后按时触发** |
| GM 网关 | content/gm_api 与 service_worker/gm_api、permission_verify.ts 配合；权限按脚本和 API 验证 | 以现有 Broker、SDK、NetworkService 与授权 ID 作为唯一信任边界 |
| GM_xmlhttpRequest | service_worker/gm_api/gm_api.ts: verifyXhrConnect 检查 URL 黑名单、@connect、Chrome origins 与脚本批准，再流式返回 | 设计新请求投影/回调适配，不让 USER_SCRIPT 直接持有 chrome.* |
| 同步、订阅、安装 | service_worker/script.ts、subscribe.ts、synchronize.ts、script_update_check.ts，包含脚本状态/回收站 | 分为查看候选、静态安全审核、确认安装、增量审核、原子回滚；近期不做云同步/市场 |
| 日志与编辑 | service_worker/log.ts、编辑器与脚本管理页 | 将执行记录加入既有 Task/Run 记录视图，不增第二日志数据库 |
| Agent 对话 | service/agent/core 与 service_worker/agent.ts；content/gm_api/cat_agent.ts 暴露 CAT.agent.* | 未来兼容入口而非 OpenDesk 默认 Page UserScript 特权 |
| Agent DOM 自动化 | agent/service_worker/dom.ts、dom_cdp.ts：普通 JS DOM 和可选 chrome.debugger/CDP trusted 操作分支 | 参考分级能力，但 OpenDesk 默认 R5 Locator 保持隔离；CDP 必须另申请高权限 |
| Agent Skill、MCP、OPFS | agent/service_worker/mcp.ts、OPFS、skill_script_executor.ts、tool registry | 可借鉴工具结构/持久元数据；不再造 Agent Controller、Task DB 或同步执行器 |
| **Agent 定时任务** | AgentTaskService 持久记录 + src/app/service/service_worker/index.ts 的 agentTaskScheduler 通过 chrome.alarms 每分钟唤醒 | 与传统 sandbox @crontab 分开；以 at-least-once 唤醒 + 唯一租约/幂等达到可恢复，不承诺精确 cron |

文档入口：[execution](https://github.com/scriptscat/scriptcat/blob/main/docs/references/architecture-execution.md)、[GM API](https://github.com/scriptscat/scriptcat/blob/main/docs/references/architecture-gm-api.md)、[Agent](https://github.com/scriptscat/scriptcat/blob/main/docs/references/architecture-agent.md)。源码入口：[runtime](https://github.com/scriptscat/scriptcat/blob/main/src/app/service/service_worker/runtime.ts)、[sandbox](https://github.com/scriptscat/scriptcat/blob/main/src/app/service/sandbox/runtime.ts)、[permissions](https://github.com/scriptscat/scriptcat/blob/main/src/app/service/service_worker/permission_verify.ts)、[GM API](https://github.com/scriptscat/scriptcat/blob/main/src/app/service/service_worker/gm_api/gm_api.ts)、[agent scheduler](https://github.com/scriptscat/scriptcat/blob/main/src/app/service/service_worker/index.ts)。

### ScriptCat 对 Tampermonkey 的专项判断

| 维度 | Tampermonkey | ScriptCat | OpenDesk 适配策略 |
| --- | --- | --- | --- |
| 产品成熟路径 | 用户脚本与 GM API 核心多年成熟；多个浏览器版本差异 | 用户脚本 + 后台/Cron；2026 发展 Beta Agent | P0 追求安全可靠地安装并自动运行，先不比数量 |
| 单文件兼容 | 传统元数据、GM_* / GM.*、@require / @resource 广泛 | 传统 API + CAT 特有命名空间 | 元数据分类识别和严格差异；只实现测试过的语义 |
| 网络请求 | GM_xmlhttpRequest 等，MV3 更新仍修复流式/卸载问题 | permission_verify 与 @connect，分块响应 | 现有 network broker 上新增 GM adapter；长耗时重试/stream 单独测 |
| 后台/定时 | 多种后台服务与脚本场景，能力随浏览器有差异 | 明确 @background 和 @crontab + Agent Cron | P2 分离 Scheduled 与 Background，防止承诺永不停止 |
| AI / MCP | 2026 文档/版本出现 Editor AI 及编辑器周边集成，不应混同核心 GM Runtime | Beta Agent conversation/skill/DOM/MCP | 未来复用已经存在的 Native PR 和 R6 Agent→Task 合同，不创建第二内核 |
| 复用许可 | 非自由复制的商业代码 | GPL-3.0 | **行为与协议可研究，源代码不得直接复制** |

### 维护缺陷和真实风险信号

- 2026 Tampermonkey 5.6.6242 更新记录修复 SW unload 导致 GM_xmlhttpRequest 中止、请求 abort、SRI enforce 验证；说明 MV3 宿主网络请求非常依赖生命周期。
- ScriptCat 1.4.0 公告提到长时内存泄漏与原型污染漏洞修复；1.5 Beta 多次修 GM API / 同步 / Cron、Permission。不是说当前版本仍有该漏洞，恰恰说明不能把“功能已有”当安全验收。
- Firefox / Safari 的执行世界、用户脚本 API、跨域权限和消息投影有不同；自称兼容也须逐版本测试。
- 不从争议评论单次推断产品缺陷；后续 R8.1 通过真实复现增加 issue URL、版本、系统和最小脚本。

## 4. 浏览器自动化与 RPA

| 产品 | 重点价值 | OpenDesk 借鉴点 / 明确不做 | 来源（证据） |
| --- | --- | --- | --- |
| Automa | 浏览器流程节点、录制、调试、定时、导入导出 | P3 可研究“录制 → JS 草稿”，不重建可视化图执行引擎；复用时核对 AGPL 等具体仓库许可证 | [GitHub](https://github.com/AutomaApp/automa) SOURCE_READ |
| Ui.Vision RPA | 录制/回放、OCR/视觉定位、桌面 XModules、脚本与桌面融合；对外 MCP 能力 | 复杂网站可引入分级 CDP/视觉降级，P3+；不默认装本机大组件 | [docs](https://ui.vision/rpa/docs)、[MCP](https://ui.vision/mcp) OFFICIAL_DOC |
| Axiom.ai | 低代码浏览器流程、表单和数据采集、桌面与云运行方式 | 参考任务调试、选择器修复、云本地运行标签；OpenDesk 近期只本机 Chrome | [docs](https://axiom.ai/docs/no-code-tool/reference/settings/run-options/) OFFICIAL_DOC |
| Browserflow | 浏览器流程/任务编辑与步骤自动化 | 可以参考节点 UX 与记录回放；最新版本生命周期需要额外验证 | [docs](https://docs.browserflow.app/) OFFICIAL_DOC；当前状态部分 UNVERIFIED |
| Bardeen | Chrome 侧快捷自动化与 AI workflow，偏向销售/线索生产力 | 参考快捷启动与动作卡片，不照搬云业务定位；产品方向随版本变化 | [官网](https://www.bardeen.ai/) OFFICIAL_DOC |
| Selenium IDE | 浏览器测试录制、定位器、可重放用例、可导出自动化 | P3 可探索录制 selector / Locator 草稿；不引入第二执行器 | [Selenium](https://www.selenium.dev/selenium-ide/)、[repo](https://github.com/SeleniumHQ/selenium-ide) OFFICIAL_DOC/SOURCE_READ |

跨 Agent 的 R6 已包含 [Browser Use](https://github.com/browser-use/browser-use)、[Stagehand](https://docs.stagehand.dev/)、[Midscene](https://github.com/web-infra-dev/midscene)、[Playwright MCP](https://github.com/microsoft/playwright-mcp)、[Nanobrowser](https://github.com/nanobrowser/nanobrowser)、[BrowserOS](https://github.com/browseros-ai/BrowserOS)。仅补充交集：**可重复执行的 JS 程序是成果物，Agent 是可选创作/运行入口，不是每次普通用户都必须调用模型**。

## 5. UserCSS 与 JS 的产品边界

UserCSS 独立资产：CSS 原文、站点匹配、固定版本、禁用/卸载、样式注入和回滚。不能把 UserCSS 强行包装成需要 GM/Controller 的 JS。P2 可支持标准 CSS 文件及少量 UserStyle 元数据；完整 Stylus 的 @preprocessor less/stylus/uso、@var、同步和社区订阅留给 P4。注意管理页必须同时对“JS Task”和“CSS Style”区分类型。来源：[Stylus UserCSS 文档](https://github.com/openstyles/stylus/wiki/Writing-UserCSS)。

## 6. 官方技术与政策来源（截至 2026-10-09）

1. [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)：Chrome 138+ 每扩展 Allow User Scripts；USER_SCRIPT/MAIN；configureWorld(messaging)、onUserScriptMessage、register/update/getScripts/unregister；扩展更新注册清空，须对账。OFFICIAL_DOC。
2. [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)：最低 30 秒、可能任意延迟；**Chrome 150+ 新增 persistAcrossSessions**，138–149 和其他浏览器不保证；仍在 SW 启动核查/恢复。OFFICIAL_DOC，更新日 2026-10-04。
3. [Service Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)：约 30 秒空闲终止、事件时间限制、全局态丢失；不能以 SW 内 timer 实现保证连续的 Cron。OFFICIAL_DOC。
4. [CWS Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)：远程代码规则、用户生成脚本的指定 API 边界及隐私声明；UserScripts 不应成为绕过特权上下文遥控执行的工具。OFFICIAL_DOC。
5. [MV2 sunset](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)：2026-08-31 剩余 MV2 已从 Chrome Web Store 清除，不应以旧 MV2 设计当前工程。OFFICIAL_DOC。

## 7. 许可复用红线及不确定性

独立实现元数据解析和适配 API 是目标；引用公开行为、标准和测试样例要附出处，复制任何 GPL/AGPL/MIT/MPL 代码前必须核对 SPDX、LICENSE、贡献者版权、依赖子许可和分发影响。ScriptCat、Stylus、Safari Userscripts 均涉及 GPL 代码；Automa 另行审查仓库许可及商业发布约束。Tampermonkey 闭源。

**未完成的验证**：各平台逐方法 GM 行为、OrangeMonkey 的“全部 GM”声称、商业 RPA 近期收费/离线性、跨浏览器 Safari/Firefox 原生调试、所有竞品的精确权限提示行为；因此这不是“所有竞品已 100% 验收”的声明。
