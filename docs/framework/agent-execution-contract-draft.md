# AI 长任务执行约定建议稿：用证据说明进度

2026-10-09。独立建议稿，供后续 coding agent 直接参考；不替代 AGENTS.md、测试合同或产品授权机制。本轮只读复盘并保存此稿，未运行 axiosx 测试、构建、浏览器或安装验收。

这个方法可概括为：**按调用依赖设置阶段检查点，用假设驱动排障缩小失败边界，以证据决定下一步和停止。** 调用流程、端到端验证、链路追踪和可观测性是已有专业概念；本文简称“证据驱动执行约定”只是工作约定名称，不是行业标准。

本案例的主要管理缺口不是没有规则。已有规则已经要求复用证据、限制重试、更新进度和验证后停止；还需要把它们落实为用户可检查的“观察→判断→下一步”记录，并避免把历史缺口误读为当前待办。不能仅凭本案例断言所有历史会话都违反了规则。

预防方式是让每个必要检查都回答五件事：**当前验证哪一步、已经证明什么、哪里失败、下一步为什么必要、何时停止。** 下一次执行若不能说明将新增什么证据，先不执行。

## 1. 专业概念分别解决什么

| 概念 | 简明解释 | axiosx 例子与边界 |
|---|---|---|
| 调用链路／调用流程（call chain / flow） | 描述一次调用经过哪些模块、数据向哪里传递、有哪些分支 | MAIN 与 Worker 是两条入口；先画依赖，避免无返回时随机检查整个工程。流程图本身不是执行成功的证据 |
| 端到端验证（end-to-end verification） | 从约定的真实入口触发，检查经过中间边界后最终可观察的结果 | 从真实批准的 SDK 或真实 Worker 执行到调用者及持久结果；普通 Fetch 成功不能替代 axiosx 成功。必须声明“端”与验收范围 |
| 链路追踪（tracing） | 将同一次操作跨异步边界的事件关联起来，定位它到达和停在哪一段 | 关联 requestId、runId、回执与结果；现有相关日志可用于追踪，不因此宣称仓库已实现完整分布式 tracing 系统 |
| 可观测性（observability） | 能利用日志、结果等外部输出判断系统内部发生了什么 | 比较服务端收到请求、后台收到回执、Worker 收到结果；日志多不等于能关联、能判断 |
| 故障定位（fault localization） | 利用已知正常和异常的边界缩小故障范围 | 后台有完整正文、Worker 没有正文，优先检查后台之后的返回和投影，不重新开发网络框架 |
| 假设驱动排障（hypothesis-driven troubleshooting） | 先提出可证伪的解释，再选择能区分解释的观察 | “是否投影丢失 cause？”应比较投影前后数据；重复同一请求却不改变假设，不能增加定位信息 |
| 阶段检查点（checkpoint） | 在关键事件后确认事实、状态与继续条件 | 定位故障、修复完成、验证通过、环境受阻时更新记录；这里是执行管理检查点，不指程序恢复快照 |

调用流程、追踪、可观测性描述程序如何运行和如何被观察；故障定位、假设驱动排障是诊断方法。阶段检查点、约 60 秒状态说明、复用决定和停止条件管理 AI 的执行过程。程序可观测，并不自动意味着 AI 会向用户解释判断。

## 2. axiosx 已有证据：历史失败与当前结论

证据基线是 main HEAD `b8cfc1f597ae1578e790f1b7fee89fb8aa1fcce9` 加当时未提交补丁。旧包简称 `c8d43791`；修复后开发包简称 `69bb1a31`，其完整 packageHash 为 `69bb1a3111e1c38e6413cee6923c97c067ba5a1f780be7fca1eee13e20c4b392`。简称用于阅读，实际复用使用原记录的完整身份；不能只比较 HEAD。

