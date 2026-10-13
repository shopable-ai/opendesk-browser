# OpenDesk Browser 工作约束

<!-- AUTONOMY DIRECTIVE — DO NOT REMOVE -->
YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE AUTHORIZED TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION FOR ORDINARY REVERSIBLE STEPS.
<!-- END AUTONOMY DIRECTIVE -->

## 默认分支规则（用户于 2026-10-12 再次明确）

**未经用户针对具体任务明确同意，只允许使用主分支 `main` 进行代码编辑、修改、提交与推送。** 普通任务直接在 `main` 开发；不得自行创建、切换到或向其他开发分支写入，也不得自行创建 Git worktree 或 PR。此前允许因“并行开发需要隔离”而自动创建分支的规则被本条取代；不得引用历史提示词、文档或其他 Agent 的惯例绕过此约束。

遇到 `main` 被其他 Agent 同时修改、同一工作目录存在未提交改动、存在文件冲突、测试资源被占用或直接修改有覆盖风险时，**先只读核查并明确提醒用户**，说明实际冲突和安全选项；不擅自创建临时分支或工作区作为替代方案。只有用户明确同意某个具体例外后，才允许使用约定的其他分支或 worktree。

已有非 `main` 分支允许只读核查。仅在用户明确要求合并/清理时，将应保留的变更安全合入 `main`，确认不丢失独有提交后再删除多余分支。绝不为“只保留主分支”而直接删除未合并工作；禁止强推、破坏性 reset/clean、覆盖并行工作。提交与推送仍遵守当前任务的授权边界。

## Browser SDK 预发布 API 一次性收敛授权（2026-10-13）

**用户最新明确：OpenDesk Browser 尚未正式上线使用，现有 35 项 Browser SDK 只是开发期快照，不是必须长期兼容的外部 API。** 对 Browser SDK 中命名、参数、返回值、分层或重复调用设计不合理的旧接口，允许直接合并、改名或删除；一次性同步迁移仓库内全部消费者、示例、测试和当前文档，不增加无意义的兼容别名、deprecated shim、第二套 Registry/Host/Authority 或固定 35 项测试分母。本条在 Browser SDK 范围内优先于历史“保留已约定公开 API”及 R7/R8 的旧接口兼容目标。

优先采用 Chrome Native API 的习惯命名与语义，安全作用域不同则明确标注（如 owned TabRef）。**放弃旧 API 不等于放弃旧功能与安全**：必须保留真实 Sender、安装身份、精确 Origin/Document、用户手势、撤权、未知副作用、隔离和既有 603+19/B05/F3/ZIP 验收事实；正确功能必须迁移到新单一入口。权威决策见 [`Browser SDK 预发布收敛合同`](docs/api/browser-sdk-prelaunch-contract-20261013.zh-CN.md)。

## Global First 第一小山头：长期市场策略约束（2026-10-13）

**仅适用于全球/区域/行业“第一”、小山头竞争定位、营销、SEO/GEO 与 AI 推荐研究任务；不改变其他 Browser SDK、Cloud、Native 工程任务的实施所有权。**

- **先定竞争位置，再决定做什么功能**。从真实用户、问题和替代成本出发，寻找全球第一、真实国家/语言区域/行业/具体任务第一；不够第一时可争取有实测依据的第 2—5 名。双/三因素组合必须有实际用户价值，不能靠无意义限定词制造独家。
- **AI 优先，不等于预设 GF-007 已获胜**。主要用户旅程是提出需求→AI 协助创建→审核权限/结果→受控安装→以后可重复使用；这条全链仍是待实证方向，不得写成已经正式交付。手动在 Side Panel 编写 React/Vue（旧 F01）是技术支撑，不能自动恢复为全球第一营销 P0。
- **先验证竞品，再反推产品缺口**。要比较单产品和真实组合（如 AI 编码器 + Vite + 脚本管理器），分开 Stable、Beta、仓库推送、商店发布日期和关键能力首次公开可用时间。未找到反例不等于世界首创。
- **分清候选顺序与市场排名**。TOP 1—5 的研究优先级不是第 1—5 名产品排名；只有真实日期、范围、地区、充分对手样本、当前发布/原生证据及独立审批才能宣传全球首个/区域第一/最快/Top 5。GF-013/GF-014 保留 DISPROVED，不换词复活；95 分未审则 NOT_SCORED。
- **用户先看一屏可读结果**：每项“谁需要、解决什么、竞争哪种第一、最强对手、已有证据、最小缺口、下一步”，再附技术文档。不能把再写一份 GOAL 当作竞争验证已完成。

