# Prompt Shortcuts — 左侧快捷栏下方滚动导航

## 2026-10-25 当前：中部快捷栏与左下角独立导航

- 用户最新纠偏要求由实际用途决定布局，不再采用紧贴快捷栏下方的方案。快捷栏保持对话区域左侧中部；滚动顶底导航独立锚定可见对话区域左下角，距底边 20px，并与快捷栏保持至少 24px 的间隔。快捷栏条目较多时限制自身高度并内部滚动；导航保留网站控件避让、边界禁用和撤销清理。原完整预览同步显示独立左下角导航。
- 本轮定向 Node **9/9 PASS**；既有 Chromium 导航场景验证左下角底边距离、两组分隔、横向对齐、快捷栏自身垂直居中、实际顶底点击和历史开关均通过，控制台错误为零。最新截图与报告位于本机 `artifacts/prompt-shortcuts-nav-layout-20261025/bottom-left/`；这是模拟 Host 的真实 Chromium DOM 验证，已安装 Chrome 新布局仍为 **NOT_TESTED**。
- 继续复用原 watcher，开发产物 `dist/development/agents/page-relay.js` 已更新，SHA-256 `e9be71bb3a1999066f68f9cd910b079a0f2ec0b90e62aa29cabcf6f9a911564b` 与当次更新清单一致；不更换加载目录，不重建与此可信页面模块无关的 Sidebar JSON。

## 2026-10-25 历史方案（已被上述纠偏取代）：共同父容器与整体居中

- 按最新要求，快捷栏与 `nav[data-opendesk-prompts-floating]` 现在同属页面可信 Shadow Root 内的 `.dock`，由纵向 Flex 布局统一对齐，间距 8px；以两组按钮的总高度计算垂直中心，移除导航独立的固定坐标。保留原生控件避让、导航开关和停用清理。
- 定向 Node 检查 **9/9 PASS**；从既有 `scripts/tests/prompt-shortcuts-r21-page-chromium.mjs` 提取的导航场景在 Chromium 真实 DOM 中通过共同父容器、横向中心、整体垂直中心、顶底点击与历史开关断言，控制台错误为零。夹具的 Host/安装状态为模拟，不等于真实网站或已安装扩展验收；临时复现脚本、截图和报告位于本机 `artifacts/prompt-shortcuts-nav-layout-20261025/`。
- 原 watcher 已更新 `dist/development/agents/page-relay.js`，SHA-256 `133a8ebc10ceaaef7f08b5caa96170b4420377fcf69184cd54529806097f3d35` 与当次 `development-update.json` 一致。本轮真实 Mac Chrome 只读 DOM 确认了旧位置偏移；后续截图工具返回 `native_hook_stdin_oversized`，新布局的已安装 Chrome 实测保持 **NOT_TESTED**。不更换日常加载目录、不重建正式包；该可信页面模块不包含在 Sidebar Tool JSON 中。

## 2026-10-24 历史记录

- 2026-10-24，任务：移出网页右下角，固定于当前快捷栏下方。
- 基准 main：`401acdeb49e5e0d3cf86f89b3455ebf4b6a33b4a`；本任务修改 `examples/sidebar-tools/prompt-shortcuts/trusted/page.js`, `examples/sidebar-tools/prompt-shortcuts/preview/index.html`, `tests/environment/prompt-shortcuts-r14-scroll-navigation.test.mjs`, `tests/environment/prompt-shortcuts-r14-page.test.mjs`, `scripts/tests/prompt-shortcuts-r21-page-chromium.mjs` 及本记录；未改权限、存储或跨组件 API。
- 悬浮导航继续作为独立 Shadow DOM 由真实 Host 页面注入，沿用既有顶部去重、权限读回、生命周期；定位绑定 rail 实际矩形，离快捷栏 8px，窄屏横排，原生控件冲突时保守隐藏。
- 原页预览及 Node/Chromium 几何断言随正式源码调整。当前只有源码静态解析通过；CI/真实浏览器未运行，均为 NOT_TESTED。
- **重要分发约束**：`prompt-shortcuts.opendesk-tool.json` 是侧栏 UI 便携包，**不包含** `trusted/page.js`。现有版本 `1.1.18` 不做伪升级；新位置需要浏览器宿主编译安装更新。CI 仍负责便携 JSON 候选构建，用户可复用当前 JSON 安装但它本身无法带入本次导航改动。
- 实测收尾：Node/Chromium 定向用例、真实 Mac Chrome 宿主更新和提示词插入/滚动顶底/原生按钮/撤权回归均未完成则不得登记 PASS。
