# Reading TOC · 与正式源码同源的交互预览

本目录的 R1.2 同源预览由正式生成器构建，不单独开发第二份正式实现；`reading-toc-r17-ai-desktop-preview.html` 是 **R1.7.4 已批准的视觉基准**，其中演示数据及业务模拟仍不构成真实 AI / 会员能力。预览 HTML 通过仓库的唯一 `scripts/preview/build-preview.mjs` 从当前阅读目录的**可安装工具包**与可信网页 `src/reading-toc/view.js` 现场生成。现有公共预览模板和浅色 Side Panel 外壳保持原有实现。

```sh
# 仓库根目录，Node 22+
npm ci --ignore-scripts
npm run check
node scripts/preview/build-preview.mjs --tool reading-toc --surface page-overlay --scenario success --theme light --width 360 --height 760 --out examples/sidebar-tools/reading-toc/preview/index.html
# Side Panel 辅助验证入口：仍复用正式生成器
node scripts/preview/build-preview.mjs --tool reading-toc --surface side-panel --scenario success --theme light --width 360 --height 760 --out examples/sidebar-tools/reading-toc/preview/reading-toc-r12-interactive-preview.html
```

用 Chrome 打开稳定主入口 `preview/index.html`（默认展示模拟文章与正式 `view.js` 的网页悬浮目录）：可切换 **Side Panel / 网页悬浮目录**、**简体中文 / English**、**有章节 / 无章节 / 加载 / 读取错误 / 无权限**。三种真实目录模式和刷新/导航点击会运行对应正式工具逻辑，网页悬浮使用可信 view/placement 的源码，只有页面快照和权限结果是离线模拟。另一个入口可用来重点检查网页悬浮。无网络、无真正的 Chrome 授权、没有实际网页 DOM 索引或导航。

**生成输出的身份：** HTML 中嵌入仓库当前 commit、设计系统与正式工具 JS/CSS 摘要；context.json 与 HTML 同时生成。CI 的 `.github/workflows/reading-toc-r41.yml` 也会生成并保留 `artifacts/previews/reading-toc/` 中同构的产物。当前暂不把每次变化的生成 HTML 当作第二份长期设计源码，避免生成物脱离正式实现。要查看最新交互，请按上面的命令生成。

**边界：** `PREVIEW_PASS` 仅指从 1.0.8 候选生成并在 Chromium 离线沙箱内验证的 HTML；不等于 `NATIVE_PASS`。原生验收需要在真实 Mac Chrome 隔离 Profile 从已发行 `1.0.7` 安装并由用户主动升级到候选 `1.0.8`，验证网页索引/导航、授权撤销、SPA、恢复、卸载与数据持久化。

## R1.7.1 · AI 整理桌面 UI 候选（2026-10-16）

- 唯一新增 AI 候选：`reading-toc-r17-ai-desktop-preview.html`。直接在桌面浏览器打开；四个单行图标、完整目录演示、八种状态和中英文切换均可离线操作；状态切换控制台位于 Side Panel **外部**。
- 这是**纯 UI 审核文件**，不是从正式工具包生成的“同源预览”，也不能宣称正式工具新增第四模式或会员 / AI Provider 已接通。所有会员、正文、AI 结果及跳转目标均为明确标识的演示数据；不调用任何网络 API。
- Chromium 144 离线自动化覆盖 320/360/420/520px、两种语言、三种代表性状态、100%/125%/150%/200% CSS zoom，共 96 组布局；检查顶部单行、横向溢出和基本交互。**CSS zoom 不代表真实 Chrome 菜单缩放测试通过**，正式安装、真实网站与独立 UX 审核仍待完成。
- 只有用户确认这份候选后，才将设计迁移到 `../src/` 和 `../locales.json`，再构建审核正式工具包；严禁直接把离线 Mock 迁入生产业务逻辑。

## R1.8 · 正式源码的同源预览边界（2026-10-17）

- R1.7.4 桌面 AI HTML 继续保留为**已批准视觉基准**，其状态控制、模拟生成和演示文章不是正式业务。
- R1.8 修改 `../src/index.html` / `style.css` / `main.js`，正式源码含第四个 AI 模式、不可交易的权益卡与默认合作招募，仍使用已授权的 `toc.snapshot`/`toc.navigate` 免费能力。
- R1.8.1 已使用唯一 `scripts/preview/build-preview.mjs` 官方生成器重新生成并提交两份 v1.0.8 同源 HTML；Node 字节一致性 + Linux Chromium 预览可以独立验收，但真实 Mac Chrome 安装升级仍未测试，不得写 `NATIVE_PASS`。

## R1.8.1 · 正式源码 v1.0.8 的已保存同源预览

