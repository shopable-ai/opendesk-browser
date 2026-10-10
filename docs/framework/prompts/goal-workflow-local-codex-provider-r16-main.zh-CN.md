# GOAL：OpenDesk Browser R16 —— 本地 Codex 会员 CLI 复用、AI 工作流多 Provider、OpenDesk Go Native Agent、独立 95+ 验收

## 一、真实仓库与工作原则

你作为 Chrome MV3 / Side Panel、OpenDesk Go Native Messaging、Codex CLI/App Server/SDK、MCP、Agent Workflow、LLM 安全、Controller/RunHost、Mac 真实 Chrome QA 的联合实施负责人，直接修改真实代码，默认中文。

- Browser：https://github.com/shopable-ai/opendesk-browser ，仅在 main 修改、提交。
- Go/Desktop：https://github.com/shopable-ai/opendesk ，当前默认 master；确认实际 HEAD，串行提交。
- 首先读取两个仓库的 AGENTS.md、未提交工作、并行修改状态和当前测试证据。禁止 force push、hard reset、覆盖别人的工作、未经验证删除 Node 旧 Host/高级 ESM MCP 或复写原始证据。
- **已提交的架构合同**：Browser docs/architecture/browser-framework/workflow-ai-provider-routing-r16.zh-CN.md；OpenDesk docs/integrations/browser/workflow-codex-app-server-r16.zh-CN.md。
- **Sidebar 精简基线**：prototypes/sidebar/workflow-r15-compact-preview.html；docs/product/sidebar-ai-workflow-ux-r15.2.zh-CN.md。保持“对话优先、图标辅助、历史/Schema 按需展开”。

本轮不是单纯写方案，也不只是静态 UI。以代码和可验证的本机工作流为目标：本机已有 Codex CLI 且已经通过官方 ChatGPT 登录的情况下，用户经 OpenDesk Go Native Host 让 Sidebar 真正请求 Codex 规划，用户检查计划，使用原 WorkflowCompiler 与 RunHost 在已授权网页运行、保存冻结 JavaScript；后续无需 Codex/AI 再次运行。

## 二、必须先认清已有能力

1. Browser 的 native-agent/local-dev/mcp.mjs 提供 Codex → Browser 的现有 MCP 工具，但不提供 Sidebar → Codex 持续模型会话。
2. OpenDesk Go internal/browserbridge/browsercli 只是 Browser Native Host、CLI 和原有浏览器工具通信；opendesk ai 目前是桌面工具接口，并非大模型本身。
3. 当前 Sidebar AI 只实现自定义 HTTPS Chat Completions 单次计划建议，仍依赖用户自己的 API Key。它不是完整 Agent loop；不要把“本机已登录 ChatGPT”误写成普通 API Key 自动可用。
4. Codex 官方集成首选 **codex app-server** 作为持久 thread/turn、流事件、approval、cancel、resume 的 Agent harness。一次性 codex exec --json 只可用于有限实验；检查最新官方文档，**不要新接入已经废弃的 codex mcp-server**。
5. Browser CurrentPageTarget、Authority、Controller、RunHost、Task v1、Result Store 是唯一网页执行权威。Go 不得调用另外一套桌面鼠标/Chrome CDP 来冒充 Browser 动作。跨 origin Task 仍不受 v1 支持。

## 三、先做真实本机 Provider 能力探测

在 Go 伴随端实现只读、受限状态探测：当前 Chrome Native 是否已获权并完成正确 extensionId 配对；Codex CLI 是否在实际 Go 进程用户 PATH；Codex CLI 是否通过官方登录；App Server 版本是否兼容；是否可完成真实 App Server session/turn。不得读取/返回 ~/.codex 凭据正文、OAuth Token、session cookie、其它工作目录及历史会话私密内容。

务必把状态分开：
HOST_NOT_PAIRED、NATIVE_PERMISSION_REQUIRED、NATIVE_CONNECTED、CODEX_MISSING、CODEX_LOGIN_REQUIRED、CODEX_UNSUPPORTED、CODEX_INITIALIZING、READY_FOR_TURN、RATE_LIMITED、APPROVAL_REQUIRED、DISCONNECTED、OUTCOME_UNKNOWN。

Native 连接成功 ≠ Codex 已安装 ≠ Codex 登录 ≠ 某个模型额度可用；不得仅凭“模型列表”宣称 READY。

## 四、实现真实持续 Agent 会话

在 OpenDesk Go 新建紧凑受限 Adapter（可考虑 internal/browserai），复用已有 Native Messaging 认证通路与私有 Socket；设计 versioned workflow-ai.v1 子协议。旧 Native Agent v1 十个方法、Go/Node 双实现及回滚/UNKNOWN 账本保持兼容。

使用官方 App Server 的 stdio JSON-RPC/事件协议，实现 initialize、thread/start、turn/start、进度 delta、turn/completed、cancel、必要的 thread/resume、approvalId。约束：

