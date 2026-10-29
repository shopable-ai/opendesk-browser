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
