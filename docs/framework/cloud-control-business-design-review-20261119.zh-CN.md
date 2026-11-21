# 云控业务需求与测试设计独立评审

2026-11-19 · 评审对象为[业务需求及实施](../architecture/browser-framework/cloud-control-business-design-20261119.zh-CN.md)、[业务旅程](../architecture/browser-framework/cloud-control-business-journeys-20261119.zh-CN.md)、[设备托管](../architecture/browser-framework/cloud-control-device-custody-20261119.zh-CN.md)、[业务测试计划](cloud-control-business-test-plan-20261119.zh-CN.md)。独立评审者为未参与编写的 Codex 原生 critic 子代理 Erdos，审阅标识 `01a1f2e6-285e-7e30-9cc7-9686879c2497`。主任务整理原评语及逐项修正。较早三文件候选的 98 分只属于当时的摘要，本版重新评分。评分要求为设计总分 ≥95，安全、幂等恢复及验收设计无阻断。

## 初评与整改

独立初评 **87/100，退回修订**。#1288 只读详情具备开始实施的条件，主要问题出在业务需求如何生效，以及失联后凭什么认领、重试或保持未知。评审核对了原权限合同、Provider 实现、固定绑定脚本及测试断言；mac24dev 后端依据现行接入设计，未由评审者实读远端源码。

