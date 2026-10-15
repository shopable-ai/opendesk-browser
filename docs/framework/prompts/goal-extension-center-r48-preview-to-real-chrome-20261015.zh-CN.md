# GOAL：OpenDesk Browser Extension Center R4.8 — PREVIEW → REAL UI PARITY

## 真实浏览器扩展 UI 对齐现有 R4.7 预览、实际菜单与生命周期、Mac Chrome 验收

日期：2026-10-15。默认中文。**直接实施，不仅讨论方案，不新建另一套界面。**

- 仓库：https://github.com/shopable-ai/opendesk-browser
- 本地项目：/Users/shopme/Documents/workspace/opendesk-browser
- 唯一写入分支：main；允许必要源码、测试、现有产品文档、预览和工作记录的最小修复、测试、正常提交及推送。禁止新分支、Worktree、PR、强推、覆盖并行 Agent。
- **现有对照预览**：prototypes/sidebar/extension-center-r47-frequency-first-preview.html
- **实际产品 UI**：src/ui/tool.html、src/ui/extension-center.js、src/ui/extension-center-model.js、src/ui/extension-center.css、src/ui/tool-shell.css 和既有 Sidebar Tools Host。
- **唯一工作记录**：docs/framework/workstreams/extension-center-r47-frequency-first-20261015.md；增量追加 R4.8，不覆盖 R4.1–R4.7 证据。
- 先读 AGENTS.md、.agents/skills/opendesk-extension-ui/SKILL.md、.agents/skills/opendesk-ui-preview/SKILL.md、docs/product/sidebar-ui-spec.zh-CN.md 和 docs/framework/testing-guide.md。

## P0：需求定义与源事实

**用户要在真实安装的 OpenDesk Browser「扩展」Tab 中看到、点击和使用接近当前 R4.7 浅色预览的界面，而不只是让 standalone HTML 演示看起来正确。** 列表是高频使用入口，管理是次要操作。

预览是 UI/场景参照而非 Chrome 权限、安装、运行或来源身份的证据。不能把 mock 数据、按钮回调或演示状态直接写进正式运行链；反过来也不能为了「一致」而把现有产品实功能从正式 UI 删除。

先读取最新 main 与本地 git status/diff，核对是否有正在写相同文件的并行 Agent，保留所有未提交修改。查看现有 R4.7 同候选回归和原始 CI 日志，只复验受影响项；不要用旧 SHA 代替当前最终包验收。

## P1：预览与正式页面逐区域差异审计后立即修复

依次对照真正装入的 Side Panel 与现有 HTML 预览：五 Tab 外壳与扩展页 gutter、搜索栏、应用市场入口、顶栏全局筛选/语言/刷新、统一列表、行背景 Hover/Focus、34px 图标/类型/说明、右侧操作区、独立上下文菜单、详情页、空/错/停用/加载/权限受限状态。逐项记录：preview DOM/CSS、正式 DOM/CSS、实际视觉差异、实际功能差异、修改文件、修复后截图/计算样式和 PASS/FAIL。

**关键优先规则：**
1. 每行只有 0 或 1 个有真实可调用能力的主按钮。已启用可打开 App：「打开」；停用 App、自动运行无独立 UI 的 Page、无安全预览的候选、状态未知/受限：无主按钮，不用「设置/管理/安装」占位。真实具有用户 UI 的 Page 必须检查已有可靠 Host 入口，有才保留高频操作。
2. 有主按钮时，整行主区域与显式按钮调用同一正式 handler；无主按钮时整行进详情，无隐式安装、授权、启用或执行。主按钮和行级 ⋮ 默认可见，不仅 Hover 后显示。
3. 行级 ⋮ 仅放低频操作：真实启停、设置/权限、更新审阅、原可信卸载确认入口和必要详情/异常恢复；避免详情页与主按钮重复「打开」。顶栏的全局筛选、语言和刷新是**不同作用域**，不能误并成逐行菜单。
4. 当前预览顶栏「＋/↻」与真实 UI 的市场/筛选/语言/刷新有差异：以「保留真实功能、视觉尽量一致」为边界，先报告差异再修复正式 UI 或完善已有演示预览，不得为凑截图删掉真实筛选、语言或市场入口。
5. 详情 intro 与列表共用停用/权限受限/注册异常/处理中语义；普通已启用不堆叠徽标；版本、来源、包摘要、网站权限放到必要的管理/详情层，减少重复文案。
6. 菜单必须避免 clipped list 裁剪，实际可点击；支持 Escape/Tab/↑↓/Home/End、点击外部、滚动关闭、焦点还原、窄屏与粗指针。返回保留筛选、滚动与来源焦点；未保存草稿不能因 UI 切换丢失。
7. 原预览文件保留在 prototypes/sidebar/，复用唯一 design-tokens.css、design-system.css 和 extension-center.css；不可复制新 Palette、建第二套 preview engine 或只出静态截图。更新交互预览时明确 SIMULATED，不冒充真实 Chrome。

