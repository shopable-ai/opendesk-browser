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

实施尚未以最终 Git SHA 的 CI 结果验收时，标记 `PENDING_CI`。成功的 R4.2 原始记录仍仅绑定候选 `0d4bd2cbddb47e2062dfbcd8e1405306ee67aa01`；R4.3 改变模型、视图、官方包和宿主升级，不能无条件复用原 Chrome 测试。保留 `REAL_CHATGPT_NOT_TESTED`、`REAL_ZHIHU_NOT_TESTED`、`MAC_NATIVE_NOT_TESTED`、`FULL_FRAMEWORK_F3_NOT_TESTED`。CI 若失败记录失败，不冒充通过；专家 ≥95/100 须有独立真实使用证据。
