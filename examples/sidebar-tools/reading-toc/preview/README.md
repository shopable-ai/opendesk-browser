# Reading TOC R1.2 · 与正式源码同源的交互预览

本目录只维护**生成命令和来源说明**，不单独开发 HTML 原型或设计稿。预览 HTML 通过仓库的唯一 `scripts/preview/build-preview.mjs` 从当前阅读目录的**可安装工具包**与可信网页 `src/reading-toc/view.js` 现场生成。现有公共预览模板和浅色 Side Panel 外壳保持原有实现。

```sh
# 仓库根目录，Node 22+
npm ci --ignore-scripts
npm run check
node scripts/preview/build-preview.mjs --tool reading-toc --surface side-panel --scenario success --theme light --width 360 --out examples/sidebar-tools/reading-toc/preview/reading-toc-r12-interactive-preview.html
node scripts/preview/build-preview.mjs --tool reading-toc --surface page-overlay --scenario success --theme light --width 360 --out examples/sidebar-tools/reading-toc/preview/reading-toc-r12-overlay-preview.html
```

用 Chrome 打开第一份 HTML：可切换 **Side Panel / 网页悬浮目录**、**简体中文 / English**、**有章节 / 无章节 / 加载 / 读取错误 / 无权限**。三种真实目录模式和刷新/导航点击会运行对应正式工具逻辑，网页悬浮使用可信 view/placement 的源码，只有页面快照和权限结果是离线模拟。另一个入口可用来重点检查网页悬浮。无网络、无真正的 Chrome 授权、没有实际网页 DOM 索引或导航。

**生成输出的身份：** HTML 中嵌入仓库当前 commit、设计系统与正式工具 JS/CSS 摘要；context.json 与 HTML 同时生成。CI 的 `.github/workflows/reading-toc-r41.yml` 也会生成并保留 `artifacts/previews/reading-toc/` 中同构的产物。当前暂不把每次变化的生成 HTML 当作第二份长期设计源码，避免生成物脱离正式实现。要查看最新交互，请按上面的命令生成。

**边界：** `PREVIEW_PASS` 仅限已在浏览器打开并验证**此新候选**的生成 HTML；不等于 `NATIVE_PASS`。原生验收需要新版本 1.0.6 工具包、真实 Chrome、两种 UI、离线、权限撤销、SPA、刷新恢复及跨版本数据持久化的独立证据。
