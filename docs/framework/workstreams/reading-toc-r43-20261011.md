# OpenDesk Browser 阅读目录 R4.3：自适应章节概览与工具包升级

日期：2026-10-11。工作范围：`main` 已有 R4.1 安装/索引/授权、R4.2 浮动拖动/记忆机制的定向完善。独立工作流，不覆盖历史 `reading-toc-r41*`、`reading-toc-r42-20261011.md` 证据。

## 问题复现与根因

此前网页悬浮目录 `src/reading-toc/view.js` 与已安装 Side Panel 工具 `examples/sidebar-tools/reading-toc/src/main.js` 的第一个 `top` 视图均使用 `depth===0`；只有 1 个 H1、但拥有许多 H2 的文章只能展示一条。AI 回答按独立 source 建树，可能只有一个 H1，类似。高亮逻辑在 `top` 模式始终回退到 `topId`，不能表达自动补入的 H2/H3。已安装官方包的“安装”推荐行在已安装后隐藏，无法发现新版工具的显式更新。

## 设计与实现合同

- **第一个图标更名为“章节概览（自动补充子章节）”**。它不是纯 H1 列表，也不改变真实标题的 H1-H6、来源分组、元素身份和正文滚动。
- 每个来源**独立**统计逻辑 `depth===0` 根节点数（从 H2 开始的文章仍有根节点）。根节点数 **>=5** 时保持顶层摘要。否则按深度逐级揭示子章节，直到出现至少 **5** 条或达到自动层级 **depth 3**（四个逻辑层级）。没有可补的子标题时允许只显示一条，不造虚假数据。
- 若自动补入的候选超过 **12** 条，始终保留稀少的所有根节点，剩余名额跨各根节点均衡分配，保持原文顺序；不展示失去父节点的子项。只在因此截断时显示“还有 N 个章节 · 查看完整目录”，点击切换既有第三模式。原本的第二模式“当前章节”和第三模式“完整目录”语义不变。
- 激活标题在智能概览中可见则直接高亮；不可见时，使用显式 `parentId` 查找**最近的可见祖先**。不依靠重复标题文字、网页原有 DOM id 或同名选择器。
- **单一决策源**：`src/reading-toc/overview.js` 只在可信索引层执行算法；`model.snapshot` 附加逐来源的 `overview` 身份数组和代表 ID。网页悬浮卡片与 opaque 沙箱工具包仅渲染这些已授权的轻量数据，无第二套递归逻辑或扩展权限。
- **升级途径**：官方工具包从 `1.0.0` 升至 `1.0.1`（仍是 `opendesk.sidebar-tool.v1`，能力仍只为 `page.toc`）。已安装旧版本时「官方阅读目录」入口显示“更新”，版本一致时隐藏重复入口。更新继续经由现有候选审核、确认、锁、权限与存储流程，不自动执行代码，不清除旧站点授权或私人笔记。
- 保留 R4.2 拖动、磁吸、位置记忆、归位行为，避免影响浏览器背景和站点 DOM。

## 文件与受影响入口

- `src/reading-toc/overview.js`（新增纯函数）、`model.js`（parentId + overview 摘要）、`view.js`（渲染、截断入口和准确高亮）。
- `examples/sidebar-tools/reading-toc/src/{main.js,index.html,style.css}`、`tool.config.json` 与生成的 `src/sidebar-tools/reading-toc.opendesk-tool.json`。
- `src/reading-toc/policy.js` 中官方版本常量、`src/ui/sidebar-tools.js` 旧版升级入口。
- 新增 `tests/environment/reading-toc-overview-r43.test.mjs`，扩展 R4.2 卡片测试、Sidebar 工具宿主升级测试、真实 CFT 测试；专用 `.github/workflows/reading-toc-r41.yml` 复用原有安装、构建和验收链。
- 官方示例 README 更新使用与本机观察点。历史原型 R3 继续保留作为先前设计证据，不用旧原型替代正式实现。

## 本轮受影响的最小验证

```sh
node --test tests/environment/reading-toc-overview-r43.test.mjs tests/environment/reading-toc-placement-r42.test.mjs tests/environment/reading-toc-r41.test.mjs tests/environment/reading-toc-lifecycle-r41.test.mjs tests/environment/sidebar-tools-host.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
npm run check && npm run build && npm run build:dev && npm run verify
# 仅通过隔离 CFT Profile，禁止争用日常 Chrome Profile
xvfb-run -a node --test tests/framework/reading-toc-native-r41.test.mjs
```

独立单元测试覆盖单 H1+H2、H2-only 逻辑根、>=5 顶层、逐级补入、限制、均衡分配、无孤儿、重复标签、动态重建/多回答和高亮。真实 Chrome 在本任务的受控 HTTP(S) 网站测试单 H1+20 H2 的 `toc.snapshot`、官方 Side Panel 真实沙箱内 2H1+2H2 的智能概览，继续运行原 R4.1/R4.2 真实安装、撤权/刷新/拖动回归。**受控 fixture 不等于真实已登录 ChatGPT/知乎，也不等于用户 Mac 原生发布。**

## 证据状态

正式 R4.3 源码候选：`f5550d608d3cc512d5620c0d1d32f03ec9d63c61`，只在 `main` 写入，未创建分支或 Worktree。之前 R4.2 CI 仍仅绑定 `0d4bd2cbddb47e2062dfbcd8e1405306ee67aa01`。

### 2026-10-11 R4.3 成功回执（对应上述固定源码）

- [GitHub Actions TOC 专项 run 38113095157](https://github.com/shopable-ai/opendesk-browser/actions/runs/38113095157)，job `114392540010`，结论 `SUCCESS`。该工作流独立执行 npm 安装、TOC 定向回归、官方包可复现打包、`npm run check`、生产/开发构建、`npm run verify`，全部成功。
- 定向 Node 测试 **20/20 PASS**；受控 CFT 真实 Chrome 正式扩展 **1/1 PASS**；现有 Side Panel 工具宿主回归 **28/28 PASS**。
- 全仓 `npm test`：**952 tests / 945 pass / 0 fail / 7 skipped**。7 个 skipped 不计为 PASS。
- 原生测试阶段日志包含 `TOC_NATIVE_STAGE: adaptive single-H1 overview includes H2 with bounded overflow`：在含一个真实 `H1` 与 20 个 `H2` 的受控网页中，宿主快照仍只有一个顶层标题，R4.3 概览准确提供 12 项和剩余 9 项入口。
- 原生侧栏阶段 `TOC_NATIVE_STAGE: real Side Panel local import, website consent and two-H1 outline succeeded`。此阶段新增断言了同一回答中的两个 H1 及两个同名 H2 均在默认概览中呈现；保留旧授权/卸载/导航/拖动验收。
- GitHub Actions artifact `reading-toc-r41-ci-candidate` ID `11691884057`，归档 SHA-256 `7877d24b71463cd722681753a9d6dbbb487f5b1e43f40cbb6fc91204ca22b392`，包含 `artifacts/reading-toc-r41/toc-r43-single-h1.png` 及原有截图。保留期由 Actions 控制，过期后依然可依赖源码/工作流/日志身份，而不是臆造截图。
- 当前受限证据等级：`CI_COMPONENT_PASS + CI_BUILD_PASS + CI_REAL_CHROME_PASS`，仅针对上述 SHA、受控 Chrome / 测试网站。用户 Mac Chrome、实际已登录 ChatGPT/知乎、整体 F3/ZIP 仍为 `NOT_TESTED`；尚不以本轮结果声称每个专家维度达到 95/100。
