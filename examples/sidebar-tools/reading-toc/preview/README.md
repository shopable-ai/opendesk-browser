# Reading TOC R1.2 · 与正式源码同源的交互预览

本目录的 R1.2 历史预览只维护**生成命令和来源说明**，不单独开发第二份正式实现；R1.7.1 新增的 AI 页面属于尚未获批的**独立 UI 候选**，见下文，不能当作正式源码。预览 HTML 通过仓库的唯一 `scripts/preview/build-preview.mjs` 从当前阅读目录的**可安装工具包**与可信网页 `src/reading-toc/view.js` 现场生成。现有公共预览模板和浅色 Side Panel 外壳保持原有实现。

```sh
# 仓库根目录，Node 22+
npm ci --ignore-scripts
npm run check
node scripts/preview/build-preview.mjs --tool reading-toc --surface side-panel --scenario success --theme light --width 360 --out examples/sidebar-tools/reading-toc/preview/reading-toc-r12-interactive-preview.html
node scripts/preview/build-preview.mjs --tool reading-toc --surface page-overlay --scenario success --theme light --width 360 --out examples/sidebar-tools/reading-toc/preview/reading-toc-r12-overlay-preview.html
```

用 Chrome 打开第一份 HTML：可切换 **Side Panel / 网页悬浮目录**、**简体中文 / English**、**有章节 / 无章节 / 加载 / 读取错误 / 无权限**。三种真实目录模式和刷新/导航点击会运行对应正式工具逻辑，网页悬浮使用可信 view/placement 的源码，只有页面快照和权限结果是离线模拟。另一个入口可用来重点检查网页悬浮。无网络、无真正的 Chrome 授权、没有实际网页 DOM 索引或导航。

**生成输出的身份：** HTML 中嵌入仓库当前 commit、设计系统与正式工具 JS/CSS 摘要；context.json 与 HTML 同时生成。CI 的 `.github/workflows/reading-toc-r41.yml` 也会生成并保留 `artifacts/previews/reading-toc/` 中同构的产物。当前暂不把每次变化的生成 HTML 当作第二份长期设计源码，避免生成物脱离正式实现。要查看最新交互，请按上面的命令生成。

**边界：** `PREVIEW_PASS` 仅限已在浏览器打开并验证**此新候选**的生成 HTML；不等于 `NATIVE_PASS`。原生验收需要正式版本 1.0.7 工具包、真实 Chrome、两种 UI、离线、权限撤销、SPA、刷新恢复及跨版本数据持久化的独立证据。

## R1.7.1 · AI 整理桌面 UI 候选（2026-10-16）

- 唯一新增 AI 候选：`reading-toc-r17-ai-desktop-preview.html`。直接在桌面浏览器打开；四个单行图标、完整目录演示、八种状态和中英文切换均可离线操作；状态切换控制台位于 Side Panel **外部**。
- 这是**纯 UI 审核文件**，不是从正式工具包生成的“同源预览”，也不能宣称正式工具新增第四模式或会员 / AI Provider 已接通。所有会员、正文、AI 结果及跳转目标均为明确标识的演示数据；不调用任何网络 API。
- Chromium 144 离线自动化覆盖 320/360/420/520px、两种语言、三种代表性状态、100%/125%/150%/200% CSS zoom，共 96 组布局；检查顶部单行、横向溢出和基本交互。**CSS zoom 不代表真实 Chrome 菜单缩放测试通过**，正式安装、真实网站与独立 UX 审核仍待完成。
- 只有用户确认这份候选后，才将设计迁移到 `../src/` 和 `../locales.json`，再构建审核正式工具包；严禁直接把离线 Mock 迁入生产业务逻辑。
