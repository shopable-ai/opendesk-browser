# AI Insight R5 · 数据合同与计算口径（候选 v1）

> 任务：OD-AI-INSIGHT-PROBLEM-OBSERVATION-PREVIEW-R5 · 2026-11-11  
> 状态：**设计合同 + 可复用纯计算核心；未接入 Chrome 采集、真实账户、持久存储或外部模型。**
> 原产品目标、16 个研究领域和 B-Lite MVP 唯一权威见 [产品研究](product-research.zh-CN.md)。

## 1. 文件与消费边界

- [JSON Schema Draft 2020-12](../contracts/insight-r5.schema.json)：根版本 \`schemaVersion: 1\`、19 个对象定义、严格 Event 元数据与 Consent；待使用正式 validator 做全量符合性测试。
- [非敏感演示事件与快照](../contracts/sample-envelope.json)：结构示例，不是用户历史。
- [共享纯模型](../src/insight-core.js)：只服务 R5 确定性计算和交互原型；没有 SDK/Host 权限，也不是生产采集器。
- [测试](../tests/insight-contract.test.mjs)：Node 内建 \`node:test\`；运行结果必须与本机执行回执绑定，不因文件存在标 PASS。
- [交互预览](../preview/index.html)：读取纯模型、模拟状态；只有本站项目文件，没有外部网络、存储或历史会话读取。

**责任分离**：未来可信页面适配器采集 O 级事件；数据合同持有身份与规范；纯聚合器派生 D；用户审阅产生 C；独立的实际测试/回执可能产生 V。知识、Prompt、浏览器活动时间、任务执行等仍由原有模块持有，AI Insight 只引用有权使用的来源身份与回执，不接管源数据库或加第二套 Host。

## 2. 身份、实体与跨对话关系

**稳定 Problem ID ≠ 标题 ≠ 对话 URL ≠ 向量相似度。** 每个 Problem 在自己的 scope 下持久持有随机稳定 ID（产品接线时用强随机 UUID）；标题变更、模型切换、会话重命名不得改变它。必须单独保存 goal/acceptanceCriteria 的版本历史，不能无痕改写验收条件。

| 实体 | 主键与必要关系 | 必须区分的语义 |
| --- | --- | --- |
| Goal / Plan | 各自 ID；Goal→Plan、Plan↔Problem 允许多对多 | 可选目标，不能作为每个 Prompt 的必填项 |
| Problem | 稳定 ID + scopeId + revision | 用户真实业务问题；父子不合并 |
| Attempt | 独立 ID；↔Problem、↔Conversation、↔Turn | 一次试错可跨多个对话，一次会话可涉及多个问题 |
| Conversation / Turn | provider + 精确 origin + accountId + externalConversationId（可未知）；Turn→Prompt 和多 Response | Conversation ID 必须在来源账号命名空间内解释 |
| Prompt / Response | Prompt→Turn；Response 用 generationId 区分重生成 | 同一 Prompt 再生成是新 Response/Execution，不重复计 Prompt |
| Execution / Observation | Execution→Conversation/Turn/generation；Observation→Execution/Event | 运行可观察状态；不推断服务端内部时间 |
| Artifact / Evidence / Review / Outcome | 可多对多；证据应绑定版本和有效范围 | AI 声称、用户确认、运行回执、技术测试不是同一级完成 |
| ConversationLink / ProblemRelation | 独立 edge ID、revision、证据正反两面、decisionSource | 关联候选 ≠ 已确认，拒绝与撤销必须可追溯 |
| Audit / Consent / Event | scope、账号、origin、授权版本、事件 ID、时间与来源 | 个人观察数据与产品遥测不混合 |

关系枚举：\`SAME_PROBLEM\`、\`SUBPROBLEM_OF\`、\`RELATED\`、\`SIMILAR\`、\`DISTINCT\`、\`UNKNOWN\`。候选召回可以来自硬锚点/语义推断，但 **SIMILAR 不能自动变成 SAME_PROBLEM**；\`DISTINCT\` 是负约束。跨账号、跨站点、跨设备的候选均需要来源范围与用户决策。反对证据（目标不同、不同 Issue、相反的人工判断）不能隐匿。

状态推荐：\`OPEN → IN_PROGRESS / BLOCKED / NEEDS_VERIFICATION → USER_CONFIRMED / EVIDENCE_VERIFIED → CLOSED\`；任何已关闭状态允许生成新修订的 \`REOPENED\`，不删除旧证据。状态机在 R5 只冻结语义，生产迁移、权限撤销联动和自动关联准确率尚未实测。

**撤销/拆分规则**：不做不可逆 ID 合并；\`SAME_PROBLEM\` 用已确认边表达。撤销边、转移会话子集到新 Problem、拒绝候选均追加审计修订，按最新有效边重新聚合。父子问题统计独立，不把一个子问题的时长自动加进父问题。若同一 Execution 归属于多个 Problem，跨 Problem 求全局总数前必须按 Execution ID 去重，不能把多对多归属简单加总。

## 3. Event 与去重合同

示例 Event（全部脱敏且没有正文）：

\`\`\`json
{
  "eventId": "evt_demo_submit",
  "dedupeKey": "conv_a/gen_a/submitted",
  "scopeId": "scope_demo_local",
  "accountId": "account_demo_1",
  "origin": "https://chatgpt.com",
  "conversationId": "conv_a",
  "executionId": "exec_a",
  "generationId": "gen_a",
  "eventType": "SUBMITTED_OBSERVED",
  "observedAt": "2026-11-11T00:00:00.000Z",
  "adapterVersion": "chatgpt-demo-0.1",
  "consentRevision": 1,
  "observationEpochId": "epoch_demo_1",
  "monotonicTickMs": 0,
  "coverage": "FULL",
  "siteVisibility": "VISIBLE",
  "eventEvidenceIds": []
}
\`\`\`

独立 eventId 标识事件来源；\`dedupeKey\` 区分一代生成行为。幂等键须包含 **scopeId、精确 origin、accountId、consentRevision、generationId、dedupeKey**，刷新重放不能再次计数；不同 generationId 的重新生成不能被误去重。若同键内容矛盾，正式实现要保留冲突并降低覆盖可信度，不应默默选择一方。未经授权的来源、过期授权版本、跨 scope 或含正文而没有正文专门授权的 Event 必须拒绝。站点适配器版本改变或权限恢复不能静默导入历史空白。

\`observedAt\` 是浏览器观察时的墙钟，不是服务端时间；\`monotonicTickMs\` 必须和 \`observationEpochId\` 组合，不能跨重启直接相减。墙钟跳变、后台失联和服务工作线程终止保留 \`OBSERVATION_GAP/STATUS_UNKNOWN\`，不得补秒。源事件不可修改；重算的派生统计按新的关联 revision、时间窗口和 consent revision 输出。

## 4. Execution 状态机

| 当前阶段 | 可以接受的下一个观察信号 | 限制 |
| --- | --- | --- |
| 新请求 | SUBMITTED_OBSERVED | 没有此信号则起点未知 |
| 已提交 | FIRST_OUTPUT_OBSERVED、COMPLETION_OBSERVED、STOP_OBSERVED、ERROR_OBSERVED、OBSERVATION_GAP、STATUS_UNKNOWN | 直接完成允许，但无法得出首次输出耗时 |
| 首次输出/进展 | OUTPUT_PROGRESS_OBSERVED、COMPLETION_OBSERVED、STOP_OBSERVED、ERROR_OBSERVED、OBSERVATION_GAP、STATUS_UNKNOWN | 重复 Mutation 同键去重 |
| 观察缺口/状态未知 | 后续真实信号、COMPLETION_OBSERVED、ERROR_OBSERVED、STOP_OBSERVED | 即使后来观察到完成，跨缺口精确 duration 仍未知 |
| 已结束 | REGENERATED 仅指新的 generation 的触发 | 新 Response + 新 Execution，不能延长旧计时 |

\`COMPLETION_OBSERVED\` 仅表示页面上检测到可观察完成信号；**不等于服务端完成、不等于业务问题解决**。没有已观察完成时，时间样本右删失；页面刷新、冻结、关闭、进程重启都不能靠估计补齐结束时间。

## 5. 指标字典与使用限制

| 指标 | 定义与单位 | 可信前提 / 未知处理 |
| --- | --- | --- |
| TTFV | 首次可见输出观察时间 − 提交观察时间，ms | 两端均观察；否则 null，不当成 0 |
| 输出观察时长 | 完成观察时间 − 首次输出观察时间，ms | 必须无覆盖缺口，缺首次输出置 null |
| 单请求观察墙钟跨度 | 完成观察 − 提交观察，ms | 同 generation、同有效观察链；不等同服务端计算 |
| Problem 累计 AI 请求耗时 | 已确认归属的不同 Execution 精确跨度之和 | 每 Execution ID 去重；未知区间单列 |
| Problem 并行区间并集 | 将精确闭区间按起点排序，合并相交段后求长度 | 仅已观察完整段；不可称作用户工时 |
| 并发重叠计次 | 请求跨度总和 − 区间并集 | 三路以上并发是重复计数分钟，不是简单的两两交集 |
| 前台观察运行 | visibility=VISIBLE 且有运行态连续观察的区间长度 | 只算有采样与无缺口区间，标签页前台不代表用户看屏幕 |
| 后台观察运行 | visibility=HIDDEN 且有运行态连续观察的区间长度 | 后台节流/断联必须中断覆盖，不表示服务端一直计算 |
| Problem 首见至验收跨度 | \`verifiedAt − firstObservedAt\` | 验收定义和时区版本必须固定；未验收右删失；不叫劳动时间 |
| 回答/提问/重新生成数 | 分别按稳定 Turn ID、Prompt ID、Response generationId 去重 | 仅获准观察样本；虚拟列表与历史缺失不得反推完整次数 |
| P50/P90/P95 | 完整样本的最近秩法：第 ceil(p/100 × n) 个有序值 | 必报样本 n、窗口、授权源范围、覆盖率、右删失数 |
| 有证据问题推进数 | 在窗口内经过用户确认且有可追溯验收/推进证据的问题数 | 由明确的进展标准定义，非提问数或在线时长 |

**测试算例**：Execution A [0,40] min；Execution B [10,35] min ⇒ 累计请求 65 min、并集 40 min、重叠计次 25 min。若 A/B 任一缺起点/终点，精确聚合不得继续显示上述值为“全体精确总数”，要注明已知子样本和未知数量。前台曝光量来自 Time Review 的授权语义时，也不能转换成用户注意力。不能推断“用户在玩手机”或不同模型谁更高效。

## 6. 授权、删除、迁移与异常

- 默认**不接收**任何站点的 AI Insight 对话观察事件。Chrome 扩展广泛网站权限、Time Review 授权、产品遥测同意，都不能代替逐目的、逐精确 Origin、逐账号范围的 AI Insight 同意。
- 元数据观察与正文/文件/图像语义分析分别批准；本 R5 原型正文始终 OFF。云同步、外部模型处理、团队共享均不在本轮，未来需要各自的独立许可与删除说明。
- 撤销时拦截后续事件；合法既存数据保留与否由明确删除策略决定，不能悄悄重新启用。删除 Problem 时级联清理链接、独占事件、派生指标、缓存、索引、成果和受控副本；被其他 Problem 真正共享的原始实体不得粗暴删除。原型在来源映射不充分时宁可清空模糊事件缓存。
- Schema 升级必须从 \`schemaVersion=1\` 显式迁移：先备份并校验事件 ID、scope、consent 和 provenance，生成迁移版本及失败回退记录；旧数据缺字段则标 UNKNOWN，不补造日期或验证证据。合同变更要提供向前/向后兼容 fixture。
- 当前**未实现**：生产存储事务、全字段 JSON Schema validator、跨多设备时钟校准、迁移器、真实页面适配器、用户数据加密与正式删除审计。上述均不能用预览演示冒充通过。

## 7. 分层验收

- \`CONTRACT_SOURCE_READY\`：本 Schema、纯计算核心、fixture 和用例已落盘。
- \`ISOLATE_SMOKE_PASS\`：连接器隔离 JS 环境运行核心语义检查，与 Node/浏览器区分。
- \`NODE_PASS\`：实际在仓库执行 \`node --test projects/ai-insight/tests/insight-contract.test.mjs\`，报告命令、退出码、运行 SHA。
- \`PREVIEW_PASS\`：真实浏览器打开同一源码的预览，逐按钮验证 DOM 状态、键盘、暗色、360px。
- \`CHROME_PASS\`：获得真实已授权站点与版本绑定的 Chrome 观察证据。**目前 R5 无此证据，禁止标为已通过。**