## P2：真实生命周期，不得伪造

App 必须复用 src/ui/sidebar-tools.js 的可信 openTool / openSettings / toggleEnabled 和 src/ui/sidebar-tools/installation.js 的身份校验、Web Lock、revocation epoch、关闭旧 iframe、未保存草稿二次确认。Page 必须复用 src/ui/installed-page-tools.js 的 Chrome 网站权限、manifestHash、expectedGeneration 与真实 Authority。应用启用不得自动执行，停用必须真正停止/撤销；出错、重复点击、跨窗口并发或离线时保留旧数据并显示真实结果。

候选安装只走原官方固定包/能力/权限审阅。没有已确认安全预览实现的候选，绝不能把 standalone HTML 模拟当成「预览」主按钮。不得修改 enabled 存储、DOM 或 Mock 伪装提交成功。

## P3：构建与并行修复边界

R4.7 历史候选的 Node 211/211 和 source check 只能按其原 SHA 引用。历史生产构建曾先后遇到 Reading TOC locales.json 进入 page-relay 被 provenance 守卫拒绝，以及 AdBlock trusted source pin 漂移；**必须重新检查最新 main**，不能认定它们今天仍是同一个失败。

如仍失败，定位确切当前源码、固定包来源及 Owner，按安全审计和原工作流修复，或把跨工作流 blocker 明确记录并协调。绝不全局白名单放行 examples/**、关闭 provenance 验证、伪造 pin、替其他 Agent 擅自批准特权代码或覆盖其改动。不要因无关构建失败停止 Extension Center 可独立完成的交互接线、预览审计与定向测试。

## P4：验收必须区分证据等级

先执行最小回归，再执行受影响构建：
- node --test tests/environment/extension-center-r4.test.mjs tests/environment/extension-center-r42-row-action.test.mjs tests/environment/extension-center-r47-menu.test.mjs tests/environment/extension-center-r47-interaction.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/installed-page-tools-r251.test.mjs
- npm run check
- npm run build
- npm run build:dev
- npm run verify
- 现有 Extension Center GitHub CI 的同 SHA 结果；失败不忽略。

**必须在用户 Mac 真正安装的 Chrome 扩展中验证**同一冻结候选，而非只用离线 HTML、Node DOM double 或任意独立原型：
A. 已启用 App：整行和按钮均打开同一正式 App。
B. 已停用 App：只看详情或 ⋮ → 启用；启用后不自动运行；停用后旧实例撤权。
C. Page 自动运行：菜单启停、网站授权不足、generation 过期、原生注册状态真实读回。
D. 未安装候选：整行详情，固定版本/能力/权限审阅，不暗装、不假预览。
E. 搜索/范围筛选/语言/市场/刷新实际可用、无功能回退。
F. 菜单上下边缘、Escape、键盘焦点、点击外部、滚动、异常恢复、未保存草稿与并发。
G. 对相同状态的 preview 与正式 Side Panel，记录截图/DOM/computed styles 差异并修复，不要求 mock 必须获得 Chrome 权限。

每条原生证据绑定 commit SHA、最终包 Hash、Chrome 版本、Profile/加载路径、真实点击和权威回读。用户 Mac 当前不可用时标记 NATIVE_CHROME=NOT_TESTED，并直接提供本地 Codex 可执行验收路径，不以模拟测试计为 95+。

## P5：反方审计、质量和交付

逐项审计「无主按钮难发现」「页面 UI 被误删」「停用恢复困难」「整行与主按钮不一致」「菜单裁剪」「假预览」「状态混淆」「草稿丢失」「权限越权」「并行代码被覆盖」。每项报告反例、修复、证据、PASS/FAIL；核心 P0 FAIL 不能由综合评分抵消。

分别给出高频效率、主操作语义、组件去重、信息架构、视觉交互、可访问性、真实生命周期、安全权限、异常恢复、预览与正式一致性、真实 Chrome 验收 **11 项独立评分**。没有真实证据记 NOT_TESTED，不虚构 95。

交付必须包含：实际修改的源文件与行为、预览文件位置和可打开方式、测试/构建/CI 精确结果、原生验收状态、剩余功能树及依据真实场景/证据的完成率、风险、GitHub commit SHA，以及后续本地 Codex 最短验收步骤。**本任务要求直接修复和提交 main，不以另一个 GOAL/静态设计稿/压缩下载包代替本轮实现。**
