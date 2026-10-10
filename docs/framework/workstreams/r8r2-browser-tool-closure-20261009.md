# R8 Engineering R2.2 · 多文件工具闭环续接与当前状态

> **R2.2 最新核对：2026-10-10（GitHub 远端，main 基线 `3d66324e34ea9f4f5adddb62999272f2080f18eb`）**。本段修正 R2.1 的历史合并状态；下面原 R2.1 候选与失败证据完整保留，不能以历史“未合入”描述今天的 main。本次环境没有挂载用户 Mac 工作树，也不能操作本机 Chrome/文件选择器、进程或 43111 端口；没有制造原生截图、runId、resultId、构建包指纹或 PASS。

## 现有成果与证据等级

| 事项 | 当前可证明事实 | R2.2 完成边界 |
| --- | --- | --- |
| R2.1 UI 运行诊断 / 结果遮盖 | [PR #36](https://github.com/shopable-ai/opendesk-browser/pull/36) 已于 merge commit `ce8f80d2c65b91c3d0c48b42bd83fc59143b3b04` 合入 main；原 4/4 诊断测试及 CI 仅是原候选组件/构建证据 | **SOURCE_IN_MAIN**；不声称 R2.2 Chrome 已通过 |
| 本地源码编辑 → MCP / RunHost | [PR #37](https://github.com/shopable-ai/opendesk-browser/pull/37) 已合入 `47a00fa64cb5ce134ad85724e37d7031b14e3c19`；[PR #42](https://github.com/shopable-ai/opendesk-browser/pull/42) 的受管替换、Mac CI 记录见 [local-dev-r22-c036.json](local-dev-r22-c036.json) | 旧候选 P0–P3 实 Chrome 证据存在，但当前 R8 任务的具体源码变更、Mac 安装与完整 Chrome 重启仍需另核身份 |
| npm / HTTPS ESM 可信构建 | [PR #38](https://github.com/shopable-ai/opendesk-browser/pull/38) 合入 `75923b3d8cd606d34933a45b1d1e2e51cf3db60d`；[PR #39](https://github.com/shopable-ai/opendesk-browser/pull/39) 合入 `99269e624574976d02afe3de20d9bb338f0e4b2f` | 不等于 Local Dev Resolver 自动支持 npm/HTTPS；受控下载、锁定构建与本地快速运行是不同路径 |
| 多文件 Controller / Page、JSON 草稿与资源 | [PR #29](https://github.com/shopable-ai/opendesk-browser/pull/29) 及[多文件工作流原始证据](sidebar-multifile-native-r1-20261009.md) 已证明历史输入下构建/校验/组件结果 | 该工作流明确把完整 JSON 导入、真实 DOM、CSS/JSON/PNG 效果、正式任务安装与重启列为 **NOT_TESTED**；不升级为本轮 PASS |
| 最终 R8 R2.2 指定闭环 | 本轮当前环境只核查 GitHub 源码/历史证据；针对诊断展示新增复合密钥遮盖修复和回归用例 | **REAL_CHROME=NOT_TESTED；EXTENSION_BUILD=PASS_CI（见下方同提交回执）；F3/ZIP 安装=NOT_TESTED；最终验收未关闭** |

## 本轮最小源码修复与验证限制

- `src/ui/task-run-diagnostics.js` 的原文字遮盖可遗漏 `access_token=...`、`client_secret=...`、`session_id=...`、`accessToken=...` 以及带引号的 `"api key":"..."`；复合字段属于运行错误/结果预览中的常见敏感数据。调整现有纯展示层遮盖规则，补充 `tests/environment/task-run-diagnostics.test.mjs` 回归；不更改持久结果、不截断执行返回值、不在未知效果时自动重试。**原值仍可由用户明确点击“查看完整原值”展示，遮盖只保护默认预览，并非持久存储加密。**
- 本次隔离 JS 规则探针证明旧表达式确实暴露上述值，新表达式遮盖它们，同时保留普通 `request_id=public-id`。这是**正则局部验证，不是仓库 Node 测试或真实 Chrome**；`node --test tests/environment/task-run-diagnostics.test.mjs` 及相关环境/包检查仍需要在完整真实仓库执行后记录日志。
- 其余 P0–P2 业务代码本次没有基于可复现失败进行盲改，未增加执行器、MCP/Native、项目构建器或目录导入功能。

## R2.2 CI 补充回执（2026-10-10，严格绑定指定提交）

此次 GitHub main 直接修改和后续流水线的**原始被测源码提交**均为 [`7460db2b0eef9aa2cb1cb239c123d6da6d511f8e`](https://github.com/shopable-ai/opendesk-browser/commit/7460db2b0eef9aa2cb1cb239c123d6da6d511f8e)，本节是该源码候选的 CI 事实，不自动升级后续有其他 Agent 提交的 main 或用户 Mac 本机验收。

| 检查 | 源提交精确结果 | 原始作业 |
| --- | --- | --- |
| Sidebar 草稿/已保存与诊断回归 | PASS：核心集合 246/246，新增复合凭据遮盖用例 #108 PASS；另两个不相加的定向集合 21/21 和 36/36 PASS | [draft-and-saved-regression](https://github.com/shopable-ai/opendesk-browser/actions/runs/38065679075/job/114252708659) |
| 全环境 Node 回归 | PASS：902 total，895 passed，7 skipped，0 failed；新增遮盖用例 #696 PASS | [bridge-components](https://github.com/shopable-ai/opendesk-browser/actions/runs/38065679060/job/114252708972) |
| 正式源码检查与双构建、verify、同 dist ZIP 验证 | PASS：`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`。production packageHash `9a0128c09efc978ba9324b838e3c61e36b95a01e8a13b58d1c26e38489a13add`，development packageHash `17826c44614ff8972c805f3067d3c884ef40120164967dc8f6c799eb5f9d8da6`；生产 ZIP SHA-256 `3d5e78cab81ea347b4efc18efd620377d61cde120786aa967df6bbe4d475f457`，开发 ZIP `d3ab716345b645d25b657fcbf5c28f2f3c63029df9f88ded8ddefd628365f277`，报告为打包校验，不是 ZIP **安装** 验收 | [r3-package](https://github.com/shopable-ai/opendesk-browser/actions/runs/38065679028/job/114252708762) |
| 扩展资源大小审计 | PASS（本次源码候选）；最终大小须以该检查的原始报告为准 | [audit](https://github.com/shopable-ai/opendesk-browser/actions/runs/38065679057/job/114252825525) |
| Site Access / HTTP 合同 | PASS（各自组件/真实 loopback HTTP 合同，不是本轮完整多文件原生 UI） | [site-access](https://github.com/shopable-ai/opendesk-browser/actions/runs/38065679015/job/114252708569)、[axiosx-http-contract](https://github.com/shopable-ai/opendesk-browser/actions/runs/38065679004/job/114252708525) |

**状态纠正：** `SOURCE_IN_MAIN=YES`、`NODE_COMPONENT=PASS_CI`、`EXTENSION_BUILD_VERIFY=PASS_CI`（均绑定上述提交）；`BUILD_PROGRAM_CONTROLLER_CURRENT=NOT_RUN`、`R8_R2_2_REAL_CHROME_IMPORT_RUN_INSTALL=NOT_TESTED`、`MAC_USER_CODEX=NOT_TESTED`、`F3/ZIP_INSTALL=NOT_TESTED`。两台 macOS Native Agent IPC 任务与本轮导入/执行闭环不等价，即使随后通过也不能自动关闭 R8 R2.2。不得重写原 R2.1 候选的 4/4 或历史 89/89 作为新提交的回执。

## 中断后如何只补缺口（不重建任务树）

在可访问的 Mac 原仓库执行 `git status --short --branch`、`git rev-parse HEAD`、`git fetch origin main`、`git rev-parse origin/main`，确认只有 main，检查 dirty files、并行占用、Chrome Profile/扩展加载路径/43111 端口。未经证明安全不得切换、覆盖、clean/reset 或复用他人运行进程。若实际源码与旧回执的 sourceInputs 不一致，只补受影响部分，不重复所有历史 PASS。

```sh
node --test tests/environment/task-run-diagnostics.test.mjs tests/environment/task-workbench.test.mjs tests/environment/program-draft-roundtrip.test.mjs tests/environment/sidebar-project-demo.test.mjs
node scripts/validate-program-project.mjs examples/programs/sidebar-controller-demo
npm run build:program -- examples/programs/sidebar-controller-demo
npm run check
npm run build
npm run build:dev
npm run verify
# 在明确未占用 43111 后，由本任务自己的 shell 启动，记录 PID，结束仅停止自己的进程
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

编译脚本返回 JSON 的真实 `outputDirectory`；默认路径含程序 ID、版本、`r31-production`、`sourceHash` 与 authoring hash，**不要猜测固定位置或重用旧 artifact**。核对同一目录的 `artifact.json`、`program.js`、`program.opendesk-draft.json`、`program.opendesk-task.json`；在新证据目录保存原始输出字节 SHA-256、三份 JS 源快照与执行字节的区别、Source Map 信息、构建源码 HEAD/依赖版本。

真实 Chrome 使用仅归本任务的 CFT/Profile 加载**本轮新构建**，核对 Chrome 版本、扩展 ID、Manifest、实际加载路径和 package/source SHA。对 `http://127.0.0.1:43111/demo-form.html`，在完整任务目录真实选择 JSON 草稿→转交 Sidebar「开发」→源码列表只读切换→用户主动运行，给 Controller 填 `{"keyword":"OpenDesk"}`；保存 `#results`、`#search-count`、唯一真实 runId/resultId、result.revision.sourceHash、target.documentId、参数及对应执行回执。未经确认的写入/点击效果不可重复执行。

然后使用 Task JSON 按 Candidate → Verification（真实 runId）→ Available → 明确 Installed 核验「我的任务」表单、运行、查看记录、停止、撤权、导航、关闭 Side Panel 与完整 Chrome 重启。独立运行 `page-ui-basic` 观察实际 CSS/JSON/PNG/JS、重复监听器清理和权限拒绝；`sidebar-assets-contract` 仅测资源合同。最后对本地目录修改 JS 前/后各运行一次，核对新源码哈希及网页结果；WebCodex 云端模型自动本地工具调用不在此项内。

**证据要求：** 原始截图/日志必须能核对本轮 packageHash、sourceHash、Chrome/Profile/扩展 ID、页面与 documentId、真实回执、清理结果；老候选同名 PASS 不可重标。局部缺口修复只需定向补测。具体操作/历史失败仍以[原多文件续测入口](sidebar-multifile-native-r1-20261009.md#resume)和[测试复用规则](../testing-guide.md)为准；严禁因此复制第二份 188 项能力账本。

---

## R2.1 原始候选记录（历史原文，以下状态不再代表当前 main）

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