| 项目 | 初评 | 发现的问题 | 本轮修正与定位 |
|---|---:|---|---|
| 现实场景与需求 | 17/20 | 原走查漏了编辑的验收决定，零派发的会议不能证明业务撤回生效 | 运营和编辑分别对成功与退回样例作决定。另测同一浏览器授权下，草案与撤回修订不能派新单，甲版原单仍可查。[业务走查](cloud-control-business-test-plan-20261119.zh-CN.md#t26) · [修订准入](cloud-control-business-test-plan-20261119.zh-CN.md#t01) |
| 设备托管 | 19/20 | 首切片误要求读取现有业务目录没有的本机证据 | 2a 验本人目录、连接及委托依据，槽位和当前 Chrome 网站权限缺失就展示原因与管理入口。全字段只在模拟层对照。[设备实施单](../architecture/browser-framework/cloud-control-device-custody-20261119.zh-CN.md) · [目录边界](cloud-control-business-test-plan-20261119.zh-CN.md#t04) |
| 权限与脚本 | 18/20 | 未声明的执行参数与技术文章中的普通文本混淆 | 对额外执行字段验拒绝和零派发。对合法正文验逐字回读、保留原任务与站点、无额外动作。[参数合同实现](../../src/platform/tasks/contract.js) · [正反例](cloud-control-business-test-plan-20261119.zh-CN.md#t09) |
| 端到端状态与恢复 | 12/15 | 草稿丢答时易误认同稿；旧发布进程是否仍可写缺可观察判据 | 受控平台在创建草稿事务中记录意图对应的 ID。公开前核准尝试代次，恢复时验证旧事务和终结记录，让迟到请求到达最终处理器并查拒写及对象数。[旅程 B](../architecture/browser-framework/cloud-control-business-journeys-20261119.zh-CN.md) · [迟到请求](cloud-control-business-test-plan-20261119.zh-CN.md#t16) |
| 验收与证据 | 12/15 | 错号没有验到首次保存，限流测试混用了成功键与被拒键 | 账户不符、缺素材时首次点击为零；保存丢答是首次点击一、恢复追加零。增加独立可复跑限流测试，分别查已成功、刚被拒绝和窗口重开的键。[草稿反例](cloud-control-business-test-plan-20261119.zh-CN.md#t14) · [限流用例](../../tests/cloud-control/client-submit-limits.test.mjs) |
| 任务与文档交接 | 9/10 | 双任务切片缺首份合法配置的 owner 和旧配置读法 | 2c 指定 BFF 接入负责人和绑定维护者，在专用设备用两项完整 pin 与 Client scope 求交集，按旧 bindingId 条件替换。旧单 pin 和老请求沿原绑定查询。[实施单第 2c 项](../architecture/browser-framework/cloud-control-business-design-20261119.zh-CN.md) · [原绑定工具](../../examples/cloud-control/mac24dev-demo/update-binding.py) |

## 评审核对的版本

| 文件 | 初评 SHA-256 | 第一次修订 SHA-256 | 第二次修订 SHA-256 |
|---|---|---|---|
| 业务需求及实施 | `ba8495e4d28cff4e566293b6fbc38163909d7b08a4aaacc4ce867d6cf224fa19` | `c3c539c48a73e44609a78a577fc7362562e32b4721f9b4242a013ff636fd5a5a` | `76a8d4352ad74728996cd8e1bf0920808c87a41ef0637282c22d6333056a8538` |
| 业务旅程 | `427a83fa5722437b5bf828dbfd3ddf1d4dcbb26741474b8b52780ef63ac9158c` | `406ac69bc1f1659954fedfadfdc4874f5a46a3f946a59169de12e1be1d4c3280` | `406ac69bc1f1659954fedfadfdc4874f5a46a3f946a59169de12e1be1d4c3280` |
| 设备托管 | `c817bc7f6bb65d01763e9039ba499d52477f4c2ef92beb259450dff282186756` | `c817bc7f6bb65d01763e9039ba499d52477f4c2ef92beb259450dff282186756` | `c817bc7f6bb65d01763e9039ba499d52477f4c2ef92beb259450dff282186756` |
| 验收用例 | `b8d4d52496058474069a90c7654e913d4f4878a3915fd155c0cc45e04221efdf` | `6e9aa7dba181e5c4dc259f870d1cc635930c3dd379baf5712b0fd638da2f7f13` | `e94c460fb6f79b4b5d95204ee2cc368de064081aec49e3da615bddf34ba0f128` |

## 第一次复评与修正

第一次复评 **96/100**，六项为 19、20、20、15、14、8。设备只读切片可进入实施；评审者要求继续修正 2c 同 pin 修订可能串单的问题。判定依据与实际修正如下。

- 当甲乙两个需求修订复用同一任务与参数，旧页仍能发出外形相同的新请求。现拟议业务目录给出需求 ID 和修订，调用者回传期望值，BFF 在创建意图的同一事务内按本人、设备和当前修订验证。旧键继续按原身份查。2c 先用现成单页包与表单演示双任务，下一切片再冻结两页包。[修订用例](cloud-control-business-test-plan-20261119.zh-CN.md#t01) · [单页包](../../examples/tasks/modern-search.v1.opendesk-task.json)
- 需求变更卡现将“能力已支持、设备尚未批准”交设备持有人；“现有合同无法提供”交框架 owner 评估。[需求走查](cloud-control-business-test-plan-20261119.zh-CN.md#t26)
- 限流用例保留可直接观测的三个结论：成功键和被拒键的结果、已建 Job 及 Assignment 数、只读查询前后账本逐字节相同。[限流断言](../../tests/cloud-control/client-submit-limits.test.mjs) · [测试记录](cloud-control-business-test-plan-20261119.zh-CN.md#t22)

## 第二次复评

**99/100，设计可交接。** 评分依次为 20、20、20、15、14、10。评审者验明旧页面即使使用同一 pin 和参数，新键也须按已撤回的原修订拒绝；合法旧键仍可查回。安全、幂等恢复与分阶段验收均无设计阻断。唯一扣分在 T22 的证据粒度：两次状态查询共用一组前后快照。最终交付将“各次只读查询前后”修正为“每个限流边界处，两次只读查询合计前后”，与实跑断言一致。[T22](cloud-control-business-test-plan-20261119.zh-CN.md#t22) · [快照断言](../../tests/cloud-control/client-submit-limits.test.mjs)

最终提交评审的前三份设计 SHA-256 与上表第二次修订一致；测试计划的最终 SHA-256 为 `0bc92aef9eac617e3189f8fe9399513803252c6e4b90d347519a39aa59142359`。

## 独立终评

独立评审者核对四份最终 SHA-256，并比对最后一句及对应源码断言，给出 **100/100，设计可交接实施**。安全、幂等恢复、验收设计三项均无阻断。评审者只读复核；集成测试的实跑结果由测试执行者取得。

| 项目 | 终评 | 评审采用的证据 |
|---|---:|---|
| 现实需求 | 20/20 | 运营和编辑的决定、成功例与退回例、授权和能力缺口的不同处置。[T26](cloud-control-business-test-plan-20261119.zh-CN.md#t26) |
| 设备托管 | 20/20 | 本人目录、真实来源和未知提示、只读入口与零派发。[设备实施单](../architecture/browser-framework/cloud-control-device-custody-20261119.zh-CN.md) · [T03](cloud-control-business-test-plan-20261119.zh-CN.md#t03) |
| 权限与脚本边界 | 20/20 | 普通 Client 拒绝额外执行入口，同时能按原任务处理合法技术正文。[T09](cloud-control-business-test-plan-20261119.zh-CN.md#t09) |
| 端到端状态与恢复 | 15/15 | 原草稿意图和对象的唯一归属，旧发布代次永久拒写和迟到请求反例。[T14](cloud-control-business-test-plan-20261119.zh-CN.md#t14) · [T16](cloud-control-business-test-plan-20261119.zh-CN.md#t16) |
| 验收与证据 | 15/15 | 需求到用例的追踪、分层执行记录、限流快照与真实断言一致。[测试计划](cloud-control-business-test-plan-20261119.zh-CN.md) · [T22 断言](../../tests/cloud-control/client-submit-limits.test.mjs) |
| 任务与文档交接 | 10/10 | 2a 的本人详情和 2c 的双任务来源、修订校验、旧配置与原键恢复均有实施判据。[业务实施单](../architecture/browser-framework/cloud-control-business-design-20261119.zh-CN.md) · [T01](cloud-control-business-test-plan-20261119.zh-CN.md#t01) |

业务签收仍待运营与编辑实际裁定样例。产品正式验收仍需在对应候选取得已安装任务、Chrome 原 Run/Result、目标网页或平台对象、回执与释放证据，手机另取实机记录。
