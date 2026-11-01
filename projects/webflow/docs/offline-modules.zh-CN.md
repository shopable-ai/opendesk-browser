# Web Flow 应用

WebFlow 是 OpenDesk Browser 上的应用业务，负责 AI 会话交接、工作流队列和业务证据回传。Browser 框架继续负责公开 SDK、Authority、RunHost、安装、权限与 Durable Result；百度/Google 搜索属于各自已安装 Controller Task。本文是应用源码入口，唯一产品合同仍为 [AI Workflow Bridge](product-contract.zh-CN.md)，执行记录沿用 [Web Flow 工作记录](execution-plan.zh-CN.md)。

## 归属与当前增量

现有 Bridge 入口在 `src/native-agent/chatgpt-*`，正由本机 P0 owner 验证；本轮不迁移、不改写这些文件。发现现有 `chatgpt-calculation-relay` 项目提供算术 A→B 交接，但没有通用 WebFlow 交接包校验；它仍保留自己的唯一业务 owner。`projects/`、`examples/` 中未发现既有 WebFlow 正式项目，本目录作为新增应用业务 owner，不是第二个 Chrome 扩展、Host 或 Runner。

交接/队列状态是纯数据代码，不安装 Page/Controller；队列存储边界只调用显式注入的公开 getItem/setItem，本轮仅注入离线测试存储，不读写实际用户任务库。未来 Sidebar/Page/Controller 模块仍各走原类型安装合同，不能因目录归属获得特权。应用队列、站点适配和任务策略不得写进框架核心；只有证明公开 SDK 的通用能力缺口后才交给 Runtime owner 最小处理。

## 第一单元：交接包数据合同

目标：在执行前拒绝错误/过期/错身份/超范围的交接数据，保留目标、必要摘要、证据、仓库、产物、验收和停止条件。解析通过仅说明数据与调用者提供的预期身份一致，不证明 authorizationRef 有效，也不创建、发送或执行任务。

- 源码：`src/handoff-contract.js`。
- 测试：`tests/handoff-contract.test.mjs`。
- 接口：`parseWorkflowHandoff(json, {now, expectedSource, expectedTarget})`；`createWorkflowHandoffKey({protocol,workflowId,stepId,handoffId})`。
- 固定协议：`opendesk.workflow.handoff.v1`，与五字段 `opendesk.task.intent.v1` 分开。
- 第一版目标适配器只接受 `codex-local`，源与返回只接受 `chatgpt-web`；Google AI 未选定，不实现或默认为某产品。
- 使用产品合同第 9.6 节封闭 Handoff 形状，增加必需 `stopConditions`。首轮限 `maxSteps=2`、`maxHandoffs=1`；`expectedArtifacts` 必须包含在 `allowedFiles` 中。
- JSON 上限为 32 KiB UTF-8；字符串长度上限按 JavaScript UTF-16 code units 计算。路径仅相对 POSIX 路径，拒绝绝对路径、反斜杠、冒号、空/`.`/`..` 段；不解码或访问任何路径。
- 验证命令和 artifact refs 只作为数据；实际读取产物、权限重核与命令执行属于后续获准适配器。第一单元不实现 Receipt、UI 或派发；第二单元的离线状态/存储边界见下文，不等于真实持久队列已接通。

## 最小计划与失败用例

- [x] 先写 Node 行为测试并运行，确认缺少模块/能力而失败。
- [x] 实现纯函数与深冻结返回，复用现有项目封闭对象/带 code 错误风格，无运行时依赖。
- [x] 覆盖有效输入、额外字段或伪授权、错误协议/适配器、错原对话/仓库/ref/commit、篡改幂等键、过期/无效时间、缺上下文/停止条件、危险路径、产物超范围、输入/引用上限和深冻结。
- [x] 仅运行本项目测试、模块语法和相关 diff 检查；不启动浏览器、模型外部业务任务或根构建。

检查命令：

```sh
node --test projects/webflow/tests/handoff-contract.test.mjs
node --check projects/webflow/src/handoff-contract.js
```

当前为 `SOURCE_IMPLEMENTED / COMPONENT_TESTED`：先运行测试观察模块缺失的 RED，随后实现并得到 120/120 PASS；模块语法检查通过。数据模块未导入正在运行的 Bridge，没有 UI、真实发送或队列接线，P1 纵向闭环和长期任务仍未完成；本轮不需要 Browser 构建/安装/原生验收，不提交推送发布。

历史生成过程使用本机 OpenCodex `openai/gpt-6.1-sol` / `xhigh` 的无持久会话、只读调用：首次 HTTP 请求超时无输出，随后原生 CLI 分别完成测试与实现；协调者审查并增加了 UTF-8 编码前的字符长度保护。两次本地 CLI 均已退出，没有追加模型请求。调用摘要在本地 `artifacts/web-flow-20261101/handoff-unit/`。

用户最新明确“不强制 HR”；后续优先当前任务直接推进，HR 可按实际价值选用，不作为等待前置，不修改全局模型/权限/provider。Dot 额度归属本轮无法核实，不宣称免费。

## 第二单元：单 owner 队列状态与恢复

