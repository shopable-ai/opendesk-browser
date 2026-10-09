# OpenDesk Browser 工作约束

<!-- AUTONOMY DIRECTIVE — DO NOT REMOVE -->
YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE AUTHORIZED TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION FOR ORDINARY REVERSIBLE STEPS.
<!-- END AUTONOMY DIRECTIVE -->

## 默认分支规则（用户于2026-10-10明确要求）

默认在主分支 `main` 上进行工作。没有特殊要求时，不创建新分支或 Git worktree；只有用户明确要求使用分支、PR、隔离工作区，或任务确需隔离并行写入时，才使用独立分支和工作区。

若当前工作区不在 `main`，先核查未提交改动和工作区占用，仅在可安全保留现有工作时切换；不得覆盖他人改动或丢弃已有差异。本规则优先于历史文档中默认创建独立分支、worktree 或禁止在 `main` 本地编辑的要求；提交、推送、合入和发布仍遵守各自授权边界。

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

**默认在 `main` 工作；仅并行写入需要隔离。** 多个 AI Agent 同时写入不同任务时，每个写入 Agent 必须使用自己的 Git worktree（或独立文件系统工作区）、自己的 `agent/<任务>-<标识>` 分支以及独立测试产物；不得让两个 Agent 同时编辑一个工作目录或互相改写分支。单个写入 Agent 没有特殊要求时不创建新分支。只读审计 Agent 不受写入限制。详见 `docs/framework/parallel-development.md`，其中与默认分支规则冲突的历史要求以本文件为准。

`main` 是默认工作分支和唯一正式集成分支，同一工作目录同一时刻只允许一个写入 Agent。普通 Agent 可以在 `main` 本地编辑；commit/push 及独立分支上的 PR 操作须按当前用户明确授权执行；**不得未经授权直接推送远端 main，不得强推或重置 main**。合入远端 main 的动作须由获授权的集成者串行执行：核查最新 main、未提交工作、依赖、变更冲突、定向测试、真实验收等级与 PR 内容；未验证的变更保留草稿 PR，不宣称已交付。仓库保护规则（PR/检查/审批）应在 GitHub 中配置，文档不能替代服务端保护。

`docs/framework/public-owner.json` 是旧的全局 writer 登记及历史交接证据，**不要覆写、伪造释放或修改历史身份**。旧登记不用于阻止符合本文件规则的 `main` 本地开发或独立分支开发。对真实 Chrome/CFT profile、固定端口、共享数据库、dist、ZIP、最终候选与发布，仍实行单资源占用/明确交接，不允许多 Agent 争用或伪造 native PASS。每个任务的进度、约束、证据在 `docs/framework/workstreams/` 的专属文件中保存；使用独立分支时同时记录在独立 PR 中，不争抢同一份全局状态文件。

旧 `src-bex`、`/Users/shopme/Documents/workspace/opendesk` 及其他来源工程只读。保留工作区差异、旧 receipt 和全部原始证据；不新增依赖，不扩大 ChromePage.js 范围，不恢复旧目录运行树。分支提交不等于发布；没有额外授权不执行 release/publish。冲突要显式解决和审计，禁止 `git reset --hard`、`git clean`、强推他人分支或覆盖并行 `main()` 入口升级。

原 owner 与冻结候选的 sourceFingerprint、product/verification inputs、receipt、dist 和 ZIP 均属于可追溯证据。元数据变化不等于正式验收变更，禁止重写旧 receipt 冒充新冻结。

仅使用受控 CFT、真实 sender、可信原生输入；禁止 DOM 赋值、synthetic events、伪造 native ack 或放宽合同/身份。保留精确 controller-result/runId/resultId、result 自身 revision/sourceHash、retirement released、Save 完整输入观察与唯一真实 native ack。未知 native effect、缺失回执、撤权、document/owner 变化继续保守拦截，禁止盲目重放。

## 跨对话测试复用

执行测试或构建前，先读 `docs/framework/testing-guide.md` 的跨对话复用入口及对应 `docs/framework/workstreams/` 记录，核对其他对话负责人、原始证据和相关输入身份。成功且相关输入/合同/环境未变的结果直接引用，不因新聊天、无关提交或更新时间重跑；有变化只做受影响验证。不同包、组件/原生/AI/F3/ZIP 的证据等级不得互相提升。执行范围及浏览器/端口/dist 资源占用写在自己的工作流，保留失败和 `NOT_TESTED`；不覆盖旧 receipt，不争用其他对话的测试资源。

## 进度表达

首条说明目标、具体缺口、拟修改文件、通过条件。约60秒报告实际成果。任务树使用实际功能名及缩进，每个节点显示实施/证据/剩余任务；编号只作为追溯附注。不得以测试数量或任意等权功能组推导产品完成百分比。
