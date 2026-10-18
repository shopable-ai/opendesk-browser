# React UI R34.2 · 正式定时任务 Manager 业务回执收敛（2026-10-18）

- 任务：OpenDesk Browser React UI R34.2；作用分支：`main`；起始远端 HEAD：`43d656a9d3f2051405d00ff5dcf57fdef6cbda8a`。
- 写入范围：`src/ui/scheduled-task-workbench.js`、`tests/environment/scheduled-task-ui-r1.test.mjs`、本记录。React JSX、Host RPC 协议、Registry、Scheduler、权限、安全身份及原型不改变。
- 实现：任务启停调用现有 `commitScheduledMutation`，保留已确认 RPC 成功与随后刷新失败的独立语义；复制到开发只在原有 Developer 导入接受后关闭 Manager，且防止并发重复操作。
- 公共契约：`setInstalledTaskEnabled` 原参数及固定 taskId/version/generation/installationId 不变；`getTaskCandidate` 和 `taskWorkbench.receiveDraft` 不变。
- 验证：`scheduled-task-ui-r1.test.mjs` 复用既有真实 helper 测试并新增正式源接线断言。目标 CI 为 Scheduled Tasks R1 / Sidebar R33.3.6；其状态必须按对应提交实时核对。
- 环境边界：此对话无法读取用户 Mac 工作区 `git status`、真实 Chrome profile 或执行本地 `npm run build`；Mac Native 和本地检查一律 NOT_TESTED，不以 CI 离线 Chromium 冒充安装验收。
- 并行范围：无分支/worktree/PR/强推；只在主干 HEAD 和 blob 确认未漂移时原子提交，不触碰旧 workstreams 或共享产物。
- 当前状态：SOURCE_PATCHED；CI 结果以发布后的 workflow run 记录为准；Native 待本地 Codex。
