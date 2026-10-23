# OpenDesk Browser 共享 AI Conversation R2.1 — 框架架构与消费者接入合同

> 范围：框架共享 AI Provider / Conversation 的**所有权与接入合同**，不是 Workflow 自动化算法合同。状态分为 DESIGN（设计）、SOURCE_IMPLEMENTED（源码接通）、VERIFIED（注明证据的验证）、NOT_TESTED（尚未执行）。源码与语法核对不等于 Chrome / Native 产品验收。本合同以实际 main 源码及后续经核验的提交为准。

## 1. 原始目标与不可漂移边界

用户从**当前业务界面**打开 AI 对话，以自然语言产生**业务专属、受限的计划**；只有原业务 Adapter / Service / Host 能根据独立确认和现有 Authority 执行。真实业务读回后更新原界面；AI 文字和 Provider 结果永不直接授予数据写入或脚本执行权限。

本合同覆盖框架共享 Provider、独立会话/线程和所有权；不替代以下正式业务：Bookmark Manager 的树/搜索/创建/移动/改名/引用/读回；Prompt Shortcuts 的搜索/创建/正文编辑/属性/启停/排序/删除/批量处理与私人正文审阅、ETag、草稿 Guard、Opaque iframe；「我的」的任务查询/运行/停止/历史/定时与确认；Workflow 的“自然语言先找已有固定 JavaScript 工作流→带参数复用→只有不匹配时规划→执行与核验”。原 HTML/CSS/JS、React、Vue 沙箱与现有 SDK / Authority / Host Dispatcher / Installer / Compiler / RunHost / Native 传输保持原 owner。不得新建第二套这些基础设施或平台级通用业务数据表。

## 2. CURRENT / TARGET 依赖关系

### R2.0 前遗留 CURRENT（源码审计事实）

~~~text
ToolShell / React Root
  ├─ WorkflowView (同时创建三个 createLocalCodexPlanner)
  │    ├─ workflow localPlanner ──► Workflow Provider Facade
  │    ├─ conversationPlanner ──► Bookmark + Prompt 共用结构化 Native thread
  │    └─ taskConversationPlanner ──► 「我的」
  ├─ Bookmark / Prompt trusted portal ──► WorkflowView.conversation
  └─ MyTaskAgent ──► WorkflowView.taskConversation
同一个 Host 注册身份；旧 close(null) 可能关闭此 Host 的全部 Native 会话。
~~~

上图的业务功能已有源码，并**不代表**跨消费者会话隔离已经成立。不能把“同一个 Provider 接口”解释为“同一个 Native thread 可以跨业务共享”。

### R2.1 TARGET（代码落点）

~~~text
ToolShell (唯一可信宿主和 Provider Runtime owner；其 pagehide 释放)
  │
  ├─ Shared AI Provider Runtime [src/ui/ai/provider-runtime.js]
  │    ├─ memory-only Provider configuration / generation
  │    ├─ Workflow Lease ──► WorkflowView (仅 Workflow 业务)
  │    ├─ Bookmark Lease ──► Bookmark Consumer Adapter ──► Bookmark Service/Host
  │    ├─ Prompt Lease ──► Prompt Consumer Adapter ──► Prompt Model/Host
  │    ├─ Prompt-edit Lease ──► 同一提示词业务内、单独 Native thread
  │    └─ My tasks Lease ──► MyTaskAgent ──► 原 Task/Scheduler/RunHost
  │
  ├─ React Root / Chat UI：呈现和用户交互；不成为业务写入 Authority
  ├─ Trusted business admission：官方来源、安装身份、enable、epoch
  └─ Existing Host Client ──► existing Workflow Provider Facade
        ├─ Native local Codex [existing local-codex.js; one session per Lease]
        ├─ Cloud Responses [existing responses.js]
        └─ Custom HTTPS [existing ai-plan.js]
                     └─ existing single Native Host / Host Dispatcher
~~~

