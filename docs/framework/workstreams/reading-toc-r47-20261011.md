# 阅读目录 R4.7：普通网页单正文、网页浮层免来源选择

日期：2026-10-11。仅调整受信 TOC 索引和网页浮层的交互，不改变官方 Side Panel 工具包、`page.toc` 协议或权限。

## 行为

- 一般网站以一个主要正文容器建目录：优先选择标题最多的 `main/[role=main]`，再选择标题最多的 `article`，否则以 `body` 兜底。位于主容器之外的非导航标题不再形成第二个来源。
- 保留 `article` 自身语义文档标题的排除规则、原始 H1–H6、最大数量与稳定元素 ID；没有把标题修改或注入到用户网页中。
- ChatGPT／知乎：保留受信回答容器分组和 `sourceId`，只作为导航边界；网页浮层直接根据 `activeId` 自动跟随，不再注入下拉框，不跨回答执行导航。
- 当同一来源最多五个标题且概览能完整展示时，自动隐藏与完整目录等价的视图模式按钮；长目录原有摘要、查看完整目录、拖拽/归位与输入框避让继续保留。
- Side Panel 原有的手动回答选择器保留，适用于用户刻意查看非当前回答；普通网页现只有一个来源，不会显示此选择器。

## 本次受影响验证

- `tests/environment/reading-toc-r41.test.mjs`：多个 article 共用一个 main、无 main 时主文章优先、无语义容器回退，以及既有 ChatGPT/知乎分组与正文标题规则。
- `tests/environment/reading-toc-placement-r42.test.mjs`：网页浮层没有来源选择器、滚动自动跟随回答且导航携带正确 sourceId、短目录隐藏冗余视图、长目录和拖拽不回归。
- `examples/tasks/reading-toc-conversation.html`：人工测试说明明确网页浮层与 Side Panel 不同的交互。
- 原有 CI `.github/workflows/reading-toc-r41.yml` 会因源文件/测试修改触发，包括真实受控 Chrome 与构建。CI 结果须绑定本次提交，不能沿用 R4.6 旧候选作为 R4.7 通过。
- 用户 Mac 原生 Chrome、真实登录 ChatGPT/知乎与 F3/ZIP 仍为 NOT_TESTED，须单独验收，不以单元或截图代替。

## 非目标

不扩展设置页、不增加 AI 检测或新权限、不重建数据协议、不改变 Side Panel 工具包版本，不大范围重构目录导航。

## R4.7 已完成的受控 CI 回执

- 对应源码提交：[`2fc4d9951dd145c651153135cd69515fc466be89`](https://github.com/shopable-ai/opendesk-browser/commit/2fc4d9951dd145c651153135cd69515fc466be89)。GitHub Actions [run 38138150159](https://github.com/shopable-ai/opendesk-browser/actions/runs/38138150159)、job `114466209816`，`head_sha` 精确绑定上述提交，`conclusion=success`（2026-10-11）。
- 阅读目录定向用例：**38/38 PASS**（R4.7 普通网页单来源、无 `main` 的主文章选择、网页浮层免下拉框及多回答跟随均通过）。
- 生产与开发构建、源代码校验、官方工具包构建和包校验：通过。
- 受控真实 Chrome for Testing（实际加载扩展及真实 Side Panel、交互、拖动、授权与恢复）：**1/1 PASS**；Side Panel 现有回归：**51/51 PASS**。
- 全仓环境自动化：**1157 total / 1150 PASS / 0 FAIL / 7 SKIPPED**，跳过项不计作 PASS。
- 归档 artifact：`reading-toc-r41-ci-candidate`，ID `11701633422`，`sha256:e4c378fca2d9fec49c9a71445ade526ec616d9871402bfb0b529e3ba524de516`。本轮证据限定于上述源码和受控环境；其后并行提交不能直接继承这些结果。
- 未实测：用户个人 Mac Chrome、真实登录 ChatGPT/知乎网页、独立最终 F3 / ZIP，仍是 `NOT_TESTED`。本次不把组件/CI PASS 声明为整仓正式交付完成。
