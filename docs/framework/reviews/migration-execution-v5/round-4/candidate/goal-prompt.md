# OpenDesk Browser 通用框架迁移 Goal

将本轮约定旧浏览器API、控制脚本、独立网页SDK、后台公共服务和必要资源按职责迁入现有native MV3/webpack工程，逐项证明正确。当前新Goal owner：01a0fda9-8a86-7f72-89be-e292ffc94ed4。

执行要求：[goal-migration-v5.txt](prompts/goal-migration-v5.txt)全文；历史附件[continue-in-new-chat.md](continue-in-new-chat.md)。唯一主计划[execution-plan.md](execution-plan.md)，唯一完成数据[source-compatibility-ledger.json](source-compatibility-ledger.json)，逐项case[test-spec-v5.json](test-spec-v5.json)，兼容差异[compatibility-delta-v5.md](compatibility-delta-v5.md)，派生[progress.md](progress.md)。

当前阶段0，同一当前候选Architect→Critic独立审批pending。只有两者≥95、明确批准且零阻断才推进F1；F1必需机制实测与独立复核通过才推进F2。F2按主计划依赖逐能力迁移，F3同一最终包全量真实验收与独立复核后才完成。历史designApproved与提示词评分不能放行当前方案或产品。

普通授权可逆步骤自动继续；工具错误/未测/实现缺口继续修。真实关键后端不可行保存复现并停止依赖分支，不自行换后端扩范围。原生Goal状态为准，不把文件状态当工具状态。不恢复旧任务、不引入旧项目runtime目录、不进入完整采集/优化/发布。全部最终验收冻结后停止。
