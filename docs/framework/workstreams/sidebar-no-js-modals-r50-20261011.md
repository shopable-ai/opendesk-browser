# OpenDesk Browser · R5 无 JavaScript 弹窗工具交互收敛

- 日期：2026-10-11
- 开发分支：`agent/no-js-modal-tools-r50-20261011`
- PR：[#63](https://github.com/shopable-ai/opendesk-browser/pull/63)
- 主线在本轮并行推进；不直接强推 `main`，不覆盖他人的工作区差异。

## 设计合同

1. 可信 UI 明确点击应用级网站授权开关即是一次确认，不再 `window.confirm`。Chrome 原生权限独立检查，缺权必须保持拒绝与明确降级。
2. 删除安装包、网站授权及本地数据之前，通过固定宿主页面的“确认卸载并删除数据／取消”行内区域进行明确审阅。所有写入保持工具身份锁、源校验与恢复账本。
3. 侧边栏工具有未保存编辑时，用户可以继续编辑或明确放弃并返回工具列表；保存／删除未完成时不允许强制切换。
4. 工作流新建时若存在未保存编辑，用户可以继续编辑或明确放弃后新建；再次提交时检验工作流快照，阻止过期确认。
5. Native Workspace 的知识草稿尚未创建文件时支持继续编辑或明确放弃工作区内存副本，不会删除知识收件箱中的原始内容，不会向 Native 发送文件写入。
6. 官方 Markdown 工具的覆盖导入和清空也使用行内审阅，浏览器卸载/关闭标签页不注册 `beforeunload`。

## 源码、回归与遗留约束

- 主要变更：`src/ui/sidebar-tools.js`、`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/workflow/workflow-view.js`、`src/native-agent/workspace.js/html`、Markdown 官方源码及相应定向测试。
- 新增：`tests/environment/no-modal-ui-r50.test.mjs` 防回归断言；`.github/workflows/sidebar-ui-r4.yml` 提供 PR 定向执行。
- 由前一次候选 `a8cbeadc1866d19e6e0f955d03ca090500f6f5c5` 观察：Sidebar UI、Site access、Page userscript dependencies、Extension package budgets 流水线成功；Native Workspace 集成新增测试 92/92 通过。
- R17 npm package smoke 阻塞为 `E_PACKAGE_INPUT: non-file runtime dependency scripts/page-jsx-loader.cjs`：分支缺少这个运行时依赖；它属于当前 React/Vue loader 的其他工作流，不为无弹窗任务临时造一个加载器。
- 真实 Mac Chrome 的独立 UI/native 验收和 `main` 集成不由组件测试推导为 PASS；只有相同源码提交及构建身份的实际证据可提升状态。