权威阅读顺序：[R4 战略决策](docs/product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md) → [R4 执行 GOAL](docs/framework/prompts/goal-global-first-r4-ai-first-niche-leadership.zh-CN.md)。唯一事实/审批账本仍是 `docs/product/browser-extension-ecosystem/competitor-timeline.json` 与 `first-claims-ledger.json`。R1/R2 与 R3/F01 旧方向仅历史参考。

## 第三方 JS 依赖：开发脚本免人工审核的最高优先级产品决策（2026-10-13）

**用户自己编写、修改或让 AI 生成的脚本，在 Side Panel「开发」主动点击 Run 时，不得被要求逐库核对/勾选 SHA、许可证、依赖图或点击“批准锁”，也不允许程序 B 因使用同一固定库而重复人工审核。** Run 是用户的草稿执行意图；系统自动校验来源、固定版本、SHA、依赖闭包与执行世界，按权限允许的方式取得/复用缓存，自动生成绑定各程序/Revision 的固定锁。可查看高级详情，但不得把它变成每次开发的通行证。

免依赖人工审核不等于免权限：仍须尊重真实 Chrome 来源/网站权限手势、页面/宿主 Authority、安装/定时/云控/第三方 Provider 的能力与数据范围授权、MV3/CWS 远程代码边界、撤权、坏 SHA/私网/重定向及资源上限。不得将用户下载代码直接交给特权 SW/Host，不得静默升级 fixed Revision。只有真实缺失权限或无法解析确切版本才提示必要操作。

**R7.1/R4 现有「检查→下载→人工审阅→批准→运行」是历史实现，不能作为最终正确 UX；需要继续修复源码与测试。** 长期规则：[依赖使用场景合同](docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md)；执行入口：[R7.2 GOAL](docs/framework/prompts/goal-universal-dependency-runtime-r7.2-scenario-first-20261013.zh-CN.md)。本条优先于历史 R4–R7 的逐库人工审核要求，不影响 Browser SDK 与安装安全合同。

## Controller/Page 零参数用户入口及 src/libs 环境合同（2026-10-12）

用户当前明确要求：**推荐示例、AI 生成代码与多文件 ESM Controller 入口使用 `export default async function main()`，Side Panel「开发」直接编辑 Controller 草稿使用 `async function main()`，直接引用受控 Worker 词法 `page`、`params` 及默认 `_`、`dayjs`、`OpenDeskLibs`，不让用户给 `main` 传能力对象、重复 npm 安装或写 CDN。** 历史 `main({page})` ESM 入口只保留兼容，不得再宣传为唯一/推荐格式。

