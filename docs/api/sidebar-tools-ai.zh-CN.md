# Sidebar Tool 通用 AI bridge

安装包声明 `ai.generate`。仅已安装、有有效 installEpoch 的实例可用；只读开发预览拒绝真实 AI。沙箱复用原 `OpenDeskTool.request(operation, payload)` 与 `OpenDeskTool.prepareAI(factory)`，不提供密钥、Provider 配置或执行代码。

- `ai.info {}` → `{provider, endpoint, model, generation}`。本机 Provider endpoint 为 null。
- `ai.generate {requestId, request, instructions, context, providerGeneration}` → `{requestId, proposal, metadata, providerGeneration}`。providerGeneration 必须取自 ai.info；缺失、过期均拒绝。requestId 是 1–100 位字母数字、下划线、点或连字符，本实例不得重放。
- `ai.cancel {requestId}` → `{requestId, state: 'cancelled'|'completed'|'failed'|'unknown'}`。授权检查期间取消（尚未派发）返回 cancelled，不派发推理。派发后的 local_codex 取消等待 lease.cancelInference()：仅原回合明确 terminalStatus 映射为 completed/failed/cancelled；无请求关联的 IDLE（包括失败清理后无 active）不构成退休证明，不清除 unknown；未知或失败回执保留 unknown。已派发取消但终态未确认时，generate 以 E_AI_UNKNOWN 拒绝；超时仍以 E_AI_TIMEOUT 拒绝，不用 E_CANCELLED 暗示终态。后续查询原 requestId；只有真实回合终态证明才能解除 unknown。云端 Abort 仅停止本地交付，返回 unknown，不声称远端退休或未产生费用；即使本地 transport 已结束，当前实例仍拒绝新 generate，不自动重发。

普通 Chat 点击发送后直接使用当前保存的 Provider，不再弹出逐次发送审阅或要求第二次确认。在实际发送点击或非 IME、非 Shift 的 Enter 回调中，第一次 await 前同步调用 `OpenDeskTool.prepareAI(factory)`，桥接消费一次真实原生事件，并沿已有闭包私有 MessagePort 派发一个请求。factory 可异步读取本工具的待处理锁与 `ai.info`，须在 8 秒内返回完整 generate payload；准备阶段停止则返回 null，桥接不发送。无有效事件拒绝 `E_AI_GESTURE`；准备超时、失败或实例销毁拒绝 `E_AI_PREPARE`（factory 失败保留 cause），明确尚未派发。准备失败仍须收尾可能在途的本工具存储操作，不能丢弃未知的锁写入。

已派发后的桥接断连、超时或回执丢失为 `E_AI_UNKNOWN`，保留原 requestId 并禁止自动重发。私有端口与凭据不向工具暴露；公开消息、payload 手势标记和父页面短时 userActivation 均不授权，Host 对未沿本实例私有端口的 generate 拒绝 `E_USER_GESTURE_REQUIRED`。已在真实事件内持有完整 payload 的同步 `request('ai.generate', payload)` 也复用同一单次门禁；异步准备须使用 prepareAI，缺少该能力时保留草稿并提示更新 Browser，不回退后台发送。上述门禁不替代已安装 ai.generate 能力、安装/启用/实例及 Provider generation 检查；原安装审核、新能力授权和 AI 设置入口保留。AI proposal 只是数据，应用自行验证、应用和保存；平台不加入业务 prompt。普通用户复用已配置 Provider，无需向沙箱提供密钥。

请求严格拒绝未知字段；request ≤4000 字符，instructions ≤10000 字符，context 必须为 JSON 对象，request/context 序列化总计 ≤20000 字符，proposal 序列化 ≤262144 字符。单实例单并发，最多记录 128 个请求；达到上限重新打开工具。Host 总超时 180 秒（含授权检查），沙箱 RPC 190 秒。超时报告 E_AI_TIMEOUT、状态 unknown，绝不自动重放；取消/切换/销毁后迟到结果不交付，旧工作或本地取消回执尚未收尾时拒绝新请求。

身份绑定真实安装代际、iframe instanceId 与共享 Provider generation。权限、安装身份与启用状态在 Host 检查；Provider 凭据、source 与 lease 来自可信 runtime。Provider 切换中止当前工作，工具销毁释放 lease。

