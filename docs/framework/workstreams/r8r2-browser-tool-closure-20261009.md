# R8 Engineering R2.1 · 多文件工具运行诊断候选实施记录

> 状态：GitHub Draft PR 候选（未合入 main），仅为云端静态审查与隔离单元测试。不得视为真实 Mac Chrome / ZIP / F3 验收。

- 源码基线：初始补丁基于 `df1bdf2551f1e5b3d8b34ac70f8b41d43ec02785`；此次提交以 `996df38fd63f49630f2c8cad4c552b5f82462124` 为审查和树基线，5 个既有文件已逐 hunk 匹配最新主干；不复制旧构建或原生回执。
- 代码保存状态：`DRAFT_PR / NOT_IN_MAIN`。为遵守 `AGENTS.md` 的 PR 合入规则，候选源码已提交到临时审查分支，待真实 Mac Chrome 验收后再由授权集成者合入 main 并清理临时分支。
- 实际变更：`src/ui/task-workbench.js`、新增 `src/ui/task-run-diagnostics.js`、两份环境测试、现有 Sidebar API/Demo 文档和独立记录，共 8 个文件。
- 复用现有能力：ESM 项目构建、Program Draft、Task Candidate/Verification/Available/Installed、RunHost、`paramsSchema` 表单、原有 snapshotControllerRun 与停止/撤权合同。
- 证据边界：新纯函数单元测试 `node --test tests/environment/task-run-diagnostics.test.mjs`：4/4 PASS（隔离候选目录）；`node --check src/ui/task-run-diagnostics.js`：PASS；`git apply --stat changes.patch`：PASS（补丁解析）；`tests/environment/task-workbench.test.mjs` 新增 3 个回归用例，因无法访问完整 checkout 暂为 `NOT_TESTED`。
- 未执行：`npm run check`、`npm test`、两种完整构建、`npm run verify`、Program 构建、真实 Chrome/CFT、目标页 DOM、Native ACK、重启与撤权；所有这些均 `NOT_TESTED`，不能从隔离 Node 单测推导正式状态。
- 本地交接：先核对 Mac 工作树/并行工作者/Chrome Profile/43111 端口/最新 main，按此 Draft PR 检查并完成全部受影响的组件测试、构建及真实 Chrome 运行，提交必要修复；获授权的集成者按 PR 规则合并并清理分支。
- 安全原则：只改变 UI 的展示、错误消息和保守警示；不操作任务权限、执行器、存储、Source Map 或 Native 回执。未知效果不自动重试，不借用此前候选原生 PASS。