Controller 的 `page` 不是网站 `window.page` 或 Worker `globalThis.page`。Page USER_SCRIPT 使用 `document` 和自己的默认/显式按需库，不拥有 Controller `page/params/axiosx`；SW、Side Panel 宿主、独立扩展页面由各自构建入口静态引入，第三方工具 iframe 使用 `OpenDeskTool`。禁止将各执行世界混成一个全局表、把全部库打进 SW、运行时 CDN 或增加不必要 Chrome 权限。**权威使用说明、示例和验证级别**：[预置变量与世界矩阵](docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。新需求先检查实际 Worker/ESM 编译器及 Page 世界合同，再写提示词。

## UI 布局与 Tailwind 样式规范（2026-10-12）

所有新增或调整的 Side Panel、Native Workspace/Settings、应用市场、侧栏工具及网页注入 UI，先按 [`docs/architecture/ui-layout-conventions-r27.zh-CN.md`](docs/architecture/ui-layout-conventions-r27.zh-CN.md) 的**跨界面**规则选择布局密度、间距、容器 gutter、断点、焦点和验证级别；Side Panel 特殊细节继续以 [R20/R26 文档](docs/architecture/sidebar-design-system-r20.zh-CN.md) 为准。权威变量只有 `src/ui/design-tokens.css`，不要为每个 Tab 重建颜色、间距和按钮系统。

Native Workspace 已采用 Tailwind v4 的离线固定构建，必须保持 `rem` 尺寸锚点正确；其他页面可继续用原生 CSS 映射 token。严禁为了统一样式让 Tailwind Preflight 进入 Side Panel、用户沙箱或第三方网页；不要使用在线 CDN/JIT 或降低权限边界。视觉更改须附受影响的组件/静态宽度测试；**没有真实 Mac Chrome 实测及候选身份绑定，不得自评“全面 95+ PASS”**。

## 当前目标与范围（用户于2026-10-07明确修正）

本工程的当前主线是旧项目 `/Users/shopme/Documents/workspace/todo-user-vue/src-bex` 的浏览器自动化核心迁移与升级。按明确职责迁入 OpenDesk Browser，保留已约定的公开 API、页面 SDK、公共服务与资源语义，修复执行、目标绑定、异步回程、停止、持久结果和生命周期缺陷，再完成必要真实验收与安装交付。

**不继续完善网页采集、模板、分页。** 不开发采集产品 UI、选区、预览、采集引擎、模板工作流、分页采集或采集业务导出。已有采集模块只允许为框架迁移所必需的薄边界与去耦；保留现状，不擅自删除或补齐业务。

**语音控制不是本期目标。** 用户没有提出该功能。旧来源快照中的 `www/lib/txt2voice.js/css` 不能作为语音产品需求或实现证据，不新增语音输入、识别、指令解析或控制流程。

**任务树只是沟通方式。** 用缩进展示当前解决方案、大任务、小任务、依赖与状态；不开发可视化任务树产品界面。默认使用纯文本缩进，节点名称使用实际功能，不以K/G/CMP编号代替说明。

前两份历史提示词 `new-goal-prompt-implementation-first.txt`、`product-function-tree-and-goal.txt` 中扩展采集/语音/任务树产品目标的内容已被本次用户修正取代；“5/8、63%产品功能覆盖率”作废。保留历史文件和原始证据，不将它们作为需求来源或当前进度。
当前续接提示词：`docs/framework/prompts/goal-src-bex-migration-20261007.txt`。

## 人工网页测试唯一入口（2026-10-08）

浏览器插件手工调试、Sidebar 草稿和现代 Page API 的标准测试页面为 `examples/tasks/demo-form.html`。启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks` 后，统一访问 `http://127.0.0.1:43111/demo-form.html`；参照 `examples/tasks/README.zh-CN.md` 和 `tests/environment/basic-browser-page.test.mjs`。不要沿用历史会话或旧测试服务产生的临时 `/fixture` 地址，也不要因手工演示入口统一而删除 `tests/prototypes/**/fixture/`、`contracts/fixtures/` 或原生测试专用路由。任何删除必须先核对运行器和证据引用。已在其他会话做过的真实 Chrome 测试，首先核对结果绑定的候选 SHA；没有新增差异就不重复无意义的全量验收。

## 实施与验收

按旧功能/旧符号→新职责模块→实际消费者→真实产品入口→必要验证组织任务。每项区分已实施、已有组件证据、已有原生证据、正式关闭与具体缺口。历史 blocker 必须对照当前代码确认，不制造修改，不重新审计已冻结材料以替代实施。

有实际缺口时，先说明文件、预期行为、通过条件，再直接修复并做必要定向验证。无缺口就补真实驱动或推进验收。实现与验证驱动收敛后集中执行同一最终候选的完整验收；不得为观察器小修复反复全量回归。同一失败仅在代码、环境或观察方法明确变化后重试。

保留已批准框架验收合同，包括原603＋19、独立B05、1000 mixed／10 reconnect／2轮禁插件、六项资源baseline、独立最终F3和ZIP安装一致性。若某个具体合同项与最新排除业务范围实际冲突，记录caseId及证据差异；不静默删改分母、不假报PASS，也不为凑分母开发采集业务。

最终成功仅在逐项身份一致的完整原始证据、正式账本关闭、独立最终F3接受、与已验收dist一致的ZIP安装验收通过后成立。组件、旧候选、超时、NOT_TESTED、限定静态review不算正式PASS或最终F3。

## 多 Agent 并行写入与可信边界（2026-10-08 修订）

**默认只有 `main` 可写；并行风险需要提醒而不是自动开分支。** 多个 AI Agent 不得同时编辑同一个工作目录、互相改写文件或争用测试产物。检测到并行写入风险时，先核查和告知用户，由用户决定串行排队、明确授权隔离方案或暂停相关修改；未经用户就该任务明确同意，禁止自行创建 `agent/*` 分支或 Git worktree。只读审计不受写入限制。详见 `docs/framework/parallel-development.md`，其中与本条不一致的历史隔离要求以本文件为准。

`main` 是默认工作分支和唯一正式集成分支，同一工作目录同一时刻只允许一个写入 Agent。普通 Agent 可以在 `main` 本地编辑；commit/push 及独立分支上的 PR 操作须按当前用户明确授权执行；**不得未经授权直接推送远端 main，不得强推或重置 main**。合入远端 main 的动作须由获授权的集成者串行执行：核查最新 main、未提交工作、依赖、变更冲突、定向测试、真实验收等级与 PR 内容；未验证的变更保留草稿 PR，不宣称已交付。仓库保护规则（PR/检查/审批）应在 GitHub 中配置，文档不能替代服务端保护。

`docs/framework/public-owner.json` 是旧的全局 writer 登记及历史交接证据，**不要覆写、伪造释放或修改历史身份**。旧登记不用于阻止符合本文件规则的 `main` 本地开发或独立分支开发。对真实 Chrome/CFT profile、固定端口、共享数据库、dist、ZIP、最终候选与发布，仍实行单资源占用/明确交接，不允许多 Agent 争用或伪造 native PASS。每个任务的进度、约束、证据在 `docs/framework/workstreams/` 的专属文件中保存；使用独立分支时同时记录在独立 PR 中，不争抢同一份全局状态文件。

旧 `src-bex`、`/Users/shopme/Documents/workspace/opendesk` 及其他来源工程只读。保留工作区差异、旧 receipt 和全部原始证据；不新增依赖，不扩大 ChromePage.js 范围，不恢复旧目录运行树。分支提交不等于发布；没有额外授权不执行 release/publish。冲突要显式解决和审计，禁止 `git reset --hard`、`git clean`、强推他人分支或覆盖并行 `main()` 入口升级。

原 owner 与冻结候选的 sourceFingerprint、product/verification inputs、receipt、dist 和 ZIP 均属于可追溯证据。元数据变化不等于正式验收变更，禁止重写旧 receipt 冒充新冻结。

仅使用受控 CFT、真实 sender、可信原生输入；禁止 DOM 赋值、synthetic events、伪造 native ack 或放宽合同/身份。保留精确 controller-result/runId/resultId、result 自身 revision/sourceHash、retirement released、Save 完整输入观察与唯一真实 native ack。未知 native effect、缺失回执、撤权、document/owner 变化继续保守拦截，禁止盲目重放。

## 跨对话测试复用

执行测试或构建前，先读 `docs/framework/testing-guide.md` 的跨对话复用入口及对应 `docs/framework/workstreams/` 记录，核对其他对话负责人、原始证据和相关输入身份。成功且相关输入/合同/环境未变的结果直接引用，不因新聊天、无关提交或更新时间重跑；有变化只做受影响验证。不同包、组件/原生/AI/F3/ZIP 的证据等级不得互相提升。执行范围及浏览器/端口/dist 资源占用写在自己的工作流，保留失败和 `NOT_TESTED`；不覆盖旧 receipt，不争用其他对话的测试资源。

## 进度表达

首条说明目标、具体缺口、拟修改文件、通过条件。约60秒报告实际成果。任务树使用实际功能名及缩进，每个节点显示实施/证据/剩余任务；编号只作为追溯附注。不得以测试数量或任意等权功能组推导产品完成百分比。