metadata 的 turnId/status 取自真实 turn.completed 事件，threadId/sessionId/model 取自 lease planner snapshot（model 可回退当前可信配置）；缺失 ID 为 null、状态为 unknown，不推测成功。Provider 异常仅输出固定白名单 code 与有界安全文案，不转发原始错误或凭据。无浏览器或真实推理证据时不得据此声称 CHROME_NATIVE_PASS 或 95 分验收通过。

本机推理调用中断连且没有原回合关联 terminal 时，返回 E_AI_UNKNOWN 并保留原 requestId 锁；planner 清空 session 或后续 cancel 返回 IDLE 均不解除锁。派发前授权检查失败、local planner 输入准备拒绝仍记 failed，可用新 requestId 明确重试；不自动重发。

metadata 额外白名单透传 responseId、upstreamStatus、upstreamRequestId：仅接受 1–200 位字母数字及 `_ . : -`，缺失或不合规则为 null。不透传任意 Provider metadata、headers、凭据、原始错误或带认证信息的 URL。

安全错误文案仅可追加固定白名单内的原始错误 code，例如 `… (E_AI_CONSENT)`。Native failure 白名单为 `E_CODEX_UNSUPPORTED`、`E_CODEX_MISSING`、`E_CODEX_LOGIN_REQUIRED`、`E_CODEX_POLICY`、`E_MODEL_UNAVAILABLE`、`E_RATE_LIMITED`、`E_NETWORK`、`E_PROVIDER`；另允许 adapter 既有安全分类及可信 local planner 的固定 code：`E_WORKFLOW_ORIGIN`、`E_AI_INPUT_LIMIT`、`E_AI_CONSENT`、`E_AI_PROTOCOL`、`E_AI_EVENTS_GAP`、`E_AI_OUTCOME_UNKNOWN`、`E_AI_RESUME`、`E_AI_RESUME_SCOPE`、`E_AI_CONFIG`、`E_DOCUMENT_STALE`、`E_AI_DISCONNECTED`、`E_AI_RESPONSE`、`E_AI_TOOL_RESULT`、`E_AI_OBSERVATION_REQUIRED`、`E_AI_PROVIDER`。形状合法但不在白名单的 code 也不回显，普通未知错误降级 E_AI_PROVIDER。unknown 仍为 E_AI_UNKNOWN 并保持原请求锁；不透传原始 message、details、headers 或 credential。

metadata.usage 在桥边界仅投影 Responses 的 `input_tokens`、`output_tokens`、`total_tokens` 及 Chat Completions 的 `prompt_tokens`、`completion_tokens`，保留原字段名且仅接受非负安全整数（包括 0）。不转换、不补算；无有效计数返回 null。额外字段、嵌套 token details、credential、headers 均不传给沙箱。

## 独立 Chat 的职责与最小接入