| 时间阶段 | 实际观察 | 能得出的判断 |
|---|---|---|
| 旧包 | 后台 operation 已 durable，原生回执与保存的 reply 包含 404/429/500 状态和正文；Worker 调用记录只有 E_HTTP/message | 已证实错误信息在返回给 Worker 的路径中丢失；不是“服务端没有响应”。见[旧包总结][baseline]及[旧包原始 journal/result][old-worker] |
| 修复与定向验证 | 旧实现的回归记录为 66 通过、6 失败；修改后已有 72/72 与 check 通过记录 | 这是有代码变化的失败→修复→验证，不能按运行次数判为盲目重试。见[失败日志][red]及[原工作流][native-workstream] |
| 修复后开发包 | MAIN/Worker 各自 GET、POST 得到 200；404/429/500 保留状态与正文；操作只有一次 submission 与一次 HTTP 原生回执 | 已有该开发包调用范围的真实验收，不是纯已提交 SHA、生产包或 ZIP 的正式 PASS。见[MAIN 实际返回][main-basic]、[Worker 原始结果][new-worker]及[最终调用总结][final] |
| 后续续接 | 产品输入和原包身份一致；复用已有调用证据，只增加恢复后错误保留及 pending Stop 两个组件组合用例 | 已有“不从头重测”的落实样本。组件 2/2 不提升为新的原生恢复或物理 HTTP 中止结论。见[复用核对][reuse]、[受影响验证][affected]及[续接工作流][main-workstream] |

当前五问应这样回答：

| 用户的问题 | 本轮可检查的回答 |
|---|---|
| 当前验证哪一步？ | 当前只核对案例证据并完成方法建议稿，没有正在执行 axiosx 验收 |
| 已经证明什么？ | 原记录证明 MAIN/Worker 成功调用、错误正文回传与相应持久记录；后续组件记录证明恢复/Stop 的特定交付边界 |
| 哪里失败？ | 历史失败在错误返回及 Worker 投影边界，已修复；同请求真实原生恢复仍 NOT_TESTED，F3/ZIP 未关闭，不能混为当前已知产品缺陷 |
| 下一步为什么必要？ | 本轮下一步是完成并检查模板，使其他功能也能暴露判断依据；重复 GET/POST 不会补齐方法交付或 F3/ZIP 证据 |
| 何时停止？ | 本稿覆盖概念、复盘、步骤/故障分支与三个可用模板，并保持正确证据等级后停止；正式工程验收由独立明确任务推进 |

HTTP 404/429/500 是这些用例故意触发的响应。请求业务结果失败而错误传递合同通过，可以同时成立；Worker 捕获错误后 run/result completed，也不意味着每个 HTTP 请求都成功。

## 3. 为什么已有规则仍可能看不到进度

以下只判断本地材料能够支持的内容。“材料不足”不等于执行者确实没做。

| 待核对的问题 | 本案例判断及依据 | 应检查的落实事实 |
|---|---|---|
| 开始没有目标、范围、通过或停止条件 | **材料不足以认定历史违规**。现有续接提示词有明确范围与停止要求，但不是完整历史对话记录 | 首条是否出现这些事实；不能用事后总结证明当时已经说明 |
| 任务列表没有依赖和失败分支 | **材料不足以认定历史违规**。已有工作流按注入→请求→后台→返回→结果组织，但不充分证明当时逐步公开了分支判断 | 下一步是否依赖前一步；失败时进入哪个边界，而非重新遍历列表 |
| 把产品、观察、环境、授权、证据缺口混在一起 | **产品缺陷已证实**是 cause 回传丢失；是否曾混淆其余类别，材料不足 | 将“没看到回执”与“没有回执”分开；先检查观察范围和身份 |
| 每次对话重新构建或全量测试 | **后续记录证明已落实复用**；无法凭此归因更早的执行。复用核对保存输入/包/清单一致性，本次只引用该核对结论 | 每次测试之前是否有复用决定、变化项和必要新增证明 |
| 相同失败没有变化还反复重试 | **已有失败→补丁→通过链有明确变化**。没有足够完整的历史执行序列认定其他重试均无依据 | 两次执行之间具体改变了什么；预期新观察能排除哪个解释 |
| 只有活动，没有观察→判断→下一步 | **已有收尾事实，不足以证明过程可见性**。缺历史逐次状态说明，就不能核验约 60 秒要求是否落实 | 更新是否指出实际结果、失效边界和下一步理由，而非“正在排查” |
| 用数量、耗时或忙碌代替完成情况 | **现有工作流未把测试数量换算为产品完成率**；不能推断所有旧报告 | 按功能目标及证据等级报告；72/72 只是特定测试集结果 |
| 已有规则足够但未一致落实 | **存在可证实的记录不一致**：旧工作流 status/nativeStatus 已 PASS、已有 finishedAt，resumeAt 仍写“修复 cause”；后续工作流 verificationGap 仍保留本轮已补的两项起始缺口 | 当前状态以完成记录与对应原件判断；历史缺口要标注时间语义，不直接当作待办 |