- `reading-toc-r12-interactive-preview.html`：Side Panel + 网页悬浮同源模拟，211,846 字节，SHA-256 `753089d037a8ba407c614f137984017bd3e536294af2593e99cd1d5a5bd52e1c`。
- `reading-toc-r12-overlay-preview.html`：可信悬浮目录同源模拟，220,396 字节，SHA-256 `54066ea520a09626fecba64f06a70d13d397022ec7c68125690130119a0a5e32`。
- 两个 HTML 的正式源码构建身份均为 v1.0.8，保留 `uiSha256`、`trustedOverlaySourceSha256`、模拟标识与严格 sandbox 来源；并非手工修改 HTML 版本号。`tests/environment/reading-toc-localization-preview-r12.test.mjs` 验证存档字节与当下官方生成器一致。
- CI 候选构建与工具包摘要见 [#38959360526](https://github.com/shopable-ai/opendesk-browser/actions/runs/38959360526)；离线 Chromium 144 128/128 个交互/布局组合 PASS（**CSS zoom，非真实浏览器菜单缩放**）。默认 AI 卡片为**会员服务未开放 + 合作招募**；没有 AI 章节、支付或身份 Mock 成功。
- R1.7.4 已批准原型继续保存，不修改其原型身份和模拟状态。后续每次修改真实源码、共享外壳或可信 Overlay 都须重新生成并验证这两份存档 HTML，不能放宽来源断言。

## R1.8.3 · CONTENTS 边距与网页插入形态（2026-10-17）

- Side Panel 的正式工具 `src/style.css` 在 `.toc-panel` 上保留左右各 **8 CSS px** 外边距，内部 12px padding、四个模式图标及右侧刷新按钮均不变。
- 网页内悬浮目录由受信 `src/reading-toc/view.js` 注入，仍只有 **概览 / 当前 / 完整** 三模式。网页端已经由 `src/reading-toc/page.js` 的 `MutationObserver` + SPA 监听自动更新，故移除了会被误认成“刷新”的圆箭头归位按钮；用户仍可在原拖动手柄按 **Home** 或 **双击** 恢复默认位置。侧边栏已有刷新按钮保持。
- 两份已保存 HTML 均由唯一官方 `scripts/preview/build-preview.mjs` 生成，原文件不手写版本号。更新后的 Side Panel：211,874 bytes，SHA-256 `539816a19011dcdf36ed16f869d3515b7c5a475306b5f17dfde0b6c4bea4ba86`；网页悬浮：218,832 bytes，SHA-256 `0d86cca75da1e8dfc272459378a5ebe091d971cc6a9326a4b04d0683858a1a47`。
- 若要看“真实网页正文旁边插入后的效果”，在 `reading-toc-r12-overlay-preview.html` 选择「网页悬浮目录」，即可看到内嵌模拟文章 + **真实生产 `view.js`** 的目录层。模拟文章的标题与跳转回执不是实际网站操作，不代表授权、真实 Mac Chrome 安装或发布验收已完成。
- 源码定向测试 **28/28 PASS**；构建/验证 PASS（[R1.8.3 候选 CI 产物](https://github.com/shopable-ai/opendesk-browser/actions/runs/39027494384)）。同步前严格预览测试拒绝旧文件，之后须复测转绿；用户 Mac 安装升级为 `NOT_TESTED`，不得静默晋升正式 JSON。

## R1.8.4 · 网页实际悬浮 UI 已修复旧预览漂移

旧的 `reading-toc-r183-inpage-preview.html` 是离线导出的历史快照，并没有随着可信 `src/reading-toc/view.js` 自动更新，因此错误保留了“还有 6 个章节”按钮和旧的三模式工具栏。**不可再把旧快照当作本轮正式 UI。**

唯一权威为 `scripts/preview/build-preview.mjs` 生成的 `reading-toc-r12-overlay-preview.html`：它嵌入正式可信 view / placement 源码，显示网页文章与四个（概览、当前、完整、AI）按钮，无冗余“更多章节”按钮；AI 仅提供未开放会员与合作招募提示。侧边栏同源入口 `reading-toc-r12-interactive-preview.html` 继续严格字节重现，不另建平行实现。隔离 HTML 不等于真实网站或用户 Mac Chrome 安装验收。

## R1.8.6 · 稳定主入口

- 主预览名称固定为 `index.html`；它由仓库唯一官方 `scripts/preview/build-preview.mjs` 的 `page-overlay` 输出，不是扩展安装包，也没有真实的授权、网站导航或 AI 服务。已验证的 Side Panel 与其他来源 HTML 暂保留供 CI 溯源。
- 正式源码修改后必须重新生成主 HTML，并由 `tests/environment/reading-toc-localization-preview-r12.test.mjs` 对官方生成结果、正式工具 JS/CSS 摘要及可信网页源哈希做一致性验证。
- Chromium 预览截图由 `tests/framework/reading-toc-preview-r14-native.test.mjs` 生成 `artifacts/reading-toc-r41/toc-index-360.png` 和 `toc-index-1280.png`。正式扩展截图 `toc-r186-default-{360,420,1280}.png` 须由原生 Chrome 测试实测生成，不能以离线 HTML 代替。