架构依赖向下：业务 UI → Consumer Adapter → Provider Lease → 现有 Provider Facade/传输；模型输出 → 业务 Schema 验证 → 原业务 Service/Host → 独立读回。Host/SDK/安装授权不反向依赖 WorkflowView 或 Bookmark Manager。原业务的 Composer、历史状态与 React Frame 并未在 R2.1 全部统一；其所有权目标归 R2.2–R2.6。

## 3. 明确的所有权

| 模块 | 唯一职责 | 不得拥有 |
| --- | --- | --- |
| ToolShell | 建立/销毁共享 Runtime，签发可信 Host 和官方安装实例标识 | 模型内容、业务写入结果、动态工具特权 |
| Provider Runtime | 配置（内存）、generation、独立 Lease / Native Planner、迟到结果栅栏 | 业务 Schema、DOM、永久 API Key、业务用户确认 |
| Existing Provider Facade | Local Codex/Responses/HTTPS 请求及能力合同；保留 createWorkflowProviderFacade 兼容入口 | 书签树、Prompt 数据、Task/RunHost |
| Consumer Adapter | 每实例状态、草稿/消息引用、受限业务指令、源站 Provider 授权、Stop | 别的业务授权/会话/Native thread |
| React Chat / trusted frame | 单一可信 React Root 的交互、显示和无特权状态 | 安装权限、Host 直接写入 |
| Business Service / Host | 唯一业务验证、用户确认、写入、ETag/任务 Revision、回执读回 | 依赖 AI 回答声称成功 |
| Native Host | 既有同一个 Native owner、Codex Session/turn 协议、Session/turn ID 验证 | 利用无 sessionId 关闭某个消费者时关闭整个 owner |

ToolShell 配置 Runtime，但当前**设置控件仍位于 Workflow 页面**：设置输入经可信回调调用 Runtime.configure，不允许 Runtime 读取 Workflow DOM。设置 UI 的框架级归位与共享 Chat Frame 是后续阶段；不能在 R2.1 中谎称完成。

## 4. 中立身份与 Lease 合同

最小身份字段：consumerId、instanceId、hostInstanceId、installEpoch（可空）、providerGeneration。实际 Native sessionId/threadId/turnId 仅归该 Lease 所拥有的 Native Planner，不以 consumerId 字符串寻找全局可重用线程。

契约见 src/ui/ai/provider-runtime.js：

~~~text
createSharedAIProviderRuntime({ client, hostInstanceId })
  .configure({ source, endpoint, model, apiKey })    // volatile
  .configuration()
  .acquire({ consumerId, instanceId, hostInstanceId, installEpoch })
    .identity()
    .requestStructured(input)                        // consumer inference only
    .generateWorkflow(input)                         // Workflow only by usage contract
    .cancelInference()
    .dispose()
  .dispose()
~~~

一个完整身份在存续期间至多签发一次 Lease。即使 consumerId 相同，不同实例/安装代际仍不同。配置变化增加 generation、使在途请求和旧 Native 会话无效；迟到回执不能晋升为新实例/新授权。Native 限制是**同一个 Sidebar Host 最多 4 个活动 Native sessions**（当前 src/native-agent/workflow-ai-service.js 限制）；更多同时活动请求返回既有 E_AI_LIMIT/BUSY，不共享线程，也不静默重试。

对每个 Lease，plannerFactory 创建**独占的**现有 createLocalCodexPlanner。正常关闭只使用精确 sessionId；开始开会话后发生取消/关闭时，收到的迟到 open 回执也只按其真实 sessionId 清理。全 Host 关闭由既有 Host 生命周期管理，不由单个消费者触发。

## 5. 消费者矩阵与隔离维度