最后一项的字段原件见[旧工作流 JSON 第38行][stale-resume]、[后续工作流 JSON 第31行][starting-gap]，完成结果见[受影响验证][affected]。**合理推测**：如果续接 agent 只抓取 resumeAt/verificationGap，会重复处理已完成项；现有材料没有证明某次重测确由此触发。

因此本轮补充重点是执行检查与短模板，不增加另一套任务系统。历史材料保持原样；后续新记录将“起始缺口”和“当前剩余项”写清楚即可。

## 4. 最小执行约定

1. **先界定要证明的结果。** 写目标、范围、当前证据、实际缺口、依赖、通过条件、验证范围和停止条件。简单任务用几句话；无需每个小修改都建完整表。
2. **执行前先决定复用。** 查 testing-guide 与对应工作流，比较相关源码及传递依赖、测试输入、合同、环境、包和未提交补丁。成功且一致就引用原结果；改变则只补受影响证明；证据不全先核对档案；他处负责则引用。不要因新聊天、无关提交或更新时间重跑。
3. **每步记录一个可判断的结论。** 写“要证明什么／输入与前提／预期观察／实际观察和原件／状态／下一步与理由”。状态为待执行、进行中、通过、失败、受阻、尚未测试；复用是证据来源，不是新的执行。只有满足本步要求的证据等级才算通过。
4. **失败先定位边界和类别。** 上游已有合格证据，就先查第一个缺失或矛盾的下游观察；仍需核对是否同一次请求，不能只靠时间相近。没有数据时先排除观察缺失，不默认改业务代码。
5. **重试前写出变化与新增价值。** 记录上次结果、本次代码/输入/环境/观察方法变化，或能区分解释的新假设。新假设必须落到新的观察或判定，不能只改说法再跑同一检查。确定失败且条件不变，不重试。确有暂态依据时先定最大次数或截止时间、成功条件和耗尽后的动作；重试仍受授权和副作用限制。
6. **用事件与约 60 秒更新说明判断。** 定位、修复、通过、受阻或范围变化时更新；长操作未结束时写等待哪个进程/结果、已等待多久、预设结束条件。没有新结果就如实说等待，不增加假进度。尽量使用可轮询的后台命令，使更新可继续。
7. **按当前范围收尾并停止。** 回答目标达成、变更、验证/复用、未测项、剩余缺口和资源释放。满足本次通过条件即停止；没有可行恢复路径时报告受阻及所需输入，不宣称成功。发现范围外代码缺口，只记录文件、证据、预期行为和通过条件，不自动开发。

步骤失败后的最小分支：

| 类别 | 判别依据 | 下一步及边界 |
|---|---|---|
| 产品行为 | 同一身份下，合法输入和正常环境产生与合同不符的可观察结果 | 定位最小实现边界；仅在当前任务授权范围内修复并定向验证 |
| 观测方法 | 查看了错误窗口/realm/日志源，观察器未捕获或信息截断 | 修正观察位置与方法，再补缺失事实；不得把“没看见”直接判为产品失败 |
| 运行环境 | 服务未启动、进程异常、测试资源冲突等有直接证据 | 修复自有环境或等待明确交接；不争用其他 agent 的浏览器、端口、dist |
| 授权 | grant、真实 sender、document/owner 等不满足执行或交付条件 | 走既有真实授权与绑定流程；撤权或 owner/document 变化后拒绝旧交付 |
| 证据缺口 | 缺原件、身份不一致，或组件证明不足以支持原生/安装结论 | 标记 EVIDENCE_INCOMPLETE / NOT_TESTED，说明需要的最低证据等级；不伪造回执或提升旧包证据 |

