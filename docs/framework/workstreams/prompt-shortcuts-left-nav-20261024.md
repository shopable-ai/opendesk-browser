# Prompt Shortcuts — 左侧快捷栏下方滚动导航

- 2026-10-24，任务：移出网页右下角，固定于当前快捷栏下方。
- 基准 main：`401acdeb49e5e0d3cf86f89b3455ebf4b6a33b4a`；本任务修改 `examples/sidebar-tools/prompt-shortcuts/trusted/page.js`, `examples/sidebar-tools/prompt-shortcuts/preview/index.html`, `tests/environment/prompt-shortcuts-r14-scroll-navigation.test.mjs`, `tests/environment/prompt-shortcuts-r14-page.test.mjs`, `scripts/tests/prompt-shortcuts-r21-page-chromium.mjs` 及本记录；未改权限、存储或跨组件 API。
- 悬浮导航继续作为独立 Shadow DOM 由真实 Host 页面注入，沿用既有顶部去重、权限读回、生命周期；定位绑定 rail 实际矩形，离快捷栏 8px，窄屏横排，原生控件冲突时保守隐藏。
- 原页预览及 Node/Chromium 几何断言随正式源码调整。当前只有源码静态解析通过；CI/真实浏览器未运行，均为 NOT_TESTED。
- **重要分发约束**：`prompt-shortcuts.opendesk-tool.json` 是侧栏 UI 便携包，**不包含** `trusted/page.js`。现有版本 `1.1.18` 不做伪升级；新位置需要浏览器宿主编译安装更新。CI 仍负责便携 JSON 候选构建，用户可复用当前 JSON 安装但它本身无法带入本次导航改动。
- 实测收尾：Node/Chromium 定向用例、真实 Mac Chrome 宿主更新和提示词插入/滚动顶底/原生按钮/撤权回归均未完成则不得登记 PASS。
