# R8 Engineering R2.1 · 多文件工具运行诊断候选实施记录

> 状态：GitHub Draft PR 候选（未合入 main），仅为云端静态审查与隔离单元测试。不得视为真实 Mac Chrome / ZIP / F3 验收。

- 源码基线：初始补丁基于 `df1bdf2551f1e5b3d8b34ac70f8b41d43ec02785`；此次提交以 `996df38fd63f49630f2c8cad4c552b5f82462124` 为审查和树基线，5 个既有文件已逐 hunk 匹配最新主干；不复制旧构建或原生回执。
- 代码保存状态：`DRAFT_PR / NOT_IN_MAIN`。为遵守 `AGENTS.md` 的 PR 合入规则，候选源码已提交到临时审查分支，待真实 Mac Chrome 验收后再由授权集成者合入 main 并清理临时分支。
- 实际变更：`src/ui/task-workbench.js`、新增 `src/ui/task-run-diagnostics.js`、两份环境测试、现有 Sidebar API/Demo 文档和独立记录，共 8 个文件。
- 复用现有能力：ESM 项目构建、Program Draft、Task Candidate/Verification/Available/Installed、RunHost、`paramsSchema` 表单、原有 snapshotControllerRun 与停止/撤权合同。
- CI 证据（原测试源码提交 `c24e973262d88933a75f9473c166d157dc2b439a`）：[Sidebar UI regression](https://github.com/shopable-ai/opendesk-browser/actions/runs/37919025532) 71/71 PASS，包含 `task-workbench.test.mjs` 新增用例，并通过 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`；[Site access](https://github.com/shopable-ai/opendesk-browser/actions/runs/37919025498) 70/70 PASS；[Page package](https://github.com/shopable-ai/opendesk-browser/actions/runs/37919025503) 129+8+15+3 个相关组件 PASS，且生产/开发构建及 ZIP 字节一致性校验 PASS。该证据仅属于 GitHub Linux CI 和指定源提交，不等于本机 Chrome。
- 本轮隔离测试：`node --test tests/environment/task-run-diagnostics.test.mjs` 4/4 PASS；新纯函数模块与独立测试的 Git blob SHA 分别为 `03fb3f67b573359fc4ae86921de1e717f0c55fc7`、`1a0430dc46f3a8549b42d69e2b343d2f7fd101e5`，与提交内一致。
- **仍 NOT_TESTED**：`npm test` 全量回归（单独工作流只运行定向套件）、`npm run build:program -- examples/programs/sidebar-controller-demo`、用户指定的全部定向命令；真实 Mac Chrome/CFT、43111 DOM、真实 Native ACK、授权/停止/重启、Candidate→Installed 与重复运行。缺口只可由当前候选与准确环境的后续证据关闭。
- 本地交接：先核对 Mac 工作树/并行工作者/Chrome Profile/43111 端口/最新 main，按此 Draft PR 检查并完成全部受影响的组件测试、构建及真实 Chrome 运行，提交必要修复；获授权的集成者按 PR 规则合并并清理分支。
- 安全原则：只改变 UI 的展示、错误消息和保守警示；不操作任务权限、执行器、存储、Source Map 或 Native 回执。未知效果不自动重试，不借用此前候选原生 PASS。
