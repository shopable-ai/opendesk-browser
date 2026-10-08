# GOAL：OpenDesk Browser 多文件 Demo，本地 Codex/Chrome 接管和真实验收 R1

你是 Chrome MV3、ESM 多文件构建、现代 Locator、资源安全、Codex/Native Messaging 和 Git 主集成负责人。默认中文。**本轮只在现有真实仓库测试并修复问题，不另造 Demo、执行引擎或 Sidebar 布局。**

本地路径（仅确实存在时使用）：
`/Users/shopme/Documents/workspace/opendesk-browser`

## A. 保护现有仓库/工作区

先执行：

```sh
git status --short
git branch -vv
git worktree list
git fetch origin
git log -1 --oneline origin/main
```

阅读 `AGENTS.md`、`examples/programs/README.md`、`docs/framework/sidebar-project-api-r1.zh-CN.md`、`docs/architecture/browser-framework/sidebar-project-intake-r1.zh-CN.md`，并核对已合入 main 的 PR #11/#22/#23 与最新 HEAD 的实际能力，避免依据旧草稿文档重复开发。不得覆盖他人的未提交文件、CFT Profile、原有并行 PR，不能因创建演示而反复生成工作分支。主集成者串行收敛到 main，并安全清理确认已合并的多余分支。

## B. 源码、构建和 API 验证

```sh
npm ci --ignore-scripts
node --test tests/environment/sidebar-project-demo.test.mjs
node --test tests/environment/program-project.test.mjs tests/environment/program-build.test.mjs
node scripts/validate-program-project.mjs examples/programs/sidebar-page-demo
node scripts/validate-program-project.mjs examples/programs/sidebar-controller-demo
node scripts/validate-program-project.mjs examples/programs/sidebar-assets-contract
npm run build:program -- examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/sidebar-controller-demo
npm run check
npm run build
npm run build:dev
npm run verify
```

如资源允许再执行 `npm test`。检查两份 outputDirectory 中 `program.js` 的真实 SHA-256 必须等于各自 `artifact.json.sourceHash`；Controller 的 `program.opendesk-task.json` 仅是 Candidate。

**资源负向门槛**：运行 `npm run build:program -- examples/programs/sidebar-assets-contract` 应出现 `E_PROJECT_ASSET_BUILD` 且非零退出；必须保留这条拒绝，绝不能为了测试全部显示绿色而跳过。

## C. 真实 Chrome 用户操作

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

唯一标准目标：`http://127.0.0.1:43111/demo-form.html`。在 Chrome 138+ 加载同一 HEAD 构建的 `dist/development`，明确授予网站访问和用户脚本权限。

**Page Demo**：优先从现有完整任务目录选择构建后的 `program.opendesk-draft.json`，校验只读多文件源码快照及冻结执行字节；也单独验收旧 `program.js` 的兼容路径；在「网页用户脚本 · 依赖与试运行」明确点击。确认 `#opendesk-multifile-page-proof` 出现且重复运行无重复节点；非目标页不应被修改。保存真实 document/执行回执；不能只看页面字样就宣称 Page 正式安装。

**Controller Demo**：同样优先导入其 `program.opendesk-draft.json`（旧 `.js` 兼容），参数 `{"keyword":"OpenDesk"}`，在原底栏运行草稿。确认 `#results`、`#search-count`、来源 hash、运行目标、持久 runId/resultId；再次运行每次只提交一次；检查 Stop、撤权、导航、关闭与重启行为。不要用外部测试框架模拟点击代替 OpenDesk 原生动作。

**目录导入**：目前只有文件导入，尚无整个目录直接浏览器编译；将之标记为 `NOT_IMPLEMENTED`，不能拿手动导入 .js 充当文件夹选择已成功。

## D. 可选 Codex/Native 独立验收

PR #11 源码已经合并 main；先核对最新 HEAD 是否已完成真实 Chrome/CLI 同一候选闭环。未经验证，`CODEX_E2E=NOT_TESTED`。使用已有受认证 Native Host/RunHost/Authority 进行只读和受控任务测试；没有真实扩展回执就不重复产生副作用，也不建立第二套 IPC、存储或任意文件读写服务。Native 不可用不应阻断本轮已存在的手动 Sidebar 流程验收。

## E. 质量评分与交付

按六个维度独立评估并附具体证据：功能准确性、Program API/ESM、Sidebar UX、安全与资源边界、Codex 协作、真实 Chrome 可靠性；每项目标 **≥95/100**，未测试项不得满分。逐项报告完成/失败/NOT_TESTED、Git HEAD、文件修改、运行命令、真实产物哈希、Chrome 版本、运行回执和确切待修复问题。

只对已证实的缺口做最小修复，同步维护 Demo/API/测试文档，确保最终有效修改安全整合到 main；不自动删除尚未合并的 PR 或 Worktree。
