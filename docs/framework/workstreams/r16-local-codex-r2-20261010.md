# OpenDesk Browser R16 R2：Native Codex 集成增量实施与验收记录

日期：2026-10-10。Browser 仅在 `main`，OpenDesk 仅在 `master`。此文件是 R16 已实施版本的**增量**证据，不代替 [R16 原始验收记录](r16-local-codex-20261010.md)、[Browser R16 设计](../../architecture/browser-framework/workflow-ai-provider-routing-r16.zh-CN.md) 或 [macOS 真实验收任务书](../prompts/goal-r16-local-macos-acceptance.zh-CN.md)。

## 结论

R15 原 Sidebar/WorkflowCompiler/RunHost/Task v1 不重做；R16 已有的 Go `internal/browserai`、Native owner 隔离、Codex App Server 会话、Browser 独立 AI Provider、网页观察审批、冻结 JavaScript 及 HTTPS Provider 原实现继续保留。

本次通过 GitHub 连接在两个正式主分支完成：

| 仓库与提交 | 更改 |
| --- | --- |
| Browser [`8a50fa0`](https://github.com/shopable-ai/opendesk-browser/commit/8a50fa03e64ed6e5cc3d331e0cc4673a5111fa71) | 修复旧测试对 Native `hello` 固定对象的错误假设，验证 `workflowAiVersion:1` 与 `localFilesVersion:1`，但允许增量 capability |
| Browser [`7f87dc2`](https://github.com/shopable-ai/opendesk-browser/commit/7f87dc2a08b70419e7e2a37d7f53da31bdabdd6c) | 以真实 Go 二进制和模拟 Chrome Native 帧，核对 `ai.session.close`、已撤销 owner 的 `E_OWNER`，并继续核对旧 `bridge.status` |
| OpenDesk [`8b9db4b`](https://github.com/shopable-ai/opendesk/commit/8b9db4b47ed752fa358d8c17c2f0f4ba9682cf6d)、[`d67ae12`](https://github.com/shopable-ai/opendesk/commit/d67ae1228d60070a4915d55df5c1e58ef456e98a) | 让 macOS/Ubuntu Go CI 含 `internal/browserai`，固定新 Browser Native 测试夹具并联测旧 RPC |
| OpenDesk [`91a1235`](https://github.com/shopable-ai/opendesk/commit/91a1235c1136c266436e2effaa0f47647ab20731)（含前两次增量提交） | 有界识别 `~/.nvm/versions/node/vX.Y.Z/bin/codex`，为选中 CLI 的 npm shebang 加入对应 Node `PATH`；两个新 Go 测试验证排序、64 项边界和无 shell 环境 Node 启动 |

Go NVM 变更从未扩大 Codex CLI 版本白名单、RPC 工具、沙箱、权限和凭据访问面。其余 Node/ESM/npm/MCP 高级能力不删除。

## GitHub Actions 证据（提交绑定）

- [Browser `7f87dc2` Native 流水线](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044274188)：**SUCCESS**，含原组件与 macOS Chrome 诊断；其中模拟 Native 帧不等于真实 Chrome + Codex E2E。
- [OpenDesk `d67ae12` Go Native 流水线](https://github.com/shopable-ai/opendesk/actions/runs/38044284328)：**SUCCESS**，macOS/Ubuntu Go 测试及 macOS 实际 Go 应用二进制对模拟 Chrome 帧的联测。
- [OpenDesk `91a1235` 最终 Go 变更](https://github.com/shopable-ai/opendesk/actions/runs/38044686506)：记录时 Ubuntu Go 测试 **SUCCESS**，其中新增 NVM 路径与 Node launcher 两例 PASS；同 SHA 的 macOS Go 测试及完整 App 构建仍 **PENDING**，以链接内最终状态为准。不要挪用上一 SHA 的绿灯当作最终 SHA 的证明。
- 早期固定夹具 [OpenDesk `34aea29` 失败流水线](https://github.com/shopable-ai/opendesk/actions/runs/38043176067) 源于旧 `hello` 断言，不是可以掩盖的通过结果。Go NVM 代码中间候选亦有失败记录；最终修正 SHA 以 `91a1235` 为准，审计应保留失败历史。

## 验收边界与下一步

**仍是 NOT_TESTED：** 用户 macOS 当前真实 Codex 安装路径与 `0.159.2` 登录账户，真实 Chrome Side Panel → Go Native Host → Codex App Server → 双轮 turn → 逐次网页审批和精确文档观察 → 原 RunHost/Controller 可信回执 → 冻结源码保存 → 关闭 AI 后同版本运行两次。不得用 mock、macOS CI 模拟 Chrome 帧或旧 Linux 登录测试充当用户本机成功。

冷 thread 恢复在当前受限协议中明确不支持，`resumeSupported:false`；未审计 Codex CLI 版本及存在 `environments.toml` 时继续安全拒绝。其它 Node 版本管理器仍可能需要额外只读路径支持，不能通过任意 shell 扫描或传递登录令牌解决。

后续按 [R16 本机验收任务书](../prompts/goal-r16-local-macos-acceptance.zh-CN.md) 在用户 macOS 对同一最终源码与打包候选运行，记录实际扩展/Host/Codex 版本、`runId/resultId/revision/sourceHash`、错误/撤权与资源清理，独立审计 UI/安全/Agent/隐私/持久化。未完成真实 Mac 闭环前不宣称专家最终 95+ 或全项验收 PASS。