| 消费者 | UI / Adapter owner | AI 作用域 | 写入与读回 owner | 生命周期 |
| --- | --- | --- | --- | --- |
| Bookmark Manager | 官方可信 React，bookmark-instructions.js，provider-consumer.js | bookmark，独立 Lease | 既有 Bookmark SDK / Service、真实书签树与引用核验 | 官方实例 token + installEpoch；退出即销毁 |
| Prompt Shortcuts | 可信 Prompt Chat + 不变的 opaque iframe，prompt-actions.js，provider-consumer.js | prompt / prompt-edit **两个独立 Lease** | 原 Prompt Host/Model/ETag，私人正文另行审阅、write/readback | 官方实例 token + installEpoch；失败 admission 也释放 |
| 「我的」 | MyTaskAgent，my-task-instructions.js，provider-consumer.js | tasks，独立 Lease | 原 Task/Scheduler/RunHost、确认/历史/UNKNOWN | ToolShell 的 My Agent 实例；pagehide 释放 |
| Workflow | workflow-view.js，workflow/provider.js | workflow，独立 Lease | 原 Compiler/RunHost、Observation、复用路由/核验 | WorkflowView 自有 Lease；pagehide 释放 |

消息、草稿、引用、取消信号均绑定对应 Consumer Adapter，不能因为使用相同 Provider config 或 Chat Frame 而互相混合；Native thread 不共享。Workflow 与「我的」不能获得书签/提示词模型历史。React UI 的 display-only 快照不会携带可执行书签对象 ID。已有认证安装代际和业务数据命名空间不变；不在 Provider Runtime 内持久化模型密钥/原始网页内容/私有正文。

## 6. 授权、用户手势与模型数据外发

1. 权限仍由原 Chrome Authority 管理。缺失 Provider HTTPS origin 权限时，只在用户可信 Send/Confirm **同步开始** permissions.request，第一次 await 后绝不新发 Chrome 请求。continuation 使用 contains 校验，不能借旧 gesture 扩权。
2. 现有有效权限可复用，但原 Prompt 私人正文发送前必须额外审阅这次精确的正文/接收方；分类请求不能偷偷携带完整私人库，Prompt edit 仅在该消费者明确上下文内使用。
3. 每次生成前冻结来源/endpoint/model/generation；在任何写入前由授权对象 assertWrite 复查 Provider 权限、当前实例、撤权状态。Provider 回答永远不是 Service/Host 写权限。
4. 撤权引起的当前业务推理取消不应取消其他消费者的线程。原来的网页 Observation grant 仍绑定 site/document/对话/接收方/时限，不因共享 Runtime 扩大范围。
5. SDK/Chrome/原安装身份和沙箱 admission 保持不变。第三方 iframe / HTML / Vue / React 自定义工具不得通过引用可信 Runtime 获得未经批准的权限。

## 7. Stop、部分结果、UNKNOWN 和恢复

- AI Stop：只取消该 Lease 的推理与在途请求；不得替代业务执行器 Stop 或发无 sessionId 的 Native close。Native 终态无法确认时，保留 OUTCOME_UNKNOWN，不盲目重发。
- RunHost Stop：由原执行链停止已获准 Controller/Workflow，业务效果可能已部分发生。模型推理停止**不能**宣称网页写入已撤销。
- 旧 Provider / instance / installEpoch / 授权 / target 切换：增加代次/撤销 Lease；旧响应不成为新会话写入依据；跨会话读回必须使用原 Host Revision、resultId 与业务事实。
- 恢复：只能恢复同一 Lease 持有的 Native Session 且通过原 Native resume 能力、权限和身份核对。绝不使用另一消费者 threadId。不可恢复则明确开始新会话。
- Prompt ETag 冲突、保存 ACK 丢失、UNKNOWN、未保存草稿等继续由原 Prompt Host/Model 决定；本阶段不新建一套恢复数据库。

## 8. 文件与迁移进度（以实际提交和验收为准）

