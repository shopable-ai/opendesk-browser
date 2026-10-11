# 阅读目录 R4.4：长目录当前位置跟随与多回答来源跟随

日期：2026-10-11。续接已通过 GitHub CI 的 R4.3。仅对已知 TOC 体验缺陷进行最小闭环修复；不重建索引器、插件安装框架、设计系统或 Chrome Profile。

## 真实源码复现的问题

1. `src/reading-toc/overview.js`：单 H1 + 20 H2 的文章在阅读到最后一个 H2 时，12 条摘要始终展示前 11 个 H2，`representedId` 退回 H1。用户无法在“概览”里看到正在阅读的章节。R4.3 的单元/原生测试当时仅证明摘要非空、上限和导航，并未覆盖阅读末尾的高亮。
2. `src/reading-toc/view.js` 与 `examples/sidebar-tools/reading-toc/src/main.js`：首次选中 AI 回答 1 后，即使当前有效 `activeId` 属于回答 2，也保留旧来源选择。用户必须手工切换才能看当前回答的标题；同时原 UI 没有明确的“回到自动跟随”模式。

## 本轮实现

- 在概览需限制为 12 条时，保留所有顶层章节和当前阅读章节可展示的父级链，并优先保留当前章节的相邻兄弟章节；剩余名额继续跨顶层分配、按文档顺序排列、禁止孤立子项。如果当前章节超过最多自动展开的深度，则显示最近的可见祖先。内容仍只来自受信索引，不造标题、不改正文。
- 在多来源网页中，两个正式界面都提供「自动跟随 · 回答 N」选项，默认依据受信 `activeId` 自动选择来源；用户选择某个回答后固定来源，重新选择「自动跟随」恢复自动。动态源消失时安全回退。
- 因官方 Side Panel 工具包 JS 行为更新，版本由 `1.0.1` → `1.0.2`，仍为 `opendesk.sidebar-tool.v1`，`page.toc` 权限未变；继续使用现有官方更新预览、显式确认及包完整性校验，不静默执行。
- 不改变 R4.2 拖动、边缘磁吸、位置记忆、归位；不影响 R4.3 自动增加 H2、H2-only 内容与固定完整模式。

## 测试合同

- 单元：单 H1 + 20/50 H2 阅读末尾可见当前及相邻 H2；12 条上限，顶层不丢、均衡分配、无孤立节点、原文顺序和跨回答隔离；深度折叠回退正确。
- 组件 UI：网页内 TOC 默认从回答 1 自动跟随到回答 2；手动选回答 1 后不自动覆盖；显式切回自动后跟随回答 2。
- Chrome 原生：在已授权单 H1 + 20 H2 文章内真正跳转最后一节，`toc.snapshot` 显示当前 H2 被包括/高亮；真实 Side Panel 官方工具在回答 1/2 间的真实导航与自动列表变更；复用现有安装、撤权、拖动、刷新、关闭侧栏测试。
- 回归：官方工具包 `1.0.2` 可复现生成并与内置包相同；`npm run check`、`build`、`build:dev`、`verify`、环境全套 `npm test`。已验证的原候选 PASS 只按原 SHA 保留。

## 复现命令与状态

```sh
node --test tests/environment/reading-toc-overview-r43.test.mjs tests/environment/reading-toc-placement-r42.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
npm run check && npm run build && npm run build:dev && npm run verify
# 由专用 GitHub Actions 使用隔离 CFT Profile 执行，不占用 Mac 日常 Chrome
xvfb-run -a node --test tests/framework/reading-toc-native-r41.test.mjs
```

### 2026-10-11 R4.4 实测 CI 回执

- 本轮代码提交：[`07b39e043f13208e743eec67a523f1ccf28f60a1`](https://github.com/shopable-ai/opendesk-browser/commit/07b39e043f13208e743eec67a523f1ccf28f60a1)（`main`，只追加父提交，不强推）。
- 专用 [GitHub Actions run 38116275393](https://github.com/shopable-ai/opendesk-browser/actions/runs/38116275393)，job ID `114401677582`，结论 `SUCCESS`，已核对所有 job steps（不是推测）。
- TOC 定向环境用例 **23/23 PASS**，受控 Chrome for Testing 实际载入本次正式 `dist/production` 的完整原生流程 **1/1 PASS**，Sidebar 既有回归 **29/29 PASS**；原生受控测试执行了真实跳转及正式 Side Panel 自动来源跟随，不将 mock 当 Chrome。
- `npm run check`、官方工具包可复现打包、`npm run build`、`npm run build:dev`、`npm run verify` 均在同一 run 成功。
- 全仓自动化 **978 tests / 971 pass / 0 fail / 7 skipped**，skipped 不算 PASS。
- 原生日志明确包含 `TOC_NATIVE_STAGE: R4.4 late H2 is visible and highlighted in real Chrome` 以及 `TOC_NATIVE_STAGE: R4.4 Side Panel followed the active answer automatically`。
- 专用截图与包证据由 workflow artifact `reading-toc-r41-ci-candidate` (ID `11692729795`) 保存，关联源码 `07b39e0...`，归档 SHA-256 `0b1e27b6a66176a12d6cdc26db6188190395a2a611fa900a8213fa9a86ac9179`。其中包含 `artifacts/reading-toc-r41/toc-r44-late-heading.png` 与既有 Chrome 截图。它是受控 CI 证据，非用户 Mac 截图。

**可声明的级别**：本候选 `CI_COMPONENT_PASS + CI_BUILD_PASS + CI_REAL_CHROME_PASS`。R4.3 历史成功仍仅绑定旧候选；无法直接冒充后续 main、用户 Mac Chrome、真实已登录 ChatGPT/知乎或整个 Browser F3/ZIP 的通过。

**继续推进**：由用户 Mac 本地 Codex 使用不与其他 Agent 冲突的隔离 Chrome for Testing Profile，核对代码版本与实际装载目录，手动对已登录长 ChatGPT 对话、多回答知乎、缩放 125/150/200%、侧边栏开闭/浏览器重启、滚动跟随与选择器“自动/手动”做真实操作。保留前后截图/扩展 ID/构建 SHA/控制台和失败记录，标注 `NOT_TESTED` 的实际网站项目直至获得真实证据。

用户本机 Mac 真实 Chrome / 已登录 ChatGPT、知乎、200% 缩放、其他真实网页可能存在兼容差异，本轮在隔离 CI 环境内不可代替用户本机确认。此类项必须保留 `NOT_TESTED`，不能冒充正式 ≥95 分验收或全项目 F3/ZIP。
