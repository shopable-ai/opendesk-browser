# OpenDesk Browser 工作约束

<!-- AUTONOMY DIRECTIVE — DO NOT REMOVE -->
YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE AUTHORIZED TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION FOR ORDINARY REVERSIBLE STEPS.
<!-- END AUTONOMY DIRECTIVE -->

## 当前目标与范围（用户于2026-10-07明确修正）

本工程的当前主线是旧项目 `/Users/shopme/Documents/workspace/todo-user-vue/src-bex` 的浏览器自动化核心迁移与升级。按明确职责迁入 OpenDesk Browser，保留已约定的公开 API、页面 SDK、公共服务与资源语义，修复执行、目标绑定、异步回程、停止、持久结果和生命周期缺陷，再完成必要真实验收与安装交付。

**不继续完善网页采集、模板、分页。** 不开发采集产品 UI、选区、预览、采集引擎、模板工作流、分页采集或采集业务导出。已有采集模块只允许为框架迁移所必需的薄边界与去耦；保留现状，不擅自删除或补齐业务。

**语音控制不是本期目标。** 用户没有提出该功能。旧来源快照中的 `www/lib/txt2voice.js/css` 不能作为语音产品需求或实现证据，不新增语音输入、识别、指令解析或控制流程。

**任务树只是沟通方式。** 用缩进展示当前解决方案、大任务、小任务、依赖与状态；不开发可视化任务树产品界面。默认使用纯文本缩进，节点名称使用实际功能，不以K/G/CMP编号代替说明。

前两份历史提示词 `new-goal-prompt-implementation-first.txt`、`product-function-tree-and-goal.txt` 中扩展采集/语音/任务树产品目标的内容已被本次用户修正取代；“5/8、63%产品功能覆盖率”作废。保留历史文件和原始证据，不将它们作为需求来源或当前进度。
当前续接提示词：`docs/framework/prompts/goal-src-bex-migration-20261007.txt`。

## 实施与验收

按旧功能/旧符号→新职责模块→实际消费者→真实产品入口→必要验证组织任务。每项区分已实施、已有组件证据、已有原生证据、正式关闭与具体缺口。历史 blocker 必须对照当前代码确认，不制造修改，不重新审计已冻结材料以替代实施。

有实际缺口时，先说明文件、预期行为、通过条件，再直接修复并做必要定向验证。无缺口就补真实驱动或推进验收。实现与验证驱动收敛后集中执行同一最终候选的完整验收；不得为观察器小修复反复全量回归。同一失败仅在代码、环境或观察方法明确变化后重试。

保留已批准框架验收合同，包括原603＋19、独立B05、1000 mixed／10 reconnect／2轮禁插件、六项资源baseline、独立最终F3和ZIP安装一致性。若某个具体合同项与最新排除业务范围实际冲突，记录caseId及证据差异；不静默删改分母、不假报PASS，也不为凑分母开发采集业务。

最终成功仅在逐项身份一致的完整原始证据、正式账本关闭、独立最终F3接受、与已验收dist一致的ZIP安装验收通过后成立。组件、旧候选、超时、NOT_TESTED、限定静态review不算正式PASS或最终F3。

## 写入、身份和可信输入边界

唯一writer登记在 `docs/framework/public-owner.json`。新对话必须先读取真实串行释放，重新检查受控进程与在途操作，再用实际threadId登记并保存acceptance；不得覆盖仍活跃的owner，不恢复前任Goal或自动创建其他对话。

旧 `src-bex`、`/Users/shopme/Documents/workspace/opendesk` 及其他来源工程只读。保留工作区差异、旧receipt和全部原始证据；不新增依赖、不commit/push/publish，不扩大ChromePage.js范围，不恢复旧目录运行树。

owner属于product inputs，释放与接管需要如实核对sourceFingerprint、product/verification inputs、receipt、dist和ZIP。元数据变化而实际编译输入与产物不变时，不无理由全量重建，不修改旧receipt冒充新冻结。

仅使用受控CFT、真实sender、可信原生输入；禁止DOM赋值、synthetic events、伪造native ack或放宽合同/身份。保留精确controller-result/runId/resultId、result自身revision/sourceHash、retirement released、Save完整输入观察与唯一真实native ack。未知native effect、缺失回执、撤权、document/owner变化继续保守拦截，禁止盲目重放。

## 进度表达

首条说明目标、具体缺口、拟修改文件、通过条件。约60秒报告实际成果。任务树使用实际功能名及缩进，每个节点显示实施/证据/剩余任务；编号只作为追溯附注。不得以测试数量或任意等权功能组推导产品完成百分比。
