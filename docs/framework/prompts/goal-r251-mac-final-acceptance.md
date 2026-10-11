# GOAL：OpenDesk Browser R25.1 Mac 本地 Codex 最终测试、修复、颜色与验收

日期：2026-10-11。默认中文。

仓库：https://github.com/shopable-ai/opendesk-browser

## 任务要求

直接在真实 Mac 本地仓库执行，不只返回建议、测试计划或截图原型。当前 `main` 已增加 R25.1 本地固定版本安装桥接：
- `src/ui/script-editor.js`、`src/ui/local-project.js`、`src/ui/local-project-install.js`、`src/ui/local-project-install-ui.js`
- `src/ui/installed-page-tools.js`、`src/ui/tool.html`、`src/ui/tool-shell.js`、`src/ui/tool-shell.css`
- Page/Task 原 Authority 安装服务及对应 `tests/environment/local-project-install-r251.test.mjs`。

目标：对真实最新 main 的这条链执行定向测试、修复全部可复现失败、构建、原生 Chrome 验收、更新文档和证据，并仅在确认并行资源安全时于 main 提交。禁止把本文的「预期」当作已经验收成功。

## A. 首先核对真实现场

```bash
pwd
git status --short --branch
git rev-parse HEAD
git fetch origin main
git rev-parse origin/main
git log -12 --oneline
```

阅读 `AGENTS.md`、`docs/framework/testing-guide.md` 和当前 `docs/framework/workstreams/`，检查其他 Agent 工作区、构建目录、Chrome Profile、Native Provider、43111 测试端口的使用情况。只在 main 工作，不创建分支、Worktree 或 PR；不强推，不 reset/clean，不覆盖任何其他 Agent 未提交文件。只有工作区和远端安全时才快进；禁止把非本轮文件一并提交。源码实际不同时以源码和有效合同为准。

## B. 先跑定向测试并修复源码

```bash
node --test tests/environment/page-candidate-source.test.mjs tests/environment/page-program-library.test.mjs tests/environment/script-editor.test.mjs tests/environment/local-project-connection.test.mjs tests/environment/local-project-install-r251.test.mjs tests/environment/task-package-flow.test.mjs tests/environment/page-installed-programs.test.mjs
npm run check
```

重点检查：
1. R12 旧的全网 Page match 断言已改为当前预览 `scheme://hostname/*`，localhost 不能默认为 `*://*/*`；保持显式 UserScript 声明和用户批准范围。
2. 本地 Page 返回值、错误出现在可见 `#developer-results-panel`，而不是仅写在隐藏 `#page-preview-result`；受管 UI Stop 不能回归。
3. `inputHash/sourceHash/sourceBytes/bindingId/providerEpoch/sourceId/运行目标documentId` 在准备、确认和安装之间一致；不能用磁盘已变化的源码继承上次成功回执。
4. Controller 必须验证相同 runId 的持久 completed 结果和真正原生页面操作回执，绝不能因为“脚本返回一个值”就假装 Task Verified。
5. Page 安装调用现有 Candidate → Verify（**确认后会再次执行冻结源码**）→ Available → Installed；网站权限只在真实确认点击中申请，不能静默运行第二次业务脚本。
6. Task 安装调用现有 Task v1：import/verify/makeAvailable/install；不新建数据库或安装器，保留旧版、数据和停用状态。
7. 源码变化、选择项目、切换模式、导航、失权、Provider epoch 变化、断线、结果未知均使旧 Save 资格失效，绝不自动重试效果未知的安装/验证。
8. 幂等与版本冲突：重复点击、并发另一个窗口安装、相同版本不同字节、权限扩展、源身份冲突、旧版停用升级。
9. `src/ui/installed-page-tools.js` 只读取原 Page Installed/Authority，绝不存 Side Panel 第二份安装记录；启停必须检查权限。

如果测试失败，修复真实调用链并补失败复现和回归用例；不要通过放宽断言、跳过测试、硬编码 mock PASS 掩盖缺陷。每次修复后先重跑受影响测试。

## C. 构建与完整回归

在独占构建资源、确认其他任务没有正在写 dist 的前提下运行：

```bash
npm test
npm run build
npm run build:dev
npm run verify
```

记录命令退出码、通过/失败数量、运行的准确 HEAD、构建包 SHA；构建/组件结果只属于当前候选，不提升成原生 Chrome PASS。将原始日志保留在独立 R25.1 工作流证据目录。

## D. Mac Native + 真 Chrome

核对 `http://127.0.0.1:43111/demo-form.html` 是否为本轮可用 Test Lab。只在端口空闲时根据 `examples/tasks/README.zh-CN.md` 启动；被占用时选择隔离端口并记录实际 URL。使用本轮真实构建、受控 Chrome for Testing、独立新 Profile，不能复用或污染其他 Agent 的 Chrome Profile，也不能用 JS mock DOM 假造用户点击或 Native ACK。

