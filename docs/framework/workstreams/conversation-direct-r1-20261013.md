# 对话式浏览器任务直接执行 R1

日期：2026-10-13。写入范围为 `shopable-ai/opendesk-browser` 的 `main`。

## 当前提交工作范围
- `src/ui/workflow/workflow-view.js`：发送 → 受控 AI 提议 → 现有 Compiler/RunHost → 持久回执 → 可选保存；不再需要二次点击“采用建议/运行”。
- `src/ui/workflow/direct-execution.js`：精确目标/用户字面量/副作用/回执的安全门禁。
- `src/framework/workflow/compiler.js`：仅直接执行使用的填写后 `inputValue()` 读回；旧工作流默认生成代码与 hash 不变。
- `src/ui/workflow/local-codex.js`、`src/ui/workflow/ai-plan.js`：限制 AI 提议动作在本次用户明确请求内。
- `tests/environment/workflow-direct-execution.test.mjs`：边界用例。

## 安全与后续验收
- Chrome 网站权限从真实 Send 手势申请；网页文字发往模型仍采用既有独立 `browser.observe` 审批，不绕过用户披露确认。
- 只通过原 RunHost 执行，不创建新的执行器、权限系统或代码生成执行世界。
- 高风险、副作用不明、填写值未明确给出及跨文档跳转不自动执行；终态未知不重试。
- 直接执行仅在 runId/resultId/sourceHash/精确文档/retirement 同时成立后报告成功。
- 未读取用户 Mac 本地 Chrome 或工作区：NATIVE_MAC_CHROME=NOT_TESTED；BUILD=NOT_TESTED；F3/ZIP=NOT_TESTED。
- 下一步验证：`node --test tests/environment/workflow-direct-execution.test.mjs tests/environment/workflow-local-codex.test.mjs tests/environment/workflow-r15.test.mjs`；`npm run check`；`npm run build:dev`。
- 在 `examples/tasks/demo-form.html` 真实 Side Panel 用一条「在输入框里填入 ai自动化第一选择」测试 Send→读回与持久回执，测试撤权、换文档、停止及保存 SHA；遵循 `docs/framework/testing-guide.md` 复用和资源独占约束。