复核结论：交接校验保持纯函数和项目内测试，不改它来伪造派发；幂等键需要状态记录才能阻止重复领取。公开 [Controller AppStorage](../../../docs/api/controller.zh-CN.md#已安装-task-的存储与调用) 仅有 getItem/setItem/removeItem/clear，没有跨宿主 CAS。下列实现只支持调用方保证独占的单 owner；本地 busy/陈旧写检测不等于分布式锁。

- `src/queue/state.js`：纯状态转换与有界事件日志，单工作流最多两项、64 个事件。`createQueueJournal({workflowId,ownerId,now})` 创建；`appendQueueEvent(journal,event,scope)` 校验并追加；`replayQueueJournal(journal,scope)` 仅重建数据，不重跑网页动作。
- `src/queue/repository.js`：`createSingleOwnerQueue({storage,key,workflowId,ownerId,scope,clock})`，只注入公开 getItem/setItem。`load()` 读取并恢复；`apply(event)` 保存后读回确认才返回状态；`snapshot()` 区分最后确认状态与存储 UNKNOWN。工厂本身不访问存储，未接实际用户库。
- 日志格式 `opendesk.webflow.queue.v1`，原始交接包在 enqueue 时按第一单元校验。事件原时间用于历史校验，不代表当前许可；新的 claim 重新检查交接准入期限。结果仅存原执行/resultId/哈希引用，不建权威结果库。
- 状态沿用产品合同：QUEUED → READY → LEASED → DISPATCH_INTENT → RUNNING → RESULT_PERSISTED → COMPLETED/FAILED；另有 WAITING_HOST/WAITING_AUTH/NEEDS_ATTENTION、UNKNOWN、CANCELLED。RESULT_PERSISTED 是待确认；COMPLETED 仅表示这一步结果已确认，不代表原聊天已交付。
- 重复 enqueue 相同交接只读原状态，篡改相同幂等键/重复 step 拒绝；依赖必须先登记且全部 COMPLETED 才能 ready。领取只能从 READY 一次进入；开始动作前必须已保存 DISPATCH_INTENT。
- 重启时 LEASED/DISPATCH_INTENT/RUNNING 保守变成 UNKNOWN，保留 claim/原执行身份；不再领取、自动重发或补建任务。只有已知原 executionId 的显式结果对账才可记入原结果；无可靠映射的 UNKNOWN 保持停止。
- 未开始时可取消；开始后的取消只登记 cancelRequested，不能伪称副作用已撤回。持久写入/读回不明时拒绝成功并封锁该实例后续写，重新 load 对账，不自动回滚或重试。
- 应用日志预算 128 KiB，不承诺底层真实配额；真实 AppStorage 权限/容量/安装接线仍 NOT_TESTED。多实例/宿主并发、原子 CAS、TTL/fencing、实际派发、UI 与长期常驻不支持。

最小实施计划：

- [x] 先写离线测试：交接保存→模拟中断→恢复 UNKNOWN→拒绝重领→原执行结果对账→唯一 COMPLETED，另验依赖、幂等、取消和存储失败。
- [x] 实现项目内纯日志/状态与可注入存储边界，无新的 SDK、Runner、真实任务库写入。
- [x] 跑本项目两个测试文件、语法与 diff；无浏览器/真实派发或根构建。

```sh
node --test projects/webflow/tests/*.test.mjs
node --check projects/webflow/src/queue/state.js
node --check projects/webflow/src/queue/repository.js
```


第二单元结果为 `SOURCE_IMPLEMENTED / COMPONENT_TESTED`：先观察缺模块失败，补执行身份复用用例后观察真实拒绝缺失，再修复；最终 11 个队列用例与 120 个交接用例共 131/131 PASS，两份队列源码语法检查通过。实际日志在本机 `artifacts/web-flow-20261101/queue-unit/`。

完成的是“保存元数据→中断→恢复 UNKNOWN→按原执行身份显式对账→唯一结果”离线链；未写用户实际 AppStorage、未验证真实安装/配额、未接任何执行器或聊天入口。COMPLETED 是应用元数据对已提供结果引用的确认，结果真伪仍需未来适配器/原执行权威核验。日志满时拒绝新事件并保留原历史，不自动压缩未结算记录。首次接线前必须由调用者保证单 owner 独占，不能用本实例 busy 标志或陈旧读检查承诺多宿主安全。

用户随后单独指定本轮 dev 复测使用本机 HR‑6.1 Sol/xhigh，已交回既有 native P0 owner；不由本队列模块启动模型/浏览器。全局模型/provider/安全配置不变。

## 现在可以从 ChatGPT 提示词启动队列吗？
+
+还不可以。本目录尚无正式安装/界面、原聊天触发适配器或真实派发，纯交接/队列模块不能被一段聊天提示词直接触发。当前可手测的是[已安装单任务入口](../../../examples/tasks/README.zh-CN.md)，完整提示词、实际安装身份和预批准步骤由 P0 owner 在 dev 复测后更新；旧已消费 candidate/许可不可重用。下一次队列集成仅允许明确两步与停止条件，不能把模型自由续答当无限循环。
