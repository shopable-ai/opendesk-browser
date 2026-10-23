# Workflow R23.39 CORE · 2026-10-24

- Owner: 当前 GitHub 连接的 R23.39 实施会话；仅在 `shopable-ai/opendesk-browser` 的 `main` 进行授权范围内的顺序写入，不占用其他 Agent 的本地工作区。
- 基准远端 main：`0ea70532ac1bc6490fd609305460ac2b1cecaf5a`（写入前及每次文件更新前重新核对）。
- 本轮允许写入：`src/ui/workflow/workflow-view.js`、`tests/environment/workflow-installed-route-integration.test.mjs`、`tests/environment/workflow-react-page.test.mjs` 和本工作记录；不修改 Compiler、RunHost、Task Catalog、Provider 或 Manifest 合同。
- 问题/目标：Task 自然语言匹配后的用户确认在当前 Document 切换或 Origin 权限撤销时必须立即关闭并失效；冷聊天 Workflow Bundle v2 重用必须断言 Controller Journal 不增加任何源码 Revision。
- 依赖：已有 Shared React Frame、TaskWorkbench、原 Workflow Bundle v2、原 `currentPageTarget`、Chrome permission change subscription；不新增执行器或授权层。
- 范围与资源：GitHub 远端只读检索及最小源文件修改；本会话无法进入用户 Mac 工作目录，也不持有 Chrome Profile、43111 端口、watcher 或 dist 输出目录。
- 已查证的 CI：40011589093 / 40011588988 属于提交 `9c1ffbdf...`，当前状态 queued，不能声称 PASS。
- 验证计划：定位的 Task 确认撤销回归、冷会话 Journal 不变断言及必要受影响测试；无可运行 Node 仓库/正式 CI 执行结果时标 `NOT_TESTED`，不将静态检查或 fixture 提升为 Chrome E2E。
- 状态：IN_PROGRESS；最终实现、测试/CI 与本地验收须分别据实记录。
