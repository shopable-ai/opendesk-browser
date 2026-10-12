# OpenDesk Browser · R5.6 无弹窗工具启停闭环（2026-10-12）

## 边界与输入身份

- 开发基线 `main`：`fb58c53241b246f85e58999d52ee6c4539b9346d`。
- 产品与测试候选：`24014e00d31d193848fd48b401824f246bd1dd76`，草稿 PR [#72](https://github.com/shopable-ai/opendesk-browser/pull/72)。后续仅新增本工作流说明时，产品/测试文件的关联输入不发生变化。
- 仓库：`shopable-ai/opendesk-browser`；未操作用户 Mac 工作目录，也未争用共享 Chrome profile / 固定端口。对话范围不涉及 RunHost、云控、Native MCP 或第三方 vendor 重构。
- 上一轮 R5.0–R5.5（原 PR #63）已合并 main。本轮只修复无弹窗页面内确认遗留的启停动作缺口，并扩大源码审计。

## 变更与可见行为

- `src/ui/sidebar-tools.js`：工具有未保存内容时，点击启停会出现页面内保留/放弃审阅；“放弃并继续”实际绑定启停操作，而不再是空回调。
- 审阅后重新验证工具包、iframe instance、最初启用状态、未完成保存与宿主状态；有变化则停止旧请求而非执行旧同意。
- 取消保留原文及 iframe；停用结束实例但保留本机数据与站点授权；重新启用不自动加载工具 JS，仍需明确点击打开。
- `tests/environment/sidebar-tools-host.test.mjs` 新增取消、保存中变更、确认停用、数据留存和启用不自运行回归；`tests/environment/no-modal-ui-r50.test.mjs` 扩大 Acorn 语法审计范围到 `src/platform`、`src/framework`、`src/scripting`、`examples/programs`，拒绝 `dialog.showModal()`。合法的 `permission-gate.js` 本地方法 `confirm(event,value)` 不属于浏览器弹窗。
- `docs/product/sidebar-no-js-modals-r50.zh-CN.md` 同步用户可见交互与安全限制。Chrome 原生权限弹窗不可跳过，直接关闭浏览器时未保存内容不能声称自动恢复。

## 当前证据（精确候选与来源）

- **Sidebar 产品交互、无弹窗审计、工具宿主：CI PASS**。 [Sidebar UI product regression #38203946727](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203946727)；**201 tests / 201 pass / 0 fail**。新增 `R56 dirty tool enable/disable` 与扩展的 `R5.5` 扫描均 PASS。
- 同一 workflow：`npm run check` 对 **477** 个源码/测试/构建文件检查通过；生产/开发包构建及 verify 阶段 PASS。
- [Site access targeted checks #38203946744](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203946744)：PASS。
- [Page userscript dependencies and package #38203946831](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203946831)：PASS。
- [Extension package budgets and library boundaries #38203946856](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203946856)：PASS。
- [Time Review R1.3 #38203946782](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203946782)：PASS；非本轮工具无弹窗 Native 证据。
- [Local directory MCP real Chrome #38203946776](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203946776)：**FAIL**，`E_NATIVE_ACCEPTANCE: Sidebar Controller runId timed out`，属于独立的本地目录 MCP 工作流；不得宣称完整集成全绿，也不要将此次失败不经定位就归因于 R5.6。
- 用户 Mac 当前真实登录站点、安装包输入身份与原生交互完整验收：**NOT_TESTED**。CI 受控其他场景不替代个人 Mac 现场验收、全仓 F3、ZIP 最终接受。

## 续接与安全交接

- PR 保持 Draft；按 AGENTS.md 不直接覆盖/强推 `main`，不伪造 Native PASS。
- 正式集成负责人需核查最新 main 的并行改动和 PR 差异；仅本轮 UI 相关文件发生冲突时针对性重新测。不要重复运行本轮已成功且输入未变化的组件/构建。
- 真正 Chrome 手工检查：打开普通 HTTP(S) 页面 → 安装可编辑工具 → 制造未保存内容 → 点“停用工具” → 验证取消保留内容、确认停用、再启用不自动运行及没有 JavaScript 模态对话框。Chrome 自己的权限提示仍尊重系统机制。