## 5. axiosx 的步骤与故障分支示例

这是复用已有证据的定位示例，不是要求后续每轮把全链路重跑一遍。

```text
网页 MAIN OpenDeskSDK.axiosx → 页面 relay / SDK broker ─┐
独立 Controller Worker axiosx → sandbox relay / host ─┤→ 网络驱动 → 服务端
                                                     └← HTTP 原生回执
后台保存操作响应 → 各自回程编解码／错误投影 → 调用者 → 最终 run/result
```

持久操作响应可能在交付给调用者之前保存；最终 controller-result 在运行结束后生成。图中的节点是判断边界，不意味着“持久化总在最后”。MAIN 成功不能替代 Worker 成功，两条回程分别确认。

| 节点／要证明什么 | 已有通过证据与适用范围 | 失败后去哪，为什么 |
|---|---|---|
| 注入与授权：入口在正确 realm 可调用且真实授权有效 | [原工作流][native-workstream]记录真实 Sidebar 批准；[最终总结][final]记录可信批准/运行；[MAIN 返回][main-basic]与[Worker 结果][new-worker]证明实际调用 | 变量不存在查注入/realm；变量存在但拒绝查 grant/sender/document。变量存在只证明入口可见，不证明网络成功 |
| MAIN 或 Worker 发起调用：使用真实 axiosx 消费者 | [MAIN 返回][main-basic]、[Worker 运行源码][worker-source]及 journal 的 operation/envelope | 无对应操作记录，查入口参数、relay、准入和观测位置；普通 Fetch 的结果不能填此格 |
| relay/broker/网络驱动：后台接纳并分派正确操作 | [最终总结][final]与[Worker 原始 journal][new-worker]关联 AXIOS_GET/AXIOS_POST、requestId、submissionCount | 准入失败查授权/参数；接纳但未分派查内部转发；派发效果未知时先追记录，不盲目重新发请求 |
| 服务端：确实收到特定请求 | [服务端原始日志][server-log]中的 final-main / final-worker 请求方法、URL、正文、响应状态 | 查 URL、服务、驱动及观察窗口；只有客户端“已 dispatch”不能推出服务器已收到 |
| HTTP 原生回执：后台确实取得响应 | [MAIN 后台记录][main-db]、[Worker journal][new-worker]的 nativeReceipts 与响应 | 服务端已收到而后台未见回执，查响应/回调/关联与环境；不能据缺回执推断没有副作用后重放 |
| 回程编解码／错误投影：调用者拿到合同要求的数据 | [MAIN 错误返回][main-errors]、[Worker 结果][new-worker]与[最终总结][final]中 404/429/500 状态和正文 | 后台完整、调用者不完整，集中比较首次/持久 reply、异常捕获、投影与 codec；无需重做注入、网络框架或 HTTP UI |
| 持久结果、授权、停止和恢复：身份与交付/释放边界正确 | [最终总结][final]的运行结果和 released；[两个新增组件用例][affected]证明特定恢复/Stop 边界 | 缺结果查 journal→controller-result 提交；旧 owner/撤权查交付围栏；未知效果禁止重放。同请求真实原生恢复仍未测，旧包生命周期证据不提升到新版 |

历史丢失点对应现有两处修复：[controller-methods.js 第590行][host-fix]保存完整 HTTP 错误并在首次交付时使用保存的 reply，交付仍经过授权检查；[sandbox/controller.js 第4行][sandbox-fix]在官方 codec 的大小、深度、访问器限制内保留 HTTP cause。返回正常响应或错误数据，是需要分别验证的路径。

跨异步边界复用现有身份，不先增加另一套 tracing 平台：

