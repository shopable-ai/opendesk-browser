# Sidebar Tool 通用 AI bridge

安装包声明 `ai.generate`。仅已安装、有有效 installEpoch 的实例可用；只读开发预览拒绝真实 AI。沙箱通过原 `OpenDeskTool.request(operation, payload)` 调用，不提供密钥、Provider 配置或执行代码。

- `ai.info {}` → `{provider, endpoint, model, generation}`。本机 Provider endpoint 为 null。
- `ai.generate {requestId, request, instructions, context, providerGeneration}` → `{requestId, proposal, metadata, providerGeneration}`。providerGeneration 必须取自 ai.info；缺失、过期均拒绝。requestId 是 1–100 位字母数字、下划线、点或连字符，本实例不得重放。
- `ai.cancel {requestId}` → `{requestId, state: 'cancelled'|'completed'|'failed'|'unknown'}`。确认前取消（尚未派发）返回 cancelled，并经原 review cancel 链关闭对应可信审阅。派发后的 local_codex 取消等待 lease.cancelInference()：仅原回合明确 terminalStatus 映射为 completed/failed/cancelled；无请求关联的 IDLE（包括失败清理后无 active）不构成退休证明，不清除 unknown；未知或失败回执保留 unknown。已派发取消但终态未确认时，generate 以 E_AI_UNKNOWN 拒绝；超时仍以 E_AI_TIMEOUT 拒绝，不用 E_CANCELLED 暗示终态。后续查询原 requestId；只有真实回合终态证明才能解除 unknown。云端 Abort 仅停止本地交付，返回 unknown，不声称远端退休或未产生费用；即使本地 transport 已结束，当前实例仍拒绝新 generate，不自动重发。

每次 generate 由原可信确认 UI 展示实际 Provider、接收方和完整 request/instructions/context，真实用户点击后才发送。AI proposal 只是数据，应用自行验证、应用和保存；平台不加入业务 prompt。普通用户复用已配置 Provider，无需向沙箱提供密钥。

请求严格拒绝未知字段；request ≤4000 字符，instructions ≤10000 字符，context 必须为 JSON 对象，request/context 序列化总计 ≤20000 字符，proposal 序列化 ≤262144 字符。单实例单并发，最多记录 128 个请求；达到上限重新打开工具。Host 总超时 180 秒（含确认），沙箱 RPC 190 秒。超时报告 E_AI_TIMEOUT、状态 unknown，绝不自动重放；取消/切换/销毁后迟到结果不交付，旧工作或本地取消回执尚未收尾时拒绝新请求。

身份绑定真实安装代际、iframe instanceId 与共享 Provider generation。权限、安装身份与启用状态在 Host 检查；Provider 凭据、source 与 lease 来自可信 runtime。Provider 切换中止当前工作，工具销毁释放 lease。

metadata 的 turnId/status 取自真实 turn.completed 事件，threadId/sessionId/model 取自 lease planner snapshot（model 可回退当前可信配置）；缺失 ID 为 null、状态为 unknown，不推测成功。Provider 异常仅输出固定白名单 code 与有界安全文案，不转发原始错误或凭据。无浏览器或真实推理证据时不得据此声称 CHROME_NATIVE_PASS 或 95 分验收通过。

本机推理调用中断连且没有原回合关联 terminal 时，返回 E_AI_UNKNOWN 并保留原 requestId 锁；planner 清空 session 或后续 cancel 返回 IDLE 均不解除锁。确认前失败、local planner 输入准备拒绝仍记 failed，可用新 requestId 明确重试；不自动重发。

metadata 额外白名单透传 responseId、upstreamStatus、upstreamRequestId：仅接受 1–200 位字母数字及 `_ . : -`，缺失或不合规则为 null。不透传任意 Provider metadata、headers、凭据、原始错误或带认证信息的 URL。