使用经用户授权的真实本地项目 Provider（`opendesk browser`/受信 Go 单文件/MCP 中实际可用的渠道），分别验证：
- 本地模式未连接：Run 和 Save 不可执行；
- 选择已授权 Controller/Page 项目：保存源文件只准备，不自动执行、安装；
- 本地 Page Run 可见成功/失败和返回值；受管 Stop 清理；
- 验证成功后底部单主按钮切换为「保存到我的工具」/「保存为任务」，再打开当前页面的小型确认区；
- 确认名称、版本、页面范围和可能的 Page 业务二次执行后安装；
- Controller 在「我的」可见，Page 在「工具 → 已安装网页工具」可见；
- 修改本地源码后不能把旧成功回执当新版本；再 Run、再确认后才允许更新；
- 已安装版本断开 Provider 后仍可用，关闭 Sidebar、重启真实 Chrome、扩展合法更新后可恢复；
- 已停用版本升级后保持停用；网站权限扩大要求显式批准；
- 失败/回执未知只读核对原持久记录，旧安装不损坏；
- 原「直接编辑」保存/运行、任务 Stop/结果历史、Side Panel JSON 导入/安装均无回归。

原生证据至少包括：Chrome/扩展版本与 Profile 路径、候选 commit/package/hash、真实授权后的截图、Run/Preview ID、Controller runId/resultId/sourceHash、Page manifestHash/native userScripts 注册状态、重启前后状态、失败时原始错误。区分 CFT、用户 Mac Chrome、Native Provider 和在线网站，禁止互相冒充。

## E. UI/UX 与颜色专项

用实际 Sidebar 360px、400px、600px，明暗主题、200% 缩放和键盘 Tab/Enter/Space 检查：
- `#developer-source-switch`、`#local-project-tools`、`#developer-results-panel` 和 `#develop-dock` 仍是原有布局；
- 审阅区无水平溢出、按钮遮挡、滚动困境；只有一个底部 Save 主操作；
- 未连接、等待验证、验证成功、安装完成、安装失败、访问受限等状态使用可读的文案+图形，不仅依赖颜色；
- 正常文字对比度至少 WCAG AA 4.5:1，非文本 UI/焦点轮廓 3:1，颜色同时适应深色与浅色；
- 键盘焦点明显、错误恢复入口就近可见、不会引导误以为市场“发布成功”。

优先修复真实 CSS/token/DOM 和事件链，不另造开发页、IDE、静态原型或无效 UI 截图。留证据截图并记录测试宽度和主题。

## F. 市场实际能力与提交

审计 `src/marketplace/`、`src/ui/sidebar-tools/installation.js`：若没有真实在线作者发布服务，必须保留「仅本地固定版本及官方随包市场安装」的诚实说明，不展示假上架成功；不要额外重建云平台或把 Page/Controller 冒充 Side Panel 工具包。

更新 `docs/api/sidebar-local-projects.zh-CN.md`、相关产品说明、专属 workstream 和测试指南引用。列出 PASS / FAIL / BLOCKED / NOT_TESTED，逐项提供原始证据与修复提交；未运行的 Mac/Chrome 测试明确 NOT_TESTED。安全时仅提交本轮文件到 main，不推送覆盖其他 Agent。最终报告具体修改文件、commit SHA、当前未完成项，以及基于真实测试的 UI/UX 与工程评分；**禁止未通过却宣称 95 分或完成**。

## G. 最新 R25.1 回归和已知构建阻塞（2026-10-11）

先核对最新 main，再增加以下定向用例：

```bash
node --test tests/environment/local-project-install-r251.test.mjs tests/environment/local-project-install-ui-r251.test.mjs tests/environment/script-editor.test.mjs tests/environment/task-workbench.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/page-candidate-source.test.mjs
```

新增的 `sourceContract`、`targetContract`、精确 SHA/源字节校验、冻结的确认标题/版本、`projectSourceId` 复核、只读 `readLocalInstallOutcome` 与 Page 二次执行提示，必须全部保持有效。点击确认后用户再修改输入框，不得偷换安装版本/名称。未知安装回执时「保存」应转为只读核对，不执行 `verifyPageCandidate` / `installPageProgram` / `installTask` 第二次；权限明确拒绝是零派发，可再次主动审阅。已停用 Task 应可进入「我的」管理详情但不得自动启用。点击底部 Save 后，键盘焦点要落到可见的安装审阅区。

当前已核对的 `dfa167aa22a2` R25.1 组件 job PASS，而生产包 `sw.js = 330248` 超过固定 `327680` 字节门禁 2568 字节（[日志](https://github.com/shopable-ai/opendesk-browser/actions/runs/38140701171)）；此前候选及其他 Agent 的 SW 优化不能直接当作当前候选 PASS。按打包归因定位真正增量，并与其他 Agent 现有工作流协调，**绝不扩大字节上限、删除安全检查、拆散原 Authority 或以旧 dist 冒充新构建**。若构建仍 FAIL，原生 Mac Chrome/重启全闭环一律记 BLOCKED/NOT_TESTED，不伪造验收。