- **一次操作：** requestId ＋ operation.kind/method/args，以及已有 opId/requestDigest；同一个 run 内也有多个请求，不能只按 runId 关联。
- **一次运行与结果：** runId → journal 操作 → 精确 controller-result 的 resultId；核对 result 自身 revision/sourceHash。操作级 resultId 不是整个运行的 controller-result。
- **谁能操作哪个文档：** envelope 中 target 的 tab/frame/document、会话身份，以及 hostDocumentId/ownerEpoch、grant 等实际字段；变化后不能继续按旧身份交付。
- **什么实现产生的证据：** base SHA ＋ 未提交补丁/相关源码输入 ＋ packageHash ＋ 脚本内容身份。不同包、组件、原生、F3、ZIP 证据保持各自等级。

一个现成关联例子是新版 Worker 的 HTTP 500：requestId=`70642fe7a381273ce29e155ef5f4b00c`，operation=`service/AXIOS_GET`，runId=`44609272-8f86-41f5-b1bc-336c9cabe298`，最终 controller-result 的 resultId=`97145771-aec8-442c-8e8c-ad2d9f10491c`，revision=1，sourceHash=`54ccfb0ae0f32ee67cf74324f21a2d0bef2da98fd43f811862494428bebcb1c8`，retirementState=`released`。这些字段在[原始结果][new-worker]和[总结][final]互相对应。

服务端日志没有承诺携带这个 requestId。本例通过 journal 的 URL/方法与既有 case 标记、请求正文、时间、单次调用记录关联服务器观察，不能虚称已将统一 traceId 贯穿服务器。若现有记录确实无法区分多个请求，才建议补该边界所需的最小观测字段。

## 6. 三个可复制短模板

尖括号填写实际事实；没有事实写“未知／缺何证据”。“继续排查”“加强验证”“持续优化”不能代替观察或判断。

### A. 开始执行前：方案与验证表

```text
目标与范围：<用户要得到的可观察结果；本轮边界>
当前证据：<原件路径、日期、输入/包身份、证据等级、复用决定及理由>
实际缺口：<尚未证明的行为或已证实缺陷；文件/失效边界>
通过条件／停止条件：<具体观察满足即完成；受阻时需要何输入>
拟修改文件／验证范围／资源：<实际清单；无修改/无资源也明确填写>
```

| 关键步骤／前置依赖 | 要证明什么；输入／预期观察 | 状态；实际观察与证据 | 下一步及必要性 |
|---|---|---|---|
| <实际步骤名；依赖的事实> | <可证伪的结论；具体前提与通过条件> | <六种状态之一；原件、身份、等级，未执行就写未执行> | <通过后去哪；失败后查哪个边界；将新增什么事实> |

### B. 执行中：当前步骤／观察／判断／下一步

```text
当前步骤／状态：<实际功能；进行中/通过/失败/受阻等>
观察结果与证据：<刚得到的事实；原件路径＋身份＋等级>
判断：<已经证明什么；第一个失效边界；推测与未知另写>
下一步及理由：<具体行动；它将排除什么解释或补什么证明>
停止/等待：<完成事件或截止条件；长命令等待对象及已等待时间>
若重复执行：<上次结果；本次具体变化；新增证据；有限重试条件>
```

合格案例：只读复盘旧包 Worker HTTP 500。后台 journal 的 requestId `1ffa33d7e4e3f00b7468d5e4bc875305` 已保存 status=500 和正文，旧 Worker calls 中只有 code/message，见[旧包原件][old-worker]。因此历史失败位于错误返回/投影，现有新版结果已证明修复。下一步只把该分支写入模板，不再请求网络；文稿通过内容检查即停止。

### C. 收尾：目标结果／变更／验证与复用／剩余缺口

```text
目标结果：<达成/部分达成/受阻；逐项对照原通过条件，不给伪完成率>
变更：<真实文件与行为；没有产品修改就明确写出>
验证与复用：<本轮执行哪些检查；复用哪些原结果及其身份/等级>
失败／未测／剩余项：<当前缺口与范围；已修复历史问题单列，不再当 blocker>
续接位置：<当前仍必要的下一步及理由；无本轮剩余工作就写完成>
资源：<本轮自有进程/profile/端口/dist/ZIP 的释放证据，或未分配>
停止依据：<已满足哪个通过条件；范围外任务由哪份现有记录承接>
```