安全错误文案仅可追加固定白名单内的原始错误 code，例如 `… (E_AI_CONSENT)`。Native failure 白名单为 `E_CODEX_UNSUPPORTED`、`E_CODEX_MISSING`、`E_CODEX_LOGIN_REQUIRED`、`E_CODEX_POLICY`、`E_MODEL_UNAVAILABLE`、`E_RATE_LIMITED`、`E_NETWORK`、`E_PROVIDER`；另允许 adapter 既有安全分类及可信 local planner 的固定 code：`E_WORKFLOW_ORIGIN`、`E_AI_INPUT_LIMIT`、`E_AI_CONSENT`、`E_AI_PROTOCOL`、`E_AI_EVENTS_GAP`、`E_AI_OUTCOME_UNKNOWN`、`E_AI_RESUME`、`E_AI_RESUME_SCOPE`、`E_AI_CONFIG`、`E_DOCUMENT_STALE`、`E_AI_DISCONNECTED`、`E_AI_RESPONSE`、`E_AI_TOOL_RESULT`、`E_AI_OBSERVATION_REQUIRED`、`E_AI_PROVIDER`。形状合法但不在白名单的 code 也不回显，普通未知错误降级 E_AI_PROVIDER。unknown 仍为 E_AI_UNKNOWN 并保持原请求锁；不透传原始 message、details、headers 或 credential。

metadata.usage 在桥边界仅投影 Responses 的 `input_tokens`、`output_tokens`、`total_tokens` 及 Chat Completions 的 `prompt_tokens`、`completion_tokens`，保留原字段名且仅接受非负安全整数（包括 0）。不转换、不补算；无有效计数返回 null。额外字段、嵌套 token details、credential、headers 均不传给沙箱。

## 独立 Chat 的职责与最小接入