AI Chat 是业务无关的公共能力，书签、采集等工具只是消费者。独立指职责、接口和生命周期清晰；继续复用现有固定 Shared UI、会话和 AI bridge，不要求单独仓库、搬目录或新建服务。本节是 Sidebar Tool 的公开接入入口；通用发现和开发流程见[唯一工作流](../../.agents/workflows/extension-creation.md#二-b发现与复用)，组件的精确签名见[下方展示合同](#沙箱复用-chat-展示)。

| 层 / 可复用边界 | 输入 → 输出 | 状态归属与生命周期 |
| --- | --- | --- |
| 公共展示 Frame | rows、draft、busy、阻断状态及回调 → 文本消息、输入、发送/停止事件 | 工具自己的 React Root；仅持有焦点/滚动/IME 等展示状态，随组件卸载释放；不发请求、不写业务 |
| 业务无关会话 | 展示 identity、rowsLimit、本地更新/round → 快照、订阅、过时回包检查 | 每个视图实例独立的内存 draft/rows/phase；无自动持久化、模型历史拼接或授权；由消费者稳定创建并 dispose |
| Provider / 推理及权限链 | 已批准 `ai.info/generate/cancel` 的载荷 → 安全配置投影、proposal/metadata 或原请求状态 | 真实安装身份、Provider generation、真实发送手势、凭据、lease、unknown 围栏归原 Host/runtime；沙箱不拥有这些状态 |
| 领域 adapter（工具自有） | 用户意图和最少业务上下文、AI proposal → 校验后的待审提案和显式应用结果 | 业务 prompt、上下文转换、提案校验、差异审阅、应用/保存及业务持久化留工具；不放进 Frame/session/通用 bridge |

公共层不要求书签树、CRUD、书签权限、业务 prompt 或专有 consumer 初始化。会话中的消息仅用于展示，不会自动成为下次模型输入；消费者自行选择允许发送的上下文，普通发送直接使用已保存来源，不经额外审阅。共享代码或消费者源码存在不等于目标 Browser 已更新：分别记录**源码导出、目标版本包含、实际运行、权限批准**。能力缺失时保留草稿并提示维护者核对目标版本，不复制私有组件作为兼容后门。local debug / 只读预览只验证展示，不可发送真实 AI。

普通作者为已有工具接入时，按以下最小路径完成，不需先阅读书签 App 或 Go：

1. **准备展示**：保留项目原构建；配置 `uiRuntime: "opendesk.react-ui.v1"`，在自己 Root 使用下方 Frame/session。每个 Chat 视图稳定创建一次 session，订阅后在卸载清理订阅并 `dispose()`；不要在每次 render 新建或跨消费者共用单例。`inputId` 在同一文档中唯一；展示 identity 每实例区分，不能冒充 Host 安装身份。未发送时也可独立使用展示与内存会话。
2. **接发送**：`onSend(event)` 保持原事件，先拒绝空白/重复/blocked；第一次 await（包括 `ai.info`）前取得工具自己的单并发锁并调用 prepareAI。读取 info 后再以其 generation 建立 `session.begin({providerGeneration: info.generation})`，保存该轮的 requestId 和实例。以下仅示出已进入发送回调后的公共载荷；外围锁、错误和清理按本节处理，并非完整组件：

   ```js
   // 同一实例每个获准的新 round 使用唯一 ID；unknown 时不得开始新 round。
   const requestId = crypto.randomUUID();
   const reply = await OpenDeskTool.prepareAI(async () => {
     const info = await OpenDeskTool.request('ai.info', {});
     if (!isCurrentRound()) return null; // 本工具检查停止/卸载
     return {
       requestId,
       request: '请为所选文本给出摘要提案',
       instructions: '仅返回摘要数据，不执行或保存任何操作',
       context: {text: '由本工具确认可发送的文本'},
       providerGeneration: info.generation
     };
   });
   ```

   `isCurrentRound()` 由工具原有发送状态机提供，不是公共 SDK。Host 核验本次真实事件、私有实例端口和当前授权后直接派发，不展示逐次确认。info 返回后、generate 前及回包时复查原实例/本地 round 仍有效；若准备阶段已停止或卸载，不能继续派发。null 回包不应用内容；非 null 回包须匹配 requestId 和 generation，并经该 round 的 `assertCurrent(reply.providerGeneration)` 后才更新展示/待审提案；此比较不主动读取实时 Provider，真实身份与当前 Provider 代际仍由 Host 校验。Frame 的 busy 防重复只是交互保护，不能取代请求锁。
3. **接停止与 unknown**：`onStop(event)` 使当前本地 round 失效，已提交 generate 的轮次调用 `await OpenDeskTool.request('ai.cancel', {requestId})`，只用原 requestId；不要在成功响应后自动 cancel。准备阶段尚未提交 generate 则停止本地准备即可。合并重复停止动作并等待真实回执；`unknown`、`E_AI_UNKNOWN` 或 `E_AI_TIMEOUT` 保留原请求围栏和禁止新发送状态，只查询/停止原请求，不自动重试或应用迟到结果。派发前取消与派发后退休的区别遵守上文 bridge 合同。`cancel/reset/dispose/finish()`、UI 关闭和本地 IDLE 均不清除 Host unknown。
4. **清理和显式应用**：round 完成时清理原锁与本地 busy，但 unknown 围栏单独保留，不能因 finally 解锁就恢复发送。卸载使旧 round 失效、释放订阅/监听与 Root，已派发请求按原取消/销毁链处理；异步清理完成不能向新实例写回。AI reply 先按工具 schema 和大小限制校验，再展示为待审数据；差异审阅、显式应用、命名保存和单独运行由业务决定，Chat 不直接写入业务数据或执行提案。

输入/消息、空白拒发、busy 防重复、Enter/Shift+Enter、IME、停止与清理由下方合同界定；不同消费者/实例的草稿、消息、请求和授权不得混用。实施 owner 只对本次变化运行相关交互、代际迟到回包、订阅释放及 bridge 权限/unknown 测试。纯文档检查不启动浏览器或推理；没有同候选证据的真实 AI、Chrome、安装、正式包与 production 均为 `NOT_TESTED`。

已有实现提供分层组合能力，当前没有承诺自动连接全部回调的沙箱 Chat 产品、统一持久化历史或私有 Provider 设置 API；这些不是普通接入的前置缺陷。遇到公开接口无法覆盖的具体行为，按工作流记录公开能力不足、复现、工具内为何不能解决、跨消费者价值、最小 API/文件/测试与安全影响；证据不足为 `SDK_GAP_NOT_PROVEN`，交对应平台 owner 后再决定实现，不靠复制领域 consumer 补洞。

### 当前消费者与可信接线边界（2026-11-03）

以下区分源码职责与运行证据；`import` 公共组件只能证明接线，不能证明已加载版本、样式、设置往返或业务执行正确。

| 公共能力 | 实际消费者 / 入口 | 状态归属与领域依赖 | 证据与待验证项 |
| --- | --- | --- | --- |
| Dock / Frame / 内存 session | 书签的 `TrustedConversationWorkspace`；ScrapyJS 正式 `src/AiPanel.jsx` | 各视图实例独立草稿、消息和 round；公共 Frame/session 无领域 import | `src/ui/react/components/conversation.tsx`、`src/ui/conversation/session.js`、`src/entrypoints/sidebar-shared-ui.js`；ScrapyJS 离线预览刻意显示占位，不能作为正式 Chat 证据 |
| 可信会话编排 | 书签、Prompt、任务、知识问答各自构造策略 | 通用核心持有 lease、权限、Provider generation、取消、订阅和迟到围栏；提示词、refs 格式、续轮预算和特定授权留可信消费者 | `src/ui/conversation/provider-consumer.js` 与 `src/ui/tool-shell.js`；这些策略不导出到沙箱，不授予业务写权限 |
| 唯一 Provider Runtime / 设置 | 可信与沙箱公共 Dock 内的设置入口；Host 持有唯一设置面板 | 来源、Endpoint、模型、凭据属于可信 Shell；工具仅获得安全 info 投影 | `src/ui/ai/provider-runtime.js`、`src/ui/react/components/provider-settings.tsx`、`src/ui/react/tabs/tool-host.tsx`；沙箱与可信入口差异源自信任边界，不需要复制设置表单 |
| 沙箱 AI bridge | 已声明 `ai.generate` 的 ScrapyJS 安装实例 | 真实发送手势、安装代际、撤权及 unknown 归原 Host；提案校验与 `business.config.propose/apply` 归 ScrapyJS | `examples/sidebar-tools/scrapyjs/src/AiPanel.jsx`、`src/business-api.js`；源码验证不证明最新源码已安装或真实推理成功 |
| Cookie Editor 当前正式入口 | `app/entries/official.jsx` → `CookieEditorApp` | 未声明 `ai.generate`，未发现 Dock/Frame/session 或 Chat bridge 接线；“AI 账号额度管理”和 Cookie 权限是其他功能 | `examples/sidebar-tools/cookie-editor/tool.config.json`、`app/components/CookieHttpConnections.jsx`、`ai-account-usage/web/main.jsx`；用户记忆中的历史 Chat 版本仍未知，不据此新增 AI 或读取凭据 |

开合、卸载和请求退休需分开：Dock 收起保留挂载；卸载销毁本地 session。书签在 Shell 中按同一 installEpoch 缓存展示用草稿/消息供重开，重置 refs 和 needsReview，原 conversation/lease 已销毁；这不是跨扩展模型历史或授权共享。ScrapyJS 展示 session 随实例销毁，但原 `ai-pending` 持久围栏可在重开后恢复 unknown，只处理原 requestId。可信编排与沙箱请求状态机因信任边界保留不同接线；它们复用公共展示和本地会话规则，不合并业务持久化或推理授权。

可信平台维护者从 `src/ui/tool-shell.js` 的现有构造入口接线：`createBusinessConversation` 必须收到静态可信 `policy`。`policy.scopes` 显式声明每个作用域的 instructions，可按实际业务声明 continuation、deadlineMs/deadlineMessage；`policy.refs.empty/normalize` 只处理该消费者的引用投影。书签策略在 `bookmark-instructions.js`，Prompt 策略在 `prompt-actions.js`，任务策略在 `my-task-instructions.js`。知识问答从项目 `projects/ai-knowledge-answers/trusted/ai-request.js` 的 `createKnowledgeConversation` 接入，特定本地测试批准留该可信 adapter。公共核心不按 consumerId 导入领域提示词或解释业务结果，未声明 scope 一律拒绝。Provider Runtime 接受有界的可信消费者标识，标识本身不授权；原 SDK、Host、Authority、安装与真实用户手势链继续适用。

普通沙箱工具只走下方公开组件和 `ai.info/generate/cancel`，无需接触这些可信 policy。后续修改先定位正式入口、实际加载版本与第一条失败操作，再在消费者 adapter 或唯一公共 owner 修复；禁止为适配差异再画聊天页、复制设置或新建会话存储。业务动作定义、领域上下文、结果 schema、精确意图校验及执行回调属于消费者；自然语言修改经原业务接口执行，公共 Chat 不直接读写业务数据。

特定可信批准通过可选 `policy.authorizeTurn({approval, scope, request, context})` 同步返回 `{assertAuthorized, signal?}`；不适用的批准返回 null。核心仅在缺少真实发送事件时调用该钩子，随后在权限检查及推理交付前后、保留的写入授权上重复调用同步 `assertAuthorized()`，失败须抛错。批准对象身份、有效期及撤销由静态可信 adapter 持有；提供 signal 时撤销必须 abort，不能把一次批准当永久授权。此钩子不能替代核心的实时权限、代际和实例检查，不接受沙箱注入，也不是公开 SDK。改动被固定编译的项目 adapter 时，审阅对应精确字节并同步现有来源锁及其定向测试，保留 target/逐文件/拒绝漂移规则。

### 设置、直接发送与业务草稿

- Provider 表单的取消、关闭、Escape 只丢弃未保存内容；重新打开读取已保存配置。本机连接开关沿原 `nativeConnection.setEnabled` 即时生效，取消或保存 AI 表单均不回滚连接。采集字段、分页和 CSV 等继续归扩展业务模型。
- 设置往返验证未保存内容、返回焦点和原 Chat 草稿；普通发送只点击一次，直接请求当前保存来源，保留停止、错误与原请求围栏。没有逐次发送审阅或其取消步骤。高度异常先复现第一个错误边界并记录候选与容器变化，不写死高度或新增尺寸管理器。
- 普通解释不写业务配置。明确修改的提案必须经消费者校验完整结果仅包含本轮指定变化；夹带其他字段、URL、分页或执行动作时整批拒绝，保留原输入和业务草稿供修改后重发。是否自动应用已明确的配置修改由业务合同决定，无需为此增加通用差异确认或重复工具栏。
- 纯配置修改与基于网页观察推导规则分开。网页观察须绑定可信文档身份及当前业务版本；URL 相同不能证明是同一文档。没有该绑定时不得自动应用依赖旧观察的提案。ScrapyJS 消费者差异和当前限制只在其[项目合同](../../examples/sidebar-tools/scrapyjs/docs/SHARED-AI-CHAT-CONTRACT.zh-CN.md)维护。

**AI Panel 入口与执行模式（2026-11-04）**：以 AI Panel 为默认入口，不表示每次业务运行都重新请求模型。领域 adapter 决定提案的具体参数、作者阶段准备与校验，并通过原业务接口应用；已保存配置由原执行器重复运行。公共 Frame/session/bridge 不强制通用的“先推断再执行”阶段，不解析 ScrapyJS 的 `_listContainer/_listItem`，也不新增跨工具 `mode` 参数。不同业务可以有自己的确定性规则格式；ScrapyJS 的默认记录模式与尚未通过的实际链只见[对应项目合同](../../examples/sidebar-tools/scrapyjs/docs/SHARED-AI-CHAT-CONTRACT.zh-CN.md#ai-panel-默认列表规则与执行方式2026-11-04)，不把某个消费者的测试结果提升为框架整体能力证明。

## 沙箱复用 Chat 展示

已 opt-in `uiRuntime: "opendesk.react-ui.v1"` 的工具，可从固定 `OpenDeskSidebarUI` 使用 `SharedConversationDock`、`SharedConversationFrame` 与 `createConversationSession`；预编译 JSX 继续将 `@opendesk/ui` 映射到该全局、React 映射到原固定 `OpenDeskPageReact`。它们只在工具自己的 opaque iframe / React Root 中运行，不挂入可信工作台。

以下组件可在已有固定 React Root 中渲染，演示独立页面的展示、草稿与内存消息；发送只记入本地消息，不调用模型。真实推理按上文接入受控桥接。

```jsx
const React = OpenDeskPageReact;
const {SharedConversationFrame, createConversationSession} = OpenDeskSidebarUI;
function LocalChat() {
  const [session] = React.useState(() => createConversationSession({
    identity: {consumerId: 'my-tool', instanceId: crypto.randomUUID(), hostInstanceId: 'local-view'}
  }));
  const state = React.useSyncExternalStore(session.subscribe, session.getSnapshot);
  React.useEffect(() => () => session.dispose(), [session]);
  const inputId = React.useId();
  return <SharedConversationFrame
    rows={state.rows} draft={state.draft} inputId={inputId}
    onDraftChange={draft => session.update({draft})}
    onSend={() => {
      const draft = session.getSnapshot().draft.trim();
      if (!draft) return;
      session.append('你', draft);
      session.update({draft: ''});
    }}
  />;
}
```

Frame 的 `open` 控制发送、焦点与滚动行为，不隐藏整个组件；需要可收起的完整界面时由 Dock 的 `open` 控制可见性。Dock 保留隐藏子节点，消费者无需为开合重建 session。

`SharedConversationFrame({open=true, rows=[], draft='', busy=false, blocked=false, inputDisabled=false, canSend=true, inputId, placeholder='描述要完成的操作', maxLength=4000, inputLabel='对话输入', stopLabel='停止对话', onDraftChange(value,event), onSend(event), onStop(event), ...presentationProps})` 返回 React 展示元素。`onSend` 保持原始事件签名；Enter 发送、Shift+Enter 换行，IME 组合输入不发送。busy / blocked / canSend 和空白草稿阻止发送；调用者仍负责请求单并发，可使用 `session.begin()` 或既有请求状态机与持久围栏；展示会话不能代替 Authority。可选 `intro/emptyPrompt/feedback/review/technical` 为工具自身 React 内容；日志/输入 ref、滚动和焦点 props 沿用既有 Frame。消息行为 `{id, speaker, message}`，speaker/message 通过 React 文本节点展示，不解析原始 HTML。

`createConversationSession({identity, rowsLimit=32})` 直接复用 `src/ui/conversation/session.js`，没有第二套存储。identity 的 `consumerId/instanceId/hostInstanceId` 均为非空、最多 160 字符的展示标识，`installEpoch` 可选字符串；**identity 不授权**，不能替代 Host 真实安装身份、iframe 实例或 Provider generation。rowsLimit 为 1–100；draft 截取 4000 字符，消息截取 3500 字符。session 只有内存状态，无持久化、凭据、Provider 或网络调用。

- `getSnapshot()` / `subscribe(listener)`（返回取消订阅函数）用于 React 订阅；`update({open,draft,rows,needsReview})`、`append(speaker,message)`（返回 row ID）、`replaceMessage(id,message)` 修改展示。
- `begin({signal?,providerGeneration?})` 返回 `{signal,assertCurrent(currentGeneration?),finish()}`；重复 begin 抛 `E_CONVERSATION_BUSY`。`setPhase(phase)` 仅改变本地阶段。
- `cancel()` 仅 abort 本地 signal，保持 busy，直到原 round `finish()`；它不等于 `ai.cancel`，也不证明推理终止。`assertCurrent()` 拒绝已取消/过时回包。`reset()` 重置本地展示并使旧 round 失效，`dispose()` 销毁订阅与展示；二者都不能解除 Host unknown 锁或证明远端退休。

工具负责把发送/停止接入上文 `ai.info/generate/cancel`，核对 Host 回执、保留 unknown 状态且不自动重放。不要以本地 finish/reset/cancel 表示真实推理已完成。local debug / 只读预览可使用展示组件，但仍不开放真实 AI。

Frame 从单一 `conversation-frame.css` 渲染固定 CSS 文本，与可信 Dock 共享原气泡、输入框和动作样式；公开 Dock 单独加载纯展示 `conversation-layout.css`。两者都不注入设置页或宿主整份 CSS，不新增 palette 或依赖。固定 runtime 公开 Dock、Frame 和 session，不导出 `TrustedConversationWorkspace`、可信 Header Slot、Provider、业务 consumer、Authority 或 private config。

### 公共骨架与插槽

共享 Chat 是框架组件，书签、ScrapyJS 及后续扩展均通过公共合同消费。公共骨架负责 Dock 开合、分隔条、收起按钮、消息、输入、发送/停止及 IME 等展示交互；消费者通过现有 props 调整文案和状态，通过命名插槽放入少量自有内容。这里的 slot 就是组件已公开的内容 props，不新增 Slot 服务、组件副本或另一套 UI runtime。

| 组件 / 插槽 | 放入的内容 | 边界 |
| --- | --- | --- |
| Dock `children` | 原有 Frame 与工具局部容器的组合 | 与原业务区域并列；收起时保留挂载，不以 Chat 替换整页业务 |
| Dock `toolbar` | 少量消费者自有操作节点 | 沿用公共工具栏位置，保留公共收起按钮和分隔条；不在此另建 Provider 或权限入口 |
| Frame `intro` / `emptyPrompt` | 简短引导内容 / 空对话提示文案 | 不新增业务标题栏；业务设置仍在扩展原界面 |
| Frame `feedback` | 阶段、错误、已核实结果等 React 内容 | 如实区分待执行、成功、失败和 unknown；展示不能代替真实回执 |
| Frame `review` | 工具自有的配置差异、提案审阅和显式确认 UI | 校验、应用、命名保存和业务动作由工具 adapter 负责 |
| Frame `technical` | 可选诊断或高级详情 React 内容 | 不泄露凭据，不把实现细节变成普通用户的操作前置条件 |

`placeholder`、`inputLabel`、`stopLabel`、状态和事件回调沿用 Frame 现有签名。插槽不是替换公共输入、发送/停止或并发保护的入口；不通过工具 CSS 覆盖公共控件布局。扩展仍须完成实际需求，例如由 AI 生成配置、审阅后应用并调用原业务能力，不能把“已显示 Chat”当作业务闭环完成。

已有高级布局可使用 Frame 的 `splitTargets`、`transcriptTarget`、`composerTarget`，把同一个 Frame 的消息与输入放入调用方自己的文档容器；这些内容仍属于同一 React Root 和原信任边界，不是将沙箱内容 portal 到可信 Host 的通道。普通接入优先默认布局。每个实例分别持有会话、请求和业务状态，复用组件不共享授权或跨扩展草稿。

先用上述插槽和 props 解决消费者差异；确有跨扩展价值且现有接口无法覆盖时，按[通用能力例外](../../AGENTS.md)记录复现、最小公开 API、生命周期、权限及兼容影响，由平台 owner 修改唯一组件、同步本合同并运行受影响交互测试。HTML/Vue 等原有自定义 UI 继续可用，不为接入共享 Chat 强制迁移 React。

### 沙箱工具的公共页头入口与底部 Dock

`OpenDeskTool.setConversationState({visible: boolean, open: boolean})` 将展示状态同步到 Host 固定 AI 按钮；默认隐藏。参数只能含这两个布尔字段，无效调用返回 false。监听 `OpenDeskTool.root` 的 `opendesk:conversation-action`，收到固定 `detail: {action: 'toggle'}` 后，由工具切换自己的 open 并重新同步状态。完整合同与示例见 [Sidebar Tool API](sidebar-tools.zh-CN.md)。此通知不携带原事件、HTML、任意动作名或 AI 授权，不可作为模型请求的用户手势。

公开 `OpenDeskSidebarUI.SharedConversationDock` 可搭配 `SharedConversationFrame`：Dock 接受 `open` / `onClose`，提供底部展示容器与 resizer；Frame 负责对话内容。关闭时更新工具 open 并调用上述 API 同步页头 aria 状态。Dock、Frame 和 session 仍在工具自己的 iframe 内；它们不公开 TrustedWorkspace / HeaderSlot，也不改变 AI 调用、权限或安装合同。Host 清理实例后入口隐藏，迟到状态消息被拒绝；可信 Workspace 保留自身固定入口，避免重复。

共享 Chat 面向各扩展复用。根容器使用 `od-conversation-workspace`，原扩展界面放在 `od-conversation-business` 中，Dock 与业务区并列；展开对话后仍保留可操作的业务区域，收起后归还空间，开合不卸载业务或丢弃草稿。共享区沿用公共分隔条、收起按钮、消息和输入样式，不增加「AI 采集助手」等业务标题或覆盖公共控件布局。扩展只提供允许发送的上下文、提案审阅与确认后的业务回调；自动配置和业务执行仍通过该扩展原有能力及真实回执完成。

Dock 的可选 `onOpenSettings` 在自身控制区提供公共齿轮图标，与公共收起按钮并列；`toolbar` 继续接收消费者自有 React 展示节点。两者只负责展示，不拥有 Provider 配置或授权。可信书签与 Prompt 通过原 `onOpenSettings` 打开同一个设置面板；固定沙箱 UI runtime 为公开 Dock 接入下述固定打开动作，无需工具复制按钮或重打业务包。按钮尺寸、悬停提示、焦点和无障碍名称统一；分隔条不能遮住按钮或裁切焦点环。

沙箱工具同步 `visible: true, open: true` 后，设置齿轮与收起按钮位于底部公共 Dock 的控制区；ToolHost 页头、卸载按钮旁不再保留 AI 设置齿轮。原页头 AI 按钮继续重新打开/切换 Chat，紧凑来源下拉仍留在可信页头，用下拉箭头表示来源选择；其高级设置项仍打开同一设置面板。来源切换沿原 Provider Runtime 的 generation、取消和旧回包围栏，不静默切换。本机来源显示「本机 Codex」，实际模型由本机配置决定。

固定沙箱 Dock 调用 `OpenDeskTool.openAISettings()`：无参数、同步返回布尔值，只有仍在派发的真实按钮点击（包括按钮键盘激活生成的 click）可沿原私有端口提交固定 `open-ai-settings` 动作；返回 true 仅表示提交，不是授权或设置保存回执。Host 校验当前端口、来源窗口、toolId、实例、单调 requestId、已安装 ai.generate 能力、启用状态、安装代际与可见/展开生命周期，并在异步安装核对后复查。公开 window 消息、伪造身份、额外载荷、退休/卸载或迟到动作拒绝。动作不携带凭据、HTML、任意操作、设置写接口或推理授权，仍只打开原唯一 `SharedProviderSettingsSheet`。

设置取消/关闭返回原 Chat，不卸载业务或会话；原消息、未发送输入、业务草稿及 Dock 高度保留。收起只隐藏 Dock 并归还空间，沿原 AI 入口重开；它不销毁 session、不停止或重放推理，也不清除 unknown。

普通消息应保持为对话主内容；采集状态、完整 JSON 和运行诊断放入局部详情，不能挤掉消息与公共输入。业务是否可运行只约束相应业务动作，不应阻止普通询问。近期消息不会由 Frame/session 自动发送；消费者若显式选择对话上下文，须限制大小并绑定本次真实发送意图，沿原受控直接发送路径处理，不增加逐次 Provider 审阅；不能将历史文本当成授权或成功回执。
