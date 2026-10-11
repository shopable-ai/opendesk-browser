# Page UI TOC React Direct R1 · 2026-10-12

范围：新增 examples/programs/page-ui-toc-react-direct 教学 Demo；不修改正式 reading-toc 或原 page-ui-react-direct。

- 项目格式：opendesk.project.v1；page-userscript；react；entryMode=component。
- 页面范围：仅 http://127.0.0.1:43111/*，排除 private/*；无需新权限或第二套运行器。
- 用户操作：连接目录 → 编辑并保存（仅自动准备）→ 手动运行 → 页面悬浮目录 → 显式 Stop。
- DOM：单一正文的 H1–H6，稳定节点身份，不改网页 heading ID；不支持正式工具的多来源适配。
- 生命周期：复用 OpenDesk 生成的 React root.unmount() 受管挂载；自有 MutationObserver / scroll / resize / hashchange / requestAnimationFrame 在组件 effect 清理。
- 验证：本次隔离示例 Node 模型测试 6/6 PASS，main.js、toc-model.js、环境测试的 node --check PASS；这些不代表整仓 build/真实 Mac Chrome 验收。
- 后续验收：在实际本地开发连接执行环境测试、项目校验与构建，打开 reading-toc-article.html 手动运行/保存/停止，核验刷新、权限限制、同页停止清理。当前状态 NOT_TESTED；不得伪报 Chrome PASS。

参照：examples/programs/page-ui-toc-react-direct/README.md、docs/framework/testing-guide.md。