AI Chat 是业务无关的公共能力，书签、采集等工具只是消费者。独立指职责、接口和生命周期清晰；继续复用现有固定 Shared UI、会话和 AI bridge，不要求单独仓库、搬目录或新建服务。本节是 Sidebar Tool 的公开接入入口；通用发现和开发流程见[唯一工作流](../../.agents/workflows/extension-creation.md#二-b发现与复用)，组件的精确签名见[下方展示合同](#沙箱复用-chat-展示)。

| 层 / 可复用边界 | 输入 → 输出 | 状态归属与生命周期 |
| --- | --- | --- |
| 公共展示 Frame | rows、draft、busy、阻断状态及回调 → 文本消息、输入、发送/停止事件 | 工具自己的 React Root；仅持有焦点/滚动/IME 等展示状态，随组件卸载释放；不发请求、不写业务 |
| 业务无关会话 | 展示 identity、rowsLimit、本地更新/round → 快照、订阅、过时回包检查 | 每个视图实例独立的内存 draft/rows/phase；无自动持久化、模型历史拼接或授权；由消费者稳定创建并 dispose |
| Provider / 推理及权限链 | 已批准 `ai.info/generate/cancel` 的载荷 → 安全配置投影、proposal/metadata 或原请求状态 | 真实安装身份、Provider generation、可信确认、凭据、lease、unknown 围栏归原 Host/runtime；沙箱不拥有这些状态 |
| 领域 adapter（工具自有） | 用户意图和最少业务上下文、AI proposal → 校验后的待审提案和显式应用结果 | 业务 prompt、上下文转换、提案校验、差异审阅、应用/保存及业务持久化留工具；不放进 Frame/session/通用 bridge |

公共层不要求书签树、CRUD、书签权限、业务 prompt 或专有 consumer 初始化。会话中的消息仅用于展示，不会自动成为下次模型输入；消费者自行选择允许发送的上下文，并由原可信 UI 审阅完整载荷。共享代码或消费者源码存在不等于目标 Browser 已更新：分别记录**源码导出、目标版本包含、实际运行、权限批准**。能力缺失时保留草稿并提示维护者核对目标版本，不复制私有组件作为兼容后门。local debug / 只读预览只验证展示，不可发送真实 AI。

普通作者为已有工具接入时，按以下最小路径完成，不需先阅读书签 App 或 Go：

1. **准备展示**：保留项目原构建；配置 `uiRuntime: "opendesk.react-ui.v1"`，在自己 Root 使用下方 Frame/session。每个 Chat 视图稳定创建一次 session，订阅后在卸载清理订阅并 `dispose()`；不要在每次 render 新建或跨消费者共用单例。`inputId` 在同一文档中唯一；展示 identity 每实例区分，不能冒充 Host 安装身份。未发送时也可独立使用展示与内存会话。
2. **接发送**：`onSend(event)` 保持原事件，先拒绝空白/重复/blocked；第一次 await（包括 `ai.info`）前取得工具自己的单并发锁。读取 info 后再以其 generation 建立 `session.begin({providerGeneration: info.generation})`，保存该轮的 requestId 和实例。以下仅示出已进入发送回调后的公共载荷；外围锁、错误和清理按本节处理，并非完整组件：

   ```js
   const info = await OpenDeskTool.request('ai.info', {});
   // 同一实例每个获准的新 round 使用唯一 ID；unknown 时不得开始新 round。
   const requestId = crypto.randomUUID();
   const payload = {
     requestId,
     request: '请为所选文本给出摘要提案',
     instructions: '仅返回摘要数据，不执行或保存任何操作',
     context: {text: '由本工具确认可发送的文本'},
     providerGeneration: info.generation
   };
   ```

   工具发送状态机调用 `const reply = await OpenDeskTool.request('ai.generate', payload)`；Host 仍展示完整载荷并等待真实确认。info 返回后、generate 前及回包时复查原实例/本地 round 仍有效；若准备阶段已停止或卸载，不能继续派发。回包须匹配 requestId 和 generation，并经该 round 的 `assertCurrent(reply.providerGeneration)` 后才更新展示/待审提案；此比较不主动读取实时 Provider，真实身份与当前 Provider 代际仍由 Host 校验。Frame 的 busy 防重复只是交互保护，不能取代请求锁。
3. **接停止与 unknown**：`onStop(event)` 使当前本地 round 失效，已提交 generate 的轮次调用 `await OpenDeskTool.request('ai.cancel', {requestId})`，只用原 requestId；不要在成功响应后自动 cancel。准备阶段尚未提交 generate 则停止本地准备即可。合并重复停止动作并等待真实回执；`unknown`、`E_AI_UNKNOWN` 或 `E_AI_TIMEOUT` 保留原请求围栏和禁止新发送状态，只查询/停止原请求，不自动重试或应用迟到结果。确认前取消与派发后退休的区别遵守上文 bridge 合同。`cancel/reset/dispose/finish()`、UI 关闭和本地 IDLE 均不清除 Host unknown。
4. **清理和显式应用**：round 完成时清理原锁与本地 busy，但 unknown 围栏单独保留，不能因 finally 解锁就恢复发送。卸载使旧 round 失效、释放订阅/监听与 Root，已派发请求按原取消/销毁链处理；异步清理完成不能向新实例写回。AI reply 先按工具 schema 和大小限制校验，再展示为待审数据；差异审阅、显式应用、命名保存和单独运行由业务决定，Chat 不直接写入业务数据或执行提案。

输入/消息、空白拒发、busy 防重复、Enter/Shift+Enter、IME、停止与清理由下方合同界定；不同消费者/实例的草稿、消息、请求和授权不得混用。实施 owner 只对本次变化运行相关交互、代际迟到回包、订阅释放及 bridge 权限/unknown 测试。纯文档检查不启动浏览器或推理；没有同候选证据的真实 AI、Chrome、安装、正式包与 production 均为 `NOT_TESTED`。

已有实现提供分层组合能力，当前没有承诺自动连接全部回调的沙箱 Chat 产品、统一持久化历史或私有 Provider 设置 API；这些不是普通接入的前置缺陷。遇到公开接口无法覆盖的具体行为，按工作流记录公开能力不足、复现、工具内为何不能解决、跨消费者价值、最小 API/文件/测试与安全影响；证据不足为 `SDK_GAP_NOT_PROVEN`，交对应平台 owner 后再决定实现，不靠复制领域 consumer 补洞。

## 沙箱复用 Chat 展示

已 opt-in `uiRuntime: "opendesk.react-ui.v1"` 的工具，可从固定 `OpenDeskSidebarUI` 使用 `SharedConversationFrame` 与 `createConversationSession`；预编译 JSX 继续将 `@opendesk/ui` 映射到该全局、React 映射到原固定 `OpenDeskPageReact`。它们只在工具自己的 opaque iframe / React Root 中运行，不挂入可信工作台。

```jsx
const {SharedConversationFrame, createConversationSession} = OpenDeskSidebarUI;
const session = createConversationSession({
  identity: {consumerId: 'my-tool', instanceId: 'view-1', hostInstanceId: 'local-view'},
  rowsLimit: 32
});
// 在工具组件内订阅；卸载时调用 session.dispose()。
const state = React.useSyncExternalStore(session.subscribe, session.getSnapshot);
<SharedConversationFrame
  rows={state.rows} draft={state.draft} busy={state.busy}
  inputId="my-chat-input" maxLength={4000} inputLabel="对话输入" stopLabel="停止对话"
  onDraftChange={draft => session.update({draft})}
  onSend={event => sendThroughApprovedBridge(event)}
  onStop={event => cancelThroughApprovedBridge(event)}
/>;
```

`SharedConversationFrame({open=true, rows=[], draft='', busy=false, blocked=false, inputDisabled=false, canSend=true, inputId, placeholder='描述要完成的操作', maxLength=4000, inputLabel='对话输入', stopLabel='停止对话', onDraftChange(value,event), onSend(event), onStop(event), ...presentationProps})` 返回 React 展示元素。`onSend` 保持原始事件签名；Enter 发送、Shift+Enter 换行，IME 组合输入不发送。busy / blocked / canSend 和空白草稿阻止发送；调用者仍负责请求单并发，可使用 `session.begin()` 或既有请求状态机与持久围栏；展示会话不能代替 Authority。可选 `intro/emptyPrompt/feedback/review/technical` 为工具自身 React 内容；日志/输入 ref、滚动和焦点 props 沿用既有 Frame。消息行为 `{id, speaker, message}`，speaker/message 通过 React 文本节点展示，不解析原始 HTML。

`createConversationSession({identity, rowsLimit=32})` 直接复用 `src/ui/conversation/session.js`，没有第二套存储。identity 的 `consumerId/instanceId/hostInstanceId` 均为非空、最多 160 字符的展示标识，`installEpoch` 可选字符串；**identity 不授权**，不能替代 Host 真实安装身份、iframe 实例或 Provider generation。rowsLimit 为 1–100；draft 截取 4000 字符，消息截取 3500 字符。session 只有内存状态，无持久化、凭据、Provider 或网络调用。

- `getSnapshot()` / `subscribe(listener)`（返回取消订阅函数）用于 React 订阅；`update({open,draft,rows,needsReview})`、`append(speaker,message)`（返回 row ID）、`replaceMessage(id,message)` 修改展示。
- `begin({signal?,providerGeneration?})` 返回 `{signal,assertCurrent(currentGeneration?),finish()}`；重复 begin 抛 `E_CONVERSATION_BUSY`。`setPhase(phase)` 仅改变本地阶段。
- `cancel()` 仅 abort 本地 signal，保持 busy，直到原 round `finish()`；它不等于 `ai.cancel`，也不证明推理终止。`assertCurrent()` 拒绝已取消/过时回包。`reset()` 重置本地展示并使旧 round 失效，`dispose()` 销毁订阅与展示；二者都不能解除 Host unknown 锁或证明远端退休。

工具负责把发送/停止接入上文 `ai.info/generate/cancel`，核对 Host 回执、保留 unknown 状态且不自动重放。不要以本地 finish/reset/cancel 表示真实推理已完成。local debug / 只读预览可使用展示组件，但仍不开放真实 AI。

Frame 从单一 `conversation-frame.css` 渲染固定 CSS 文本，与可信 Dock 共享原气泡、输入框和动作样式；不注入 Dock 布局、设置页或宿主整份 CSS，不新增 palette 或依赖。固定 runtime 仅新增这两个公开成员，不导出 `TrustedConversationWorkspace`、可信 Header Slot、Provider、业务 consumer、Authority 或 private config。