- App Server 必须在隔离/限权 cwd 运行，不能默认授权所有 shell、文件或网络；Go 子进程 stdout 不得与 Chrome Native 帧混用。
- Browser 真实用户手势与同意范围决定输入数据：用户需求、站点 origin、已审查步骤/参数可单独同意；网页内容摘要和截图额外同意。
- 将 eventId/sequence/sessionId/owner/registrationId/generation 与 requestId 关联，遵循 Native 60KiB frame、大小上限、事件流背压、超时、断线取消。
- Agent 只能返回已经通过 WorkflowDefinition Schema 的提议，用户明确点击采用才更改草稿；模型文本不会自动执行或伪造权限。
- Tool 调用复用现有 Codex→Browser MCP/Native 边界。首批只允许只读 observe/受限 page 信息。浏览器写操作必须独立受信权限、精确 tab/document 复验、请求效果账本和人工审批。
- Native 不就绪、用户取消、App Server 意外退出、Model usage limit/登录过期均有真实错误和可理解恢复；效果未知不重新提交网页动作。

## 五、Sidebar 模型入口设计

仍使用简洁的 AI 设置图标，默认不要出现 Provider 技术面板和密集输入框。

在按需打开的设置区按真实能力展现：

- **使用本机 Codex**：只有 Go Adapter 确认实际可用才可选，不需要额外输入 OpenAI API Key；明确注明“本机应用管理 Agent，模型推理可能联网”。Native/CLI/登录缺失则只显示最短引导，不能假 READY。
- **自定义 HTTPS 模型接口**：保留现有可运行的 BYOK 提议功能和独立内容发送授权；不要因为新 Provider 删除这个功能。
- **OpenDesk 官方 AI 服务**：本轮仅保留未来扩展接口/架构，不在未实现时放一个假“立即连接”按钮。
- **不使用 AI**：手动编辑、保存以及已安装工作流离线于 Agent Provider。

用户明确选定的 Provider 失败后不得未经其同意切换到另一个供应商并上传内容；“自动推荐”只推荐真实就绪的本机 Provider，不自动发送需求或操作网页。API Key/OAuth 凭据不写入 Chrome storage、工作流包或日志。

## 六、实现最短真实闭环

先让本机 Codex 返回**真实、经过 Schema 校验**的语义步骤，再接一个单 origin 的浏览器测试：

描述目标 → 本机 Codex 多轮规划与事件 → 用户明确采用 → 现有 Workflow Compiler 生成 JS → 正式 RunHost / Controller 执行 → Durable Result → 保存 Revision/sourceHash → 关闭 Codex/禁用 Native → 同一工作流再次运行至少两次。

网页操作只允许通过现有 Authority 进行，不得通过本地 Agent 的 shell、OpenDesk Desktop 自动化或任何直接 CDP 后门完成。不能把模拟界面或任意 AI 输出当成 Verified/Available/Installed。

## 七、官方 AI 服务的后续边界（本轮不开发云平台）

提交简短设计增量：OpenDesk SaaS 账号 OAuth/OIDC PKCE、账单和用量、Agent session API（HTTP request、SSE/WebSocket events）、服务端 Tool Orchestrator/权限与隔离、Responses API/Agents SDK 或按租户隔离的 Codex harness、用户本地 Chrome 必须通过受授权 Browser Bridge。HTTP 不代表单轮推理。绝不可将一个用户个人 CLI 的 ChatGPT 订阅 Token 拷贝给云服务或给多租户共用。

## 八、真实测试、主分支提交和独立验收

最小测试：
1. Go 本机只读 probe（CLI 不存在、未登录、旧版本、已就绪、权限拒绝）和秘密不泄漏。
2. 真实 App Server thread/turn/stream/cancel/resume 与模拟 app-server 异常；Codex 未安装时 Mock 只作组件证据。
3. 现有 Browser Native v1 与新 AI 子协议的身份、跨窗口、撤权、60KiB、并发和未知效果；不会影响 Node 兼容和正常任务。
4. 真实 Sidebar Provider 状态和可访问性，默认一屏简洁，320/360/420/520px、200% 缩放。
5. 同一候选 Go 二进制 + Browser dist/development + 真实 Mac Chrome，真实 Codex login、网站精确授权、Run/Stop/Result/再次复用。不同 candidate 的旧证据不得冒充这次结果。

分别独立 100 分评价：UX、Provider 真就绪、Codex 多轮能力、MCP/Browser Tool Authority、隐私/凭据隔离、安全/撤权、效果未知与恢复、单 origin 冻结重复运行、Go/Node 兼容、Native Chrome E2E；每项需有证据且目标 ≥95，未验收记 NOT_TESTED，Critical 安全失败直接阻断。

请在两个真实仓库串行修改、运行相应定向测试、提交对应主分支并核对远端文件。报告精确 commit、实际改动、已完成与剩余障碍、真实用户使用步骤、AI/Chrome/Go 测试证据和独立评分。无 Codex CLI 的测试机器不得宣称完成真实本机登录链路。

**此轮不要同时实现跨站 Task v2、云市场/支付、Windows Native 或完整 Node ESM 项目迁移。优先把本机用户已经有的 Codex 变成真正可用的工作流 Agent 来源。**
