# Developer R40.5-WEB · 2026-10-20

- Owner: 当前 R40.5-WEB GitHub main 修改会话；唯一写入分支 main；基线 e7e4694197917d0675aa3b8af58001c93827c799。
- 范围：src/ui/script-editor.js；Page Candidate 动作；Controller Classic 权限只读准备；Page 依赖观察生命周期；定向测试。
- 约束：沿用 RunHost、Chrome consent、Page Candidate Host、单一预览准备实现；不触碰 Native profile/端口/dist，不新建分支、PR 或 Store。
- WEB：先迁移完整业务，再收敛 sourceInput 与 update；GitHub 内容/调用链静态核对。Node、Chrome 实测 NOT_RUN / NOT_TESTED，留 Mac Codex。
- AFFECTED_INPUTS：编辑器 JS 世界切换与依赖检查；Controller Classic Chrome 权限预热；Page Candidate 保存；跨模式按钮禁用状态。
- 本地验证：node --test tests/environment/script-editor.test.mjs tests/environment/script-editor-ui.test.mjs tests/environment/page-candidate-source.test.mjs tests/environment/page-component-remote.test.mjs；按失败增补最小测试，再 Chrome 真机检查 Controller JS/ESM/Classic、Page JS/ESM、React/Vue、Local、Stop 与结果。

## R40.5-WEB 续接（本轮）

- CI 真实失败：`39416678325` 中 script-editor 测试至少两处 FAIL（Page→Controller fixture 的不完整 @require；旧断言期望 Controller 导入触发 Page 检查）。不把 CI 部分失败当 PASS。
- 本次修正：Page 依赖检查只有在明确选择 Page 时启用；补齐合法 UserScript 元数据测试；真实 Page 预览的受管/普通派发、依赖编译、原回执恢复移出巨大编辑器，UI、运行状态与共享准备仍保持单一所有者。
- 后续仍需执行受影响 Node 和 Chrome tests；网页 Git 对象写入、静态解析与差异核查不等于本地验收。
