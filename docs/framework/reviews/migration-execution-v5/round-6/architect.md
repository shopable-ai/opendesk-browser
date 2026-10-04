# Round 6 Architect 正式受影响范围复核

**98/100 · APPROVE · 0 blockers · independent: true。** 本结论是阶段0执行方案批准，不是 F1/backend 资格批准。

候选 manifest SHA256：`da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1`。上一有效 round5：`a9c47c0e20d8bb5710fead199fc197ac98d3bc098dc3d96f2a719ed50b50651b`。两个顶层 JSON hash 字段均绑定上述同一 round6 manifest。本人不是候选、产品或原型作者；此前给出的独立 precondition opinion 作为受影响输入，不代替本次正式复核。

## 核验范围与结果

25 个候选文件、18 个继承引用及 7 个受影响诊断引用的 SHA256/bytes 全部匹配。核阅的原生证据版本为138.0.7204.183与154.0.8037.92；本次未重跑浏览器。18 个继承引用清单与 round5 完全相同；19 个候选文件完全不变，5 个既有文件修改、1 个新增，共六个有界差异。逐项校验明细在 JSON `verification.allChecks`。

- execution-plan.md 与 compatibility-delta-v5.md 只追加 round6 差异。
- 账本已有条目/判定/603 个 caseResults 全部原值不变；只向六个 API 加历史限制引用及追加条件修订/分母历史。
- 603 个案例 ID/顺序全部保留，602 个完全相同；只有 F1-PAGE-AUTH-CSP 更新预期，同时保存与 round5 精确相同的 originalExpected，增加四个 requiredSubcases。独立 F1 列表另外 11 条完全相同，round5 原生 Worker 3s 合同未改。
- 六个入口 $eval、$$eval、addScriptTag、waitForFunction、eval、evaluate 的模块与各四个 caseIds 与账本完全对应，合计 24 个原案例保持相同输入/预期。见 [映射](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/stage0/user-scripts-switch-history-amendment.json:15)、[F1 case](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/stage0/f1-cases.json:255)、[产品规格 case](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/test-spec-v5.json:18347)。
- 按真实条目派生：72 来源、48 API、183 SDK/服务/工具能力条目、63 资源条目、191 必需处置合同、184 必需正能力、603 必选产品案例。183/63 是条目全集，不伪称全部都是必需正能力；原延期/排除记录同 round5。4 个新增必测分支嵌于原 F1 case，不改变603原分母。

## 正式判断

批准的唯一合同差异是：**同 host/document、没有其他真实失效、操作机制未观察到的瞬时 Allow User Scripts OFF→ON，不再承诺追溯取消已发出的旧 effect/result。** 实测只排除了已查 witness 路径，不能推成所有原生 signal 均不可能。浏览器开关仍控制原生调用入口；OFF 新调用拒绝，不能绕开或重放。[边界](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/execution-plan.md:107)

操作自身实际观察 native OFF/API refusal 后，失效必须 sticky；ON 不恢复旧操作。监测由操作生命周期拥有，终态释放，runner 不得注入 fence。dispatch/最终 acceptance 检查当前可用性，但不冒称连续授权或原子检查。[观察与真实撤权](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/execution-plan.md:109)、[实现约束](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/stage0/user-scripts-switch-history-amendment.json:196)

origin permission、自身显式 grant、doc/host/session/target、lease、cancel/deadline 的真实失效全部保留可信单调 fence。原 six AUTH cases 未削弱；REAL-AUTHORITY-FENCE 仍要求真实 revoke/renew、pending/native-completed、doc 失效和一次拒绝。[新增四分支](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/stage0/user-scripts-switch-history-amendment.json:132)

最强反例是未观察到的 OFF→ON 与真实 grant 撤销/续授或 document 替换重叠。此时必须拒绝旧结果，不能套用历史限制。当前候选明确把这类真实失效排除在唯一例外外；未来联合候选若按当前 API=true 接纳旧结果，仍 BLOCK。已发副作用不能回滚不等于允许旧 result。

SDK 独立链、服务预算/命名空间/真实身份、unknown 写不自动重发、固定 relay/packaged MAIN scripting 仍不依赖 controller/userScripts。F3 仍固定同一最终 production 扩展包，fresh profile 全部603及服务/资源、必选族、1000轮/10重连/2禁插件验证；原包变更使受影响证据 stale，最终全量重验。[独立SDK](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/execution-plan.md:43)、[固定SDK注入](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/execution-plan.md:91)、[F3](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-6/candidate/execution-plan.md:37)

旧 expected、8 个 contractMet=false 反例、独立 page FAIL、四个 raw throw/reject shape FAIL 与 required permission remove FAIL 必须原样保留。新增 UNOBSERVED-CYCLE-LIMIT 只确认限制，绝不能算旧 fencing 成功。真实 shape 对 wrapper API 的独立判决继续分账；自然 host 重建未证明。本次未新跑诊断/矩阵，也未写候选、原型、产品或公共 gates。

## 分项评分及非阻断项

|项目|得分|依据/扣分|
|---|---:|---|
|候选/继承证据完整性|20/20|50个文件引用全部 hash/bytes 匹配，差异边界精确|
|完整Goal/SDK/F3范围|20/20|原分母、正能力、SDK独立和同最终包要求未减|
|受影响授权与安全边界|20/20|观测OFF sticky 与真实撤权 fence 保留；无特权fallback/replay|
|试验形状与可核验性|19/20|减1：版本/world/阶段矩阵由正文绑定，子场景JSON未各自编码matrix维度|
|旧合同与差异追溯|19/20|减1：authorityClause指v5:240，条件缩窄原文实际在:239|

上述两项为 WATCH，零方案阻断。F1 仍须逐项核实正文绑定的完整矩阵，不能只数四个 ID。引用定位误差不改变已核实的 [v5允许受影响条件修订原文](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt:239)；本次不修改候选，也不要求产品 F2 文件存在或 F1 已全通过才能批准方案。

## 生效与功能资格

**Architect 批准本修订范围内的原型修复方案；还须同 `da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1` 候选顺序交独立 Critic，达到≥95、APPROVE且0 blocker才生效。** 不批准超出该边界的权限/后端/回放变更。

page 历史候选 `2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036` 的 ARCH-PAGE-01/CR-F1-PAGE-001 不因方案审批关闭。当前 F1 page 仍 BLOCK，联合候选未冻结；backendPrototypePassed/allF1PASS/F2/F3 均未批准。实际修复、监测真实性/清理、真实grant/doc竞态和两lane完整F1只能在最终冻结联合候选上独立判断。603产品案例仍全部 not-tested。