| 路径 | 本轮目标/状态 |
| --- | --- |
| src/ui/ai/provider-runtime.js | SOURCE_IMPLEMENTED：唯一共享 Runtime、配置代次、Lease、独占 Native Planner、结果栅栏 |
| src/ui/workflow/local-codex.js | SOURCE_IMPLEMENTED：单消费者关闭不得触发 owner-wide close；沿用 Native 协议 |
| src/ui/workflow/workflow-view.js | SOURCE_IMPLEMENTED：Workflow 只持有 Workflow Lease；保留 standalone 老测试的兼容工厂 |
| src/ui/conversation/provider-consumer.js | SOURCE_IMPLEMENTED：业务消费者各自授权、会话状态、Stop、Lease 与生命周期 |
| src/ui/conversation/bookmark-instructions.js | SOURCE_IMPLEMENTED：Bookmark 限权计划归 Bookmark Adapter |
| src/ui/conversation/my-task-instructions.js | SOURCE_IMPLEMENTED：My Task 限权计划归 My Adapter |
| src/ui/tool-shell.js | SOURCE_IMPLEMENTED：Runtime 创建/释放，安装实例 Lease，My Agent 接入 |
| src/ui/sidebar-tools.js | SOURCE_IMPLEMENTED：官方安装 token 和 epoch 传入消费者，不更换 Sandbox/Host |
| src/ui/workflow/provider.js、responses.js、ai-plan.js | 不重写，维持传输合同及 createWorkflowProviderFacade 兼容入口 |
| src/ui/react/main.tsx、业务 Service / Host | 保留原 React Root、页面装载、opaque iframe、写入与独立读回职责 |
| tests/environment/shared-ai-provider-runtime-r21.test.mjs | 源码加入定向隔离/失效/精确关闭测试；实际 Node 测试等级单独记录 |

状态说明：本表的 SOURCE_IMPLEMENTED 表示本轮代码候选写入了相应路径，不表示 Node 测试、Chrome、Native Codex 或升级已经通过。静态语法分析属于限定验证，不升级为真实业务验收。

## 9. 独立验证门槛

- PROVIDER_LEASE：不同 consumer/instance/edit 的会话 identity、Native thread、模型历史互异；同 Lease 内续聊正确；关闭/Stop 不影响其他 Lease。
- PROVIDER_STALE：配置/endpoint/model/installEpoch/实例变化、撤权、取消后旧结果不能交付或写入；Native session.open 迟到只精确关闭自己；Native 同时会话超限 fail-closed。
- AUTHORITY：真实 Send/Confirm 手势、Provider permission recheck、Prompt 私人正文外发审阅、ETag、Host 读回、UNKNOWN 未自动重放。
- COMPATIBILITY：Bookmark 搜索/创建/修改、Prompt opaque iframe、My Task/Schedule、Workflow reuse → fallback plan → RunHost、旧 facades、HTML/React/Vue 工具不回退。
- PRODUCT：上述必须以新候选 SHA 绑定的 Chrome、Native、正式安装升级证据分别记录；未执行一律 NOT_TESTED，不将设计/源码/Node 假报 PASS。

## 10. R2.2–R2.7 实施入口和退出条件

R2.2 抽出中立 Conversation Session、共享 Chat Frame、通用 Provider 设置视图；不把业务权限搬入 Frame。R2.3 Bookmark 完整迁移、清除任何框架默认书签对象 ID。R2.4 Prompt 迁移，保留原 opaque iframe/ETag/私人正文审阅。R2.5 「我的」迁移，消除多套聊天面板/状态机。R2.6 Workflow 使用同一对话合同，但 Compiler/RunHost/脚本复用仍由 Workflow 拥有。R2.7 只有在真实消费者转换且对应回归通过后，才删测试兼容工厂和旧状态 UI，完成 Node、Chrome、Native、正式包独立验收。

**R2.1 退出条件**：ToolShell 实际持有 Runtime；WorkflowView 不创建其他业务 Provider；正式消费者独立 Lease/thread，旧 close 不误杀同 Host 会话；相关定向代码和权威文档同 SHA 保存。没有完成真实 Chrome/Native/升级验收时不得标正式产品 PASS。

## 11. 文档权威分工与源证据