本案例应写“开发包调用验收已有证据可复用；同请求真实原生恢复未测，F3/ZIP 未关闭”，不能写“axiosx 整体工程正式交付”。已有运行资源释放见[原资源释放记录][release]；本轮没有分配这些资源，引用旧释放记录不等于新执行了一次释放。

## 7. 怎样落实，而不继续堆指令

| 与已有约定的关系 | 已有位置 | 本建议稿的最小补充与检查 |
|---|---|---|
| 保留按职责/消费者/入口验证，区分实施与证据等级 | [AGENTS.md 第25行][agents-flow] | 步骤表连接真实依赖和失败分支；不另建全局任务树 |
| 保留最小修复、变化后才重试、集中最终验收 | [AGENTS.md 第27行][agents-retry] | 每次重复执行列上次结果、具体变化和新增证明 |
| 保留跨对话复用与单资源占用 | [AGENTS.md 第49行][agents-reuse]、[testing-guide 第20行][guide-reuse] | 开始模板引用现有工作流与五类复用决定；不覆盖 receipt、原清单或他人资源 |
| 保留首条说明、约60秒更新、不用数量算完成率 | [AGENTS.md 第54行][agents-progress] | 检查更新是否有观察→判断→下一步；等待时说明真实对象与结束条件 |
| 保留工作流字段及收尾释放要求 | [testing-guide 第45行][guide-record] | 区分启动时缺口与当前剩余项；终态 PASS 与续接待办不应互相矛盾 |

**现在靠工作记录检查：**执行前看 A，每次事件/等待看 B，收尾看 C。无需新增账本；在当前任务或专属工作流中填写即可。缺字段只能判“落实不可核验”；原始证据证明违反要求，才判执行偏差。

**以后可选的轻量工具：**检查证据链接是否存在、必要身份字段是否完整、输入是否变化、相同命令在无变化情况下是否重跑、终态与未完成字段是否矛盾。自动提醒不能替代判断，命令字符串相同也不等于验证输入相同。本轮不实现这些工具；先看三个模板是否足够。

**需要产品机制守住：**真实 sender 与授权、document/owner 绑定、未知副作用与缺回执时禁止盲目重放、可信原生输入、停止后的晚到交付抑制、持久结果及资源生命周期。这些需要代码执行边界和相应证据；提示词或记录检查本身不能强制保证。

本稿只是提示词与人工可核对的执行约定，不能保证所有 agent 永远遵守。执行检查负责揭示偏差；已有产品机制负责实际授权和副作用边界。本文的停止点是建议稿和模板可用，不借方法讨论推进产品开发、全量原生验收、发布或 F3/ZIP。

[baseline]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-native-01a11f42/baseline-summary.json:1846
[old-worker]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-native-01a11f42/worker-matrix-db.json
[red]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/red-regression.log:534
[native-workstream]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/axiosx-native-01a11f42.md
[main-workstream]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/axiosx-main-01a11f8a.md
[final]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/final-summary.json
[new-worker]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/final-worker-db.json
[main-basic]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/final-main-basic.json
[main-errors]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/final-main-http-errors.json
[main-db]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/final-main-db.json
[worker-source]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/final-worker-source.js
[server-log]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/http-requests-43111.jsonl
[reuse]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-main-01a11f8a/reuse-review.json
[affected]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-main-01a11f8a/affected-verification.json
[release]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/axiosx-worker-final-01a11f42/resource-release.json
[stale-resume]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/axiosx-native-01a11f42.json:38
[starting-gap]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/axiosx-main-01a11f8a.json:31
[host-fix]: /Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:590
[sandbox-fix]: /Users/shopme/Documents/workspace/opendesk-browser/src/scripting/sandbox/controller.js:4
[agents-flow]: /Users/shopme/Documents/workspace/opendesk-browser/AGENTS.md:25
[agents-retry]: /Users/shopme/Documents/workspace/opendesk-browser/AGENTS.md:27
[agents-reuse]: /Users/shopme/Documents/workspace/opendesk-browser/AGENTS.md:49
[agents-progress]: /Users/shopme/Documents/workspace/opendesk-browser/AGENTS.md:54
[guide-reuse]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/testing-guide.md:20
[guide-record]: /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/testing-guide.md:45
