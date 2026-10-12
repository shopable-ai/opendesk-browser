# Dev 侧栏主运行按钮修复

日期：2026-10-12（Asia/Shanghai）。负责人：本对话 `01a12ef0`。状态：COMPLETE（定向修复）；本次浏览器运行资源已 released。

用户要求检查并修复日常 Chrome Dev Sidebar 无法点击「运行草稿」。真实原生 AX 确认当前为 React · JSX、直接编辑模式、知乎页面可运行、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。源码 `src/ui/script-editor.js` 的 `update()` 对非 JavaScript 固定禁用主按钮，组件入口只在折叠的 Page 试运行区。

仓库 main 存在其他对话改动；用户已明确追加授权「可以修改单写入约束，只要不冲突就不管他」。只编辑无现有 diff 的 `src/ui/script-editor.js` 与 `tests/environment/script-editor.test.mjs`，保留现有侧栏 HTML、Native、CLI、工具改动；不建分支/worktree，不提交/推送/发布。

修复计划：主按钮按当前代码类型路由既有执行入口；React/Vue 草稿采用原 `previewPage`，主反馈/结果区显示真实预览状态。普通 Controller、已加载 Page 项目的原入口、本地项目保持原行为。保留可信点击、共享执行槽、网站权限、精确文档重验证、编译取消、未知效果、Stop 和本地项目边界。

通过条件：React/Vue 主按钮可用且走编译/USER_SCRIPT 回执，不创建 Controller Run 或自动保存；编译中、文档变化、权限不足和未知效果仍阻断；Controller 与本地入口原行为通过定向回归。

复用核对：已读 testing-guide.md、extension-loading-source-20261012.md、dev-browser-launch-01a12eb3.md 和 Program 开发技能。旧证据只证明加载目录/Native 配对；本次运行入口输入变化为 AFFECTED_INPUTS，不提升旧记录为新运行 PASS。其他 R16/SDK 正式验收不在本次范围。

验证范围：脚本编辑器及组件编译器定向 Node 测试、源码检查；既有 `npm run dev`（PID 82965）持续更新 `dist/development`，不另起构建/占用生产 dist。浏览器只操作用户指定日常 Chrome，不操作其他 CFT/profile/固定验收端口/ZIP。真实运行先核对加载包和资源状态，再用标准 `http://127.0.0.1:43111/demo-form.html` 做必要定向检查。原始结果保存在本工作流独立证据目录。

## 实施和验证结果

- `src/ui/script-editor.js`：React/Vue 主按钮采用既有编译器和 USER_SCRIPT 预览，并保留 Controller 共享槽门禁。按代码类型显示「运行 React/Vue 组件」，预览的编译/成功/错误反馈与结果同步到主区。编译准备与实际执行反馈分开；停止过程中禁止再次预览。
- `tests/environment/script-editor.test.mjs`：补主按钮 React/Vue 回执/结果、可信点击、双击、权限、文档变化、编译错误、未知效果、共享槽及编译期间编辑/导航回归。保留并回归已有普通 JavaScript 与本地项目合同。
- 定向 Node 68/68 PASS、0 失败；源码检查 497 文件 PASS、限定 diff 检查 PASS。日志见 [targeted-final.tap](evidence/sidebar-draft-run-01a12ef0/targeted-final.tap) 和 [source-check-final.log](evidence/sidebar-draft-run-01a12ef0/source-check-final.log)。这是组件证据，不替代原生失败矩阵。
- Chrome 只读 Secure Preferences 确认实际正常 ID 加载 `dist/development`。用户再次明确同意本对话独占 Chrome 验证后，既有开发服务完成安全更新；保留原草稿，没有手工重写 Native 配对、替换扩展目录或启用新权限。
- 原生 CUA 真实主按钮分别运行 React 与 Vue 默认组件，主反馈显示成功，真实点击计数均从 0 变 1；两次 Stop 后组件消失。完整可见停止 JSON 均为 `preview-retired`，源码 hash 与停止身份匹配，`receipt.ok=true`、`scope=managed-ui-only`。具体 previewId/sourceHash/nonce 与 AX 观察摘录见 [chrome-observations.json](evidence/sidebar-draft-run-01a12ef0/chrome-observations.json)；原始 CUA 调用留在本对话工具记录中。
- 真实流程绑定实际加载 revision `b58f413434af2db86e7371a590b16eb4f6ac3e5e5c940c21340beb34e95327ee`。其他对话持续构建，共享 development 输出在记录收尾时已变为 `e08f7ab4376391223518eedeec55519152dda1d4b01ffc93bedb95d5d6f3e7d2`。本次核心编辑器源码 hash 在测试前后及原生检查前后均为 `93a72848253ed2e51ec072130949bba825c46bdcf206d5f705f508c081a3ca09`；原生结果只属于观察到的加载候选，不提升为后续整个共享包的验收。当前输入与检查哈希见 [validation.json](evidence/sidebar-draft-run-01a12ef0/validation.json)。

## 收尾与限制

React/Vue 受管预览均已可信 Stop；本对话新建 demo 标签页已关闭；原 JavaScript 草稿与代码类型已恢复，既有 React/Vue 草稿保留。既有开发服务和他人的 43111 页面服务未停止。最后尝试恢复知乎标签页时 Chrome 被其他操作切到 AI Proxy 设置页，已停止切换窗口，没有覆盖其他页面的操作。

限定结果：本次草稿运行按钮修复完成；真实运行是标准 demo 页，修复后知乎业务执行 NOT_TESTED。AX 对 React 初始预览 JSON 有截断，Vue 完整初始 JSON未导出；所保存 JSON 明确为原生观察摘录，不能冒充完整账本或最终冻结 receipt。全原生失败矩阵、正式 F3、ZIP 安装和整体迁移均不在本次范围；没有 commit/push/release。