本文件是**共享 AI Conversation 所有权与消费者接入的唯一架构合同**。workflow-ai-provider-routing-r2.zh-CN.md 仍负责 Workflow 专用 Provider 传输、Native 探测、Workflow Observation/Compiler/RunHost 协议；react-ui-shared-components-r33.zh-CN.md 仍负责统一 React Root 和 UI 边界。三者不可互相覆盖。

原 R2.0 证据线索：fc4e6238d2ad33e737307c2ca10e0f10202486b1、079f25d2cfce33613b9fedb6c9a3f055cf6a6b26；本轮实际读取的 main 及提交 SHA 需在执行记录注明。源码证据定位：ToolShell、workflow-view.js、workflow/provider.js、workflow/local-codex.js、native-agent/workflow-ai-service.js、react/main.tsx、sidebar-tools.js、conversation/prompt-controller.js。**NOT_TESTED**：Mac 本地 Chrome、真实 Native Codex/多线程、安装升级、长时复杂操作；没有对应新候选收据前不提升状态。


## R2.2 共享 AI Frame 与设置入口（SOURCE_IMPLEMENTED；正式验收另计）

- 公共 React `SharedConversationFrame`（`src/ui/react/components/conversation.tsx`）统一消息列表、输入、IME、Enter/Shift+Enter、Stop、焦点、滚动及交互语义。接受业务方 `intro`/`feedback`/`review`/`technical` 展示槽；不持有 bookmarkId、promptId、taskId、scheduleId 或 Workflow 执行身份。
- `my-agent.tsx` 复用同一个 Frame；真实任务查询、运行、必要确认、Scheduler CAS 和结果读回继续属于原 `MyTaskAgent`、Task/Scheduler Host。
- Bookmark、Prompt 继续挂载原 `TrustedConversationWorkspace`，但实际消息与输入由共享 Frame 渲染。Bookmark/Prompt 阶段文案由入口 `phaseLabels` 提供；原书签 Service 与 Prompt opaque iframe、Host/ETag、草稿 Guard 和敏感正文外发审阅保留。
- `SharedProviderSettingsSheet` 是单一可信 React Root 的 Portal。Bookmark、Prompt、「我的」、Workflow 均通过唯一可信 ToolShell 注入的脱敏 `providerSettings` Facade 打开共享 Provider 设置（仅 `settingsSnapshot/subscribeSettings/updateSettings` 三项能力，不向 React 提供 `configuration()` 的密钥或 `acquire()` 的推理权限），不再依赖 Workflow Controller 作为入口。保存调用 `SharedAIProviderRuntime.updateSettings`，敏感 Key 仍仅存原 Runtime 内存；公开 `settingsSnapshot/subscribeSettings` 绝不返回 Key。 原 Native Codex 本机连接设置页由 ToolShell 传入已有受控 Chrome 打开动作，需当前用户可信点击，不另建连接或授权系统。原权限和 Host 系统均不复制，设置可以直接从当前业务打开。 Workflow 在 Native/Provider 错误恢复调用旧 `openAISettings` 时，正式 ToolShell 注入 `openAIProviderSettings` 转接到同一共享面板；standalone 测试仍保留原设置控件。
- **剩余边界**：共享 Provider 设置的字段和入口已由可信 Frame/Runtime 直接拥有；Workflow 仍保留自身历史设置控件/Native 诊断与网页摘要授权业务，仅在 standalone 兼容场景展示老设置页，在正式 ToolShell 场景监听共享 Runtime 并同步自己的控制快照。Workflow 对话当前保留业务页 Composer（复用公共 Transcript/Input），尚未完整迁入公共 Frame；原页面执行/RunHost 不可因此改写。
- 源码定向保护：`tests/environment/shared-ai-conversation-r22.test.mjs`（含 Runtime 配置代次/密钥遮蔽/消费者隔离）。只有实际执行测试、构建、Chrome/Native/安装升级并保存对应候选证据，才可将其提升为 VERIFIED；否则均 `NOT_TESTED`。
